/**
 * 🔒 Immutable, type-safe array helpers
 *
 * Array types, guards, operations, transformations, accessors, and mutations.
 *
 * Prepared for TC39 Hack pipes:
 *
 * ```ts
 * // Problem: nested functions can be hard to follow
 * const result = firstInArray(
 *   mapArray(dedupeArray(appendToArray(value, 2)), (x) => x * 2),
 * );
 *
 * // Ideal solution: TC39 Hack pipes (when available)
 * // const result = value
 * //   |> appendToArray(%, 2)
 * //   |> dedupeArray(%)
 * //   |> mapArray(%, (x) => x * 2)
 * //   |> firstInArray(%);
 *
 * // Current solution: name each step (or use p1, p2 if lazy)
 * const p1 = appendToArray(value, 2);
 * const p2 = dedupeArray(p1);
 * const p3 = mapArray(p2, (x) => x * 2);
 * const p4 = firstInArray(p3);
 * ```
 *
 * Of course it's possible to use array instance methods, but they mutate and do
 * not preserve {@link NonEmptyArray} and {@link NonEmptyReadonlyArray} types.
 *
 * ### Example
 *
 * ```ts
 * // Types - compile-time guarantee of at least one element
 * const _valid: NonEmptyReadonlyArray<number> = [1, 2, 3];
 * // ts-expect-error - empty array is not a valid NonEmptyReadonlyArray
 * const _invalid: NonEmptyReadonlyArray<number> = [];
 *
 * // Guards
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
 * @module
 */

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
 * Accepts both mutable and readonly arrays. Does not mutate the original array.
 * Preserves non-empty type.
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
 * Filters an array using a predicate function, returning a new readonly array.
 *
 * Accepts both mutable and readonly arrays. Does not mutate the original array.
 *
 * ### Example
 *
 * ```ts
 * filterArray([1, 2, 3, 4, 5], (x) => x % 2 === 0); // [2, 4]
 * ```
 *
 * @category Transformations
 */
export const filterArray = <T>(
  array: ReadonlyArray<T>,
  predicate: (item: T, index: number) => boolean,
): ReadonlyArray<T> => array.filter(predicate) as ReadonlyArray<T>;

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
