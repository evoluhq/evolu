import { describe, expect, expectTypeOf, test } from "vitest";
import type { NonEmptyArray, NonEmptyReadonlyArray } from "../src/Array.js";
import {
  lazyFalse,
  lazyNull,
  lazyTrue,
  lazyUndefined,
  lazyVoid,
  exhaustiveCheck,
  identity,
  readonly,
} from "../src/Function.js";
import type { ReadonlyRecord } from "../src/Object.js";

describe("identity", () => {
  test("returns the same value", () => {
    expect(identity(42)).toBe(42);
    expect(identity("hello")).toBe("hello");
    expect(identity(null)).toBe(null);
  });

  test("preserves object reference", () => {
    const obj = { a: 1 };
    expect(identity(obj)).toBe(obj);
  });

  test("preserves type", () => {
    const num = identity(42);
    expectTypeOf(num).toEqualTypeOf<number>();

    const str = identity("hello");
    expectTypeOf(str).toEqualTypeOf<string>();
  });
});

describe("readonly", () => {
  describe("documentation example", () => {
    test("matches the JSDoc example", () => {
      // Array literals become NonEmptyReadonlyArray
      const items = readonly([1, 2, 3]);
      expectTypeOf(items).toEqualTypeOf<NonEmptyReadonlyArray<number>>();

      // NonEmptyArray is preserved as NonEmptyReadonlyArray
      const nonEmpty: NonEmptyArray<number> = [1, 2, 3];
      const readonlyNonEmpty = readonly(nonEmpty);
      expectTypeOf(readonlyNonEmpty).toEqualTypeOf<
        NonEmptyReadonlyArray<number>
      >();

      // Regular arrays become ReadonlyArray
      const arr: Array<number> = [1, 2, 3];
      const readonlyArr = readonly(arr);
      expectTypeOf(readonlyArr).toEqualTypeOf<ReadonlyArray<number>>();

      // Sets, Records, and Maps
      const ids = readonly(new Set(["a", "b"]));
      expectTypeOf(ids).toEqualTypeOf<ReadonlySet<string>>();

      type UserId = string & { readonly __brand: "UserId" };
      const users: Record<UserId, string> = {} as Record<UserId, string>;
      const readonlyUsers = readonly(users);
      expectTypeOf(readonlyUsers).toEqualTypeOf<
        ReadonlyRecord<UserId, string>
      >();

      const lookup = readonly(new Map([["key", "value"]]));
      expectTypeOf(lookup).toEqualTypeOf<ReadonlyMap<string, string>>();
    });
  });

  describe("Array", () => {
    test("returns the same array", () => {
      const arr = [1, 2, 3];
      expect(readonly(arr)).toBe(arr);
    });

    test("types array literal as NonEmptyReadonlyArray", () => {
      const arr = readonly([1, 2, 3]);
      expectTypeOf(arr).toEqualTypeOf<NonEmptyReadonlyArray<number>>();
    });

    test("types empty array literal as ReadonlyArray<never>", () => {
      const arr = readonly([]);
      expectTypeOf(arr).toEqualTypeOf<ReadonlyArray<never>>();
    });

    test("types Array<T> as ReadonlyArray", () => {
      const arr: Array<number> = [1, 2, 3];
      const result = readonly(arr);
      expectTypeOf(result).toEqualTypeOf<ReadonlyArray<number>>();
    });

    test("types empty array as ReadonlyArray", () => {
      const arr: Array<number> = [];
      const result = readonly(arr);
      expect(result).toBe(arr);
      expectTypeOf(result).toEqualTypeOf<ReadonlyArray<number>>();
    });

    test("types NonEmptyArray as NonEmptyReadonlyArray", () => {
      const arr: NonEmptyArray<number> = [1, 2, 3];
      const result = readonly(arr);
      expect(result).toBe(arr);
      expectTypeOf(result).toEqualTypeOf<NonEmptyReadonlyArray<number>>();
    });
  });

  describe("Set", () => {
    test("returns the same set", () => {
      const set = new Set([1, 2, 3]);
      expect(readonly(set)).toBe(set);
    });

    test("types as ReadonlySet", () => {
      const set = readonly(new Set([1, 2, 3]));
      expectTypeOf(set).toEqualTypeOf<ReadonlySet<number>>();
    });
  });

  describe("Record", () => {
    test("returns the same record", () => {
      const record: Record<string, number> = { a: 1, b: 2 };
      expect(readonly(record)).toBe(record);
    });

    test("types as ReadonlyRecord", () => {
      const record: Record<string, number> = { a: 1, b: 2 };
      const result = readonly(record);
      expectTypeOf(result).toEqualTypeOf<ReadonlyRecord<string, number>>();
    });

    test("preserves branded key types", () => {
      type UserId = string & { readonly __brand: "UserId" };
      const users: Record<UserId, string> = {} as Record<UserId, string>;
      const result = readonly(users);
      expectTypeOf(result).toEqualTypeOf<ReadonlyRecord<UserId, string>>();
    });
  });

  describe("Map", () => {
    test("returns the same map", () => {
      const map = new Map([["a", 1]]);
      expect(readonly(map)).toBe(map);
    });

    test("types as ReadonlyMap", () => {
      const map = readonly(
        new Map([
          ["a", 1],
          ["b", 2],
        ]),
      );
      expectTypeOf(map).toEqualTypeOf<ReadonlyMap<string, number>>();
    });
  });

  describe("with ES2025 iterator .toArray()", () => {
    test("converts iterator chain to ReadonlyArray", () => {
      const result = readonly(
        [1, 2, 3]
          .values()
          .map((x) => x * 2)
          .toArray(),
      );
      expect(result).toEqual([2, 4, 6]);
      expectTypeOf(result).toEqualTypeOf<ReadonlyArray<number>>();
    });
  });
});

describe("exhaustiveCheck", () => {
  test("throws error for unhandled case", () => {
    expect(() => exhaustiveCheck("unexpected" as never)).toThrow(
      'exhaustiveCheck unhandled case: "unexpected"',
    );
  });
});

describe("lazy functions", () => {
  test("lazyVoid returns void", () => {
    lazyVoid();
    expectTypeOf<ReturnType<typeof lazyVoid>>().toEqualTypeOf<void>();
  });

  test("lazyUndefined returns undefined", () => {
    expectTypeOf<ReturnType<typeof lazyUndefined>>().toEqualTypeOf<undefined>();
  });

  test("lazyNull returns null", () => {
    expect(lazyNull()).toBe(null);
  });

  test("lazyTrue returns true", () => {
    expect(lazyTrue()).toBe(true);
  });

  test("lazyFalse returns false", () => {
    expect(lazyFalse()).toBe(false);
  });
});
