/**
 * Structural-key collections.
 *
 * @module
 */

import { emptyArray } from "./Array.js";
import { assert } from "./Assert.js";
import { isPlainObject } from "./Object.js";
import type { createRelation } from "./Relation.js";
import { Uint8Array, uint8ArrayToBase64Url } from "./Type.js";

/**
 * Immutable structural key.
 *
 * Structural keys are JSON-like values with `NaN` and positive/negative
 * infinity also supported, or `Uint8Array`.
 *
 * Use structural keys when reference-based equality is not sufficient for
 * non-primitive keys and equality should be based on content instead.
 *
 * Structurally equal arrays and plain objects compare as the same logical key
 * even when they are different JavaScript instances.
 *
 * The structural collections in this module derive a canonical structural key
 * for each key and store entries in native `Map`-backed indexes.
 * `StructuralSet` provides a set-like API on top of the same mechanism. For
 * repeated lookups of the same object or array instance, the derived structural
 * key is cached in a `WeakMap` so subsequent access can reuse it without
 * recomputing the full structure.
 *
 * This keeps the implementation simple and predictable, and is usually fine for
 * collections up to tens of thousands of entries and sometimes low hundreds of
 * thousands depending on key size and access patterns. Cost is still
 * proportional to key size before the final native lookup. Larger collections
 * should usually use natural stable ids instead. It is possible to hash
 * structural keys and build custom data structures, but that added complexity
 * is rarely worth it unless natural ids are unavailable and profiling shows
 * this approach is too expensive.
 *
 * **Warning**: Structural keys must never be mutated. Structural ids are cached
 * by object identity, so mutation is unsupported.
 *
 * @see {@link StructuralMap}
 * @see {@link StructuralSet}
 * @see {@link StructuralRelation}
 */
export type StructuralKey =
  | StructuralScalar
  | ReadonlyArray<StructuralKey>
  | { readonly [key: string]: StructuralKey };

/** Scalar branch shared by {@link StructuralKey} and {@link Structural}. */
export type StructuralScalar = string | number | boolean | null | Uint8Array;

/**
 * Compile-time structural form of `T` for public structural-key APIs.
 *
 * This exists because {@link StructuralKey} is the runtime serialization model,
 * not a good public generic constraint for interface-shaped objects.
 * `StructuralKey` models object values with a string index signature, which is
 * stricter than ordinary interfaces like `{ readonly id: string }` even though
 * the runtime serializer accepts such plain objects.
 *
 * `Structural<T>` checks a concrete type recursively at compile time instead:
 * scalars pass through, arrays recurse, object properties recurse, and
 * function-valued properties are rejected. This keeps public APIs ergonomic for
 * interface-based inputs while {@link StructuralKey} remains the internal value
 * model used by the serializer.
 *
 * @see {@link StructuralMap}
 * @see {@link StructuralSet}
 * @see {@link StructuralRelation}
 */
export type Structural<T> = T extends StructuralScalar
  ? T
  : T extends ReadonlyArray<infer Item>
    ? ReadonlyArray<Structural<Item>>
    : T extends StructuralFunction
      ? never
      : T extends object
        ? {
            readonly [K in keyof T as Extract<
              T[K],
              StructuralFunction
            > extends never
              ? K
              : never]: Structural<Exclude<T[K], StructuralFunction>>;
          } & {
            readonly [K in keyof T as Extract<
              T[K],
              StructuralFunction
            > extends never
              ? never
              : K]?: never;
          }
        : never;

/** Function branch excluded by {@link Structural}. */
export type StructuralFunction = (...args: ReadonlyArray<unknown>) => unknown;

/**
 * `Map`-like collection keyed by {@link StructuralKey}.
 *
 * Use this when a lookup table should compare keys by structural value instead
 * of identity.
 *
 * `set` preserves the first inserted canonical representative for a structural
 * key. `getKey` returns that canonical key for callers that need stable
 * representative identity.
 *
 * ### Example
 *
 * ```ts
 * const map = createStructuralMap<
 *   { readonly id: string; readonly filter: readonly [string, string] },
 *   string
 * >();
 *
 * map.set({ id: "items", filter: ["owner", "active"] }, "cached");
 *
 * map.get({ id: "items", filter: ["owner", "active"] });
 * // => "cached"
 * ```
 */
export interface StructuralMap<K, V> extends Iterable<
  readonly [Structural<K>, V]
> {
  readonly size: number;
  readonly has: (key: Structural<K>) => boolean;
  readonly get: (key: Structural<K>) => V | undefined;
  readonly getKey: (key: Structural<K>) => Structural<K> | undefined;
  readonly set: (key: Structural<K>, value: V) => StructuralMap<K, V>;
  readonly delete: (key: Structural<K>) => boolean;
  readonly clear: () => void;
  readonly keys: () => IterableIterator<Structural<K>>;
  readonly values: () => IterableIterator<V>;
  readonly entries: () => IterableIterator<readonly [Structural<K>, V]>;
  readonly forEach: (
    callback: (value: V, key: Structural<K>, map: StructuralMap<K, V>) => void,
  ) => void;
  readonly [Symbol.iterator]: () => IterableIterator<
    readonly [Structural<K>, V]
  >;
}

/** Creates {@link StructuralMap}. */
export const createStructuralMap = <K, V>(
  entries?: Iterable<readonly [Structural<K>, V]>,
): StructuralMap<K, V> => {
  interface StructuralEntry<K, V> {
    readonly key: Structural<K>;
    readonly value: V;
  }

  const entriesBySerializedKey = new Map<string, StructuralEntry<K, V>>();

  const map: StructuralMap<K, V> = {
    get size() {
      return entriesBySerializedKey.size;
    },

    has: (key) => entriesBySerializedKey.has(getSerializedKey(key)),

    get: (key) => entriesBySerializedKey.get(getSerializedKey(key))?.value,

    getKey: (key) => entriesBySerializedKey.get(getSerializedKey(key))?.key,

    set: (key, value) => {
      const serializedKey = getSerializedKey(key);
      const existingEntry = entriesBySerializedKey.get(serializedKey);
      entriesBySerializedKey.set(serializedKey, {
        key: existingEntry?.key ?? key,
        value,
      });
      return map;
    },

    delete: (key) => entriesBySerializedKey.delete(getSerializedKey(key)),

    clear: () => {
      entriesBySerializedKey.clear();
    },

    keys: function* () {
      for (const entry of entriesBySerializedKey.values()) {
        yield entry.key;
      }
    },

    values: function* () {
      for (const entry of entriesBySerializedKey.values()) {
        yield entry.value;
      }
    },

    entries: function* () {
      for (const entry of entriesBySerializedKey.values()) {
        yield [entry.key, entry.value] as const;
      }
    },

    forEach: (callback) => {
      for (const entry of entriesBySerializedKey.values()) {
        callback(entry.value, entry.key, map);
      }
    },

    [Symbol.iterator]: function () {
      return map.entries();
    },
  };

  if (entries) {
    for (const [key, value] of entries) {
      map.set(key, value);
    }
  }

  return map;
};

/**
 * `Set`-like collection keyed by {@link StructuralKey}.
 *
 * Use this when values should compare by structural value instead of identity
 * and callers need access to the canonical inserted representative.
 */
export interface StructuralSet<K> extends Iterable<Structural<K>> {
  readonly size: number;
  readonly has: (key: Structural<K>) => boolean;
  readonly get: (key: Structural<K>) => Structural<K> | undefined;
  readonly add: (key: Structural<K>) => StructuralSet<K>;
  readonly delete: (key: Structural<K>) => boolean;
  readonly clear: () => void;
  readonly keys: () => IterableIterator<Structural<K>>;
  readonly values: () => IterableIterator<Structural<K>>;
  readonly entries: () => IterableIterator<
    readonly [Structural<K>, Structural<K>]
  >;
  readonly forEach: (
    callback: (
      value: Structural<K>,
      key: Structural<K>,
      set: StructuralSet<K>,
    ) => void,
  ) => void;
  readonly [Symbol.iterator]: () => IterableIterator<Structural<K>>;
}

/** Creates {@link StructuralSet}. */
export const createStructuralSet = <K>(
  values?: Iterable<Structural<K>>,
): StructuralSet<K> => {
  const map = createStructuralMap<K, true>();

  const set: StructuralSet<K> = {
    get size() {
      return map.size;
    },

    has: (key) => map.has(key),

    get: (key) => map.getKey(key),

    add: (key) => {
      map.set(key, true);
      return set;
    },

    delete: (key) => map.delete(key),

    clear: () => {
      map.clear();
    },

    keys: () => map.keys(),

    values: () => map.keys(),

    entries: function* () {
      for (const key of map.keys()) {
        yield [key, key] as const;
      }
    },

    forEach: (callback) => {
      for (const key of map.keys()) {
        callback(key, key, set);
      }
    },

    [Symbol.iterator]: function () {
      return set.keys();
    },
  };

  if (values) {
    for (const value of values) {
      set.add(value);
    }
  }

  return set;
};

/**
 * Bidirectional relation between structural keys.
 *
 * This is the structural counterpart to {@link createRelation}. Pairs are
 * deduplicated by structural equality on both sides.
 *
 * Use this when both sides are {@link StructuralKey} values.
 *
 * The relation is set-like, not multiset-like. Repeated adds of the same
 * logical pair return `false` and do not increase counts.
 *
 * **Warning**: Both sides must never be mutated. Structural ids are cached by
 * object identity, so mutation is unsupported.
 */
export interface StructuralRelation<A, B> {
  readonly size: () => number;
  readonly aCount: () => number;
  readonly bCount: () => number;
  readonly bCountForA: (a: Structural<A>) => number;
  readonly aCountForB: (b: Structural<B>) => number;
  readonly has: (a: Structural<A>, b: Structural<B>) => boolean;
  readonly hasA: (a: Structural<A>) => boolean;
  readonly hasB: (b: Structural<B>) => boolean;
  readonly iterateA: (b: Structural<B>) => IterableIterator<Structural<A>>;
  readonly iterateB: (a: Structural<A>) => IterableIterator<Structural<B>>;
  readonly [Symbol.iterator]: () => IterableIterator<
    readonly [Structural<A>, Structural<B>]
  >;
  readonly add: (a: Structural<A>, b: Structural<B>) => boolean;
  readonly remove: (a: Structural<A>, b: Structural<B>) => boolean;
  readonly removeByA: (a: Structural<A>) => boolean;
  readonly removeByB: (b: Structural<B>) => boolean;
  readonly clear: () => void;
}

/** Creates {@link StructuralRelation}. */
export const createStructuralRelation = <A, B>(): StructuralRelation<A, B> => {
  const bByA = createStructuralMap<A, StructuralSet<B>>();
  const aByB = createStructuralMap<B, StructuralSet<A>>();
  let sizeInternal = 0;

  const removePair = (a: Structural<A>, b: Structural<B>): void => {
    const relatedB = bByA.get(a);
    assertStructuralRelationMappingConsistency(relatedB);
    assertStructuralRelationMappingConsistency(relatedB.has(b));

    relatedB.delete(b);
    if (relatedB.size === 0) {
      bByA.delete(a);
    }

    const relatedA = aByB.get(b);
    assertStructuralRelationMappingConsistency(relatedA);
    assertStructuralRelationMappingConsistency(relatedA.has(a));

    relatedA.delete(a);
    if (relatedA.size === 0) {
      aByB.delete(b);
    }

    sizeInternal -= 1;
  };

  return {
    size: () => sizeInternal,

    aCount: () => bByA.size,

    bCount: () => aByB.size,

    bCountForA: (a) => {
      const relatedB = bByA.get(a);
      return relatedB ? relatedB.size : 0;
    },

    aCountForB: (b) => {
      const relatedA = aByB.get(b);
      return relatedA ? relatedA.size : 0;
    },

    has: (a, b) => {
      const relatedB = bByA.get(a);
      return relatedB ? relatedB.has(b) : false;
    },

    hasA: (a) => bByA.has(a),
    hasB: (b) => aByB.has(b),

    iterateA: (b) => {
      const relatedA = aByB.get(b);
      if (!relatedA)
        return emptyArray.values() as IterableIterator<Structural<A>>;
      return relatedA.keys();
    },

    iterateB: (a) => {
      const relatedB = bByA.get(a);
      if (!relatedB)
        return emptyArray.values() as IterableIterator<Structural<B>>;
      return relatedB.keys();
    },

    *[Symbol.iterator](): IterableIterator<
      readonly [Structural<A>, Structural<B>]
    > {
      for (const [a, relatedB] of bByA) {
        for (const b of relatedB.keys()) {
          yield [a, b] as const;
        }
      }
    },

    add: (a, b) => {
      const canonicalA = bByA.getKey(a) ?? a;
      const canonicalB = aByB.getKey(b) ?? b;

      let relatedB = bByA.get(canonicalA);
      if (relatedB?.has(canonicalB)) return false;
      if (!relatedB) {
        relatedB = createStructuralSet<B>();
        bByA.set(canonicalA, relatedB);
      }
      relatedB.add(canonicalB);

      let relatedA = aByB.get(canonicalB);
      if (!relatedA) {
        relatedA = createStructuralSet<A>();
        aByB.set(canonicalB, relatedA);
      }
      relatedA.add(canonicalA);

      sizeInternal += 1;
      return true;
    },

    remove: (a, b) => {
      const relatedB = bByA.get(a);
      if (!relatedB?.has(b)) return false;
      removePair(a, b);
      return true;
    },

    removeByA: (a) => {
      const relatedB = bByA.get(a);
      if (!relatedB) return false;
      for (const b of [...relatedB.keys()]) {
        removePair(a, b);
      }
      return true;
    },

    removeByB: (b) => {
      const relatedA = aByB.get(b);
      if (!relatedA) return false;
      for (const a of [...relatedA.keys()]) {
        removePair(a, b);
      }
      return true;
    },

    clear: () => {
      bByA.clear();
      aByB.clear();
      sizeInternal = 0;
    },
  };
};

const assertStructuralRelationMappingConsistency: (
  condition: unknown,
) => asserts condition = (condition) => {
  assert(condition, "Structural relation mapping inconsistency");
};

const serializedStructuralKeyByObject = new WeakMap<object, string>();

const getSerializedKey = (
  value: unknown,
  path: Set<object> = new Set(),
): string => {
  switch (typeof value) {
    case "string":
      return `s:${JSON.stringify(value)}`;
    case "number":
      if (Number.isNaN(value)) return "n:NaN";
      if (value === Number.POSITIVE_INFINITY) return "n:Infinity";
      if (value === Number.NEGATIVE_INFINITY) return "n:-Infinity";
      return Object.is(value, -0) ? "n:0" : `n:${value}`;
    case "boolean":
      return value ? "b:true" : "b:false";
    case "object": {
      if (value === null) return "l:null";

      const cachedSerializedKey = serializedStructuralKeyByObject.get(value);
      if (cachedSerializedKey) return cachedSerializedKey;

      let serializedKey: string;

      if (Array.isArray(value)) {
        assert(!path.has(value), "Structural keys must not contain cycles.");
        path.add(value);
        serializedKey = getSerializedArrayKey(value, path);
        path.delete(value);
      } else if (isPlainObject(value)) {
        assert(!path.has(value), "Structural keys must not contain cycles.");
        path.add(value);
        serializedKey = getSerializedObjectKey(value, path);
        path.delete(value);
      } else if (Uint8Array.is(value)) {
        serializedKey = `u:${uint8ArrayToBase64Url(value)}`;
      } else {
        assert(
          false,
          "Structural keys must be JSON-like values or Uint8Array.",
        );
      }

      serializedStructuralKeyByObject.set(value, serializedKey);
      return serializedKey;
    }
    default:
      assert(false, "Structural keys must be JSON-like values or Uint8Array.");
  }
};

const getSerializedArrayKey = (
  value: ReadonlyArray<unknown>,
  path: Set<object>,
): string =>
  `a:[${Array.from(value, (item) => getSerializedKey(item, path)).join(",")}]`;

const getSerializedObjectKey = (value: object, path: Set<object>): string => {
  const valueRecord = value as Record<string, unknown>;

  const entries = Object.keys(valueRecord)
    .toSorted()
    .map((key) => {
      const item = valueRecord[key];
      return `${JSON.stringify(key)}:${getSerializedKey(item, path)}`;
    });

  return `o:{${entries.join(",")}}`;
};
