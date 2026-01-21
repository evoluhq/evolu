/**
 * Set helpers.
 *
 * All helpers return readonly sets for safety. Native Set methods like `add()`
 * and `delete()` mutate the original — use {@link addToSet} and
 * {@link deleteFromSet} instead for immutable operations that return new sets.
 *
 * Use {@link isNonEmptySet} to narrow to {@link NonEmptyReadonlySet} before
 * calling functions like {@link firstInSet} that require a non-empty set.
 *
 * ### Example
 *
 * ```ts
 * // Type guards
 * const set: ReadonlySet<number> = new Set([1, 2, 3]);
 * if (isNonEmptySet(set)) {
 *   firstInSet(set);
 * }
 *
 * // Immutable transformations
 * const added = addToSet(new Set([1, 2]), 3); // Set {1, 2, 3}
 * const removed = deleteFromSet(new Set([1, 2, 3]), 2); // Set {1, 3}
 * const mapped = mapSet(new Set([1, 2, 3]), (x) => x * 2); // Set {2, 4, 6}
 * const filtered = filterSet(new Set([1, 2, 3, 4]), (x) => x % 2 === 0); // Set {2, 4}
 *
 * // Set operations
 * const union = unionSets(new Set([1, 2]), new Set([2, 3])); // Set {1, 2, 3}
 * const intersection = intersectSets(new Set([1, 2]), new Set([2, 3])); // Set {2}
 * const difference = differenceSets(new Set([1, 2, 3]), new Set([2])); // Set {1, 3}
 * ```
 *
 * @module
 */

import type { Brand } from "./Brand.js";
import type { PredicateWithIndex, RefinementWithIndex } from "./Types.js";

/**
 * An empty readonly set.
 *
 * Use as a default or initial value to avoid allocating new empty sets.
 *
 * @group Constants
 */
export const emptySet: ReadonlySet<never> = new Set();

/**
 * A readonly set with at least one element (branded for type safety).
 *
 * Use {@link isNonEmptySet} to narrow from `ReadonlySet`, or use functions like
 * {@link addToSet} that return branded non-empty sets.
 *
 * There is no mutable `NonEmptySet` type because mutable sets can be emptied
 * after narrowing (via `clear()` or `delete()`), making compile-time guarantees
 * impossible.
 *
 * @group Types
 */
export type NonEmptyReadonlySet<T> = ReadonlySet<T> & Brand<"NonEmpty">;

/**
 * Checks if a set is non-empty and narrows its type to
 * {@link NonEmptyReadonlySet}.
 *
 * Both mutable and readonly sets narrow to the branded
 * {@link NonEmptyReadonlySet} type, which can be used with functions like
 * {@link firstInSet}.
 *
 * To check if a set is empty, use `if (!isNonEmptySet(set))` — using the
 * negated guard is better than `.size === 0` for early returns because
 * TypeScript narrows the type after the check.
 *
 * ### Example
 *
 * ```ts
 * const set: ReadonlySet<number> = new Set([1, 2, 3]);
 * if (isNonEmptySet(set)) {
 *   firstInSet(set); // set is NonEmptyReadonlySet<number>
 * }
 * ```
 *
 * @group Type Guards
 */
export const isNonEmptySet = <T>(
  set: ReadonlySet<T>,
): set is NonEmptyReadonlySet<T> => set.size > 0;

/**
 * Returns a new readonly set with an item added.
 *
 * If the item already exists, returns a new set with the same elements (still a
 * new reference for change detection).
 *
 * ### Example
 *
 * ```ts
 * addToSet(new Set([1, 2]), 3); // Set {1, 2, 3}
 * addToSet(new Set([1, 2]), 2); // Set {1, 2} (new reference)
 * ```
 *
 * @group Transformations
 */
export const addToSet = <T>(
  set: ReadonlySet<T>,
  item: T,
): NonEmptyReadonlySet<T> => {
  const next = new Set(set);
  next.add(item);
  return next as ReadonlySet<T> as NonEmptyReadonlySet<T>;
};

/**
 * Returns a new readonly set with an item removed.
 *
 * If the item doesn't exist, returns a new set with the same elements (still a
 * new reference for change detection).
 *
 * ### Example
 *
 * ```ts
 * deleteFromSet(new Set([1, 2, 3]), 2); // Set {1, 3}
 * deleteFromSet(new Set([1, 2]), 5); // Set {1, 2} (new reference)
 * ```
 *
 * @group Transformations
 */
export const deleteFromSet = <T>(
  set: ReadonlySet<T>,
  item: T,
): ReadonlySet<T> => {
  const next = new Set(set);
  next.delete(item);
  return next as ReadonlySet<T>;
};

/**
 * Maps a set using a mapper function, returning a new readonly set.
 *
 * Preserves non-empty type.
 *
 * Note: If the mapper produces duplicate values, the resulting set will have
 * fewer elements.
 *
 * ### Example
 *
 * ```ts
 * mapSet(new Set([1, 2, 3]), (x) => x * 2); // Set {2, 4, 6}
 * mapSet(new Set([1, 2, 3]), (x) => x % 2); // Set {1, 0} (duplicates merged)
 * ```
 *
 * @group Transformations
 */
export function mapSet<T, U>(
  set: NonEmptyReadonlySet<T>,
  mapper: (item: T) => U,
): NonEmptyReadonlySet<U>;
export function mapSet<T, U>(
  set: ReadonlySet<T>,
  mapper: (item: T) => U,
): ReadonlySet<U>;
export function mapSet<T, U>(
  set: ReadonlySet<T>,
  mapper: (item: T) => U,
): ReadonlySet<U> {
  const next = new Set<U>();
  for (const item of set) {
    next.add(mapper(item));
  }
  return next as ReadonlySet<U>;
}

/**
 * Filters a set using a predicate or refinement function, returning a new
 * readonly set.
 *
 * When used with a refinement function (with `value is Type` syntax),
 * TypeScript will narrow the result type.
 *
 * ### Example
 *
 * ```ts
 * filterSet(new Set([1, 2, 3, 4, 5]), (x) => x % 2 === 0); // Set {2, 4}
 * ```
 *
 * @group Transformations
 */
export function filterSet<T, S extends T>(
  set: ReadonlySet<T>,
  refinement: RefinementWithIndex<T, S>,
): ReadonlySet<S>;
export function filterSet<T>(
  set: ReadonlySet<T>,
  predicate: PredicateWithIndex<T>,
): ReadonlySet<T>;
export function filterSet<T>(
  set: ReadonlySet<T>,
  predicate: PredicateWithIndex<T>,
): ReadonlySet<T> {
  const next = new Set<T>();
  let index = 0;
  for (const item of set) {
    if (predicate(item, index++)) {
      next.add(item);
    }
  }
  return next as ReadonlySet<T>;
}

/**
 * Returns the first element of a non-empty set (by insertion order).
 *
 * ### Example
 *
 * ```ts
 * firstInSet(new Set(["a", "b", "c"])); // "a"
 * ```
 *
 * @group Accessors
 */
export const firstInSet = <T>(set: NonEmptyReadonlySet<T>): T =>
  set.values().next().value as T;
