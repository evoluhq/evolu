import { describe, expect, expectTypeOf, test } from "vitest";
import {
  appendToArray,
  filterArray,
  firstInArray,
  isNonEmptyArray,
  isNonEmptyReadonlyArray,
  lastInArray,
  dedupeArray,
  mapArray,
  prependToArray,
  shiftArray,
  type NonEmptyArray,
  type NonEmptyReadonlyArray,
} from "../src/Array.js";

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

describe("appendToArray", () => {
  test("appends item to empty array", () => {
    const arr: ReadonlyArray<number> = [];
    const result = appendToArray(1, arr);
    expect(result).toEqual([1]);
    expectTypeOf(result).toEqualTypeOf<NonEmptyReadonlyArray<number>>();
  });

  test("appends item to non-empty array", () => {
    const arr: ReadonlyArray<number> = [1, 2];
    const result = appendToArray(3, arr);
    expect(result).toEqual([1, 2, 3]);
  });

  test("does not mutate original array", () => {
    const arr: ReadonlyArray<number> = [1, 2];
    appendToArray(3, arr);
    expect(arr).toEqual([1, 2]);
  });

  test("accepts mutable array and returns readonly", () => {
    const mutableArr: Array<number> = [1, 2];
    const result = appendToArray(3, mutableArr);
    expect(result).toEqual([1, 2, 3]);
    expectTypeOf(result).toEqualTypeOf<NonEmptyReadonlyArray<number>>();
    // Original mutable array is not mutated
    expect(mutableArr).toEqual([1, 2]);
  });
});

describe("prependToArray", () => {
  test("prepends item to empty array", () => {
    const arr: ReadonlyArray<number> = [];
    const result = prependToArray(1, arr);
    expect(result).toEqual([1]);
    expectTypeOf(result).toEqualTypeOf<NonEmptyReadonlyArray<number>>();
  });

  test("prepends item to non-empty array", () => {
    const arr: ReadonlyArray<number> = [2, 3];
    const result = prependToArray(1, arr);
    expect(result).toEqual([1, 2, 3]);
  });

  test("does not mutate original array", () => {
    const arr: ReadonlyArray<number> = [2, 3];
    prependToArray(1, arr);
    expect(arr).toEqual([2, 3]);
  });

  test("accepts mutable array and returns readonly", () => {
    const mutableArr: Array<number> = [2, 3];
    const result = prependToArray(1, mutableArr);
    expect(result).toEqual([1, 2, 3]);
    expectTypeOf(result).toEqualTypeOf<NonEmptyReadonlyArray<number>>();
    // Original mutable array is not mutated
    expect(mutableArr).toEqual([2, 3]);
  });
});

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

    // This test verifies that readonly arrays are NOT accepted
    // (TypeScript would reject this at compile time)
    // const readonlyArr: NonEmptyReadonlyArray<number> = [1, 2, 3];
    // shiftArray(readonlyArr); // ❌ Would not compile
  });
});

describe("Type narrowing", () => {
  test("isNonEmptyReadonlyArray provides proper type narrowing", () => {
    const processWithIsNonEmpty = (
      arr: ReadonlyArray<number>,
    ): string | number => {
      if (isNonEmptyReadonlyArray(arr)) {
        // arr is now NonEmptyReadonlyArray<number>
        expectTypeOf(arr).toEqualTypeOf<NonEmptyReadonlyArray<number>>();
        return arr[0]; // Safe access to first element
      }
      return "empty";
    };

    expect(processWithIsNonEmpty([1, 2, 3])).toBe(1);
    expect(processWithIsNonEmpty([])).toBe("empty");
  });

  test("!isNonEmptyReadonlyArray for early returns", () => {
    const processArray = (arr: ReadonlyArray<number>): string | number => {
      if (!isNonEmptyReadonlyArray(arr)) {
        return "empty";
      }
      // arr is now NonEmptyReadonlyArray<number>
      expectTypeOf(arr).toEqualTypeOf<NonEmptyReadonlyArray<number>>();
      return arr[0]; // Safe access to first element
    };

    expect(processArray([1, 2, 3])).toBe(1);
    expect(processArray([])).toBe("empty");
  });
});

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

describe("dedupe", () => {
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
});
