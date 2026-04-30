import { describe, expect, test } from "vitest";
import { assert } from "../../src/Assert.js";
import type { ConsoleEntry } from "../../src/Console.js";
import { createOwnerWebSocketTransport } from "../../src/local-first/Owner.js";
import { createProtocolMessageForUnsubscribe } from "../../src/local-first/Protocol.js";
import type { MutationChange } from "../../src/local-first/Schema.js";
import {
  consoleEntryOrErrorBroadcastChannelName,
  initSharedWorker,
  type ConsoleEntryOrError,
  type DbWorkerInput,
  type DbWorkerOutput,
  type EvoluInput,
  type EvoluOutput,
  type SharedWorkerInput,
  type SharedWorkerOutput,
} from "../../src/local-first/Shared.js";
import { testCreateCrdtMessage } from "../../src/local-first/Storage.js";
import {
  acquireLeaderLock,
  testCreateLockManager,
} from "../../src/LockManager.js";
import { createSet } from "../../src/Set.js";
import type { SqliteSchema } from "../../src/Sqlite.js";
import { createStore } from "../../src/Store.js";
import { testCreateId, testCreateRun } from "../../src/Test.js";
import { createId, testName, type Id, type Name } from "../../src/Type.js";
import {
  testCreateWebSocket,
  type CreateWebSocket,
} from "../../src/WebSocket.js";
import {
  testCreateBroadcastChannel,
  testCreateMessageChannel,
  testCreateMessagePort,
  testCreateSharedWorker,
  testWaitForWorkerMessage,
  type TestMessageChannel,
} from "../../src/Worker.js";
import { testAppOwner, testAppOwner2, testQuery } from "./_fixtures.js";

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

  disposer.use(await run.orThrow(initSharedWorker(worker.self)));
  worker.connect();
  worker.port.onMessage = (output) => {
    sharedWorkerOutputs.push(output);
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
      dbWorkerLeaderLock = await mainThreadRun.orThrow(
        acquireLeaderLock(tenantName),
      );
      dbWorkerPort.postMessage({
        type: "LeaderAcquired",
        name: tenantName,
      });
      await testWaitForWorkerMessage();
    };

    instanceDisposables.defer(releaseDbWorkerLeader);

    instanceDisposables.use(await mainThreadRun.orThrow(acquireLeaderLock(id)));

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
    worker.port.postMessage(message);

    await testWaitForWorkerMessage();
    await testWaitForWorkerMessage();

    const initDbWorker = sharedWorkerOutputs[outputCount];
    expect(initDbWorker).toBeDefined();
    assert(initDbWorker, "Expected DbWorker init output");

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
    test("drops console entry logged before the first connected tab", async () => {
      await using setup = await setupSharedWorker();
      const { consoleStoreOutputEntry, announceTabLeader } = setup;

      const entry: ConsoleEntry = {
        method: "info",
        path: ["test"],
        args: ["queued"],
      };

      consoleStoreOutputEntry.set(entry);

      const { outputs } = await announceTabLeader();

      expect(outputs).toEqual([]);
    });

    test("delivers live console entry after a tab connects", async () => {
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

      expect(outputs).toEqual([{ type: "ConsoleEntry", entry }]);
    });

    test("ignores null console store updates", async () => {
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

      expect(outputs).toEqual([{ type: "ConsoleEntry", entry }]);
    });
  });

  test("logs unknown shared worker inputs", async () => {
    await using setup = await setupSharedWorker();
    const { run, worker } = setup;
    const { console } = run.deps;

    worker.port.postMessage({ type: "UnknownInput" } as never);
    await testWaitForWorkerMessage();

    expect(console.getEntriesSnapshot()).toContainEqual(
      expect.objectContaining({
        path: ["SharedWorker"],
        method: "error",
        args: ["Unknown shared worker input", { type: "UnknownInput" }],
      }),
    );
  });
});

describe("with one evolu instance", () => {
  describe("queue processing", () => {
    test("does not send queued requests before leader is acquired", async () => {
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

      expect(dbInputs).toEqual([]);

      await acquireDbWorkerLeader();
      await testWaitForWorkerMessage();

      time.advance("10s");
      await testWaitForWorkerMessage();
      await testWaitForWorkerMessage();

      expect(dbInputs.length).toBeGreaterThan(0);
      expect(dbInputs[0]).toEqual({
        type: "Request",
        callbackId: expect.any(String),
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

    test("starts the next queued request after the first response arrives", async () => {
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
      expect(firstInput).toBeDefined();
      expect(firstInput.request).toEqual({
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

      expect(dbInputs).toHaveLength(2);
      expect(dbInputs[1]?.request).toEqual({
        type: "ForEvolu",
        id,
        message: {
          type: "Query",
          queries: createSet([testQuery]),
        },
      });
      expect(dbInputs[1]?.callbackId).not.toBe(firstInput.callbackId);
    });
  });

  describe("queued responses", () => {
    test("handles mutate and query responses with correct onCompleteIds", async () => {
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
      assert(mutateInput, "Expected mutate input");
      expect(mutateInput.request).toEqual({
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
      assert(queryInput, "Expected query input");
      expect(queryInput.request).toEqual({
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
      assert(
        mutateOutput.type === "OnPatchesByQuery",
        "Expected mutate patches output",
      );
      assert(
        queryOutput.type === "OnPatchesByQuery",
        "Expected query patches output",
      );

      expect(mutateOutput.onCompleteIds).toEqual([mutateOnCompleteId]);
      expect(queryOutput.onCompleteIds).toEqual([]);
      expect(mutateOutput.patchesByQuery.get(testQuery)?.[0]).toEqual({
        op: "replaceAll",
        value: [{ value: 1 }],
      });
      expect(queryOutput.patchesByQuery.get(testQuery)?.[0]).toEqual({
        op: "replaceAll",
        value: [{ value: 2 }],
      });
    });

    test("forwards export responses back to the evolu port", async () => {
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
      assert(exportInput, "Expected export input");
      expect(exportInput.request).toEqual({
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
      assert(output.type === "OnExport", "Expected export output");
      expect(Array.from(output.file)).toEqual([1, 2, 3]);
    });

    test("ignores queued evolu responses for missing instances", async () => {
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
      assert(queryInput, "Expected query input");

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

      expect(outputs).toEqual([]);
    });
  });

  describe("sync behavior", () => {
    test("sends protocol messages only for writable used owners", async () => {
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
      assert(createSyncInput, "Expected create sync input");
      expect(createSyncInput.request).toEqual({
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
      assert(mutateInput, "Expected mutate input");
      expect(mutateInput.request).toMatchObject({ type: "ForEvolu", id });

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

      expect(createWebSocket.sentMessages).toHaveLength(1);
      expect(createWebSocket.sentMessages[0]?.url).toBe(writableTransport.url);
      expect(createWebSocket.sentMessages[0]?.data).toBeInstanceOf(Uint8Array);
    });

    test("ignores non-binary and invalid transport messages", async () => {
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

      expect(dbInputs).toEqual([]);
    });

    test("requests sync messages when a claimed transport opens later", async () => {
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

      expect(dbInputs).toEqual([]);

      createWebSocket.open(transport.url);
      await testWaitForWorkerMessage();

      expect(dbInputs.at(-1)?.request).toEqual({
        type: "ForSharedWorker",
        message: {
          type: "CreateSyncMessages",
          owners: [testAppOwner],
        },
      });
    });

    test("sends unsubscribe when the last transport claim is removed", async () => {
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

      expect(createWebSocket.sentMessages).toContainEqual({
        url: transport.url,
        data: createProtocolMessageForUnsubscribe(testAppOwner.id),
      });
    });

    test("handles apply sync responses for errors, refreshes, and response messages", async () => {
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
      assert(createSyncInput, "Expected create sync input");
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
      assert(firstApplyInput, "Expected apply sync input");
      assert(
        firstApplyInput.request.type === "ForSharedWorker",
        "Expected shared worker request",
      );
      expect(firstApplyInput.request.message).toMatchObject({
        type: "ApplySyncMessage",
        owner: testAppOwner,
      });

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

      expect(evoluOutputs).toContainEqual({ type: "RefreshQueries" });
      expect(consoleEntryOrErrors).toContainEqual({
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
      assert(responseApplyInput, "Expected response apply input");
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

      expect(createWebSocket.sentMessages).toContainEqual({
        url: transport.url,
        data: createProtocolMessageForUnsubscribe(testAppOwner.id),
      });
    });

    test("ignores abort, broadcast, and no-response apply sync results", async () => {
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
      assert(createSyncInput, "Expected create sync input");
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
        assert(applyInput, "Expected apply sync input");
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
        result: { ok: false, error: { type: "AbortError", reason: "stop" } },
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

      expect(consoleEntryOrErrors).toEqual([]);
      expect(createWebSocket.sentMessages).toHaveLength(sentMessageCount);
    });

    test("ignores sync creation and apply when no writable owner is active", async () => {
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
      expect(dbInputs).toEqual([]);

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

      expect(dbInputs).toEqual([]);
    });

    test("ignores protocol sends through closed transports", async () => {
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
      assert(mutateInput, "Expected mutate input");
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

      expect(outputs).toContainEqual({
        type: "OnPatchesByQuery",
        patchesByQuery: new Map([
          [testQuery, [{ op: "replaceAll", value: [{ value: 2 }] }]],
        ]),
        onCompleteIds: [],
      });
      expect(createWebSocket.sentMessages).toEqual([]);
    });

    test("serializes overlapping UseOwner add and remove across multiple transports", async () => {
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

          return createWebSocket(url, options)(run);
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

      expect(createWebSocket.sentMessages).toHaveLength(2);
      expect(createWebSocket.sentMessages).toContainEqual({
        url: transportA.url,
        data: createProtocolMessageForUnsubscribe(testAppOwner.id),
      });
      expect(createWebSocket.sentMessages).toContainEqual({
        url: transportB.url,
        data: createProtocolMessageForUnsubscribe(testAppOwner.id),
      });
    });
  });

  describe("tab leader changes", () => {
    test("starts a new DbWorker when tab leader changes", async () => {
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

      assert(worker.self.onConnect, "Expected SharedWorker connect handler");
      worker.self.onConnect(tabLeaderChannel.port2);
      tabLeaderChannel.port1.postMessage({
        type: "AnnounceTabLeader",
        consoleLevel: "debug",
      });
      await testWaitForWorkerMessage();
      await testWaitForWorkerMessage();

      expect(dbDisposeInputs).toEqual([]);
      expect(tabLeaderOutputs[0]).toMatchObject({
        type: "DbWorkerInit",
        name: testName,
      });
    });

    test("retries in-flight request when new DbWorker leader is acquired", async () => {
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
      expect(firstInput).toBeDefined();

      await releaseDbWorkerLeader();

      using tabLeaderChannel = testCreateMessageChannel<
        SharedWorkerInput,
        SharedWorkerOutput
      >();
      const tabLeaderOutputs: Array<SharedWorkerOutput> = [];
      tabLeaderChannel.port1.onMessage = (output) => {
        tabLeaderOutputs.push(output);
      };

      assert(worker.self.onConnect, "Expected SharedWorker connect handler");
      worker.self.onConnect(tabLeaderChannel.port2);
      tabLeaderChannel.port1.postMessage({
        type: "AnnounceTabLeader",
        consoleLevel: "debug",
      });
      await testWaitForWorkerMessage();
      await testWaitForWorkerMessage();

      const initDbWorker = tabLeaderOutputs[0];
      expect(initDbWorker).toBeDefined();
      assert(initDbWorker, "Expected DbWorker init output");

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

      expect(nextDbInputs).toEqual([
        {
          type: "Request",
          callbackId: expect.any(String),
          request: {
            type: "ForEvolu",
            id,
            message: {
              type: "Query",
              queries: createSet([testQuery]),
            },
          },
        },
      ]);
      expect(nextDbInputs[0]?.callbackId).not.toBe(firstInput.callbackId);

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

      expect(evoluOutputs).toEqual([]);
    });
  });

  describe("disposal", () => {
    test("removes owner claims when tenant is disposed with a live instance", async () => {
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

      expect(createWebSocket.createdUrls).toEqual([transport.url]);

      await setup[Symbol.asyncDispose]();
      await testWaitForWorkerMessage();

      expect(createWebSocket.sentMessages).toContainEqual({
        url: transport.url,
        data: createProtocolMessageForUnsubscribe(testAppOwner.id),
      });
    });

    test("waits for DbWorker leader lock during tenant disposal", async () => {
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

      expect(dbDisposeInputs).toEqual([{ type: "Dispose" }]);
      expect(disposed).toBe(false);

      await releaseDbWorkerLeader();
      await disposing;

      expect(disposed).toBe(true);
    });

    test("drops UseOwner messages posted after instance disposal starts", async () => {
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

      expect(createWebSocket.createdUrls).toEqual([]);
    });

    test("releases pending instance lock if tenant disposal wins the acquisition race", async () => {
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
  test.todo("coordinates shared tenant state across instances");
});

describe("with multiple tabs", () => {
  test.todo("coordinates tab leader changes across connected tabs");
});
