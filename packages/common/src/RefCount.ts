/**
 * Reference counting helpers.
 *
 * @module
 */

import { assert } from "./Assert.ts";
import { disposable, identity } from "./Function.ts";
import { createLookupMap, type Lookup, type LookupOption } from "./Lookup.ts";
import { NonNegativeInt, PositiveInt, zeroNonNegativeInt } from "./Type.ts";

/**
 * Reference count for one retained value.
 *
 * Decrementing below zero is a programmer error checked with {@link assert}.
 */
export interface RefCount extends Disposable {
  /** Increments the count and returns the new count. */
  readonly increment: () => PositiveInt;

  /**
   * Decrements the count and returns the new count.
   *
   * Decrementing below zero is a programmer error checked with {@link assert}.
   */
  readonly decrement: () => NonNegativeInt;

  /** Returns the current count. */
  readonly getCount: () => NonNegativeInt;
}

/** Creates {@link RefCount}. */
export const createRefCount = (): RefCount => {
  let count = zeroNonNegativeInt;

  return disposable<RefCount>({
    increment: () => {
      const nextCount = PositiveInt.orThrow(count + 1);
      count = nextCount;
      return nextCount;
    },

    decrement: () => {
      assert(count > 0, "RefCount must not be decremented below zero.");
      count = NonNegativeInt.orThrow(count - 1);
      return count;
    },

    getCount: () => count,
  });
};

/**
 * Reference counts keyed by logical identity.
 *
 * By default, {@link createRefCountByKey} uses reference identity, the same as
 * `Map` keys. Callers may instead provide a {@link Lookup lookup} so logical
 * equality is based on a derived stable key. Decrementing a missing key is a
 * programmer error checked with {@link assert}.
 */
export interface RefCountByKey<TKey> extends Disposable {
  /** Increments key count and returns the new count. */
  readonly increment: (key: TKey) => PositiveInt;

  /**
   * Decrements key count and returns the new count.
   *
   * Decrementing a missing key is a programmer error checked with
   * {@link assert}.
   */
  readonly decrement: (key: TKey) => NonNegativeInt;

  /** Gets current count for key. Returns `0` when the key is not tracked. */
  readonly getCount: (key: TKey) => NonNegativeInt;

  /** Returns `true` when the key is tracked with count greater than zero. */
  readonly has: (key: TKey) => boolean;

  /** Returns all currently tracked keys. */
  readonly keys: () => ReadonlySet<TKey>;
}

/** Options for {@link createRefCountByKey}. */
export interface CreateRefCountByKeyOptions<
  TKey,
  L = TKey,
> extends LookupOption<TKey, L> {}

/** Creates {@link RefCountByKey}. */
export function createRefCountByKey<TKey = unknown>(): RefCountByKey<TKey>;
export function createRefCountByKey<TKey, L>(
  options: CreateRefCountByKeyOptions<TKey, L>,
): RefCountByKey<TKey>;
export function createRefCountByKey<TKey, L = TKey>({
  lookup = identity as Lookup<TKey, L>,
}: CreateRefCountByKeyOptions<TKey, L> = {}): RefCountByKey<TKey> {
  using disposer = new DisposableStack();

  const refCountByKey = createLookupMap<TKey, RefCount, L>({ lookup });
  disposer.defer(() => {
    refCountByKey.clear();
  });

  return disposable<RefCountByKey<TKey>>(
    {
      increment: (key) =>
        refCountByKey.getOrInsertComputed(key, createRefCount).increment(),

      decrement: (key) => {
        const refCount = refCountByKey.get(key);
        assert(
          refCount,
          "RefCount must not be decremented for an untracked key.",
        );
        const nextCount = refCount.decrement();
        if (nextCount === 0) {
          refCountByKey.delete(key);
          refCount[Symbol.dispose]();
        }
        return nextCount;
      },

      getCount: (key) =>
        refCountByKey.get(key)?.getCount() ?? zeroNonNegativeInt,

      has: (key) => refCountByKey.has(key),

      keys: () => new Set(refCountByKey.keys()),
    },
    disposer,
  );
}
