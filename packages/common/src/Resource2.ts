/**
 * Concurrency-safe helpers for efficient reuse of disposable resources.
 *
 * @module
 */

import type { NonEmptyArray, NonEmptyReadonlyArray } from "./Array.js";
import { assert, assertNonNullable } from "./Assert.js";
import { identity, type disposable } from "./Function.js";
import {
  createLookupMap,
  createLookupSet,
  type Lookup,
  type LookupOption,
} from "./Lookup.js";
import { createRefCountedRelation } from "./Relation.js";
import { ok } from "./Result.js";
import {
  createMutex,
  createMutexByKey,
  sleep,
  type AbortableFiber,
  type DisposableRun,
  type SemaphoreSnapshot,
  type Task,
} from "./Task2.js";
import { type Duration } from "./Time.js";
import { NonNegativeInt } from "./Type.js";
import { type DistributiveOmit } from "./Types.js";

/**
 * Disposable resource.
 *
 * A resource is any object that implements {@link Disposable} or
 * {@link AsyncDisposable}.
 *
 * Successfully returning an owned Resource transfers ownership of a live
 * resource to the caller. Return a typed Result error for a recoverable
 * creation failure; use `undefined` only when absence is a valid success. If
 * creation fails, aborts, or defects, use {@link AsyncDisposableStack} to
 * dispose partially created resources and return no Resource. Never represent
 * failed creation with an already-disposed Resource.
 *
 * Disposal must succeed. A disposer that throws indicates an unrecoverable
 * invariant violation, not a recoverable domain error, so resource lifecycle
 * APIs let that error propagate as a defect. The purpose of resource helpers is
 * to guarantee cleanup and prevent leaks.
 *
 * @see {@link SharedResource}
 * @see {@link createSharedResource}
 */
export type Resource = Disposable | AsyncDisposable;

/**
 * Borrowed {@link Resource}.
 *
 * A borrowed resource removes disposal methods from a {@link Resource}'s type.
 * The runtime object is unchanged.
 *
 * Another abstraction owns the resource and controls its lifecycle. Exposing
 * disposal in the type would break that ownership and allow callers to dispose
 * a resource they do not own.
 */
export type BorrowedResource<T extends Resource> = DistributiveOmit<
  T,
  typeof Symbol.dispose | typeof Symbol.asyncDispose
>;

/**
 * An owned lease on a shared {@link Resource}.
 *
 * A lease keeps the underlying resource alive. Release it with
 * {@link Lease.release} or `using`; releasing the last lease starts the resource
 * disposal path. Release is idempotent, so double release is a safe no-op.
 *
 * Release is synchronous accounting and never waits for resource disposal.
 * Disposal completion belongs to the owning {@link SharedResource}: it may be
 * delayed by {@link SharedResourceOptions.idleDisposeAfter | idleDisposeAfter}
 * and is awaited by the owner's async disposal.
 *
 * Release does not revoke {@link Lease.resource | resource}; a released lease
 * keeps a plain reference, and using it after the resource is disposed is a
 * programmer error that nothing catches statically. Create resources with the
 * {@link disposable} helper so use-after-dispose throws eagerly instead of
 * operating on disposed state.
 */
export interface Lease<T extends Resource> extends Disposable {
  /** The leased resource. */
  readonly resource: BorrowedResource<T>;

  /** Whether this acquisition created the leased resource generation. */
  readonly created: boolean;

  /**
   * Releases this lease.
   *
   * Returns whether this call released a still-held lease. Returns `false` if
   * the lease was already released, drained by disposal of its owning
   * {@link SharedResource}, or drained by disposal of the Run tree that owns
   * it.
   */
  readonly release: () => boolean;
}

/**
 * Shared {@link Resource}.
 *
 * Lazily creates the underlying resource on the first
 * {@link SharedResource.acquire | acquire} call, shares it across callers via
 * {@link Lease}s, and disposes it when the last lease is released.
 *
 * ### Example
 *
 * ```ts
 * interface Connection extends Disposable {
 *   readonly send: (message: string) => void;
 * }
 *
 * const createConnection: Task<Connection> = () =>
 *   ok({
 *     send: (message) => {
 *       // ...
 *     },
 *     [Symbol.dispose]: () => {
 *       // close
 *     },
 *   });
 *
 * await using run = createRun();
 *
 * // Nothing is created yet; the first acquire creates the connection.
 * await using sharedConnection = await run.ok(
 *   createSharedResource(createConnection, { idleDisposeAfter: "5s" }),
 * );
 *
 * // `use` holds a Lease until its callback Task settles.
 * const send = (message: string): Task<void> =>
 *   sharedConnection.use((connection) => () => {
 *     connection.send(message);
 *     return ok();
 *   });
 *
 * // Concurrent callers share one connection. Releasing the last lease
 * // starts idle disposal; a new acquire within 5s reuses the connection.
 * await run.ok(concurrently(all([send("hello"), send("world")])));
 *
 * // Acquire explicitly when ownership spans several operations.
 * using lease = await run.ok(sharedConnection.acquire);
 * lease.resource.send("first");
 * lease.resource.send("second");
 * ```
 *
 * ## FAQ
 *
 * ### Why release a lease with `using`?
 *
 * `using` guarantees a {@link Lease} is released on every exit path: normal
 * completion, a thrown error, and abort — abort surfaces as an exception in
 * Task code, so stack unwinding runs disposers. Binding a lease to an ordinary
 * `const` instead is a deliberate ownership transfer; the new owner must
 * guarantee release.
 *
 * ### What happens when a lease leaks?
 *
 * Nothing in JavaScript enforces `using` or release; a lease that is never
 * released compiles silently (see [MDN resource management
 * pitfalls](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Resource_management#pitfalls);
 * a lint rule may eventually close this gap:
 * https://github.com/typescript-eslint/typescript-eslint/issues/8255). Encoding
 * resource lifetime in the type system would not be bulletproof either: types
 * can force a lifetime to exist, but a lifetime scoped too widely leaks just as
 * silently. Evolu therefore stays JS-native — `using` in the language — and
 * bounds the damage structurally. A leaked lease keeps the resource alive but
 * never past its owner: disposing a SharedResource drains all outstanding
 * leases and disposes the resource. A leaked SharedResource is bounded by its
 * Run, whose disposal also drains its leases and disposes its current resource.
 * Leaks are also observable — {@link SharedResource.snapshot | snapshot} exposes
 * a lease count that never returns to zero — and detected: in development
 * builds, a lease that is garbage-collected without release logs a warning with
 * its acquire stack via the LeakDetector dependency.
 */
export interface SharedResource<T extends Resource> extends AsyncDisposable {
  /**
   * Acquires a {@link Lease} on the shared resource.
   *
   * The first call lazily creates the resource. Later calls reuse the same
   * resource until the last lease is released.
   *
   * Once started, acquire runs to completion even when the caller aborts its
   * Fiber, and the returned lease still counts as held. If resource creation or
   * disposal is in progress, acquire waits for it to complete. Always await the
   * result and release the lease; a caller that stops waiting (for example with
   * the `daemon` helper) abandons a lease that is never released, retaining the
   * resource until the owning {@link SharedResource} is disposed.
   *
   * Owner disposal is different from caller abort: if disposal starts before a
   * lease is transferred, acquire aborts with `runDisposedAbortReason` from the
   * SharedResource's internal Run. A resource returned by `create` after
   * shutdown starts remains owned by this SharedResource and is disposed
   * without a lease escaping. Transfer occurs when the internal acquisition
   * completes, before the caller necessarily resumes. If owner disposal starts
   * in that gap, the caller can receive a lease already drained by disposal.
   * Its `release` returns `false`, and its resource must not be used.
   */
  readonly acquire: Task<Lease<T>>;

  /**
   * Acquires a {@link Lease} on the current resource without creating one.
   *
   * Waits for preceding creation or disposal to finish. Returns `undefined` if
   * no current resource remains. Owner disposal while waiting aborts the
   * acquisition before a lease is transferred. As with `acquire`, owner
   * disposal after transfer can drain the lease before the caller resumes.
   */
  readonly acquireCurrent: Task<Lease<T> | undefined>;

  /**
   * Acquires a {@link Lease}, runs a Task with the shared resource, and releases
   * the lease after the Task settles.
   *
   * Creates the resource when absent. The callback receives whether this use
   * created the resource generation. While the owner remains running, the lease
   * prevents ordinary idle disposal. Disposing this SharedResource is forceful:
   * it drains the lease and may dispose the resource before or while the
   * callback Task runs.
   */
  readonly use: <R, E, D>(
    callback: (
      resource: BorrowedResource<T>,
      created: boolean,
    ) => Task<R, E, D>,
  ) => Task<R, E, D>;

  /** Returns the current shared-resource state for monitoring/debugging. */
  readonly snapshot: () => SharedResourceSnapshot;
}

/** Snapshot returned by {@link SharedResource.snapshot}. */
export interface SharedResourceSnapshot {
  /**
   * Whether the resource has no current value, no leases, no pending idle
   * disposal, and no acquisition in progress.
   */
  readonly isIdle: boolean;

  /** Current active lease count. */
  readonly leaseCount: NonNegativeInt;

  /** Whether a current resource exists. */
  readonly hasResource: boolean;

  /** Whether delayed idle disposal is scheduled and pending. */
  readonly idleDisposePending: boolean;

  /** Current internal mutex state for monitoring/debugging. */
  readonly mutex: SemaphoreSnapshot;
}

/** Options for {@link createSharedResource}. */
export interface SharedResourceOptions {
  /**
   * Keeps the resource alive briefly after the last lease is released.
   *
   * This avoids immediate disposal when the resource is expensive to create and
   * likely to be acquired again soon. A new acquire during this delay cancels
   * the pending disposal and reuses the current resource.
   */
  readonly idleDisposeAfter?: Duration | undefined;

  /**
   * Called after each current resource disposal is attempted and the current
   * reference is cleared, including during {@link SharedResource} disposal.
   * Native disposal still calls it if the resource disposer defects. Not called
   * if no resource was created.
   */
  readonly onDisposed?: (() => void) | undefined;
}

/**
 * Creates {@link SharedResource}.
 *
 * The `create` Task must not fail. Creation establishes shared resource state
 * and may serve multiple concurrent acquirers, so a recoverable failure does
 * not belong to one lease. Handle recoverable failures inside `create`: retry
 * until creation succeeds (for example with a Schedule), or return a resource
 * whose state models connection and reconnection failures.
 *
 * A successfully returned resource must be live and independently owned. The
 * `create` Task must not bind its disposal to that Task's {@link DisposableRun}
 * with `defer`.
 *
 * Create resources with {@link disposable} when their shape supports it. Its
 * disposal guard makes calls through a lease fail eagerly after resource
 * disposal instead of operating on disposed state.
 *
 * The `create` Task runs while acquisition is locked and must not directly or
 * transitively acquire from the same SharedResource. The lock is non-reentrant,
 * so doing so deadlocks.
 *
 * Internal work runs on a Run created from the Run that executes this Task, so
 * dependencies are captured at creation time. Deps provided to later acquire
 * calls do not change what `create` observes.
 *
 * Lifecycle callbacks must not throw. A throwing
 * {@link SharedResourceOptions.onDisposed | onDisposed} is a defect that panics
 * the Run tree.
 */
export const createSharedResource =
  <T extends Resource, D>(
    create: Task<T, never, D>,
    { idleDisposeAfter, onDisposed }: SharedResourceOptions = {},
  ): Task<SharedResource<T>, never, D> =>
  (run) => {
    const sharedResourceRun = run.create();
    const { leakDetector } = run.deps;

    let current: T | undefined;
    let idleDisposeFiber: AbortableFiber<void, never, D> | undefined;
    const heldLeases = new Set<object>();

    const mutex = createMutex();
    const sharedResourceHandle = {};

    // Idle disposal calls this under the mutex. Owner finalization calls it only
    // after child Tasks, including idle disposal, settle, so calls cannot
    // overlap.
    const disposeCurrent = async (): Promise<void> => {
      if (!current) return;
      await using resourceDisposer = new AsyncDisposableStack();
      if (onDisposed) resourceDisposer.defer(onDisposed);
      resourceDisposer.use(current);
      current = undefined;
    };

    /** Disposes the current resource unless a new lease arrived meanwhile. */
    const disposeCurrentWhenUnused: Task<void, never, D> = mutex.withLock(
      async () => {
        // For delayed disposal, this is safe to clear unconditionally: a newer
        // idle-dispose fiber would require a release after a completed acquire,
        // but FIFO orders that acquire behind this task. Therefore this is the
        // current fiber or already undefined, never newer. An acquire that got
        // the mutex before this task queued aborted this fiber while it was
        // still sleeping. If this fiber was already queued on the mutex, abort
        // removes its semaphore waiter before grant, so this body cannot run
        // stale.
        idleDisposeFiber = undefined;
        if (heldLeases.size === 0) await disposeCurrent();
        return ok();
      },
    );

    // Execution order is LIFO: clear idle state, drain leases, dispose current,
    // then untrack the owner. Separate entries preserve later cleanup when an
    // earlier finalizer defects.
    sharedResourceRun.defer(() => {
      leakDetector.untrack(sharedResourceHandle);
    });
    sharedResourceRun.defer(disposeCurrent);
    sharedResourceRun.defer(() => {
      for (const handle of heldLeases) leakDetector.untrack(handle);
      heldLeases.clear();
    });
    sharedResourceRun.defer(() => {
      idleDisposeFiber = undefined;
    });

    const createLease = (created: boolean): Lease<T> => {
      const handle = {};
      heldLeases.add(handle);

      const release = (): boolean => {
        if (!heldLeases.delete(handle)) return false;

        leakDetector.untrack(handle);

        if (heldLeases.size > 0) return true;

        // During shutdown, disposal owns the resource; release is accounting
        // only.
        if (sharedResourceRun.getState().type !== "Running") return true;

        if (idleDisposeAfter) {
          idleDisposeFiber = sharedResourceRun.abortable<void, never>(
            async (run) => {
              await run.ok(sleep(idleDisposeAfter));
              return run(disposeCurrentWhenUnused);
            },
          );
        } else {
          // Immediate disposal is not retained for acquire to cancel. Starting
          // it synchronously queues or acquires the mutex before release
          // returns. The mutex orders it against acquires, and disposal
          // rechecks the lease count under the lock.
          void sharedResourceRun.abortable(disposeCurrentWhenUnused);
        }

        return true;
      };

      const lease: Lease<T> = {
        resource: current as unknown as BorrowedResource<T>,
        created,
        release,
        [Symbol.dispose]: release,
      };

      leakDetector.track(
        lease,
        { name: "Lease", isLeaked: () => heldLeases.has(handle) },
        handle,
      );

      return lease;
    };

    const sharedResource: SharedResource<T> = {
      // Run on the resource-owned tree so caller abort cannot interrupt acquire
      // and later acquire deps cannot replace the owner's captured deps.
      acquire: () =>
        sharedResourceRun(
          mutex.withLock(async (run) => {
            if (idleDisposeFiber) {
              idleDisposeFiber.abort();
              idleDisposeFiber = undefined;
            }

            const created = current === undefined;
            current ??= await run.ok(create);
            // Publish ownership before the checkpoint so owner finalization
            // disposes a resource returned after shutdown started.
            run.signal.throwIfAborted();
            return ok(createLease(created));
          }),
        ),

      acquireCurrent: () =>
        sharedResourceRun(
          // This body must stay synchronous so owner disposal cannot start
          // between checking current and transferring its lease.
          mutex.withLock(() => {
            if (!current) return ok(undefined);

            if (idleDisposeFiber) {
              idleDisposeFiber.abort();
              idleDisposeFiber = undefined;
            }

            return ok(createLease(false));
          }),
        ),

      use: (callback) => async (run) => {
        using lease = await run.ok(sharedResource.acquire);
        return await run(callback(lease.resource, lease.created));
      },

      snapshot: () => {
        const mutexSnapshot = mutex.snapshot();
        return {
          isIdle:
            heldLeases.size === 0 &&
            !current &&
            !idleDisposeFiber &&
            mutexSnapshot.isIdle,
          leaseCount: NonNegativeInt.orThrow(heldLeases.size),
          hasResource: current !== undefined,
          idleDisposePending: idleDisposeFiber !== undefined,
          mutex: mutexSnapshot,
        };
      },

      [Symbol.asyncDispose]: () => sharedResourceRun[Symbol.asyncDispose](),
    };

    leakDetector.track(
      sharedResource,
      {
        name: "SharedResource",
        isLeaked: () => sharedResourceRun.getState().type === "Running",
      },
      sharedResourceHandle,
    );

    return ok(sharedResource);
  };

/**
 * Shared {@link Resource}s keyed by logical identity.
 *
 * A map-like registry of {@link SharedResource}s. Each key owns at most one
 * current resource instance. The first
 * {@link SharedResourceByKey.acquire | acquire} for a key lazily creates that
 * key's resource; releasing the key's last {@link Lease} disposes it and removes
 * the key from the registry.
 *
 * Different keys are independent and may progress concurrently. Operations for
 * the same key are serialized.
 *
 * By default, keys use reference identity, matching native `Map`. Callers may
 * instead provide a {@link Lookup lookup} so logical equality is based on a
 * derived stable key.
 *
 * ### Example
 *
 * ```ts
 * interface Connection extends Disposable {
 *   readonly send: (message: string) => void;
 *   readonly flush: () => void;
 * }
 *
 * const createConnection =
 *   (ownerId: string): Task<Connection> =>
 *   () =>
 *     ok({
 *       send: (message) => {
 *         // buffer message for ownerId
 *       },
 *       flush: () => {
 *         // send buffered messages
 *       },
 *       [Symbol.dispose]: () => {
 *         // close connection
 *       },
 *     });
 *
 * await using run = createRun();
 * await using connections = await run.ok(
 *   createSharedResourceByKey(createConnection, {
 *     idleDisposeAfter: "30s",
 *   }),
 * );
 *
 * const send = (ownerId: string, message: string): Task<void> =>
 *   connections.use(ownerId, (connection) => () => {
 *     connection.send(message);
 *     return ok();
 *   });
 *
 * // The first two Tasks share one connection; the third uses another key and
 * // can progress independently.
 * await run.ok(
 *   concurrently(
 *     all([
 *       send("owner-1", "first"),
 *       send("owner-1", "second"),
 *       send("owner-2", "hello"),
 *     ]),
 *   ),
 * );
 *
 * // The 30s idle delay keeps released connections current, so flush sees them.
 * // Absent keys are never created.
 * await run.ok(
 *   connections.forEachCurrent((connection) => {
 *     connection.flush();
 *   }),
 * );
 * ```
 */
export interface SharedResourceByKey<
  K,
  T extends Resource,
> extends AsyncDisposable {
  /**
   * Acquires a {@link Lease} on the shared resource for `key`, creating the
   * resource on first use.
   *
   * The same contract as {@link SharedResource.acquire}: once started, acquire
   * runs to completion even when the caller aborts its Fiber, and the returned
   * lease still counts as held. Registry disposal before lease transfer aborts
   * the acquisition. Always await the result and release the lease.
   */
  readonly acquire: (key: K) => Task<Lease<T>>;

  /**
   * Acquires a {@link Lease} on the current resource for `key` without creating
   * one.
   *
   * Waits for preceding creation or disposal for the same key to finish.
   * Returns `undefined` if no current resource remains. Registry disposal while
   * waiting aborts the acquisition before a lease is transferred. Registry
   * disposal after transfer can drain the lease before the caller resumes,
   * matching {@link SharedResource.acquireCurrent}.
   */
  readonly acquireCurrent: (key: K) => Task<Lease<T> | undefined>;

  /**
   * Acquires a {@link Lease}, runs a Task with the shared resource for `key`,
   * and releases the lease after the Task settles.
   *
   * Creates the resource when absent. The callback receives whether this use
   * created the resource generation. While the registry remains running, the
   * lease prevents ordinary idle disposal. Disposing this registry is forceful:
   * it drains the lease and may dispose the resource before or while the
   * callback Task runs.
   */
  readonly use: <R, E, D>(
    key: K,
    callback: (
      resource: BorrowedResource<T>,
      created: boolean,
    ) => Task<R, E, D>,
  ) => Task<R, E, D>;

  /**
   * Calls `callback` for each current resource it can lease from keys
   * registered when this Task starts.
   *
   * Never creates resources. A resource whose creation is in progress may be
   * included after creation finishes; one disposed before its temporary lease
   * is acquired is skipped. Each acquired lease stays held while later keys are
   * awaited, and every callback runs while all acquired resources remain
   * leased. Caller abort is observed between keys; already-collected leases are
   * released and no callbacks run.
   */
  readonly forEachCurrent: (
    callback: (resource: BorrowedResource<T>, key: K) => void,
  ) => Task<void>;

  /** Returns current per-key shared-resource states for monitoring/debugging. */
  readonly snapshot: () => SharedResourceByKeySnapshot<K>;
}

/** Snapshot returned by {@link SharedResourceByKey.snapshot}. */
export interface SharedResourceByKeySnapshot<K> {
  /**
   * Current registered {@link SharedResourceSnapshot} for each key.
   *
   * A key is absent during the brief first-acquire interval before its
   * SharedResource is registered, even though that acquire may already hold the
   * key mutex.
   */
  readonly resourcesByKey: ReadonlyMap<K, SharedResourceSnapshot>;
}

/** Options for {@link createSharedResourceByKey}. */
export interface SharedResourceByKeyOptions<K, L = K>
  extends Pick<SharedResourceOptions, "idleDisposeAfter">, LookupOption<K, L> {
  /**
   * Called with `key` after each current resource for that key is disposed,
   * including during {@link SharedResourceByKey} disposal. Not called for keys
   * whose resources were never created.
   *
   * After ordinary idle disposal, the key is removed before this callback
   * unless a same-key operation is already in progress. A regular acquire can
   * then create the next current resource. An acquireCurrent that finds no
   * resource removes the retained key before returning.
   */
  readonly onDisposed?: ((key: K) => void) | undefined;
}

/**
 * Creates {@link SharedResourceByKey}.
 *
 * The `create` callback returns a Task scoped to one key. The returned Task
 * must not fail, matching {@link createSharedResource}.
 *
 * Create each resource with {@link disposable} when its shape supports it. The
 * same disposal-guard recommendation as {@link createSharedResource} applies.
 *
 * The returned Task must not directly or transitively acquire the same logical
 * key or call `forEachCurrent` on this registry. Same-key acquisition is
 * non-reentrant, and `forEachCurrent` attempts to acquire every registered key.
 * Different keys remain independent.
 *
 * Like {@link createSharedResource}, dependencies are captured when the registry
 * is created; dependencies provided to later acquire calls do not change what
 * the returned Task observes.
 */
export function createSharedResourceByKey<
  K = unknown,
  T extends Resource = Resource,
  D = unknown,
>(
  create: (key: K) => Task<T, never, D>,
): Task<SharedResourceByKey<K, T>, never, D>;
export function createSharedResourceByKey<K, T extends Resource, D, L = K>(
  create: (key: K) => Task<T, never, D>,
  options: SharedResourceByKeyOptions<K, L>,
): Task<SharedResourceByKey<K, T>, never, D>;
export function createSharedResourceByKey<
  K = unknown,
  T extends Resource = Resource,
  D = unknown,
  L = K,
>(
  create: (key: K) => Task<T, never, D>,
  {
    idleDisposeAfter,
    lookup = identity as Lookup<K, L>,
    onDisposed,
  }: SharedResourceByKeyOptions<K, L> = {},
): Task<SharedResourceByKey<K, T>, never, D> {
  return (run) => {
    const sharedResourceByKeyRun = run.create();
    const { leakDetector } = run.deps;

    const sharedResourcesByKey = createLookupMap<K, SharedResource<T>, L>({
      lookup,
    });

    const mutexByKey = createMutexByKey<K, L>({ lookup });
    const disposer = new AsyncDisposableStack();
    const sharedResourceByKeyHandle = {};

    const removeKey = (key: K, sharedResource: SharedResource<T>): void => {
      // Callers must ensure no same-key operation can still use sharedResource.
      // onDisposed checks that the key mutex is idle; acquireCurrent holds the
      // key mutex after observing that the inner resource is empty.
      // Explicit registry disposal owns every registered SharedResource. Keep
      // the key visible until keyDisposer captures it.
      if (disposer.disposed) return;

      sharedResourcesByKey.delete(key);

      // During root shutdown, the inner Run is already being disposed.
      if (sharedResourceByKeyRun.getState().type !== "Running") return;

      void sharedResourceByKeyRun.abortable(async () => {
        await sharedResource[Symbol.asyncDispose]();
        return ok();
      });
    };

    // Disposed in reverse order: the Run first, so pending acquires and removed
    // SharedResource disposals are aborted and awaited before the registered
    // SharedResources are disposed.
    disposer.defer(async () => {
      await using keyDisposer = new AsyncDisposableStack();
      for (const sharedResource of sharedResourcesByKey.values())
        keyDisposer.use(sharedResource);
      sharedResourcesByKey.clear();
    });
    disposer.use(sharedResourceByKeyRun);

    sharedResourceByKeyRun.defer(() => {
      leakDetector.untrack(sharedResourceByKeyHandle);
    });

    const releaseLeaseIfAborted = (
      signal: AbortSignal,
      lease: Lease<T> | undefined,
    ): void => {
      if (!signal.aborted) return;
      lease?.release();
      signal.throwIfAborted();
    };

    const sharedResourceByKey: SharedResourceByKey<K, T> = {
      acquire: (key) => () =>
        sharedResourceByKeyRun(
          mutexByKey.withLock(key, async (run) => {
            // The outer key mutex spans registration and the inner acquire so
            // key removal cannot race resource creation or lease transfer.
            let sharedResource = sharedResourcesByKey.get(key);

            if (!sharedResource) {
              sharedResource = await run.ok(
                createSharedResource(create(key), {
                  idleDisposeAfter,
                  onDisposed: () => {
                    assertNonNullable(
                      sharedResource,
                      "SharedResource must be assigned before its resource is disposed.",
                    );
                    if (mutexByKey.isIdle(key)) removeKey(key, sharedResource);
                    onDisposed?.(key);
                  },
                }),
              );
              sharedResourcesByKey.set(key, sharedResource);
            }

            const lease = await run.ok(sharedResource.acquire);
            releaseLeaseIfAborted(run.signal, lease);
            return ok(lease);
          }),
        ),

      acquireCurrent: (key) => () =>
        sharedResourceByKeyRun(
          mutexByKey.withLock(key, async (run) => {
            const sharedResource = sharedResourcesByKey.get(key);
            if (!sharedResource) return ok(undefined);

            const lease = await run.ok(sharedResource.acquireCurrent);
            releaseLeaseIfAborted(run.signal, lease);
            if (!lease) removeKey(key, sharedResource);
            return ok(lease);
          }),
        ),

      use: (key, callback) => async (run) => {
        using lease = await run.ok(sharedResourceByKey.acquire(key));
        return await run(callback(lease.resource, lease.created));
      },

      forEachCurrent: (callback) => async (run) => {
        using leaseDisposer = new DisposableStack();
        const leasesByKey: Array<readonly [Lease<T>, K]> = [];

        for (const [key] of [...sharedResourcesByKey]) {
          const lease = await run.ok(sharedResourceByKey.acquireCurrent(key));
          if (lease) leasesByKey.push([leaseDisposer.use(lease), key]);
          run.signal.throwIfAborted();
        }

        for (const [lease, key] of leasesByKey) callback(lease.resource, key);

        return ok();
      },

      snapshot: () => {
        const resourcesByKey = new Map<K, SharedResourceSnapshot>();
        for (const [key, sharedResource] of sharedResourcesByKey)
          resourcesByKey.set(key, sharedResource.snapshot());
        return { resourcesByKey };
      },

      [Symbol.asyncDispose]: () => disposer.disposeAsync(),
    };

    leakDetector.track(
      sharedResourceByKey,
      {
        name: "SharedResourceByKey",
        isLeaked: () => sharedResourceByKeyRun.getState().type === "Running",
      },
      sharedResourceByKeyHandle,
    );

    return ok(sharedResourceByKey);
  };
}

/**
 * Shared keyed {@link Resource}s retained through claims.
 *
 * A claim identifies an application-level owner such as an account, tenant, or
 * open document. Resource keys identify the shared resources that owner needs,
 * such as relay URLs, database names, or worker IDs.
 *
 * Use this abstraction when each owner needs a set of keyed resources and those
 * sets can overlap. Calling {@link SharedResourceByKeyWithClaims.claim |
 * claim}
 * retains every resource in one owner's set. Overlapping owners share one
 * resource instance per key, and the resource remains alive until every
 * {@link ClaimLease} retaining that key is released.
 *
 * Relation queries reflect active claims, not physical resource liveness. With
 * `idleDisposeAfter`, a resource can outlive its last claim.
 *
 * Use {@link SharedResourceByKey} instead when callers only need independent
 * leases by key and the application does not need to associate those leases
 * with logical owners.
 *
 * ### Example
 *
 * Two accounts can sync through the same relay connection while one account
 * also uses a local-network transport:
 *
 * ```ts
 * type AccountId = string & Brand<"AccountId">;
 * type TransportUrl = string & Brand<"TransportUrl">;
 *
 * interface Connection extends Disposable {
 *   readonly send: (message: string) => void;
 * }
 *
 * const createConnection =
 *   (url: TransportUrl): Task<Connection> =>
 *   () =>
 *     ok({
 *       send: (message) => {
 *         // send message through url
 *       },
 *       [Symbol.dispose]: () => {
 *         // close connection
 *       },
 *     });
 *
 * const accountA = "account-a" as AccountId;
 * const accountB = "account-b" as AccountId;
 * const relay = "wss://relay" as TransportUrl;
 * const localNetwork = "ws://local-network" as TransportUrl;
 *
 * await using run = createRun();
 * await using transports = await run.ok(
 *   createSharedResourceByKeyWithClaims<
 *     TransportUrl,
 *     AccountId,
 *     Connection
 *   >(createConnection),
 * );
 *
 * {
 *   // Creates and retains the relay and local-network connections.
 *   using accountATransports = await run.ok(
 *     transports.claim(accountA, [relay, localNetwork]),
 *   );
 *
 *   {
 *     // Reuses the relay connection already retained by account A.
 *     using accountBTransports = await run.ok(
 *       transports.claim(accountB, [relay]),
 *     );
 *   }
 *
 *   // Account B is released, but account A still retains the relay.
 * }
 *
 * // Account A is released. No claim retains either connection now.
 * ```
 */
export interface SharedResourceByKeyWithClaims<
  K,
  C,
  T extends Resource,
> extends AsyncDisposable {
  /**
   * Retains every resource key for `claim`, creating absent resources lazily.
   *
   * Keys are snapshotted when this Task starts and acquired sequentially in
   * input order.
   *
   * `resourceKeys` must not contain logical duplicates according to
   * {@link SharedResourceByKeyWithClaimsOptions.resourceLookup}. A duplicate is
   * a programmer defect that panics the owning Run.
   *
   * The returned {@link ClaimLease} releases all retains added by this call.
   * Resource creation must succeed, so this Task has no recoverable error.
   */
  readonly claim: (
    claim: C,
    resourceKeys: NonEmptyReadonlyArray<K>,
  ) => Task<ClaimLease>;

  /**
   * Retains every resource key for `claim`, runs a Task with those resources,
   * and releases the resulting {@link ClaimLease} after the Task settles.
   *
   * The callback receives only the resources retained by this call, in input
   * order. Other active ClaimLeases for the same logical claim are excluded.
   * While this registry remains running, every borrowed resource remains valid
   * until the callback Task settles. Disposing this registry is forceful: it
   * drains the ClaimLease and may dispose resources before or while the
   * callback Task runs.
   */
  readonly use: <R, E, D>(
    claim: C,
    resourceKeys: NonEmptyReadonlyArray<K>,
    callback: (
      resources: NonEmptyReadonlyArray<readonly [BorrowedResource<T>, K]>,
    ) => Task<R, E, D>,
  ) => Task<R, E, D>;

  /**
   * Returns the current unique claims retaining `resourceKey`.
   *
   * Returns an empty snapshot when no claim retains the key, including after
   * this registry is disposed.
   */
  readonly getClaimsForResource: (resourceKey: K) => ReadonlySet<C>;

  /**
   * Returns the current unique resource keys retained by `claim`.
   *
   * Returns an empty snapshot when the claim retains no keys, including after
   * this registry is disposed.
   */
  readonly getResourceKeysForClaim: (claim: C) => ReadonlySet<K>;

  /**
   * Calls `callback` for each current resource retained by `claim`.
   *
   * The keys and resources are snapshotted before the first callback runs.
   * Resources remain valid until this synchronous iteration returns, even if a
   * callback releases the final retaining ClaimLease. Callbacks must not retain
   * or asynchronously use borrowed resources afterward. Does nothing when the
   * claim retains no resources, including after this registry is disposed.
   */
  readonly forEachResourceForClaim: (
    claim: C,
    callback: (resource: BorrowedResource<T>, resourceKey: K) => void,
  ) => void;

  /**
   * Returns current claim-retain and keyed-resource states.
   *
   * While a claim is acquiring keys, `resourcesByKey` can include inner leases
   * not yet reflected by `claimLeaseCount` or
   * `retainCountsByResourceKeyByClaim`.
   */
  readonly snapshot: () => SharedResourceByKeyWithClaimsSnapshot<K, C>;
}

/** Snapshot returned by {@link SharedResourceByKeyWithClaims.snapshot}. */
export interface SharedResourceByKeyWithClaimsSnapshot<K, C> {
  /** Number of currently held ClaimLeases. */
  readonly claimLeaseCount: NonNegativeInt;

  /** Current retain count for every active logical claim-resource pair. */
  readonly retainCountsByResourceKeyByClaim: ReadonlyMap<
    C,
    ReadonlyMap<K, number>
  >;

  /** Current registered {@link SharedResourceSnapshot} for each key. */
  readonly resourcesByKey: ReadonlyMap<K, SharedResourceSnapshot>;
}

/**
 * An owned lease on the resource-retains added by one claim operation.
 *
 * A ClaimLease is a grouped ownership token. For example, a claim for one
 * account can retain its relay, local-network, and Bluetooth transports. The
 * ClaimLease releases that whole group together; it does not expose or transfer
 * ownership of the resources themselves.
 *
 * Releasing the lease removes every retain added by that claim call. Release is
 * idempotent and synchronous; resource disposal remains owned by the
 * {@link SharedResourceByKeyWithClaims} that created the lease.
 */
export interface ClaimLease extends Disposable {
  /**
   * Releases every resource retain owned by this claim lease.
   *
   * Returns whether this call released a still-held lease. Returns `false` if
   * the lease was already released or drained by disposal of its owning
   * {@link SharedResourceByKeyWithClaims} or the Run tree that owns it.
   */
  readonly release: () => boolean;
}

/** Options for {@link createSharedResourceByKeyWithClaims}. */
export interface SharedResourceByKeyWithClaimsOptions<
  K,
  C,
  T extends Resource,
  LK = K,
  LC = C,
> extends Pick<SharedResourceOptions, "idleDisposeAfter"> {
  /** Derives the identity used to compare resource keys. */
  readonly resourceLookup?: Lookup<K, LK>;

  /** Derives the identity used to compare claims. */
  readonly claimLookup?: Lookup<C, LC>;

  /**
   * Called when a claim-resource pair transitions from zero retains to one.
   *
   * This is a pair-retain transition, not a resource-generation transition: a
   * resource can already be retained by other claims or be idling after an
   * earlier release. Arguments use the first stored representatives for their
   * logical claim and key.
   */
  readonly onFirstClaimAdded?: (
    claim: C,
    resource: BorrowedResource<T>,
    resourceKey: K,
  ) => void;

  /**
   * Called when a claim-resource pair transitions from one retain to zero.
   *
   * Runs before the ClaimLease's inner resource lease is released. Other claims
   * can still retain the same resource. Arguments use the first stored
   * representatives for their logical claim and key. During normal release, the
   * current pair and earlier keys from the same ClaimLease are already absent
   * from relation reads; later keys remain. During compensation for a failed
   * first-claim callback, the failed claim remains fully visible.
   */
  readonly onLastClaimRemoved?: (
    claim: C,
    resource: BorrowedResource<T>,
    resourceKey: K,
  ) => void;
}

/**
 * Creates {@link SharedResourceByKeyWithClaims}.
 *
 * The `create` callback is called with a resource key when that resource must
 * be created. The returned Task must not fail. Its dependencies are captured
 * when the registry is created; later claim calls do not require or replace
 * them.
 *
 * Transition callbacks represent semantic claim-resource pair changes and are
 * not called when this registry or its Run tree drains claims during disposal.
 * They must not throw. If a first-claim callback defects after earlier
 * callbacks in the same claim completed, matching last-claim callbacks
 * compensate those completed transitions in reverse order before cleanup.
 * Relation reads during compensation still include the failed claim. Callback
 * defects panic the owner Run after claim metadata and resource ownership are
 * cleaned up.
 *
 * Transition callbacks may synchronously read relation state. They must not
 * call `claim`, release a {@link ClaimLease} owned by this registry, or dispose
 * this registry.
 *
 * Transition callbacks do not report actual resource disposal. Disposal can
 * happen later when `idleDisposeAfter` is configured.
 */
export const createSharedResourceByKeyWithClaims =
  <
    K = unknown,
    C = unknown,
    T extends Resource = Resource,
    D = unknown,
    LK = K,
    LC = C,
  >(
    create: (key: K) => Task<T, never, D>,
    {
      idleDisposeAfter,
      resourceLookup = identity as Lookup<K, LK>,
      claimLookup = identity as Lookup<C, LC>,
      onFirstClaimAdded,
      onLastClaimRemoved,
    }: SharedResourceByKeyWithClaimsOptions<K, C, T, LK, LC> = {},
  ): Task<SharedResourceByKeyWithClaims<K, C, T>, never, D> =>
  async (run) => {
    type ClaimedResource = readonly [BorrowedResource<T>, K];

    interface HeldClaimLease {
      readonly claim: C;
      readonly resourceKeys: NonEmptyReadonlyArray<K>;
      readonly resourceLeases: DisposableStack;
    }

    const sharedResourceByKeyWithClaimsRun = run.create();
    const { leakDetector } = run.deps;

    const claimResourceRelation = createRefCountedRelation<C, K, LC, LK>({
      lookupA: claimLookup,
      lookupB: resourceLookup,
    });
    // This map and the relation's resource-key index use the same lookup and
    // are inserted and removed together, so they keep the same canonical keys.
    const resourcesByKey = createLookupMap<K, BorrowedResource<T>, LK>({
      lookup: resourceLookup,
    });
    const heldClaimLeases = new Set<HeldClaimLease>();
    const sharedResourceByKeyWithClaimsHandle = {};

    const notifyLastClaimRemoved = (
      claim: C,
      resource: BorrowedResource<T>,
      resourceKey: K,
    ): void => {
      try {
        onLastClaimRemoved?.(claim, resource, resourceKey);
      } catch (defect) {
        sharedResourceByKeyWithClaimsRun.panic(defect);
      }
    };

    await using disposer = new AsyncDisposableStack();
    // Explicit disposal stops claim operations and runs their finalizers before
    // disposing the keyed registry. The nested stack is empty if keyed-registry
    // creation fails. Both internal Runs attach to the root, whose disposal
    // awaits them independently of this explicit-disposal stack.
    const sharedResourceByKeyDisposer = disposer.use(
      new AsyncDisposableStack(),
    );
    disposer.use(sharedResourceByKeyWithClaimsRun);

    const releaseClaimLease = (
      heldClaimLease: HeldClaimLease,
      notifyTransition = true,
    ): boolean => {
      if (!heldClaimLeases.delete(heldClaimLease)) return false;
      leakDetector.untrack(heldClaimLease);

      using _resourceLeases = heldClaimLease.resourceLeases;

      for (const resourceKey of heldClaimLease.resourceKeys) {
        const decremented = claimResourceRelation.decrement(
          heldClaimLease.claim,
          resourceKey,
        );
        if (decremented.count > 0) continue;

        const resource = resourcesByKey.get(decremented.b);
        assertNonNullable(
          resource,
          "Resource must exist while its claim-resource pair is retained.",
        );
        if (notifyTransition) {
          notifyLastClaimRemoved(decremented.a, resource, decremented.b);
        }

        if (!claimResourceRelation.hasB(decremented.b)) {
          // Delete before _resourceLeases disposes at function exit. While this
          // entry exists, its leases pin one resource generation.
          resourcesByKey.delete(decremented.b);
        }
      }

      return true;
    };

    const drainClaimLeases = (): void => {
      using disposer = new DisposableStack();
      disposer.defer(() => {
        claimResourceRelation.clear();
        resourcesByKey.clear();
      });
      for (const heldClaimLease of heldClaimLeases) {
        disposer.defer(() => {
          releaseClaimLease(heldClaimLease, false);
        });
      }
    };

    sharedResourceByKeyWithClaimsRun.defer(() => {
      leakDetector.untrack(sharedResourceByKeyWithClaimsHandle);
    });
    sharedResourceByKeyWithClaimsRun.defer(drainClaimLeases);

    const sharedResourceByKey = sharedResourceByKeyDisposer.use(
      await sharedResourceByKeyWithClaimsRun.ok(
        createSharedResourceByKey(create, {
          idleDisposeAfter,
          lookup: resourceLookup,
        }),
      ),
    );

    run.signal.throwIfAborted();

    const disposables = disposer.move();
    const acquireClaim =
      <R>(
        claim: C,
        resourceKeys: NonEmptyReadonlyArray<K>,
        project: (
          claimLease: ClaimLease,
          resources: NonEmptyReadonlyArray<ClaimedResource>,
        ) => R,
      ): Task<R> =>
      () => {
        const resourceKeysSnapshot: NonEmptyReadonlyArray<K> = [
          resourceKeys[0],
          ...resourceKeys.slice(1),
        ];
        return sharedResourceByKeyWithClaimsRun(async (run) => {
          assert(
            createLookupSet<K, LK>({
              lookup: resourceLookup,
              values: resourceKeysSnapshot,
            }).size === resourceKeysSnapshot.length,
            "resourceKeys must not contain lookup duplicates.",
          );

          using resourceLeases = new DisposableStack();
          const [firstResourceKey, ...remainingResourceKeys] =
            resourceKeysSnapshot;
          // acquire releases a transferred lease before surfacing owner abort,
          // so a throwing await cannot leave ownership uncollected.
          const firstResourceLease = resourceLeases.use(
            await run.ok(sharedResourceByKey.acquire(firstResourceKey)),
          );
          const resources: NonEmptyArray<ClaimedResource> = [
            [firstResourceLease.resource, firstResourceKey],
          ];
          const firstClaimTransitions: Array<
            readonly [C, BorrowedResource<T>, K]
          > = [];
          for (const resourceKey of remainingResourceKeys) {
            const resourceLease = resourceLeases.use(
              await run.ok(sharedResourceByKey.acquire(resourceKey)),
            );
            resources.push([resourceLease.resource, resourceKey]);
          }
          run.signal.throwIfAborted();

          for (const [resource, resourceKey] of resources) {
            const incremented = claimResourceRelation.increment(
              claim,
              resourceKey,
            );
            resourcesByKey.getOrInsert(incremented.b, resource);
            if (incremented.count === 1) {
              firstClaimTransitions.push([
                incremented.a,
                resource,
                incremented.b,
              ]);
            }
          }

          const heldClaimLease: HeldClaimLease = {
            claim,
            resourceKeys: resourceKeysSnapshot,
            resourceLeases: resourceLeases.move(),
          };
          heldClaimLeases.add(heldClaimLease);

          const release = (): boolean => releaseClaimLease(heldClaimLease);
          const claimLease: ClaimLease = {
            release,
            [Symbol.dispose]: release,
          };

          leakDetector.track(
            claimLease,
            {
              name: "ClaimLease",
              isLeaked: () => heldClaimLeases.has(heldClaimLease),
            },
            heldClaimLease,
          );

          try {
            let succeeded = false;
            using compensations = new DisposableStack();
            for (const [
              claim,
              resource,
              resourceKey,
            ] of firstClaimTransitions) {
              onFirstClaimAdded?.(claim, resource, resourceKey);
              compensations.defer(() => {
                if (!succeeded) {
                  notifyLastClaimRemoved(claim, resource, resourceKey);
                }
              });
            }
            succeeded = true;
          } catch (defect) {
            releaseClaimLease(heldClaimLease, false);
            throw defect;
          }

          return ok(project(claimLease, resources));
        });
      };

    const sharedResourceByKeyWithClaims: SharedResourceByKeyWithClaims<
      K,
      C,
      T
    > = {
      claim: (claim, resourceKeys) =>
        acquireClaim(claim, resourceKeys, (claimLease) => claimLease),

      use: (claim, resourceKeys, callback) => async (run) => {
        const acquired = await run.ok(
          acquireClaim(claim, resourceKeys, (claimLease, resources) => ({
            claimLease,
            resources,
          })),
        );
        using _claimLease = acquired.claimLease;
        return await run(callback(acquired.resources));
      },

      getClaimsForResource: (resourceKey) =>
        new Set(claimResourceRelation.getAs(resourceKey)),

      getResourceKeysForClaim: (claim) =>
        new Set(claimResourceRelation.getBs(claim)),

      forEachResourceForClaim: (claim, callback) => {
        const resources = claimResourceRelation
          .getBs(claim)
          .map((resourceKey) => {
            const resource = resourcesByKey.get(resourceKey);
            assertNonNullable(
              resource,
              "Resource must exist for every active claim-resource relation.",
            );
            return [resource, resourceKey] as const;
          });
        // Releasing the final ClaimLease from a callback only schedules inner
        // disposal: the mutex Task resumes after this synchronous frame, so all
        // snapshotted resources remain live through the loop.
        for (const [resource, resourceKey] of resources) {
          callback(resource, resourceKey);
        }
      },

      snapshot: () => {
        const retainCountsByResourceKeyByClaimSnapshot = new Map<
          C,
          Map<K, number>
        >();
        for (const [
          claim,
          resourceKey,
          count,
        ] of claimResourceRelation.getEntries()) {
          retainCountsByResourceKeyByClaimSnapshot
            .getOrInsertComputed(claim, () => new Map())
            .set(resourceKey, count);
        }

        return {
          claimLeaseCount: NonNegativeInt.orThrow(heldClaimLeases.size),
          retainCountsByResourceKeyByClaim:
            retainCountsByResourceKeyByClaimSnapshot,
          resourcesByKey: sharedResourceByKey.snapshot().resourcesByKey,
        };
      },

      [Symbol.asyncDispose]: () => disposables.disposeAsync(),
    };

    leakDetector.track(
      sharedResourceByKeyWithClaims,
      {
        name: "SharedResourceByKeyWithClaims",
        isLeaked: () =>
          sharedResourceByKeyWithClaimsRun.getState().type === "Running",
      },
      sharedResourceByKeyWithClaimsHandle,
    );

    return ok(sharedResourceByKeyWithClaims);
  };

// TODO: Add a lease-based reloadable resource when a concrete use case needs
// resource swapping. A ResourceRef-style get/set API is unsafe because set can
// dispose a resource still held by a caller of get. Model resource generations
// explicitly and distinguish two replacement policies, probably as separate
// APIs rather than a boolean option:
// - Overlapping: create and validate the replacement, publish it to new leases,
//   then dispose the old generation after its existing leases drain. This
//   supports zero-downtime reload and keeps the old generation when creation
//   fails, but both generations temporarily exist.
// - Exclusive: stop or queue new leases, drain and dispose the old generation,
//   then create and publish the replacement. This guarantees at most one live
//   resource, but introduces downtime and leaves no valid resource when creation
//   fails unless the owner retries or recreates the old configuration.
