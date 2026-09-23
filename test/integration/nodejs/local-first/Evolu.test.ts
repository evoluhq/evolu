import {
  assertEqual,
  assertFalse,
  assertTrue,
  assertLength,
  assertNotNull,
  assertNotUndefined,
  assertNonEmptyArray,
  assertSame,
  assertInstanceOf,
} from "../../../../packages/common/src/Assert.ts";
import { describe, it } from "node:test";
import { createConsoleStoreOutput } from "../../../../packages/common/src/Console.ts";
import {
  constVoid,
  exhaustiveCheck,
} from "../../../../packages/common/src/Function.ts";
import type { DbWorkerInit } from "../../../../packages/common/src/local-first/Db.ts";
import { startDbWorker } from "../../../../packages/common/src/local-first/Db.ts";
import {
  AppName,
  createEvolu,
  createEvoluDeps,
  type EvoluError,
  testAppName,
} from "../../../../packages/common/src/local-first/Evolu.ts";
import {
  createOwnerWebSocketTransport,
  testAppOwner,
} from "../../../../packages/common/src/local-first/Owner.ts";
import { createProtocolBroadcastMessagesFromCrdtMessages } from "../../../../packages/common/src/local-first/Protocol.ts";
import {
  createQueryBuilder,
  QuarantineOrigin,
  QuarantineReason,
} from "../../../../packages/common/src/local-first/Schema.ts";
import {
  consoleEntryOrErrorBroadcastChannelName,
  initSharedWorker,
  type ConsoleEntryOrError,
  type SharedWorker,
  type SharedWorkerInput,
  type SharedWorkerOutput,
  type SyncState,
} from "../../../../packages/common/src/local-first/Shared.ts";
import { DbChange } from "../../../../packages/common/src/local-first/Storage.ts";
import { createTimestamp } from "../../../../packages/common/src/local-first/Timestamp.ts";
import {
  acquireLeaderLock,
  testCreateLockManager,
} from "../../../../packages/common/src/LockManager.ts";
import { installPolyfills } from "../../../../packages/common/src/Polyfills.ts";
import { ok } from "../../../../packages/common/src/Result.ts";
import {
  createSqlite,
  getSqliteSnapshot,
  sql,
  SqliteBoolean,
  type CreateSqliteDriver,
  type SqliteDriverOptions,
  type SqliteDriver,
} from "../../../../packages/common/src/Sqlite.ts";
import { testCreateRun } from "../../../../packages/common/src/Task.ts";
import {
  Millis,
  millisToDateIso,
  testCreateTime,
  type TestTime,
} from "../../../../packages/common/src/Time.ts";
import {
  createIdFromString,
  type DateIso,
  id,
  Name,
  NonEmptyTrimmedString100,
  nullOr,
  PositiveInt,
  Port,
  String,
  testName,
} from "../../../../packages/common/src/Type.ts";
import {
  createWebSocket,
  testCreateWebSocket,
  type CreateWebSocket,
} from "../../../../packages/common/src/WebSocket.ts";
import {
  createRelay,
  createRelayDeps,
} from "../../../../packages/nodejs/src/local-first/Relay.ts";
import {
  createBroadcastChannel,
  createMessageChannel,
  createMessagePort,
  createSharedWorker,
  createWorker,
  testCreateMessageChannel,
  testCreateSharedWorker,
  testWaitForWorkerMessage,
} from "../../../../packages/common/src/Worker.ts";
import { testCreateSqliteDep } from "../_deps.ts";

installPolyfills();

const TodoId = id("Todo");
type TodoId = typeof TodoId.Output;

const Schema = {
  todo: {
    id: TodoId,
    title: NonEmptyTrimmedString100,
    isCompleted: nullOr(SqliteBoolean),
  },
};

const createQuery = createQueryBuilder(Schema);

const todoByCreatedAtQuery = createQuery((db) =>
  db.selectFrom("todo").select(["id", "title"]).orderBy("createdAt"),
);

const todosWithIsCompletedQuery = createQuery((db) =>
  db.selectFrom("todo").select(["id", "title", "isCompleted"]),
);

const todoTitlesQuery = createQuery((db) =>
  db.selectFrom("todo").select(["title"]).orderBy("title"),
);

describe("Evolu integration", () => {
  const setupRunWithEvoluDeps = async ({
    time,
    createSqliteDriver,
    createWebSocket = testCreateWebSocket({ throwOnCreate: true }),
  }: {
    time?: TestTime;
    createSqliteDriver?: CreateSqliteDriver;
    createWebSocket?: CreateWebSocket;
  } = {}) => {
    await using disposer = new AsyncDisposableStack();

    const consoleStoreOutput = createConsoleStoreOutput();

    const run = disposer.use(
      testCreateRun({
        // console: createConsole({ level: "debug" }),
        consoleStoreOutputEntry: consoleStoreOutput.entry,
        createBroadcastChannel,
        createMessageChannel,
        createMessagePort,
        createWebSocket,
        lockManager: testCreateLockManager(),
        ...(time && { time }),
      }),
    );

    const driver = createSqliteDriver
      ? undefined
      : disposer.use(
          await run.ok(testCreateSqliteDep.createSqliteDriver(testName)),
        );
    // The default factory shares one driver owned by this setup, so a worker
    // that exits early must not dispose it.
    const createSharedSqliteDriver: CreateSqliteDriver = () => () => {
      assertNotUndefined(driver);
      return ok({
        exec: (query) => driver.exec(query),
        export: () => driver.export(),
        deleteDatabase: () => driver.deleteDatabase(),
        [Symbol.dispose]: constVoid,
      });
    };

    const workerRun = disposer.use(
      testCreateRun({
        consoleStoreOutputEntry: consoleStoreOutput.entry,
        createBroadcastChannel,
        createMessagePort,
        lockManager: testCreateLockManager(),
        createSqliteDriver: createSqliteDriver ?? createSharedSqliteDriver,
      }),
    );

    const createDbWorker = () =>
      createWorker<DbWorkerInit>((self) => {
        void workerRun(startDbWorker(self));
      });

    const sharedWorker = disposer.use(
      testCreateSharedWorker<SharedWorkerInput, SharedWorkerOutput>(),
    );
    void run(initSharedWorker(sharedWorker.self));
    sharedWorker.connect();
    const syncStateChannelNamed = Promise.withResolvers<string>();
    // Errors the SharedWorker sends to this tab only.
    const tabErrors: Array<EvoluError> = [];
    let tabErrorReported = Promise.withResolvers<void>();
    sharedWorker.port.onMessage = (message) => {
      switch (message.type) {
        case "DbWorkerInit":
          createDbWorker().postMessage(message, [message.port]);
          break;
        case "Error":
          tabErrors.push(message.error);
          tabErrorReported.resolve();
          tabErrorReported = Promise.withResolvers<void>();
          break;
        case "SyncStateChannel":
          syncStateChannelNamed.resolve(message.name);
          break;
        default:
          exhaustiveCheck(message);
      }
    };
    sharedWorker.port.postMessage({
      type: "AnnounceTabLeader",
      consoleLevel: "debug",
    });
    await testWaitForWorkerMessage();

    /** Connects another tab to the same SharedWorker. */
    const connectLaterTab = (): SharedWorker => {
      const channel = testCreateMessageChannel<
        SharedWorkerInput,
        SharedWorkerOutput
      >();
      assertNotNull(sharedWorker.self.onConnect);
      sharedWorker.self.onConnect(channel.port2);
      return {
        port: channel.port1,
        [Symbol.dispose]: () => {
          channel[Symbol.dispose]();
        },
      };
    };

    const sharedSqlite = createSqliteDriver
      ? undefined
      : disposer.use(await workerRun.ok(createSqlite(testName)));
    const createIntegrationEvolu = createEvolu(Schema, {
      appName: testAppName,
      appOwner: testAppOwner,
      transports: [],
    });
    const runWithEvoluDeps = disposer.use(
      run.create({
        ...run.deps,
        createDbWorker,
        reloadApp: constVoid,
        sharedWorker,
      }),
    );
    const syncStateChannelName = await syncStateChannelNamed.promise;
    const disposables = disposer.move();

    return {
      connectLaterTab,
      createIntegrationEvolu,
      syncStateChannelName,
      run: runWithEvoluDeps,
      /** Only the default shared-driver setup exposes a shared database. */
      getSharedSqlite: () => {
        assertNotUndefined(
          sharedSqlite,
          "Inspect injected drivers directly; this setup has no shared SQLite database.",
        );
        return sharedSqlite;
      },
      tabErrors,
      waitForTabError: () => tabErrorReported.promise,
      [Symbol.asyncDispose]: () => disposables.disposeAsync(),
    };
  };

  /** One SharedWorker observing its relay frames and native socket cleanup. */
  const setupDevice = async (
    options: {
      createSqliteDriver?: CreateSqliteDriver;
    } = {},
  ) => {
    let constructedCount = 0;
    let closedCount = 0;
    let onAllClosed: () => void = constVoid;
    let onMessage: (url: string) => void = constVoid;
    const setup = await setupRunWithEvoluDeps({
      ...options,
      createWebSocket: (url, options) =>
        createWebSocket(url, {
          ...options,
          WebSocketConstructor: new Proxy(WebSocket, {
            construct: (
              WebSocketConstructor,
              args: ConstructorParameters<typeof WebSocket>,
            ) => {
              constructedCount++;
              const socket = new WebSocketConstructor(...args);
              socket.addEventListener(
                "close",
                () => {
                  closedCount++;
                  if (closedCount === constructedCount) onAllClosed();
                },
                { once: true },
              );
              return socket;
            },
          }),
          onMessage: (data) => {
            options?.onMessage?.(data);
            onMessage(url);
          },
        }),
    });
    return {
      setup,
      setOnMessage: (callback: (url: string) => void): void => {
        onMessage = callback;
      },
      [Symbol.asyncDispose]: async () => {
        await setup[Symbol.asyncDispose]();
        // Let the relays consume the close handshakes before they stop.
        if (closedCount === constructedCount) return;
        const allClosed = Promise.withResolvers<void>();
        onAllClosed = allClosed.resolve;
        using _closeTimeout = setTimeout(() => {
          allClosed.reject(
            new Error("Timed out waiting for the device's WebSockets to close"),
          );
        }, 5_000);
        await allClosed.promise;
      },
    };
  };

  /** Two relays whose stored message timestamps are readable per relay. */
  const setupRelays = async (
    namePrefix: string,
    isOwnerWithinQuota: (relay: "a" | "b") => boolean | Promise<boolean> = () =>
      true,
  ) => {
    const driversByName = new Map<string, SqliteDriver>();
    await using disposer = new AsyncDisposableStack();
    const relayRun = disposer.use(
      testCreateRun({
        ...createRelayDeps(),
        createSqliteDriver: ((name) => async (run) => {
          const result = await run(
            testCreateSqliteDep.createSqliteDriver(name),
          );
          if (result.ok) driversByName.set(name, result.value);
          return result;
        }) satisfies CreateSqliteDriver,
      }),
    );
    disposer.defer(() => {
      assertEqual(relayRun.deps.reportDefect.getDefects(), []);
    });
    const setupRelay = async (suffix: "a" | "b") => {
      const name = `${namePrefix}-${suffix}`;
      const relay = disposer.use(
        await relayRun.ok(
          createRelay({
            port: Port.orThrow(0),
            name: Name.orThrow(name),
            isOwnerWithinQuota: () => isOwnerWithinQuota(suffix),
          }),
        ),
      );
      return {
        port: relay.port,
        getTimestamps: (): ReadonlyArray<unknown> => {
          const driver = driversByName.get(name);
          assertNotUndefined(driver);
          return driver.exec(sql`
            select timestamp from evolu_message order by timestamp;
          `).rows;
        },
      };
    };
    const relayA = await setupRelay("a");
    const relayB = await setupRelay("b");
    const disposables = disposer.move();
    return {
      relayA,
      relayB,
      [Symbol.asyncDispose]: () => disposables.disposeAsync(),
    };
  };

  it("reports a rejected encrypted batch once per apply with its concrete route error", async () => {
    const socket = testCreateWebSocket();
    await using setup = await setupRunWithEvoluDeps({
      createWebSocket: socket,
    });
    const { run, createIntegrationEvolu } = setup;
    await using _leaderLock = await run.ok(acquireLeaderLock("tab"));
    using deps = createEvoluDeps({
      ...run.deps,
      sharedWorker: setup.connectLaterTab(),
    });
    await using evoluRun = run.create(deps);
    await using evolu = await evoluRun.ok(createIntegrationEvolu);
    const transport = createOwnerWebSocketTransport({
      url: "wss://rejected-batch.example",
      ownerId: testAppOwner.id,
    });
    evolu.useOwner(testAppOwner, [transport]);
    assertEqual(await evolu.loadQuery(todoTitlesQuery), []);
    await testWaitForWorkerMessage();
    const sqlite = setup.getSharedSqlite();
    const before = getSqliteSnapshot({ sqlite });
    const messages = createProtocolBroadcastMessagesFromCrdtMessages(run.deps)(
      testAppOwner,
      [
        {
          timestamp: createTimestamp({ millis: Millis.orThrow(1) }),
          change: DbChange.orThrow({
            table: "todo",
            id: createIdFromString("valid-before-corruption"),
            values: { title: "Valid before corruption" },
            isInsert: true,
            isDelete: null,
          }),
        },
        {
          timestamp: createTimestamp({ millis: Millis.orThrow(2) }),
          change: DbChange.orThrow({
            table: "todo",
            id: createIdFromString("corrupted"),
            values: { title: "Corrupted" },
            isInsert: true,
            isDelete: null,
          }),
        },
      ],
    );
    assertLength(messages, 1);
    const corrupted = Uint8Array.from(messages[0]);
    corrupted[corrupted.length - 1] ^= 0xff;
    const errors: Array<EvoluError> = [];
    let reported = Promise.withResolvers<void>();
    using subscriptions = new DisposableStack();
    subscriptions.defer(
      deps.evoluError.subscribe(() => {
        const error = deps.evoluError.get();
        assertNotNull(error);
        errors.push(error);
        reported.resolve();
      }),
    );

    for (let applied = 1; applied <= 2; applied++) {
      socket.message(transport.url, corrupted.buffer);
      await reported.promise;
      await testWaitForWorkerMessage();
      assertLength(errors, applied);
      const error = deps.evoluError.get();
      assertNotNull(error);
      assertSame(error.type, "DecryptWithXChaCha20Poly1305Error");
      assertInstanceOf(error.error, Error);
      const route = deps.syncState.get()?.tenants[0]?.owners[0]?.routes[0];
      assertNotUndefined(route);
      assertSame(route.error?.type, "DecryptWithXChaCha20Poly1305Error");
      assertEqual(await evolu.loadQuery(todoTitlesQuery), []);
      assertEqual(getSqliteSnapshot({ sqlite }), before);
      reported = Promise.withResolvers<void>();
    }
  });

  for (const instanceCount of [1, 2]) {
    const instanceLabel = instanceCount === 1 ? "instance" : "instances";
    it(`requestSync retries quota-rejected writes with ${instanceCount} active ${instanceLabel}`, async () => {
      let hasQuota = false;
      let relayDriver: SqliteDriver | undefined;
      const socketClosed = Promise.withResolvers<void>();
      await using relayRun = testCreateRun({
        ...createRelayDeps(),
        createSqliteDriver: ((name) => async (run) => {
          const result = await run(
            testCreateSqliteDep.createSqliteDriver(name),
          );
          if (result.ok) relayDriver = result.value;
          return result;
        }) satisfies CreateSqliteDriver,
      });
      await using relay = await relayRun.ok(
        createRelay({
          port: Port.orThrow(0),
          name: Name.orThrow(`evolu-request-sync-${instanceCount}`),
          isOwnerWithinQuota: () => hasQuota,
        }),
      );
      assertNotUndefined(relayDriver);
      const driver = relayDriver;
      const opened = Promise.withResolvers<void>();
      const recovered = Promise.withResolvers<void>();
      let socketCount = 0;
      let openCount = 0;
      let expectedMessageCount = 0;
      await using setup = await setupRunWithEvoluDeps({
        createWebSocket: (url, options) => {
          socketCount++;
          return createWebSocket(url, {
            ...options,
            WebSocketConstructor: new Proxy(WebSocket, {
              construct: (
                WebSocketConstructor,
                args: ConstructorParameters<typeof WebSocket>,
              ) => {
                const socket = new WebSocketConstructor(...args);
                // The adapter clears onclose during disposal; this listener
                // independently observes the native close handshake.
                socket.addEventListener("close", () => socketClosed.resolve(), {
                  once: true,
                });
                return socket;
              },
            }),
            onOpen: () => {
              openCount++;
              options?.onOpen?.();
              opened.resolve();
            },
            onMessage: (data) => {
              options?.onMessage?.(data);
              if (
                hasQuota &&
                expectedMessageCount > 0 &&
                driver.exec(sql`select timestamp from evolu_message;`).rows
                  .length === expectedMessageCount
              ) {
                recovered.resolve();
              }
            },
          });
        },
      });
      const { run, createIntegrationEvolu } = setup;
      const sqlite = setup.getSharedSqlite();
      await using clientCleanup = new AsyncDisposableStack();
      clientCleanup.defer(async () => {
        await setup[Symbol.asyncDispose]();
        // Let the relay consume the final unsubscribe and close handshake
        // before disposing its task runner.
        if (openCount > 0) {
          using _closeTimeout = setTimeout(() => {
            socketClosed.reject(
              new Error(
                "Timed out waiting for the client's WebSocket to close",
              ),
            );
          }, 5_000);
          await socketClosed.promise;
        }
        await relay[Symbol.asyncDispose]();
        assertEqual(relayRun.deps.reportDefect.getDefects(), []);
      });
      await using evolu = await run.ok(createIntegrationEvolu);
      await using instances = new AsyncDisposableStack();
      const transport = createOwnerWebSocketTransport({
        url: `ws://127.0.0.1:${relay.port}`,
        ownerId: testAppOwner.id,
      });
      evolu.useOwner(testAppOwner, [transport]);
      if (instanceCount === 2) {
        const laterTab = instances.use(setup.connectLaterTab());
        const laterRun = instances.use(
          run.create({ ...run.deps, sharedWorker: laterTab }),
        );
        const second = instances.use(await laterRun.ok(createIntegrationEvolu));
        second.useOwner(testAppOwner, [transport]);
      }
      await opened.promise;
      await testWaitForWorkerMessage();

      const rejected = Promise.withResolvers<void>();
      using errors = createBroadcastChannel<ConsoleEntryOrError>(
        consoleEntryOrErrorBroadcastChannelName,
      );
      errors.onMessage = (message) => {
        if (
          message.type === "Error" &&
          message.error.type === "ProtocolQuotaError"
        ) {
          assertSame(message.error.ownerId, testAppOwner.id);
          rejected.resolve();
        }
      };
      const title = NonEmptyTrimmedString100.orThrow(
        "Rejected while quota was exhausted",
      );
      evolu.insert("todo", { title });
      await rejected.promise;
      assertEqual(await evolu.loadQuery(todoTitlesQuery), [{ title }]);
      assertEqual(
        driver.exec(sql`select timestamp from evolu_message;`).rows,
        [],
      );
      const localMessages = sqlite.exec(sql`
        select distinct timestamp from evolu_history order by timestamp;
      `).rows;
      expectedMessageCount = localMessages.length;
      assertTrue(expectedMessageCount > 0);

      hasQuota = true;
      evolu.requestSync(testAppOwner.id);
      await recovered.promise;
      assertEqual(
        driver.exec(sql`
          select timestamp from evolu_message order by timestamp;
        `).rows,
        localMessages,
      );
      assertEqual(await evolu.loadQuery(todoTitlesQuery), [{ title }]);
      assertSame(socketCount, 1);
      assertSame(openCount, 1);
    });
  }

  it("reconciles data received from one relay with the owner's other relay", async () => {
    await using relays = await setupRelays("evolu-two-relays");
    const { relayA, relayB } = relays;

    const title = NonEmptyTrimmedString100.orThrow("Learned from relay A");
    const transportA = createOwnerWebSocketTransport({
      url: `ws://127.0.0.1:${relayA.port}`,
      ownerId: testAppOwner.id,
    });
    const transportB = createOwnerWebSocketTransport({
      url: `ws://127.0.0.1:${relayB.port}`,
      ownerId: testAppOwner.id,
    });

    // The first device stores its change on relay A only.
    await using firstDevice = await setupDevice();
    await using first = await firstDevice.setup.run.ok(
      firstDevice.setup.createIntegrationEvolu,
    );
    first.insert("todo", { title });
    assertEqual(await first.loadQuery(todoTitlesQuery), [{ title }]);
    const localTimestamps = firstDevice.setup
      .getSharedSqlite()
      .exec(sql`
        select distinct timestamp from evolu_history order by timestamp;
      `).rows;
    assertTrue(localTimestamps.length > 0);
    const seeded = Promise.withResolvers<void>();
    firstDevice.setOnMessage(() => {
      if (relayA.getTimestamps().length === localTimestamps.length)
        seeded.resolve();
    });
    first.useOwner(testAppOwner, [transportA]);
    {
      using _seedingTimeout = setTimeout(() => {
        seeded.reject(
          new Error("Timed out waiting for relay A to receive the seed data"),
        );
      }, 5_000);
      await seeded.promise;
    }
    assertEqual(relayA.getTimestamps(), localTimestamps);
    assertEqual(relayB.getTimestamps(), []);

    // A second device with an empty database learns the change from relay A
    // and reconciles it with relay B without a reconnect or requestSync.
    await using secondDevice = await setupDevice();
    const propagated = Promise.withResolvers<void>();
    secondDevice.setOnMessage(() => {
      if (relayB.getTimestamps().length === localTimestamps.length)
        propagated.resolve();
    });
    await using second = await secondDevice.setup.run.ok(
      secondDevice.setup.createIntegrationEvolu,
    );
    second.useOwner(testAppOwner, [transportA, transportB]);
    using _propagationTimeout = setTimeout(() => {
      propagated.reject(
        new Error("Timed out waiting for relay B to receive the change"),
      );
    }, 10_000);
    await propagated.promise;
    assertEqual(relayB.getTimestamps(), localTimestamps);
    assertEqual(await second.loadQuery(todoTitlesQuery), [{ title }]);
  });

  it("reconciles a joining tenant's existing history through another tenant's relay", async () => {
    await using relays = await setupRelays("evolu-tenant-relay");
    const { relayA, relayB } = relays;
    const transportA = createOwnerWebSocketTransport({
      url: `ws://127.0.0.1:${relayA.port}`,
      ownerId: testAppOwner.id,
    });
    const transportB = createOwnerWebSocketTransport({
      url: `ws://127.0.0.1:${relayB.port}`,
      ownerId: testAppOwner.id,
    });
    const tenantDriversByName = new Map<Name, SqliteDriver>();
    await using device = await setupDevice({
      createSqliteDriver: (name) => async (run) => {
        const result = await run(testCreateSqliteDep.createSqliteDriver(name));
        if (result.ok) tenantDriversByName.set(name, result.value);
        return result;
      },
    });
    const createTenant = (appName: string) =>
      device.setup.run.ok(
        createEvolu(Schema, {
          appName: AppName.orThrow(appName),
          appOwner: testAppOwner,
          transports: [],
        }),
      );

    // The first tenant has already reconciled its empty database with B.
    await using first = await createTenant("EmptyTenant");
    const firstRound = Promise.withResolvers<void>();
    device.setOnMessage((url) => {
      if (url === transportB.url) firstRound.resolve();
    });
    first.useOwner(testAppOwner, [transportB]);
    {
      using _firstRoundTimeout = setTimeout(() => {
        firstRound.reject(
          new Error("Timed out waiting for relay B's first round"),
        );
      }, 5_000);
      await firstRound.promise;
    }
    assertEqual(relayB.getTimestamps(), []);

    // Another database writes before registering the owner, then claims A.
    // Its history must also reach B, which only the first tenant claimed.
    await using second = await createTenant("SeededTenant");
    const title = NonEmptyTrimmedString100.orThrow(
      "Created before using owner",
    );
    second.insert("todo", { title });
    assertEqual(await second.loadQuery(todoTitlesQuery), [{ title }]);
    const driver = tenantDriversByName.get(second.name);
    assertNotUndefined(driver);
    const localTimestamps = driver.exec(sql`
      select distinct timestamp from evolu_history order by timestamp;
    `).rows;
    assertTrue(localTimestamps.length > 0);
    const propagated = Promise.withResolvers<void>();
    device.setOnMessage(() => {
      if (
        [relayA, relayB].every(
          (relay) => relay.getTimestamps().length === localTimestamps.length,
        )
      ) {
        propagated.resolve();
      }
    });
    second.useOwner(testAppOwner, [transportA]);
    const siblingReceived = Promise.withResolvers<void>();
    const unsubscribe = first.subscribeQuery(todoTitlesQuery)(() => {
      if (first.getQueryRows(todoTitlesQuery).length === 1)
        siblingReceived.resolve();
    });
    using siblingCleanup = new DisposableStack();
    siblingCleanup.defer(unsubscribe);
    using _siblingTimeout = setTimeout(() => {
      siblingReceived.reject(
        new Error("Timed out waiting for the empty tenant to receive history"),
      );
    }, 5_000);
    using _propagationTimeout = setTimeout(() => {
      propagated.reject(
        new Error(
          "Timed out waiting for both relays to receive the tenant's history",
        ),
      );
    }, 10_000);
    await Promise.all([propagated.promise, siblingReceived.promise]);
    for (const relay of [relayA, relayB]) {
      assertEqual(relay.getTimestamps(), localTimestamps);
    }
    assertEqual(await first.loadQuery(todoTitlesQuery), [{ title }]);
    assertEqual(device.setup.tabErrors, []);
    assertEqual(device.setup.run.deps.reportDefect.getDefects(), []);
  });

  it("reconciles a local continuation copy before completing the sibling's other relay route", async () => {
    let rejectB = true;
    let rejectedB = 0;
    const quotaEntered = Promise.withResolvers<void>();
    const quota = Promise.withResolvers<boolean>();
    await using relays = await setupRelays(
      "evolu-local-continuation",
      (relay) => {
        if (relay === "a") return true;
        if (rejectB) {
          rejectedB++;
          return false;
        }
        quotaEntered.resolve();
        return quota.promise;
      },
    );
    const { relayA, relayB } = relays;
    let state: SyncState | null = null;
    let onState: () => void = constVoid;
    const getRoute = (name: Name, port: number) => {
      const transport = state?.transports.find(
        ({ label }) => label === `ws://127.0.0.1:${port}`,
      );
      return state?.tenants
        .find((tenant) => tenant.name === name)
        ?.owners.find(({ ownerId }) => ownerId === testAppOwner.id)
        ?.routes.find(({ transportId }) => transportId === transport?.id);
    };
    const waitForState = async (predicate: () => boolean): Promise<void> => {
      if (predicate()) return;
      const changed = Promise.withResolvers<void>();
      onState = () => {
        if (predicate()) changed.resolve();
      };
      using _timeout = setTimeout(() => {
        changed.reject(
          new Error("Timed out waiting for the expected sync state"),
        );
      }, 5_000);
      try {
        await changed.promise;
      } finally {
        onState = constVoid;
      }
    };
    await using device = await setupDevice({
      createSqliteDriver: testCreateSqliteDep.createSqliteDriver,
    });
    using states = createBroadcastChannel<SyncState>(
      device.setup.syncStateChannelName,
    );
    states.onMessage = (next) => {
      state = next;
      onState();
    };
    const createTenant = (appName: string) =>
      device.setup.run.ok(
        createEvolu(Schema, {
          appName: AppName.orThrow(appName),
          appOwner: testAppOwner,
          transports: [],
        }),
      );
    const transportA = createOwnerWebSocketTransport({
      url: `ws://127.0.0.1:${relayA.port}`,
      ownerId: testAppOwner.id,
    });
    const transportB = createOwnerWebSocketTransport({
      url: `ws://127.0.0.1:${relayB.port}`,
      ownerId: testAppOwner.id,
    });
    await using source = await createTenant("ContinuationSource");
    source.useOwner(testAppOwner, [transportB]);
    await waitForState(
      () => getRoute(source.name, relayB.port)?.complete === true,
    );

    // B rejects the mutation and its automatic retry, leaving the message
    // stored only in the source database.
    const title = NonEmptyTrimmedString100.orThrow("Historical local copy");
    source.insert("todo", { title });
    assertEqual(await source.loadQuery(todoTitlesQuery), [{ title }]);
    await waitForState(
      () =>
        rejectedB === 2 &&
        getRoute(source.name, relayB.port)?.error?.type ===
          "ProtocolQuotaError",
    );
    assertEqual(relayB.getTimestamps(), []);

    // The empty sibling legitimately converges with the still-empty relay B.
    await using sibling = await createTenant("ContinuationSibling");
    sibling.useOwner(testAppOwner, [transportB]);
    await waitForState(
      () => getRoute(sibling.name, relayB.port)?.complete === true,
    );
    assertEqual(await sibling.loadQuery(todoTitlesQuery), []);
    using cleanup = new DisposableStack();
    cleanup.defer(() => quota.resolve(true));

    // A new A route requests the source's historical message. Its continuation
    // uploads only to A and delivers a local copy to the sibling. That copy
    // requires a fresh B round; hold B's write to inspect the pending route.
    rejectB = false;
    source.useOwner(testAppOwner, [transportA]);
    {
      using _quotaTimeout = setTimeout(() => {
        quotaEntered.reject(
          new Error(
            "Timed out waiting for the local continuation copy to reach relay B",
          ),
        );
      }, 5_000);
      await quotaEntered.promise;
    }
    assertEqual(await sibling.loadQuery(todoTitlesQuery), [{ title }]);
    await waitForState(
      () => getRoute(sibling.name, relayB.port)?.complete === false,
    );
    const pendingRoute = getRoute(sibling.name, relayB.port);
    assertNotUndefined(pendingRoute);
    assertFalse(pendingRoute.complete);
    assertSame(pendingRoute.error, null);
    assertEqual(relayB.getTimestamps(), []);

    quota.resolve(true);
    await waitForState(
      () => getRoute(sibling.name, relayB.port)?.complete === true,
    );
    assertTrue(relayA.getTimestamps().length > 0);
    assertEqual(relayB.getTimestamps(), relayA.getTimestamps());
    assertEqual(device.setup.tabErrors, []);
    assertEqual(device.setup.run.deps.reportDefect.getDefects(), []);
  });

  it("delivers sibling mutations before the relay's quota check completes", async () => {
    const quotaEntered = Promise.withResolvers<void>();
    const quota = Promise.withResolvers<boolean>();
    await using relays = await setupRelays("evolu-sibling-quota", () => {
      quotaEntered.resolve();
      return quota.promise;
    });
    await using device = await setupDevice({
      createSqliteDriver: testCreateSqliteDep.createSqliteDriver,
    });
    const createTenant = (appName: string) =>
      device.setup.run.ok(
        createEvolu(Schema, {
          appName: AppName.orThrow(appName),
          appOwner: testAppOwner,
          transports: [],
        }),
      );
    await using writer = await createTenant("QuotaWriter");
    await using sibling = await createTenant("QuotaSibling");
    // Release a pending quota callback even if the regression assertion fails.
    using cleanup = new DisposableStack();
    cleanup.defer(() => quota.resolve(true));
    const transport = createOwnerWebSocketTransport({
      url: `ws://127.0.0.1:${relays.relayA.port}`,
      ownerId: testAppOwner.id,
    });
    const initialRound = Promise.withResolvers<void>();
    device.setOnMessage(() => initialRound.resolve());
    writer.useOwner(testAppOwner, [transport]);
    sibling.useOwner(testAppOwner, [transport]);
    {
      using _roundTimeout = setTimeout(() => {
        initialRound.reject(new Error("Timed out waiting for the first round"));
      }, 5_000);
      await initialRound.promise;
    }
    await testWaitForWorkerMessage();
    assertEqual(await sibling.loadQuery(todoTitlesQuery), []);
    const received = Promise.withResolvers<void>();
    cleanup.defer(
      sibling.subscribeQuery(todoTitlesQuery)(() => {
        if (sibling.getQueryRows(todoTitlesQuery).length === 1)
          received.resolve();
      }),
    );
    const title = NonEmptyTrimmedString100.orThrow(
      "Available before relay storage",
    );
    writer.insert("todo", { title });
    const delivered = Promise.all([quotaEntered.promise, received.promise]);
    using _deliveryTimeout = setTimeout(() => {
      const error = new Error(
        "Timed out waiting for delivery while quota is pending",
      );
      quotaEntered.reject(error);
      received.reject(error);
    }, 5_000);
    await delivered;
    assertEqual(await sibling.loadQuery(todoTitlesQuery), [{ title }]);
    assertEqual(relays.relayA.getTimestamps(), []);

    const stored = Promise.withResolvers<void>();
    device.setOnMessage(() => {
      if (relays.relayA.getTimestamps().length > 0) stored.resolve();
    });
    quota.resolve(true);
    using _storageTimeout = setTimeout(() => {
      stored.reject(
        new Error("Timed out waiting for the released quota check"),
      );
    }, 5_000);
    await stored.promise;
    assertEqual(device.setup.tabErrors, []);
    assertEqual(device.setup.run.deps.reportDefect.getDefects(), []);
  });

  it("delivers every chunk of a large sibling mutation with closed sockets", async () => {
    const sockets = testCreateWebSocket({ isOpen: false });
    await using setup = await setupRunWithEvoluDeps({
      createSqliteDriver: testCreateSqliteDep.createSqliteDriver,
      createWebSocket: sockets,
    });
    const LargeSchema = { todo: { id: TodoId, title: String } };
    const titlesQuery = createQueryBuilder(LargeSchema)((db) =>
      db.selectFrom("todo").select("title").orderBy("title"),
    );
    const createTenant = (appName: string) =>
      setup.run.ok(
        createEvolu(LargeSchema, {
          appName: AppName.orThrow(appName),
          appOwner: testAppOwner,
          transports: [],
        }),
      );
    await using writer = await createTenant("LargeWriter");
    await using sibling = await createTenant("LargeSibling");
    const transports = [
      "ws://offline-a.localhost",
      "ws://offline-b.localhost",
    ].map((url) =>
      createOwnerWebSocketTransport({ url, ownerId: testAppOwner.id }),
    );
    assertNonEmptyArray(transports);
    writer.useOwner(testAppOwner, transports);
    sibling.useOwner(testAppOwner, transports);
    await testWaitForWorkerMessage();
    assertEqual(await sibling.loadQuery(titlesQuery), []);
    const received = Promise.withResolvers<void>();
    using cleanup = new DisposableStack();
    cleanup.defer(
      sibling.subscribeQuery(titlesQuery)(() => {
        if (sibling.getQueryRows(titlesQuery).length === 2) received.resolve();
      }),
    );
    // Each value fits one frame, but their batch exceeds the 1 MB frame limit.
    const titles = ["a".repeat(700_000), "b".repeat(700_000)];
    for (const title of titles) writer.insert("todo", { title });
    using _deliveryTimeout = setTimeout(() => {
      received.reject(
        new Error("Timed out waiting for all offline mutation chunks"),
      );
    }, 5_000);
    await received.promise;
    const rows = await sibling.loadQuery(titlesQuery);
    assertLength(rows, 2);
    for (let index = 0; index < titles.length; index++)
      assertSame(rows[index]?.title, titles[index]);
    assertLength(sockets.createdUrls, 2);
    assertEqual(sockets.sentMessages, []);
    assertEqual(setup.tabErrors, []);
    assertEqual(setup.run.deps.reportDefect.getDefects(), []);
  });

  it("local tables share reactive data across instances without sync history", async () => {
    await using setup = await setupRunWithEvoluDeps();
    const { run } = setup;
    const sqlite = setup.getSharedSqlite();
    const LocalSchema = {
      _note: { id: id("Note"), title: NonEmptyTrimmedString100 },
    };
    const createLocalQuery = createQueryBuilder(LocalSchema);
    const notesQuery = createLocalQuery((db) =>
      db.selectFrom("_note").select(["id", "title"]),
    );
    const createLocal = createEvolu(LocalSchema, {
      appName: testAppName,
      appOwner: testAppOwner,
      transports: [],
    });
    const writer = await run.ok(createLocal);
    const reader = await run.ok(createLocal);
    assertTrue(typeof writer.useOwner === "function");
    assertEqual(await reader.loadQuery(notesQuery), []);
    const observed = Promise.withResolvers<void>();
    const unsubscribe = reader.subscribeQuery(notesQuery)(() => {
      if (reader.getQueryRows(notesQuery).length > 0) observed.resolve();
    });
    const inserted = Promise.withResolvers<void>();
    const { id: noteId } = writer.insert(
      "_note",
      {
        title: NonEmptyTrimmedString100.orThrow("Local note"),
      },
      { onComplete: inserted.resolve },
    );
    await inserted.promise;
    await observed.promise;
    assertEqual(reader.getQueryRows(notesQuery), [
      { id: noteId, title: "Local note" },
    ]);
    unsubscribe();

    const updated = Promise.withResolvers<void>();
    writer.update(
      "_note",
      { id: noteId, title: NonEmptyTrimmedString100.orThrow("Updated") },
      { onComplete: updated.resolve },
    );
    await updated.promise;
    assertEqual(await writer.loadQuery(notesQuery), [
      { id: noteId, title: "Updated" },
    ]);
    const snapshot = getSqliteSnapshot({ sqlite });
    assertEqual(
      snapshot.tables.find((table) => table.name === "evolu_history")?.rows,
      [],
    );
    assertEqual(
      snapshot.tables.find((table) => table.name === "evolu_timestamp")?.rows,
      [],
    );
    assertTrue((await writer.exportDatabase()).length > 0);

    await writer[Symbol.asyncDispose]();
    const reopened = await run.ok(createLocal);
    assertEqual(await reopened.loadQuery(notesQuery), [
      { id: noteId, title: "Updated" },
    ]);
    const deleted = Promise.withResolvers<void>();
    reopened.update(
      "_note",
      { id: noteId, isDeleted: SqliteBoolean.orThrow(1) },
      { onComplete: deleted.resolve },
    );
    await deleted.promise;
    assertEqual(await reopened.loadQuery(notesQuery), []);
    assertEqual(
      getSqliteSnapshot({ sqlite }).tables.find(
        (table) => table.name === "_note",
      )?.rows,
      [],
    );
    await reopened[Symbol.asyncDispose]();
    await reader[Symbol.asyncDispose]();
  });

  it("createEvolu", async () => {
    await using setup = await setupRunWithEvoluDeps();
    const { createIntegrationEvolu, run } = setup;
    const sqlite = setup.getSharedSqlite();

    const evolu = await run.ok(createIntegrationEvolu);

    assertEqual(await evolu.loadQuery(todoByCreatedAtQuery), []);

    let completed = 0;
    const mutationCompleted = Promise.withResolvers<void>();

    evolu.insert(
      "todo",
      {
        title: NonEmptyTrimmedString100.orThrow("Integration todo"),
      },
      {
        onComplete: () => {
          completed += 1;
          mutationCompleted.resolve();
        },
      },
    );

    await mutationCompleted.promise;
    assertEqual(completed, 1);

    const rowsAfterInsert = await evolu.loadQuery(todoByCreatedAtQuery);
    const insertedId = rowsAfterInsert[0]?.id;
    assertNotUndefined(insertedId);
    assertEqual(rowsAfterInsert, [
      { id: insertedId, title: "Integration todo" },
    ]);

    const snapshot = getSqliteSnapshot({ sqlite });

    assertEqual(snapshot, {
      schema: {
        indexes: [
          {
            name: "evolu_history_ownerId_timestamp",
            sql: 'create index evolu_history_ownerId_timestamp on evolu_history (\n          "ownerId",\n          "timestamp"\n        )',
          },
          {
            name: "evolu_history_ownerId_table_id_column_timestampDesc",
            sql: 'create unique index evolu_history_ownerId_table_id_column_timestampDesc on evolu_history (\n          "ownerId",\n          "table",\n          "id",\n          "column",\n          "timestamp" desc\n        )',
          },
          {
            name: "evolu_timestamp_index",
            sql: 'create index evolu_timestamp_index on evolu_timestamp (\n        "ownerId",\n        "l",\n        "t",\n        "h1",\n        "h2",\n        "c"\n      )',
          },
          {
            name: "evolu_message_quarantine_reason_timestamp",
            sql: 'create index evolu_message_quarantine_reason_timestamp on evolu_message_quarantine (\n        "reason",\n        "timestamp"\n      )',
          },
        ],
        tables: {
          evolu_config: new Set(["clock"]),
          evolu_history: new Set([
            "ownerId",
            "table",
            "id",
            "column",
            "timestamp",
            "value",
          ]),
          evolu_message_quarantine: new Set([
            "ownerId",
            "timestamp",
            "table",
            "id",
            "column",
            "value",
            "reason",
            "origin",
            "quarantinedAt",
          ]),
          evolu_timestamp: new Set(["ownerId", "t", "h1", "h2", "c", "l"]),
          evolu_usage: new Set([
            "ownerId",
            "storedBytes",
            "firstTimestamp",
            "lastTimestamp",
          ]),
          evolu_version: new Set(["dbVersion"]),
          todo: new Set([
            "id",
            "createdAt",
            "updatedAt",
            "isDeleted",
            "ownerId",
            "title",
            "isCompleted",
          ]),
        },
      },
      tables: [
        { name: "evolu_version", rows: [{ dbVersion: 2 }] },
        {
          name: "evolu_config",
          rows: [
            {
              clock: new Uint8Array([
                0, 0, 0, 0, 0, 0, 0, 1, 10, 107, 242, 21, 194, 198, 154, 76,
              ]),
            },
          ],
        },
        {
          name: "evolu_history",
          rows: [
            {
              column: "title",
              id: new Uint8Array([
                162, 140, 107, 238, 5, 65, 113, 168, 236, 205, 236, 11, 39, 9,
                170, 125,
              ]),
              ownerId: new Uint8Array([
                5, 39, 254, 242, 108, 77, 142, 9, 59, 219, 32, 254, 15, 186,
                235, 212,
              ]),
              table: "todo",
              timestamp: new Uint8Array([
                0, 0, 0, 0, 0, 0, 0, 1, 10, 107, 242, 21, 194, 198, 154, 76,
              ]),
              value: "Integration todo",
            },
            {
              column: "createdAt",
              id: new Uint8Array([
                162, 140, 107, 238, 5, 65, 113, 168, 236, 205, 236, 11, 39, 9,
                170, 125,
              ]),
              ownerId: new Uint8Array([
                5, 39, 254, 242, 108, 77, 142, 9, 59, 219, 32, 254, 15, 186,
                235, 212,
              ]),
              table: "todo",
              timestamp: new Uint8Array([
                0, 0, 0, 0, 0, 0, 0, 1, 10, 107, 242, 21, 194, 198, 154, 76,
              ]),
              value: "1970-01-01T00:00:00.000Z",
            },
          ],
        },
        { name: "evolu_message_quarantine", rows: [] },
        {
          name: "evolu_timestamp",
          rows: [
            {
              c: 1,
              h1: 203560577542550,
              h2: 200327465842175,
              l: 1,
              ownerId: new Uint8Array([
                5, 39, 254, 242, 108, 77, 142, 9, 59, 219, 32, 254, 15, 186,
                235, 212,
              ]),
              t: new Uint8Array([
                0, 0, 0, 0, 0, 0, 0, 1, 10, 107, 242, 21, 194, 198, 154, 76,
              ]),
            },
          ],
        },
        {
          name: "evolu_usage",
          rows: [
            {
              firstTimestamp: new Uint8Array([
                0, 0, 0, 0, 0, 0, 0, 1, 10, 107, 242, 21, 194, 198, 154, 76,
              ]),
              lastTimestamp: new Uint8Array([
                0, 0, 0, 0, 0, 0, 0, 1, 10, 107, 242, 21, 194, 198, 154, 76,
              ]),
              ownerId: new Uint8Array([
                5, 39, 254, 242, 108, 77, 142, 9, 59, 219, 32, 254, 15, 186,
                235, 212,
              ]),
              storedBytes: 1,
            },
          ],
        },
        {
          name: "todo",
          rows: [
            {
              createdAt: "1970-01-01T00:00:00.000Z",
              id: "ooxr7gVBcajszewLJwmqfQ",
              isCompleted: null,
              isDeleted: null,
              ownerId: "BSf-8mxNjgk72yD-D7rr1A",
              title: "Integration todo",
              updatedAt: null,
            },
          ],
        },
      ],
    });
  });

  it("insert, update, and upsert store explicit null values", async () => {
    await using setup = await setupRunWithEvoluDeps();
    const { createIntegrationEvolu, run } = setup;

    const evolu = await run.ok(createIntegrationEvolu);
    const mutationsCompleted = Promise.withResolvers<void>();
    let pendingMutations = 4;
    const onComplete = () => {
      pendingMutations -= 1;
      if (pendingMutations === 0) mutationsCompleted.resolve();
    };

    const insertedId = evolu.insert(
      "todo",
      {
        title: NonEmptyTrimmedString100.orThrow("Inserted null"),
        isCompleted: null,
      },
      { onComplete },
    ).id;
    const updatedId = evolu.insert(
      "todo",
      {
        title: NonEmptyTrimmedString100.orThrow("Updated null"),
        isCompleted: SqliteBoolean.orThrow(1),
      },
      { onComplete },
    ).id;
    evolu.update("todo", { id: updatedId, isCompleted: null }, { onComplete });
    const upsertedId = TodoId.orThrow(createIdFromString("upserted-null"));
    evolu.upsert(
      "todo",
      {
        id: upsertedId,
        title: NonEmptyTrimmedString100.orThrow("Upserted null"),
        isCompleted: null,
      },
      { onComplete },
    );

    await mutationsCompleted.promise;

    const rows = await evolu.loadQuery(todosWithIsCompletedQuery);
    assertLength(rows, 3);
    assertEqual(
      rows.toSorted((a, b) => {
        assertNotNull(a.title);
        assertNotNull(b.title);
        return a.title.localeCompare(b.title);
      }),
      [
        { id: insertedId, title: "Inserted null", isCompleted: null },
        { id: updatedId, title: "Updated null", isCompleted: null },
        { id: upsertedId, title: "Upserted null", isCompleted: null },
      ],
    );
  });

  it("dispose and recreate keeps loadQuery working", async () => {
    await using setup = await setupRunWithEvoluDeps();
    const { createIntegrationEvolu, run } = setup;

    const evolu1 = await run.ok(createIntegrationEvolu);
    assertEqual(await evolu1.loadQuery(todoByCreatedAtQuery), []);

    await evolu1[Symbol.asyncDispose]();

    const evolu2 = await run.ok(createIntegrationEvolu);
    assertEqual(await evolu2.loadQuery(todoByCreatedAtQuery), []);
  });

  it("dispose and recreate keeps subscribed query loading persisted rows", async () => {
    await using setup = await setupRunWithEvoluDeps();
    const { createIntegrationEvolu, run } = setup;

    const evolu1 = await run.ok(createIntegrationEvolu);

    let completed = 0;
    const mutationCompleted = Promise.withResolvers<void>();

    evolu1.insert(
      "todo",
      {
        title: NonEmptyTrimmedString100.orThrow("Persisted after recreate"),
      },
      {
        onComplete: () => {
          completed += 1;
          mutationCompleted.resolve();
        },
      },
    );

    await mutationCompleted.promise;
    assertEqual(completed, 1);

    await evolu1[Symbol.asyncDispose]();

    const evolu2 = await run.ok(createIntegrationEvolu);
    const unsubscribe = evolu2.subscribeQuery(todoByCreatedAtQuery)(constVoid);

    const rows = await evolu2.loadQuery(todoByCreatedAtQuery);
    const persistedId = rows[0]?.id;
    assertNotUndefined(persistedId);
    assertEqual(rows, [{ id: persistedId, title: "Persisted after recreate" }]);

    unsubscribe();
  });

  it("stores a drifted mutation in quarantine that a subscribed query shows before onComplete", async () => {
    // System time that can be moved back, as when a clock set to the future is
    // corrected. The SharedWorker captures it for every write.
    const baseTime = testCreateTime();
    let shift = 0;
    function now(): Millis;
    function now(type: "DateIso"): DateIso;
    function now(type?: "DateIso"): Millis | DateIso {
      const millis = Millis.orThrow(baseTime.now() + shift);
      return type === "DateIso" ? millisToDateIso(millis) : millis;
    }
    await using setup = await setupRunWithEvoluDeps({
      time: { ...baseTime, now },
    });
    const { createIntegrationEvolu, run } = setup;
    const sqlite = setup.getSharedSqlite();
    const evolu = await run.ok(createIntegrationEvolu);

    const quarantineQuery = createQuery((db) =>
      db
        .selectFrom("evolu_message_quarantine")
        .select(["column", "value", "reason", "origin", "quarantinedAt"])
        .orderBy("column"),
    );
    assertEqual(await evolu.loadQuery(quarantineQuery), []);
    const unsubscribe = evolu.subscribeQuery(quarantineQuery)(constVoid);

    // A write while system time is an hour ahead moves the logical clock there.
    shift = 60 * 60 * 1000;
    const ahead = Promise.withResolvers<void>();
    const { id: aheadId } = evolu.insert(
      "todo",
      { title: NonEmptyTrimmedString100.orThrow("Ahead") },
      { onComplete: ahead.resolve },
    );
    await ahead.promise;

    // After system time is corrected, the next write is quarantined. The
    // subscribed quarantine query already shows it when onComplete runs.
    shift = 0;
    let rowsInOnComplete: ReadonlyArray<typeof quarantineQuery.Row> | undefined;
    const quarantined = Promise.withResolvers<void>();
    evolu.insert(
      "todo",
      { title: NonEmptyTrimmedString100.orThrow("Quarantined") },
      {
        onComplete: () => {
          rowsInOnComplete = evolu.getQueryRows(quarantineQuery);
          quarantined.resolve();
        },
      },
    );
    await quarantined.promise;
    unsubscribe();
    assertNotUndefined(rowsInOnComplete);
    const quarantinedRow = {
      reason: QuarantineReason.TimestampDrift,
      origin: QuarantineOrigin.LocalMutation,
      quarantinedAt: Millis.orThrow(0),
    };
    assertEqual(rowsInOnComplete, [
      {
        column: "createdAt",
        value: "1970-01-01T01:00:00.000Z",
        ...quarantinedRow,
      },
      { column: "title", value: "Quarantined", ...quarantinedRow },
    ]);

    // The quarantined row is invisible to app queries and stays in the table.
    assertEqual(await evolu.loadQuery(todoByCreatedAtQuery), [
      { id: aheadId, title: "Ahead" },
    ]);
    assertEqual(
      getSqliteSnapshot({ sqlite }).tables.find(
        (table) => table.name === "evolu_message_quarantine",
      )?.rows.length,
      2,
    );

    // Once system time catches up with the logical clock, new mutations are
    // applied again. The quarantined row waits for the next startup.
    shift = 60 * 60 * 1000;
    const after = Promise.withResolvers<void>();
    evolu.insert(
      "todo",
      { title: NonEmptyTrimmedString100.orThrow("After") },
      { onComplete: after.resolve },
    );
    await after.promise;
    assertLength(await evolu.loadQuery(quarantineQuery), 2);
    assertEqual(await evolu.loadQuery(todoTitlesQuery), [
      { title: "After" },
      { title: "Ahead" },
    ]);
  });

  it("memoryOnly opens SQLite in memory mode", async () => {
    const consoleStoreOutput = createConsoleStoreOutput();
    const sqliteDriverOptions: Array<SqliteDriverOptions | undefined> = [];
    const sqliteDriverOptionsCalled = Promise.withResolvers<void>();
    const createSqliteDriver: CreateSqliteDriver = (name, options) => {
      sqliteDriverOptions.push(options);
      sqliteDriverOptionsCalled.resolve();
      return testCreateSqliteDep.createSqliteDriver(name, options);
    };

    const run = testCreateRun({
      consoleStoreOutputEntry: consoleStoreOutput.entry,
      createBroadcastChannel,
      createMessageChannel,
      createMessagePort,
      createWebSocket: testCreateWebSocket({ throwOnCreate: true }),
      lockManager: testCreateLockManager(),
    });

    const workerRun = testCreateRun({
      consoleStoreOutputEntry: consoleStoreOutput.entry,
      createBroadcastChannel,
      createMessagePort,
      lockManager: testCreateLockManager(),
      createSqliteDriver,
    });

    const createDbWorker = () =>
      createWorker<DbWorkerInit>((self) => {
        void workerRun(startDbWorker(self));
      });

    const sharedWorker = createSharedWorker<
      SharedWorkerInput,
      SharedWorkerOutput
    >((self) => {
      void run(initSharedWorker(self));
    });
    sharedWorker.port.onMessage = (message) => {
      if (message.type === "DbWorkerInit")
        createDbWorker().postMessage(message, [message.port]);
    };
    sharedWorker.port.postMessage({
      type: "AnnounceTabLeader",
      consoleLevel: "debug",
    });
    await testWaitForWorkerMessage();

    await run.ok(
      createEvolu(Schema, {
        appName: testAppName,
        appOwner: testAppOwner,
        transports: [],
        memoryOnly: true,
      }),
      {
        ...run.deps,
        createDbWorker,
        reloadApp: constVoid,
        sharedWorker,
      },
    );

    await sqliteDriverOptionsCalled.promise;

    assertEqual(sqliteDriverOptions, [{ mode: "memory" }]);
  });

  it("keeps refused work pending until disposal and never completes mutations", async () => {
    await using setup = await setupRunWithEvoluDeps();
    const { createIntegrationEvolu, run } = setup;
    const sqlite = setup.getSharedSqlite();
    using errors = createBroadcastChannel<ConsoleEntryOrError>(
      consoleEntryOrErrorBroadcastChannelName,
    );
    const broadcasts: Array<ConsoleEntryOrError> = [];
    errors.onMessage = (message) => {
      broadcasts.push(message);
    };
    // A database created by newer code.
    sqlite.exec(sql`
      create table evolu_version ("dbVersion" integer not null) strict;
    `);
    sqlite.exec(sql`insert into evolu_version ("dbVersion") values (3);`);
    const before = getSqliteSnapshot({ sqlite });

    const reported = setup.waitForTabError();
    const evolu = await run.ok(createIntegrationEvolu);
    const pending = evolu.loadQuery(todoByCreatedAtQuery);
    const exported = evolu.exportDatabase();
    let exportSettled = false;
    const exportResult = exported.then(
      () => {
        exportSettled = true;
      },
      (reason: unknown) => {
        exportSettled = true;
        return reason;
      },
    );
    let completed = false;
    evolu.insert(
      "todo",
      { title: NonEmptyTrimmedString100.orThrow("Lost") },
      {
        onComplete: () => {
          completed = true;
        },
      },
    );

    const error = {
      type: "UnsupportedDbVersionError",
      storedVersion: PositiveInt.orThrow(3),
      supportedVersion: PositiveInt.orThrow(2),
    };
    await reported;
    await testWaitForWorkerMessage();
    // The tab is told once, through its own connection.
    assertEqual(setup.tabErrors, [error]);
    assertEqual(broadcasts, []);
    // React `use` keeps suspending while the application shows the error.
    const thenable = pending as Promise<unknown> & {
      status?: string;
    };
    assertSame(thenable.status, "pending");
    const later = evolu.loadQuery(todosWithIsCompletedQuery);
    let laterSettled = false;
    void later.then(() => {
      laterSettled = true;
    });
    assertSame(evolu.exportDatabase(), exported);
    // Another instance in the same tab does not repeat the message.
    const second = await run.ok(createIntegrationEvolu);
    await testWaitForWorkerMessage();
    assertEqual(setup.tabErrors, [error]);
    assertFalse(laterSettled);
    assertFalse(exportSettled);
    assertFalse(completed);
    assertEqual(getSqliteSnapshot({ sqlite }), before);

    await second[Symbol.asyncDispose]();
    await evolu[Symbol.asyncDispose]();
    assertEqual(await pending, []);
    assertEqual(await later, []);
    assertEqual(await exportResult, { type: "EvoluDisposedError" });
    assertFalse(completed);
  });

  it("reports refusal once to the error store of a later tab", async () => {
    await using setup = await setupRunWithEvoluDeps();
    const { createIntegrationEvolu, run } = setup;
    const sqlite = setup.getSharedSqlite();
    sqlite.exec(sql`
      create table evolu_version ("dbVersion" integer not null) strict;
    `);
    sqlite.exec(sql`insert into evolu_version ("dbVersion") values (3);`);
    const error = {
      type: "UnsupportedDbVersionError",
      storedVersion: PositiveInt.orThrow(3),
      supportedVersion: PositiveInt.orThrow(2),
    };

    const firstReported = setup.waitForTabError();
    const first = await run.ok(createIntegrationEvolu);
    const firstLoad = first.loadQuery(todoByCreatedAtQuery);
    await firstReported;
    assertEqual(setup.tabErrors, [error]);

    // The existing tab hosts the leader; the later tab only joins its tenant.
    await using _leaderLock = await run.ok(acquireLeaderLock("tab"));
    using lateDeps = createEvoluDeps({
      ...run.deps,
      sharedWorker: setup.connectLaterTab(),
    });
    assertSame(lateDeps.evoluError.get(), null);
    const reported = Promise.withResolvers<void>();
    lateDeps.evoluError.subscribe(reported.resolve);
    await using lateRun = run.create(lateDeps);
    const second = await lateRun.ok(createIntegrationEvolu);
    const secondLoad = second.loadQuery(todoByCreatedAtQuery);
    await reported.promise;
    assertEqual(lateDeps.evoluError.get(), error);
    // The first tab was not told again.
    assertEqual(setup.tabErrors, [error]);

    await second[Symbol.asyncDispose]();
    await first[Symbol.asyncDispose]();
    assertEqual(await secondLoad, []);
    assertEqual(await firstLoad, []);
  });
});
