/**
 * Reference counting for arbitrary keys.
 *
 * @module
 */

import type { Option } from "./Option.js";
import { none, some } from "./Option.js";
import { NonNegativeInt, PositiveInt } from "./Type.js";

/**
 * Tracks usage counts for keys.
 *
 * Counts are always positive for tracked keys. A key is removed when its count
 * reaches zero.
 *
 * Keys use reference identity, the same as `Map` keys.
 */
export interface RefCount<TKey> {
  /** Increments key count and returns the new count. */
  readonly increment: (key: TKey) => PositiveInt;

  /**
   * Decrements key count and returns the new count.
   *
   * Returns {@link none} when the key is not tracked.
   */
  readonly decrement: (key: TKey) => Option<NonNegativeInt>;

  /** Gets current count for key. Returns `0` when the key is not tracked. */
  readonly getCount: (key: TKey) => NonNegativeInt;

  /** Returns `true` when the key is tracked with count greater than zero. */
  readonly has: (key: TKey) => boolean;

  /** Returns all currently tracked keys. */
  readonly keys: () => ReadonlySet<TKey>;

  /** Clears all tracked keys and counts. */
  readonly clear: () => void;
}

/** Creates {@link RefCount}. */
export const createRefCount = <TKey>(): RefCount<TKey> => {
  const counts = new Map<TKey, PositiveInt>();
  const zero = NonNegativeInt.orThrow(0);

  return {
    increment: (key) => {
      const nextCount = PositiveInt.orThrow((counts.get(key) ?? 0) + 1);
      counts.set(key, nextCount);
      return nextCount;
    },

    decrement: (key) => {
      const count = counts.get(key);
      if (count == null) return none;

      if (count === 1) {
        counts.delete(key);
        return some(zero);
      }

      const nextCount = PositiveInt.orThrow(count - 1);
      counts.set(key, nextCount);
      return some(nextCount);
    },

    getCount: (key) => counts.get(key) ?? zero,

    has: (key) => counts.has(key),

    keys: () => new Set(counts.keys()),

    clear: () => {
      counts.clear();
    },
  };
};
