import { describe, expect, expectTypeOf, test } from "vitest";
import {
  appendToArray,
  dedupeArray,
  filterArray,
  firstInArray,
  isNonEmptyArray,
  isNonEmptyReadonlyArray,
  lastInArray,
  mapArray,
  prependToArray,
  shiftArray,
  type NonEmptyArray,
  type NonEmptyReadonlyArray,
} from "../src/Array.js";

describe("Types", () => {
  test("NonEmptyArray requires at least one element", () => {
    const _valid: NonEmptyArray<number> = [1, 2, 3];
    // @ts-expect-error - empty array is not a valid NonEmptyArray
    const _invalid: NonEmptyArray<number> = [];
  });

  test("NonEmptyReadonlyArray requires at least one element", () => {
    const _valid: NonEmptyReadonlyArray<string> = ["a", "b"];
    // @ts-expect-error - empty array is not a valid NonEmptyReadonlyArray
    const _invalid: NonEmptyReadonlyArray<string> = [];
  });
});

describe("Type Guards", () => {
  describe("isNonEmptyArray", () => {
    test("returns true for non-empty array", () => {
      const arr = [1, 2, 3];
      expect(isNonEmptyArray(arr)).toBe(true);
      if (isNonEmptyArray(arr)) {
        expectTypeOf(arr).toEqualTypeOf<NonEmptyArray<number>>();
      }
    });

    test("returns false for empty array", () => {
      const arr: Array<number> = [];
      expect(isNonEmptyArray(arr)).toBe(false);
    });

    test("returns true for single element array", () => {
      const arr = [1];
      expect(isNonEmptyArray(arr)).toBe(true);
    });
  });

  describe("isNonEmptyReadonlyArray", () => {
    test("returns true for non-empty readonly array", () => {
      const arr: ReadonlyArray<number> = [1, 2, 3];
      expect(isNonEmptyReadonlyArray(arr)).toBe(true);
      if (isNonEmptyReadonlyArray(arr)) {
        expectTypeOf(arr).toEqualTypeOf<NonEmptyReadonlyArray<number>>();
      }
    });

    test("returns false for empty readonly array", () => {
      const arr: ReadonlyArray<number> = [];
      expect(isNonEmptyReadonlyArray(arr)).toBe(false);
    });

    test("returns true for single element readonly array", () => {
      const arr: ReadonlyArray<number> = [1];
      expect(isNonEmptyReadonlyArray(arr)).toBe(true);
    });
  });
});

describe("Operations", () => {
  describe("appendToArray", () => {
    test("appends item to empty array", () => {
      const arr: ReadonlyArray<number> = [];
      const result = appendToArray(arr, 1);
      expect(result).toEqual([1]);
      expectTypeOf(result).toEqualTypeOf<NonEmptyReadonlyArray<number>>();
    });

    test("appends item to non-empty array", () => {
      const arr: ReadonlyArray<number> = [1, 2];
      const result = appendToArray(arr, 3);
      expect(result).toEqual([1, 2, 3]);
    });

    test("does not mutate original array", () => {
      const arr: ReadonlyArray<number> = [1, 2];
      appendToArray(arr, 3);
      expect(arr).toEqual([1, 2]);
    });

    test("accepts mutable array and returns readonly", () => {
      const mutableArr: Array<number> = [1, 2];
      const result = appendToArray(mutableArr, 3);
      expect(result).toEqual([1, 2, 3]);
      expectTypeOf(result).toEqualTypeOf<NonEmptyReadonlyArray<number>>();
      // Original mutable array is not mutated
      expect(mutableArr).toEqual([1, 2]);
    });
  });

  describe("prependToArray", () => {
    test("prepends item to empty array", () => {
      const arr: ReadonlyArray<number> = [];
      const result = prependToArray(arr, 1);
      expect(result).toEqual([1]);
      expectTypeOf(result).toEqualTypeOf<NonEmptyReadonlyArray<number>>();
    });

    test("prepends item to non-empty array", () => {
      const arr: ReadonlyArray<number> = [2, 3];
      const result = prependToArray(arr, 1);
      expect(result).toEqual([1, 2, 3]);
    });

    test("does not mutate original array", () => {
      const arr: ReadonlyArray<number> = [2, 3];
      prependToArray(arr, 1);
      expect(arr).toEqual([2, 3]);
    });

    test("accepts mutable array and returns readonly", () => {
      const mutableArr: Array<number> = [2, 3];
      const result = prependToArray(mutableArr, 1);
      expect(result).toEqual([1, 2, 3]);
      expectTypeOf(result).toEqualTypeOf<NonEmptyReadonlyArray<number>>();
      // Original mutable array is not mutated
      expect(mutableArr).toEqual([2, 3]);
    });
  });
});

describe("Transformations", () => {
  describe("mapArray", () => {
    test("preserves non-empty type when mapping non-empty array", () => {
      const nonEmpty: NonEmptyReadonlyArray<number> = [1, 2, 3];
      const result = mapArray(nonEmpty, (x) => x * 2);
      expectTypeOf(result).toEqualTypeOf<NonEmptyReadonlyArray<number>>();
    });

    test("returns readonly array when mapping regular array", () => {
      const regular: ReadonlyArray<number> = [1, 2, 3];
      const result = mapArray(regular, (x) => x * 2);
      expectTypeOf(result).toEqualTypeOf<ReadonlyArray<number>>();
    });

    test("accepts mutable non-empty array and returns readonly", () => {
      const mutableArr: NonEmptyArray<number> = [1, 2, 3];
      const result = mapArray(mutableArr, (x) => x * 2);
      expectTypeOf(result).toEqualTypeOf<NonEmptyReadonlyArray<number>>();
    });

    test("accepts mutable regular array and returns readonly", () => {
      const mutableArr: Array<number> = [1, 2, 3];
      const result = mapArray(mutableArr, (x) => x * 2);
      expectTypeOf(result).toEqualTypeOf<ReadonlyArray<number>>();
    });
  });

  describe("filterArray", () => {
    test("filters array and returns readonly", () => {
      const arr: ReadonlyArray<number> = [1, 2, 3, 4, 5];
      const result = filterArray(arr, (x) => x % 2 === 0);
      expect(result).toEqual([2, 4]);
      expectTypeOf(result).toEqualTypeOf<ReadonlyArray<number>>();
    });

    test("does not mutate original array", () => {
      const arr: ReadonlyArray<number> = [1, 2, 3, 4, 5];
      filterArray(arr, (x) => x % 2 === 0);
      expect(arr).toEqual([1, 2, 3, 4, 5]);
    });
  });

  describe("dedupeArray", () => {
    test("deduplicates primitives without callback and returns readonly", () => {
      const arr: ReadonlyArray<number> = [1, 2, 1, 3, 2];
      const result = dedupeArray(arr);
      expect(result).toEqual([1, 2, 3]);
      expectTypeOf(result).toEqualTypeOf<ReadonlyArray<number>>();
      // original not mutated
      expect(arr).toEqual([1, 2, 1, 3, 2]);
    });

    test("deduplicates objects by callback and preserves first occurrence", () => {
      const arr = [
        { id: 1, value: "a" },
        { id: 2, value: "b" },
        { id: 1, value: "c" },
      ];
      const result = dedupeArray(arr, (x) => x.id);
      expect(result).toEqual([
        { id: 1, value: "a" },
        { id: 2, value: "b" },
      ]);
      expectTypeOf(result).toEqualTypeOf<
        ReadonlyArray<{ id: number; value: string }>
      >();
    });

    test("preserves non-empty type when deduping non-empty array", () => {
      const nonEmpty: NonEmptyReadonlyArray<number> = [1, 2, 1, 3, 2];
      const result = dedupeArray(nonEmpty);
      expect(result).toEqual([1, 2, 3]);
      expectTypeOf(result).toEqualTypeOf<NonEmptyReadonlyArray<number>>();
    });

    test("preserves non-empty type with callback on non-empty array", () => {
      const nonEmpty: NonEmptyReadonlyArray<{ id: number; value: string }> = [
        { id: 1, value: "a" },
        { id: 2, value: "b" },
        { id: 1, value: "c" },
      ];
      const result = dedupeArray(nonEmpty, (x) => x.id);
      expect(result).toEqual([
        { id: 1, value: "a" },
        { id: 2, value: "b" },
      ]);
      expectTypeOf(result).toEqualTypeOf<
        NonEmptyReadonlyArray<{ id: number; value: string }>
      >();
    });
  });
});

describe("Accessors", () => {
  describe("firstInArray", () => {
    test("returns first element from non-empty array", () => {
      const arr: NonEmptyReadonlyArray<number> = [1, 2, 3];
      const result = firstInArray(arr);
      expect(result).toBe(1);
      expectTypeOf(result).toEqualTypeOf<number>();
    });

    test("returns first element from single element array", () => {
      const arr: NonEmptyReadonlyArray<string> = ["only"];
      const result = firstInArray(arr);
      expect(result).toBe("only");
    });

    test("does not mutate original array", () => {
      const arr: NonEmptyReadonlyArray<number> = [1, 2, 3];
      firstInArray(arr);
      expect(arr).toEqual([1, 2, 3]);
    });

    test("works with mutable non-empty arrays", () => {
      const arr: NonEmptyArray<number> = [10, 20, 30];
      const result = firstInArray(arr);
      expect(result).toBe(10);
    });
  });

  describe("lastInArray", () => {
    test("returns last element from non-empty array", () => {
      const arr: NonEmptyReadonlyArray<number> = [1, 2, 3];
      const result = lastInArray(arr);
      expect(result).toBe(3);
      expectTypeOf(result).toEqualTypeOf<number>();
    });

    test("returns last element from single element array", () => {
      const arr: NonEmptyReadonlyArray<string> = ["only"];
      const result = lastInArray(arr);
      expect(result).toBe("only");
    });

    test("does not mutate original array", () => {
      const arr: NonEmptyReadonlyArray<number> = [1, 2, 3];
      lastInArray(arr);
      expect(arr).toEqual([1, 2, 3]);
    });

    test("works with mutable non-empty arrays", () => {
      const arr: NonEmptyArray<number> = [10, 20, 30];
      const result = lastInArray(arr);
      expect(result).toBe(30);
    });
  });
});

describe("Mutations", () => {
  describe("shiftArray", () => {
    test("shifts first element from array", () => {
      const arr: NonEmptyArray<number> = [1, 2, 3];
      const result = shiftArray(arr);
      expect(result).toBe(1);
      expect(arr).toEqual([2, 3]);
    });

    test("shifts from single element array", () => {
      const arr: NonEmptyArray<number> = [42];
      const result = shiftArray(arr);
      expect(result).toBe(42);
      expect(arr).toEqual([]);
    });

    test("mutates the original array", () => {
      const arr: NonEmptyArray<string> = ["a", "b", "c"];
      shiftArray(arr);
      expect(arr).toEqual(["b", "c"]);
    });

    test("only accepts mutable arrays", () => {
      const mutableArr: NonEmptyArray<number> = [1, 2, 3];
      const result = shiftArray(mutableArr);
      expect(result).toBe(1);
      expect(mutableArr).toEqual([2, 3]);
      expectTypeOf(result).toEqualTypeOf<number>();

      // Verify readonly arrays are NOT accepted by TypeScript
      // @ts-expect-error - readonly arrays cannot be mutated
      shiftArray([1, 2, 3] as NonEmptyReadonlyArray<number>);
    });
  });
});
