import { assert, describe, expect, test } from "vitest";
import type { ConsoleEntry } from "../../src/Console.js";
import { testCreateConsole } from "../../src/Console.js";
import {
  createOwnerWebSocketTransport,
  type OwnerId,
  testAppOwner,
} from "../../src/local-first/Owner.js";
import { testQuery } from "../../src/local-first/Query.js";
import type { MutationChange } from "../../src/local-first/Schema.js";
import type {
  DbWorkerInput,
  DbWorkerOutput,
} from "../../src/local-first/Shared.js";
import { testCreateCrdtMessage } from "../../src/local-first/Storage.js";
import {
  type EvoluInput,
  type EvoluOutput,
  type EvoluTabOutput,
  type SharedWorkerInput,
  initSharedWorker,
} from "../../src/local-first/Shared.js";
import { ok } from "../../src/Result.js";
import { createSet } from "../../src/Set.js";
import type { ReadonlyStore } from "../../src/Store.js";
import { createStore } from "../../src/Store.js";
import { testCreateDeps, testCreateRun } from "../../src/Test.js";
import { type TestTime } from "../../src/Time.js";
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

describe("initSharedWorker", () => {
  // TODO: Replace with a Run with deps.
  const setupWorker = async (
    consoleStoreOutputEntry: ReadonlyStore<ConsoleEntry | null> = createStore<ConsoleEntry | null>(
      null,
    ),
    createWebSocket: CreateWebSocket = testCreateWebSocket({
      throwOnCreate: true,
    }),
  ) => {
    const worker = testCreateSharedWorker<SharedWorkerInput>();

    const deps = testCreateDeps();

    const run = testCreateRun({
      ...deps,
      console: testCreateConsole(),
      consoleStoreOutputEntry,
      createMessagePort: testCreateMessagePort,
      createWebSocket,
    });

    const initResult = await run(initSharedWorker(worker.self));
    assert(initResult.ok);

    worker.connect();

    return {
      deps,
      run,
      time: deps.time as TestTime,
      worker,
      workerStack: initResult.value,
    };
  };

  test("replays queued console entries after first console port connects", async () => {
    const consoleStoreOutputEntry = createStore<ConsoleEntry | null>(null);
    const { run, worker, workerStack } = await setupWorker(
      consoleStoreOutputEntry,
    );
    await using _run = run;
    await using _workerStack = workerStack;

    const firstEntry: ConsoleEntry = {
      method: "info",
      path: ["before"],
      args: ["queued"],
    };

    consoleStoreOutputEntry.set(firstEntry);

    const receivedOutputs: Array<EvoluTabOutput> = [];
    const consoleChannel = testCreateMessageChannel<EvoluTabOutput>();
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
    const { run, worker, workerStack } = await setupWorker(
      consoleStoreOutputEntry,
    );
    await using _run = run;
    await using _workerStack = workerStack;

    const receivedOutputs: Array<EvoluTabOutput> = [];
    const consoleChannel = testCreateMessageChannel<EvoluTabOutput>();
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
    const { run, worker, workerStack } = await setupWorker();
    await using _run = run;
    await using _workerStack = workerStack;

    const receivedOutputs: Array<EvoluTabOutput> = [];
    const tabChannel = testCreateMessageChannel<EvoluTabOutput>();
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

  test("handles mutate and query queued responses with correct onCompleteIds", async () => {
    const { run, time, worker, workerStack } = await setupWorker();
    await using _run = run;
    await using _workerStack = workerStack;

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
        evoluPortId: mutateInput.request.evoluPortId,
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
        evoluPortId: queryInput.request.evoluPortId,
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
    const { run, time, worker, workerStack } = await setupWorker();
    await using _run = run;
    await using _workerStack = workerStack;

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
        evoluPortId: exportInput.request.evoluPortId,
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
    const { run, time, worker, workerStack } = await setupWorker();
    await using _run = run;
    await using _workerStack = workerStack;

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
        evoluPortId: mutateInput.request.evoluPortId,
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

    const { deps, run, time, worker, workerStack } = await setupWorker(
      undefined,
      createWebSocket,
    );
    await using _run = run;
    await using _workerStack = workerStack;

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
      testCreateCrdtMessage(createId(deps), 1, "hello"),
    ] as const;
    dbWorkerChannel.port2.postMessage({
      type: "OnQueuedResponse",
      callbackId: mutateInput.callbackId,
      response: {
        type: "ForEvolu",
        evoluPortId: mutateInput.request.evoluPortId,
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

  test("releases UseOwner transport claims when evolu instance is disposed", async () => {
    const disposedUrls: Array<string> = [];
    const baseCreateWebSocket = testCreateWebSocket();

    const createWebSocket: CreateWebSocket = (url, options) => async (run) => {
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

    const { run, worker, workerStack } = await setupWorker(
      undefined,
      createWebSocket,
    );
    await using _run = run;
    await using _workerStack = workerStack;

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

    expect(disposedUrls).toEqual([transport.url]);
  });

  test("forwards DbWorker OnError to tab ports", async () => {
    const { run, worker, workerStack } = await setupWorker();
    await using _run = run;
    await using _workerStack = workerStack;

    const receivedOutputs: Array<EvoluTabOutput> = [];
    const tabChannel = testCreateMessageChannel<EvoluTabOutput>();
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

    const errorOutput: EvoluTabOutput = {
      type: "OnError",
      error: { type: "UnknownError", error: "boom" },
    } as const;

    dbWorkerChannel.port2.postMessage(errorOutput);
    await testWaitForWorkerMessage();

    expect(receivedOutputs).toContainEqual(errorOutput);
  });

  test("queues next request while processing current one", async () => {
    const { run, time, worker, workerStack } = await setupWorker();
    await using _run = run;
    await using _workerStack = workerStack;

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
        evoluPortId: firstInput.request.evoluPortId,
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
        evoluPortId: secondInput.request.evoluPortId,
        message: {
          type: "Query",
          rowsByQuery: new Map([[query, [{ value: 1 }, { value: 3 }]]]),
        },
      },
    });

    expect(dbInputs.length).toBeGreaterThanOrEqual(2);
  });

  test("handles empty query rows and response after dispose", async () => {
    const { run, time, worker, workerStack } = await setupWorker();
    await using _run = run;
    await using _workerStack = workerStack;

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
        evoluPortId: queuedInput.request.evoluPortId,
        message: {
          type: "Query",
          rowsByQuery: new Map(),
        },
      },
    });

    expect(outputs).toEqual([]);
  });

  test("keeps shared evolu alive when one of multiple ports disposes", async () => {
    const { run, time, worker, workerStack } = await setupWorker();
    await using _run = run;
    await using _workerStack = workerStack;

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
        evoluPortId: queuedInput2.request.evoluPortId,
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
    const { run, time, worker, workerStack } = await setupWorker();
    await using _run = run;
    await using _workerStack = workerStack;

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
        evoluPortId: queuedInput.request.evoluPortId,
        message: {
          type: "Query",
          rowsByQuery: new Map([[query, [{ value: 1 }]]]),
        },
      },
    });

    expect(outputs1).toEqual([]);
  });

  test("ignores export response for disposed port while another port keeps shared evolu alive", async () => {
    const { run, time, worker, workerStack } = await setupWorker();
    await using _run = run;
    await using _workerStack = workerStack;

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
        evoluPortId: queuedInput.request.evoluPortId,
        message: {
          type: "Export",
          file: new Uint8Array([7]),
        },
      },
    });

    expect(outputs1).toEqual([]);
  });

  test("ignores export response after evolu dispose", async () => {
    const { run, time, worker, workerStack } = await setupWorker();
    await using _run = run;
    await using _workerStack = workerStack;

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
        evoluPortId: exportInput.request.evoluPortId,
        message: {
          type: "Export",
          file: new Uint8Array([9]),
        },
      },
    });

    expect(outputs).toEqual([]);
  });

  test("disposes shared evolu while queue processing is active", async () => {
    const { run, worker, workerStack } = await setupWorker();
    await using _run = run;
    await using _workerStack = workerStack;

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

  test("does not send queued requests before leader is acquired", async () => {
    const { run, time, worker, workerStack } = await setupWorker();
    await using _run = run;
    await using _workerStack = workerStack;

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
    const { run, time, worker, workerStack } = await setupWorker();
    await using _run = run;
    await using _workerStack = workerStack;

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
