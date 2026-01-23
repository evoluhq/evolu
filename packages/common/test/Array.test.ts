import { describe, expect, expectTypeOf, test } from "vitest";
import {
  appendToArray,
  arrayFrom,
  concatArrays,
  dedupeArray,
  emptyArray,
  filterArray,
  firstInArray,
  flatMapArray,
  isNonEmptyArray,
  lastInArray,
  mapArray,
  partitionArray,
  popFromArray,
  prependToArray,
  reverseArray,
  shiftFromArray,
  sortArray,
  spliceArray,
  type NonEmptyArray,
  type NonEmptyReadonlyArray,
} from "../src/Array.js";
import { err, ok } from "../src/Result.js";
import { NonEmptyString, PositiveInt } from "../src/Type.js";
import { identity } from "../src/Function.js";

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

describe("Constants", () => {
  describe("emptyArray", () => {
    test("is an empty array", () => {
      expect(emptyArray).toEqual([]);
      expect(emptyArray.length).toBe(0);
    });

    test("is assignable to any ReadonlyArray<T>", () => {
      const numbers: ReadonlyArray<number> = emptyArray;
      const strings: ReadonlyArray<string> = emptyArray;
      const objects: ReadonlyArray<{ id: number }> = emptyArray;

      expectTypeOf(numbers).toEqualTypeOf<ReadonlyArray<number>>();
      expectTypeOf(strings).toEqualTypeOf<ReadonlyArray<string>>();
      expectTypeOf(objects).toEqualTypeOf<ReadonlyArray<{ id: number }>>();
    });

    test("enables reference equality checks", () => {
      let items: ReadonlyArray<number> = emptyArray;
      expect(items === emptyArray).toBe(true);

      items = [1, 2, 3];
      expect(items === emptyArray).toBe(false);
    });
  });

  describe("arrayFrom", () => {
    test("creates array from iterable", () => {
      const result = arrayFrom(new Set([1, 2, 3]));
      expect(result).toEqual([1, 2, 3]);
    });

    test("returns input unchanged if already an array", () => {
      const input = [1, 2, 3];
      const result = arrayFrom(input);
      expect(result).toBe(input);
    });

    test("creates array with specified length", () => {
      const result = arrayFrom(3, identity);
      expect(result).toEqual([0, 1, 2]);
    });

    test("returns readonly array", () => {
      const result = arrayFrom(2, () => "x");
      expectTypeOf(result).toEqualTypeOf<ReadonlyArray<string>>();
    });

    test("passes index to callback", () => {
      const result = arrayFrom(4, (i) => i * 10);
      expect(result).toEqual([0, 10, 20, 30]);
    });
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

    test("narrows mutable array to NonEmptyArray", () => {
      const arr: Array<number> = [1, 2, 3];
      if (isNonEmptyArray(arr)) {
        expectTypeOf(arr).toEqualTypeOf<NonEmptyArray<number>>();
        // Should work with mutation functions
        shiftFromArray(arr);
      }
    });

    test("narrows readonly array to NonEmptyReadonlyArray", () => {
      const arr: ReadonlyArray<number> = [1, 2, 3];
      expect(isNonEmptyArray(arr)).toBe(true);
      if (isNonEmptyArray(arr)) {
        expectTypeOf(arr).toEqualTypeOf<NonEmptyReadonlyArray<number>>();
        // Should work with accessor functions
        firstInArray(arr);
      }
    });

    test("returns false for empty readonly array", () => {
      const arr: ReadonlyArray<number> = [];
      expect(isNonEmptyArray(arr)).toBe(false);
    });
  });
});

describe("Transformations", () => {
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

  describe("flatMapArray", () => {
    test("flattens mapped arrays", () => {
      const arr: ReadonlyArray<number> = [1, 2, 3];
      const result = flatMapArray(arr, (x) => [x, x * 10]);
      expect(result).toEqual([1, 10, 2, 20, 3, 30]);
      expectTypeOf(result).toEqualTypeOf<ReadonlyArray<number>>();
    });

    test("flattens nested arrays without mapper", () => {
      const arr: ReadonlyArray<ReadonlyArray<number>> = [
        [1, 2],
        [3, 4],
      ];
      const result = flatMapArray(arr);
      expect(result).toEqual([1, 2, 3, 4]);
      expectTypeOf(result).toEqualTypeOf<ReadonlyArray<number>>();
    });

    test("flattens non-empty nested arrays without mapper", () => {
      const arr: NonEmptyReadonlyArray<NonEmptyReadonlyArray<number>> = [
        [1, 2],
        [3, 4],
      ];
      const result = flatMapArray(arr);
      expect(result).toEqual([1, 2, 3, 4]);
      expectTypeOf(result).toEqualTypeOf<NonEmptyReadonlyArray<number>>();
    });

    test("preserves non-empty type when mapper returns non-empty", () => {
      const nonEmpty: NonEmptyReadonlyArray<number> = [1, 2, 3];
      const result = flatMapArray(
        nonEmpty,
        (x): NonEmptyReadonlyArray<number> => [x, x * 10],
      );
      expect(result).toEqual([1, 10, 2, 20, 3, 30]);
      expectTypeOf(result).toEqualTypeOf<NonEmptyReadonlyArray<number>>();
    });

    test("returns readonly array for regular array input", () => {
      const arr: ReadonlyArray<number> = [1, 2];
      const result = flatMapArray(arr, (x) => [x]);
      expectTypeOf(result).toEqualTypeOf<ReadonlyArray<number>>();
    });

    test("does not mutate original array", () => {
      const arr: ReadonlyArray<number> = [1, 2, 3];
      flatMapArray(arr, (x) => [x, x]);
      expect(arr).toEqual([1, 2, 3]);
    });

    test("passes index to mapper", () => {
      const arr: ReadonlyArray<string> = ["a", "b"];
      const result = flatMapArray(arr, (x, i) => [x, String(i)]);
      expect(result).toEqual(["a", "0", "b", "1"]);
    });

    test("filters and maps in one pass using [] and [value] pattern", () => {
      const validate = (n: number) =>
        n > 0 ? ok(n) : err(`${n} is not positive`);

      const fields = [1, -2, 3, -4];
      const errors = flatMapArray(fields, (f) => {
        const result = validate(f);
        return result.ok ? [] : [result.error];
      });

      expect(errors).toEqual(["-2 is not positive", "-4 is not positive"]);
      expectTypeOf(errors).toEqualTypeOf<ReadonlyArray<string>>();
    });
  });

  describe("concatArrays", () => {
    test("concatenates two arrays", () => {
      const first: ReadonlyArray<number> = [1, 2];
      const second: ReadonlyArray<number> = [3, 4];
      const result = concatArrays(first, second);
      expect(result).toEqual([1, 2, 3, 4]);
      expectTypeOf(result).toEqualTypeOf<ReadonlyArray<number>>();
    });

    test("returns non-empty when first is non-empty", () => {
      const first: NonEmptyReadonlyArray<number> = [1, 2];
      const second: ReadonlyArray<number> = [];
      const result = concatArrays(first, second);
      expect(result).toEqual([1, 2]);
      expectTypeOf(result).toEqualTypeOf<NonEmptyReadonlyArray<number>>();
    });

    test("returns non-empty when second is non-empty", () => {
      const first: ReadonlyArray<number> = [];
      const second: NonEmptyReadonlyArray<number> = [3, 4];
      const result = concatArrays(first, second);
      expect(result).toEqual([3, 4]);
      expectTypeOf(result).toEqualTypeOf<NonEmptyReadonlyArray<number>>();
    });

    test("returns non-empty when both are non-empty", () => {
      const first: NonEmptyReadonlyArray<number> = [1];
      const second: NonEmptyReadonlyArray<number> = [2];
      const result = concatArrays(first, second);
      expect(result).toEqual([1, 2]);
      expectTypeOf(result).toEqualTypeOf<NonEmptyReadonlyArray<number>>();
    });

    test("does not mutate original arrays", () => {
      const first: ReadonlyArray<number> = [1, 2];
      const second: ReadonlyArray<number> = [3, 4];
      concatArrays(first, second);
      expect(first).toEqual([1, 2]);
      expect(second).toEqual([3, 4]);
    });

    test("accepts mutable arrays and returns readonly", () => {
      const first: Array<number> = [1, 2];
      const second: Array<number> = [3, 4];
      const result = concatArrays(first, second);
      expect(result).toEqual([1, 2, 3, 4]);
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

    test("works with refinements", () => {
      const mixed: ReadonlyArray<NonEmptyString | PositiveInt> = [
        NonEmptyString.orThrow("hello"),
        PositiveInt.orThrow(42),
        NonEmptyString.orThrow("world"),
        PositiveInt.orThrow(100),
      ];

      const positiveInts = filterArray(mixed, PositiveInt.is);

      // Type narrowing: positiveInts should be ReadonlyArray<PositiveInt>
      expectTypeOf(positiveInts).toEqualTypeOf<ReadonlyArray<PositiveInt>>();

      expect(positiveInts.length).toBe(2);
      expect(positiveInts).toEqual([42, 100]);
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

  describe("partitionArray", () => {
    test("partitions array by predicate", () => {
      const arr: ReadonlyArray<number> = [1, 2, 3, 4, 5];
      const [evens, odds] = partitionArray(arr, (x) => x % 2 === 0);
      expect(evens).toEqual([2, 4]);
      expect(odds).toEqual([1, 3, 5]);
      expectTypeOf(evens).toEqualTypeOf<ReadonlyArray<number>>();
      expectTypeOf(odds).toEqualTypeOf<ReadonlyArray<number>>();
    });

    test("accepts mutable array and returns readonly", () => {
      const mutableArr: Array<number> = [1, 2, 3, 4];
      const [trueArr, falseArr] = partitionArray(mutableArr, (x) => x > 2);
      expect(trueArr).toEqual([3, 4]);
      expect(falseArr).toEqual([1, 2]);
      expectTypeOf(trueArr).toEqualTypeOf<ReadonlyArray<number>>();
      expectTypeOf(falseArr).toEqualTypeOf<ReadonlyArray<number>>();
      // Original mutable array is not mutated
      expect(mutableArr).toEqual([1, 2, 3, 4]);
    });

    test("passes index to predicate", () => {
      const arr: ReadonlyArray<string> = ["a", "b", "c"];
      const [evenIndices, oddIndices] = partitionArray(
        arr,
        (_, i) => i % 2 === 0,
      );
      expect(evenIndices).toEqual(["a", "c"]);
      expect(oddIndices).toEqual(["b"]);
    });

    test("works with refinements and type narrowing", () => {
      // Using PositiveInt.is as a type guard with partitionArray
      // With actual Evolu types: NonEmptyString | PositiveInt
      const mixed: ReadonlyArray<NonEmptyString | PositiveInt> = [
        NonEmptyString.orThrow("hello"),
        PositiveInt.orThrow(42),
        NonEmptyString.orThrow("world"),
        PositiveInt.orThrow(100),
      ];

      // Using partitionArray with PositiveInt.is type guard
      const [positiveInts, strings] = partitionArray(mixed, PositiveInt.is);

      // Type narrowing with Exclude: positiveInts is PositiveInt, strings is NonEmptyString
      expectTypeOf(positiveInts).toEqualTypeOf<ReadonlyArray<PositiveInt>>();
      expectTypeOf(strings).toEqualTypeOf<ReadonlyArray<NonEmptyString>>();

      // PositiveInt values are separated from NonEmptyString values
      expect(positiveInts.length).toBe(2);
      expect(strings.length).toBe(2);

      // All values that pass PositiveInt.is are positive integers
      for (const value of positiveInts) {
        expect(PositiveInt.is(value)).toBe(true);
      }

      // All values that don't pass PositiveInt.is are strings (NonEmptyString)
      for (const value of strings) {
        expect(NonEmptyString.is(value)).toBe(true);
      }
    });
  });

  describe("sortArray", () => {
    test("sorts array with compareFn", () => {
      const arr: ReadonlyArray<number> = [3, 1, 2];
      const result = sortArray(arr, (a, b) => a - b);
      expect(result).toEqual([1, 2, 3]);
      expectTypeOf(result).toEqualTypeOf<ReadonlyArray<number>>();
    });

    test("preserves non-empty type", () => {
      const arr: NonEmptyReadonlyArray<number> = [3, 1, 2];
      const result = sortArray(arr, (a, b) => a - b);
      expect(result).toEqual([1, 2, 3]);
      expectTypeOf(result).toEqualTypeOf<NonEmptyReadonlyArray<number>>();
    });

    test("does not mutate original array", () => {
      const arr: ReadonlyArray<number> = [3, 1, 2];
      sortArray(arr, (a, b) => a - b);
      expect(arr).toEqual([3, 1, 2]);
    });
  });

  describe("reverseArray", () => {
    test("reverses array", () => {
      const arr: ReadonlyArray<number> = [1, 2, 3];
      const result = reverseArray(arr);
      expect(result).toEqual([3, 2, 1]);
      expectTypeOf(result).toEqualTypeOf<ReadonlyArray<number>>();
    });

    test("preserves non-empty type", () => {
      const arr: NonEmptyReadonlyArray<number> = [1, 2, 3];
      const result = reverseArray(arr);
      expect(result).toEqual([3, 2, 1]);
      expectTypeOf(result).toEqualTypeOf<NonEmptyReadonlyArray<number>>();
    });

    test("does not mutate original array", () => {
      const arr: ReadonlyArray<number> = [1, 2, 3];
      reverseArray(arr);
      expect(arr).toEqual([1, 2, 3]);
    });
  });

  describe("spliceArray", () => {
    test("removes elements", () => {
      const arr: ReadonlyArray<number> = [1, 2, 3, 4];
      const result = spliceArray(arr, 1, 2);
      expect(result).toEqual([1, 4]);
      expectTypeOf(result).toEqualTypeOf<ReadonlyArray<number>>();
    });

    test("removes and inserts elements", () => {
      const arr: ReadonlyArray<number> = [1, 2, 3];
      const result = spliceArray(arr, 1, 1, 10, 11);
      expect(result).toEqual([1, 10, 11, 3]);
    });

    test("does not mutate original array", () => {
      const arr: ReadonlyArray<number> = [1, 2, 3, 4];
      spliceArray(arr, 1, 2);
      expect(arr).toEqual([1, 2, 3, 4]);
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
  describe("shiftFromArray", () => {
    test("removes first element from array", () => {
      const arr: NonEmptyArray<number> = [1, 2, 3];
      const result = shiftFromArray(arr);
      expect(result).toBe(1);
      expect(arr).toEqual([2, 3]);
    });

    test("removes from single element array", () => {
      const arr: NonEmptyArray<number> = [42];
      const result = shiftFromArray(arr);
      expect(result).toBe(42);
      expect(arr).toEqual([]);
    });

    test("mutates the original array", () => {
      const arr: NonEmptyArray<string> = ["a", "b", "c"];
      shiftFromArray(arr);
      expect(arr).toEqual(["b", "c"]);
    });

    test("only accepts mutable arrays", () => {
      const mutableArr: NonEmptyArray<number> = [1, 2, 3];
      const result = shiftFromArray(mutableArr);
      expect(result).toBe(1);
      expect(mutableArr).toEqual([2, 3]);
      expectTypeOf(result).toEqualTypeOf<number>();

      // Verify readonly arrays are NOT accepted by TypeScript
      // @ts-expect-error - readonly arrays cannot be mutated
      shiftFromArray([1, 2, 3] as NonEmptyReadonlyArray<number>);
    });
  });

  describe("popFromArray", () => {
    test("removes last element from array", () => {
      const arr: NonEmptyArray<number> = [1, 2, 3];
      const result = popFromArray(arr);
      expect(result).toBe(3);
      expect(arr).toEqual([1, 2]);
    });

    test("removes from single element array", () => {
      const arr: NonEmptyArray<number> = [42];
      const result = popFromArray(arr);
      expect(result).toBe(42);
      expect(arr).toEqual([]);
    });

    test("mutates the original array", () => {
      const arr: NonEmptyArray<string> = ["a", "b", "c"];
      popFromArray(arr);
      expect(arr).toEqual(["a", "b"]);
    });

    test("only accepts mutable arrays", () => {
      const mutableArr: NonEmptyArray<number> = [1, 2, 3];
      const result = popFromArray(mutableArr);
      expect(result).toBe(3);
      expect(mutableArr).toEqual([1, 2]);
      expectTypeOf(result).toEqualTypeOf<number>();

      // Verify readonly arrays are NOT accepted by TypeScript
      // @ts-expect-error - readonly arrays cannot be mutated
      popFromArray([1, 2, 3] as NonEmptyReadonlyArray<number>);
    });
  });
});
