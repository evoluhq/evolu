/**
 * {@link LockManager} helpers.
 *
 * @module
 */

import { createRandomBytes } from "./Crypto.js";
import { tryAsync } from "./Result.js";
import { AbortError, type Task } from "./Task.js";
import { createId } from "./Type.js";

/**
 * Dependency wrapper for {@link LockManager}.
 *
 * For React Native, use the `lockManager` ponyfill from `@evolu/react-native`.
 * For tests, use {@link testCreateLockManager}.
 *
 * ### Example
 *
 * ```ts
 * // Web or Node.js 24+
 * import { testCreateLockManager } from "@evolu/common";
 *
 * const deps: LockManagerDep = {
 *   lockManager: testCreateLockManager(),
 * };
 * ```
 *
 * ### Example
 *
 * ```ts
 * // React Native
 * import { lockManager } from "@evolu/react-native";
 *
 * const deps: LockManagerDep = { lockManager };
 * ```
 */

export interface LockManagerDep {
  readonly lockManager: LockManager;
}

/**
 * Creates a test {@link LockManager} backed by the native platform
 * {@link LockManager}.
 *
 * Native backing is intentional: tests must observe the same locking behavior
 * as the platform runtime, and a userland implementation cannot reproduce it.
 *
 * The platform `LockManager` cannot be instantiated, so tests cannot create an
 * isolated native lock per case. This helper isolates lock usage per instance
 * via internal namespacing, so tests can reuse the same lock names without
 * contending through the global Web Locks. Query results are filtered to that
 * private namespace and returned with the original visible names.
 */
export const testCreateLockManager = (
  nativeLockManager: LockManager = globalThis.navigator.locks,
): LockManager => {
  const namespace = createId({ randomBytes: createRandomBytes() });

  const filterLockInfosByNamespace = <T extends LockInfo>(
    locks: ReadonlyArray<T>,
  ): Array<T> =>
    locks.flatMap((lock) =>
      lock.name?.endsWith(namespace) === true
        ? [{ ...lock, name: lock.name.slice(0, -namespace.length) }]
        : [],
    );

  return {
    request: <T>(
      name: string,
      optionsOrCallback: LockOptions | LockGrantedCallback<T>,
      maybeCallback?: LockGrantedCallback<T>,
    ): Promise<Awaited<T>> => {
      const [options, callback] =
        typeof optionsOrCallback === "function"
          ? [{}, optionsOrCallback]
          : [optionsOrCallback, maybeCallback!];

      return nativeLockManager.request(`${name}${namespace}`, options, (lock) =>
        callback(lock && { mode: lock.mode, name }),
      );
    },

    query: async () => {
      const locks = await nativeLockManager.query();
      return {
        ...(locks.held && {
          held: filterLockInfosByNamespace(locks.held),
        }),
        ...(locks.pending && {
          pending: filterLockInfosByNamespace(locks.pending),
        }),
      };
    },
  };
};

/**
 * Competes to become the current leader for `name` using {@link LockManager}.
 *
 * Only one caller can lead for a given name at a time, and the returned
 * {@link AsyncDisposable} represents that leadership.
 *
 * Leadership is held until the returned handle is disposed. Once released,
 * another waiting caller may become the next leader. Waiting for leadership is
 * abortable via the calling {@link Task}'s signal.
 */
export const acquireLeaderLock =
  (name: string): Task<AsyncDisposable, AbortError, LockManagerDep> =>
  (run) =>
    tryAsync(
      async () => {
        const acquisition = Promise.withResolvers<void>();
        const released = Promise.withResolvers<void>();

        const request = run.deps.lockManager.request(
          `evolu-leaderlock-${name}`,
          { mode: "exclusive", signal: run.signal },
          async () => {
            acquisition.resolve();
            await released.promise;
          },
        );
        void request.catch(acquisition.reject);

        await acquisition.promise;

        return {
          [Symbol.asyncDispose]: async () => {
            released.resolve();
            await request;
          },
        };
      },
      (error): AbortError =>
        AbortError.is(error) ? error : { type: "AbortError", reason: error },
    );
