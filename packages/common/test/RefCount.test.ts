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

    expect(() => refCount.increment()).toThrow(
      "Expected value to not be disposed.",
    );
    expect(() => refCount.decrement()).toThrow(
      "Expected value to not be disposed.",
    );
    expect(() => refCount.getCount()).toThrow(
      "Expected value to not be disposed.",
    );
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
      "RefCount must not be decremented below zero.",
    );
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

    const keys = refCount.keys() as Set<string>;
    keys.add("b");

    expect(refCount.keys()).toEqual(new Set(["a"]));
    expect(refCount.has("b")).toBe(false);
  });

  test("dispose invalidates the helper", () => {
    const refCount = createRefCountByKey<string>();

    refCount.increment("a");
    refCount.increment("b");
    refCount[Symbol.dispose]();

    expect(() => refCount.increment("c")).toThrow(
      "Expected value to not be disposed.",
    );
    expect(() => refCount.decrement("a")).toThrow(
      "Expected value to not be disposed.",
    );
    expect(() => refCount.getCount("a")).toThrow(
      "Expected value to not be disposed.",
    );
    expect(() => refCount.has("a")).toThrow(
      "Expected value to not be disposed.",
    );
    expect(() => refCount.keys()).toThrow("Expected value to not be disposed.");
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
});
