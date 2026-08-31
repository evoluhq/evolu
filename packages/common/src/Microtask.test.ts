import { describe, it } from "node:test";
import { assertEqual, assertThrowsInstanceOf, assertTrue } from "./Assert.ts";

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

  it("passes snapshot so previous flushed arrays stay unchanged", async () => {
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
