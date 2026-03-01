/**
 * A multiton for disposable instances.
 *
 * @module
 */

import { assert } from "./Assert.js";
import { ok } from "./Result.js";
import { createMutex, unabortable, type Mutex, type Task } from "./Task.js";

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
 *
 * // TODO: Example.
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

/**
 * A Task-based multiton for disposable instances.
 *
 * This is an async-friendly shape for cases where creating, disposing, or
 * cache-hit refresh logic needs Task dependencies.
 */
export interface TaskInstances<
  K extends string,
  T extends AsyncDisposable,
  D = unknown,
> extends AsyncDisposable {
  /**
   * Ensures an instance exists for the given key.
   *
   * If missing, `create` is executed and stored. If present, `onCacheHit` runs
   * with the existing instance.
   */
  readonly ensure: (
    key: K,
    create: Task<T, never, D>,
    onCacheHit?: (instance: T) => Task<void, never, D>,
  ) => Task<T, never, D>;

  /** Gets an instance by key, or `null` when missing. */
  readonly get: (key: K) => Task<T | null, never, D>;

  /** Checks if an instance exists for the given key. */
  readonly has: (key: K) => Task<boolean, never, D>;

  /**
   * Deletes and disposes an instance by key.
   *
   * Returns `true` if an instance existed, otherwise `false`.
   */
  readonly delete: (
    key: K,
    onDelete?: (instance: T) => Task<void, never, D>,
  ) => Task<boolean, never, D>;
}

/** Creates a {@link TaskInstances}. */
export const createTaskInstances = <
  K extends string,
  T extends AsyncDisposable,
  D = unknown,
>(): TaskInstances<K, T, D> => {
  const instances = new Map<K, T>();
  const mutexByKey = createInstances<K, Mutex>();

  return {
    ensure:
      (
        key: K,
        create: Task<T, never, D>,
        onCacheHit?: (instance: T) => Task<void, never, D>,
      ) =>
      async (run) => {
        const mutex = mutexByKey.ensure(key, createMutex);
        const result = await run(
          unabortable(
            mutex.withLock(async (run) => {
              let instance = instances.get(key);

              if (instance == null) {
                instance = await run.orThrow(unabortable(create));
                instances.set(key, instance);
              } else if (onCacheHit) {
                await run.orThrow(unabortable(onCacheHit(instance)));
              }

              return ok(instance);
            }),
          ),
        );

        assert(result.ok, "Unabortable ensure lock must not abort");
        return ok(result.value);
      },

    get: (key) => () => ok(instances.get(key) ?? null),

    has: (key) => () => ok(instances.has(key)),

    delete:
      (key: K, onDelete?: (instance: T) => Task<void, never, D>) =>
      async (run) => {
        const mutex = mutexByKey.get(key);
        if (mutex == null) return ok(false);

        const result = await run(
          unabortable(
            mutex.withLock(async (run) => {
              const instance = instances.get(key);
              if (instance == null) return ok(false);

              instances.delete(key);

              if (onDelete) {
                await run.orThrow(unabortable(onDelete(instance)));
              }

              await instance[Symbol.asyncDispose]();
              return ok(true);
            }),
          ),
        );

        assert(result.ok, "Unabortable delete lock must not abort");
        return ok(result.value);
      },

    [Symbol.asyncDispose]: async () => {
      const errors: Array<unknown> = [];
      for (const instance of instances.values()) {
        try {
          await instance[Symbol.asyncDispose]();
        } catch (error) {
          errors.push(error);
        }
      }

      instances.clear();
      mutexByKey[Symbol.dispose]();

      if (errors.length === 1) throw errors[0];
      if (errors.length > 1) {
        throw new AggregateError(errors, "Multiple disposal errors occurred");
      }
    },
  };
};
