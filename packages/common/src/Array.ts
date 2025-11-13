/**
 * 🔒 Immutable, type-safe array operations
 *
 * Helpers that preserve immutability through the type system. Native array
 * methods return mutable arrays even when called on readonly arrays. These
 * helpers ensure transformations return readonly types.
 *
 * {@link NonEmptyArray} and {@link NonEmptyReadonlyArray} types represent arrays
 * with at least one element, eliminating runtime length checks and making
 * function requirements explicit.
 *
 * ### Example
 *
 * ```ts
 * // ❌ Native methods return mutable arrays
 * const readonly: ReadonlyArray<number> = [1, 2, 3];
 * const mapped = readonly.map((x) => x * 2); // Array<number> (mutable!)
 *
 * // ✅ Helpers preserve immutability
 * const filtered = filterArray(readonly, (x) => x > 1); // ReadonlyArray<number>
 *
 * // ✅ NonEmptyArray enforces non-emptiness
 * const first = (items: NonEmptyReadonlyArray<string>) => items[0];
 * first([]); // ❌ Compiler error
 * first(["a"]); // ✅ Works
 * ```
 *
 * @module
 */

/** An array with at least one element. */
export type NonEmptyArray<T> = [T, ...Array<T>];

/** Checks if an array is non-empty. */
export const isNonEmptyArray = <T>(
  array: Array<T>,
): array is NonEmptyArray<T> => array.length > 0;

/** A readonly array with at least one element. */
export type NonEmptyReadonlyArray<T> = readonly [T, ...ReadonlyArray<T>];

/** Checks if an array is non-empty. */
export const isNonEmptyReadonlyArray = <T>(
  array: ReadonlyArray<T>,
): array is NonEmptyReadonlyArray<T> => array.length > 0;

/**
 * Appends an item to an array, returning a new non-empty readonly array.
 *
 * Accepts both mutable and readonly arrays. Does not mutate the original array.
 */
export const appendToArray = <T>(
  item: T,
  array: ReadonlyArray<T>,
): NonEmptyReadonlyArray<T> =>
  [...array, item] as ReadonlyArray<T> as NonEmptyReadonlyArray<T>;

/**
 * Prepends an item to an array, returning a new non-empty readonly array.
 *
 * Accepts both mutable and readonly arrays. Does not mutate the original array.
 */
export const prependToArray = <T>(
  item: T,
  array: ReadonlyArray<T>,
): NonEmptyReadonlyArray<T> => [item, ...array] as NonEmptyReadonlyArray<T>;

/**
 * Maps an array using a mapper function, preserving non-emptiness when
 * applicable.
 *
 * Accepts both mutable and readonly arrays. Does not mutate the original array.
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
 */
export const filterArray = <T>(
  array: ReadonlyArray<T>,
  predicate: (item: T, index: number) => boolean,
): ReadonlyArray<T> => array.filter(predicate) as ReadonlyArray<T>;

/**
 * Shifts an item from a non-empty mutable array, guaranteed to return T.
 *
 * **Mutates** the original array. Use only with mutable arrays.
 */
export const shiftArray = <T>(array: NonEmptyArray<T>): T => array.shift() as T;
