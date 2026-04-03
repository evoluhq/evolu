/**
 * Cache implementations including LRU eviction.
 *
 * @module
 */

import { PositiveInt } from "./Type.js";

/**
 * Generic cache interface providing basic key-value storage operations.
 *
 * Keys are compared by reference (standard Map semantics).
 *
 * Note: Cache has a Map-like API but does not extend Map because it behaves
 * differently. Eviction policies (like LRU) can remove entries implicitly, and
 * code that accepts a Map can assume values remain until deleted explicitly. An
 * evicting cache is not a safe substitute for Map (Liskov Substitution
 * Principle).
 */
export interface Cache<K, V> {
  /** Checks if a key exists in the cache. */
  has: (key: K) => boolean;

  /** Retrieves the value for a key, or undefined if not present. */
  get: (key: K) => V | undefined;

  /** Stores a key-value pair in the cache. */
  set: (key: K, val: V) => void;

  /** Removes a key from the cache. */
  delete: (key: K) => void;

  /** Returns a readonly view of the internal Map. */
  readonly map: ReadonlyMap<K, V>;
}

/**
 * Creates an LRU (least recently used) cache with a maximum capacity.
 *
 * When the cache reaches capacity, the least recently used entry is evicted.
 * Both `get` and `set` operations update the access order.
 *
 * ### Example
 *
 * ```ts
 * const cache = createLruCache<string, number>(2);
 * cache.set("a", 1);
 * cache.set("b", 2);
 * cache.set("c", 3); // Evicts "a"
 * cache.has("a"); // false
 * ```
 */
export const createLruCache = <K, V>(capacity: PositiveInt): Cache<K, V> => {
  const internalMap = new Map<K, V>();

  return {
    has: (key) => internalMap.has(key),

    get: (key) => {
      const value = internalMap.get(key);
      if (value === undefined) return undefined;

      // Move to end (most recently used)
      internalMap.delete(key);
      internalMap.set(key, value);
      return value;
    },

    set: (key, val) => {
      // If key exists, delete it first to update order
      if (internalMap.has(key)) {
        internalMap.delete(key);
      } else if (internalMap.size === capacity) {
        // Evict least recently used (first entry)
        const firstKey = internalMap.keys().next().value as K;
        internalMap.delete(firstKey);
      }

      internalMap.set(key, val);
    },

    delete: (key) => {
      internalMap.delete(key);
    },

    map: internalMap,
  };
};
