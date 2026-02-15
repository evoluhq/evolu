import { createStore } from "../../src/Store.js";
import type { ConsoleEntry } from "../../src/Console.js";
import type { ReadonlyStore } from "../../src/Store.js";
import {
  type EvoluInput,
  type EvoluTabOutput,
  type SharedWorkerInput,
  initSharedWorker,
} from "../../src/local-first/Shared.js";
import type { DbWorkerLeaderOutput } from "../../src/local-first/Db.js";
import type { MutationChange } from "../../src/local-first/Schema.js";
import { testCreateConsole } from "../../src/Console.js";
import { testCreateRun } from "../../src/Test.js";
import {
  testCreateMessageChannel,
  testCreateMessagePort,
  testCreateSharedWorker,
} from "../../src/Worker.js";
import { testName } from "../../src/Type.js";
import { describe, expect, test } from "vitest";

describe("initSharedWorker", () => {
  const setupWorker = async (
    consoleStoreOutputEntry: ReadonlyStore<ConsoleEntry | null> = createStore<ConsoleEntry | null>(
      null,
    ),
  ) => {
    const { worker, self, connect } =
      testCreateSharedWorker<SharedWorkerInput>();

    await using run = testCreateRun({
      console: testCreateConsole(),
      consoleStoreOutputEntry,
      createMessagePort: testCreateMessagePort,
    });

    const initResult = await run(initSharedWorker(self));
    if (!initResult.ok)
      throw new Error("initSharedWorker should always succeed");

    connect();

    return {
      worker,
      workerStack: initResult.value,
    };
  };

  test("replays queued console entries after first console port connects", async () => {
    const consoleStoreOutputEntry = createStore<ConsoleEntry | null>(null);
    const { worker, workerStack } = await setupWorker(consoleStoreOutputEntry);
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
      { type: "ConsoleEntry", entry: firstEntry },
      { type: "ConsoleEntry", entry: secondEntry },
    ]);
  });

  test("forwards entries immediately when console port is already connected", async () => {
    const consoleStoreOutputEntry = createStore<ConsoleEntry | null>(null);
    const { worker, workerStack } = await setupWorker(consoleStoreOutputEntry);
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
      { type: "ConsoleEntry", entry: liveEntry },
    ]);
  });

  test("ignores null console store updates", async () => {
    const consoleStoreOutputEntry = createStore<ConsoleEntry | null>(null);
    const { worker, workerStack } = await setupWorker(consoleStoreOutputEntry);
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

    expect(receivedOutputs).toEqual([{ type: "ConsoleEntry", entry }]);
  });

  test("forwards typed console error entries as ConsoleEntry", async () => {
    const consoleStoreOutputEntry = createStore<ConsoleEntry | null>(null);
    const { worker, workerStack } = await setupWorker(consoleStoreOutputEntry);
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

    expect(receivedOutputs).toEqual([{ type: "ConsoleEntry", entry }]);
  });

  test("forwards untyped console error entries as ConsoleEntry", async () => {
    const consoleStoreOutputEntry = createStore<ConsoleEntry | null>(null);
    const { worker, workerStack } = await setupWorker(consoleStoreOutputEntry);
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

    expect(receivedOutputs).toEqual([{ type: "ConsoleEntry", entry }]);
  });

  test("forwards console error entry with one argument", async () => {
    const consoleStoreOutputEntry = createStore<ConsoleEntry | null>(null);
    const { worker, workerStack } = await setupWorker(consoleStoreOutputEntry);
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

    expect(receivedOutputs).toEqual([{ type: "ConsoleEntry", entry }]);
  });

  test("forwards console error entry with no arguments", async () => {
    const consoleStoreOutputEntry = createStore<ConsoleEntry | null>(null);
    const { worker, workerStack } = await setupWorker(consoleStoreOutputEntry);
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

    expect(receivedOutputs).toEqual([{ type: "ConsoleEntry", entry }]);
  });

  test("accepts InitEvolu message", async () => {
    const { worker, workerStack } = await setupWorker();
    await using _workerStack = workerStack;

    const evoluChannel = testCreateMessageChannel<never, EvoluInput>();
    const leaderChannel = testCreateMessageChannel<
      never,
      DbWorkerLeaderOutput
    >();

    expect(() => {
      worker.port.postMessage({
        type: "InitEvolu",
        name: testName,
        port1: evoluChannel.port1.native,
        port2: leaderChannel.port1.native,
      });
    }).not.toThrow();
  });

  test("forwards DbWorker console entries from leader channel", async () => {
    const { worker, workerStack } = await setupWorker();
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
    const leaderChannel = testCreateMessageChannel<
      never,
      DbWorkerLeaderOutput
    >();

    worker.port.postMessage({
      type: "InitEvolu",
      name: testName,
      port1: evoluChannel.port1.native,
      port2: leaderChannel.port1.native,
    });

    const entry: ConsoleEntry = {
      method: "info",
      path: ["DbWorker"],
      args: ["initializeDb", { name: testName }],
    };

    leaderChannel.port2.postMessage({ type: "ConsoleEntry", entry });

    expect(receivedOutputs).toContainEqual({ type: "ConsoleEntry", entry });
  });

  test("accepts LeaderAcquired events from leader channel", async () => {
    const { worker, workerStack } = await setupWorker();
    await using _workerStack = workerStack;

    const evoluChannel = testCreateMessageChannel<never, EvoluInput>();
    const leaderChannel = testCreateMessageChannel<
      never,
      DbWorkerLeaderOutput
    >();

    worker.port.postMessage({
      type: "InitEvolu",
      name: testName,
      port1: evoluChannel.port1.native,
      port2: leaderChannel.port1.native,
    });

    expect(() => {
      leaderChannel.port2.postMessage({
        type: "LeaderAcquired",
        name: testName,
      });
    }).not.toThrow();
  });

  test("accepts Evolu input messages on evolu channel", async () => {
    const { worker, workerStack } = await setupWorker();
    await using _workerStack = workerStack;

    const evoluChannel = testCreateMessageChannel<never, EvoluInput>();
    const leaderChannel = testCreateMessageChannel<
      never,
      DbWorkerLeaderOutput
    >();

    worker.port.postMessage({
      type: "InitEvolu",
      name: testName,
      port1: evoluChannel.port1.native,
      port2: leaderChannel.port1.native,
    });

    expect(() => {
      evoluChannel.port2.postMessage({
        type: "mutate",
        changes: [{} as MutationChange],
        onCompleteIds: [],
        subscribedQueries: [],
      });
    }).not.toThrow();
  });

  test("throws for unknown leader channel message type", async () => {
    const { worker, workerStack } = await setupWorker();
    await using _workerStack = workerStack;

    const evoluChannel = testCreateMessageChannel<never, EvoluInput>();
    const leaderChannel = testCreateMessageChannel<
      never,
      DbWorkerLeaderOutput
    >();

    worker.port.postMessage({
      type: "InitEvolu",
      name: testName,
      port1: evoluChannel.port1.native,
      port2: leaderChannel.port1.native,
    });

    expect(() => {
      leaderChannel.port2.postMessage({ type: "Unknown" } as never);
    }).toThrow();
  });

  test("throws for unknown message type", async () => {
    const { worker, workerStack } = await setupWorker();
    await using _workerStack = workerStack;

    expect(() => {
      worker.port.postMessage({
        type: "Unknown",
      } as never);
    }).toThrow();
  });
});
