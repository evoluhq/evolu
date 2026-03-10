/**
 * Bidirectional relations with O(1) lookup in both directions.
 *
 * @module
 */

import { emptyArray } from "./Array.js";
import { assert } from "./Assert.js";

/**
 * Bidirectional relation between two types.
 *
 * - Provides O(1) (amortized) lookup in both directions (A → B and B → A) without
 *   maintaining two maps manually and risking them diverging.
 * - Natural fit for symmetric associations such as ownerId ↔ WebSocket, tag ↔
 *   item, user ↔ role, entity ↔ subscription where both directions are
 *   frequently queried.
 * - Supports fast membership tests via `has`, `hasA`, and `hasB`.
 * - Exposes directional iterators for imperative `for...of` traversal.
 * - The relation itself is iterable, allowing it to be treated as a set of pairs
 *   when needed.
 *
 * Complexity:
 *
 * - `add` / `remove` / `has*` / `*Count*` each perform a constant number of
 *   Map/Set operations (O(1) expected).
 * - `iterateA` and `iterateB` create iterators in O(1); consuming them is O(d)
 *   where d is the number of associated elements.
 * - `removeByA` and `removeByB` are O(d) where d is the number of associated
 *   elements, because every associated pair must be touched once.
 *
 * Object identity:
 *
 * - Elements are compared by reference (standard Map / Set semantics). Structural
 *   hashing of objects in JavaScript is non-trivial, can be expensive, and
 *   collision-prone if done naively. Prefer using stable primitive identifiers
 *   (ids, strings) instead of attempting to hash full object structures.
 * - If structural equivalence is truly required, wrap objects in an adapter that
 *   supplies a canonical hash/id and stores/retrieves the original objects
 *   separately. This is a rare need; avoid unless you have clear requirements.
 */
export interface Relation<A, B> {
  /**
   * Adds a pair to the relation. Returns true if the pair was newly added,
   * false if it already existed.
   */
  readonly add: (a: A, b: B) => boolean;

  /**
   * Removes a specific pair from the relation. Returns true if the pair existed
   * and was removed, false if it was not present.
   */
  readonly remove: (a: A, b: B) => boolean;

  /** Removes all pairs containing the given A element. */
  readonly removeByA: (a: A) => boolean;

  /** Removes all pairs containing the given B element. */
  readonly removeByB: (b: B) => boolean;

  /**
   * Iterates over all A elements related to a B element.
   *
   * Returns a live iterator over the current relation state rather than a
   * snapshot copy.
   *
   * Returns an empty iterator when the B element has no related values.
   */
  readonly iterateA: (b: B) => IterableIterator<A>;

  /**
   * Iterates over all B elements related to an A element.
   *
   * Returns a live iterator over the current relation state rather than a
   * snapshot copy.
   *
   * Returns an empty iterator when the A element has no related values.
   */
  readonly iterateB: (a: A) => IterableIterator<B>;

  /**
   * Iterator over all pairs enabling for..of and spread. Yields readonly [a, b]
   * tuples.
   */
  readonly [Symbol.iterator]: () => IterableIterator<readonly [A, B]>;

  /** Checks if a specific pair exists in the relation. */
  readonly has: (a: A, b: B) => boolean;

  /** Checks if an A element exists in the relation. */
  readonly hasA: (a: A) => boolean;

  /** Checks if a B element exists in the relation. */
  readonly hasB: (b: B) => boolean;

  /** Clears all pairs from the relation. */
  readonly clear: () => void;

  /** Number of distinct A elements currently present. */
  readonly aCount: () => number;

  /** Number of distinct B elements currently present. */
  readonly bCount: () => number;

  /** Number of B elements related to the given A element. */
  readonly bCountForA: (a: A) => number;

  /** Number of A elements related to the given B element. */
  readonly aCountForB: (b: B) => number;

  /** Number of pairs currently stored in the relation. */
  readonly size: () => number;
}

/** Creates a {@link Relation}. */
export const createRelation = <A, B>(): Relation<A, B> => {
  const aToB = new Map<A, Set<B>>();
  const bToA = new Map<B, Set<A>>();
  let sizeInternal = 0;

  const removePair = (a: A, b: B): void => {
    const bSet = aToB.get(a);
    // This should only fail if a leaked view was mutated via an unsafe cast.
    assert(bSet?.has(b), "Relation mapping inconsistency");

    bSet!.delete(b);
    if (bSet!.size === 0) {
      aToB.delete(a);
    }

    const aSet = bToA.get(b);
    // This should only fail if a leaked view was mutated via an unsafe cast.
    assert(aSet?.has(a), "Relation mapping inconsistency");

    aSet!.delete(a);
    if (aSet!.size === 0) {
      bToA.delete(b);
    }

    sizeInternal--;
  };

  return {
    add: (a, b) => {
      let bSet = aToB.get(a);
      if (bSet?.has(b)) return false;
      if (!bSet) {
        bSet = new Set<B>();
        aToB.set(a, bSet);
      }
      bSet.add(b);

      let aSet = bToA.get(b);
      if (!aSet) {
        aSet = new Set<A>();
        bToA.set(b, aSet);
      }
      aSet.add(a);

      sizeInternal++;
      return true;
    },

    remove: (a, b) => {
      if (!aToB.get(a)?.has(b)) return false;

      removePair(a, b);
      return true;
    },

    removeByA: (a) => {
      const bSet = aToB.get(a);
      if (!bSet) return false;
      for (const b of bSet) removePair(a, b);
      return true;
    },

    removeByB: (b) => {
      const aSet = bToA.get(b);
      if (!aSet) return false;
      for (const a of aSet) removePair(a, b);
      return true;
    },

    iterateA: (b) =>
      bToA.get(b)?.values() ?? (emptyArray.values() as IterableIterator<A>),

    iterateB: (a) =>
      aToB.get(a)?.values() ?? (emptyArray.values() as IterableIterator<B>),

    *[Symbol.iterator](): IterableIterator<readonly [A, B]> {
      for (const [a, bSet] of aToB) {
        for (const b of bSet) {
          yield [a, b] as const;
        }
      }
    },

    has: (a, b) => {
      const bSet = aToB.get(a);
      return bSet?.has(b) ?? false;
    },

    hasA: (a) => aToB.has(a),

    hasB: (b) => bToA.has(b),

    clear: () => {
      aToB.clear();
      bToA.clear();
      sizeInternal = 0;
    },

    aCount: () => aToB.size,

    bCount: () => bToA.size,

    bCountForA: (a) => aToB.get(a)?.size ?? 0,

    aCountForB: (b) => bToA.get(b)?.size ?? 0,

    size: () => sizeInternal,
  };
};
