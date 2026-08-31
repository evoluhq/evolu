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
  assertSame,
  assertTrue,
} from "../Assert.ts";
import type { ConsoleEntry } from "../Console.ts";
import {
  createAppOwner,
  createOwnerSecret,
  createOwnerWebSocketTransport,
  testAppOwner,
} from "./Owner.ts";
import { createProtocolMessageForUnsubscribe } from "./Protocol.ts";
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
  type EvoluInput,
  type EvoluOutput,
  type SharedWorkerInput,
  type SharedWorkerOutput,
} from "./Shared.ts";
import { testCreateCrdtMessage } from "./Storage.ts";
import { acquireLeaderLock, testCreateLockManager } from "../LockManager.ts";
import { installPolyfills } from "../Polyfills.ts";
import { createSet } from "../Set.ts";
import type { SqliteSchema } from "../Sqlite.ts";
import { createStore } from "../Store.ts";
import { AbortError, testCreateDeps, testCreateRun } from "../Task.ts";
import { testCreateId } from "../Test.ts";
import {
  assertType,
  createId,
  id,
  String,
  testName,
  type Id,
  type Name,
} from "../Type.ts";
import { testCreateWebSocket, type CreateWebSocket } from "../WebSocket.ts";
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
  }: {
    tenantName?: Name;
    evoluChannel?: TestMessageChannel<EvoluOutput, EvoluInput>;
    releaseDbWorkerLeaderOnDispose?: boolean;
    autoDispose?: boolean;
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

    const initDbWorker = sharedWorkerOutputs.at(outputCount);
    assertNotUndefined(initDbWorker);

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
      assertEqual(typeof firstInput.callbackId, "string");
      assertEqual(firstInput, {
        type: "Request",
        callbackId: firstInput.callbackId,
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
        callbackId: firstInput.callbackId,
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
      assertFalse(Object.is(secondInput.callbackId, firstInput.callbackId));
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
        callbackId: mutateInput.callbackId,
        response: {
          type: "ForEvolu",
          id,
          message: {
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
        callbackId: queryInput.callbackId,
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
        callbackId: secondQueryInput.callbackId,
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
        callbackId: mutateInput.callbackId,
        response: {
          type: "ForEvolu",
          id: first.id,
          message: {
            type: "Mutate",
            messagesByOwnerId: new Map(),
            rowsByQuery: new Map([[testQuery, [{ value: 1 }]]]),
          },
        },
      });
      await testWaitForWorkerMessage();

      assert(
        firstOutputs.some((output) => output.type === "OnPatchesByQuery"),
        "Expected patches for the first Evolu instance.",
      );
      assert(
        secondOutputs.some((output) => output.type === "RefreshQueries"),
        "Expected a query refresh for the second Evolu instance.",
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

      const initDbWorker = sharedWorkerOutputs[outputCount];
      assertNotUndefined(initDbWorker);

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
        callbackId: exportInput.callbackId,
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
        callbackId: queryInput.callbackId,
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
        callbackId: createSyncInput.callbackId,
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
        callbackId: mutateInput.callbackId,
        response: {
          type: "ForEvolu",
          id,
          message: {
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
        callbackId: createSyncInput.callbackId,
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

      dbWorkerPort.postMessage({
        type: "OnQueuedResponse",
        callbackId: firstApplyInput.callbackId,
        response: {
          type: "ForSharedWorker",
          message: {
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

      assert(
        evoluOutputs.some((output) => output.type === "RefreshQueries"),
        "Expected a query refresh.",
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
      dbWorkerPort.postMessage({
        type: "OnQueuedResponse",
        callbackId: responseApplyInput.callbackId,
        response: {
          type: "ForSharedWorker",
          message: {
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
        callbackId: createSyncInput.callbackId,
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
          callbackId: applyInput.callbackId,
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
        type: "ApplySyncMessage",
        ownerId: testAppOwner.id,
        didWriteMessages: false,
        result: {
          ok: false,
          error: { type: "AbortError", reason: { type: "Stop" } },
        },
      });
      await runApplySync({
        type: "ApplySyncMessage",
        ownerId: testAppOwner.id,
        didWriteMessages: false,
        result: { ok: true, value: { type: "Broadcast" } },
      });
      await runApplySync({
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
        callbackId: mutateInput.callbackId,
        response: {
          type: "ForEvolu",
          id,
          message: {
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
      const { createEvolu, worker } = setup;
      const { dbDisposeInputs, releaseDbWorkerLeader } = await createEvolu({
        releaseDbWorkerLeaderOnDispose: false,
      });

      await releaseDbWorkerLeader();

      using tabLeaderChannel = testCreateMessageChannel<
        SharedWorkerInput,
        SharedWorkerOutput
      >();
      const tabLeaderOutputs: Array<SharedWorkerOutput> = [];
      tabLeaderChannel.port1.onMessage = (output) => {
        tabLeaderOutputs.push(output);
      };

      assertNonNullable(worker.self.onConnect);
      worker.self.onConnect(tabLeaderChannel.port2);
      tabLeaderChannel.port1.postMessage({
        type: "AnnounceTabLeader",
        consoleLevel: "debug",
      });
      await testWaitForWorkerMessage();
      await testWaitForWorkerMessage();

      assertEqual(dbDisposeInputs, []);
      const initDbWorker = tabLeaderOutputs[0];
      assertSame(initDbWorker?.type, "DbWorkerInit");
      assertSame(initDbWorker.name, testName);
    });

    it("retries in-flight request when new DbWorker leader is acquired", async () => {
      await using setup = await setupSharedWorker();
      const { createEvolu, worker } = setup;
      const {
        dbInputs,
        dbWorkerPort: oldDbWorkerPort,
        evoluChannel,
        id,
        releaseDbWorkerLeader,
      } = await createEvolu({
        releaseDbWorkerLeaderOnDispose: false,
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

      using tabLeaderChannel = testCreateMessageChannel<
        SharedWorkerInput,
        SharedWorkerOutput
      >();
      const tabLeaderOutputs: Array<SharedWorkerOutput> = [];
      tabLeaderChannel.port1.onMessage = (output) => {
        tabLeaderOutputs.push(output);
      };

      assertNonNullable(worker.self.onConnect);
      worker.self.onConnect(tabLeaderChannel.port2);
      tabLeaderChannel.port1.postMessage({
        type: "AnnounceTabLeader",
        consoleLevel: "debug",
      });
      await testWaitForWorkerMessage();
      await testWaitForWorkerMessage();

      const initDbWorker = tabLeaderOutputs.at(0);
      assertNotUndefined(initDbWorker);

      using dbWorkerPort = testCreateMessagePort<DbWorkerOutput, DbWorkerInput>(
        initDbWorker.port,
      );
      const nextDbInputs: Array<Exclude<DbWorkerInput, { type: "Dispose" }>> =
        [];
      dbWorkerPort.onMessage = (input) => {
        if (input.type !== "Dispose") nextDbInputs.push(input);
      };

      dbWorkerPort.postMessage({
        type: "LeaderAcquired",
        name: testName,
      });
      await testWaitForWorkerMessage();

      assertLength(nextDbInputs, 1);
      const [nextInput] = nextDbInputs;
      assertEqual(nextInput, {
        type: "Request",
        callbackId: nextInput.callbackId,
        request: {
          type: "ForEvolu",
          id,
          message: {
            type: "Query",
            queries: createSet([testQuery]),
          },
        },
      });
      assertFalse(Object.is(nextInput.callbackId, firstInput.callbackId));

      oldDbWorkerPort.postMessage({
        type: "OnQueuedResponse",
        callbackId: firstInput.callbackId,
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

      assertEqual(evoluOutputs, []);
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
