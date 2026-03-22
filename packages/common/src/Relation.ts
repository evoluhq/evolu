/**
 * Bidirectional relations with O(1) lookup in both directions.
 *
 * @module
 */

import { emptyArray } from "./Array.js";
import { assert } from "./Assert.js";
import { identity } from "./Function.js";
import {
  createLookupMap,
  createLookupSet,
  type Lookup,
  type LookupSet,
} from "./Lookup.js";

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
 * By default, {@link createRelation} uses reference identity for both sides,
 * matching native `Map` and `Set`. Callers may instead provide
 * {@link Lookup lookup} functions so logical equality is based on a derived
 * stable key.
 *
 * The input parameter types of `lookupA` and `lookupB` determine which values
 * the returned relation accepts on each side.
 *
 * ### Example
 *
 * Use the default identity semantics.
 *
 * ```ts
 * const relation = createRelation<WebSocket, string>();
 * relation.add(socket, "owner-1");
 * ```
 *
 * ### Example
 *
 * Use lookup-derived equality.
 *
 * ```ts
 * interface Person {
 *   readonly id: string;
 *   readonly name: string;
 * }
 *
 * const relation = createRelation({
 *   lookupA: (person: Person) => person.id,
 *   lookupB: (group: { readonly id: string }) => group.id,
 * });
 *
 * relation.add({ id: "1", name: "Ada" }, { id: "admins" });
 * relation.has({ id: "1", name: "Grace" }, { id: "admins" }); // true
 * ```
 *
 * @see {@link createRelation}
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

/** Options for {@link createRelation}. */
export interface CreateRelationOptions<A, B, LA = A, LB = B> {
  /** Derives logical identity for A values. Defaults to {@link identity}. */
  readonly lookupA?: Lookup<A, LA>;

  /** Derives logical identity for B values. Defaults to {@link identity}. */
  readonly lookupB?: Lookup<B, LB>;
}

/** Creates a {@link Relation}. */
export function createRelation<A, B>(): Relation<A, B>;
export function createRelation<A, B, LA, LB>(
  options: CreateRelationOptions<A, B, LA, LB>,
): Relation<A, B>;
export function createRelation<A, B, LA = A, LB = B>({
  lookupA = identity as Lookup<A, LA>,
  lookupB = identity as Lookup<B, LB>,
}: CreateRelationOptions<A, B, LA, LB> = {}): Relation<A, B> {
  const bByA = createLookupMap<A, LookupSet<B>, LA>({ lookup: lookupA });
  const aByB = createLookupMap<B, LookupSet<A>, LB>({ lookup: lookupB });
  let sizeInternal = 0;

  const removePair = (a: A, b: B): void => {
    const relatedB = bByA.get(a);
    // This should only fail if a leaked view was mutated via an unsafe cast.
    assertRelationMappingConsistency(relatedB);
    assertRelationMappingConsistency(relatedB.has(b));

    relatedB.delete(b);
    if (relatedB.size === 0) {
      bByA.delete(a);
    }

    const relatedA = aByB.get(b);
    // This should only fail if a leaked view was mutated via an unsafe cast.
    assertRelationMappingConsistency(relatedA);
    assertRelationMappingConsistency(relatedA.has(a));

    relatedA.delete(a);
    if (relatedA.size === 0) {
      aByB.delete(b);
    }

    sizeInternal--;
  };

  return {
    add: (a, b) => {
      const canonicalA = bByA.getKey(a) ?? a;
      const canonicalB = aByB.getKey(b) ?? b;

      let relatedB = bByA.get(canonicalA);
      if (relatedB?.has(canonicalB)) return false;
      if (!relatedB) {
        relatedB = createLookupSet<B, LB>({ lookup: lookupB });
        bByA.set(canonicalA, relatedB);
      }
      relatedB.add(canonicalB);

      let relatedA = aByB.get(canonicalB);
      if (!relatedA) {
        relatedA = createLookupSet<A, LA>({ lookup: lookupA });
        aByB.set(canonicalB, relatedA);
      }
      relatedA.add(canonicalA);

      sizeInternal++;
      return true;
    },

    remove: (a, b) => {
      if (!bByA.get(a)?.has(b)) return false;

      removePair(a, b);
      return true;
    },

    removeByA: (a) => {
      const relatedB = bByA.get(a);
      if (!relatedB) return false;
      for (const b of [...relatedB.keys()]) removePair(a, b);
      return true;
    },

    removeByB: (b) => {
      const relatedA = aByB.get(b);
      if (!relatedA) return false;
      for (const a of [...relatedA.keys()]) removePair(a, b);
      return true;
    },

    iterateA: (b) =>
      aByB.get(b)?.keys() ?? (emptyArray.values() as IterableIterator<A>),

    iterateB: (a) =>
      bByA.get(a)?.keys() ?? (emptyArray.values() as IterableIterator<B>),

    *[Symbol.iterator](): IterableIterator<readonly [A, B]> {
      for (const [a, relatedB] of bByA) {
        for (const b of relatedB.keys()) {
          yield [a, b] as const;
        }
      }
    },

    has: (a, b) => {
      const relatedB = bByA.get(a);
      return relatedB?.has(b) ?? false;
    },

    hasA: (a) => bByA.has(a),

    hasB: (b) => aByB.has(b),

    clear: () => {
      bByA.clear();
      aByB.clear();
      sizeInternal = 0;
    },

    aCount: () => bByA.size,

    bCount: () => aByB.size,

    bCountForA: (a) => bByA.get(a)?.size ?? 0,

    aCountForB: (b) => aByB.get(b)?.size ?? 0,

    size: () => sizeInternal,
  };
}

const assertRelationMappingConsistency: (
  condition: unknown,
) => asserts condition = (condition) => {
  assert(condition, "Relation mapping inconsistency");
};
