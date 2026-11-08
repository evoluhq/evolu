import {
  assert,
  assertEqual,
  assertEqualBytes,
  assertErr,
  assertFalse,
  assertInstanceOf,
  assertLength,
  assertNonNullable,
  assertNotNull,
  assertNotSame,
  assertNotUndefined,
  assertRejects,
  assertSame,
  assertThrowsInstanceOf,
  assertThrowsSame,
  assertTrue,
} from "../Assert.ts";
import * as fc from "fast-check";
import { describe, it } from "node:test";
import type { Brand } from "../Brand.ts";
import { createBuffer } from "../Bytes.ts";
import type { ConsoleEntry } from "../Console.ts";
import { testCreateConsole } from "../Console.ts";
import { createXChaCha20Poly1305 } from "../Crypto.ts";
import { createUnknownError, type UnknownError } from "../Error.ts";
import { constVoid } from "../Function.ts";
import type { DbWorkerInit, UnsupportedDbVersionError } from "./Db.ts";
import {
  AppName,
  createEvolu,
  createEvoluDeps,
  type DevicePersistence,
  type Evolu,
  type EvoluConfig,
  isDatabaseDeleted,
  maxMutationSize,
  testAppName,
  type EvoluPlatformDeps,
  type StoredWorkerDep,
} from "./Evolu.ts";
import {
  createOwnerSecret,
  createOwnerWebSocketTransport,
  createSharedOwner,
  createSharedReadonlyOwner,
  createShardOwner,
  type Owner,
  type OwnerId,
  RelayUrl,
  RelayUrlFromString,
  testAppOwner,
  testOwnerSecret,
} from "./Owner.ts";
import {
  createProtocolBroadcastMessagesFromCrdtMessages,
  createProtocolMessageBuffer,
  createProtocolMessageFromCrdtMessages,
  createTimestampsBuffer,
  encodeAndEncryptDbChange,
  encodeDbChange,
  MessageType,
  ProtocolErrorCode,
  ProtocolMessageRangesMaxSize,
} from "./Protocol.ts";
import type { Patch, Query } from "./Query.ts";
import { createQueryBuilder } from "./Schema.ts";
import {
  consoleEntryOrErrorBroadcastChannelName,
  type ConsoleEntryOrError,
  type CreateStoredWorkerDep,
  type DbWorkerInput,
  type DbWorkerOutput,
  type EvoluInput,
  type EvoluOutput,
  type OwnerRegistrationId,
  type SharedWorker,
  type SharedWorkerId,
  type SharedWorkerInput,
  type SharedWorkerOutput,
  type SyncState,
  syncStateToOwnerSyncStatus,
} from "./Shared.ts";
import { acquireLeaderLock, testCreateLockManager } from "../LockManager.ts";
import { installPolyfills } from "../Polyfills.ts";
import { err, ok, type Result } from "../Result.ts";
import { SqliteBoolean } from "../Sqlite.ts";
import { explicitAbortReason, testCreateDeps, testCreateRun } from "../Task.ts";
import { testCreateId, testStubGlobal } from "../Test.ts";
import { maxMillis, Millis } from "../Time.ts";
import { WebSocketUrl } from "../WebSocket.ts";
import {
  assertType,
  createIdFromString,
  FiniteNumber,
  id,
  NonEmptyTrimmedString100,
  nullOr,
  PositiveInt,
  String as StringType,
  testName,
  Name,
  Uint8Array as Uint8ArrayType,
} from "../Type.ts";
import type { ExtractTyped } from "../Type.ts";
import { DbChange, RangeType } from "./Storage.ts";
import {
  createTimestamp,
  maxCounter,
  maxNodeId,
  type NodeId,
  timestampToTimestampBytes,
} from "./Timestamp.ts";
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
  url: RelayUrl.orThrow("wss://example.com/"),
  ownerId: testAppOwner.id,
});

/** {@link testAppOwner} as useOwner posts it, without its type and mnemonic. */
const testPostedAppOwner: Owner = {
  id: testAppOwner.id,
  encryptionKey: testAppOwner.encryptionKey,
  writeKey: testAppOwner.writeKey,
};

const testSharedOwner = createSharedOwner(
  createOwnerSecret(testCreateDeps({ seed: "evolu-shared-owner" })),
);

/** The registration IDs that the inputs' owner actions name, in order. */
const getRegistrationIds = (
  inputs: ReadonlyArray<EvoluInput>,
): Array<OwnerRegistrationId> =>
  inputs.flatMap((input) =>
    input.type === "UseOwner"
      ? input.actions.flatMap((action) =>
          action.action === "sync" ? [] : [action.id],
        )
      : [],
  );

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

    const storedWorker: SharedWorker = onSharedWorkerPostMessage
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

    const evoluDeps: EvoluPlatformDeps & StoredWorkerDep = {
      createDbWorker: testCreateWorker,
      createBroadcastChannel: testCreateBroadcastChannel,
      createMessageChannel: testCreateMessageChannel,
      getDevicePersistence: () => Promise.resolve("Unknown"),
      lockManager: testCreateLockManager(),
      reloadApp: constVoid,
      storedWorker: Promise.resolve(storedWorker),
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

  /** Captures the instance's channel, so a test can deliver to it directly. */
  const setupWithEvoluChannel = async (
    overrides: Partial<EvoluPlatformDeps> = {},
  ) => {
    const channels: Array<{
      readonly port1: {
        onMessage: ((message: EvoluOutput) => void) | null;
      };
    }> = [];
    const setup = await setupRunWithEvoluDeps({
      ...overrides,
      createMessageChannel: <Input, Output = never>() => {
        const channel = testCreateMessageChannel<Input, Output>();
        channels.push(channel as never);
        return channel;
      },
    });
    return Object.assign(setup, {
      deliver: (output: EvoluOutput): void => {
        const evoluChannel = channels.find(
          (channel) => channel.port1.onMessage,
        );
        assertNonNullable(evoluChannel?.port1.onMessage);
        evoluChannel.port1.onMessage(output);
      },
    });
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
      overrides: Partial<EvoluPlatformDeps> = {},
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
          getDevicePersistence: () => Promise.resolve("Unknown"),
          lockManager: testCreateLockManager(),
          createStoredWorker: () => worker,
          reloadApp: constVoid,
          console: testCreateConsole(),
          ...overrides,
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
            consoleEntryOrErrorChannelName:
              consoleEntryOrErrorBroadcastChannelName,
          });
          await testWaitForWorkerMessage();
        },
        [Symbol.dispose]: () => disposables.dispose(),
      };
    };

    it("reports an OtherBuildRunningError its worker sends and clears it once the worker connects", async () => {
      const lockManager = testCreateLockManager();
      const requestedLocks: Array<string> = [];
      using setup = await setupCreateEvoluDeps({
        lockManager: {
          query: () => lockManager.query(),
          request: ((name: string, ...rest: Array<unknown>) => {
            requestedLocks.push(name);
            return (
              lockManager.request as (...args: Array<unknown>) => unknown
            )(name, ...rest);
          }) as LockManager["request"],
        },
      });

      setup.sharedWorkerPort.postMessage({
        type: "Error",
        error: { type: "OtherBuildRunningError" },
      });
      await testWaitForWorkerMessage();
      assertEqual(setup.deps.evoluError.get(), {
        type: "OtherBuildRunningError",
      });

      // Cleared last, so an app's listener that throws, which stops the rest
      // of the handler, finds the tab competing to host DbWorkers already.
      const workerId = testCreateId()<"SharedWorker">();
      let competesWhenCleared = false;
      setup.deps.evoluError.subscribe(() => {
        competesWhenCleared = requestedLocks.some((name) =>
          name.endsWith(`tab-${workerId}`),
        );
      });
      await setup.connect(workerId);
      assertSame(setup.deps.evoluError.get(), null);
      assertTrue(competesWhenCleared);
    });

    it("logs an error its worker sends before it reports it", async () => {
      const testConsole = testCreateConsole();
      using setup = await setupCreateEvoluDeps({ console: testConsole });
      const error = createUnknownError("The worker failed.");
      // So an app's listener that throws can't hide it from the console.
      let entriesWhenReported: ReadonlyArray<ConsoleEntry> = [];
      setup.deps.evoluError.subscribe(() => {
        entriesWhenReported = testConsole.getEntriesSnapshot();
      });

      setup.sharedWorkerPort.postMessage({ type: "Error", error });
      await testWaitForWorkerMessage();

      assertEqual(setup.deps.evoluError.get(), error);
      assertEqual(entriesWhenReported, [
        { method: "error", path: [], args: [error] },
      ]);
    });

    it("logs an error of its worker's console channel before it reports it", async () => {
      const testConsole = testCreateConsole();
      using setup = await setupCreateEvoluDeps({ console: testConsole });
      const error = createUnknownError("A DbWorker failed.");
      let entriesWhenReported: ReadonlyArray<ConsoleEntry> = [];
      setup.deps.evoluError.subscribe(() => {
        entriesWhenReported = testConsole.getEntriesSnapshot();
      });

      setup.consoleEntryOrErrorBroadcastChannel.postMessage({
        type: "Error",
        error,
      });
      await testWaitForWorkerMessage();

      assertEqual(setup.deps.evoluError.get(), error);
      assertEqual(entriesWhenReported, [
        { method: "error", path: [], args: [error] },
      ]);
    });

    it("keeps a stored worker's OtherBuildRunningError when a memory worker connects", async () => {
      const createWorkerId = testCreateId();
      using memoryWorker = testCreateSharedWorker<
        SharedWorkerInput,
        SharedWorkerOutput
      >();
      memoryWorker.self.onConnect = (port) => {
        port.onMessage = constVoid;
        port.postMessage({
          type: "Connected",
          workerId: createWorkerId<"SharedWorker">(),
          syncStateChannelName: "memory-wait-sync-state",
          consoleEntryOrErrorChannelName: "memory-wait-console",
        });
      };
      memoryWorker.connect();
      using setup = await setupCreateEvoluDeps({
        createMemoryInstanceWorker: () => memoryWorker,
      });
      setup.sharedWorkerPort.postMessage({
        type: "Error",
        error: { type: "OtherBuildRunningError" },
      });
      await testWaitForWorkerMessage();
      const waitingError = setup.deps.evoluError.get();
      assertEqual(waitingError, { type: "OtherBuildRunningError" });

      const createMemoryInstanceWorker = setup.deps.createMemoryInstanceWorker;
      assertNotUndefined(createMemoryInstanceWorker);
      using _memoryConnection = createMemoryInstanceWorker();
      await testWaitForWorkerMessage();

      assertSame(setup.deps.evoluError.get(), waitingError);

      await setup.connect(createWorkerId<"SharedWorker">());
      assertSame(setup.deps.evoluError.get(), null);
    });

    it("keeps another error when its worker connects", async () => {
      using setup = await setupCreateEvoluDeps();
      const error: UnsupportedDbVersionError = {
        type: "UnsupportedDbVersionError",
        storedVersion: PositiveInt.orThrow(3),
        supportedVersion: PositiveInt.orThrow(2),
      };

      setup.sharedWorkerPort.postMessage({ type: "Error", error });
      await testWaitForWorkerMessage();
      await setup.connect(testCreateId()<"SharedWorker">());

      assertEqual(setup.deps.evoluError.get(), error);
    });

    it("says nothing to a worker that reports it waits", async () => {
      using setup = await setupCreateEvoluDeps();

      setup.sharedWorkerPort.postMessage({
        type: "Waiting",
        workerId: testCreateId()<"SharedWorker">(),
      });
      await testWaitForWorkerMessage();

      assertEqual(setup.messages, []);
      assertSame(setup.deps.evoluError.get(), null);
    });

    it("announces itself as tab leader with its console level once its worker connects", async () => {
      const testConsole = testCreateConsole();
      using setup = await setupCreateEvoluDeps({ console: testConsole });
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
      using first = await setupCreateEvoluDeps({ lockManager });
      using second = await setupCreateEvoluDeps({ lockManager });
      using ofOtherWorker = await setupCreateEvoluDeps({ lockManager });
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
      const sharedWorkerId = testCreateId()<"SharedWorker">();
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
        getDevicePersistence: () => Promise.resolve("Unknown" as const),
        lockManager: testCreateLockManager(),
        createStoredWorker: () => worker,
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
          consoleEntryOrErrorChannelName:
            consoleEntryOrErrorBroadcastChannelName,
          sharedWorkerId,
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
        consoleEntryOrErrorChannelName: consoleEntryOrErrorBroadcastChannelName,
        sharedWorkerId,
        port: dbWorkerChannel.port1.native,
      });

      dbWorkerChannel[Symbol.dispose]();
    });

    it("hosts the DbWorkers a memory worker requests for as long as its instance", async () => {
      using disposer = new DisposableStack();
      const dbWorkerMessages: Array<DbWorkerInit> = [];
      let dbWorkerDisposeCount = 0;
      const workerId = testCreateId()<"SharedWorker">();
      const channelName = `${consoleEntryOrErrorBroadcastChannelName}:${workerId}`;
      using memoryWorker = testCreateSharedWorker<
        SharedWorkerInput,
        SharedWorkerOutput
      >();
      const memoryPort =
        Promise.withResolvers<
          MessagePort<SharedWorkerOutput, SharedWorkerInput>
        >();
      memoryWorker.self.onConnect = (port) => {
        port.onMessage = constVoid;
        port.postMessage({
          type: "Connected",
          workerId,
          syncStateChannelName: `evolu:sync-state:${workerId}`,
          consoleEntryOrErrorChannelName: channelName,
        });
        memoryPort.resolve(port);
      };
      memoryWorker.connect();
      using setup = await setupCreateEvoluDeps({
        createMemoryInstanceWorker: () => memoryWorker,
        createDbWorker: () => {
          const worker = disposer.use(testCreateWorker<DbWorkerInit>());
          worker.self.onMessage = (message) => {
            dbWorkerMessages.push(message);
          };
          return {
            ...worker,
            [Symbol.dispose]: () => {
              dbWorkerDisposeCount++;
              worker[Symbol.dispose]();
            },
          };
        },
      });
      const createMemoryInstanceWorker = setup.deps.createMemoryInstanceWorker;
      assertNotUndefined(createMemoryInstanceWorker);
      using memoryConnection = createMemoryInstanceWorker();
      using dbWorkerChannel = testCreateMessageChannel<
        DbWorkerOutput,
        DbWorkerInput
      >();
      const init: DbWorkerInit = {
        type: "DbWorkerInit",
        name: testName,
        consoleLevel: "debug",
        sqliteSchema: { tables: {}, indexes: [] },
        encryptionKey: testAppOwner.encryptionKey,
        memoryOnly: true,
        consoleEntryOrErrorChannelName: channelName,
        sharedWorkerId: workerId,
        port: dbWorkerChannel.port1.native,
      };

      (await memoryPort.promise).postMessage(init, [init.port]);
      await testWaitForWorkerMessage();

      assertEqual(dbWorkerMessages, [init]);
      assertSame(dbWorkerDisposeCount, 0);
      memoryConnection[Symbol.dispose]();
      assertSame(dbWorkerDisposeCount, 1);
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
            consoleEntryOrErrorChannelName:
              consoleEntryOrErrorBroadcastChannelName,
          });
        };
        worker.connect();

        using deps = createEvoluDeps({
          createDbWorker: testCreateWorker,
          createBroadcastChannel: testCreateBroadcastChannel,
          createMessageChannel: testCreateMessageChannel,
          getDevicePersistence: () => Promise.resolve("Unknown" as const),
          lockManager: testCreateLockManager(),
          createStoredWorker: () => worker,
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
      using setup = await setupCreateEvoluDeps({ console: testConsole });
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
        tenants: [{ type: "Active", name: Name.orThrow(label), owners: [] }],
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

    it("combines shared and memory workers' sync states and removes a disposed memory worker", async () => {
      const createId = testCreateId();
      const sharedWorkerId = createId<"SharedWorker">();
      const memoryChannelNames: Array<string> = [];
      using setup = await setupCreateEvoluDeps({
        createMemoryInstanceWorker: () => {
          const channelName = `memory-sync-state-${memoryChannelNames.length}`;
          memoryChannelNames.push(channelName);
          const worker = testCreateSharedWorker<
            SharedWorkerInput,
            SharedWorkerOutput
          >();
          worker.self.onConnect = (port) => {
            port.onMessage = constVoid;
            port.postMessage({
              type: "Connected",
              workerId: createId<"SharedWorker">(),
              syncStateChannelName: channelName,
              consoleEntryOrErrorChannelName: `${channelName}-console`,
            });
          };
          worker.connect();
          return worker;
        },
      });
      const createMemoryInstanceWorker = setup.deps.createMemoryInstanceWorker;
      assertNotUndefined(createMemoryInstanceWorker);
      using first = createMemoryInstanceWorker();
      using _second = createMemoryInstanceWorker();
      await setup.connect(sharedWorkerId);
      using sharedChannel = testCreateBroadcastChannel<SyncState>(
        `evolu:sync-state:${sharedWorkerId}`,
      );
      using firstChannel = testCreateBroadcastChannel<SyncState>(
        memoryChannelNames[0],
      );
      using secondChannel = testCreateBroadcastChannel<SyncState>(
        memoryChannelNames[1],
      );
      const createState = (name: string): SyncState => ({
        transports: [
          {
            type: "WebSocket",
            id: createIdFromString<"SyncTransport">(name),
            label: RelayUrl.orThrow("wss://relay.example/"),
            connection: {
              type: "Open",
              openedAt: Millis.orThrow(1000),
              error: null,
            },
          },
        ],
        tenants: [{ type: "Active", name: Name.orThrow(name), owners: [] }],
      });
      sharedChannel.postMessage(createState("stored"));
      firstChannel.postMessage(createState("first"));
      secondChannel.postMessage(createState("second"));
      await testWaitForWorkerMessage();

      assertEqual(
        setup.deps.syncState.get()?.tenants.map((tenant) => tenant.name),
        ["stored", "first", "second"],
      );
      assertEqual(
        setup.deps.syncState.get()?.transports.map((transport) => transport.id),
        ["stored", "first", "second"].map((name) =>
          createIdFromString<"SyncTransport">(name),
        ),
      );

      first[Symbol.dispose]();
      assertEqual(
        setup.deps.syncState.get()?.tenants.map((tenant) => tenant.name),
        ["stored", "second"],
      );
      assertSame(setup.deps.syncState.get()?.transports.length, 2);

      firstChannel.postMessage(createState("disposed"));
      secondChannel.postMessage(createState("updated"));
      await testWaitForWorkerMessage();
      assertEqual(
        setup.deps.syncState.get()?.tenants.map((tenant) => tenant.name),
        ["stored", "updated"],
      );
    });

    it("disposes every worker without notifying sync state subscribers", async () => {
      using disposer = new DisposableStack();
      const createId = testCreateId();
      const disposedWorkerNames: Array<string> = [];
      const createTrackedWorker = (name: string): SharedWorker => {
        const worker = disposer.use(
          testCreateSharedWorker<SharedWorkerInput, SharedWorkerOutput>(),
        );
        worker.self.onConnect = (port) => {
          port.onMessage = constVoid;
          port.postMessage({
            type: "Connected",
            workerId: createId<"SharedWorker">(),
            syncStateChannelName: `teardown-sync-state-${name}`,
            consoleEntryOrErrorChannelName: `teardown-console-${name}`,
          });
        };
        worker.connect();
        return {
          port: worker.port,
          [Symbol.dispose]: () => {
            disposedWorkerNames.push(name);
            worker[Symbol.dispose]();
          },
        };
      };
      let memoryWorkerCount = 0;
      using deps = createEvoluDeps({
        createDbWorker: testCreateWorker,
        createBroadcastChannel: testCreateBroadcastChannel,
        createMessageChannel: testCreateMessageChannel,
        createMemoryInstanceWorker: () =>
          createTrackedWorker(`memory-${++memoryWorkerCount}`),
        getDevicePersistence: () => Promise.resolve("Unknown"),
        lockManager: testCreateLockManager(),
        reloadApp: constVoid,
        createStoredWorker: () => createTrackedWorker("stored"),
        console: testCreateConsole(),
      });
      await deps.storedWorker;
      const createMemoryInstanceWorker = deps.createMemoryInstanceWorker;
      assertNotUndefined(createMemoryInstanceWorker);
      using _first = createMemoryInstanceWorker();
      using _second = createMemoryInstanceWorker();
      await testWaitForWorkerMessage();
      for (const name of ["stored", "memory-1", "memory-2"]) {
        const channel = disposer.use(
          testCreateBroadcastChannel<SyncState>(`teardown-sync-state-${name}`),
        );
        channel.postMessage({
          transports: [],
          tenants: [{ type: "Active", name: Name.orThrow(name), owners: [] }],
        });
      }
      await testWaitForWorkerMessage();
      const snapshot = deps.syncState.get();
      assertNotNull(snapshot);
      assertEqual(
        snapshot.tenants.map(({ name }) => name),
        ["stored", "memory-1", "memory-2"],
      );
      let notificationCount = 0;
      deps.syncState.subscribe(() => {
        notificationCount++;
        throw new Error("A subscriber failed during shutdown.");
      });

      deps[Symbol.dispose]();

      assertSame(notificationCount, 0);
      assertSame(deps.syncState.get(), snapshot);
      assertEqual(disposedWorkerNames, ["stored", "memory-1", "memory-2"]);
    });

    it("receives a memory worker's errors and console entries until it is disposed", async () => {
      const firstConsole = testCreateConsole();
      const workerId = testCreateId()<"SharedWorker">();
      using first = await setupCreateEvoluDeps({
        console: firstConsole,
        createMemoryInstanceWorker: () => {
          const worker = testCreateSharedWorker<
            SharedWorkerInput,
            SharedWorkerOutput
          >();
          worker.self.onConnect = (port) => {
            port.onMessage = constVoid;
            port.postMessage({
              type: "Connected",
              workerId,
              syncStateChannelName: `evolu:sync-state:${workerId}`,
              consoleEntryOrErrorChannelName: `${consoleEntryOrErrorBroadcastChannelName}:${workerId}`,
            });
          };
          worker.connect();
          return worker;
        },
      });
      const createMemoryInstanceWorker = first.deps.createMemoryInstanceWorker;
      assertNotUndefined(createMemoryInstanceWorker);
      using _worker = createMemoryInstanceWorker();
      using channel = testCreateBroadcastChannel<ConsoleEntryOrError>(
        `${consoleEntryOrErrorBroadcastChannelName}:${workerId}`,
      );
      await testWaitForWorkerMessage();
      const error = createUnknownError("Only the memory instance failed");
      const entry: ConsoleEntry = {
        method: "info",
        path: ["memory"],
        args: ["A private worker's entry"],
      };
      channel.postMessage({ type: "Error", error });
      channel.postMessage({ type: "ConsoleEntry", entry });
      await testWaitForWorkerMessage();

      assertEqual(first.deps.evoluError.get(), error);
      assertEqual(firstConsole.getEntriesSnapshot().at(-1), entry);

      _worker[Symbol.dispose]();
      channel.postMessage({
        type: "Error",
        error: createUnknownError("The disposed worker's error"),
      });
      await testWaitForWorkerMessage();
      assertEqual(first.deps.evoluError.get(), error);
    });

    it("keeps the stored console channel open for the deps lifetime", async () => {
      const console = testCreateConsole();
      using setup = await setupCreateEvoluDeps({ console });
      const postStoredMessages = async (message: string): Promise<void> => {
        const error = createUnknownError(message);
        const entry: ConsoleEntry = {
          method: "info",
          path: ["stored"],
          args: [message],
        };
        setup.consoleEntryOrErrorBroadcastChannel.postMessage({
          type: "Error",
          error,
        });
        setup.consoleEntryOrErrorBroadcastChannel.postMessage({
          type: "ConsoleEntry",
          entry,
        });
        await testWaitForWorkerMessage();
        assertEqual(setup.deps.evoluError.get(), error);
        assertEqual(console.getEntriesSnapshot(), [
          { method: "error", path: [], args: [error] },
          entry,
        ]);
      };

      await postStoredMessages("Before any port post");
      assertEqual(setup.messages, []);

      setup.deps[Symbol.dispose]();
      const error = setup.deps.evoluError.get();
      setup.consoleEntryOrErrorBroadcastChannel.postMessage({
        type: "Error",
        error: createUnknownError("After deps disposal"),
      });
      await testWaitForWorkerMessage();
      assertSame(setup.deps.evoluError.get(), error);
      assertEqual(console.getEntriesSnapshot(), []);
    });

    it("keeps the unchanged parts of each sync state snapshot", async () => {
      using setup = await setupCreateEvoluDeps();
      const { deps, connect } = setup;
      const workerId = testCreateId()<"SharedWorker">();
      using channel = testCreateBroadcastChannel<SyncState>(
        `evolu:sync-state:${workerId}`,
      );
      await connect(workerId);
      let notificationCount = 0;
      deps.syncState.subscribe(() => {
        notificationCount++;
      });
      const transportId = testCreateId()<"SyncTransport">();
      // Every snapshot is a new structured clone. The worker wraps a caught
      // Error inside an error in an UnknownError, whose cause can hold the
      // bytes of a received change.
      const createState = (
        lastSentAt: number,
        message = "wrong key",
      ): SyncState => ({
        transports: [
          {
            type: "WebSocket",
            id: transportId,
            label: RelayUrl.orThrow("wss://relay.example/"),
            connection: {
              type: "Open",
              openedAt: Millis.orThrow(1000),
              error: null,
            },
          },
        ],
        tenants: [
          {
            type: "Active",
            name: testName,
            owners: [
              {
                type: "Writable",
                ownerId: testAppOwner.id,
                routes: [
                  {
                    type: "Settled",
                    transportId,
                    skippedError: {
                      type: "DecryptWithXChaCha20Poly1305Error",
                      error: {
                        type: "UnknownError",
                        error: {
                          message,
                          cause: { values: { photo: Uint8Array.of(1, 2, 3) } },
                        },
                      },
                      at: Millis.orThrow(1500),
                    },
                    completeAt: null,
                    lastSentAt: Millis.orThrow(lastSentAt),
                    lastReceivedAt: Millis.orThrow(1500),
                  },
                ],
              },
            ],
          },
        ],
      });
      const routeOf = (state: SyncState | null) => {
        const tenant = state?.tenants[0];
        assert(tenant?.type === "Active", "The tenant should be active.");
        const owner = tenant.owners[0];
        assert(owner?.type === "Writable", "The owner should be writable.");
        const route = owner.routes[0];
        assert(route?.type === "Settled", "The route should be settled.");
        return route;
      };
      const statusOf = (state: SyncState | null) =>
        syncStateToOwnerSyncStatus(state, testName, testAppOwner.id);

      channel.postMessage(createState(1000));
      await testWaitForWorkerMessage();
      const first = deps.syncState.get();
      assertNotNull(first);
      assertSame(notificationCount, 1);

      // An equal snapshot leaves the store unchanged.
      channel.postMessage(createState(1000));
      await testWaitForWorkerMessage();
      assertSame(deps.syncState.get(), first);
      assertSame(notificationCount, 1);

      // A changed route gets a new object, and every unchanged part keeps the
      // previous one, so the owner's status is the same object.
      channel.postMessage(createState(2000));
      await testWaitForWorkerMessage();
      const second = deps.syncState.get();
      assertNotNull(second);
      assertNotSame(second, first);
      assertSame(notificationCount, 2);
      assertSame(second.transports, first.transports);
      assertNotSame(routeOf(second), routeOf(first));
      assertSame(routeOf(second).skippedError, routeOf(first).skippedError);
      assertSame(statusOf(second), statusOf(first));

      // An error with another message is a new error and a new status.
      channel.postMessage(createState(2000, "tampered"));
      await testWaitForWorkerMessage();
      const third = deps.syncState.get();
      assertNotSame(routeOf(third).skippedError, routeOf(second).skippedError);
      assertNotSame(statusOf(third), statusOf(second));
    });

    it("keeps each part of a sync state snapshot when one before it goes away", async () => {
      using setup = await setupCreateEvoluDeps();
      const { deps, connect } = setup;
      const createId = testCreateId();
      const workerId = createId<"SharedWorker">();
      using channel = testCreateBroadcastChannel<SyncState>(
        `evolu:sync-state:${workerId}`,
      );
      await connect(workerId);
      const removedTransportId = createId<"SyncTransport">();
      const transportId = createId<"SyncTransport">();
      const at = Millis.orThrow(1000);
      // The full snapshot lists a transport, tenant, owner, and route before
      // each part the other snapshot keeps. Only the kept route has an error.
      const createState = (isFull: boolean): SyncState => ({
        transports: [removedTransportId, transportId]
          .slice(isFull ? 0 : 1)
          .map((id) => ({
            type: "WebSocket",
            id,
            label: RelayUrl.orThrow(`wss://${id.toLowerCase()}.example/`),
            connection: { type: "Open", openedAt: at, error: null },
          })),
        tenants: [
          ...(isFull
            ? [
                {
                  type: "Active" as const,
                  name: Name.orThrow("removed"),
                  owners: [],
                },
              ]
            : []),
          {
            type: "Active",
            name: testName,
            owners: [
              ...(isFull
                ? [
                    {
                      type: "Writable" as const,
                      ownerId: createId<"OwnerId">(),
                      routes: [],
                    },
                  ]
                : []),
              {
                type: "Writable",
                ownerId: testAppOwner.id,
                routes: [
                  ...(isFull
                    ? [
                        {
                          type: "Complete" as const,
                          transportId: removedTransportId,
                          completeAt: at,
                          lastSentAt: at,
                          lastReceivedAt: at,
                        },
                      ]
                    : []),
                  {
                    type: "Pending",
                    transportId,
                    failure: {
                      type: "ProtocolQuotaError",
                      ownerId: testAppOwner.id,
                      at,
                    },
                    skippedError: null,
                    completeAt: null,
                    lastSentAt: at,
                    lastReceivedAt: at,
                  },
                ],
              },
            ],
          },
        ],
      });
      const statusOf = (state: SyncState | null) =>
        syncStateToOwnerSyncStatus(state, testName, testAppOwner.id);

      channel.postMessage(createState(true));
      await testWaitForWorkerMessage();
      const full = deps.syncState.get();
      assertNotNull(full);
      assertSame(statusOf(full).type, "Error");

      channel.postMessage(createState(false));
      await testWaitForWorkerMessage();
      const kept = deps.syncState.get();
      assertNotNull(kept);
      assertEqual(kept, createState(false));
      assertSame(kept.transports[0], full.transports[1]);
      assertSame(statusOf(kept), statusOf(full));
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
          consoleEntryOrErrorChannelName:
            consoleEntryOrErrorBroadcastChannelName,
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
        getDevicePersistence: () => Promise.resolve("Unknown" as const),
        lockManager: testCreateLockManager(),
        createStoredWorker: () => ({ port, [Symbol.dispose]: constVoid }),
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

    it("only logs a sync error that an older build broadcasts", async () => {
      const testConsole = testCreateConsole();
      using setup = await setupCreateEvoluDeps({ console: testConsole });
      const { deps, consoleEntryOrErrorBroadcastChannel } = setup;
      const error = {
        type: "ProtocolQuotaError",
        ownerId: testAppOwner.id,
      } as const;

      consoleEntryOrErrorBroadcastChannel.postMessage({
        type: "Error",
        // @ts-expect-error A ConsoleEntryOrError Error carries only an UnknownError, but a still-running worker of an older build posts a ProtocolQuotaError.
        error,
      });

      await testWaitForWorkerMessage();

      assertSame(deps.evoluError.get(), null);
      assertEqual(testConsole.getEntriesSnapshot(), [
        { method: "error", path: [], args: [error] },
      ]);
    });

    for (const source of ["SharedWorker", "Error", "ConsoleEntry"] as const) {
      it(`preserves the first startup refusal while logging a later ${source} message`, async () => {
        const testConsole = testCreateConsole();
        using setup = await setupCreateEvoluDeps({ console: testConsole });
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

    it("throws for unknown tab output type", async () => {
      const consoleEntryOrErrorBroadcastChannel: {
        value: {
          readonly onMessage: ((message: ConsoleEntryOrError) => void) | null;
        } | null;
      } = { value: null };

      using _setup = await setupCreateEvoluDeps({
        createBroadcastChannel: <Input, Output = Input>(name: string) => {
          const channel = testCreateBroadcastChannel<Input, Output>(name);
          consoleEntryOrErrorBroadcastChannel.value = channel as NonNullable<
            typeof consoleEntryOrErrorBroadcastChannel.value
          >;
          return channel;
        },
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
          consoleEntryOrErrorChannelName:
            consoleEntryOrErrorBroadcastChannelName,
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

      using deps = createEvoluDeps({
        createDbWorker: testCreateWorker,
        createBroadcastChannel: <Input, Output = Input>(name: string) => {
          const channel = testCreateBroadcastChannel<Input, Output>(name);
          broadcastChannels.push(channel);
          return channel;
        },
        createMessageChannel: testCreateMessageChannel,
        getDevicePersistence: () => Promise.resolve("Unknown" as const),
        lockManager: testCreateLockManager(),
        createStoredWorker: () => sharedWorker,
        reloadApp: constVoid,
      });

      // The global channel opens once the stored worker starts, after the
      // storage check, then the sync state channel once it connects.
      assertSame(broadcastChannels.length, 0);
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

    describe("workers", () => {
      const setupStoredWorkerDeps = (
        overrides: Partial<EvoluPlatformDeps & CreateStoredWorkerDep> = {},
      ) => {
        const storedWorkers: Array<SharedWorker> = [];
        const deps = createEvoluDeps({
          createDbWorker: testCreateWorker,
          createBroadcastChannel: testCreateBroadcastChannel,
          createMessageChannel: testCreateMessageChannel,
          createStoredWorker: () => {
            const worker = testCreateSharedWorker<
              SharedWorkerInput,
              SharedWorkerOutput
            >();
            storedWorkers.push(worker);
            return worker;
          },
          getDevicePersistence: () => Promise.resolve("Unknown"),
          lockManager: testCreateLockManager(),
          reloadApp: constVoid,
          ...overrides,
        });
        return Object.assign(deps, { storedWorkers });
      };

      it("checks storage once and starts once it answers, without an instance", async () => {
        const persistence = Promise.withResolvers<DevicePersistence>();
        let checkCount = 0;
        using deps = setupStoredWorkerDeps({
          getDevicePersistence: () => {
            checkCount += 1;
            return persistence.promise;
          },
        });
        assertSame(deps.getDevicePersistence(), deps.getDevicePersistence());
        await testWaitForWorkerMessage();
        assertSame(deps.storedWorkers.length, 0);

        persistence.resolve("Unknown");
        const storedWorker = await deps.storedWorker;
        assertLength(deps.storedWorkers, 1);
        assertSame(storedWorker.port, deps.storedWorkers[0].port);
        assertSame(checkCount, 1);
      });

      it("never starts for refused storage where instances get workers of their own", async () => {
        const memoryWorkerInputs: Array<SharedWorkerInput["type"]> = [];
        using deps = setupStoredWorkerDeps({
          getDevicePersistence: () => Promise.resolve("NotPersisted"),
          createMemoryInstanceWorker: () => {
            const worker = testCreateSharedWorker<
              SharedWorkerInput,
              SharedWorkerOutput
            >();
            worker.self.onConnect = (port) => {
              port.onMessage = (message) => {
                memoryWorkerInputs.push(message.type);
              };
            };
            worker.connect();
            return worker;
          },
        });
        await using run = testCreateRun(deps);
        await using _evolu = await run.ok(
          createEvolu(
            { todo: { id: id("Todo") } },
            { appName: testAppName, appOwner: testAppOwner, transports: [] },
          ),
        );
        await testWaitForWorkerMessage();

        assertLength(deps.storedWorkers, 0);
        assertTrue(memoryWorkerInputs.includes("CreateEvolu"));
      });

      it("starts for refused storage where memory instances have no workers of their own", async () => {
        using deps = setupStoredWorkerDeps({
          getDevicePersistence: () => Promise.resolve("NotPersisted"),
        });
        await deps.storedWorker;
        assertLength(deps.storedWorkers, 1);
      });

      it("does not start when disposed before storage answers", async () => {
        const persistence = Promise.withResolvers<DevicePersistence>();
        const deps = setupStoredWorkerDeps({
          getDevicePersistence: () => persistence.promise,
        });
        deps[Symbol.dispose]();
        persistence.resolve("Unknown");
        await deps.storedWorker;
        assertLength(deps.storedWorkers, 0);
      });

      const memoryConfig = {
        appName: testAppName,
        appOwner: testAppOwner,
        transports: [],
        memoryOnly: true,
      } satisfies EvoluConfig;

      it("reports a memory worker that fails to start, and its instance still starts", async () => {
        const error = new Error("The worker script is blocked.");
        using deps = setupStoredWorkerDeps({
          console: testCreateConsole(),
          createMemoryInstanceWorker: () => {
            throw error;
          },
        });
        await using run = testCreateRun(deps);
        await using _evolu = await run.ok(
          createEvolu({ todo: { id: id("Todo") } }, memoryConfig),
        );

        assertEqual(deps.evoluError.get(), createUnknownError(error));
      });

      for (const memoryOnly of [false, true]) {
        it(`aborts creating ${memoryOnly ? "a memory" : "a stored"} instance while storage is checked`, async () => {
          using deps = setupStoredWorkerDeps({
            getDevicePersistence: () =>
              new Promise<DevicePersistence>(constVoid),
          });
          await using run = testCreateRun(deps);
          const fiber = run.abortable(
            createEvolu(
              { todo: { id: id("Todo") } },
              { ...memoryConfig, memoryOnly },
            ),
          );

          fiber.abort();
          const result = await fiber;

          assertErr(result);
          assertSame(result.error.type, "AbortError");
        });
      }

      for (const mode of ["stored", "memory"] as const) {
        it(`reports a ${mode} worker that fails to start after its caller, so a throwing evoluError subscriber cannot fail it`, async () => {
          const error = new Error("The worker script is blocked.");
          const subscriberError = new Error("The subscriber failed.");
          const console = testCreateConsole();
          const fail = (): never => {
            throw error;
          };
          using deps = setupStoredWorkerDeps({
            console,
            ...(mode === "stored"
              ? { createStoredWorker: fail }
              : { createMemoryInstanceWorker: fail }),
          });
          deps.evoluError.subscribe(() => {
            throw subscriberError;
          });
          const reports: Array<() => void> = [];
          {
            using _queueMicrotask = testStubGlobal(
              "queueMicrotask",
              (report: () => void) => {
                reports.push(report);
              },
            );
            if (mode === "stored") await deps.storedWorker;
            else {
              const createMemoryInstanceWorker =
                deps.createMemoryInstanceWorker;
              assertNotUndefined(createMemoryInstanceWorker);
              using _worker = createMemoryInstanceWorker();
            }
          }
          assertLength(reports, 1);
          assertSame(deps.evoluError.get(), null);

          assertThrowsSame(reports[0], subscriberError);
          assertEqual(deps.evoluError.get(), createUnknownError(error));
          assertEqual(console.getEntriesSnapshot(), [
            { method: "error", path: [], args: [createUnknownError(error)] },
          ]);
        });
      }

      it("sets evoluError for a worker that fails to start even when logging it throws", async () => {
        const error = new Error("The worker script is blocked.");
        const logError = new Error("The console output failed.");
        using deps = setupStoredWorkerDeps({
          console: {
            ...testCreateConsole(),
            error: () => {
              throw logError;
            },
          },
          createStoredWorker: () => {
            throw error;
          },
        });
        const reports: Array<() => void> = [];
        {
          using _queueMicrotask = testStubGlobal(
            "queueMicrotask",
            (report: () => void) => {
              reports.push(report);
            },
          );
          await deps.storedWorker;
        }
        assertLength(reports, 1);

        assertThrowsSame(reports[0], logError);
        assertEqual(deps.evoluError.get(), createUnknownError(error));
      });

      it("reports a worker that fails to start and resolves to a disposed port", async () => {
        const error = new Error("The worker script is blocked.");
        const channels: Array<{
          readonly port1: unknown;
          readonly isDisposed: () => boolean;
        }> = [];
        using deps = setupStoredWorkerDeps({
          console: testCreateConsole(),
          createMessageChannel: <Input, Output = never>() => {
            const channel = testCreateMessageChannel<Input, Output>();
            channels.push(channel);
            return channel;
          },
          createStoredWorker: () => {
            throw error;
          },
        });
        const storedWorker = await deps.storedWorker;
        assertEqual(deps.evoluError.get(), createUnknownError(error));
        assertLength(channels, 1);
        assertSame(storedWorker.port, channels[0].port1);
        assertTrue(channels[0].isDisposed());
      });

      it("ignores the stored workers' global channel where storage is refused", async () => {
        const console = testCreateConsole();
        using deps = setupStoredWorkerDeps({
          console,
          getDevicePersistence: () => Promise.resolve("NotPersisted"),
          createMemoryInstanceWorker: () => {
            const worker = testCreateSharedWorker<
              SharedWorkerInput,
              SharedWorkerOutput
            >();
            worker.self.onConnect = (port) => {
              port.onMessage = constVoid;
              port.postMessage({
                type: "Connected",
                workerId: testCreateId()<"SharedWorker">(),
                syncStateChannelName: "refused-memory-sync-state",
                consoleEntryOrErrorChannelName: "refused-memory-console",
              });
            };
            worker.connect();
            return worker;
          },
        });
        await deps.storedWorker;
        const createMemoryInstanceWorker = deps.createMemoryInstanceWorker;
        assertNotUndefined(createMemoryInstanceWorker);
        using _memoryWorker = createMemoryInstanceWorker();
        using globalChannel = testCreateBroadcastChannel<ConsoleEntryOrError>(
          consoleEntryOrErrorBroadcastChannelName,
        );
        await testWaitForWorkerMessage();
        globalChannel.postMessage({
          type: "Error",
          error: createUnknownError("Another tab's stored worker failed."),
        });
        await testWaitForWorkerMessage();

        assertSame(deps.storedWorkers.length, 0);
        assertSame(deps.evoluError.get(), null);
        assertEqual(console.getEntriesSnapshot(), []);
      });
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
      const [id] = getRegistrationIds([input]);
      assertEqual(input.actions, [
        {
          action: "add",
          id,
          owner: {
            owner: testPostedAppOwner,
            transports: [{ type: "WebSocket", url: "wss://free.evoluhq.com/" }],
          },
        },
      ]);
      // The default is cast, so its URL must be a canonical WebSocketUrl.
      assertTrue(WebSocketUrl.is("wss://free.evoluhq.com/"));
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
        getDevicePersistence: () => Promise.resolve("Unknown" as const),
        lockManager: testCreateLockManager(),
        reloadApp: constVoid,
        storedWorker: Promise.resolve(sharedWorker),
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
      assertEqual(message.id, "dXpWgmgRSqCJV_tQPAS7Ug");
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
        const owner = {
          owner: {
            id: sharedOwner.id,
            encryptionKey: sharedOwner.encryptionKey,
            writeKey: sharedOwner.writeKey,
          },
          transports: [testOwnerTransport],
        };
        assertNotSame(sharedOwner.id, evolu.appOwner.id);

        const unuse = evolu.useOwner(sharedOwner, [testOwnerTransport]);
        const result = evolu.requestSync(sharedOwner.id);
        assertType<typeof result, void>();
        assertSame(result, undefined);
        unuse();
        evolu.requestSync(sharedOwner.id);
        assertEqual(evoluInputs, []);

        await testWaitForWorkerMessage();
        const [id] = getRegistrationIds(evoluInputs);
        assertEqual(evoluInputs, [
          {
            type: "UseOwner",
            actions: [{ action: "add", id, owner }],
          },
          {
            type: "UseOwner",
            actions: [
              { action: "sync", ownerId: sharedOwner.id },
              { action: "remove", id },
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

        const [id] = getRegistrationIds(evoluInputs);
        assertEqual(evoluInputs, [
          {
            type: "UseOwner",
            actions: [
              {
                owner: {
                  owner: testPostedAppOwner,
                  transports: [testOwnerTransport],
                },
                action: "add",
                id,
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

        const [id] = getRegistrationIds(evoluInputs);
        assertEqual(evoluInputs, [
          {
            type: "UseOwner",
            actions: [
              {
                owner: {
                  owner: testPostedAppOwner,
                  transports: [testOwnerTransport],
                },
                action: "add",
                id,
              },
            ],
          },
        ]);
      });

      it("posts only the owner id and keys", async () => {
        await using setup = await setupRunWithEvoluDeps();
        const { run, evoluInputs } = setup;
        const evolu = await run.ok(testCreateEvolu);
        const readonlyOwner = createSharedReadonlyOwner(
          createSharedOwner(createOwnerSecret(run.deps)),
        );

        evolu.useOwner(testAppOwner, [testOwnerTransport]);
        evolu.useOwner(readonlyOwner, [testOwnerTransport]);
        await testWaitForWorkerMessage();

        const [appOwnerId, readonlyOwnerId] = getRegistrationIds(evoluInputs);
        assertEqual(evoluInputs, [
          {
            type: "UseOwner",
            actions: [
              {
                owner: {
                  owner: testPostedAppOwner,
                  transports: [testOwnerTransport],
                },
                action: "add",
                id: appOwnerId,
              },
              {
                owner: {
                  owner: {
                    id: readonlyOwner.id,
                    encryptionKey: readonlyOwner.encryptionKey,
                  },
                  transports: [testOwnerTransport],
                },
                action: "add",
                id: readonlyOwnerId,
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

        const [id] = getRegistrationIds(evoluInputs);
        assertEqual(evoluInputs, [
          {
            type: "UseOwner",
            actions: [
              {
                owner: {
                  owner: testPostedAppOwner,
                  transports: [testOwnerTransport],
                },
                action: "add",
                id,
              },
              { action: "remove", id },
            ],
          },
        ]);
      });

      it("names each registration, and its UnuseOwner names the same one", async () => {
        await using setup = await setupRunWithEvoluDeps();
        const { run, evoluInputs } = setup;
        const evolu = await run.ok(testCreateEvolu);

        const unuseFirst = evolu.useOwner(testAppOwner, [testOwnerTransport]);
        evolu.useOwner(testAppOwner, [testOwnerTransport]);
        unuseFirst();
        await testWaitForWorkerMessage();

        const [first, second, removed] = getRegistrationIds(evoluInputs);
        assertNotSame(first, second);
        assertSame(removed, first);
      });

      it("throws for equal transports and posts only distinct ones", async () => {
        await using setup = await setupRunWithEvoluDeps();
        const { run, evoluInputs } = setup;
        const evolu = await run.ok(testCreateEvolu);

        assertEqual(
          assertThrowsInstanceOf(() => {
            evolu.useOwner(testAppOwner, [
              testOwnerTransport,
              { ...testOwnerTransport },
            ]);
          }, Error).message,
          "useOwner requires distinct transports.",
        );

        const otherTransport = createOwnerWebSocketTransport({
          url: RelayUrl.orThrow("wss://other.example.com/"),
          ownerId: testAppOwner.id,
        });
        evolu.useOwner(testAppOwner, [testOwnerTransport, otherTransport]);
        await testWaitForWorkerMessage();

        const [id] = getRegistrationIds(evoluInputs);
        assertEqual(evoluInputs, [
          {
            type: "UseOwner",
            actions: [
              {
                owner: {
                  owner: testPostedAppOwner,
                  transports: [testOwnerTransport, otherTransport],
                },
                action: "add",
                id,
              },
            ],
          },
        ]);
      });

      it("fails createEvolu for equal config transports", async () => {
        await using setup = await setupRunWithEvoluDeps();
        const { run, evoluInputs } = setup;

        // Two spellings of one relay make equal transports.
        const result = await run.abortable(
          createEvolu(Schema, {
            appName: testAppName,
            appOwner: testAppOwner,
            transports: [
              testOwnerTransport,
              createOwnerWebSocketTransport({
                url: RelayUrlFromString.orThrow("WSS://Example.COM"),
                ownerId: testAppOwner.id,
              }),
            ],
          }),
        );

        assertErr(result);
        assertSame(result.error.reason.type, "PanicAbortReason");
        assertInstanceOf(result.error.reason.defect, Error);
        assertEqual(
          result.error.reason.defect.message,
          "useOwner requires distinct transports.",
        );
        await testWaitForWorkerMessage();
        assertEqual(evoluInputs, []);
      });

      it("throws when unuseOwner is called twice", async () => {
        await using setup = await setupRunWithEvoluDeps();
        const { run, evoluInputs } = setup;
        const evolu = await run.ok(testCreateEvolu);

        const unuseOwner = evolu.useOwner(testAppOwner, [testOwnerTransport]);
        await testWaitForWorkerMessage();
        const [id] = getRegistrationIds(evoluInputs);
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
          { type: "UseOwner", actions: [{ action: "remove", id }] },
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

        const [id] = getRegistrationIds(evoluInputs);
        assertEqual(evoluInputs[0], {
          type: "UseOwner",
          actions: [
            {
              owner: {
                owner: testPostedAppOwner,
                transports: [testOwnerTransport],
              },
              action: "add",
              id,
            },
          ],
        });
        assertSame(evoluInputs[1]?.type, "Mutate");
      });
    });
  });

  describe("device persistence", () => {
    /** Creates an instance, recording its CreateEvolu and platform checks. */
    const setupStorage = async ({
      memoryOnly,
      platform,
    }: {
      memoryOnly: boolean;
      platform: DevicePersistence;
    }) => {
      let platformCheckCount = 0;
      const createEvoluMessages: Array<
        Extract<SharedWorkerInput, { type: "CreateEvolu" }>
      > = [];
      const setup = await setupRunWithEvoluDeps({
        getDevicePersistence: () => {
          platformCheckCount += 1;
          return Promise.resolve(platform);
        },
        onSharedWorkerPostMessage: (message) => {
          if (message.type === "CreateEvolu") createEvoluMessages.push(message);
        },
      });
      const evolu = await setup.run.ok(
        createEvolu(Schema, {
          appName: testAppName,
          appOwner: testAppOwner,
          transports: [],
          memoryOnly,
        }),
      );
      assertLength(createEvoluMessages, 1);
      const [message] = createEvoluMessages;
      assertSame(message.name, evolu.name);
      return Object.assign(setup, {
        evolu,
        message,
        getPlatformCheckCount: () => platformCheckCount,
      });
    };

    it("names a memoryOnly database apart from the stored one, without asking the platform", async () => {
      await using setup = await setupStorage({
        memoryOnly: true,
        platform: "Persisted",
      });

      assertNotSame(
        setup.evolu.name,
        `AppName-${createIdFromString(testAppOwner.id)}`,
      );
      assertTrue(setup.message.memoryOnly);
      assertSame(await setup.evolu.devicePersistence, "NotPersisted");
      assertSame(setup.getPlatformCheckCount(), 0);
    });

    it("keeps the database in memory, under a separate name, where the platform offers no persistent storage", async () => {
      await using setup = await setupStorage({
        memoryOnly: false,
        platform: "NotPersisted",
      });

      assertNotSame(
        setup.evolu.name,
        `AppName-${createIdFromString(testAppOwner.id)}`,
      );
      assertTrue(setup.message.memoryOnly);
      assertSame(await setup.evolu.devicePersistence, "NotPersisted");
      assertSame(setup.getPlatformCheckCount(), 1);
    });

    it("gives each memory instance its own name", async () => {
      await using setup = await setupStorage({
        memoryOnly: true,
        platform: "NotPersisted",
      });
      await using another = await setup.run.ok(
        createEvolu(Schema, {
          appName: testAppName,
          appOwner: testAppOwner,
          transports: [],
          memoryOnly: true,
        }),
      );

      assertNotSame(another.name, setup.evolu.name);
      assertSame(await another.devicePersistence, "NotPersisted");
    });

    for (const platform of ["Persisted", "Unknown"] as const) {
      it(`stores the database and resolves devicePersistence to ${platform} where the platform promises it`, async () => {
        await using setup = await setupStorage({
          memoryOnly: false,
          platform,
        });

        assertSame(
          setup.evolu.name,
          `AppName-${createIdFromString(testAppOwner.id)}`,
        );
        assertFalse(setup.message.memoryOnly);
        assertSame(await setup.evolu.devicePersistence, platform);
      });
    }

    const setupPersistenceRequests = async (
      devicePersistence: DevicePersistence,
    ) => {
      let requestCount = 0;
      const setup = await setupRunWithEvoluDeps({
        getDevicePersistence: () => Promise.resolve(devicePersistence),
        requestPersistentStorage: () => {
          requestCount += 1;
        },
      });
      return Object.assign(setup, { getRequestCount: () => requestCount });
    };

    it("requests persistent storage once, after the first mutation, when devicePersistence is Unknown", async () => {
      await using setup = await setupPersistenceRequests("Unknown");
      const evolu = await setup.run.ok(testCreateEvolu);
      await testWaitForWorkerMessage();
      assertSame(setup.getRequestCount(), 0);

      evolu.insert("todo", { title: NonEmptyTrimmedString100.orThrow("A") });
      evolu.insert("todo", { title: NonEmptyTrimmedString100.orThrow("B") });
      await testWaitForWorkerMessage();
      evolu.insert("todo", { title: NonEmptyTrimmedString100.orThrow("C") });
      await testWaitForWorkerMessage();

      assertSame(setup.getRequestCount(), 1);
    });

    for (const devicePersistence of ["Persisted", "NotPersisted"] as const) {
      it(`does not request persistent storage when devicePersistence is ${devicePersistence}`, async () => {
        await using setup = await setupPersistenceRequests(devicePersistence);
        const evolu = await setup.run.ok(testCreateEvolu);

        evolu.insert("todo", { title: NonEmptyTrimmedString100.orThrow("A") });
        await testWaitForWorkerMessage();

        assertSame(await evolu.devicePersistence, devicePersistence);
        assertSame(setup.getRequestCount(), 0);
      });
    }
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
          void evolu.deleteDatabase();
        }, Error).message,
        disposedMessage,
      );

      assertEqual(
        assertThrowsInstanceOf(() => {
          void evolu.deleteOwner(testSharedOwner);
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
          [todoTitleQuery, ok([{ op: "replaceAll", value: [{ title: "A" }] }])],
        ]),
        callbackIds: [],
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

    it("does not execute mutate onSuccess callback after dispose", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run, evoluInputs, postEvoluOutput } = setup;
      const evolu = await run.ok(testCreateEvolu);

      let called = 0;
      evolu.insert(
        "todo",
        { title: NonEmptyTrimmedString100.orThrow("With completion") },
        {
          onSuccess: () => {
            called += 1;
          },
        },
      );

      await testWaitForWorkerMessage();

      const mutate = evoluInputs[0] as ExtractTyped<EvoluInput, "Mutate">;
      const [callbackId] = mutate.callbackIds;

      await evolu[Symbol.asyncDispose]();

      postEvoluOutput({
        type: "OnPatchesByQuery",
        patchesByQuery: new Map(),
        callbackIds: [callbackId],
      });

      await testWaitForWorkerMessage();

      assertEqual(called, 0);
    });

    it("runs onError instead of onSuccess for a failed mutation", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run, evoluInputs, postEvoluOutput } = setup;
      const evolu = await run.ok(testCreateEvolu);

      let succeeded = 0;
      const errors: Array<UnknownError> = [];
      evolu.insert(
        "todo",
        { title: NonEmptyTrimmedString100.orThrow("First failed") },
        {
          onSuccess: () => {
            succeeded += 1;
          },
          onError: (error) => {
            errors.push(error);
          },
        },
      );
      evolu.insert(
        "todo",
        { title: NonEmptyTrimmedString100.orThrow("Second failed") },
        {
          onSuccess: () => {
            succeeded += 1;
          },
        },
      );

      await testWaitForWorkerMessage();

      const mutate = evoluInputs[0] as ExtractTyped<EvoluInput, "Mutate">;
      const { callbackIds } = mutate;
      assertLength(callbackIds, 2);

      const error = createUnknownError(new Error("Disk I/O error."));
      postEvoluOutput({ type: "OnMutateFailed", callbackIds, error });
      // Patches naming callbacks that already ran find nothing to run.
      postEvoluOutput({
        type: "OnPatchesByQuery",
        patchesByQuery: new Map(),
        callbackIds,
      });

      await testWaitForWorkerMessage();

      assertEqual(succeeded, 0);
      assertEqual(errors, [error]);
    });

    it("runs onSuccess instead of onError for a stored mutation", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run, evoluInputs, postEvoluOutput } = setup;
      const evolu = await run.ok(testCreateEvolu);

      let succeeded = 0;
      const errors: Array<UnknownError> = [];
      evolu.insert(
        "todo",
        { title: NonEmptyTrimmedString100.orThrow("Only onError") },
        {
          onError: (error) => {
            errors.push(error);
          },
        },
      );
      evolu.insert(
        "todo",
        { title: NonEmptyTrimmedString100.orThrow("Both callbacks") },
        {
          onSuccess: () => {
            succeeded += 1;
          },
          onError: (error) => {
            errors.push(error);
          },
        },
      );

      await testWaitForWorkerMessage();

      const mutate = evoluInputs[0] as ExtractTyped<EvoluInput, "Mutate">;
      const { callbackIds } = mutate;
      assertLength(callbackIds, 2);

      postEvoluOutput({
        type: "OnPatchesByQuery",
        patchesByQuery: new Map(),
        callbackIds,
      });

      await testWaitForWorkerMessage();

      assertEqual(succeeded, 1);
      assertEqual(errors, []);
    });

    it("runs every callback of a batch when one throws, and reports the throw", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run, evoluInputs, postEvoluOutput } = setup;
      const evolu = await run.ok(testCreateEvolu);

      const defect = new Error("Callback failed.");
      const errors: Array<UnknownError> = [];
      evolu.insert(
        "todo",
        { title: NonEmptyTrimmedString100.orThrow("First failed") },
        {
          onError: () => {
            throw defect;
          },
        },
      );
      evolu.insert(
        "todo",
        { title: NonEmptyTrimmedString100.orThrow("Second failed") },
        {
          onError: (error) => {
            errors.push(error);
          },
        },
      );
      await testWaitForWorkerMessage();

      const { callbackIds } = evoluInputs[0] as ExtractTyped<
        EvoluInput,
        "Mutate"
      >;
      const error = createUnknownError(new Error("Disk I/O error."));
      postEvoluOutput({ type: "OnMutateFailed", callbackIds, error });
      await testWaitForWorkerMessage();

      assertEqual(errors, [error]);
      assertEqual(run.deps.reportDefect.getDefects(), [defect]);
    });

    it("runs every query listener and mutation callback of an answer when a listener throws, and reports the throw", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run, evoluInputs, postEvoluOutput } = setup;
      const evolu = await run.ok(testCreateEvolu);

      const defect = new Error("Listener failed.");
      evolu.subscribeQuery(todoTitleQuery)(() => {
        throw defect;
      });
      let listened = 0;
      evolu.subscribeQuery(todoTitleQuery)(() => {
        listened += 1;
      });
      let succeeded = 0;
      evolu.insert(
        "todo",
        { title: NonEmptyTrimmedString100.orThrow("New") },
        {
          onSuccess: () => {
            succeeded += 1;
          },
        },
      );
      await testWaitForWorkerMessage();

      const { callbackIds } = evoluInputs.find(
        (input) => input.type === "Mutate",
      ) as ExtractTyped<EvoluInput, "Mutate">;
      postEvoluOutput({
        type: "OnPatchesByQuery",
        patchesByQuery: new Map([
          [
            todoTitleQuery,
            ok([{ op: "replaceAll", value: [{ title: "New" }] }]),
          ],
        ]),
        callbackIds,
      });
      await testWaitForWorkerMessage();

      assertSame(listened, 1);
      assertSame(succeeded, 1);
      assertEqual(run.deps.reportDefect.getDefects(), [defect]);
    });

    it("executes mutate onSuccess callback when query patches are received", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run, evoluInputs, postEvoluOutput } = setup;
      const evolu = await run.ok(testCreateEvolu);

      let called = 0;
      evolu.insert(
        "todo",
        { title: NonEmptyTrimmedString100.orThrow("With completion") },
        {
          onSuccess: () => {
            called += 1;
          },
        },
      );

      await testWaitForWorkerMessage();

      const mutate = evoluInputs[0] as ExtractTyped<EvoluInput, "Mutate">;
      const [callbackId] = mutate.callbackIds;

      postEvoluOutput({
        type: "OnPatchesByQuery",
        patchesByQuery: new Map(),
        callbackIds: [callbackId],
      });

      await testWaitForWorkerMessage();

      assertEqual(called, 1);
    });

    it("uses flushSync for query patches with onSuccess callbacks", async () => {
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
          onSuccess: () => {
            called += 1;
          },
        },
      );

      await testWaitForWorkerMessage();

      const mutate = evoluInputs[0] as ExtractTyped<EvoluInput, "Mutate">;
      const [callbackId] = mutate.callbackIds;

      postEvoluOutput({
        type: "OnPatchesByQuery",
        patchesByQuery: new Map(),
        callbackIds: [callbackId],
      });

      await testWaitForWorkerMessage();

      assertEqual(flushSyncCalls, 1);
      assertEqual(called, 1);
    });

    it("does not use flushSync when query patches have no onSuccess callbacks", async () => {
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
        callbackIds: [],
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
          [todoTitleQuery, ok([{ op: "replaceAll", value: [] }])],
        ]),
        callbackIds: [],
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
            ok([{ op: "replaceAll", value: [{ title: "Synced" }] }]),
          ],
        ]),
        callbackIds: [],
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
          [todoTitleQuery, ok([{ op: "replaceAll", value: [] }])],
        ]),
        callbackIds: [],
      });
      assertEqual(await initialLoad, []);
      assertSame(evolu.loadQuery(todoTitleQuery), initialLoad);

      postEvoluOutput({
        type: "OnPatchesByQuery",
        patchesByQuery: new Map([
          [
            todoTitleQuery,
            ok([{ op: "replaceAll", value: [{ title: "New" }] }]),
          ],
        ]),
        callbackIds: [],
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
          [todoTitleQuery, ok([{ op: "replaceAll", value: [] }])],
        ]),
        callbackIds: [],
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
          [todoTitleQuery, ok([{ op: "replaceAll", value: [] }])],
        ]),
        callbackIds: [],
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
            ok([{ op: "replaceAll", value: [{ title: "Synced" }] }]),
          ],
        ]),
        callbackIds: [],
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
          [todoTitleQuery, ok([{ op: "replaceAll", value: [] }])],
        ]),
        callbackIds: [],
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

    it("loadQuery right after a mutation reads after the mutation", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run, evoluInputs, postEvoluOutput } = setup;
      const evolu = await run.ok(testCreateEvolu);

      const initialLoad = evolu.loadQuery(todoTitleQuery);
      await testWaitForWorkerMessage();
      postEvoluOutput({
        type: "OnPatchesByQuery",
        patchesByQuery: new Map([
          [todoTitleQuery, ok([{ op: "replaceAll", value: [] }])],
        ]),
        callbackIds: [],
      });
      assertEqual(await initialLoad, []);
      evoluInputs.length = 0;

      evolu.insert("todo", { title: NonEmptyTrimmedString100.orThrow("New") });
      const load = evolu.loadQuery(todoTitleQuery);

      assertNotSame(load, initialLoad);
      await testWaitForWorkerMessage();
      assertEqual(
        evoluInputs.map((input) => input.type),
        ["Mutate", "Query"],
      );
    });

    it("loadQuery after a mutation, sent with an earlier load, reads again", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run, evoluInputs, postEvoluOutput } = setup;
      const evolu = await run.ok(testCreateEvolu);

      void evolu.loadQuery(todoTitleDescQuery);
      evolu.insert("todo", { title: NonEmptyTrimmedString100.orThrow("New") });
      const load = evolu.loadQuery(todoTitleQuery);
      await testWaitForWorkerMessage();
      // Both loads are read before the mutation is stored.
      assertEqual(
        evoluInputs.map((input) => input.type),
        ["Query", "Mutate"],
      );

      postEvoluOutput({
        type: "OnPatchesByQuery",
        patchesByQuery: new Map([
          [todoTitleDescQuery, ok([{ op: "replaceAll", value: [] }])],
          [todoTitleQuery, ok([{ op: "replaceAll", value: [] }])],
        ]),
        callbackIds: [],
      });
      assertEqual(await load, []);

      assertNotSame(evolu.loadQuery(todoTitleQuery), load);
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

    it("ignores a subscription made after dispose with a function taken before it", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run } = setup;
      const evolu = await run.ok(testCreateEvolu);
      // As React subscribes in an effect after the render that took it.
      const subscribe = evolu.subscribeQuery(todoTitleQuery);

      await evolu[Symbol.asyncDispose]();

      subscribe(() => {
        throw new Error("A disposed instance notified a listener.");
      })();
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
          [todoTitleQuery, ok([{ op: "replaceAll", value: [{ title: "R" }] }])],
        ]),
        callbackIds: [],
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
          [todoTitleQuery, ok([{ op: "replaceAll", value: [{ title: "A" }] }])],
        ]),
        callbackIds: [],
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
          [todoTitleQuery, ok([{ op: "replaceAll", value: [{ title: "A" }] }])],
        ]),
        callbackIds: [],
      });

      assertEqual(await firstLoad, [{ title: "A" }]);

      const fulfilledLoad = evolu.loadQuery(todoTitleQuery);

      postEvoluOutput({
        type: "OnPatchesByQuery",
        patchesByQuery: new Map([
          [todoTitleQuery, ok([{ op: "replaceAll", value: [{ title: "B" }] }])],
        ]),
        callbackIds: [],
      });

      await testWaitForWorkerMessage();

      const replacedLoad = evolu.loadQuery(todoTitleQuery);

      assertNotSame(replacedLoad, fulfilledLoad);
      assertEqual(await replacedLoad, [{ title: "B" }]);

      unsubscribe();
    });

    it("rejects a load SQLite failed and keeps the rejection cached until a mutation", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run, evoluInputs, postEvoluOutput } = setup;
      const evolu = await run.ok(testCreateEvolu);
      const error = createUnknownError(new Error("incomplete input"));

      const load = evolu.loadQuery(todoTitleQuery);
      // Handled before it rejects, as React use() handles a pending promise.
      const rejection = assertRejects(load, error);
      await testWaitForWorkerMessage();
      evoluInputs.length = 0;

      postEvoluOutput({
        type: "OnPatchesByQuery",
        patchesByQuery: new Map([[todoTitleQuery, err(error)]]),
        callbackIds: [],
      });
      await testWaitForWorkerMessage();

      // React use() reads a rejection synchronously.
      assert("status" in load, "Cached promises expose React status");
      assertSame(load.status, "rejected");
      assert("reason" in load, "Rejected promises expose their reason");
      assertSame(load.reason, error);
      await rejection;
      assertSame(evolu.loadQuery(todoTitleQuery), load);
      assertEqual(evolu.getQueryRows(todoTitleQuery), []);
      await testWaitForWorkerMessage();
      assertEqual(evoluInputs, []);

      evolu.insert("todo", { title: NonEmptyTrimmedString100.orThrow("M") });
      await testWaitForWorkerMessage();
      evoluInputs.length = 0;

      assertNotSame(evolu.loadQuery(todoTitleQuery), load);
      await testWaitForWorkerMessage();
      assertEqual(evoluInputs, [
        { type: "Query", queries: new Set([todoTitleQuery]) },
      ]);
    });

    it("keeps a subscribed query's rows when its refresh fails and rejects its next load", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run, postEvoluOutput } = setup;
      const evolu = await run.ok(testCreateEvolu);
      const error = createUnknownError(new Error("malformed JSON"));
      let notifications = 0;
      const unsubscribe = evolu.subscribeQuery(todoTitleQuery)(() => {
        notifications += 1;
      });

      const firstLoad = evolu.loadQuery(todoTitleQuery);
      await testWaitForWorkerMessage();
      postEvoluOutput({
        type: "OnPatchesByQuery",
        patchesByQuery: new Map([
          [todoTitleQuery, ok([{ op: "replaceAll", value: [{ title: "A" }] }])],
        ]),
        callbackIds: [],
      });
      const rows = await firstLoad;
      notifications = 0;
      const otherLoad = evolu.loadQuery(todoTitleDescQuery);

      // The query after the failed one still loads.
      postEvoluOutput({
        type: "OnPatchesByQuery",
        patchesByQuery: new Map<
          Query,
          Result<ReadonlyArray<Patch>, UnknownError>
        >([
          [todoTitleQuery, err(error)],
          [
            todoTitleDescQuery,
            ok([{ op: "replaceAll", value: [{ title: "C" }] }]),
          ],
        ]),
        callbackIds: [],
      });
      await testWaitForWorkerMessage();

      assertEqual(await otherLoad, [{ title: "C" }]);
      assertEqual(evolu.getQueryRows(todoTitleDescQuery), [{ title: "C" }]);
      // Equal rows, but a new array, so subscribers render and read the
      // rejected load.
      assertEqual(evolu.getQueryRows(todoTitleQuery), rows);
      assertNotSame(evolu.getQueryRows(todoTitleQuery), rows);
      assertSame(notifications, 1);
      const failedLoad = evolu.loadQuery(todoTitleQuery);
      assertNotSame(failedLoad, firstLoad);
      assert("status" in failedLoad, "Cached promises expose React status");
      assertSame(failedLoad.status, "rejected");

      postEvoluOutput({
        type: "OnPatchesByQuery",
        patchesByQuery: new Map([
          [todoTitleQuery, ok([{ op: "replaceAll", value: [{ title: "B" }] }])],
        ]),
        callbackIds: [],
      });
      await testWaitForWorkerMessage();

      assertEqual(await evolu.loadQuery(todoTitleQuery), [{ title: "B" }]);
      assertSame(notifications, 2);
      // Handled late, so node:test would fail this test had the cached
      // rejection been reported as unhandled.
      await assertRejects(failedLoad, error);
      unsubscribe();
    });

    it("releases a load SQLite failed after a mutation invalidated it", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run, evoluInputs, postEvoluOutput } = setup;
      const evolu = await run.ok(testCreateEvolu);
      const error = createUnknownError(new Error("malformed JSON"));

      const load = evolu.loadQuery(todoTitleQuery);
      const rejection = assertRejects(load, error);
      await testWaitForWorkerMessage();
      evolu.insert("todo", { title: NonEmptyTrimmedString100.orThrow("M") });
      await testWaitForWorkerMessage();

      postEvoluOutput({
        type: "OnPatchesByQuery",
        patchesByQuery: new Map([[todoTitleQuery, err(error)]]),
        callbackIds: [],
      });
      await rejection;
      evoluInputs.length = 0;

      // The failure answered a read the mutation made stale, so it is not
      // cached.
      assertNotSame(evolu.loadQuery(todoTitleQuery), load);
      await testWaitForWorkerMessage();
      assertEqual(evoluInputs, [
        { type: "Query", queries: new Set([todoTitleQuery]) },
      ]);
    });

    it("OnPatchesByQuery ignores queries without loading promises", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run, evoluInputs, postEvoluOutput } = setup;
      await run.ok(testCreateEvolu);

      postEvoluOutput({
        type: "OnPatchesByQuery",
        patchesByQuery: new Map([
          [todoTitleQuery, ok([{ op: "replaceAll", value: [{ title: "X" }] }])],
        ]),
        callbackIds: [],
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
          [todoTitleQuery, ok([{ op: "replaceAll", value: [{ title: "A" }] }])],
        ]),
        callbackIds: [],
      });

      postEvoluOutput({
        type: "OnPatchesByQuery",
        patchesByQuery: new Map(),
        callbackIds: [],
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
          callbackIds: [],
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
          callbackIds: [],
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
          callbackIds: [],
          subscribedQueries: new Set(),
          type: "Mutate",
        },
      ]);
    });

    it("includes the owner's id and onSuccess callback ids", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run, evoluInputs } = setup;
      const evolu = await run.ok(testCreateEvolu);
      const sharedOwner = createSharedOwner(createOwnerSecret(run.deps));

      const insertedId = evolu.insert(
        "todo",
        { title: NonEmptyTrimmedString100.orThrow("With callback") },
        { owner: sharedOwner, onSuccess: constVoid },
      ).id;

      await testWaitForWorkerMessage();

      await testWaitForWorkerMessage();

      const input = evoluInputs[0];
      assertSame(input?.type, "Mutate");
      const callbackId = input.callbackIds[0];
      assertNotUndefined(callbackId);
      assertEqual(evoluInputs, [
        {
          changes: [
            {
              id: insertedId,
              isDelete: null,
              isInsert: true,
              ownerId: sharedOwner.id,
              table: "todo",
              values: { title: "With callback" },
            },
          ],
          callbackIds: [callbackId],
          subscribedQueries: new Set(),
          type: "Mutate",
        },
      ]);
    });

    it("names an undefined column, which TypeScript allows without exactOptionalPropertyTypes", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run } = setup;
      const evolu = await run.ok(testCreateEvolu);
      const todoId = TodoId.orThrow(createIdFromString("todo-invalid"));

      const undefinedError = assertThrowsInstanceOf(() => {
        evolu.update("todo", { id: todoId, title: undefined } as never);
      }, Error);
      assertSame(
        undefinedError.message,
        "Column 'title' of table 'todo' is undefined. Omit it instead. TypeScript reports this only with exactOptionalPropertyTypes, which Evolu requires.",
      );

      const invalidError = assertThrowsInstanceOf(() => {
        evolu.update("todo", { id: todoId, title: {} } as never);
      }, Error);
      assertSame(invalidError.message, "Invalid DbChange for table 'todo'.");
    });
  });

  describe("mutation size", () => {
    const NoteId = id("Note");
    const note = {
      id: NoteId,
      body: nullOr(StringType),
      data: nullOr(Uint8ArrayType),
      count: nullOr(FiniteNumber),
    };
    const SizeSchema = { note, _note: note };

    const createSizeEvolu = createEvolu(SizeSchema, {
      appName: testAppName,
      appOwner: testAppOwner,
      transports: [],
    });

    const noteId = NoteId.orThrow(createIdFromString("note"));

    const getChanges = (inputs: ReadonlyArray<EvoluInput>) =>
      inputs.flatMap((input) => (input.type === "Mutate" ? input.changes : []));

    const tooLargeMessage = (size: number) =>
      `The mutation of table 'note' is ${size} bytes, over maxMutationSize (640000). Bound the Types of its columns or check it with evolu.getMutationSize.`;

    // The length of a blob that makes a note exactly maxMutationSize. Its
    // length varint takes three bytes, two more than an empty blob's.
    const getDataAtLimitLength = (evolu: Evolu<typeof SizeSchema>) =>
      maxMutationSize -
      evolu.getMutationSize("note", { data: new Uint8Array() }) -
      2;

    it("getMutationSize measures the change as it is encoded", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const evolu = await setup.run.ok(createSizeEvolu);

      const values = {
        body: "Milk",
        data: new Uint8Array(10),
        count: FiniteNumber.orThrow(0.1),
      };
      const buffer = createBuffer();
      encodeDbChange(buffer, {
        timestamp: createTimestamp(),
        change: DbChange.orThrow({
          table: "note",
          id: noteId,
          values,
          isInsert: false,
          isDelete: true,
        }),
      });
      assertEqual(evolu.getMutationSize("note", values), buffer.getLength());

      // `id` and `isDeleted` are not columns.
      assertEqual(
        evolu.getMutationSize("note", { id: noteId, isDeleted: 1 }),
        evolu.getMutationSize("note", {}),
      );

      // @ts-expect-error Only the schema's tables can be measured.
      evolu.getMutationSize("unknown", {});
      // @ts-expect-error Values must match their column's Type.
      evolu.getMutationSize("note", { body: 1 });
    });

    it("encodes no string in more than three bytes per code unit", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const evolu = await setup.run.ok(createSizeEvolu);

      const assertAtMostThreeBytesPerCodeUnit = (value: string) => {
        // A string also takes a length varint of up to three bytes, besides
        // the type tag that null takes too.
        assertTrue(
          evolu.getMutationSize("note", { body: value }) -
            evolu.getMutationSize("note", { body: null }) <=
            3 * value.length + 3,
        );
      };

      for (const value of [
        "",
        "€".repeat(200_000),
        "😀".repeat(1_000),
        "\uD800".repeat(1_000),
        // JSON takes exactly three bytes per code unit here.
        "0.1",
        `[${"0.1,".repeat(999)}0.1]`,
        "[".repeat(1_001) + "]".repeat(1_001),
        noteId,
        "2024-01-01T00:00:00.000Z",
      ]) {
        assertAtMostThreeBytesPerCodeUnit(value);
      }

      fc.assert(
        fc.property(
          fc.oneof(fc.string(), fc.string({ unit: "binary" }), fc.json()),
          assertAtMostThreeBytesPerCodeUnit,
        ),
        { numRuns: 2_000 },
      );
    });

    it("rejects a mutation over maxMutationSize before batching it", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run, evoluInputs, postEvoluOutput } = setup;
      const evolu = await run.ok(createSizeEvolu);

      const dataAtLimitLength = getDataAtLimitLength(evolu);
      const atLimit = { data: new Uint8Array(dataAtLimitLength) };
      assertEqual(evolu.getMutationSize("note", atLimit), maxMutationSize);
      const completed: Array<string> = [];

      const { id } = evolu.insert("note", atLimit, {
        onSuccess: () => {
          completed.push("at limit");
        },
      });
      const error = assertThrowsInstanceOf(
        () =>
          evolu.insert(
            "note",
            { data: new Uint8Array(dataAtLimitLength + 1) },
            {
              onSuccess: () => {
                completed.push("over limit");
              },
            },
          ),
        Error,
      );
      assertEqual(error.message, tooLargeMessage(maxMutationSize + 1));

      await testWaitForWorkerMessage();

      // The mutation made before the rejected one is sent as usual.
      assertEqual(
        getChanges(evoluInputs).map((change) => change.id),
        [id],
      );
      const mutate = evoluInputs.find((input) => input.type === "Mutate");
      assertNotUndefined(mutate);
      postEvoluOutput({
        type: "OnPatchesByQuery",
        patchesByQuery: new Map(),
        callbackIds: mutate.callbackIds,
      });
      await testWaitForWorkerMessage();
      assertEqual(completed, ["at limit"]);
    });

    it("lets plain text use the whole limit at a byte per character", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run, evoluInputs } = setup;
      const evolu = await run.ok(createSizeEvolu);

      // Spaces keep the text from being encoded as Base64Url, which is smaller.
      // A long text's length varint takes two more bytes than a short one's.
      const length =
        maxMutationSize - evolu.getMutationSize("note", { body: " " }) - 1;
      assertEqual(
        evolu.getMutationSize("note", { body: " ".repeat(length) }),
        maxMutationSize,
      );
      assertTrue(length > 639_900);

      evolu.update("note", { id: noteId, body: " ".repeat(length) });
      const error = assertThrowsInstanceOf(
        () =>
          evolu.update("note", { id: noteId, body: " ".repeat(length + 1) }),
        Error,
      );
      assertEqual(error.message, tooLargeMessage(maxMutationSize + 1));

      await testWaitForWorkerMessage();
      assertLength(getChanges(evoluInputs), 1);
    });

    it("saves a copy of each binary value", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run, evoluInputs } = setup;
      const evolu = await run.ok(createSizeEvolu);

      const resizable = new ArrayBuffer(3, { maxByteLength: 8 });
      const growing = new Uint8Array(resizable);
      growing.set([1, 2, 3]);
      const shared = new Uint8Array(new SharedArrayBuffer(3));
      shared.set([4, 5, 6]);
      const nodeBuffer = Buffer.from([7, 8, 9]);

      evolu.insert("note", { data: growing });
      evolu.insert("note", { data: shared });
      evolu.insert("note", { data: nodeBuffer });

      // Changes made before the batch is sent do not reach it.
      resizable.resize(8);
      growing.fill(0);
      shared.fill(0);
      nodeBuffer.fill(0);

      await testWaitForWorkerMessage();

      const saved = getChanges(evoluInputs).map((change) => change.values.data);
      assertEqual(saved, [
        new Uint8Array([1, 2, 3]),
        new Uint8Array([4, 5, 6]),
        new Uint8Array([7, 8, 9]),
      ]);
      for (const data of saved) {
        assert(data instanceof Uint8Array, "Expected a Uint8Array.");
        assertSame(Object.getPrototypeOf(data), Uint8Array.prototype);
        assertFalse(data.buffer instanceof SharedArrayBuffer);
        assertFalse((data.buffer as ArrayBuffer).resizable);
      }
    });

    it("does not limit local-only tables but copies their binary values", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run, evoluInputs } = setup;
      const evolu = await run.ok(createSizeEvolu);

      const data = new Uint8Array(maxMutationSize + 1);
      evolu.insert("_note", { data });
      data[0] = 1;

      await testWaitForWorkerMessage();

      const [change] = getChanges(evoluInputs);
      assertNotUndefined(change);
      const saved = change.values.data;
      assert(saved instanceof Uint8Array, "Expected a Uint8Array.");
      assertNotSame(saved, data);
      assertEqual(saved.byteLength, maxMutationSize + 1);
      assertEqual(saved[0], 0);
    });

    it("fits a change at the limit into one message next to the largest ranges section", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const evolu = await setup.run.ok(createSizeEvolu);
      const deps = {
        ...testCreateDeps(),
        xChaCha20Poly1305: createXChaCha20Poly1305(),
      };
      const values = { data: new Uint8Array(getDataAtLimitLength(evolu)) };
      assertEqual(evolu.getMutationSize("note", values), maxMutationSize);

      const message = {
        timestamp: createTimestamp(),
        change: DbChange.orThrow({
          table: "note",
          id: noteId,
          values,
          isInsert: true,
          isDelete: null,
        }),
      };

      const change = encodeAndEncryptDbChange(deps)(
        message,
        testAppOwner.encryptionKey,
      );

      // A request leaves out a change that does not fit and asks for another
      // round instead, so it must be longer than the change. A broadcast
      // throws when the change does not fit.
      assertTrue(
        createProtocolMessageFromCrdtMessages(deps)(testAppOwner, [message])
          .length > change.length,
      );
      createProtocolBroadcastMessagesFromCrdtMessages(deps)(testAppOwner, [
        message,
      ]);

      // A relay's response can pair it with the largest ranges section: a
      // Skip range and a Timestamps range listing nearly 100,000 bytes, with
      // room left to close the frame.
      const rangesMaxSize = ProtocolMessageRangesMaxSize.orThrow(100_000);
      const timestamps = createTimestampsBuffer();
      for (let index = 1; timestamps.getLength() < 99_900; index++) {
        timestamps.add(
          createTimestamp({
            millis: createTimestamp().millis,
            nodeId: index.toString(16).padStart(16, "0") as NodeId,
          }),
        );
      }
      const response = createProtocolMessageBuffer(testAppOwner.id, {
        messageType: MessageType.Response,
        errorCode: ProtocolErrorCode.NoError,
        rangesMaxSize,
      });
      assertTrue(
        response.tryWrite(() => {
          response.addMessage({ timestamp: message.timestamp, change });
          response.addRange({
            type: RangeType.Skip,
            upperBound: timestampToTimestampBytes(
              createTimestamp({ millis: Millis.orThrow(2 ** 47) }),
            ),
          });
          response.addRange({
            type: RangeType.Timestamps,
            upperBound: timestampToTimestampBytes(
              createTimestamp({
                millis: maxMillis,
                counter: maxCounter,
                nodeId: maxNodeId,
              }),
            ),
            timestamps,
          });
        }),
      );
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

    it("throws when OnExportFailed arrives without pending export", async () => {
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
            type: "OnExportFailed",
            error: createUnknownError(new Error("out of memory")),
          });
        }, Error).message,
        "OnExportFailed received without pending export.",
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

    it("rejects a failed export and exports again on the next call", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run, evoluInputs, postEvoluOutput } = setup;
      const evolu = await run.ok(testCreateEvolu);
      const error = createUnknownError(new Error("out of memory"));

      const failedExport = evolu.exportDatabase();
      await testWaitForWorkerMessage();
      postEvoluOutput({ type: "OnExportFailed", error });

      await assertRejects(failedExport, error);

      const nextExport = evolu.exportDatabase();
      await testWaitForWorkerMessage();
      assertEqual(evoluInputs, [{ type: "Export" }, { type: "Export" }]);

      const file = new Uint8Array([1, 2, 3]);
      postEvoluOutput({ type: "OnExport", file });
      assertEqualBytes(await nextExport, file);
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

  describe("deleteDatabase", () => {
    const disposedMessage = "Cannot use a disposed object.";

    it("asks for the deletion after the changes made before it", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run, evoluInputs } = setup;
      const evolu = await run.ok(testCreateEvolu);

      evolu.insert("todo", {
        title: NonEmptyTrimmedString100.orThrow("Deleted with the database"),
      });
      void evolu.deleteDatabase();
      await testWaitForWorkerMessage();

      assertEqual(
        evoluInputs.map(({ type }) => type),
        ["Mutate", "DeleteDatabase"],
      );
    });

    it("asks for the deletion after the queries loaded before it", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run, evoluInputs } = setup;
      const evolu = await run.ok(testCreateEvolu);

      void evolu.loadQuery(todoTitleQuery);
      void evolu.deleteDatabase();
      await testWaitForWorkerMessage();

      assertEqual(
        evoluInputs.map(({ type }) => type),
        ["Query", "DeleteDatabase"],
      );
    });

    it("asks for the deletion after the owner actions made before it", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run, evoluInputs } = setup;
      const evolu = await run.ok(testCreateEvolu);

      evolu.useOwner(testAppOwner, [testOwnerTransport]);
      void evolu.deleteDatabase();
      await testWaitForWorkerMessage();

      assertEqual(
        evoluInputs.map(({ type }) => type),
        ["UseOwner", "DeleteDatabase"],
      );
    });

    it("resolves its call, and calls onDatabaseDeleted, in the instance that asked", async () => {
      const events: Array<string> = [];
      await using setup = await setupRunWithEvoluDeps({
        reloadApp: () => {
          events.push("reload");
        },
      });
      const { run, postEvoluOutput } = setup;
      const evolu = await run.ok(
        createEvolu(Schema, {
          appName: testAppName,
          appOwner: testAppOwner,
          transports: [],
          onDatabaseDeleted: () => {
            events.push("onDatabaseDeleted");
          },
        }),
      );

      const deletion = evolu.deleteDatabase();
      postEvoluOutput({ type: "OnDatabaseDeleted" });

      assertEqual(await deletion, ok());
      assertEqual(events, ["onDatabaseDeleted"]);
    });

    it("resolves once the database is deleted, after which the instance is disposed", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run, postEvoluOutput } = setup;
      const evolu = await run.ok(testCreateEvolu);

      const deletion = evolu.deleteDatabase();
      await testWaitForWorkerMessage();
      postEvoluOutput({ type: "OnDatabaseDeleted" });

      assertEqual(await deletion, ok());
      await testWaitForWorkerMessage();
      assertEqual(
        assertThrowsInstanceOf(() => {
          evolu.getQueryRows(todoTitleQuery);
        }, Error).message,
        disposedMessage,
      );
    });

    it("leaves a load the deletion dropped pending in the tab that asked", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run, postEvoluOutput } = setup;
      const evolu = await run.ok(testCreateEvolu);

      const deletion = evolu.deleteDatabase();
      const settled = evolu.loadQuery(todoTitleQuery).then(() => "settled");
      await testWaitForWorkerMessage();
      postEvoluOutput({ type: "OnDatabaseDeleted" });
      assertEqual(await deletion, ok());
      await testWaitForWorkerMessage();

      // Settling it would make React render a suspended component again with
      // the disposed instance, which throws.
      assertEqual(
        await Promise.race([settled, Promise.resolve("pending")]),
        "pending",
      );
    });

    it("leaves a load the deletion dropped pending in a tab that reloads", async () => {
      const reloads: Array<string | undefined> = [];
      await using setup = await setupRunWithEvoluDeps({
        reloadApp: (url) => {
          reloads.push(url);
        },
      });
      const { run, postEvoluOutput } = setup;
      const evolu = await run.ok(testCreateEvolu);

      const settled = evolu.loadQuery(todoTitleQuery).then(() => "settled");
      await testWaitForWorkerMessage();
      postEvoluOutput({ type: "OnDatabaseDeleted" });
      await testWaitForWorkerMessage();

      assertEqual(reloads, [undefined]);
      assertEqual(
        await Promise.race([settled, Promise.resolve("pending")]),
        "pending",
      );
    });

    it("shares a pending deletion, and asks again after it failed", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run, evoluInputs, postEvoluOutput } = setup;
      const evolu = await run.ok(testCreateEvolu);

      const first = evolu.deleteDatabase();
      const second = evolu.deleteDatabase();
      await testWaitForWorkerMessage();
      assertSame(first, second);
      assertEqual(evoluInputs, [{ type: "DeleteDatabase" }]);

      const error = createUnknownError(new Error("disk I/O error"));
      postEvoluOutput({ type: "OnDeleteDatabaseFailed", error });
      assertEqual(await first, err(error));

      void evolu.deleteDatabase();
      await testWaitForWorkerMessage();
      assertEqual(evoluInputs, [
        { type: "DeleteDatabase" },
        { type: "DeleteDatabase" },
      ]);
    });

    it("resolves with EvoluDisposedError when the instance is disposed first", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run } = setup;
      const evolu = await run.ok(testCreateEvolu);

      const deletion = evolu.deleteDatabase();
      await evolu[Symbol.asyncDispose]();

      assertEqual(await deletion, err({ type: "EvoluDisposedError" }));
    });

    it("calls onDatabaseDeleted, then disposes the instance, when the database was deleted", async () => {
      const events: Array<string> = [];
      await using setup = await setupRunWithEvoluDeps({
        reloadApp: () => {
          events.push("reload");
        },
      });
      const { run, postEvoluOutput } = setup;
      const evolu = await run.ok(
        createEvolu(Schema, {
          appName: testAppName,
          appOwner: testAppOwner,
          transports: [],
          onDatabaseDeleted: () => {
            events.push("onDatabaseDeleted");
            // Still usable while the callback runs.
            evolu.getQueryRows(todoTitleQuery);
          },
        }),
      );

      postEvoluOutput({ type: "OnDatabaseDeleted" });
      await testWaitForWorkerMessage();

      assertEqual(events, ["onDatabaseDeleted"]);
      assertThrowsInstanceOf(() => {
        evolu.getQueryRows(todoTitleQuery);
      }, Error);
    });

    it("disposes the instance when onDatabaseDeleted throws", async () => {
      const error = new Error("UI failed");
      await using setup = await setupWithEvoluChannel();
      const { run } = setup;
      const evolu = await run.ok(
        createEvolu(Schema, {
          appName: testAppName,
          appOwner: testAppOwner,
          transports: [],
          onDatabaseDeleted: () => {
            throw error;
          },
        }),
      );

      assertSame(
        assertThrowsInstanceOf(() => {
          setup.deliver({ type: "OnDatabaseDeleted" });
        }, Error),
        error,
      );
      await testWaitForWorkerMessage();

      assertThrowsInstanceOf(() => {
        evolu.getQueryRows(todoTitleQuery);
      }, Error);
    });

    it("resolves its call and marks the instance deleted before onDatabaseDeleted, even when it throws", async () => {
      const error = new Error("UI failed");
      await using setup = await setupWithEvoluChannel();
      const { run } = setup;
      const deletedInCallback: Array<boolean> = [];
      const evolu = await run.ok(
        createEvolu(Schema, {
          appName: testAppName,
          appOwner: testAppOwner,
          transports: [],
          onDatabaseDeleted: () => {
            deletedInCallback.push(isDatabaseDeleted(evolu));
            throw error;
          },
        }),
      );
      const deletion = evolu.deleteDatabase();

      assertSame(
        assertThrowsInstanceOf(() => {
          setup.deliver({ type: "OnDatabaseDeleted" });
        }, Error),
        error,
      );

      assertEqual(await deletion, ok());
      assertEqual(deletedInCallback, [true]);
    });

    it("reloads the app without onDatabaseDeleted when the database was deleted", async () => {
      const reloads: Array<string | undefined> = [];
      await using setup = await setupRunWithEvoluDeps({
        reloadApp: (url) => {
          reloads.push(url);
        },
      });
      const { run, postEvoluOutput } = setup;
      const evolu = await run.ok(testCreateEvolu);

      postEvoluOutput({ type: "OnDatabaseDeleted" });
      await testWaitForWorkerMessage();

      assertEqual(reloads, [undefined]);
      assertThrowsInstanceOf(() => {
        evolu.getQueryRows(todoTitleQuery);
      }, Error);
    });

    it("wakes its subscriptions with no rows when the database is deleted", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run, postEvoluOutput } = setup;
      const evolu = await run.ok(testCreateEvolu);
      const notifiedRows: Array<unknown> = [];
      evolu.subscribeQuery(todoTitleQuery)(() => {
        notifiedRows.push(evolu.getQueryRows(todoTitleQuery));
      });
      postEvoluOutput({
        type: "OnPatchesByQuery",
        patchesByQuery: new Map([
          [todoTitleQuery, ok([{ op: "replaceAll", value: [{ title: "A" }] }])],
        ]),
        callbackIds: [],
      });
      await testWaitForWorkerMessage();
      assertEqual(notifiedRows.splice(0), [[{ title: "A" }]]);

      postEvoluOutput({ type: "OnDatabaseDeleted" });
      await testWaitForWorkerMessage();

      // Bindings render again, so they show no deleted rows.
      assertEqual(notifiedRows, [[]]);
    });

    it("tells bindings that the deletion disposed the instance", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run, postEvoluOutput } = setup;
      const evolu = await run.ok(testCreateEvolu);
      assertFalse(isDatabaseDeleted(evolu));

      postEvoluOutput({ type: "OnDatabaseDeleted" });
      await testWaitForWorkerMessage();

      assertTrue(isDatabaseDeleted(evolu));
    });

    it("does not tell bindings that an instance disposed without a deletion was deleted", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const evolu = await setup.run.ok(testCreateEvolu);

      await evolu[Symbol.asyncDispose]();

      assertFalse(isDatabaseDeleted(evolu));
    });

    it("reloads the app without onDatabaseDeleted in the instance that asked, after its call resolves", async () => {
      const reloads: Array<string | undefined> = [];
      await using setup = await setupRunWithEvoluDeps({
        reloadApp: (url) => {
          reloads.push(url);
        },
      });
      const { run, postEvoluOutput } = setup;
      const evolu = await run.ok(testCreateEvolu);

      const deletion = evolu.deleteDatabase();
      await testWaitForWorkerMessage();
      postEvoluOutput({ type: "OnDatabaseDeleted" });

      assertEqual(await deletion, ok());
      assertEqual(reloads, [undefined]);
    });

    it("throws when OnDeleteDatabaseFailed arrives without pending deletion", async () => {
      await using setup = await setupWithEvoluChannel();
      await setup.run.ok(testCreateEvolu);

      assertEqual(
        assertThrowsInstanceOf(() => {
          setup.deliver({
            type: "OnDeleteDatabaseFailed",
            error: createUnknownError(new Error("disk I/O error")),
          });
        }, Error).message,
        "OnDeleteDatabaseFailed received without pending deletion.",
      );
    });
  });

  describe("deleteOwner", () => {
    const createEvoluWithOnOwnerDeleted = (
      onOwnerDeleted: (ownerId: OwnerId) => void,
    ) =>
      createEvolu(Schema, {
        appName: testAppName,
        appOwner: testAppOwner,
        transports: [],
        onOwnerDeleted,
      });

    it("asks for the deletion after the owner actions, changes, and queries made before it", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run, evoluInputs } = setup;
      const evolu = await run.ok(testCreateEvolu);

      const unuseOwner = evolu.useOwner(testSharedOwner, [testOwnerTransport]);
      evolu.insert(
        "todo",
        { title: NonEmptyTrimmedString100.orThrow("Deleted with its owner") },
        { owner: testSharedOwner },
      );
      unuseOwner();
      void evolu.loadQuery(todoTitleQuery);
      void evolu.deleteOwner(testSharedOwner);
      await testWaitForWorkerMessage();

      assertEqual(
        evoluInputs.map(({ type }) => type),
        ["UseOwner", "Mutate", "Query", "DeleteOwner"],
      );
      assertEqual(evoluInputs.at(-1), {
        type: "DeleteOwner",
        ownerId: testSharedOwner.id,
      });
    });

    it("resolves its call, and calls onOwnerDeleted, once the owner is deleted", async () => {
      const deletedOwnerIds: Array<OwnerId> = [];
      await using setup = await setupRunWithEvoluDeps();
      const { run, postEvoluOutput } = setup;
      const evolu = await run.ok(
        createEvoluWithOnOwnerDeleted((ownerId) => {
          deletedOwnerIds.push(ownerId);
        }),
      );

      const deletion = evolu.deleteOwner(testSharedOwner);
      await testWaitForWorkerMessage();
      postEvoluOutput({
        type: "OnOwnerDeleted",
        ownerId: testSharedOwner.id,
        isAnswer: true,
      });

      assertEqual(await deletion, ok());
      assertEqual(deletedOwnerIds, [testSharedOwner.id]);
      // The instance keeps working.
      evolu.getQueryRows(todoTitleQuery);
    });

    it("resolves its call before onOwnerDeleted, even when it throws", async () => {
      const error = new Error("UI failed");
      await using setup = await setupWithEvoluChannel();
      const { run } = setup;
      const evolu = await run.ok(
        createEvoluWithOnOwnerDeleted(() => {
          throw error;
        }),
      );
      const deletion = evolu.deleteOwner(testSharedOwner);

      assertSame(
        assertThrowsInstanceOf(() => {
          setup.deliver({
            type: "OnOwnerDeleted",
            ownerId: testSharedOwner.id,
            isAnswer: true,
          });
        }, Error),
        error,
      );

      assertEqual(
        await Promise.race([deletion, Promise.resolve("pending")]),
        ok(),
      );
    });

    it("calls onOwnerDeleted when another instance deleted the owner, and keeps its own call pending", async () => {
      const deletedOwnerIds: Array<OwnerId> = [];
      await using setup = await setupRunWithEvoluDeps();
      const { run, postEvoluOutput } = setup;
      const evolu = await run.ok(
        createEvoluWithOnOwnerDeleted((ownerId) => {
          deletedOwnerIds.push(ownerId);
        }),
      );

      const settled = evolu.deleteOwner(testSharedOwner).then(() => "settled");
      await testWaitForWorkerMessage();
      postEvoluOutput({
        type: "OnOwnerDeleted",
        ownerId: testSharedOwner.id,
        isAnswer: false,
      });
      await testWaitForWorkerMessage();

      assertEqual(deletedOwnerIds, [testSharedOwner.id]);
      assertEqual(
        await Promise.race([settled, Promise.resolve("pending")]),
        "pending",
      );
    });

    it("asks once per call and answers its calls in order", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run, evoluInputs, postEvoluOutput } = setup;
      const evolu = await run.ok(testCreateEvolu);
      const otherOwner = createSharedOwner(createOwnerSecret(run.deps));

      const first = evolu.deleteOwner(testSharedOwner);
      const second = evolu.deleteOwner(otherOwner);
      const third = evolu.deleteOwner(testSharedOwner);
      await testWaitForWorkerMessage();
      assertEqual(evoluInputs, [
        { type: "DeleteOwner", ownerId: testSharedOwner.id },
        { type: "DeleteOwner", ownerId: otherOwner.id },
        { type: "DeleteOwner", ownerId: testSharedOwner.id },
      ]);

      // A failure between two successes tells the oldest pending call from
      // the newest for both answers.
      const error = createUnknownError(new Error("disk I/O error"));
      postEvoluOutput({
        type: "OnOwnerDeleted",
        ownerId: testSharedOwner.id,
        isAnswer: true,
      });
      postEvoluOutput({ type: "OnDeleteOwnerFailed", error });
      postEvoluOutput({
        type: "OnOwnerDeleted",
        ownerId: testSharedOwner.id,
        isAnswer: true,
      });

      assertEqual(await first, ok());
      assertEqual(await second, err(error));
      assertEqual(await third, ok());
    });

    it("resolves with the refusal of the database", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run, postEvoluOutput } = setup;
      const evolu = await run.ok(testCreateEvolu);
      const error: UnsupportedDbVersionError = {
        type: "UnsupportedDbVersionError",
        storedVersion: PositiveInt.orThrow(3),
        supportedVersion: PositiveInt.orThrow(2),
      };

      const deletion = evolu.deleteOwner(testSharedOwner);
      postEvoluOutput({ type: "OnDeleteOwnerFailed", error });

      assertEqual(await deletion, err(error));
    });

    it("resolves with EvoluDisposedError when the instance is disposed first", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run } = setup;
      const evolu = await run.ok(testCreateEvolu);

      const first = evolu.deleteOwner(testSharedOwner);
      const second = evolu.deleteOwner(testSharedOwner);
      await evolu[Symbol.asyncDispose]();

      const disposed = err({ type: "EvoluDisposedError" });
      assertEqual(
        await Promise.all([
          Promise.race([first, Promise.resolve("pending")]),
          Promise.race([second, Promise.resolve("pending")]),
        ]),
        [disposed, disposed],
      );
    });

    it("rejects the AppOwner and throws for an owner with its ID", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run, evoluInputs } = setup;
      const evolu = await run.ok(testCreateEvolu);

      const message =
        "deleteOwner cannot delete an owner with the AppOwner's ID, which names the database. Use deleteDatabase.";
      assertEqual(
        assertThrowsInstanceOf(() => {
          // @ts-expect-error deleteOwner takes no AppOwner, which names the database.
          void evolu.deleteOwner(evolu.appOwner);
        }, Error).message,
        message,
      );
      // A ShardOwner created from the AppOwner's secret has its ID.
      assertEqual(
        assertThrowsInstanceOf(() => {
          void evolu.deleteOwner(createShardOwner(testOwnerSecret));
        }, Error).message,
        message,
      );
      await testWaitForWorkerMessage();
      assertEqual(evoluInputs, []);
    });

    it("throws when OnOwnerDeleted answers no pending deletion", async () => {
      await using setup = await setupWithEvoluChannel();
      await setup.run.ok(testCreateEvolu);

      assertEqual(
        assertThrowsInstanceOf(() => {
          setup.deliver({
            type: "OnOwnerDeleted",
            ownerId: testSharedOwner.id,
            isAnswer: true,
          });
        }, Error).message,
        "OnOwnerDeleted answered no pending owner deletion.",
      );
    });

    it("throws when OnDeleteOwnerFailed arrives without pending deletion", async () => {
      await using setup = await setupWithEvoluChannel();
      await setup.run.ok(testCreateEvolu);

      assertEqual(
        assertThrowsInstanceOf(() => {
          setup.deliver({
            type: "OnDeleteOwnerFailed",
            error: createUnknownError(new Error("disk I/O error")),
          });
        }, Error).message,
        "OnDeleteOwnerFailed received without pending owner deletion.",
      );
    });
  });
});
