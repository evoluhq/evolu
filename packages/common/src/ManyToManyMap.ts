import { assert } from "./Assert.js";

/**
 * Bidirectional many-to-many map between keys and values.
 *
 * Why useful:
 *
 * - Provides O(1) (amortized) forward lookup (key -> values) and reverse lookup
 *   (value -> keys) without maintaining two maps manually and risking them
 *   diverging.
 * - Natural fit for pub/sub style relations such as ownerId ↔ WebSocket, tag ↔
 *   item, user ↔ role, entity ↔ subscription where both directions are
 *   frequently queried.
 * - Supports fast membership tests via `hasPair`, `hasKey`, and `hasValue`.
 * - Iteration helpers (`forEach`, iterator) allow treating the structure as an
 *   edge list when needed.
 *
 * Complexity:
 *
 * - `add` / `remove` / `has*` / `get*` each perform a constant number of Map/Set
 *   operations (O(1) expected).
 * - `deleteKey` and `deleteValue` are O(d) where d is the number of associated
 *   values / keys (the degree). This is optimal because every associated pair
 *   must be touched once.
 * - In the Relay use case a socket (value) typically has only dozens of owners
 *   (degree small), and connection closes (triggering deleteValue) are
 *   relatively infrequent, so O(d) is acceptable.
 *
 * Object identity:
 *
 * - Keys and values are compared by reference (standard Map / Set semantics).
 *   Structural hashing of objects in JavaScript is non-trivial, can be
 *   expensive, and collision-prone if done naively. Prefer using stable
 *   primitive identifiers (ids, strings) instead of attempting to hash full
 *   object structures.
 * - If structural equivalence is truly required, wrap objects in an adapter that
 *   supplies a canonical hash/id and stores/retrieves the original objects
 *   separately. This is a rare need; avoid unless you have clear requirements.
 */
export interface ManyToManyMap<K, V> {
  /**
   * Adds a key-value association to the map. Returns true if the pair was newly
   * added, false if it already existed.
   */
  add: (key: K, value: V) => boolean;

  /**
   * Removes a specific key-value association. Returns true if the pair existed
   * and was removed, false if it was not present.
   */
  remove: (key: K, value: V) => boolean;

  /**
   * Gets all values associated with a key. Returned set is the internal Set
   * instance typed as ReadonlySet. Do not mutate.
   */
  getValues: (key: K) => ReadonlySet<V> | undefined;

  /**
   * Gets all keys associated with a value. Returned set is the internal Set
   * instance typed as ReadonlySet. Do not mutate.
   */
  getKeys: (value: V) => ReadonlySet<K> | undefined;

  /**
   * Iterates over each key-value pair (in insertion order of keys, then values
   * per key).
   */
  forEach: (callback: (key: K, value: V) => void) => void;

  /**
   * Iterator over all key-value pairs enabling for..of and spread. Yields
   * readonly [key, value] tuples.
   */
  readonly [Symbol.iterator]: () => IterableIterator<readonly [K, V]>;

  /** Checks if a specific key-value pair exists. */
  hasPair: (key: K, value: V) => boolean;

  /** Checks if a key exists in the map. */
  hasKey: (key: K) => boolean;

  /** Checks if a value exists in the map. */
  hasValue: (value: V) => boolean;

  /** Deletes all associations for a key. */
  deleteKey: (key: K) => boolean;

  /** Deletes all associations for a value. */
  deleteValue: (value: V) => boolean;

  /** Clears all associations in the map. */
  clear: () => void;

  /** Number of distinct keys currently present. */
  keyCount: () => number;
  /** Number of distinct values currently present. */
  valueCount: () => number;
  /** Number of key-value pairs (associations) currently stored. */
  pairCount: () => number;
}

/** Creates a {@link ManyToManyMap}. */
export const createManyToManyMap = <K, V>(): ManyToManyMap<K, V> => {
  const forwardMap = new Map<K, Set<V>>();
  const reverseMap = new Map<V, Set<K>>();
  let pairCountInternal = 0;

  const map: ManyToManyMap<K, V> = {
    add(key: K, value: V) {
      let values = forwardMap.get(key);
      if (values?.has(value)) return false;
      if (!values) {
        values = new Set<V>();
        forwardMap.set(key, values);
      }
      values.add(value);

      let keys = reverseMap.get(value);
      if (!keys) {
        keys = new Set<K>();
        reverseMap.set(value, keys);
      }
      keys.add(key);
      pairCountInternal++;
      return true;
    },

    remove(key: K, value: V) {
      const values = forwardMap.get(key);
      if (!values?.has(value)) return false;

      values.delete(value);
      if (values.size === 0) {
        forwardMap.delete(key);
      }

      const keys = reverseMap.get(value);
      assert(keys, "Key-value mapping inconsistency");

      keys.delete(key);
      if (keys.size === 0) {
        reverseMap.delete(value);
      }
      pairCountInternal--;
      return true;
    },

    getValues(key: K): ReadonlySet<V> | undefined {
      return forwardMap.get(key);
    },

    getKeys(value: V): ReadonlySet<K> | undefined {
      return reverseMap.get(value);
    },

    forEach(callback: (key: K, value: V) => void) {
      for (const [key, values] of forwardMap) {
        for (const value of values) callback(key, value);
      }
    },

    [Symbol.iterator](): IterableIterator<readonly [K, V]> {
      const iterator = function* () {
        for (const [key, values] of forwardMap) {
          for (const value of values) {
            yield [key, value] as const;
          }
        }
      };
      return iterator();
    },

    hasPair(key: K, value: V) {
      const values = forwardMap.get(key);
      return values?.has(value) ?? false;
    },

    hasKey(key: K) {
      return forwardMap.has(key);
    },

    hasValue(value: V) {
      return reverseMap.has(value);
    },

    deleteKey(key: K) {
      const values = forwardMap.get(key);
      if (!values) return false;
      const removed = values.size;
      for (const value of values) {
        const keys = reverseMap.get(value);
        if (keys) {
          keys.delete(key);
          if (keys.size === 0) {
            reverseMap.delete(value);
          }
        }
      }
      forwardMap.delete(key);
      pairCountInternal -= removed;
      return true;
    },

    deleteValue(value: V) {
      const keys = reverseMap.get(value);
      if (!keys) return false;
      const removed = keys.size;
      for (const key of keys) {
        const values = forwardMap.get(key);
        if (values) {
          values.delete(value);
          if (values.size === 0) {
            forwardMap.delete(key);
          }
        }
      }
      reverseMap.delete(value);
      pairCountInternal -= removed;
      return true;
    },

    clear() {
      forwardMap.clear();
      reverseMap.clear();
      pairCountInternal = 0;
    },

    keyCount() {
      return forwardMap.size;
    },

    valueCount() {
      return reverseMap.size;
    },

    pairCount() {
      return pairCountInternal;
    },
  };

  return map;
};
