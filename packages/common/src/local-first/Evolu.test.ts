import {
  assert,
  assertEqual,
  assertEqualBytes,
  assertFalse,
  assertLength,
  assertNonNullable,
  assertNotNull,
  assertNotSame,
  assertNotUndefined,
  assertRejects,
  assertSame,
  assertThrowsInstanceOf,
  assertTrue,
} from "../Assert.ts";
import { describe, it } from "node:test";
import type { Brand } from "../Brand.ts";
import type { ConsoleEntry, TestConsole } from "../Console.ts";
import { testCreateConsole } from "../Console.ts";
import { constVoid } from "../Function.ts";
import type { DbWorkerInit, UnsupportedDbVersionError } from "./Db.ts";
import {
  AppName,
  createEvolu,
  createEvoluDeps,
  type Evolu,
  type EvoluConfig,
  testAppName,
  type EvoluPlatformDeps,
} from "./Evolu.ts";
import {
  createOwnerSecret,
  createOwnerWebSocketTransport,
  createSharedOwner,
  testAppOwner,
} from "./Owner.ts";
import { createQueryBuilder } from "./Schema.ts";
import {
  consoleEntryOrErrorBroadcastChannelName,
  type ConsoleEntryOrError,
  type DbWorkerInput,
  type DbWorkerOutput,
  type EvoluInput,
  type EvoluOutput,
  type SharedWorker,
  type SharedWorkerId,
  type SharedWorkerInput,
  type SharedWorkerOutput,
  type SyncState,
} from "./Shared.ts";
import {
  acquireLeaderLock,
  type LockManagerDep,
  testCreateLockManager,
} from "../LockManager.ts";
import { installPolyfills } from "../Polyfills.ts";
import { err, ok } from "../Result.ts";
import { SqliteBoolean } from "../Sqlite.ts";
import { explicitAbortReason, testCreateRun } from "../Task.ts";
import { testCreateId } from "../Test.ts";
import {
  assertType,
  createIdFromString,
  id,
  NonEmptyTrimmedString100,
  nullOr,
  PositiveInt,
  testName,
  Name,
} from "../Type.ts";
import type { ExtractTyped } from "../Type.ts";
import {
  testCreateBroadcastChannel,
  testCreateMessageChannel,
  testCreateMessagePort,
  testCreateSharedWorker,
  testCreateWorker,
  testWaitForWorkerMessage,
  type MessagePort,
} from "../Worker.ts";

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

const testCreateEvolu = createEvolu(Schema, {
  appName: testAppName,
  appOwner: testAppOwner,
  transports: [],
});

const testOwnerTransport = createOwnerWebSocketTransport({
  url: "wss://example.com",
  ownerId: testAppOwner.id,
});

const createQuery = createQueryBuilder(Schema);

const todoTitleQuery = createQuery((db) =>
  db.selectFrom("todo").select(["title"]).orderBy("createdAt"),
);

const todoTitleDescQuery = createQuery((db) =>
  db.selectFrom("todo").select(["title"]).orderBy("createdAt", "desc"),
);

describe("Evolu", () => {
  const setupRunWithEvoluDeps = async ({
    onSharedWorkerPostMessage,
    ...overrides
  }: Partial<EvoluPlatformDeps> & {
    readonly onSharedWorkerPostMessage?: (message: SharedWorkerInput) => void;
  } = {}) => {
    await using disposer = new AsyncDisposableStack();

    const sharedWorker = disposer.use(
      testCreateSharedWorker<SharedWorkerInput, SharedWorkerOutput>(),
    );

    const evoluInputs: Array<EvoluInput> = [];
    let evoluPort: {
      onMessage: ((input: EvoluInput) => void) | null;
      readonly postMessage: (output: EvoluOutput) => void;
    } | null = null;
    const queuedEvoluOutputs: Array<EvoluOutput> = [];

    sharedWorker.self.onConnect = (port) => {
      port.onMessage = (message) => {
        if (message.type !== "CreateEvolu") return;
        evoluPort = testCreateMessagePort<EvoluOutput, EvoluInput>(
          message.evoluPort,
        );
        evoluPort.onMessage = (input) => {
          evoluInputs.push(input);
        };
        for (const output of queuedEvoluOutputs) {
          evoluPort.postMessage(output);
        }
        queuedEvoluOutputs.length = 0;
      };
    };
    sharedWorker.connect();

    const postEvoluOutput = (output: EvoluOutput) => {
      if (evoluPort) {
        evoluPort.postMessage(output);
        return;
      }
      queuedEvoluOutputs.push(output);
    };

    const sharedWorkerDep: EvoluPlatformDeps["sharedWorker"] =
      onSharedWorkerPostMessage
        ? {
            port: {
              postMessage: (message, transfer) => {
                sharedWorker.port.postMessage(message, transfer);
                onSharedWorkerPostMessage(message);
              },
              get onMessage() {
                return sharedWorker.port.onMessage;
              },
              set onMessage(value) {
                sharedWorker.port.onMessage = value;
              },
              native: sharedWorker.port.native,
              [Symbol.dispose]: constVoid,
            },
            [Symbol.dispose]: constVoid,
          }
        : sharedWorker;

    const evoluDeps: EvoluPlatformDeps = {
      createDbWorker: testCreateWorker,
      createBroadcastChannel: testCreateBroadcastChannel,
      createMessageChannel: testCreateMessageChannel,
      lockManager: testCreateLockManager(),
      reloadApp: constVoid,
      sharedWorker: sharedWorkerDep,
      ...overrides,
    };
    const run = disposer.use(testCreateRun(evoluDeps));
    const disposables = disposer.move();

    return {
      run,
      evoluInputs,
      postEvoluOutput,
      [Symbol.asyncDispose]: () => disposables.disposeAsync(),
    };
  };

  it("AppName", () => {
    assertEqual(AppName.fromUnknown("my-app"), ok("my-app"));
    assertEqual(
      AppName.fromUnknown(""),
      err({
        type: "UrlSafeString",
        source: "^[A-Za-z0-9_-]+$",
        flags: "u",
        value: "",
      }),
    );
    assertEqual(AppName.fromUnknown("a".repeat(41)), ok("a".repeat(41)));
    assertEqual(
      AppName.fromUnknown("a".repeat(42)),
      err({
        type: "AppName",
        value: "a".repeat(42),
      }),
    );

    assertThrowsInstanceOf(() => AppName.orThrow("a".repeat(42)), Error);

    const appName = AppName.orThrow("my-app");
    assertType<typeof appName, AppName>();
    assertType<typeof AppName.Input, string>();
    assertType<typeof AppName.parent.Output, string & Brand<"UrlSafeString">>();
  });

  describe("createEvoluDeps", () => {
    const setupCreateEvoluDeps = async (
      console: TestConsole = testCreateConsole(),
      lockManager: LockManagerDep["lockManager"] = testCreateLockManager(),
    ): Promise<{
      readonly deps: ReturnType<typeof createEvoluDeps>;
      readonly messages: Array<SharedWorkerInput>;
      readonly sharedWorkerPort: MessagePort<
        SharedWorkerOutput,
        SharedWorkerInput
      >;
      readonly consoleEntryOrErrorBroadcastChannel: {
        readonly postMessage: (message: ConsoleEntryOrError) => void;
      };
      /**
       * Sends the worker's Connected message, as a worker holding its lock
       * does.
       */
      readonly connect: (workerId: SharedWorkerId) => Promise<void>;
      readonly [Symbol.dispose]: () => void;
    }> => {
      using disposer = new DisposableStack();
      const worker = disposer.use(
        testCreateSharedWorker<SharedWorkerInput, SharedWorkerOutput>(),
      );

      const messages: Array<SharedWorkerInput> = [];
      const sharedWorkerPort: {
        value: MessagePort<SharedWorkerOutput, SharedWorkerInput> | null;
      } = { value: null };
      worker.self.onConnect = (port) => {
        sharedWorkerPort.value = port;
        port.onMessage = (message) => {
          messages.push(message);
        };
      };
      worker.connect();

      const deps = disposer.use(
        createEvoluDeps({
          createDbWorker: testCreateWorker,
          createBroadcastChannel: testCreateBroadcastChannel,
          createMessageChannel: testCreateMessageChannel,
          lockManager,
          sharedWorker: worker,
          reloadApp: constVoid,
          console,
        }),
      );

      await testWaitForWorkerMessage();

      // A tab says nothing until its worker connects.
      assertEqual(messages, []);
      const port = sharedWorkerPort.value;
      assertNotNull(port);
      const consoleEntryOrErrorBroadcastChannel = disposer.use(
        testCreateBroadcastChannel<ConsoleEntryOrError>(
          consoleEntryOrErrorBroadcastChannelName,
        ),
      );
      const disposables = disposer.move();

      return {
        deps,
        messages,
        sharedWorkerPort: port,
        consoleEntryOrErrorBroadcastChannel,
        connect: async (workerId) => {
          port.postMessage({
            type: "Connected",
            workerId,
            syncStateChannelName: `evolu:sync-state:${workerId}`,
          });
          await testWaitForWorkerMessage();
        },
        [Symbol.dispose]: () => disposables.dispose(),
      };
    };

    it("announces itself as tab leader with its console level once its worker connects", async () => {
      const testConsole = testCreateConsole();
      using setup = await setupCreateEvoluDeps(testConsole);
      const { messages, connect } = setup;

      await connect(testCreateId()<"SharedWorker">());

      assertEqual(messages, [
        { type: "RequestSyncState" },
        { type: "AnnounceTabLeader", consoleLevel: testConsole.getLevel() },
      ]);
    });

    it("competes for tab leadership only with tabs of its worker", async () => {
      const lockManager = testCreateLockManager();
      await using run = testCreateRun({ lockManager });
      const createWorkerId = testCreateId();
      const worker = createWorkerId<"SharedWorker">();
      // The tab's worker holds this lock for its lifetime.
      await using _workerBuildLock = await run.ok(acquireLeaderLock("tab"));
      using first = await setupCreateEvoluDeps(undefined, lockManager);
      using second = await setupCreateEvoluDeps(undefined, lockManager);
      using ofOtherWorker = await setupCreateEvoluDeps(undefined, lockManager);
      await first.connect(worker);
      await second.connect(worker);
      await ofOtherWorker.connect(createWorkerId<"SharedWorker">());
      const isLeader = (setup: typeof first): boolean =>
        setup.messages.some((message) => message.type === "AnnounceTabLeader");

      assertTrue(isLeader(first));
      assertFalse(isLeader(second));
      assertTrue(isLeader(ofOtherWorker));

      first[Symbol.dispose]();
      await testWaitForWorkerMessage();
      assertTrue(isLeader(second));
    });

    it("initializes db worker from shared worker init output", async () => {
      const dbWorkerMessages: Array<DbWorkerInit> = [];
      const dbWorkerChannel = testCreateMessageChannel<
        DbWorkerOutput,
        DbWorkerInput
      >();
      const sqliteSchema = {
        tables: { todo: new Set(["title"]) },
        indexes: [],
      };
      const sharedWorkerPort: {
        value: MessagePort<SharedWorkerOutput, SharedWorkerInput> | null;
      } = { value: null };

      const worker = testCreateSharedWorker<
        SharedWorkerInput,
        SharedWorkerOutput
      >();
      worker.self.onConnect = (port) => {
        sharedWorkerPort.value = port;
        port.onMessage = constVoid;
      };
      worker.connect();

      using _deps = createEvoluDeps({
        createDbWorker: () => {
          const worker = testCreateWorker<DbWorkerInit>();
          worker.self.onMessage = (message) => {
            dbWorkerMessages.push(message);
          };
          return worker;
        },
        createBroadcastChannel: testCreateBroadcastChannel,
        createMessageChannel: testCreateMessageChannel,
        lockManager: testCreateLockManager(),
        sharedWorker: worker,
        reloadApp: constVoid,
      });

      await testWaitForWorkerMessage();
      assertNotNull(sharedWorkerPort.value);

      sharedWorkerPort.value.postMessage(
        {
          type: "DbWorkerInit",
          name: testName,
          consoleLevel: "debug",
          sqliteSchema,
          encryptionKey: testAppOwner.encryptionKey,
          memoryOnly: true,
          port: dbWorkerChannel.port1.native,
        },
        [dbWorkerChannel.port1.native],
      );

      await testWaitForWorkerMessage();

      assertLength(dbWorkerMessages, 1);
      assertEqual(dbWorkerMessages[0], {
        type: "DbWorkerInit",
        name: testName,
        consoleLevel: "debug",
        sqliteSchema,
        encryptionKey: testAppOwner.encryptionKey,
        memoryOnly: true,
        port: dbWorkerChannel.port1.native,
      });

      dbWorkerChannel[Symbol.dispose]();
    });

    it("falls back to default console when not provided", async () => {
      // oxlint-disable-next-line evolu/no-unnecessary-global-this -- This test temporarily observes the default global object console.
      const nativeConsole = globalThis.console;
      const originalConsoleError = nativeConsole.error;
      const consoleErrors: Array<ReadonlyArray<unknown>> = [];
      nativeConsole.error = ((...args: ReadonlyArray<unknown>) => {
        consoleErrors.push(args);
      }) as typeof nativeConsole.error;

      try {
        const worker = testCreateSharedWorker<
          SharedWorkerInput,
          SharedWorkerOutput
        >();
        const messages: Array<SharedWorkerInput> = [];

        worker.self.onConnect = (port) => {
          port.onMessage = (message) => {
            messages.push(message);
          };
          port.postMessage({
            type: "Connected",
            workerId: testCreateId()<"SharedWorker">(),
            syncStateChannelName: "evolu:sync-state:worker",
          });
        };
        worker.connect();

        using deps = createEvoluDeps({
          createDbWorker: testCreateWorker,
          createBroadcastChannel: testCreateBroadcastChannel,
          createMessageChannel: testCreateMessageChannel,
          lockManager: testCreateLockManager(),
          sharedWorker: worker,
          reloadApp: constVoid,
        });

        await testWaitForWorkerMessage();

        assertNotUndefined(deps.console);
        const messageTypes = ["RequestSyncState", "AnnounceTabLeader"];
        assertEqual(
          messages.map((message) => message.type),
          messageTypes,
        );
        using consoleEntryOrErrorBroadcastChannel =
          testCreateBroadcastChannel<ConsoleEntryOrError>(
            consoleEntryOrErrorBroadcastChannelName,
          );

        consoleEntryOrErrorBroadcastChannel.postMessage({
          type: "ConsoleEntry",
          entry: { method: "error", path: ["global"], args: ["boom"] },
        });

        await testWaitForWorkerMessage();

        assertEqual(
          messages.map((message) => message.type),
          messageTypes,
        );
        assertEqual(deps.evoluError.get(), {
          type: "UnknownError",
          error: ["boom"],
        });
        assertEqual(consoleErrors, [["boom"]]);
      } finally {
        nativeConsole.error = originalConsoleError;
      }
    });

    it("wires console channel to console.write", async () => {
      const testConsole = testCreateConsole();
      using setup = await setupCreateEvoluDeps(testConsole);
      const { consoleEntryOrErrorBroadcastChannel } = setup;

      const entry: ConsoleEntry = {
        method: "info",
        path: ["test"],
        args: ["hello"],
      };
      consoleEntryOrErrorBroadcastChannel.postMessage({
        type: "ConsoleEntry",
        entry,
      });

      await testWaitForWorkerMessage();

      assertEqual(testConsole.getEntriesSnapshot(), [entry]);
    });

    it("follows the sync state channel its worker names", async () => {
      using setup = await setupCreateEvoluDeps();
      const { deps, messages, connect } = setup;
      const workerId = testCreateId()<"SharedWorker">();
      using channel = testCreateBroadcastChannel<SyncState>(
        `evolu:sync-state:${workerId}`,
      );
      using otherChannel = testCreateBroadcastChannel<SyncState>(
        "evolu:sync-state:other-worker",
      );
      const createState = (label: string): SyncState => ({
        transports: [],
        tenants: [{ name: Name.orThrow(label), refused: false, owners: [] }],
      });

      // Nothing reaches the tab before its worker names the channel.
      channel.postMessage(createState("early"));
      await testWaitForWorkerMessage();
      assertSame(deps.syncState.get(), null);

      await connect(workerId);
      assertEqual(messages.at(0), { type: "RequestSyncState" });
      channel.postMessage(createState("requested"));
      await testWaitForWorkerMessage();
      assertEqual(deps.syncState.get(), createState("requested"));

      channel.postMessage(createState("changed"));
      await testWaitForWorkerMessage();
      assertEqual(deps.syncState.get(), createState("changed"));

      // Another worker's channel is never heard.
      otherChannel.postMessage(createState("other"));
      await testWaitForWorkerMessage();
      assertEqual(deps.syncState.get(), createState("changed"));
    });

    it("listens on its worker's channel before asking for a snapshot", async () => {
      const name = "evolu:sync-state:worker";
      using worker = testCreateSharedWorker<
        SharedWorkerInput,
        SharedWorkerOutput
      >();
      worker.self.onConnect = (port) => {
        port.onMessage = constVoid;
        port.postMessage({
          type: "Connected",
          workerId: testCreateId()<"SharedWorker">(),
          syncStateChannelName: name,
        });
      };
      worker.connect();
      using channel = testCreateBroadcastChannel<SyncState>(name);
      const requested: SyncState = { transports: [], tenants: [] };
      // A worker on another thread can broadcast its answer before the tab's
      // postMessage returns.
      const port = new Proxy(worker.port, {
        get: (target, property) =>
          property === "postMessage"
            ? (message: SharedWorkerInput) => {
                if (message.type === "RequestSyncState")
                  channel.postMessage(requested);
                target.postMessage(message);
              }
            : (Reflect.get(target, property) as unknown),
      });

      using deps = createEvoluDeps({
        createDbWorker: testCreateWorker,
        createBroadcastChannel: testCreateBroadcastChannel,
        createMessageChannel: testCreateMessageChannel,
        lockManager: testCreateLockManager(),
        sharedWorker: { port, [Symbol.dispose]: constVoid },
        reloadApp: constVoid,
      });
      await testWaitForWorkerMessage();
      assertEqual(deps.syncState.get(), requested);
    });

    it("maps ConsoleEntry error output to deps.evoluError store", async () => {
      using setup = await setupCreateEvoluDeps();
      const { deps, consoleEntryOrErrorBroadcastChannel } = setup;

      const entry: ConsoleEntry = {
        method: "error",
        path: ["global"],
        args: ["error", { type: "UnknownError", error: "boom" }],
      };

      consoleEntryOrErrorBroadcastChannel.postMessage({
        type: "ConsoleEntry",
        entry,
      });

      await testWaitForWorkerMessage();

      assertEqual(deps.evoluError.get(), {
        type: "UnknownError",
        error: ["error", { type: "UnknownError", error: "boom" }],
      });
    });

    it("wraps single-arg ConsoleEntry error output to UnknownError", async () => {
      using setup = await setupCreateEvoluDeps();
      const { deps, consoleEntryOrErrorBroadcastChannel } = setup;

      consoleEntryOrErrorBroadcastChannel.postMessage({
        type: "ConsoleEntry",
        entry: { method: "error", path: ["global"], args: ["boom"] },
      });

      await testWaitForWorkerMessage();

      assertEqual(deps.evoluError.get(), {
        type: "UnknownError",
        error: ["boom"],
      });
    });

    it("wraps multi-arg ConsoleEntry error output to UnknownError", async () => {
      using setup = await setupCreateEvoluDeps();
      const { deps, consoleEntryOrErrorBroadcastChannel } = setup;

      consoleEntryOrErrorBroadcastChannel.postMessage({
        type: "ConsoleEntry",
        entry: { method: "error", path: ["global"], args: ["error", "boom"] },
      });

      await testWaitForWorkerMessage();

      assertEqual(deps.evoluError.get(), {
        type: "UnknownError",
        error: ["error", "boom"],
      });
    });

    it("wires EvoluError output to deps.evoluError store", async () => {
      using setup = await setupCreateEvoluDeps();
      const { deps, consoleEntryOrErrorBroadcastChannel } = setup;

      const error = { type: "UnknownError", error: "boom" } as const;
      consoleEntryOrErrorBroadcastChannel.postMessage({ type: "Error", error });

      await testWaitForWorkerMessage();

      assertEqual(deps.evoluError.get(), error);
    });

    for (const source of ["SharedWorker", "Error", "ConsoleEntry"] as const) {
      it(`preserves the first startup refusal while logging a later ${source} message`, async () => {
        const testConsole = testCreateConsole();
        using setup = await setupCreateEvoluDeps(testConsole);
        const { deps, sharedWorkerPort, consoleEntryOrErrorBroadcastChannel } =
          setup;
        assertSame(deps.evoluError.get(), null);

        const initialError = {
          type: "UnknownError",
          error: "before refusal",
        } as const;
        consoleEntryOrErrorBroadcastChannel.postMessage({
          type: "Error",
          error: initialError,
        });
        await testWaitForWorkerMessage();
        assertEqual(deps.evoluError.get(), initialError);

        let notifications = 0;
        deps.evoluError.subscribe(() => {
          notifications++;
        });
        const refusal: UnsupportedDbVersionError = {
          type: "UnsupportedDbVersionError",
          storedVersion: PositiveInt.orThrow(2),
          supportedVersion: PositiveInt.orThrow(1),
        };
        sharedWorkerPort.postMessage({ type: "Error", error: refusal });
        await testWaitForWorkerMessage();
        const storedRefusal = deps.evoluError.get();
        assertEqual(storedRefusal, refusal);
        assertSame(notifications, 1);

        const laterRefusal: UnsupportedDbVersionError = {
          ...refusal,
          storedVersion: PositiveInt.orThrow(3),
        };
        const laterError = {
          type: "UnknownError",
          error: "after refusal",
        } as const;
        const laterEntry: ConsoleEntry = {
          method: "error",
          path: source === "ConsoleEntry" ? ["worker"] : [],
          args: [source === "SharedWorker" ? laterRefusal : laterError],
        };
        if (source === "SharedWorker") {
          sharedWorkerPort.postMessage({ type: "Error", error: laterRefusal });
        } else if (source === "Error") {
          consoleEntryOrErrorBroadcastChannel.postMessage({
            type: "Error",
            error: laterError,
          });
        } else {
          consoleEntryOrErrorBroadcastChannel.postMessage({
            type: "ConsoleEntry",
            entry: laterEntry,
          });
        }
        await testWaitForWorkerMessage();

        assertSame(deps.evoluError.get(), storedRefusal);
        assertSame(notifications, 1);
        assertEqual(testConsole.getEntriesSnapshot(), [
          { method: "error", path: [], args: [initialError] },
          { method: "error", path: [], args: [refusal] },
          laterEntry,
        ]);
      });
    }

    it("throws for unknown tab output type", () => {
      const consoleEntryOrErrorBroadcastChannel: {
        value: {
          readonly onMessage: ((message: ConsoleEntryOrError) => void) | null;
        } | null;
      } = { value: null };

      using _deps = createEvoluDeps({
        createDbWorker: testCreateWorker,
        createBroadcastChannel: <Input, Output = Input>(name: string) => {
          const channel = testCreateBroadcastChannel<Input, Output>(name);
          consoleEntryOrErrorBroadcastChannel.value = channel as NonNullable<
            typeof consoleEntryOrErrorBroadcastChannel.value
          >;
          return channel;
        },
        createMessageChannel: testCreateMessageChannel,
        lockManager: testCreateLockManager(),
        sharedWorker: testCreateSharedWorker<
          SharedWorkerInput,
          SharedWorkerOutput
        >(),
        reloadApp: constVoid,
      });

      const onMessage = consoleEntryOrErrorBroadcastChannel.value?.onMessage;
      assertNonNullable(onMessage);

      assertThrowsInstanceOf(() => {
        onMessage({ type: "Unknown" } as never);
      }, Error);
    });

    it("dispose cleans up resources", async () => {
      const worker = testCreateSharedWorker<
        SharedWorkerInput,
        SharedWorkerOutput
      >();
      worker.self.onConnect = (port) => {
        port.onMessage = constVoid;
        port.postMessage({
          type: "Connected",
          workerId: testCreateId()<"SharedWorker">(),
          syncStateChannelName: "evolu:sync-state:worker",
        });
      };
      worker.connect();

      const broadcastChannels: Array<{ readonly isDisposed: () => boolean }> =
        [];
      let workerDisposed = false;
      const sharedWorker: SharedWorker = {
        port: worker.port,
        [Symbol.dispose]: () => {
          workerDisposed = true;
          worker[Symbol.dispose]();
        },
      };

      const deps = createEvoluDeps({
        createDbWorker: testCreateWorker,
        createBroadcastChannel: <Input, Output = Input>(name: string) => {
          const channel = testCreateBroadcastChannel<Input, Output>(name);
          broadcastChannels.push(channel);
          return channel;
        },
        createMessageChannel: testCreateMessageChannel,
        lockManager: testCreateLockManager(),
        sharedWorker,
        reloadApp: constVoid,
      });

      // The console/error channel, then the sync state channel its worker names.
      assertSame(broadcastChannels.length, 1);
      await testWaitForWorkerMessage();
      assertLength(broadcastChannels, 2);
      assertFalse(broadcastChannels[0].isDisposed());
      assertFalse(broadcastChannels[1].isDisposed());
      assertFalse(workerDisposed);
      deps[Symbol.dispose]();
      assertTrue(broadcastChannels[0].isDisposed());
      assertTrue(broadcastChannels[1].isDisposed());
      assertTrue(workerDisposed);
    });
  });

  describe("local tables", () => {
    const LocalSchema = { _todo: Schema.todo };
    const config: EvoluConfig = {
      appName: testAppName,
      appOwner: testAppOwner,
      transports: [],
    };

    it("keeps useOwner available for an instance with only local tables", async () => {
      const messages: Array<SharedWorkerInput> = [];
      await using setup = await setupRunWithEvoluDeps({
        onSharedWorkerPostMessage: (message) => {
          messages.push(message);
        },
      });
      const evolu = await setup.run.ok(createEvolu(LocalSchema, config));
      assertType<typeof evolu, Evolu<typeof LocalSchema>>();
      assertSame(evolu.appOwner, testAppOwner);
      assertEqual(evolu.name, `AppName-${createIdFromString(testAppOwner.id)}`);
      assertTrue(typeof evolu.useOwner === "function");
      await testWaitForWorkerMessage();
      assertEqual(setup.evoluInputs, []);
      const message = messages.find(
        (message) => message.type === "CreateEvolu",
      );
      assertNotUndefined(message);
      assertSame(message.encryptionKey, testAppOwner.encryptionKey);
      assertFalse(message.memoryOnly);

      evolu.insert("_todo", {
        title: NonEmptyTrimmedString100.orThrow("Local"),
      });
      await testWaitForWorkerMessage();
      assertTrue(setup.evoluInputs.some((input) => input.type === "Mutate"));
      assertFalse(setup.evoluInputs.some((input) => input.type === "UseOwner"));
      const unuseOwner = evolu.useOwner(testAppOwner, [testOwnerTransport]);
      await testWaitForWorkerMessage();
      assertTrue(setup.evoluInputs.some((input) => input.type === "UseOwner"));
      unuseOwner();
      await evolu[Symbol.asyncDispose]();
      assertThrowsInstanceOf(
        () =>
          evolu.insert("_todo", {
            title: NonEmptyTrimmedString100.orThrow("Disposed"),
          }),
        Error,
      );
    });
  });

  describe("createEvolu", () => {
    it("uses the default relay when transports are omitted", async () => {
      await using setup = await setupRunWithEvoluDeps();
      await setup.run.ok(
        createEvolu(Schema, {
          appName: testAppName,
          appOwner: testAppOwner,
        }),
      );
      await testWaitForWorkerMessage();
      const input = setup.evoluInputs.find(
        (input) => input.type === "UseOwner",
      );
      assertNotUndefined(input);
      assertEqual(input.actions, [
        {
          action: "add",
          owner: {
            owner: testAppOwner,
            transports: [{ type: "WebSocket", url: "wss://free.evoluhq.com" }],
          },
        },
      ]);
    });
    it("resolves name from appName and appOwner hash", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run } = setup;

      const evolu = await run.ok(testCreateEvolu);
      const expectedSuffix = createIdFromString(testAppOwner.id);
      assertEqual(evolu.name, `AppName-${expectedSuffix}`);
    });

    it("appOwner from config is exposed as evolu.appOwner", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run } = setup;

      const evolu = await run.ok(testCreateEvolu);

      assertSame(evolu.appOwner, testAppOwner);
    });

    it("posts CreateEvolu with db worker init config", async () => {
      const sharedWorkerMessages: Array<SharedWorkerInput> = [];
      const sharedWorker = testCreateSharedWorker<
        SharedWorkerInput,
        SharedWorkerOutput
      >();

      sharedWorker.self.onConnect = (port) => {
        port.onMessage = (message) => {
          sharedWorkerMessages.push(message);
        };
      };
      sharedWorker.connect();

      await using run = testCreateRun({
        createDbWorker: testCreateWorker,
        createBroadcastChannel: testCreateBroadcastChannel,
        createMessageChannel: testCreateMessageChannel,
        lockManager: testCreateLockManager(),
        reloadApp: constVoid,
        sharedWorker,
      });

      const evolu = await run.ok(testCreateEvolu);

      await testWaitForWorkerMessage();

      assertLength(sharedWorkerMessages, 1);
      const message = sharedWorkerMessages[0];
      assertSame(message.type, "CreateEvolu");
      assertEqual(Object.keys(message).toSorted(), [
        "consoleLevel",
        "encryptionKey",
        "evoluPort",
        "id",
        "memoryOnly",
        "name",
        "sqliteSchema",
        "type",
      ]);
      assertEqual(message.name, evolu.name);
      assertEqual(message.id, "in2khoBFZNo9ESZlzuacxA");
      assertTrue(typeof message.consoleLevel === "string");
      assertTrue(
        typeof message.sqliteSchema === "object" &&
          message.sqliteSchema !== null,
      );
      assertEqualBytes(message.encryptionKey, testAppOwner.encryptionKey);
      assertFalse(message.memoryOnly);
      assertNonNullable(message.evoluPort);
    });

    describe("requestSync", () => {
      it("preserves pending owner operations and returns immediately", async () => {
        await using setup = await setupRunWithEvoluDeps();
        const { run, evoluInputs } = setup;
        const evolu = await run.ok(testCreateEvolu);
        const sharedOwner = createSharedOwner(createOwnerSecret(run.deps));
        const owner = { owner: sharedOwner, transports: [testOwnerTransport] };
        assertNotSame(sharedOwner.id, evolu.appOwner.id);

        const unuse = evolu.useOwner(sharedOwner, [testOwnerTransport]);
        const result = evolu.requestSync(sharedOwner.id);
        assertType<typeof result, void>();
        assertSame(result, undefined);
        unuse();
        evolu.requestSync(sharedOwner.id);
        assertEqual(evoluInputs, []);

        await testWaitForWorkerMessage();
        assertEqual(evoluInputs, [
          {
            type: "UseOwner",
            actions: [{ action: "add", owner }],
          },
          {
            type: "UseOwner",
            actions: [
              { action: "sync", ownerId: sharedOwner.id },
              { action: "remove", owner },
            ],
          },
          {
            type: "UseOwner",
            actions: [{ action: "sync", ownerId: sharedOwner.id }],
          },
        ]);
      });

      it("drops pending requests on disposal", async () => {
        await using setup = await setupRunWithEvoluDeps();
        const { run, evoluInputs } = setup;
        const evolu = await run.ok(testCreateEvolu);
        evolu.requestSync(testAppOwner.id);
        await evolu[Symbol.asyncDispose]();
        await testWaitForWorkerMessage();
        assertEqual(evoluInputs, []);
      });

      it("preserves registration, mutation, and sync request order", async () => {
        await using setup = await setupRunWithEvoluDeps();
        const { run, evoluInputs } = setup;
        const evolu = await run.ok(testCreateEvolu);
        evolu.useOwner(testAppOwner, [testOwnerTransport]);
        evolu.insert("todo", {
          title: NonEmptyTrimmedString100.orThrow("Before sync"),
        });
        evolu.requestSync(testAppOwner.id);
        await testWaitForWorkerMessage();
        assertEqual(
          evoluInputs.map(({ type }) => type),
          ["UseOwner", "Mutate", "UseOwner"],
        );
      });
    });

    describe("useOwner", () => {
      it("auto-uses appOwner in a microtask when transports are configured", async () => {
        await using setup = await setupRunWithEvoluDeps();
        const { run, evoluInputs } = setup;
        await run.ok(
          createEvolu(Schema, {
            appName: testAppName,
            appOwner: testAppOwner,
            transports: [testOwnerTransport],
          }),
        );

        assertEqual(evoluInputs, []);

        await testWaitForWorkerMessage();

        assertEqual(evoluInputs, [
          {
            type: "UseOwner",
            actions: [
              {
                owner: {
                  owner: testAppOwner,
                  transports: [testOwnerTransport],
                },
                action: "add",
              },
            ],
          },
        ]);
      });

      it("posts in a microtask with fallback transports", async () => {
        await using setup = await setupRunWithEvoluDeps();
        const { run, evoluInputs } = setup;
        const evolu = await run.ok(
          createEvolu(Schema, {
            appName: testAppName,
            appOwner: testAppOwner,
            transports: [testOwnerTransport],
          }),
        );

        await testWaitForWorkerMessage();
        evoluInputs.length = 0;

        evolu.useOwner(testAppOwner);

        assertEqual(evoluInputs, []);

        await testWaitForWorkerMessage();

        assertEqual(evoluInputs, [
          {
            type: "UseOwner",
            actions: [
              {
                owner: {
                  owner: testAppOwner,
                  transports: [testOwnerTransport],
                },
                action: "add",
              },
            ],
          },
        ]);
      });

      it("preserves same-tick add and remove order", async () => {
        await using setup = await setupRunWithEvoluDeps();
        const { run, evoluInputs } = setup;
        const evolu = await run.ok(testCreateEvolu);

        const unuseOwner = evolu.useOwner(testAppOwner, [testOwnerTransport]);
        unuseOwner();

        assertEqual(evoluInputs, []);

        await testWaitForWorkerMessage();

        assertEqual(evoluInputs, [
          {
            type: "UseOwner",
            actions: [
              {
                owner: {
                  owner: testAppOwner,
                  transports: [testOwnerTransport],
                },
                action: "add",
              },
              {
                owner: {
                  owner: testAppOwner,
                  transports: [testOwnerTransport],
                },
                action: "remove",
              },
            ],
          },
        ]);
      });

      it("throws when unuseOwner is called twice", async () => {
        await using setup = await setupRunWithEvoluDeps();
        const { run, evoluInputs } = setup;
        const evolu = await run.ok(testCreateEvolu);

        const unuseOwner = evolu.useOwner(testAppOwner, [testOwnerTransport]);
        await testWaitForWorkerMessage();
        evoluInputs.length = 0;

        unuseOwner();

        assertEqual(
          assertThrowsInstanceOf(() => {
            unuseOwner();
          }, Error).message,
          "UnuseOwner can be called only once.",
        );

        await testWaitForWorkerMessage();

        assertEqual(evoluInputs, [
          {
            type: "UseOwner",
            actions: [
              {
                owner: {
                  owner: testAppOwner,
                  transports: [testOwnerTransport],
                },
                action: "remove",
              },
            ],
          },
        ]);
      });

      it("flush keeps call order before mutate batch", async () => {
        await using setup = await setupRunWithEvoluDeps();
        const { run, evoluInputs } = setup;
        const evolu = await run.ok(
          createEvolu(Schema, {
            appName: testAppName,
            appOwner: testAppOwner,
            transports: [],
          }),
        );

        evolu.useOwner(testAppOwner, [testOwnerTransport]);
        evolu.insert("todo", {
          title: NonEmptyTrimmedString100.orThrow("Queued after useOwner"),
        });

        await testWaitForWorkerMessage();

        assertEqual(evoluInputs[0], {
          type: "UseOwner",
          actions: [
            {
              owner: {
                owner: testAppOwner,
                transports: [testOwnerTransport],
              },
              action: "add",
            },
          ],
        });
        assertSame(evoluInputs[1]?.type, "Mutate");
      });
    });
  });

  describe("dispose evolu", () => {
    it("logs disposeEvolu once", async () => {
      const testConsole = testCreateConsole();
      await using setup = await setupRunWithEvoluDeps({ console: testConsole });
      const { run } = setup;
      const evolu = await run.ok(testCreateEvolu);

      testConsole.clearEntries();

      await evolu[Symbol.asyncDispose]();
      await evolu[Symbol.asyncDispose]();

      const entries = testConsole
        .getEntriesSnapshot()
        .filter((entry) => entry.args[0] === "disposeEvolu");

      assertEqual(entries, [
        {
          method: "info",
          path: [evolu.name, "Evolu"],
          args: ["disposeEvolu"],
        },
      ]);
    });

    it("disposes resources when createEvolu is aborted after setup", async () => {
      const channels: Array<{ readonly isDisposed: () => boolean }> = [];
      let abortCreateEvolu: () => void = () => {
        assert(
          false,
          "Expected createEvolu fiber to exist before postMessage.",
        );
      };

      await using setup = await setupRunWithEvoluDeps({
        createMessageChannel: <Input, Output = never>() => {
          const channel = testCreateMessageChannel<Input, Output>();
          channels.push(channel);
          return channel;
        },
        onSharedWorkerPostMessage: (message) => {
          if (message.type !== "CreateEvolu") return;
          abortCreateEvolu();
        },
      });
      const { run } = setup;

      const fiber = run.abortable(testCreateEvolu);
      abortCreateEvolu = () => fiber.abort({ type: "LateAbort" });

      assertEqual(
        await fiber,
        err({ type: "AbortError", reason: { type: "LateAbort" } }),
      );

      assertLength(channels, 1);
      assertTrue(channels[0].isDisposed());
    });

    it("rejects pending export", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run, evoluInputs } = setup;
      const evolu = await run.ok(testCreateEvolu);

      const exportPromise = evolu.exportDatabase();

      await testWaitForWorkerMessage();

      assertEqual(evoluInputs, [{ type: "Export" }]);

      await evolu[Symbol.asyncDispose]();

      await assertRejects(exportPromise, {
        type: "EvoluDisposedError",
      });
      await testWaitForWorkerMessage();

      assertEqual(evoluInputs, [{ type: "Export" }]);
    });

    it("throws from synchronous methods after disposal", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run } = setup;
      const evolu = await run.ok(testCreateEvolu);
      evolu.useOwner(testAppOwner, [testOwnerTransport]);

      await evolu[Symbol.asyncDispose]();

      const disposedMessage = "Cannot use a disposed object.";

      assertEqual(
        assertThrowsInstanceOf(() => {
          evolu.insert("todo", {
            title: NonEmptyTrimmedString100.orThrow("Inserted after dispose"),
          });
        }, Error).message,
        disposedMessage,
      );

      assertEqual(
        assertThrowsInstanceOf(() => {
          evolu.update("todo", {
            id: TodoId.orThrow(createIdFromString("todo-update-after-dispose")),
            title: NonEmptyTrimmedString100.orThrow("Updated after dispose"),
          });
        }, Error).message,
        disposedMessage,
      );

      assertEqual(
        assertThrowsInstanceOf(() => {
          evolu.upsert("todo", {
            id: TodoId.orThrow(createIdFromString("todo-upsert-after-dispose")),
            title: NonEmptyTrimmedString100.orThrow("Upserted after dispose"),
          });
        }, Error).message,
        disposedMessage,
      );

      assertEqual(
        assertThrowsInstanceOf(() => {
          void evolu.loadQuery(todoTitleQuery);
        }, Error).message,
        disposedMessage,
      );

      assertEqual(
        assertThrowsInstanceOf(() => {
          void evolu.loadQueries([todoTitleQuery, todoTitleDescQuery]);
        }, Error).message,
        disposedMessage,
      );

      assertEqual(
        assertThrowsInstanceOf(() => {
          evolu.subscribeQuery(todoTitleQuery)(constVoid);
        }, Error).message,
        disposedMessage,
      );

      assertEqual(
        assertThrowsInstanceOf(() => {
          evolu.getQueryRows(todoTitleQuery);
        }, Error).message,
        disposedMessage,
      );

      assertEqual(
        assertThrowsInstanceOf(() => {
          void evolu.exportDatabase();
        }, Error).message,
        disposedMessage,
      );

      assertEqual(
        assertThrowsInstanceOf(() => {
          evolu.deleteDatabase();
        }, Error).message,
        disposedMessage,
      );

      assertEqual(
        assertThrowsInstanceOf(() => {
          evolu.deleteOwner(testAppOwner);
        }, Error).message,
        disposedMessage,
      );

      assertEqual(
        assertThrowsInstanceOf(() => {
          evolu.useOwner(testAppOwner, [testOwnerTransport]);
        }, Error).message,
        disposedMessage,
      );

      assertEqual(
        assertThrowsInstanceOf(() => {
          evolu.requestSync(testAppOwner.id);
        }, Error).message,
        disposedMessage,
      );
    });

    it("delete methods are placeholders", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run } = setup;
      const evolu = await run.ok(testCreateEvolu);

      assertEqual(
        assertThrowsInstanceOf(() => {
          evolu.deleteDatabase();
        }, Error).message,
        "not yet implemented",
      );

      assertEqual(
        assertThrowsInstanceOf(() => {
          evolu.deleteOwner(testAppOwner);
        }, Error).message,
        "not yet implemented",
      );
    });

    it("unuseOwner is a no-op after dispose", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run } = setup;
      const evolu = await run.ok(testCreateEvolu);

      const unuseOwner = evolu.useOwner(testAppOwner, [testOwnerTransport]);

      await evolu[Symbol.asyncDispose]();

      // Parent teardown can dispose Evolu while child cleanup still holds
      // UnuseOwner callbacks. React is one example, regardless of its exact
      // unmount ordering. Late UnuseOwner calls must not throw, and they do not
      // leak because tenant-side instance disposal releases all used owners.
      (() => {
        unuseOwner();
      })();

      (() => {
        unuseOwner();
      })();
    });

    it("resolves pending loadQuery with empty rows on dispose", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run, evoluInputs } = setup;
      const evolu = await run.ok(testCreateEvolu);

      const loadPromise = evolu.loadQuery(todoTitleQuery);

      await testWaitForWorkerMessage();

      assertEqual(evoluInputs, [
        { type: "Query", queries: new Set([todoTitleQuery]) },
      ]);

      await evolu[Symbol.asyncDispose]();

      assertEqual(await loadPromise, []);
    });

    it("dispose keeps fulfilled subscribed loadQuery settled", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run, postEvoluOutput } = setup;
      const evolu = await run.ok(testCreateEvolu);

      evolu.subscribeQuery(todoTitleQuery)(constVoid);
      const loadPromise = evolu.loadQuery(todoTitleQuery);

      await testWaitForWorkerMessage();

      postEvoluOutput({
        type: "OnPatchesByQuery",
        patchesByQuery: new Map([
          [todoTitleQuery, [{ op: "replaceAll", value: [{ title: "A" }] }]],
        ]),
        onCompleteIds: [],
      });

      assertEqual(await loadPromise, [{ title: "A" }]);

      await evolu[Symbol.asyncDispose]();
    });

    it("drops pending mutation microtask batch on dispose", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { evoluInputs, run } = setup;
      const evolu = await run.ok(testCreateEvolu);

      evolu.insert("todo", {
        title: NonEmptyTrimmedString100.orThrow("Queued then disposed"),
      });

      await evolu[Symbol.asyncDispose]();

      await testWaitForWorkerMessage();

      assertEqual(evoluInputs, []);
    });

    it("drops pending query microtask batch on dispose", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { evoluInputs, run } = setup;
      const evolu = await run.ok(testCreateEvolu);

      const loadPromise = evolu.loadQuery(todoTitleQuery);

      await evolu[Symbol.asyncDispose]();

      assertEqual(await loadPromise, []);

      await testWaitForWorkerMessage();

      assertEqual(evoluInputs, []);
    });

    it("drops pending useOwner microtask batch on dispose", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { evoluInputs, run } = setup;
      const evolu = await run.ok(testCreateEvolu);

      evolu.useOwner(testAppOwner, [testOwnerTransport]);

      await evolu[Symbol.asyncDispose]();

      await testWaitForWorkerMessage();

      assertEqual(evoluInputs, []);
    });

    it("disposes internal message channels", async () => {
      const channels: Array<{ readonly isDisposed: () => boolean }> = [];

      await using setup = await setupRunWithEvoluDeps({
        createMessageChannel: <Input, Output = never>() => {
          const channel = testCreateMessageChannel<Input, Output>();
          channels.push(channel);
          return channel;
        },
      });
      const { run } = setup;

      const evolu = await run.ok(testCreateEvolu);

      assertLength(channels, 1);
      assertFalse(channels[0].isDisposed());

      await evolu[Symbol.asyncDispose]();

      assertTrue(channels[0].isDisposed());
    });

    it("does not execute mutate onComplete callback after dispose", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run, evoluInputs, postEvoluOutput } = setup;
      const evolu = await run.ok(testCreateEvolu);

      let called = 0;
      evolu.insert(
        "todo",
        { title: NonEmptyTrimmedString100.orThrow("With completion") },
        {
          onComplete: () => {
            called += 1;
          },
        },
      );

      await testWaitForWorkerMessage();

      const mutate = evoluInputs[0] as ExtractTyped<EvoluInput, "Mutate">;
      const [onCompleteId] = mutate.onCompleteIds;

      await evolu[Symbol.asyncDispose]();

      postEvoluOutput({
        type: "OnPatchesByQuery",
        patchesByQuery: new Map(),
        onCompleteIds: [onCompleteId],
      });

      await testWaitForWorkerMessage();

      assertEqual(called, 0);
    });

    it("executes mutate onComplete callback when query patches are received", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run, evoluInputs, postEvoluOutput } = setup;
      const evolu = await run.ok(testCreateEvolu);

      let called = 0;
      evolu.insert(
        "todo",
        { title: NonEmptyTrimmedString100.orThrow("With completion") },
        {
          onComplete: () => {
            called += 1;
          },
        },
      );

      await testWaitForWorkerMessage();

      const mutate = evoluInputs[0] as ExtractTyped<EvoluInput, "Mutate">;
      const [onCompleteId] = mutate.onCompleteIds;

      postEvoluOutput({
        type: "OnPatchesByQuery",
        patchesByQuery: new Map(),
        onCompleteIds: [onCompleteId],
      });

      await testWaitForWorkerMessage();

      assertEqual(called, 1);
    });

    it("uses flushSync for query patches with onComplete callbacks", async () => {
      let flushSyncCalls = 0;

      await using setup = await setupRunWithEvoluDeps({
        flushSync: (callback: () => void) => {
          flushSyncCalls += 1;
          callback();
        },
      });
      const { run, evoluInputs, postEvoluOutput } = setup;

      const evolu = await run.ok(testCreateEvolu);

      let called = 0;
      evolu.insert(
        "todo",
        { title: NonEmptyTrimmedString100.orThrow("With completion") },
        {
          onComplete: () => {
            called += 1;
          },
        },
      );

      await testWaitForWorkerMessage();

      const mutate = evoluInputs[0] as ExtractTyped<EvoluInput, "Mutate">;
      const [onCompleteId] = mutate.onCompleteIds;

      postEvoluOutput({
        type: "OnPatchesByQuery",
        patchesByQuery: new Map(),
        onCompleteIds: [onCompleteId],
      });

      await testWaitForWorkerMessage();

      assertEqual(flushSyncCalls, 1);
      assertEqual(called, 1);
    });

    it("does not use flushSync when query patches have no onComplete callbacks", async () => {
      let flushSyncCalls = 0;

      await using setup = await setupRunWithEvoluDeps({
        flushSync: (callback: () => void) => {
          flushSyncCalls += 1;
          callback();
        },
      });
      const { run, postEvoluOutput } = setup;

      await run.ok(testCreateEvolu);

      postEvoluOutput({
        type: "OnPatchesByQuery",
        patchesByQuery: new Map(),
        onCompleteIds: [],
      });

      assertEqual(flushSyncCalls, 0);
    });
  });

  describe("worker outputs", () => {
    it("ignores RefreshQueries when there are no subscribed queries", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run, evoluInputs, postEvoluOutput } = setup;
      await run.ok(testCreateEvolu);

      postEvoluOutput({ type: "RefreshQueries" });

      await testWaitForWorkerMessage();

      assertEqual(evoluInputs, []);
    });

    it("throws for unknown evolu output type", async () => {
      const channels: Array<{
        readonly port1: {
          onMessage: ((message: EvoluOutput) => void) | null;
        };
      }> = [];

      await using setup = await setupRunWithEvoluDeps({
        createMessageChannel: <Input, Output = never>() => {
          const channel = testCreateMessageChannel<Input, Output>();
          channels.push(channel as never);
          return channel;
        },
      });
      const { run } = setup;
      await run.ok(testCreateEvolu);

      const evoluChannel = channels.find((channel) => channel.port1.onMessage);
      assertNonNullable(evoluChannel?.port1.onMessage);

      assertThrowsInstanceOf(() => {
        evoluChannel.port1.onMessage?.({ type: "Unknown" } as never);
      }, Error);
    });
  });

  describe("query behavior", () => {
    it("subscribeQuery catches a refresh between loading and subscribing", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run, evoluInputs, postEvoluOutput } = setup;
      const evolu = await run.ok(testCreateEvolu);

      const initialLoad = evolu.loadQuery(todoTitleQuery);
      await testWaitForWorkerMessage();
      postEvoluOutput({
        type: "OnPatchesByQuery",
        patchesByQuery: new Map([
          [todoTitleQuery, [{ op: "replaceAll", value: [] }]],
        ]),
        onCompleteIds: [],
      });
      const initialRows = await initialLoad;
      assertEqual(initialRows, []);

      evoluInputs.length = 0;
      postEvoluOutput({ type: "RefreshQueries" });
      await testWaitForWorkerMessage();
      assertEqual(evoluInputs, []);

      let notifications = 0;
      const unsubscribe = evolu.subscribeQuery(todoTitleQuery)(() => {
        notifications += 1;
      });
      // React use() must still see fulfilled rows if another render happens
      // before the worker answers the refresh queued by subscription.
      const cachedLoad = evolu.loadQuery(todoTitleQuery);
      assert("status" in cachedLoad, "Cached promises expose React status");
      assertSame(cachedLoad.status, "fulfilled");
      assert("value" in cachedLoad, "Fulfilled promises expose cached rows");
      assertSame(cachedLoad.value, initialRows);
      assertSame(await cachedLoad, initialRows);
      assertSame(notifications, 0);
      await testWaitForWorkerMessage();
      assertEqual(evoluInputs, [
        { type: "Query", queries: new Set([todoTitleQuery]) },
      ]);

      postEvoluOutput({
        type: "OnPatchesByQuery",
        patchesByQuery: new Map([
          [
            todoTitleQuery,
            [{ op: "replaceAll", value: [{ title: "Synced" }] }],
          ],
        ]),
        onCompleteIds: [],
      });
      await testWaitForWorkerMessage();
      assertEqual(evolu.getQueryRows(todoTitleQuery), [{ title: "Synced" }]);
      assertEqual(notifications, 1);
      // React use() sees a new fulfilled promise after the refresh.
      const refreshedLoad = evolu.loadQuery(todoTitleQuery);
      assertNotSame(refreshedLoad, cachedLoad);
      assertEqual(await refreshedLoad, [{ title: "Synced" }]);
      unsubscribe();
    });

    it("subscribeQuery catches a mutation while the initial read is pending", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run, evoluInputs, postEvoluOutput } = setup;
      const evolu = await run.ok(testCreateEvolu);

      const initialLoad = evolu.loadQuery(todoTitleQuery);
      await testWaitForWorkerMessage();
      evolu.insert("todo", { title: NonEmptyTrimmedString100.orThrow("New") });
      await testWaitForWorkerMessage();
      evoluInputs.length = 0;

      const unsubscribe = evolu.subscribeQuery(todoTitleQuery)(constVoid);
      assertSame(evolu.loadQuery(todoTitleQuery), initialLoad);
      await testWaitForWorkerMessage();
      assertEqual(evoluInputs, [
        { type: "Query", queries: new Set([todoTitleQuery]) },
      ]);

      // The old read completes first. Its promise must still settle, and the
      // new subscription must retain the loading entry for the fresh response.
      postEvoluOutput({
        type: "OnPatchesByQuery",
        patchesByQuery: new Map([
          [todoTitleQuery, [{ op: "replaceAll", value: [] }]],
        ]),
        onCompleteIds: [],
      });
      assertEqual(await initialLoad, []);
      assertSame(evolu.loadQuery(todoTitleQuery), initialLoad);

      postEvoluOutput({
        type: "OnPatchesByQuery",
        patchesByQuery: new Map([
          [todoTitleQuery, [{ op: "replaceAll", value: [{ title: "New" }] }]],
        ]),
        onCompleteIds: [],
      });
      await testWaitForWorkerMessage();
      assertEqual(evolu.getQueryRows(todoTitleQuery), [{ title: "New" }]);
      assertEqual(await evolu.loadQuery(todoTitleQuery), [{ title: "New" }]);
      unsubscribe();
    });

    it("subscribeQuery reuses valid pending and completed reads", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run, evoluInputs, postEvoluOutput } = setup;
      const evolu = await run.ok(testCreateEvolu);

      const initialLoad = evolu.loadQuery(todoTitleQuery);
      await testWaitForWorkerMessage();
      evoluInputs.length = 0;
      const unsubscribe = evolu.subscribeQuery(todoTitleQuery)(constVoid);
      assertSame(evolu.loadQuery(todoTitleQuery), initialLoad);
      await testWaitForWorkerMessage();
      assertEqual(evoluInputs, []);

      postEvoluOutput({
        type: "OnPatchesByQuery",
        patchesByQuery: new Map([
          [todoTitleQuery, [{ op: "replaceAll", value: [] }]],
        ]),
        onCompleteIds: [],
      });
      await initialLoad;
      unsubscribe();

      const unsubscribeAgain = evolu.subscribeQuery(todoTitleQuery)(constVoid);
      assertSame(evolu.loadQuery(todoTitleQuery), initialLoad);
      await testWaitForWorkerMessage();
      assertEqual(evoluInputs, []);
      unsubscribeAgain();
    });

    it("subscribeQuery keeps refreshed rows cached after unsubscribe until the next invalidation", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run, evoluInputs, postEvoluOutput } = setup;
      const evolu = await run.ok(testCreateEvolu);

      const initialLoad = evolu.loadQuery(todoTitleQuery);
      await testWaitForWorkerMessage();
      postEvoluOutput({
        type: "OnPatchesByQuery",
        patchesByQuery: new Map([
          [todoTitleQuery, [{ op: "replaceAll", value: [] }]],
        ]),
        onCompleteIds: [],
      });
      await initialLoad;
      postEvoluOutput({ type: "RefreshQueries" });
      await testWaitForWorkerMessage();
      evoluInputs.length = 0;

      const unsubscribe = evolu.subscribeQuery(todoTitleQuery)(constVoid);
      await testWaitForWorkerMessage();
      assertEqual(evoluInputs, [
        { type: "Query", queries: new Set([todoTitleQuery]) },
      ]);
      unsubscribe();
      evoluInputs.length = 0;

      // The refresh response still replaces the cached rows.
      postEvoluOutput({
        type: "OnPatchesByQuery",
        patchesByQuery: new Map([
          [
            todoTitleQuery,
            [{ op: "replaceAll", value: [{ title: "Synced" }] }],
          ],
        ]),
        onCompleteIds: [],
      });
      await testWaitForWorkerMessage();
      assertEqual(evolu.getQueryRows(todoTitleQuery), [{ title: "Synced" }]);
      const cachedLoad = evolu.loadQuery(todoTitleQuery);
      assertEqual(await cachedLoad, [{ title: "Synced" }]);
      await testWaitForWorkerMessage();
      assertEqual(evoluInputs, []);

      // The next invalidation drops the unsubscribed cache without a read.
      postEvoluOutput({ type: "RefreshQueries" });
      await testWaitForWorkerMessage();
      assertEqual(evoluInputs, []);
      const reload = evolu.loadQuery(todoTitleQuery);
      assertNotSame(reload, cachedLoad);
      await testWaitForWorkerMessage();
      assertEqual(evoluInputs, [
        { type: "Query", queries: new Set([todoTitleQuery]) },
      ]);
    });

    it("subscribeQuery reuses the refreshing entry for repeated subscriptions in one tick", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run, evoluInputs, postEvoluOutput } = setup;
      const evolu = await run.ok(testCreateEvolu);

      const initialLoad = evolu.loadQuery(todoTitleQuery);
      await testWaitForWorkerMessage();
      postEvoluOutput({
        type: "OnPatchesByQuery",
        patchesByQuery: new Map([
          [todoTitleQuery, [{ op: "replaceAll", value: [] }]],
        ]),
        onCompleteIds: [],
      });
      await initialLoad;
      postEvoluOutput({ type: "RefreshQueries" });
      await testWaitForWorkerMessage();
      evoluInputs.length = 0;

      // React StrictMode subscribes, unsubscribes, and subscribes again
      // synchronously.
      const unsubscribeFirst = evolu.subscribeQuery(todoTitleQuery)(constVoid);
      const refreshingLoad = evolu.loadQuery(todoTitleQuery);
      unsubscribeFirst();
      const unsubscribe = evolu.subscribeQuery(todoTitleQuery)(constVoid);
      assertSame(evolu.loadQuery(todoTitleQuery), refreshingLoad);
      await testWaitForWorkerMessage();
      assertEqual(evoluInputs, [
        { type: "Query", queries: new Set([todoTitleQuery]) },
      ]);
      unsubscribe();
    });

    it("loadQuery reuses pending promise and sends one Query message", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run, evoluInputs } = setup;
      const evolu = await run.ok(testCreateEvolu);

      const firstLoad = evolu.loadQuery(todoTitleQuery);
      const secondLoad = evolu.loadQuery(todoTitleQuery);

      assertSame(firstLoad, secondLoad);

      await testWaitForWorkerMessage();

      await testWaitForWorkerMessage();

      assertEqual(evoluInputs, [
        { type: "Query", queries: new Set([todoTitleQuery]) },
      ]);
    });

    it("loadQueries delegates to loadQuery for each query", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run, evoluInputs } = setup;
      const evolu = await run.ok(testCreateEvolu);
      const loads = evolu.loadQueries([todoTitleQuery, todoTitleDescQuery]);

      assertLength(loads, 2);

      await testWaitForWorkerMessage();

      await testWaitForWorkerMessage();

      assertEqual(evoluInputs, [
        {
          type: "Query",
          queries: new Set([todoTitleQuery, todoTitleDescQuery]),
        },
      ]);
    });

    it("getQueryRows returns empty array for unknown query", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run } = setup;
      const evolu = await run.ok(testCreateEvolu);

      assertEqual(evolu.getQueryRows(todoTitleQuery), []);
    });

    it("subscribeQuery does not trigger Query by itself", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run, evoluInputs } = setup;
      const evolu = await run.ok(testCreateEvolu);

      const unsubscribe = evolu.subscribeQuery(todoTitleQuery)(constVoid);

      await testWaitForWorkerMessage();

      await testWaitForWorkerMessage();

      assertEqual(evoluInputs, []);

      unsubscribe();
    });

    it("allows subscribeQuery unsubscribe after dispose", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run } = setup;
      const evolu = await run.ok(testCreateEvolu);

      const unsubscribe = evolu.subscribeQuery(todoTitleQuery)(constVoid);

      await evolu[Symbol.asyncDispose]();

      (() => {
        unsubscribe();
      })();

      assertEqual(
        assertThrowsInstanceOf(() => {
          unsubscribe();
        }, Error).message,
        "subscribeQuery unsubscribe can be called only once.",
      );
    });

    it("RefreshQueries reads a pending unsubscribed loadQuery once, when it is subscribed", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run, evoluInputs, postEvoluOutput } = setup;
      const evolu = await run.ok(testCreateEvolu);

      void evolu.loadQuery(todoTitleQuery);
      await testWaitForWorkerMessage();

      evoluInputs.length = 0;
      postEvoluOutput({ type: "RefreshQueries" });
      await testWaitForWorkerMessage();

      assertEqual(evoluInputs, []);

      const unsubscribe = evolu.subscribeQuery(todoTitleQuery)(constVoid);
      await testWaitForWorkerMessage();

      assertEqual(evoluInputs, [
        { type: "Query", queries: new Set([todoTitleQuery]) },
      ]);

      unsubscribe();
    });

    it("RefreshQueries re-queries subscribed query without loadQuery", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run, evoluInputs, postEvoluOutput } = setup;
      const evolu = await run.ok(testCreateEvolu);

      const unsubscribe = evolu.subscribeQuery(todoTitleQuery)(constVoid);

      postEvoluOutput({ type: "RefreshQueries" });

      await testWaitForWorkerMessage();

      assertEqual(evoluInputs, [
        { type: "Query", queries: new Set([todoTitleQuery]) },
      ]);

      unsubscribe();
    });

    it("mutation releases pending unsubscribed loading promise on resolve", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run, evoluInputs, postEvoluOutput } = setup;
      const evolu = await run.ok(testCreateEvolu);

      const loadFiber = evolu.loadQuery(todoTitleQuery);
      await testWaitForWorkerMessage();

      evoluInputs.length = 0;

      evolu.insert("todo", { title: NonEmptyTrimmedString100.orThrow("M") });
      await testWaitForWorkerMessage();

      postEvoluOutput({
        type: "OnPatchesByQuery",
        patchesByQuery: new Map([
          [todoTitleQuery, [{ op: "replaceAll", value: [{ title: "R" }] }]],
        ]),
        onCompleteIds: [],
      });

      assertEqual(await loadFiber, [{ title: "R" }]);

      evoluInputs.length = 0;
      postEvoluOutput({ type: "RefreshQueries" });

      await testWaitForWorkerMessage();

      assertEqual(evoluInputs, []);
    });

    it("RefreshQueries drops fulfilled unsubscribed loading promises", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run, evoluInputs, postEvoluOutput } = setup;
      const evolu = await run.ok(testCreateEvolu);

      void evolu.loadQuery(todoTitleQuery);
      await testWaitForWorkerMessage();

      postEvoluOutput({
        type: "OnPatchesByQuery",
        patchesByQuery: new Map([
          [todoTitleQuery, [{ op: "replaceAll", value: [{ title: "A" }] }]],
        ]),
        onCompleteIds: [],
      });

      evoluInputs.length = 0;
      postEvoluOutput({ type: "RefreshQueries" });

      await testWaitForWorkerMessage();

      assertEqual(evoluInputs, []);
    });

    it("RefreshQueries keeps loading promise for subscribed query", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run, evoluInputs, postEvoluOutput } = setup;
      const evolu = await run.ok(testCreateEvolu);

      const unsubscribe = evolu.subscribeQuery(todoTitleQuery)(constVoid);
      void evolu.loadQuery(todoTitleQuery);
      await testWaitForWorkerMessage();

      evoluInputs.length = 0;
      postEvoluOutput({ type: "RefreshQueries" });

      await testWaitForWorkerMessage();

      assertEqual(evoluInputs, [
        { type: "Query", queries: new Set([todoTitleQuery]) },
      ]);

      unsubscribe();
    });

    it("OnPatchesByQuery replaces fulfilled loading promise for subscribed query", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run, postEvoluOutput } = setup;
      const evolu = await run.ok(testCreateEvolu);

      const unsubscribe = evolu.subscribeQuery(todoTitleQuery)(constVoid);

      const firstLoad = evolu.loadQuery(todoTitleQuery);
      await testWaitForWorkerMessage();

      postEvoluOutput({
        type: "OnPatchesByQuery",
        patchesByQuery: new Map([
          [todoTitleQuery, [{ op: "replaceAll", value: [{ title: "A" }] }]],
        ]),
        onCompleteIds: [],
      });

      assertEqual(await firstLoad, [{ title: "A" }]);

      const fulfilledLoad = evolu.loadQuery(todoTitleQuery);

      postEvoluOutput({
        type: "OnPatchesByQuery",
        patchesByQuery: new Map([
          [todoTitleQuery, [{ op: "replaceAll", value: [{ title: "B" }] }]],
        ]),
        onCompleteIds: [],
      });

      await testWaitForWorkerMessage();

      const replacedLoad = evolu.loadQuery(todoTitleQuery);

      assertNotSame(replacedLoad, fulfilledLoad);
      assertEqual(await replacedLoad, [{ title: "B" }]);

      unsubscribe();
    });

    it("OnPatchesByQuery ignores queries without loading promises", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run, evoluInputs, postEvoluOutput } = setup;
      await run.ok(testCreateEvolu);

      postEvoluOutput({
        type: "OnPatchesByQuery",
        patchesByQuery: new Map([
          [todoTitleQuery, [{ op: "replaceAll", value: [{ title: "X" }] }]],
        ]),
        onCompleteIds: [],
      });

      await testWaitForWorkerMessage();

      assertEqual(evoluInputs, []);
    });

    it("subscribeQuery notifies only when query rows reference changes", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run, postEvoluOutput } = setup;
      const evolu = await run.ok(testCreateEvolu);

      let calls = 0;
      const unsubscribe = evolu.subscribeQuery(todoTitleQuery)(() => {
        calls += 1;
      });

      postEvoluOutput({
        type: "OnPatchesByQuery",
        patchesByQuery: new Map([
          [todoTitleQuery, [{ op: "replaceAll", value: [{ title: "A" }] }]],
        ]),
        onCompleteIds: [],
      });

      postEvoluOutput({
        type: "OnPatchesByQuery",
        patchesByQuery: new Map(),
        onCompleteIds: [],
      });

      await testWaitForWorkerMessage();

      assertEqual(calls, 1);

      unsubscribe();
    });
  });

  describe("mutations", () => {
    it("insert posts mutate with generated id and stripped values", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run, evoluInputs } = setup;
      const evolu = await run.ok(testCreateEvolu);

      const insertedId = evolu.insert("todo", {
        title: NonEmptyTrimmedString100.orThrow("Todo 1"),
      }).id;

      await testWaitForWorkerMessage();

      await testWaitForWorkerMessage();

      assertEqual(evoluInputs, [
        {
          changes: [
            {
              id: insertedId,
              isDelete: null,
              isInsert: true,
              ownerId: testAppOwner.id,
              table: "todo",
              values: { title: "Todo 1" },
            },
          ],
          onCompleteIds: [],
          subscribedQueries: new Set(),
          type: "Mutate",
        },
      ]);
    });

    it("update and upsert preserve passed id and set isInsert correctly", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run, evoluInputs } = setup;
      const evolu = await run.ok(testCreateEvolu);

      const updateId = TodoId.orThrow(createIdFromString("todo-update"));
      const upsertId = TodoId.orThrow(createIdFromString("todo-upsert"));

      evolu.update("todo", {
        id: updateId,
        title: NonEmptyTrimmedString100.orThrow("Updated"),
        isDeleted: 1,
      });

      evolu.upsert("todo", {
        id: upsertId,
        title: NonEmptyTrimmedString100.orThrow("Upserted"),
      });

      await testWaitForWorkerMessage();

      await testWaitForWorkerMessage();

      assertEqual(evoluInputs, [
        {
          changes: [
            {
              id: updateId,
              isDelete: true,
              isInsert: false,
              ownerId: testAppOwner.id,
              table: "todo",
              values: { title: "Updated" },
            },
            {
              id: upsertId,
              isDelete: null,
              isInsert: true,
              ownerId: testAppOwner.id,
              table: "todo",
              values: { title: "Upserted" },
            },
          ],
          onCompleteIds: [],
          subscribedQueries: new Set(),
          type: "Mutate",
        },
      ]);
    });

    it("coalesces insert, update, and upsert in one microtask", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run, evoluInputs } = setup;
      const evolu = await run.ok(testCreateEvolu);

      const updateId = TodoId.orThrow(createIdFromString("todo-batch-update"));
      const upsertId = TodoId.orThrow(createIdFromString("todo-batch-upsert"));

      const insertedId = evolu.insert("todo", {
        title: NonEmptyTrimmedString100.orThrow("A"),
      }).id;
      evolu.update("todo", {
        id: updateId,
        title: NonEmptyTrimmedString100.orThrow("B"),
      });
      evolu.upsert("todo", {
        id: upsertId,
        title: NonEmptyTrimmedString100.orThrow("C"),
      });

      await testWaitForWorkerMessage();

      await testWaitForWorkerMessage();

      assertEqual(evoluInputs, [
        {
          changes: [
            {
              id: insertedId,
              isDelete: null,
              isInsert: true,
              ownerId: testAppOwner.id,
              table: "todo",
              values: { title: "A" },
            },
            {
              id: updateId,
              isDelete: null,
              isInsert: false,
              ownerId: testAppOwner.id,
              table: "todo",
              values: { title: "B" },
            },
            {
              id: upsertId,
              isDelete: null,
              isInsert: true,
              ownerId: testAppOwner.id,
              table: "todo",
              values: { title: "C" },
            },
          ],
          onCompleteIds: [],
          subscribedQueries: new Set(),
          type: "Mutate",
        },
      ]);
    });

    it("includes ownerId and onComplete callback ids", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run, evoluInputs } = setup;
      const evolu = await run.ok(testCreateEvolu);

      const insertedId = evolu.insert(
        "todo",
        { title: NonEmptyTrimmedString100.orThrow("With callback") },
        { ownerId: testAppOwner.id, onComplete: constVoid },
      ).id;

      await testWaitForWorkerMessage();

      await testWaitForWorkerMessage();

      const input = evoluInputs[0];
      assertSame(input?.type, "Mutate");
      const onCompleteId = input.onCompleteIds[0];
      assertNotUndefined(onCompleteId);
      assertEqual(evoluInputs, [
        {
          changes: [
            {
              id: insertedId,
              isDelete: null,
              isInsert: true,
              ownerId: testAppOwner.id,
              table: "todo",
              values: { title: "With callback" },
            },
          ],
          onCompleteIds: [onCompleteId],
          subscribedQueries: new Set(),
          type: "Mutate",
        },
      ]);
    });
  });

  describe("exportDatabase", () => {
    it("throws when OnExport arrives without pending export", async () => {
      const channels: Array<{
        readonly port1: {
          onMessage: ((message: EvoluOutput) => void) | null;
        };
      }> = [];

      await using setup = await setupRunWithEvoluDeps({
        createMessageChannel: <Input, Output = never>() => {
          const channel = testCreateMessageChannel<Input, Output>();
          channels.push(channel as never);
          return channel;
        },
      });
      const { run } = setup;
      await run.ok(testCreateEvolu);

      const evoluChannel = channels.find((channel) => channel.port1.onMessage);
      assertNonNullable(evoluChannel?.port1.onMessage);

      assertEqual(
        assertThrowsInstanceOf(() => {
          evoluChannel.port1.onMessage?.({
            type: "OnExport",
            file: new Uint8Array(),
          });
        }, Error).message,
        "OnExport received without pending export.",
      );
    });

    it("exports database for one caller", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run, evoluInputs, postEvoluOutput } = setup;
      const evolu = await run.ok(testCreateEvolu);

      const exportPromise = evolu.exportDatabase();

      await testWaitForWorkerMessage();

      assertEqual(evoluInputs, [{ type: "Export" }]);

      const file = new Uint8Array([1, 2, 3]);
      postEvoluOutput({ type: "OnExport", file });

      assertEqualBytes(await exportPromise, file);
    });

    it("shares pending export and resolves both callers", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run, evoluInputs, postEvoluOutput } = setup;
      const evolu = await run.ok(testCreateEvolu);

      const firstExport = evolu.exportDatabase();
      const secondExport = evolu.exportDatabase();

      await testWaitForWorkerMessage();

      assertEqual(evoluInputs, [{ type: "Export" }]);

      const firstFile = new Uint8Array([1, 2, 3]);
      postEvoluOutput({ type: "OnExport", file: firstFile });

      assertEqualBytes(await firstExport, firstFile);
      assertEqualBytes(await secondExport, firstFile);

      const thirdExport = evolu.exportDatabase();
      await testWaitForWorkerMessage();

      assertEqual(evoluInputs, [{ type: "Export" }, { type: "Export" }]);

      const secondFile = new Uint8Array([4, 5, 6]);
      postEvoluOutput({ type: "OnExport", file: secondFile });

      assertEqualBytes(await thirdExport, secondFile);
    });

    it("returns a new promise after previous export resolves", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run, evoluInputs, postEvoluOutput } = setup;
      const evolu = await run.ok(testCreateEvolu);

      const firstExport = evolu.exportDatabase();
      const secondExport = evolu.exportDatabase();

      await testWaitForWorkerMessage();

      assertEqual(evoluInputs, [{ type: "Export" }]);

      const file = new Uint8Array([7, 8, 9]);
      postEvoluOutput({ type: "OnExport", file });

      assertEqualBytes(await firstExport, file);
      assertEqualBytes(await secondExport, file);

      const thirdExport = evolu.exportDatabase();

      await testWaitForWorkerMessage();

      assertEqual(evoluInputs, [{ type: "Export" }, { type: "Export" }]);

      const secondFile = new Uint8Array([13, 14, 15]);
      postEvoluOutput({ type: "OnExport", file: secondFile });

      assertEqualBytes(await thirdExport, secondFile);
    });

    it("aborting run-wrapped export does not cancel shared export", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run, evoluInputs, postEvoluOutput } = setup;
      const evolu = await run.ok(testCreateEvolu);

      const sharedExport = evolu.exportDatabase();
      const wrappedExport = run.abortable(async (run) => {
        const file = await evolu.exportDatabase();
        run.signal.throwIfAborted();
        return ok(file);
      });

      await testWaitForWorkerMessage();

      assertEqual(evoluInputs, [{ type: "Export" }]);

      wrappedExport.abort();

      const file = new Uint8Array([16, 17, 18]);
      postEvoluOutput({ type: "OnExport", file });

      assertEqual(
        await wrappedExport,
        err({ type: "AbortError", reason: explicitAbortReason }),
      );
      assertEqualBytes(await sharedExport, file);
    });
  });
});
