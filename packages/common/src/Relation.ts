/**
 * Bidirectional relations with O(1) lookup in both directions.
 *
 * @module
 */

import { assert } from "./Assert.js";

/**
 * Bidirectional relation between two types.
 *
 * Why useful:
 *
 * - Provides O(1) (amortized) lookup in both directions (A → B and B → A) without
 *   maintaining two maps manually and risking them diverging.
 * - Natural fit for symmetric associations such as ownerId ↔ WebSocket, tag ↔
 *   item, user ↔ role, entity ↔ subscription where both directions are
 *   frequently queried.
 * - Supports fast membership tests via `has`, `hasA`, and `hasB`.
 * - Iteration helpers (`forEach`, iterator) allow treating the structure as a set
 *   of pairs when needed.
 *
 * Complexity:
 *
 * - `add` / `remove` / `has*` / `get*` each perform a constant number of Map/Set
 *   operations (O(1) expected).
 * - `deleteA` and `deleteB` are O(d) where d is the number of associated elements
 *   (the degree). This is optimal because every associated pair must be touched
 *   once.
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

  /** Gets all B elements related to an A element. */
  readonly getB: (a: A) => ReadonlySet<B> | undefined;

  /** Gets all A elements related to a B element. */
  readonly getA: (b: B) => ReadonlySet<A> | undefined;

  /**
   * Iterates over each pair in the relation (in insertion order of A elements,
   * then B elements per A).
   */
  readonly forEach: (callback: (a: A, b: B) => void) => void;

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

  /** Deletes all pairs containing the given A element. */
  readonly deleteA: (a: A) => boolean;

  /** Deletes all pairs containing the given B element. */
  readonly deleteB: (b: B) => boolean;

  /** Clears all pairs from the relation. */
  readonly clear: () => void;

  /** Number of distinct A elements currently present. */
  readonly aCount: () => number;

  /** Number of distinct B elements currently present. */
  readonly bCount: () => number;

  /** Number of pairs currently stored in the relation. */
  readonly size: () => number;
}

/** Creates a {@link Relation}. */
export const createRelation = <A, B>(): Relation<A, B> => {
  const aToB = new Map<A, Set<B>>();
  const bToA = new Map<B, Set<A>>();
  let sizeInternal = 0;

  const relation: Relation<A, B> = {
    add(a: A, b: B) {
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

    remove(a: A, b: B) {
      const bSet = aToB.get(a);
      if (!bSet?.has(b)) return false;

      bSet.delete(b);
      if (bSet.size === 0) {
        aToB.delete(a);
      }

      const aSet = bToA.get(b);
      assert(aSet, "Relation mapping inconsistency");

      aSet.delete(a);
      if (aSet.size === 0) {
        bToA.delete(b);
      }
      sizeInternal--;
      return true;
    },

    getB(a: A): ReadonlySet<B> | undefined {
      return aToB.get(a);
    },

    getA(b: B): ReadonlySet<A> | undefined {
      return bToA.get(b);
    },

    forEach(callback: (a: A, b: B) => void) {
      for (const [a, bSet] of aToB) {
        for (const b of bSet) callback(a, b);
      }
    },

    [Symbol.iterator](): IterableIterator<readonly [A, B]> {
      const iterator = function* () {
        for (const [a, bSet] of aToB) {
          for (const b of bSet) {
            yield [a, b] as const;
          }
        }
      };
      return iterator();
    },

    has(a: A, b: B) {
      const bSet = aToB.get(a);
      return bSet?.has(b) ?? false;
    },

    hasA(a: A) {
      return aToB.has(a);
    },

    hasB(b: B) {
      return bToA.has(b);
    },

    deleteA(a: A) {
      const bSet = aToB.get(a);
      if (!bSet) return false;
      const removed = bSet.size;
      for (const b of bSet) {
        const aSet = bToA.get(b);
        if (aSet) {
          aSet.delete(a);
          if (aSet.size === 0) {
            bToA.delete(b);
          }
        }
      }
      aToB.delete(a);
      sizeInternal -= removed;
      return true;
    },

    deleteB(b: B) {
      const aSet = bToA.get(b);
      if (!aSet) return false;
      const removed = aSet.size;
      for (const a of aSet) {
        const bSet = aToB.get(a);
        if (bSet) {
          bSet.delete(b);
          if (bSet.size === 0) {
            aToB.delete(a);
          }
        }
      }
      bToA.delete(b);
      sizeInternal -= removed;
      return true;
    },

    clear() {
      aToB.clear();
      bToA.clear();
      sizeInternal = 0;
    },

    aCount() {
      return aToB.size;
    },

    bCount() {
      return bToA.size;
    },

    size() {
      return sizeInternal;
    },
  };

  return relation;
};
