import { assert, describe, expect, test } from "vitest";
import type { ConsoleEntry } from "../../src/Console.js";
import {
  createOwnerWebSocketTransport,
  type OwnerId,
  testAppOwner,
} from "../../src/local-first/Owner.js";
import { createProtocolMessageForUnsubscribe } from "../../src/local-first/Protocol.js";
import type { MutationChange } from "../../src/local-first/Schema.js";
import type {
  DbWorkerInput,
  DbWorkerOutput,
} from "../../src/local-first/Shared.js";
import {
  type EvoluInput,
  type EvoluOutput,
  type TabOutput,
  initSharedWorker,
  type SharedWorkerInput,
} from "../../src/local-first/Shared.js";
import { testCreateCrdtMessage } from "../../src/local-first/Storage.js";
import { ok } from "../../src/Result.js";
import { createSet } from "../../src/Set.js";
import type { ReadonlyStore } from "../../src/Store.js";
import { createStore } from "../../src/Store.js";
import { testCreateRun } from "../../src/Test.js";
import { createId, type Id, testName } from "../../src/Type.js";
import {
  type CreateWebSocket,
  testCreateWebSocket,
} from "../../src/WebSocket.js";
import {
  testCreateMessageChannel,
  testCreateMessagePort,
  testCreateSharedWorker,
  testWaitForWorkerMessage,
} from "../../src/Worker.js";
import { testQuery } from "./_fixtures.js";

interface SetupWorkerOptions {
  readonly consoleStoreOutputEntry?: ReadonlyStore<ConsoleEntry | null>;
  readonly createWebSocket?: CreateWebSocket;
}

const protocolMessageToArrayBuffer = (message: Uint8Array): ArrayBuffer =>
  Uint8Array.from(message).buffer;

const setupSharedWorker = async ({
  consoleStoreOutputEntry = createStore<ConsoleEntry | null>(null),
  createWebSocket = testCreateWebSocket({
    throwOnCreate: true,
  }),
}: SetupWorkerOptions = {}) => {
  await using stack = new AsyncDisposableStack();

  const worker = stack.use(testCreateSharedWorker<SharedWorkerInput>());
  const run = stack.use(
    testCreateRun({
      consoleStoreOutputEntry,
      createMessagePort: testCreateMessagePort,
      createWebSocket,
    }),
  );
  stack.use(await run.orThrow(initSharedWorker(worker.self)));

  worker.connect();
  const moved = stack.move();

  return {
    run,
    worker,
    [Symbol.asyncDispose]: () => moved.disposeAsync(),
  };
};

describe("console and tab output", () => {
  test("replays queued console entries after first console port connects", async () => {
    const consoleStoreOutputEntry = createStore<ConsoleEntry | null>(null);
    await using setup = await setupSharedWorker({
      consoleStoreOutputEntry,
    });
    const { worker } = setup;

    const firstEntry: ConsoleEntry = {
      method: "info",
      path: ["before"],
      args: ["queued"],
    };

    consoleStoreOutputEntry.set(firstEntry);

    const receivedOutputs: Array<TabOutput> = [];
    const consoleChannel = testCreateMessageChannel<TabOutput>();
    consoleChannel.port2.onMessage = (output) => {
      receivedOutputs.push(output);
    };

    worker.port.postMessage({
      type: "InitTab",
      consoleLevel: "debug",
      port: consoleChannel.port1.native,
    });

    const secondEntry: ConsoleEntry = {
      method: "info",
      path: ["after"],
      args: ["live"],
    };

    consoleStoreOutputEntry.set(secondEntry);
    await testWaitForWorkerMessage();

    expect(receivedOutputs).toEqual([
      { type: "OnConsoleEntry", entry: firstEntry },
      { type: "OnConsoleEntry", entry: secondEntry },
    ]);
  });

  test("ignores null console store updates", async () => {
    const consoleStoreOutputEntry = createStore<ConsoleEntry | null>(null);
    await using setup = await setupSharedWorker({
      consoleStoreOutputEntry,
    });
    const { worker } = setup;

    const receivedOutputs: Array<TabOutput> = [];
    const consoleChannel = testCreateMessageChannel<TabOutput>();
    consoleChannel.port2.onMessage = (output) => {
      receivedOutputs.push(output);
    };

    worker.port.postMessage({
      type: "InitTab",
      consoleLevel: "debug",
      port: consoleChannel.port1.native,
    });

    const entry: ConsoleEntry = {
      method: "info",
      path: ["before-null"],
      args: ["value"],
    };

    consoleStoreOutputEntry.set(entry);
    consoleStoreOutputEntry.set(null);
    await testWaitForWorkerMessage();

    expect(receivedOutputs).toEqual([{ type: "OnConsoleEntry", entry }]);
  });

  test("forwards DbWorker console entries from db worker channel", async () => {
    await using setup = await setupSharedWorker();
    const { worker } = setup;

    const receivedOutputs: Array<TabOutput> = [];
    const tabChannel = testCreateMessageChannel<TabOutput>();
    tabChannel.port2.onMessage = (output) => {
      receivedOutputs.push(output);
    };

    worker.port.postMessage({
      type: "InitTab",
      consoleLevel: "debug",
      port: tabChannel.port1.native,
    });

    const evoluChannel = testCreateMessageChannel<never, EvoluInput>();
    const dbWorkerChannel = testCreateMessageChannel<
      DbWorkerInput,
      DbWorkerOutput
    >();

    worker.port.postMessage({
      type: "CreateEvolu",
      name: testName,
      evoluPort: evoluChannel.port1.native,
      dbWorkerPort: dbWorkerChannel.port1.native,
    });

    const entry: ConsoleEntry = {
      method: "info",
      path: ["DbWorker"],
      args: ["initializeDb", { name: testName }],
    };

    dbWorkerChannel.port2.postMessage({ type: "OnConsoleEntry", entry });
    await testWaitForWorkerMessage();

    expect(receivedOutputs).toContainEqual({ type: "OnConsoleEntry", entry });
  });

  test("logs unknown shared worker inputs to tab output", async () => {
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

  test("forwards DbWorker OnError to tab ports", async () => {
    await using setup = await setupSharedWorker();
    const { worker } = setup;

    const receivedOutputs: Array<TabOutput> = [];
    const tabChannel = testCreateMessageChannel<TabOutput>();
    tabChannel.port2.onMessage = (output) => {
      receivedOutputs.push(output);
    };

    worker.port.postMessage({
      type: "InitTab",
      consoleLevel: "debug",
      port: tabChannel.port1.native,
    });

    const evoluChannel = testCreateMessageChannel<never, EvoluInput>();
    const dbWorkerChannel = testCreateMessageChannel<
      DbWorkerInput,
      DbWorkerOutput
    >();

    worker.port.postMessage({
      type: "CreateEvolu",
      name: testName,
      evoluPort: evoluChannel.port1.native,
      dbWorkerPort: dbWorkerChannel.port1.native,
    });

    const errorOutput: TabOutput = {
      type: "OnError",
      error: { type: "UnknownError", error: "boom" },
    } as const;

    dbWorkerChannel.port2.postMessage(errorOutput);
    await testWaitForWorkerMessage();

    expect(receivedOutputs).toContainEqual(errorOutput);
  });
});

describe("queued evolu responses", () => {
  test("handles mutate and query queued responses with correct onCompleteIds", async () => {
    await using setup = await setupSharedWorker();
    const { run, worker } = setup;
    const { time } = run.deps;

    const evoluChannel = testCreateMessageChannel<EvoluOutput, EvoluInput>();
    const dbWorkerChannel = testCreateMessageChannel<
      DbWorkerInput,
      DbWorkerOutput
    >();

    worker.port.postMessage({
      type: "CreateEvolu",
      name: testName,
      evoluPort: evoluChannel.port1.native,
      dbWorkerPort: dbWorkerChannel.port1.native,
    });

    const dbInputs: Array<DbWorkerInput> = [];
    dbWorkerChannel.port2.onMessage = (input) => {
      dbInputs.push(input);
    };

    const outputs: Array<EvoluOutput> = [];
    evoluChannel.port2.onMessage = (output) => {
      outputs.push(output);
    };

    dbWorkerChannel.port2.postMessage({
      type: "LeaderAcquired",
      name: testName,
    });

    const query = testQuery;
    const mutateOnCompleteId = "mutate-complete" as Id;

    evoluChannel.port2.postMessage({
      type: "Mutate",
      changes: [{} as MutationChange],
      onCompleteIds: [mutateOnCompleteId],
      subscribedQueries: new Set([query]),
    });
    time.advance("10s");
    await testWaitForWorkerMessage();

    const mutateInput = dbInputs.at(-1);
    assert(mutateInput);
    assert(mutateInput.request.type === "ForEvolu");

    dbWorkerChannel.port2.postMessage({
      type: "OnQueuedResponse",
      callbackId: mutateInput.callbackId,
      response: {
        type: "ForEvolu",
        id: mutateInput.request.id,
        message: {
          type: "Mutate",
          messagesByOwnerId: new Map(),
          rowsByQuery: new Map([[query, [{ value: 1 }]]]),
        },
      },
    });
    await testWaitForWorkerMessage();

    evoluChannel.port2.postMessage({
      type: "Query",
      queries: createSet([query]),
    });
    time.advance("10s");
    await testWaitForWorkerMessage();

    const queryInput = dbInputs.at(-1);
    assert(queryInput);
    assert(queryInput.request.type === "ForEvolu");

    dbWorkerChannel.port2.postMessage({
      type: "OnQueuedResponse",
      callbackId: queryInput.callbackId,
      response: {
        type: "ForEvolu",
        id: queryInput.request.id,
        message: {
          type: "Query",
          rowsByQuery: new Map([[query, [{ value: 2 }]]]),
        },
      },
    });
    await testWaitForWorkerMessage();

    const mutateOutput = outputs[0];
    const queryOutput = outputs[1];
    assert(mutateOutput.type === "OnPatchesByQuery");
    assert(queryOutput.type === "OnPatchesByQuery");

    expect(mutateOutput.onCompleteIds).toEqual([mutateOnCompleteId]);
    expect(queryOutput.onCompleteIds).toEqual([]);

    expect(mutateOutput.patchesByQuery.get(query)?.[0]).toEqual({
      op: "replaceAll",
      value: [{ value: 1 }],
    });
    expect(queryOutput.patchesByQuery.get(query)?.[0]).toEqual({
      op: "replaceAll",
      value: [{ value: 2 }],
    });
  });

  test("forwards export queued response back to evolu port", async () => {
    await using setup = await setupSharedWorker();
    const { run, worker } = setup;
    const { time } = run.deps;

    const evoluChannel = testCreateMessageChannel<EvoluOutput, EvoluInput>();
    const dbWorkerChannel = testCreateMessageChannel<
      DbWorkerInput,
      DbWorkerOutput
    >();

    worker.port.postMessage({
      type: "CreateEvolu",
      name: testName,
      evoluPort: evoluChannel.port1.native,
      dbWorkerPort: dbWorkerChannel.port1.native,
    });

    const dbInputs: Array<DbWorkerInput> = [];
    dbWorkerChannel.port2.onMessage = (input) => {
      dbInputs.push(input);
    };

    const outputs: Array<EvoluOutput> = [];
    evoluChannel.port2.onMessage = (output) => {
      outputs.push(output);
    };

    dbWorkerChannel.port2.postMessage({
      type: "LeaderAcquired",
      name: testName,
    });

    evoluChannel.port2.postMessage({ type: "Export" });
    time.advance("10s");
    await testWaitForWorkerMessage();

    const exportInput = dbInputs.at(-1);
    assert(exportInput);
    assert(exportInput.request.type === "ForEvolu");

    const file = new Uint8Array([1, 2, 3]);
    dbWorkerChannel.port2.postMessage({
      type: "OnQueuedResponse",
      callbackId: exportInput.callbackId,
      response: {
        type: "ForEvolu",
        id: exportInput.request.id,
        message: {
          type: "Export",
          file,
        },
      },
    });
    await testWaitForWorkerMessage();

    const output = outputs[0];
    assert(output.type === "OnExport");

    expect(Array.from(output.file)).toEqual([1, 2, 3]);
  });

  test("sends RefreshQueries to other evolu ports after mutate response", async () => {
    await using setup = await setupSharedWorker();
    const { run, worker } = setup;
    const { time } = run.deps;

    const evoluChannel1 = testCreateMessageChannel<EvoluOutput, EvoluInput>();
    const dbWorkerChannel1 = testCreateMessageChannel<
      DbWorkerInput,
      DbWorkerOutput
    >();
    const evoluChannel2 = testCreateMessageChannel<EvoluOutput, EvoluInput>();
    const dbWorkerChannel2 = testCreateMessageChannel<
      DbWorkerInput,
      DbWorkerOutput
    >();

    worker.port.postMessage({
      type: "CreateEvolu",
      name: testName,
      evoluPort: evoluChannel1.port1.native,
      dbWorkerPort: dbWorkerChannel1.port1.native,
    });
    worker.port.postMessage({
      type: "CreateEvolu",
      name: testName,
      evoluPort: evoluChannel2.port1.native,
      dbWorkerPort: dbWorkerChannel2.port1.native,
    });

    const dbInputs1: Array<DbWorkerInput> = [];
    dbWorkerChannel1.port2.onMessage = (input) => {
      dbInputs1.push(input);
    };

    const outputs1: Array<EvoluOutput> = [];
    evoluChannel1.port2.onMessage = (output) => {
      outputs1.push(output);
    };

    const outputs2: Array<EvoluOutput> = [];
    evoluChannel2.port2.onMessage = (output) => {
      outputs2.push(output);
    };

    dbWorkerChannel1.port2.postMessage({
      type: "LeaderAcquired",
      name: testName,
    });

    const query = testQuery;
    evoluChannel1.port2.postMessage({
      type: "Mutate",
      changes: [{} as MutationChange],
      onCompleteIds: [],
      subscribedQueries: new Set([query]),
    });

    time.advance("10s");
    await testWaitForWorkerMessage();

    const mutateInput = dbInputs1.at(-1);
    assert(mutateInput);
    assert(mutateInput.request.type === "ForEvolu");

    dbWorkerChannel1.port2.postMessage({
      type: "OnQueuedResponse",
      callbackId: mutateInput.callbackId,
      response: {
        type: "ForEvolu",
        id: mutateInput.request.id,
        message: {
          type: "Mutate",
          messagesByOwnerId: new Map(),
          rowsByQuery: new Map([[query, [{ value: 1 }]]]),
        },
      },
    });
    await testWaitForWorkerMessage();

    const output1 = outputs1[0];
    const output2 = outputs2[0];
    assert(output1.type === "OnPatchesByQuery");
    assert(output2.type === "RefreshQueries");
  });

  test("queues next request while processing current one", async () => {
    await using setup = await setupSharedWorker();
    const { run, worker } = setup;
    const { time } = run.deps;

    const evoluChannel = testCreateMessageChannel<EvoluOutput, EvoluInput>();
    const dbWorkerChannel = testCreateMessageChannel<
      DbWorkerInput,
      DbWorkerOutput
    >();

    worker.port.postMessage({
      type: "CreateEvolu",
      name: testName,
      evoluPort: evoluChannel.port1.native,
      dbWorkerPort: dbWorkerChannel.port1.native,
    });

    const dbInputs: Array<DbWorkerInput> = [];
    dbWorkerChannel.port2.onMessage = (input) => {
      dbInputs.push(input);
    };

    const query = testQuery;

    dbWorkerChannel.port2.postMessage({
      type: "LeaderAcquired",
      name: testName,
    });

    evoluChannel.port2.postMessage({
      type: "Query",
      queries: createSet([query]),
    });
    evoluChannel.port2.postMessage({
      type: "Query",
      queries: createSet([query]),
    });

    time.advance("10s");
    await testWaitForWorkerMessage();

    const firstInput = dbInputs[0];
    assert(firstInput);
    assert(firstInput.request.type === "ForEvolu");
    dbWorkerChannel.port2.postMessage({
      type: "OnQueuedResponse",
      callbackId: firstInput.callbackId,
      response: {
        type: "ForEvolu",
        id: firstInput.request.id,
        message: {
          type: "Query",
          rowsByQuery: new Map([[query, [{ value: 1 }, { value: 2 }]]]),
        },
      },
    });

    time.advance("10s");
    await testWaitForWorkerMessage();

    const secondInput = dbInputs[1];
    assert(secondInput);
    assert(secondInput.request.type === "ForEvolu");
    dbWorkerChannel.port2.postMessage({
      type: "OnQueuedResponse",
      callbackId: secondInput.callbackId,
      response: {
        type: "ForEvolu",
        id: secondInput.request.id,
        message: {
          type: "Query",
          rowsByQuery: new Map([[query, [{ value: 1 }, { value: 3 }]]]),
        },
      },
    });

    expect(dbInputs.length).toBeGreaterThanOrEqual(2);
  });
});

describe("transport and sync behavior", () => {
  test("sends protocol messages only for writable used owners", async () => {
    const sentMessages: Array<{
      url: string;
      data: Uint8Array;
    }> = [];

    const createWebSocket: CreateWebSocket = (url) => () =>
      ok({
        send: (data) => {
          sentMessages.push({ url, data: data as Uint8Array });
          return ok();
        },
        getReadyState: () => "open",
        isOpen: () => true,
        [Symbol.asyncDispose]: () => Promise.resolve(),
      });

    await using setup = await setupSharedWorker({
      createWebSocket,
    });

    const { run, worker } = setup;
    const { time } = run.deps;

    const evoluChannel = testCreateMessageChannel<EvoluOutput, EvoluInput>();
    const dbWorkerChannel = testCreateMessageChannel<
      DbWorkerInput,
      DbWorkerOutput
    >();
    const transport = createOwnerWebSocketTransport({
      url: "wss://relay.example",
      ownerId: testAppOwner.id,
    });
    const readonlyOwnerId = "readonly-owner" as OwnerId;
    const readonlyTransport = createOwnerWebSocketTransport({
      url: "wss://readonly.example",
      ownerId: readonlyOwnerId,
    });
    const readonlyOwner = {
      id: readonlyOwnerId,
      encryptionKey: testAppOwner.encryptionKey,
    };

    worker.port.postMessage({
      type: "CreateEvolu",
      name: testName,
      evoluPort: evoluChannel.port1.native,
      dbWorkerPort: dbWorkerChannel.port1.native,
    });

    const dbInputs: Array<DbWorkerInput> = [];
    dbWorkerChannel.port2.onMessage = (input) => {
      dbInputs.push(input);
    };

    dbWorkerChannel.port2.postMessage({
      type: "LeaderAcquired",
      name: testName,
    });

    evoluChannel.port2.postMessage({
      type: "UseOwner",
      actions: [
        {
          owner: {
            owner: testAppOwner,
            transports: [transport],
          },
          action: "add",
        },
        {
          owner: {
            owner: readonlyOwner,
            transports: [readonlyTransport],
          },
          action: "add",
        },
      ],
    });
    await testWaitForWorkerMessage();

    // Respond to the ForSharedWorker/CreateSyncMessages request triggered by
    // onFirstClaimAdded for the already-open WebSocket.
    const createSyncInput = dbInputs.at(-1);
    assert(createSyncInput);
    assert(createSyncInput.request.type === "ForSharedWorker");
    dbWorkerChannel.port2.postMessage({
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
    assert(mutateInput);
    assert(mutateInput.request.type === "ForEvolu");

    const usedOwnerMessages = [
      testCreateCrdtMessage(createId(run.deps), 1, "hello"),
    ] as const;
    dbWorkerChannel.port2.postMessage({
      type: "OnQueuedResponse",
      callbackId: mutateInput.callbackId,
      response: {
        type: "ForEvolu",
        id: mutateInput.request.id,
        message: {
          type: "Mutate",
          messagesByOwnerId: new Map([
            [testAppOwner.id, usedOwnerMessages],
            [readonlyOwner.id, usedOwnerMessages],
            ["unused-owner" as OwnerId, usedOwnerMessages],
          ]),
          rowsByQuery: new Map([[testQuery, [{ value: 1 }]]]),
        },
      },
    });
    await testWaitForWorkerMessage();

    expect(sentMessages).toHaveLength(1);
    expect(sentMessages[0]?.url).toBe(transport.url);
    expect(sentMessages[0]?.data).toBeInstanceOf(Uint8Array);
    expect(sentMessages[0]?.data.byteLength).toBeGreaterThan(0);
  });

  test("ignores non-binary and invalid transport messages", async () => {
    const inspectableWebSocket = testCreateWebSocket({ isOpen: false });
    await using setup = await setupSharedWorker({
      createWebSocket: inspectableWebSocket,
    });
    const { worker } = setup;

    const evoluChannel = testCreateMessageChannel<never, EvoluInput>();
    const dbWorkerChannel = testCreateMessageChannel<
      DbWorkerInput,
      DbWorkerOutput
    >();
    const transport = createOwnerWebSocketTransport({
      url: "wss://transport.example",
      ownerId: testAppOwner.id,
    });

    worker.port.postMessage({
      type: "CreateEvolu",
      name: testName,
      evoluPort: evoluChannel.port1.native,
      dbWorkerPort: dbWorkerChannel.port1.native,
    });

    const dbInputs: Array<DbWorkerInput> = [];
    dbWorkerChannel.port2.onMessage = (input) => {
      dbInputs.push(input);
    };

    dbWorkerChannel.port2.postMessage({
      type: "LeaderAcquired",
      name: testName,
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

    inspectableWebSocket.message(transport.url, "not-binary");
    inspectableWebSocket.message(transport.url, new Uint8Array([1]).buffer);
    await testWaitForWorkerMessage();

    expect(dbInputs).toEqual([]);
  });

  test("requests sync messages when a claimed transport opens later", async () => {
    const inspectableWebSocket = testCreateWebSocket({ isOpen: false });
    await using setup = await setupSharedWorker({
      createWebSocket: inspectableWebSocket,
    });
    const { worker } = setup;

    const evoluChannel = testCreateMessageChannel<never, EvoluInput>();
    const dbWorkerChannel = testCreateMessageChannel<
      DbWorkerInput,
      DbWorkerOutput
    >();
    const transport = createOwnerWebSocketTransport({
      url: "wss://open-later.example",
      ownerId: testAppOwner.id,
    });

    worker.port.postMessage({
      type: "CreateEvolu",
      name: testName,
      evoluPort: evoluChannel.port1.native,
      dbWorkerPort: dbWorkerChannel.port1.native,
    });

    const dbInputs: Array<DbWorkerInput> = [];
    dbWorkerChannel.port2.onMessage = (input) => {
      dbInputs.push(input);
    };

    dbWorkerChannel.port2.postMessage({
      type: "LeaderAcquired",
      name: testName,
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

    inspectableWebSocket.open(transport.url);
    await testWaitForWorkerMessage();

    const createSyncInput = dbInputs.at(-1);
    assert(createSyncInput);
    expect(createSyncInput.request).toEqual({
      type: "ForSharedWorker",
      message: {
        type: "CreateSyncMessages",
        owners: [testAppOwner],
      },
    });
  });

  test("sends unsubscribe when the last transport claim is removed", async () => {
    const inspectableWebSocket = testCreateWebSocket();
    await using setup = await setupSharedWorker({
      createWebSocket: inspectableWebSocket,
    });
    const { worker } = setup;

    const evoluChannel = testCreateMessageChannel<never, EvoluInput>();
    const dbWorkerChannel = testCreateMessageChannel<
      DbWorkerInput,
      DbWorkerOutput
    >();
    const transport = createOwnerWebSocketTransport({
      url: "wss://unsubscribe.example",
      ownerId: testAppOwner.id,
    });

    worker.port.postMessage({
      type: "CreateEvolu",
      name: testName,
      evoluPort: evoluChannel.port1.native,
      dbWorkerPort: dbWorkerChannel.port1.native,
    });

    dbWorkerChannel.port2.postMessage({
      type: "LeaderAcquired",
      name: testName,
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

    expect(inspectableWebSocket.sentMessages).toContainEqual({
      url: transport.url,
      data: createProtocolMessageForUnsubscribe(testAppOwner.id),
    });
  });

  test("handles apply sync responses for errors, refresh, and response messages", async () => {
    const inspectableWebSocket = testCreateWebSocket();
    await using setup = await setupSharedWorker({
      createWebSocket: inspectableWebSocket,
    });
    const { run, worker } = setup;
    const { time } = run.deps;

    const tabOutputs: Array<TabOutput> = [];
    const tabChannel = testCreateMessageChannel<TabOutput>();
    tabChannel.port2.onMessage = (output) => {
      tabOutputs.push(output);
    };

    worker.port.postMessage({
      type: "InitTab",
      consoleLevel: "debug",
      port: tabChannel.port1.native,
    });

    const evoluChannel = testCreateMessageChannel<EvoluOutput, EvoluInput>();
    const dbWorkerChannel = testCreateMessageChannel<
      DbWorkerInput,
      DbWorkerOutput
    >();
    const transport = createOwnerWebSocketTransport({
      url: "wss://apply-sync.example",
      ownerId: testAppOwner.id,
    });

    worker.port.postMessage({
      type: "CreateEvolu",
      name: testName,
      evoluPort: evoluChannel.port1.native,
      dbWorkerPort: dbWorkerChannel.port1.native,
    });

    const dbInputs: Array<DbWorkerInput> = [];
    dbWorkerChannel.port2.onMessage = (input) => {
      dbInputs.push(input);
    };

    const evoluOutputs: Array<EvoluOutput> = [];
    evoluChannel.port2.onMessage = (output) => {
      evoluOutputs.push(output);
    };

    dbWorkerChannel.port2.postMessage({
      type: "LeaderAcquired",
      name: testName,
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

    const createSyncInput = dbInputs.at(-1);
    assert(createSyncInput);
    dbWorkerChannel.port2.postMessage({
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

    inspectableWebSocket.message(
      transport.url,
      protocolMessageToArrayBuffer(
        createProtocolMessageForUnsubscribe(testAppOwner.id),
      ),
    );
    time.advance("10s");
    await testWaitForWorkerMessage();

    const firstApplyInput = dbInputs.at(-1);
    assert(firstApplyInput);
    assert(firstApplyInput.request.type === "ForSharedWorker");
    dbWorkerChannel.port2.postMessage({
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
    expect(tabOutputs).toContainEqual({
      type: "OnError",
      error: {
        type: "ProtocolInvalidDataError",
        data: new Uint8Array(),
        error: "boom",
      },
    });

    inspectableWebSocket.message(
      transport.url,
      protocolMessageToArrayBuffer(
        createProtocolMessageForUnsubscribe(testAppOwner.id),
      ),
    );
    time.advance("10s");
    await testWaitForWorkerMessage();

    const responseApplyInput = dbInputs.at(-1);
    assert(responseApplyInput);
    assert(responseApplyInput.request.type === "ForSharedWorker");
    dbWorkerChannel.port2.postMessage({
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

    expect(inspectableWebSocket.sentMessages).toContainEqual({
      url: transport.url,
      data: createProtocolMessageForUnsubscribe(testAppOwner.id),
    });
  });

  test("ignores abort, broadcast, and no-response apply sync results", async () => {
    const inspectableWebSocket = testCreateWebSocket();
    await using setup = await setupSharedWorker({
      createWebSocket: inspectableWebSocket,
    });
    const { run, worker } = setup;
    const { time } = run.deps;

    const tabOutputs: Array<TabOutput> = [];
    const tabChannel = testCreateMessageChannel<TabOutput>();
    tabChannel.port2.onMessage = (output) => {
      tabOutputs.push(output);
    };

    worker.port.postMessage({
      type: "InitTab",
      consoleLevel: "debug",
      port: tabChannel.port1.native,
    });

    const evoluChannel = testCreateMessageChannel<never, EvoluInput>();
    const dbWorkerChannel = testCreateMessageChannel<
      DbWorkerInput,
      DbWorkerOutput
    >();
    const transport = createOwnerWebSocketTransport({
      url: "wss://apply-sync-ignored.example",
      ownerId: testAppOwner.id,
    });

    worker.port.postMessage({
      type: "CreateEvolu",
      name: testName,
      evoluPort: evoluChannel.port1.native,
      dbWorkerPort: dbWorkerChannel.port1.native,
    });

    const dbInputs: Array<DbWorkerInput> = [];
    dbWorkerChannel.port2.onMessage = (input) => {
      dbInputs.push(input);
    };

    dbWorkerChannel.port2.postMessage({
      type: "LeaderAcquired",
      name: testName,
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

    const createSyncInput = dbInputs.at(-1);
    assert(createSyncInput);
    dbWorkerChannel.port2.postMessage({
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
    ) => {
      inspectableWebSocket.message(
        transport.url,
        protocolMessageToArrayBuffer(
          createProtocolMessageForUnsubscribe(testAppOwner.id),
        ),
      );
      time.advance("10s");
      await testWaitForWorkerMessage();

      const applyInput = dbInputs.at(-1);
      assert(applyInput);
      dbWorkerChannel.port2.postMessage({
        type: "OnQueuedResponse",
        callbackId: applyInput.callbackId,
        response: {
          type: "ForSharedWorker",
          message: response,
        },
      });
      await testWaitForWorkerMessage();
    };

    const sentMessageCount = inspectableWebSocket.sentMessages.length;

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

    expect(tabOutputs).toEqual([]);
    expect(inspectableWebSocket.sentMessages).toHaveLength(sentMessageCount);
  });

  test("ignores sync creation and apply when no writable owner is active", async () => {
    const inspectableWebSocket = testCreateWebSocket({ isOpen: false });
    await using setup = await setupSharedWorker({
      createWebSocket: inspectableWebSocket,
    });
    const { run, worker } = setup;
    const { time } = run.deps;

    const evoluChannel = testCreateMessageChannel<never, EvoluInput>();
    const dbWorkerChannel = testCreateMessageChannel<
      DbWorkerInput,
      DbWorkerOutput
    >();
    const readonlyOwnerId = "readonly-owner" as OwnerId;
    const readonlyTransport = createOwnerWebSocketTransport({
      url: "wss://readonly-only.example",
      ownerId: readonlyOwnerId,
    });

    worker.port.postMessage({
      type: "CreateEvolu",
      name: testName,
      evoluPort: evoluChannel.port1.native,
      dbWorkerPort: dbWorkerChannel.port1.native,
    });

    const dbInputs: Array<DbWorkerInput> = [];
    dbWorkerChannel.port2.onMessage = (input) => {
      dbInputs.push(input);
    };

    dbWorkerChannel.port2.postMessage({
      type: "LeaderAcquired",
      name: testName,
    });

    evoluChannel.port2.postMessage({
      type: "UseOwner",
      actions: [
        {
          owner: {
            owner: {
              id: readonlyOwnerId,
              encryptionKey: testAppOwner.encryptionKey,
            },
            transports: [readonlyTransport],
          },
          action: "add",
        },
      ],
    });
    await testWaitForWorkerMessage();

    inspectableWebSocket.open(readonlyTransport.url);
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
    inspectableWebSocket.message(
      writableTransport.url,
      protocolMessageToArrayBuffer(
        createProtocolMessageForUnsubscribe(testAppOwner.id),
      ),
    );
    time.advance("10s");
    await testWaitForWorkerMessage();

    expect(dbInputs).toEqual([]);
  });

  test("ignores UseOwner and repeated Dispose after the instance is gone", async () => {
    const inspectableWebSocket = testCreateWebSocket();
    await using setup = await setupSharedWorker({
      createWebSocket: inspectableWebSocket,
    });
    const { worker } = setup;

    const evoluChannel = testCreateMessageChannel<never, EvoluInput>();
    const dbWorkerChannel = testCreateMessageChannel<
      DbWorkerInput,
      DbWorkerOutput
    >();
    const transport = createOwnerWebSocketTransport({
      url: "wss://disposed-instance.example",
      ownerId: testAppOwner.id,
    });

    worker.port.postMessage({
      type: "CreateEvolu",
      name: testName,
      evoluPort: evoluChannel.port1.native,
      dbWorkerPort: dbWorkerChannel.port1.native,
    });

    evoluChannel.port2.postMessage({ type: "Dispose" });
    evoluChannel.port2.postMessage({
      type: "UseOwner",
      actions: [
        {
          owner: { owner: testAppOwner, transports: [transport] },
          action: "add",
        },
      ],
    });
    evoluChannel.port2.postMessage({ type: "Dispose" });
    await testWaitForWorkerMessage();

    expect(inspectableWebSocket.createdUrls).toEqual([]);
  });

  test("ignores CreateEvolu after shared worker disposal", async () => {
    const worker = testCreateSharedWorker<SharedWorkerInput>();
    const run = testCreateRun({
      consoleStoreOutputEntry: createStore<ConsoleEntry | null>(null),
      createMessagePort: testCreateMessagePort,
      createWebSocket: testCreateWebSocket({ throwOnCreate: true }),
    });
    await using _sharedWorker = await run.orThrow(
      initSharedWorker(worker.self),
    );

    const sharedWorkerChannel = testCreateMessageChannel<SharedWorkerInput>();
    assert(worker.self.onConnect);
    worker.self.onConnect(sharedWorkerChannel.port2);
    await testWaitForWorkerMessage();

    const onMessage = sharedWorkerChannel.port2.onMessage;
    assert(onMessage);

    await run[Symbol.asyncDispose]();

    const evoluChannel = testCreateMessageChannel<never, EvoluInput>();
    const dbWorkerChannel = testCreateMessageChannel<
      DbWorkerInput,
      DbWorkerOutput
    >();

    onMessage({
      type: "CreateEvolu",
      name: testName,
      evoluPort: evoluChannel.port1.native,
      dbWorkerPort: dbWorkerChannel.port1.native,
    });

    await testWaitForWorkerMessage();
  });

  test("ignores queued evolu responses for missing ports", async () => {
    await using setup = await setupSharedWorker();
    const { run, worker } = setup;
    const { time } = run.deps;

    const evoluChannel = testCreateMessageChannel<EvoluOutput, EvoluInput>();
    const dbWorkerChannel = testCreateMessageChannel<
      DbWorkerInput,
      DbWorkerOutput
    >();

    worker.port.postMessage({
      type: "CreateEvolu",
      name: testName,
      evoluPort: evoluChannel.port1.native,
      dbWorkerPort: dbWorkerChannel.port1.native,
    });

    const outputs: Array<EvoluOutput> = [];
    evoluChannel.port2.onMessage = (output) => {
      outputs.push(output);
    };

    const dbInputs: Array<DbWorkerInput> = [];
    dbWorkerChannel.port2.onMessage = (input) => {
      dbInputs.push(input);
    };

    dbWorkerChannel.port2.postMessage({
      type: "LeaderAcquired",
      name: testName,
    });

    evoluChannel.port2.postMessage({
      type: "Query",
      queries: createSet([testQuery]),
    });

    time.advance("10s");
    await testWaitForWorkerMessage();

    const queryInput = dbInputs.at(-1);
    assert(queryInput);
    assert(queryInput.request.type === "ForEvolu");

    dbWorkerChannel.port2.postMessage({
      type: "OnQueuedResponse",
      callbackId: queryInput.callbackId,
      response: {
        type: "ForEvolu",
        id: createId(run.deps),
        message: {
          type: "Query",
          rowsByQuery: new Map([[testQuery, [{ value: 1 }]]]),
        },
      },
    });
    await testWaitForWorkerMessage();

    expect(outputs).toEqual([]);
  });

  test("ignores protocol sends through closed transports", async () => {
    const inspectableWebSocket = testCreateWebSocket({ isOpen: false });
    await using setup = await setupSharedWorker({
      createWebSocket: inspectableWebSocket,
    });
    const { run, worker } = setup;
    const { time } = run.deps;

    const evoluChannel = testCreateMessageChannel<EvoluOutput, EvoluInput>();
    const dbWorkerChannel = testCreateMessageChannel<
      DbWorkerInput,
      DbWorkerOutput
    >();
    const transport = createOwnerWebSocketTransport({
      url: "wss://closed-transport.example",
      ownerId: testAppOwner.id,
    });

    worker.port.postMessage({
      type: "CreateEvolu",
      name: testName,
      evoluPort: evoluChannel.port1.native,
      dbWorkerPort: dbWorkerChannel.port1.native,
    });

    const outputs: Array<EvoluOutput> = [];
    evoluChannel.port2.onMessage = (output) => {
      outputs.push(output);
    };

    const dbInputs: Array<DbWorkerInput> = [];
    dbWorkerChannel.port2.onMessage = (input) => {
      dbInputs.push(input);
    };

    dbWorkerChannel.port2.postMessage({
      type: "LeaderAcquired",
      name: testName,
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

    evoluChannel.port2.postMessage({
      type: "Mutate",
      changes: [{ ownerId: testAppOwner.id } as MutationChange],
      onCompleteIds: [],
      subscribedQueries: new Set([testQuery]),
    });

    time.advance("10s");
    await testWaitForWorkerMessage();

    const mutateInput = dbInputs.at(-1);
    assert(mutateInput);
    assert(mutateInput.request.type === "ForEvolu");

    dbWorkerChannel.port2.postMessage({
      type: "OnQueuedResponse",
      callbackId: mutateInput.callbackId,
      response: {
        type: "ForEvolu",
        id: mutateInput.request.id,
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
    expect(inspectableWebSocket.sentMessages).toEqual([]);
  });

  test("throws for impossible db worker and evolu port messages", async () => {
    await using setup = await setupSharedWorker();
    const { worker } = setup;

    const evoluChannel = testCreateMessageChannel<never, EvoluInput>();
    const dbWorkerChannel = testCreateMessageChannel<
      DbWorkerInput,
      DbWorkerOutput
    >();

    worker.port.postMessage({
      type: "CreateEvolu",
      name: testName,
      evoluPort: evoluChannel.port1.native,
      dbWorkerPort: dbWorkerChannel.port1.native,
    });
    await testWaitForWorkerMessage();

    const dbWorkerOnMessage = dbWorkerChannel.port1.onMessage;
    const evoluOnMessage = evoluChannel.port1.onMessage;
    assert(dbWorkerOnMessage);
    assert(evoluOnMessage);

    expect(() => dbWorkerOnMessage({ type: "Impossible" } as never)).toThrow(
      /exhaustiveCheck/,
    );
    expect(() => evoluOnMessage({ type: "Impossible" } as never)).toThrow(
      /exhaustiveCheck/,
    );
  });

  test("throws for impossible queued response type", async () => {
    await using setup = await setupSharedWorker();
    const { run, worker } = setup;
    const { time } = run.deps;

    const evoluChannel = testCreateMessageChannel<EvoluOutput, EvoluInput>();
    const dbWorkerChannel = testCreateMessageChannel<
      DbWorkerInput,
      DbWorkerOutput
    >();
    const dbInputs: Array<DbWorkerInput> = [];
    dbWorkerChannel.port2.onMessage = (input) => {
      dbInputs.push(input);
    };

    worker.port.postMessage({
      type: "CreateEvolu",
      name: testName,
      evoluPort: evoluChannel.port1.native,
      dbWorkerPort: dbWorkerChannel.port1.native,
    });
    dbWorkerChannel.port2.postMessage({
      type: "LeaderAcquired",
      name: testName,
    });
    evoluChannel.port2.postMessage({
      type: "Query",
      queries: createSet([testQuery]),
    });
    time.advance("10s");
    await testWaitForWorkerMessage();

    const queryInput = dbInputs.at(-1);
    assert(queryInput);
    const dbWorkerOnMessage = dbWorkerChannel.port1.onMessage;
    assert(dbWorkerOnMessage);

    expect(() =>
      dbWorkerOnMessage({
        type: "OnQueuedResponse",
        callbackId: queryInput.callbackId,
        response: { type: "Impossible" } as never,
      }),
    ).toThrow(/exhaustiveCheck/);
  });

  test("throws for impossible evolu queued response messages", async () => {
    await using setup = await setupSharedWorker();
    const { run, worker } = setup;
    const { time } = run.deps;

    const evoluChannel = testCreateMessageChannel<EvoluOutput, EvoluInput>();
    const dbWorkerChannel = testCreateMessageChannel<
      DbWorkerInput,
      DbWorkerOutput
    >();
    const dbInputs: Array<DbWorkerInput> = [];
    dbWorkerChannel.port2.onMessage = (input) => {
      dbInputs.push(input);
    };

    worker.port.postMessage({
      type: "CreateEvolu",
      name: testName,
      evoluPort: evoluChannel.port1.native,
      dbWorkerPort: dbWorkerChannel.port1.native,
    });
    dbWorkerChannel.port2.postMessage({
      type: "LeaderAcquired",
      name: testName,
    });
    evoluChannel.port2.postMessage({
      type: "Query",
      queries: createSet([testQuery]),
    });
    time.advance("10s");
    await testWaitForWorkerMessage();

    const queryInput = dbInputs.at(-1);
    assert(queryInput);
    assert(queryInput.request.type === "ForEvolu");
    const id = queryInput.request.id;
    const dbWorkerOnMessage = dbWorkerChannel.port1.onMessage;
    assert(dbWorkerOnMessage);

    expect(() =>
      dbWorkerOnMessage({
        type: "OnQueuedResponse",
        callbackId: queryInput.callbackId,
        response: {
          type: "ForEvolu",
          id,
          message: { type: "Impossible" },
        } as never,
      }),
    ).toThrow(/exhaustiveCheck/);
  });

  test("throws for impossible shared worker queued response messages", async () => {
    const inspectableWebSocket = testCreateWebSocket();
    await using setup = await setupSharedWorker({
      createWebSocket: inspectableWebSocket,
    });
    const { worker } = setup;

    const evoluChannel = testCreateMessageChannel<never, EvoluInput>();
    const dbWorkerChannel = testCreateMessageChannel<
      DbWorkerInput,
      DbWorkerOutput
    >();
    const transport = createOwnerWebSocketTransport({
      url: "wss://impossible-shared-worker.example",
      ownerId: testAppOwner.id,
    });
    const dbInputs: Array<DbWorkerInput> = [];
    dbWorkerChannel.port2.onMessage = (input) => {
      dbInputs.push(input);
    };

    worker.port.postMessage({
      type: "CreateEvolu",
      name: testName,
      evoluPort: evoluChannel.port1.native,
      dbWorkerPort: dbWorkerChannel.port1.native,
    });
    dbWorkerChannel.port2.postMessage({
      type: "LeaderAcquired",
      name: testName,
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

    const createSyncInput = dbInputs.at(-1);
    assert(createSyncInput);
    const dbWorkerOnMessage = dbWorkerChannel.port1.onMessage;
    assert(dbWorkerOnMessage);

    expect(() =>
      dbWorkerOnMessage({
        type: "OnQueuedResponse",
        callbackId: createSyncInput.callbackId,
        response: {
          type: "ForSharedWorker",
          message: { type: "Impossible" },
        } as never,
      }),
    ).toThrow(/exhaustiveCheck/);
  });

  test("throws for impossible shared worker apply result values", async () => {
    const inspectableWebSocket = testCreateWebSocket();
    await using setup = await setupSharedWorker({
      createWebSocket: inspectableWebSocket,
    });
    const { run, worker } = setup;
    const { time } = run.deps;

    const evoluChannel = testCreateMessageChannel<never, EvoluInput>();
    const dbWorkerChannel = testCreateMessageChannel<
      DbWorkerInput,
      DbWorkerOutput
    >();
    const transport = createOwnerWebSocketTransport({
      url: "wss://impossible-apply.example",
      ownerId: testAppOwner.id,
    });
    const dbInputs: Array<DbWorkerInput> = [];
    dbWorkerChannel.port2.onMessage = (input) => {
      dbInputs.push(input);
    };

    worker.port.postMessage({
      type: "CreateEvolu",
      name: testName,
      evoluPort: evoluChannel.port1.native,
      dbWorkerPort: dbWorkerChannel.port1.native,
    });
    dbWorkerChannel.port2.postMessage({
      type: "LeaderAcquired",
      name: testName,
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

    const createSyncInput = dbInputs.at(-1);
    assert(createSyncInput);
    dbWorkerChannel.port2.postMessage({
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

    inspectableWebSocket.message(
      transport.url,
      protocolMessageToArrayBuffer(
        createProtocolMessageForUnsubscribe(testAppOwner.id),
      ),
    );
    time.advance("10s");
    await testWaitForWorkerMessage();

    const applyInput = dbInputs.at(-1);
    assert(applyInput);
    const dbWorkerOnMessage = dbWorkerChannel.port1.onMessage;
    assert(dbWorkerOnMessage);

    expect(() =>
      dbWorkerOnMessage({
        type: "OnQueuedResponse",
        callbackId: applyInput.callbackId,
        response: {
          type: "ForSharedWorker",
          message: {
            type: "ApplySyncMessage",
            ownerId: testAppOwner.id,
            didWriteMessages: false,
            result: { ok: true, value: { type: "Impossible" } },
          },
        } as never,
      }),
    ).toThrow(/exhaustiveCheck/);
  });

  test("reuses UseOwner transport when it is re-added before idle disposal", async () => {
    const createdUrls: Array<string> = [];
    const disposedUrls: Array<string> = [];
    const baseCreateWebSocket = testCreateWebSocket();

    const createWebSocket: CreateWebSocket = (url, options) => async (run) => {
      createdUrls.push(url);
      const webSocketResult = await baseCreateWebSocket(url, options)(run);
      if (!webSocketResult.ok) return webSocketResult;

      const webSocket = webSocketResult.value;
      return ok({
        ...webSocket,
        [Symbol.asyncDispose]: () => {
          disposedUrls.push(url);
          return webSocket[Symbol.asyncDispose]();
        },
      });
    };

    await using setup = await setupSharedWorker({
      createWebSocket,
    });

    const { run, worker } = setup;
    const { time } = run.deps;

    const evoluChannel = testCreateMessageChannel<never, EvoluInput>();
    const dbWorkerChannel = testCreateMessageChannel<
      DbWorkerInput,
      DbWorkerOutput
    >();
    const transport = createOwnerWebSocketTransport({
      url: "wss://use-owner.example",
      ownerId: testAppOwner.id,
    });

    worker.port.postMessage({
      type: "CreateEvolu",
      name: testName,
      evoluPort: evoluChannel.port1.native,
      dbWorkerPort: dbWorkerChannel.port1.native,
    });

    evoluChannel.port2.postMessage({
      type: "UseOwner",
      actions: [
        {
          owner: {
            owner: testAppOwner,
            transports: [transport],
          },
          action: "add",
        },
      ],
    });
    await testWaitForWorkerMessage();

    evoluChannel.port2.postMessage({ type: "Dispose" });
    await testWaitForWorkerMessage();

    expect(createdUrls).toEqual([transport.url]);
    expect(disposedUrls).toEqual([]);

    time.advance("2s");
    await testWaitForWorkerMessage();

    worker.port.postMessage({
      type: "CreateEvolu",
      name: testName,
      evoluPort: evoluChannel.port1.native,
      dbWorkerPort: dbWorkerChannel.port1.native,
    });

    evoluChannel.port2.postMessage({
      type: "UseOwner",
      actions: [
        {
          owner: {
            owner: testAppOwner,
            transports: [transport],
          },
          action: "add",
        },
      ],
    });
    await testWaitForWorkerMessage();

    expect(createdUrls).toEqual([transport.url]);
    expect(disposedUrls).toEqual([]);

    evoluChannel.port2.postMessage({ type: "Dispose" });
    await testWaitForWorkerMessage();

    time.advance("3s");
    await testWaitForWorkerMessage();

    expect(disposedUrls).toEqual([transport.url]);
  });

  test("serializes overlapping UseOwner add and remove across multiple transports", async () => {
    const inspectableWebSocket = testCreateWebSocket();
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

    let pausedFirstCreate = false;
    const createWebSocket: CreateWebSocket = (url, options) => async (run) => {
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

      return inspectableWebSocket(url, options)(run);
    };

    await using setup = await setupSharedWorker({
      createWebSocket,
    });
    const { worker } = setup;

    const evoluChannel = testCreateMessageChannel<never, EvoluInput>();
    const dbWorkerChannel = testCreateMessageChannel<
      DbWorkerInput,
      DbWorkerOutput
    >();

    worker.port.postMessage({
      type: "CreateEvolu",
      name: testName,
      evoluPort: evoluChannel.port1.native,
      dbWorkerPort: dbWorkerChannel.port1.native,
    });

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

    expect(inspectableWebSocket.sentMessages).toHaveLength(2);
    expect(inspectableWebSocket.sentMessages).toContainEqual({
      url: transportA.url,
      data: createProtocolMessageForUnsubscribe(testAppOwner.id),
    });
    expect(inspectableWebSocket.sentMessages).toContainEqual({
      url: transportB.url,
      data: createProtocolMessageForUnsubscribe(testAppOwner.id),
    });
  });
});

describe("disposal and ignored responses", () => {
  test("handles empty query rows and response after dispose", async () => {
    await using setup = await setupSharedWorker();
    const { run, worker } = setup;
    const { time } = run.deps;

    const evoluChannel = testCreateMessageChannel<EvoluOutput, EvoluInput>();
    const dbWorkerChannel = testCreateMessageChannel<
      DbWorkerInput,
      DbWorkerOutput
    >();

    worker.port.postMessage({
      type: "CreateEvolu",
      name: testName,
      evoluPort: evoluChannel.port1.native,
      dbWorkerPort: dbWorkerChannel.port1.native,
    });

    const dbInputs: Array<DbWorkerInput> = [];
    dbWorkerChannel.port2.onMessage = (input) => {
      dbInputs.push(input);
    };

    const outputs: Array<EvoluOutput> = [];
    evoluChannel.port2.onMessage = (output) => {
      outputs.push(output);
    };

    dbWorkerChannel.port2.postMessage({
      type: "LeaderAcquired",
      name: testName,
    });

    const query = testQuery;
    evoluChannel.port2.postMessage({
      type: "Query",
      queries: createSet([query]),
    });
    time.advance("10s");
    await testWaitForWorkerMessage();

    const queuedInput = dbInputs.at(-1);
    assert(queuedInput);
    assert(queuedInput.request.type === "ForEvolu");

    evoluChannel.port2.postMessage({ type: "Dispose" });

    dbWorkerChannel.port2.postMessage({
      type: "OnQueuedResponse",
      callbackId: queuedInput.callbackId,
      response: {
        type: "ForEvolu",
        id: queuedInput.request.id,
        message: {
          type: "Query",
          rowsByQuery: new Map(),
        },
      },
    });

    expect(outputs).toEqual([]);
  });

  test("keeps shared evolu alive when one of multiple ports disposes", async () => {
    await using setup = await setupSharedWorker();
    const { run, worker } = setup;
    const { time } = run.deps;

    const evoluChannel1 = testCreateMessageChannel<EvoluOutput, EvoluInput>();
    const dbWorkerChannel1 = testCreateMessageChannel<
      DbWorkerInput,
      DbWorkerOutput
    >();
    const evoluChannel2 = testCreateMessageChannel<EvoluOutput, EvoluInput>();
    const dbWorkerChannel2 = testCreateMessageChannel<
      DbWorkerInput,
      DbWorkerOutput
    >();

    worker.port.postMessage({
      type: "CreateEvolu",
      name: testName,
      evoluPort: evoluChannel1.port1.native,
      dbWorkerPort: dbWorkerChannel1.port1.native,
    });
    worker.port.postMessage({
      type: "CreateEvolu",
      name: testName,
      evoluPort: evoluChannel2.port1.native,
      dbWorkerPort: dbWorkerChannel2.port1.native,
    });

    const dbInputs2: Array<DbWorkerInput> = [];
    dbWorkerChannel2.port2.onMessage = (input) => {
      dbInputs2.push(input);
    };

    const outputs2: Array<EvoluOutput> = [];
    evoluChannel2.port2.onMessage = (output) => {
      outputs2.push(output);
    };

    evoluChannel1.port2.postMessage({ type: "Dispose" });

    dbWorkerChannel2.port2.postMessage({
      type: "LeaderAcquired",
      name: testName,
    });

    const query = testQuery;
    evoluChannel2.port2.postMessage({
      type: "Query",
      queries: createSet([query]),
    });
    time.advance("10s");
    await testWaitForWorkerMessage();

    const queuedInput2 = dbInputs2.at(-1);
    assert(queuedInput2);
    assert(queuedInput2.request.type === "ForEvolu");

    dbWorkerChannel2.port2.postMessage({
      type: "OnQueuedResponse",
      callbackId: queuedInput2.callbackId,
      response: {
        type: "ForEvolu",
        id: queuedInput2.request.id,
        message: {
          type: "Query",
          rowsByQuery: new Map([[query, [{ value: 1 }]]]),
        },
      },
    });
    await testWaitForWorkerMessage();

    const output2 = outputs2[0];
    assert(output2.type === "OnPatchesByQuery");
  });

  test("keeps disposed instance db worker alive until tenant disposal", async () => {
    await using setup = await setupSharedWorker();
    const { run, worker } = setup;
    const { time } = run.deps;

    const evoluChannel1 = testCreateMessageChannel<EvoluOutput, EvoluInput>();
    const dbWorkerChannel1 = testCreateMessageChannel<
      DbWorkerInput,
      DbWorkerOutput
    >();
    const evoluChannel2 = testCreateMessageChannel<EvoluOutput, EvoluInput>();
    const dbWorkerChannel2 = testCreateMessageChannel<
      DbWorkerInput,
      DbWorkerOutput
    >();

    worker.port.postMessage({
      type: "CreateEvolu",
      name: testName,
      evoluPort: evoluChannel1.port1.native,
      dbWorkerPort: dbWorkerChannel1.port1.native,
    });
    worker.port.postMessage({
      type: "CreateEvolu",
      name: testName,
      evoluPort: evoluChannel2.port1.native,
      dbWorkerPort: dbWorkerChannel2.port1.native,
    });

    const dbInputs1: Array<DbWorkerInput> = [];
    dbWorkerChannel1.port2.onMessage = (input) => {
      dbInputs1.push(input);
    };

    const outputs2: Array<EvoluOutput> = [];
    evoluChannel2.port2.onMessage = (output) => {
      outputs2.push(output);
    };

    evoluChannel1.port2.postMessage({ type: "Dispose" });

    dbWorkerChannel1.port2.postMessage({
      type: "LeaderAcquired",
      name: testName,
    });

    const query = testQuery;
    evoluChannel2.port2.postMessage({
      type: "Query",
      queries: createSet([query]),
    });
    time.advance("10s");
    await testWaitForWorkerMessage();

    const queuedInput1 = dbInputs1.at(-1);
    assert(queuedInput1);
    assert(queuedInput1.request.type === "ForEvolu");

    dbWorkerChannel1.port2.postMessage({
      type: "OnQueuedResponse",
      callbackId: queuedInput1.callbackId,
      response: {
        type: "ForEvolu",
        id: queuedInput1.request.id,
        message: {
          type: "Query",
          rowsByQuery: new Map([[query, [{ value: 1 }]]]),
        },
      },
    });
    await testWaitForWorkerMessage();

    const output2 = outputs2[0];
    assert(output2.type === "OnPatchesByQuery");
  });

  test("ignores query response for disposed port while another port keeps shared evolu alive", async () => {
    await using setup = await setupSharedWorker();
    const { run, worker } = setup;
    const { time } = run.deps;

    const evoluChannel1 = testCreateMessageChannel<EvoluOutput, EvoluInput>();
    const dbWorkerChannel1 = testCreateMessageChannel<
      DbWorkerInput,
      DbWorkerOutput
    >();
    const evoluChannel2 = testCreateMessageChannel<EvoluOutput, EvoluInput>();
    const dbWorkerChannel2 = testCreateMessageChannel<
      DbWorkerInput,
      DbWorkerOutput
    >();

    worker.port.postMessage({
      type: "CreateEvolu",
      name: testName,
      evoluPort: evoluChannel1.port1.native,
      dbWorkerPort: dbWorkerChannel1.port1.native,
    });
    worker.port.postMessage({
      type: "CreateEvolu",
      name: testName,
      evoluPort: evoluChannel2.port1.native,
      dbWorkerPort: dbWorkerChannel2.port1.native,
    });

    const dbInputs1: Array<DbWorkerInput> = [];
    dbWorkerChannel1.port2.onMessage = (input) => {
      dbInputs1.push(input);
    };

    const outputs1: Array<EvoluOutput> = [];
    evoluChannel1.port2.onMessage = (output) => {
      outputs1.push(output);
    };

    dbWorkerChannel1.port2.postMessage({
      type: "LeaderAcquired",
      name: testName,
    });

    const query = testQuery;
    evoluChannel1.port2.postMessage({
      type: "Query",
      queries: createSet([query]),
    });
    time.advance("10s");
    await testWaitForWorkerMessage();

    const queuedInput = dbInputs1.at(-1);
    assert(queuedInput);
    assert(queuedInput.request.type === "ForEvolu");

    evoluChannel1.port2.postMessage({ type: "Dispose" });

    dbWorkerChannel1.port2.postMessage({
      type: "OnQueuedResponse",
      callbackId: queuedInput.callbackId,
      response: {
        type: "ForEvolu",
        id: queuedInput.request.id,
        message: {
          type: "Query",
          rowsByQuery: new Map([[query, [{ value: 1 }]]]),
        },
      },
    });

    expect(outputs1).toEqual([]);
  });

  test("ignores export response for disposed port while another port keeps shared evolu alive", async () => {
    await using setup = await setupSharedWorker();
    const { run, worker } = setup;
    const { time } = run.deps;

    const evoluChannel1 = testCreateMessageChannel<EvoluOutput, EvoluInput>();
    const dbWorkerChannel1 = testCreateMessageChannel<
      DbWorkerInput,
      DbWorkerOutput
    >();
    const evoluChannel2 = testCreateMessageChannel<EvoluOutput, EvoluInput>();
    const dbWorkerChannel2 = testCreateMessageChannel<
      DbWorkerInput,
      DbWorkerOutput
    >();

    worker.port.postMessage({
      type: "CreateEvolu",
      name: testName,
      evoluPort: evoluChannel1.port1.native,
      dbWorkerPort: dbWorkerChannel1.port1.native,
    });
    worker.port.postMessage({
      type: "CreateEvolu",
      name: testName,
      evoluPort: evoluChannel2.port1.native,
      dbWorkerPort: dbWorkerChannel2.port1.native,
    });

    const dbInputs1: Array<DbWorkerInput> = [];
    dbWorkerChannel1.port2.onMessage = (input) => {
      dbInputs1.push(input);
    };

    const outputs1: Array<EvoluOutput> = [];
    evoluChannel1.port2.onMessage = (output) => {
      outputs1.push(output);
    };

    dbWorkerChannel1.port2.postMessage({
      type: "LeaderAcquired",
      name: testName,
    });

    evoluChannel1.port2.postMessage({ type: "Export" });
    time.advance("10s");
    await testWaitForWorkerMessage();

    const queuedInput = dbInputs1.at(-1);
    assert(queuedInput);
    assert(queuedInput.request.type === "ForEvolu");

    evoluChannel1.port2.postMessage({ type: "Dispose" });

    dbWorkerChannel1.port2.postMessage({
      type: "OnQueuedResponse",
      callbackId: queuedInput.callbackId,
      response: {
        type: "ForEvolu",
        id: queuedInput.request.id,
        message: {
          type: "Export",
          file: new Uint8Array([7]),
        },
      },
    });

    expect(outputs1).toEqual([]);
  });

  test("ignores export response after evolu dispose", async () => {
    await using setup = await setupSharedWorker();
    const { run, worker } = setup;
    const { time } = run.deps;

    const evoluChannel = testCreateMessageChannel<EvoluOutput, EvoluInput>();
    const dbWorkerChannel = testCreateMessageChannel<
      DbWorkerInput,
      DbWorkerOutput
    >();

    worker.port.postMessage({
      type: "CreateEvolu",
      name: testName,
      evoluPort: evoluChannel.port1.native,
      dbWorkerPort: dbWorkerChannel.port1.native,
    });

    const dbInputs: Array<DbWorkerInput> = [];
    dbWorkerChannel.port2.onMessage = (input) => {
      dbInputs.push(input);
    };

    const outputs: Array<EvoluOutput> = [];
    evoluChannel.port2.onMessage = (output) => {
      outputs.push(output);
    };

    dbWorkerChannel.port2.postMessage({
      type: "LeaderAcquired",
      name: testName,
    });

    evoluChannel.port2.postMessage({ type: "Export" });
    time.advance("10s");
    await testWaitForWorkerMessage();

    const exportInput = dbInputs.at(-1);
    assert(exportInput);
    assert(exportInput.request.type === "ForEvolu");

    evoluChannel.port2.postMessage({ type: "Dispose" });

    dbWorkerChannel.port2.postMessage({
      type: "OnQueuedResponse",
      callbackId: exportInput.callbackId,
      response: {
        type: "ForEvolu",
        id: exportInput.request.id,
        message: {
          type: "Export",
          file: new Uint8Array([9]),
        },
      },
    });

    expect(outputs).toEqual([]);
  });

  test("disposes shared evolu while queue processing is active", async () => {
    await using setup = await setupSharedWorker();
    const { worker } = setup;

    const evoluChannel = testCreateMessageChannel<never, EvoluInput>();
    const dbWorkerChannel = testCreateMessageChannel<
      DbWorkerInput,
      DbWorkerOutput
    >();

    worker.port.postMessage({
      type: "CreateEvolu",
      name: testName,
      evoluPort: evoluChannel.port1.native,
      dbWorkerPort: dbWorkerChannel.port1.native,
    });

    dbWorkerChannel.port2.postMessage({
      type: "LeaderAcquired",
      name: testName,
    });

    evoluChannel.port2.postMessage({
      type: "Query",
      queries: createSet([testQuery]),
    });
    // Test passes if dispose (via await using) doesn't throw.
  });
});

describe("queue processing", () => {
  test("does not send queued requests before leader is acquired", async () => {
    await using setup = await setupSharedWorker();
    const { run, worker } = setup;
    const { time } = run.deps;

    const evoluChannel = testCreateMessageChannel<never, EvoluInput>();
    const dbWorkerChannel = testCreateMessageChannel<
      DbWorkerInput,
      DbWorkerOutput
    >();

    worker.port.postMessage({
      type: "CreateEvolu",
      name: testName,
      evoluPort: evoluChannel.port1.native,
      dbWorkerPort: dbWorkerChannel.port1.native,
    });

    const dbInputs: Array<DbWorkerInput> = [];
    dbWorkerChannel.port2.onMessage = (input) => {
      dbInputs.push(input);
    };

    evoluChannel.port2.postMessage({
      type: "Query",
      queries: createSet([testQuery]),
    });

    time.advance("10s");
    await testWaitForWorkerMessage();
    expect(dbInputs).toEqual([]);

    dbWorkerChannel.port2.postMessage({
      type: "LeaderAcquired",
      name: testName,
    });

    time.advance("10s");
    await testWaitForWorkerMessage();
    expect(dbInputs.length).toBeGreaterThan(0);
  });

  test("keeps processing first queued item while a second is waiting", async () => {
    await using setup = await setupSharedWorker();
    const { run, worker } = setup;
    const { time } = run.deps;

    const evoluChannel = testCreateMessageChannel<never, EvoluInput>();
    const dbWorkerChannel = testCreateMessageChannel<
      DbWorkerInput,
      DbWorkerOutput
    >();

    worker.port.postMessage({
      type: "CreateEvolu",
      name: testName,
      evoluPort: evoluChannel.port1.native,
      dbWorkerPort: dbWorkerChannel.port1.native,
    });

    const dbInputs: Array<DbWorkerInput> = [];
    dbWorkerChannel.port2.onMessage = (input) => {
      dbInputs.push(input);
    };

    dbWorkerChannel.port2.postMessage({
      type: "LeaderAcquired",
      name: testName,
    });

    const query = testQuery;
    evoluChannel.port2.postMessage({
      type: "Query",
      queries: createSet([query]),
    });
    evoluChannel.port2.postMessage({
      type: "Query",
      queries: createSet([query]),
    });

    time.advance("10s");
    await testWaitForWorkerMessage();

    const firstInput = dbInputs.at(-1);
    assert(firstInput);

    time.advance("10s");
    await testWaitForWorkerMessage();

    const repeatedFirstInput = dbInputs.at(-1);
    assert(repeatedFirstInput);
    expect(repeatedFirstInput.callbackId).toBe(firstInput.callbackId);
  });
});

describe("exhaustive checks", () => {
  test("throws for impossible db worker and evolu port messages", async () => {
    await using setup = await setupSharedWorker();
    const { worker } = setup;

    const evoluChannel = testCreateMessageChannel<never, EvoluInput>();
    const dbWorkerChannel = testCreateMessageChannel<
      DbWorkerInput,
      DbWorkerOutput
    >();

    worker.port.postMessage({
      type: "CreateEvolu",
      name: testName,
      evoluPort: evoluChannel.port1.native,
      dbWorkerPort: dbWorkerChannel.port1.native,
    });
    await testWaitForWorkerMessage();

    const dbWorkerOnMessage = dbWorkerChannel.port1.onMessage;
    const evoluOnMessage = evoluChannel.port1.onMessage;
    assert(dbWorkerOnMessage);
    assert(evoluOnMessage);

    expect(() => dbWorkerOnMessage({ type: "Impossible" } as never)).toThrow(
      /exhaustiveCheck/,
    );
    expect(() => evoluOnMessage({ type: "Impossible" } as never)).toThrow(
      /exhaustiveCheck/,
    );
  });

  test("throws for impossible queued response type", async () => {
    await using setup = await setupSharedWorker();
    const { run, worker } = setup;
    const { time } = run.deps;

    const evoluChannel = testCreateMessageChannel<EvoluOutput, EvoluInput>();
    const dbWorkerChannel = testCreateMessageChannel<
      DbWorkerInput,
      DbWorkerOutput
    >();
    const dbInputs: Array<DbWorkerInput> = [];
    dbWorkerChannel.port2.onMessage = (input) => {
      dbInputs.push(input);
    };

    worker.port.postMessage({
      type: "CreateEvolu",
      name: testName,
      evoluPort: evoluChannel.port1.native,
      dbWorkerPort: dbWorkerChannel.port1.native,
    });
    dbWorkerChannel.port2.postMessage({
      type: "LeaderAcquired",
      name: testName,
    });
    evoluChannel.port2.postMessage({
      type: "Query",
      queries: createSet([testQuery]),
    });
    time.advance("10s");
    await testWaitForWorkerMessage();

    const queryInput = dbInputs.at(-1);
    assert(queryInput);
    const dbWorkerOnMessage = dbWorkerChannel.port1.onMessage;
    assert(dbWorkerOnMessage);

    expect(() =>
      dbWorkerOnMessage({
        type: "OnQueuedResponse",
        callbackId: queryInput.callbackId,
        response: { type: "Impossible" } as never,
      }),
    ).toThrow(/exhaustiveCheck/);
  });

  test("throws for impossible evolu queued response messages", async () => {
    await using setup = await setupSharedWorker();
    const { run, worker } = setup;
    const { time } = run.deps;

    const evoluChannel = testCreateMessageChannel<EvoluOutput, EvoluInput>();
    const dbWorkerChannel = testCreateMessageChannel<
      DbWorkerInput,
      DbWorkerOutput
    >();
    const dbInputs: Array<DbWorkerInput> = [];
    dbWorkerChannel.port2.onMessage = (input) => {
      dbInputs.push(input);
    };

    worker.port.postMessage({
      type: "CreateEvolu",
      name: testName,
      evoluPort: evoluChannel.port1.native,
      dbWorkerPort: dbWorkerChannel.port1.native,
    });
    dbWorkerChannel.port2.postMessage({
      type: "LeaderAcquired",
      name: testName,
    });
    evoluChannel.port2.postMessage({
      type: "Query",
      queries: createSet([testQuery]),
    });
    time.advance("10s");
    await testWaitForWorkerMessage();

    const queryInput = dbInputs.at(-1);
    assert(queryInput);
    assert(queryInput.request.type === "ForEvolu");
    const id = queryInput.request.id;
    const dbWorkerOnMessage = dbWorkerChannel.port1.onMessage;
    assert(dbWorkerOnMessage);

    expect(() =>
      dbWorkerOnMessage({
        type: "OnQueuedResponse",
        callbackId: queryInput.callbackId,
        response: {
          type: "ForEvolu",
          id,
          message: { type: "Impossible" },
        } as never,
      }),
    ).toThrow(/exhaustiveCheck/);
  });

  test("throws for impossible shared worker queued response messages", async () => {
    const inspectableWebSocket = testCreateWebSocket();
    await using setup = await setupSharedWorker({
      createWebSocket: inspectableWebSocket,
    });
    const { worker } = setup;

    const evoluChannel = testCreateMessageChannel<never, EvoluInput>();
    const dbWorkerChannel = testCreateMessageChannel<
      DbWorkerInput,
      DbWorkerOutput
    >();
    const transport = createOwnerWebSocketTransport({
      url: "wss://impossible-shared-worker.example",
      ownerId: testAppOwner.id,
    });
    const dbInputs: Array<DbWorkerInput> = [];
    dbWorkerChannel.port2.onMessage = (input) => {
      dbInputs.push(input);
    };

    worker.port.postMessage({
      type: "CreateEvolu",
      name: testName,
      evoluPort: evoluChannel.port1.native,
      dbWorkerPort: dbWorkerChannel.port1.native,
    });
    dbWorkerChannel.port2.postMessage({
      type: "LeaderAcquired",
      name: testName,
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

    const createSyncInput = dbInputs.at(-1);
    assert(createSyncInput);
    const dbWorkerOnMessage = dbWorkerChannel.port1.onMessage;
    assert(dbWorkerOnMessage);

    expect(() =>
      dbWorkerOnMessage({
        type: "OnQueuedResponse",
        callbackId: createSyncInput.callbackId,
        response: {
          type: "ForSharedWorker",
          message: { type: "Impossible" },
        } as never,
      }),
    ).toThrow(/exhaustiveCheck/);
  });

  test("throws for impossible shared worker apply result values", async () => {
    const inspectableWebSocket = testCreateWebSocket();
    await using setup = await setupSharedWorker({
      createWebSocket: inspectableWebSocket,
    });
    const { run, worker } = setup;
    const { time } = run.deps;

    const evoluChannel = testCreateMessageChannel<never, EvoluInput>();
    const dbWorkerChannel = testCreateMessageChannel<
      DbWorkerInput,
      DbWorkerOutput
    >();
    const transport = createOwnerWebSocketTransport({
      url: "wss://impossible-apply.example",
      ownerId: testAppOwner.id,
    });
    const dbInputs: Array<DbWorkerInput> = [];
    dbWorkerChannel.port2.onMessage = (input) => {
      dbInputs.push(input);
    };

    worker.port.postMessage({
      type: "CreateEvolu",
      name: testName,
      evoluPort: evoluChannel.port1.native,
      dbWorkerPort: dbWorkerChannel.port1.native,
    });
    dbWorkerChannel.port2.postMessage({
      type: "LeaderAcquired",
      name: testName,
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

    const createSyncInput = dbInputs.at(-1);
    assert(createSyncInput);
    dbWorkerChannel.port2.postMessage({
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

    inspectableWebSocket.message(
      transport.url,
      protocolMessageToArrayBuffer(
        createProtocolMessageForUnsubscribe(testAppOwner.id),
      ),
    );
    time.advance("10s");
    await testWaitForWorkerMessage();

    const applyInput = dbInputs.at(-1);
    assert(applyInput);
    const dbWorkerOnMessage = dbWorkerChannel.port1.onMessage;
    assert(dbWorkerOnMessage);

    expect(() =>
      dbWorkerOnMessage({
        type: "OnQueuedResponse",
        callbackId: applyInput.callbackId,
        response: {
          type: "ForSharedWorker",
          message: {
            type: "ApplySyncMessage",
            ownerId: testAppOwner.id,
            didWriteMessages: false,
            result: { ok: true, value: { type: "Impossible" } },
          },
        } as never,
      }),
    ).toThrow(/exhaustiveCheck/);
  });
});
