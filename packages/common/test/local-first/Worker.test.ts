import { createStore } from "../../src/Store.js";
import type { ConsoleEntry } from "../../src/Console.js";
import type { ReadonlyStore } from "../../src/Store.js";
import {
  type EvoluWorkerInput,
  initEvoluWorker,
} from "../../src/local-first/Worker.js";
import { testCreateConsole } from "../../src/Console.js";
import { testCreateRun } from "../../src/Test.js";
import {
  testCreateMessageChannel,
  testCreateMessagePort,
  testCreateSharedWorker,
} from "../../src/Worker.js";
import { describe, expect, test } from "vitest";

describe("initEvoluWorker", () => {
  const setupWorker = async (
    consoleStoreOutputEntry: ReadonlyStore<ConsoleEntry | null> = createStore<ConsoleEntry | null>(
      null,
    ),
  ) => {
    const { worker, self, connect } =
      testCreateSharedWorker<EvoluWorkerInput>();

    await using run = testCreateRun({
      console: testCreateConsole(),
      consoleStoreOutputEntry,
      createMessagePort: testCreateMessagePort,
    });

    const initResult = await run(initEvoluWorker(self));
    if (!initResult.ok)
      throw new Error("initEvoluWorker should always succeed");

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

    const receivedEntries: Array<ConsoleEntry> = [];
    const consoleChannel = testCreateMessageChannel<ConsoleEntry>();
    consoleChannel.port2.onMessage = (entry) => {
      receivedEntries.push(entry);
    };

    worker.port.postMessage({
      type: "InitConsole",
      port: consoleChannel.port1.native,
    });

    const secondEntry: ConsoleEntry = {
      method: "info",
      path: ["after"],
      args: ["live"],
    };

    consoleStoreOutputEntry.set(secondEntry);

    expect(receivedEntries).toEqual([firstEntry, secondEntry]);
  });

  test("forwards entries immediately when console port is already connected", async () => {
    const consoleStoreOutputEntry = createStore<ConsoleEntry | null>(null);
    const { worker, workerStack } = await setupWorker(consoleStoreOutputEntry);
    await using _workerStack = workerStack;

    const receivedEntries: Array<ConsoleEntry> = [];
    const consoleChannel = testCreateMessageChannel<ConsoleEntry>();
    consoleChannel.port2.onMessage = (entry) => {
      receivedEntries.push(entry);
    };

    worker.port.postMessage({
      type: "InitConsole",
      port: consoleChannel.port1.native,
    });

    const liveEntry: ConsoleEntry = {
      method: "info",
      path: ["live"],
      args: ["entry"],
    };

    consoleStoreOutputEntry.set(liveEntry);

    expect(receivedEntries).toEqual([liveEntry]);
  });

  test("ignores null console store updates", async () => {
    const consoleStoreOutputEntry = createStore<ConsoleEntry | null>(null);
    const { worker, workerStack } = await setupWorker(consoleStoreOutputEntry);
    await using _workerStack = workerStack;

    const receivedEntries: Array<ConsoleEntry> = [];
    const consoleChannel = testCreateMessageChannel<ConsoleEntry>();
    consoleChannel.port2.onMessage = (entry) => {
      receivedEntries.push(entry);
    };

    worker.port.postMessage({
      type: "InitConsole",
      port: consoleChannel.port1.native,
    });

    const entry: ConsoleEntry = {
      method: "info",
      path: ["before-null"],
      args: ["value"],
    };

    consoleStoreOutputEntry.set(entry);
    consoleStoreOutputEntry.set(null);

    expect(receivedEntries).toEqual([entry]);
  });

  test("accepts InitEvolu message", async () => {
    const { worker, workerStack } = await setupWorker();
    await using _workerStack = workerStack;

    const evoluChannel = testCreateMessageChannel<string>();

    expect(() => {
      worker.port.postMessage({
        type: "InitEvolu",
        port: evoluChannel.port1.native,
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
