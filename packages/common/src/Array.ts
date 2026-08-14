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
 * const sortScores = (arr: number[]) => arr.sort((a, b) => a - b);
 *
 * const scores = [3, 1, 2];
 * const leaderboard = sortScores(scores);
 * expect(leaderboard).toEqual([1, 2, 3]);
 * expect(scores).toEqual([1, 2, 3]);
 * expect(leaderboard).toBe(scores);
 * ```
 *
 * Imagine every method doing that.
 *
 * On a `ReadonlyArray`, `.sort()` doesn't even exist. Use {@link sortArray}
 * instead:
 *
 * ```ts
 * import { sortArray } from "@evolu/common";
 *
 * const sortScores = (arr: ReadonlyArray<number>) =>
 *   sortArray(arr, (a, b) => a - b);
 *
 * const scores: ReadonlyArray<number> = [3, 1, 2];
 * const leaderboard = sortScores(scores);
 * expect(leaderboard).toEqual([1, 2, 3]);
 * expect(scores).toEqual([3, 1, 2]);
 * expect(leaderboard).not.toBe(scores);
 * ```
 *
 * Even better, require a {@link NonEmptyReadonlyArray} — there's nothing to sort
 * if the array is empty anyway:
 *
 * ```ts
 * import { sortArray, type NonEmptyReadonlyArray } from "@evolu/common";
 *
 * const sortScores = (arr: NonEmptyReadonlyArray<number>) =>
 *   sortArray(arr, (a, b) => a - b);
 *
 * const leaderboard = sortScores([3, 1, 2]);
 * expect(leaderboard).toEqual([1, 2, 3]);
 * expectTypeOf(leaderboard).toEqualTypeOf<NonEmptyReadonlyArray<number>>();
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
 * import { type NonEmptyReadonlyArray } from "@evolu/common";
 *
 * const valid: NonEmptyReadonlyArray<number> = [1, 2, 3];
 * // @ts-expect-error An empty array is not non-empty.
 * const invalid: NonEmptyReadonlyArray<number> = [];
 *
 * expect(valid.find((value) => value === 2)).toBe(2);
 * ```
 *
 * ## Composition
 *
 * All array helpers use a data-first style (the array is the first argument)
 * because it's natural for single operations:
 *
 * ```ts
 * import { mapArray } from "@evolu/common";
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
 * expect(timestamps).toEqual([10, 20]);
 * ```
 *
 * Data-first style also reads well for a few operations, often fitting on a
 * line:
 *
 * ```ts
 * import {
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
 * expect(cheapest).toBe(10);
 *
 * const users = [{ name: "Ada" }, { name: "Linus" }, { name: "Ada" }];
 * const uniqueNames = dedupeArray(mapArray(users, (u) => u.name));
 * expect(uniqueNames).toEqual(["Ada", "Linus"]);
 *
 * const jobs = [
 *   { id: 1, done: false },
 *   { id: 2, done: true },
 * ];
 * const completedJobs = filterArray(jobs, (job) => job.done);
 * if (!isNonEmptyArray(completedJobs)) throw new Error("Expected a job");
 * const latestDone = lastInArray(completedJobs);
 *
 * expect(latestDone).toEqual({ id: 2, done: true });
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
 * import { arrayFrom } from "@evolu/common";
 *
 * const fromSet = arrayFrom(new Set([1, 2, 3]));
 * expect(fromSet).toEqual([1, 2, 3]);
 * expectTypeOf(fromSet).toEqualTypeOf<ReadonlyArray<number>>();
 *
 * expect(arrayFrom(3, (i) => i * 10)).toEqual([0, 10, 20]);
 *
 * const existing: ReadonlyArray<number> = [1, 2, 3];
 * expect(arrayFrom(existing)).toBe(existing);
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
 * import { arrayFromAsync } from "@evolu/common";
 *
 * const fromIterable = await arrayFromAsync(new Set([1, 2, 3]));
 * expect(fromIterable).toEqual([1, 2, 3]);
 *
 * const fromAsyncIterable = await arrayFromAsync(
 *   (async function* () {
 *     yield Promise.resolve(1);
 *     yield Promise.resolve(2);
 *   })(),
 * );
 * expect(fromAsyncIterable).toEqual([1, 2]);
 * expectTypeOf(fromAsyncIterable).toEqualTypeOf<ReadonlyArray<number>>();
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
 * expectTypeOf(mutable).toEqualTypeOf<NonEmptyArray<number>>();
 * expectTypeOf(readonly).toEqualTypeOf<NonEmptyReadonlyArray<number>>();
 * expect(firstInArray(readonly)).toBe(1);
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
 *   appendToArray,
 *   type NonEmptyReadonlyArray,
 * } from "@evolu/common";
 *
 * const values = appendToArray([1, 2, 3], 4);
 * expect(values).toEqual([1, 2, 3, 4]);
 * expectTypeOf(values).toEqualTypeOf<NonEmptyReadonlyArray<number>>();
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
 *   prependToArray,
 *   type NonEmptyReadonlyArray,
 * } from "@evolu/common";
 *
 * const values = prependToArray([2, 3], 1);
 * expect(values).toEqual([1, 2, 3]);
 * expectTypeOf(values).toEqualTypeOf<NonEmptyReadonlyArray<number>>();
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
 * import { mapArray, type NonEmptyReadonlyArray } from "@evolu/common";
 *
 * const values: ReadonlyArray<number> = [1, 2, 3];
 * const indexed = mapArray(values, (value, index) => value + index);
 * expect(indexed).toEqual([1, 3, 5]);
 * expectTypeOf(indexed).toEqualTypeOf<ReadonlyArray<number>>();
 *
 * const nonEmpty: NonEmptyReadonlyArray<number> = [1, 2, 3];
 * expectTypeOf(mapArray(nonEmpty, (x) => x * 2)).toEqualTypeOf<
 *   NonEmptyReadonlyArray<number>
 * >();
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
 * import { flatMapArray, type NonEmptyReadonlyArray } from "@evolu/common";
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
 * expect(flattened).toEqual([1, 2, 3, 4]);
 * expectTypeOf(expanded).toEqualTypeOf<NonEmptyReadonlyArray<number>>();
 * expect(expanded).toEqual([1, 0, 2, 1, 3, 2]);
 * ```
 *
 * ### Filter and map in one pass
 *
 * Return `[]` to filter out, `[value]` to keep:
 *
 * ```ts
 * import { err, flatMapArray, ok } from "@evolu/common";
 *
 * const validate = (value: number) =>
 *   value > 0 ? ok(value) : err(`${value} is not positive`);
 * const fields = [1, -2, 3, -4];
 * const errors = flatMapArray(fields, (f) => {
 *   const result = validate(f);
 *   return result.ok ? [] : [result.error];
 * });
 * expect(errors).toEqual(["-2 is not positive", "-4 is not positive"]);
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
 * import { concatArrays, type NonEmptyReadonlyArray } from "@evolu/common";
 *
 * const nonEmpty: NonEmptyReadonlyArray<number> = [1];
 * const joined = concatArrays([1, 2], [3, 4]);
 * const fromLeft = concatArrays(nonEmpty, []);
 * const fromRight = concatArrays([], nonEmpty);
 *
 * expect(joined).toEqual([1, 2, 3, 4]);
 * expectTypeOf(fromLeft).toEqualTypeOf<NonEmptyReadonlyArray<number>>();
 * expectTypeOf(fromRight).toEqualTypeOf<NonEmptyReadonlyArray<number>>();
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
 * import { filterArray } from "@evolu/common";
 *
 * const evens = filterArray([1, 2, 3, 4, 5], (x) => x % 2 === 0);
 * expect(evens).toEqual([2, 4]);
 * ```
 *
 * ### With refinement
 *
 * ```ts
 * import {
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
 * expect(positiveInts).toEqual([42]);
 * expectTypeOf(positiveInts).toEqualTypeOf<ReadonlyArray<PositiveInt>>();
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
 * import { dedupeArray, type NonEmptyReadonlyArray } from "@evolu/common";
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
 * expectTypeOf(numbers).toEqualTypeOf<NonEmptyReadonlyArray<number>>();
 * expect(numbers).toEqual([1, 2, 3]);
 * expect(people).toEqual([
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
 * import { partitionArray } from "@evolu/common";
 *
 * const [evens, odds] = partitionArray(
 *   [1, 2, 3, 4, 5],
 *   (x) => x % 2 === 0,
 * );
 * expect(evens).toEqual([2, 4]);
 * expect(odds).toEqual([1, 3, 5]);
 * ```
 *
 * ### With refinement
 *
 * ```ts
 * import {
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
 * expect(positiveInts).toEqual([42]);
 * expectTypeOf(positiveInts).toEqualTypeOf<ReadonlyArray<PositiveInt>>();
 * expectTypeOf(strings).toEqualTypeOf<
 *   ReadonlyArray<NonEmptyTrimmedString>
 * >();
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
 * import { sortArray, type NonEmptyReadonlyArray } from "@evolu/common";
 *
 * const values: NonEmptyReadonlyArray<number> = [3, 1, 2];
 * const sorted = sortArray(values, (a, b) => a - b);
 * expect(sorted).toEqual([1, 2, 3]);
 * expectTypeOf(sorted).toEqualTypeOf<NonEmptyReadonlyArray<number>>();
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
 * import { reverseArray, type NonEmptyReadonlyArray } from "@evolu/common";
 *
 * const values: NonEmptyReadonlyArray<number> = [1, 2, 3];
 * const reversed = reverseArray(values);
 * expect(reversed).toEqual([3, 2, 1]);
 * expectTypeOf(reversed).toEqualTypeOf<NonEmptyReadonlyArray<number>>();
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
 * import { spliceArray } from "@evolu/common";
 *
 * const values: ReadonlyArray<number> = [1, 2, 3, 4];
 * expect(spliceArray(values, 1, 2)).toEqual([1, 4]);
 * expect(spliceArray([1, 2, 3], 1, 1, 10, 11)).toEqual([1, 10, 11, 3]);
 * expect(values).toEqual([1, 2, 3, 4]);
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
 * import { zipArray, type NonEmptyReadonlyArray } from "@evolu/common";
 *
 * const pairs = zipArray([
 *   [1, 2, 3],
 *   ["a", "b", "c"],
 * ]);
 * expect(pairs).toEqual([
 *   [1, "a"],
 *   [2, "b"],
 *   [3, "c"],
 * ]);
 * expect(
 *   zipArray([
 *     [1, 2],
 *     ["a", "b", "c"],
 *     [true, false],
 *   ]),
 * ).toEqual([
 *   [1, "a", true],
 *   [2, "b", false],
 * ]);
 * expectTypeOf(pairs).toEqualTypeOf<
 *   NonEmptyReadonlyArray<Readonly<[number, string]>>
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
  const result = new Array<unknown>(minLength);

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
 * import { firstInArray } from "@evolu/common";
 *
 * expect(firstInArray(["a", "b", "c"])).toBe("a");
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
 * import { lastInArray } from "@evolu/common";
 *
 * expect(lastInArray(["a", "b", "c"])).toBe("c");
 * ```
 *
 * @group Accessors
 */
export const lastInArray = <T>(array: NonEmptyReadonlyArray<T>): T =>
  array[array.length - 1];
