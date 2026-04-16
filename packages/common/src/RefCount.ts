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
  // We use DisposableStack only because of assertNotDisposed.
  using disposer = new DisposableStack();
  let count = zeroNonNegativeInt;
  const disposables = disposer.move();

  return {
    increment: () => {
      assertNotDisposed(disposables);
      const nextCount = PositiveInt.orThrow(count + 1);
      count = nextCount;
      return nextCount;
    },

    decrement: () => {
      assertNotDisposed(disposables);
      assert(count > 0, "RefCount must not be decremented below zero.");
      count = NonNegativeInt.orThrow(count - 1);
      return count;
    },

    getCount: () => {
      assertNotDisposed(disposables);
      return count;
    },

    [Symbol.dispose]: () => disposables.dispose(),
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
  // We use DisposableStack only because of assertNotDisposed.
  using disposer = new DisposableStack();

  const refCountByKey = disposer.adopt(
    createLookupMap<TKey, RefCount, L>({ lookup }),
    (refCountByKey) => {
      using disposer = new DisposableStack();
      disposer.defer(() => {
        refCountByKey.clear();
      });
      for (const refCount of refCountByKey.values()) {
        disposer.use(refCount);
      }
    },
  );

  const disposables = disposer.move();

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
      assertNotDisposed(disposables);
      return getRefCount(key).increment();
    },

    decrement: (key) => {
      assertNotDisposed(disposables);
      const refCount = getRefCount(key);
      const nextCount = refCount.decrement();
      if (nextCount === 0) {
        refCountByKey.delete(key);
        refCount[Symbol.dispose]();
      }
      return nextCount;
    },

    getCount: (key) => {
      assertNotDisposed(disposables);
      return refCountByKey.get(key)?.getCount() ?? zeroNonNegativeInt;
    },

    has: (key) => {
      assertNotDisposed(disposables);
      return refCountByKey.has(key);
    },

    keys: () => {
      assertNotDisposed(disposables);
      return new Set(refCountByKey.keys());
    },

    [Symbol.dispose]: () => disposables.dispose(),
  };
}
