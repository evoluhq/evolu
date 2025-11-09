/**
 * Manages multiple named instances using the Multiton pattern.
 *
 * Unlike Singleton (one instance globally), Multiton maintains one instance per
 * unique key.
 *
 * **Note:** Multiton is generally considered an anti-pattern because it
 * introduces hidden global state and makes testing harder. Use it only when
 * there's a compelling reason, such as:
 *
 * - Supporting hot reloading while preserving state across module reloads
 * - Enforcing physical constraints (e.g., preventing multiple SQLite connections
 *   to the same database, which causes corruption)
 * - Managing resources where instance identity is intrinsic to correctness
 *
 * For most cases, prefer explicit dependency injection and instance management.
 *
 * Compatibility and future work:
 *
 * - We will adopt the ECMAScript `DisposableStack` for structured cleanup and
 *   robust error handling as runtimes converge (Node.js ≥ 24, Safari stable).
 *   Safari Technology Preview already includes support, so broad availability
 *   is expected soon.
 * - Until then, this module uses a simple Map-based approach and calls
 *   `instance[Symbol.dispose]()` directly during disposal.
 * - We don't use a polyfill because we avoid global mutation, keep bundles lean,
 *   and prefer explicit feature detection.
 * - MDN reference:
 *   https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/DisposableStack
 */
export interface Multiton<K extends string, T extends Disposable>
  extends Disposable {
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
   * Removes and disposes an instance by key. Returns `true` if the instance
   * existed and was disposed, `false` otherwise.
   */
  readonly disposeInstance: (key: K) => boolean;
}

/** Creates a {@link Multiton} instance manager. */
export const createMultiton = <
  K extends string,
  T extends Disposable,
>(): Multiton<K, T> => {
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

    disposeInstance: (key) => {
      const instance = instances.get(key);
      if (instance) {
        instance[Symbol.dispose]();
        return instances.delete(key);
      }
      return false;
    },

    [Symbol.dispose]: () => {
      for (const instance of instances.values()) {
        instance[Symbol.dispose]();
      }
      instances.clear();
    },
  };
};
