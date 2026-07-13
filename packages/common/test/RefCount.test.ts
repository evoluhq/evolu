import { describe, expect, test } from "vitest";
import { createRefCount, createRefCountByKey } from "../src/RefCount.js";

describe("createRefCount", () => {
  test("increments and decrements the count", () => {
    const refCount = createRefCount();

    expect(refCount.getCount()).toBe(0);
    expect(refCount.increment()).toBe(1);
    expect(refCount.increment()).toBe(2);
    expect(refCount.getCount()).toBe(2);
    expect(refCount.decrement()).toBe(1);
    expect(refCount.decrement()).toBe(0);
    expect(refCount.getCount()).toBe(0);
  });

  test("decrement throws on underflow", () => {
    const refCount = createRefCount();

    expect(() => refCount.decrement()).toThrow(
      "RefCount must not be decremented below zero.",
    );
  });

  test("dispose invalidates the helper", () => {
    const refCount = createRefCount();

    refCount.increment();
    refCount.increment();
    refCount[Symbol.dispose]();

    expect(() => refCount.increment()).toThrow("Cannot use a disposed object.");
    expect(() => refCount.decrement()).toThrow("Cannot use a disposed object.");
    expect(() => refCount.getCount()).toThrow("Cannot use a disposed object.");
  });
});

describe("createRefCountByKey", () => {
  test("tracks counts per key", () => {
    const refCount = createRefCountByKey<string>();

    expect(refCount.increment("a")).toBe(1);
    expect(refCount.increment("a")).toBe(2);
    expect(refCount.increment("b")).toBe(1);
    expect(refCount.getCount("a")).toBe(2);
    expect(refCount.getCount("b")).toBe(1);
    expect(refCount.keys()).toEqual(new Set(["a", "b"]));
  });

  test("decrement removes key at zero", () => {
    const refCount = createRefCountByKey<string>();

    refCount.increment("a");

    expect(refCount.decrement("a")).toBe(0);
    expect(refCount.getCount("a")).toBe(0);
    expect(refCount.has("a")).toBe(false);
    expect(refCount.keys()).toEqual(new Set());
  });

  test("decrement throws on missing key", () => {
    const refCount = createRefCountByKey<string>();

    expect(() => refCount.decrement("missing")).toThrow(
      "RefCount must not be decremented for an untracked key.",
    );
    expect(refCount.has("missing")).toBe(false);
    expect(refCount.keys()).toEqual(new Set());
  });

  test("decrement keeps key while count stays positive", () => {
    const refCount = createRefCountByKey<string>();

    refCount.increment("a");
    refCount.increment("a");

    expect(refCount.decrement("a")).toBe(1);
    expect(refCount.getCount("a")).toBe(1);
    expect(refCount.has("a")).toBe(true);
  });

  test("keys returns a snapshot set", () => {
    const refCount = createRefCountByKey<string>();
    refCount.increment("a");

    const keys = refCount.keys();
    refCount.increment("b");

    expect(keys).toEqual(new Set(["a"]));
  });

  test("dispose invalidates the helper", () => {
    const refCount = createRefCountByKey<string>();

    refCount.increment("a");
    refCount.increment("b");
    refCount[Symbol.dispose]();

    expect(() => refCount.increment("c")).toThrow(
      "Cannot use a disposed object.",
    );
    expect(() => refCount.decrement("a")).toThrow(
      "Cannot use a disposed object.",
    );
    expect(() => refCount.getCount("a")).toThrow(
      "Cannot use a disposed object.",
    );
    expect(() => refCount.has("a")).toThrow("Cannot use a disposed object.");
    expect(() => refCount.keys()).toThrow("Cannot use a disposed object.");
  });

  test("uses reference identity for object keys", () => {
    const refCount = createRefCountByKey<{ readonly id: string }>();
    const keyA = { id: "same" };
    const keyB = { id: "same" };

    refCount.increment(keyA);
    refCount.increment(keyB);

    expect(refCount.getCount(keyA)).toBe(1);
    expect(refCount.getCount(keyB)).toBe(1);
    expect(refCount.keys().size).toBe(2);
  });

  test("uses lookup for logical key equality", () => {
    const refCount = createRefCountByKey<{ readonly id: string }, string>({
      lookup: (key) => key.id,
    });

    expect(refCount.increment({ id: "same" })).toBe(1);
    expect(refCount.increment({ id: "same" })).toBe(2);
    expect(refCount.getCount({ id: "same" })).toBe(2);
    expect(refCount.keys().size).toBe(1);

    expect(refCount.decrement({ id: "same" })).toBe(1);
    expect(refCount.decrement({ id: "same" })).toBe(0);
    expect(refCount.has({ id: "same" })).toBe(false);
  });
});
