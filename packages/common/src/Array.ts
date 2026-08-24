/**
 * Array helpers that help TypeScript help you.
 *
 * - **Non-empty arrays**: compile-time guarantee of at least one element
 * - **Readonly arrays**: prevents accidental mutation
 *
 * Instead of checking array length at runtime, use {@link NonEmptyReadonlyArray}
 * so TypeScript rejects empty arrays at compile time. Functions like
 * {@link firstInArray} require a non-empty array — TypeScript won't let us pass
 * an empty one. {@link mapArray} preserves non-emptiness (native `map` doesn't),
 * while {@link appendToArray} and {@link prependToArray} guarantee the result is
 * non-empty.
 *
 * All helpers return readonly arrays for safety. Consider how dangerous native
 * `sort()` is — it mutates the original array and returns it, making bugs hard
 * to track:
 *
 * ```ts
 * import { assertEqual, assertSame } from "@evolu/common";
 *
 * // oxlint-disable-next-line unicorn/no-array-sort -- This example intentionally demonstrates mutating Array.sort.
 * const sortScores = (arr: Array<number>) => arr.sort((a, b) => a - b);
 *
 * const scores = [3, 1, 2];
 * const leaderboard = sortScores(scores);
 * assertEqual(leaderboard, [1, 2, 3]);
 * assertEqual(scores, [1, 2, 3]);
 * assertSame(leaderboard, scores);
 * ```
 *
 * Imagine every method doing that.
 *
 * On a `ReadonlyArray`, `.sort()` doesn't even exist. Use {@link sortArray}
 * instead:
 *
 * ```ts
 * import { assertEqual, assertTrue, sortArray } from "@evolu/common";
 *
 * const sortScores = (arr: ReadonlyArray<number>) =>
 *   sortArray(arr, (a, b) => a - b);
 *
 * const scores: ReadonlyArray<number> = [3, 1, 2];
 * const leaderboard = sortScores(scores);
 * assertEqual(leaderboard, [1, 2, 3]);
 * assertEqual(scores, [3, 1, 2]);
 * assertTrue(leaderboard !== scores);
 * ```
 *
 * Even better, require a {@link NonEmptyReadonlyArray} — there's nothing to sort
 * if the array is empty anyway:
 *
 * ```ts
 * import {
 *   assertEqual,
 *   assertType,
 *   sortArray,
 *   type NonEmptyReadonlyArray,
 * } from "@evolu/common";
 *
 * const sortScores = (arr: NonEmptyReadonlyArray<number>) =>
 *   sortArray(arr, (a, b) => a - b);
 *
 * const leaderboard = sortScores([3, 1, 2]);
 * assertEqual(leaderboard, [1, 2, 3]);
 * assertType<NonEmptyReadonlyArray<number>, typeof leaderboard>();
 * ```
 *
 * Sorting an empty array isn't expensive, but functions can have side effects
 * like database queries or network requests. Using non-empty arrays whenever
 * possible is a good convention.
 *
 * ### When to use native methods
 *
 * These helpers only exist where they add type-level value. Native methods like
 * `find`, `some`, `every`, `includes`, `indexOf`, and `findIndex` work well on
 * readonly arrays without mutation — use them directly.
 *
 * ```ts
 * import { assertEqual, type NonEmptyReadonlyArray } from "@evolu/common";
 *
 * const valid: NonEmptyReadonlyArray<number> = [1, 2, 3];
 * // @ts-expect-error An empty array is not non-empty.
 * const _invalid: NonEmptyReadonlyArray<number> = [];
 *
 * assertEqual(
 *   valid.find((value) => value === 2),
 *   2,
 * );
 * ```
 *
 * ## Composition
 *
 * All array helpers use a data-first style (the array is the first argument)
 * because it's natural for single operations:
 *
 * ```ts
 * import { assertEqual, mapArray } from "@evolu/common";
 *
 * interface Message {
 *   readonly timestamp: number;
 * }
 *
 * const messages: ReadonlyArray<Message> = [
 *   { timestamp: 10 },
 *   { timestamp: 20 },
 * ];
 * const timestamps = mapArray(messages, (m) => m.timestamp);
 * assertEqual(timestamps, [10, 20]);
 * ```
 *
 * Data-first style also reads well for a few operations, often fitting on a
 * line:
 *
 * ```ts
 * import {
 *   assertEqual,
 *   dedupeArray,
 *   filterArray,
 *   firstInArray,
 *   isNonEmptyArray,
 *   lastInArray,
 *   mapArray,
 *   orderNumber,
 *   sortArray,
 * } from "@evolu/common";
 *
 * const cheapest = firstInArray(sortArray([30, 10, 20], orderNumber));
 * assertEqual(cheapest, 10);
 *
 * const users = [{ name: "Ada" }, { name: "Linus" }, { name: "Ada" }];
 * const uniqueNames = dedupeArray(mapArray(users, (u) => u.name));
 * assertEqual(uniqueNames, ["Ada", "Linus"]);
 *
 * const jobs = [
 *   { id: 1, done: false },
 *   { id: 2, done: true },
 * ];
 * const completedJobs = filterArray(jobs, (job) => job.done);
 * if (!isNonEmptyArray(completedJobs)) throw new Error("Expected a job");
 * const latestDone = lastInArray(completedJobs);
 *
 * assertEqual(latestDone, { id: 2, done: true });
 * ```
 *
 * For more operations, create a function like `getOldestActiveUser` or a
 * generic helper.
 *
 * Some libraries provide dual APIs with data-last for pipe-based composition.
 * Evolu prefers simplicity (in Latin, simplex means "one") so we don't have to
 * choose between seemingly equivalent options (Buridan's ass dilemma).
 *
 * Evolu doesn't provide `pipe` because few operations compose well without it,
 * and for more operations, well-named functions communicate intent better.
 *
 * @module
 */

import { identity } from "./Function.ts";

/**
 * An array with at least one element.
 *
 * @group Types
 */
export type NonEmptyArray<T> = [T, ...Array<T>];

/**
 * A readonly array with at least one element.
 *
 * @group Types
 */
export type NonEmptyReadonlyArray<T> = readonly [T, ...ReadonlyArray<T>];

/**
 * A readonly array with at least two elements.
 *
 * @group Types
 */
export type AtLeastTwoReadonlyArray<T> = readonly [T, T, ...ReadonlyArray<T>];

/**
 * An empty readonly array.
 *
 * Use as a default or initial value to avoid allocating new empty arrays.
 *
 * @group Constants
 */
export const emptyArray: ReadonlyArray<never> = [];

/**
 * Creates a mutable sparse Array with the specified length.
 *
 * Use it to build an Array with indexed writes when its final length is known.
 * Assign every index before exposing the completed Array as readonly.
 *
 * ### Example
 *
 * ```ts
 * import {
 *   assertEqual,
 *   assertType,
 *   createMutableArray,
 * } from "@evolu/common";
 *
 * const values = createMutableArray<number>(3);
 *
 * for (let index = 0; index < values.length; index++) {
 *   values[index] = index * 10;
 * }
 *
 * assertEqual(values, [0, 10, 20]);
 * assertType<Array<number>, typeof values>();
 * ```
 *
 * @group Constructors
 */
export const createMutableArray = <T>(length: number): Array<T> =>
  // oxlint-disable-next-line unicorn/no-new-array -- Intentionally preallocates a sparse mutable Array.
  new Array<T>(length);

/**
 * Better `Array.from`.
 *
 * - Returns readonly arrays
 * - Accepts length directly: `arrayFrom(3, fn)` instead of `Array.from({ length:
 *   3 }, fn)`
 * - Returns existing arrays unchanged
 *
 * ### Creating from iterables and lengths
 *
 * ```ts
 * import {
 *   assertEqual,
 *   assertSame,
 *   assertType,
 *   arrayFrom,
 * } from "@evolu/common";
 *
 * const fromSet = arrayFrom(new Set([1, 2, 3]));
 * assertEqual(fromSet, [1, 2, 3]);
 * assertType<ReadonlyArray<number>, typeof fromSet>();
 *
 * assertEqual(
 *   arrayFrom(3, (i) => i * 10),
 *   [0, 10, 20],
 * );
 *
 * const existing: ReadonlyArray<number> = [1, 2, 3];
 * assertSame(arrayFrom(existing), existing);
 * ```
 *
 * Unlike `Array.from`, there's no map parameter for iterables — use
 * {@link mapArray} instead, or
 * {@link https://web.dev/blog/baseline-iterator-helpers | iterator helpers}
 * directly on iterables.
 *
 * @group Constructors
 */
export function arrayFrom<T>(iterable: Iterable<T>): ReadonlyArray<T>;
/** From length and map function. */
export function arrayFrom<T>(
  length: number,
  map: (index: number) => T,
): ReadonlyArray<T>;
export function arrayFrom<T>(
  iterableOrLength: Iterable<T> | number,
  map?: (index: number) => T,
): ReadonlyArray<T> {
  if (typeof iterableOrLength === "number") {
    return Array.from({ length: iterableOrLength }, (_, i) =>
      (map as (index: number) => T)(i),
    );
  }
  return Array.isArray(iterableOrLength)
    ? (iterableOrLength as ReadonlyArray<T>)
    : [...iterableOrLength];
}

/**
 * Better `Array.fromAsync`.
 *
 * Returns a readonly array and awaits promised items from sync or async
 * iterables.
 *
 * ### Awaiting sync and async iterables
 *
 * ```ts
 * import { assertEqual, assertType, arrayFromAsync } from "@evolu/common";
 *
 * const fromIterable = await arrayFromAsync([
 *   Promise.resolve(1),
 *   Promise.resolve(2),
 *   Promise.resolve(3),
 * ]);
 * assertEqual(fromIterable, [1, 2, 3]);
 *
 * const fromAsyncIterable = await arrayFromAsync(
 *   (async function* (): AsyncGenerator<number> {
 *     await Promise.resolve();
 *     yield 1;
 *     yield 2;
 *   })(),
 * );
 * assertEqual(fromAsyncIterable, [1, 2]);
 * assertType<ReadonlyArray<number>, typeof fromAsyncIterable>();
 * ```
 *
 * Unlike `Array.fromAsync`, there's no map parameter — map the result with
 * {@link mapArray} or use
 * {@link https://web.dev/blog/baseline-iterator-helpers | iterator helpers}
 * directly on iterables.
 *
 * @group Constructors
 */
export const arrayFromAsync = async <T>(
  iterable: AsyncIterable<T> | Iterable<T | PromiseLike<T>>,
): Promise<ReadonlyArray<T>> => Array.fromAsync(iterable);

/**
 * Checks if an array is non-empty and narrows its type to {@link NonEmptyArray}
 * or {@link NonEmptyReadonlyArray} based on the input.
 *
 * To check if an array is empty, use `if (!isNonEmptyArray(arr))` — using the
 * negated guard is better than `.length === 0` for early returns because
 * TypeScript narrows the type after the check.
 *
 * ### Narrowing mutable and readonly arrays
 *
 * ```ts
 * import {
 *   assertEqual,
 *   assertType,
 *   firstInArray,
 *   isNonEmptyArray,
 *   type NonEmptyArray,
 *   type NonEmptyReadonlyArray,
 * } from "@evolu/common";
 *
 * const mutable: Array<number> = [1, 2, 3];
 * const readonly: ReadonlyArray<number> = [1, 2, 3];
 * if (!isNonEmptyArray(mutable) || !isNonEmptyArray(readonly)) {
 *   throw new Error("Expected values");
 * }
 *
 * assertType<NonEmptyArray<number>, typeof mutable>();
 * assertType<NonEmptyReadonlyArray<number>, typeof readonly>();
 * assertEqual(firstInArray(readonly), 1);
 * ```
 *
 * @group Types
 */
export function isNonEmptyArray<T>(array: Array<T>): array is NonEmptyArray<T>;
/** Readonly array overload. */
export function isNonEmptyArray<T>(
  array: ReadonlyArray<T>,
): array is NonEmptyReadonlyArray<T>;
export function isNonEmptyArray<T>(
  array: ReadonlyArray<T>,
): array is NonEmptyReadonlyArray<T> {
  return array.length > 0;
}

/**
 * Appends an item to an array, returning a new non-empty readonly array.
 *
 * ### Appending a value
 *
 * ```ts
 * import {
 *   assertEqual,
 *   assertType,
 *   appendToArray,
 *   type NonEmptyReadonlyArray,
 * } from "@evolu/common";
 *
 * const values = appendToArray([1, 2, 3], 4);
 * assertEqual(values, [1, 2, 3, 4]);
 * assertType<NonEmptyReadonlyArray<number>, typeof values>();
 * ```
 *
 * @group Transformations
 */
export const appendToArray = <T>(
  array: ReadonlyArray<T>,
  item: T,
): NonEmptyReadonlyArray<T> =>
  // The appended item guarantees non-emptiness, but TypeScript cannot infer a
  // leading element after spreading a possibly empty array.
  [...array, item] as ReadonlyArray<T> as NonEmptyReadonlyArray<T>;

/**
 * Prepends an item to an array, returning a new non-empty readonly array.
 *
 * ### Prepending a value
 *
 * ```ts
 * import {
 *   assertEqual,
 *   assertType,
 *   prependToArray,
 *   type NonEmptyReadonlyArray,
 * } from "@evolu/common";
 *
 * const values = prependToArray([2, 3], 1);
 * assertEqual(values, [1, 2, 3]);
 * assertType<NonEmptyReadonlyArray<number>, typeof values>();
 * ```
 *
 * @group Transformations
 */
export const prependToArray = <T>(
  array: ReadonlyArray<T>,
  item: T,
): NonEmptyReadonlyArray<T> => [item, ...array];

/**
 * Maps an array using a mapper function, returning a new readonly array.
 *
 * Preserves non-empty type.
 *
 * ### Mapping with indexes while preserving non-emptiness
 *
 * ```ts
 * import {
 *   assertEqual,
 *   assertType,
 *   mapArray,
 *   type NonEmptyReadonlyArray,
 * } from "@evolu/common";
 *
 * const values: ReadonlyArray<number> = [1, 2, 3];
 * const indexed = mapArray(values, (value, index) => value + index);
 * assertEqual(indexed, [1, 3, 5]);
 * assertType<ReadonlyArray<number>, typeof indexed>();
 *
 * const nonEmpty: NonEmptyReadonlyArray<number> = [1, 2, 3];
 * const doubled = mapArray(nonEmpty, (x) => x * 2);
 * assertType<NonEmptyReadonlyArray<number>, typeof doubled>();
 * ```
 *
 * The mapper receives `(item, index, array)`, matching native `Array.map`.
 *
 * @group Transformations
 */
export function mapArray<T, U>(
  array: NonEmptyReadonlyArray<T>,
  mapper: (item: T, index: number, array: ReadonlyArray<T>) => U,
): NonEmptyReadonlyArray<U>;
/** Possibly empty array. */
export function mapArray<T, U>(
  array: ReadonlyArray<T>,
  mapper: (item: T, index: number, array: ReadonlyArray<T>) => U,
): ReadonlyArray<U>;
export function mapArray<T, U>(
  array: ReadonlyArray<T>,
  mapper: (item: T, index: number, array: ReadonlyArray<T>) => U,
): ReadonlyArray<U> {
  return array.map(mapper);
}

/**
 * Maps each element to an array and flattens the result.
 *
 * Preserves non-empty type when the input is non-empty and the mapper returns
 * non-empty arrays. When called without a mapper, flattens nested arrays using
 * {@link identity}.
 *
 * ### Flattening and expanding values
 *
 * ```ts
 * import {
 *   assertEqual,
 *   assertType,
 *   flatMapArray,
 *   type NonEmptyReadonlyArray,
 * } from "@evolu/common";
 *
 * const flattened = flatMapArray([
 *   [1, 2],
 *   [3, 4],
 * ]);
 * const values: NonEmptyReadonlyArray<number> = [1, 2, 3];
 * const expanded = flatMapArray(
 *   values,
 *   (value, index): NonEmptyReadonlyArray<number> => [value, index],
 * );
 * assertEqual(flattened, [1, 2, 3, 4]);
 * assertType<NonEmptyReadonlyArray<number>, typeof expanded>();
 * assertEqual(expanded, [1, 0, 2, 1, 3, 2]);
 * ```
 *
 * ### Filter and map in one pass
 *
 * Return `[]` to filter out, `[value]` to keep:
 *
 * ```ts
 * import { assertEqual, err, flatMapArray, ok } from "@evolu/common";
 *
 * const validate = (value: number) =>
 *   value > 0 ? ok(value) : err(`${value} is not positive`);
 * const fields = [1, -2, 3, -4];
 * const errors = flatMapArray(fields, (f) => {
 *   const result = validate(f);
 *   return result.ok ? [] : [result.error];
 * });
 * assertEqual(errors, ["-2 is not positive", "-4 is not positive"]);
 * ```
 *
 * The mapper receives `(item, index, array)`, matching native `Array.flatMap`.
 *
 * @group Transformations
 */
export function flatMapArray<T>(
  array: NonEmptyReadonlyArray<NonEmptyReadonlyArray<T>>,
): NonEmptyReadonlyArray<T>;
/** Possibly empty nested arrays. */
export function flatMapArray<T>(
  array: ReadonlyArray<ReadonlyArray<T>>,
): ReadonlyArray<T>;
/** Non-empty with mapper returning non-empty. */
export function flatMapArray<T, U>(
  array: NonEmptyReadonlyArray<T>,
  mapper: (
    item: T,
    index: number,
    array: ReadonlyArray<T>,
  ) => NonEmptyReadonlyArray<U>,
): NonEmptyReadonlyArray<U>;
/** With mapper function. */
export function flatMapArray<T, U>(
  array: ReadonlyArray<T>,
  mapper: (item: T, index: number, array: ReadonlyArray<T>) => ReadonlyArray<U>,
): ReadonlyArray<U>;
export function flatMapArray<T, U>(
  array: ReadonlyArray<T>,
  mapper: (
    item: T,
    index: number,
    array: ReadonlyArray<T>,
  ) => ReadonlyArray<U> = identity as (
    item: T,
    index: number,
    array: ReadonlyArray<T>,
  ) => ReadonlyArray<U>,
): ReadonlyArray<U> {
  return array.flatMap(mapper);
}

/**
 * Concatenates two arrays, returning a new readonly array.
 *
 * Returns a non-empty array when at least one input is non-empty.
 *
 * ### Concatenating non-empty inputs
 *
 * ```ts
 * import {
 *   assertEqual,
 *   assertType,
 *   concatArrays,
 *   type NonEmptyReadonlyArray,
 * } from "@evolu/common";
 *
 * const nonEmpty: NonEmptyReadonlyArray<number> = [1];
 * const joined = concatArrays([1, 2], [3, 4]);
 * const fromLeft = concatArrays(nonEmpty, []);
 * const fromRight = concatArrays([], nonEmpty);
 *
 * assertEqual(joined, [1, 2, 3, 4]);
 * assertType<NonEmptyReadonlyArray<number>, typeof fromLeft>();
 * assertType<NonEmptyReadonlyArray<number>, typeof fromRight>();
 * ```
 *
 * @group Transformations
 */
export function concatArrays<T>(
  first: NonEmptyReadonlyArray<T>,
  second: ReadonlyArray<T>,
): NonEmptyReadonlyArray<T>;
/** Second non-empty. */
export function concatArrays<T>(
  first: ReadonlyArray<T>,
  second: NonEmptyReadonlyArray<T>,
): NonEmptyReadonlyArray<T>;
/** Both possibly empty. */
export function concatArrays<T>(
  first: ReadonlyArray<T>,
  second: ReadonlyArray<T>,
): ReadonlyArray<T>;
export function concatArrays<T>(
  first: ReadonlyArray<T>,
  second: ReadonlyArray<T>,
): ReadonlyArray<T> {
  return [...first, ...second];
}

/**
 * Filters an array using a predicate or refinement function, returning a new
 * readonly array.
 *
 * When used with a refinement function (with `value is Type` syntax),
 * TypeScript will narrow the result type to the narrowed type, making it useful
 * for filtering with Evolu Types like `PositiveInt.is`.
 *
 * ### With predicate
 *
 * ```ts
 * import { assertEqual, filterArray } from "@evolu/common";
 *
 * const evens = filterArray([1, 2, 3, 4, 5], (x) => x % 2 === 0);
 * assertEqual(evens, [2, 4]);
 * ```
 *
 * ### With refinement
 *
 * ```ts
 * import {
 *   assertEqual,
 *   assertType,
 *   filterArray,
 *   NonEmptyTrimmedString,
 *   PositiveInt,
 * } from "@evolu/common";
 *
 * const mixed: ReadonlyArray<NonEmptyTrimmedString | PositiveInt> = [
 *   NonEmptyTrimmedString.orThrow("hello"),
 *   PositiveInt.orThrow(42),
 * ];
 * const positiveInts = filterArray(mixed, PositiveInt.is);
 * assertEqual(positiveInts, [42]);
 * assertType<ReadonlyArray<PositiveInt>, typeof positiveInts>();
 * ```
 *
 * The predicate receives `(item, index, array)`, matching native
 * `Array.filter`.
 *
 * @group Transformations
 */
export function filterArray<T, S extends T>(
  array: ReadonlyArray<T>,
  refinement: (item: T, index: number, array: ReadonlyArray<T>) => item is S,
): ReadonlyArray<S>;
/** With predicate. */
export function filterArray<T>(
  array: ReadonlyArray<T>,
  predicate: (item: T, index: number, array: ReadonlyArray<T>) => boolean,
): ReadonlyArray<T>;
export function filterArray<T>(
  array: ReadonlyArray<T>,
  predicate: (item: T, index: number, array: ReadonlyArray<T>) => boolean,
): ReadonlyArray<T> {
  return array.filter(predicate);
}

/**
 * Returns a new readonly array with duplicate items removed. Items are compared
 * using `Set` equality (SameValueZero): primitives by value, and objects and
 * arrays by reference. If `by` is provided, it derives the comparison key.
 *
 * Preserves non-empty type.
 *
 * ### Deduplicating by value or key
 *
 * ```ts
 * import {
 *   assertEqual,
 *   assertType,
 *   dedupeArray,
 *   type NonEmptyReadonlyArray,
 * } from "@evolu/common";
 *
 * const numbers = dedupeArray([1, 2, 1, 3, 2]);
 * const people = dedupeArray(
 *   [
 *     { id: 1, name: "Alice" },
 *     { id: 2, name: "Bob" },
 *     { id: 1, name: "Alice 2" },
 *   ],
 *   (item) => item.id,
 * );
 * assertType<NonEmptyReadonlyArray<number>, typeof numbers>();
 * assertEqual(numbers, [1, 2, 3]);
 * assertEqual(people, [
 *   { id: 1, name: "Alice" },
 *   { id: 2, name: "Bob" },
 * ]);
 * ```
 *
 * @group Transformations
 */
export function dedupeArray<T>(
  array: NonEmptyReadonlyArray<T>,
  by?: (item: T) => unknown,
): NonEmptyReadonlyArray<T>;
/** Possibly empty array. */
export function dedupeArray<T>(
  array: ReadonlyArray<T>,
  by?: (item: T) => unknown,
): ReadonlyArray<T>;
export function dedupeArray<T>(
  array: ReadonlyArray<T>,
  by?: (item: T) => unknown,
): ReadonlyArray<T> {
  if (by == null) {
    return Array.from(new Set(array));
  }

  const seen = new Set<unknown>();
  return array.filter((item) => {
    const key = by(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Partitions an array into two readonly arrays based on a predicate or
 * refinement function.
 *
 * Returns a tuple where the first array contains elements that satisfy the
 * predicate, and the second array contains elements that do not.
 *
 * When used with a refinement function (with `value is Type` syntax),
 * TypeScript will narrow the first array to the narrowed type, making it useful
 * for filtering with Evolu Types like `PositiveInt.is`.
 *
 * ### With predicate
 *
 * ```ts
 * import { assertEqual, partitionArray } from "@evolu/common";
 *
 * const [evens, odds] = partitionArray(
 *   [1, 2, 3, 4, 5],
 *   (x) => x % 2 === 0,
 * );
 * assertEqual(evens, [2, 4]);
 * assertEqual(odds, [1, 3, 5]);
 * ```
 *
 * ### With refinement
 *
 * ```ts
 * import {
 *   assertEqual,
 *   assertType,
 *   NonEmptyTrimmedString,
 *   partitionArray,
 *   PositiveInt,
 * } from "@evolu/common";
 *
 * const mixed: ReadonlyArray<NonEmptyTrimmedString | PositiveInt> = [
 *   NonEmptyTrimmedString.orThrow("hello"),
 *   PositiveInt.orThrow(42),
 * ];
 * const [positiveInts, strings] = partitionArray(mixed, PositiveInt.is);
 * assertEqual(positiveInts, [42]);
 * assertType<ReadonlyArray<PositiveInt>, typeof positiveInts>();
 * assertType<ReadonlyArray<NonEmptyTrimmedString>, typeof strings>();
 * ```
 *
 * The predicate receives `(item, index, array)`.
 *
 * @group Transformations
 */
export function partitionArray<T, S extends T>(
  array: ReadonlyArray<T>,
  refinement: (item: T, index: number, array: ReadonlyArray<T>) => item is S,
): readonly [ReadonlyArray<S>, ReadonlyArray<Exclude<T, S>>];
/** With predicate. */
export function partitionArray<T>(
  array: ReadonlyArray<T>,
  predicate: (item: T, index: number, array: ReadonlyArray<T>) => boolean,
): readonly [ReadonlyArray<T>, ReadonlyArray<T>];
export function partitionArray<T>(
  array: ReadonlyArray<T>,
  predicate: (item: T, index: number, array: ReadonlyArray<T>) => boolean,
): readonly [ReadonlyArray<T>, ReadonlyArray<T>] {
  const trueArray: Array<T> = [];
  const falseArray: Array<T> = [];

  for (let i = 0; i < array.length; i++) {
    if (predicate(array[i], i, array)) {
      trueArray.push(array[i]);
    } else {
      falseArray.push(array[i]);
    }
  }

  return [trueArray, falseArray];
}

/**
 * Returns a new sorted readonly array.
 *
 * Wraps native `toSorted`. Preserves non-empty type.
 *
 * ### Sorting without mutation
 *
 * ```ts
 * import {
 *   assertEqual,
 *   assertType,
 *   sortArray,
 *   type NonEmptyReadonlyArray,
 * } from "@evolu/common";
 *
 * const values: NonEmptyReadonlyArray<number> = [3, 1, 2];
 * const sorted = sortArray(values, (a, b) => a - b);
 * assertEqual(sorted, [1, 2, 3]);
 * assertType<NonEmptyReadonlyArray<number>, typeof sorted>();
 * ```
 *
 * @group Transformations
 */
export function sortArray<T>(
  array: NonEmptyReadonlyArray<T>,
  compareFn?: (a: T, b: T) => number,
): NonEmptyReadonlyArray<T>;
/** Possibly empty array. */
export function sortArray<T>(
  array: ReadonlyArray<T>,
  compareFn?: (a: T, b: T) => number,
): ReadonlyArray<T>;
export function sortArray<T>(
  array: ReadonlyArray<T>,
  compareFn?: (a: T, b: T) => number,
): ReadonlyArray<T> {
  return array.toSorted(compareFn);
}

/**
 * Returns a new reversed readonly array.
 *
 * Wraps native `toReversed`. Preserves non-empty type.
 *
 * ### Reversing without mutation
 *
 * ```ts
 * import {
 *   assertEqual,
 *   assertType,
 *   reverseArray,
 *   type NonEmptyReadonlyArray,
 * } from "@evolu/common";
 *
 * const values: NonEmptyReadonlyArray<number> = [1, 2, 3];
 * const reversed = reverseArray(values);
 * assertEqual(reversed, [3, 2, 1]);
 * assertType<NonEmptyReadonlyArray<number>, typeof reversed>();
 * ```
 *
 * @group Transformations
 */
export function reverseArray<T>(
  array: NonEmptyReadonlyArray<T>,
): NonEmptyReadonlyArray<T>;
/** Possibly empty array. */
export function reverseArray<T>(array: ReadonlyArray<T>): ReadonlyArray<T>;
export function reverseArray<T>(array: ReadonlyArray<T>): ReadonlyArray<T> {
  return array.toReversed();
}

/**
 * Returns a new readonly array with elements removed and/or replaced.
 *
 * Wraps native `toSpliced`.
 *
 * ### Removing and replacing values
 *
 * ```ts
 * import { assertEqual, spliceArray } from "@evolu/common";
 *
 * const values: ReadonlyArray<number> = [1, 2, 3, 4];
 * assertEqual(spliceArray(values, 1, 2), [1, 4]);
 * assertEqual(spliceArray([1, 2, 3], 1, 1, 10, 11), [1, 10, 11, 3]);
 * assertEqual(values, [1, 2, 3, 4]);
 * ```
 *
 * @group Transformations
 */
export const spliceArray = <T>(
  array: ReadonlyArray<T>,
  start: number,
  deleteCount: number,
  ...items: ReadonlyArray<T>
): ReadonlyArray<T> => array.toSpliced(start, deleteCount, ...items);

/**
 * Extracts element types from a tuple of arrays, producing a tuple type.
 *
 * @group Types
 */
export type ZipArrayResult<T extends ReadonlyArray<ReadonlyArray<unknown>>> = {
  [K in keyof T]: T[K] extends ReadonlyArray<infer U> ? U : never;
};

/**
 * Combines multiple arrays into an array of tuples.
 *
 * Uses "shortest" mode — stops at the shortest input array. Preserves non-empty
 * type when all input arrays are non-empty. See the
 * {@link https://github.com/tc39/proposal-array-zip | TC39 Array.zip proposal}
 * for the pattern this follows.
 *
 * ### Zipping to the shortest input
 *
 * ```ts
 * import {
 *   assertEqual,
 *   assertType,
 *   zipArray,
 *   type NonEmptyReadonlyArray,
 * } from "@evolu/common";
 *
 * const pairs = zipArray([
 *   [1, 2, 3],
 *   ["a", "b", "c"],
 * ]);
 * assertEqual(pairs, [
 *   [1, "a"],
 *   [2, "b"],
 *   [3, "c"],
 * ]);
 * assertEqual(
 *   zipArray([
 *     [1, 2],
 *     ["a", "b", "c"],
 *     [true, false],
 *   ]),
 *   [
 *     [1, "a", true],
 *     [2, "b", false],
 *   ],
 * );
 * assertType<
 *   NonEmptyReadonlyArray<Readonly<[number, string]>>,
 *   typeof pairs
 * >();
 * ```
 *
 * @group Transformations
 */
export function zipArray<
  T extends NonEmptyReadonlyArray<NonEmptyReadonlyArray<unknown>>,
>(arrays: T): NonEmptyReadonlyArray<Readonly<ZipArrayResult<T>>>;
/** Possibly empty arrays. */
export function zipArray<const T extends ReadonlyArray<ReadonlyArray<unknown>>>(
  arrays: T,
): ReadonlyArray<Readonly<ZipArrayResult<T>>>;
export function zipArray<T extends ReadonlyArray<ReadonlyArray<unknown>>>(
  arrays: T,
): ReadonlyArray<Readonly<ZipArrayResult<T>>> {
  if (arrays.length === 0) return emptyArray;

  const minLength = Math.min(...mapArray(arrays, (a) => a.length));
  const result = createMutableArray<unknown>(minLength);

  for (let i = 0; i < minLength; i++) {
    result[i] = mapArray(arrays, (a) => a[i]);
  }

  return result as ReadonlyArray<Readonly<ZipArrayResult<T>>>;
}

/**
 * Returns the first element of a non-empty array.
 *
 * ### Reading the first value
 *
 * ```ts
 * import { assertEqual, firstInArray } from "@evolu/common";
 *
 * assertEqual(firstInArray(["a", "b", "c"]), "a");
 * ```
 *
 * @group Accessors
 */
export const firstInArray = <T>(array: NonEmptyReadonlyArray<T>): T => array[0];

/**
 * Returns the last element of a non-empty array.
 *
 * ### Reading the last value
 *
 * ```ts
 * import { assertEqual, lastInArray } from "@evolu/common";
 *
 * assertEqual(lastInArray(["a", "b", "c"]), "c");
 * ```
 *
 * @group Accessors
 */
export const lastInArray = <T>(array: NonEmptyReadonlyArray<T>): T =>
  array[array.length - 1];
