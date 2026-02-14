import { describe, expect, expectTypeOf, test } from "vitest";
import { isNone, isSome, type Option } from "../src/Option.js";
import { createRefCount } from "../src/RefCount.js";
import type { NonNegativeInt } from "../src/Type.js";

describe("createRefCount", () => {
  test("increment adds a new key with count 1", () => {
    const refCount = createRefCount<string>();

    const count = refCount.increment("a");

    expect(count).toBe(1);
    expect(refCount.getCount("a")).toBe(1);
    expect(refCount.has("a")).toBe(true);
  });

  test("increment increases count for existing key", () => {
    const refCount = createRefCount<string>();

    refCount.increment("a");
    const count = refCount.increment("a");

    expect(count).toBe(2);
    expect(refCount.getCount("a")).toBe(2);
  });

  test("decrement returns none for missing key", () => {
    const refCount = createRefCount<string>();

    const result = refCount.decrement("missing");

    expect(isNone(result)).toBe(true);
    expect(refCount.getCount("missing")).toBe(0);
    expect(refCount.has("missing")).toBe(false);
  });

  test("decrement removes key when count reaches zero", () => {
    const refCount = createRefCount<string>();
    refCount.increment("a");

    const result = refCount.decrement("a");

    expect(isSome(result)).toBe(true);
    if (isSome(result)) {
      expect(result.value).toBe(0);
    }
    expect(refCount.getCount("a")).toBe(0);
    expect(refCount.has("a")).toBe(false);
  });

  test("decrement decreases count and keeps key when count stays positive", () => {
    const refCount = createRefCount<string>();
    refCount.increment("a");
    refCount.increment("a");

    const result = refCount.decrement("a");

    expect(isSome(result)).toBe(true);
    if (isSome(result)) {
      expect(result.value).toBe(1);
    }
    expect(refCount.getCount("a")).toBe(1);
    expect(refCount.has("a")).toBe(true);
  });

  test("keys returns tracked keys", () => {
    const refCount = createRefCount<string>();

    refCount.increment("a");
    refCount.increment("a");
    refCount.increment("b");

    expect(refCount.keys()).toEqual(new Set(["a", "b"]));
  });

  test("keys returns snapshot set", () => {
    const refCount = createRefCount<string>();
    refCount.increment("a");

    const keys = refCount.keys() as Set<string>;
    keys.add("b");

    expect(refCount.keys()).toEqual(new Set(["a"]));
    expect(refCount.has("b")).toBe(false);
  });

  test("clear removes all keys and counts", () => {
    const refCount = createRefCount<string>();

    refCount.increment("a");
    refCount.increment("b");
    refCount.clear();

    expect(refCount.keys()).toEqual(new Set());
    expect(refCount.getCount("a")).toBe(0);
    expect(refCount.getCount("b")).toBe(0);
    expect(refCount.has("a")).toBe(false);
    expect(refCount.has("b")).toBe(false);
  });

  test("uses reference identity for object keys", () => {
    const refCount = createRefCount<{ readonly id: string }>();

    const keyA = { id: "same" };
    const keyB = { id: "same" };

    refCount.increment(keyA);
    refCount.increment(keyB);

    expect(refCount.getCount(keyA)).toBe(1);
    expect(refCount.getCount(keyB)).toBe(1);
    expect(refCount.keys().size).toBe(2);
  });

  test("decrement has Option NonNegativeInt return type", () => {
    const refCount = createRefCount<string>();
    const result = refCount.decrement("a");

    expectTypeOf(result).toEqualTypeOf<Option<NonNegativeInt>>();
  });
});
