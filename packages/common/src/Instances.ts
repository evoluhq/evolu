/**
 * A multiton for disposable instances.
 *
 * @module
 */

/**
 * A multiton for disposable instances.
 *
 * A multiton guarantees exactly one instance per key.
 *
 * Use cases:
 *
 * - One Mutex per key to prevent concurrent writes
 * - Preserving state during hot module reloading
 *
 * Note: Do not use this as global shared state. Use it locally or pass it as a
 * dependency instead. The only exception is hot reloading, where Evolu uses
 * this to keep a single instance across module reloads. Bundler hot-reload APIs
 * are not consistent across environments, so this is a portable fallback.
 * Having two Evolu instances with the same name would mean two SQLite
 * connections to the same file, which could corrupt data.
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
      const errors: Array<unknown> = [];
      for (const instance of instances.values()) {
        try {
          instance[Symbol.dispose]();
        } catch (error) {
          errors.push(error);
        }
      }

      instances.clear();

      if (errors.length === 1) throw errors[0];
      if (errors.length > 1) {
        throw new AggregateError(errors, "Multiple disposal errors occurred");
      }
    },
  };
};
