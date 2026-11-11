/**
 * {@link LockManager} helpers.
 *
 * @module
 */

import { createRandomBytes } from "./Crypto.ts";
import { constVoid } from "./Function.ts";
import { ok } from "./Result.ts";
import type { Task } from "./Task.ts";
import { createId } from "./Type.ts";
import type { Callback } from "./Types.ts";

/**
 * Dependency wrapper for {@link LockManager}.
 *
 * For React Native, use the `lockManager` ponyfill from `@evolu/react-native`.
 * For tests, use {@link testCreateLockManager}.
 *
 * ### Web and Node.js 24+
 *
 * ```ts
 * import { assertEqual, type LockManagerDep } from "@evolu/common";
 *
 * const deps: LockManagerDep = {
 *   lockManager: navigator.locks,
 * };
 *
 * const result = await deps.lockManager.request(
 *   "example",
 *   (lock) => lock?.name,
 * );
 * assertEqual(result, "example");
 * ```
 *
 * ### React Native
 *
 * ```ts
 * import { assertEqual, type LockManagerDep } from "@evolu/common";
 * import { lockManager } from "@evolu/react-native";
 *
 * const deps: LockManagerDep = { lockManager };
 *
 * const result = await deps.lockManager.request(
 *   "example",
 *   (lock) => lock?.name,
 * );
 * assertEqual(result, "example");
 * ```
 *
 * @group Core
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
 *
 * @group Testing
 */
export const testCreateLockManager = (
  nativeLockManager: LockManager = navigator.locks,
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
 * abortable via the calling {@link Task}'s signal, and leadership granted after
 * the abort is released at once. Racing it, as `timeout` does, can drop
 * leadership granted as the other Task wins, such as with a lock manager that
 * grants in a microtask, and nothing releases it; to bound the wait, keep the
 * handle of {@link acquireLeaderLockCallback} instead.
 *
 * @group Leader election
 */
export const acquireLeaderLock =
  (name: string): Task<AsyncDisposable, never, LockManagerDep> =>
  async (run) => {
    const acquisition = Promise.withResolvers<void>();
    const released = Promise.withResolvers<void>();

    const request = run.deps.lockManager.request(
      createLeaderLockName(name),
      { mode: "exclusive", signal: run.signal },
      async () => {
        // Web Locks grant a request before they run its callback, and an
        // abort after the grant doesn't cancel it, so a lock granted after
        // the abort is released at once.
        if (run.signal.aborted) {
          acquisition.reject(run.signal.reason);
          return;
        }
        acquisition.resolve();
        await released.promise;
      },
    );
    void request.catch(acquisition.reject);

    await acquisition.promise;

    return ok({
      [Symbol.asyncDispose]: async () => {
        released.resolve();
        await request;
      },
    });
  };

/**
 * Competes to become the current leader for `name` using {@link LockManager}.
 *
 * Only one caller can lead for a given name at a time. The callback runs when
 * leadership is acquired, and the returned {@link Disposable} represents that
 * leadership request.
 *
 * Leadership is held until the returned handle is disposed. Once released,
 * another waiting caller may become the next leader. Waiting for leadership is
 * abortable by disposing the returned handle, and leadership granted after the
 * disposal is released at once, without the callback.
 *
 * @group Leader election
 */
export const acquireLeaderLockCallback =
  (deps: LockManagerDep) =>
  (name: string, callback: Callback<void>): Disposable => {
    const abortController = new AbortController();
    let release: (() => void) | null = null;

    const request = deps.lockManager.request(
      createLeaderLockName(name),
      { mode: "exclusive", signal: abortController.signal },
      async () => {
        // As in acquireLeaderLock, a lock granted after the disposal is
        // released at once.
        if (abortController.signal.aborted) return;
        const released = Promise.withResolvers<void>();
        release = released.resolve;
        callback();
        await released.promise;
      },
    );
    void request.catch(constVoid);

    return {
      [Symbol.dispose]: () => {
        abortController.abort();
        release?.();
      },
    };
  };

/**
 * Whether a caller leads for `name`, as {@link acquireLeaderLock} or
 * {@link acquireLeaderLockCallback} makes it. A context that ends leads for
 * nothing, so another context can check that one leading for a name, such as a
 * worker leading for its ID while it runs, still runs. A caller that asked to
 * lead for a name nobody leads for leads for it before any later check, once
 * its context had a lock request answered. A context's first request can reach
 * the lock manager late, as in Chromium, which first asks the browser whether
 * the context may use storage, and the Web Locks spec promises no order across
 * contexts beyond that.
 *
 * ### Example
 *
 * ```ts
 * import {
 *   acquireLeaderLock,
 *   assertFalse,
 *   assertTrue,
 *   isLeaderLockHeld,
 *   testCreateLockManager,
 *   testCreateRun,
 * } from "@evolu/common";
 *
 * await using run = testCreateRun({
 *   lockManager: testCreateLockManager(),
 * });
 * const isHeld = isLeaderLockHeld(run.deps);
 * assertFalse(await isHeld("example"));
 *
 * const lease = await run.ok(acquireLeaderLock("example"));
 * assertTrue(await isHeld("example"));
 *
 * await lease[Symbol.asyncDispose]();
 * assertFalse(await isHeld("example"));
 * ```
 *
 * @group Leader election
 */
export const isLeaderLockHeld =
  (deps: LockManagerDep) =>
  async (name: string): Promise<boolean> => {
    const { held = [] } = await deps.lockManager.query();
    const lockName = createLeaderLockName(name);
    return held.some((lock) => lock.name === lockName);
  };

const createLeaderLockName = (name: string): string =>
  `evolu-leaderlock-${name}`;
