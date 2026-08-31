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
 * ### Composing immutable and native operations
 *
 * ```ts
 * import {
 *   addToSet,
 *   assertEqual,
 *   deleteFromSet,
 *   filterSet,
 *   firstInSet,
 *   isNonEmptySet,
 *   mapSet,
 * } from "@evolu/common";
 *
 * const values = addToSet(new Set([1, 2]), 3);
 * const withoutOne = deleteFromSet(values, 1);
 * const doubled = mapSet(withoutOne, (x) => x * 2);
 * const atLeastFour = filterSet(doubled, (x) => x >= 4);
 *
 * // Evolu's readonly results compose with native Set operations.
 * const union = atLeastFour.union(new Set([6, 8]));
 * const intersection = union.intersection(new Set([4, 6, 8, 10]));
 * const difference = intersection.difference(new Set([4]));
 *
 * if (!isNonEmptySet(difference)) throw new Error("Expected values");
 * assertEqual(firstInSet(difference), 6);
 * ```
 *
 * @module
 */

import type { NonEmptyReadonlyArray } from "./Array.ts";
import type { Brand } from "./Brand.ts";
import type { PredicateWithIndex, RefinementWithIndex } from "./Types.ts";

/**
 * An empty readonly set.
 *
 * Use as a default or initial value to avoid allocating new empty sets.
 *
 * @group Constants
 */
export const emptySet: ReadonlySet<never> = /*#__PURE__*/ new Set();

/**
 * Creates a readonly set from an array.
 *
 * Preserves non-empty type when the input array is non-empty.
 *
 * ### Preserving non-empty inputs
 *
 * ```ts
 * import {
 *   assertEqual,
 *   assertType,
 *   createSet,
 *   type NonEmptyReadonlySet,
 * } from "@evolu/common";
 *
 * const values = createSet([1, 2, 3]);
 * const empty = createSet([] as ReadonlyArray<number>);
 *
 * assertType<typeof values, NonEmptyReadonlySet<number>>();
 * assertType<typeof empty, ReadonlySet<number>>();
 * assertEqual(values, new Set([1, 2, 3]));
 * ```
 *
 * @group Constructors
 */
export function createSet<T>(
  items: NonEmptyReadonlyArray<T>,
): NonEmptyReadonlySet<T>;
/** Possibly empty set. */
export function createSet<T>(items: ReadonlyArray<T>): ReadonlySet<T>;
export function createSet<T>(items: ReadonlyArray<T>): ReadonlySet<T> {
  return new Set(items);
}

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
 * ### Narrowing before access
 *
 * ```ts
 * import {
 *   assertEqual,
 *   assertType,
 *   isNonEmptySet,
 *   type NonEmptyReadonlySet,
 * } from "@evolu/common";
 *
 * const set: ReadonlySet<number> = new Set([1, 2, 3]);
 * if (!isNonEmptySet(set)) throw new Error("Expected a non-empty set");
 *
 * assertType<typeof set, NonEmptyReadonlySet<number>>();
 * assertEqual(set.size, 3);
 * ```
 *
 * @group Type guards
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
 * ### Adding without mutation
 *
 * ```ts
 * import {
 *   addToSet,
 *   assertEqual,
 *   assertTrue,
 *   assertType,
 *   type NonEmptyReadonlySet,
 * } from "@evolu/common";
 *
 * const original: ReadonlySet<number> = new Set([1, 2]);
 * const added = addToSet(original, 3);
 * const unchanged = addToSet(original, 2);
 *
 * assertType<typeof added, NonEmptyReadonlySet<number>>();
 * assertEqual(added, new Set([1, 2, 3]));
 * assertTrue(unchanged !== original);
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
 * ### Deleting without mutation
 *
 * ```ts
 * import { assertEqual, assertTrue, deleteFromSet } from "@evolu/common";
 *
 * const original = new Set([1, 2, 3]);
 * assertEqual(deleteFromSet(original, 2), new Set([1, 3]));
 * assertTrue(deleteFromSet(original, 5) !== original);
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
  return next;
};

/**
 * Maps a set using a mapper function, returning a new readonly set.
 *
 * Preserves non-empty type.
 *
 * Note: If the mapper produces duplicate values, the resulting set will have
 * fewer elements.
 *
 * ### Mapping non-empty sets
 *
 * ```ts
 * import {
 *   assertEqual,
 *   assertType,
 *   createSet,
 *   mapSet,
 *   type NonEmptyReadonlySet,
 * } from "@evolu/common";
 *
 * const original = createSet([1, 2, 3]);
 * const doubled = mapSet(original, (x) => x * 2);
 * const parity = mapSet(original, (x) => x % 2);
 *
 * assertType<typeof doubled, NonEmptyReadonlySet<number>>();
 * assertEqual(doubled, new Set([2, 4, 6]));
 * assertEqual(parity, new Set([1, 0]));
 * ```
 *
 * @group Transformations
 */
export function mapSet<T, U>(
  set: NonEmptyReadonlySet<T>,
  mapper: (item: T) => U,
): NonEmptyReadonlySet<U>;
/** Possibly empty set. */
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
  return next;
}

/**
 * Filters a set using a predicate or refinement function, returning a new
 * readonly set.
 *
 * When used with a refinement function (with `value is Type` syntax),
 * TypeScript will narrow the result type.
 *
 * ### Filtering and refining
 *
 * ```ts
 * import { assertEqual, assertType, filterSet } from "@evolu/common";
 *
 * const evens = filterSet(new Set([1, 2, 3, 4, 5]), (x) => x % 2 === 0);
 * assertEqual(evens, new Set([2, 4]));
 *
 * const mixed: ReadonlySet<string | number> = new Set([1, "a", 2, "b"]);
 * const strings = filterSet(
 *   mixed,
 *   (value): value is string => typeof value === "string",
 * );
 * assertType<typeof strings, ReadonlySet<string>>();
 * assertEqual(strings, new Set(["a", "b"]));
 * ```
 *
 * @group Transformations
 */
export function filterSet<T, S extends T>(
  set: ReadonlySet<T>,
  refinement: RefinementWithIndex<T, S>,
): ReadonlySet<S>;
/** With predicate. */
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
  return next;
}

/**
 * Returns the first element of a non-empty set (by insertion order).
 *
 * ### Reading the first value
 *
 * ```ts
 * import { assertEqual, createSet, firstInSet } from "@evolu/common";
 *
 * const set = createSet(["a", "b", "c"]);
 * assertEqual(firstInSet(set), "a");
 * ```
 *
 * @group Accessors
 */
export const firstInSet = <T>(set: NonEmptyReadonlySet<T>): T =>
  set.values().next().value as T;
