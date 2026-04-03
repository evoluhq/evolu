import { describe, expect, test } from "vitest";
import { createMicrotaskBatch } from "../src/Microtask.js";

describe("createMicrotaskBatch", () => {
  test("coalesces multiple pushes in one tick into one flush", async () => {
    const flushed: Array<ReadonlyArray<number>> = [];
    const batch = createMicrotaskBatch<number>((items) => {
      flushed.push(items);
    });

    batch.push(1);
    batch.push(2);

    expect(flushed).toEqual([]);

    await Promise.resolve();

    expect(flushed).toEqual([[1, 2]]);
  });

  test("flushNow flushes immediately and pending microtask becomes no-op", async () => {
    const flushed: Array<ReadonlyArray<number>> = [];
    const batch = createMicrotaskBatch<number>((items) => {
      flushed.push(items);
    });

    batch.push(1);
    batch.flushNow();

    expect(flushed).toEqual([[1]]);

    await Promise.resolve();

    expect(flushed).toEqual([[1]]);

    batch.push(2);
    await Promise.resolve();

    expect(flushed).toEqual([[1], [2]]);
  });

  test("flushNow on empty queue does nothing", () => {
    const flushed: Array<ReadonlyArray<number>> = [];
    const batch = createMicrotaskBatch<number>((items) => {
      flushed.push(items);
    });

    batch.flushNow();

    expect(flushed).toEqual([]);
  });

  test("passes snapshot so previous flushed arrays stay unchanged", async () => {
    const flushed: Array<ReadonlyArray<number>> = [];
    const batch = createMicrotaskBatch<number>((items) => {
      flushed.push(items);
    });

    batch.push(1);
    batch.push(2);
    await Promise.resolve();

    batch.push(3);
    await Promise.resolve();

    expect(flushed[0]).toEqual([1, 2]);
    expect(flushed[1]).toEqual([3]);
  });

  test("reentrant push during onFlush is processed in next microtask", async () => {
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

    expect(flushed).toEqual([[1], [2]]);
  });

  test("dispose cancels queued flush", async () => {
    const flushed: Array<ReadonlyArray<number>> = [];
    const batch = createMicrotaskBatch<number>((items) => {
      flushed.push(items);
    });

    batch.push(1);
    batch[Symbol.dispose]();

    await Promise.resolve();

    expect(flushed).toEqual([]);
  });

  test("push and flushNow are no-op after dispose", async () => {
    const flushed: Array<ReadonlyArray<number>> = [];
    const batch = createMicrotaskBatch<number>((items) => {
      flushed.push(items);
    });

    batch[Symbol.dispose]();
    batch.push(1);
    batch.flushNow();

    await Promise.resolve();

    expect(flushed).toEqual([]);
  });

  test("dispose is idempotent", async () => {
    const flushed: Array<ReadonlyArray<number>> = [];
    const batch = createMicrotaskBatch<number>((items) => {
      flushed.push(items);
    });

    batch.push(1);
    batch[Symbol.dispose]();
    batch[Symbol.dispose]();

    await Promise.resolve();

    expect(flushed).toEqual([]);
  });
});
