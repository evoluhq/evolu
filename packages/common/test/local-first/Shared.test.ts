import { assert, describe, expect, test } from "vitest";
import type { ConsoleEntry } from "../../src/Console.js";
import { testCreateConsole } from "../../src/Console.js";
import type { Query } from "../../src/local-first/Query.js";
import type { MutationChange } from "../../src/local-first/Schema.js";
import type {
  DbWorkerInput,
  DbWorkerOutput,
} from "../../src/local-first/Shared.js";
import {
  type EvoluInput,
  type EvoluOutput,
  type EvoluTabOutput,
  type SharedWorkerInput,
  initSharedWorker,
} from "../../src/local-first/Shared.js";
import { createSet } from "../../src/Set.js";
import type { ReadonlyStore } from "../../src/Store.js";
import { createStore } from "../../src/Store.js";
import { testCreateDeps, testCreateRun } from "../../src/Test.js";
import type { TestTime } from "../../src/Time.js";
import { type Id, testName } from "../../src/Type.js";
import {
  testCreateMessageChannel,
  testCreateMessagePort,
  testCreateSharedWorker,
} from "../../src/Worker.js";

describe("initSharedWorker", () => {
  const setupWorker = async (
    consoleStoreOutputEntry: ReadonlyStore<ConsoleEntry | null> = createStore<ConsoleEntry | null>(
      null,
    ),
  ) => {
    const worker = testCreateSharedWorker<SharedWorkerInput>();

    const deps = testCreateDeps();

    const run = testCreateRun({
      ...deps,
      console: testCreateConsole(),
      consoleStoreOutputEntry,
      createMessagePort: testCreateMessagePort,
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

    expect(receivedOutputs).toEqual([
      { type: "OnConsoleEntry", entry: firstEntry },
      { type: "OnConsoleEntry", entry: secondEntry },
    ]);
  });

  test("forwards entries immediately when console port is already connected", async () => {
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

    const liveEntry: ConsoleEntry = {
      method: "info",
      path: ["live"],
      args: ["entry"],
    };

    consoleStoreOutputEntry.set(liveEntry);

    expect(receivedOutputs).toEqual([
      { type: "OnConsoleEntry", entry: liveEntry },
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

    expect(receivedOutputs).toEqual([{ type: "OnConsoleEntry", entry }]);
  });

  test("forwards typed console error entries as ConsoleEntry", async () => {
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

    const error = { type: "UnknownError", error: "boom" } as const;
    const entry: ConsoleEntry = {
      method: "error",
      path: ["global"],
      args: ["error", error],
    };

    consoleStoreOutputEntry.set(entry);

    expect(receivedOutputs).toEqual([{ type: "OnConsoleEntry", entry }]);
  });

  test("forwards untyped console error entries as ConsoleEntry", async () => {
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
      method: "error",
      path: ["global"],
      args: ["error", "plain string"],
    };

    consoleStoreOutputEntry.set(entry);

    expect(receivedOutputs).toEqual([{ type: "OnConsoleEntry", entry }]);
  });

  test("forwards console error entry with one argument", async () => {
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
      method: "error",
      path: ["global"],
      args: ["plain string"],
    };

    consoleStoreOutputEntry.set(entry);

    expect(receivedOutputs).toEqual([{ type: "OnConsoleEntry", entry }]);
  });

  test("forwards console error entry with no arguments", async () => {
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
      method: "error",
      path: ["global"],
      args: [],
    };

    consoleStoreOutputEntry.set(entry);

    expect(receivedOutputs).toEqual([{ type: "OnConsoleEntry", entry }]);
  });

  test("accepts CreateEvolu message", async () => {
    const { run, worker, workerStack } = await setupWorker();
    await using _run = run;
    await using _workerStack = workerStack;

    const evoluChannel = testCreateMessageChannel<never, EvoluInput>();
    const dbWorkerChannel = testCreateMessageChannel<
      DbWorkerInput,
      DbWorkerOutput
    >();

    expect(() => {
      worker.port.postMessage({
        type: "CreateEvolu",
        name: testName,
        evoluPort: evoluChannel.port1.native,
        dbWorkerPort: dbWorkerChannel.port1.native,
      });
    }).not.toThrow();
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

    expect(receivedOutputs).toContainEqual({ type: "OnConsoleEntry", entry });
  });

  test("accepts LeaderAcquired events from db worker channel", async () => {
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

    expect(() => {
      dbWorkerChannel.port2.postMessage({
        type: "LeaderAcquired",
        name: testName,
      });
    }).not.toThrow();
  });

  test("accepts Evolu input messages on evolu channel", async () => {
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

    expect(() => {
      evoluChannel.port2.postMessage({
        type: "Mutate",
        changes: [{} as MutationChange],
        onCompleteIds: [],
        subscribedQueries: new Set(),
      });
    }).not.toThrow();
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

    const query = "q:test" as Query;
    const mutateOnCompleteId = "mutate-complete" as Id;

    evoluChannel.port2.postMessage({
      type: "Mutate",
      changes: [{} as MutationChange],
      onCompleteIds: [mutateOnCompleteId],
      subscribedQueries: new Set([query]),
    });
    time.advance("10s");
    await Promise.resolve();

    const mutateInput = dbInputs.at(-1);
    assert(mutateInput);

    dbWorkerChannel.port2.postMessage({
      type: "OnQueuedResponse",
      callbackId: mutateInput.callbackId,
      evoluPortId: mutateInput.evoluPortId,
      response: {
        type: "Mutate",
        messagesByOwnerId: new Map(),
        rowsByQuery: new Map([[query, [{ value: 1 }]]]),
      },
    });

    evoluChannel.port2.postMessage({
      type: "Query",
      queries: createSet([query]),
    });
    time.advance("10s");
    await Promise.resolve();

    const queryInput = dbInputs.at(-1);
    assert(queryInput);

    dbWorkerChannel.port2.postMessage({
      type: "OnQueuedResponse",
      callbackId: queryInput.callbackId,
      evoluPortId: queryInput.evoluPortId,
      response: {
        type: "Query",
        rowsByQuery: new Map([[query, [{ value: 2 }]]]),
      },
    });

    const mutateOutput = outputs[0];
    const queryOutput = outputs[1];
    assert(mutateOutput.type === "OnQueryPatches");
    assert(queryOutput.type === "OnQueryPatches");

    expect(mutateOutput.onCompleteIds).toEqual([mutateOnCompleteId]);
    expect(queryOutput.onCompleteIds).toEqual([]);

    expect(mutateOutput.queryPatches[0]?.patches[0]).toEqual({
      op: "replaceAll",
      value: [{ value: 1 }],
    });
    expect(queryOutput.queryPatches[0]?.patches[0]).toEqual({
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
    await Promise.resolve();

    const exportInput = dbInputs.at(-1);
    assert(exportInput);

    const file = new Uint8Array([1, 2, 3]);
    dbWorkerChannel.port2.postMessage({
      type: "OnQueuedResponse",
      callbackId: exportInput.callbackId,
      evoluPortId: exportInput.evoluPortId,
      response: {
        type: "Export",
        file,
      },
    });

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

    const query = "q:refresh-other" as Query;
    evoluChannel1.port2.postMessage({
      type: "Mutate",
      changes: [{} as MutationChange],
      onCompleteIds: [],
      subscribedQueries: new Set([query]),
    });

    time.advance("10s");
    await Promise.resolve();

    const mutateInput = dbInputs1.at(-1);
    assert(mutateInput);

    dbWorkerChannel1.port2.postMessage({
      type: "OnQueuedResponse",
      callbackId: mutateInput.callbackId,
      evoluPortId: mutateInput.evoluPortId,
      response: {
        type: "Mutate",
        messagesByOwnerId: new Map(),
        rowsByQuery: new Map([[query, [{ value: 1 }]]]),
      },
    });

    const output1 = outputs1[0];
    const output2 = outputs2[0];
    assert(output1.type === "OnQueryPatches");
    assert(output2.type === "RefreshQueries");
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

    const query = "q:queue" as Query;

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
    await Promise.resolve();

    const firstInput = dbInputs[0];
    assert(firstInput);
    dbWorkerChannel.port2.postMessage({
      type: "OnQueuedResponse",
      callbackId: firstInput.callbackId,
      evoluPortId: firstInput.evoluPortId,
      response: {
        type: "Query",
        rowsByQuery: new Map([[query, [{ value: 1 }, { value: 2 }]]]),
      },
    });

    time.advance("10s");
    await Promise.resolve();

    const secondInput = dbInputs[1];
    assert(secondInput);
    dbWorkerChannel.port2.postMessage({
      type: "OnQueuedResponse",
      callbackId: secondInput.callbackId,
      evoluPortId: secondInput.evoluPortId,
      response: {
        type: "Query",
        rowsByQuery: new Map([[query, [{ value: 1 }, { value: 3 }]]]),
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

    const query = "q:empty" as Query;
    evoluChannel.port2.postMessage({
      type: "Query",
      queries: createSet([query]),
    });
    time.advance("10s");
    await Promise.resolve();

    const queuedInput = dbInputs.at(-1);
    assert(queuedInput);

    evoluChannel.port2.postMessage({ type: "Dispose" });

    dbWorkerChannel.port2.postMessage({
      type: "OnQueuedResponse",
      callbackId: queuedInput.callbackId,
      evoluPortId: queuedInput.evoluPortId,
      response: {
        type: "Query",
        rowsByQuery: new Map(),
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

    const query = "q:multi" as Query;
    evoluChannel2.port2.postMessage({
      type: "Query",
      queries: createSet([query]),
    });
    time.advance("10s");
    await Promise.resolve();

    const queuedInput2 = dbInputs2.at(-1);
    assert(queuedInput2);

    dbWorkerChannel2.port2.postMessage({
      type: "OnQueuedResponse",
      callbackId: queuedInput2.callbackId,
      evoluPortId: queuedInput2.evoluPortId,
      response: {
        type: "Query",
        rowsByQuery: new Map([[query, [{ value: 1 }]]]),
      },
    });

    const output2 = outputs2[0];
    assert(output2.type === "OnQueryPatches");
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

    const query = "q:disposed-query" as Query;
    evoluChannel1.port2.postMessage({
      type: "Query",
      queries: createSet([query]),
    });
    time.advance("10s");
    await Promise.resolve();

    const queuedInput = dbInputs1.at(-1);
    assert(queuedInput);

    evoluChannel1.port2.postMessage({ type: "Dispose" });

    dbWorkerChannel1.port2.postMessage({
      type: "OnQueuedResponse",
      callbackId: queuedInput.callbackId,
      evoluPortId: queuedInput.evoluPortId,
      response: {
        type: "Query",
        rowsByQuery: new Map([[query, [{ value: 1 }]]]),
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
    await Promise.resolve();

    const queuedInput = dbInputs1.at(-1);
    assert(queuedInput);

    evoluChannel1.port2.postMessage({ type: "Dispose" });

    dbWorkerChannel1.port2.postMessage({
      type: "OnQueuedResponse",
      callbackId: queuedInput.callbackId,
      evoluPortId: queuedInput.evoluPortId,
      response: {
        type: "Export",
        file: new Uint8Array([7]),
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
    await Promise.resolve();

    const exportInput = dbInputs.at(-1);
    assert(exportInput);

    evoluChannel.port2.postMessage({ type: "Dispose" });

    dbWorkerChannel.port2.postMessage({
      type: "OnQueuedResponse",
      callbackId: exportInput.callbackId,
      evoluPortId: exportInput.evoluPortId,
      response: {
        type: "Export",
        file: new Uint8Array([9]),
      },
    });

    expect(outputs).toEqual([]);
  });

  test("throws for unknown db worker channel message type", async () => {
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

    expect(() => {
      dbWorkerChannel.port2.postMessage({ type: "Unknown" } as never);
    }).toThrow();
  });

  test("throws for unknown queued response type", async () => {
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

    evoluChannel.port2.postMessage({
      type: "Query",
      queries: createSet(["q:unknown" as Query]),
    });

    time.advance("10s");
    await Promise.resolve();

    const queuedInput = dbInputs.at(-1);
    assert(queuedInput);

    expect(() => {
      dbWorkerChannel.port2.postMessage({
        type: "OnQueuedResponse",
        callbackId: queuedInput.callbackId,
        evoluPortId: queuedInput.evoluPortId,
        response: { type: "Unknown" } as never,
      });
    }).toThrow();
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
      queries: createSet(["q:dispose-active" as Query]),
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
      queries: createSet(["q:no-leader" as Query]),
    });

    time.advance("10s");
    await Promise.resolve();
    expect(dbInputs).toEqual([]);

    dbWorkerChannel.port2.postMessage({
      type: "LeaderAcquired",
      name: testName,
    });

    time.advance("10s");
    await Promise.resolve();
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

    const query = "q:waiting" as Query;
    evoluChannel.port2.postMessage({
      type: "Query",
      queries: createSet([query]),
    });
    evoluChannel.port2.postMessage({
      type: "Query",
      queries: createSet([query]),
    });

    time.advance("10s");
    await Promise.resolve();

    const firstInput = dbInputs.at(-1);
    assert(firstInput);

    time.advance("10s");
    await Promise.resolve();

    const repeatedFirstInput = dbInputs.at(-1);
    assert(repeatedFirstInput);
    expect(repeatedFirstInput.callbackId).toBe(firstInput.callbackId);
  });

  test("throws for unknown evolu channel message type", async () => {
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

    expect(() => {
      evoluChannel.port2.postMessage({ type: "Unknown" } as never);
    }).toThrow();
  });

  test("throws for unknown message type", async () => {
    const { run, worker, workerStack } = await setupWorker();
    await using _run = run;
    await using _workerStack = workerStack;

    expect(() => {
      worker.port.postMessage({
        type: "Unknown",
      } as never);
    }).toThrow();
  });
});
