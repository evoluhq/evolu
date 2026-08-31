import { describe, it } from "node:test";
import {
  assertEqual,
  assertFalse,
  assertThrowsInstanceOf,
  assertTrue,
} from "./Assert.ts";

import { installPolyfills } from "./Polyfills.ts";
import { createRefCount, createRefCountByKey } from "./RefCount.ts";

installPolyfills();

describe("createRefCount", () => {
  it("increments and decrements the count", () => {
    const refCount = createRefCount();

    assertEqual(refCount.getCount(), 0);
    assertEqual(refCount.increment(), 1);
    assertEqual(refCount.increment(), 2);
    assertEqual(refCount.getCount(), 2);
    assertEqual(refCount.decrement(), 1);
    assertEqual(refCount.decrement(), 0);
    assertEqual(refCount.getCount(), 0);
  });

  it("decrement throws on underflow", () => {
    const refCount = createRefCount();

    const error = assertThrowsInstanceOf(() => refCount.decrement(), Error);
    assertTrue(
      error.message.includes("RefCount must not be decremented below zero."),
    );
  });

  it("dispose invalidates the helper", () => {
    const refCount = createRefCount();

    refCount.increment();
    refCount.increment();
    refCount[Symbol.dispose]();

    const incrementError = assertThrowsInstanceOf(
      () => refCount.increment(),
      Error,
    );
    assertTrue(
      incrementError.message.includes("Cannot use a disposed object."),
    );
    const decrementError = assertThrowsInstanceOf(
      () => refCount.decrement(),
      Error,
    );
    assertTrue(
      decrementError.message.includes("Cannot use a disposed object."),
    );
    const getCountError = assertThrowsInstanceOf(
      () => refCount.getCount(),
      Error,
    );
    assertTrue(getCountError.message.includes("Cannot use a disposed object."));
  });
});

describe("createRefCountByKey", () => {
  it("tracks counts per key", () => {
    const refCount = createRefCountByKey<string>();

    assertEqual(refCount.increment("a"), 1);
    assertEqual(refCount.increment("a"), 2);
    assertEqual(refCount.increment("b"), 1);
    assertEqual(refCount.getCount("a"), 2);
    assertEqual(refCount.getCount("b"), 1);
    assertEqual(refCount.keys(), new Set(["a", "b"]));
  });

  it("decrement removes key at zero", () => {
    const refCount = createRefCountByKey<string>();

    refCount.increment("a");

    assertEqual(refCount.decrement("a"), 0);
    assertEqual(refCount.getCount("a"), 0);
    assertFalse(refCount.has("a"));
    assertEqual(refCount.keys(), new Set());
  });

  it("decrement throws on missing key", () => {
    const refCount = createRefCountByKey<string>();

    const error = assertThrowsInstanceOf(
      () => refCount.decrement("missing"),
      Error,
    );
    assertTrue(
      error.message.includes(
        "RefCount must not be decremented for an untracked key.",
      ),
    );
    assertFalse(refCount.has("missing"));
    assertEqual(refCount.keys(), new Set());
  });

  it("decrement keeps key while count stays positive", () => {
    const refCount = createRefCountByKey<string>();

    refCount.increment("a");
    refCount.increment("a");

    assertEqual(refCount.decrement("a"), 1);
    assertEqual(refCount.getCount("a"), 1);
    assertTrue(refCount.has("a"));
  });

  it("keys returns a snapshot set", () => {
    const refCount = createRefCountByKey<string>();
    refCount.increment("a");

    const keys = refCount.keys();
    refCount.increment("b");

    assertEqual(keys, new Set(["a"]));
  });

  it("dispose invalidates the helper", () => {
    const refCount = createRefCountByKey<string>();

    refCount.increment("a");
    refCount.increment("b");
    refCount[Symbol.dispose]();

    const incrementError = assertThrowsInstanceOf(
      () => refCount.increment("c"),
      Error,
    );
    assertTrue(
      incrementError.message.includes("Cannot use a disposed object."),
    );
    const decrementError = assertThrowsInstanceOf(
      () => refCount.decrement("a"),
      Error,
    );
    assertTrue(
      decrementError.message.includes("Cannot use a disposed object."),
    );
    const getCountError = assertThrowsInstanceOf(
      () => refCount.getCount("a"),
      Error,
    );
    assertTrue(getCountError.message.includes("Cannot use a disposed object."));
    const hasError = assertThrowsInstanceOf(() => refCount.has("a"), Error);
    assertTrue(hasError.message.includes("Cannot use a disposed object."));
    const keysError = assertThrowsInstanceOf(() => refCount.keys(), Error);
    assertTrue(keysError.message.includes("Cannot use a disposed object."));
  });

  it("uses reference identity for object keys", () => {
    const refCount = createRefCountByKey<{ readonly id: string }>();
    const keyA = { id: "same" };
    const keyB = { id: "same" };

    refCount.increment(keyA);
    refCount.increment(keyB);

    assertEqual(refCount.getCount(keyA), 1);
    assertEqual(refCount.getCount(keyB), 1);
    assertEqual(refCount.keys().size, 2);
  });

  it("uses lookup for logical key equality", () => {
    const refCount = createRefCountByKey<{ readonly id: string }, string>({
      lookup: (key) => key.id,
    });

    assertEqual(refCount.increment({ id: "same" }), 1);
    assertEqual(refCount.increment({ id: "same" }), 2);
    assertEqual(refCount.getCount({ id: "same" }), 2);
    assertEqual(refCount.keys().size, 1);

    assertEqual(refCount.decrement({ id: "same" }), 1);
    assertEqual(refCount.decrement({ id: "same" }), 0);
    assertFalse(refCount.has({ id: "same" }));
  });
});
