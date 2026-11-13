import {
  assert,
  assertEqual,
  assertFalse,
  assertThrowsInstanceOf,
  assertTrue,
  assertLength,
  assertNotNull,
  assertNotUndefined,
  assertNonEmptyArray,
  assertNonEmptyReadonlyArray,
  assertErr,
  assertOk,
  assertSame,
} from "../../../../packages/common/src/Assert.ts";
import {
  createSlip21,
  createXChaCha20Poly1305,
  type Entropy32,
  type RandomBytesDep,
} from "../../../../packages/common/src/Crypto.ts";
import { once } from "node:events";
import { connect, createServer, type AddressInfo, type Socket } from "node:net";
import { describe, it } from "node:test";
import { createConsoleStoreOutput } from "../../../../packages/common/src/Console.ts";
import {
  createUnknownError,
  UnknownError,
} from "../../../../packages/common/src/Error.ts";
import {
  constVoid,
  disposable,
  exhaustiveCheck,
} from "../../../../packages/common/src/Function.ts";
import type {
  DbWorkerInit,
  DeleteDatabaseFiles,
  UnsupportedDbVersionError,
  WaitForDatabaseRelease,
} from "../../../../packages/common/src/local-first/Db.ts";
import {
  testGlobalUnhandledRejections,
  type ReloadApp,
} from "../../../../packages/common/src/Platform.ts";
import { startDbWorker } from "../../../../packages/common/src/local-first/Db.ts";
import {
  AppName,
  createEvolu,
  createEvoluApp,
  createEvoluDeps,
  type DevicePersistence,
  type EvoluAppConfig,
  type RemoveAppOwnerError,
  type EvoluError,
  forgetWrappedDeviceSecret,
  hasWrappedDeviceSecret,
  isDatabaseDeleted,
  testAppName,
  unlockWrappedDeviceSecret,
} from "../../../../packages/common/src/local-first/Evolu.ts";
import {
  createDeviceSecret,
  DeviceSecret,
  DeviceSecretKeyId,
  type DeviceSecretKeyError,
  type DeviceSecretKeyProvider,
} from "../../../../packages/common/src/local-first/Auth.ts";
import {
  createAppOwner,
  createOwnerSecret,
  createOwnerWebSocketTransport,
  createShardOwner,
  mnemonicToOwnerSecret,
  deriveShardOwner,
  OwnerSecret,
  RelayUrl,
  testAppOwner,
  type OwnerId,
} from "../../../../packages/common/src/local-first/Owner.ts";
import {
  createProtocolBroadcastMessagesFromCrdtMessages,
  createProtocolMessageFromCrdtMessages,
} from "../../../../packages/common/src/local-first/Protocol.ts";
import {
  createQueryBuilder,
  QuarantineOrigin,
  QuarantineReason,
} from "../../../../packages/common/src/local-first/Schema.ts";
import {
  consoleEntryOrErrorBroadcastChannelName,
  initSharedWorker,
  syncStateToRelaySyncStates,
  type ConsoleEntryOrError,
  type DbWorkerInput,
  type DbWorkerOutput,
  type EvoluOutput,
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
import { isPlainObject } from "../../../../packages/common/src/Object.ts";
import { installPolyfills } from "../../../../packages/common/src/Polyfills.ts";
import {
  err,
  getOrThrow,
  ok,
  type Result,
} from "../../../../packages/common/src/Result.ts";
import type { ReadonlyStore } from "../../../../packages/common/src/Store.ts";
import {
  createSqlite,
  getSqliteSnapshot,
  sql,
  SqliteBoolean,
  type CreateSqliteDriver,
  type SqliteDriverOptions,
  type SqliteDriver,
  type SqliteQuery,
} from "../../../../packages/common/src/Sqlite.ts";
import {
  testCreateDeps,
  testCreateRun,
} from "../../../../packages/common/src/Task.ts";
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
  idToIdBytes,
  Name,
  NonEmptyTrimmedString100,
  nullOr,
  PositiveInt,
  Port,
  String,
  testName,
  uint8ArrayToBase64Url,
  type ExtractTyped,
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
  testCreateWorker,
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

/**
 * Settles with `promise`, or with "pending" when it stays pending for longer
 * than the workers take to answer a request, so a test fails instead of timing
 * out.
 */
const settleWithinWorkerMessages = <T>(
  promise: Promise<T>,
): Promise<T | "pending"> =>
  Promise.race([
    promise,
    (async () => {
      for (let i = 0; i < 30; i++) await testWaitForWorkerMessage();
      return "pending" as const;
    })(),
  ]);

describe("Evolu integration", () => {
  const setupRunWithEvoluDeps = async ({
    time,
    createSqliteDriver,
    createWebSocket = testCreateWebSocket({ throwOnCreate: true }),
    seed,
    // The default database is in memory, so there are no files to delete.
    deleteDatabaseFiles = () => () => ok(),
    reloadApp = constVoid,
    waitForDatabaseRelease,
    devicePersistence = "Unknown",
    requestPersistentStorage,
  }: {
    time?: TestTime;
    devicePersistence?: DevicePersistence;
    requestPersistentStorage?: () => void;
    createSqliteDriver?: CreateSqliteDriver;
    createWebSocket?: CreateWebSocket;
    deleteDatabaseFiles?: DeleteDatabaseFiles;
    reloadApp?: ReloadApp;
    waitForDatabaseRelease?: WaitForDatabaseRelease;
    /**
     * Seeds the DbWorker's randomness and the tab's, which creates the
     * session's node ID and names the SharedWorker's sync state channel.
     * Devices of one owner need different seeds, because devices sharing a node
     * ID act as copies of one running session and can silently lose changes,
     * and devices sharing a channel receive each other's sync state.
     */
    seed?: string;
  } = {}) => {
    await using disposer = new AsyncDisposableStack();

    const consoleStoreOutput = createConsoleStoreOutput();
    // DbWorkers stop once their SharedWorker no longer holds its lock.
    const lockManager = testCreateLockManager();

    const run = disposer.use(
      testCreateRun({
        ...(seed !== undefined && {
          randomBytes: testCreateDeps({ seed: `${seed}-tab` }).randomBytes,
        }),
        // console: createConsole({ level: "debug" }),
        consoleStoreOutputEntry: consoleStoreOutput.entry,
        createBroadcastChannel,
        createMessageChannel,
        createMessagePort,
        createWebSocket,
        getDevicePersistence: () => Promise.resolve(devicePersistence),
        lockManager,
        ...(requestPersistentStorage && { requestPersistentStorage }),
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
        prepare: (sql) => driver.prepare(sql),
        iterate: (query, onRow) => {
          driver.iterate(query, onRow);
        },
        export: () => driver.export(),
        deleteDatabase: () => driver.deleteDatabase(),
        [Symbol.dispose]: constVoid,
      });
    };

    const workerRun = disposer.use(
      testCreateRun({
        ...(seed !== undefined && {
          randomBytes: testCreateDeps({ seed }).randomBytes,
        }),
        consoleStoreOutputEntry: consoleStoreOutput.entry,
        createBroadcastChannel,
        createMessagePort,
        lockManager,
        createSqliteDriver: createSqliteDriver ?? createSharedSqliteDriver,
        deleteDatabaseFiles,
        ...(waitForDatabaseRelease && { waitForDatabaseRelease }),
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
    const connected =
      Promise.withResolvers<
        Extract<SharedWorkerOutput, { type: "Connected" }>
      >();
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
        case "Waiting":
          break;
        case "Connected":
          connected.resolve(message);
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
        reloadApp,
        storedWorker: Promise.resolve(sharedWorker),
      }),
    );
    const { workerId, syncStateChannelName } = await connected.promise;
    const disposables = disposer.move();

    return {
      connectLaterTab,
      createIntegrationEvolu,
      syncStateChannelName,
      workerId,
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
      /** The DbWorkers' time, apart from the tab's. */
      dbWorkerTime: workerRun.deps.time,
      [Symbol.asyncDispose]: () => disposables.disposeAsync(),
    };
  };

  /** One SharedWorker observing its relay frames and native socket cleanup. */
  const setupDevice = async (options: {
    createSqliteDriver?: CreateSqliteDriver;
    /** Distinct per device, so each device's session has its own node ID. */
    seed: string;
  }) => {
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
            // The relay's heartbeats are text; tests observe its replies.
            if (data instanceof ArrayBuffer) onMessage(url);
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

  /**
   * A TCP proxy to a relay that can stall the connections it carries, as a dead
   * path does: a stalled connection drops data in both directions and passes on
   * neither FIN nor RST, so neither end learns that it died. Connections made
   * after a stall are carried normally.
   */
  const setupStallingProxy = async (port: number) => {
    const sockets = new Set<Socket>();
    const stalled = new Set<Socket>();
    let writtenToRelayCount = 0;
    const server = createServer((client) => {
      const upstream = connect(port, "127.0.0.1");
      const forward = (from: Socket, to: Socket, onWritten = constVoid) => {
        sockets.add(from);
        from.on("data", (chunk) => {
          if (!stalled.has(from)) to.write(chunk, onWritten);
        });
        from.on("end", () => {
          if (!stalled.has(from)) to.end();
        });
        from.on("close", () => {
          if (!stalled.has(from)) to.destroy();
        });
        from.on("error", constVoid);
      };
      forward(client, upstream, () => {
        writtenToRelayCount++;
      });
      forward(upstream, client);
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    return {
      port: (server.address() as AddressInfo).port,
      /** How many chunks from clients the relay's sockets have taken. */
      writtenToRelayCount: (): number => writtenToRelayCount,
      stall: (): void => {
        for (const socket of sockets) stalled.add(socket);
      },
      [Symbol.asyncDispose]: async () => {
        const closed = once(server, "close");
        server.close();
        for (const socket of sockets) socket.destroy();
        await closed;
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

  /**
   * Keeps the latest sync state a worker publishes and waits for a predicate
   * over it, failing after 5 seconds.
   */
  const setupSyncStates = (syncStateChannelName: string) => {
    let state: SyncState | null = null;
    let onState: () => void = constVoid;
    const disposer = new DisposableStack();
    const channel = disposer.use(
      createBroadcastChannel<SyncState>(syncStateChannelName),
    );
    channel.onMessage = (next) => {
      state = next;
      onState();
    };
    return disposable(
      {
        getState: (): SyncState | null => state,
        waitForState: async (predicate: () => boolean): Promise<void> => {
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
        },
      },
      disposer,
    );
  };

  /**
   * The app owner with another encryption key, as a writer that has the owner's
   * write key but a wrong encryption key uses it.
   */
  const createForeignOwner = (seed: string) => ({
    ...testAppOwner,
    encryptionKey: createAppOwner(createOwnerSecret(testCreateDeps({ seed })))
      .encryptionKey,
  });

  it("stores the valid changes of a partly undecryptable batch and shows the skip on its route", async () => {
    const socket = testCreateWebSocket();
    await using setup = await setupRunWithEvoluDeps({
      createWebSocket: socket,
    });
    const { run, createIntegrationEvolu } = setup;
    // The existing tab hosts the leader; the later tab only joins its tenant.
    await using _leaderLock = await run.ok(
      acquireLeaderLock(`tab-${setup.workerId}`),
    );
    using deps = createEvoluDeps({
      ...run.deps,
      createStoredWorker: setup.connectLaterTab,
    });
    await using evoluRun = run.create(deps);
    await using evolu = await evoluRun.ok(createIntegrationEvolu);
    const transport = createOwnerWebSocketTransport({
      url: RelayUrl.orThrow("wss://skipped-change-batch.example/"),
      ownerId: testAppOwner.id,
    });
    evolu.useOwner(testAppOwner, [transport]);
    assertEqual(await evolu.loadQuery(todoTitlesQuery), []);
    await testWaitForWorkerMessage();
    const messages = createProtocolBroadcastMessagesFromCrdtMessages({
      ...run.deps,
      xChaCha20Poly1305: createXChaCha20Poly1305(),
    })(testAppOwner, [
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
    ]);
    assertLength(messages, 1);
    const corrupted = Uint8Array.from(messages[0]);
    corrupted[corrupted.length - 1] ^= 0xff;
    const getRoute = () =>
      syncStateToRelaySyncStates(
        deps.syncState.get(),
        evolu.name,
        testAppOwner.id,
      )[0]?.route;
    const routeSkipped = Promise.withResolvers<void>();
    using subscriptions = new DisposableStack();
    subscriptions.defer(
      deps.syncState.subscribe(() => {
        const route = getRoute();
        if (route?.type === "Pending" && route.skippedError)
          routeSkipped.resolve();
      }),
    );

    socket.message(transport.url, corrupted.buffer);
    {
      using _routeTimeout = setTimeout(() => {
        routeSkipped.reject(
          new Error("Timed out waiting for the route's skipped change"),
        );
      }, 5_000);
      await routeSkipped.promise;
    }
    await testWaitForWorkerMessage();

    // The valid change is stored, and the undecryptable one is skipped and
    // shown on the route instead of reported as an Evolu error. The route's
    // request is never answered, so it stays pending, and a skip is not a
    // failure.
    const route = getRoute();
    assert(route?.type === "Pending", "The route should stay pending.");
    assertSame(route.failure, null);
    assertSame(route.skippedError?.type, "DecryptWithXChaCha20Poly1305Error");
    assertEqual(await evolu.loadQuery(todoTitlesQuery), [
      { title: "Valid before corruption" },
    ]);
    assertSame(deps.evoluError.get(), null);
  });

  it("uploads through a relay that holds a change it cannot decrypt", async () => {
    await using relays = await setupRelays("evolu-foreign-change");
    const { relayA } = relays;
    const transport = createOwnerWebSocketTransport({
      url: RelayUrl.orThrow(`ws://127.0.0.1:${relayA.port}/`),
      ownerId: testAppOwner.id,
    });

    // A writer with the owner's write key but another encryption key stores a
    // change on the relay that the owner cannot decrypt.
    const foreignOwner = createForeignOwner("foreign-change");
    await using foreignDevice = await setupDevice({ seed: "foreign" });
    await using foreign = await foreignDevice.setup.run.ok(
      createEvolu(Schema, {
        appName: testAppName,
        appOwner: foreignOwner,
        transports: [],
      }),
    );
    foreign.insert("todo", {
      title: NonEmptyTrimmedString100.orThrow("Foreign"),
    });
    await foreign.loadQuery(todoTitlesQuery);
    const seeded = Promise.withResolvers<void>();
    foreignDevice.setOnMessage(() => {
      if (relayA.getTimestamps().length > 0) seeded.resolve();
    });
    foreign.useOwner(foreignOwner, [transport]);
    {
      using _seedingTimeout = setTimeout(() => {
        seeded.reject(
          new Error("Timed out waiting for the relay to receive the change"),
        );
      }, 5_000);
      await seeded.promise;
    }
    const foreignTimestamps = relayA.getTimestamps();

    // The owner's device made a change before it connected. With a small
    // history, the relay answers the first request with the foreign change
    // and asks for the device's change in the same reply.
    await using device = await setupDevice({ seed: "owner" });
    using states = setupSyncStates(device.setup.syncStateChannelName);
    await using evolu = await device.setup.run.ok(
      device.setup.createIntegrationEvolu,
    );
    const getRoute = () =>
      syncStateToRelaySyncStates(
        states.getState(),
        evolu.name,
        testAppOwner.id,
      )[0]?.route;
    const title = NonEmptyTrimmedString100.orThrow("Made before connecting");
    evolu.insert("todo", { title });
    assertEqual(await evolu.loadQuery(todoTitlesQuery), [{ title }]);
    const localTimestamps = device.setup
      .getSharedSqlite()
      .exec(sql` select distinct timestamp from evolu_history; `).rows;
    const uploaded = Promise.withResolvers<void>();
    device.setOnMessage(() => {
      if (
        relayA.getTimestamps().length ===
        foreignTimestamps.length + localTimestamps.length
      )
        uploaded.resolve();
    });
    evolu.useOwner(testAppOwner, [transport]);
    {
      using _uploadTimeout = setTimeout(() => {
        uploaded.reject(
          new Error("Timed out waiting for the relay to receive the upload"),
        );
      }, 5_000);
      await uploaded.promise;
    }

    // The foreign change was skipped, so the route settles without completing
    // and keeps the skip with its cause, which crosses the sync state channel
    // as plain data.
    assertEqual(await evolu.loadQuery(todoTitlesQuery), [{ title }]);
    await states.waitForState(() => getRoute()?.type === "Settled");
    const route = getRoute();
    assert(route?.type === "Settled", "The route should settle.");
    const { skippedError } = route;
    assert(
      skippedError.type === "DecryptWithXChaCha20Poly1305Error",
      "The route should show the decryption error.",
    );
    const { error } = skippedError;
    assert(
      UnknownError.is(error) && isPlainObject(error.error),
      "The cause should be plain data in an UnknownError.",
    );
    assertSame(error.error.message, "invalid tag");
    assertEqual(device.setup.run.deps.reportDefect.getDefects(), []);
  });

  it("settles the relay route of a database that skips a sibling's local copy without completing it", async () => {
    await using relays = await setupRelays("evolu-skipped-local-copy");
    const { relayA } = relays;
    const transport = createOwnerWebSocketTransport({
      url: RelayUrl.orThrow(`ws://127.0.0.1:${relayA.port}/`),
      ownerId: testAppOwner.id,
    });
    await using device = await setupDevice({
      seed: "device",
      createSqliteDriver: testCreateSqliteDep.createSqliteDriver,
    });
    using states = setupSyncStates(device.setup.syncStateChannelName);
    const getRoute = (name: Name) =>
      syncStateToRelaySyncStates(states.getState(), name, testAppOwner.id)[0]
        ?.route;
    const postedErrors: Array<EvoluError> = [];
    using errors = createBroadcastChannel<ConsoleEntryOrError>(
      consoleEntryOrErrorBroadcastChannelName,
    );
    errors.onMessage = (entry) => {
      if (entry.type === "Error") postedErrors.push(entry.error);
    };

    // Two databases of one device use the same owner ID with different
    // encryption keys, so neither can decrypt the other's changes.
    const foreignOwner = createForeignOwner("skipped-local-copy");
    await using receiver = await device.setup.run.ok(
      createEvolu(Schema, {
        appName: AppName.orThrow("SkippedCopyReceiver"),
        appOwner: testAppOwner,
        transports: [],
      }),
    );
    await using foreign = await device.setup.run.ok(
      createEvolu(Schema, {
        appName: AppName.orThrow("SkippedCopyForeign"),
        appOwner: foreignOwner,
        transports: [],
      }),
    );
    receiver.useOwner(testAppOwner, [transport]);
    foreign.useOwner(foreignOwner, [transport]);
    await states.waitForState(
      () =>
        getRoute(receiver.name)?.type === "Complete" &&
        getRoute(foreign.name)?.type === "Complete",
    );

    // The foreign change reaches the receiver as a local copy, which it skips.
    // The round that the skip requests gets the change from the relay, which
    // settles the receiver's route with the skip instead of completing it.
    const title = NonEmptyTrimmedString100.orThrow("Foreign");
    foreign.insert("todo", { title });
    assertEqual(await foreign.loadQuery(todoTitlesQuery), [{ title }]);
    await states.waitForState(
      () =>
        getRoute(receiver.name)?.type === "Settled" &&
        getRoute(foreign.name)?.type === "Complete",
    );
    await testWaitForWorkerMessage();

    const route = getRoute(receiver.name);
    assert(route?.type === "Settled", "The receiver's route should settle.");
    assertSame(route.skippedError.type, "DecryptWithXChaCha20Poly1305Error");
    assertSame(getRoute(foreign.name)?.type, "Complete");
    assertEqual(await receiver.loadQuery(todoTitlesQuery), []);
    assertLength(relayA.getTimestamps(), 1);
    // The relay's copy of the skipped change is shown on the route. The local
    // copy has no route, so its skip is reported as an unexpected failure.
    assertLength(postedErrors, 1);
    const [posted] = postedErrors;
    assert(
      posted?.type === "UnknownError" && isPlainObject(posted.error),
      "The local copy's skip should be posted as an UnknownError.",
    );
    assertSame(posted.error.type, "DecryptWithXChaCha20Poly1305Error");
    assertEqual(device.setup.tabErrors, []);
    assertEqual(device.setup.run.deps.reportDefect.getDefects(), []);
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
        url: RelayUrl.orThrow(`ws://127.0.0.1:${relay.port}/`),
        ownerId: testAppOwner.id,
      });
      evolu.useOwner(testAppOwner, [transport]);
      if (instanceCount === 2) {
        const laterTab = instances.use(setup.connectLaterTab());
        const laterRun = instances.use(
          run.create({ ...run.deps, storedWorker: Promise.resolve(laterTab) }),
        );
        const second = instances.use(await laterRun.ok(createIntegrationEvolu));
        second.useOwner(testAppOwner, [transport]);
      }
      await opened.promise;
      await testWaitForWorkerMessage();

      using states = setupSyncStates(setup.syncStateChannelName);
      const getRoute = () =>
        syncStateToRelaySyncStates(
          states.getState(),
          evolu.name,
          testAppOwner.id,
        )[0]?.route;
      const postedErrors: Array<EvoluError> = [];
      using errors = createBroadcastChannel<ConsoleEntryOrError>(
        consoleEntryOrErrorBroadcastChannelName,
      );
      errors.onMessage = (message) => {
        if (message.type === "Error") postedErrors.push(message.error);
      };
      const title = NonEmptyTrimmedString100.orThrow(
        "Rejected while quota was exhausted",
      );
      evolu.insert("todo", { title });
      // The rejection fails the relay's route; it is not an EvoluError.
      await states.waitForState(() => {
        const route = getRoute();
        return (
          route?.type === "Pending" &&
          route.failure?.type === "ProtocolQuotaError"
        );
      });
      const route = getRoute();
      assert(
        route?.type === "Pending" &&
          route.failure?.type === "ProtocolQuotaError",
        "The route should show the quota rejection.",
      );
      assertSame(route.failure.ownerId, testAppOwner.id);
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
      assertEqual(postedErrors, []);
    });
  }

  it("reconciles data received from one relay with the owner's other relay", async () => {
    await using relays = await setupRelays("evolu-two-relays");
    const { relayA, relayB } = relays;

    const title = NonEmptyTrimmedString100.orThrow("Learned from relay A");
    const transportA = createOwnerWebSocketTransport({
      url: RelayUrl.orThrow(`ws://127.0.0.1:${relayA.port}/`),
      ownerId: testAppOwner.id,
    });
    const transportB = createOwnerWebSocketTransport({
      url: RelayUrl.orThrow(`ws://127.0.0.1:${relayB.port}/`),
      ownerId: testAppOwner.id,
    });

    // The first device stores its change on relay A only.
    await using firstDevice = await setupDevice({ seed: "first" });
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
    await using secondDevice = await setupDevice({ seed: "second" });
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
      url: RelayUrl.orThrow(`ws://127.0.0.1:${relayA.port}/`),
      ownerId: testAppOwner.id,
    });
    const transportB = createOwnerWebSocketTransport({
      url: RelayUrl.orThrow(`ws://127.0.0.1:${relayB.port}/`),
      ownerId: testAppOwner.id,
    });
    const tenantDriversByName = new Map<Name, SqliteDriver>();
    await using device = await setupDevice({
      seed: "device",
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

  it("continues each relay reply in only one database", async () => {
    await using relays = await setupRelays("evolu-attributed-replies");
    const { relayA } = relays;
    const transport = createOwnerWebSocketTransport({
      url: RelayUrl.orThrow(`ws://127.0.0.1:${relayA.port}/`),
      ownerId: testAppOwner.id,
    });

    // More changes than one frame holds, so a database needs two replies.
    const changeCount = 6_000;
    const deps = {
      ...testCreateDeps(),
      xChaCha20Poly1305: createXChaCha20Poly1305(),
    };
    const messages = Array.from({ length: changeCount }, (_, i) => ({
      timestamp: createTimestamp({ millis: Millis.orThrow(1_000 + i) }),
      change: DbChange.orThrow({
        table: "todo",
        id: createIdFromString(`attributed-${i}`),
        values: { title: `Todo ${i} `.padEnd(90, "x") },
        isInsert: true,
        isDelete: null,
      }),
    }));
    {
      const frames: Array<Uint8Array> = [];
      for (let i = 0; i < changeCount; i += 2_000) {
        const chunk = messages.slice(i, i + 2_000);
        assertNonEmptyArray(chunk);
        frames.push(
          createProtocolMessageFromCrdtMessages(deps)(testAppOwner, chunk),
        );
      }
      const seeded = Promise.withResolvers<void>();
      using _seedingTimeout = setTimeout(() => {
        seeded.reject(
          new Error("Timed out waiting for the relay to store the seed data"),
        );
      }, 5_000);
      const seeder = new WebSocket(transport.url);
      seeder.binaryType = "arraybuffer";
      seeder.addEventListener("error", () => {
        seeded.reject(new Error("The seeding socket failed"));
      });
      let replyCount = 0;
      seeder.addEventListener("message", (event) => {
        // The relay's heartbeats are text.
        if (typeof event.data === "string") return;
        if (++replyCount === frames.length) seeded.resolve();
      });
      seeder.addEventListener("open", () => {
        for (const frame of frames) seeder.send(new Uint8Array(frame));
      });
      await seeded.promise;
      seeder.close();
    }
    assertSame(relayA.getTimestamps().length, changeCount);

    const tenantDriversByName = new Map<Name, SqliteDriver>();
    await using device = await setupDevice({
      seed: "device",
      createSqliteDriver: (name) => async (run) => {
        const result = await run(testCreateSqliteDep.createSqliteDriver(name));
        if (result.ok) tenantDriversByName.set(name, result.value);
        return result;
      },
    });
    using states = setupSyncStates(device.setup.syncStateChannelName);
    let receivedCount = 0;
    device.setOnMessage(() => {
      receivedCount++;
    });
    const createTenant = (appName: string) =>
      device.setup.run.ok(
        createEvolu(Schema, {
          appName: AppName.orThrow(appName),
          appOwner: testAppOwner,
          transports: [],
        }),
      );
    await using first = await createTenant("FirstTenant");
    await using second = await createTenant("SecondTenant");
    const tenants = [first, second];
    for (const tenant of tenants) tenant.useOwner(testAppOwner, [transport]);

    await states.waitForState(() =>
      tenants.every(
        ({ name }) =>
          syncStateToRelaySyncStates(
            states.getState(),
            name,
            testAppOwner.id,
          ).at(0)?.route.type === "Complete",
      ),
    );
    for (const { name } of tenants) {
      const driver = tenantDriversByName.get(name);
      assertNotUndefined(driver);
      assertEqual(driver.exec(sql`select count(*) as count from todo;`).rows, [
        { count: changeCount },
      ]);
    }
    // The device receives one reply to each of each database's two requests.
    // When every database continued every reply, it received 2 + 4 frames.
    assertSame(receivedCount, 4);
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
    await using device = await setupDevice({
      seed: "device",
      createSqliteDriver: testCreateSqliteDep.createSqliteDriver,
    });
    using states = setupSyncStates(device.setup.syncStateChannelName);
    const getRoute = (name: Name, port: number) =>
      syncStateToRelaySyncStates(states.getState(), name, testAppOwner.id).find(
        ({ transport }) => transport.label === `ws://127.0.0.1:${port}/`,
      )?.route;
    const createTenant = (appName: string) =>
      device.setup.run.ok(
        createEvolu(Schema, {
          appName: AppName.orThrow(appName),
          appOwner: testAppOwner,
          transports: [],
        }),
      );
    const transportA = createOwnerWebSocketTransport({
      url: RelayUrl.orThrow(`ws://127.0.0.1:${relayA.port}/`),
      ownerId: testAppOwner.id,
    });
    const transportB = createOwnerWebSocketTransport({
      url: RelayUrl.orThrow(`ws://127.0.0.1:${relayB.port}/`),
      ownerId: testAppOwner.id,
    });
    await using source = await createTenant("ContinuationSource");
    source.useOwner(testAppOwner, [transportB]);
    await states.waitForState(
      () => getRoute(source.name, relayB.port)?.type === "Complete",
    );

    // B rejects the mutation and its automatic retry, leaving the message
    // stored only in the source database.
    const title = NonEmptyTrimmedString100.orThrow("Historical local copy");
    source.insert("todo", { title });
    assertEqual(await source.loadQuery(todoTitlesQuery), [{ title }]);
    await states.waitForState(() => {
      const route = getRoute(source.name, relayB.port);
      return (
        rejectedB === 2 &&
        route?.type === "Pending" &&
        route.failure?.type === "ProtocolQuotaError"
      );
    });
    assertEqual(relayB.getTimestamps(), []);

    // The empty sibling legitimately converges with the still-empty relay B.
    await using sibling = await createTenant("ContinuationSibling");
    sibling.useOwner(testAppOwner, [transportB]);
    await states.waitForState(
      () => getRoute(sibling.name, relayB.port)?.type === "Complete",
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
    await states.waitForState(
      () => getRoute(sibling.name, relayB.port)?.type === "Pending",
    );
    const pendingRoute = getRoute(sibling.name, relayB.port);
    assert(pendingRoute?.type === "Pending", "The route should be pending.");
    assertSame(pendingRoute.failure, null);
    assertSame(pendingRoute.skippedError, null);
    assertEqual(relayB.getTimestamps(), []);

    quota.resolve(true);
    await states.waitForState(
      () => getRoute(sibling.name, relayB.port)?.type === "Complete",
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
      seed: "device",
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
      url: RelayUrl.orThrow(`ws://127.0.0.1:${relays.relayA.port}/`),
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

  it("replaces a connection whose path stops carrying data without closing it", async () => {
    // One fake clock drives the relay's pings and heartbeats and the client's
    // watchdog.
    const time = testCreateTime();
    await using relayRun = testCreateRun({
      ...createRelayDeps(),
      createSqliteDriver: testCreateSqliteDep.createSqliteDriver,
      time,
    });
    await using relay = await relayRun.ok(
      createRelay({
        port: Port.orThrow(0),
        name: Name.orThrow("evolu-stalled-path"),
        isOwnerWithinQuota: () => true,
      }),
    );
    await using proxy = await setupStallingProxy(relay.port);
    await using setup = await setupRunWithEvoluDeps({ time, createWebSocket });
    using states = setupSyncStates(setup.syncStateChannelName);
    await using evolu = await setup.run.ok(setup.createIntegrationEvolu);
    const connection = () => states.getState()?.transports.at(0)?.connection;
    const connectionType = () => connection()?.type;
    const isComplete = () =>
      syncStateToRelaySyncStates(
        states.getState(),
        evolu.name,
        testAppOwner.id,
      ).at(0)?.route.type === "Complete";
    // Advancing past two relay ticks at once would leave the client no time
    // to answer the first ping, so time moves in steps that the sockets
    // follow in real time.
    const step = async (millis: number): Promise<void> => {
      time.advance(Millis.orThrow(millis));
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 30);
      });
    };
    // A relay tick that waits until the client's pong has reached the relay,
    // which terminates a connection that sends nothing between two ticks.
    const tick = async (): Promise<void> => {
      const writtenCount = proxy.writtenToRelayCount();
      time.advance("30s");
      for (
        let waited = 0;
        proxy.writtenToRelayCount() === writtenCount;
        waited += 5
      ) {
        assert(waited < 5_000, "Expected the client to answer the ping.");
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 5);
        });
      }
      // The relay reads the pong in the poll phase of a later event-loop
      // turn, which the second of these checks follows.
      for (let turn = 0; turn < 2; turn++)
        await new Promise<void>((resolve) => {
          setImmediate(resolve);
        });
    };
    evolu.useOwner(testAppOwner, [
      createOwnerWebSocketTransport({
        url: RelayUrl.orThrow(`ws://127.0.0.1:${proxy.port}/`),
        ownerId: testAppOwner.id,
      }),
    ]);
    await states.waitForState(isComplete);
    const opened = connection();
    assertSame(opened?.type, "Open");

    // Heartbeats keep the idle connection, not a replacement, past the
    // deadline of two minutes plus up to thirty seconds of jitter.
    for (let count = 0; count < 6; count++) await tick();
    assertEqual(connection(), opened);

    // Nothing arrives anymore, and neither end sees a close or an error, so
    // only the client's watchdog can notice, at its deadline after the last
    // heartbeat, which came at most one tick before the stall.
    proxy.stall();
    let stalledFor = 0;
    while (connectionType() === "Open") {
      assert(stalledFor < 150_000, "Expected a replacement.");
      await step(1_000);
      stalledFor += 1_000;
    }
    assertTrue(stalledFor > 90_000);
    assertSame(connectionType(), "Disconnected");

    // The transport reconnects through the proxy and syncs again.
    for (let second = 0; connectionType() !== "Open"; second++) {
      assert(second < 60, "Expected the transport to reconnect.");
      await step(1_000);
    }
    await states.waitForState(isComplete);
    assertEqual(setup.tabErrors, []);
    assertEqual(setup.run.deps.reportDefect.getDefects(), []);
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
      "ws://offline-a.localhost/",
      "ws://offline-b.localhost/",
    ].map((url) =>
      createOwnerWebSocketTransport({
        url: RelayUrl.orThrow(url),
        ownerId: testAppOwner.id,
      }),
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
      { onSuccess: inserted.resolve },
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
      { onSuccess: updated.resolve },
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
      { onSuccess: deleted.resolve },
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

  /**
   * Gives each database name its own in-memory SQLite database, kept for the
   * test, so the device database and each app database stay apart and a
   * reopened name finds its data.
   */
  const createSqliteDriverPerName = () => {
    const driversByName = new Map<Name, SqliteDriver>();
    let statementHook: ((statement: string) => void) | null = null;
    const createSqliteDriver: CreateSqliteDriver = (name) => async (run) => {
      let driver = driversByName.get(name);
      if (!driver) {
        const created = await run(testCreateSqliteDep.createSqliteDriver(name));
        if (!created.ok) return created;
        driver = created.value;
        driversByName.set(name, driver);
      }
      const kept = driver;
      return ok({
        exec: (query) => {
          statementHook?.(query.sql);
          return kept.exec(query);
        },
        prepare: (sql) => {
          const statement = kept.prepare(sql);
          return {
            exec: (parameters) => {
              statementHook?.(sql);
              return statement.exec(parameters);
            },
            [Symbol.dispose]: () => {
              statement[Symbol.dispose]();
            },
          };
        },
        iterate: (query, onRow) => {
          statementHook?.(query.sql);
          kept.iterate(query, onRow);
        },
        export: () => kept.export(),
        deleteDatabase: () => kept.deleteDatabase(),
        [Symbol.dispose]: constVoid,
      });
    };
    const driverWith = (table: string): SqliteDriver | undefined =>
      [...driversByName.values()].find(
        (driver) =>
          driver.exec(sql`
            select "name" from sqlite_master where "name" = ${table};
          `).rows.length > 0,
      );
    let failNextDeletion = false;
    let deletionHold: Promise<void> | null = null;
    const deletedNames: Array<Name> = [];
    const deletionListeners = new Set<() => void>();
    const deletionStarts = new Set<() => void>();
    // Deleting a database's files drops its SQLite database, so the next
    // open of its name starts empty.
    const deleteDatabaseFiles: DeleteDatabaseFiles = (name) => async () => {
      for (const started of deletionStarts) started();
      deletionStarts.clear();
      const hold = deletionHold;
      deletionHold = null;
      await hold;
      if (failNextDeletion) {
        failNextDeletion = false;
        return err(createUnknownError(new Error("Deletion failed.")));
      }
      driversByName.get(name)?.[Symbol.dispose]();
      driversByName.delete(name);
      deletedNames.push(name);
      for (const listener of deletionListeners) listener();
      return ok();
    };
    return {
      createSqliteDriver,
      deleteDatabaseFiles,
      failNextDeletion: () => {
        failNextDeletion = true;
      },
      /** Resolves once the next deletion of database files starts. */
      waitForDeletionStart: (): Promise<void> =>
        new Promise((resolve) => {
          deletionStarts.add(resolve);
        }),
      /** Holds the next deletion until the returned function is called. */
      holdNextDeletion: (): (() => void) => {
        const { promise, resolve } = Promise.withResolvers<void>();
        deletionHold = promise;
        return resolve;
      },
      /** Calls `callback` once, at the next statement matching `predicate`. */
      onNextStatement: (
        predicate: (statement: string) => boolean,
        callback: () => void,
      ): void => {
        statementHook = (statement) => {
          if (!predicate(statement)) return;
          statementHook = null;
          callback();
        };
      },
      names: () => [...driversByName.keys()],
      /** How many times a database's files were deleted. */
      deletions: (name: Name): number =>
        deletedNames.filter((deleted) => deleted === name).length,
      /** Resolves once a database's files were deleted `count` times. */
      waitForDeletions: (name: Name, count: number): Promise<void> =>
        new Promise((resolve) => {
          const check = () => {
            if (
              deletedNames.filter((deleted) => deleted === name).length < count
            )
              return;
            deletionListeners.delete(check);
            resolve();
          };
          deletionListeners.add(check);
          check();
        }),
      /** The rows of a table in the one database that has it. */
      selectAll: (table: string): ReadonlyArray<unknown> =>
        driverWith(table)?.exec(sql`select * from ${sql.identifier(table)};`)
          .rows ?? [],
      /**
       * Runs a query in the one database that has the table, behind the back of
       * every instance, which neither sees nor refreshes it.
       */
      execWhere: (table: string, query: SqliteQuery): void => {
        const driver = driverWith(table);
        assertNotUndefined(driver);
        driver.exec(query);
      },
      [Symbol.dispose]: () => {
        for (const driver of driversByName.values()) driver[Symbol.dispose]();
      },
    };
  };

  describe("createEvoluApp", () => {
    /** Resolves once the store's value satisfies the predicate. */
    const waitForStore = <T>(
      store: ReadonlyStore<T>,
      predicate: (value: T) => boolean,
    ): Promise<T> =>
      new Promise((resolve) => {
        if (predicate(store.get())) {
          resolve(store.get());
          return;
        }
        const unsubscribe = store.subscribe(() => {
          if (!predicate(store.get())) return;
          unsubscribe();
          resolve(store.get());
        });
      });

    const instantStartConfig = {
      appName: testAppName,
      auth: { type: "InstantStart" },
      createFirstAppOwner: true,
      transports: [],
    } as const;

    it("throws at the call for an invalid index of either schema or a transport listed twice, so nothing starts", async () => {
      using drivers = createSqliteDriverPerName();
      await using setup = await setupRunWithEvoluDeps({
        createSqliteDriver: drivers.createSqliteDriver,
      });
      const { run } = setup;
      const relay = createOwnerWebSocketTransport({
        url: RelayUrl.orThrow("wss://relay.example/"),
        ownerId: testAppOwner.id,
      });
      const deviceSchema = {
        _settings: { id: id("Settings"), theme: NonEmptyTrimmedString100 },
      };
      const cases = [
        [
          {
            indexes: (create) => [
              create("todoTitle").on("todo").column("title").unique(),
            ],
          },
          "Unique indexes are not supported because they can prevent synchronization.",
        ],
        [
          {
            indexes: (create) => [
              create("evolu_todoTitle").on("todo").column("title"),
            ],
          },
          "Index names starting with evolu_ are reserved for Evolu.",
        ],
        [
          {
            device: {
              schema: deviceSchema,
              indexes: (create) => [
                create("settingsTheme")
                  .on("_settings")
                  .column("theme")
                  .unique(),
              ],
            },
          },
          "Unique indexes are not supported because they can prevent synchronization.",
        ],
        [{ transports: [relay, relay] }, "Transports must be distinct."],
      ] as const satisfies ReadonlyArray<
        readonly [Partial<EvoluAppConfig<typeof deviceSchema>>, string]
      >;

      for (const [config, message] of cases)
        assertEqual(
          assertThrowsInstanceOf(
            () => createEvoluApp(Schema, { ...instantStartConfig, ...config }),
            Error,
          ).message,
          message,
        );

      // No instance was created, so nothing waits or failed.
      assertEqual(drivers.names(), []);
      assertFalse(run.signal.aborted);
      assertEqual(run.deps.reportDefect.getDefects(), []);
    });

    it("starts with the first AppOwner its device database created, in every tab", async () => {
      using drivers = createSqliteDriverPerName();
      await using setup = await setupRunWithEvoluDeps({
        createSqliteDriver: drivers.createSqliteDriver,
      });
      const { run } = setup;

      await using firstTab = await run.orThrow(
        createEvoluApp(Schema, instantStartConfig),
      );
      await using secondTab = await run.orThrow(
        createEvoluApp(Schema, instantStartConfig),
      );

      const appOwners = firstTab.appOwners.get();
      assertNonEmptyReadonlyArray(appOwners);
      assertLength(appOwners, 1);
      const [first] = appOwners;
      assertEqual(first.name, null);
      assertEqual(first.lastOpenedAt, null);
      assertEqual(secondTab.appOwners.get(), appOwners);

      const current = firstTab.current.get();
      assertNotNull(current);
      assertSame(current.appOwner.id, first.id);
      const evolu = await current.evolu;
      assertSame(evolu.appOwner.id, first.id);
      assertSame(secondTab.current.get()?.appOwner.id, first.id);

      // A query runs in the AppOwner's DbWorker, which created its driver.
      await evolu.loadQuery(todoByCreatedAtQuery);
      // The device database and the AppOwner's database.
      assertLength(drivers.names(), 2);
      assertTrue(drivers.names().includes(evolu.name));
    });

    /**
     * A device database with two AppOwners, the second opened most recently,
     * and the names of the databases each start opens.
     */
    const setupTwoAppOwners = async () => {
      const drivers = createSqliteDriverPerName();
      const setup = await setupRunWithEvoluDeps({
        createSqliteDriver: drivers.createSqliteDriver,
      });
      const { run } = setup;
      const ids = await (async () => {
        await using app = await run.orThrow(
          createEvoluApp(Schema, instantStartConfig),
        );
        const first = app.current.get();
        assertNotNull(first);
        await first.evolu;
        const second = getOrThrow(
          await app.add(
            createOwnerSecret(testCreateDeps({ seed: "app-second" })),
          ),
        );
        await app.current.get()?.evolu;
        return { first: first.appOwner.id, second };
      })();
      return {
        ...ids,
        run,
        [Symbol.asyncDispose]: async () => {
          await setup[Symbol.asyncDispose]();
          drivers[Symbol.dispose]();
        },
      };
    };

    it("starts with the AppOwner startAppOwnerId names, though another was opened more recently, and records no open time", async () => {
      await using setup = await setupTwoAppOwners();
      const { run, first, second } = setup;
      {
        await using app = await run.orThrow(
          createEvoluApp(Schema, {
            ...instantStartConfig,
            startAppOwnerId: first,
          }),
        );
        assertSame(app.current.get()?.appOwner.id, first);
        await app.current.get()?.evolu;
      }

      // Without it, the start opens the one opened most recently, still.
      await using restarted = await run.orThrow(
        createEvoluApp(Schema, instantStartConfig),
      );
      assertSame(restarted.current.get()?.appOwner.id, second);
    });

    it("starts with none open, opening no instance, for a startAppOwnerId that isn't listed or is null", async () => {
      await using setup = await setupTwoAppOwners();
      const { run } = setup;
      const notListed = createAppOwner(
        createOwnerSecret(testCreateDeps({ seed: "app-not-listed" })),
      ).id;

      for (const startAppOwnerId of [notListed, null]) {
        // Each instance asks once whether the device keeps data, also one
        // that would reuse a database the setup left open.
        let persistenceReads = 0;
        await using appRun = testCreateRun<typeof run.deps>({
          ...run.deps,
          getDevicePersistence: () => {
            persistenceReads++;
            return run.deps.getDevicePersistence();
          },
        });
        await using app = await appRun.orThrow(
          createEvoluApp(Schema, { ...instantStartConfig, startAppOwnerId }),
        );
        assertSame(app.current.get(), null);
        assertLength(app.appOwners.get(), 2);
        await testWaitForWorkerMessage();
        // Only the device database's instance.
        assertSame(persistenceReads, 1);
      }
    });

    it("starts tabs that open a new device database at once with one first AppOwner", async () => {
      using drivers = createSqliteDriverPerName();
      // The device database opens once both tabs asked for it.
      const release = Promise.withResolvers<void>();
      let gate: Promise<void> | null = release.promise;
      await using setup = await setupRunWithEvoluDeps({
        createSqliteDriver: (name, options) => async (run) => {
          const held = gate;
          gate = null;
          await held;
          return run(drivers.createSqliteDriver(name, options));
        },
      });
      const { run } = setup;

      const starting = Promise.all([
        run.orThrow(createEvoluApp(Schema, instantStartConfig)),
        run.orThrow(createEvoluApp(Schema, instantStartConfig)),
      ]);
      await testWaitForWorkerMessage();
      await testWaitForWorkerMessage();
      release.resolve();
      const [firstTab, secondTab] = await starting;
      await using _firstTab = firstTab;
      await using _secondTab = secondTab;

      assertLength(drivers.selectAll("_evolu_appOwner"), 1);
      const id = firstTab.current.get()?.appOwner.id;
      assertNotUndefined(id);
      assertSame(secondTab.current.get()?.appOwner.id, id);
      assertEqual(secondTab.appOwners.get(), firstTab.appOwners.get());
      // Answered once the AppOwner's DbWorker leads. The setup disposes
      // DbWorkers before the SharedWorker, whose tenant would otherwise wait
      // for one still starting.
      for (const tab of [firstTab, secondTab]) {
        const evolu = await tab.current.get()?.evolu;
        assertNotUndefined(evolu);
        assertEqual(await evolu.loadQuery(todoByCreatedAtQuery), []);
      }
    });

    it("adds, opens, and renames AppOwners, each tab keeping its own", async () => {
      using drivers = createSqliteDriverPerName();
      const time = testCreateTime();
      await using setup = await setupRunWithEvoluDeps({
        createSqliteDriver: drivers.createSqliteDriver,
        time,
      });
      const { run } = setup;
      const config = { ...instantStartConfig, createFirstAppOwner: false };

      await using firstTab = await run.orThrow(createEvoluApp(Schema, config));
      await using secondTab = await run.orThrow(createEvoluApp(Schema, config));
      assertEqual(firstTab.appOwners.get(), []);
      assertSame(firstTab.current.get(), null);

      const work = createOwnerSecret(testCreateDeps({ seed: "app-work" }));
      const workId = getOrThrow(
        await firstTab.add(work, NonEmptyTrimmedString100.orThrow("Work")),
      );
      assertSame(workId, createAppOwner(work).id);
      // Opened once the device database stores it.
      assertSame(firstTab.current.get()?.appOwner.id, workId);
      assertLength(drivers.selectAll("_evolu_appOwner"), 1);
      // A tab never opens one on its own.
      await waitForStore(
        secondTab.appOwners,
        (appOwners) => appOwners.length === 1,
      );
      assertSame(secondTab.current.get(), null);
      secondTab.open(workId);
      assertSame(secondTab.current.get()?.appOwner.id, workId);

      time.advance("1s");
      const home = createOwnerSecret(testCreateDeps({ seed: "app-home" }));
      const homeId = getOrThrow(await firstTab.add(home));
      const [listedFirst] = await waitForStore(
        secondTab.appOwners,
        (appOwners) => appOwners.length === 2,
      );
      // The AppOwner opened most recently is listed first, but the other tab
      // keeps the one it has open.
      assertSame(listedFirst?.id, homeId);
      assertSame(firstTab.current.get()?.appOwner.id, homeId);
      assertSame(secondTab.current.get()?.appOwner.id, workId);

      secondTab.rename(homeId, NonEmptyTrimmedString100.orThrow("Home"));
      await waitForStore(firstTab.appOwners, (appOwners) =>
        appOwners.some(({ id, name }) => id === homeId && name === "Home"),
      );

      firstTab.open(workId);
      assertSame(firstTab.current.get()?.appOwner.id, workId);
      const workEvolu = await firstTab.current.get()?.evolu;
      assertSame(workEvolu?.appOwner.id, workId);
      // Added again, it keeps its database.
      assertOk(await firstTab.add(work));
      assertSame((await firstTab.current.get()?.evolu)?.name, workEvolu?.name);

      // Not listed: another tab may just have removed it.
      firstTab.open(
        createAppOwner(
          createOwnerSecret(testCreateDeps({ seed: "app-unknown" })),
        ).id,
      );
      assertSame(firstTab.current.get()?.appOwner.id, workId);
    });

    const DeviceSchema = {
      _settings: { id: id("Settings"), theme: NonEmptyTrimmedString100 },
      sharedSettings: {
        id: id("SharedSettings"),
        language: NonEmptyTrimmedString100,
      },
    };
    const settingsQuery = createQueryBuilder(DeviceSchema)((db) =>
      db.selectFrom("_settings").select(["id", "theme"]),
    );

    it("keeps the app's device tables in the device database its tabs share", async () => {
      using drivers = createSqliteDriverPerName();
      await using setup = await setupRunWithEvoluDeps({
        createSqliteDriver: drivers.createSqliteDriver,
      });
      const { run } = setup;
      const config = {
        ...instantStartConfig,
        device: { schema: DeviceSchema },
      };

      await using firstTab = await run.orThrow(createEvoluApp(Schema, config));
      await using secondTab = await run.orThrow(createEvoluApp(Schema, config));
      // An export would write every AppOwner's secret in plaintext, and a
      // deletion would lose them all.
      assertFalse("exportDatabase" in firstTab.device);
      assertFalse("deleteDatabase" in firstTab.device);
      // The app disposes it.
      assertFalse(Symbol.asyncDispose in firstTab.device);

      const inserted = Promise.withResolvers<void>();
      const { id: settingsId } = firstTab.device.insert(
        "_settings",
        { theme: NonEmptyTrimmedString100.orThrow("Dark") },
        { onSuccess: inserted.resolve },
      );
      await inserted.promise;
      assertEqual(await secondTab.device.loadQuery(settingsQuery), [
        { id: settingsId, theme: "Dark" },
      ]);
      // A query runs in the AppOwner's DbWorker, which created its driver.
      const appOwnerEvolu = await firstTab.current.get()?.evolu;
      assertNotUndefined(appOwnerEvolu);
      await appOwnerEvolu.loadQuery(todoByCreatedAtQuery);
      // The device database and the AppOwner's database.
      assertLength(drivers.names(), 2);

      const language = NonEmptyTrimmedString100.orThrow("cs");
      // The device owner never syncs, so a synced table names its owner, by
      // type and, for an untyped caller, at run time.
      assertThrowsInstanceOf(
        // @ts-expect-error The device owner never syncs, so a mutation of a synced table takes the owner it syncs with.
        () => firstTab.device.insert("sharedSettings", { language }),
        Error,
      );
      const sharedSettingsOwner = createShardOwner(
        createOwnerSecret(testCreateDeps({ seed: "shared-settings" })),
      );
      const stored = Promise.withResolvers<void>();
      firstTab.device.insert(
        "sharedSettings",
        { language },
        { owner: sharedSettingsOwner, onSuccess: stored.resolve },
      );
      await stored.promise;
    });

    it("calls the app's onOwnerDeleted in every tab for an owner deleted in the device instance", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run } = setup;
      const settingsOwner = createShardOwner(
        createOwnerSecret(testCreateDeps({ seed: "device-owner-deleted" })),
      );
      const deletedInFirstTab: Array<OwnerId> = [];
      await using firstTab = await run.orThrow(
        createEvoluApp(Schema, {
          ...instantStartConfig,
          device: { schema: DeviceSchema },
          onOwnerDeleted: (ownerId) => {
            deletedInFirstTab.push(ownerId);
          },
        }),
      );
      using laterTabDeps = createEvoluDeps({
        ...run.deps,
        createStoredWorker: setup.connectLaterTab,
      });
      await using laterTabRun = run.create(laterTabDeps);
      const deletedInOtherTab = Promise.withResolvers<OwnerId>();
      await using _otherTab = await laterTabRun.orThrow(
        createEvoluApp(Schema, {
          ...instantStartConfig,
          device: { schema: DeviceSchema },
          onOwnerDeleted: deletedInOtherTab.resolve,
        }),
      );
      const stored = Promise.withResolvers<void>();
      firstTab.device.insert(
        "sharedSettings",
        { language: NonEmptyTrimmedString100.orThrow("cs") },
        { owner: settingsOwner, onSuccess: stored.resolve },
      );
      await stored.promise;

      assertEqual(await firstTab.device.deleteOwner(settingsOwner), ok());

      assertEqual(deletedInFirstTab, [settingsOwner.id]);
      assertEqual(await deletedInOtherTab.promise, settingsOwner.id);
    });

    it("rejects in its instances an owner with another listed AppOwner's ID, whatever its type", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run } = setup;
      await using app = await run.orThrow(
        createEvoluApp(Schema, {
          ...instantStartConfig,
          device: { schema: DeviceSchema },
        }),
      );
      const first = app.current.get();
      assertNotNull(first);
      const { appOwner } = first;
      assertOk(
        await app.add(
          createOwnerSecret(testCreateDeps({ seed: "listed-second" })),
        ),
      );
      const second = app.current.get();
      assertNotNull(second);
      const secondEvolu = await second.evolu;
      const transport = createOwnerWebSocketTransport({
        url: RelayUrl.orThrow("wss://example.com/"),
        ownerId: appOwner.id,
      });
      const title = NonEmptyTrimmedString100.orThrow("Not here");
      const language = NonEmptyTrimmedString100.orThrow("cs");

      for (const owner of [
        // Untagged, as an app that keeps its accounts as plain owners has it.
        {
          id: appOwner.id,
          encryptionKey: appOwner.encryptionKey,
          writeKey: appOwner.writeKey,
        },
        // Created from the AppOwner's secret, so it has the AppOwner's ID.
        createShardOwner(mnemonicToOwnerSecret(appOwner.mnemonic)),
      ]) {
        assertThrowsInstanceOf(
          () => secondEvolu.useOwner(owner, [transport]),
          Error,
        );
        assertThrowsInstanceOf(
          () => secondEvolu.insert("todo", { title }, { owner }),
          Error,
        );
        // The device instance's types take no AppOwner; untyped callers throw.
        assertThrowsInstanceOf(
          () => app.device.useOwner(owner as never, [transport]),
          Error,
        );
        assertThrowsInstanceOf(
          () =>
            app.device.insert(
              "sharedSettings",
              { language },
              { owner: owner as never },
            ),
          Error,
        );
      }
    });

    it("syncs the open AppOwner over the app's transports and never the device owner", async () => {
      for (const auth of [
        // Instant start's device owner is the same on every device of every
        // app, so a relay would see one OwnerId shared by all of them.
        { type: "InstantStart" },
        {
          type: "DeviceSecret",
          secret: createDeviceSecret(testCreateDeps({ seed: "device" })),
        },
      ] as const) {
        await using setup = await setupRunWithEvoluDeps({
          createWebSocket: testCreateWebSocket(),
        });
        const { run } = setup;
        using states = setupSyncStates(setup.syncStateChannelName);
        await using app = await run.orThrow(
          createEvoluApp(Schema, {
            ...instantStartConfig,
            auth,
            transports: [
              {
                type: "WebSocket",
                url: RelayUrl.orThrow("wss://relay.example/"),
              },
            ],
          }),
        );
        const current = app.current.get();
        assertNotNull(current);
        const evolu = await current.evolu;

        await states.waitForState(
          () =>
            syncStateToRelaySyncStates(
              states.getState(),
              evolu.name,
              current.appOwner.id,
            ).length === 1,
        );
        for (let i = 0; i < 5; i++) await testWaitForWorkerMessage();

        const deviceTenant = states
          .getState()
          ?.tenants.find(({ name }) => name === app.device.name);
        // The device database syncs no owner, not even read-only.
        assertEqual(
          deviceTenant?.type === "Active" ? deviceTenant.owners : [],
          [],
        );
      }
    });

    it("rejects in an instance an owner with the ID of an AppOwner added after it checked another owner", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run } = setup;
      await using app = await run.orThrow(
        createEvoluApp(Schema, instantStartConfig),
      );
      const first = app.current.get();
      assertNotNull(first);
      const firstEvolu = await first.evolu;
      const title = NonEmptyTrimmedString100.orThrow("Not here");
      // An owner that isn't an AppOwner, which the instance checks first.
      firstEvolu.insert(
        "todo",
        { title },
        {
          owner: createShardOwner(
            createOwnerSecret(testCreateDeps({ seed: "not-an-app-owner" })),
          ),
        },
      );

      const added = createOwnerSecret(testCreateDeps({ seed: "added-later" }));
      getOrThrow(await app.add(added));
      // Created from the added AppOwner's secret, so it has its ID.
      const owner = createShardOwner(added);
      const error = assertThrowsInstanceOf(
        () => firstEvolu.insert("todo", { title }, { owner }),
        Error,
      );

      assertTrue(
        error.message.startsWith(
          "An AppOwner's data lives only in its own database",
        ),
      );
    });

    it("names an AppOwner's database by the AppName and the AppOwner's ID, which an upgrade must keep", async () => {
      using drivers = createSqliteDriverPerName();
      await using setup = await setupRunWithEvoluDeps({
        createSqliteDriver: drivers.createSqliteDriver,
      });
      const { run } = setup;
      await using app = await run.orThrow(
        createEvoluApp(Schema, {
          ...instantStartConfig,
          appName: AppName.orThrow("permanent"),
          createFirstAppOwner: false,
        }),
      );
      getOrThrow(
        await app.add(OwnerSecret.orThrow(new Uint8Array(32).fill(1))),
      );
      const evolu = await app.current.get()?.evolu;
      assertNotUndefined(evolu);
      // A query runs in the AppOwner's DbWorker, which created its driver.
      await evolu.loadQuery(todoByCreatedAtQuery);

      // Another name would leave the stored data behind after an upgrade.
      assertSame(evolu.name, "permanent-cdsvkr4Mx67w5I1ke10Uhw");
      assertEqual(drivers.names().toSorted(), [
        "permanent-9wQ1FYUqR4gyxFq5BwtLbQ",
        "permanent-cdsvkr4Mx67w5I1ke10Uhw",
      ]);
    });

    it("names and encrypts a DeviceSecret's device database by the secret, which an upgrade must keep", async () => {
      using drivers = createSqliteDriverPerName();
      const keysByName = new Map<Name, string | null>();
      await using setup = await setupRunWithEvoluDeps({
        createSqliteDriver: (name, options) => {
          keysByName.set(
            name,
            options?.mode === "encrypted"
              ? uint8ArrayToBase64Url(options.encryptionKey)
              : null,
          );
          return drivers.createSqliteDriver(name, options);
        },
      });
      const { run } = setup;
      await using _app = await run.orThrow(
        createEvoluApp(Schema, {
          ...instantStartConfig,
          appName: AppName.orThrow("permanent"),
          auth: {
            type: "DeviceSecret",
            secret: DeviceSecret.orThrow(new Uint8Array(32).fill(1)),
          },
          createFirstAppOwner: false,
        }),
      );

      // Another name or key opens a new, empty device database after an
      // upgrade, so the app loses its AppOwners.
      assertEqual(Object.fromEntries(keysByName), {
        "permanent-kmtJfpBEJe9r-wngFglVuQ":
          "aFlyHjk3vDHNkHEWkpHP9IHYsPHM4MSsWcFM28szAnE",
      });
    });

    it("lists the AppOwners without their secrets", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run } = setup;
      await using app = await run.orThrow(
        createEvoluApp(Schema, instantStartConfig),
      );
      const first = app.current.get();
      assertNotNull(first);
      await first.evolu;
      for (let i = 0; i < 5; i++) await testWaitForWorkerMessage();

      assertEqual(app.appOwners.get(), [
        { id: first.appOwner.id, name: null, lastOpenedAt: null },
      ]);
    });

    it("clears an AppOwner's name with a rename to null", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run } = setup;
      await using app = await run.orThrow(
        createEvoluApp(Schema, instantStartConfig),
      );
      const first = app.current.get();
      assertNotNull(first);
      await first.evolu;
      app.rename(first.appOwner.id, NonEmptyTrimmedString100.orThrow("Work"));
      await waitForStore(app.appOwners, ([entry]) => entry?.name === "Work");

      app.rename(first.appOwner.id, null);
      const cleared = await settleWithinWorkerMessages(
        waitForStore(app.appOwners, ([entry]) => entry?.name === null),
      );

      assert(cleared !== "pending", "The name wasn't cleared.");
      assertEqual(
        app.appOwners.get().map(({ name }) => name),
        [null],
      );
    });

    it("ends an add with EvoluDisposedError when the app is disposed meanwhile", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run } = setup;
      await using app = await run.orThrow(
        createEvoluApp(Schema, instantStartConfig),
      );
      await app.current.get()?.evolu;

      const adding = app.add(
        createOwnerSecret(testCreateDeps({ seed: "added-while-disposing" })),
      );
      await app[Symbol.asyncDispose]();

      assertEqual(
        await settleWithinWorkerMessages(adding),
        err({ type: "EvoluDisposedError" }),
      );
    });

    it("fails a start on a refused device database with the refusal, rather than waiting", async () => {
      let refused = true;
      await using setup = await setupRunWithEvoluDeps({
        waitForDatabaseRelease: (name) => () =>
          refused ? err({ type: "DatabaseHeldError", name }) : ok(),
      });
      const { run } = setup;

      const reported = setup.waitForTabError();
      const starting = run(createEvoluApp(Schema, instantStartConfig));
      await reported;
      const outcome = await settleWithinWorkerMessages(starting);

      assert(outcome !== "pending", "The start waited for the database.");
      assertErr(outcome);
      assertSame(outcome.error.type, "UnknownError");
      refused = false;
    });

    it("refuses a device schema that defines Evolu's AppOwner table", () => {
      assertThrowsInstanceOf(
        () =>
          createEvoluApp(Schema, {
            ...instantStartConfig,
            device: {
              schema: {
                // @ts-expect-error The device schema can't define Evolu's AppOwner table.
                _evolu_appOwner: { id: id("AppOwner"), secret: String },
              },
            },
          }),
        Error,
      );
      // Never called: its type refuses a system column.
      void (() =>
        createEvoluApp(Schema, {
          ...instantStartConfig,
          device: {
            // @ts-expect-error Table "_settings" uses system column name "ownerId". System columns (createdAt, updatedAt, isDeleted, ownerId) are added automatically.
            schema: { _settings: { id: id("Settings"), ownerId: String } },
          },
        }));
      // SQLite folds the case of ASCII names, so it's the same table.
      assertThrowsInstanceOf(
        () =>
          createEvoluApp(Schema, {
            ...instantStartConfig,
            device: {
              schema: {
                _evolu_AppOwner: { id: id("AppOwner"), secret: String },
              },
            },
          }),
        Error,
      );
    });

    it("refuses a DeviceSecret of 32 zero bytes, instant start's public secret", () => {
      const thrown = assertThrowsInstanceOf(
        () =>
          createEvoluApp(Schema, {
            ...instantStartConfig,
            auth: {
              type: "DeviceSecret",
              secret: new Uint8Array(32) as DeviceSecret,
            },
          }),
        Error,
      );
      assertTrue(
        thrown.message.includes("Create one with createDeviceSecret."),
      );
    });

    it("refuses a cast DeviceSecret of another length", () => {
      const thrown = assertThrowsInstanceOf(
        () =>
          createEvoluApp(Schema, {
            ...instantStartConfig,
            auth: {
              type: "DeviceSecret",
              secret: new Uint8Array(16).fill(1) as unknown as DeviceSecret,
            },
          }),
        Error,
      );
      // The message leaves the bytes out, as a secret's error should.
      assertEqual(
        thrown.message,
        "A DeviceSecret has 32 bytes, not all zero, which are instant start's public secret. Create one with createDeviceSecret.",
      );
      assertEqual(thrown.cause, undefined);
    });

    it("removes an AppOwner in every tab without reloading", async () => {
      using drivers = createSqliteDriverPerName();
      const time = testCreateTime();
      let reloads = 0;
      await using setup = await setupRunWithEvoluDeps({
        createSqliteDriver: drivers.createSqliteDriver,
        deleteDatabaseFiles: drivers.deleteDatabaseFiles,
        reloadApp: () => {
          reloads++;
        },
        time,
      });
      const { run } = setup;

      await using firstTab = await run.orThrow(
        createEvoluApp(Schema, instantStartConfig),
      );
      await using secondTab = await run.orThrow(
        createEvoluApp(Schema, instantStartConfig),
      );
      const first = firstTab.current.get();
      assertNotNull(first);
      const firstEvolu = await first.evolu;
      const inserted = Promise.withResolvers<void>();
      firstEvolu.insert(
        "todo",
        { title: NonEmptyTrimmedString100.orThrow("Mine") },
        { onSuccess: inserted.resolve },
      );
      await inserted.promise;

      time.advance("1s");
      const secondId = getOrThrow(
        await firstTab.add(
          createOwnerSecret(testCreateDeps({ seed: "app-second" })),
        ),
      );
      await waitForStore(
        secondTab.appOwners,
        (appOwners) => appOwners.length === 2,
      );
      assertSame(secondTab.current.get()?.appOwner.id, first.appOwner.id);

      assertOk(await firstTab.remove(first.appOwner.id));

      assertEqual(
        firstTab.appOwners.get().map(({ id }) => id),
        [secondId],
      );
      // The tab that had it open has none open, and lists the one left.
      await waitForStore(secondTab.current, (current) => current === null);
      await waitForStore(
        secondTab.appOwners,
        (appOwners) => appOwners.length === 1,
      );
      assertEqual(drivers.selectAll("_evolu_appOwner").length, 1);
      assertSame(reloads, 0);

      // Its data on this device is gone, so restoring it opens it empty.
      assertOk(
        await firstTab.add(mnemonicToOwnerSecret(first.appOwner.mnemonic)),
      );
      const restored = await firstTab.current.get()?.evolu;
      assertNotUndefined(restored);
      assertEqual(await restored.loadQuery(todoByCreatedAtQuery), []);
    });

    it("restores an AppOwner empty after its removal, without the write of a tab that closed during the removal", async () => {
      using drivers = createSqliteDriverPerName();
      const time = testCreateTime();
      await using setup = await setupRunWithEvoluDeps({
        createSqliteDriver: drivers.createSqliteDriver,
        deleteDatabaseFiles: drivers.deleteDatabaseFiles,
        time,
      });
      const { run } = setup;

      await using firstTab = await run.orThrow(
        createEvoluApp(Schema, instantStartConfig),
      );
      const secondTab = await run.orThrow(
        createEvoluApp(Schema, instantStartConfig),
      );
      const first = firstTab.current.get();
      assertNotNull(first);
      const secondEvolu = await secondTab.current.get()?.evolu;
      assertNotUndefined(secondEvolu);

      // Another AppOwner, whose removal the test holds, so the removal of the
      // first one waits behind it.
      time.advance("1s");
      const otherId = getOrThrow(
        await firstTab.add(
          createOwnerSecret(testCreateDeps({ seed: "app-other" })),
        ),
      );
      await waitForStore(
        secondTab.appOwners,
        (appOwners) => appOwners.length === 2,
      );
      assertSame(secondTab.current.get()?.appOwner.id, first.appOwner.id);

      const releaseDeletion = drivers.holdNextDeletion();
      using _releaseDeletion = { [Symbol.dispose]: releaseDeletion };
      const deleting = drivers.waitForDeletionStart();
      const removingOther = firstTab.remove(otherId);
      await deleting;

      // The first tab removes the AppOwner the second tab has open.
      const removing = firstTab.remove(first.appOwner.id);
      await testWaitForWorkerMessage();
      // The second tab writes, and closes before the removal reaches its
      // database.
      secondEvolu.insert("todo", {
        title: NonEmptyTrimmedString100.orThrow("Written before the removal"),
      });
      await testWaitForWorkerMessage();
      await secondTab[Symbol.asyncDispose]();
      await testWaitForWorkerMessage();

      releaseDeletion();
      assertOk(await removingOther);
      assertOk(await removing);
      assertEqual(firstTab.appOwners.get(), []);

      // Its data on this device is gone, so restoring it opens it empty.
      assertOk(
        await firstTab.add(mnemonicToOwnerSecret(first.appOwner.mnemonic)),
      );
      const restored = await firstTab.current.get()?.evolu;
      assertNotUndefined(restored);
      assertEqual(await restored.loadQuery(todoByCreatedAtQuery), []);
    });

    it("restores an AppOwner empty after its removal and its ended tenant's idle end, without the write of a tab that closed during the removal", async () => {
      using drivers = createSqliteDriverPerName();
      const time = testCreateTime();
      await using setup = await setupRunWithEvoluDeps({
        createSqliteDriver: drivers.createSqliteDriver,
        deleteDatabaseFiles: drivers.deleteDatabaseFiles,
        time,
      });
      const { run } = setup;

      await using firstTab = await run.orThrow(
        createEvoluApp(Schema, instantStartConfig),
      );
      const secondTab = await run.orThrow(
        createEvoluApp(Schema, instantStartConfig),
      );
      const first = firstTab.current.get();
      assertNotNull(first);
      const secondEvolu = await secondTab.current.get()?.evolu;
      assertNotUndefined(secondEvolu);

      // Another AppOwner, whose removal the test holds, so the removal of the
      // first one waits behind it.
      time.advance("1s");
      const otherId = getOrThrow(
        await firstTab.add(
          createOwnerSecret(testCreateDeps({ seed: "app-other" })),
        ),
      );
      await waitForStore(
        secondTab.appOwners,
        (appOwners) => appOwners.length === 2,
      );
      assertSame(secondTab.current.get()?.appOwner.id, first.appOwner.id);

      const releaseDeletion = drivers.holdNextDeletion();
      using _releaseDeletion = { [Symbol.dispose]: releaseDeletion };
      const deleting = drivers.waitForDeletionStart();
      const removingOther = firstTab.remove(otherId);
      await deleting;

      // The first tab removes the AppOwner the second tab has open.
      const removing = firstTab.remove(first.appOwner.id);
      await testWaitForWorkerMessage();
      // The second tab writes, and closes before the removal reaches its
      // database.
      secondEvolu.insert("todo", {
        title: NonEmptyTrimmedString100.orThrow("Written before the removal"),
      });
      await testWaitForWorkerMessage();
      await secondTab[Symbol.asyncDispose]();
      await testWaitForWorkerMessage();

      releaseDeletion();
      assertOk(await removingOther);
      assertOk(await removing);
      assertEqual(firstTab.appOwners.get(), []);

      // The tenant the removal ended idles out, and its queue with it.
      time.advance("3s");
      await testWaitForWorkerMessage();
      await testWaitForWorkerMessage();

      // Its data on this device is gone, so restoring it opens it empty.
      assertOk(
        await firstTab.add(mnemonicToOwnerSecret(first.appOwner.mnemonic)),
      );
      const restored = await firstTab.current.get()?.evolu;
      assertNotUndefined(restored);
      assertEqual(await restored.loadQuery(todoByCreatedAtQuery), []);
    });

    it("ends the app's own deletion of a database a removal deletes as disposed", async () => {
      using drivers = createSqliteDriverPerName();
      await using setup = await setupRunWithEvoluDeps({
        createSqliteDriver: drivers.createSqliteDriver,
        deleteDatabaseFiles: drivers.deleteDatabaseFiles,
      });
      const { run } = setup;

      await using app = await run.orThrow(
        createEvoluApp(Schema, instantStartConfig),
      );
      const first = app.current.get();
      assertNotNull(first);
      const firstEvolu = await first.evolu;

      // The app's own deletion runs when the removal comes.
      const releaseDeletion = drivers.holdNextDeletion();
      using _releaseDeletion = { [Symbol.dispose]: releaseDeletion };
      const deleting = drivers.waitForDeletionStart();
      const deleted = firstEvolu.deleteDatabase();
      await deleting;
      const removing = app.remove(first.appOwner.id);
      await testWaitForWorkerMessage();
      releaseDeletion();

      // The removal disposed the instance before its files were gone.
      assertErr(await deleted, { type: "EvoluDisposedError" });
      assertOk(await removing);
      assertEqual(app.appOwners.get(), []);
      assertFalse(drivers.names().includes(firstEvolu.name));
    });

    it("ends a removal as disposed when the app is disposed at any step, without a defect, and the removal completes", async () => {
      for (const step of ["deletion", "removal"] as const) {
        using drivers = createSqliteDriverPerName();
        await using setup = await setupRunWithEvoluDeps({
          createSqliteDriver: drivers.createSqliteDriver,
          deleteDatabaseFiles: drivers.deleteDatabaseFiles,
        });
        const { run } = setup;

        const app = await run.orThrow(
          createEvoluApp(Schema, instantStartConfig),
        );
        const first = app.current.get();
        assertNotNull(first);
        await first.evolu;

        const disposing = Promise.withResolvers<void>();
        const dispose = () => {
          void app[Symbol.asyncDispose]().then(disposing.resolve);
        };
        let releaseDeletion = constVoid;
        let deleting: Promise<void> | null = null;
        if (step === "deletion") {
          releaseDeletion = drivers.holdNextDeletion();
          deleting = drivers.waitForDeletionStart();
        } else
          drivers.onNextStatement(
            (statement) => statement.includes('delete from "_evolu_appOwner"'),
            dispose,
          );
        const removing = app.remove(first.appOwner.id);
        if (step === "deletion") {
          await deleting;
          dispose();
        }
        await disposing.promise;
        releaseDeletion();

        assertErr(await removing, { type: "EvoluDisposedError" });
        assertEqual(run.deps.reportDefect.getDefects(), []);
        assertOk(await run(() => ok()));
        // The SharedWorker deletes the row once the files are gone, whatever
        // the tab does.
        await testWaitForWorkerMessage();
        await using restarted = await run.orThrow(
          createEvoluApp(Schema, {
            ...instantStartConfig,
            createFirstAppOwner: false,
          }),
        );
        assertEqual(restarted.appOwners.get(), []);
      }
    });

    it("fails a removal whose row's deletion SQLite fails, and lists the AppOwner, whose database is gone", async () => {
      using drivers = createSqliteDriverPerName();
      await using setup = await setupRunWithEvoluDeps({
        createSqliteDriver: drivers.createSqliteDriver,
        deleteDatabaseFiles: drivers.deleteDatabaseFiles,
      });
      const { run } = setup;

      await using app = await run.orThrow(
        createEvoluApp(Schema, instantStartConfig),
      );
      const first = app.current.get();
      assertNotNull(first);
      const firstEvolu = await first.evolu;
      drivers.onNextStatement(
        (statement) => statement.includes('delete from "_evolu_appOwner"'),
        () => {
          throw new Error("Disk I/O error.");
        },
      );

      const result = await app.remove(first.appOwner.id);
      assertErr(result);
      assertSame(result.error.type, "UnknownError");
      assertEqual(run.deps.reportDefect.getDefects(), []);
      assertSame(drivers.deletions(firstEvolu.name), 1);
      assertEqual(
        app.appOwners.get().map(({ id }) => id),
        [first.appOwner.id],
      );
      // It opens again, empty.
      app.open(first.appOwner.id);
      const reopened = await app.current.get()?.evolu;
      assertNotUndefined(reopened);
      assertEqual(await reopened.loadQuery(todoByCreatedAtQuery), []);
    });

    it("fails a removal whose database's deletion fails, and keeps the AppOwner and its data", async () => {
      using drivers = createSqliteDriverPerName();
      await using setup = await setupRunWithEvoluDeps({
        createSqliteDriver: drivers.createSqliteDriver,
        deleteDatabaseFiles: drivers.deleteDatabaseFiles,
      });
      const { run } = setup;

      await using app = await run.orThrow(
        createEvoluApp(Schema, instantStartConfig),
      );
      const first = app.current.get();
      assertNotNull(first);
      const firstEvolu = await first.evolu;
      const inserted = Promise.withResolvers<void>();
      firstEvolu.insert(
        "todo",
        { title: NonEmptyTrimmedString100.orThrow("Mine") },
        { onSuccess: inserted.resolve },
      );
      await inserted.promise;

      drivers.failNextDeletion();
      const result = await app.remove(first.appOwner.id);
      assertErr(result);
      assertSame(result.error.type, "UnknownError");
      assertEqual(run.deps.reportDefect.getDefects(), []);
      assertSame(drivers.deletions(firstEvolu.name), 0);
      assertEqual(
        app.appOwners.get().map(({ id }) => id),
        [first.appOwner.id],
      );
      app.open(first.appOwner.id);
      const reopened = await app.current.get()?.evolu;
      assertNotUndefined(reopened);
      assertEqual(
        (await reopened.loadQuery(todoByCreatedAtQuery)).map(
          ({ title }) => title,
        ),
        ["Mine"],
      );
    });

    it("fails a removal whose read of the AppOwner's row SQLite fails, and keeps the row and the database", async () => {
      using drivers = createSqliteDriverPerName();
      await using setup = await setupRunWithEvoluDeps({
        createSqliteDriver: drivers.createSqliteDriver,
        deleteDatabaseFiles: drivers.deleteDatabaseFiles,
      });
      const { run } = setup;

      await using app = await run.orThrow(
        createEvoluApp(Schema, instantStartConfig),
      );
      const first = app.current.get();
      assertNotNull(first);
      const firstEvolu = await first.evolu;
      const inserted = Promise.withResolvers<void>();
      firstEvolu.insert(
        "todo",
        { title: NonEmptyTrimmedString100.orThrow("Mine") },
        { onSuccess: inserted.resolve },
      );
      await inserted.promise;
      drivers.onNextStatement(
        (statement) =>
          statement.includes("select 1") &&
          statement.includes('from "_evolu_appOwner"'),
        () => {
          throw new Error("Disk I/O error.");
        },
      );

      const result = await app.remove(first.appOwner.id);
      assertErr(result);
      assertSame(result.error.type, "UnknownError");
      assertEqual(run.deps.reportDefect.getDefects(), []);
      assertLength(drivers.selectAll("_evolu_appOwner"), 1);
      assertSame(drivers.deletions(firstEvolu.name), 0);
      assertLength(drivers.selectAll("todo"), 1);
      assertEqual(
        app.appOwners.get().map(({ id }) => id),
        [first.appOwner.id],
      );
      assertSame(app.current.get()?.evolu, first.evolu);
    });

    it("fails a removal with DatabaseHeldError when a tab of another build keeps the database open, runs what it held, and deletes nothing later", async () => {
      using drivers = createSqliteDriverPerName();
      await using setup = await setupRunWithEvoluDeps({
        createSqliteDriver: drivers.createSqliteDriver,
        deleteDatabaseFiles: drivers.deleteDatabaseFiles,
      });
      const { run } = setup;

      await using app = await run.orThrow(
        createEvoluApp(Schema, instantStartConfig),
      );
      const first = app.current.get();
      assertNotNull(first);
      const firstEvolu = await first.evolu;
      const inserted = Promise.withResolvers<void>();
      firstEvolu.insert(
        "todo",
        { title: NonEmptyTrimmedString100.orThrow("Mine") },
        { onSuccess: inserted.resolve },
      );
      await inserted.promise;
      // It waits to open the database, so it gets its lock once the removal
      // closes it here, before the deleting DbWorker.
      const otherBuild = run.ok(acquireLeaderLock(firstEvolu.name));

      let result = null as Result<void, RemoveAppOwnerError> | null;
      void app.remove(first.appOwner.id).then((removal) => {
        result = removal;
      });
      await using _otherBuild = await otherBuild;
      app.rename(first.appOwner.id, NonEmptyTrimmedString100.orThrow("Kept"));
      for (let i = 0; i < 30; i++) {
        if (result) break;
        setup.dbWorkerTime.advance("1s");
        await testWaitForWorkerMessage();
      }

      assertEqual(
        result,
        err({ type: "DatabaseHeldError", name: firstEvolu.name }),
      );
      assertSame(app.current.get(), null);
      // The rename the removal held ran after it.
      await waitForStore(
        app.appOwners,
        (appOwners) => appOwners[0]?.name === "Kept",
      );
      assertEqual(
        app.appOwners.get().map(({ id }) => id),
        [first.appOwner.id],
      );
      assertLength(drivers.selectAll("_evolu_appOwner"), 1);

      await _otherBuild[Symbol.asyncDispose]();
      await testWaitForWorkerMessage();
      assertSame(drivers.deletions(firstEvolu.name), 0);
      app.open(first.appOwner.id);
      const reopened = await app.current.get()?.evolu;
      assertNotUndefined(reopened);
      assertEqual(
        (await reopened.loadQuery(todoByCreatedAtQuery)).map(
          ({ title }) => title,
        ),
        ["Mine"],
      );
    });

    it("fails a removal with DatabaseHeldError while the AppOwner's database waits for a tab of another build to close it, runs what it held, and deletes nothing", async () => {
      using drivers = createSqliteDriverPerName();
      const time = testCreateTime();
      await using setup = await setupRunWithEvoluDeps({
        createSqliteDriver: drivers.createSqliteDriver,
        deleteDatabaseFiles: drivers.deleteDatabaseFiles,
        time,
      });
      const { run } = setup;

      const created = await run.orThrow(
        createEvoluApp(Schema, instantStartConfig),
      );
      const first = created.current.get();
      assertNotNull(first);
      const firstEvolu = await first.evolu;
      const inserted = Promise.withResolvers<void>();
      firstEvolu.insert(
        "todo",
        { title: NonEmptyTrimmedString100.orThrow("Mine") },
        { onSuccess: inserted.resolve },
      );
      await inserted.promise;
      const { name } = firstEvolu;
      await created[Symbol.asyncDispose]();
      // It opens the database once the idle tenant ends its DbWorker.
      const otherBuild = run.ok(acquireLeaderLock(name));
      time.advance("3s");
      await using _otherBuild = await otherBuild;

      // The next start opens the AppOwner, whose database waits for the lock.
      await using app = await run.orThrow(
        createEvoluApp(Schema, {
          ...instantStartConfig,
          createFirstAppOwner: false,
        }),
      );
      const opening = app.current.get();
      assertSame(opening?.appOwner.id, first.appOwner.id);
      // Its DbWorker waits for the lock, so its instance is being created.
      const isWaiting = async () =>
        ((await run.deps.lockManager.query()).pending ?? []).some(
          (lock) => lock.name === `evolu-leaderlock-${name}`,
        );
      for (let i = 0; i < 30 && !(await isWaiting()); i++)
        await testWaitForWorkerMessage();
      assertTrue(await isWaiting());
      let result = null as Result<void, RemoveAppOwnerError> | null;
      void app.remove(first.appOwner.id).then((removal) => {
        result = removal;
      });
      await testWaitForWorkerMessage();
      app.rename(first.appOwner.id, NonEmptyTrimmedString100.orThrow("Kept"));
      for (let i = 0; i < 30; i++) {
        if (result) break;
        time.advance("1s");
        await testWaitForWorkerMessage();
      }

      assertEqual(result, err({ type: "DatabaseHeldError", name }));
      await waitForStore(
        app.appOwners,
        (appOwners) => appOwners[0]?.name === "Kept",
      );
      assertLength(drivers.selectAll("_evolu_appOwner"), 1);

      await _otherBuild[Symbol.asyncDispose]();
      const opened = await app.current.get()?.evolu;
      assertNotUndefined(opened);
      assertEqual(
        (await opened.loadQuery(todoByCreatedAtQuery)).map(
          ({ title }) => title,
        ),
        ["Mine"],
      );
      assertSame(drivers.deletions(name), 0);
    });

    it("fails a removal whose tab leader doesn't start the deleting DbWorker with DatabaseHeldError, runs what it held, and keeps the data from a DbWorker started later", async () => {
      using drivers = createSqliteDriverPerName();
      const time = testCreateTime();
      await using setup = await setupRunWithEvoluDeps({
        createSqliteDriver: drivers.createSqliteDriver,
        deleteDatabaseFiles: drivers.deleteDatabaseFiles,
        time,
      });
      const { run } = setup;
      // The tab leader doesn't start the deleting DbWorker, such as while it
      // shows a modal dialog.
      const sharedWorker = await run.deps.storedWorker;
      const tabOnMessage = sharedWorker.port.onMessage;
      assertNotNull(tabOnMessage);
      let startLate = null as (() => void) | null;
      sharedWorker.port.onMessage = (message) => {
        if (message.type === "DbWorkerInit" && message.mode === "Delete") {
          startLate = () => {
            run.deps.createDbWorker().postMessage(message, [message.port]);
          };
          return;
        }
        tabOnMessage(message);
      };

      await using app = await run.orThrow(
        createEvoluApp(Schema, instantStartConfig),
      );
      const first = app.current.get();
      assertNotNull(first);
      const firstEvolu = await first.evolu;
      const inserted = Promise.withResolvers<void>();
      firstEvolu.insert(
        "todo",
        { title: NonEmptyTrimmedString100.orThrow("Mine") },
        { onSuccess: inserted.resolve },
      );
      await inserted.promise;
      const { name } = firstEvolu;
      time.advance("1s");
      getOrThrow(
        await app.add(
          createOwnerSecret(testCreateDeps({ seed: "app-second" })),
        ),
      );
      const secondEvolu = await app.current.get()?.evolu;
      assertNotUndefined(secondEvolu);

      let result = null as Result<void, RemoveAppOwnerError> | null;
      void app.remove(first.appOwner.id).then((removal) => {
        result = removal;
      });
      for (let i = 0; i < 30; i++) {
        if (startLate) break;
        await testWaitForWorkerMessage();
      }
      assertNotNull(startLate);
      // A load of another database, which the removal holds.
      let loaded = null as ReadonlyArray<unknown> | null;
      void secondEvolu
        .loadQuery(todoByCreatedAtQuery, { cache: false })
        .then((rows) => {
          loaded = rows;
        });
      const isPending = () => result === null && loaded === null;
      time.advance("29s");
      await testWaitForWorkerMessage();
      assertTrue(isPending());

      time.advance("1s");
      for (let i = 0; i < 30; i++) {
        if (result && loaded) break;
        await testWaitForWorkerMessage();
      }
      assertEqual(result, err({ type: "DatabaseHeldError", name }));
      assertEqual(loaded, []);
      assertLength(drivers.selectAll("_evolu_appOwner"), 2);

      // It stopped the deletion, so a deleting DbWorker that starts later
      // deletes nothing.
      startLate();
      for (let i = 0; i < 30; i++) await testWaitForWorkerMessage();
      assertSame(drivers.deletions(name), 0);
      app.open(first.appOwner.id);
      const reopened = await app.current.get()?.evolu;
      assertNotUndefined(reopened);
      assertEqual(
        (await reopened.loadQuery(todoByCreatedAtQuery)).map(
          ({ title }) => title,
        ),
        ["Mine"],
      );
    });

    it("deletes nothing when a deleting DbWorker a tab leader change replaced gets the database lock after a restore", async () => {
      using drivers = createSqliteDriverPerName();
      const time = testCreateTime();
      await using setup = await setupRunWithEvoluDeps({
        createSqliteDriver: drivers.createSqliteDriver,
        deleteDatabaseFiles: drivers.deleteDatabaseFiles,
        time,
      });
      const { run } = setup;
      // The first tab leader starts its deleting DbWorker late.
      const sharedWorker = await run.deps.storedWorker;
      const tabOnMessage = sharedWorker.port.onMessage;
      assertNotNull(tabOnMessage);
      let startLate = null as (() => void) | null;
      sharedWorker.port.onMessage = (message) => {
        if (message.type === "DbWorkerInit" && message.mode === "Delete") {
          startLate = () => {
            run.deps.createDbWorker().postMessage(message, [message.port]);
          };
          return;
        }
        tabOnMessage(message);
      };
      using laterTab = setup.connectLaterTab();
      laterTab.port.onMessage = (message) => {
        if (message.type === "DbWorkerInit")
          run.deps.createDbWorker().postMessage(message, [message.port]);
      };

      const { appOwner, name } = await (async () => {
        await using app = await run.orThrow(
          createEvoluApp(Schema, instantStartConfig),
        );
        const first = app.current.get();
        assertNotNull(first);
        const { name } = await first.evolu;
        const removal = app.remove(first.appOwner.id);
        for (let i = 0; i < 30; i++) {
          if (startLate) break;
          await testWaitForWorkerMessage();
        }
        assertNotNull(startLate);
        laterTab.port.postMessage({
          type: "AnnounceTabLeader",
          consoleLevel: "debug",
        });
        assertOk(await removal);
        assertSame(drivers.deletions(name), 1);

        assertOk(await app.add(mnemonicToOwnerSecret(first.appOwner.mnemonic)));
        const restored = await app.current.get()?.evolu;
        assertSame(restored?.name, name);
        const inserted = Promise.withResolvers<void>();
        restored.insert(
          "todo",
          { title: NonEmptyTrimmedString100.orThrow("Restored") },
          { onSuccess: inserted.resolve },
        );
        await inserted.promise;
        return { appOwner: first.appOwner, name };
      })();
      const isDatabaseLockUsed = async () => {
        const { held = [], pending = [] } = await run.deps.lockManager.query();
        return [...held, ...pending].some(
          (lock) => lock.name === `evolu-leaderlock-${name}`,
        );
      };
      // The restored database's DbWorker releases its lock once its idle
      // tenant ends.
      for (let i = 0; i < 30 && (await isDatabaseLockUsed()); i++) {
        time.advance("1s");
        await testWaitForWorkerMessage();
      }
      assertFalse(await isDatabaseLockUsed());

      assertNotNull(startLate);
      startLate();
      for (let i = 0; i < 30 && !(await isDatabaseLockUsed()); i++)
        await testWaitForWorkerMessage();
      for (let i = 0; i < 30 && (await isDatabaseLockUsed()); i++)
        await testWaitForWorkerMessage();
      assertFalse(await isDatabaseLockUsed());

      assertSame(drivers.deletions(name), 1);
      await using restarted = await run.orThrow(
        createEvoluApp(Schema, {
          ...instantStartConfig,
          createFirstAppOwner: false,
        }),
      );
      const reopened = restarted.current.get();
      assertSame(reopened?.appOwner.id, appOwner.id);
      assertEqual(
        (await (await reopened.evolu).loadQuery(todoByCreatedAtQuery)).map(
          ({ title }) => title,
        ),
        ["Restored"],
      );
    });

    it("holds an add during a removal, then opens the AppOwner empty under the same name", async () => {
      using drivers = createSqliteDriverPerName();
      await using setup = await setupRunWithEvoluDeps({
        createSqliteDriver: drivers.createSqliteDriver,
        deleteDatabaseFiles: drivers.deleteDatabaseFiles,
      });
      const { run } = setup;

      await using app = await run.orThrow(
        createEvoluApp(Schema, instantStartConfig),
      );
      const first = app.current.get();
      assertNotNull(first);
      const firstEvolu = await first.evolu;
      const inserted = Promise.withResolvers<void>();
      firstEvolu.insert(
        "todo",
        { title: NonEmptyTrimmedString100.orThrow("Mine") },
        { onSuccess: inserted.resolve },
      );
      await inserted.promise;

      const releaseDeletion = drivers.holdNextDeletion();
      using _releaseDeletion = { [Symbol.dispose]: releaseDeletion };
      const deleting = drivers.waitForDeletionStart();
      const removing = app.remove(first.appOwner.id);
      await deleting;
      let added = false;
      const adding = app
        .add(mnemonicToOwnerSecret(first.appOwner.mnemonic))
        .then((result) => {
          added = true;
          return result;
        });
      await testWaitForWorkerMessage();
      assertFalse(added);

      releaseDeletion();
      assertOk(await removing);
      assertOk(await adding);
      const current = app.current.get();
      assertSame(current?.appOwner.id, first.appOwner.id);
      const evolu = await current?.evolu;
      assertNotUndefined(evolu);
      assertSame(evolu.name, firstEvolu.name);
      assertEqual(await evolu.loadQuery(todoByCreatedAtQuery), []);
    });

    it("creates no database again in a tab whose rows predate two removals in a row", async () => {
      using drivers = createSqliteDriverPerName();
      const time = testCreateTime();
      await using setup = await setupRunWithEvoluDeps({
        createSqliteDriver: drivers.createSqliteDriver,
        deleteDatabaseFiles: drivers.deleteDatabaseFiles,
        time,
      });
      const { run } = setup;

      await using firstTab = await run.orThrow(
        createEvoluApp(Schema, instantStartConfig),
      );
      const first = firstTab.current.get();
      assertNotNull(first);
      const firstEvolu = await first.evolu;
      time.advance("1s");
      const secondId = getOrThrow(
        await firstTab.add(
          createOwnerSecret(testCreateDeps({ seed: "app-second" })),
        ),
      );
      const secondEvolu = await firstTab.current.get()?.evolu;
      assertNotUndefined(secondEvolu);
      // It opens the AppOwner opened most recently, the second one.
      await using secondTab = await run.orThrow(
        createEvoluApp(Schema, instantStartConfig),
      );
      assertSame(secondTab.current.get()?.appOwner.id, secondId);
      await secondTab.current.get()?.evolu;

      // Its rows still list both when the second removal starts.
      assertOk(await firstTab.remove(secondId));
      assertOk(await firstTab.remove(first.appOwner.id));
      await waitForStore(
        secondTab.appOwners,
        (appOwners) => appOwners.length === 0,
      );
      await testWaitForWorkerMessage();

      assertSame(secondTab.current.get(), null);
      assertFalse(drivers.names().includes(firstEvolu.name));
      assertFalse(drivers.names().includes(secondEvolu.name));
    });

    it("opens an AppOwner again in a tab after another tab removed and restored it", async () => {
      using drivers = createSqliteDriverPerName();
      await using setup = await setupRunWithEvoluDeps({
        createSqliteDriver: drivers.createSqliteDriver,
        deleteDatabaseFiles: drivers.deleteDatabaseFiles,
      });
      const { run } = setup;

      await using firstTab = await run.orThrow(
        createEvoluApp(Schema, instantStartConfig),
      );
      await using secondTab = await run.orThrow(
        createEvoluApp(Schema, instantStartConfig),
      );
      const first = firstTab.current.get();
      assertNotNull(first);
      const firstEvolu = await first.evolu;
      await secondTab.current.get()?.evolu;

      assertOk(await firstTab.remove(first.appOwner.id));
      await waitForStore(secondTab.current, (current) => current === null);
      assertOk(
        await firstTab.add(mnemonicToOwnerSecret(first.appOwner.mnemonic)),
      );

      await waitForStore(secondTab.appOwners, (appOwners) =>
        appOwners.some(({ id }) => id === first.appOwner.id),
      );
      assertSame(secondTab.current.get(), null);
      secondTab.open(first.appOwner.id);
      const reopened = await secondTab.current.get()?.evolu;
      assertNotUndefined(reopened);
      assertSame(reopened.name, firstEvolu.name);
      assertEqual(await reopened.loadQuery(todoByCreatedAtQuery), []);
    });

    /**
     * A Run whose Evolu instances pass each message from their worker to
     * `hook`, which delivers it, unless the instance disposed its port
     * meanwhile, as a closed port receives nothing.
     */
    const setupMessageHook = (
      run: Awaited<ReturnType<typeof setupRunWithEvoluDeps>>["run"],
      hook: (message: { readonly type?: string }, deliver: () => void) => void,
    ) =>
      run.create({
        ...run.deps,
        createMessageChannel: <Input, Output = never>() => {
          const channel = run.deps.createMessageChannel<Input, Output>();
          let disposed = false;
          const port1 = new Proxy(channel.port1, {
            set: (target, property, value: unknown) => {
              if (property !== "onMessage" || typeof value !== "function")
                return Reflect.set(target, property, value);
              const onMessage = value as (message: Output) => void;
              target.onMessage = (message) => {
                hook(message as { readonly type?: string }, () => {
                  if (!disposed) onMessage(message);
                });
              };
              return true;
            },
          });
          return {
            ...channel,
            port1,
            [Symbol.dispose]: () => {
              disposed = true;
              channel[Symbol.dispose]();
            },
          };
        },
      });

    /**
     * A Run whose Evolu instances get no refresh while the gate is closed, as
     * in a tab that is busy when another tab removes an AppOwner. Opening the
     * gate delivers the held refreshes.
     */
    const setupRefreshGate = (
      run: Awaited<ReturnType<typeof setupRunWithEvoluDeps>>["run"],
    ) => {
      let closed = false;
      const held: Array<() => void> = [];
      const gatedRun = setupMessageHook(run, (message, deliver) => {
        if (closed && message.type === "RefreshQueries") held.push(deliver);
        else deliver();
      });
      return {
        run: gatedRun,
        close: () => {
          closed = true;
        },
        open: () => {
          closed = false;
          for (const deliver of held.splice(0)) deliver();
        },
        [Symbol.asyncDispose]: () => gatedRun[Symbol.asyncDispose](),
      };
    };

    it("marks an instance its removal disposed where the browser keeps nothing as one whose database was deleted", async () => {
      await using setup = await setupRunWithEvoluDeps({
        devicePersistence: "NotPersisted",
      });
      const { run } = setup;
      await using app = await run.orThrow(
        createEvoluApp(Schema, instantStartConfig),
      );
      const first = app.current.get();
      assertNotNull(first);
      const evolu = await first.evolu;

      assertOk(await app.remove(first.appOwner.id));

      assertTrue(isDatabaseDeleted(evolu));
    });

    it("marks an instance its removal disposed as one whose database was deleted, also when the rows come before its message", async () => {
      using drivers = createSqliteDriverPerName();
      await using setup = await setupRunWithEvoluDeps({
        createSqliteDriver: drivers.createSqliteDriver,
        deleteDatabaseFiles: drivers.deleteDatabaseFiles,
      });
      // The instance's port is slower than the device database's, so the rows
      // without the AppOwner come first and dispose the instance, whose
      // closed port then drops the message.
      await using hookedRun = setupMessageHook(
        setup.run,
        (message, deliver) => {
          if (message.type !== "OnDatabaseDeleted") deliver();
        },
      );
      await using app = await hookedRun.orThrow(
        createEvoluApp(Schema, instantStartConfig),
      );
      const first = app.current.get();
      assertNotNull(first);
      const evolu = await first.evolu;

      assertOk(await app.remove(first.appOwner.id));

      assertSame(drivers.deletions(evolu.name), 1);
      assertTrue(isDatabaseDeleted(evolu));
    });

    it("leaves the instances the app's disposal ends unmarked", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run } = setup;
      const app = await run.orThrow(createEvoluApp(Schema, instantStartConfig));
      const evolu = await app.current.get()?.evolu;
      assertNotUndefined(evolu);

      await app[Symbol.asyncDispose]();

      assertFalse(isDatabaseDeleted(evolu));
    });

    it("creates no database again for a tab that opens an AppOwner while another tab removes it", async () => {
      using drivers = createSqliteDriverPerName();
      const time = testCreateTime();
      await using setup = await setupRunWithEvoluDeps({
        createSqliteDriver: drivers.createSqliteDriver,
        deleteDatabaseFiles: drivers.deleteDatabaseFiles,
        time,
      });
      const { run } = setup;

      await using firstTab = await run.orThrow(
        createEvoluApp(Schema, instantStartConfig),
      );
      const first = firstTab.current.get();
      assertNotNull(first);
      const firstEvolu = await first.evolu;
      time.advance("1s");
      const secondId = getOrThrow(
        await firstTab.add(
          createOwnerSecret(testCreateDeps({ seed: "app-second" })),
        ),
      );
      // It opens the AppOwner opened most recently, so never the first one.
      await using secondTab = await run.orThrow(
        createEvoluApp(Schema, instantStartConfig),
      );
      assertSame(secondTab.current.get()?.appOwner.id, secondId);
      await secondTab.current.get()?.evolu;

      const releaseDeletion = drivers.holdNextDeletion();
      // Released on teardown too, so a failed assertion doesn't hang it.
      using _releaseDeletion = { [Symbol.dispose]: releaseDeletion };
      const deleting = drivers.waitForDeletionStart();
      const removing = firstTab.remove(first.appOwner.id);
      await deleting;
      // Its rows list the AppOwner until the removal ends.
      secondTab.open(first.appOwner.id);
      assertSame(secondTab.current.get()?.appOwner.id, first.appOwner.id);
      // Until the SharedWorker holds what the open sends.
      for (let i = 0; i < 5; i++) await testWaitForWorkerMessage();
      releaseDeletion();
      assertOk(await removing);

      await waitForStore(secondTab.current, (current) => current === null);
      await waitForStore(
        secondTab.appOwners,
        (appOwners) => appOwners.length === 1,
      );
      assertSame(drivers.deletions(firstEvolu.name), 1);
      assertFalse(drivers.names().includes(firstEvolu.name));
    });

    it("resolves an open the AppOwner's removal superseded with an instance whose database is deleted", async () => {
      using drivers = createSqliteDriverPerName();
      const time = testCreateTime();
      await using setup = await setupRunWithEvoluDeps({
        createSqliteDriver: drivers.createSqliteDriver,
        deleteDatabaseFiles: drivers.deleteDatabaseFiles,
        time,
      });
      const { run } = setup;
      await using firstTab = await run.orThrow(
        createEvoluApp(Schema, instantStartConfig),
      );
      const first = firstTab.current.get();
      assertNotNull(first);
      await first.evolu;
      time.advance("1s");
      getOrThrow(
        await firstTab.add(
          createOwnerSecret(testCreateDeps({ seed: "app-second" })),
        ),
      );

      // Holds the opens of its AppOwner instances, which ask for it first.
      let held: Promise<DevicePersistence> | null = null;
      await using secondRun = run.create({
        ...run.deps,
        getDevicePersistence: () => held ?? Promise.resolve("Unknown"),
      });
      // It opens the AppOwner opened most recently, so never the first one.
      await using secondTab = await secondRun.orThrow(
        createEvoluApp(Schema, instantStartConfig),
      );
      await secondTab.current.get()?.evolu;

      const hold = Promise.withResolvers<DevicePersistence>();
      held = hold.promise;
      secondTab.open(first.appOwner.id);
      const opening = secondTab.current.get();
      assertSame(opening?.appOwner.id, first.appOwner.id);
      assertOk(await secondTab.remove(first.appOwner.id));
      assertSame(secondTab.current.get(), null);
      held = null;
      hold.resolve("Unknown");

      const evolu = await settleWithinWorkerMessages(opening.evolu);
      assert(evolu !== "pending", "The superseded open never settled.");
      assertTrue(isDatabaseDeleted(evolu));
      assertSame(evolu.appOwner.id, first.appOwner.id);
    });

    it("leaves a tab with no AppOwner open once another tab removes its own, before the rows that no longer list it arrive", async () => {
      using drivers = createSqliteDriverPerName();
      const time = testCreateTime();
      await using setup = await setupRunWithEvoluDeps({
        createSqliteDriver: drivers.createSqliteDriver,
        deleteDatabaseFiles: drivers.deleteDatabaseFiles,
        time,
      });
      const { run } = setup;

      await using firstTab = await run.orThrow(
        createEvoluApp(Schema, instantStartConfig),
      );
      const first = firstTab.current.get();
      assertNotNull(first);
      await first.evolu;
      time.advance("1s");
      const secondId = getOrThrow(
        await firstTab.add(
          createOwnerSecret(testCreateDeps({ seed: "app-second" })),
        ),
      );

      await using gate = setupRefreshGate(run);
      await using secondTab = await gate.run.orThrow(
        createEvoluApp(Schema, instantStartConfig),
      );
      secondTab.open(first.appOwner.id);
      assertSame(secondTab.current.get()?.appOwner.id, first.appOwner.id);
      await secondTab.current.get()?.evolu;

      // The rows arrive late, as when SQLite fails to read them.
      gate.close();
      assertOk(await firstTab.remove(first.appOwner.id));
      await testWaitForWorkerMessage();

      assertSame(secondTab.current.get(), null);
      gate.open();
      await waitForStore(
        secondTab.appOwners,
        (appOwners) => appOwners.length === 1,
      );
      assertEqual(
        secondTab.appOwners.get().map(({ id }) => id),
        [secondId],
      );
    });

    it("creates no database for an AppOwner a tab opens after another tab removed it, from rows that predate the removal", async () => {
      using drivers = createSqliteDriverPerName();
      const time = testCreateTime();
      await using setup = await setupRunWithEvoluDeps({
        createSqliteDriver: drivers.createSqliteDriver,
        deleteDatabaseFiles: drivers.deleteDatabaseFiles,
        time,
      });
      const { run } = setup;

      await using firstTab = await run.orThrow(
        createEvoluApp(Schema, instantStartConfig),
      );
      const first = firstTab.current.get();
      assertNotNull(first);
      const firstEvolu = await first.evolu;
      time.advance("1s");
      assertOk(
        await firstTab.add(
          createOwnerSecret(testCreateDeps({ seed: "app-second" })),
        ),
      );
      await using gate = setupRefreshGate(run);
      await using secondTab = await gate.run.orThrow(
        createEvoluApp(Schema, instantStartConfig),
      );
      await secondTab.current.get()?.evolu;

      // Its rows still list the AppOwner after the removal ended.
      gate.close();
      assertOk(await firstTab.remove(first.appOwner.id));
      secondTab.open(first.appOwner.id);
      assertSame(secondTab.current.get()?.appOwner.id, first.appOwner.id);
      await waitForStore(secondTab.current, (current) => current === null);

      assertFalse(drivers.names().includes(firstEvolu.name));
      gate.open();
    });

    it("keeps a tab on the instance of an AppOwner it added again after its removal when the removal's OnDatabaseDeleted arrives late", async () => {
      using drivers = createSqliteDriverPerName();
      await using setup = await setupRunWithEvoluDeps({
        createSqliteDriver: drivers.createSqliteDriver,
        deleteDatabaseFiles: drivers.deleteDatabaseFiles,
      });
      const held: Array<() => void> = [];
      await using hookedRun = setupMessageHook(
        setup.run,
        (message, deliver) => {
          if (message.type === "OnDatabaseDeleted") held.push(deliver);
          else deliver();
        },
      );

      await using app = await hookedRun.orThrow(
        createEvoluApp(Schema, instantStartConfig),
      );
      const first = app.current.get();
      assertNotNull(first);
      await first.evolu;

      assertOk(await app.remove(first.appOwner.id));
      assertOk(await app.add(mnemonicToOwnerSecret(first.appOwner.mnemonic)));
      const added = app.current.get();
      assertNotNull(added);
      assertFalse(added.evolu === first.evolu);
      const addedEvolu = await added.evolu;
      // The removal disposed the old instance, whose port then gets nothing.
      for (const deliver of held.splice(0)) deliver();
      await testWaitForWorkerMessage();

      assertSame(app.current.get(), added);
      assertEqual(await addedEvolu.loadQuery(todoByCreatedAtQuery), []);
    });

    it("keeps another tab on the instance of an AppOwner it added again after a removal when the removal's OnDatabaseDeleted arrives late", async () => {
      using drivers = createSqliteDriverPerName();
      await using setup = await setupRunWithEvoluDeps({
        createSqliteDriver: drivers.createSqliteDriver,
        deleteDatabaseFiles: drivers.deleteDatabaseFiles,
      });
      const { run } = setup;
      await using firstTab = await run.orThrow(
        createEvoluApp(Schema, instantStartConfig),
      );
      const first = firstTab.current.get();
      assertNotNull(first);
      await first.evolu;
      const held: Array<() => void> = [];
      await using hookedRun = setupMessageHook(run, (message, deliver) => {
        if (message.type === "OnDatabaseDeleted") held.push(deliver);
        else deliver();
      });
      await using secondTab = await hookedRun.orThrow(
        createEvoluApp(Schema, instantStartConfig),
      );
      const opened = secondTab.current.get();
      assertNotNull(opened);
      await opened.evolu;

      assertOk(await firstTab.remove(first.appOwner.id));
      await waitForStore(
        secondTab.appOwners,
        (appOwners) => appOwners.length === 0,
      );
      assertOk(
        await secondTab.add(mnemonicToOwnerSecret(first.appOwner.mnemonic)),
      );
      const added = secondTab.current.get();
      assertNotNull(added);
      assertFalse(added.evolu === opened.evolu);
      const addedEvolu = await added.evolu;
      for (const deliver of held.splice(0)) deliver();
      await testWaitForWorkerMessage();

      assertSame(secondTab.current.get(), added);
      assertEqual(await addedEvolu.loadQuery(todoByCreatedAtQuery), []);
    });

    it("keeps current, without telling its listeners, when the app opens the AppOwner it has open", async () => {
      using drivers = createSqliteDriverPerName();
      await using setup = await setupRunWithEvoluDeps({
        createSqliteDriver: drivers.createSqliteDriver,
      });
      const { run } = setup;
      await using app = await run.orThrow(
        createEvoluApp(Schema, instantStartConfig),
      );
      const opened = app.current.get();
      assertNotNull(opened);
      await opened.evolu;
      let notified = 0;
      using _subscription = {
        [Symbol.dispose]: app.current.subscribe(() => {
          notified++;
        }),
      };

      app.open(opened.appOwner.id);

      assertSame(app.current.get(), opened);
      assertSame(notified, 0);
    });

    it("ignores a deletion that reaches an instance its disposal took over, so current keeps it", async () => {
      using drivers = createSqliteDriverPerName();
      await using setup = await setupRunWithEvoluDeps({
        createSqliteDriver: drivers.createSqliteDriver,
        deleteDatabaseFiles: drivers.deleteDatabaseFiles,
      });
      const { run } = setup;
      // The app's next lock request waits until its Run aborts it, which
      // calls this, as an instance waiting for its lock is aborted when the
      // disposal ends the opens.
      let onNextLockAborted: (() => void) | null = null;
      const lockRequested = Promise.withResolvers<void>();
      const lockManager: typeof run.deps.lockManager = {
        query: () => run.deps.lockManager.query(),
        request: ((
          ...args: Parameters<typeof run.deps.lockManager.request>
        ) => {
          const onAborted = onNextLockAborted;
          if (!onAborted) return run.deps.lockManager.request(...args);
          onNextLockAborted = null;
          lockRequested.resolve();
          const { signal } = args[1];
          return new Promise((_resolve, reject) => {
            signal?.addEventListener("abort", () => {
              onAborted();
              // oxlint-disable-next-line typescript/prefer-promise-reject-errors -- A lock request rejects with its signal's reason.
              reject(signal.reason);
            });
          });
        }) as typeof run.deps.lockManager.request,
      };
      let holding = false;
      const held: Array<() => void> = [];
      await using appRun = setupMessageHook(
        run.create({ ...run.deps, lockManager }),
        (message, deliver) => {
          if (holding && message.type === "OnDatabaseDeleted")
            held.push(deliver);
          else deliver();
        },
      );

      const app = await appRun.orThrow(
        createEvoluApp(Schema, instantStartConfig),
      );
      const first = app.current.get();
      assertNotNull(first);
      const firstEvolu = await first.evolu;
      // An AppOwner without an instance, because an open wins over the add.
      const adding = app.add(
        createOwnerSecret(testCreateDeps({ seed: "app-second" })),
      );
      app.open(first.appOwner.id);
      const secondId = getOrThrow(await adding);

      // The first AppOwner's database is deleted, and its instance learns of
      // it only during the disposal.
      holding = true;
      void firstEvolu.deleteDatabase();
      while (held.length === 0) await testWaitForWorkerMessage();
      onNextLockAborted = () => {
        for (const deliver of held.splice(0)) deliver();
      };
      app.open(secondId);
      await lockRequested.promise;
      app.open(first.appOwner.id);
      const opened = app.current.get();
      assertSame(opened?.evolu, first.evolu);

      await app[Symbol.asyncDispose]();

      assertEqual(held, []);
      assertSame(app.current.get(), opened);
      assertEqual(run.deps.reportDefect.getDefects(), []);
    });

    it("disposes an instance a tab is opening when the rows stop listing its AppOwner", async () => {
      using drivers = createSqliteDriverPerName();
      const time = testCreateTime();
      await using setup = await setupRunWithEvoluDeps({
        createSqliteDriver: drivers.createSqliteDriver,
        deleteDatabaseFiles: drivers.deleteDatabaseFiles,
        time,
      });
      const { run } = setup;
      // An instance holds a lock named by its ID until it is disposed, while
      // the tenants and DbWorkers hold locks named after their databases.
      const locksOfInstances = async () =>
        (await run.deps.lockManager.query()).held
          ?.map(({ name }) => name)
          .filter((name) => !name?.startsWith("evolu-leaderlock-AppName-"))
          .toSorted() ?? [];
      await using firstTab = await run.orThrow(
        createEvoluApp(Schema, instantStartConfig),
      );
      const first = firstTab.current.get();
      assertNotNull(first);
      await first.evolu;
      time.advance("1s");
      assertOk(
        await firstTab.add(
          createOwnerSecret(testCreateDeps({ seed: "app-second" })),
        ),
      );
      // The deletion would end the instance itself, and rows arrive only
      // when the test delivers them, so no later rows end it either.
      let holdRows = false;
      const heldRows: Array<() => void> = [];
      await using hookedRun = setupMessageHook(run, (message, deliver) => {
        if (message.type === "OnDatabaseDeleted") return;
        if (holdRows && message.type === "OnPatchesByQuery")
          heldRows.push(deliver);
        else deliver();
      });
      // It opens the AppOwner opened most recently, so never the first one.
      await using secondTab = await hookedRun.orThrow(
        createEvoluApp(Schema, instantStartConfig),
      );
      await secondTab.current.get()?.evolu;
      const locksBefore = await locksOfInstances();

      holdRows = true;
      assertOk(await firstTab.remove(first.appOwner.id));
      // Until the rows that no longer list the AppOwner are held too.
      for (let quiet = 0; quiet < 5; quiet++) {
        const count = heldRows.length;
        await testWaitForWorkerMessage();
        if (heldRows.length !== count || count === 0) quiet = 0;
      }
      secondTab.open(first.appOwner.id);
      assertSame(secondTab.current.get()?.appOwner.id, first.appOwner.id);
      // The rows held before the open; later ones stay held.
      for (const deliver of heldRows.splice(0)) deliver();
      for (let i = 0; i < 5; i++) await testWaitForWorkerMessage();

      assertSame(secondTab.current.get(), null);
      const locksAfter = await locksOfInstances();
      assertEqual(
        locksAfter.filter((name) => !locksBefore.includes(name)),
        [],
      );
    });

    it("completes a removal and reports a failure of an app's listener of the AppOwners or of the instance's disposal", async () => {
      for (const failing of ["listener", "disposal"] as const) {
        using drivers = createSqliteDriverPerName();
        await using setup = await setupRunWithEvoluDeps({
          createSqliteDriver: drivers.createSqliteDriver,
          deleteDatabaseFiles: drivers.deleteDatabaseFiles,
        });
        const { run } = setup;
        await using app = await run.orThrow(
          createEvoluApp(Schema, instantStartConfig),
        );
        const first = app.current.get();
        assertNotNull(first);
        const firstEvolu = await first.evolu;
        const defect = new Error("Failed.");
        if (failing === "listener")
          app.appOwners.subscribe(() => {
            throw defect;
          });
        else {
          const dispose = (firstEvolu as typeof firstEvolu & AsyncDisposable)[
            Symbol.asyncDispose
          ];
          Object.assign(firstEvolu, {
            [Symbol.asyncDispose]: async () => {
              await dispose();
              throw defect;
            },
          });
        }

        assertOk(await app.remove(first.appOwner.id));
        await testWaitForWorkerMessage();

        assertTrue(run.deps.reportDefect.getDefects().includes(defect));
        assertEqual(app.appOwners.get(), []);
        assertSame(app.current.get(), null);
        assertThrowsInstanceOf(
          () => firstEvolu.loadQuery(todoByCreatedAtQuery),
          Error,
        );
      }
    });

    it("deletes no database of the same name when it removes an AppOwner it doesn't list", async () => {
      using drivers = createSqliteDriverPerName();
      await using setup = await setupRunWithEvoluDeps({
        createSqliteDriver: drivers.createSqliteDriver,
        deleteDatabaseFiles: drivers.deleteDatabaseFiles,
      });
      const { run } = setup;
      await using app = await run.orThrow(
        createEvoluApp(Schema, instantStartConfig),
      );
      await app.current.get()?.evolu;
      // An instance of the same app and owner that the app created itself.
      const owner = createAppOwner(
        createOwnerSecret(testCreateDeps({ seed: "app-standalone" })),
      );
      await using standalone = await run.ok(
        createEvolu(Schema, {
          appName: testAppName,
          appOwner: owner,
          transports: [],
        }),
      );
      const inserted = Promise.withResolvers<void>();
      standalone.insert(
        "todo",
        { title: NonEmptyTrimmedString100.orThrow("Unsynced") },
        { onSuccess: inserted.resolve },
      );
      await inserted.promise;

      assertOk(await app.remove(owner.id));

      assertSame(drivers.deletions(standalone.name), 0);
      assertLength(await standalone.loadQuery(todoByCreatedAtQuery), 1);
    });

    it("opens a new instance for an AppOwner a tab adds again after another tab removed it, before the tab learns of the removal", async () => {
      using drivers = createSqliteDriverPerName();
      const time = testCreateTime();
      await using setup = await setupRunWithEvoluDeps({
        createSqliteDriver: drivers.createSqliteDriver,
        deleteDatabaseFiles: drivers.deleteDatabaseFiles,
        time,
      });
      const { run } = setup;
      await using firstTab = await run.orThrow(
        createEvoluApp(Schema, instantStartConfig),
      );
      const first = firstTab.current.get();
      assertNotNull(first);
      await first.evolu;
      let hold = false;
      const held: Array<() => void> = [];
      await using hookedRun = setupMessageHook(run, (message, deliver) => {
        if (
          hold &&
          (message.type === "RefreshQueries" ||
            message.type === "OnDatabaseDeleted")
        )
          held.push(deliver);
        else deliver();
      });
      await using secondTab = await hookedRun.orThrow(
        createEvoluApp(Schema, instantStartConfig),
      );
      const opened = secondTab.current.get();
      assertNotNull(opened);
      await opened.evolu;

      // Both the refresh of its rows and the instance's deletion come late.
      hold = true;
      assertOk(await firstTab.remove(first.appOwner.id));
      assertSame(secondTab.appOwners.get().length, 1);
      time.advance("1s");
      assertOk(
        await secondTab.add(mnemonicToOwnerSecret(first.appOwner.mnemonic)),
      );
      const added = secondTab.current.get();
      assertNotNull(added);
      assertFalse(added.evolu === opened.evolu);
      const addedEvolu = await added.evolu;
      hold = false;
      for (const deliver of held.splice(0)) deliver();
      await testWaitForWorkerMessage();

      assertSame(secondTab.current.get(), added);
      assertEqual(await addedEvolu.loadQuery(todoByCreatedAtQuery), []);
    });

    it("waits in its disposal for the disposal of the instance an add replaced, as of a row another tab removed", async () => {
      using drivers = createSqliteDriverPerName();
      const time = testCreateTime();
      await using setup = await setupRunWithEvoluDeps({
        createSqliteDriver: drivers.createSqliteDriver,
        deleteDatabaseFiles: drivers.deleteDatabaseFiles,
        time,
      });
      const { run } = setup;
      await using firstTab = await run.orThrow(
        createEvoluApp(Schema, instantStartConfig),
      );
      const first = firstTab.current.get();
      assertNotNull(first);
      await first.evolu;
      let hold = false;
      const held: Array<() => void> = [];
      await using hookedRun = setupMessageHook(run, (message, deliver) => {
        if (
          hold &&
          (message.type === "RefreshQueries" ||
            message.type === "OnDatabaseDeleted")
        )
          held.push(deliver);
        else deliver();
      });
      await using secondTab = await hookedRun.orThrow(
        createEvoluApp(Schema, instantStartConfig),
      );
      const opened = secondTab.current.get();
      assertNotNull(opened);
      const openedEvolu = await opened.evolu;
      // Its disposal waits until released, as a slow worker's would.
      const disposing = Promise.withResolvers<void>();
      const released = Promise.withResolvers<void>();
      let isDisposed = false;
      const dispose = (openedEvolu as unknown as AsyncDisposable)[
        Symbol.asyncDispose
      ].bind(openedEvolu);
      Object.assign(openedEvolu, {
        [Symbol.asyncDispose]: async () => {
          disposing.resolve();
          await released.promise;
          await dispose();
          isDisposed = true;
        },
      });

      // The tab learns of the removal only after the add, whose row is new,
      // so the open replaces the removed row's instance.
      hold = true;
      assertOk(await firstTab.remove(first.appOwner.id));
      time.advance("1s");
      assertOk(
        await secondTab.add(mnemonicToOwnerSecret(first.appOwner.mnemonic)),
      );
      await disposing.promise;
      hold = false;
      for (const deliver of held.splice(0)) deliver();
      const appDisposal = Promise.resolve(secondTab[Symbol.asyncDispose]());
      try {
        assertSame(await settleWithinWorkerMessages(appDisposal), "pending");
      } finally {
        released.resolve();
      }
      await appDisposal;
      assertTrue(isDisposed);
    });

    it("asks for persistent storage once, at the first add, not for the first AppOwner or an open", async () => {
      using drivers = createSqliteDriverPerName();
      let requests = 0;
      await using setup = await setupRunWithEvoluDeps({
        createSqliteDriver: drivers.createSqliteDriver,
        requestPersistentStorage: () => {
          requests++;
        },
      });
      const { run } = setup;

      await using app = await run.orThrow(
        createEvoluApp(Schema, instantStartConfig),
      );
      const first = app.current.get();
      assertNotNull(first);
      await first.evolu;
      app.open(first.appOwner.id);
      await testWaitForWorkerMessage();
      assertSame(requests, 0);

      assertOk(
        await app.add(
          createOwnerSecret(testCreateDeps({ seed: "app-second" })),
        ),
      );
      assertSame(requests, 1);
      assertOk(
        await app.add(createOwnerSecret(testCreateDeps({ seed: "app-third" }))),
      );
      assertSame(requests, 1);
    });

    it("opens at the next start the AppOwner opened last, also when a listener of current opens others during an open", async () => {
      // What a listener opens once the outer open selects the first AppOwner.
      for (const listenerOpens of [["second"], ["second", "first"]] as const) {
        using drivers = createSqliteDriverPerName();
        await using setup = await setupRunWithEvoluDeps({
          createSqliteDriver: drivers.createSqliteDriver,
        });
        const { run } = setup;

        const lastId = await (async () => {
          await using app = await run.orThrow(
            createEvoluApp(Schema, instantStartConfig),
          );
          const first = app.current.get();
          assertNotNull(first);
          await first.evolu;
          const idsByName = {
            first: first.appOwner.id,
            second: getOrThrow(
              await app.add(
                createOwnerSecret(testCreateDeps({ seed: "app-second" })),
              ),
            ),
          };
          let redirected = false;
          const unsubscribe = app.current.subscribe(() => {
            if (
              redirected ||
              app.current.get()?.appOwner.id !== first.appOwner.id
            )
              return;
            redirected = true;
            for (const name of listenerOpens) app.open(idsByName[name]);
          });
          app.open(first.appOwner.id);
          unsubscribe();
          const lastId = idsByName[listenerOpens.at(-1)!];
          assertSame(app.current.get()?.appOwner.id, lastId);
          // The opens' writes are stored in one batch, so once the first
          // AppOwner has an open time, all are stored.
          while (
            (
              drivers.selectAll("_evolu_appOwner") as ReadonlyArray<{
                readonly id: OwnerId;
                readonly lastOpenedAt: string | null;
              }>
            ).find(({ id }) => id === first.appOwner.id)?.lastOpenedAt == null
          )
            await testWaitForWorkerMessage();
          return lastId;
        })();

        await using restarted = await run.orThrow(
          createEvoluApp(Schema, instantStartConfig),
        );
        assertSame(restarted.current.get()?.appOwner.id, lastId);
      }
    });

    it("opens the AppOwner opened last at the next start, also after the clock went back", async () => {
      using drivers = createSqliteDriverPerName();
      const time = testCreateTime();
      await using setup = await setupRunWithEvoluDeps({
        createSqliteDriver: drivers.createSqliteDriver,
        time,
      });
      const { run } = setup;
      const appOwnerRows = () =>
        drivers.selectAll("_evolu_appOwner") as ReadonlyArray<{
          readonly id: OwnerId;
          readonly lastOpenedAt: string | null;
        }>;
      const firstId = await (async () => {
        await using app = await run.orThrow(
          createEvoluApp(Schema, instantStartConfig),
        );
        const first = app.current.get();
        assertNotNull(first);
        await first.evolu;
        return first.appOwner.id;
      })();
      const secondId = getOrThrow(
        await (async () => {
          await using app = await run.orThrow(
            createEvoluApp(Schema, instantStartConfig),
          );
          return await app.add(
            createOwnerSecret(testCreateDeps({ seed: "app-second" })),
          );
        })(),
      );
      // Stored before the clock went back a minute.
      const later = millisToDateIso(Millis.orThrow(time.now() + 60_000));
      drivers.execWhere(
        "_evolu_appOwner",
        sql`
          update "_evolu_appOwner"
          set "lastOpenedAt" = ${later}
          where "id" = ${secondId};
        `,
      );

      {
        await using app = await run.orThrow(
          createEvoluApp(Schema, instantStartConfig),
        );
        assertSame(app.current.get()?.appOwner.id, secondId);
        app.open(firstId);
        while (
          appOwnerRows().find(({ id }) => id === firstId)?.lastOpenedAt == null
        )
          await testWaitForWorkerMessage();
      }

      await using restarted = await run.orThrow(
        createEvoluApp(Schema, instantStartConfig),
      );
      assertSame(restarted.current.get()?.appOwner.id, firstId);
    });

    it("opens at the next start the AppOwner a tab opened last, after another tab opened several with the clock behind the stored times", async () => {
      using drivers = createSqliteDriverPerName();
      const time = testCreateTime();
      await using setup = await setupRunWithEvoluDeps({
        createSqliteDriver: drivers.createSqliteDriver,
        time,
      });
      const { run } = setup;
      const appOwnerRows = () =>
        drivers.selectAll("_evolu_appOwner") as ReadonlyArray<{
          readonly id: OwnerId;
          readonly lastOpenedAt: string | null;
        }>;
      const [firstId, secondId, thirdId] = await (async () => {
        await using app = await run.orThrow(
          createEvoluApp(Schema, instantStartConfig),
        );
        const first = app.current.get();
        assertNotNull(first);
        await first.evolu;
        const added = [];
        for (const seed of ["app-second", "app-third"])
          added.push(
            getOrThrow(
              await app.add(createOwnerSecret(testCreateDeps({ seed }))),
            ),
          );
        await app.current.get()?.evolu;
        return [first.appOwner.id, ...added];
      })();
      // Stored before the clock went back a minute.
      const later = time.now() + 60_000;
      drivers.execWhere(
        "_evolu_appOwner",
        sql`
          update "_evolu_appOwner"
          set "lastOpenedAt" = ${millisToDateIso(Millis.orThrow(later))}
          where "id" = ${firstId};
        `,
      );

      {
        await using firstTab = await run.orThrow(
          createEvoluApp(Schema, instantStartConfig),
        );
        await using secondTab = await run.orThrow(
          createEvoluApp(Schema, instantStartConfig),
        );
        assertNotUndefined(secondId);
        assertNotUndefined(thirdId);
        // Three opens, each a millisecond after the one before it.
        firstTab.open(thirdId);
        firstTab.open(firstId);
        firstTab.open(thirdId);
        const thirdOpenedAt = millisToDateIso(Millis.orThrow(later + 3));
        await waitForStore(secondTab.appOwners, (entries) =>
          entries.some(
            ({ id, lastOpenedAt }) =>
              id === thirdId && lastOpenedAt === thirdOpenedAt,
          ),
        );

        // After the second tab received them, it opens the second AppOwner.
        const secondOpenedAt = () =>
          appOwnerRows().find(({ id }) => id === secondId)?.lastOpenedAt;
        const secondOpenedBefore = secondOpenedAt();
        secondTab.open(secondId);
        while (secondOpenedAt() === secondOpenedBefore)
          await testWaitForWorkerMessage();
        await firstTab.current.get()?.evolu;
        await secondTab.current.get()?.evolu;
      }

      await using restarted = await run.orThrow(
        createEvoluApp(Schema, instantStartConfig),
      );
      assertSame(restarted.current.get()?.appOwner.id, secondId);
    });

    it("lists no AppOwner it removed, also when SQLite failed to refresh the AppOwners", async () => {
      using drivers = createSqliteDriverPerName();
      await using setup = await setupRunWithEvoluDeps({
        createSqliteDriver: drivers.createSqliteDriver,
        deleteDatabaseFiles: drivers.deleteDatabaseFiles,
      });
      const { run } = setup;
      await using app = await run.orThrow(
        createEvoluApp(Schema, instantStartConfig),
      );
      const first = app.current.get();
      assertNotNull(first);
      await first.evolu;

      // The refresh after the row's deletion fails.
      drivers.onNextStatement(
        (statement) => statement.includes('delete from "_evolu_appOwner"'),
        () => {
          drivers.onNextStatement(
            (statement) => statement.includes('order by "lastOpenedAt" desc'),
            () => {
              throw new Error("disk I/O error");
            },
          );
        },
      );
      assertOk(await app.remove(first.appOwner.id));

      // At once, before a later refresh of the rows.
      assertEqual(app.appOwners.get(), []);
      app.open(first.appOwner.id);
      assertSame(app.current.get(), null);
    });

    it("moves a tab off a removed AppOwner and lists the rest even when an app's listener throws", async () => {
      for (const store of ["current", "appOwners"] as const) {
        using drivers = createSqliteDriverPerName();
        await using setup = await setupRunWithEvoluDeps({
          createSqliteDriver: drivers.createSqliteDriver,
          deleteDatabaseFiles: drivers.deleteDatabaseFiles,
        });
        const { run } = setup;

        await using firstTab = await run.orThrow(
          createEvoluApp(Schema, instantStartConfig),
        );
        await using secondTab = await run.orThrow(
          createEvoluApp(Schema, instantStartConfig),
        );
        const first = firstTab.current.get();
        assertNotNull(first);
        await first.evolu;
        await secondTab.current.get()?.evolu;
        const defect = new Error("Listener failed.");
        secondTab[store].subscribe(() => {
          throw defect;
        });
        // Subscribed after the listener that throws, as React subscribes
        // after an app's listener registered at its start.
        const moved = waitForStore(
          secondTab.current,
          (current) => current === null,
        );
        const listed = waitForStore(
          secondTab.appOwners,
          (appOwners) => appOwners.length === 0,
        );

        assertOk(await firstTab.remove(first.appOwner.id));
        await moved;
        await listed;
        assertTrue(run.deps.reportDefect.getDefects().includes(defect));
      }
    });

    it("keeps the device databases of app names that differ only in letter case apart", async () => {
      using drivers = createSqliteDriverPerName();
      await using setup = await setupRunWithEvoluDeps({
        createSqliteDriver: drivers.createSqliteDriver,
      });
      const { run } = setup;

      await using lower = await run.orThrow(
        createEvoluApp(Schema, {
          ...instantStartConfig,
          appName: AppName.orThrow("acme"),
        }),
      );
      await using upper = await run.orThrow(
        createEvoluApp(Schema, {
          ...instantStartConfig,
          appName: AppName.orThrow("Acme"),
        }),
      );
      // macOS's file system and WebKit's OPFS fold the case of names.
      assertFalse(
        lower.device.name.toLowerCase() === upper.device.name.toLowerCase(),
      );
    });

    it("fails to start when SQLite fails to read the AppOwners, without a defect", async () => {
      using drivers = createSqliteDriverPerName();
      await using setup = await setupRunWithEvoluDeps({
        createSqliteDriver: drivers.createSqliteDriver,
      });
      const { run } = setup;
      drivers.onNextStatement(
        (statement) =>
          statement.includes('"_evolu_appOwner"') &&
          statement.includes('order by "lastOpenedAt" desc'),
        () => {
          throw new Error("Disk I/O error.");
        },
      );

      const started = await run(createEvoluApp(Schema, instantStartConfig));
      assertErr(started);
      assertSame(started.error.type, "UnknownError");
      assertEqual(run.deps.reportDefect.getDefects(), []);
      assertOk(await run(() => ok()));
    });

    it("opens an AppOwner again, empty, after the app deletes its database itself", async () => {
      using drivers = createSqliteDriverPerName();
      await using setup = await setupRunWithEvoluDeps({
        createSqliteDriver: drivers.createSqliteDriver,
        deleteDatabaseFiles: drivers.deleteDatabaseFiles,
      });
      const { run } = setup;

      await using app = await run.orThrow(
        createEvoluApp(Schema, instantStartConfig),
      );
      const first = app.current.get();
      assertNotNull(first);
      const firstEvolu = await first.evolu;
      const inserted = Promise.withResolvers<void>();
      firstEvolu.insert(
        "todo",
        { title: NonEmptyTrimmedString100.orThrow("Mine") },
        { onSuccess: inserted.resolve },
      );
      await inserted.promise;

      assertOk(await firstEvolu.deleteDatabase());
      const reopened = await waitForStore(
        app.current,
        (current) => current?.evolu !== first.evolu,
      );
      assertSame(reopened?.appOwner.id, first.appOwner.id);
      const evolu = await reopened?.evolu;
      assertNotUndefined(evolu);
      assertSame(evolu.name, firstEvolu.name);
      assertEqual(await evolu.loadQuery(todoByCreatedAtQuery), []);
    });

    it("ends the open instance, whose database is kept in memory, in a removal where the browser keeps nothing, which deletes no files", async () => {
      using drivers = createSqliteDriverPerName();
      const deletedFiles: Array<Name> = [];
      await using setup = await setupRunWithEvoluDeps({
        createSqliteDriver: drivers.createSqliteDriver,
        deleteDatabaseFiles: (name) => {
          deletedFiles.push(name);
          return drivers.deleteDatabaseFiles(name);
        },
        devicePersistence: "NotPersisted",
      });
      const { run } = setup;

      await using app = await run.orThrow(
        createEvoluApp(Schema, instantStartConfig),
      );
      const first = app.current.get();
      assertNotNull(first);
      const firstEvolu = await first.evolu;
      const secondId = getOrThrow(
        await app.add(
          createOwnerSecret(testCreateDeps({ seed: "app-second" })),
        ),
      );
      app.open(first.appOwner.id);

      // Each instance has a database of its own, which ends with it.
      assertOk(await app.remove(first.appOwner.id));
      assertThrowsInstanceOf(
        () => firstEvolu.loadQuery(todoByCreatedAtQuery),
        Error,
      );
      assertSame(app.current.get(), null);
      assertEqual(
        app.appOwners.get().map(({ id }) => id),
        [secondId],
      );
      // Such a removal is the tab's alone, and a stored database of the
      // AppOwner's name isn't the tab's.
      assertEqual(deletedFiles, []);
    });

    it("opens no AppOwner it removed where the browser keeps nothing, also from rows SQLite failed to refresh", async () => {
      using drivers = createSqliteDriverPerName();
      await using setup = await setupRunWithEvoluDeps({
        createSqliteDriver: drivers.createSqliteDriver,
        deleteDatabaseFiles: drivers.deleteDatabaseFiles,
        devicePersistence: "NotPersisted",
      });
      const { run } = setup;
      await using app = await run.orThrow(
        createEvoluApp(Schema, instantStartConfig),
      );
      const first = app.current.get();
      assertNotNull(first);
      await first.evolu;
      assertOk(
        await app.add(
          createOwnerSecret(testCreateDeps({ seed: "app-second" })),
        ),
      );
      // Answered once its DbWorker opened its database, so it's listed below.
      await (await app.current.get()?.evolu)?.loadQuery(todoByCreatedAtQuery);
      app.open(first.appOwner.id);
      await (await app.current.get()?.evolu)?.loadQuery(todoByCreatedAtQuery);

      // The refresh after its removal fails, so the tab's rows still list
      // the AppOwner.
      drivers.onNextStatement(
        (statement) => statement.includes('order by "lastOpenedAt" desc'),
        () => {
          throw new Error("disk I/O error");
        },
      );
      const namesBefore = drivers.names();
      assertOk(await app.remove(first.appOwner.id));
      // At once, before a later refresh of the rows.
      app.open(first.appOwner.id);
      assertSame(app.current.get(), null);
      await testWaitForWorkerMessage();

      assertSame(app.current.get(), null);
      // Each instance kept in memory has a database of its own, so opening
      // the removed AppOwner again would add one.
      assertEqual(
        drivers.names().filter((name) => !namesBefore.includes(name)),
        [],
      );
    });

    it("stops following the device rows, without throwing, once its root Run ends while it lives on", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run } = setup;
      using unhandledRejections = testGlobalUnhandledRejections();
      // A root of its own, which ends while the app lives on, as a panic of
      // the root Run ends it.
      const appRoot = testCreateRun<typeof run.deps>({ ...run.deps });
      await using app = await appRoot.orThrow(
        createEvoluApp(Schema, instantStartConfig),
      );
      const first = app.current.get();
      assertNotNull(first);
      await first.evolu;
      await using otherTab = await run.orThrow(
        createEvoluApp(Schema, instantStartConfig),
      );
      await appRoot[Symbol.asyncDispose]();

      // Another tab's rename changes the device rows.
      otherTab.rename(
        first.appOwner.id,
        NonEmptyTrimmedString100.orThrow("Renamed"),
      );
      await waitForStore(otherTab.appOwners, (appOwners) =>
        appOwners.some((appOwner) => appOwner.name === "Renamed"),
      );
      for (let i = 0; i < 5; i++) await testWaitForWorkerMessage();

      assertEqual(unhandledRejections.errors, []);
      assertEqual(
        app.appOwners.get().map(({ name }) => name),
        [null],
      );
    });

    it("opens nothing again, without throwing, after another tab deletes its open database once its root Run ended", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run } = setup;
      using unhandledRejections = testGlobalUnhandledRejections();
      // A root of its own, which ends while the app lives on, as a panic of
      // the root Run ends it.
      const appRoot = testCreateRun<typeof run.deps>({ ...run.deps });
      await using app = await appRoot.orThrow(
        createEvoluApp(Schema, instantStartConfig),
      );
      const first = app.current.get();
      assertNotNull(first);
      await first.evolu;
      await using otherTab = await run.orThrow(
        createEvoluApp(Schema, instantStartConfig),
      );
      const otherEvolu = await otherTab.current.get()?.evolu;
      assertNotUndefined(otherEvolu);
      await appRoot[Symbol.asyncDispose]();

      assertOk(await otherEvolu.deleteDatabase());
      for (let i = 0; i < 5; i++) await testWaitForWorkerMessage();

      assertEqual(unhandledRejections.errors, []);
      assertEqual(appRoot.deps.reportDefect.getDefects(), []);
      assertSame(app.current.get(), null);
    });

    it("opens nothing again, without throwing, after its open database's deletion ends while the end of its root Run waits for a disposal", async () => {
      // Where the browser keeps nothing, a removal's rows dispose the
      // instance in the Run where opens run, whose end then waits for it.
      await using setup = await setupRunWithEvoluDeps({
        devicePersistence: "NotPersisted",
      });
      const { run } = setup;
      using unhandledRejections = testGlobalUnhandledRejections();
      // A root of its own, which ends while the app lives on, as a panic of
      // the root Run ends it.
      const appRoot = testCreateRun<typeof run.deps>({ ...run.deps });
      await using app = await appRoot.orThrow(
        createEvoluApp(Schema, instantStartConfig),
      );
      const first = app.current.get();
      assertNotNull(first);
      const firstEvolu = await first.evolu;
      const secondId = getOrThrow(
        await app.add(
          createOwnerSecret(testCreateDeps({ seed: "app-second" })),
        ),
      );
      const secondEvolu = await app.current.get()?.evolu;
      assertNotUndefined(secondEvolu);
      assertSame(app.current.get()?.appOwner.id, secondId);
      // The first AppOwner's disposal waits until released, as a slow
      // worker's would, so the end of the root Run waits for it.
      const disposing = Promise.withResolvers<void>();
      const released = Promise.withResolvers<void>();
      const dispose = (firstEvolu as unknown as AsyncDisposable)[
        Symbol.asyncDispose
      ].bind(firstEvolu);
      Object.assign(firstEvolu, {
        [Symbol.asyncDispose]: async () => {
          disposing.resolve();
          await released.promise;
          await dispose();
        },
      });
      const removing = app.remove(first.appOwner.id);
      await disposing.promise;
      // A deletion that keeps the AppOwner, as another tab's would, whose
      // OnDatabaseDeleted arrives once the root Run aborted.
      const deleting = secondEvolu.deleteDatabase();
      const rootDisposal = Promise.resolve(appRoot[Symbol.asyncDispose]());

      try {
        assertOk(await deleting);
        for (let i = 0; i < 5; i++) await testWaitForWorkerMessage();
        assertSame(await settleWithinWorkerMessages(rootDisposal), "pending");
      } finally {
        released.resolve();
      }
      await rootDisposal;
      await removing;

      assertEqual(unhandledRejections.errors, []);
      assertEqual(appRoot.deps.reportDefect.getDefects(), []);
      assertSame(app.current.get(), null);
    });

    it("waits in its disposal for the disposal of an instance the rows stopped listing", async () => {
      await using setup = await setupRunWithEvoluDeps({
        devicePersistence: "NotPersisted",
      });
      const { run } = setup;
      await using app = await run.orThrow(
        createEvoluApp(Schema, instantStartConfig),
      );
      const first = app.current.get();
      assertNotNull(first);
      const evolu = await first.evolu;
      // Its disposal waits until released, as a slow worker's would.
      const disposing = Promise.withResolvers<void>();
      const released = Promise.withResolvers<void>();
      let isDisposed = false;
      const dispose = (evolu as unknown as AsyncDisposable)[
        Symbol.asyncDispose
      ].bind(evolu);
      Object.assign(evolu, {
        [Symbol.asyncDispose]: async () => {
          disposing.resolve();
          await released.promise;
          await dispose();
          isDisposed = true;
        },
      });

      // Where the browser keeps nothing, the removal deletes only the row, and
      // the rows that no longer list the AppOwner dispose its instance.
      const removing = app.remove(first.appOwner.id);
      await disposing.promise;
      const appDisposal = Promise.resolve(app[Symbol.asyncDispose]());
      try {
        assertSame(await settleWithinWorkerMessages(appDisposal), "pending");
      } finally {
        released.resolve();
      }
      await appDisposal;
      assertTrue(isDisposed);
      await removing;
    });

    it("lists and opens an AppOwner it added in the tick it removed it where the browser keeps nothing, as after an await between them", async () => {
      for (const awaitRemoval of [false, true]) {
        using drivers = createSqliteDriverPerName();
        await using setup = await setupRunWithEvoluDeps({
          createSqliteDriver: drivers.createSqliteDriver,
          deleteDatabaseFiles: drivers.deleteDatabaseFiles,
          devicePersistence: "NotPersisted",
        });
        const { run } = setup;
        await using app = await run.orThrow(
          createEvoluApp(Schema, instantStartConfig),
        );
        const first = app.current.get();
        assertNotNull(first);
        await first.evolu;
        const secret = mnemonicToOwnerSecret(first.appOwner.mnemonic);

        // In one tick, both writes are stored in one batch.
        const removing = app.remove(first.appOwner.id);
        if (awaitRemoval) assertOk(await removing);
        assertOk(await app.add(secret));
        assertOk(await removing);

        assertEqual(
          app.appOwners.get().map(({ id }) => id),
          [first.appOwner.id],
        );
        const added = app.current.get();
        assertSame(added?.appOwner.id, first.appOwner.id);
        assertFalse(added?.evolu === first.evolu);
        const addedEvolu = await added?.evolu;
        assertNotUndefined(addedEvolu);
        assertEqual(await addedEvolu.loadQuery(todoByCreatedAtQuery), []);
      }
    });

    it("notifies the AppOwners' listeners once for a removal, and not when the device rows they list come again", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run } = setup;
      await using app = await run.orThrow(
        createEvoluApp(Schema, instantStartConfig),
      );
      const first = app.current.get();
      assertNotNull(first);
      await first.evolu;
      const secondId = getOrThrow(
        await app.add(
          createOwnerSecret(testCreateDeps({ seed: "app-second" })),
        ),
      );
      await app.current.get()?.evolu;
      for (let i = 0; i < 5; i++) await testWaitForWorkerMessage();
      let notifications = 0;
      app.appOwners.subscribe(() => {
        notifications++;
      });

      assertOk(await app.remove(first.appOwner.id));
      const listed = app.appOwners.get();
      // The device rows then come without the AppOwner too.
      for (let i = 0; i < 5; i++) await testWaitForWorkerMessage();

      assertSame(notifications, 1);
      assertSame(app.appOwners.get(), listed);
      assertEqual(
        listed.map(({ id }) => id),
        [secondId],
      );
    });

    it("doesn't notify the AppOwners' listeners when the device rows it started with come", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run } = setup;
      await using app = await run.orThrow(
        createEvoluApp(Schema, instantStartConfig),
      );
      let notifications = 0;
      app.appOwners.subscribe(() => {
        notifications++;
      });
      const listed = app.appOwners.get();

      await app.current.get()?.evolu;
      for (let i = 0; i < 5; i++) await testWaitForWorkerMessage();

      assertSame(notifications, 0);
      assertSame(app.appOwners.get(), listed);
    });

    it("isolates an app's listener of the current AppOwner that throws during an add", async () => {
      using drivers = createSqliteDriverPerName();
      await using setup = await setupRunWithEvoluDeps({
        createSqliteDriver: drivers.createSqliteDriver,
      });
      const { run } = setup;

      // It has an AppOwner open, so the add, not the device query, opens the
      // one it adds.
      await using app = await run.orThrow(
        createEvoluApp(Schema, instantStartConfig),
      );
      await app.current.get()?.evolu;
      const defect = new Error("Listener failed.");
      app.current.subscribe(() => {
        throw defect;
      });

      const secret = createOwnerSecret(testCreateDeps({ seed: "app-added" }));
      assertOk(await app.add(secret));
      assertSame(app.current.get()?.appOwner.id, createAppOwner(secret).id);
      assertTrue(run.deps.reportDefect.getDefects().includes(defect));
      assertOk(await run(() => ok()));
    });

    it("writes nothing for an open or rename of an AppOwner a tab's rows still list after its removal", async () => {
      using drivers = createSqliteDriverPerName();
      const time = testCreateTime();
      await using setup = await setupRunWithEvoluDeps({
        createSqliteDriver: drivers.createSqliteDriver,
        time,
      });
      const { run } = setup;

      await using app = await run.orThrow(
        createEvoluApp(Schema, instantStartConfig),
      );
      const first = app.current.get();
      assertNotNull(first);
      await first.evolu;
      time.advance("1s");
      const secondId = getOrThrow(
        await app.add(
          createOwnerSecret(testCreateDeps({ seed: "app-second" })),
        ),
      );
      await app.current.get()?.evolu;
      // Removals, as by another tab, which the tab's rows don't show.
      drivers.execWhere("_evolu_appOwner", sql`delete from "_evolu_appOwner";`);

      app.open(first.appOwner.id);
      app.rename(secondId, NonEmptyTrimmedString100.orThrow("Gone"));
      await waitForStore(app.appOwners, (appOwners) => appOwners.length === 0);

      // Neither created a row without a secret.
      assertEqual(drivers.selectAll("_evolu_appOwner"), []);
    });

    it("fails an add at once while the device database is refused", async () => {
      using drivers = createSqliteDriverPerName();
      await using setup = await setupRunWithEvoluDeps({
        createSqliteDriver: drivers.createSqliteDriver,
        deleteDatabaseFiles: drivers.deleteDatabaseFiles,
      });
      const { run } = setup;
      await using app = await run.orThrow(
        createEvoluApp(Schema, instantStartConfig),
      );
      const first = app.current.get();
      assertNotNull(first);
      await first.evolu;
      const deviceName = app.device.name;

      // The tab leader changes, and the device database's next DbWorker
      // refuses startup, as when another context holds the files.
      using laterTab = setup.connectLaterTab();
      laterTab.port.onMessage = (message) => {
        if (message.type !== "DbWorkerInit") return;
        if (message.mode === "Open" && message.name === deviceName) {
          createMessagePort<DbWorkerOutput, DbWorkerInput>(
            message.port,
          ).postMessage({
            type: "LeaderRefused",
            error: { type: "DatabaseHeldError", name: deviceName },
          });
          return;
        }
        run.deps.createDbWorker().postMessage(message, [message.port]);
      };
      const refused = setup.waitForTabError();
      laterTab.port.postMessage({
        type: "AnnounceTabLeader",
        consoleLevel: "debug",
      });
      await refused;

      const added = await settleWithinWorkerMessages(
        app.add(createOwnerSecret(testCreateDeps({ seed: "app-second" }))),
      );
      assertEqual(
        added,
        err(
          createUnknownError({ type: "DatabaseHeldError", name: deviceName }),
        ),
      );
      assertEqual(
        app.appOwners.get().map(({ id }) => id),
        [first.appOwner.id],
      );
    });

    it("fails to add an AppOwner whose device write fails, and doesn't open it", async () => {
      using drivers = createSqliteDriverPerName();
      await using setup = await setupRunWithEvoluDeps({
        createSqliteDriver: drivers.createSqliteDriver,
      });
      const { run } = setup;

      await using app = await run.orThrow(
        createEvoluApp(Schema, {
          ...instantStartConfig,
          createFirstAppOwner: false,
        }),
      );
      drivers.onNextStatement(
        (statement) => /insert into\s+"_evolu_appOwner"/u.test(statement),
        () => {
          throw new Error("database or disk is full");
        },
      );

      assertErr(
        await app.add(
          createOwnerSecret(testCreateDeps({ seed: "app-failed" })),
        ),
      );
      assertSame(app.current.get(), null);
      assertEqual(app.appOwners.get(), []);
      assertEqual(drivers.selectAll("_evolu_appOwner"), []);
    });

    it("removes an AppOwner added in the same tick", async () => {
      using drivers = createSqliteDriverPerName();
      await using setup = await setupRunWithEvoluDeps({
        createSqliteDriver: drivers.createSqliteDriver,
        deleteDatabaseFiles: drivers.deleteDatabaseFiles,
      });
      const { run } = setup;

      await using app = await run.orThrow(
        createEvoluApp(Schema, {
          ...instantStartConfig,
          createFirstAppOwner: false,
        }),
      );
      const secret = createOwnerSecret(testCreateDeps({ seed: "app-brief" }));
      const adding = app.add(secret);
      const removing = app.remove(createAppOwner(secret).id);
      assertOk(await adding);
      assertOk(await removing);

      assertEqual(app.appOwners.get(), []);
      assertSame(app.current.get(), null);
      assertEqual(drivers.selectAll("_evolu_appOwner"), []);
    });

    it("keeps the AppOwner an add was called with when the caller changes the secret's bytes", async () => {
      using drivers = createSqliteDriverPerName();
      await using setup = await setupRunWithEvoluDeps({
        createSqliteDriver: drivers.createSqliteDriver,
      });
      const { run } = setup;
      const config = { ...instantStartConfig, createFirstAppOwner: false };

      const secret = createOwnerSecret(testCreateDeps({ seed: "app-added" }));
      const { id } = createAppOwner(secret);
      {
        await using app = await run.orThrow(createEvoluApp(Schema, config));
        const adding = app.add(secret);
        secret.set(createOwnerSecret(testCreateDeps({ seed: "app-reused" })));
        assertSame(getOrThrow(await adding), id);
        assertSame(app.current.get()?.appOwner.id, id);
      }

      // The stored secret is the one the AppOwner's ID came from.
      await using restarted = await run.orThrow(createEvoluApp(Schema, config));
      assertSame(restarted.current.get()?.appOwner.id, id);
    });

    it("deletes the database of a removed AppOwner whose database is refused, without opening it", async () => {
      using drivers = createSqliteDriverPerName();
      // Every start of the database that refused once refuses, so a worker
      // that opened it instead of deleting it would fail the removal.
      let refuseNextStart = false;
      let refusedName: Name | null = null;
      await using setup = await setupRunWithEvoluDeps({
        createSqliteDriver: drivers.createSqliteDriver,
        deleteDatabaseFiles: drivers.deleteDatabaseFiles,
        waitForDatabaseRelease: (name) => () => {
          if (refuseNextStart) {
            refuseNextStart = false;
            refusedName = name;
          }
          return name === refusedName
            ? err({ type: "DatabaseHeldError", name })
            : ok();
        },
      });
      const { run } = setup;
      const config = { ...instantStartConfig, createFirstAppOwner: false };
      await using app = await run.orThrow(createEvoluApp(Schema, config));
      // Its database refuses to start, as when another context held its
      // files, or as a corrupt or newer one does.
      refuseNextStart = true;
      const refused = setup.waitForTabError();
      const refusedId = getOrThrow(
        await app.add(
          createOwnerSecret(testCreateDeps({ seed: "app-refused" })),
        ),
      );
      await refused;
      const evolu = await app.current.get()?.evolu;
      assertNotUndefined(evolu);

      assertOk(await app.remove(refusedId));
      assertSame(drivers.deletions(evolu.name), 1);
      assertEqual(app.appOwners.get(), []);
    });

    it("derives the device owner from the DeviceSecret it was given", async () => {
      using drivers = createSqliteDriverPerName();
      await using setup = await setupRunWithEvoluDeps({
        createSqliteDriver: drivers.createSqliteDriver,
      });
      const { run } = setup;

      const secret = createDeviceSecret(testCreateDeps({ seed: "device" }));
      const copy = new Uint8Array(secret) as DeviceSecret;
      const creating = createEvoluApp(Schema, {
        ...instantStartConfig,
        auth: { type: "DeviceSecret", secret },
      });
      // Zeroed by the caller after the check, such as to clear it.
      secret.fill(0);
      await using app = await run.orThrow(creating);
      await using expected = await run.orThrow(
        createEvoluApp(Schema, {
          ...instantStartConfig,
          auth: { type: "DeviceSecret", secret: copy },
        }),
      );
      assertSame(app.device.name, expected.device.name);
    });

    it("disposes an AppOwner's instance that finishes opening while the app is disposed", async () => {
      // Each delay lands the disposal at another step of the open.
      for (let delay = 0; delay < 20; delay++) {
        using drivers = createSqliteDriverPerName();
        await using setup = await setupRunWithEvoluDeps({
          createSqliteDriver: drivers.createSqliteDriver,
        });
        const { run } = setup;
        // An instance holds a lock named by its ID until it is disposed, while
        // the tenants and DbWorkers, which outlive the app, hold locks named
        // after their databases.
        const locksOfInstances = async () =>
          (await run.deps.lockManager.query()).held
            ?.map(({ name }) => name)
            .filter((name) => !name?.startsWith("evolu-leaderlock-AppName-"))
            .toSorted();
        const locksBefore = await locksOfInstances();

        const app = await run.orThrow(
          createEvoluApp(Schema, instantStartConfig),
        );
        await app.current.get()?.evolu;
        const secret = createOwnerSecret(testCreateDeps({ seed: "opening" }));
        void app.add(secret);
        await waitForStore(
          app.current,
          (current) => current?.appOwner.id === createAppOwner(secret).id,
        );
        for (let i = 0; i < delay; i++) await Promise.resolve();
        await app[Symbol.asyncDispose]();
        await testWaitForWorkerMessage();

        assertEqual(await locksOfInstances(), locksBefore);
      }
    });

    it("disposes every AppOwner's instance when their disposals fail", async () => {
      using drivers = createSqliteDriverPerName();
      await using setup = await setupRunWithEvoluDeps({
        createSqliteDriver: drivers.createSqliteDriver,
      });
      const { run } = setup;
      // An instance holds a lock named by its ID until it is disposed, while
      // the tenants and DbWorkers, which outlive the app, hold locks named
      // after their databases.
      const locksOfInstances = async () =>
        (await run.deps.lockManager.query()).held
          ?.map(({ name }) => name)
          .filter((name) => !name?.startsWith("evolu-leaderlock-AppName-"))
          .toSorted();
      const locksBefore = await locksOfInstances();

      const app = await run.orThrow(createEvoluApp(Schema, instantStartConfig));
      const first = await app.current.get()?.evolu;
      assertNotUndefined(first);
      assertOk(
        await app.add(createOwnerSecret(testCreateDeps({ seed: "second" }))),
      );
      const second = await app.current.get()?.evolu;
      assertNotUndefined(second);
      // They stand for disposals that fail, such as ones an app's listener
      // throws in. Each fails after it disposed its instance, so a disposal
      // that stops at the first failure, in either order, leaves a lock.
      const failures = new Set(
        [first, second].map((evolu) => {
          const failure = new Error("Disposal failed.");
          const dispose = (evolu as typeof evolu & AsyncDisposable)[
            Symbol.asyncDispose
          ];
          Object.assign(evolu, {
            [Symbol.asyncDispose]: async () => {
              await dispose();
              throw failure;
            },
          });
          return failure;
        }),
      );

      const error = await app[Symbol.asyncDispose]().then(
        () => null,
        (error: unknown) => error,
      );
      assert(error instanceof SuppressedError, "The disposal didn't fail.");
      assertEqual(
        [error.error, error.suppressed].filter((failure) =>
          failures.has(failure as Error),
        ).length,
        2,
      );
      await testWaitForWorkerMessage();
      assertEqual(await locksOfInstances(), locksBefore);
    });

    it("keeps the open AppOwner when another tab removes the one an add stores before the add reads the AppOwners", async () => {
      using drivers = createSqliteDriverPerName();
      const time = testCreateTime();
      await using setup = await setupRunWithEvoluDeps({
        createSqliteDriver: drivers.createSqliteDriver,
        deleteDatabaseFiles: drivers.deleteDatabaseFiles,
        time,
      });
      const { run } = setup;

      // The first tab holds what its instances receive from the answer to its
      // next write on, until the test delivers it.
      let holding: "No" | "FromNextWrite" | "Yes" = "No";
      const held: Array<() => void> = [];
      await using firstRun = setupMessageHook(run, (message, deliver) => {
        if (
          holding === "FromNextWrite" &&
          message.type === "OnPatchesByQuery" &&
          (message as ExtractTyped<EvoluOutput, "OnPatchesByQuery">).callbackIds
            .length > 0
        )
          holding = "Yes";
        if (holding === "Yes") held.push(deliver);
        else deliver();
      });
      await using firstTab = await firstRun.orThrow(
        createEvoluApp(Schema, instantStartConfig),
      );
      const first = firstTab.current.get();
      assertNotNull(first);
      await first.evolu;
      time.advance("1s");
      const added = createOwnerSecret(testCreateDeps({ seed: "app-added" }));
      const addedId = getOrThrow(await firstTab.add(added));
      time.advance("1s");
      firstTab.open(first.appOwner.id);
      await testWaitForWorkerMessage();
      await using secondTab = await run.orThrow(
        createEvoluApp(Schema, instantStartConfig),
      );

      // Added again, which stores it, while the other tab removes it.
      holding = "FromNextWrite";
      const adding = firstTab.add(added);
      while (held.length === 0) await testWaitForWorkerMessage();
      assertOk(await secondTab.remove(addedId));
      holding = "No";
      for (const deliver of held.splice(0)) deliver();

      assertOk(await adding);
      assertSame(firstTab.current.get()?.appOwner.id, first.appOwner.id);
      assertEqual(
        firstTab.appOwners.get().map(({ id }) => id),
        [first.appOwner.id],
      );
    });

    it("opens at the next start the AppOwner opened last, also when two opened in one millisecond", async () => {
      using drivers = createSqliteDriverPerName();
      const time = testCreateTime();
      await using setup = await setupRunWithEvoluDeps({
        createSqliteDriver: drivers.createSqliteDriver,
        time,
      });
      const { run } = setup;

      let newerId: OwnerId;
      {
        await using app = await run.orThrow(
          createEvoluApp(Schema, instantStartConfig),
        );
        const first = app.current.get();
        assertNotNull(first);
        time.advance("1s");
        newerId = getOrThrow(
          await app.add(createOwnerSecret(testCreateDeps({ seed: "newer" }))),
        );
        time.advance("1s");
        app.open(first.appOwner.id);
        app.open(newerId);
        await app.current.get()?.evolu;
        await testWaitForWorkerMessage();
      }

      await using restarted = await run.orThrow(
        createEvoluApp(Schema, instantStartConfig),
      );
      assertSame(restarted.current.get()?.appOwner.id, newerId);
    });

    it("leaves open an AppOwner this tab opened while an add ran, which the next start opens too", async () => {
      using drivers = createSqliteDriverPerName();
      await using setup = await setupRunWithEvoluDeps({
        createSqliteDriver: drivers.createSqliteDriver,
      });
      const { run } = setup;

      const otherId = await (async () => {
        await using app = await run.orThrow(
          createEvoluApp(Schema, instantStartConfig),
        );
        const first = app.current.get();
        assertNotNull(first);
        const otherId = getOrThrow(
          await app.add(
            createOwnerSecret(testCreateDeps({ seed: "app-other" })),
          ),
        );
        app.open(first.appOwner.id);

        const adding = app.add(
          createOwnerSecret(testCreateDeps({ seed: "app-added" })),
        );
        app.open(otherId);
        const addedId = getOrThrow(await adding);

        assertSame(app.current.get()?.appOwner.id, otherId);
        assertTrue(app.appOwners.get().some(({ id }) => id === addedId));
        await app.current.get()?.evolu;
        await testWaitForWorkerMessage();
        return otherId;
      })();

      await using restarted = await run.orThrow(
        createEvoluApp(Schema, instantStartConfig),
      );
      assertSame(restarted.current.get()?.appOwner.id, otherId);
    });

    it("opens only the AppOwner this tab added last when its adds overlap, which the next start opens too", async () => {
      using drivers = createSqliteDriverPerName();
      await using setup = await setupRunWithEvoluDeps({
        createSqliteDriver: drivers.createSqliteDriver,
      });
      const { run } = setup;

      const secondId = await (async () => {
        await using app = await run.orThrow(
          createEvoluApp(Schema, instantStartConfig),
        );
        const opened: Array<OwnerId | undefined> = [];
        const unsubscribe = app.current.subscribe(() => {
          opened.push(app.current.get()?.appOwner.id);
        });

        const addingFirst = app.add(
          createOwnerSecret(testCreateDeps({ seed: "app-first-added" })),
        );
        const addingSecond = app.add(
          createOwnerSecret(testCreateDeps({ seed: "app-second-added" })),
        );
        const firstId = getOrThrow(await addingFirst);
        const secondId = getOrThrow(await addingSecond);
        unsubscribe();

        assertEqual(opened, [secondId]);
        assertTrue(app.appOwners.get().some(({ id }) => id === firstId));
        await app.current.get()?.evolu;
        await testWaitForWorkerMessage();
        return secondId;
      })();

      await using restarted = await run.orThrow(
        createEvoluApp(Schema, instantStartConfig),
      );
      assertSame(restarted.current.get()?.appOwner.id, secondId);
    });

    it("opens the AppOwner an add added, also when another tab opened another meanwhile", async () => {
      using drivers = createSqliteDriverPerName();
      await using setup = await setupRunWithEvoluDeps({
        createSqliteDriver: drivers.createSqliteDriver,
      });
      const { run } = setup;

      await using firstTab = await run.orThrow(
        createEvoluApp(Schema, instantStartConfig),
      );
      await using secondTab = await run.orThrow(
        createEvoluApp(Schema, instantStartConfig),
      );
      const first = firstTab.current.get();
      assertNotNull(first);
      const otherId = getOrThrow(
        await secondTab.add(
          createOwnerSecret(testCreateDeps({ seed: "app-other" })),
        ),
      );
      await waitForStore(firstTab.appOwners, (entries) =>
        entries.some(({ id }) => id === otherId),
      );

      const adding = firstTab.add(
        createOwnerSecret(testCreateDeps({ seed: "app-added" })),
      );
      // Its open time is later than the add's, but it's another tab's.
      secondTab.open(first.appOwner.id);
      const addedId = getOrThrow(await adding);

      assertSame(firstTab.current.get()?.appOwner.id, addedId);
      assertSame(secondTab.current.get()?.appOwner.id, first.appOwner.id);
      await firstTab.current.get()?.evolu;
      await secondTab.current.get()?.evolu;
    });

    it("opens and lists an added AppOwner when SQLite fails the query its write refreshes, and fails when it fails the read after it", async () => {
      using drivers = createSqliteDriverPerName();
      await using setup = await setupRunWithEvoluDeps({
        createSqliteDriver: drivers.createSqliteDriver,
      });
      const { run } = setup;

      await using app = await run.orThrow(
        createEvoluApp(Schema, instantStartConfig),
      );
      const first = app.current.get();
      assertNotNull(first);
      await first.evolu;
      // The subscription's first read, so the hook catches the add's.
      await testWaitForWorkerMessage();
      const isAppOwnersQuery = (statement: string) =>
        statement.includes('"_evolu_appOwner"') &&
        statement.includes('order by "lastOpenedAt" desc');

      // Corruption fails it and leaves the transaction to commit.
      drivers.onNextStatement(isAppOwnersQuery, () => {
        throw new Error("Database disk image is malformed.");
      });
      const addedId = getOrThrow(
        await app.add(createOwnerSecret(testCreateDeps({ seed: "app-added" }))),
      );
      assertSame(app.current.get()?.appOwner.id, addedId);
      assertEqual(
        app.appOwners.get().map(({ id }) => id),
        [addedId, first.appOwner.id],
      );

      drivers.onNextStatement(isAppOwnersQuery, () => {
        drivers.onNextStatement(isAppOwnersQuery, () => {
          throw new Error("Database disk image is malformed.");
        });
        throw new Error("Database disk image is malformed.");
      });
      const failed = await app.add(
        createOwnerSecret(testCreateDeps({ seed: "app-third" })),
      );
      assertErr(failed);
      assertSame(failed.error.type, "UnknownError");
      assertSame(app.current.get()?.appOwner.id, addedId);
      assertEqual(run.deps.reportDefect.getDefects(), []);
    });

    it("opens another device database with a DeviceSecret", async () => {
      using drivers = createSqliteDriverPerName();
      await using setup = await setupRunWithEvoluDeps({
        createSqliteDriver: drivers.createSqliteDriver,
      });
      const { run } = setup;

      await using instantStart = await run.orThrow(
        createEvoluApp(Schema, instantStartConfig),
      );
      await using withSecret = await run.orThrow(
        createEvoluApp(Schema, {
          ...instantStartConfig,
          auth: {
            type: "DeviceSecret",
            secret: createDeviceSecret(testCreateDeps({ seed: "device" })),
          },
        }),
      );

      const [instantStartAppOwner] = instantStart.appOwners.get();
      const [withSecretAppOwner] = withSecret.appOwners.get();
      assertNotUndefined(instantStartAppOwner);
      assertNotUndefined(withSecretAppOwner);
      assertFalse(instantStartAppOwner.id === withSecretAppOwner.id);
    });

    it("keys the device database on paths no AppOwner reaches, also from the bytes of an AppOwner's secret", async () => {
      using drivers = createSqliteDriverPerName();
      const keys: Array<string> = [];
      await using setup = await setupRunWithEvoluDeps({
        createSqliteDriver: (name, options) => {
          if (options?.mode === "encrypted")
            keys.push(uint8ArrayToBase64Url(options.encryptionKey));
          return drivers.createSqliteDriver(name, options);
        },
      });
      const { run } = setup;
      const secret = createDeviceSecret(testCreateDeps({ seed: "device" }));
      const zeros = new Uint8Array(32);
      // An earlier derivation went through this public OwnerSecret, so
      // restoring it as an AppOwner opened instant start's device database.
      const publicSecret = createSlip21(OwnerSecret.orThrow(zeros), [
        "Evolu",
        "DeviceOwnerSecret",
      ]);

      for (const [auth, ownerSecrets] of [
        [{ type: "InstantStart" }, [zeros, publicSecret]],
        [{ type: "DeviceSecret", secret }, [secret]],
      ] as const) {
        keys.length = 0;
        await using _app = await run.orThrow(
          createEvoluApp(Schema, {
            ...instantStartConfig,
            auth,
            createFirstAppOwner: false,
          }),
        );
        assertLength(keys, 1);
        for (const ownerSecret of ownerSecrets)
          assertFalse(
            keys[0] ===
              uint8ArrayToBase64Url(
                createAppOwner(OwnerSecret.orThrow(ownerSecret)).encryptionKey,
              ),
          );
      }
    });

    describe("wrapped DeviceSecret", () => {
      /** A key provider whose keys live in memory, with failures to order. */
      const setupKeyProvider = () => {
        const keysById = new Map<string, Entropy32>();
        let nextGetError: DeviceSecretKeyError | null = null;
        const calls = { createKey: 0, getKey: 0 };
        const keyProvider: DeviceSecretKeyProvider = {
          createKey: (run) => {
            calls.createKey++;
            const keyId = DeviceSecretKeyId.orThrow(
              run.deps.randomBytes.create(16),
            );
            keysById.set(keyId.toString(), run.deps.randomBytes.create(32));
            return Promise.resolve(ok(keyId));
          },
          getKey: (keyId) => () => {
            calls.getKey++;
            const error = nextGetError;
            nextGetError = null;
            if (error) return Promise.resolve(err(error));
            const key = keysById.get(keyId.toString());
            return Promise.resolve(
              key ? ok(key) : err({ type: "DeviceSecretKeyRefused" }),
            );
          },
        };
        return {
          keyProvider,
          calls,
          failNextGet: (error: DeviceSecretKeyError) => {
            nextGetError = error;
          },
          replaceKeys: (deps: RandomBytesDep) => {
            for (const id of keysById.keys())
              keysById.set(id, deps.randomBytes.create(32));
          },
        };
      };

      const wrappedDeviceSecretRows = (drivers: {
        selectAll: (table: string) => ReadonlyArray<unknown>;
      }) =>
        drivers.selectAll("_evolu_wrappedDeviceSecret") as ReadonlyArray<{
          readonly wrappedSecret: Uint8Array | null;
        }>;

      it("creates a DeviceSecret on first use and unlocks the same one later", async () => {
        using drivers = createSqliteDriverPerName();
        await using setup = await setupRunWithEvoluDeps({
          createSqliteDriver: drivers.createSqliteDriver,
        });
        const { run } = setup;
        const { keyProvider, calls } = setupKeyProvider();
        const unlock = unlockWrappedDeviceSecret({
          appName: testAppName,
          keyProvider,
        });

        assertFalse(await run.orThrow(hasWrappedDeviceSecret(testAppName)));
        const created = await run.orThrow(unlock);
        assertTrue(await run.orThrow(hasWrappedDeviceSecret(testAppName)));
        const unlocked = await run.orThrow(unlock);

        assertEqual(unlocked, created);
        assertEqual(calls, { createKey: 1, getKey: 2 });
        assertLength(wrappedDeviceSecretRows(drivers), 1);

        // The DeviceSecret opens the app's device database.
        await using app = await run.orThrow(
          createEvoluApp(Schema, {
            ...instantStartConfig,
            auth: { type: "DeviceSecret", secret: unlocked },
          }),
        );
        assertLength(app.appOwners.get(), 1);
      });

      it("keeps the names, keys, lock, and row of the device database and the wrapped DeviceSecret's database, which must never change", async () => {
        // Another name or key opens a new, empty database after an upgrade, so
        // the app loses its AppOwners, or its next unlock starts another
        // setup, which registers another key. Another lock name lets a setup
        // of another build run at once.
        using drivers = createSqliteDriverPerName();
        const keysByName = new Map<Name, string | null>();
        await using setup = await setupRunWithEvoluDeps({
          createSqliteDriver: (name, options) => {
            keysByName.set(
              name,
              options?.mode === "encrypted"
                ? uint8ArrayToBase64Url(options.encryptionKey)
                : null,
            );
            return drivers.createSqliteDriver(name, options);
          },
        });
        const { run } = setup;
        const appName = AppName.orThrow("permanent");
        const { keyProvider, calls } = setupKeyProvider();

        // A setup of another build holds the lock.
        const otherBuild = await run.ok(
          acquireLeaderLock("WrappedDeviceSecret-permanent"),
        );
        const unlocking = run(
          unlockWrappedDeviceSecret({ appName, keyProvider }),
        );
        let settled = false;
        void unlocking.then(() => {
          settled = true;
        });
        const isSettled = () => settled;
        const waitsForLock = async () =>
          (await run.deps.lockManager.query()).pending?.some(
            ({ name }) =>
              name === "evolu-leaderlock-WrappedDeviceSecret-permanent",
          ) ?? false;
        while (!isSettled() && !(await waitsForLock()))
          await testWaitForWorkerMessage();
        assertFalse(isSettled());
        assertSame(calls.createKey, 0);
        await otherBuild[Symbol.asyncDispose]();
        assertOk(await unlocking);
        await using _app = await run.orThrow(
          createEvoluApp(Schema, {
            ...instantStartConfig,
            appName,
            createFirstAppOwner: false,
          }),
        );

        assertEqual(Object.fromEntries(keysByName), {
          // The wrapped DeviceSecret's database.
          "permanent-qufmXiL02Ib0OJasUdqxmA":
            "C6ztvR3sq09UT9CqOEKliQIDKjz_SmRhG7HonpL9UR0",
          // Instant start's device database.
          "permanent-9wQ1FYUqR4gyxFq5BwtLbQ":
            "mEBuTJIHwHm5vmsKvS4D8rsW2B3SUoSr9A8RFAW7v_g",
        });
        assertEqual(
          (
            drivers.selectAll("_evolu_wrappedDeviceSecret") as ReadonlyArray<{
              readonly ownerId: string;
              readonly id: string;
            }>
          ).map(({ ownerId, id }) => ({ ownerId, id })),
          [{ ownerId: "j1bDmNIOeGDXviQoiaGyJQ", id: "-FDb9hhb8diVYux6aiiKcw" }],
        );
      });

      it("keeps a wrapped DeviceSecret a delayed write of another setup stored while it removes a pending key the provider can't provide", async () => {
        using drivers = createSqliteDriverPerName();
        await using setup = await setupRunWithEvoluDeps({
          createSqliteDriver: drivers.createSqliteDriver,
        });
        const { run } = setup;
        const { keyProvider, failNextGet } = setupKeyProvider();
        // A pending key, which a refusal keeps.
        const refused = { type: "DeviceSecretKeyRefused" } as const;
        failNextGet(refused);
        assertErr(
          await run(
            unlockWrappedDeviceSecret({ appName: testAppName, keyProvider }),
          ),
          refused,
        );
        const wrapped = new Uint8Array(72).fill(7);

        // While the provider fails to provide the key, the write of a setup
        // that got it, such as in a tab that closed meanwhile, lands.
        const unavailable = { type: "DeviceSecretKeyUnavailable" } as const;
        const resumed = unlockWrappedDeviceSecret({
          appName: testAppName,
          keyProvider: {
            ...keyProvider,
            getKey: () => () => {
              drivers.execWhere(
                "_evolu_wrappedDeviceSecret",
                sql`
                  update "_evolu_wrappedDeviceSecret"
                  set "wrappedSecret" = ${wrapped};
                `,
              );
              return Promise.resolve(err(unavailable));
            },
          },
        });
        assertErr(await run(resumed), unavailable);

        assertEqual(
          wrappedDeviceSecretRows(drivers).map(
            ({ wrappedSecret }) => wrappedSecret,
          ),
          [wrapped],
        );
      });

      it("never starts another setup after an unlock error", async () => {
        using drivers = createSqliteDriverPerName();
        await using setup = await setupRunWithEvoluDeps({
          createSqliteDriver: drivers.createSqliteDriver,
        });
        const { run } = setup;
        const { keyProvider, calls, failNextGet, replaceKeys } =
          setupKeyProvider();
        const unlock = unlockWrappedDeviceSecret({
          appName: testAppName,
          keyProvider,
        });
        const created = await run.orThrow(unlock);
        const [stored] = wrappedDeviceSecretRows(drivers);

        for (const error of [
          { type: "DeviceSecretKeyRefused" },
          { type: "DeviceSecretKeyUnavailable" },
        ] as const) {
          failNextGet(error);
          assertErr(await run(unlock), error);
        }
        replaceKeys(run.deps);
        assertErr(await run(unlock), { type: "DeviceSecretUnwrapError" });

        assertSame(calls.createKey, 1);
        assertEqual(wrappedDeviceSecretRows(drivers), [stored]);
        assertTrue(await run.orThrow(hasWrappedDeviceSecret(testAppName)));
        assertNotUndefined(created);
      });

      it("forgets a stored secret whose key is gone, so the next unlock sets up again", async () => {
        using drivers = createSqliteDriverPerName();
        await using setup = await setupRunWithEvoluDeps({
          createSqliteDriver: drivers.createSqliteDriver,
        });
        const { run } = setup;
        const { keyProvider, calls } = setupKeyProvider();
        const unlock = unlockWrappedDeviceSecret({
          appName: testAppName,
          keyProvider,
        });
        // Nothing stored: nothing to forget.
        assertOk(await run(forgetWrappedDeviceSecret(testAppName)));
        const first = await run.orThrow(unlock);

        // The key is gone, as a deleted passkey.
        const refused = { type: "DeviceSecretKeyRefused" } as const;
        const lost = unlockWrappedDeviceSecret({
          appName: testAppName,
          keyProvider: {
            ...keyProvider,
            getKey: () => () => Promise.resolve(err(refused)),
          },
        });
        assertErr(await run(lost), refused);
        assertTrue(await run.orThrow(hasWrappedDeviceSecret(testAppName)));

        assertErr(
          await run(
            forgetWrappedDeviceSecret(testAppName, { onlyPending: true }),
          ),
          { type: "WrappedDeviceSecretStoredError" },
        );
        assertLength(wrappedDeviceSecretRows(drivers), 1);
        assertOk(await run(forgetWrappedDeviceSecret(testAppName)));
        assertEqual(wrappedDeviceSecretRows(drivers), []);
        assertFalse(await run.orThrow(hasWrappedDeviceSecret(testAppName)));

        const second = await run.orThrow(unlock);
        assertFalse(first.toString() === second.toString());
        assertSame(calls.createKey, 2);
        assertEqual(await run.orThrow(unlock), second);
        assertEqual(run.deps.reportDefect.getDefects(), []);
      });

      for (const onlyPending of [false, true])
        it(`forgets a setup's pending key, onlyPending ${onlyPending}`, async () => {
          using drivers = createSqliteDriverPerName();
          await using setup = await setupRunWithEvoluDeps({
            createSqliteDriver: drivers.createSqliteDriver,
          });
          const { run } = setup;
          const { keyProvider, calls, failNextGet } = setupKeyProvider();
          const unlock = unlockWrappedDeviceSecret({
            appName: testAppName,
            keyProvider,
          });
          failNextGet({ type: "DeviceSecretKeyRefused" });
          assertErr(await run(unlock), { type: "DeviceSecretKeyRefused" });
          assertLength(wrappedDeviceSecretRows(drivers), 1);

          assertOk(
            await run(forgetWrappedDeviceSecret(testAppName, { onlyPending })),
          );
          assertEqual(wrappedDeviceSecretRows(drivers), []);
          await run.orThrow(unlock);
          assertSame(calls.createKey, 2);
        });

      it("forgets only the record it read", async () => {
        using drivers = createSqliteDriverPerName();
        await using setup = await setupRunWithEvoluDeps({
          createSqliteDriver: drivers.createSqliteDriver,
        });
        const { run } = setup;
        const { keyProvider } = setupKeyProvider();
        await run.orThrow(
          unlockWrappedDeviceSecret({ appName: testAppName, keyProvider }),
        );
        // Another setup's record replaces the one the forget read, as when the
        // forget's write arrives late.
        const otherKeyId = new Uint8Array(16).fill(9);
        drivers.onNextStatement(
          (statement) =>
            statement.includes("select 1") &&
            statement.includes('"_evolu_wrappedDeviceSecret"'),
          () => {
            drivers.execWhere(
              "_evolu_wrappedDeviceSecret",
              sql`
                update "_evolu_wrappedDeviceSecret"
                set "keyId" = ${otherKeyId};
              `,
            );
          },
        );

        assertOk(await run(forgetWrappedDeviceSecret(testAppName)));
        assertEqual(
          (
            drivers.selectAll("_evolu_wrappedDeviceSecret") as ReadonlyArray<{
              readonly keyId: Uint8Array;
            }>
          ).map(({ keyId }) => keyId),
          [otherKeyId],
        );
      });

      it("forgets a stored secret while an unlock's prompt is open, and the next unlock sets up again", async () => {
        using drivers = createSqliteDriverPerName();
        await using setup = await setupRunWithEvoluDeps({
          createSqliteDriver: drivers.createSqliteDriver,
        });
        const { run } = setup;
        const { keyProvider, calls } = setupKeyProvider();
        const unlock = unlockWrappedDeviceSecret({
          appName: testAppName,
          keyProvider,
        });
        const first = await run.orThrow(unlock);
        // An unlock whose prompt the user hasn't answered, which takes no lock.
        const prompted = Promise.withResolvers<void>();
        const dismissed = Promise.withResolvers<void>();
        const prompting = run(
          unlockWrappedDeviceSecret({
            appName: testAppName,
            keyProvider: {
              ...keyProvider,
              getKey: () => async () => {
                prompted.resolve();
                await dismissed.promise;
                return err({ type: "DeviceSecretKeyRefused" });
              },
            },
          }),
        );
        await prompted.promise;

        try {
          const forgotten = await settleWithinWorkerMessages(
            run(forgetWrappedDeviceSecret(testAppName)),
          );
          assert(forgotten !== "pending", "The forget waited for the prompt.");
          assertOk(forgotten);
        } finally {
          dismissed.resolve();
        }
        assertErr(await prompting, { type: "DeviceSecretKeyRefused" });
        assertEqual(wrappedDeviceSecretRows(drivers), []);

        const second = await run.orThrow(unlock);
        assertFalse(first.toString() === second.toString());
        assertSame(calls.createKey, 2);
      });

      for (const onlyPending of [false, true])
        it(
          onlyPending
            ? "keeps what a setup running in another tab stored when forgetting only a pending key"
            : "forgets what a setup running in another tab stored, once the setup ends",
          async () => {
            using drivers = createSqliteDriverPerName();
            await using setup = await setupRunWithEvoluDeps({
              createSqliteDriver: drivers.createSqliteDriver,
            });
            const { run } = setup;
            const { keyProvider, failNextGet } = setupKeyProvider();
            const unlock = unlockWrappedDeviceSecret({
              appName: testAppName,
              keyProvider,
            });
            failNextGet({ type: "DeviceSecretKeyRefused" });
            assertErr(await run(unlock), { type: "DeviceSecretKeyRefused" });
            assertFalse(await run.orThrow(hasWrappedDeviceSecret(testAppName)));
            // A setup resuming the pending key, whose prompt to get the key the
            // user hasn't answered.
            const prompted = Promise.withResolvers<void>();
            const answered = Promise.withResolvers<void>();
            const settingUp = run(
              unlockWrappedDeviceSecret({
                appName: testAppName,
                keyProvider: {
                  ...keyProvider,
                  getKey: (keyId) => async (run) => {
                    prompted.resolve();
                    await answered.promise;
                    return run(keyProvider.getKey(keyId));
                  },
                },
              }),
            );
            await prompted.promise;

            const forgetting = run(
              forgetWrappedDeviceSecret(testAppName, { onlyPending }),
            );
            try {
              assertSame(
                await settleWithinWorkerMessages(forgetting),
                "pending",
              );
            } finally {
              answered.resolve();
            }
            const secret = await settingUp;
            assertOk(secret);
            if (onlyPending) {
              assertErr(await forgetting, {
                type: "WrappedDeviceSecretStoredError",
              });
              assertEqual(await run.orThrow(unlock), secret.value);
            } else {
              assertOk(await forgetting);
              assertEqual(wrappedDeviceSecretRows(drivers), []);
            }
          },
        );

      it("forgets nothing without waiting while a setup running in another tab creates the first key", async () => {
        using drivers = createSqliteDriverPerName();
        await using setup = await setupRunWithEvoluDeps({
          createSqliteDriver: drivers.createSqliteDriver,
        });
        const { run } = setup;
        const { keyProvider } = setupKeyProvider();
        // A setup whose prompt to create the key the user hasn't answered.
        const creating = Promise.withResolvers<void>();
        const created = Promise.withResolvers<void>();
        const settingUp = run(
          unlockWrappedDeviceSecret({
            appName: testAppName,
            keyProvider: {
              ...keyProvider,
              createKey: async (run) => {
                creating.resolve();
                await created.promise;
                return run(keyProvider.createKey);
              },
            },
          }),
        );
        await creating.promise;

        try {
          const forgotten = await settleWithinWorkerMessages(
            run(forgetWrappedDeviceSecret(testAppName)),
          );
          assert(forgotten !== "pending", "The forget waited for the setup.");
          assertOk(forgotten);
        } finally {
          created.resolve();
        }
        assertOk(await settingUp);
        assertTrue(await run.orThrow(hasWrappedDeviceSecret(testAppName)));
      });

      it("resumes a setup that stopped after creating its key", async () => {
        using drivers = createSqliteDriverPerName();
        await using setup = await setupRunWithEvoluDeps({
          createSqliteDriver: drivers.createSqliteDriver,
        });
        const { run } = setup;
        const { keyProvider, calls, failNextGet } = setupKeyProvider();
        const unlock = unlockWrappedDeviceSecret({
          appName: testAppName,
          keyProvider,
        });

        failNextGet({ type: "DeviceSecretKeyRefused" });
        assertErr(await run(unlock), { type: "DeviceSecretKeyRefused" });
        assertEqual(
          wrappedDeviceSecretRows(drivers).map((row) => row.wrappedSecret),
          [null],
        );
        assertFalse(await run.orThrow(hasWrappedDeviceSecret(testAppName)));

        const secret = await run.orThrow(unlock);
        // The key created before is used, so no passkey is orphaned.
        assertSame(calls.createKey, 1);
        assertEqual(await run.orThrow(unlock), secret);
      });

      it("creates another key when the provider can't provide the first", async () => {
        using drivers = createSqliteDriverPerName();
        await using setup = await setupRunWithEvoluDeps({
          createSqliteDriver: drivers.createSqliteDriver,
        });
        const { run } = setup;
        const { keyProvider, calls, failNextGet } = setupKeyProvider();
        const unlock = unlockWrappedDeviceSecret({
          appName: testAppName,
          keyProvider,
        });

        failNextGet({ type: "DeviceSecretKeyUnavailable" });
        assertErr(await run(unlock), { type: "DeviceSecretKeyUnavailable" });
        assertEqual(wrappedDeviceSecretRows(drivers), []);

        await run.orThrow(unlock);
        assertSame(calls.createKey, 2);
      });

      it("keeps a refused pending key, so the next unlock prompts for the same key without creating another", async () => {
        using drivers = createSqliteDriverPerName();
        await using setup = await setupRunWithEvoluDeps({
          createSqliteDriver: drivers.createSqliteDriver,
        });
        const { run } = setup;
        const { keyProvider, calls, failNextGet } = setupKeyProvider();
        const promptedKeyIds: Array<string> = [];
        const unlock = unlockWrappedDeviceSecret({
          appName: testAppName,
          keyProvider: {
            ...keyProvider,
            getKey: (keyId) => {
              promptedKeyIds.push(keyId.toString());
              return keyProvider.getKey(keyId);
            },
          },
        });

        // Dismissed prompts, which a deleted passkey looks like.
        for (let i = 0; i < 2; i++) {
          failNextGet({ type: "DeviceSecretKeyRefused" });
          assertErr(await run(unlock), { type: "DeviceSecretKeyRefused" });
        }
        assertEqual(
          wrappedDeviceSecretRows(drivers).map((row) => row.wrappedSecret),
          [null],
        );

        await run.orThrow(unlock);
        assertSame(calls.createKey, 1);
        assertLength(promptedKeyIds, 3);
        assertSame(new Set(promptedKeyIds).size, 1);
      });

      it("keeps a resumed key after a provider failure", async () => {
        using drivers = createSqliteDriverPerName();
        await using setup = await setupRunWithEvoluDeps({
          createSqliteDriver: drivers.createSqliteDriver,
        });
        const { run } = setup;
        const { keyProvider, calls, failNextGet } = setupKeyProvider();
        const unlock = unlockWrappedDeviceSecret({
          appName: testAppName,
          keyProvider,
        });

        failNextGet({ type: "DeviceSecretKeyRefused" });
        assertErr(await run(unlock), { type: "DeviceSecretKeyRefused" });
        const failure = createUnknownError(new Error("Provider failed."));
        failNextGet(failure);
        assertErr(await run(unlock), failure);
        assertEqual(
          wrappedDeviceSecretRows(drivers).map((row) => row.wrappedSecret),
          [null],
        );

        await run.orThrow(unlock);
        assertSame(calls.createKey, 1);
      });

      /** Unlocks within a bound, so a wait for the lock fails the test at once. */
      const unlockInTime = async (
        run: Awaited<ReturnType<typeof setupRunWithEvoluDeps>>["run"],
        unlock: ReturnType<typeof unlockWrappedDeviceSecret>,
      ): Promise<DeviceSecret> => {
        let unlocked = null as DeviceSecret | null;
        void run(unlock).then((result) => {
          if (result.ok) unlocked = result.value;
        }, constVoid);
        for (let i = 0; i < 30; i++) {
          if (unlocked) break;
          await testWaitForWorkerMessage();
        }
        assertNotNull(unlocked);
        return unlocked;
      };

      const wrappedDeviceSecretLockName = `evolu-leaderlock-WrappedDeviceSecret-${testAppName}`;
      const isWrappedDeviceSecretLockHeld = async (lockManager: LockManager) =>
        (await lockManager.query()).held?.some(
          (lock) => lock.name === wrappedDeviceSecretLockName,
        ) ?? false;

      it("fails an unlock with the refusal while its database is refused, without taking its lock", async () => {
        let refused = true;
        await using setup = await setupRunWithEvoluDeps({
          waitForDatabaseRelease: (name) => () =>
            refused ? err({ type: "DatabaseHeldError", name }) : ok(),
        });
        const { run } = setup;
        const { keyProvider, calls } = setupKeyProvider();
        const unlock = unlockWrappedDeviceSecret({
          appName: testAppName,
          keyProvider,
        });

        const reported = setup.waitForTabError();
        const unlocking = run(unlock);
        await reported;
        const outcome = await settleWithinWorkerMessages(unlocking);
        assert(outcome !== "pending", "The unlock waited for the database.");
        assertErr(outcome);
        assertSame(outcome.error.type, "UnknownError");
        // Its read of the row failed, so it took no lock and prompted for
        // nothing.
        assertFalse(await isWrappedDeviceSecretLockHeld(run.deps.lockManager));
        assertEqual(calls, { createKey: 0, getKey: 0 });
        refused = false;
      });

      it("unlocks while another tab's unlock waits for a worker that never answers", async () => {
        using drivers = createSqliteDriverPerName();
        await using setup = await setupRunWithEvoluDeps({
          createSqliteDriver: drivers.createSqliteDriver,
        });
        const { run } = setup;
        const { keyProvider } = setupKeyProvider();
        const unlock = unlockWrappedDeviceSecret({
          appName: testAppName,
          keyProvider,
        });
        // A tab whose stored worker failed to start, so a disposed port drops
        // what it posts and nothing answers its reads.
        const closed = testCreateMessageChannel<
          SharedWorkerInput,
          SharedWorkerOutput
        >();
        closed[Symbol.dispose]();
        await using stuckTab = run.create({
          ...run.deps,
          storedWorker: Promise.resolve({
            port: closed.port1,
            [Symbol.dispose]: constVoid,
          }),
        });
        const stuck = stuckTab.abortable(unlock);
        await testWaitForWorkerMessage();

        const created = await unlockInTime(run, unlock);
        assertEqual(await unlockInTime(run, unlock), created);

        stuck.abort();
        assertErr(await stuck);
      });

      it("unlocks a stored DeviceSecret while another tab waits for its prompt", async () => {
        using drivers = createSqliteDriverPerName();
        await using setup = await setupRunWithEvoluDeps({
          createSqliteDriver: drivers.createSqliteDriver,
        });
        const { run } = setup;
        const { keyProvider } = setupKeyProvider();
        const unlock = unlockWrappedDeviceSecret({
          appName: testAppName,
          keyProvider,
        });
        const created = await run.orThrow(unlock);
        // A tab whose prompt the user hasn't answered yet.
        const prompted = Promise.withResolvers<void>();
        const answered = Promise.withResolvers<void>();
        const prompting = run(
          unlockWrappedDeviceSecret({
            appName: testAppName,
            keyProvider: {
              ...keyProvider,
              getKey: (keyId) => async (run) => {
                prompted.resolve();
                await answered.promise;
                return run(keyProvider.getKey(keyId));
              },
            },
          }),
        );
        await prompted.promise;

        try {
          assertEqual(await unlockInTime(run, unlock), created);
        } finally {
          answered.resolve();
        }
        assertEqual(getOrThrow(await prompting), created);
      });

      it("fails when SQLite fails the read of the wrapped DeviceSecret, without a defect", async () => {
        using drivers = createSqliteDriverPerName();
        await using setup = await setupRunWithEvoluDeps({
          createSqliteDriver: drivers.createSqliteDriver,
        });
        const { run } = setup;
        const { keyProvider } = setupKeyProvider();
        const failNextRead = () => {
          drivers.onNextStatement(
            (statement) =>
              statement.includes('"_evolu_wrappedDeviceSecret"') &&
              statement.startsWith("select"),
            () => {
              throw new Error("Disk I/O error.");
            },
          );
        };

        failNextRead();
        const has = await run(hasWrappedDeviceSecret(testAppName));
        assertErr(has);
        assertSame(has.error.type, "UnknownError");
        failNextRead();
        const unlocked = await run(
          unlockWrappedDeviceSecret({ appName: testAppName, keyProvider }),
        );
        assertErr(unlocked);
        assertSame(unlocked.error.type, "UnknownError");
        failNextRead();
        const forgotten = await run(forgetWrappedDeviceSecret(testAppName));
        assertErr(forgotten);
        assertSame(forgotten.error.type, "UnknownError");
        assertEqual(run.deps.reportDefect.getDefects(), []);
      });

      it("never stores a wrapped DeviceSecret under a key another setup's delayed write left", async () => {
        using drivers = createSqliteDriverPerName();
        await using setup = await setupRunWithEvoluDeps({
          createSqliteDriver: drivers.createSqliteDriver,
        });
        const { run } = setup;
        const { keyProvider } = setupKeyProvider();
        let replaced = false;
        const unlock = unlockWrappedDeviceSecret({
          appName: testAppName,
          keyProvider: {
            ...keyProvider,
            getKey: (keyId) => (run) => {
              // Another setup's delayed write replaces the pending key's ID.
              if (!replaced) {
                replaced = true;
                drivers.execWhere(
                  "_evolu_wrappedDeviceSecret",
                  sql`
                    update "_evolu_wrappedDeviceSecret"
                    set "keyId" = ${new Uint8Array(16).fill(9)};
                  `,
                );
              }
              return run(keyProvider.getKey(keyId));
            },
          },
        });

        const unlocked = await run(unlock);
        assertErr(unlocked);
        assertSame(unlocked.error.type, "UnknownError");
        assertEqual(
          (
            drivers.selectAll("_evolu_wrappedDeviceSecret") as ReadonlyArray<{
              readonly wrappedSecret: Uint8Array | null;
            }>
          ).map(({ wrappedSecret }) => wrappedSecret),
          [null],
        );
      });

      it("keeps a wrapped DeviceSecret another setup stored before this setup's pending key arrives", async () => {
        using drivers = createSqliteDriverPerName();
        await using setup = await setupRunWithEvoluDeps({
          createSqliteDriver: drivers.createSqliteDriver,
        });
        const { run } = setup;
        const { keyProvider, calls } = setupKeyProvider();
        const secret = await run.orThrow(
          unlockWrappedDeviceSecret({ appName: testAppName, keyProvider }),
        );
        const [stored] = wrappedDeviceSecretRows(drivers);

        // The next setup reads before the row is there, as when another setup
        // stores it meanwhile, which then lands before this one's pending key.
        const { keyId } = drivers.selectAll(
          "_evolu_wrappedDeviceSecret",
        )[0] as { readonly keyId: Uint8Array };
        drivers.onNextStatement(
          (statement) =>
            statement.startsWith("select") &&
            statement.includes('"_evolu_wrappedDeviceSecret"'),
          () => {
            drivers.execWhere(
              "_evolu_wrappedDeviceSecret",
              sql`update "_evolu_wrappedDeviceSecret" set "keyId" = null;`,
            );
          },
        );
        const unlocked = await run.orThrow(
          unlockWrappedDeviceSecret({
            appName: testAppName,
            keyProvider: {
              ...keyProvider,
              createKey: (run) => {
                drivers.execWhere(
                  "_evolu_wrappedDeviceSecret",
                  sql`
                    update "_evolu_wrappedDeviceSecret" set "keyId" = ${keyId};
                  `,
                );
                return run(keyProvider.createKey);
              },
            },
          }),
        );

        assertEqual(unlocked, secret);
        assertEqual(wrappedDeviceSecretRows(drivers), [stored]);
        assertSame(calls.createKey, 2);
      });

      it("keeps the wrapped DeviceSecrets of app names that differ only in letter case apart", async () => {
        using drivers = createSqliteDriverPerName();
        await using setup = await setupRunWithEvoluDeps({
          createSqliteDriver: drivers.createSqliteDriver,
        });
        const { run } = setup;
        const { keyProvider } = setupKeyProvider();

        for (const appName of ["wallet", "Wallet"])
          await run.orThrow(
            unlockWrappedDeviceSecret({
              appName: AppName.orThrow(appName),
              keyProvider,
            }),
          );
        // macOS's file system and WebKit's OPFS fold the case of names.
        const names = drivers.names().map((name) => name.toLowerCase());
        assertSame(new Set(names).size, names.length);
        assertLength(names, 2);
      });

      it("asks for persistent storage before it stores a setup's pending key, and not to unlock", async () => {
        using drivers = createSqliteDriverPerName();
        // How many rows the table held at each request.
        const rowCounts: Array<number> = [];
        await using setup = await setupRunWithEvoluDeps({
          createSqliteDriver: drivers.createSqliteDriver,
          requestPersistentStorage: () => {
            rowCounts.push(wrappedDeviceSecretRows(drivers).length);
          },
        });
        const { run } = setup;
        const { keyProvider } = setupKeyProvider();
        const unlock = unlockWrappedDeviceSecret({
          appName: testAppName,
          keyProvider,
        });

        await run.orThrow(unlock);
        await run.orThrow(unlock);

        assertEqual(rowCounts, [0]);
      });

      it("creates no key and opens no database where the platform keeps nothing", async () => {
        using drivers = createSqliteDriverPerName();
        await using setup = await setupRunWithEvoluDeps({
          createSqliteDriver: drivers.createSqliteDriver,
          devicePersistence: "NotPersisted",
        });
        const { run } = setup;
        const { keyProvider, calls } = setupKeyProvider();

        assertErr(
          await run(
            unlockWrappedDeviceSecret({ appName: testAppName, keyProvider }),
          ),
          { type: "WrappedDeviceSecretNotPersisted" },
        );
        assertFalse(await run.orThrow(hasWrappedDeviceSecret(testAppName)));
        assertOk(await run(forgetWrappedDeviceSecret(testAppName)));
        assertEqual(calls, { createKey: 0, getKey: 0 });
        assertEqual(drivers.names(), []);
      });

      it("lets a second tab wait and unlock what the first one created", async () => {
        using drivers = createSqliteDriverPerName();
        await using setup = await setupRunWithEvoluDeps({
          createSqliteDriver: drivers.createSqliteDriver,
        });
        const { run } = setup;
        const { keyProvider, calls } = setupKeyProvider();
        const unlock = unlockWrappedDeviceSecret({
          appName: testAppName,
          keyProvider,
        });

        const [first, second] = await Promise.all([
          run.orThrow(unlock),
          run.orThrow(unlock),
        ]);

        assertEqual(first, second);
        assertEqual(calls, { createKey: 1, getKey: 2 });
        assertLength(wrappedDeviceSecretRows(drivers), 1);
      });
    });
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
        onSuccess: () => {
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
            sql: 'create index evolu_history_ownerId_timestamp\n        on evolu_history ("ownerId", "timestamp")',
          },
          {
            name: "evolu_history_ownerId_table_id_column_timestampDesc",
            sql: 'create unique index evolu_history_ownerId_table_id_column_timestampDesc\n        on evolu_history ("ownerId", "table", "id", "column", "timestamp" desc)',
          },
          {
            name: "evolu_timestamp_index",
            sql: 'create index evolu_timestamp_index\n      on evolu_timestamp ("ownerId", "l", "t", "h1", "h2", "c")',
          },
          {
            name: "evolu_message_quarantine_reason_timestamp",
            sql: 'create index evolu_message_quarantine_reason_timestamp\n      on evolu_message_quarantine ("reason", "timestamp")',
          },
          {
            name: "evolu_todo_id",
            sql: 'create index "evolu_todo_id"\n        on "todo" ("id")',
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
                0, 0, 0, 0, 0, 0, 0, 1, 120, 253, 235, 43, 70, 111, 255, 193,
              ]),
            },
          ],
        },
        {
          name: "evolu_history",
          rows: [
            {
              column: "title",
              id: idToIdBytes(insertedId),
              ownerId: new Uint8Array([
                5, 39, 254, 242, 108, 77, 142, 9, 59, 219, 32, 254, 15, 186,
                235, 212,
              ]),
              table: "todo",
              timestamp: new Uint8Array([
                0, 0, 0, 0, 0, 0, 0, 1, 120, 253, 235, 43, 70, 111, 255, 193,
              ]),
              value: "Integration todo",
            },
            {
              column: "createdAt",
              id: idToIdBytes(insertedId),
              ownerId: new Uint8Array([
                5, 39, 254, 242, 108, 77, 142, 9, 59, 219, 32, 254, 15, 186,
                235, 212,
              ]),
              table: "todo",
              timestamp: new Uint8Array([
                0, 0, 0, 0, 0, 0, 0, 1, 120, 253, 235, 43, 70, 111, 255, 193,
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
              h1: 257135876076200,
              h2: 251706332880663,
              l: 1,
              ownerId: new Uint8Array([
                5, 39, 254, 242, 108, 77, 142, 9, 59, 219, 32, 254, 15, 186,
                235, 212,
              ]),
              t: new Uint8Array([
                0, 0, 0, 0, 0, 0, 0, 1, 120, 253, 235, 43, 70, 111, 255, 193,
              ]),
            },
          ],
        },
        {
          name: "evolu_usage",
          rows: [
            {
              firstTimestamp: new Uint8Array([
                0, 0, 0, 0, 0, 0, 0, 1, 120, 253, 235, 43, 70, 111, 255, 193,
              ]),
              lastTimestamp: new Uint8Array([
                0, 0, 0, 0, 0, 0, 0, 1, 120, 253, 235, 43, 70, 111, 255, 193,
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
              id: insertedId,
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
    const onSuccess = () => {
      pendingMutations -= 1;
      if (pendingMutations === 0) mutationsCompleted.resolve();
    };

    const insertedId = evolu.insert(
      "todo",
      {
        title: NonEmptyTrimmedString100.orThrow("Inserted null"),
        isCompleted: null,
      },
      { onSuccess },
    ).id;
    const updatedId = evolu.insert(
      "todo",
      {
        title: NonEmptyTrimmedString100.orThrow("Updated null"),
        isCompleted: SqliteBoolean.orThrow(1),
      },
      { onSuccess },
    ).id;
    evolu.update("todo", { id: updatedId, isCompleted: null }, { onSuccess });
    const upsertedId = TodoId.orThrow(createIdFromString("upserted-null"));
    evolu.upsert(
      "todo",
      {
        id: upsertedId,
        title: NonEmptyTrimmedString100.orThrow("Upserted null"),
        isCompleted: null,
      },
      { onSuccess },
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
        onSuccess: () => {
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

  it("stores a drifted mutation in quarantine that a subscribed query shows before onSuccess", async () => {
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
      { onSuccess: ahead.resolve },
    );
    await ahead.promise;

    // After system time is corrected, the next write is quarantined. The
    // subscribed quarantine query already shows it when onSuccess runs.
    shift = 0;
    let rowsInOnSuccess: ReadonlyArray<typeof quarantineQuery.Row> | undefined;
    const quarantined = Promise.withResolvers<void>();
    evolu.insert(
      "todo",
      { title: NonEmptyTrimmedString100.orThrow("Quarantined") },
      {
        onSuccess: () => {
          rowsInOnSuccess = evolu.getQueryRows(quarantineQuery);
          quarantined.resolve();
        },
      },
    );
    await quarantined.promise;
    unsubscribe();
    assertNotUndefined(rowsInOnSuccess);
    const quarantinedRow = {
      reason: QuarantineReason.TimestampDrift,
      origin: QuarantineOrigin.LocalMutation,
      quarantinedAt: Millis.orThrow(0),
    };
    assertEqual(rowsInOnSuccess, [
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
      { onSuccess: after.resolve },
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

    // Shared, as the platform shares it, so the DbWorker sees the
    // SharedWorker that requested it running.
    const lockManager = testCreateLockManager();
    const run = testCreateRun({
      consoleStoreOutputEntry: consoleStoreOutput.entry,
      createBroadcastChannel,
      createMessageChannel,
      createMessagePort,
      createWebSocket: testCreateWebSocket({ throwOnCreate: true }),
      getDevicePersistence: () => Promise.resolve("Unknown" as const),
      lockManager,
    });

    const workerRun = testCreateRun({
      consoleStoreOutputEntry: consoleStoreOutput.entry,
      createBroadcastChannel,
      createMessagePort,
      lockManager,
      createSqliteDriver,
      // The database is in memory, so there are no files to delete.
      deleteDatabaseFiles: () => () => ok(),
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
        storedWorker: Promise.resolve(sharedWorker),
      },
    );

    await sqliteDriverOptionsCalled.promise;

    assertEqual(sqliteDriverOptions, [{ mode: "memory" }]);
  });

  it("runs onSuccess of a local-only update of a missing row, which creates nothing", async () => {
    await using setup = await setupRunWithEvoluDeps();
    const DraftId = id("Draft");
    const LocalSchema = {
      _draft: { id: DraftId, title: NonEmptyTrimmedString100 },
    };
    await using evolu = await setup.run.ok(
      createEvolu(LocalSchema, {
        appName: testAppName,
        appOwner: testAppOwner,
        transports: [],
      }),
    );

    const updated = Promise.withResolvers<void>();
    evolu.update(
      "_draft",
      {
        id: DraftId.orThrow(createIdFromString("missing")),
        title: NonEmptyTrimmedString100.orThrow("Updated"),
      },
      { onSuccess: updated.resolve, onError: updated.reject },
    );
    await updated.promise;

    assertEqual(
      await evolu.loadQuery(
        createQueryBuilder(LocalSchema)((db) =>
          db.selectFrom("_draft").select("id"),
        ),
      ),
      [],
    );
  });

  it("rejects an uncached load of a refused database while its cached load stays pending", async () => {
    await using setup = await setupRunWithEvoluDeps({
      waitForDatabaseRelease: (name) => () =>
        err({ type: "DatabaseHeldError", name }),
    });
    const reported = setup.waitForTabError();
    const evolu = await setup.run.ok(setup.createIntegrationEvolu);
    await reported;

    const cached = evolu.loadQuery(todoByCreatedAtQuery);
    const uncached = evolu.loadQuery(todoByCreatedAtQuery, { cache: false });

    assertEqual(
      await settleWithinWorkerMessages(
        uncached.then(constVoid, (error: unknown) => error),
      ),
      createUnknownError({ type: "DatabaseHeldError", name: evolu.name }),
    );
    assertSame(await settleWithinWorkerMessages(cached), "pending");
  });

  it("runs a mutation's onError with the refusal, for one queued before the database was refused and one made after", async () => {
    const consoleStoreOutput = createConsoleStoreOutput();
    await using run = testCreateRun({
      consoleStoreOutputEntry: consoleStoreOutput.entry,
      createBroadcastChannel,
      createMessageChannel,
      createMessagePort,
      createWebSocket: testCreateWebSocket({ throwOnCreate: true }),
      getDevicePersistence: () => Promise.resolve("Unknown" as const),
      lockManager: testCreateLockManager(),
    });
    using sharedWorker = testCreateSharedWorker<
      SharedWorkerInput,
      SharedWorkerOutput
    >();
    void run(initSharedWorker(sharedWorker.self));
    sharedWorker.connect();
    await using evoluRun = run.create({
      ...run.deps,
      createDbWorker: testCreateWorker,
      reloadApp: constVoid,
      storedWorker: Promise.resolve(sharedWorker),
    });
    const evolu = await evoluRun.ok(
      createEvolu(Schema, {
        appName: testAppName,
        appOwner: testAppOwner,
        transports: [],
      }),
    );
    const insert = (): Promise<unknown> =>
      new Promise((resolve) => {
        evolu.insert(
          "todo",
          { title: NonEmptyTrimmedString100.orThrow("Refused") },
          { onSuccess: () => resolve("stored"), onError: resolve },
        );
      });
    const refusal = createUnknownError({
      type: "DatabaseHeldError",
      name: evolu.name,
    });

    // No tab leads yet, so the tenant queues the mutation.
    const queued = insert();
    await testWaitForWorkerMessage();
    // A tab announces itself, and its DbWorker refuses the database.
    sharedWorker.port.onMessage = (message) => {
      if (message.type !== "DbWorkerInit") return;
      createMessagePort<DbWorkerOutput, DbWorkerInput>(
        message.port,
      ).postMessage({
        type: "LeaderRefused",
        error: { type: "DatabaseHeldError", name: message.name },
      });
    };
    sharedWorker.port.postMessage({
      type: "AnnounceTabLeader",
      consoleLevel: "silent",
    });
    assertEqual(await settleWithinWorkerMessages(queued), refusal);

    assertEqual(await settleWithinWorkerMessages(insert()), refusal);
  });

  it("keeps a memoryOnly database apart from the stored one of the same owner", async () => {
    const openedDatabases: Array<{
      readonly name: Name;
      readonly mode: SqliteDriverOptions["mode"] | undefined;
    }> = [];
    await using setup = await setupRunWithEvoluDeps({
      createSqliteDriver: (name, options) => {
        openedDatabases.push({ name, mode: options?.mode });
        return testCreateSqliteDep.createSqliteDriver(name, options);
      },
    });
    const { run } = setup;
    const stored = await run.ok(setup.createIntegrationEvolu);
    const inserted = Promise.withResolvers<void>();
    stored.insert(
      "todo",
      { title: NonEmptyTrimmedString100.orThrow("Stored") },
      { onSuccess: inserted.resolve },
    );
    await inserted.promise;

    // Opened while the stored one is open, as by a switch that stops keeping
    // data on the device.
    const memory = await run.ok(
      createEvolu(Schema, {
        appName: testAppName,
        appOwner: testAppOwner,
        transports: [],
        memoryOnly: true,
      }),
    );

    assertFalse(memory.name === stored.name);
    assertSame(await memory.devicePersistence, "NotPersisted");
    assertEqual(await memory.loadQuery(todoTitlesQuery), []);
    assertEqual(await stored.loadQuery(todoTitlesQuery), [{ title: "Stored" }]);
    assertEqual(openedDatabases, [
      { name: stored.name, mode: "encrypted" },
      { name: memory.name, mode: "memory" },
    ]);
  });

  it("disposes an instance's private worker and removes its sync state", async () => {
    using disposer = new DisposableStack();
    const workerId = createIdFromString<"SharedWorker">(
      "owned-memory-instance",
    );
    const syncStateChannelName = `evolu:sync-state:${workerId}`;
    using syncStateChannel =
      createBroadcastChannel<SyncState>(syncStateChannelName);
    let privateState: SyncState = { transports: [], tenants: [] };
    const privateWorker = disposer.use(
      testCreateSharedWorker<SharedWorkerInput, SharedWorkerOutput>(),
    );
    let isPrivateWorkerDisposed = false;
    privateWorker.self.onConnect = (port) => {
      port.onMessage = (message) => {
        if (message.type === "CreateEvolu") {
          privateState = {
            transports: [],
            tenants: [{ type: "Active", name: message.name, owners: [] }],
          };
        }
        if (
          message.type === "CreateEvolu" ||
          message.type === "RequestSyncState"
        )
          syncStateChannel.postMessage(privateState);
      };
      port.postMessage({
        type: "Connected",
        workerId,
        syncStateChannelName,
        consoleEntryOrErrorChannelName: `${consoleEntryOrErrorBroadcastChannelName}:${workerId}`,
      });
    };
    const createMemoryInstanceWorker = (): SharedWorker => {
      privateWorker.connect();
      return {
        port: privateWorker.port,
        [Symbol.dispose]: () => {
          isPrivateWorkerDisposed = true;
          privateWorker[Symbol.dispose]();
        },
      };
    };
    const sharedWorker = disposer.use(
      testCreateSharedWorker<SharedWorkerInput, SharedWorkerOutput>(),
    );
    sharedWorker.self.onConnect = (port) => {
      port.onMessage = constVoid;
    };
    sharedWorker.connect();
    using deps = createEvoluDeps({
      createBroadcastChannel,
      createDbWorker: testCreateWorker,
      createMessageChannel,
      createMemoryInstanceWorker,
      getDevicePersistence: () => Promise.resolve("Unknown"),
      lockManager: testCreateLockManager(),
      reloadApp: constVoid,
      createStoredWorker: () => sharedWorker,
    });
    await using run = testCreateRun(deps);
    await using evolu = await run.ok(
      createEvolu(Schema, {
        appName: testAppName,
        appOwner: testAppOwner,
        memoryOnly: true,
        transports: [],
      }),
    );
    await testWaitForWorkerMessage();

    assertEqual(deps.syncState.get()?.tenants, [
      { type: "Active", name: evolu.name, owners: [] },
    ]);
    assertFalse(isPrivateWorkerDisposed);

    await evolu[Symbol.asyncDispose]();

    assertTrue(isPrivateWorkerDisposed);
    assertEqual(deps.syncState.get()?.tenants, []);
  });

  it("keeps a refused database's loads and export pending until disposal and never runs a mutation's onSuccess", async () => {
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
    let succeeded = false;
    evolu.insert(
      "todo",
      { title: NonEmptyTrimmedString100.orThrow("Lost") },
      {
        onSuccess: () => {
          succeeded = true;
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
    // Another instance in the same tab, a new attempt of the app, tells the
    // tab again.
    const second = await run.ok(createIntegrationEvolu);
    await testWaitForWorkerMessage();
    assertEqual(setup.tabErrors, [error, error]);
    assertFalse(laterSettled);
    assertFalse(exportSettled);
    assertFalse(succeeded);
    assertEqual(getSqliteSnapshot({ sqlite }), before);

    await second[Symbol.asyncDispose]();
    await evolu[Symbol.asyncDispose]();
    assertEqual(await pending, []);
    assertEqual(await later, []);
    assertEqual(await exportResult, { type: "EvoluDisposedError" });
    assertFalse(succeeded);
  });

  it("reports a database another context holds once to each tab and refuses its tenant", async () => {
    await using setup = await setupRunWithEvoluDeps({
      waitForDatabaseRelease: (name) => () =>
        err({ type: "DatabaseHeldError", name }),
    });
    const { createIntegrationEvolu, run } = setup;

    const firstReported = setup.waitForTabError();
    const first = await run.ok(createIntegrationEvolu);
    const firstLoad = first.loadQuery(todoByCreatedAtQuery);
    await firstReported;
    const error = { type: "DatabaseHeldError", name: first.name };
    assertEqual(setup.tabErrors, [error]);

    // The existing tab hosts the leader; the later tab only joins its tenant.
    await using _leaderLock = await run.ok(
      acquireLeaderLock(`tab-${setup.workerId}`),
    );
    using lateDeps = createEvoluDeps({
      ...run.deps,
      createStoredWorker: setup.connectLaterTab,
    });
    const reported = Promise.withResolvers<void>();
    lateDeps.evoluError.subscribe(reported.resolve);
    const tenantRefused = Promise.withResolvers<void>();
    lateDeps.syncState.subscribe(() => {
      if (lateDeps.syncState.get()?.tenants[0]?.type === "Refused")
        tenantRefused.resolve();
    });
    await using lateRun = run.create(lateDeps);
    const second = await lateRun.ok(createIntegrationEvolu);
    const secondLoad = second.loadQuery(todoByCreatedAtQuery);
    await reported.promise;
    assertEqual(lateDeps.evoluError.get(), error);
    await tenantRefused.promise;
    assertEqual(lateDeps.syncState.get()?.tenants, [
      { type: "Refused", name: first.name, error },
    ]);
    // The first tab was not told again.
    assertEqual(setup.tabErrors, [error]);

    await second[Symbol.asyncDispose]();
    await first[Symbol.asyncDispose]();
    assertEqual(await secondLoad, []);
    assertEqual(await firstLoad, []);
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
    await using _leaderLock = await run.ok(
      acquireLeaderLock(`tab-${setup.workerId}`),
    );
    using lateDeps = createEvoluDeps({
      ...run.deps,
      createStoredWorker: setup.connectLaterTab,
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

  describe("deleteDatabase", () => {
    it("deletes the database for every tab, and a later instance starts it again", async () => {
      const deletedNames: Array<Name> = [];
      const reloads: Array<string | undefined> = [];
      await using setup = await setupRunWithEvoluDeps({
        // Each DbWorker opens its own memory database, so the revived one
        // starts empty.
        createSqliteDriver: testCreateSqliteDep.createSqliteDriver,
        deleteDatabaseFiles: (name) => () => {
          deletedNames.push(name);
          return ok();
        },
        reloadApp: (url) => {
          reloads.push(url);
        },
      });
      const { run, createIntegrationEvolu } = setup;
      await using caller = await run.ok(createIntegrationEvolu);
      using laterTabDeps = createEvoluDeps({
        ...run.deps,
        createStoredWorker: setup.connectLaterTab,
      });
      await using laterTabRun = run.create(laterTabDeps);
      const otherTabDeleted = Promise.withResolvers<void>();
      await using otherTab = await laterTabRun.ok(
        createEvolu(Schema, {
          appName: testAppName,
          appOwner: testAppOwner,
          transports: [],
          onDatabaseDeleted: otherTabDeleted.resolve,
        }),
      );
      caller.insert("todo", {
        title: NonEmptyTrimmedString100.orThrow("Deleted"),
      });
      assertEqual(await otherTab.loadQuery(todoTitlesQuery), [
        { title: "Deleted" },
      ]);

      assertEqual(await caller.deleteDatabase(), ok());
      await otherTabDeleted.promise;

      assertEqual(deletedNames.at(0), caller.name);
      // The tab that asked reloads too, as it has no onDatabaseDeleted.
      assertEqual(reloads, [undefined]);
      for (const evolu of [caller, otherTab])
        assertThrowsInstanceOf(() => {
          evolu.getQueryRows(todoTitlesQuery);
        }, Error);

      await using revived = await run.ok(createIntegrationEvolu);
      revived.insert("todo", {
        title: NonEmptyTrimmedString100.orThrow("Revived"),
      });
      assertEqual(await revived.loadQuery(todoTitlesQuery), [
        { title: "Revived" },
      ]);
    });

    it("deletes once for instances that ask at the same time, and answers both", async () => {
      const deletedNames: Array<Name> = [];
      await using setup = await setupRunWithEvoluDeps({
        deleteDatabaseFiles: (name) => () => {
          deletedNames.push(name);
          return ok();
        },
      });
      const { run, createIntegrationEvolu } = setup;
      await using first = await run.ok(createIntegrationEvolu);
      await using second = await run.ok(createIntegrationEvolu);
      assertEqual(await first.loadQuery(todoTitlesQuery), []);

      assertEqual(
        await Promise.all([first.deleteDatabase(), second.deleteDatabase()]),
        [ok(), ok()],
      );
      assertEqual(deletedNames, [first.name]);
    });

    it("answers a failed deletion, after which the instances keep working and get what waited", async () => {
      const error = createUnknownError(new Error("disk I/O error"));
      await using setup = await setupRunWithEvoluDeps({
        deleteDatabaseFiles: () => () => err(error),
      });
      const { run, createIntegrationEvolu } = setup;
      await using evolu = await run.ok(createIntegrationEvolu);
      assertEqual(await evolu.loadQuery(todoTitlesQuery), []);

      const deleting = evolu.deleteDatabase();
      // Made after the deletion, so it waits for its outcome.
      evolu.insert("todo", {
        title: NonEmptyTrimmedString100.orThrow("Waited"),
      });
      assertEqual(await deleting, err(error));
      evolu.insert("todo", {
        title: NonEmptyTrimmedString100.orThrow("Kept working"),
      });
      assertEqual(await evolu.loadQuery(todoTitlesQuery), [
        { title: "Kept working" },
        { title: "Waited" },
      ]);
    });

    it("deletes a database that doesn't open, a corrupt one and one of a newer version", async () => {
      const refusals: ReadonlyArray<UnknownError | UnsupportedDbVersionError> =
        [
          createUnknownError(new Error("file is not a database")),
          {
            type: "UnsupportedDbVersionError",
            storedVersion: PositiveInt.orThrow(3),
            supportedVersion: PositiveInt.orThrow(2),
          },
        ];
      for (const refusal of refusals) {
        const deletedNames: Array<Name> = [];
        const reloads: Array<string | undefined> = [];
        await using setup = await setupRunWithEvoluDeps({
          deleteDatabaseFiles: (name) => () => {
            deletedNames.push(name);
            return ok();
          },
          reloadApp: (url) => {
            reloads.push(url);
          },
        });
        const { run } = setup;
        // Its DbWorker refuses startup, as one does that can't open the file
        // or finds a newer version. The DbWorkers started only to delete run.
        const sharedWorker = await run.deps.storedWorker;
        const tabOnMessage = sharedWorker.port.onMessage;
        assertNotNull(tabOnMessage);
        sharedWorker.port.onMessage = (message) => {
          if (message.type === "DbWorkerInit" && message.mode === "Open") {
            createMessagePort<DbWorkerOutput, DbWorkerInput>(
              message.port,
            ).postMessage({ type: "LeaderRefused", error: refusal });
            return;
          }
          tabOnMessage(message);
        };
        const refused = setup.waitForTabError();
        await using evolu = await run.ok(setup.createIntegrationEvolu);
        await refused;
        assertEqual(setup.tabErrors, [refusal]);

        assertEqual(await evolu.deleteDatabase(), ok());

        assertEqual(deletedNames, [evolu.name]);
        assertEqual(reloads, [undefined]);
      }
    });

    it("tells a single tab without onDatabaseDeleted only once the files are gone, so its reload comes after them", async () => {
      using drivers = createSqliteDriverPerName();
      const reloads: Array<string | undefined> = [];
      await using setup = await setupRunWithEvoluDeps({
        createSqliteDriver: drivers.createSqliteDriver,
        deleteDatabaseFiles: drivers.deleteDatabaseFiles,
        reloadApp: (url) => {
          reloads.push(url);
        },
      });
      const { run, createIntegrationEvolu } = setup;
      await using evolu = await run.ok(createIntegrationEvolu);
      assertEqual(await evolu.loadQuery(todoTitlesQuery), []);
      const release = drivers.holdNextDeletion();
      const started = drivers.waitForDeletionStart();

      const deleting = evolu.deleteDatabase();
      await started;
      for (let i = 0; i < 5; i++) await testWaitForWorkerMessage();
      assertEqual(reloads, []);
      assertSame(drivers.deletions(evolu.name), 0);

      release();
      assertEqual(await deleting, ok());
      assertSame(drivers.deletions(evolu.name), 1);
      assertEqual(reloads, [undefined]);
    });

    it("refuses the database when its files stay held after a held deletion", async () => {
      let isHeld = false;
      await using setup = await setupRunWithEvoluDeps({
        deleteDatabaseFiles: (name) => () => {
          isHeld = true;
          return err({ type: "DatabaseHeldError", name });
        },
        // The next DbWorker waits for the same files, as every startup does.
        waitForDatabaseRelease: (name) => () =>
          isHeld ? err({ type: "DatabaseHeldError", name }) : ok(),
      });
      const { run, createIntegrationEvolu } = setup;
      await using evolu = await run.ok(createIntegrationEvolu);
      assertEqual(await evolu.loadQuery(todoTitlesQuery), []);
      const error = { type: "DatabaseHeldError", name: evolu.name } as const;
      const refused = setup.waitForTabError();

      assertEqual(await evolu.deleteDatabase(), err(error));
      await refused;

      assertEqual(setup.tabErrors, [error]);
    });
  });

  describe("deleteOwner", () => {
    it("deletes the owner's rows for every tab, where each instance calls onOwnerDeleted", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run } = setup;
      const walletOwner = deriveShardOwner(testAppOwner, ["wallet", 1]);
      const deletedOwnerIds: Array<OwnerId> = [];
      await using caller = await run.ok(
        createEvolu(Schema, {
          appName: testAppName,
          appOwner: testAppOwner,
          transports: [],
          onOwnerDeleted: (ownerId) => {
            deletedOwnerIds.push(ownerId);
          },
        }),
      );
      using laterTabDeps = createEvoluDeps({
        ...run.deps,
        createStoredWorker: setup.connectLaterTab,
      });
      await using laterTabRun = run.create(laterTabDeps);
      const otherTabDeleted = Promise.withResolvers<OwnerId>();
      await using otherTab = await laterTabRun.ok(
        createEvolu(Schema, {
          appName: testAppName,
          appOwner: testAppOwner,
          transports: [],
          onOwnerDeleted: otherTabDeleted.resolve,
        }),
      );
      caller.insert("todo", {
        title: NonEmptyTrimmedString100.orThrow("Kept"),
      });
      caller.insert(
        "todo",
        { title: NonEmptyTrimmedString100.orThrow("Deleted") },
        { owner: walletOwner },
      );
      assertEqual(await otherTab.loadQuery(todoTitlesQuery), [
        { title: "Deleted" },
        { title: "Kept" },
      ]);

      assertEqual(await caller.deleteOwner(walletOwner), ok());

      assertEqual(deletedOwnerIds, [walletOwner.id]);
      assertEqual(await otherTabDeleted.promise, walletOwner.id);
      for (const evolu of [caller, otherTab])
        assertEqual(await evolu.loadQuery(todoTitlesQuery), [
          { title: "Kept" },
        ]);
    });
  });
});
