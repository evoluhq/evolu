import { describe, it } from "node:test";
import { sql as kyselySql } from "kysely";

import {
  assert,
  assertEqual,
  assertFalse,
  assertInstanceOf,
  assertLength,
  assertNonNullable,
  assertNotUndefined,
  assertNotSame,
  assertSame,
  assertTrue,
} from "../Assert.ts";
import type { ConsoleEntry, ConsoleLevel } from "../Console.ts";
import type { DbWorkerInit, UnsupportedDbVersionError } from "./Db.ts";
import {
  createAppOwner,
  createOwnerSecret,
  createOwnerWebSocketTransport,
  testAppOwner,
} from "./Owner.ts";
import {
  createProtocolMessageBuffer,
  createProtocolMessageForUnsubscribe,
  MessageType,
  SubscriptionFlags,
} from "./Protocol.ts";
import {
  createQueryBuilder,
  type EvoluSchema,
  type MutationChange,
} from "./Schema.ts";
import {
  consoleEntryOrErrorBroadcastChannelName,
  type EvoluInstanceId,
  initSharedWorker,
  type ConsoleEntryOrError,
  type DbWorkerInput,
  type DbWorkerOutput,
  type DbWorkerQueuedResponse,
  type EvoluInput,
  type EvoluOutput,
  type SharedWorkerInput,
  type SharedWorkerOutput,
} from "./Shared.ts";
import type { NativeMessagePort } from "../Worker.ts";
import { DbChange, testCreateCrdtMessage } from "./Storage.ts";
import {
  createTimestamp,
  maxCounter,
  maxNodeId,
  type Timestamp,
} from "./Timestamp.ts";
import { acquireLeaderLock, testCreateLockManager } from "../LockManager.ts";
import { installPolyfills } from "../Polyfills.ts";
import { createSet } from "../Set.ts";
import type { SqliteSchema } from "../Sqlite.ts";
import { createStore } from "../Store.ts";
import { AbortError, testCreateDeps, testCreateRun } from "../Task.ts";
import { testCreateId } from "../Test.ts";
import { maxMillis, Millis } from "../Time.ts";
import {
  assertType,
  createId,
  id,
  Name,
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
}: {
  createWebSocket?: CreateWebSocket;
} = {}) => {
  await using disposer = new AsyncDisposableStack();
  const createTestId = testCreateId();

  const consoleStoreOutputEntry = createStore<ConsoleEntry | null>(null);
  const worker = disposer.use(
    testCreateSharedWorker<SharedWorkerInput, SharedWorkerOutput>(),
  );
  const sharedWorkerOutputs: Array<SharedWorkerOutput> = [];
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
    }),
  );

  disposer.use(await run.ok(initSharedWorker(worker.self)));
  worker.connect();
  worker.port.onMessage = (output) => {
    sharedWorkerOutputs.push(output);
    sharedWorkerOutput.resolve();
    sharedWorkerOutput = Promise.withResolvers<void>();
  };

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
  const outputs: Array<SharedWorkerOutput> = [];
  channel.port1.onMessage = (output) => {
    outputs.push(output);
  };
  assertNonNullable(setup.worker.self.onConnect);
  setup.worker.self.onConnect(channel.port2);
  return { port: channel.port1, outputs };
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
): Promise<Array<string>> => {
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
        protocolMessagesByOwnerId: new Map([
          [
            testAppOwner.id,
            createProtocolMessageForUnsubscribe(testAppOwner.id),
          ],
        ]),
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
        ownerId: testAppOwner.id,
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

      evoluChannel.port2.postMessage({
        type: "Mutate",
        changes: [{} as MutationChange],
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
          changes: [{}],
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

      first.evoluChannel.port2.postMessage({
        type: "Mutate",
        changes: [{} as MutationChange],
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
          changes: [{}],
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
          },
        },
      });
      await testWaitForWorkerMessage();

      evoluChannel.port2.postMessage({
        type: "Mutate",
        changes: [{ ownerId: testAppOwner.id } as MutationChange],
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

      const continuation = createProtocolMessageForUnsubscribe(testAppOwner.id);
      for (const transport of transports) {
        createWebSocket.message(
          transport.url,
          protocolMessageToArrayBuffer(continuation),
        );
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
        time.advance("10s");
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
        value: { type: "NoResponse" },
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
        value: { type: "NoResponse" },
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
        value: { type: "NoResponse" },
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

        // A sibling instance without an owner registration relies on rounds to
        // upload its mutations.
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
          changes: [{} as MutationChange],
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

        // This sibling does not upload its mutation, so the later round must
        // read that write and send it through the requested transport.
        assertEqual(createWebSocket.sentMessages, []);
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
        value: { type: "NoResponse" },
      });
      assertEqual(
        new Set(await respondToSyncRound(instance, createWebSocket)),
        new Set(transports.map(({ url }) => url)),
      );
      await respondToApplySync(instance, false, {
        ok: true,
        value: { type: "NoResponse" },
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
      // Mutation uploads depend on the writing instance's registrations.
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
      assertSame(first.dbInputs.length, 1);
      assertEqual(createWebSocket.sentMessages, []);
      first.dbInputs.length = 0;

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
        changes: [{} as MutationChange],
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

    it("ignores abort, broadcast, and no-response apply sync results", async () => {
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
        result: { ok: true, value: { type: "NoResponse" } },
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
        changes: [{ ownerId: testAppOwner.id } as MutationChange],
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
        value: { type: "NoResponse" },
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
      const init = getDbWorkerInit(leaderOutputs[0]);
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
