/**
 * A keyed instance registry for disposable instances.
 *
 * @module
 */

/**
 * A keyed instance registry for disposable instances.
 *
 * Guarantees exactly one live instance per key. Also known as a multiton (a
 * keyed singleton).
 *
 * ### Example
 *
 * Real usage from `local-first/Relay.ts`: one mutex per owner to serialize
 * writes for the same owner.
 *
 * ```ts
 * const ownerMutexes = createInstances<OwnerId, Mutex>();
 *
 * const result = await run(
 *   ownerMutexes.ensure(ownerId, createMutex).withLock(async () => {
 *     // Write messages for ownerId.
 *     return ok();
 *   }),
 * );
 * ```
 */
export interface Instances<
  K extends string,
  T extends Disposable,
> extends Disposable {
  /**
   * Ensures an instance exists for the given key, creating it if necessary. If
   * the instance already exists, the optional `onCacheHit` callback is invoked
   * to update the existing instance.
   */
  readonly ensure: (
    key: K,
    create: () => T,
    onCacheHit?: (instance: T) => void,
  ) => T;

  /** Gets an instance by key, or returns `null` if it doesn't exist. */
  readonly get: (key: K) => T | null;

  /** Checks if an instance exists for the given key. */
  readonly has: (key: K) => boolean;

  /**
   * Deletes and disposes an instance by key. Returns `true` if the instance
   * existed and was deleted, `false` otherwise.
   */
  readonly delete: (key: K) => boolean;
}

/** Creates an {@link Instances}. */
export const createInstances = <
  K extends string,
  T extends Disposable,
>(): Instances<K, T> => {
  const instances = new Map<K, T>();

  return {
    ensure: (key, create, onCacheHit) => {
      let instance = instances.get(key);

      if (instance == null) {
        instance = create();
        instances.set(key, instance);
      } else if (onCacheHit) {
        onCacheHit(instance);
      }

      return instance;
    },

    get: (key) => instances.get(key) ?? null,

    has: (key) => instances.has(key),

    delete: (key) => {
      const instance = instances.get(key);
      if (instance == null) return false;

      instances.delete(key);
      instance[Symbol.dispose]();

      return true;
    },

    [Symbol.dispose]: () => {
      using stack = new globalThis.DisposableStack();

      for (const instance of instances.values()) {
        stack.use(instance);
      }

      instances.clear();
    },
  };
};
