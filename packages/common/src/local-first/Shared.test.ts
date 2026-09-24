import { describe, it, type TestContext } from "node:test";
import { sql as kyselySql } from "kysely";

import {
  assert,
  assertEqual,
  assertFalse,
  assertInstanceOf,
  assertLength,
  assertNonEmptyArray,
  assertNonNullable,
  assertNotUndefined,
  assertNotSame,
  assertOk,
  assertSame,
  assertTrue,
} from "../Assert.ts";
import { createBuffer, encodeNonNegativeInt } from "../Bytes.ts";
import type { ConsoleEntry, ConsoleLevel } from "../Console.ts";
import type { DbWorkerInit, UnsupportedDbVersionError } from "./Db.ts";
import {
  createAppOwner,
  createOwnerSecret,
  createOwnerWebSocketTransport,
  ownerIdToOwnerIdBytes,
  testAppOwner,
  type SyncOwner,
  type OwnerId,
} from "./Owner.ts";
import {
  createProtocolMessageBuffer,
  createProtocolMessageForUnsubscribe,
  MessageType,
  ProtocolErrorCode,
  parseProtocolHeader,
  SubscriptionFlags,
} from "./Protocol.ts";
import {
  createQueryBuilder,
  type EvoluSchema,
  type MutationChange,
} from "./Schema.ts";
import {
  syncStateToOwnerSyncStates,
  consoleEntryOrErrorBroadcastChannelName,
  type EvoluInstanceId,
  initSharedWorker,
  type ConsoleEntryOrError,
  type DbWorkerInput,
  type DbWorkerOutput,
  type DbWorkerQueuedResponse,
  type EvoluInput,
  type EvoluOutput,
  type SharedWorkerId,
  type SharedWorkerInput,
  type SharedWorkerOutput,
  type SyncRoute,
  type SyncState,
  type SyncTransportId,
  type SyncRouteError,
  type SyncTenant,
  type SyncTenantOwner,
  type SyncTransport,
} from "./Shared.ts";
import type { NativeMessagePort } from "../Worker.ts";
import {
  DbChange,
  testCreateCrdtMessage,
  type StorageWriteMessagesError,
} from "./Storage.ts";
import {
  createTimestamp,
  maxCounter,
  maxNodeId,
  type Timestamp,
} from "./Timestamp.ts";
import { acquireLeaderLock, testCreateLockManager } from "../LockManager.ts";
import { installPolyfills } from "../Polyfills.ts";
import { ok } from "../Result.ts";
import { createSet } from "../Set.ts";
import type { SqliteSchema } from "../Sqlite.ts";
import { createStore } from "../Store.ts";
import { AbortError, sleep, testCreateDeps, testCreateRun } from "../Task.ts";
import { testCreateId } from "../Test.ts";
import {
  durationToMillis,
  maxMillis,
  Millis,
  millisToDateIso,
  testCreateTime,
  type PerformanceTime,
  type TestTime,
} from "../Time.ts";
import {
  assertType,
  createId,
  id,
  Name,
  NonNegativeInt,
  PositiveInt,
  String,
  testName,
  type Id,
  type ExtractTyped,
} from "../Type.ts";
import {
  testCreateWebSocket,
  type CreateWebSocket,
  type TestCreateWebSocket,
  type WebSocketError,
} from "../WebSocket.ts";
import {
  testCreateBroadcastChannel,
  testCreateMessageChannel,
  testCreateMessagePort,
  testCreateSharedWorker,
  testWaitForWorkerMessage,
  type TestMessageChannel,
} from "../Worker.ts";

installPolyfills();

const testAppOwner2 = createAppOwner(
  createOwnerSecret(testCreateDeps({ seed: "shared-owner-2" })),
);

const TestRowId = id("TestRow");

const testEvoluSchema = {
  test: {
    id: TestRowId,
    value: String,
  },
} satisfies EvoluSchema;

const createTestQuery = createQueryBuilder(testEvoluSchema);

const testQuery = createTestQuery((db) =>
  db.selectFrom("test").select(() => [kyselySql<string>`"test"`.as("query")]),
);

const testSqliteSchema: SqliteSchema = {
  tables: {
    todo: new Set(["title"]),
  },
  indexes: [],
};

const protocolMessageToArrayBuffer = (message: Uint8Array): ArrayBuffer =>
  Uint8Array.from(message).buffer;

const getDbWorkerInit = (
  output: SharedWorkerOutput | undefined,
): DbWorkerInit => {
  assertNotUndefined(output);
  assert(output.type === "DbWorkerInit", "Expected a DbWorkerInit output.");
  return output;
};

const setupSharedWorker = async ({
  createWebSocket = testCreateWebSocket({ throwOnCreate: true }),
  time,
  seed,
}: {
  createWebSocket?: CreateWebSocket;
  time?: TestTime;
  /**
   * Seeds the worker's random bytes, which are otherwise the same for every
   * worker.
   */
  seed?: string;
} = {}) => {
  await using disposer = new AsyncDisposableStack();
  const createTestId = testCreateId();

  const consoleStoreOutputEntry = createStore<ConsoleEntry | null>(null);
  const worker = disposer.use(
    testCreateSharedWorker<SharedWorkerInput, SharedWorkerOutput>(),
  );
  const sharedWorkerOutputs: Array<
    Exclude<SharedWorkerOutput, { type: "Connected" }>
  > = [];
  const connected =
    Promise.withResolvers<Extract<SharedWorkerOutput, { type: "Connected" }>>();
  let sharedWorkerOutput = Promise.withResolvers<void>();
  const waitForSharedWorkerOutput = (): Promise<void> =>
    sharedWorkerOutput.promise;
  const lockManager = testCreateLockManager();
  const mainThreadRun = disposer.use(
    testCreateRun({
      lockManager,
    }),
  );
  const run = disposer.use(
    testCreateRun({
      consoleStoreOutputEntry,
      createBroadcastChannel: testCreateBroadcastChannel,
      createMessageChannel: testCreateMessageChannel,
      lockManager,
      createMessagePort: testCreateMessagePort,
      createWebSocket,
      ...(time && { time }),
      ...(seed && { randomBytes: testCreateDeps({ seed }).randomBytes }),
    }),
  );

  disposer.use(await run.ok(initSharedWorker(worker.self)));
  worker.connect();
  worker.port.onMessage = (output) => {
    if (output.type === "Connected") {
      connected.resolve(output);
      return;
    }
    sharedWorkerOutputs.push(output);
    sharedWorkerOutput.resolve();
    sharedWorkerOutput = Promise.withResolvers<void>();
  };
  const { workerId, syncStateChannelName } = await connected.promise;

  const disposables = disposer.move();

  const createEvoluBeforeDbWorkerLeader = async ({
    tenantName = testName,
    evoluChannel = testCreateMessageChannel<EvoluOutput, EvoluInput>(),
    releaseDbWorkerLeaderOnDispose = true,
    autoDispose = true,
    initialClock = createTimestamp(),
  }: {
    tenantName?: Name;
    evoluChannel?: TestMessageChannel<EvoluOutput, EvoluInput>;
    releaseDbWorkerLeaderOnDispose?: boolean;
    autoDispose?: boolean;
    initialClock?: Timestamp;
  } = {}) => {
    const instanceDisposables = new AsyncDisposableStack();
    const id = createTestId<"EvoluInstance">();
    const dbInputs: Array<Exclude<DbWorkerInput, { type: "Dispose" }>> = [];
    const dbDisposeInputs: Array<Extract<DbWorkerInput, { type: "Dispose" }>> =
      [];
    let dbWorkerLeaderLock: AsyncDisposable | null = null;

    const releaseDbWorkerLeader = async (): Promise<void> => {
      if (!dbWorkerLeaderLock) return;
      const lock = dbWorkerLeaderLock;
      dbWorkerLeaderLock = null;
      await lock[Symbol.asyncDispose]();
    };

    const acquireDbWorkerLeader = async (): Promise<void> => {
      dbWorkerLeaderLock = await mainThreadRun.ok(
        acquireLeaderLock(tenantName),
      );
      dbWorkerPort.postMessage({
        clock: initialClock,
        type: "LeaderAcquired",
        name: tenantName,
      });
      await testWaitForWorkerMessage();
    };

    instanceDisposables.defer(releaseDbWorkerLeader);

    instanceDisposables.use(await mainThreadRun.ok(acquireLeaderLock(id)));

    worker.port.postMessage({
      type: "AnnounceTabLeader",
      consoleLevel: "debug",
    });
    await testWaitForWorkerMessage();

    const message: Extract<SharedWorkerInput, { type: "CreateEvolu" }> = {
      type: "CreateEvolu",
      name: tenantName,
      id,
      consoleLevel: "debug",
      sqliteSchema: testSqliteSchema,
      encryptionKey: testAppOwner.encryptionKey,
      memoryOnly: false,
      evoluPort: evoluChannel.port1.native,
    };

    const outputCount = sharedWorkerOutputs.length;
    const output = waitForSharedWorkerOutput();
    worker.port.postMessage(message);

    await output;

    const initDbWorker = getDbWorkerInit(sharedWorkerOutputs.at(outputCount));

    const dbWorkerPort = instanceDisposables.use(
      testCreateMessagePort<DbWorkerOutput, DbWorkerInput>(initDbWorker.port),
    );
    dbWorkerPort.onMessage = (input) => {
      if (input.type === "Dispose") {
        dbDisposeInputs.push(input);
        if (releaseDbWorkerLeaderOnDispose) void releaseDbWorkerLeader();
        return;
      }

      dbInputs.push(input);
    };

    const instance = {
      id,
      acquireDbWorkerLeader,
      evoluChannel,
      dbWorkerPort,
      dbInputs,
      dbDisposeInputs,
      releaseDbWorkerLeader,
      [Symbol.asyncDispose]: async () => {
        if (instanceDisposables.disposed) return;
        await instanceDisposables.disposeAsync();
        await testWaitForWorkerMessage();
      },
    };

    if (autoDispose) disposables.use(instance);

    return instance;
  };

  const createEvolu = async (
    options?: Parameters<typeof createEvoluBeforeDbWorkerLeader>[0],
  ) => {
    const instance = await createEvoluBeforeDbWorkerLeader(options);
    await instance.acquireDbWorkerLeader();
    return instance;
  };

  return {
    consoleStoreOutputEntry,
    sharedWorkerOutputs,
    workerId,
    syncStateChannelName,
    run,
    worker,

    announceTabLeader: async () => {
      const outputs: Array<ConsoleEntryOrError> = [];
      const consoleEntryOrErrorBroadcastChannel =
        testCreateBroadcastChannel<ConsoleEntryOrError>(
          consoleEntryOrErrorBroadcastChannelName,
        );
      consoleEntryOrErrorBroadcastChannel.onMessage = (output) => {
        outputs.push(output);
      };

      worker.port.postMessage({
        type: "AnnounceTabLeader",
        consoleLevel: "debug",
      });

      await testWaitForWorkerMessage();
      disposables.use(consoleEntryOrErrorBroadcastChannel);

      return {
        outputs,
        consoleEntryOrErrorBroadcastChannel,
      };
    },

    createEvolu,
    createEvoluBeforeDbWorkerLeader,

    [Symbol.asyncDispose]: () => disposables.disposeAsync(),
  };
};

type SharedWorkerSetup = Awaited<ReturnType<typeof setupSharedWorker>>;

/** Connects another tab and collects what the SharedWorker sends to it. */
const setupTab = (
  setup: SharedWorkerSetup,
  disposer: Pick<DisposableStack, "use">,
) => {
  const channel = disposer.use(
    testCreateMessageChannel<SharedWorkerInput, SharedWorkerOutput>(),
  );
  const outputs: Array<Exclude<SharedWorkerOutput, { type: "Connected" }>> = [];
  const workerIds: Array<SharedWorkerId> = [];
  const syncStates: Array<SyncState> = [];
  channel.port1.onMessage = (output) => {
    if (output.type === "Connected") {
      workerIds.push(output.workerId);
      // As a tab does: listen on the worker's channel, then ask for a
      // snapshot.
      const syncStateChannel = disposer.use(
        testCreateBroadcastChannel<SyncState>(output.syncStateChannelName),
      );
      syncStateChannel.onMessage = (state) => {
        syncStates.push(state);
      };
      channel.port1.postMessage({ type: "RequestSyncState" });
      return;
    }
    outputs.push(output);
  };
  assertNonNullable(setup.worker.self.onConnect);
  setup.worker.self.onConnect(channel.port2);
  return { port: channel.port1, outputs, workerIds, syncStates };
};

/** Collects the sync state broadcasts. */
const setupSyncStates = (
  setup: SharedWorkerSetup,
  disposer: Pick<DisposableStack, "use">,
) => {
  const states: Array<SyncState> = [];
  const channel = disposer.use(
    testCreateBroadcastChannel<SyncState>(setup.syncStateChannelName),
  );
  channel.onMessage = (state) => {
    states.push(state);
  };
  const latest = (): SyncState => {
    const state = states.at(-1);
    assertNotUndefined(state);
    return state;
  };
  return { states, latest };
};

type TestEvoluInstance = Awaited<ReturnType<SharedWorkerSetup["createEvolu"]>>;

type ApplySyncResult = Extract<
  Extract<DbWorkerQueuedResponse, { type: "ForSharedWorker" }>["message"],
  { type: "ApplySyncMessage" }
>["result"];

/** Completes the latest queued sync round and returns the URLs it was sent to. */
const respondToSyncRound = async (
  {
    dbInputs,
    dbWorkerPort,
  }: Pick<TestEvoluInstance, "dbInputs" | "dbWorkerPort">,
  createWebSocket: TestCreateWebSocket,
  owner = testAppOwner,
): Promise<Array<string>> => {
  const input = dbInputs.at(-1);
  assertNotUndefined(input);
  assertEqual(input.request, {
    type: "ForSharedWorker",
    message: { type: "CreateSyncMessages", owners: [owner] },
  });
  dbWorkerPort.postMessage({
    type: "OnQueuedResponse",
    attemptId: input.attemptId,
    response: {
      type: "ForSharedWorker",
      message: {
        type: "CreateSyncMessages",
        protocolMessagesByOwnerId: new Map([
          [owner.id, createProtocolMessageForUnsubscribe(owner.id)],
        ]),
        failedOwnerIds: new Set(),
      },
    },
  });
  await testWaitForWorkerMessage();
  return createWebSocket.sentMessages.splice(0).map(({ url }) => url);
};

/** Completes the latest queued ApplySyncMessage. */
const respondToApplySync = async (
  {
    dbInputs,
    dbWorkerPort,
  }: Pick<TestEvoluInstance, "dbInputs" | "dbWorkerPort">,
  didWriteMessages: boolean,
  result: ApplySyncResult,
): Promise<void> => {
  const input = dbInputs.at(-1);
  assertNotUndefined(input);
  assertSame(input.request.type, "ForSharedWorker");
  assertSame(input.request.message.type, "ApplySyncMessage");
  dbWorkerPort.postMessage({
    type: "OnQueuedResponse",
    attemptId: input.attemptId,
    response: {
      type: "ForSharedWorker",
      message: {
        type: "ApplySyncMessage",
        clock: createTimestamp(),
        ownerId: input.request.message.owner.id,
        didWriteMessages,
        result,
      },
    },
  });
  await testWaitForWorkerMessage();
};

/** Connects a new tab leader and waits for its DbWorker initialization message. */
const setupTabLeader = async (
  setup: SharedWorkerSetup,
  disposer: Pick<DisposableStack, "use">,
  consoleLevel: ConsoleLevel = "debug",
): Promise<DbWorkerInit> => {
  const tab = setupTab(setup, disposer);
  tab.port.postMessage({ type: "AnnounceTabLeader", consoleLevel });
  await testWaitForWorkerMessage();
  await testWaitForWorkerMessage();
  return getDbWorkerInit(tab.outputs.at(0));
};

describe("AnnounceTabLeader", () => {
  describe("console output", () => {
    it("drops console entry logged before the first connected tab", async () => {
      await using setup = await setupSharedWorker();
      const { consoleStoreOutputEntry, announceTabLeader } = setup;

      const entry: ConsoleEntry = {
        method: "info",
        path: ["test"],
        args: ["queued"],
      };

      consoleStoreOutputEntry.set(entry);

      const { outputs } = await announceTabLeader();

      assertEqual(outputs, []);
    });

    it("delivers live console entry after a tab connects", async () => {
      await using setup = await setupSharedWorker();
      const { consoleStoreOutputEntry, announceTabLeader } = setup;
      const { outputs } = await announceTabLeader();

      const entry: ConsoleEntry = {
        method: "info",
        path: ["test"],
        args: ["live"],
      };

      consoleStoreOutputEntry.set(entry);

      await testWaitForWorkerMessage();

      assertEqual(outputs, [{ type: "ConsoleEntry", entry }]);
    });

    it("ignores null console store updates", async () => {
      await using setup = await setupSharedWorker();
      const { consoleStoreOutputEntry, announceTabLeader } = setup;
      const { outputs } = await announceTabLeader();

      const entry: ConsoleEntry = {
        method: "info",
        path: ["test"],
        args: ["before-null"],
      };

      consoleStoreOutputEntry.set(entry);
      consoleStoreOutputEntry.set(null);

      await testWaitForWorkerMessage();

      assertEqual(outputs, [{ type: "ConsoleEntry", entry }]);
    });
  });

  it("logs unknown shared worker inputs", async () => {
    await using setup = await setupSharedWorker();
    const { run, worker } = setup;
    const { console } = run.deps;

    worker.port.postMessage({ type: "UnknownInput" } as never);
    await testWaitForWorkerMessage();

    assertEqual(console.getEntriesSnapshot().at(-1), {
      path: ["SharedWorker"],
      method: "error",
      args: ["Unknown shared worker input", { type: "UnknownInput" }],
    });
  });
});

describe("builds", () => {
  /** Starts a worker without waiting for its build lock. */
  const setupBuildWorker = (
    lockManager: ReturnType<typeof testCreateLockManager>,
    disposer: AsyncDisposableStack,
  ) => {
    const worker = disposer.use(
      testCreateSharedWorker<SharedWorkerInput, SharedWorkerOutput>(),
    );
    const run = disposer.use(
      testCreateRun({
        consoleStoreOutputEntry: createStore<ConsoleEntry | null>(null),
        createBroadcastChannel: testCreateBroadcastChannel,
        createMessageChannel: testCreateMessageChannel,
        lockManager,
        createMessagePort: testCreateMessagePort,
        createWebSocket: testCreateWebSocket({ throwOnCreate: true }),
      }),
    );
    const outputs: Array<SharedWorkerOutput> = [];
    worker.port.onMessage = (output) => {
      outputs.push(output);
    };
    const started = run.ok(initSharedWorker(worker.self));
    worker.connect();
    return { worker, outputs, started };
  };

  /** Answers a DbWorkerInit as a started DbWorker, so the tenant finishes. */
  const answerDbWorkerInit = async (
    output: SharedWorkerOutput | undefined,
    disposer: AsyncDisposableStack,
  ): Promise<void> => {
    const init = getDbWorkerInit(output);
    const port = disposer.use(
      testCreateMessagePort<DbWorkerOutput, DbWorkerInput>(init.port),
    );
    port.postMessage({
      type: "LeaderAcquired",
      name: init.name,
      clock: createTimestamp(),
    });
    await testWaitForWorkerMessage();
  };

  it("answers no tab while a leader tab of an earlier release holds the lock", async () => {
    await using disposer = new AsyncDisposableStack();
    const lockManager = testCreateLockManager();
    const mainThreadRun = disposer.use(testCreateRun({ lockManager }));
    const legacyLeader = await mainThreadRun.ok(acquireLeaderLock("tab"));
    const { worker, outputs, started } = setupBuildWorker(
      lockManager,
      disposer,
    );
    const id = testCreateId()<"EvoluInstance">();
    disposer.use(await mainThreadRun.ok(acquireLeaderLock(id)));
    const evoluChannel = disposer.use(
      testCreateMessageChannel<EvoluOutput, EvoluInput>(),
    );

    worker.port.postMessage({
      type: "AnnounceTabLeader",
      consoleLevel: "debug",
    });
    worker.port.postMessage({
      type: "CreateEvolu",
      name: testName,
      id,
      consoleLevel: "debug",
      sqliteSchema: testSqliteSchema,
      encryptionKey: testAppOwner.encryptionKey,
      memoryOnly: false,
      evoluPort: evoluChannel.port1.native,
    });
    await testWaitForWorkerMessage();
    assertEqual(outputs, []);

    // The buffered messages are served once the lock is released.
    await legacyLeader[Symbol.asyncDispose]();
    disposer.use(await started);
    await testWaitForWorkerMessage();
    await testWaitForWorkerMessage();
    assertEqual(
      outputs.map((output) => output.type),
      ["Connected", "DbWorkerInit"],
    );
    await answerDbWorkerInit(outputs.at(1), disposer);
  });

  it("keeps a worker of another build waiting until it ends", async () => {
    await using disposer = new AsyncDisposableStack();
    const lockManager = testCreateLockManager();
    const first = setupBuildWorker(lockManager, disposer);
    const firstWorker = await first.started;
    const second = setupBuildWorker(lockManager, disposer);
    await testWaitForWorkerMessage();
    assertEqual(
      first.outputs.map((output) => output.type),
      ["Connected"],
    );
    assertEqual(second.outputs, []);

    await firstWorker[Symbol.asyncDispose]();
    disposer.use(await second.started);
    await testWaitForWorkerMessage();
    assertEqual(
      second.outputs.map((output) => output.type),
      ["Connected"],
    );
  });

  it("sends every tab the same workerId, which scopes their election", async () => {
    await using setup = await setupSharedWorker();
    using disposer = new DisposableStack();
    const first = setupTab(setup, disposer);
    const second = setupTab(setup, disposer);
    await testWaitForWorkerMessage();
    assertEqual(
      [...first.workerIds, ...second.workerIds],
      [setup.workerId, setup.workerId],
    );
  });

  it("starts the DbWorker when a tab announces itself after a database is requested", async () => {
    await using setup = await setupSharedWorker();
    await using disposer = new AsyncDisposableStack();
    await using run = testCreateRun({
      lockManager: setup.run.deps.lockManager,
    });
    const id = testCreateId()<"EvoluInstance">();
    await using _instance = await run.ok(acquireLeaderLock(id));
    using evoluChannel = testCreateMessageChannel<EvoluOutput, EvoluInput>();

    setup.worker.port.postMessage({
      type: "CreateEvolu",
      name: testName,
      id,
      consoleLevel: "debug",
      sqliteSchema: testSqliteSchema,
      encryptionKey: testAppOwner.encryptionKey,
      memoryOnly: false,
      evoluPort: evoluChannel.port1.native,
    });
    await testWaitForWorkerMessage();
    assertEqual(setup.sharedWorkerOutputs, []);

    setup.worker.port.postMessage({
      type: "AnnounceTabLeader",
      consoleLevel: "debug",
    });
    await testWaitForWorkerMessage();
    assertEqual(
      setup.sharedWorkerOutputs.map((output) => output.type),
      ["DbWorkerInit"],
    );
    await answerDbWorkerInit(setup.sharedWorkerOutputs.at(0), disposer);
    assertEqual(setup.run.deps.reportDefect.getDefects(), []);
  });

  it("disposes while a database request waits for a tab leader", async () => {
    await using setup = await setupSharedWorker();
    await using run = testCreateRun({
      lockManager: setup.run.deps.lockManager,
    });
    const id = testCreateId()<"EvoluInstance">();
    await using _instance = await run.ok(acquireLeaderLock(id));
    using evoluChannel = testCreateMessageChannel<EvoluOutput, EvoluInput>();

    setup.worker.port.postMessage({
      type: "CreateEvolu",
      name: testName,
      id,
      consoleLevel: "debug",
      sqliteSchema: testSqliteSchema,
      encryptionKey: testAppOwner.encryptionKey,
      memoryOnly: false,
      evoluPort: evoluChannel.port1.native,
    });
    await testWaitForWorkerMessage();
    assertEqual(setup.sharedWorkerOutputs, []);

    // No DbWorker holds the database lock yet, so nothing is waited for.
    await setup[Symbol.asyncDispose]();

    // The build lock is free again.
    await using _buildLock = await run.ok(acquireLeaderLock("tab"));
    assertEqual(setup.run.deps.reportDefect.getDefects(), []);
  });
});

describe("sync state", () => {
  it("names its channel to each connecting tab and broadcasts a snapshot on request", async () => {
    const createWebSocket = testCreateWebSocket();
    await using setup = await setupSharedWorker({ createWebSocket });
    using disposer = new DisposableStack();
    const first = setupTab(setup, disposer);
    await testWaitForWorkerMessage();
    assertEqual(first.syncStates, [{ transports: [], tenants: [] }]);

    const { evoluChannel } = await setup.createEvolu();
    // A relative URL, which WebSocket accepts, labels without its query.
    const transport = createOwnerWebSocketTransport({
      url: "/relay",
      ownerId: testAppOwner.id,
    });
    evoluChannel.port2.postMessage({
      type: "UseOwner",
      actions: [
        {
          owner: { owner: testAppOwner, transports: [transport] },
          action: "add",
        },
      ],
    });
    await testWaitForWorkerMessage();

    // The snapshot a later tab asks for reaches every tab of the worker.
    const second = setupTab(setup, disposer);
    await testWaitForWorkerMessage();
    const state = second.syncStates.at(-1);
    assertNotUndefined(state);
    assertEqual(first.syncStates.at(-1), state);
    assertLength(state.transports, 1);
    assertEqual(state.transports[0].label, "/relay");
    assertEqual(state.tenants, [
      {
        name: testName,
        refused: false,
        owners: [
          {
            ownerId: testAppOwner.id,
            writable: true,
            transportIds: [state.transports[0].id],
            routes: [
              {
                transportId: state.transports[0].id,
                complete: false,
                completeAt: null,
                lastSentAt: null,
                lastReceivedAt: null,
                error: null,
              },
            ],
          },
        ],
      },
    ]);
  });

  it("broadcasts on a channel of its own, which another worker does not use", async () => {
    await using setup = await setupSharedWorker();
    await using otherSetup = await setupSharedWorker({ seed: "other-worker" });
    assertTrue(setup.syncStateChannelName !== otherSetup.syncStateChannelName);
    using disposer = new DisposableStack();
    const tab = setupTab(setup, disposer);
    await testWaitForWorkerMessage();
    assertLength(tab.syncStates, 1);

    // The other worker answers its own tab, as one of another app version
    // would, and only that tab hears it.
    const otherTab = setupTab(otherSetup, disposer);
    await testWaitForWorkerMessage();
    assertLength(otherTab.syncStates, 1);
    assertLength(tab.syncStates, 1);
  });

  it("includes transitions without an event in the next snapshot", async () => {
    const createWebSocket = testCreateWebSocket({ isOpen: false });
    await using setup = await setupSharedWorker({ createWebSocket });
    using disposer = new DisposableStack();
    const { latest } = setupSyncStates(setup, disposer);
    const { evoluChannel } = await setup.createEvolu();
    const transport = createOwnerWebSocketTransport({
      url: "wss://relay.example",
      ownerId: testAppOwner.id,
    });
    evoluChannel.port2.postMessage({
      type: "UseOwner",
      actions: [
        {
          owner: { owner: testAppOwner, transports: [transport] },
          action: "add",
        },
      ],
    });
    await testWaitForWorkerMessage();
    createWebSocket.open(transport.url);
    await testWaitForWorkerMessage();
    createWebSocket.close(transport.url);
    await testWaitForWorkerMessage();
    assertSame(latest().transports[0].readyState, "closed");

    // The socket then starts reconnecting without an event, so nothing
    // publishes it until the next snapshot, here one a connecting tab asks
    // for, which reaches every tab.
    setupTab(setup, disposer);
    await testWaitForWorkerMessage();
    assertSame(latest().transports[0].readyState, "connecting");
  });

  it("publishes transport and registration changes", async () => {
    const createWebSocket = testCreateWebSocket({ isOpen: false });
    await using setup = await setupSharedWorker({ createWebSocket });
    using disposer = new DisposableStack();
    const { latest } = setupSyncStates(setup, disposer);
    const { time } = setup.run.deps;
    const instance = await setup.createEvolu({ autoDispose: false });
    const { evoluChannel } = instance;
    const writableTransport = createOwnerWebSocketTransport({
      url: "wss://relay.example/sync",
      ownerId: testAppOwner.id,
    });
    const readonlyOwner = {
      id: testAppOwner2.id,
      encryptionKey: testAppOwner2.encryptionKey,
    };
    const readonlyTransport = createOwnerWebSocketTransport({
      url: "wss://relay.example/sync",
      ownerId: readonlyOwner.id,
    });
    const readonlyRegistration: SyncOwner = {
      owner: readonlyOwner,
      transports: [readonlyTransport],
    };

    evoluChannel.port2.postMessage({
      type: "UseOwner",
      actions: [
        {
          owner: { owner: testAppOwner, transports: [writableTransport] },
          action: "add",
        },
        { owner: readonlyRegistration, action: "add" },
      ],
    });
    await testWaitForWorkerMessage();

    const registered = latest();
    assertEqual(
      registered.transports.map(({ label, readyState, error }) => ({
        label,
        readyState,
        error,
      })),
      [
        {
          label: "wss://relay.example/sync",
          readyState: "connecting",
          error: null,
        },
        {
          label: "wss://relay.example/sync",
          readyState: "connecting",
          error: null,
        },
      ],
    );
    const [writableId, readonlyId] = registered.transports.map(({ id }) => id);
    assertEqual(
      registered.tenants.map(({ name, refused, owners }) => ({
        name,
        refused,
        owners: owners.map(({ routes, ...owner }) => ({
          ...owner,
          routeCount: routes.length,
        })),
      })),
      [
        {
          name: testName,
          refused: false,
          owners: [
            {
              ownerId: testAppOwner.id,
              writable: true,
              transportIds: [writableId],
              routeCount: 1,
            },
            {
              ownerId: readonlyOwner.id,
              writable: false,
              transportIds: [readonlyId],
              routeCount: 0,
            },
          ],
        },
      ],
    );

    createWebSocket.open(writableTransport.url);
    await testWaitForWorkerMessage();
    assertSame(latest().transports[0].readyState, "open");
    assertEqual(latest().transports[0].openedAt, time.now());

    time.advance("1s");
    createWebSocket.close(writableTransport.url, { code: 1006 });
    await testWaitForWorkerMessage();
    // The close is published while the socket is still closed.
    assertSame(latest().transports[0].readyState, "closed");
    assertEqual(latest().transports[0].closedAt, time.now());

    const error: WebSocketError = {
      type: "WebSocketConnectError",
      event: new Event("error"),
    };
    createWebSocket.error(writableTransport.url, error);
    await testWaitForWorkerMessage();
    // By the next publish the socket has been dropped and is being retried.
    assertSame(latest().transports[0].readyState, "connecting");
    assertEqual(latest().transports[0].error, {
      type: "WebSocketConnectError",
      at: time.now(),
    });
    const lastError = latest().transports[0].error;
    time.advance("1s");
    createWebSocket.open(writableTransport.url);
    await testWaitForWorkerMessage();
    assertSame(latest().transports[0].readyState, "open");
    assertEqual(latest().transports[0].openedAt, time.now());
    assertEqual(latest().transports[0].error, lastError);

    evoluChannel.port2.postMessage({
      type: "UseOwner",
      actions: [{ owner: readonlyRegistration, action: "remove" }],
    });
    await testWaitForWorkerMessage();
    assertEqual(
      latest().tenants[0].owners.map(({ ownerId }) => ownerId),
      [testAppOwner.id],
    );

    // The released socket is disposed after its idle period.
    time.advance("3s");
    await testWaitForWorkerMessage();
    assertEqual(
      latest().transports.map(({ id }) => id),
      [writableId],
    );

    // Disposing the instance drops its registrations; the idle database
    // follows after its own idle period.
    await instance[Symbol.asyncDispose]();
    assertEqual(latest().tenants, [
      { name: testName, refused: false, owners: [] },
    ]);
    time.advance("3s");
    await testWaitForWorkerMessage();
    assertEqual(latest().tenants, []);
  });

  describe("routes", () => {
    /** A header-only relay Response: nothing to reconcile. */
    const relayResponse = (ownerId = testAppOwner.id): ArrayBuffer =>
      protocolMessageToArrayBuffer(
        createProtocolMessageBuffer(ownerId, {
          messageType: MessageType.Response,
          errorCode: ProtocolErrorCode.NoError,
        }).unwrap(),
      );

    const routeOf = (
      state: SyncState,
      tenantName: Name = testName,
      transportIndex = 0,
      ownerId: OwnerId = testAppOwner.id,
    ): SyncRoute => {
      const tenant = state.tenants.find(({ name }) => name === tenantName);
      assertNotUndefined(tenant);
      const owner = tenant.owners.find((owner) => owner.ownerId === ownerId);
      assertNotUndefined(owner);
      const route = owner.routes[transportIndex];
      assertNotUndefined(route);
      return route;
    };

    /** Posts a mutation for the owner without answering it. */
    const queueMutation = async (
      instance: TestEvoluInstance,
      ownerId: OwnerId = testAppOwner.id,
    ): Promise<void> => {
      instance.evoluChannel.port2.postMessage({
        type: "Mutate",
        changes: [{ ownerId, table: "todo" } as MutationChange],
        onCompleteIds: [],
        subscribedQueries: new Set(),
      });
      await testWaitForWorkerMessage();
    };

    /** Answers the dispatched mutation with one message for the owner. */
    const answerMutation = async (
      instance: TestEvoluInstance,
      run: SharedWorkerSetup["run"],
      ownerId: OwnerId = testAppOwner.id,
    ): Promise<void> => {
      const mutateInput = instance.dbInputs.at(-1);
      assertNotUndefined(mutateInput);
      assertSame(mutateInput.request.type, "ForEvolu");
      assertSame(mutateInput.request.message.type, "Mutate");
      instance.dbWorkerPort.postMessage({
        type: "OnQueuedResponse",
        attemptId: mutateInput.attemptId,
        response: {
          type: "ForEvolu",
          id: instance.id,
          message: {
            clock: createTimestamp(),
            type: "Mutate",
            messagesByOwnerId: new Map([
              [
                ownerId,
                [testCreateCrdtMessage(createId(run.deps), 1, "hello")],
              ],
            ]),
            rowsByQuery: new Map(),
          },
        },
      });
      await testWaitForWorkerMessage();
    };

    const postMutation = async (
      instance: TestEvoluInstance,
      run: SharedWorkerSetup["run"],
    ): Promise<void> => {
      await queueMutation(instance);
      await answerMutation(instance, run);
    };

    /**
     * Holds one publication without delaying worker delivery or other
     * microtasks.
     */
    const setupDeferredSyncStatePublication = (
      test: TestContext,
      createWebSocket: TestCreateWebSocket,
      url: string,
    ): (() => void) => {
      const publications: Array<() => void> = [];
      const schedule = test.mock.method(
        globalThis,
        "queueMicrotask",
        (callback: () => void) => {
          publications.push(callback);
        },
      );
      try {
        // This synchronous callback schedules only the publisher. Restore the
        // global function before returning, so callers can await other work.
        createWebSocket.error(url, {
          type: "WebSocketConnectionError",
          event: new Event("error"),
        });
      } finally {
        schedule.mock.restore();
      }
      assertLength(publications, 1);
      return () => {
        for (const publish of publications.splice(0)) publish();
      };
    };

    it("completes a route when its requests are answered and converged", async () => {
      const createWebSocket = testCreateWebSocket();
      await using setup = await setupSharedWorker({ createWebSocket });
      using disposer = new DisposableStack();
      const { latest } = setupSyncStates(setup, disposer);
      const instance = await setup.createEvolu();
      const { time } = setup.run.deps;
      const transport = createOwnerWebSocketTransport({
        url: "wss://route.example",
        ownerId: testAppOwner.id,
      });

      instance.evoluChannel.port2.postMessage({
        type: "UseOwner",
        actions: [
          {
            owner: { owner: testAppOwner, transports: [transport] },
            action: "add",
          },
        ],
      });
      await testWaitForWorkerMessage();
      // The first claim requested a round that is not sent yet.
      assertFalse(routeOf(latest()).complete);

      await respondToSyncRound(instance, createWebSocket);
      const sentAt = time.now();
      assertEqual(routeOf(latest()), {
        transportId: latest().transports[0].id,
        complete: false,
        completeAt: null,
        lastSentAt: sentAt,
        lastReceivedAt: null,
        error: null,
      });

      // The relay answers with nothing to reconcile.
      time.advance("1s");
      createWebSocket.message(transport.url, relayResponse());
      await testWaitForWorkerMessage();
      // Received but not applied yet.
      assertFalse(routeOf(latest()).complete);
      await respondToApplySync(instance, false, {
        ok: true,
        value: { type: "Converged" },
      });
      assertEqual(routeOf(latest()), {
        transportId: latest().transports[0].id,
        complete: true,
        completeAt: time.now(),
        lastSentAt: sentAt,
        lastReceivedAt: time.now(),
        error: null,
      });
      const completeAt = time.now();

      // A mutation needs only its upload answered.
      time.advance("1s");
      await postMutation(instance, setup.run);
      assertFalse(routeOf(latest()).complete);
      createWebSocket.message(transport.url, relayResponse());
      await testWaitForWorkerMessage();
      await respondToApplySync(instance, false, {
        ok: true,
        value: { type: "Converged" },
      });
      assertTrue(routeOf(latest()).complete);
      // Completing again after the upload restamps the time.
      assertEqual(routeOf(latest()).completeAt, time.now());
      assertNotSame(routeOf(latest()).completeAt, completeAt);

      // A rejected upload marks the route until a new round converges.
      time.advance("1s");
      await postMutation(instance, setup.run);
      createWebSocket.message(transport.url, relayResponse());
      await testWaitForWorkerMessage();
      await respondToApplySync(instance, false, {
        ok: false,
        error: { type: "ProtocolQuotaError", ownerId: testAppOwner.id },
      });
      assertFalse(routeOf(latest()).complete);
      assertEqual(routeOf(latest()).error, {
        type: "ProtocolQuotaError",
        at: time.now(),
      });

      // The failure requested the round that clears it.
      time.advance("1s");
      await testWaitForWorkerMessage();
      await respondToSyncRound(instance, createWebSocket);
      assertFalse(routeOf(latest()).complete);
      createWebSocket.message(transport.url, relayResponse());
      await testWaitForWorkerMessage();
      await respondToApplySync(instance, false, {
        ok: true,
        value: { type: "Converged" },
      });
      assertEqual(routeOf(latest()), {
        transportId: latest().transports[0].id,
        complete: true,
        completeAt: time.now(),
        lastSentAt: time.now(),
        lastReceivedAt: time.now(),
        error: null,
      });
    });

    it("records completion when the apply finishes before a delayed snapshot", async () => {
      const createWebSocket = testCreateWebSocket();
      const baseTime = testCreateTime();
      let advanceAfterNextNow = false;
      const now = ((type?: "DateIso") => {
        const millis = baseTime.now();
        if (advanceAfterNextNow) {
          advanceAfterNextNow = false;
          queueMicrotask(() => baseTime.advance("1s"));
        }
        return type === "DateIso" ? millisToDateIso(millis) : millis;
      }) as TestTime["now"];
      const time: TestTime = { ...baseTime, now };
      await using setup = await setupSharedWorker({ createWebSocket, time });
      using disposer = new DisposableStack();
      const { latest } = setupSyncStates(setup, disposer);
      const instance = await setup.createEvolu();
      const transport = createOwnerWebSocketTransport({
        url: "wss://completion-time.example",
        ownerId: testAppOwner.id,
      });
      instance.evoluChannel.port2.postMessage({
        type: "UseOwner",
        actions: [
          {
            action: "add",
            owner: { owner: testAppOwner, transports: [transport] },
          },
        ],
      });
      await testWaitForWorkerMessage();
      await respondToSyncRound(instance, createWebSocket);
      createWebSocket.message(transport.url, relayResponse());
      await testWaitForWorkerMessage();

      // The apply handler reads the current time, then this clock advances
      // before the microtask that publishes the resulting snapshot.
      const completedAt = baseTime.now();
      advanceAfterNextNow = true;
      await respondToApplySync(instance, false, {
        ok: true,
        value: { type: "Converged" },
      });
      assertTrue(baseTime.now() > completedAt);
      assertTrue(routeOf(latest()).complete);
      assertSame(routeOf(latest()).lastReceivedAt, completedAt);
      assertSame(routeOf(latest()).completeAt, completedAt);
    });

    it("retries a new failure after recovery without reading a snapshot", async (t) => {
      const createWebSocket = testCreateWebSocket();
      await using setup = await setupSharedWorker({ createWebSocket });
      using disposer = new DisposableStack();
      const { states, latest } = setupSyncStates(setup, disposer);
      const instance = await setup.createEvolu();
      const { time } = setup.run.deps;
      const transport = createOwnerWebSocketTransport({
        url: "wss://recovery-without-snapshot.example",
        ownerId: testAppOwner.id,
      });
      instance.evoluChannel.port2.postMessage({
        type: "UseOwner",
        actions: [
          {
            action: "add",
            owner: { owner: testAppOwner, transports: [transport] },
          },
        ],
      });
      await testWaitForWorkerMessage();
      await respondToSyncRound(instance, createWebSocket);
      createWebSocket.message(transport.url, relayResponse());
      await testWaitForWorkerMessage();
      await respondToApplySync(instance, false, {
        ok: true,
        value: { type: "Converged" },
      });
      assertTrue(routeOf(latest()).complete);

      const publish = setupDeferredSyncStatePublication(
        t,
        createWebSocket,
        transport.url,
      );
      const publishedCount = states.length;
      let completedAt = time.now();
      try {
        for (const _failure of [0, 1]) {
          time.advance("1s");
          await postMutation(instance, setup.run);
          createWebSocket.message(
            transport.url,
            protocolMessageToArrayBuffer(
              createProtocolMessageBuffer(testAppOwner.id, {
                messageType: MessageType.Response,
                errorCode: ProtocolErrorCode.QuotaError,
              }).unwrap(),
            ),
          );
          await testWaitForWorkerMessage();
          await respondToApplySync(instance, false, {
            ok: false,
            error: { type: "ProtocolQuotaError", ownerId: testAppOwner.id },
          });
          // Each failure follows a successful recovery, so each gets its own
          // retry even though no snapshot has observed either transition.
          await respondToSyncRound(instance, createWebSocket);
          createWebSocket.message(transport.url, relayResponse());
          await testWaitForWorkerMessage();
          await respondToApplySync(instance, false, {
            ok: true,
            value: { type: "Converged" },
          });
          assertLength(states, publishedCount);
        }
        completedAt = time.now();
        time.advance("1s");
      } finally {
        publish();
        await testWaitForWorkerMessage();
      }
      assertTrue(states.length > publishedCount);
      assertTrue(routeOf(latest()).complete);
      assertSame(routeOf(latest()).completeAt, completedAt);
      assertSame(routeOf(latest()).error, null);
    });

    it("forgets released routes before a new registration without reading a snapshot", async (t) => {
      const createWebSocket = testCreateWebSocket();
      await using setup = await setupSharedWorker({ createWebSocket });
      using disposer = new DisposableStack();
      const { states, latest } = setupSyncStates(setup, disposer);
      const instance = await setup.createEvolu();
      const transport = createOwnerWebSocketTransport({
        url: "wss://registration-without-snapshot.example",
        ownerId: testAppOwner.id,
      });
      const owner = { owner: testAppOwner, transports: [transport] } as const;
      instance.evoluChannel.port2.postMessage({
        type: "UseOwner",
        actions: [{ action: "add", owner }],
      });
      await testWaitForWorkerMessage();
      await respondToSyncRound(instance, createWebSocket);
      createWebSocket.message(transport.url, relayResponse());
      await testWaitForWorkerMessage();
      await respondToApplySync(instance, false, {
        ok: true,
        value: { type: "Converged" },
      });
      assertTrue(routeOf(latest()).complete);
      assertNotSame(routeOf(latest()).completeAt, null);

      const publish = setupDeferredSyncStatePublication(
        t,
        createWebSocket,
        transport.url,
      );
      const publishedCount = states.length;
      try {
        instance.evoluChannel.port2.postMessage({
          type: "UseOwner",
          actions: [{ action: "remove", owner }],
        });
        await testWaitForWorkerMessage();
        instance.evoluChannel.port2.postMessage({
          type: "UseOwner",
          actions: [{ action: "add", owner }],
        });
        await testWaitForWorkerMessage();
        assertLength(states, publishedCount);
      } finally {
        publish();
        await testWaitForWorkerMessage();
      }

      // No snapshot observed the registration gap. The next one must still
      // show a fresh route, whose new round has not been sent.
      const route = routeOf(latest());
      assertFalse(route.complete);
      assertSame(route.completeAt, null);
      assertSame(route.lastSentAt, null);
      assertSame(route.error, null);
    });

    for (const removed of [
      "writable registration",
      "source transport",
    ] as const) {
      for (const outcome of ["error", "continuation"] as const) {
        it(`handles a late ${outcome} after removing the ${removed}`, async () => {
          const createWebSocket = testCreateWebSocket();
          await using setup = await setupSharedWorker({ createWebSocket });
          using disposer = new DisposableStack();
          const { latest } = setupSyncStates(setup, disposer);
          const instance = await setup.createEvolu();
          const keepsWritable = removed === "source transport";
          const sourceTransport = createOwnerWebSocketTransport({
            url: "wss://late-apply-source.example",
            ownerId: testAppOwner.id,
          });
          const remainingTransport = keepsWritable
            ? createOwnerWebSocketTransport({
                url: "wss://late-apply-remaining.example",
                ownerId: testAppOwner.id,
              })
            : sourceTransport;
          const registration = {
            owner: testAppOwner,
            transports: [sourceTransport],
          } as const;
          const remainingRegistration: SyncOwner = {
            owner: keepsWritable
              ? testAppOwner
              : {
                  id: testAppOwner.id,
                  encryptionKey: testAppOwner.encryptionKey,
                },
            transports: [remainingTransport],
          };
          const errors: Array<ConsoleEntryOrError> = [];
          using errorChannel = testCreateBroadcastChannel<ConsoleEntryOrError>(
            consoleEntryOrErrorBroadcastChannelName,
          );
          errorChannel.onMessage = (output) => {
            errors.push(output);
          };
          const outputs: Array<EvoluOutput> = [];
          instance.evoluChannel.port2.onMessage = (output) => {
            outputs.push(output);
          };
          instance.evoluChannel.port2.postMessage({
            type: "UseOwner",
            actions: [
              { action: "add", owner: registration },
              { action: "add", owner: remainingRegistration },
            ],
          });
          await testWaitForWorkerMessage();
          await respondToSyncRound(instance, createWebSocket);
          if (keepsWritable)
            await respondToSyncRound(instance, createWebSocket);
          const sourceTransportId = latest().transports[0].id;

          createWebSocket.message(sourceTransport.url, relayResponse());
          await testWaitForWorkerMessage();
          instance.evoluChannel.port2.postMessage({
            type: "UseOwner",
            actions: [{ action: "remove", owner: registration }],
          });
          instance.evoluChannel.port2.postMessage({
            type: "Query",
            queries: createSet([testQuery]),
          });
          await testWaitForWorkerMessage();
          assertFalse(
            latest().tenants[0].owners[0].routes.some(
              ({ transportId }) => transportId === sourceTransportId,
            ),
          );
          createWebSocket.sentMessages.splice(0);

          const error = {
            type: "ProtocolInvalidDataError",
            data: Uint8Array.of(255),
            error: "late range decoding failure",
          } satisfies StorageWriteMessagesError;
          const continuation = createProtocolMessageForUnsubscribe(
            testAppOwner.id,
          );
          await respondToApplySync(
            instance,
            true,
            outcome === "error"
              ? { ok: false, error }
              : {
                  ok: true,
                  value: { type: "Response", message: continuation },
                },
          );

          // Losing the route must not discard an accepted database response.
          assertEqual(
            errors,
            outcome === "error" ? [{ type: "Error", error }] : [],
          );
          assertEqual(outputs, [{ type: "RefreshQueries" }]);
          assertEqual(
            createWebSocket.sentMessages.splice(0),
            outcome === "continuation" && !keepsWritable
              ? [{ url: sourceTransport.url, data: continuation }]
              : [],
          );
          const owner = latest().tenants[0].owners[0];
          assertSame(owner.writable, keepsWritable);
          assertSame(owner.routes.length, keepsWritable ? 1 : 0);
          assertFalse(
            owner.routes.some(
              ({ transportId }) => transportId === sourceTransportId,
            ),
          );
          for (const route of owner.routes) assertSame(route.error, null);

          const query = instance.dbInputs.at(-1);
          assertNotUndefined(query);
          assertSame(query.request.type, "ForEvolu");
          assertSame(query.request.message.type, "Query");
          if (keepsWritable) {
            instance.dbWorkerPort.postMessage({
              type: "OnQueuedResponse",
              attemptId: query.attemptId,
              response: {
                type: "ForEvolu",
                id: instance.id,
                message: { type: "Query", rowsByQuery: new Map() },
              },
            });
            await testWaitForWorkerMessage();
            assertEqual(await respondToSyncRound(instance, createWebSocket), [
              remainingTransport.url,
            ]);
          }
        });
      }
    }

    for (const reason of [
      { type: "Stop" },
      { type: "PanicAbortReason", defect: new Error("SQLite write failed") },
    ]) {
      it(`keeps a route incomplete after ${reason.type} without scheduling recovery`, async () => {
        const createWebSocket = testCreateWebSocket();
        await using setup = await setupSharedWorker({ createWebSocket });
        using disposer = new DisposableStack();
        const { latest } = setupSyncStates(setup, disposer);
        const instance = await setup.createEvolu();
        const [transport, otherTransport] = ["a", "b"].map((suffix) =>
          createOwnerWebSocketTransport({
            url: `wss://aborted-apply-${suffix}.example`,
            ownerId: testAppOwner.id,
          }),
        );
        assertNotUndefined(transport);
        assertNotUndefined(otherTransport);

        instance.evoluChannel.port2.postMessage({
          type: "UseOwner",
          actions: [
            {
              owner: {
                owner: testAppOwner,
                transports: [transport, otherTransport],
              },
              action: "add",
            },
          ],
        });
        await testWaitForWorkerMessage();
        await respondToSyncRound(instance, createWebSocket);
        await respondToSyncRound(instance, createWebSocket);
        createWebSocket.message(otherTransport.url, relayResponse());
        await testWaitForWorkerMessage();
        await respondToApplySync(instance, false, {
          ok: true,
          value: { type: "Converged" },
        });
        const otherRoute = routeOf(latest(), testName, 1);
        assertTrue(otherRoute.complete);
        createWebSocket.message(transport.url, relayResponse());
        await testWaitForWorkerMessage();
        const inputCount = instance.dbInputs.length;
        await respondToApplySync(instance, false, {
          ok: false,
          error: { type: "AbortError", reason },
        });

        // Receiving the answer consumed the outstanding request, but the
        // aborted apply did not establish convergence or a domain error.
        assertFalse(routeOf(latest()).complete);
        assertSame(routeOf(latest()).completeAt, null);
        // Nothing was applied, so the route reports no received frame.
        assertSame(routeOf(latest()).lastReceivedAt, null);
        assertSame(routeOf(latest()).error, null);
        assertSame(syncStateToOwnerSyncStates(latest())[0]?.status, "syncing");
        // The frame came from one relay, so the other route stays complete.
        assertEqual(routeOf(latest(), testName, 1), otherRoute);
        await testWaitForWorkerMessage();
        assertLength(instance.dbInputs, inputCount);

        // Another successful apply cannot substitute for a fresh round.
        createWebSocket.message(transport.url, relayResponse());
        await testWaitForWorkerMessage();
        await respondToApplySync(instance, false, {
          ok: true,
          value: { type: "Converged" },
        });
        assertFalse(routeOf(latest()).complete);
      });
    }

    it("reports SyncFailed without a retry when a round cannot be created", async () => {
      const createWebSocket = testCreateWebSocket();
      await using setup = await setupSharedWorker({ createWebSocket });
      using disposer = new DisposableStack();
      const { latest } = setupSyncStates(setup, disposer);
      const instance = await setup.createEvolu();
      const transport = createOwnerWebSocketTransport({
        url: "wss://failed-round.example",
        ownerId: testAppOwner.id,
      });
      instance.evoluChannel.port2.postMessage({
        type: "UseOwner",
        actions: [
          {
            owner: { owner: testAppOwner, transports: [transport] },
            action: "add",
          },
        ],
      });
      await testWaitForWorkerMessage();
      await respondToSyncRound(instance, createWebSocket);
      createWebSocket.message(transport.url, relayResponse());
      await testWaitForWorkerMessage();
      await respondToApplySync(instance, false, {
        ok: true,
        value: { type: "Converged" },
      });
      assertTrue(routeOf(latest()).complete);

      // The database worker logged an exception while creating the round.
      instance.evoluChannel.port2.postMessage({
        type: "UseOwner",
        actions: [{ ownerId: testAppOwner.id, action: "sync" }],
      });
      await testWaitForWorkerMessage();
      const round = instance.dbInputs.at(-1);
      assertNotUndefined(round);
      assertSame(round.request.type, "ForSharedWorker");
      assertSame(round.request.message.type, "CreateSyncMessages");
      const inputCount = instance.dbInputs.length;
      instance.dbWorkerPort.postMessage({
        type: "OnQueuedResponse",
        attemptId: round.attemptId,
        response: {
          type: "ForSharedWorker",
          message: {
            type: "CreateSyncMessages",
            protocolMessagesByOwnerId: new Map(),
            failedOwnerIds: new Set([testAppOwner.id]),
          },
        },
      });
      await testWaitForWorkerMessage();
      await testWaitForWorkerMessage();

      // Nothing is sent or retried until an explicit request or a reopen.
      assertEqual(createWebSocket.sentMessages, []);
      assertLength(instance.dbInputs, inputCount);
      assertFalse(routeOf(latest()).complete);
      assertEqual(routeOf(latest()).error, {
        type: "SyncFailed",
        at: setup.run.deps.time.now(),
      });
      assertSame(syncStateToOwnerSyncStates(latest())[0]?.status, "error");

      instance.evoluChannel.port2.postMessage({
        type: "UseOwner",
        actions: [{ ownerId: testAppOwner.id, action: "sync" }],
      });
      await testWaitForWorkerMessage();
      await respondToSyncRound(instance, createWebSocket);
      createWebSocket.message(transport.url, relayResponse());
      await testWaitForWorkerMessage();
      await respondToApplySync(instance, false, {
        ok: true,
        value: { type: "Converged" },
      });
      assertTrue(routeOf(latest()).complete);
      assertSame(routeOf(latest()).error, null);
    });

    it("reports SyncFailed only on the routes of the failed round's target", async () => {
      const createWebSocket = testCreateWebSocket();
      await using setup = await setupSharedWorker({ createWebSocket });
      using disposer = new DisposableStack();
      const { latest } = setupSyncStates(setup, disposer);
      const instance = await setup.createEvolu();
      const transports = ["a", "b"].map((suffix) =>
        createOwnerWebSocketTransport({
          url: `wss://failed-target-${suffix}.example`,
          ownerId: testAppOwner.id,
        }),
      );
      assertNonEmptyArray(transports);
      instance.evoluChannel.port2.postMessage({
        type: "UseOwner",
        actions: [
          { action: "add", owner: { owner: testAppOwner, transports } },
        ],
      });
      await testWaitForWorkerMessage();
      for (const _transport of transports)
        await respondToSyncRound(instance, createWebSocket);
      for (const transport of transports) {
        createWebSocket.message(transport.url, relayResponse());
        await testWaitForWorkerMessage();
        await respondToApplySync(instance, false, {
          ok: true,
          value: { type: "Converged" },
        });
      }
      assertTrue(routeOf(latest(), testName, 0).complete);
      assertTrue(routeOf(latest(), testName, 1).complete);

      // The first transport reopens, and the database worker fails to create
      // the round through it.
      createWebSocket.close(transports[0].url);
      createWebSocket.open(transports[0].url);
      await testWaitForWorkerMessage();
      const round = instance.dbInputs.at(-1);
      assertNotUndefined(round);
      assertEqual(round.request, {
        type: "ForSharedWorker",
        message: { type: "CreateSyncMessages", owners: [testAppOwner] },
      });
      instance.dbWorkerPort.postMessage({
        type: "OnQueuedResponse",
        attemptId: round.attemptId,
        response: {
          type: "ForSharedWorker",
          message: {
            type: "CreateSyncMessages",
            protocolMessagesByOwnerId: new Map(),
            failedOwnerIds: new Set([testAppOwner.id]),
          },
        },
      });
      await testWaitForWorkerMessage();

      assertFalse(routeOf(latest(), testName, 0).complete);
      assertEqual(routeOf(latest(), testName, 0).error, {
        type: "SyncFailed",
        at: setup.run.deps.time.now(),
      });
      assertTrue(routeOf(latest(), testName, 1).complete);
      assertSame(routeOf(latest(), testName, 1).error, null);
    });

    it("keeps SyncFailed when a round fails after an earlier round was sent", async () => {
      const createWebSocket = testCreateWebSocket();
      await using setup = await setupSharedWorker({ createWebSocket });
      using disposer = new DisposableStack();
      const { latest } = setupSyncStates(setup, disposer);
      const instance = await setup.createEvolu();
      const transport = createOwnerWebSocketTransport({
        url: "wss://later-failed-round.example",
        ownerId: testAppOwner.id,
      });
      instance.evoluChannel.port2.postMessage({
        type: "UseOwner",
        actions: [
          {
            owner: { owner: testAppOwner, transports: [transport] },
            action: "add",
          },
        ],
      });
      await testWaitForWorkerMessage();

      // The first round is dispatched, so an explicit request queues another.
      const inputCount = instance.dbInputs.length;
      instance.evoluChannel.port2.postMessage({
        type: "UseOwner",
        actions: [{ ownerId: testAppOwner.id, action: "sync" }],
      });
      await testWaitForWorkerMessage();
      assertLength(instance.dbInputs, inputCount);
      await respondToSyncRound(instance, createWebSocket);
      assertLength(instance.dbInputs, inputCount + 1);
      const round = instance.dbInputs.at(-1);
      assertNotUndefined(round);
      assertEqual(round.request, {
        type: "ForSharedWorker",
        message: { type: "CreateSyncMessages", owners: [testAppOwner] },
      });
      instance.dbWorkerPort.postMessage({
        type: "OnQueuedResponse",
        attemptId: round.attemptId,
        response: {
          type: "ForSharedWorker",
          message: {
            type: "CreateSyncMessages",
            protocolMessagesByOwnerId: new Map(),
            failedOwnerIds: new Set([testAppOwner.id]),
          },
        },
      });
      await testWaitForWorkerMessage();
      await testWaitForWorkerMessage();

      // The first round's answer converges, but the later round failed.
      createWebSocket.message(transport.url, relayResponse());
      await testWaitForWorkerMessage();
      await respondToApplySync(instance, false, {
        ok: true,
        value: { type: "Converged" },
      });
      assertFalse(routeOf(latest()).complete);
      assertEqual(routeOf(latest()).error, {
        type: "SyncFailed",
        at: setup.run.deps.time.now(),
      });
    });

    it("keeps completeAt while a route stays complete", async () => {
      const createWebSocket = testCreateWebSocket();
      await using setup = await setupSharedWorker({ createWebSocket });
      using disposer = new DisposableStack();
      const { latest } = setupSyncStates(setup, disposer);
      const instance = await setup.createEvolu();
      const transport = createOwnerWebSocketTransport({
        url: "wss://complete-at.example",
        ownerId: testAppOwner.id,
      });
      instance.evoluChannel.port2.postMessage({
        type: "UseOwner",
        actions: [
          {
            action: "add",
            owner: { owner: testAppOwner, transports: [transport] },
          },
        ],
      });
      await testWaitForWorkerMessage();
      await respondToSyncRound(instance, createWebSocket);
      createWebSocket.message(transport.url, relayResponse());
      await testWaitForWorkerMessage();
      await respondToApplySync(instance, false, {
        ok: true,
        value: { type: "Converged" },
      });
      assertTrue(routeOf(latest()).complete);
      const { completeAt } = routeOf(latest());
      assertNonNullable(completeAt);

      // Another owner's round later refreshes every route. The app owner's
      // route stays complete, so it keeps the time it became complete.
      setup.run.deps.time.advance("5s");
      instance.evoluChannel.port2.postMessage({
        type: "UseOwner",
        actions: [
          {
            action: "add",
            owner: {
              owner: testAppOwner2,
              transports: [
                createOwnerWebSocketTransport({
                  url: "wss://complete-at-other.example",
                  ownerId: testAppOwner2.id,
                }),
              ],
            },
          },
        ],
      });
      await testWaitForWorkerMessage();
      await respondToSyncRound(instance, createWebSocket, testAppOwner2);
      assertTrue(routeOf(latest()).complete);
      assertSame(routeOf(latest()).completeAt, completeAt);
    });

    const writeErrors: ReadonlyArray<StorageWriteMessagesError> = [
      {
        type: "DecryptWithXChaCha20Poly1305Error",
        error: "decryption failed",
      },
      {
        type: "ProtocolInvalidDataError",
        data: Uint8Array.of(255),
        error: "decoding failed",
      },
      {
        type: "ProtocolTimestampMismatchError",
        expected: createTimestamp(),
        timestamp: createTimestamp({ millis: Millis.orThrow(1) }),
      },
      { type: "StorageQuotaError", ownerId: testAppOwner.id },
      { type: "TimestampTimeOutOfRangeError" },
    ];
    const failedApplies = [
      ...writeErrors.map((error) => ({
        result: { ok: false as const, error },
        errorType: error.type,
      })),
      {
        result: { ok: true, value: { type: "Failed", cause: "Write" } },
        errorType: "WriteFailed",
      },
      {
        result: { ok: true, value: { type: "Failed", cause: "Sync" } },
        errorType: "SyncFailed",
      },
    ] satisfies ReadonlyArray<{
      result: ApplySyncResult;
      errorType: SyncRouteError["type"];
    }>;
    for (const { result, errorType } of failedApplies) {
      it(`reports ${errorType} and requests only one round after repeated failure`, async () => {
        const createWebSocket = testCreateWebSocket();
        await using setup = await setupSharedWorker({ createWebSocket });
        using disposer = new DisposableStack();
        const { latest } = setupSyncStates(setup, disposer);
        const errors: Array<ConsoleEntryOrError> = [];
        using errorChannel = testCreateBroadcastChannel<ConsoleEntryOrError>(
          consoleEntryOrErrorBroadcastChannelName,
        );
        errorChannel.onMessage = (output) => {
          errors.push(output);
        };
        const expectedErrors: ReadonlyArray<ConsoleEntryOrError> = result.ok
          ? []
          : [{ type: "Error", error: result.error }];
        const instance = await setup.createEvolu();
        const transport = createOwnerWebSocketTransport({
          url: "wss://failed-apply.example",
          ownerId: testAppOwner.id,
        });

        instance.evoluChannel.port2.postMessage({
          type: "UseOwner",
          actions: [
            {
              owner: { owner: testAppOwner, transports: [transport] },
              action: "add",
            },
          ],
        });
        await testWaitForWorkerMessage();
        await respondToSyncRound(instance, createWebSocket);
        createWebSocket.message(transport.url, relayResponse());
        await testWaitForWorkerMessage();
        await respondToApplySync(instance, false, result);

        // The failure is reported and one round is requested through the route.
        assertEqual(errors, expectedErrors);
        assertEqual(routeOf(latest()).error, {
          type: errorType,
          at: setup.run.deps.time.now(),
        });
        assertSame(syncStateToOwnerSyncStates(latest())[0]?.status, "error");
        await testWaitForWorkerMessage();
        assertEqual(await respondToSyncRound(instance, createWebSocket), [
          transport.url,
        ]);
        createWebSocket.message(transport.url, relayResponse());
        await testWaitForWorkerMessage();
        const inputCount = instance.dbInputs.length;
        await respondToApplySync(instance, false, result);

        // A repeated failure waits for an explicit request or a reopen.
        await testWaitForWorkerMessage();
        assertEqual(errors, [...expectedErrors, ...expectedErrors]);
        assertLength(instance.dbInputs, inputCount);
        assertFalse(routeOf(latest()).complete);
        assertSame(syncStateToOwnerSyncStates(latest())[0]?.status, "error");

        // An upload is not a round, so its answer does not clear the failure.
        await postMutation(instance, setup.run);
        assertEqual(
          createWebSocket.sentMessages.splice(0).map(({ url }) => url),
          [transport.url],
        );
        createWebSocket.message(transport.url, relayResponse());
        await testWaitForWorkerMessage();
        await respondToApplySync(instance, false, {
          ok: true,
          value: { type: "Converged" },
        });
        assertFalse(routeOf(latest()).complete);
        assertSame(routeOf(latest()).error?.type, errorType);

        // An explicit request starts the round that clears the failure.
        instance.evoluChannel.port2.postMessage({
          type: "UseOwner",
          actions: [{ ownerId: testAppOwner.id, action: "sync" }],
        });
        await testWaitForWorkerMessage();
        await respondToSyncRound(instance, createWebSocket);
        createWebSocket.message(transport.url, relayResponse());
        await testWaitForWorkerMessage();
        await respondToApplySync(instance, false, {
          ok: true,
          value: { type: "Converged" },
        });
        assertTrue(routeOf(latest()).complete);
        assertSame(routeOf(latest()).error, null);
        assertEqual(errors, [...expectedErrors, ...expectedErrors]);
      });
    }

    it("reports a write rejection only for the active attempt after leader replacement", async () => {
      const createWebSocket = testCreateWebSocket();
      await using setup = await setupSharedWorker({ createWebSocket });
      using disposer = new DisposableStack();
      const { latest } = setupSyncStates(setup, disposer);
      const errors: Array<ConsoleEntryOrError> = [];
      using errorChannel = testCreateBroadcastChannel<ConsoleEntryOrError>(
        consoleEntryOrErrorBroadcastChannelName,
      );
      errorChannel.onMessage = (output) => {
        errors.push(output);
      };
      const first = await setup.createEvolu({
        releaseDbWorkerLeaderOnDispose: false,
      });
      const transport = createOwnerWebSocketTransport({
        url: "wss://replayed-write-rejection.example",
        ownerId: testAppOwner.id,
      });
      first.evoluChannel.port2.postMessage({
        type: "UseOwner",
        actions: [
          {
            owner: { owner: testAppOwner, transports: [transport] },
            action: "add",
          },
        ],
      });
      await testWaitForWorkerMessage();
      await respondToSyncRound(first, createWebSocket);
      createWebSocket.message(transport.url, relayResponse());
      await testWaitForWorkerMessage();
      const original = first.dbInputs.at(-1);
      assertNotUndefined(original);
      assertSame(original.request.type, "ForSharedWorker");
      assertSame(original.request.message.type, "ApplySyncMessage");
      await first.releaseDbWorkerLeader();

      const init = await setupTabLeader(setup, disposer, "silent");
      const dbWorkerPort = disposer.use(
        testCreateMessagePort<DbWorkerOutput, DbWorkerInput>(init.port),
      );
      const dbInputs: Array<ExtractTyped<DbWorkerInput, "Request">> = [];
      dbWorkerPort.onMessage = (input) => {
        if (input.type === "Request") dbInputs.push(input);
      };
      dbWorkerPort.postMessage({
        type: "LeaderAcquired",
        name: testName,
        clock: createTimestamp(),
      });
      await testWaitForWorkerMessage();
      const replay = dbInputs.at(-1);
      assertNotUndefined(replay);
      assertEqual(replay.request, original.request);
      assertNotSame(replay.attemptId, original.attemptId);

      const error = {
        type: "DecryptWithXChaCha20Poly1305Error",
        error: "wrong encryption key",
      } satisfies StorageWriteMessagesError;
      const response = {
        type: "OnQueuedResponse",
        attemptId: original.attemptId,
        response: {
          type: "ForSharedWorker",
          message: {
            type: "ApplySyncMessage",
            clock: createTimestamp(),
            ownerId: testAppOwner.id,
            didWriteMessages: false,
            result: { ok: false, error },
          },
        },
      } satisfies DbWorkerOutput;

      // The retired port and an obsolete attempt on the live port must both
      // leave the active replay and its error reporting untouched.
      first.dbWorkerPort.postMessage(response);
      dbWorkerPort.postMessage(response);
      await testWaitForWorkerMessage();
      assertEqual(errors, []);
      assertSame(routeOf(latest()).error, null);
      assertLength(dbInputs, 1);

      const currentResponse = { ...response, attemptId: replay.attemptId };
      dbWorkerPort.postMessage(currentResponse);
      await testWaitForWorkerMessage();
      assertEqual(errors, [{ type: "Error", error }]);
      assertEqual(routeOf(latest()).error, {
        type: error.type,
        at: setup.run.deps.time.now(),
      });
      assertLength(dbInputs, 2);

      // A duplicate completion is stale as soon as its attempt is accepted.
      dbWorkerPort.postMessage(currentResponse);
      await testWaitForWorkerMessage();
      assertEqual(errors, [{ type: "Error", error }]);
      assertLength(dbInputs, 2);
      const replacement = { dbInputs, dbWorkerPort };
      await respondToSyncRound(replacement, createWebSocket);
      createWebSocket.message(transport.url, relayResponse());
      await testWaitForWorkerMessage();
      await respondToApplySync(replacement, false, {
        ok: true,
        value: { type: "Converged" },
      });
      assertTrue(routeOf(latest()).complete);
      assertSame(routeOf(latest()).error, null);
      assertEqual(errors, [{ type: "Error", error }]);
    });

    it("keeps an aborted sibling apply incomplete without scheduling recovery", async () => {
      const createWebSocket = testCreateWebSocket();
      await using setup = await setupSharedWorker({ createWebSocket });
      using disposer = new DisposableStack();
      const { latest } = setupSyncStates(setup, disposer);
      const secondName = Name.orThrow("second");
      const first = await setup.createEvolu();
      const second = await setup.createEvolu({ tenantName: secondName });
      const transport = createOwnerWebSocketTransport({
        url: "wss://aborted-sibling.example",
        ownerId: testAppOwner.id,
      });
      const registration = {
        owner: { owner: testAppOwner, transports: [transport] },
        action: "add",
      } as const;
      for (const instance of [first, second]) {
        instance.evoluChannel.port2.postMessage({
          type: "UseOwner",
          actions: [registration],
        });
        await testWaitForWorkerMessage();
        await respondToSyncRound(instance, createWebSocket);
      }
      for (const _ of [first, second]) {
        createWebSocket.message(transport.url, relayResponse());
        await testWaitForWorkerMessage();
        for (const instance of [first, second]) {
          await respondToApplySync(instance, false, {
            ok: true,
            value: { type: "Converged" },
          });
        }
      }
      assertTrue(routeOf(latest()).complete);
      const completeAt = routeOf(latest()).completeAt;

      await postMutation(second, setup.run);
      createWebSocket.message(transport.url, relayResponse());
      await testWaitForWorkerMessage();
      await respondToApplySync(second, false, {
        ok: true,
        value: { type: "Converged" },
      });
      await respondToApplySync(first, false, {
        ok: false,
        error: {
          type: "AbortError",
          reason: {
            type: "PanicAbortReason",
            defect: new Error("SQLite write failed"),
          },
        },
      });
      // The upload acknowledgement following the aborted local copy must
      // leave the receiving tenant incomplete, while the sender completes.
      const inputCount = first.dbInputs.length;
      await respondToApplySync(first, false, {
        ok: true,
        value: { type: "Converged" },
      });
      assertFalse(routeOf(latest()).complete);
      assertSame(routeOf(latest()).completeAt, completeAt);
      assertSame(routeOf(latest()).error, null);
      assertTrue(routeOf(latest(), secondName).complete);
      await testWaitForWorkerMessage();
      assertLength(first.dbInputs, inputCount);
    });

    const setupSiblingContinuation = async (
      setup: SharedWorkerSetup,
      createWebSocket: TestCreateWebSocket,
    ) => {
      const siblingName = Name.orThrow("continuation-sibling");
      const source = await setup.createEvolu();
      const sibling = await setup.createEvolu({ tenantName: siblingName });
      const transports = [
        createOwnerWebSocketTransport({
          url: "wss://continuation-a.example",
          ownerId: testAppOwner.id,
        }),
        createOwnerWebSocketTransport({
          url: "wss://continuation-b.example",
          ownerId: testAppOwner.id,
        }),
      ] as const;
      for (const instance of [source, sibling]) {
        instance.evoluChannel.port2.postMessage({
          type: "UseOwner",
          actions: [
            { action: "add", owner: { owner: testAppOwner, transports } },
          ],
        });
        await testWaitForWorkerMessage();
        await respondToSyncRound(instance, createWebSocket);
        await respondToSyncRound(instance, createWebSocket);
      }
      for (const transport of transports) {
        for (const _ of [source, sibling]) {
          createWebSocket.message(transport.url, relayResponse());
          await testWaitForWorkerMessage();
          for (const instance of [source, sibling]) {
            await respondToApplySync(instance, false, {
              ok: true,
              value: { type: "Converged" },
            });
          }
        }
      }

      createWebSocket.message(transports[0].url, relayResponse());
      await testWaitForWorkerMessage();
      await respondToApplySync(source, false, {
        ok: true,
        value: {
          type: "Response",
          message: createProtocolMessageForUnsubscribe(testAppOwner.id),
          broadcast: createProtocolMessageBuffer(testAppOwner.id, {
            messageType: MessageType.Broadcast,
          }).unwrap(),
        },
      });
      await respondToApplySync(sibling, false, {
        ok: true,
        value: { type: "Converged" },
      });
      assertEqual(
        createWebSocket.sentMessages.splice(0).map(({ url }) => url),
        [transports[0].url],
      );
      return { source, sibling, siblingName, transports };
    };

    it("keeps every route incomplete after aborting a sibling continuation copy", async () => {
      const createWebSocket = testCreateWebSocket();
      await using setup = await setupSharedWorker({ createWebSocket });
      using disposer = new DisposableStack();
      const { latest } = setupSyncStates(setup, disposer);
      const { source, sibling, siblingName, transports } =
        await setupSiblingContinuation(setup, createWebSocket);
      const completeAt = transports.map(
        (_, index) => routeOf(latest(), siblingName, index).completeAt,
      );

      // The original upload is acknowledged while its local copy is pending.
      createWebSocket.message(transports[0].url, relayResponse());
      await testWaitForWorkerMessage();
      await respondToApplySync(source, false, {
        ok: true,
        value: { type: "Converged" },
      });
      await respondToApplySync(sibling, false, {
        ok: false,
        error: { type: "AbortError", reason: { type: "Stop" } },
      });
      const inputCount = sibling.dbInputs.length;
      await respondToApplySync(sibling, false, {
        ok: true,
        value: { type: "Converged" },
      });

      for (const index of [0, 1]) {
        const route = routeOf(latest(), siblingName, index);
        assertFalse(route.complete);
        assertSame(route.completeAt, completeAt[index]);
        assertSame(route.error, null);
        assertTrue(routeOf(latest(), testName, index).complete);
      }
      await testWaitForWorkerMessage();
      assertLength(sibling.dbInputs, inputCount);
      assertEqual(createWebSocket.sentMessages, []);
    });

    it("counts requests per owner and socket across databases", async () => {
      const createWebSocket = testCreateWebSocket();
      await using setup = await setupSharedWorker({ createWebSocket });
      using disposer = new DisposableStack();
      const { latest } = setupSyncStates(setup, disposer);
      const secondName = Name.orThrow("second");
      const first = await setup.createEvolu();
      const second = await setup.createEvolu({ tenantName: secondName });
      const transport = createOwnerWebSocketTransport({
        url: "wss://shared.example",
        ownerId: testAppOwner.id,
      });
      const registration = {
        owner: { owner: testAppOwner, transports: [transport] },
        action: "add",
      } as const;

      first.evoluChannel.port2.postMessage({
        type: "UseOwner",
        actions: [registration],
      });
      await testWaitForWorkerMessage();
      await respondToSyncRound(first, createWebSocket);
      second.evoluChannel.port2.postMessage({
        type: "UseOwner",
        actions: [registration],
      });
      await testWaitForWorkerMessage();
      await respondToSyncRound(second, createWebSocket);

      // One answer applies to both databases but leaves one request open.
      createWebSocket.message(transport.url, relayResponse());
      await testWaitForWorkerMessage();
      await respondToApplySync(first, false, {
        ok: true,
        value: { type: "Converged" },
      });
      await respondToApplySync(second, false, {
        ok: true,
        value: { type: "Converged" },
      });
      assertFalse(routeOf(latest()).complete);
      assertFalse(routeOf(latest(), secondName).complete);

      createWebSocket.message(transport.url, relayResponse());
      await testWaitForWorkerMessage();
      await respondToApplySync(first, false, {
        ok: true,
        value: { type: "Converged" },
      });
      assertFalse(routeOf(latest(), secondName).complete);
      await respondToApplySync(second, false, {
        ok: true,
        value: { type: "Converged" },
      });
      assertTrue(routeOf(latest()).complete);
      assertTrue(routeOf(latest(), secondName).complete);
    });

    it("keeps routes incomplete until a sibling's continuation copy reconciles the other relays", async () => {
      const createWebSocket = testCreateWebSocket();
      await using setup = await setupSharedWorker({ createWebSocket });
      using disposer = new DisposableStack();
      const { latest } = setupSyncStates(setup, disposer);
      const siblingName = Name.orThrow("local-copy-sibling");
      const source = await setup.createEvolu();
      const sibling = await setup.createEvolu({ tenantName: siblingName });
      // A transport URL carries the owner ID; a transport is labelled without it.
      const labelA = "wss://local-copy-a.example";
      const labelB = "wss://local-copy-b.example";
      const transports = [
        createOwnerWebSocketTransport({
          url: labelA,
          ownerId: testAppOwner.id,
        }),
        createOwnerWebSocketTransport({
          url: labelB,
          ownerId: testAppOwner.id,
        }),
      ] as const;
      /** The route of `tenantName` through the transport labelled `label`. */
      const routeAt = (label: string, tenantName: Name): SyncRoute => {
        const state = latest();
        const transport = state.transports.find(
          (candidate) => candidate.label === label,
        );
        assertNotUndefined(transport);
        const tenant = state.tenants.find(({ name }) => name === tenantName);
        assertNotUndefined(tenant);
        const owner = tenant.owners.find(
          ({ ownerId }) => ownerId === testAppOwner.id,
        );
        assertNotUndefined(owner);
        const route = owner.routes.find(
          ({ transportId }) => transportId === transport.id,
        );
        assertNotUndefined(route);
        return route;
      };

      for (const instance of [source, sibling]) {
        instance.evoluChannel.port2.postMessage({
          type: "UseOwner",
          actions: [
            { action: "add", owner: { owner: testAppOwner, transports } },
          ],
        });
        await testWaitForWorkerMessage();
        await respondToSyncRound(instance, createWebSocket);
        await respondToSyncRound(instance, createWebSocket);
      }
      for (const transport of transports) {
        for (const _ of [source, sibling]) {
          createWebSocket.message(transport.url, relayResponse());
          await testWaitForWorkerMessage();
          for (const instance of [source, sibling]) {
            await respondToApplySync(instance, false, {
              ok: true,
              value: { type: "Converged" },
            });
          }
        }
      }
      for (const label of [labelA, labelB]) {
        for (const name of [testName, siblingName]) {
          assertTrue(routeAt(label, name).complete);
        }
      }
      const siblingCompleteAt = routeAt(labelB, siblingName).completeAt;

      // A continuation from relay A copies its uploaded messages to the
      // sibling. The copy holds every route, and only the continuation
      // upload counts a request, and only on A.
      const continuation = createProtocolMessageForUnsubscribe(testAppOwner.id);
      const broadcast = createProtocolMessageBuffer(testAppOwner.id, {
        messageType: MessageType.Broadcast,
      }).unwrap();
      createWebSocket.message(
        transports[0].url,
        protocolMessageToArrayBuffer(continuation),
      );
      await testWaitForWorkerMessage();
      await respondToApplySync(source, false, {
        ok: true,
        value: { type: "Response", message: continuation, broadcast },
      });
      assertEqual(
        createWebSocket.sentMessages.splice(0).map(({ url }) => url),
        [transports[0].url],
      );
      await respondToApplySync(sibling, false, {
        ok: true,
        value: { type: "Converged" },
      });

      // Relay B neither sent nor was sent anything, so only the queued local
      // copy can hold the sibling's route through B.
      assertFalse(routeAt(labelB, siblingName).complete);
      assertSame(routeAt(labelB, siblingName).completeAt, siblingCompleteAt);
      assertSame(routeAt(labelB, siblingName).error, null);
      assertTrue(routeAt(labelB, testName).complete);

      // The copy was uploaded only through A. Storing it requires a new round
      // through B, and local delivery does not count as a frame received on A.
      const lastReceivedAt = routeAt(labelA, siblingName).lastReceivedAt;
      setup.run.deps.time.advance("1s");
      await respondToApplySync(sibling, true, {
        ok: true,
        value: { type: "Broadcast" },
      });
      assertFalse(routeAt(labelB, siblingName).complete);
      assertSame(routeAt(labelB, siblingName).completeAt, siblingCompleteAt);
      assertSame(routeAt(labelA, siblingName).lastReceivedAt, lastReceivedAt);
      assertEqual(await respondToSyncRound(sibling, createWebSocket), [
        transports[1].url,
      ]);
      assertFalse(routeAt(labelB, siblingName).complete);
      createWebSocket.message(transports[1].url, relayResponse());
      await testWaitForWorkerMessage();
      for (const instance of [source, sibling]) {
        await respondToApplySync(instance, false, {
          ok: true,
          value: { type: "Converged" },
        });
      }
      assertTrue(routeAt(labelB, siblingName).complete);
    });

    for (const fractional of [false, true]) {
      it(`reconnects a socket whose request stays unanswered with ${fractional ? "a fractional" : "an integer"} clock`, async () => {
        const createWebSocket = testCreateWebSocket({ isOpen: false });
        const baseTime = testCreateTime();
        let fractionalOffset = 0;
        const time: TestTime = {
          ...baseTime,
          performance: {
            ...baseTime.performance,
            now: () =>
              (baseTime.performance.now() +
                fractionalOffset) as PerformanceTime,
          },
        };
        await using setup = await setupSharedWorker({ createWebSocket, time });
        using disposer = new DisposableStack();
        const { latest } = setupSyncStates(setup, disposer);
        const instance = await setup.createEvolu();
        const transport = createOwnerWebSocketTransport({
          url: "wss://silent.example",
          ownerId: testAppOwner.id,
        });

        instance.evoluChannel.port2.postMessage({
          type: "UseOwner",
          actions: [
            {
              owner: { owner: testAppOwner, transports: [transport] },
              action: "add",
            },
          ],
        });
        await testWaitForWorkerMessage();
        createWebSocket.open(transport.url);
        await testWaitForWorkerMessage();
        await respondToSyncRound(instance, createWebSocket);
        await postMutation(instance, setup.run);

        // One of two requests is answered before the timeout, which re-arms it.
        time.advance(Millis.orThrow(85_000));
        fractionalOffset = fractional ? 0.125 : 0;
        createWebSocket.message(transport.url, relayResponse());
        await testWaitForWorkerMessage();
        await respondToApplySync(instance, false, {
          ok: true,
          value: { type: "Converged" },
        });
        // Fractional readings leave 84,999.25 ms when the timer fires. Rounding
        // upward schedules 85,000 ms, preserving the full silence interval.
        fractionalOffset = fractional ? 0.875 : 0;
        time.advance("5s");
        await testWaitForWorkerMessage();
        assertEqual(createWebSocket.reconnectedUrls, []);
        assertSame(latest().transports[0].closedAt, null);

        // Nothing arrives for a whole timeout: the socket reconnects.
        time.advance(Millis.orThrow(84_999));
        await testWaitForWorkerMessage();
        assertEqual(createWebSocket.reconnectedUrls, []);
        time.advance("1ms");
        await testWaitForWorkerMessage();
        assertEqual(createWebSocket.createdUrls, [transport.url]);
        assertEqual(createWebSocket.reconnectedUrls, [transport.url]);
        assertSame(latest().transports[0].readyState, "connecting");
        assertEqual(latest().transports[0].closedAt, time.now());

        // The reopen forgets the unanswered request and starts a round.
        createWebSocket.open(transport.url);
        await testWaitForWorkerMessage();
        await respondToSyncRound(instance, createWebSocket);
        createWebSocket.message(transport.url, relayResponse());
        await testWaitForWorkerMessage();
        await respondToApplySync(instance, false, {
          ok: true,
          value: { type: "Converged" },
        });
        assertTrue(routeOf(latest()).complete);
      });
    }

    it("measures request silence on a clock a system adjustment cannot move", async () => {
      const createWebSocket = testCreateWebSocket({ isOpen: false });
      const baseTime = testCreateTime();
      let offset = 0;
      // Move only the wall clock, leaving performance.now() monotonic.
      const now = ((type?: "DateIso") => {
        const millis = Millis.orThrow(baseTime.now() + offset);
        return type === "DateIso" ? millisToDateIso(millis) : millis;
      }) as TestTime["now"];
      const time = { ...baseTime, now };
      await using setup = await setupSharedWorker({ createWebSocket, time });
      const instance = await setup.createEvolu();
      const transport = createOwnerWebSocketTransport({
        url: "wss://silent.example",
        ownerId: testAppOwner.id,
      });

      instance.evoluChannel.port2.postMessage({
        type: "UseOwner",
        actions: [
          {
            owner: { owner: testAppOwner, transports: [transport] },
            action: "add",
          },
        ],
      });
      await testWaitForWorkerMessage();
      createWebSocket.open(transport.url);
      await testWaitForWorkerMessage();
      await respondToSyncRound(instance, createWebSocket);
      await postMutation(instance, setup.run);

      // The request is answered 85 seconds in, which re-arms the timeout.
      time.advance(Millis.orThrow(85_000));
      createWebSocket.message(transport.url, relayResponse());
      await testWaitForWorkerMessage();
      await respondToApplySync(instance, false, {
        ok: true,
        value: { type: "Converged" },
      });

      // The system clock jumps an hour while five seconds actually pass, so
      // the timeout must see five seconds of silence and re-arm.
      offset += durationToMillis("1h");
      time.advance("5s");
      await testWaitForWorkerMessage();
      assertEqual(createWebSocket.reconnectedUrls, []);

      // The timeout still fires on real silence.
      time.advance(Millis.orThrow(85_000));
      await testWaitForWorkerMessage();
      assertEqual(createWebSocket.reconnectedUrls, [transport.url]);
    });

    it("reconnects a socket whose request for one owner stays unanswered while another owner's frames arrive", async () => {
      const createWebSocket = testCreateWebSocket({ isOpen: false });
      await using setup = await setupSharedWorker({ createWebSocket });
      using disposer = new DisposableStack();
      const { latest } = setupSyncStates(setup, disposer);
      const instance = await setup.createEvolu();
      const { time } = setup.run.deps;
      const transport = createOwnerWebSocketTransport({
        url: "wss://busy.example",
        ownerId: testAppOwner.id,
      });
      // A frame for an owner this database does not use, as a sibling
      // database's owner sharing the socket produces.
      const otherOwnerResponse = (): ArrayBuffer =>
        protocolMessageToArrayBuffer(
          createProtocolMessageBuffer(testAppOwner2.id, {
            messageType: MessageType.Response,
            errorCode: ProtocolErrorCode.NoError,
          }).unwrap(),
        );

      instance.evoluChannel.port2.postMessage({
        type: "UseOwner",
        actions: [
          {
            owner: { owner: testAppOwner, transports: [transport] },
            action: "add",
          },
        ],
      });
      await testWaitForWorkerMessage();
      createWebSocket.open(transport.url);
      await testWaitForWorkerMessage();
      await respondToSyncRound(instance, createWebSocket);

      // The other owner's frames prove the socket alive, not that the request
      // was received, so they do not defer the timeout.
      time.advance(Millis.orThrow(85_000));
      createWebSocket.message(transport.url, otherOwnerResponse());
      await testWaitForWorkerMessage();
      time.advance("4s");
      createWebSocket.message(transport.url, otherOwnerResponse());
      await testWaitForWorkerMessage();
      assertEqual(createWebSocket.reconnectedUrls, []);

      time.advance("1s");
      await testWaitForWorkerMessage();
      assertEqual(createWebSocket.reconnectedUrls, [transport.url]);
      assertSame(latest().transports[0].readyState, "connecting");
    });

    it("stops timing a request when its socket closes", async () => {
      const createWebSocket = testCreateWebSocket({ isOpen: false });
      await using setup = await setupSharedWorker({ createWebSocket });
      using disposer = new DisposableStack();
      const { latest } = setupSyncStates(setup, disposer);
      const instance = await setup.createEvolu();
      const { time } = setup.run.deps;
      const transport = createOwnerWebSocketTransport({
        url: "wss://closing.example",
        ownerId: testAppOwner.id,
      });
      instance.evoluChannel.port2.postMessage({
        type: "UseOwner",
        actions: [
          {
            owner: { owner: testAppOwner, transports: [transport] },
            action: "add",
          },
        ],
      });
      await testWaitForWorkerMessage();
      createWebSocket.open(transport.url);
      await testWaitForWorkerMessage();
      await respondToSyncRound(instance, createWebSocket);

      // The request dies with its connection, and the WebSocket's own retry
      // replaces a closed one, so the timeout must not fire or restamp it.
      time.advance("10s");
      createWebSocket.close(transport.url);
      await testWaitForWorkerMessage();
      const { closedAt } = latest().transports[0];
      assertEqual(closedAt, time.now());
      time.advance("2m");
      await testWaitForWorkerMessage();
      assertEqual(createWebSocket.reconnectedUrls, []);
      assertSame(latest().transports[0].closedAt, closedAt);
    });

    it("leaves a complete route incomplete when its socket closes", async () => {
      const createWebSocket = testCreateWebSocket();
      await using setup = await setupSharedWorker({ createWebSocket });
      using disposer = new DisposableStack();
      const { latest } = setupSyncStates(setup, disposer);
      const instance = await setup.createEvolu();
      const transport = createOwnerWebSocketTransport({
        url: "wss://closing-complete.example",
        ownerId: testAppOwner.id,
      });
      instance.evoluChannel.port2.postMessage({
        type: "UseOwner",
        actions: [
          {
            owner: { owner: testAppOwner, transports: [transport] },
            action: "add",
          },
        ],
      });
      await testWaitForWorkerMessage();
      await respondToSyncRound(instance, createWebSocket);
      createWebSocket.message(transport.url, relayResponse());
      await testWaitForWorkerMessage();
      await respondToApplySync(instance, false, {
        ok: true,
        value: { type: "Converged" },
      });
      assertTrue(routeOf(latest()).complete);

      createWebSocket.close(transport.url);
      await testWaitForWorkerMessage();
      assertSame(latest().transports[0].readyState, "closed");
      assertFalse(routeOf(latest()).complete);
      assertSame(syncStateToOwnerSyncStates(latest())[0]?.status, "offline");
    });

    /**
     * Opens the socket and lets the app owner's round time out once per
     * timeout, asserting it reconnects exactly when each one expires.
     */
    const timeOutRounds = async (
      {
        setup,
        instance,
        createWebSocket,
        url,
      }: {
        setup: SharedWorkerSetup;
        instance: TestEvoluInstance;
        createWebSocket: TestCreateWebSocket;
        url: string;
      },
      timeoutsInSeconds: ReadonlyArray<number>,
    ): Promise<void> => {
      const { time } = setup.run.deps;
      for (const seconds of timeoutsInSeconds) {
        const reconnectCount = createWebSocket.reconnectedUrls.length;
        createWebSocket.open(url);
        await testWaitForWorkerMessage();
        await respondToSyncRound(instance, createWebSocket);
        time.advance(Millis.orThrow(seconds * 1000 - 1));
        await testWaitForWorkerMessage();
        assertLength(createWebSocket.reconnectedUrls, reconnectCount);
        time.advance("1ms");
        await testWaitForWorkerMessage();
        assertLength(createWebSocket.reconnectedUrls, reconnectCount + 1);
      }
    };

    it("doubles a transport's timeout after each timeout, up to 24 minutes", async () => {
      const createWebSocket = testCreateWebSocket({ isOpen: false });
      await using setup = await setupSharedWorker({ createWebSocket });
      const instance = await setup.createEvolu();
      const transport = createOwnerWebSocketTransport({
        url: "wss://slow.example",
        ownerId: testAppOwner.id,
      });
      instance.evoluChannel.port2.postMessage({
        type: "UseOwner",
        actions: [
          {
            owner: { owner: testAppOwner, transports: [transport] },
            action: "add",
          },
        ],
      });
      await testWaitForWorkerMessage();

      // A link too slow for the reply: every reopened connection times out.
      await timeOutRounds(
        { setup, instance, createWebSocket, url: transport.url },
        [90, 180, 360, 720, 1440, 1440],
      );
    });

    it("keeps a grown timeout until the database is reconciled with the relay", async () => {
      const createWebSocket = testCreateWebSocket({ isOpen: false });
      await using setup = await setupSharedWorker({ createWebSocket });
      const instance = await setup.createEvolu();
      const { time } = setup.run.deps;
      const transport = createOwnerWebSocketTransport({
        url: "wss://recovering.example",
        ownerId: testAppOwner.id,
      });
      instance.evoluChannel.port2.postMessage({
        type: "UseOwner",
        actions: [
          {
            owner: { owner: testAppOwner, transports: [transport] },
            action: "add",
          },
        ],
      });
      await testWaitForWorkerMessage();
      const context = { setup, instance, createWebSocket, url: transport.url };
      await timeOutRounds(context, [90]);

      // A recovery on a slow link starts with a small reply that arrives
      // quickly. Its chain continues with a large frame, which still gets the
      // grown timeout, whichever direction it goes.
      createWebSocket.open(transport.url);
      await testWaitForWorkerMessage();
      await respondToSyncRound(instance, createWebSocket);
      time.advance("5s");
      createWebSocket.message(transport.url, relayResponse());
      await testWaitForWorkerMessage();
      await respondToApplySync(instance, false, {
        ok: true,
        value: {
          type: "Response",
          message: createProtocolMessageForUnsubscribe(testAppOwner.id),
        },
      });
      assertEqual(
        createWebSocket.sentMessages.splice(0).map(({ url }) => url),
        [transport.url],
      );
      time.advance(Millis.orThrow(179_999));
      await testWaitForWorkerMessage();
      assertLength(createWebSocket.reconnectedUrls, 1);
      time.advance("1ms");
      await testWaitForWorkerMessage();
      assertLength(createWebSocket.reconnectedUrls, 2);

      // Once the database is reconciled with the relay, as it is within a
      // round trip of reopening on a fast link, the base timeout applies again.
      createWebSocket.open(transport.url);
      await testWaitForWorkerMessage();
      await respondToSyncRound(instance, createWebSocket);
      time.advance("5s");
      createWebSocket.message(transport.url, relayResponse());
      await testWaitForWorkerMessage();
      await respondToApplySync(instance, false, {
        ok: true,
        value: { type: "Converged" },
      });
      instance.evoluChannel.port2.postMessage({
        type: "UseOwner",
        actions: [{ ownerId: testAppOwner.id, action: "sync" }],
      });
      await testWaitForWorkerMessage();
      await respondToSyncRound(instance, createWebSocket);
      time.advance(Millis.orThrow(89_999));
      await testWaitForWorkerMessage();
      assertLength(createWebSocket.reconnectedUrls, 2);
      time.advance("1ms");
      await testWaitForWorkerMessage();
      assertLength(createWebSocket.reconnectedUrls, 3);
    });

    it("keeps a grown timeout while another database using the owner reconciles", async () => {
      const createWebSocket = testCreateWebSocket({ isOpen: false });
      await using setup = await setupSharedWorker({ createWebSocket });
      using disposer = new DisposableStack();
      const { latest } = setupSyncStates(setup, disposer);
      const { time } = setup.run.deps;
      const first = await setup.createEvolu();
      const second = await setup.createEvolu({
        tenantName: Name.orThrow("second"),
      });
      const transport = createOwnerWebSocketTransport({
        url: "wss://shared-owner.example",
        ownerId: testAppOwner.id,
      });
      for (const instance of [first, second]) {
        instance.evoluChannel.port2.postMessage({
          type: "UseOwner",
          actions: [
            {
              owner: { owner: testAppOwner, transports: [transport] },
              action: "add",
            },
          ],
        });
        await testWaitForWorkerMessage();
      }

      // Both rounds go unanswered, which grows the transport's timeout.
      createWebSocket.open(transport.url);
      await testWaitForWorkerMessage();
      for (const instance of [first, second])
        await respondToSyncRound(instance, createWebSocket);
      time.advance(Millis.orThrow(90_000));
      await testWaitForWorkerMessage();
      assertEqual(createWebSocket.reconnectedUrls, [transport.url]);

      // After the reopen, each database applies both replies. With nothing
      // outstanding, the first database is reconciled while the second still
      // continues, and its next frame still gets the grown timeout.
      createWebSocket.open(transport.url);
      await testWaitForWorkerMessage();
      for (const instance of [first, second])
        await respondToSyncRound(instance, createWebSocket);
      createWebSocket.message(transport.url, relayResponse());
      await testWaitForWorkerMessage();
      for (const instance of [first, second])
        await respondToApplySync(instance, false, {
          ok: true,
          value: { type: "Converged" },
        });
      createWebSocket.message(transport.url, relayResponse());
      await testWaitForWorkerMessage();
      await respondToApplySync(first, false, {
        ok: true,
        value: { type: "Converged" },
      });
      assertTrue(routeOf(latest()).complete);
      await respondToApplySync(second, false, {
        ok: true,
        value: {
          type: "Response",
          message: createProtocolMessageForUnsubscribe(testAppOwner.id),
        },
      });
      assertEqual(
        createWebSocket.sentMessages.splice(0).map(({ url }) => url),
        [transport.url],
      );
      time.advance(Millis.orThrow(179_999));
      await testWaitForWorkerMessage();
      assertLength(createWebSocket.reconnectedUrls, 1);
      time.advance("1ms");
      await testWaitForWorkerMessage();
      assertLength(createWebSocket.reconnectedUrls, 2);
    });

    it("restores the base timeout when the last unreconciled database stops using the owner", async () => {
      const createWebSocket = testCreateWebSocket({ isOpen: false });
      await using setup = await setupSharedWorker({ createWebSocket });
      using disposer = new DisposableStack();
      const { latest } = setupSyncStates(setup, disposer);
      const { time } = setup.run.deps;
      const first = await setup.createEvolu();
      const second = await setup.createEvolu({
        tenantName: Name.orThrow("second"),
      });
      const transport = createOwnerWebSocketTransport({
        url: "wss://leaving-owner.example",
        ownerId: testAppOwner.id,
      });
      const syncOwner: SyncOwner = {
        owner: testAppOwner,
        transports: [transport],
      };
      for (const instance of [first, second]) {
        instance.evoluChannel.port2.postMessage({
          type: "UseOwner",
          actions: [{ owner: syncOwner, action: "add" }],
        });
        await testWaitForWorkerMessage();
      }
      createWebSocket.open(transport.url);
      await testWaitForWorkerMessage();
      for (const instance of [first, second])
        await respondToSyncRound(instance, createWebSocket);
      time.advance(Millis.orThrow(90_000));
      await testWaitForWorkerMessage();
      assertEqual(createWebSocket.reconnectedUrls, [transport.url]);

      // After the reopen, the first database is reconciled while the second
      // still applies the last reply.
      createWebSocket.open(transport.url);
      await testWaitForWorkerMessage();
      for (const instance of [first, second])
        await respondToSyncRound(instance, createWebSocket);
      for (const _ of [first, second]) {
        createWebSocket.message(transport.url, relayResponse());
        await testWaitForWorkerMessage();
        await respondToApplySync(first, false, {
          ok: true,
          value: { type: "Converged" },
        });
      }
      assertTrue(routeOf(latest()).complete);
      assertFalse(routeOf(latest(), Name.orThrow("second")).complete);

      // The second database stops using the owner without completing, which
      // leaves no incomplete route, so the base timeout applies again.
      second.evoluChannel.port2.postMessage({
        type: "UseOwner",
        actions: [{ owner: syncOwner, action: "remove" }],
      });
      await testWaitForWorkerMessage();
      first.evoluChannel.port2.postMessage({
        type: "UseOwner",
        actions: [{ ownerId: testAppOwner.id, action: "sync" }],
      });
      await testWaitForWorkerMessage();
      await respondToSyncRound(first, createWebSocket);
      time.advance(Millis.orThrow(89_999));
      await testWaitForWorkerMessage();
      assertLength(createWebSocket.reconnectedUrls, 1);
      time.advance("1ms");
      await testWaitForWorkerMessage();
      assertLength(createWebSocket.reconnectedUrls, 2);
    });

    it("keeps a grown timeout while its request is outstanding across a replaced registration", async () => {
      const createWebSocket = testCreateWebSocket({ isOpen: false });
      await using setup = await setupSharedWorker({ createWebSocket });
      const instance = await setup.createEvolu();
      const { time } = setup.run.deps;
      const [primary, backup] = ["primary", "backup"].map((name) =>
        createOwnerWebSocketTransport({
          url: `wss://${name}.example`,
          ownerId: testAppOwner.id,
        }),
      );
      assertNonNullable(primary);
      assertNonNullable(backup);
      const onPrimary: SyncOwner = {
        owner: testAppOwner,
        transports: [primary],
      };
      instance.evoluChannel.port2.postMessage({
        type: "UseOwner",
        actions: [{ owner: onPrimary, action: "add" }],
      });
      await testWaitForWorkerMessage();
      await timeOutRounds(
        { setup, instance, createWebSocket, url: primary.url },
        [90],
      );

      // The round's large reply is still arriving when the app adds a backup
      // relay, which replaces the registration within one message.
      createWebSocket.open(primary.url);
      await testWaitForWorkerMessage();
      await respondToSyncRound(instance, createWebSocket);
      time.advance("10s");
      instance.evoluChannel.port2.postMessage({
        type: "UseOwner",
        actions: [
          { owner: onPrimary, action: "remove" },
          {
            owner: { owner: testAppOwner, transports: [primary, backup] },
            action: "add",
          },
        ],
      });
      await testWaitForWorkerMessage();
      time.advance(Millis.orThrow(169_999));
      await testWaitForWorkerMessage();
      assertLength(createWebSocket.reconnectedUrls, 1);
      time.advance("1ms");
      await testWaitForWorkerMessage();
      assertEqual(createWebSocket.reconnectedUrls, [primary.url, primary.url]);

      // The replacement did not restore the base timeout, so the next one
      // doubles the grown timeout.
      await timeOutRounds(
        { setup, instance, createWebSocket, url: primary.url },
        [360],
      );
    });

    it("leaves every route through a replaced socket incomplete", async () => {
      const createWebSocket = testCreateWebSocket();
      await using setup = await setupSharedWorker({ createWebSocket });
      using disposer = new DisposableStack();
      const { latest } = setupSyncStates(setup, disposer);
      const instance = await setup.createEvolu();
      const { time } = setup.run.deps;
      // Both owners share one socket.
      const transport = {
        type: "WebSocket",
        url: "wss://replaced-socket.example",
      } as const;
      for (const owner of [testAppOwner2, testAppOwner]) {
        instance.evoluChannel.port2.postMessage({
          type: "UseOwner",
          actions: [
            { owner: { owner, transports: [transport] }, action: "add" },
          ],
        });
        await testWaitForWorkerMessage();
        await respondToSyncRound(instance, createWebSocket, owner);
        createWebSocket.message(transport.url, relayResponse(owner.id));
        await testWaitForWorkerMessage();
        await respondToApplySync(instance, false, {
          ok: true,
          value: { type: "Converged" },
        });
      }
      assertTrue(routeOf(latest(), testName, 0, testAppOwner2.id).complete);

      // The app owner's round goes unanswered, so the socket is replaced, and
      // the other owner's route through it is no longer reconciled.
      instance.evoluChannel.port2.postMessage({
        type: "UseOwner",
        actions: [{ ownerId: testAppOwner.id, action: "sync" }],
      });
      await testWaitForWorkerMessage();
      await respondToSyncRound(instance, createWebSocket);
      time.advance(Millis.orThrow(90_000));
      await testWaitForWorkerMessage();
      assertEqual(createWebSocket.reconnectedUrls, [transport.url]);
      assertFalse(routeOf(latest(), testName, 0, testAppOwner2.id).complete);
    });

    it("restores a relay's base timeout while another relay of the owner is down", async () => {
      const createWebSocket = testCreateWebSocket({ isOpen: false });
      await using setup = await setupSharedWorker({ createWebSocket });
      using disposer = new DisposableStack();
      const { latest } = setupSyncStates(setup, disposer);
      const instance = await setup.createEvolu();
      const { time } = setup.run.deps;
      const transports = ["up", "down"].map((name) =>
        createOwnerWebSocketTransport({
          url: `wss://${name}.example`,
          ownerId: testAppOwner.id,
        }),
      );
      assertNonEmptyArray(transports);
      const [up] = transports;
      instance.evoluChannel.port2.postMessage({
        type: "UseOwner",
        actions: [
          { owner: { owner: testAppOwner, transports }, action: "add" },
        ],
      });
      await testWaitForWorkerMessage();
      await timeOutRounds(
        { setup, instance, createWebSocket, url: up.url },
        [90],
      );

      // The relay that is up reconciles while the other stays down, so only
      // the other relay's route remains incomplete.
      createWebSocket.open(up.url);
      await testWaitForWorkerMessage();
      await respondToSyncRound(instance, createWebSocket);
      createWebSocket.message(up.url, relayResponse());
      await testWaitForWorkerMessage();
      await respondToApplySync(instance, false, {
        ok: true,
        value: { type: "Converged" },
      });
      assertTrue(routeOf(latest(), testName, 0).complete);
      assertFalse(routeOf(latest(), testName, 1).complete);

      instance.evoluChannel.port2.postMessage({
        type: "UseOwner",
        actions: [{ ownerId: testAppOwner.id, action: "sync" }],
      });
      await testWaitForWorkerMessage();
      assertEqual(await respondToSyncRound(instance, createWebSocket), [
        up.url,
      ]);
      time.advance(Millis.orThrow(89_999));
      await testWaitForWorkerMessage();
      assertLength(createWebSocket.reconnectedUrls, 1);
      time.advance("1ms");
      await testWaitForWorkerMessage();
      assertLength(createWebSocket.reconnectedUrls, 2);
    });

    it("keeps a transport's grown timeout while another owner on it waits after a failure", async () => {
      const createWebSocket = testCreateWebSocket({ isOpen: false });
      await using setup = await setupSharedWorker({ createWebSocket });
      using disposer = new DisposableStack();
      const { latest } = setupSyncStates(setup, disposer);
      const instance = await setup.createEvolu();
      const { time } = setup.run.deps;
      // Both owners share one socket.
      const transport = {
        type: "WebSocket",
        url: "wss://two-owners.example",
      } as const;
      instance.evoluChannel.port2.postMessage({
        type: "UseOwner",
        actions: [
          {
            owner: { owner: testAppOwner, transports: [transport] },
            action: "add",
          },
        ],
      });
      await testWaitForWorkerMessage();
      await timeOutRounds(
        { setup, instance, createWebSocket, url: transport.url },
        [90],
      );
      instance.evoluChannel.port2.postMessage({
        type: "UseOwner",
        actions: [
          {
            owner: { owner: testAppOwner2, transports: [transport] },
            action: "add",
          },
        ],
      });
      await testWaitForWorkerMessage();

      // The reopen's round fails for the other owner, whose route then waits
      // for an explicit request, and the app owner reconciles.
      createWebSocket.open(transport.url);
      await testWaitForWorkerMessage();
      const round = instance.dbInputs.at(-1);
      assertNotUndefined(round);
      instance.dbWorkerPort.postMessage({
        type: "OnQueuedResponse",
        attemptId: round.attemptId,
        response: {
          type: "ForSharedWorker",
          message: {
            type: "CreateSyncMessages",
            protocolMessagesByOwnerId: new Map([
              [
                testAppOwner.id,
                createProtocolMessageForUnsubscribe(testAppOwner.id),
              ],
            ]),
            failedOwnerIds: new Set([testAppOwner2.id]),
          },
        },
      });
      await testWaitForWorkerMessage();
      createWebSocket.message(transport.url, relayResponse());
      await testWaitForWorkerMessage();
      await respondToApplySync(instance, false, {
        ok: true,
        value: { type: "Converged" },
      });
      assertTrue(routeOf(latest()).complete);
      assertFalse(routeOf(latest(), testName, 0, testAppOwner2.id).complete);

      instance.evoluChannel.port2.postMessage({
        type: "UseOwner",
        actions: [{ ownerId: testAppOwner.id, action: "sync" }],
      });
      await testWaitForWorkerMessage();
      // The other owner's route through the transport is incomplete, so the
      // grown timeout remains, as for a sibling database whose route keeps
      // failing.
      await respondToSyncRound(instance, createWebSocket);
      time.advance(Millis.orThrow(179_999));
      await testWaitForWorkerMessage();
      assertLength(createWebSocket.reconnectedUrls, 1);
      time.advance("1ms");
      await testWaitForWorkerMessage();
      assertLength(createWebSocket.reconnectedUrls, 2);
    });

    it("restores the base timeout without waiting for a refused database", async () => {
      const createWebSocket = testCreateWebSocket({ isOpen: false });
      await using setup = await setupSharedWorker({ createWebSocket });
      using disposer = new DisposableStack();
      const { latest } = setupSyncStates(setup, disposer);
      const { time } = setup.run.deps;
      const refusedName = Name.orThrow("refused");
      const refused = await setup.createEvolu({
        tenantName: refusedName,
        releaseDbWorkerLeaderOnDispose: false,
      });
      const instance = await setup.createEvolu();
      const transport = createOwnerWebSocketTransport({
        url: "wss://refused-owner.example",
        ownerId: testAppOwner.id,
      });
      for (const { evoluChannel } of [refused, instance]) {
        evoluChannel.port2.postMessage({
          type: "UseOwner",
          actions: [
            {
              owner: { owner: testAppOwner, transports: [transport] },
              action: "add",
            },
          ],
        });
        await testWaitForWorkerMessage();
      }

      // A replacement leader refuses the database, which keeps its
      // registration and a route that never completes.
      await refused.releaseDbWorkerLeader();
      const init = await setupTabLeader(setup, disposer);
      using leaderPort = testCreateMessagePort<DbWorkerOutput, DbWorkerInput>(
        init.port,
      );
      leaderPort.postMessage({
        type: "LeaderRefused",
        name: refusedName,
        error: {
          type: "UnsupportedDbVersionError",
          storedVersion: PositiveInt.orThrow(2),
          supportedVersion: PositiveInt.orThrow(1),
        },
      });
      await testWaitForWorkerMessage();
      const context = { setup, instance, createWebSocket, url: transport.url };
      await timeOutRounds(context, [90]);

      // The refused database's route must not keep the grown timeout once
      // the other database is reconciled.
      createWebSocket.open(transport.url);
      await testWaitForWorkerMessage();
      await respondToSyncRound(instance, createWebSocket);
      createWebSocket.message(transport.url, relayResponse());
      await testWaitForWorkerMessage();
      await respondToApplySync(instance, false, {
        ok: true,
        value: { type: "Converged" },
      });
      assertTrue(routeOf(latest()).complete);
      assertFalse(routeOf(latest(), refusedName).complete);
      instance.evoluChannel.port2.postMessage({
        type: "UseOwner",
        actions: [{ ownerId: testAppOwner.id, action: "sync" }],
      });
      await testWaitForWorkerMessage();
      await respondToSyncRound(instance, createWebSocket);
      time.advance(Millis.orThrow(89_999));
      await testWaitForWorkerMessage();
      assertLength(createWebSocket.reconnectedUrls, 1);
      time.advance("1ms");
      await testWaitForWorkerMessage();
      assertLength(createWebSocket.reconnectedUrls, 2);
    });
    it("gives every owner on a shared socket the transport's grown timeout", async () => {
      const createWebSocket = testCreateWebSocket({ isOpen: false });
      await using setup = await setupSharedWorker({ createWebSocket });
      using disposer = new DisposableStack();
      const { latest } = setupSyncStates(setup, disposer);
      const instance = await setup.createEvolu();
      const { time } = setup.run.deps;
      // Both owners share one socket.
      const transport = {
        type: "WebSocket",
        url: "wss://shared-slow.example",
      } as const;
      for (const owner of [testAppOwner, testAppOwner2]) {
        instance.evoluChannel.port2.postMessage({
          type: "UseOwner",
          actions: [
            { owner: { owner, transports: [transport] }, action: "add" },
          ],
        });
        await testWaitForWorkerMessage();
      }
      const answerRound = async (): Promise<void> => {
        const round = instance.dbInputs.at(-1);
        assertNotUndefined(round);
        assertSame(round.request.type, "ForSharedWorker");
        assertSame(round.request.message.type, "CreateSyncMessages");
        instance.dbWorkerPort.postMessage({
          type: "OnQueuedResponse",
          attemptId: round.attemptId,
          response: {
            type: "ForSharedWorker",
            message: {
              type: "CreateSyncMessages",
              protocolMessagesByOwnerId: new Map(
                round.request.message.owners.map(({ id }) => [
                  id,
                  createProtocolMessageForUnsubscribe(id),
                ]),
              ),
              failedOwnerIds: new Set(),
            },
          },
        });
        await testWaitForWorkerMessage();
        createWebSocket.sentMessages.length = 0;
      };

      // Both requests go unanswered once, which doubles the timeout.
      createWebSocket.open(transport.url);
      await testWaitForWorkerMessage();
      await answerRound();
      time.advance(Millis.orThrow(90_000));
      await testWaitForWorkerMessage();
      assertLength(createWebSocket.reconnectedUrls, 1);

      // After the reopen, the second owner is reconciled while the app owner
      // continues with a large frame.
      createWebSocket.open(transport.url);
      await testWaitForWorkerMessage();
      await answerRound();
      createWebSocket.message(transport.url, relayResponse(testAppOwner2.id));
      await testWaitForWorkerMessage();
      await respondToApplySync(instance, false, {
        ok: true,
        value: { type: "Converged" },
      });
      assertTrue(routeOf(latest(), testName, 0, testAppOwner2.id).complete);
      createWebSocket.message(transport.url, relayResponse());
      await testWaitForWorkerMessage();
      await respondToApplySync(instance, false, {
        ok: true,
        value: {
          type: "Response",
          message: createProtocolMessageForUnsubscribe(testAppOwner.id),
        },
      });

      // The second owner's next reply waits behind that frame on the socket,
      // so its request gets the grown timeout too instead of abandoning the
      // frame after ninety seconds.
      time.advance("10s");
      instance.evoluChannel.port2.postMessage({
        type: "UseOwner",
        actions: [{ ownerId: testAppOwner2.id, action: "sync" }],
      });
      await testWaitForWorkerMessage();
      await answerRound();
      time.advance(Millis.orThrow(169_999));
      await testWaitForWorkerMessage();
      assertLength(createWebSocket.reconnectedUrls, 1);
      time.advance("1ms");
      await testWaitForWorkerMessage();
      assertLength(createWebSocket.reconnectedUrls, 2);
    });
    it("keeps repeated applies pending only for their owner and transport", async () => {
      const createWebSocket = testCreateWebSocket();
      await using setup = await setupSharedWorker({ createWebSocket });
      using disposer = new DisposableStack();
      const { latest } = setupSyncStates(setup, disposer);
      const instance = await setup.createEvolu();
      const owners = [testAppOwner, testAppOwner2];
      const transports = ["a", "b"].map((suffix) =>
        createOwnerWebSocketTransport({
          url: `wss://pending-applies-${suffix}.example`,
          ownerId: testAppOwner.id,
        }),
      );
      assertNonEmptyArray(transports);
      for (const owner of owners) {
        instance.evoluChannel.port2.postMessage({
          type: "UseOwner",
          actions: [{ action: "add", owner: { owner, transports } }],
        });
        await testWaitForWorkerMessage();
        for (const _transport of transports)
          await respondToSyncRound(instance, createWebSocket, owner);
        for (const transport of transports) {
          createWebSocket.message(transport.url, relayResponse(owner.id));
          await testWaitForWorkerMessage();
          await respondToApplySync(instance, false, {
            ok: true,
            value: { type: "Converged" },
          });
        }
      }
      const completeRoutes = (): Array<boolean> =>
        owners.flatMap((owner) =>
          transports.map(
            (_, index) => routeOf(latest(), testName, index, owner.id).complete,
          ),
        );
      assertEqual(completeRoutes(), [true, true, true, true]);

      for (const [owner, transport] of [
        [testAppOwner, transports[0]],
        [testAppOwner, transports[0]],
        [testAppOwner, transports[1]],
        [testAppOwner2, transports[0]],
      ] as const) {
        createWebSocket.message(
          transport.url,
          protocolMessageToArrayBuffer(
            createProtocolMessageBuffer(owner.id, {
              messageType: MessageType.Broadcast,
            }).unwrap(),
          ),
        );
      }
      await testWaitForWorkerMessage();
      assertEqual(completeRoutes(), [false, false, false, true]);

      // Removing one of two applies must retain that route's pending state.
      // Other routes become complete as soon as their own last apply leaves.
      for (const expected of [
        [false, false, false, true],
        [true, false, false, true],
        [true, true, false, true],
        [true, true, true, true],
      ]) {
        await respondToApplySync(instance, false, {
          ok: true,
          value: { type: "Broadcast" },
        });
        assertEqual(completeRoutes(), expected);
      }
    });

    it("keeps repeated writes pending without counting local-only owners in mixed batches", async () => {
      const createWebSocket = testCreateWebSocket();
      await using setup = await setupSharedWorker({ createWebSocket });
      using disposer = new DisposableStack();
      const { latest } = setupSyncStates(setup, disposer);
      const instance = await setup.createEvolu();
      const transport = createOwnerWebSocketTransport({
        url: "wss://pending-mixed-writes.example",
        ownerId: testAppOwner.id,
      });
      for (const owner of [testAppOwner, testAppOwner2]) {
        instance.evoluChannel.port2.postMessage({
          type: "UseOwner",
          actions: [
            {
              action: "add",
              owner: { owner, transports: [transport] },
            },
          ],
        });
        await testWaitForWorkerMessage();
        await respondToSyncRound(instance, createWebSocket, owner);
        createWebSocket.message(transport.url, relayResponse(owner.id));
        await testWaitForWorkerMessage();
        await respondToApplySync(instance, false, {
          ok: true,
          value: { type: "Converged" },
        });
      }
      const completeRoutes = (): Array<boolean> =>
        [testAppOwner, testAppOwner2].map(
          (owner) => routeOf(latest(), testName, 0, owner.id).complete,
        );
      assertEqual(completeRoutes(), [true, true]);

      for (const _batch of [0, 1]) {
        const changes = (
          [
            [testAppOwner.id, "todo"],
            [testAppOwner.id, "todo"],
            [testAppOwner.id, "_local"],
            [testAppOwner2.id, "_local"],
          ] as const
        ).map(([ownerId, table]) => ({
          ownerId,
          ...DbChange.orThrow({
            table,
            id: createId(setup.run.deps),
            values: { title: "Updated" },
            isInsert: false,
            isDelete: null,
          }),
        }));
        assertNonEmptyArray(changes);
        instance.evoluChannel.port2.postMessage({
          type: "Mutate",
          changes,
          onCompleteIds: [],
          subscribedQueries: new Set(),
        });
      }
      await testWaitForWorkerMessage();
      assertEqual(completeRoutes(), [false, true]);

      for (const batch of [0, 1]) {
        const input = instance.dbInputs.at(-1);
        assertNotUndefined(input);
        assertSame(input.request.type, "ForEvolu");
        assertSame(input.request.message.type, "Mutate");
        const messages = input.request.message.changes
          .filter((change) => change.table === "todo")
          .map(({ ownerId, ...change }, index) => {
            assertSame(ownerId, testAppOwner.id);
            return {
              timestamp: createTimestamp({
                millis: Millis.orThrow(batch * 2 + index + 1),
              }),
              change,
            };
          });
        assertNonEmptyArray(messages);
        // Each replicated change produces a CRDT message, while local-only
        // changes stay out of the upload.
        instance.dbWorkerPort.postMessage({
          type: "OnQueuedResponse",
          attemptId: input.attemptId,
          response: {
            type: "ForEvolu",
            id: instance.id,
            message: {
              type: "Mutate",
              clock: messages[messages.length - 1].timestamp,
              messagesByOwnerId: new Map([[testAppOwner.id, messages]]),
              rowsByQuery: new Map(),
            },
          },
        });
        await testWaitForWorkerMessage();
        assertLength(createWebSocket.sentMessages.splice(0), 1);
        assertEqual(completeRoutes(), [false, true]);
        createWebSocket.message(transport.url, relayResponse());
        await testWaitForWorkerMessage();
        assertEqual(completeRoutes(), [false, true]);
      }
      for (const expected of [
        [false, true],
        [true, true],
      ]) {
        await respondToApplySync(instance, false, {
          ok: true,
          value: { type: "Converged" },
        });
        assertEqual(completeRoutes(), expected);
      }
      assertEqual(createWebSocket.sentMessages, []);
    });

    it("publishes sync state without rereading queued mutation changes", async () => {
      const createWebSocket = testCreateWebSocket();
      await using setup = await setupSharedWorker({ createWebSocket });
      using disposer = new DisposableStack();
      const { states, latest } = setupSyncStates(setup, disposer);
      const instance = await setup.createEvolu();
      const transport = createOwnerWebSocketTransport({
        url: "wss://queued-mutation-snapshot.example",
        ownerId: testAppOwner.id,
      });
      instance.evoluChannel.port2.postMessage({
        type: "UseOwner",
        actions: [
          {
            action: "add",
            owner: { owner: testAppOwner, transports: [transport] },
          },
        ],
      });
      await testWaitForWorkerMessage();
      await respondToSyncRound(instance, createWebSocket);
      createWebSocket.message(transport.url, relayResponse());
      await testWaitForWorkerMessage();
      await respondToApplySync(instance, false, {
        ok: true,
        value: { type: "Converged" },
      });
      assertTrue(routeOf(latest()).complete);

      let changeReads = 0;
      const changeHandler: ProxyHandler<MutationChange> = {
        get: (target, key, receiver): unknown => {
          if (key === "ownerId" || key === "table") changeReads++;
          return Reflect.get(target, key, receiver);
        },
      };
      for (let index = 0; index < 32; index++) {
        // The in-memory test ports preserve identity, so this observes only
        // accesses to these changes without instrumenting shared prototypes.
        const change = new Proxy<MutationChange>(
          {
            ownerId: testAppOwner.id,
            ...DbChange.orThrow({
              table: "_local",
              id: createId(setup.run.deps),
              values: { title: "Local only" },
              isInsert: true,
              isDelete: null,
            }),
          },
          changeHandler,
        );
        instance.evoluChannel.port2.postMessage({
          type: "Mutate",
          changes: [change],
          onCompleteIds: [],
          subscribedQueries: new Set(),
        });
      }
      await testWaitForWorkerMessage();
      assertTrue(routeOf(latest()).complete);

      // A transport error publishes another snapshot without enqueuing or
      // completing database work. The pending queue must not be rescanned.
      changeReads = 0;
      const publishedCount = states.length;
      createWebSocket.error(transport.url, {
        type: "WebSocketConnectionError",
        event: new Event("error"),
      });
      await testWaitForWorkerMessage();
      assertTrue(states.length > publishedCount);
      assertSame(changeReads, 0);
      assertTrue(routeOf(latest()).complete);
    });

    it("publishes no sync state for a local-only mutation", async () => {
      const createWebSocket = testCreateWebSocket();
      await using setup = await setupSharedWorker({ createWebSocket });
      using disposer = new DisposableStack();
      const { states, latest } = setupSyncStates(setup, disposer);
      const instance = await setup.createEvolu();
      const evoluOutputs: Array<EvoluOutput> = [];
      instance.evoluChannel.port2.onMessage = (output) => {
        evoluOutputs.push(output);
      };
      const transport = createOwnerWebSocketTransport({
        url: "wss://local-only-mutation.example",
        ownerId: testAppOwner.id,
      });
      instance.evoluChannel.port2.postMessage({
        type: "UseOwner",
        actions: [
          {
            owner: { owner: testAppOwner, transports: [transport] },
            action: "add",
          },
        ],
      });
      await testWaitForWorkerMessage();
      await respondToSyncRound(instance, createWebSocket);
      createWebSocket.message(transport.url, relayResponse());
      await testWaitForWorkerMessage();
      await respondToApplySync(instance, false, {
        ok: true,
        value: { type: "Converged" },
      });
      assertTrue(routeOf(latest()).complete);
      const publishedCount = states.length;

      instance.evoluChannel.port2.postMessage({
        type: "Mutate",
        changes: [
          { ownerId: testAppOwner.id, table: "_local" } as MutationChange,
        ],
        onCompleteIds: [],
        subscribedQueries: new Set(),
      });
      await testWaitForWorkerMessage();
      assertSame(states.length, publishedCount);

      const mutateInput = instance.dbInputs.at(-1);
      assertNotUndefined(mutateInput);
      assertSame(mutateInput.request.type, "ForEvolu");
      instance.dbWorkerPort.postMessage({
        type: "OnQueuedResponse",
        attemptId: mutateInput.attemptId,
        response: {
          type: "ForEvolu",
          id: instance.id,
          message: {
            type: "Mutate",
            clock: createTimestamp(),
            messagesByOwnerId: new Map(),
            rowsByQuery: new Map(),
          },
        },
      });
      await testWaitForWorkerMessage();
      // The response was handled without publishing.
      assertSame(evoluOutputs.at(-1)?.type, "OnPatchesByQuery");
      assertSame(states.length, publishedCount);
      assertTrue(routeOf(latest()).complete);
    });

    it("refreshes routes once per sync round, however many transports it reaches", async () => {
      /** Counts route refreshes while a round is sent to `transportCount`. */
      const countRefreshesForRound = async (
        transportCount: number,
      ): Promise<number> => {
        const createWebSocket = testCreateWebSocket();
        await using setup = await setupSharedWorker({ createWebSocket });
        const instance = await setup.createEvolu();
        const transports = Array.from({ length: transportCount }, (_, index) =>
          createOwnerWebSocketTransport({
            url: `wss://round-${index}.example`,
            ownerId: testAppOwner.id,
          }),
        );
        assertNonEmptyArray(transports);
        // Every refresh reads each registration's owner once. The in-memory
        // test ports preserve identity, so this observes the registration.
        let ownerReads = 0;
        const syncOwner = new Proxy<SyncOwner>(
          { owner: testAppOwner, transports },
          {
            get: (target, key, receiver): unknown => {
              if (key === "owner") ownerReads++;
              return Reflect.get(target, key, receiver);
            },
          },
        );
        instance.evoluChannel.port2.postMessage({
          type: "UseOwner",
          actions: [{ owner: syncOwner, action: "add" }],
        });
        await testWaitForWorkerMessage();
        // Each first claim of an open transport starts its own round.
        for (let index = 0; index < transportCount; index++)
          await respondToSyncRound(instance, createWebSocket);

        // An explicit request sends one round to every open transport.
        instance.evoluChannel.port2.postMessage({
          type: "UseOwner",
          actions: [{ ownerId: testAppOwner.id, action: "sync" }],
        });
        await testWaitForWorkerMessage();
        ownerReads = 0;
        assertLength(
          await respondToSyncRound(instance, createWebSocket),
          transportCount,
        );
        return ownerReads;
      };

      assertSame(
        await countRefreshesForRound(4),
        await countRefreshesForRound(1),
      );
    });

    it("leaves a route incomplete while a local write is queued", async () => {
      const createWebSocket = testCreateWebSocket();
      await using setup = await setupSharedWorker({ createWebSocket });
      using disposer = new DisposableStack();
      const { latest } = setupSyncStates(setup, disposer);
      const instance = await setup.createEvolu();
      const transport = createOwnerWebSocketTransport({
        url: "wss://queued-write.example",
        ownerId: testAppOwner.id,
      });

      instance.evoluChannel.port2.postMessage({
        type: "UseOwner",
        actions: [
          {
            owner: { owner: testAppOwner, transports: [transport] },
            action: "add",
          },
        ],
      });
      await testWaitForWorkerMessage();
      await respondToSyncRound(instance, createWebSocket);
      createWebSocket.message(transport.url, relayResponse());
      await testWaitForWorkerMessage();
      await respondToApplySync(instance, false, {
        ok: true,
        value: { type: "Converged" },
      });
      assertTrue(routeOf(latest()).complete);

      // A write for another owner leaves the route alone.
      await queueMutation(instance, testAppOwner2.id);
      assertTrue(routeOf(latest()).complete);

      // The owner's write waits behind it. Its upload is sent only once the
      // database worker answers it, so the route is incomplete from now on.
      await queueMutation(instance);
      assertFalse(routeOf(latest()).complete);
      await answerMutation(instance, setup.run, testAppOwner2.id);
      assertFalse(routeOf(latest()).complete);
      assertLength(createWebSocket.sentMessages.splice(0), 0);

      await answerMutation(instance, setup.run);
      assertLength(createWebSocket.sentMessages.splice(0), 1);
      assertFalse(routeOf(latest()).complete);
      createWebSocket.message(transport.url, relayResponse());
      await testWaitForWorkerMessage();
      await respondToApplySync(instance, false, {
        ok: true,
        value: { type: "Converged" },
      });
      assertTrue(routeOf(latest()).complete);
    });

    it("keeps a route complete while a local-only mutation is queued and completed", async () => {
      const createWebSocket = testCreateWebSocket();
      await using setup = await setupSharedWorker({ createWebSocket });
      using disposer = new DisposableStack();
      const { latest } = setupSyncStates(setup, disposer);
      const instance = await setup.createEvolu();
      const transport = createOwnerWebSocketTransport({
        url: "wss://local-only-write.example",
        ownerId: testAppOwner.id,
      });

      instance.evoluChannel.port2.postMessage({
        type: "UseOwner",
        actions: [
          {
            owner: { owner: testAppOwner, transports: [transport] },
            action: "add",
          },
        ],
      });
      await testWaitForWorkerMessage();
      await respondToSyncRound(instance, createWebSocket);
      createWebSocket.message(transport.url, relayResponse());
      await testWaitForWorkerMessage();
      await respondToApplySync(instance, false, {
        ok: true,
        value: { type: "Converged" },
      });
      const completedRoute = routeOf(latest());
      assertTrue(completedRoute.complete);

      setup.run.deps.time.advance("1s");
      instance.evoluChannel.port2.postMessage({
        type: "Mutate",
        changes: [
          {
            ownerId: testAppOwner.id,
            ...DbChange.orThrow({
              table: "_local",
              id: createId(setup.run.deps),
              values: { title: "Local only" },
              isInsert: true,
              isDelete: null,
            }),
          },
        ],
        onCompleteIds: [],
        subscribedQueries: new Set(),
      });
      await testWaitForWorkerMessage();
      assertEqual(routeOf(latest()), completedRoute);

      const mutation = instance.dbInputs.at(-1);
      assertNotUndefined(mutation);
      assertSame(mutation.request.message.type, "Mutate");
      instance.dbWorkerPort.postMessage({
        type: "OnQueuedResponse",
        attemptId: mutation.attemptId,
        response: {
          type: "ForEvolu",
          id: instance.id,
          message: {
            type: "Mutate",
            clock: createTimestamp(),
            messagesByOwnerId: new Map(),
            rowsByQuery: new Map(),
          },
        },
      });
      await testWaitForWorkerMessage();
      assertEqual(routeOf(latest()), completedRoute);
      assertEqual(createWebSocket.sentMessages, []);
    });

    it("forgets a transport whose socket creation is aborted", async () => {
      const createWebSocket = testCreateWebSocket();
      await using setup = await setupSharedWorker({
        createWebSocket: (url, options) => async (run) => {
          // The creation observes an abort before it returns a socket.
          await using child = run.create();
          const creating = child(sleep("1h"));
          child.abort();
          await creating;
          return await run(createWebSocket(url, options));
        },
      });
      using disposer = new DisposableStack();
      const { latest } = setupSyncStates(setup, disposer);
      const instance = await setup.createEvolu();
      const transport = createOwnerWebSocketTransport({
        url: "wss://aborted-creation.example",
        ownerId: testAppOwner.id,
      });

      instance.evoluChannel.port2.postMessage({
        type: "UseOwner",
        actions: [
          {
            owner: { owner: testAppOwner, transports: [transport] },
            action: "add",
          },
        ],
      });
      await testWaitForWorkerMessage();

      assertEqual(createWebSocket.createdUrls, []);
      assertEqual(latest().transports, []);
      assertEqual(setup.run.deps.reportDefect.getDefects(), []);
    });

    it("publishes a snapshot while a transport's socket is disposing", async () => {
      const createWebSocket = testCreateWebSocket({ isOpen: false });
      const disposingSocket = Promise.withResolvers<void>();
      const continueDisposing = Promise.withResolvers<void>();
      await using setup = await setupSharedWorker({
        createWebSocket: (url, options) => async (run) => {
          const socket = await run.ok(createWebSocket(url, options));
          // The first transport's socket is disposed only once released, so
          // the shared worker stays disposing while the second transport's
          // timer fires.
          return ok({
            ...socket,
            [Symbol.asyncDispose]: async () => {
              if (url.startsWith("wss://stalled.example")) {
                disposingSocket.resolve();
                await continueDisposing.promise;
              }
              await socket[Symbol.asyncDispose]();
            },
          });
        },
      });
      using disposer = new DisposableStack();
      const { latest } = setupSyncStates(setup, disposer);
      const instance = await setup.createEvolu();
      const { time } = setup.run.deps;
      const transports = [
        createOwnerWebSocketTransport({
          url: "wss://stalled.example",
          ownerId: testAppOwner.id,
        }),
        createOwnerWebSocketTransport({
          url: "wss://busy.example",
          ownerId: testAppOwner.id,
        }),
      ] as const;

      instance.evoluChannel.port2.postMessage({
        type: "UseOwner",
        actions: [
          { owner: { owner: testAppOwner, transports }, action: "add" },
        ],
      });
      await testWaitForWorkerMessage();
      for (const { url } of transports) {
        createWebSocket.open(url);
        await testWaitForWorkerMessage();
        await respondToSyncRound(instance, createWebSocket);
      }
      // The second transport's round is answered; the first stays unanswered.
      createWebSocket.message(transports[1].url, relayResponse());
      await testWaitForWorkerMessage();
      await respondToApplySync(instance, false, {
        ok: true,
        value: { type: "Converged" },
      });
      // An upload ten seconds later arms the second transport's timer.
      time.advance("10s");
      await postMutation(instance, setup.run);

      // The first transport's request times out and its socket reconnects.
      time.advance(Millis.orThrow(80_000));
      await testWaitForWorkerMessage();

      const disposing = Promise.allSettled([setup[Symbol.asyncDispose]()]);
      try {
        while (latest().tenants.length > 0) await testWaitForWorkerMessage();
        await disposingSocket.promise;
        // A frame on the already-disposed transport's socket publishes a
        // snapshot while the stalled transport is still registered and its
        // own socket is mid-disposal. The snapshot must not read that socket.
        createWebSocket.message(transports[1].url, relayResponse());
        await testWaitForWorkerMessage();
        assertEqual(
          latest().transports.map((transport) => transport.readyState),
          ["connecting"],
        );
      } finally {
        continueDisposing.resolve();
        await disposing;
      }

      assertEqual(await disposing, [{ status: "fulfilled", value: undefined }]);
      assertEqual(setup.run.deps.reportDefect.getDefects(), []);
    });

    it("counts an Unsubscribe as a request until the relay answers it", async () => {
      const createWebSocket = testCreateWebSocket();
      await using setup = await setupSharedWorker({ createWebSocket });
      const instance = await setup.createEvolu();
      const { time } = setup.run.deps;
      // Both owners share one socket.
      const transport = {
        type: "WebSocket",
        url: "wss://shared-socket.example",
      } as const;
      const readonlyOwner2 = {
        owner: {
          id: testAppOwner2.id,
          encryptionKey: testAppOwner2.encryptionKey,
        },
        transports: [transport],
      } as const;
      const owner2Response = (): ArrayBuffer =>
        protocolMessageToArrayBuffer(
          createProtocolMessageBuffer(testAppOwner2.id, {
            messageType: MessageType.Response,
            errorCode: ProtocolErrorCode.NoError,
          }).unwrap(),
        );
      const unsubscribe = {
        url: transport.url,
        data: createProtocolMessageForUnsubscribe(testAppOwner2.id),
      };

      instance.evoluChannel.port2.postMessage({
        type: "UseOwner",
        actions: [
          {
            owner: { owner: testAppOwner, transports: [transport] },
            action: "add",
          },
          { owner: readonlyOwner2, action: "add" },
        ],
      });
      await testWaitForWorkerMessage();
      assertEqual(createWebSocket.createdUrls, [transport.url]);
      await respondToSyncRound(instance, createWebSocket);
      createWebSocket.message(transport.url, relayResponse());
      await testWaitForWorkerMessage();
      await respondToApplySync(instance, false, {
        ok: true,
        value: { type: "Converged" },
      });

      // Releasing the owner's last claim sends an Unsubscribe, which the
      // relay answers like any request.
      instance.evoluChannel.port2.postMessage({
        type: "UseOwner",
        actions: [{ owner: readonlyOwner2, action: "remove" }],
      });
      await testWaitForWorkerMessage();
      assertEqual(createWebSocket.sentMessages.splice(0), [unsubscribe]);
      time.advance(Millis.orThrow(89_000));
      createWebSocket.message(transport.url, owner2Response());
      await testWaitForWorkerMessage();
      time.advance("1.5m");
      await testWaitForWorkerMessage();
      assertEqual(createWebSocket.reconnectedUrls, []);

      // An unanswered Unsubscribe reconnects the socket like any request.
      instance.evoluChannel.port2.postMessage({
        type: "UseOwner",
        actions: [
          { owner: readonlyOwner2, action: "add" },
          { owner: readonlyOwner2, action: "remove" },
        ],
      });
      await testWaitForWorkerMessage();
      assertEqual(createWebSocket.sentMessages.splice(0), [unsubscribe]);
      time.advance("1.5m");
      await testWaitForWorkerMessage();
      assertEqual(createWebSocket.reconnectedUrls, [transport.url]);
    });

    it("restores the base timeout when the last reply is an Unsubscribe no database applies", async () => {
      const createWebSocket = testCreateWebSocket({ isOpen: false });
      await using setup = await setupSharedWorker({ createWebSocket });
      const instance = await setup.createEvolu();
      const { time } = setup.run.deps;
      // Both owners share one socket.
      const transport = {
        type: "WebSocket",
        url: "wss://shared-socket.example",
      } as const;
      const readonlyOwner2 = {
        owner: {
          id: testAppOwner2.id,
          encryptionKey: testAppOwner2.encryptionKey,
        },
        transports: [transport],
      } as const;
      instance.evoluChannel.port2.postMessage({
        type: "UseOwner",
        actions: [
          {
            owner: { owner: testAppOwner, transports: [transport] },
            action: "add",
          },
          { owner: readonlyOwner2, action: "add" },
        ],
      });
      await testWaitForWorkerMessage();
      await timeOutRounds(
        { setup, instance, createWebSocket, url: transport.url },
        [90],
      );
      createWebSocket.open(transport.url);
      await testWaitForWorkerMessage();
      await respondToSyncRound(instance, createWebSocket);
      instance.evoluChannel.port2.postMessage({
        type: "UseOwner",
        actions: [{ owner: readonlyOwner2, action: "remove" }],
      });
      await testWaitForWorkerMessage();
      createWebSocket.message(transport.url, relayResponse());
      await testWaitForWorkerMessage();
      await respondToApplySync(instance, false, {
        ok: true,
        value: { type: "Converged" },
      });

      // Only the socket sees the last reply: no database uses the owner.
      createWebSocket.message(transport.url, relayResponse(testAppOwner2.id));
      await testWaitForWorkerMessage();
      instance.evoluChannel.port2.postMessage({
        type: "UseOwner",
        actions: [{ ownerId: testAppOwner.id, action: "sync" }],
      });
      await testWaitForWorkerMessage();
      await respondToSyncRound(instance, createWebSocket);
      time.advance(Millis.orThrow(89_999));
      await testWaitForWorkerMessage();
      assertLength(createWebSocket.reconnectedUrls, 1);
      time.advance("1ms");
      await testWaitForWorkerMessage();
      assertLength(createWebSocket.reconnectedUrls, 2);
    });

    it("stops timing an unanswered Unsubscribe when its idle socket is disposed", async () => {
      const createWebSocket = testCreateWebSocket();
      await using setup = await setupSharedWorker({ createWebSocket });
      using disposer = new DisposableStack();
      const { states, latest } = setupSyncStates(setup, disposer);
      const instance = await setup.createEvolu();
      const { time } = setup.run.deps;
      const owner = {
        owner: testAppOwner,
        transports: [
          createOwnerWebSocketTransport({
            url: "wss://idle-unsubscribe.example",
            ownerId: testAppOwner.id,
          }),
        ],
      } as const;
      instance.evoluChannel.port2.postMessage({
        type: "UseOwner",
        actions: [{ owner, action: "add" }],
      });
      await testWaitForWorkerMessage();
      await respondToSyncRound(instance, createWebSocket);
      // Answer the round, so the Unsubscribe is the only outstanding request.
      createWebSocket.message(owner.transports[0].url, relayResponse());
      await testWaitForWorkerMessage();
      await respondToApplySync(instance, false, {
        ok: true,
        value: { type: "Converged" },
      });
      instance.evoluChannel.port2.postMessage({
        type: "UseOwner",
        actions: [{ owner, action: "remove" }],
      });
      await testWaitForWorkerMessage();
      assertLength(createWebSocket.sentMessages.splice(0), 1);

      time.advance("3s");
      await testWaitForWorkerMessage();
      assertEqual(latest().transports, []);
      const stateCount = states.length;
      time.advance("2m");
      await testWaitForWorkerMessage();
      assertLength(states, stateCount);
    });

    it("uploads a write answered after its instance was disposed", async () => {
      const createWebSocket = testCreateWebSocket();
      await using setup = await setupSharedWorker({ createWebSocket });
      using disposer = new DisposableStack();
      const { latest } = setupSyncStates(setup, disposer);
      const instance = await setup.createEvolu();
      const transport = createOwnerWebSocketTransport({
        url: "wss://disposed-writer.example",
        ownerId: testAppOwner.id,
      });

      instance.evoluChannel.port2.postMessage({
        type: "UseOwner",
        actions: [
          {
            owner: { owner: testAppOwner, transports: [transport] },
            action: "add",
          },
        ],
      });
      await testWaitForWorkerMessage();
      await respondToSyncRound(instance, createWebSocket);
      createWebSocket.message(transport.url, relayResponse());
      await testWaitForWorkerMessage();
      await respondToApplySync(instance, false, {
        ok: true,
        value: { type: "Converged" },
      });
      assertTrue(routeOf(latest()).complete);

      // A sibling instance writes and is disposed before the write is
      // answered.
      const siblingId = createId<"EvoluInstance">(setup.run.deps);
      const siblingDisposer = new AsyncDisposableStack();
      siblingDisposer.use(await setup.run.ok(acquireLeaderLock(siblingId)));
      using siblingChannel = testCreateMessageChannel<
        EvoluOutput,
        EvoluInput
      >();
      setup.worker.port.postMessage({
        type: "CreateEvolu",
        id: siblingId,
        name: testName,
        consoleLevel: "debug",
        sqliteSchema: testSqliteSchema,
        encryptionKey: testAppOwner.encryptionKey,
        memoryOnly: false,
        evoluPort: siblingChannel.port1.native,
      });
      await testWaitForWorkerMessage();
      siblingChannel.port2.postMessage({
        type: "Mutate",
        changes: [
          { ownerId: testAppOwner.id, table: "todo" } as MutationChange,
        ],
        onCompleteIds: [],
        subscribedQueries: new Set(),
      });
      await testWaitForWorkerMessage();
      const mutateInput = instance.dbInputs.at(-1);
      assertNotUndefined(mutateInput);
      assertSame(mutateInput.request.type, "ForEvolu");
      assertSame(mutateInput.request.id, siblingId);
      await siblingDisposer.disposeAsync();
      await testWaitForWorkerMessage();

      instance.dbWorkerPort.postMessage({
        type: "OnQueuedResponse",
        attemptId: mutateInput.attemptId,
        response: {
          type: "ForEvolu",
          id: siblingId,
          message: {
            clock: createTimestamp(),
            type: "Mutate",
            messagesByOwnerId: new Map([
              [
                testAppOwner.id,
                [testCreateCrdtMessage(createId(setup.run.deps), 1, "hello")],
              ],
            ]),
            rowsByQuery: new Map(),
          },
        },
      });
      await testWaitForWorkerMessage();

      // The surviving registration uploads the write; the route waits for
      // the answer.
      assertLength(createWebSocket.sentMessages.splice(0), 1);
      assertFalse(routeOf(latest()).complete);
      createWebSocket.message(transport.url, relayResponse());
      await testWaitForWorkerMessage();
      await respondToApplySync(instance, false, {
        ok: true,
        value: { type: "Converged" },
      });
      assertTrue(routeOf(latest()).complete);
    });

    it("uploads a write from an instance without a registration", async () => {
      const createWebSocket = testCreateWebSocket();
      await using setup = await setupSharedWorker({ createWebSocket });
      using disposer = new DisposableStack();
      const { latest } = setupSyncStates(setup, disposer);
      const instance = await setup.createEvolu();
      const transport = createOwnerWebSocketTransport({
        url: "wss://sibling-write.example",
        ownerId: testAppOwner.id,
      });

      instance.evoluChannel.port2.postMessage({
        type: "UseOwner",
        actions: [
          {
            owner: { owner: testAppOwner, transports: [transport] },
            action: "add",
          },
        ],
      });
      await testWaitForWorkerMessage();
      await respondToSyncRound(instance, createWebSocket);
      createWebSocket.message(transport.url, relayResponse());
      await testWaitForWorkerMessage();
      await respondToApplySync(instance, false, {
        ok: true,
        value: { type: "Converged" },
      });
      assertTrue(routeOf(latest()).complete);

      // A sibling instance of the same database has no registration.
      const siblingId = createId<"EvoluInstance">(setup.run.deps);
      await using _siblingLock = await setup.run.ok(
        acquireLeaderLock(siblingId),
      );
      using siblingChannel = testCreateMessageChannel<
        EvoluOutput,
        EvoluInput
      >();
      setup.worker.port.postMessage({
        type: "CreateEvolu",
        id: siblingId,
        name: testName,
        consoleLevel: "debug",
        sqliteSchema: testSqliteSchema,
        encryptionKey: testAppOwner.encryptionKey,
        memoryOnly: false,
        evoluPort: siblingChannel.port1.native,
      });
      await testWaitForWorkerMessage();
      siblingChannel.port2.postMessage({
        type: "Mutate",
        changes: [
          { ownerId: testAppOwner.id, table: "todo" } as MutationChange,
        ],
        onCompleteIds: [],
        subscribedQueries: new Set(),
      });
      await testWaitForWorkerMessage();
      const mutateInput = instance.dbInputs.at(-1);
      assertNotUndefined(mutateInput);
      assertSame(mutateInput.request.type, "ForEvolu");
      instance.dbWorkerPort.postMessage({
        type: "OnQueuedResponse",
        attemptId: mutateInput.attemptId,
        response: {
          type: "ForEvolu",
          id: siblingId,
          message: {
            clock: createTimestamp(),
            type: "Mutate",
            messagesByOwnerId: new Map([
              [
                testAppOwner.id,
                [testCreateCrdtMessage(createId(setup.run.deps), 1, "hello")],
              ],
            ]),
            rowsByQuery: new Map(),
          },
        },
      });
      await testWaitForWorkerMessage();

      // The database's registration uploads the write; the route waits for
      // the answer.
      assertEqual(
        createWebSocket.sentMessages.splice(0).map(({ url }) => url),
        [transport.url],
      );
      assertFalse(routeOf(latest()).complete);
      createWebSocket.message(transport.url, relayResponse());
      await testWaitForWorkerMessage();
      await respondToApplySync(instance, false, {
        ok: true,
        value: { type: "Converged" },
      });
      assertTrue(routeOf(latest()).complete);
    });

    it("requires a round when a sibling database's messages fail to apply", async () => {
      const createWebSocket = testCreateWebSocket();
      await using setup = await setupSharedWorker({ createWebSocket });
      using disposer = new DisposableStack();
      const { latest } = setupSyncStates(setup, disposer);
      const secondName = Name.orThrow("second");
      const first = await setup.createEvolu();
      const second = await setup.createEvolu({ tenantName: secondName });
      const transport = createOwnerWebSocketTransport({
        url: "wss://sibling-failure.example",
        ownerId: testAppOwner.id,
      });
      const registration = {
        owner: { owner: testAppOwner, transports: [transport] },
        action: "add",
      } as const;
      for (const instance of [first, second]) {
        instance.evoluChannel.port2.postMessage({
          type: "UseOwner",
          actions: [registration],
        });
        await testWaitForWorkerMessage();
        await respondToSyncRound(instance, createWebSocket);
      }
      for (const _ of [first, second]) {
        createWebSocket.message(transport.url, relayResponse());
        await testWaitForWorkerMessage();
        await respondToApplySync(first, false, {
          ok: true,
          value: { type: "Converged" },
        });
        await respondToApplySync(second, false, {
          ok: true,
          value: { type: "Converged" },
        });
      }
      assertTrue(routeOf(latest()).complete);
      assertTrue(routeOf(latest(), secondName).complete);

      // The second database's write reaches the first one locally but is not
      // stored there. The relay answers the upload before the first database
      // applies the local copy.
      await postMutation(second, setup.run);
      createWebSocket.message(transport.url, relayResponse());
      await testWaitForWorkerMessage();
      await respondToApplySync(second, false, {
        ok: true,
        value: { type: "Converged" },
      });
      assertTrue(routeOf(latest(), secondName).complete);
      await respondToApplySync(first, false, {
        ok: false,
        error: {
          type: "DecryptWithXChaCha20Poly1305Error",
          error: "sibling copy rejected",
        },
      });
      await respondToApplySync(first, false, {
        ok: true,
        value: { type: "Converged" },
      });
      // Nothing is outstanding, yet the failure requires a round.
      assertFalse(routeOf(latest()).complete);

      // The round requested by the failure fetches the messages again.
      await respondToSyncRound(first, createWebSocket);
      createWebSocket.message(transport.url, relayResponse());
      await testWaitForWorkerMessage();
      await respondToApplySync(first, false, {
        ok: true,
        value: { type: "Converged" },
      });
      await respondToApplySync(second, false, {
        ok: true,
        value: { type: "Converged" },
      });
      assertTrue(routeOf(latest()).complete);
    });

    it("retries every route after a sibling continuation copy fails without blaming its source relay", async () => {
      const createWebSocket = testCreateWebSocket();
      await using setup = await setupSharedWorker({ createWebSocket });
      using disposer = new DisposableStack();
      const { latest } = setupSyncStates(setup, disposer);
      const { source, sibling, siblingName, transports } =
        await setupSiblingContinuation(setup, createWebSocket);
      const lastReceivedAt = transports.map(
        (_, index) => routeOf(latest(), siblingName, index).lastReceivedAt,
      );

      // Receiving the upload acknowledgement leaves its local copy at the
      // queue head, so failing the copy must retain its local provenance.
      setup.run.deps.time.advance("1s");
      createWebSocket.message(transports[0].url, relayResponse());
      await testWaitForWorkerMessage();
      await respondToApplySync(source, false, {
        ok: true,
        value: { type: "Converged" },
      });
      await respondToApplySync(sibling, false, {
        ok: false,
        error: {
          type: "DecryptWithXChaCha20Poly1305Error",
          error: "continuation copy rejected",
        },
      });
      for (const index of [0, 1]) {
        const route = routeOf(latest(), siblingName, index);
        assertFalse(route.complete);
        assertSame(route.error, null);
        assertSame(route.lastReceivedAt, lastReceivedAt[index]);
      }
      await respondToApplySync(sibling, false, {
        ok: true,
        value: { type: "Converged" },
      });
      assertEqual(await respondToSyncRound(sibling, createWebSocket), [
        transports[0].url,
        transports[1].url,
      ]);

      for (const transport of transports) {
        createWebSocket.message(transport.url, relayResponse());
        await testWaitForWorkerMessage();
        for (const instance of [source, sibling]) {
          await respondToApplySync(instance, false, {
            ok: true,
            value: { type: "Converged" },
          });
        }
      }
      for (const index of [0, 1]) {
        assertTrue(routeOf(latest(), siblingName, index).complete);
      }
    });

    it("requires a new round through the other transports when a relay stores messages", async () => {
      const createWebSocket = testCreateWebSocket();
      await using setup = await setupSharedWorker({ createWebSocket });
      using disposer = new DisposableStack();
      const { latest } = setupSyncStates(setup, disposer);
      const instance = await setup.createEvolu();
      const transports = [
        createOwnerWebSocketTransport({
          url: "wss://first.example",
          ownerId: testAppOwner.id,
        }),
        createOwnerWebSocketTransport({
          url: "wss://second.example",
          ownerId: testAppOwner.id,
        }),
      ] as const;

      instance.evoluChannel.port2.postMessage({
        type: "UseOwner",
        actions: [
          { owner: { owner: testAppOwner, transports }, action: "add" },
        ],
      });
      await testWaitForWorkerMessage();
      await respondToSyncRound(instance, createWebSocket);
      await respondToSyncRound(instance, createWebSocket);
      for (const transport of transports) {
        createWebSocket.message(transport.url, relayResponse());
        await testWaitForWorkerMessage();
        await respondToApplySync(instance, false, {
          ok: true,
          value: { type: "Converged" },
        });
      }
      assertTrue(routeOf(latest(), testName, 0).complete);
      assertTrue(routeOf(latest(), testName, 1).complete);

      // Messages stored from the first relay invalidate the second route.
      createWebSocket.message(transports[0].url, relayResponse());
      await testWaitForWorkerMessage();
      await respondToApplySync(instance, true, {
        ok: true,
        value: { type: "Converged" },
      });
      assertTrue(routeOf(latest(), testName, 0).complete);
      assertFalse(routeOf(latest(), testName, 1).complete);

      assertEqual(await respondToSyncRound(instance, createWebSocket), [
        transports[1].url,
      ]);
      createWebSocket.message(transports[1].url, relayResponse());
      await testWaitForWorkerMessage();
      await respondToApplySync(instance, false, {
        ok: true,
        value: { type: "Converged" },
      });
      assertTrue(routeOf(latest(), testName, 1).complete);
    });

    it("never completes a route after a replacement leader refused startup", async () => {
      const createWebSocket = testCreateWebSocket();
      await using setup = await setupSharedWorker({ createWebSocket });
      using disposer = new DisposableStack();
      const { latest } = setupSyncStates(setup, disposer);
      const { time } = setup.run.deps;
      const instance = await setup.createEvolu({
        releaseDbWorkerLeaderOnDispose: false,
      });
      const transport = createOwnerWebSocketTransport({
        url: "wss://refused-route.example",
        ownerId: testAppOwner.id,
      });
      instance.evoluChannel.port2.postMessage({
        type: "UseOwner",
        actions: [
          {
            owner: { owner: testAppOwner, transports: [transport] },
            action: "add",
          },
        ],
      });
      await testWaitForWorkerMessage();
      await respondToSyncRound(instance, createWebSocket);
      createWebSocket.message(transport.url, relayResponse());
      await testWaitForWorkerMessage();
      await respondToApplySync(instance, false, {
        ok: true,
        value: { type: "Converged" },
      });
      assertTrue(routeOf(latest()).complete);
      const completeAt = routeOf(latest()).completeAt;

      // The queued write alone keeps the route incomplete.
      time.advance("1s");
      await queueMutation(instance);
      assertFalse(routeOf(latest()).complete);
      await instance.releaseDbWorkerLeader();

      const init = await setupTabLeader(setup, disposer);
      using leaderPort = testCreateMessagePort<DbWorkerOutput, DbWorkerInput>(
        init.port,
      );
      leaderPort.postMessage({
        type: "LeaderRefused",
        name: testName,
        error: {
          type: "UnsupportedDbVersionError",
          storedVersion: PositiveInt.orThrow(2),
          supportedVersion: PositiveInt.orThrow(1),
        },
      });
      await testWaitForWorkerMessage();

      // Refusal discards the write, which is never uploaded.
      assertTrue(latest().tenants[0].refused);
      assertFalse(routeOf(latest()).complete);
      assertSame(routeOf(latest()).completeAt, completeAt);

      // Later refreshes, such as a relay frame, keep it incomplete.
      createWebSocket.message(transport.url, relayResponse());
      await testWaitForWorkerMessage();
      assertFalse(routeOf(latest()).complete);
    });
  });
});

describe("syncStateToOwnerSyncStates", () => {
  const deps = testCreateDeps();
  const openA = createId<"SyncTransport">(deps);
  const openB = createId<"SyncTransport">(deps);
  const closedId = createId<"SyncTransport">(deps);
  const connectingId = createId<"SyncTransport">(deps);
  const createTransport = (
    id: SyncTransportId,
    readyState: SyncTransport["readyState"],
  ): SyncTransport => ({
    id,
    label: "wss://relay.example",
    readyState,
    openedAt: null,
    closedAt: null,
    error: null,
  });
  const transports = [
    createTransport(openA, "open"),
    createTransport(openB, "open"),
    createTransport(closedId, "closed"),
    createTransport(connectingId, "connecting"),
  ];
  const createRoute = (
    transportId: SyncTransportId,
    route: Partial<Omit<SyncRoute, "transportId">> = {},
  ): SyncRoute => ({
    transportId,
    complete: false,
    completeAt: null,
    lastSentAt: null,
    lastReceivedAt: null,
    error: null,
    ...route,
  });
  const createOwner = (
    ownerId: OwnerId,
    routes: ReadonlyArray<SyncRoute>,
    writable = true,
  ): SyncTenantOwner => ({
    ownerId,
    writable,
    transportIds: routes.map(({ transportId }) => transportId),
    routes,
  });
  const createState = (tenants: ReadonlyArray<SyncTenant>): SyncState => ({
    transports,
    tenants,
  });
  const statusOf = (routes: ReadonlyArray<SyncRoute>): string => {
    const [owner] = syncStateToOwnerSyncStates(
      createState([
        {
          name: testName,
          refused: false,
          owners: [createOwner(testAppOwner.id, routes)],
        },
      ]),
    );
    assertNotUndefined(owner);
    return owner.status;
  };
  const failure = (at: number): SyncRouteError => ({
    type: "ProtocolQuotaError",
    at: Millis.orThrow(at),
  });

  it("derives the status from the routes and their transports", () => {
    assertSame(statusOf([]), "initial");
    assertSame(statusOf([createRoute(closedId)]), "offline");
    assertSame(statusOf([createRoute(connectingId)]), "offline");
    assertSame(statusOf([createRoute(openA)]), "syncing");
    assertSame(statusOf([createRoute(openA, { complete: true })]), "synced");
    // A complete route counts even while another socket is closed.
    assertSame(
      statusOf([createRoute(openA, { complete: true }), createRoute(closedId)]),
      "synced",
    );
    // Work in progress on an open socket shows before a completed route.
    assertSame(
      statusOf([createRoute(openA, { complete: true }), createRoute(openB)]),
      "syncing",
    );
    // A failure shows before both.
    assertSame(
      statusOf([
        createRoute(openA, { complete: true }),
        createRoute(openB, { error: failure(1) }),
      ]),
      "error",
    );
  });

  it("reports the newest completion and error", () => {
    const routes = [
      createRoute(openA, {
        completeAt: Millis.orThrow(3000),
        error: { type: "WriteFailed", at: Millis.orThrow(1000) },
      }),
      createRoute(openB, {
        complete: true,
        completeAt: Millis.orThrow(2000),
      }),
      createRoute(closedId, {
        completeAt: Millis.orThrow(1000),
        error: failure(4000),
      }),
    ];
    const [owner] = syncStateToOwnerSyncStates(
      createState([
        {
          name: testName,
          refused: false,
          owners: [createOwner(testAppOwner.id, routes)],
        },
      ]),
    );
    assertEqual(owner, {
      name: testName,
      ownerId: testAppOwner.id,
      status: "error",
      syncedAt: Millis.orThrow(3000),
      error: failure(4000),
      relays: [
        { transport: transports[0], route: routes[0], status: "error" },
        { transport: transports[1], route: routes[1], status: "synced" },
        { transport: transports[2], route: routes[2], status: "error" },
      ],
    });
  });

  it("pairs each route with its transport and a status", () => {
    const routes = [
      createRoute(connectingId),
      createRoute(openB, { complete: true }),
      createRoute(openA),
      createRoute(closedId),
    ];
    const [owner] = syncStateToOwnerSyncStates(
      createState([
        {
          name: testName,
          refused: false,
          owners: [createOwner(testAppOwner.id, routes)],
        },
      ]),
    );
    assertNotUndefined(owner);
    // Relays keep the order of the routes, whatever the transport order.
    assertEqual(owner.relays, [
      { transport: transports[3], route: routes[0], status: "offline" },
      { transport: transports[1], route: routes[1], status: "synced" },
      { transport: transports[0], route: routes[2], status: "syncing" },
      { transport: transports[2], route: routes[3], status: "offline" },
    ]);
  });

  it("reports each writable owner of each running database", () => {
    const secondName = Name.orThrow("second");
    const states = syncStateToOwnerSyncStates(
      createState([
        {
          name: testName,
          refused: false,
          owners: [
            createOwner(testAppOwner.id, [
              createRoute(openA, { complete: true }),
            ]),
            // A readonly registration never synchronizes.
            createOwner(testAppOwner2.id, [], false),
          ],
        },
        {
          name: secondName,
          refused: false,
          owners: [createOwner(testAppOwner2.id, [createRoute(openB)])],
        },
        // A refused database synchronizes nothing, whatever it registered.
        {
          name: Name.orThrow("refused"),
          refused: true,
          owners: [createOwner(testAppOwner.id, [createRoute(openA)])],
        },
      ]),
    );
    assertEqual(
      states.map(({ name, ownerId, status }) => ({ name, ownerId, status })),
      [
        { name: testName, ownerId: testAppOwner.id, status: "synced" },
        { name: secondName, ownerId: testAppOwner2.id, status: "syncing" },
      ],
    );
  });
});

describe("with one evolu instance", () => {
  describe("queue processing", () => {
    it("does not send queued requests before leader is acquired", async () => {
      await using setup = await setupSharedWorker();
      const { createEvoluBeforeDbWorkerLeader, run } = setup;
      const { time } = run.deps;

      const { acquireDbWorkerLeader, dbInputs, evoluChannel, id } =
        await createEvoluBeforeDbWorkerLeader();

      evoluChannel.port2.postMessage({
        type: "Query",
        queries: createSet([testQuery]),
      });

      time.advance("10s");
      await testWaitForWorkerMessage();

      assertEqual(dbInputs, []);

      await acquireDbWorkerLeader();
      await testWaitForWorkerMessage();

      time.advance("10s");
      await testWaitForWorkerMessage();
      await testWaitForWorkerMessage();

      const firstInput = dbInputs[0];
      assertNotUndefined(firstInput);
      assertEqual(typeof firstInput.attemptId, "string");
      assertEqual(firstInput, {
        type: "Request",
        attemptId: firstInput.attemptId,
        request: {
          type: "ForEvolu",
          id,
          message: {
            type: "Query",
            queries: createSet([testQuery]),
          },
        },
      });
    });

    it("keeps later requests queued when a mutation reports a range error without responding", async () => {
      await using setup = await setupSharedWorker();
      const clock = createTimestamp({ millis: maxMillis, counter: maxCounter });
      const { dbInputs, evoluChannel } = await setup.createEvolu({
        initialClock: clock,
      });
      const outputs: Array<EvoluOutput> = [];
      evoluChannel.port2.onMessage = (output) => {
        outputs.push(output);
      };
      evoluChannel.port2.postMessage({
        type: "Mutate",
        changes: [
          {
            ownerId: testAppOwner.id,
            ...DbChange.orThrow({
              table: "todo",
              id: createId(setup.run.deps),
              values: { title: "overflow" },
              isInsert: true,
              isDelete: null,
            }),
          },
        ],
        onCompleteIds: [createId(setup.run.deps)],
        subscribedQueries: new Set(),
      });
      await testWaitForWorkerMessage();
      assertLength(dbInputs, 1);
      const mutation = dbInputs[0];
      assertTrue("clock" in mutation);
      assertEqual(mutation.clock, clock);
      assertSame(mutation.request.message.type, "Mutate");

      // The DbWorker broadcasts this error without completing the request.
      using errors = testCreateBroadcastChannel<ConsoleEntryOrError>(
        consoleEntryOrErrorBroadcastChannelName,
      );
      errors.postMessage({
        type: "Error",
        error: { type: "TimestampTimeOutOfRangeError" },
      });
      evoluChannel.port2.postMessage({
        type: "Query",
        queries: createSet([testQuery]),
      });
      setup.run.deps.time.advance("10s");
      await testWaitForWorkerMessage();

      assertEqual(dbInputs, [mutation]);
      assertEqual(outputs, []);
    });

    it("starts the next queued request after the first response arrives", async () => {
      await using setup = await setupSharedWorker();
      const { createEvolu, run } = setup;
      const { time } = run.deps;

      const { dbInputs, dbWorkerPort, evoluChannel, id } = await createEvolu();

      evoluChannel.port2.postMessage({
        type: "Query",
        queries: createSet([testQuery]),
      });
      evoluChannel.port2.postMessage({
        type: "Query",
        queries: createSet([testQuery]),
      });

      time.advance("10s");
      await testWaitForWorkerMessage();

      const firstInput = dbInputs[0];
      assertNotUndefined(firstInput);
      assertEqual(firstInput.request, {
        type: "ForEvolu",
        id,
        message: {
          type: "Query",
          queries: createSet([testQuery]),
        },
      });

      dbWorkerPort.postMessage({
        type: "OnQueuedResponse",
        attemptId: firstInput.attemptId,
        response: {
          type: "ForEvolu",
          id,
          message: {
            type: "Query",
            rowsByQuery: new Map([[testQuery, []]]),
          },
        },
      });
      await testWaitForWorkerMessage();

      assertLength(dbInputs, 2);
      const secondInput = dbInputs[1];
      assertNotUndefined(secondInput);
      assertEqual(secondInput.request, {
        type: "ForEvolu",
        id,
        message: {
          type: "Query",
          queries: createSet([testQuery]),
        },
      });
      assertFalse(Object.is(secondInput.attemptId, firstInput.attemptId));
    });
  });

  describe("queued responses", () => {
    it("handles mutate and query responses with correct onCompleteIds", async () => {
      await using setup = await setupSharedWorker();
      const { createEvolu, run } = setup;
      const { time } = run.deps;
      const { dbInputs, dbWorkerPort, evoluChannel, id } = await createEvolu();
      const outputs: Array<EvoluOutput> = [];
      evoluChannel.port2.onMessage = (output) => {
        outputs.push(output);
      };

      const mutateOnCompleteId = "mutate-complete" as Id;
      const change: MutationChange = {
        ownerId: testAppOwner.id,
        ...testCreateCrdtMessage(createId(setup.run.deps), 1, "updated").change,
      };

      evoluChannel.port2.postMessage({
        type: "Mutate",
        changes: [change],
        onCompleteIds: [mutateOnCompleteId],
        subscribedQueries: new Set([testQuery]),
      });
      time.advance("10s");
      await testWaitForWorkerMessage();

      const mutateInput = dbInputs.at(-1);
      assertNotUndefined(mutateInput);
      assertEqual(mutateInput.request, {
        type: "ForEvolu",
        id,
        message: {
          type: "Mutate",
          changes: [change],
          onCompleteIds: [mutateOnCompleteId],
          subscribedQueries: new Set([testQuery]),
        },
      });

      dbWorkerPort.postMessage({
        type: "OnQueuedResponse",
        attemptId: mutateInput.attemptId,
        response: {
          type: "ForEvolu",
          id,
          message: {
            clock: createTimestamp(),
            type: "Mutate",
            messagesByOwnerId: new Map(),
            rowsByQuery: new Map([[testQuery, [{ value: 1 }]]]),
          },
        },
      });
      await testWaitForWorkerMessage();

      evoluChannel.port2.postMessage({
        type: "Query",
        queries: createSet([testQuery]),
      });
      time.advance("10s");
      await testWaitForWorkerMessage();

      const queryInput = dbInputs.at(-1);
      assertNotUndefined(queryInput);
      assertEqual(queryInput.request, {
        type: "ForEvolu",
        id,
        message: {
          type: "Query",
          queries: createSet([testQuery]),
        },
      });

      dbWorkerPort.postMessage({
        type: "OnQueuedResponse",
        attemptId: queryInput.attemptId,
        response: {
          type: "ForEvolu",
          id,
          message: {
            type: "Query",
            rowsByQuery: new Map([[testQuery, [{ value: 2 }]]]),
          },
        },
      });
      await testWaitForWorkerMessage();

      const mutateOutput = outputs[0];
      const queryOutput = outputs[1];
      assertSame(mutateOutput.type, "OnPatchesByQuery");
      assertSame(queryOutput.type, "OnPatchesByQuery");

      assertEqual(mutateOutput.onCompleteIds, [mutateOnCompleteId]);
      assertEqual(queryOutput.onCompleteIds, []);
      assertEqual(mutateOutput.patchesByQuery.get(testQuery)?.[0], {
        op: "replaceAll",
        value: [{ value: 1 }],
      });
      assertEqual(queryOutput.patchesByQuery.get(testQuery)?.[0], {
        op: "replaceAll",
        value: [{ value: 2 }],
      });
    });

    it("refreshes sibling instances after mutate responses", async () => {
      await using setup = await setupSharedWorker();
      const { createEvolu, run, worker } = setup;
      const { time } = run.deps;
      const first = await createEvolu({ autoDispose: false });
      const firstOutputs: Array<EvoluOutput> = [];
      const secondOutputs: Array<EvoluOutput> = [];
      first.evoluChannel.port2.onMessage = (output) => {
        firstOutputs.push(output);
      };

      const secondId: EvoluInstanceId = createId(run.deps);
      await using _secondInstanceLock = await run.ok(
        acquireLeaderLock(secondId),
      );
      using secondChannel = testCreateMessageChannel<EvoluOutput, EvoluInput>();
      secondChannel.port2.onMessage = (output) => {
        secondOutputs.push(output);
      };

      worker.port.postMessage({
        type: "CreateEvolu",
        name: testName,
        id: secondId,
        consoleLevel: "debug",
        sqliteSchema: testSqliteSchema,
        encryptionKey: testAppOwner.encryptionKey,
        memoryOnly: false,
        evoluPort: secondChannel.port1.native,
      });
      await testWaitForWorkerMessage();

      secondChannel.port2.postMessage({
        type: "Query",
        queries: createSet([testQuery]),
      });
      time.advance("10s");
      await testWaitForWorkerMessage();

      const secondQueryInput = first.dbInputs.at(-1);
      assertNotUndefined(secondQueryInput);
      assertEqual(secondQueryInput.request, {
        type: "ForEvolu",
        id: secondId,
        message: {
          type: "Query",
          queries: createSet([testQuery]),
        },
      });

      first.dbWorkerPort.postMessage({
        type: "OnQueuedResponse",
        attemptId: secondQueryInput.attemptId,
        response: {
          type: "ForEvolu",
          id: secondId,
          message: {
            type: "Query",
            rowsByQuery: new Map([[testQuery, [{ value: 0 }]]]),
          },
        },
      });
      await testWaitForWorkerMessage();

      const change: MutationChange = {
        ownerId: testAppOwner.id,
        ...testCreateCrdtMessage(createId(setup.run.deps), 1, "updated").change,
      };
      first.evoluChannel.port2.postMessage({
        type: "Mutate",
        changes: [change],
        onCompleteIds: [],
        subscribedQueries: new Set([testQuery]),
      });
      time.advance("10s");
      await testWaitForWorkerMessage();

      const mutateInput = first.dbInputs.at(-1);
      assertNotUndefined(mutateInput);
      assertEqual(mutateInput.request, {
        type: "ForEvolu",
        id: first.id,
        message: {
          type: "Mutate",
          changes: [change],
          onCompleteIds: [],
          subscribedQueries: new Set([testQuery]),
        },
      });

      first.dbWorkerPort.postMessage({
        type: "OnQueuedResponse",
        attemptId: mutateInput.attemptId,
        response: {
          type: "ForEvolu",
          id: first.id,
          message: {
            clock: createTimestamp(),
            type: "Mutate",
            messagesByOwnerId: new Map(),
            rowsByQuery: new Map([[testQuery, [{ value: 1 }]]]),
          },
        },
      });
      await testWaitForWorkerMessage();

      assertTrue(
        firstOutputs.some((output) => output.type === "OnPatchesByQuery"),
      );
      assertFalse(
        firstOutputs.some((output) => output.type === "RefreshQueries"),
      );
      assertTrue(
        secondOutputs.some((output) => output.type === "RefreshQueries"),
      );
    });

    it("drops CreateEvolu when shared worker stops during tenant startup", async () => {
      await using setup = await setupSharedWorker();
      const { announceTabLeader, run, sharedWorkerOutputs, worker } = setup;
      const id: EvoluInstanceId = createId(run.deps);
      const evoluOutputs: Array<EvoluOutput> = [];

      using evoluChannel = testCreateMessageChannel<EvoluOutput, EvoluInput>();
      evoluChannel.port2.onMessage = (output) => {
        evoluOutputs.push(output);
      };

      await announceTabLeader();

      const outputCount = sharedWorkerOutputs.length;
      worker.port.postMessage({
        type: "CreateEvolu",
        name: testName,
        id,
        consoleLevel: "debug",
        sqliteSchema: testSqliteSchema,
        encryptionKey: testAppOwner.encryptionKey,
        memoryOnly: false,
        evoluPort: evoluChannel.port1.native,
      });

      await testWaitForWorkerMessage();

      const initDbWorker = getDbWorkerInit(sharedWorkerOutputs[outputCount]);

      using dbWorkerPort = testCreateMessagePort<DbWorkerOutput, DbWorkerInput>(
        initDbWorker.port,
      );
      const dbDisposeInputs: Array<
        Extract<DbWorkerInput, { type: "Dispose" }>
      > = [];
      dbWorkerPort.onMessage = (input) => {
        if (input.type === "Dispose") dbDisposeInputs.push(input);
      };

      const disposePromise = setup[Symbol.asyncDispose]();
      dbWorkerPort.postMessage({
        clock: createTimestamp(),
        type: "LeaderAcquired",
        name: testName,
      });
      await disposePromise;
      await testWaitForWorkerMessage();

      assertEqual(dbDisposeInputs, [{ type: "Dispose" }]);
      assertEqual(evoluOutputs, []);
    });

    it("forwards export responses back to the evolu port", async () => {
      await using setup = await setupSharedWorker();
      const { createEvolu, run } = setup;
      const { time } = run.deps;
      const { dbInputs, dbWorkerPort, evoluChannel, id } = await createEvolu();
      const outputs: Array<EvoluOutput> = [];
      evoluChannel.port2.onMessage = (output) => {
        outputs.push(output);
      };

      evoluChannel.port2.postMessage({ type: "Export" });
      time.advance("10s");
      await testWaitForWorkerMessage();

      const exportInput = dbInputs.at(-1);
      assertNotUndefined(exportInput);
      assertEqual(exportInput.request, {
        type: "ForEvolu",
        id,
        message: { type: "Export" },
      });

      const file = new Uint8Array([1, 2, 3]);
      dbWorkerPort.postMessage({
        type: "OnQueuedResponse",
        attemptId: exportInput.attemptId,
        response: {
          type: "ForEvolu",
          id,
          message: {
            type: "Export",
            file,
          },
        },
      });
      await testWaitForWorkerMessage();

      const output = outputs[0];
      assertSame(output.type, "OnExport");
      assertEqual(Array.from(output.file), [1, 2, 3]);
    });

    it("ignores queued evolu responses for missing instances", async () => {
      await using setup = await setupSharedWorker();
      const { createEvolu, run } = setup;
      const { time } = run.deps;
      const { dbInputs, dbWorkerPort, evoluChannel } = await createEvolu();
      const outputs: Array<EvoluOutput> = [];
      evoluChannel.port2.onMessage = (output) => {
        outputs.push(output);
      };

      evoluChannel.port2.postMessage({
        type: "Query",
        queries: createSet([testQuery]),
      });
      time.advance("10s");
      await testWaitForWorkerMessage();

      const queryInput = dbInputs.at(-1);
      assertNotUndefined(queryInput);

      dbWorkerPort.postMessage({
        type: "OnQueuedResponse",
        attemptId: queryInput.attemptId,
        response: {
          type: "ForEvolu",
          id: createId<"EvoluInstance">(run.deps),
          message: {
            type: "Query",
            rowsByQuery: new Map([[testQuery, [{ value: 1 }]]]),
          },
        },
      });
      await testWaitForWorkerMessage();

      assertEqual(outputs, []);
    });
  });

  describe("sync behavior", () => {
    it("sends protocol messages only for writable used owners", async () => {
      const createWebSocket = testCreateWebSocket();
      await using setup = await setupSharedWorker({ createWebSocket });
      const { createEvolu, run } = setup;
      const { time } = run.deps;
      const { dbInputs, dbWorkerPort, evoluChannel, id } = await createEvolu();
      const writableTransport = createOwnerWebSocketTransport({
        url: "wss://relay.example",
        ownerId: testAppOwner.id,
      });
      const readonlyTransport = createOwnerWebSocketTransport({
        url: "wss://readonly.example",
        ownerId: testAppOwner2.id,
      });
      const readonlyOwner = {
        id: testAppOwner2.id,
        encryptionKey: testAppOwner2.encryptionKey,
      };

      evoluChannel.port2.postMessage({
        type: "UseOwner",
        actions: [
          {
            owner: { owner: testAppOwner, transports: [writableTransport] },
            action: "add",
          },
          {
            owner: { owner: readonlyOwner, transports: [readonlyTransport] },
            action: "add",
          },
        ],
      });
      await testWaitForWorkerMessage();

      const createSyncInput = dbInputs.at(-1);
      assertNotUndefined(createSyncInput);
      assertEqual(createSyncInput.request, {
        type: "ForSharedWorker",
        message: {
          type: "CreateSyncMessages",
          owners: [testAppOwner],
        },
      });

      dbWorkerPort.postMessage({
        type: "OnQueuedResponse",
        attemptId: createSyncInput.attemptId,
        response: {
          type: "ForSharedWorker",
          message: {
            type: "CreateSyncMessages",
            protocolMessagesByOwnerId: new Map(),
            failedOwnerIds: new Set(),
          },
        },
      });
      await testWaitForWorkerMessage();

      evoluChannel.port2.postMessage({
        type: "Mutate",
        changes: [
          { ownerId: testAppOwner.id, table: "todo" } as MutationChange,
        ],
        onCompleteIds: [],
        subscribedQueries: new Set([testQuery]),
      });
      time.advance("10s");
      await testWaitForWorkerMessage();

      const mutateInput = dbInputs.at(-1);
      assertNotUndefined(mutateInput);
      assertSame(mutateInput.request.type, "ForEvolu");
      assertSame(mutateInput.request.id, id);

      const messages = [
        testCreateCrdtMessage(createId(run.deps), 1, "hello"),
      ] as const;
      dbWorkerPort.postMessage({
        type: "OnQueuedResponse",
        attemptId: mutateInput.attemptId,
        response: {
          type: "ForEvolu",
          id,
          message: {
            clock: createTimestamp(),
            type: "Mutate",
            messagesByOwnerId: new Map([
              [testAppOwner.id, messages],
              [readonlyOwner.id, messages],
              [createId<"OwnerId">(run.deps), messages],
            ]),
            rowsByQuery: new Map([[testQuery, [{ value: 1 }]]]),
          },
        },
      });
      await testWaitForWorkerMessage();

      assertLength(createWebSocket.sentMessages, 1);
      assertSame(createWebSocket.sentMessages[0]?.url, writableTransport.url);
      assertInstanceOf(createWebSocket.sentMessages[0]?.data, Uint8Array);
    });

    it("starts a round only through a transport first claimed while open and explicit sync through every transport", async () => {
      const createWebSocket = testCreateWebSocket();
      await using setup = await setupSharedWorker({ createWebSocket });
      const instance = await setup.createEvolu();
      const { dbInputs, evoluChannel } = instance;
      const transportA = createOwnerWebSocketTransport({
        url: "wss://first-claim-a.example",
        ownerId: testAppOwner.id,
      });
      const transportB = createOwnerWebSocketTransport({
        url: "wss://first-claim-b.example",
        ownerId: testAppOwner.id,
      });

      evoluChannel.port2.postMessage({
        type: "UseOwner",
        actions: [
          {
            action: "add",
            owner: { owner: testAppOwner, transports: [transportA] },
          },
        ],
      });
      await testWaitForWorkerMessage();
      assertSame(dbInputs.length, 1);
      assertEqual(await respondToSyncRound(instance, createWebSocket), [
        transportA.url,
      ]);

      evoluChannel.port2.postMessage({
        type: "UseOwner",
        actions: [
          {
            action: "add",
            owner: { owner: testAppOwner, transports: [transportB] },
          },
        ],
      });
      await testWaitForWorkerMessage();
      assertSame(dbInputs.length, 2);
      assertEqual(await respondToSyncRound(instance, createWebSocket), [
        transportB.url,
      ]);

      evoluChannel.port2.postMessage({
        type: "UseOwner",
        actions: [{ action: "sync", ownerId: testAppOwner.id }],
      });
      await testWaitForWorkerMessage();
      assertSame(dbInputs.length, 3);
      assertEqual(
        new Set(await respondToSyncRound(instance, createWebSocket)),
        new Set([transportA.url, transportB.url]),
      );
    });

    it("starts a round only through the transport that opened", async () => {
      const createWebSocket = testCreateWebSocket({ isOpen: false });
      await using setup = await setupSharedWorker({ createWebSocket });
      const instance = await setup.createEvolu();
      const { dbInputs, evoluChannel } = instance;
      const transports = [
        createOwnerWebSocketTransport({
          url: "wss://opened-a.example",
          ownerId: testAppOwner.id,
        }),
        createOwnerWebSocketTransport({
          url: "wss://opened-b.example",
          ownerId: testAppOwner.id,
        }),
      ] as const;

      evoluChannel.port2.postMessage({
        type: "UseOwner",
        actions: [
          { action: "add", owner: { owner: testAppOwner, transports } },
        ],
      });
      await testWaitForWorkerMessage();
      assertEqual(dbInputs, []);

      for (const transport of transports) {
        createWebSocket.open(transport.url);
        await testWaitForWorkerMessage();
        assertEqual(await respondToSyncRound(instance, createWebSocket), [
          transport.url,
        ]);
      }
      assertSame(dbInputs.length, 2);
    });

    it("sends a continuation only to the transport that produced the response", async () => {
      const createWebSocket = testCreateWebSocket();
      await using setup = await setupSharedWorker({ createWebSocket });
      const instance = await setup.createEvolu();
      const { dbInputs, evoluChannel } = instance;
      const { time } = setup.run.deps;
      const transports = [
        createOwnerWebSocketTransport({
          url: "wss://continuation-a.example",
          ownerId: testAppOwner.id,
        }),
        createOwnerWebSocketTransport({
          url: "wss://continuation-b.example",
          ownerId: testAppOwner.id,
        }),
      ] as const;

      evoluChannel.port2.postMessage({
        type: "UseOwner",
        actions: [
          { action: "add", owner: { owner: testAppOwner, transports } },
        ],
      });
      await testWaitForWorkerMessage();
      // Each transport's first claim starts a round through that transport.
      const roundUrls = [
        await respondToSyncRound(instance, createWebSocket),
        await respondToSyncRound(instance, createWebSocket),
      ];
      assertEqual(
        roundUrls.flat().toSorted(),
        transports.map(({ url }) => url).toSorted(),
      );
      assertSame(dbInputs.length, 2);

      // The relay's answer to each round; the continuation is any frame.
      const relayResponse = protocolMessageToArrayBuffer(
        createProtocolMessageBuffer(testAppOwner.id, {
          messageType: MessageType.Response,
          errorCode: ProtocolErrorCode.NoError,
        }).unwrap(),
      );
      const continuation = createProtocolMessageForUnsubscribe(testAppOwner.id);
      for (const transport of transports) {
        createWebSocket.message(transport.url, relayResponse);
        time.advance("10s");
        await testWaitForWorkerMessage();
        await respondToApplySync(instance, false, {
          ok: true,
          value: { type: "Response", message: continuation },
        });
        assertEqual(createWebSocket.sentMessages.splice(0), [
          { url: transport.url, data: continuation },
        ]);
      }
    });

    it("reconciles newly stored messages through the owner's other transports and coalesces pending rounds", async () => {
      const createWebSocket = testCreateWebSocket();
      await using setup = await setupSharedWorker({ createWebSocket });
      const instance = await setup.createEvolu();
      const { dbInputs, evoluChannel } = instance;
      const { time } = setup.run.deps;
      const transportA = createOwnerWebSocketTransport({
        url: "wss://propagate-a.example",
        ownerId: testAppOwner.id,
      });
      const transportB = createOwnerWebSocketTransport({
        url: "wss://propagate-b.example",
        ownerId: testAppOwner.id,
      });
      const frame = protocolMessageToArrayBuffer(
        createProtocolMessageForUnsubscribe(testAppOwner.id),
      );
      const deliver = async (url: string): Promise<void> => {
        createWebSocket.message(url, frame);
        // Short enough that transport B, which never answers, is not reconnected.
        time.advance("1s");
        await testWaitForWorkerMessage();
      };

      evoluChannel.port2.postMessage({
        type: "UseOwner",
        actions: [
          {
            action: "add",
            owner: { owner: testAppOwner, transports: [transportA] },
          },
        ],
      });
      await testWaitForWorkerMessage();
      assertEqual(await respondToSyncRound(instance, createWebSocket), [
        transportA.url,
      ]);

      // With no other transport, new messages start no round.
      dbInputs.length = 0;
      await deliver(transportA.url);
      await respondToApplySync(instance, true, {
        ok: true,
        value: { type: "Converged" },
      });
      assertSame(dbInputs.length, 1);
      assertEqual(createWebSocket.sentMessages, []);

      evoluChannel.port2.postMessage({
        type: "UseOwner",
        actions: [
          {
            action: "add",
            owner: { owner: testAppOwner, transports: [transportB] },
          },
        ],
      });
      await testWaitForWorkerMessage();
      assertEqual(await respondToSyncRound(instance, createWebSocket), [
        transportB.url,
      ]);

      // A frame that stores nothing new starts no round.
      dbInputs.length = 0;
      await deliver(transportA.url);
      await respondToApplySync(instance, false, {
        ok: true,
        value: { type: "Broadcast" },
      });
      assertSame(dbInputs.length, 1);
      assertEqual(createWebSocket.sentMessages, []);

      // New messages from A start one round through B. A second receipt while
      // that round is still queued is absorbed by it.
      dbInputs.length = 0;
      createWebSocket.message(transportA.url, frame);
      createWebSocket.message(transportA.url, frame);
      time.advance("10s");
      await testWaitForWorkerMessage();
      assertSame(dbInputs.length, 1);
      await respondToApplySync(instance, true, {
        ok: true,
        value: { type: "Converged" },
      });
      assertSame(dbInputs.length, 2);
      await respondToApplySync(instance, true, {
        ok: true,
        value: { type: "Broadcast" },
      });
      assertSame(dbInputs.length, 3);
      assertEqual(await respondToSyncRound(instance, createWebSocket), [
        transportB.url,
      ]);
      await testWaitForWorkerMessage();
      assertSame(dbInputs.length, 3);

      // A continuation returns to A while the new messages reconcile with B.
      dbInputs.length = 0;
      const continuation = createProtocolMessageForUnsubscribe(testAppOwner.id);
      await deliver(transportA.url);
      await respondToApplySync(instance, true, {
        ok: true,
        value: { type: "Response", message: continuation },
      });
      assertEqual(createWebSocket.sentMessages.splice(0), [
        { url: transportA.url, data: continuation },
      ]);
      assertSame(dbInputs.length, 2);
      assertEqual(await respondToSyncRound(instance, createWebSocket), [
        transportB.url,
      ]);

      // New messages from B reconcile with A.
      dbInputs.length = 0;
      await deliver(transportB.url);
      await respondToApplySync(instance, true, {
        ok: true,
        value: { type: "Converged" },
      });
      assertSame(dbInputs.length, 2);
      assertEqual(await respondToSyncRound(instance, createWebSocket), [
        transportA.url,
      ]);
    });

    for (const trigger of [
      "explicit sync",
      "socket opening",
      "first claim of an open transport",
    ] as const) {
      it(`does not absorb ${trigger} into a round queued before a later write`, async () => {
        const createWebSocket = testCreateWebSocket({
          isOpen: trigger !== "socket opening",
        });
        await using setup = await setupSharedWorker({ createWebSocket });
        const first = await setup.createEvolu();
        const { dbInputs, dbWorkerPort, evoluChannel } = first;
        const transport = createOwnerWebSocketTransport({
          url: "wss://ordered-sync.example",
          ownerId: testAppOwner.id,
        });
        const nextTransport = createOwnerWebSocketTransport({
          url: "wss://ordered-sync-next.example",
          ownerId: testAppOwner.id,
        });
        evoluChannel.port2.postMessage({
          type: "UseOwner",
          actions: [
            {
              action: "add",
              owner: {
                owner: testAppOwner,
                transports:
                  trigger === "socket opening"
                    ? [transport, nextTransport]
                    : [transport],
              },
            },
          ],
        });
        await testWaitForWorkerMessage();
        if (trigger === "socket opening") {
          createWebSocket.open(transport.url);
          await testWaitForWorkerMessage();
        }
        await respondToSyncRound(first, createWebSocket);
        dbInputs.length = 0;

        // A sibling instance without an owner registration writes.
        const siblingId = createId<"EvoluInstance">(setup.run.deps);
        await using _siblingLock = await setup.run.ok(
          acquireLeaderLock(siblingId),
        );
        using siblingChannel = testCreateMessageChannel<
          EvoluOutput,
          EvoluInput
        >();
        setup.worker.port.postMessage({
          type: "CreateEvolu",
          id: siblingId,
          name: testName,
          consoleLevel: "debug",
          sqliteSchema: testSqliteSchema,
          encryptionKey: testAppOwner.encryptionKey,
          memoryOnly: false,
          evoluPort: siblingChannel.port1.native,
        });
        await testWaitForWorkerMessage();

        // A pending query keeps the following round queued.
        evoluChannel.port2.postMessage({
          type: "Query",
          queries: createSet([testQuery]),
        });
        evoluChannel.port2.postMessage({
          type: "UseOwner",
          actions: [{ action: "sync", ownerId: testAppOwner.id }],
        });
        await testWaitForWorkerMessage();
        siblingChannel.port2.postMessage({
          type: "Mutate",
          changes: [
            {
              ownerId: testAppOwner.id,
              ...testCreateCrdtMessage(createId(setup.run.deps), 1, "updated")
                .change,
            },
          ],
          onCompleteIds: [],
          subscribedQueries: new Set(),
        });
        await testWaitForWorkerMessage();
        if (trigger === "explicit sync") {
          evoluChannel.port2.postMessage({
            type: "UseOwner",
            actions: [{ action: "sync", ownerId: testAppOwner.id }],
          });
        } else if (trigger === "socket opening") {
          createWebSocket.open(nextTransport.url);
        } else {
          evoluChannel.port2.postMessage({
            type: "UseOwner",
            actions: [
              {
                action: "add",
                owner: { owner: testAppOwner, transports: [nextTransport] },
              },
            ],
          });
        }
        setup.run.deps.time.advance("10s");
        await testWaitForWorkerMessage();
        assertSame(dbInputs.length, 1);

        const query = dbInputs[0];
        assertNotUndefined(query);
        assertSame(query.request.type, "ForEvolu");
        dbWorkerPort.postMessage({
          type: "OnQueuedResponse",
          attemptId: query.attemptId,
          response: {
            type: "ForEvolu",
            id: first.id,
            message: { type: "Query", rowsByQuery: new Map() },
          },
        });
        await testWaitForWorkerMessage();
        assertEqual(
          await respondToSyncRound(first, createWebSocket),
          trigger === "explicit sync"
            ? [transport.url]
            : [transport.url, nextTransport.url],
        );

        const mutate = dbInputs.at(-1);
        assertNotUndefined(mutate);
        assertSame(mutate.request.type, "ForEvolu");
        assertSame(mutate.request.message.type, "Mutate");
        dbWorkerPort.postMessage({
          type: "OnQueuedResponse",
          attemptId: mutate.attemptId,
          response: {
            type: "ForEvolu",
            id: siblingId,
            message: {
              type: "Mutate",
              clock: createTimestamp(),
              messagesByOwnerId: new Map([
                [
                  testAppOwner.id,
                  [
                    testCreateCrdtMessage(
                      createId(setup.run.deps),
                      1,
                      "queued",
                    ),
                  ],
                ],
              ]),
              rowsByQuery: new Map(),
            },
          },
        });
        await testWaitForWorkerMessage();

        // The first instance's registration uploads the write, and the later
        // round, queued behind it, reads it and goes through the requested
        // transport.
        assertEqual(
          createWebSocket.sentMessages.splice(0).map(({ url }) => url),
          trigger === "explicit sync"
            ? [transport.url]
            : [transport.url, nextTransport.url],
        );
        assertEqual(
          dbInputs.map(({ request }) => request.message.type),
          ["Query", "CreateSyncMessages", "Mutate", "CreateSyncMessages"],
        );
        assertEqual(await respondToSyncRound(first, createWebSocket), [
          trigger === "explicit sync" ? transport.url : nextTransport.url,
        ]);
      });
    }

    it("absorbs a propagation round into a queued explicit round with a frame behind it", async () => {
      const createWebSocket = testCreateWebSocket();
      await using setup = await setupSharedWorker({ createWebSocket });
      const instance = await setup.createEvolu();
      const { dbInputs, dbWorkerPort, evoluChannel } = instance;
      const transports = [
        createOwnerWebSocketTransport({
          url: "wss://covering-a.example",
          ownerId: testAppOwner.id,
        }),
        createOwnerWebSocketTransport({
          url: "wss://covering-b.example",
          ownerId: testAppOwner.id,
        }),
      ] as const;
      const frame = protocolMessageToArrayBuffer(
        createProtocolMessageForUnsubscribe(testAppOwner.id),
      );

      evoluChannel.port2.postMessage({
        type: "UseOwner",
        actions: [
          { action: "add", owner: { owner: testAppOwner, transports } },
        ],
      });
      await testWaitForWorkerMessage();
      await respondToSyncRound(instance, createWebSocket);
      await respondToSyncRound(instance, createWebSocket);
      dbInputs.length = 0;

      // A pending query keeps a frame and the explicit round queued, and a
      // second frame arrives behind that round.
      evoluChannel.port2.postMessage({
        type: "Query",
        queries: createSet([testQuery]),
      });
      await testWaitForWorkerMessage();
      createWebSocket.message(transports[0].url, frame);
      evoluChannel.port2.postMessage({
        type: "UseOwner",
        actions: [{ action: "sync", ownerId: testAppOwner.id }],
      });
      await testWaitForWorkerMessage();
      createWebSocket.message(transports[0].url, frame);
      setup.run.deps.time.advance("10s");
      await testWaitForWorkerMessage();
      assertSame(dbInputs.length, 1);

      const query = dbInputs[0];
      assertNotUndefined(query);
      dbWorkerPort.postMessage({
        type: "OnQueuedResponse",
        attemptId: query.attemptId,
        response: {
          type: "ForEvolu",
          id: instance.id,
          message: { type: "Query", rowsByQuery: new Map() },
        },
      });
      await testWaitForWorkerMessage();

      // The first frame stores messages. The queued explicit round already
      // covers the other transport although the second frame is behind it.
      await respondToApplySync(instance, true, {
        ok: true,
        value: { type: "Converged" },
      });
      assertEqual(
        new Set(await respondToSyncRound(instance, createWebSocket)),
        new Set(transports.map(({ url }) => url)),
      );
      await respondToApplySync(instance, false, {
        ok: true,
        value: { type: "Converged" },
      });
      await testWaitForWorkerMessage();
      assertEqual(
        dbInputs.map(({ request }) => request.message.type),
        ["Query", "ApplySyncMessage", "CreateSyncMessages", "ApplySyncMessage"],
      );
    });

    it("starts a round for a tenant that joins an owner on a transport another tenant already uses", async () => {
      const createWebSocket = testCreateWebSocket();
      await using setup = await setupSharedWorker({ createWebSocket });
      const first = await setup.createEvolu();
      const transport = createOwnerWebSocketTransport({
        url: "wss://late-tenant.example",
        ownerId: testAppOwner.id,
      });
      const syncOwner = {
        owner: testAppOwner,
        transports: [transport],
      } as const;

      first.evoluChannel.port2.postMessage({
        type: "UseOwner",
        actions: [{ action: "add", owner: syncOwner }],
      });
      await testWaitForWorkerMessage();
      assertEqual(await respondToSyncRound(first, createWebSocket), [
        transport.url,
      ]);
      first.dbInputs.length = 0;

      // A sibling instance of the same tenant reuses the transport without
      // another round.
      const siblingId: EvoluInstanceId = createId(setup.run.deps);
      await using _siblingLock = await setup.run.ok(
        acquireLeaderLock(siblingId),
      );
      using siblingChannel = testCreateMessageChannel<
        EvoluOutput,
        EvoluInput
      >();
      setup.worker.port.postMessage({
        type: "CreateEvolu",
        name: testName,
        id: siblingId,
        consoleLevel: "debug",
        sqliteSchema: testSqliteSchema,
        encryptionKey: testAppOwner.encryptionKey,
        memoryOnly: false,
        evoluPort: siblingChannel.port1.native,
      });
      await testWaitForWorkerMessage();
      siblingChannel.port2.postMessage({
        type: "UseOwner",
        actions: [{ action: "add", owner: syncOwner }],
      });
      await testWaitForWorkerMessage();
      assertEqual(first.dbInputs, []);

      // Another tenant joining the owner on that transport starts its own
      // round, because its database has not reconciled with the relay.
      const second = await setup.createEvolu({
        tenantName: Name.orThrow("late-tenant"),
      });
      second.evoluChannel.port2.postMessage({
        type: "UseOwner",
        actions: [{ action: "add", owner: syncOwner }],
      });
      await testWaitForWorkerMessage();
      assertEqual(await respondToSyncRound(second, createWebSocket), [
        transport.url,
      ]);
      assertEqual(first.dbInputs, []);
      assertEqual(createWebSocket.createdUrls, [transport.url]);
    });

    it("reconciles a joining tenant through transports already claimed by other tenants", async () => {
      const createWebSocket = testCreateWebSocket();
      await using setup = await setupSharedWorker({ createWebSocket });
      const first = await setup.createEvolu();
      const transportA = createOwnerWebSocketTransport({
        url: "wss://joining-tenant-a.example",
        ownerId: testAppOwner.id,
      });
      const transportB = createOwnerWebSocketTransport({
        url: "wss://joining-tenant-b.example",
        ownerId: testAppOwner.id,
      });
      first.evoluChannel.port2.postMessage({
        type: "UseOwner",
        actions: [
          {
            action: "add",
            owner: { owner: testAppOwner, transports: [transportB] },
          },
        ],
      });
      await testWaitForWorkerMessage();
      assertEqual(await respondToSyncRound(first, createWebSocket), [
        transportB.url,
      ]);
      first.dbInputs.length = 0;

      const second = await setup.createEvolu({
        tenantName: Name.orThrow("joining-tenant"),
      });
      second.evoluChannel.port2.postMessage({
        type: "UseOwner",
        actions: [
          {
            action: "add",
            owner: { owner: testAppOwner, transports: [transportA] },
          },
        ],
      });
      await testWaitForWorkerMessage();

      // The joining database reconciles with both owner transports, including
      // B, which only the first tenant claimed.
      const firstRoundUrls = await respondToSyncRound(second, createWebSocket);
      assertSame(second.dbInputs.length, 2);
      const secondRoundUrls = await respondToSyncRound(second, createWebSocket);
      assertEqual(
        new Set([...firstRoundUrls, ...secondRoundUrls]),
        new Set([transportA.url, transportB.url]),
      );

      // The existing tenant starts only the new transport's round.
      assertSame(first.dbInputs.length, 1);
      assertEqual(await respondToSyncRound(first, createWebSocket), [
        transportA.url,
      ]);
    });

    it("reconciles a tenant's later writes when it first uses an already claimed transport", async () => {
      const createWebSocket = testCreateWebSocket();
      await using setup = await setupSharedWorker({ createWebSocket });
      const first = await setup.createEvolu();
      const transportA = createOwnerWebSocketTransport({
        url: "wss://later-tenant-use-a.example",
        ownerId: testAppOwner.id,
      });
      const transportB = createOwnerWebSocketTransport({
        url: "wss://later-tenant-use-b.example",
        ownerId: testAppOwner.id,
      });
      first.evoluChannel.port2.postMessage({
        type: "UseOwner",
        actions: [
          {
            action: "add",
            owner: { owner: testAppOwner, transports: [transportA] },
          },
        ],
      });
      await testWaitForWorkerMessage();
      assertEqual(await respondToSyncRound(first, createWebSocket), [
        transportA.url,
      ]);

      const second = await setup.createEvolu({
        tenantName: Name.orThrow("later-tenant-use"),
      });
      const syncOwnerB = {
        owner: testAppOwner,
        transports: [transportB],
      } as const;
      second.evoluChannel.port2.postMessage({
        type: "UseOwner",
        actions: [{ action: "add", owner: syncOwnerB }],
      });
      await testWaitForWorkerMessage();

      // B's first global claim already reconciles the first tenant through B.
      assertEqual(await respondToSyncRound(first, createWebSocket), [
        transportB.url,
      ]);
      const secondFirstRound = await respondToSyncRound(
        second,
        createWebSocket,
      );
      const secondLastRound = await respondToSyncRound(second, createWebSocket);
      assertEqual(
        new Set([...secondFirstRound, ...secondLastRound]),
        new Set([transportA.url, transportB.url]),
      );
      first.dbInputs.length = 0;
      second.dbInputs.length = 0;

      // A sibling writes after those rounds without registering the owner.
      const siblingId: EvoluInstanceId = createId(setup.run.deps);
      await using _siblingLock = await setup.run.ok(
        acquireLeaderLock(siblingId),
      );
      using siblingChannel = testCreateMessageChannel<
        EvoluOutput,
        EvoluInput
      >();
      setup.worker.port.postMessage({
        type: "CreateEvolu",
        name: testName,
        id: siblingId,
        consoleLevel: "debug",
        sqliteSchema: testSqliteSchema,
        encryptionKey: testAppOwner.encryptionKey,
        memoryOnly: false,
        evoluPort: siblingChannel.port1.native,
      });
      await testWaitForWorkerMessage();
      const crdtMessage = testCreateCrdtMessage(
        createId(setup.run.deps),
        1,
        "written after the earlier round",
      );
      siblingChannel.port2.postMessage({
        type: "Mutate",
        changes: [{ ...crdtMessage.change, ownerId: testAppOwner.id }],
        onCompleteIds: [],
        subscribedQueries: new Set(),
      });
      setup.run.deps.time.advance("10s");
      await testWaitForWorkerMessage();
      assertSame(first.dbInputs.length, 1);
      const mutation = first.dbInputs[0];
      assertNotUndefined(mutation);
      assertSame(mutation.request.type, "ForEvolu");
      assertSame(mutation.request.id, siblingId);
      assertSame(mutation.request.message.type, "Mutate");
      first.dbWorkerPort.postMessage({
        type: "OnQueuedResponse",
        attemptId: mutation.attemptId,
        response: {
          type: "ForEvolu",
          id: siblingId,
          message: {
            type: "Mutate",
            clock: createTimestamp(),
            messagesByOwnerId: new Map([[testAppOwner.id, [crdtMessage]]]),
            rowsByQuery: new Map(),
          },
        },
      });
      await testWaitForWorkerMessage();
      // The database's registration uploads the sibling's write through every
      // transport claimed for the owner and copies it to the other database.
      assertSame(first.dbInputs.length, 1);
      assertEqual(
        createWebSocket.sentMessages.splice(0).map(({ url }) => url),
        [transportA.url, transportB.url],
      );
      assertEqual(
        second.dbInputs.map(({ request }) => request.message.type),
        ["ApplySyncMessage"],
      );
      first.dbInputs.length = 0;
      second.dbInputs.length = 0;

      // The tenant already has a writable registration through A, and B's
      // global claim remains active. Its first local use of B needs a new round.
      siblingChannel.port2.postMessage({
        type: "UseOwner",
        actions: [{ action: "add", owner: syncOwnerB }],
      });
      await testWaitForWorkerMessage();
      assertSame(first.dbInputs.length, 1);
      assertEqual(await respondToSyncRound(first, createWebSocket), [
        transportB.url,
      ]);
      assertEqual(second.dbInputs, []);
      first.dbInputs.length = 0;

      // Repeated use does not start another round or construct another socket.
      siblingChannel.port2.postMessage({
        type: "UseOwner",
        actions: [{ action: "add", owner: syncOwnerB }],
      });
      await testWaitForWorkerMessage();
      assertEqual(first.dbInputs, []);
      assertEqual(second.dbInputs, []);
      assertEqual(createWebSocket.sentMessages, []);
      assertEqual(createWebSocket.createdUrls, [
        transportA.url,
        transportB.url,
      ]);
    });

    it("ignores non-binary and invalid transport messages", async () => {
      const createWebSocket = testCreateWebSocket({ isOpen: false });
      await using setup = await setupSharedWorker({ createWebSocket });
      const { createEvolu } = setup;
      const { dbInputs, evoluChannel } = await createEvolu();
      const transport = createOwnerWebSocketTransport({
        url: "wss://transport.example",
        ownerId: testAppOwner.id,
      });

      evoluChannel.port2.postMessage({
        type: "UseOwner",
        actions: [
          {
            owner: { owner: testAppOwner, transports: [transport] },
            action: "add",
          },
        ],
      });
      await testWaitForWorkerMessage();

      createWebSocket.message(transport.url, "not-binary");
      createWebSocket.message(transport.url, new Uint8Array([1]).buffer);
      await testWaitForWorkerMessage();

      assertEqual(dbInputs, []);
    });

    it("logs transport close and error", async () => {
      const createWebSocket = testCreateWebSocket();
      await using setup = await setupSharedWorker({ createWebSocket });
      const { createEvolu, run } = setup;
      const { evoluChannel } = await createEvolu();
      const transport = createOwnerWebSocketTransport({
        url: "wss://transport-events.example",
        ownerId: testAppOwner.id,
      });

      evoluChannel.port2.postMessage({
        type: "UseOwner",
        actions: [
          {
            owner: { owner: testAppOwner, transports: [transport] },
            action: "add",
          },
        ],
      });
      await testWaitForWorkerMessage();

      createWebSocket.close(transport.url, { code: 1006, wasClean: false });
      const error: WebSocketError = {
        type: "WebSocketConnectError",
        event: new Event("error"),
      };
      createWebSocket.error(transport.url, error);

      const transportEntries = run.deps.console
        .getEntriesSnapshot()
        .filter(
          ({ args }) =>
            args[0] === "transportClose" || args[0] === "transportError",
        );
      assertEqual(transportEntries, [
        {
          path: ["SharedWorker"],
          method: "debug",
          args: [
            "transportClose",
            { url: transport.url, code: 1006, wasClean: false },
          ],
        },
        {
          path: ["SharedWorker"],
          method: "debug",
          args: [
            "transportError",
            { url: transport.url, type: "WebSocketConnectError" },
          ],
        },
      ]);
    });

    it("routes a relay's version-mismatch reply to the tenant", async () => {
      const createWebSocket = testCreateWebSocket();
      await using setup = await setupSharedWorker({ createWebSocket });
      const instance = await setup.createEvolu();
      const { dbInputs, evoluChannel } = instance;
      const { time } = setup.run.deps;
      const consoleEntryOrErrors: Array<ConsoleEntryOrError> = [];
      using consoleEntryOrErrorBroadcastChannel =
        testCreateBroadcastChannel<ConsoleEntryOrError>(
          consoleEntryOrErrorBroadcastChannelName,
        );
      consoleEntryOrErrorBroadcastChannel.onMessage = (output) => {
        consoleEntryOrErrors.push(output);
      };
      const transport = createOwnerWebSocketTransport({
        url: "wss://version-mismatch.example",
        ownerId: testAppOwner.id,
      });

      evoluChannel.port2.postMessage({
        type: "UseOwner",
        actions: [
          {
            owner: { owner: testAppOwner, transports: [transport] },
            action: "add",
          },
        ],
      });
      await testWaitForWorkerMessage();
      await respondToSyncRound(instance, createWebSocket);
      dbInputs.length = 0;

      // A non-initiator on another version answers with only its version and
      // the owner ID.
      const reply = createBuffer();
      encodeNonNegativeInt(reply, NonNegativeInt.orThrow(2));
      reply.extend(ownerIdToOwnerIdBytes(testAppOwner.id));
      const replyBytes = reply.unwrap();
      createWebSocket.message(
        transport.url,
        protocolMessageToArrayBuffer(replyBytes),
      );
      time.advance("10s");
      await testWaitForWorkerMessage();

      const applyInput = dbInputs.at(-1);
      assertNotUndefined(applyInput);
      assertSame(applyInput.request.type, "ForSharedWorker");
      assertSame(applyInput.request.message.type, "ApplySyncMessage");
      assertEqual(applyInput.request.message.owner, testAppOwner);
      assertEqual(applyInput.request.message.inputMessage, replyBytes);

      const versionError = {
        type: "ProtocolVersionError",
        version: NonNegativeInt.orThrow(2),
        isInitiator: true,
        ownerId: testAppOwner.id,
      } as const;
      await respondToApplySync(instance, false, {
        ok: false,
        error: versionError,
      });
      assertEqual(consoleEntryOrErrors.at(-1), {
        type: "Error",
        error: versionError,
      });

      // The failure requests one round; the same reply to it requests none.
      assertEqual(await respondToSyncRound(instance, createWebSocket), [
        transport.url,
      ]);
      createWebSocket.message(
        transport.url,
        protocolMessageToArrayBuffer(replyBytes),
      );
      await testWaitForWorkerMessage();
      await respondToApplySync(instance, false, {
        ok: false,
        error: versionError,
      });
      assertEqual(
        dbInputs.map(({ request }) => request.message.type),
        ["ApplySyncMessage", "CreateSyncMessages", "ApplySyncMessage"],
      );

      // Each reply answered its request, so none stays outstanding long enough
      // to replace the socket.
      time.advance("2m");
      await testWaitForWorkerMessage();
      assertEqual(createWebSocket.reconnectedUrls, []);
    });

    it("requests sync messages when a claimed transport opens later", async () => {
      const createWebSocket = testCreateWebSocket({ isOpen: false });
      await using setup = await setupSharedWorker({ createWebSocket });
      const { createEvolu } = setup;
      const { dbInputs, evoluChannel } = await createEvolu();
      const transport = createOwnerWebSocketTransport({
        url: "wss://open-later.example",
        ownerId: testAppOwner.id,
      });

      evoluChannel.port2.postMessage({
        type: "UseOwner",
        actions: [
          {
            owner: { owner: testAppOwner, transports: [transport] },
            action: "add",
          },
        ],
      });
      await testWaitForWorkerMessage();

      assertEqual(dbInputs, []);

      createWebSocket.open(transport.url);
      await testWaitForWorkerMessage();

      assertEqual(dbInputs.at(-1)?.request, {
        type: "ForSharedWorker",
        message: {
          type: "CreateSyncMessages",
          owners: [testAppOwner],
        },
      });
    });

    it("skips explicit sync while all transports are closed and syncs after opening", async () => {
      const createWebSocket = testCreateWebSocket({ isOpen: false });
      await using setup = await setupSharedWorker({ createWebSocket });
      const { dbInputs, dbWorkerPort, evoluChannel } =
        await setup.createEvolu();
      const transports = [
        createOwnerWebSocketTransport({
          url: "wss://closed.example",
          ownerId: testAppOwner.id,
        }),
        createOwnerWebSocketTransport({
          url: "wss://opening.example",
          ownerId: testAppOwner.id,
        }),
      ] as const;
      evoluChannel.port2.postMessage({
        type: "UseOwner",
        actions: [
          {
            action: "add",
            owner: { owner: testAppOwner, transports },
          },
        ],
      });
      await testWaitForWorkerMessage();
      evoluChannel.port2.postMessage({
        type: "UseOwner",
        actions: [{ action: "sync", ownerId: testAppOwner.id }],
      });
      await testWaitForWorkerMessage();
      assertEqual(dbInputs, []);
      assertEqual(createWebSocket.sentMessages, []);

      const message = createProtocolMessageBuffer(testAppOwner.id, {
        messageType: MessageType.Request,
        subscriptionFlag: SubscriptionFlags.Subscribe,
      }).unwrap();
      createWebSocket.open(transports[1].url);
      for (const requestCount of [1, 2]) {
        if (requestCount === 2) {
          evoluChannel.port2.postMessage({
            type: "UseOwner",
            actions: [{ action: "sync", ownerId: testAppOwner.id }],
          });
        }
        await testWaitForWorkerMessage();
        assertLength(dbInputs, requestCount);
        const input = dbInputs.at(-1);
        assertNotUndefined(input);
        assertEqual(input.request, {
          type: "ForSharedWorker",
          message: { type: "CreateSyncMessages", owners: [testAppOwner] },
        });
        dbWorkerPort.postMessage({
          type: "OnQueuedResponse",
          attemptId: input.attemptId,
          response: {
            type: "ForSharedWorker",
            message: {
              type: "CreateSyncMessages",
              protocolMessagesByOwnerId: new Map([[testAppOwner.id, message]]),
              failedOwnerIds: new Set(),
            },
          },
        });
        await testWaitForWorkerMessage();
        assertEqual(createWebSocket.sentMessages.splice(0), [
          { url: transports[1].url, data: message },
        ]);
      }
      assertEqual(
        createWebSocket.createdUrls,
        transports.map(({ url }) => url),
      );
    });

    it("sends unsubscribe when the last transport claim is removed", async () => {
      const createWebSocket = testCreateWebSocket();
      await using setup = await setupSharedWorker({ createWebSocket });
      const { createEvolu } = setup;
      const { evoluChannel } = await createEvolu();
      const transport = createOwnerWebSocketTransport({
        url: "wss://unsubscribe.example",
        ownerId: testAppOwner.id,
      });

      evoluChannel.port2.postMessage({
        type: "UseOwner",
        actions: [
          {
            owner: { owner: testAppOwner, transports: [transport] },
            action: "add",
          },
        ],
      });
      await testWaitForWorkerMessage();

      evoluChannel.port2.postMessage({
        type: "UseOwner",
        actions: [
          {
            owner: { owner: testAppOwner, transports: [transport] },
            action: "remove",
          },
        ],
      });
      await testWaitForWorkerMessage();

      assertEqual(createWebSocket.sentMessages.at(-1), {
        url: transport.url,
        data: createProtocolMessageForUnsubscribe(testAppOwner.id),
      });
    });

    it("keeps a repeated owner transport claimed until every use is removed", async () => {
      const createWebSocket = testCreateWebSocket();
      await using setup = await setupSharedWorker({ createWebSocket });
      const { createEvolu } = setup;
      const { evoluChannel } = await createEvolu();
      const transport = createOwnerWebSocketTransport({
        url: "wss://repeated-owner.example",
        ownerId: testAppOwner.id,
      });
      const syncOwner = {
        owner: testAppOwner,
        transports: [transport],
      } as const;

      evoluChannel.port2.postMessage({
        type: "UseOwner",
        actions: [
          { owner: syncOwner, action: "add" },
          { owner: syncOwner, action: "add" },
        ],
      });
      await testWaitForWorkerMessage();

      evoluChannel.port2.postMessage({
        type: "UseOwner",
        actions: [{ owner: syncOwner, action: "remove" }],
      });
      await testWaitForWorkerMessage();

      assertEqual(createWebSocket.sentMessages, []);

      evoluChannel.port2.postMessage({
        type: "UseOwner",
        actions: [{ owner: syncOwner, action: "remove" }],
      });
      await testWaitForWorkerMessage();

      assertEqual(createWebSocket.sentMessages.at(-1), {
        url: transport.url,
        data: createProtocolMessageForUnsubscribe(testAppOwner.id),
      });
    });

    it("activates a writable registration after readonly access to the same owner", async () => {
      const createWebSocket = testCreateWebSocket();
      await using setup = await setupSharedWorker({ createWebSocket });
      const instance = await setup.createEvolu();
      const { dbInputs, evoluChannel } = instance;
      const transport = createOwnerWebSocketTransport({
        url: "wss://readonly-then-writable.example",
        ownerId: testAppOwner.id,
      });
      const readonlySyncOwner = {
        owner: {
          id: testAppOwner.id,
          encryptionKey: testAppOwner.encryptionKey,
        },
        transports: [transport],
      } as const;
      const writableSyncOwner = {
        owner: testAppOwner,
        transports: [transport],
      } as const;

      evoluChannel.port2.postMessage({
        type: "UseOwner",
        actions: [{ action: "add", owner: readonlySyncOwner }],
      });
      await testWaitForWorkerMessage();
      assertEqual(dbInputs, []);

      evoluChannel.port2.postMessage({
        type: "UseOwner",
        actions: [{ action: "add", owner: writableSyncOwner }],
      });
      await testWaitForWorkerMessage();
      assertLength(dbInputs, 1);
      assertEqual(await respondToSyncRound(instance, createWebSocket), [
        transport.url,
      ]);
      dbInputs.splice(0);

      evoluChannel.port2.postMessage({
        type: "UseOwner",
        actions: [
          { action: "remove", owner: readonlySyncOwner },
          { action: "sync", ownerId: testAppOwner.id },
        ],
      });
      await testWaitForWorkerMessage();
      assertLength(dbInputs, 1);
      assertEqual(createWebSocket.sentMessages, []);
      assertEqual(await respondToSyncRound(instance, createWebSocket), [
        transport.url,
      ]);
      assertEqual(createWebSocket.createdUrls, [transport.url]);

      evoluChannel.port2.postMessage({
        type: "UseOwner",
        actions: [{ action: "remove", owner: writableSyncOwner }],
      });
      await testWaitForWorkerMessage();
      assertEqual(createWebSocket.sentMessages, [
        {
          url: transport.url,
          data: createProtocolMessageForUnsubscribe(testAppOwner.id),
        },
      ]);
    });

    it("stops syncing only after the last writable registration leaves readonly access", async () => {
      const createWebSocket = testCreateWebSocket();
      await using setup = await setupSharedWorker({ createWebSocket });
      const instance = await setup.createEvolu();
      const { dbInputs, evoluChannel } = instance;
      const transport = createOwnerWebSocketTransport({
        url: "wss://writable-then-readonly.example",
        ownerId: testAppOwner.id,
      });
      const readonlySyncOwner = {
        owner: {
          id: testAppOwner.id,
          encryptionKey: testAppOwner.encryptionKey,
        },
        transports: [transport],
      } as const;
      const writableSyncOwner = {
        owner: testAppOwner,
        transports: [transport],
      } as const;

      evoluChannel.port2.postMessage({
        type: "UseOwner",
        actions: [
          { action: "add", owner: writableSyncOwner },
          { action: "add", owner: readonlySyncOwner },
          { action: "add", owner: writableSyncOwner },
        ],
      });
      await testWaitForWorkerMessage();
      assertLength(dbInputs, 1);
      assertEqual(await respondToSyncRound(instance, createWebSocket), [
        transport.url,
      ]);
      dbInputs.splice(0);

      evoluChannel.port2.postMessage({
        type: "UseOwner",
        actions: [
          { action: "remove", owner: writableSyncOwner },
          { action: "sync", ownerId: testAppOwner.id },
        ],
      });
      await testWaitForWorkerMessage();
      assertLength(dbInputs, 1);
      assertEqual(createWebSocket.sentMessages, []);
      assertEqual(await respondToSyncRound(instance, createWebSocket), [
        transport.url,
      ]);
      dbInputs.splice(0);

      evoluChannel.port2.postMessage({
        type: "UseOwner",
        actions: [
          { action: "remove", owner: writableSyncOwner },
          { action: "sync", ownerId: testAppOwner.id },
        ],
      });
      await testWaitForWorkerMessage();
      createWebSocket.message(
        transport.url,
        protocolMessageToArrayBuffer(
          createProtocolMessageForUnsubscribe(testAppOwner.id),
        ),
      );
      await testWaitForWorkerMessage();
      assertEqual(dbInputs, []);
      assertEqual(createWebSocket.sentMessages, []);

      evoluChannel.port2.postMessage({
        type: "UseOwner",
        actions: [{ action: "remove", owner: readonlySyncOwner }],
      });
      await testWaitForWorkerMessage();
      assertEqual(createWebSocket.sentMessages, [
        {
          url: transport.url,
          data: createProtocolMessageForUnsubscribe(testAppOwner.id),
        },
      ]);
    });

    it("explicit sync selects only active writable owners without changing claims", async () => {
      const createWebSocket = testCreateWebSocket();
      await using setup = await setupSharedWorker({ createWebSocket });
      const { dbInputs, dbWorkerPort, evoluChannel } =
        await setup.createEvolu();
      const onMessage = dbWorkerPort.onMessage;
      assertNonNullable(onMessage);
      // Complete each queued read so later sync requests can be observed.
      dbWorkerPort.onMessage = (input) => {
        onMessage(input);
        if (input.type !== "Request") return;
        dbWorkerPort.postMessage({
          type: "OnQueuedResponse",
          attemptId: input.attemptId,
          response: {
            type: "ForSharedWorker",
            message: {
              type: "CreateSyncMessages",
              protocolMessagesByOwnerId: new Map(),
              failedOwnerIds: new Set(),
            },
          },
        });
      };
      const transport = createOwnerWebSocketTransport({
        url: "wss://explicit-sync.example",
        ownerId: testAppOwner.id,
      });
      const first = { owner: testAppOwner, transports: [transport] } as const;
      const second = { owner: testAppOwner2, transports: [transport] } as const;
      const readonlyOwner = {
        id: createId<"OwnerId">(setup.run.deps),
        encryptionKey: testAppOwner.encryptionKey,
      };
      evoluChannel.port2.postMessage({
        type: "UseOwner",
        actions: [
          { action: "add", owner: first },
          { action: "add", owner: first },
          { action: "add", owner: second },
          {
            action: "add",
            owner: { owner: readonlyOwner, transports: [transport] },
          },
        ],
      });
      await testWaitForWorkerMessage();
      dbInputs.length = 0;

      evoluChannel.port2.postMessage({
        type: "UseOwner",
        actions: [
          { action: "sync", ownerId: testAppOwner.id },
          { action: "sync", ownerId: readonlyOwner.id },
          { action: "sync", ownerId: createId<"OwnerId">(setup.run.deps) },
        ],
      });
      await testWaitForWorkerMessage();
      assertEqual(
        dbInputs.map(({ request }) => request),
        [
          {
            type: "ForSharedWorker",
            message: { type: "CreateSyncMessages", owners: [testAppOwner] },
          },
        ],
      );
      assertEqual(createWebSocket.sentMessages, []);
      assertEqual(createWebSocket.createdUrls, [transport.url]);
      dbInputs.length = 0;

      evoluChannel.port2.postMessage({
        type: "UseOwner",
        actions: [
          { action: "remove", owner: first },
          { action: "sync", ownerId: testAppOwner.id },
          { action: "remove", owner: first },
          { action: "sync", ownerId: testAppOwner.id },
        ],
      });
      await testWaitForWorkerMessage();
      assertLength(dbInputs, 1);
      assertEqual(createWebSocket.sentMessages, [
        {
          url: transport.url,
          data: createProtocolMessageForUnsubscribe(testAppOwner.id),
        },
      ]);
    });

    it("explicit sync waits for pending transport registration", async () => {
      const createWebSocket = testCreateWebSocket();
      const creating = Promise.withResolvers<void>();
      const continueCreating = Promise.withResolvers<void>();
      await using setup = await setupSharedWorker({
        createWebSocket: (url, options) => async (run) => {
          creating.resolve();
          await continueCreating.promise;
          return run(createWebSocket(url, options));
        },
      });
      const { dbInputs, dbWorkerPort, evoluChannel } =
        await setup.createEvolu();
      const transport = createOwnerWebSocketTransport({
        url: "wss://pending-sync.example",
        ownerId: testAppOwner.id,
      });
      evoluChannel.port2.postMessage({
        type: "UseOwner",
        actions: [
          {
            action: "add",
            owner: { owner: testAppOwner, transports: [transport] },
          },
        ],
      });
      await creating.promise;
      evoluChannel.port2.postMessage({
        type: "UseOwner",
        actions: [{ action: "sync", ownerId: testAppOwner.id }],
      });
      await testWaitForWorkerMessage();
      assertEqual(dbInputs, []);
      continueCreating.resolve();
      await testWaitForWorkerMessage();
      assertEqual(createWebSocket.sentMessages, []);

      const message = createProtocolMessageBuffer(testAppOwner.id, {
        messageType: MessageType.Request,
        subscriptionFlag: SubscriptionFlags.Subscribe,
      }).unwrap();
      // The first claim and the queued explicit sync each request reconciliation.
      for (const requestCount of [1, 2]) {
        await testWaitForWorkerMessage();
        assertLength(dbInputs, requestCount);
        const input = dbInputs.at(-1);
        assertNotUndefined(input);
        assertEqual(input.request, {
          type: "ForSharedWorker",
          message: { type: "CreateSyncMessages", owners: [testAppOwner] },
        });
        dbWorkerPort.postMessage({
          type: "OnQueuedResponse",
          attemptId: input.attemptId,
          response: {
            type: "ForSharedWorker",
            message: {
              type: "CreateSyncMessages",
              protocolMessagesByOwnerId: new Map([[testAppOwner.id, message]]),
              failedOwnerIds: new Set(),
            },
          },
        });
        await testWaitForWorkerMessage();
        assertEqual(createWebSocket.sentMessages.splice(0), [
          { url: transport.url, data: message },
        ]);
      }
    });

    it("releases the matching transport set when owner uses are removed out of order", async () => {
      const createWebSocket = testCreateWebSocket();
      await using setup = await setupSharedWorker({ createWebSocket });
      const { createEvolu } = setup;
      const { evoluChannel } = await createEvolu();
      const firstTransport = createOwnerWebSocketTransport({
        url: "wss://first-owner-use.example",
        ownerId: testAppOwner.id,
      });
      const secondTransport = createOwnerWebSocketTransport({
        url: "wss://second-owner-use.example",
        ownerId: testAppOwner.id,
      });
      const firstSyncOwner = {
        owner: testAppOwner,
        transports: [firstTransport],
      } as const;
      const secondSyncOwner = {
        owner: testAppOwner,
        transports: [secondTransport],
      } as const;

      evoluChannel.port2.postMessage({
        type: "UseOwner",
        actions: [
          { owner: firstSyncOwner, action: "add" },
          { owner: secondSyncOwner, action: "add" },
        ],
      });
      await testWaitForWorkerMessage();

      evoluChannel.port2.postMessage({
        type: "UseOwner",
        actions: [{ owner: firstSyncOwner, action: "remove" }],
      });
      await testWaitForWorkerMessage();

      assertEqual(createWebSocket.sentMessages, [
        {
          url: firstTransport.url,
          data: createProtocolMessageForUnsubscribe(testAppOwner.id),
        },
      ]);

      evoluChannel.port2.postMessage({
        type: "UseOwner",
        actions: [{ owner: secondSyncOwner, action: "remove" }],
      });
      await testWaitForWorkerMessage();

      assertEqual(createWebSocket.sentMessages.at(-1), {
        url: secondTransport.url,
        data: createProtocolMessageForUnsubscribe(testAppOwner.id),
      });
    });

    it("reports a transport creation defect without leaving a pending owner use", async () => {
      await using setup = await setupSharedWorker();
      const { createEvolu, run } = setup;
      const { evoluChannel } = await createEvolu();
      const transport = createOwnerWebSocketTransport({
        url: "wss://create-defect.example",
        ownerId: testAppOwner.id,
      });
      const reported = run.deps.reportDefect.next();

      evoluChannel.port2.postMessage({
        type: "UseOwner",
        actions: [
          {
            owner: { owner: testAppOwner, transports: [transport] },
            action: "add",
          },
        ],
      });

      const error = await reported;
      assertType(AbortError, error);
      assertSame(error.reason.type, "PanicAbortReason");
      assertInstanceOf(error.reason.defect, Error);
      assertEqual(
        error.reason.defect.message,
        "testCreateWebSocket is configured to throw on create",
      );
    });

    it("handles apply sync responses for errors, refreshes, and response messages", async () => {
      const createWebSocket = testCreateWebSocket();
      await using setup = await setupSharedWorker({ createWebSocket });
      const { createEvolu, run } = setup;
      const { time } = run.deps;
      const { dbInputs, dbWorkerPort, evoluChannel } = await createEvolu();
      const consoleEntryOrErrors: Array<ConsoleEntryOrError> = [];
      using consoleEntryOrErrorBroadcastChannel =
        testCreateBroadcastChannel<ConsoleEntryOrError>(
          consoleEntryOrErrorBroadcastChannelName,
        );
      const evoluOutputs: Array<EvoluOutput> = [];
      const transport = createOwnerWebSocketTransport({
        url: "wss://apply-sync.example",
        ownerId: testAppOwner.id,
      });

      consoleEntryOrErrorBroadcastChannel.onMessage = (output) => {
        consoleEntryOrErrors.push(output);
      };
      evoluChannel.port2.onMessage = (output) => {
        evoluOutputs.push(output);
      };

      evoluChannel.port2.postMessage({
        type: "UseOwner",
        actions: [
          {
            owner: { owner: testAppOwner, transports: [transport] },
            action: "add",
          },
        ],
      });
      await testWaitForWorkerMessage();

      const createSyncInput = dbInputs.at(-1);
      assertNotUndefined(createSyncInput);
      dbWorkerPort.postMessage({
        type: "OnQueuedResponse",
        attemptId: createSyncInput.attemptId,
        response: {
          type: "ForSharedWorker",
          message: {
            type: "CreateSyncMessages",
            protocolMessagesByOwnerId: new Map(),
            failedOwnerIds: new Set(),
          },
        },
      });
      await testWaitForWorkerMessage();
      dbInputs.length = 0;

      createWebSocket.message(
        transport.url,
        protocolMessageToArrayBuffer(
          createProtocolMessageForUnsubscribe(testAppOwner.id),
        ),
      );
      time.advance("10s");
      await testWaitForWorkerMessage();

      const firstApplyInput = dbInputs.at(-1);
      assertNotUndefined(firstApplyInput);
      assertSame(firstApplyInput.request.type, "ForSharedWorker");
      assertSame(firstApplyInput.request.message.type, "ApplySyncMessage");
      assertEqual(firstApplyInput.request.message.owner, testAppOwner);

      const receivedClock = createTimestamp({ millis: Millis.orThrow(1000) });
      dbWorkerPort.postMessage({
        type: "OnQueuedResponse",
        attemptId: firstApplyInput.attemptId,
        response: {
          type: "ForSharedWorker",
          message: {
            clock: receivedClock,
            type: "ApplySyncMessage",
            ownerId: testAppOwner.id,
            didWriteMessages: true,
            result: {
              ok: false,
              error: {
                type: "ProtocolInvalidDataError",
                data: new Uint8Array(),
                error: "boom",
              },
            },
          },
        },
      });
      await testWaitForWorkerMessage();

      assertTrue(
        evoluOutputs.some((output) => output.type === "RefreshQueries"),
      );
      assertEqual(consoleEntryOrErrors.at(-1), {
        type: "Error",
        error: {
          type: "ProtocolInvalidDataError",
          data: new Uint8Array(),
          error: "boom",
        },
      });

      // The failure requested one round through the route.
      const retryRoundInput = dbInputs.at(-1);
      assertNotUndefined(retryRoundInput);
      assertSame(retryRoundInput.request.type, "ForSharedWorker");
      assertSame(retryRoundInput.request.message.type, "CreateSyncMessages");
      dbWorkerPort.postMessage({
        type: "OnQueuedResponse",
        attemptId: retryRoundInput.attemptId,
        response: {
          type: "ForSharedWorker",
          message: {
            type: "CreateSyncMessages",
            protocolMessagesByOwnerId: new Map(),
            failedOwnerIds: new Set(),
          },
        },
      });
      await testWaitForWorkerMessage();

      createWebSocket.message(
        transport.url,
        protocolMessageToArrayBuffer(
          createProtocolMessageForUnsubscribe(testAppOwner.id),
        ),
      );
      time.advance("10s");
      await testWaitForWorkerMessage();

      const responseApplyInput = dbInputs.at(-1);
      assertNotUndefined(responseApplyInput);
      assertTrue("clock" in responseApplyInput);
      assertEqual(responseApplyInput.clock, receivedClock);
      dbWorkerPort.postMessage({
        type: "OnQueuedResponse",
        attemptId: responseApplyInput.attemptId,
        response: {
          type: "ForSharedWorker",
          message: {
            clock: createTimestamp(),
            type: "ApplySyncMessage",
            ownerId: testAppOwner.id,
            didWriteMessages: false,
            result: {
              ok: true,
              value: {
                type: "Response",
                message: createProtocolMessageForUnsubscribe(testAppOwner.id),
              },
            },
          },
        },
      });
      await testWaitForWorkerMessage();

      assertEqual(createWebSocket.sentMessages.at(-1), {
        url: transport.url,
        data: createProtocolMessageForUnsubscribe(testAppOwner.id),
      });

      // The response reported an older clock, as a sync request that stored
      // nothing does after a replacement leader advanced the clock. The
      // session clock keeps the newer one, so the next write is stamped after
      // everything the leader applied.
      evoluChannel.port2.postMessage({
        type: "Mutate",
        changes: [
          {
            ownerId: testAppOwner.id,
            ...testCreateCrdtMessage(createId(setup.run.deps), 1, "updated")
              .change,
          },
        ],
        onCompleteIds: [],
        subscribedQueries: new Set(),
      });
      time.advance("10s");
      await testWaitForWorkerMessage();
      const mutateInput = dbInputs.at(-1);
      assertNotUndefined(mutateInput);
      assertTrue("clock" in mutateInput);
      assertEqual(mutateInput.clock, receivedClock);
    });

    it("ignores abort, broadcast, and converged apply sync results", async () => {
      const createWebSocket = testCreateWebSocket();
      await using setup = await setupSharedWorker({ createWebSocket });
      const { createEvolu, run } = setup;
      const { time } = run.deps;
      const { dbInputs, dbWorkerPort, evoluChannel } = await createEvolu();
      const consoleEntryOrErrors: Array<ConsoleEntryOrError> = [];
      using consoleEntryOrErrorBroadcastChannel =
        testCreateBroadcastChannel<ConsoleEntryOrError>(
          consoleEntryOrErrorBroadcastChannelName,
        );
      const transport = createOwnerWebSocketTransport({
        url: "wss://apply-sync-ignored.example",
        ownerId: testAppOwner.id,
      });

      consoleEntryOrErrorBroadcastChannel.onMessage = (output) => {
        consoleEntryOrErrors.push(output);
      };

      evoluChannel.port2.postMessage({
        type: "UseOwner",
        actions: [
          {
            owner: { owner: testAppOwner, transports: [transport] },
            action: "add",
          },
        ],
      });
      await testWaitForWorkerMessage();

      const createSyncInput = dbInputs.at(-1);
      assertNotUndefined(createSyncInput);
      dbWorkerPort.postMessage({
        type: "OnQueuedResponse",
        attemptId: createSyncInput.attemptId,
        response: {
          type: "ForSharedWorker",
          message: {
            type: "CreateSyncMessages",
            protocolMessagesByOwnerId: new Map(),
            failedOwnerIds: new Set(),
          },
        },
      });
      await testWaitForWorkerMessage();
      dbInputs.length = 0;

      const runApplySync = async (
        response: Extract<
          Extract<DbWorkerOutput, { type: "OnQueuedResponse" }>["response"],
          { type: "ForSharedWorker" }
        >["message"],
      ): Promise<void> => {
        createWebSocket.message(
          transport.url,
          protocolMessageToArrayBuffer(
            createProtocolMessageForUnsubscribe(testAppOwner.id),
          ),
        );
        time.advance("10s");
        await testWaitForWorkerMessage();

        const applyInput = dbInputs.at(-1);
        assertNotUndefined(applyInput);
        dbWorkerPort.postMessage({
          type: "OnQueuedResponse",
          attemptId: applyInput.attemptId,
          response: {
            type: "ForSharedWorker",
            message: response,
          },
        });
        await testWaitForWorkerMessage();
        dbInputs.length = 0;
      };

      const sentMessageCount = createWebSocket.sentMessages.length;

      await runApplySync({
        clock: createTimestamp(),
        type: "ApplySyncMessage",
        ownerId: testAppOwner.id,
        didWriteMessages: false,
        result: {
          ok: false,
          error: { type: "AbortError", reason: { type: "Stop" } },
        },
      });
      await runApplySync({
        clock: createTimestamp(),
        type: "ApplySyncMessage",
        ownerId: testAppOwner.id,
        didWriteMessages: false,
        result: { ok: true, value: { type: "Broadcast" } },
      });
      await runApplySync({
        clock: createTimestamp(),
        type: "ApplySyncMessage",
        ownerId: testAppOwner.id,
        didWriteMessages: false,
        result: { ok: true, value: { type: "Converged" } },
      });

      assertEqual(consoleEntryOrErrors, []);
      assertLength(createWebSocket.sentMessages, sentMessageCount);
    });

    it("ignores sync creation and apply when no writable owner is active", async () => {
      const createWebSocket = testCreateWebSocket({ isOpen: false });
      await using setup = await setupSharedWorker({ createWebSocket });
      const { createEvolu, run } = setup;
      const { time } = run.deps;
      const { dbInputs, evoluChannel } = await createEvolu();
      const readonlyOwner = {
        id: testAppOwner2.id,
        encryptionKey: testAppOwner2.encryptionKey,
      };
      const readonlyTransport = createOwnerWebSocketTransport({
        url: "wss://readonly-only.example",
        ownerId: readonlyOwner.id,
      });

      evoluChannel.port2.postMessage({
        type: "UseOwner",
        actions: [
          {
            owner: { owner: readonlyOwner, transports: [readonlyTransport] },
            action: "add",
          },
        ],
      });
      await testWaitForWorkerMessage();

      createWebSocket.open(readonlyTransport.url);
      await testWaitForWorkerMessage();
      assertEqual(dbInputs, []);

      const writableTransport = createOwnerWebSocketTransport({
        url: "wss://removed-owner.example",
        ownerId: testAppOwner.id,
      });
      evoluChannel.port2.postMessage({
        type: "UseOwner",
        actions: [
          {
            owner: { owner: testAppOwner, transports: [writableTransport] },
            action: "add",
          },
        ],
      });
      await testWaitForWorkerMessage();

      evoluChannel.port2.postMessage({
        type: "UseOwner",
        actions: [
          {
            owner: { owner: testAppOwner, transports: [writableTransport] },
            action: "remove",
          },
        ],
      });
      await testWaitForWorkerMessage();

      dbInputs.length = 0;
      createWebSocket.message(
        writableTransport.url,
        protocolMessageToArrayBuffer(
          createProtocolMessageForUnsubscribe(testAppOwner.id),
        ),
      );
      time.advance("10s");
      await testWaitForWorkerMessage();

      assertEqual(dbInputs, []);
    });

    it("ignores protocol sends through closed transports", async () => {
      const createWebSocket = testCreateWebSocket({ isOpen: false });
      await using setup = await setupSharedWorker({ createWebSocket });
      const { createEvolu, run } = setup;
      const { time } = run.deps;
      const { dbInputs, dbWorkerPort, evoluChannel, id } = await createEvolu();
      const outputs: Array<EvoluOutput> = [];
      const transport = createOwnerWebSocketTransport({
        url: "wss://closed-transport.example",
        ownerId: testAppOwner.id,
      });

      evoluChannel.port2.onMessage = (output) => {
        outputs.push(output);
      };

      evoluChannel.port2.postMessage({
        type: "UseOwner",
        actions: [
          {
            owner: { owner: testAppOwner, transports: [transport] },
            action: "add",
          },
        ],
      });
      evoluChannel.port2.postMessage({
        type: "Mutate",
        changes: [
          { ownerId: testAppOwner.id, table: "todo" } as MutationChange,
        ],
        onCompleteIds: [],
        subscribedQueries: new Set([testQuery]),
      });
      time.advance("10s");
      await testWaitForWorkerMessage();

      const mutateInput = dbInputs.at(-1);
      assertNotUndefined(mutateInput);
      dbWorkerPort.postMessage({
        type: "OnQueuedResponse",
        attemptId: mutateInput.attemptId,
        response: {
          type: "ForEvolu",
          id,
          message: {
            clock: createTimestamp(),
            type: "Mutate",
            messagesByOwnerId: new Map([
              [
                testAppOwner.id,
                [testCreateCrdtMessage(createId(run.deps), 1, "closed")],
              ],
            ]),
            rowsByQuery: new Map([[testQuery, [{ value: 2 }]]]),
          },
        },
      });
      await testWaitForWorkerMessage();

      assertEqual(outputs.at(-1), {
        type: "OnPatchesByQuery",
        patchesByQuery: new Map([
          [testQuery, [{ op: "replaceAll", value: [{ value: 2 }] }]],
        ]),
        onCompleteIds: [],
      });
      assertEqual(createWebSocket.sentMessages, []);
    });

    it("serializes overlapping UseOwner add and remove across multiple transports", async () => {
      const createWebSocket = testCreateWebSocket();
      const firstCreateStarted = Promise.withResolvers<void>();
      const allowFirstCreateToFinish = Promise.withResolvers<void>();
      const transportA = createOwnerWebSocketTransport({
        url: "wss://use-owner-a.example",
        ownerId: testAppOwner.id,
      });
      const transportB = createOwnerWebSocketTransport({
        url: "wss://use-owner-b.example",
        ownerId: testAppOwner.id,
      });
      const evoluChannel = testCreateMessageChannel<EvoluOutput, EvoluInput>();

      let pausedFirstCreate = false;
      const pausingCreateWebSocket: CreateWebSocket =
        (url, options) => async (run) => {
          if (url === transportA.url && !pausedFirstCreate) {
            pausedFirstCreate = true;
            firstCreateStarted.resolve();
            evoluChannel.port2.postMessage({
              type: "UseOwner",
              actions: [
                {
                  owner: {
                    owner: testAppOwner,
                    transports: [transportB, transportA],
                  },
                  action: "remove",
                },
              ],
            });
            await allowFirstCreateToFinish.promise;
          }

          return run(createWebSocket(url, options));
        };

      await using setup = await setupSharedWorker({
        createWebSocket: pausingCreateWebSocket,
      });
      const { createEvolu } = setup;
      await createEvolu({ evoluChannel });

      evoluChannel.port2.postMessage({
        type: "UseOwner",
        actions: [
          {
            owner: {
              owner: testAppOwner,
              transports: [transportA, transportB],
            },
            action: "add",
          },
        ],
      });

      await firstCreateStarted.promise;
      await testWaitForWorkerMessage();
      allowFirstCreateToFinish.resolve();
      await testWaitForWorkerMessage();
      await testWaitForWorkerMessage();

      assertLength(createWebSocket.sentMessages, 2);
      assertEqual(
        new Set(createWebSocket.sentMessages),
        new Set([
          {
            url: transportA.url,
            data: createProtocolMessageForUnsubscribe(testAppOwner.id),
          },
          {
            url: transportB.url,
            data: createProtocolMessageForUnsubscribe(testAppOwner.id),
          },
        ]),
      );
    });
  });

  describe("tab leader changes", () => {
    it("starts a new DbWorker when tab leader changes", async () => {
      await using setup = await setupSharedWorker();
      using disposer = new DisposableStack();
      const { createEvolu } = setup;
      const { dbDisposeInputs, releaseDbWorkerLeader } = await createEvolu({
        releaseDbWorkerLeaderOnDispose: false,
      });

      await releaseDbWorkerLeader();

      const initDbWorker = await setupTabLeader(setup, disposer);

      assertEqual(dbDisposeInputs, []);
      assertSame(initDbWorker.name, testName);
    });

    it("replays fixed write inputs, rejects stale attempts, and adopts the clock after caller disposal", async () => {
      await using setup = await setupSharedWorker();
      using disposer = new DisposableStack();
      const initialClock = createTimestamp({ millis: Millis.orThrow(23) });
      const first = await setup.createEvolu({
        releaseDbWorkerLeaderOnDispose: false,
        initialClock,
      });
      const siblingId = createId<"EvoluInstance">(setup.run.deps);
      await using _siblingLock = await setup.run.ok(
        acquireLeaderLock(siblingId),
      );
      using siblingChannel = testCreateMessageChannel<
        EvoluOutput,
        EvoluInput
      >();
      const siblingOutputs: Array<EvoluOutput> = [];
      siblingChannel.port2.onMessage = (output) => {
        siblingOutputs.push(output);
      };
      setup.worker.port.postMessage(
        {
          type: "CreateEvolu",
          id: siblingId,
          name: testName,
          consoleLevel: "silent",
          sqliteSchema: testSqliteSchema,
          encryptionKey: testAppOwner.encryptionKey,
          memoryOnly: true,
          evoluPort: siblingChannel.port1.native,
        },
        [siblingChannel.port1.native],
      );
      await testWaitForWorkerMessage();

      const bytes = new Uint8Array([1, 2, 3]);
      const mutation: ExtractTyped<EvoluInput, "Mutate"> = {
        type: "Mutate",
        changes: [
          {
            ownerId: testAppOwner.id,
            ...DbChange.orThrow({
              table: "_registry",
              id: createId(setup.run.deps),
              values: { secret: bytes },
              isInsert: true,
              isDelete: null,
            }),
          },
        ],
        subscribedQueries: new Set(),
        onCompleteIds: [],
      };
      first.evoluChannel.port2.postMessage(mutation);
      siblingChannel.port2.postMessage(mutation);
      await testWaitForWorkerMessage();
      assertLength(first.dbInputs, 1);
      const original = first.dbInputs[0];
      assertTrue("clock" in original);
      const capturedNow = original.now;
      assertEqual(original.clock, initialClock);
      setup.run.deps.time.advance("10s");
      await first.releaseDbWorkerLeader();

      const inputs: Array<ExtractTyped<DbWorkerInput, "Request">> = [];
      const committedClock = createTimestamp({ millis: Millis.orThrow(1000) });
      const replaceLeader = async () => {
        const init = await setupTabLeader(setup, disposer, "silent");
        const port = disposer.use(
          testCreateMessagePort<DbWorkerOutput, DbWorkerInput>(init.port),
        );
        port.onMessage = (input) => {
          if (input.type === "Request") inputs.push(input);
        };
        port.postMessage({
          type: "LeaderAcquired",
          name: testName,
          clock: committedClock,
        });
        await testWaitForWorkerMessage();
        // A replacement leader refreshes every instance's subscribed queries.
        assertEqual(siblingOutputs.splice(0), [{ type: "RefreshQueries" }]);
        return port;
      };
      let port = await replaceLeader();
      assertSame(inputs.length, 1);
      const replay = inputs[0];
      assertTrue("clock" in replay);
      assertEqual(replay.request, original.request);
      assertEqual(replay.clock, initialClock);
      assertSame(replay.now, capturedNow);
      assertNotSame(replay.attemptId, original.attemptId);

      const response = {
        type: "OnQueuedResponse",
        attemptId: replay.attemptId,
        response: {
          type: "ForEvolu",
          id: first.id,
          message: {
            type: "Mutate",
            clock: committedClock,
            messagesByOwnerId: new Map(),
            rowsByQuery: new Map(),
          },
        },
      } satisfies DbWorkerOutput;
      // A stale response on the live port tests the ID guard independently of disposal.
      const staleClock = createTimestamp({ millis: Millis.orThrow(2000) });
      port.postMessage({
        ...response,
        attemptId: original.attemptId,
        response: {
          ...response.response,
          message: { ...response.response.message, clock: staleClock },
        },
      });
      await testWaitForWorkerMessage();
      assertSame(inputs.length, 1);
      assertEqual(siblingOutputs, []);
      // Observe the clock before a valid acknowledgement could overwrite it.
      port = await replaceLeader();
      assertSame(inputs.length, 2);
      const secondReplay = inputs[1];
      assertTrue("clock" in secondReplay);
      assertEqual(secondReplay.clock, initialClock);
      assertSame(secondReplay.now, capturedNow);
      assertEqual(secondReplay.request, original.request);
      assertNotSame(secondReplay.attemptId, replay.attemptId);
      const currentResponse = {
        ...response,
        attemptId: secondReplay.attemptId,
      };
      await first[Symbol.asyncDispose]();
      port.postMessage(currentResponse);
      await testWaitForWorkerMessage();
      assertSame(inputs.length, 3);
      // The disposed caller's committed write still refreshes the sibling.
      assertEqual(siblingOutputs.splice(0), [{ type: "RefreshQueries" }]);
      const next = inputs[2];
      assertTrue("clock" in next);
      assertEqual(next.clock, committedClock);
      assertTrue(next.now > capturedNow);

      port.postMessage(currentResponse);
      await testWaitForWorkerMessage();
      assertSame(inputs.length, 3);
      assertEqual(siblingOutputs, []);
      const finalClock = createTimestamp({ millis: Millis.orThrow(1001) });
      port.postMessage({
        ...response,
        attemptId: next.attemptId,
        response: {
          type: "ForEvolu",
          id: siblingId,
          message: {
            type: "Mutate",
            clock: finalClock,
            messagesByOwnerId: new Map(),
            rowsByQuery: new Map(),
          },
        },
      });
      await testWaitForWorkerMessage();
      assertLength(siblingOutputs, 1);
      siblingChannel.port2.postMessage(mutation);
      await testWaitForWorkerMessage();
      assertSame(inputs.length, 4);
      assertTrue("clock" in inputs[3]);
      assertEqual(inputs[3].clock, finalClock);
    });

    it("reconciles every transport after a leader replacement", async () => {
      const createWebSocket = testCreateWebSocket();
      await using setup = await setupSharedWorker({ createWebSocket });
      using disposer = new DisposableStack();
      const first = await setup.createEvolu({
        releaseDbWorkerLeaderOnDispose: false,
      });
      const transportA = createOwnerWebSocketTransport({
        url: "wss://replayed-a.example",
        ownerId: testAppOwner.id,
      });
      const transportB = createOwnerWebSocketTransport({
        url: "wss://replayed-b.example",
        ownerId: testAppOwner.id,
      });
      first.evoluChannel.port2.postMessage({
        type: "UseOwner",
        actions: [
          {
            action: "add",
            owner: {
              owner: testAppOwner,
              transports: [transportA, transportB],
            },
          },
        ],
      });
      await testWaitForWorkerMessage();
      await respondToSyncRound(first, createWebSocket);
      await respondToSyncRound(first, createWebSocket);
      first.dbInputs.length = 0;

      // The frame reaches the first leader, which is replaced before it
      // responds.
      createWebSocket.message(
        transportA.url,
        protocolMessageToArrayBuffer(
          createProtocolMessageForUnsubscribe(testAppOwner.id),
        ),
      );
      setup.run.deps.time.advance("10s");
      await testWaitForWorkerMessage();
      assertSame(first.dbInputs.length, 1);
      await first.releaseDbWorkerLeader();

      const init = await setupTabLeader(setup, disposer, "silent");
      const dbWorkerPort = disposer.use(
        testCreateMessagePort<DbWorkerOutput, DbWorkerInput>(init.port),
      );
      const dbInputs: Array<ExtractTyped<DbWorkerInput, "Request">> = [];
      dbWorkerPort.onMessage = (input) => {
        if (input.type === "Request") dbInputs.push(input);
      };
      dbWorkerPort.postMessage({
        type: "LeaderAcquired",
        name: testName,
        clock: createTimestamp(),
      });
      await testWaitForWorkerMessage();
      const replacement = { dbInputs, dbWorkerPort };
      assertSame(dbInputs.length, 1);
      assertEqual(dbInputs[0]?.request, first.dbInputs[0]?.request);

      // The replay stores nothing because the first attempt may have, so the
      // owner reconciles through every transport after the replay.
      await respondToApplySync(replacement, false, {
        ok: true,
        value: { type: "Converged" },
      });
      assertSame(dbInputs.length, 2);
      assertEqual(
        new Set(await respondToSyncRound(replacement, createWebSocket)),
        new Set([transportA.url, transportB.url]),
      );
    });

    it("retries an in-flight read and keeps the session clock when the replacement reports an older clock", async () => {
      await using setup = await setupSharedWorker();
      using disposer = new DisposableStack();
      const { createEvolu } = setup;
      const initialClock = createTimestamp({ millis: Millis.orThrow(23) });
      const {
        dbInputs,
        dbWorkerPort: oldDbWorkerPort,
        evoluChannel,
        id,
        releaseDbWorkerLeader,
      } = await createEvolu({
        releaseDbWorkerLeaderOnDispose: false,
        initialClock,
      });
      const evoluOutputs: Array<EvoluOutput> = [];
      evoluChannel.port2.onMessage = (output) => {
        evoluOutputs.push(output);
      };

      evoluChannel.port2.postMessage({
        type: "Query",
        queries: createSet([testQuery]),
      });

      await testWaitForWorkerMessage();

      const firstInput = dbInputs[0];
      assertNotUndefined(firstInput);

      await releaseDbWorkerLeader();

      const initDbWorker = await setupTabLeader(setup, disposer);

      using dbWorkerPort = testCreateMessagePort<DbWorkerOutput, DbWorkerInput>(
        initDbWorker.port,
      );
      const nextDbInputs: Array<Exclude<DbWorkerInput, { type: "Dispose" }>> =
        [];
      dbWorkerPort.onMessage = (input) => {
        if (input.type !== "Dispose") nextDbInputs.push(input);
      };

      // An empty memoryOnly replacement starts with a fresh clock and node ID.
      dbWorkerPort.postMessage({
        clock: createTimestamp({ nodeId: maxNodeId }),
        type: "LeaderAcquired",
        name: testName,
      });
      await testWaitForWorkerMessage();
      // A replacement leader refreshes every instance's subscribed queries.
      assertEqual(evoluOutputs.splice(0), [{ type: "RefreshQueries" }]);

      assertSame(nextDbInputs.length, 1);
      const [nextInput] = nextDbInputs;
      assertNotUndefined(nextInput);
      assertEqual(nextInput, {
        type: "Request",
        attemptId: nextInput.attemptId,
        request: {
          type: "ForEvolu",
          id,
          message: {
            type: "Query",
            queries: createSet([testQuery]),
          },
        },
      });
      assertFalse(Object.is(nextInput.attemptId, firstInput.attemptId));

      const response: DbWorkerOutput = {
        type: "OnQueuedResponse",
        attemptId: firstInput.attemptId,
        response: {
          type: "ForEvolu",
          id,
          message: {
            type: "Query",
            rowsByQuery: new Map([[testQuery, []]]),
          },
        },
      };
      oldDbWorkerPort.postMessage(response);
      await testWaitForWorkerMessage();

      assertEqual(evoluOutputs, []);

      dbWorkerPort.postMessage({ ...response, attemptId: nextInput.attemptId });
      await testWaitForWorkerMessage();
      evoluChannel.port2.postMessage({
        type: "Mutate",
        changes: [
          {
            ownerId: testAppOwner.id,
            ...testCreateCrdtMessage(createId(setup.run.deps), 1, "fresh")
              .change,
          },
        ],
        onCompleteIds: [],
        subscribedQueries: new Set(),
      });
      await testWaitForWorkerMessage();
      assertLength(nextDbInputs, 2);
      const fresh = nextDbInputs[1];
      assertTrue("clock" in fresh);
      assertEqual(fresh.clock, initialClock);
    });

    it("keeps the replacement leader's clock after a stale local-only replay and refreshes subscribed queries", async () => {
      await using setup = await setupSharedWorker();
      using disposer = new DisposableStack();
      const initialClock = createTimestamp({ millis: Millis.orThrow(23) });
      const instance = await setup.createEvolu({
        releaseDbWorkerLeaderOnDispose: false,
        initialClock,
      });
      const evoluOutputs: Array<EvoluOutput> = [];
      instance.evoluChannel.port2.onMessage = (output) => {
        evoluOutputs.push(output);
      };
      const mutation: ExtractTyped<EvoluInput, "Mutate"> = {
        type: "Mutate",
        changes: [
          {
            ownerId: testAppOwner.id,
            ...DbChange.orThrow({
              table: "_registry",
              id: createId(setup.run.deps),
              values: { secret: new Uint8Array([1, 2, 3]) },
              isInsert: true,
              isDelete: null,
            }),
          },
        ],
        subscribedQueries: new Set(),
        onCompleteIds: [],
      };

      // A write is in flight when the leader is lost.
      instance.evoluChannel.port2.postMessage(mutation);
      await testWaitForWorkerMessage();
      assertLength(instance.dbInputs, 1);
      const original = instance.dbInputs[0];
      assertTrue("clock" in original);
      assertEqual(original.clock, initialClock);
      await instance.releaseDbWorkerLeader();

      const leaderChannel = disposer.use(
        testCreateMessageChannel<SharedWorkerInput, SharedWorkerOutput>(),
      );
      const leaderOutputs: Array<SharedWorkerOutput> = [];
      leaderChannel.port1.onMessage = (output) => {
        leaderOutputs.push(output);
      };
      assertNonNullable(setup.worker.self.onConnect);
      setup.worker.self.onConnect(leaderChannel.port2);
      leaderChannel.port1.postMessage({
        type: "AnnounceTabLeader",
        consoleLevel: "silent",
      });
      await testWaitForWorkerMessage();
      await testWaitForWorkerMessage();
      const init = getDbWorkerInit(
        leaderOutputs.find((output) => output.type === "DbWorkerInit"),
      );
      const port = disposer.use(
        testCreateMessagePort<DbWorkerOutput, DbWorkerInput>(init.port),
      );
      const inputs: Array<ExtractTyped<DbWorkerInput, "Request">> = [];
      port.onMessage = (input) => {
        if (input.type === "Request") inputs.push(input);
      };
      assertEqual(evoluOutputs, []);

      // The new leader's stored clock advanced at startup, for example by
      // releasing drift quarantine. Its acquisition refreshes subscribed
      // queries, and the pending write is retried with its captured clock.
      const startupClock = createTimestamp({ millis: Millis.orThrow(1000) });
      port.postMessage({
        type: "LeaderAcquired",
        name: testName,
        clock: startupClock,
      });
      await testWaitForWorkerMessage();
      assertEqual(evoluOutputs.splice(0), [{ type: "RefreshQueries" }]);
      assertSame(inputs.length, 1);
      const replay = inputs[0];
      assertTrue("clock" in replay);
      assertEqual(replay.clock, initialClock);

      // A local-only replay reports its captured clock. The session clock
      // stays at the leader's, so the next write sorts after whatever the
      // leader applied.
      port.postMessage({
        type: "OnQueuedResponse",
        attemptId: replay.attemptId,
        response: {
          type: "ForEvolu",
          id: instance.id,
          message: {
            type: "Mutate",
            clock: initialClock,
            messagesByOwnerId: new Map(),
            rowsByQuery: new Map(),
          },
        },
      });
      await testWaitForWorkerMessage();
      instance.evoluChannel.port2.postMessage(mutation);
      await testWaitForWorkerMessage();
      assertSame(inputs.length, 2);
      const fresh = inputs[1];
      assertTrue("clock" in fresh);
      assertEqual(fresh.clock, startupClock);
    });
  });

  describe("disposal", () => {
    it("removes owner claims when tenant is disposed with a live instance", async () => {
      const createWebSocket = testCreateWebSocket();
      await using setup = await setupSharedWorker({ createWebSocket });
      const { createEvolu } = setup;
      const { evoluChannel } = await createEvolu({
        autoDispose: false,
      });
      const transport = createOwnerWebSocketTransport({
        url: "wss://tenant-dispose.example",
        ownerId: testAppOwner.id,
      });

      evoluChannel.port2.postMessage({
        type: "UseOwner",
        actions: [
          {
            owner: { owner: testAppOwner, transports: [transport] },
            action: "add",
          },
        ],
      });
      await testWaitForWorkerMessage();

      assertEqual(createWebSocket.createdUrls, [transport.url]);

      await setup[Symbol.asyncDispose]();
      await testWaitForWorkerMessage();

      assertEqual(createWebSocket.sentMessages.at(-1), {
        url: transport.url,
        data: createProtocolMessageForUnsubscribe(testAppOwner.id),
      });
    });

    it("releases every transport set of an owner when the instance is disposed", async () => {
      const createWebSocket = testCreateWebSocket();
      await using setup = await setupSharedWorker({ createWebSocket });
      const instance = await setup.createEvolu({ autoDispose: false });
      const transports = [
        createOwnerWebSocketTransport({
          url: "wss://dispose-sets-a.example",
          ownerId: testAppOwner.id,
        }),
        createOwnerWebSocketTransport({
          url: "wss://dispose-sets-b.example",
          ownerId: testAppOwner.id,
        }),
      ] as const;

      instance.evoluChannel.port2.postMessage({
        type: "UseOwner",
        actions: transports.map((transport) => ({
          action: "add" as const,
          owner: { owner: testAppOwner, transports: [transport] },
        })),
      });
      await testWaitForWorkerMessage();
      createWebSocket.sentMessages.length = 0;

      await instance[Symbol.asyncDispose]();

      assertEqual(
        new Set(createWebSocket.sentMessages),
        new Set(
          transports.map(({ url }) => ({
            url,
            data: createProtocolMessageForUnsubscribe(testAppOwner.id),
          })),
        ),
      );
      assertEqual(setup.run.deps.reportDefect.getDefects(), []);
    });

    it("waits for DbWorker leader lock during tenant disposal", async () => {
      await using setup = await setupSharedWorker();
      const { createEvolu } = setup;
      const { dbDisposeInputs, releaseDbWorkerLeader } = await createEvolu({
        releaseDbWorkerLeaderOnDispose: false,
        autoDispose: false,
      });
      let disposed = false;

      const disposing = setup[Symbol.asyncDispose]().then(() => {
        disposed = true;
      });

      await testWaitForWorkerMessage();

      assertEqual(dbDisposeInputs, [{ type: "Dispose" }]);
      assertFalse(disposed);

      await releaseDbWorkerLeader();
      await disposing;

      assertTrue(disposed);
    });

    it("stops a replacement DbWorker that acquires the lock during tenant disposal", async () => {
      await using setup = await setupSharedWorker();
      await using disposer = new AsyncDisposableStack();
      const { releaseDbWorkerLeader } = await setup.createEvolu({
        releaseDbWorkerLeaderOnDispose: false,
        autoDispose: false,
      });
      // A later tab leader hosts a replacement while the current DbWorker
      // still runs, so the replacement waits for its lock.
      const initDbWorker = await setupTabLeader(setup, disposer);
      const replacementPort = disposer.use(
        testCreateMessagePort<DbWorkerOutput, DbWorkerInput>(initDbWorker.port),
      );
      const replacement = disposer.use(new AsyncDisposableStack());
      const replacementInputs: Array<DbWorkerInput> = [];
      replacementPort.onMessage = (input) => {
        replacementInputs.push(input);
        void replacement.disposeAsync();
      };
      const replacementRun = disposer.use(
        testCreateRun({ lockManager: setup.run.deps.lockManager }),
      );
      const replacementLock = replacementRun.ok(acquireLeaderLock(testName));

      const disposing = setup[Symbol.asyncDispose]();
      await testWaitForWorkerMessage();
      await releaseDbWorkerLeader();
      replacement.use(await replacementLock);
      replacementPort.postMessage({
        type: "LeaderAcquired",
        name: testName,
        clock: createTimestamp(),
      });
      await testWaitForWorkerMessage();

      assertEqual(replacementInputs, [{ type: "Dispose" }]);
      await disposing;
    });

    it("disposes cleanly when queued sync resumes during tenant disposal", async () => {
      const createWebSocket = testCreateWebSocket({ isOpen: false });
      const creating = Promise.withResolvers<void>();
      const continueCreating = Promise.withResolvers<void>();
      await using setup = await setupSharedWorker({
        createWebSocket: (url, options) => async (run) => {
          creating.resolve();
          await continueCreating.promise;
          return run(createWebSocket(url, options));
        },
      });
      const instance = await setup.createEvolu({
        autoDispose: false,
        releaseDbWorkerLeaderOnDispose: false,
      });
      const transport = createOwnerWebSocketTransport({
        url: "wss://sync-during-dispose.example",
        ownerId: testAppOwner.id,
      });
      instance.evoluChannel.port2.postMessage({
        type: "UseOwner",
        actions: [
          {
            action: "add",
            owner: { owner: testAppOwner, transports: [transport] },
          },
          { action: "sync", ownerId: testAppOwner.id },
        ],
      });
      await creating.promise;

      const disposing = Promise.allSettled([setup[Symbol.asyncDispose]()]);
      try {
        await testWaitForWorkerMessage();
        assertEqual(instance.dbDisposeInputs, [{ type: "Dispose" }]);

        continueCreating.resolve();
        await testWaitForWorkerMessage();

        assertEqual(setup.run.deps.reportDefect.getDefects(), []);
        assertEqual(instance.dbInputs, []);
      } finally {
        continueCreating.resolve();
        await instance[Symbol.asyncDispose]();
        await disposing;
      }

      assertEqual(await disposing, [{ status: "fulfilled", value: undefined }]);
      assertEqual(setup.run.deps.reportDefect.getDefects(), []);
    });

    it("drops UseOwner messages posted after instance disposal starts", async () => {
      const createWebSocket = testCreateWebSocket();
      await using setup = await setupSharedWorker({ createWebSocket });
      const { createEvolu } = setup;
      const { evoluChannel, [Symbol.asyncDispose]: disposeInstance } =
        await createEvolu();
      const transport = createOwnerWebSocketTransport({
        url: "wss://after-dispose.example",
        ownerId: testAppOwner.id,
      });

      const disposed = disposeInstance();

      evoluChannel.port2.postMessage({
        type: "UseOwner",
        actions: [
          {
            owner: { owner: testAppOwner, transports: [transport] },
            action: "add",
          },
        ],
      });

      await disposed;
      await testWaitForWorkerMessage();

      assertEqual(createWebSocket.createdUrls, []);
    });

    it("releases pending instance lock if tenant disposal wins the acquisition race", async () => {
      await using setup = await setupSharedWorker();
      const { createEvolu } = setup;
      const { [Symbol.asyncDispose]: disposeInstance } = await createEvolu({
        autoDispose: false,
      });

      const disposeSetup = setup[Symbol.asyncDispose]();
      await testWaitForWorkerMessage();
      await disposeInstance();
      await disposeSetup;
    });
  });
});

describe("local delivery between databases", () => {
  it("copies mutations once to each writable sibling while sockets are closed", async () => {
    const createWebSocket = testCreateWebSocket({ isOpen: false });
    await using setup = await setupSharedWorker({ createWebSocket });
    const writer = await setup.createEvolu();
    const siblings = [
      await setup.createEvolu({ tenantName: Name.orThrow("local-sibling-a") }),
      await setup.createEvolu({ tenantName: Name.orThrow("local-sibling-b") }),
    ];
    const readonly = await setup.createEvolu({
      tenantName: Name.orThrow("local-readonly"),
    });
    const unrelated = await setup.createEvolu({
      tenantName: Name.orThrow("local-unrelated"),
    });
    const transports = [
      createOwnerWebSocketTransport({
        url: "wss://local-mutation-a.example",
        ownerId: testAppOwner.id,
      }),
      createOwnerWebSocketTransport({
        url: "wss://local-mutation-b.example",
        ownerId: testAppOwner.id,
      }),
    ] as const;
    const syncOwner = { owner: testAppOwner, transports };
    for (const instance of [writer, ...siblings]) {
      instance.evoluChannel.port2.postMessage({
        type: "UseOwner",
        actions: [
          { action: "add", owner: syncOwner },
          { action: "add", owner: syncOwner },
        ],
      });
    }
    readonly.evoluChannel.port2.postMessage({
      type: "UseOwner",
      actions: [
        {
          action: "add",
          owner: {
            owner: {
              id: testAppOwner.id,
              encryptionKey: testAppOwner.encryptionKey,
            },
            transports,
          },
        },
      ],
    });
    unrelated.evoluChannel.port2.postMessage({
      type: "UseOwner",
      actions: [{ action: "add", owner: { owner: testAppOwner2, transports } }],
    });
    await testWaitForWorkerMessage();
    for (const instance of [writer, ...siblings, readonly, unrelated]) {
      assertEqual(instance.dbInputs, []);
    }
    const outputsBySibling = siblings.map((instance) => {
      const outputs: Array<EvoluOutput> = [];
      instance.evoluChannel.port2.onMessage = (output) => {
        outputs.push(output);
      };
      return outputs;
    });
    const message = testCreateCrdtMessage(
      createId(setup.run.deps),
      1,
      "copied locally",
    );

    // A replay can offer the same stored messages again; each sibling's
    // idempotent application decides whether its queries need refreshing.
    for (const didWriteMessages of [true, false]) {
      writer.evoluChannel.port2.postMessage({
        type: "Mutate",
        changes: [{ ...message.change, ownerId: testAppOwner.id }],
        onCompleteIds: [],
        subscribedQueries: new Set(),
      });
      await testWaitForWorkerMessage();
      const mutation = writer.dbInputs.at(-1);
      assertNotUndefined(mutation);
      assertSame(mutation.request.type, "ForEvolu");
      assertSame(mutation.request.message.type, "Mutate");
      writer.dbWorkerPort.postMessage({
        type: "OnQueuedResponse",
        attemptId: mutation.attemptId,
        response: {
          type: "ForEvolu",
          id: writer.id,
          message: {
            type: "Mutate",
            clock: createTimestamp(),
            messagesByOwnerId: new Map([[testAppOwner.id, [message]]]),
            rowsByQuery: new Map(),
          },
        },
      });
      await testWaitForWorkerMessage();

      for (const [index, sibling] of siblings.entries()) {
        assertLength(sibling.dbInputs, 1);
        const input = sibling.dbInputs[0];
        assertSame(input.request.type, "ForSharedWorker");
        assertSame(input.request.message.type, "ApplySyncMessage");
        assertEqual(input.request.message.owner, testAppOwner);
        const header = parseProtocolHeader(input.request.message.inputMessage);
        assertOk(header);
        assertSame(header.value.ownerId, testAppOwner.id);
        assertSame(header.value.messageType, MessageType.Broadcast);
        await respondToApplySync(sibling, didWriteMessages, {
          ok: true,
          value: { type: "Broadcast" },
        });
        assertLength(sibling.dbInputs, 1);
        assertEqual(
          outputsBySibling[index].splice(0),
          didWriteMessages ? [{ type: "RefreshQueries" }] : [],
        );
        sibling.dbInputs.splice(0);
      }
      assertLength(writer.dbInputs, 1);
      writer.dbInputs.splice(0);
      assertEqual(readonly.dbInputs, []);
      assertEqual(unrelated.dbInputs, []);
      assertEqual(createWebSocket.sentMessages, []);
    }
  });

  it("reconciles new continuation copies through other relays and ignores duplicates", async () => {
    const createWebSocket = testCreateWebSocket();
    await using setup = await setupSharedWorker({ createWebSocket });
    const source = await setup.createEvolu();
    const sibling = await setup.createEvolu({
      tenantName: Name.orThrow("continuation-sibling"),
    });
    const transports = [
      createOwnerWebSocketTransport({
        url: "wss://local-continuation-a.example",
        ownerId: testAppOwner.id,
      }),
      createOwnerWebSocketTransport({
        url: "wss://local-continuation-b.example",
        ownerId: testAppOwner.id,
      }),
    ] as const;
    for (const instance of [source, sibling]) {
      instance.evoluChannel.port2.postMessage({
        type: "UseOwner",
        actions: [
          { action: "add", owner: { owner: testAppOwner, transports } },
        ],
      });
      await testWaitForWorkerMessage();
      await respondToSyncRound(instance, createWebSocket);
      await respondToSyncRound(instance, createWebSocket);
      instance.dbInputs.splice(0);
    }
    const siblingOutputs: Array<EvoluOutput> = [];
    sibling.evoluChannel.port2.onMessage = (output) => {
      siblingOutputs.push(output);
    };
    const continuation = createProtocolMessageForUnsubscribe(testAppOwner.id);
    const broadcast = createProtocolMessageBuffer(testAppOwner.id, {
      messageType: MessageType.Broadcast,
    }).unwrap();

    for (const didWriteMessages of [true, false]) {
      createWebSocket.message(
        transports[0].url,
        protocolMessageToArrayBuffer(continuation),
      );
      await testWaitForWorkerMessage();
      assertLength(source.dbInputs, 1);
      assertSame(sibling.dbInputs.length, 1);
      await respondToApplySync(source, false, {
        ok: true,
        value: { type: "Response", message: continuation, broadcast },
      });
      assertEqual(createWebSocket.sentMessages.splice(0), [
        { url: transports[0].url, data: continuation },
      ]);

      // The sibling was also processing the network frame. Its local copy
      // must wait in the same queue until that earlier work finishes.
      assertSame(sibling.dbInputs.length, 1);
      await respondToApplySync(sibling, false, {
        ok: true,
        value: { type: "Converged" },
      });
      assertSame(sibling.dbInputs.length, 2);
      const localInput = sibling.dbInputs[1];
      assertNotUndefined(localInput);
      assertSame(localInput.request.type, "ForSharedWorker");
      assertSame(localInput.request.message.type, "ApplySyncMessage");
      assertEqual(localInput.request.message.inputMessage, broadcast);
      await respondToApplySync(sibling, didWriteMessages, {
        ok: true,
        value: { type: "Broadcast" },
      });
      assertEqual(
        siblingOutputs.splice(0),
        didWriteMessages ? [{ type: "RefreshQueries" }] : [],
      );
      assertLength(source.dbInputs, 1);
      assertSame(sibling.dbInputs.length, didWriteMessages ? 3 : 2);
      assertEqual(createWebSocket.sentMessages, []);
      if (didWriteMessages) {
        assertEqual(await respondToSyncRound(sibling, createWebSocket), [
          transports[1].url,
        ]);
      }
      source.dbInputs.splice(0);
      sibling.dbInputs.splice(0);
    }
  });
});

describe("with multiple evolu instances", () => {
  it.todo("coordinates shared tenant state across instances");
});

describe("with multiple tabs", () => {
  it.todo("coordinates tab leader changes across connected tabs");
});

describe("DbWorkerInput", () => {
  it("requires clock and time on write envelopes", () => {
    const deps = testCreateDeps();
    const request = {
      type: "ForSharedWorker" as const,
      message: {
        type: "ApplySyncMessage" as const,
        owner: testAppOwner,
        inputMessage: new Uint8Array(),
      },
    };
    const attemptId = createId(deps);
    // @ts-expect-error Write requests require clock and now in the envelope.
    const _missingContext: DbWorkerInput = {
      type: "Request",
      attemptId,
      request,
    };
    // @ts-expect-error Write requests require now as well as clock.
    const _missingTime: DbWorkerInput = {
      type: "Request",
      attemptId,
      request,
      clock: createTimestamp(),
    };
    const valid: DbWorkerInput = {
      type: "Request",
      attemptId,
      request,
      clock: createTimestamp(),
      now: deps.time.now(),
    };
    assertType<typeof valid.now, Millis>();
  });
});

describe("startup refusal", () => {
  const refusal: UnsupportedDbVersionError = {
    type: "UnsupportedDbVersionError",
    storedVersion: PositiveInt.orThrow(2),
    supportedVersion: PositiveInt.orThrow(1),
  };
  const createEvoluInput = (
    id: EvoluInstanceId,
    evoluPort: NativeMessagePort<EvoluOutput, EvoluInput>,
  ): SharedWorkerInput => ({
    type: "CreateEvolu",
    name: testName,
    id,
    consoleLevel: "debug",
    sqliteSchema: testSqliteSchema,
    encryptionKey: testAppOwner.encryptionKey,
    memoryOnly: false,
    evoluPort,
  });

  it("reports the refused database in sync state", async () => {
    await using setup = await setupSharedWorker();
    using disposer = new DisposableStack();
    const { latest } = setupSyncStates(setup, disposer);
    const instance = await setup.createEvoluBeforeDbWorkerLeader();
    instance.dbWorkerPort.postMessage({
      type: "LeaderRefused",
      name: testName,
      error: refusal,
    });
    await testWaitForWorkerMessage();
    assertEqual(latest().tenants, [
      { name: testName, refused: true, owners: [] },
    ]);
  });

  it("tells each tab once, drops requests, and starts no more workers", async () => {
    await using setup = await setupSharedWorker();
    await using disposer = new AsyncDisposableStack();
    using errors = testCreateBroadcastChannel<ConsoleEntryOrError>(
      consoleEntryOrErrorBroadcastChannelName,
    );
    const broadcasts: Array<ConsoleEntryOrError> = [];
    errors.onMessage = (output) => {
      broadcasts.push(output);
    };

    const instance = await setup.createEvoluBeforeDbWorkerLeader();
    const evoluOutputs: Array<EvoluOutput> = [];
    instance.evoluChannel.port2.onMessage = (output) => {
      evoluOutputs.push(output);
    };
    const firstTabOutputs = () =>
      setup.sharedWorkerOutputs.filter((output) => output.type === "Error");
    // Buffered in the message port until the instance is added after refusal,
    // then dropped by the instance guard without entering the tenant's queue.
    instance.evoluChannel.port2.postMessage({
      type: "Query",
      queries: createSet([testQuery]),
    });
    await testWaitForWorkerMessage();
    assertEqual(instance.dbInputs, []);

    instance.dbWorkerPort.postMessage({
      type: "LeaderRefused",
      name: testName,
      error: refusal,
    });
    await testWaitForWorkerMessage();
    // The tab is told through its own connection, not the broadcast channel,
    // and its instance is not answered: pending work stays pending.
    assertEqual(firstTabOutputs(), [{ type: "Error", error: refusal }]);
    assertEqual(broadcasts, []);
    assertEqual(evoluOutputs, []);

    // Later requests are dropped without a response.
    instance.evoluChannel.port2.postMessage({
      type: "Query",
      queries: createSet([testQuery]),
    });
    instance.evoluChannel.port2.postMessage({
      type: "Mutate",
      changes: [
        {
          ownerId: testAppOwner.id,
          ...testCreateCrdtMessage(createId(setup.run.deps), 1, "dropped")
            .change,
        },
      ],
      onCompleteIds: [createId(setup.run.deps)],
      subscribedQueries: new Set(),
    });
    await testWaitForWorkerMessage();
    assertEqual(instance.dbInputs, []);
    assertEqual(evoluOutputs, []);

    // Another instance in the same tab does not repeat the message.
    const secondId = createId<"EvoluInstance">(setup.run.deps);
    disposer.use(await setup.run.ok(acquireLeaderLock(secondId)));
    const secondChannel = disposer.use(
      testCreateMessageChannel<EvoluOutput, EvoluInput>(),
    );
    const secondOutputs: Array<EvoluOutput> = [];
    secondChannel.port2.onMessage = (output) => {
      secondOutputs.push(output);
    };
    setup.worker.port.postMessage(
      createEvoluInput(secondId, secondChannel.port1.native),
    );
    await testWaitForWorkerMessage();
    assertEqual(firstTabOutputs(), [{ type: "Error", error: refusal }]);
    assertEqual(secondOutputs, []);

    // A tab that connects later is told once, through its own connection.
    const laterTab = setupTab(setup, disposer);
    const laterId = createId<"EvoluInstance">(setup.run.deps);
    disposer.use(await setup.run.ok(acquireLeaderLock(laterId)));
    const laterChannel = disposer.use(
      testCreateMessageChannel<EvoluOutput, EvoluInput>(),
    );
    laterTab.port.postMessage(
      createEvoluInput(laterId, laterChannel.port1.native),
    );
    await testWaitForWorkerMessage();
    assertEqual(laterTab.outputs, [{ type: "Error", error: refusal }]);

    // Announcing that tab as leader starts no worker for the refused database.
    laterTab.port.postMessage({
      type: "AnnounceTabLeader",
      consoleLevel: "debug",
    });
    await testWaitForWorkerMessage();
    await testWaitForWorkerMessage();
    assertEqual(laterTab.outputs, [{ type: "Error", error: refusal }]);
    assertEqual(firstTabOutputs(), [{ type: "Error", error: refusal }]);
    assertEqual(evoluOutputs, []);
    assertEqual(broadcasts, []);
  });

  it("makes a replacement refusal terminal and drops the in-flight write", async () => {
    await using setup = await setupSharedWorker();
    await using disposer = new AsyncDisposableStack();
    using errors = testCreateBroadcastChannel<ConsoleEntryOrError>(
      consoleEntryOrErrorBroadcastChannelName,
    );
    const broadcasts: Array<ConsoleEntryOrError> = [];
    errors.onMessage = (output) => {
      broadcasts.push(output);
    };
    const instance = await setup.createEvolu({
      releaseDbWorkerLeaderOnDispose: false,
    });
    const evoluOutputs: Array<EvoluOutput> = [];
    instance.evoluChannel.port2.onMessage = (output) => {
      evoluOutputs.push(output);
    };
    const outputCount = setup.sharedWorkerOutputs.length;
    instance.evoluChannel.port2.postMessage({
      type: "Mutate",
      changes: [
        {
          ownerId: testAppOwner.id,
          ...testCreateCrdtMessage(createId(setup.run.deps), 1, "in flight")
            .change,
        },
      ],
      onCompleteIds: [createId(setup.run.deps)],
      subscribedQueries: new Set(),
    });
    await testWaitForWorkerMessage();
    assertLength(instance.dbInputs, 1);
    const [inFlight] = instance.dbInputs;
    await instance.releaseDbWorkerLeader();

    const initDbWorker = await setupTabLeader(setup, disposer);
    using leaderPort = testCreateMessagePort<DbWorkerOutput, DbWorkerInput>(
      initDbWorker.port,
    );
    const leaderInputs: Array<DbWorkerInput> = [];
    leaderPort.onMessage = (input) => {
      leaderInputs.push(input);
    };
    leaderPort.postMessage({
      type: "LeaderRefused",
      name: testName,
      error: refusal,
    });
    await testWaitForWorkerMessage();
    // The write is not replayed and its completion never fires. The tab that
    // owns the instance is told once.
    assertEqual(leaderInputs, []);
    assertEqual(evoluOutputs, []);
    assertEqual(setup.sharedWorkerOutputs.slice(outputCount), [
      { type: "Error", error: refusal },
    ]);
    assertEqual(broadcasts, []);

    // A late response from the retired leader changes nothing.
    instance.dbWorkerPort.postMessage({
      type: "OnQueuedResponse",
      attemptId: inFlight.attemptId,
      response: {
        type: "ForEvolu",
        id: instance.id,
        message: {
          type: "Mutate",
          clock: createTimestamp(),
          messagesByOwnerId: new Map(),
          rowsByQuery: new Map(),
        },
      },
    });
    await testWaitForWorkerMessage();
    assertEqual(evoluOutputs, []);
  });

  it("disposes a worker already requested before another worker refused startup", async () => {
    await using setup = await setupSharedWorker();
    await using disposer = new AsyncDisposableStack();
    const instance = await setup.createEvoluBeforeDbWorkerLeader();
    const initDbWorker = await setupTabLeader(setup, disposer);
    using leaderPort = testCreateMessagePort<DbWorkerOutput, DbWorkerInput>(
      initDbWorker.port,
    );
    const leaderInputs: Array<DbWorkerInput> = [];
    leaderPort.onMessage = (input) => {
      leaderInputs.push(input);
    };

    instance.dbWorkerPort.postMessage({
      type: "LeaderRefused",
      name: testName,
      error: refusal,
    });
    await testWaitForWorkerMessage();
    leaderPort.postMessage({
      type: "LeaderAcquired",
      name: testName,
      clock: createTimestamp(),
    });
    await testWaitForWorkerMessage();
    assertEqual(leaderInputs, [{ type: "Dispose" }]);
  });
});
