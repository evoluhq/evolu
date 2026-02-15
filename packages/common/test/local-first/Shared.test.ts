import { createStore } from "../../src/Store.js";
import type { ConsoleEntry } from "../../src/Console.js";
import type { ReadonlyStore } from "../../src/Store.js";
import {
  type EvoluTabOutput,
  type SharedWorkerInput,
  initSharedWorker,
} from "../../src/local-first/Shared.js";
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

    const evoluChannel = testCreateMessageChannel<string>();
    const brokerChannel = testCreateMessageChannel<string>();

    expect(() => {
      worker.port.postMessage({
        type: "InitEvolu",
        name: testName,
        port: evoluChannel.port1.native,
        brokerPort: brokerChannel.port1.native,
      });
    }).not.toThrow();
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
