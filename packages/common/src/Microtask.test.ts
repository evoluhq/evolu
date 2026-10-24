import { describe, it } from "node:test";
import { assertEqual, assertThrowsInstanceOf, assertTrue } from "./Assert.ts";
import { constVoid } from "./Function.ts";

import { createMicrotaskBatch } from "./Microtask.ts";

describe("createMicrotaskBatch", () => {
  it("coalesces multiple pushes in one tick into one flush", async () => {
    const flushed: Array<ReadonlyArray<number>> = [];
    const batch = createMicrotaskBatch<number>((items) => {
      flushed.push(items);
    });

    batch.push(1);
    batch.push(2);

    assertEqual(flushed, []);

    await Promise.resolve();

    assertEqual(flushed, [[1, 2]]);
  });

  it("flushNow flushes immediately and pending microtask becomes no-op", async () => {
    const flushed: Array<ReadonlyArray<number>> = [];
    const batch = createMicrotaskBatch<number>((items) => {
      flushed.push(items);
    });

    batch.push(1);
    batch.flushNow();

    assertEqual(flushed, [[1]]);

    await Promise.resolve();

    assertEqual(flushed, [[1]]);

    batch.push(2);
    await Promise.resolve();

    assertEqual(flushed, [[1], [2]]);
  });

  it("flushNow on empty queue does nothing", () => {
    const flushed: Array<ReadonlyArray<number>> = [];
    const batch = createMicrotaskBatch<number>((items) => {
      flushed.push(items);
    });

    batch.flushNow();

    assertEqual(flushed, []);
  });

  it("never mutates a flushed array", async () => {
    const flushed: Array<ReadonlyArray<number>> = [];
    const batch = createMicrotaskBatch<number>((items) => {
      flushed.push(items);
    });

    batch.push(1);
    batch.push(2);
    await Promise.resolve();

    batch.push(3);
    await Promise.resolve();

    assertEqual(flushed[0], [1, 2]);
    assertEqual(flushed[1], [3]);
  });

  it("reentrant push during onFlush is processed in next microtask", async () => {
    const flushed: Array<ReadonlyArray<number>> = [];
    const batch = createMicrotaskBatch<number>((items) => {
      flushed.push(items);
      if (items[0] === 1) {
        batch.push(2);
      }
    });

    batch.push(1);

    await Promise.resolve();
    await Promise.resolve();

    assertEqual(flushed, [[1], [2]]);
  });

  it("dispose cancels queued flush", async () => {
    const flushed: Array<ReadonlyArray<number>> = [];
    const batch = createMicrotaskBatch<number>((items) => {
      flushed.push(items);
    });

    batch.push(1);
    batch[Symbol.dispose]();

    await Promise.resolve();

    assertEqual(flushed, []);
  });

  it("push and flushNow throw after dispose", async () => {
    const flushed: Array<ReadonlyArray<number>> = [];
    const batch = createMicrotaskBatch<number>((items) => {
      flushed.push(items);
    });

    batch[Symbol.dispose]();

    const pushError = assertThrowsInstanceOf(() => {
      batch.push(1);
    }, Error);
    assertTrue(pushError.message.includes("Cannot use a disposed object."));

    const flushNowError = assertThrowsInstanceOf(() => {
      batch.flushNow();
    }, Error);
    assertTrue(flushNowError.message.includes("Cannot use a disposed object."));

    await Promise.resolve();

    assertEqual(flushed, []);
  });

  it("keeps the cost of a large batch linear", () => {
    const items = Array.from({ length: 20_000 }, (_, index) => index);

    const pushAll = (batchSize: number) => {
      using batch = createMicrotaskBatch<number>(constVoid);
      for (const [index, item] of items.entries()) {
        batch.push(item);
        if ((index + 1) % batchSize === 0) batch.flushNow();
      }
    };

    // Thread CPU time counts only this thread, so other processes on a loaded
    // runner do not add to it.
    const cpuTimeOf = (run: () => void): number => {
      const start = process.threadCpuUsage();
      run();
      const { user, system } = process.threadCpuUsage(start);
      return user + system;
    };

    // Batches of 100 items cost about as much per item as one batch of all of
    // them when push appends in place. Copying the queue on each push makes
    // the one batch about a hundred times more expensive.
    let attempts = 0;
    let ratio: number;
    // Garbage collection can inflate one measurement, so a ratio over the
    // bound is measured again unless it is too high for a pause to explain.
    do {
      const linearCost = cpuTimeOf(() => pushAll(100));
      ratio = cpuTimeOf(() => pushAll(items.length)) / linearCost;
      attempts++;
    } while (attempts < 3 && ratio >= 4 && ratio < 50);
    assertTrue(ratio < 4);
  });

  it("dispose is idempotent", async () => {
    const flushed: Array<ReadonlyArray<number>> = [];
    const batch = createMicrotaskBatch<number>((items) => {
      flushed.push(items);
    });

    batch.push(1);
    batch[Symbol.dispose]();
    batch[Symbol.dispose]();

    await Promise.resolve();

    assertEqual(flushed, []);
  });
});
