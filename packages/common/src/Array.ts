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
 * leaderboard; // [1, 2, 3]
 * scores; // [1, 2, 3] — original order lost!
 * ```
 *
 * Imagine every methods doing that.
 *
 * On a `ReadonlyArray`, `.sort()` doesn't even exist. Use {@link sortArray}
 * instead:
 *
 * ```ts
 * const sortScores = (arr: ReadonlyArray<number>) =>
 *   sortArray(arr, (a, b) => a - b);
 *
 * const scores: ReadonlyArray<number> = [3, 1, 2];
 * const leaderboard = sortScores(scores);
 * leaderboard; // [1, 2, 3]
 * scores; // [3, 1, 2] — safe!
 * ```
 *
 * Even better, require a {@link NonEmptyReadonlyArray} — there's nothing to sort
 * if the array is empty anyway:
 *
 * ```ts
 * const sortScores = (arr: NonEmptyReadonlyArray<number>) =>
 *   sortArray(arr, (a, b) => a - b);
 * ```
 *
 * Sorting an empty array isn't expensive, but functions can have side effects
 * like database queries or network requests. Using non-empty arrays whenever
 * possible is a good convention.
 *
 * For performance-critical cases where mutation is needed, Evolu provides
 * {@link shiftFromArray} and {@link popFromArray} — but only because they improve
 * type safety by returning a guaranteed `T` rather than an optional value.
 *
 * ### Example
 *
 * ```ts
 * // Types - compile-time guarantee of at least one element
 * const _valid: NonEmptyReadonlyArray<number> = [1, 2, 3];
 * // ts-expect-error - empty array is not a valid NonEmptyReadonlyArray
 * const _invalid: NonEmptyReadonlyArray<number> = [];
 *
 * // Type guards
 * const arr: ReadonlyArray<number> = [1, 2, 3];
 * if (isNonEmptyArray(arr)) {
 *   firstInArray(arr);
 * }
 *
 * // Transformations
 * const appended = appendToArray([1, 2, 3], 4); // [1, 2, 3, 4]
 * const prepended = prependToArray([2, 3], 1); // [1, 2, 3]
 * const readonly: ReadonlyArray<number> = [1, 2, 3];
 * const mapped = mapArray(readonly, (x) => x * 2); // [2, 4, 6]
 * const filtered = filterArray(readonly, (x) => x > 1); // [2, 3]
 * const deduped = dedupeArray([1, 2, 1, 3, 2]); // [1, 2, 3]
 * const [evens, odds] = partitionArray(
 *   [1, 2, 3, 4, 5],
 *   (x) => x % 2 === 0,
 * );
 *
 * // Accessors
 * const first = firstInArray(["a", "b", "c"]); // "a"
 * const last = lastInArray(["a", "b", "c"]); // "c"
 *
 * // Mutations
 * const mutable: NonEmptyArray<number> = [1, 2, 3];
 * shiftFromArray(mutable); // 1 (guaranteed to exist)
 * mutable; // [2, 3]
 * ```
 *
 * ## Composition
 *
 * All array helpers use a data-first style (the array is the first argument)
 * because it's natural for single operations:
 *
 * ```ts
 * const timestamps = mapArray(messages, (m) => m.timestamp);
 * ```
 *
 * Data-first style also reads well for a few operations, often fitting on a
 * line:
 *
 * ```ts
 * const cheapest = firstInArray(sortArray(prices, orderNumber));
 * const uniqueNames = dedupeArray(mapArray(users, (u) => u.name));
 * const latestDone = lastInArray(filterArray(jobs, isCompletedJob));
 * ```
 *
 * For more operations, extract to a well-named function like
 * `getOldestActiveUser` or `getUniqueActiveEmails`.
 *
 * Some libraries provide dual APIs with data-last for pipe-based composition.
 * Evolu prefers a simple API (in Latin, simplex means "one") — no need to
 * choose between seemingly equivalent options, and pipes would not help anyway;
 * well-named functions communicate intent better.
 *
 * @module
 */

import { identity } from "./Function.js";
import type { PredicateWithIndex, RefinementWithIndex } from "./Types.js";

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
 * An empty readonly array.
 *
 * Use as a default or initial value to avoid allocating new empty arrays.
 *
 * @group Constants
 */
export const emptyArray: ReadonlyArray<never> = [];

/**
 * Creates a readonly array of the specified length using a function to produce
 * each element.
 *
 * ### Example
 *
 * ```ts
 * // Create array of indices
 * createArray(3, identity); // [0, 1, 2]
 *
 * // Create array of objects (each is a unique instance)
 * createArray(2, () => ({ count: 0 })); // [{ count: 0 }, { count: 0 }]
 * ```
 *
 * @group Constructors
 */
export const createArray = <T>(
  length: number,
  map: (index: number) => T,
): ReadonlyArray<T> => Array.from({ length }, (_, i) => map(i));

/**
 * Converts an {@link Iterable} to a readonly array.
 *
 * Returns the input unchanged if it's already an array, avoiding unnecessary
 * allocation.
 *
 * @group Constructors
 */
export const ensureArray = <T>(iterable: Iterable<T>): ReadonlyArray<T> =>
  Array.isArray(iterable) ? (iterable as ReadonlyArray<T>) : [...iterable];

/**
 * Checks if an array is non-empty and narrows its type to {@link NonEmptyArray}
 * or {@link NonEmptyReadonlyArray} based on the input.
 *
 * To check if an array is empty, use `if (!isNonEmptyArray(arr))` — using the
 * negated guard is better than `.length === 0` for early returns because
 * TypeScript narrows the type after the check.
 *
 * ### Example
 *
 * ```ts
 * // Mutable array narrows to NonEmptyArray
 * const arr: Array<number> = [1, 2, 3];
 * if (isNonEmptyArray(arr)) {
 *   shiftFromArray(arr); // arr is NonEmptyArray<number>
 * }
 *
 * // Readonly array narrows to NonEmptyReadonlyArray
 * const readonly: ReadonlyArray<number> = [1, 2, 3];
 * if (isNonEmptyArray(readonly)) {
 *   firstInArray(readonly); // readonly is NonEmptyReadonlyArray<number>
 * }
 * ```
 *
 * @group Types
 */
export function isNonEmptyArray<T>(array: Array<T>): array is NonEmptyArray<T>;
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
 * ### Example
 *
 * ```ts
 * appendToArray([1, 2, 3], 4); // [1, 2, 3, 4]
 * ```
 *
 * @group Transformations
 */
export const appendToArray = <T>(
  array: ReadonlyArray<T>,
  item: T,
): NonEmptyReadonlyArray<T> =>
  [...array, item] as ReadonlyArray<T> as NonEmptyReadonlyArray<T>;

/**
 * Prepends an item to an array, returning a new non-empty readonly array.
 *
 * ### Example
 *
 * ```ts
 * prependToArray([2, 3], 1); // [1, 2, 3]
 * ```
 *
 * @group Transformations
 */
export const prependToArray = <T>(
  array: ReadonlyArray<T>,
  item: T,
): NonEmptyReadonlyArray<T> => [item, ...array] as NonEmptyReadonlyArray<T>;

/**
 * Maps an array using a mapper function, returning a new readonly array.
 *
 * Preserves non-empty type.
 *
 * ### Example
 *
 * ```ts
 * mapArray([1, 2, 3], (x) => x * 2); // [2, 4, 6]
 * ```
 *
 * @group Transformations
 */
export function mapArray<T, U>(
  array: NonEmptyReadonlyArray<T> | NonEmptyArray<T>,
  mapper: (item: T, index: number) => U,
): NonEmptyReadonlyArray<U>;
export function mapArray<T, U>(
  array: ReadonlyArray<T> | Array<T>,
  mapper: (item: T, index: number) => U,
): ReadonlyArray<U>;
export function mapArray<T, U>(
  array: ReadonlyArray<T> | Array<T>,
  mapper: (item: T, index: number) => U,
): ReadonlyArray<U> {
  return array.map(mapper) as ReadonlyArray<U>;
}

/**
 * Maps each element to an array and flattens the result.
 *
 * Preserves non-empty type when the input is non-empty and the mapper returns
 * non-empty arrays. When called without a mapper, flattens nested arrays using
 * {@link identity}.
 *
 * ### Example
 *
 * ```ts
 * flatMapArray([
 *   [1, 2],
 *   [3, 4],
 * ]); // [1, 2, 3, 4]
 *
 * flatMapArray([1, 2, 3], (x) => [x, x * 10]); // [1, 10, 2, 20, 3, 30]
 * ```
 *
 * ### Filter and map in one pass
 *
 * Return `[]` to filter out, `[value]` to keep:
 *
 * ```ts
 * const errors = flatMapArray(fields, (f) => {
 *   const result = validate(f);
 *   return result.ok ? [] : [result.error];
 * });
 * ```
 *
 * @group Transformations
 */
export function flatMapArray<T>(
  array:
    | NonEmptyReadonlyArray<NonEmptyReadonlyArray<T> | NonEmptyArray<T>>
    | NonEmptyArray<NonEmptyReadonlyArray<T> | NonEmptyArray<T>>,
): NonEmptyReadonlyArray<T>;
export function flatMapArray<T>(
  array:
    | ReadonlyArray<ReadonlyArray<T> | Array<T>>
    | Array<ReadonlyArray<T> | Array<T>>,
): ReadonlyArray<T>;
export function flatMapArray<T, U>(
  array: NonEmptyReadonlyArray<T> | NonEmptyArray<T>,
  mapper: (
    item: T,
    index: number,
  ) => NonEmptyReadonlyArray<U> | NonEmptyArray<U>,
): NonEmptyReadonlyArray<U>;
export function flatMapArray<T, U>(
  array: ReadonlyArray<T> | Array<T>,
  mapper: (item: T, index: number) => ReadonlyArray<U> | Array<U>,
): ReadonlyArray<U>;
export function flatMapArray<T, U>(
  array: ReadonlyArray<T> | Array<T>,
  mapper: (
    item: T,
    index: number,
  ) => ReadonlyArray<U> | Array<U> = identity as (
    item: T,
    index: number,
  ) => ReadonlyArray<U> | Array<U>,
): ReadonlyArray<U> {
  return array.flatMap(mapper) as ReadonlyArray<U>;
}

/**
 * Concatenates two arrays, returning a new readonly array.
 *
 * Returns a non-empty array when at least one input is non-empty.
 *
 * ### Example
 *
 * ```ts
 * concatArrays([1, 2], [3, 4]); // [1, 2, 3, 4]
 * concatArrays([], [1]); // [1] (non-empty)
 * concatArrays([1], []); // [1] (non-empty)
 * ```
 *
 * @group Transformations
 */
export function concatArrays<T>(
  first: NonEmptyReadonlyArray<T> | NonEmptyArray<T>,
  second: ReadonlyArray<T> | Array<T>,
): NonEmptyReadonlyArray<T>;
export function concatArrays<T>(
  first: ReadonlyArray<T> | Array<T>,
  second: NonEmptyReadonlyArray<T> | NonEmptyArray<T>,
): NonEmptyReadonlyArray<T>;
export function concatArrays<T>(
  first: ReadonlyArray<T> | Array<T>,
  second: ReadonlyArray<T> | Array<T>,
): ReadonlyArray<T>;
export function concatArrays<T>(
  first: ReadonlyArray<T> | Array<T>,
  second: ReadonlyArray<T> | Array<T>,
): ReadonlyArray<T> {
  return [...first, ...second] as ReadonlyArray<T>;
}

/**
 * Filters an array using a predicate or refinement function, returning a new
 * readonly array.
 *
 * When used with a refinement function (with `value is Type` syntax),
 * TypeScript will narrow the result type to the narrowed type, making it useful
 * for filtering with Evolu Types like `PositiveInt.is`.
 *
 * ### Example
 *
 * ### With predicate
 *
 * ```ts
 * filterArray([1, 2, 3, 4, 5], (x) => x % 2 === 0); // [2, 4]
 * ```
 *
 * ### With refinement
 *
 * ```ts
 * const mixed: ReadonlyArray<NonEmptyString | PositiveInt> = [
 *   NonEmptyString.orThrow("hello"),
 *   PositiveInt.orThrow(42),
 * ];
 * const positiveInts = filterArray(mixed, PositiveInt.is);
 * // positiveInts: ReadonlyArray<PositiveInt> (narrowed type)
 * ```
 *
 * @group Transformations
 */
export function filterArray<T, S extends T>(
  array: ReadonlyArray<T>,
  refinement: RefinementWithIndex<T, S>,
): ReadonlyArray<S>;
export function filterArray<T>(
  array: ReadonlyArray<T>,
  predicate: PredicateWithIndex<T>,
): ReadonlyArray<T>;
export function filterArray<T>(
  array: ReadonlyArray<T>,
  predicate: PredicateWithIndex<T>,
): ReadonlyArray<T> {
  return array.filter(predicate) as ReadonlyArray<T>;
}

/**
 * Returns a new readonly array with duplicate items removed. If `by` is
 * provided, it will be used to derive the key for uniqueness; otherwise values
 * are used directly. Dedupes by reference equality of values (or extracted keys
 * when `by` is used).
 *
 * Preserves non-empty type.
 *
 * ### Example
 *
 * ```ts
 * // Dedupe primitives by value
 * dedupeArray([1, 2, 1, 3, 2]); // [1, 2, 3]
 *
 * // Dedupe objects by property
 * dedupeArray(
 *   [
 *     { id: 1, name: "Alice" },
 *     { id: 2, name: "Bob" },
 *     { id: 1, name: "Alice 2" },
 *   ],
 *   (item) => item.id,
 * ); // [{ id: 1, name: "Alice" }, { id: 2, name: "Bob" }]
 * ```
 *
 * @group Transformations
 */
export function dedupeArray<T>(
  array: NonEmptyReadonlyArray<T> | NonEmptyArray<T>,
  by?: (item: T) => unknown,
): NonEmptyReadonlyArray<T>;
export function dedupeArray<T>(
  array: ReadonlyArray<T> | Array<T>,
  by?: (item: T) => unknown,
): ReadonlyArray<T>;
export function dedupeArray<T>(
  array: ReadonlyArray<T>,
  by?: (item: T) => unknown,
): ReadonlyArray<T> {
  if (by == null) {
    return Array.from(new Set(array)) as ReadonlyArray<T>;
  }

  const seen = new Set<unknown>();
  return array.filter((item) => {
    const key = by(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }) as ReadonlyArray<T>;
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
 * ### Example
 *
 * ### With predicate
 *
 * ```ts
 * const [evens, odds] = partitionArray(
 *   [1, 2, 3, 4, 5],
 *   (x) => x % 2 === 0,
 * );
 * evens; // [2, 4]
 * odds; // [1, 3, 5]
 * ```
 *
 * ### With refinement
 *
 * ```ts
 * const mixed: ReadonlyArray<NonEmptyString | PositiveInt> = [
 *   NonEmptyString.orThrow("hello"),
 *   PositiveInt.orThrow(42),
 * ];
 * const [positiveInts, strings] = partitionArray(mixed, PositiveInt.is);
 * // positiveInts: ReadonlyArray<PositiveInt> (narrowed type)
 * // strings: ReadonlyArray<NonEmptyString> (Exclude<T, PositiveInt>)
 * ```
 *
 * @group Transformations
 */
export function partitionArray<T, S extends T>(
  array: ReadonlyArray<T>,
  refinement: RefinementWithIndex<T, S>,
): readonly [ReadonlyArray<S>, ReadonlyArray<Exclude<T, S>>];
export function partitionArray<T>(
  array: ReadonlyArray<T>,
  predicate: PredicateWithIndex<T>,
): readonly [ReadonlyArray<T>, ReadonlyArray<T>];
export function partitionArray<T>(
  array: ReadonlyArray<T>,
  predicate: PredicateWithIndex<T>,
): readonly [ReadonlyArray<T>, ReadonlyArray<T>] {
  const trueArray: Array<T> = [];
  const falseArray: Array<T> = [];

  for (let i = 0; i < array.length; i++) {
    if (predicate(array[i], i)) {
      trueArray.push(array[i]);
    } else {
      falseArray.push(array[i]);
    }
  }

  return [trueArray as ReadonlyArray<T>, falseArray as ReadonlyArray<T>];
}

/**
 * Returns a new sorted readonly array.
 *
 * Wraps native `toSorted`. Preserves non-empty type.
 *
 * ### Example
 *
 * ```ts
 * sortArray([3, 1, 2], (a, b) => a - b); // [1, 2, 3]
 * ```
 *
 * @group Transformations
 */
export function sortArray<T>(
  array: NonEmptyReadonlyArray<T>,
  compareFn?: (a: T, b: T) => number,
): NonEmptyReadonlyArray<T>;
export function sortArray<T>(
  array: ReadonlyArray<T>,
  compareFn?: (a: T, b: T) => number,
): ReadonlyArray<T>;
export function sortArray<T>(
  array: ReadonlyArray<T>,
  compareFn?: (a: T, b: T) => number,
): ReadonlyArray<T> {
  return array.toSorted(compareFn) as ReadonlyArray<T>;
}

/**
 * Returns a new reversed readonly array.
 *
 * Wraps native `toReversed`. Preserves non-empty type.
 *
 * ### Example
 *
 * ```ts
 * reverseArray([1, 2, 3]); // [3, 2, 1]
 * ```
 *
 * @group Transformations
 */
export function reverseArray<T>(
  array: NonEmptyReadonlyArray<T>,
): NonEmptyReadonlyArray<T>;
export function reverseArray<T>(array: ReadonlyArray<T>): ReadonlyArray<T>;
export function reverseArray<T>(array: ReadonlyArray<T>): ReadonlyArray<T> {
  return array.toReversed() as ReadonlyArray<T>;
}

/**
 * Returns a new readonly array with elements removed and/or replaced.
 *
 * Wraps native `toSpliced`.
 *
 * ### Example
 *
 * ```ts
 * spliceArray([1, 2, 3, 4], 1, 2); // [1, 4]
 * spliceArray([1, 2, 3], 1, 1, 10, 11); // [1, 10, 11, 3]
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
 * Returns the first element of a non-empty array.
 *
 * ### Example
 *
 * ```ts
 * firstInArray(["a", "b", "c"]); // "a"
 * ```
 *
 * @group Accessors
 */
export const firstInArray = <T>(array: NonEmptyReadonlyArray<T>): T => array[0];

/**
 * Returns the last element of a non-empty array.
 *
 * ### Example
 *
 * ```ts
 * lastInArray(["a", "b", "c"]); // "c"
 * ```
 *
 * @group Accessors
 */
export const lastInArray = <T>(array: NonEmptyReadonlyArray<T>): T =>
  array[array.length - 1];

/**
 * Shifts (removes and returns) the first element from a non-empty mutable
 * array.
 *
 * **Mutates** the original array.
 *
 * ### Example
 *
 * ```ts
 * // Process a queue of callbacks
 * const waitingQueue: Array<() => void> = [callback1, callback2];
 * if (isNonEmptyArray(waitingQueue)) {
 *   shiftFromArray(waitingQueue)(); // Remove and immediately invoke
 * }
 * ```
 *
 * @group Mutations
 */
export const shiftFromArray = <T>(array: NonEmptyArray<T>): T =>
  array.shift() as T;

/**
 * Pops (removes and returns) the last element from a non-empty mutable array.
 *
 * **Mutates** the original array.
 *
 * ### Example
 *
 * ```ts
 * // Process a stack of callbacks (LIFO)
 * const callbackStack: Array<() => void> = [callback1, callback2];
 * if (isNonEmptyArray(callbackStack)) {
 *   popFromArray(callbackStack)(); // Remove and immediately invoke
 * }
 * ```
 *
 * @group Mutations
 */
export const popFromArray = <T>(array: NonEmptyArray<T>): T => array.pop() as T;
