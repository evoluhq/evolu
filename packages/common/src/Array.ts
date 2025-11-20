/**
 * Array types, type guards, operations, transformations, accessors, and
 * mutations
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
 * if (isNonEmptyReadonlyArray(arr)) {
 *   firstInArray(arr);
 * }
 *
 * // Operations
 * const appended = appendToArray([1, 2, 3], 4); // [1, 2, 3, 4]
 * const prepended = prependToArray([2, 3], 1); // [1, 2, 3]
 *
 * // Transformations
 * const readonly: ReadonlyArray<number> = [1, 2, 3];
 * const mapped = mapArray(readonly, (x) => x * 2); // [2, 4, 6]
 * const filtered = filterArray(readonly, (x) => x > 1); // [2, 3]
 * const deduped = dedupeArray([1, 2, 1, 3, 2]); // [1, 2, 3]
 * const [evens, odds] = partitionArray(
 *   [1, 2, 3, 4, 5],
 *   (x) => x % 2 === 0,
 * ); // [[2, 4], [1, 3, 5]]
 *
 * // Accessors
 * const first = firstInArray(["a", "b", "c"]); // "a"
 * const last = lastInArray(["a", "b", "c"]); // "c"
 *
 * // Mutations
 * const mutable: NonEmptyArray<number> = [1, 2, 3];
 * shiftArray(mutable); // 1 (guaranteed to exist)
 * mutable; // [2, 3]
 * ```
 *
 * Functions are intentionally data-first to be prepared for the upcoming
 * JavaScript pipe operator.
 *
 * ```ts
 * // Data-first is natural for single operations.
 * const timestamps = mapArray(messages, (m) => m.timestamp);
 *
 * // But data-first can be hard to read for nested calls.
 * const result = firstInArray(
 *   mapArray(dedupeArray(appendToArray(value, 2)), (x) => x * 2),
 * );
 *
 * // With the upcoming pipe operator, it's clear.
 * // const result = value
 * //   |> appendToArray(%, 2)
 * //   |> dedupeArray(%)
 * //   |> mapArray(%, (x) => x * 2)
 * //   |> firstInArray(%);
 *
 * // Until the pipe operator lands, use nested calls or name each step:
 * const appended = appendToArray(value, 2);
 * const deduped = dedupeArray(appended);
 * const mapped = mapArray(deduped, (x) => x * 2);
 * const result = firstInArray(mapped);
 * ```
 *
 * ### Why data-first?
 *
 * Evolu optimizes for consistent code style. We can't have both data-first
 * single operations and curried data-last helpers without sacrificing
 * consistency. We chose data-first because:
 *
 * - It's natural for single operations (for example `mapArray(messages, (m) =>
 *   m.timestamp)`).
 * - It aligns with the upcoming JavaScript pipe operator.
 *
 * **Note**: Feel free to use Array instance methods (mutation) if you think
 * it's better (performance, local scope, etc.).
 *
 * @module
 */

import { PredicateWithIndex, RefinementWithIndex } from "./Types.js";

/**
 * An array with at least one element.
 *
 * @category Types
 */
export type NonEmptyArray<T> = [T, ...Array<T>];

/**
 * A readonly array with at least one element.
 *
 * @category Types
 */
export type NonEmptyReadonlyArray<T> = readonly [T, ...ReadonlyArray<T>];

/**
 * Checks if an array is non-empty and narrows its type to {@link NonEmptyArray}.
 *
 * Use `if (!isNonEmptyArray(arr))` for empty checks.
 *
 * ### Example
 *
 * ```ts
 * const arr: Array<number> = [1, 2, 3];
 * if (isNonEmptyArray(arr)) {
 *   firstInArray(arr); // arr is NonEmptyArray<number>
 * }
 * ```
 *
 * @category Type Guards
 */
export const isNonEmptyArray = <T>(
  array: Array<T>,
): array is NonEmptyArray<T> => array.length > 0;

/**
 * Checks if a readonly array is non-empty and narrows its type to
 * {@link NonEmptyReadonlyArray}.
 *
 * Use `if (!isNonEmptyReadonlyArray(arr))` for empty checks.
 *
 * ### Example
 *
 * ```ts
 * const arr: ReadonlyArray<number> = [1, 2, 3];
 * if (isNonEmptyReadonlyArray(arr)) {
 *   firstInArray(arr); // arr is NonEmptyReadonlyArray<number>
 * }
 * ```
 *
 * @category Type Guards
 */
export const isNonEmptyReadonlyArray = <T>(
  array: ReadonlyArray<T>,
): array is NonEmptyReadonlyArray<T> => array.length > 0;

/**
 * Appends an item to an array, returning a new non-empty readonly array.
 *
 * Accepts both mutable and readonly arrays. Does not mutate the original array.
 *
 * ### Example
 *
 * ```ts
 * appendToArray([1, 2, 3], 4); // [1, 2, 3, 4]
 * ```
 *
 * @category Operations
 */
export const appendToArray = <T>(
  array: ReadonlyArray<T>,
  item: T,
): NonEmptyReadonlyArray<T> =>
  [...array, item] as ReadonlyArray<T> as NonEmptyReadonlyArray<T>;

/**
 * Prepends an item to an array, returning a new non-empty readonly array.
 *
 * Accepts both mutable and readonly arrays. Does not mutate the original array.
 *
 * ### Example
 *
 * ```ts
 * prependToArray([2, 3], 1); // [1, 2, 3]
 * ```
 *
 * @category Operations
 */
export const prependToArray = <T>(
  array: ReadonlyArray<T>,
  item: T,
): NonEmptyReadonlyArray<T> => [item, ...array] as NonEmptyReadonlyArray<T>;

/**
 * Maps an array using a mapper function.
 *
 * Accepts both mutable and readonly arrays. Preserves non-empty type.
 *
 * ### Example
 *
 * ```ts
 * mapArray([1, 2, 3], (x) => x * 2); // [2, 4, 6]
 * ```
 *
 * @category Transformations
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
 * Filters an array using a predicate or refinement function, returning a new
 * readonly array.
 *
 * Accepts both mutable and readonly arrays. When used with a refinement
 * function (with `value is Type` syntax), TypeScript will narrow the result
 * type to the narrowed type, making it useful for filtering with Evolu Types
 * like `PositiveInt.is`.
 *
 * ### Examples
 *
 * #### With predicate
 *
 * ```ts
 * filterArray([1, 2, 3, 4, 5], (x) => x % 2 === 0); // [2, 4]
 * ```
 *
 * #### With refinement
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
 * @category Transformations
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
 * Accepts both mutable and readonly arrays. Does not mutate the original array.
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
 * @category Transformations
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
 * Partitions an array into two arrays based on a predicate or refinement
 * function.
 *
 * Returns a tuple where the first array contains elements that satisfy the
 * predicate, and the second array contains elements that do not. Accepts both
 * mutable and readonly arrays.
 *
 * When used with a refinement function (with `value is Type` syntax),
 * TypeScript will narrow the first array to the narrowed type, making it useful
 * for filtering with Evolu Types like `PositiveInt.is`.
 *
 * ### Examples
 *
 * #### With predicate
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
 * #### With refinement
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
 * @category Transformations
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
 * Returns the first element of a non-empty array.
 *
 * Accepts both mutable and readonly arrays. Does not mutate the original array.
 *
 * ### Example
 *
 * ```ts
 * firstInArray(["a", "b", "c"]); // "a"
 * ```
 *
 * @category Accessors
 */
export const firstInArray = <T>(array: NonEmptyReadonlyArray<T>): T => array[0];

/**
 * Returns the last element of a non-empty array.
 *
 * Accepts both mutable and readonly arrays. Does not mutate the original array.
 *
 * ### Example
 *
 * ```ts
 * lastInArray(["a", "b", "c"]); // "c"
 * ```
 *
 * @category Accessors
 */
export const lastInArray = <T>(array: NonEmptyReadonlyArray<T>): T =>
  array[array.length - 1];

/**
 * Shifts an item from a non-empty mutable array, guaranteed to return T.
 *
 * **Mutates** the original array.
 *
 * ### Example
 *
 * ```ts
 * const arr: NonEmptyArray<number> = [1, 2, 3];
 * shiftArray(arr); // 1
 * arr; // [2, 3]
 * ```
 *
 * @category Mutations
 */
export const shiftArray = <T>(array: NonEmptyArray<T>): T => array.shift() as T;
