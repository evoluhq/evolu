/**
 * Reference counting helpers.
 *
 * @module
 */

import { assert, assertNotDisposed } from "./Assert.js";
import { identity } from "./Function.js";
import { createLookupMap, type Lookup, type LookupOption } from "./Lookup.js";
import { NonNegativeInt, PositiveInt, zeroNonNegativeInt } from "./Type.js";

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

  /** Disposes and invalidates the helper. Further method calls throw. */
  readonly [Symbol.dispose]: () => void;
}

/** Creates {@link RefCount}. */
export const createRefCount = (): RefCount => {
  let count = zeroNonNegativeInt;
  const stack = new DisposableStack();
  stack.defer(() => {
    count = zeroNonNegativeInt;
  });
  const moved = stack.move();

  return {
    increment: () => {
      assertNotDisposed(moved);
      const nextCount = PositiveInt.orThrow(count + 1);
      count = nextCount;
      return nextCount;
    },

    decrement: () => {
      assertNotDisposed(moved);
      assert(count > 0, "RefCount must not be decremented below zero.");
      count = NonNegativeInt.orThrow(count - 1);
      return count;
    },

    getCount: () => {
      assertNotDisposed(moved);
      return count;
    },

    [Symbol.dispose]: () => moved.dispose(),
  };
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

  /** Disposes and invalidates the helper. Further method calls throw. */
  readonly [Symbol.dispose]: () => void;
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
  const stack = new DisposableStack();

  const refCountByKey = stack.adopt(
    createLookupMap<TKey, RefCount, L>({ lookup }),
    (refCountByKey) => {
      for (const refCount of refCountByKey.values()) refCount[Symbol.dispose]();
      refCountByKey.clear();
    },
  );

  const moved = stack.move();

  const getRefCount = (key: TKey): RefCount => {
    let refCount = refCountByKey.get(key);
    if (!refCount) {
      refCount = createRefCount();
      refCountByKey.set(key, refCount);
    }
    return refCount;
  };

  return {
    increment: (key) => {
      assertNotDisposed(moved);
      return getRefCount(key).increment();
    },

    decrement: (key) => {
      assertNotDisposed(moved);
      const refCount = getRefCount(key);
      const nextCount = refCount.decrement();
      if (nextCount === 0) {
        refCount[Symbol.dispose]();
        refCountByKey.delete(key);
      }
      return nextCount;
    },

    getCount: (key) => {
      assertNotDisposed(moved);
      return refCountByKey.get(key)?.getCount() ?? zeroNonNegativeInt;
    },

    has: (key) => {
      assertNotDisposed(moved);
      return refCountByKey.has(key);
    },

    keys: () => {
      assertNotDisposed(moved);
      return new Set(refCountByKey.keys());
    },

    [Symbol.dispose]: () => moved.dispose(),
  };
}
