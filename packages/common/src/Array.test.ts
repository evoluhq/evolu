import { describe, it } from "node:test";
import {
  appendToArray,
  arrayFrom,
  arrayFromAsync,
  concatArrays,
  createMutableArray,
  dedupeArray,
  emptyArray,
  filterArray,
  firstInArray,
  flatMapArray,
  isNonEmptyArray,
  lastInArray,
  mapArray,
  partitionArray,
  prependToArray,
  reverseArray,
  sortArray,
  spliceArray,
  zipArray,
  type AtLeastTwoReadonlyArray,
  type NonEmptyArray,
  type NonEmptyReadonlyArray,
} from "./Array.ts";
import {
  assertEqual,
  assertFalse,
  assertLength,
  assertSame,
  assertTrue,
} from "./Assert.ts";
import { identity } from "./Function.ts";
import { err, ok } from "./Result.ts";
import { assertType, NonEmptyTrimmedString, PositiveInt } from "./Type.ts";

describe("Types", () => {
  it("NonEmptyArray requires at least one element", () => {
    // @ts-expect-error An empty array is not assignable to NonEmptyArray.
    const _invalid: NonEmptyArray<number> = [];
  });

  it("NonEmptyReadonlyArray requires at least one element", () => {
    // @ts-expect-error An empty array is not assignable to NonEmptyReadonlyArray.
    const _invalid: NonEmptyReadonlyArray<string> = [];
  });

  it("AtLeastTwoReadonlyArray requires at least two elements", () => {
    // @ts-expect-error An empty array is not assignable to AtLeastTwoReadonlyArray.
    const _empty: AtLeastTwoReadonlyArray<string> = [];
    // @ts-expect-error A single-element array is not assignable to AtLeastTwoReadonlyArray.
    const _single: AtLeastTwoReadonlyArray<string> = ["a"];
  });
});

describe("Constants", () => {
  describe("emptyArray", () => {
    it("is an empty array", () => {
      assertEqual(emptyArray, []);
      assertLength(emptyArray, 0);
    });

    it("is assignable to any ReadonlyArray<T>", () => {
      const numbers: ReadonlyArray<number> = emptyArray;
      const strings: ReadonlyArray<string> = emptyArray;
      const objects: ReadonlyArray<{ id: number }> = emptyArray;

      assertType<typeof numbers, ReadonlyArray<number>>();
      assertType<typeof strings, ReadonlyArray<string>>();
      assertType<typeof objects, ReadonlyArray<{ id: number }>>();
    });

    it("enables reference equality checks", () => {
      let items: ReadonlyArray<number> = emptyArray;
      assertSame(items, emptyArray);

      items = [1, 2, 3];
      assertFalse(items === emptyArray);
    });
  });
});

describe("Constructors", () => {
  describe("createMutableArray", () => {
    it("creates a mutable sparse Array", () => {
      const result = createMutableArray<number>(3);

      assertType<typeof result, Array<number>>();
      assertLength(result, 3);
      assertFalse(0 in result);

      result[0] = 1;
      result[1] = 2;
      result[2] = 3;

      assertEqual(result, [1, 2, 3]);
    });
  });

  describe("arrayFrom", () => {
    it("creates array from iterable", () => {
      const result = arrayFrom(new Set([1, 2, 3]));
      assertEqual(result, [1, 2, 3]);
    });

    it("returns input unchanged if already an array", () => {
      const input = [1, 2, 3];
      const result = arrayFrom(input);
      assertSame(result, input);
    });

    it("creates array with specified length", () => {
      const result = arrayFrom(3, identity);
      assertEqual(result, [0, 1, 2]);
    });

    it("returns readonly array", () => {
      const result = arrayFrom(2, () => "x");
      assertType<typeof result, ReadonlyArray<string>>();
    });

    it("passes index to callback", () => {
      const result = arrayFrom(4, (i) => i * 10);
      assertEqual(result, [0, 10, 20, 30]);
    });
  });

  describe("arrayFromAsync", () => {
    it("creates array from async iterable", async () => {
      const asyncIterable = {
        async *[Symbol.asyncIterator]() {
          yield await Promise.resolve(1);
          yield await Promise.resolve(2);
          yield await Promise.resolve(3);
        },
      };

      const result = await arrayFromAsync(asyncIterable);
      assertEqual(result, [1, 2, 3]);
    });

    it("awaits promised values from sync iterable", async () => {
      const result = await arrayFromAsync([
        Promise.resolve(1),
        Promise.resolve(2),
        Promise.resolve(3),
      ]);

      assertEqual(result, [1, 2, 3]);
    });

    it("returns readonly array", async () => {
      const result = await arrayFromAsync([Promise.resolve("x")]);
      assertType<typeof result, ReadonlyArray<string>>();
    });
  });
});

describe("Type guards", () => {
  describe("isNonEmptyArray", () => {
    it("returns true for non-empty array", () => {
      const arr = [1, 2, 3];

      assertTrue(isNonEmptyArray(arr));
    });

    it("returns false for empty array", () => {
      const arr: Array<number> = [];
      assertFalse(isNonEmptyArray(arr));
    });

    it("returns true for single element array", () => {
      const arr = [1];
      assertTrue(isNonEmptyArray(arr));
    });

    it("narrows mutable array to NonEmptyArray", () => {
      const arr: Array<number> = [1, 2, 3];
      if (isNonEmptyArray(arr)) {
        assertType<typeof arr, NonEmptyArray<number>>();
        firstInArray(arr);
      }
    });

    it("narrows readonly array to NonEmptyReadonlyArray", () => {
      const arr: ReadonlyArray<number> = [1, 2, 3];
      if (isNonEmptyArray(arr)) {
        assertType<typeof arr, NonEmptyReadonlyArray<number>>();
        // Should work with accessor functions
        firstInArray(arr);
      }
    });

    it("returns false for empty readonly array", () => {
      const arr: ReadonlyArray<number> = [];
      assertFalse(isNonEmptyArray(arr));
    });
  });
});

describe("Transformations", () => {
  describe("appendToArray", () => {
    it("appends item to empty array", () => {
      const arr: ReadonlyArray<number> = [];
      const result = appendToArray(arr, 1);
      assertEqual(result, [1]);
      assertType<typeof result, NonEmptyReadonlyArray<number>>();
    });

    it("appends item to non-empty array", () => {
      const arr: ReadonlyArray<number> = [1, 2];
      const result = appendToArray(arr, 3);
      assertEqual(result, [1, 2, 3]);
    });

    it("does not mutate original array", () => {
      const arr: ReadonlyArray<number> = [1, 2];
      appendToArray(arr, 3);
      assertEqual(arr, [1, 2]);
    });

    it("accepts mutable array and returns readonly", () => {
      const mutableArr: Array<number> = [1, 2];
      const result = appendToArray(mutableArr, 3);
      assertEqual(result, [1, 2, 3]);
      assertType<typeof result, NonEmptyReadonlyArray<number>>();
      // Original mutable array is not mutated
      assertEqual(mutableArr, [1, 2]);
    });
  });

  describe("prependToArray", () => {
    it("prepends item to empty array", () => {
      const arr: ReadonlyArray<number> = [];
      const result = prependToArray(arr, 1);
      assertEqual(result, [1]);
      assertType<typeof result, NonEmptyReadonlyArray<number>>();
    });

    it("prepends item to non-empty array", () => {
      const arr: ReadonlyArray<number> = [2, 3];
      const result = prependToArray(arr, 1);
      assertEqual(result, [1, 2, 3]);
    });

    it("does not mutate original array", () => {
      const arr: ReadonlyArray<number> = [2, 3];
      prependToArray(arr, 1);
      assertEqual(arr, [2, 3]);
    });

    it("accepts mutable array and returns readonly", () => {
      const mutableArr: Array<number> = [2, 3];
      const result = prependToArray(mutableArr, 1);
      assertEqual(result, [1, 2, 3]);
      assertType<typeof result, NonEmptyReadonlyArray<number>>();
      // Original mutable array is not mutated
      assertEqual(mutableArr, [2, 3]);
    });
  });

  describe("mapArray", () => {
    it("preserves non-empty type when mapping non-empty array", () => {
      const nonEmpty: NonEmptyReadonlyArray<number> = [1, 2, 3];
      const result = mapArray(nonEmpty, (x) => x * 2);
      assertType<typeof result, NonEmptyReadonlyArray<number>>();
    });

    it("returns readonly array when mapping regular array", () => {
      const regular: ReadonlyArray<number> = [1, 2, 3];
      const result = mapArray(regular, (x) => x * 2);
      assertType<typeof result, ReadonlyArray<number>>();
    });

    it("accepts mutable non-empty array and returns readonly", () => {
      const mutableArr: NonEmptyArray<number> = [1, 2, 3];
      const result = mapArray(mutableArr, (x) => x * 2);
      assertType<typeof result, NonEmptyReadonlyArray<number>>();
    });

    it("accepts mutable regular array and returns readonly", () => {
      const mutableArr: Array<number> = [1, 2, 3];
      const result = mapArray(mutableArr, (x) => x * 2);
      assertType<typeof result, ReadonlyArray<number>>();
    });

    it("passes the source array to the mapper", () => {
      const array: ReadonlyArray<number> = [1, 2, 3];
      const sourceArrays: Array<ReadonlyArray<number>> = [];

      mapArray(array, (_value, _index, sourceArray) => {
        assertType<typeof sourceArray, ReadonlyArray<number>>();
        sourceArrays.push(sourceArray);
      });

      assertEqual(sourceArrays, [array, array, array]);
    });

    it("skips and preserves holes in sparse arrays", () => {
      const sparse = createMutableArray<number>(3);
      sparse[1] = 1;
      const visitedIndices: Array<number> = [];

      const result = mapArray(sparse, (value, index) => {
        visitedIndices.push(index);
        return value * 2;
      });

      assertEqual(visitedIndices, [1]);
      assertLength(result, 3);
      assertFalse(0 in result);
      assertEqual(result[1], 2);
      assertFalse(2 in result);
    });
  });

  describe("flatMapArray", () => {
    it("flattens mapped arrays", () => {
      const arr: ReadonlyArray<number> = [1, 2, 3];
      const result = flatMapArray(arr, (x) => [x, x * 10]);
      assertEqual(result, [1, 10, 2, 20, 3, 30]);
      assertType<typeof result, ReadonlyArray<number>>();
    });

    it("flattens nested arrays without mapper", () => {
      const arr: ReadonlyArray<ReadonlyArray<number>> = [
        [1, 2],
        [3, 4],
      ];
      const result = flatMapArray(arr);
      assertEqual(result, [1, 2, 3, 4]);
      assertType<typeof result, ReadonlyArray<number>>();
    });

    it("flattens non-empty nested arrays without mapper", () => {
      const arr: NonEmptyReadonlyArray<NonEmptyReadonlyArray<number>> = [
        [1, 2],
        [3, 4],
      ];
      const result = flatMapArray(arr);
      assertEqual(result, [1, 2, 3, 4]);
      assertType<typeof result, NonEmptyReadonlyArray<number>>();
    });

    it("preserves non-empty type when mapper returns non-empty", () => {
      const nonEmpty: NonEmptyReadonlyArray<number> = [1, 2, 3];
      const result = flatMapArray(nonEmpty, (x) => [x, x * 10]);
      assertEqual(result, [1, 10, 2, 20, 3, 30]);
      assertType<typeof result, NonEmptyReadonlyArray<number>>();
    });

    it("returns readonly array for regular array input", () => {
      const arr: ReadonlyArray<number> = [1, 2];
      const result = flatMapArray(arr, (x) => [x]);
      assertType<typeof result, ReadonlyArray<number>>();
    });

    it("does not mutate original array", () => {
      const arr: ReadonlyArray<number> = [1, 2, 3];
      flatMapArray(arr, (x) => [x, x]);
      assertEqual(arr, [1, 2, 3]);
    });

    it("passes index and source array to mapper", () => {
      const arr: ReadonlyArray<string> = ["a", "b"];
      const sourceArrays: Array<ReadonlyArray<string>> = [];
      const result = flatMapArray(arr, (x, i, sourceArray) => {
        assertType<typeof sourceArray, ReadonlyArray<string>>();
        sourceArrays.push(sourceArray);
        return [x, String(i)];
      });

      assertEqual(result, ["a", "0", "b", "1"]);
      assertEqual(sourceArrays, [arr, arr]);
    });

    it("filters and maps in one pass using [] and [value] pattern", () => {
      const validate = (n: number) =>
        n > 0 ? ok(n) : err(`${n} is not positive`);

      const fields = [1, -2, 3, -4];
      const errors = flatMapArray(fields, (f) => {
        const result = validate(f);
        return result.ok ? [] : [result.error];
      });

      assertEqual(errors, ["-2 is not positive", "-4 is not positive"]);
      assertType<typeof errors, ReadonlyArray<string>>();
    });
  });

  describe("concatArrays", () => {
    it("concatenates two arrays", () => {
      const first: ReadonlyArray<number> = [1, 2];
      const second: ReadonlyArray<number> = [3, 4];
      const result = concatArrays(first, second);
      assertEqual(result, [1, 2, 3, 4]);
      assertType<typeof result, ReadonlyArray<number>>();
    });

    it("returns non-empty when first is non-empty", () => {
      const first: NonEmptyReadonlyArray<number> = [1, 2];
      const second: ReadonlyArray<number> = [];
      const result = concatArrays(first, second);
      assertEqual(result, [1, 2]);
      assertType<typeof result, NonEmptyReadonlyArray<number>>();
    });

    it("returns non-empty when second is non-empty", () => {
      const first: ReadonlyArray<number> = [];
      const second: NonEmptyReadonlyArray<number> = [3, 4];
      const result = concatArrays(first, second);
      assertEqual(result, [3, 4]);
      assertType<typeof result, NonEmptyReadonlyArray<number>>();
    });

    it("returns non-empty when both are non-empty", () => {
      const first: NonEmptyReadonlyArray<number> = [1];
      const second: NonEmptyReadonlyArray<number> = [2];
      const result = concatArrays(first, second);
      assertEqual(result, [1, 2]);
      assertType<typeof result, NonEmptyReadonlyArray<number>>();
    });

    it("does not mutate original arrays", () => {
      const first: ReadonlyArray<number> = [1, 2];
      const second: ReadonlyArray<number> = [3, 4];
      concatArrays(first, second);
      assertEqual(first, [1, 2]);
      assertEqual(second, [3, 4]);
    });

    it("accepts mutable arrays and returns readonly", () => {
      const first: Array<number> = [1, 2];
      const second: Array<number> = [3, 4];
      const result = concatArrays(first, second);
      assertEqual(result, [1, 2, 3, 4]);
      assertType<typeof result, ReadonlyArray<number>>();
    });
  });

  describe("filterArray", () => {
    it("filters array and returns readonly", () => {
      const arr: ReadonlyArray<number> = [1, 2, 3, 4, 5];
      const result = filterArray(arr, (x) => x % 2 === 0);
      assertEqual(result, [2, 4]);
      assertType<typeof result, ReadonlyArray<number>>();
    });

    it("does not mutate original array", () => {
      const arr: ReadonlyArray<number> = [1, 2, 3, 4, 5];
      filterArray(arr, (x) => x % 2 === 0);
      assertEqual(arr, [1, 2, 3, 4, 5]);
    });

    it("passes index and source array to predicate", () => {
      const arr: ReadonlyArray<number> = [1, 2, 3];
      const calls: Array<readonly [number, number, ReadonlyArray<number>]> = [];

      filterArray(arr, (value, index, sourceArray) => {
        assertType<typeof sourceArray, ReadonlyArray<number>>();
        calls.push([value, index, sourceArray]);
        return true;
      });

      assertEqual(calls, [
        [1, 0, arr],
        [2, 1, arr],
        [3, 2, arr],
      ]);
    });

    it("works with refinements", () => {
      const mixed: ReadonlyArray<NonEmptyTrimmedString | PositiveInt> = [
        NonEmptyTrimmedString.orThrow("hello"),
        PositiveInt.orThrow(42),
        NonEmptyTrimmedString.orThrow("world"),
        PositiveInt.orThrow(100),
      ];

      const positiveInts = filterArray(mixed, PositiveInt.is);

      // Type narrowing: positiveInts should be ReadonlyArray<PositiveInt>
      assertType<typeof positiveInts, ReadonlyArray<PositiveInt>>();

      assertLength(positiveInts, 2);
      assertEqual(positiveInts, [42, 100]);
    });
  });

  describe("dedupeArray", () => {
    it("deduplicates primitives without callback and returns readonly", () => {
      const arr: ReadonlyArray<number> = [1, 2, 1, 3, 2];
      const result = dedupeArray(arr);
      assertEqual(result, [1, 2, 3]);
      assertType<typeof result, ReadonlyArray<number>>();
      // original not mutated
      assertEqual(arr, [1, 2, 1, 3, 2]);
    });

    it("deduplicates objects by callback and preserves first occurrence", () => {
      const arr = [
        { id: 1, value: "a" },
        { id: 2, value: "b" },
        { id: 1, value: "c" },
      ];
      const result = dedupeArray(arr, (x) => x.id);
      assertEqual(result, [
        { id: 1, value: "a" },
        { id: 2, value: "b" },
      ]);
      assertType<typeof result, ReadonlyArray<{ id: number; value: string }>>();
    });

    it("preserves non-empty type when deduping non-empty array", () => {
      const nonEmpty: NonEmptyReadonlyArray<number> = [1, 2, 1, 3, 2];
      const result = dedupeArray(nonEmpty);
      assertEqual(result, [1, 2, 3]);
      assertType<typeof result, NonEmptyReadonlyArray<number>>();
    });

    it("preserves non-empty type with callback on non-empty array", () => {
      const nonEmpty: NonEmptyReadonlyArray<{ id: number; value: string }> = [
        { id: 1, value: "a" },
        { id: 2, value: "b" },
        { id: 1, value: "c" },
      ];
      const result = dedupeArray(nonEmpty, (x) => x.id);
      assertEqual(result, [
        { id: 1, value: "a" },
        { id: 2, value: "b" },
      ]);
      assertType<
        typeof result,
        NonEmptyReadonlyArray<{ id: number; value: string }>
      >();
    });
  });

  describe("partitionArray", () => {
    it("partitions array by predicate", () => {
      const arr: ReadonlyArray<number> = [1, 2, 3, 4, 5];
      const [evens, odds] = partitionArray(arr, (x) => x % 2 === 0);
      assertEqual(evens, [2, 4]);
      assertEqual(odds, [1, 3, 5]);
      assertType<typeof evens, ReadonlyArray<number>>();
      assertType<typeof odds, ReadonlyArray<number>>();
    });

    it("accepts mutable array and returns readonly", () => {
      const mutableArr: Array<number> = [1, 2, 3, 4];
      const [trueArr, falseArr] = partitionArray(mutableArr, (x) => x > 2);
      assertEqual(trueArr, [3, 4]);
      assertEqual(falseArr, [1, 2]);
      assertType<typeof trueArr, ReadonlyArray<number>>();
      assertType<typeof falseArr, ReadonlyArray<number>>();
      // Original mutable array is not mutated
      assertEqual(mutableArr, [1, 2, 3, 4]);
    });

    it("passes index and source array to predicate", () => {
      const arr: ReadonlyArray<string> = ["a", "b", "c"];
      const sourceArrays: Array<ReadonlyArray<string>> = [];
      const [evenIndices, oddIndices] = partitionArray(
        arr,
        (_, i, sourceArray) => {
          assertType<typeof sourceArray, ReadonlyArray<string>>();
          sourceArrays.push(sourceArray);
          return i % 2 === 0;
        },
      );
      assertEqual(evenIndices, ["a", "c"]);
      assertEqual(oddIndices, ["b"]);
      assertEqual(sourceArrays, [arr, arr, arr]);
    });

    it("works with refinements and type narrowing", () => {
      // Using PositiveInt.is as a type guard with partitionArray
      // With actual Evolu types: NonEmptyTrimmedString | PositiveInt
      const mixed: ReadonlyArray<NonEmptyTrimmedString | PositiveInt> = [
        NonEmptyTrimmedString.orThrow("hello"),
        PositiveInt.orThrow(42),
        NonEmptyTrimmedString.orThrow("world"),
        PositiveInt.orThrow(100),
      ];

      // Using partitionArray with PositiveInt.is type guard
      const [positiveInts, strings] = partitionArray(mixed, PositiveInt.is);

      // Type narrowing with Exclude: positiveInts is PositiveInt, strings is NonEmptyTrimmedString
      assertType<typeof positiveInts, ReadonlyArray<PositiveInt>>();
      assertType<typeof strings, ReadonlyArray<NonEmptyTrimmedString>>();

      // PositiveInt values are separated from NonEmptyTrimmedString values
      assertLength(positiveInts, 2);
      assertLength(strings, 2);

      // All values that pass PositiveInt.is are positive integers
      for (const value of positiveInts) {
        assertTrue(PositiveInt.is(value));
      }

      // All values that don't pass PositiveInt.is are strings (NonEmptyTrimmedString)
      for (const value of strings) {
        assertTrue(NonEmptyTrimmedString.is(value));
      }
    });
  });

  describe("sortArray", () => {
    it("sorts array with compareFn", () => {
      const arr: ReadonlyArray<number> = [3, 1, 2];
      const result = sortArray(arr, (a, b) => a - b);
      assertEqual(result, [1, 2, 3]);
      assertType<typeof result, ReadonlyArray<number>>();
    });

    it("preserves non-empty type", () => {
      const arr: NonEmptyReadonlyArray<number> = [3, 1, 2];
      const result = sortArray(arr, (a, b) => a - b);
      assertEqual(result, [1, 2, 3]);
      assertType<typeof result, NonEmptyReadonlyArray<number>>();
    });

    it("does not mutate original array", () => {
      const arr: ReadonlyArray<number> = [3, 1, 2];
      sortArray(arr, (a, b) => a - b);
      assertEqual(arr, [3, 1, 2]);
    });
  });

  describe("reverseArray", () => {
    it("reverses array", () => {
      const arr: ReadonlyArray<number> = [1, 2, 3];
      const result = reverseArray(arr);
      assertEqual(result, [3, 2, 1]);
      assertType<typeof result, ReadonlyArray<number>>();
    });

    it("preserves non-empty type", () => {
      const arr: NonEmptyReadonlyArray<number> = [1, 2, 3];
      const result = reverseArray(arr);
      assertEqual(result, [3, 2, 1]);
      assertType<typeof result, NonEmptyReadonlyArray<number>>();
    });

    it("does not mutate original array", () => {
      const arr: ReadonlyArray<number> = [1, 2, 3];
      reverseArray(arr);
      assertEqual(arr, [1, 2, 3]);
    });
  });

  describe("spliceArray", () => {
    it("removes elements", () => {
      const arr: ReadonlyArray<number> = [1, 2, 3, 4];
      const result = spliceArray(arr, 1, 2);
      assertEqual(result, [1, 4]);
      assertType<typeof result, ReadonlyArray<number>>();
    });

    it("removes and inserts elements", () => {
      const arr: ReadonlyArray<number> = [1, 2, 3];
      const result = spliceArray(arr, 1, 1, 10, 11);
      assertEqual(result, [1, 10, 11, 3]);
    });

    it("does not mutate original array", () => {
      const arr: ReadonlyArray<number> = [1, 2, 3, 4];
      spliceArray(arr, 1, 2);
      assertEqual(arr, [1, 2, 3, 4]);
    });
  });

  describe("zipArray", () => {
    it("combines arrays into tuples", () => {
      const result = zipArray([
        [1, 2, 3],
        ["a", "b", "c"],
      ]);
      assertEqual(result, [
        [1, "a"],
        [2, "b"],
        [3, "c"],
      ]);

      assertType<
        typeof result,
        NonEmptyReadonlyArray<Readonly<[number, string]>>
      >();
    });

    it("combines three arrays into tuples", () => {
      const result = zipArray([
        [1, 2],
        ["a", "b"],
        [true, false],
      ]);
      assertEqual(result, [
        [1, "a", true],
        [2, "b", false],
      ]);
    });

    it("stops at shortest array", () => {
      const result = zipArray([
        [1, 2],
        ["a", "b", "c", "d"],
      ]);
      assertEqual(result, [
        [1, "a"],
        [2, "b"],
      ]);
    });

    it("returns empty array when any input is empty", () => {
      const result = zipArray([[1, 2, 3], []]);
      assertEqual(result, []);
    });

    it("returns empty array for empty outer array", () => {
      const result = zipArray([]);
      assertEqual(result, []);
    });

    it("handles single array", () => {
      const result = zipArray([[1, 2, 3]]);
      assertEqual(result, [[1], [2], [3]]);
    });

    it("preserves non-empty type when all inputs are non-empty", () => {
      const numbers: NonEmptyReadonlyArray<number> = [1, 2, 3];
      const strings: NonEmptyReadonlyArray<string> = ["a", "b", "c"];
      const result = zipArray([numbers, strings]);

      assertType<
        typeof result,
        NonEmptyReadonlyArray<Readonly<[number, string]>>
      >();

      const first = firstInArray(result);
      assertEqual(first, [1, "a"]);
    });

    it("returns possibly empty tuples when any input is possibly empty", () => {
      const numbers: NonEmptyReadonlyArray<number> = [1, 2, 3];
      const strings: ReadonlyArray<string> = ["a", "b", "c"];
      const result = zipArray([numbers, strings]);

      assertType<typeof result, ReadonlyArray<Readonly<[number, string]>>>();
    });
  });
});

describe("Accessors", () => {
  describe("firstInArray", () => {
    it("returns first element from non-empty array", () => {
      const arr: NonEmptyReadonlyArray<number> = [1, 2, 3];
      const result = firstInArray(arr);
      assertEqual(result, 1);
      assertType<typeof result, number>();
    });

    it("returns first element from single element array", () => {
      const arr: NonEmptyReadonlyArray<string> = ["only"];
      const result = firstInArray(arr);
      assertEqual(result, "only");
    });

    it("does not mutate original array", () => {
      const arr: NonEmptyReadonlyArray<number> = [1, 2, 3];
      firstInArray(arr);
      assertEqual(arr, [1, 2, 3]);
    });

    it("works with mutable non-empty arrays", () => {
      const arr: NonEmptyArray<number> = [10, 20, 30];
      const result = firstInArray(arr);
      assertEqual(result, 10);
    });
  });

  describe("lastInArray", () => {
    it("returns last element from non-empty array", () => {
      const arr: NonEmptyReadonlyArray<number> = [1, 2, 3];
      const result = lastInArray(arr);
      assertEqual(result, 3);
      assertType<typeof result, number>();
    });

    it("returns last element from single element array", () => {
      const arr: NonEmptyReadonlyArray<string> = ["only"];
      const result = lastInArray(arr);
      assertEqual(result, "only");
    });

    it("does not mutate original array", () => {
      const arr: NonEmptyReadonlyArray<number> = [1, 2, 3];
      lastInArray(arr);
      assertEqual(arr, [1, 2, 3]);
    });

    it("works with mutable non-empty arrays", () => {
      const arr: NonEmptyArray<number> = [10, 20, 30];
      const result = lastInArray(arr);
      assertEqual(result, 30);
    });
  });
});
