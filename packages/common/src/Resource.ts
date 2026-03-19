/**
 * Concurrency-safe helpers for efficient reuse of disposable resources.
 *
 * @module
 */

import { assert, assertNotAborted } from "./Assert.js";
import { ok } from "./Result.js";
import {
  createStructuralMap,
  createStructuralRelation,
  createStructuralSet,
  type Structural,
  type StructuralKey,
} from "./Structural.js";
import {
  createMutex,
  createMutexByKey,
  sleep,
  unabortable,
  type AbortError,
  type Fiber,
  type MutexRef,
  type SemaphoreSnapshot,
  type Task,
} from "./Task.js";
import { type Duration } from "./Time.js";
import { NonNegativeInt } from "./Type.js";

/**
 * Disposable resource.
 *
 * A resource is any object that implements {@link Disposable} or
 * {@link AsyncDisposable}.
 *
 * Disposal must succeed. A disposer that throws indicates an unrecoverable
 * invariant violation, not a recoverable domain error, so resource lifecycle
 * APIs let that error propagate. Disposal failures shall surface at the app
 * boundary, where they are shown to the user and logged. The purpose of
 * resource helpers is to guarantee cleanup and prevent leaks.
 *
 * @see {@link ResourceRef}
 * @see {@link createResourceRef}
 * @see {@link SharedResource}
 * @see {@link createSharedResource}
 * @see {@link SharedResourceByKey}
 * @see {@link createSharedResourceByKey}
 */
export type Resource = Disposable | AsyncDisposable;

/**
 * Borrowed {@link Resource}.
 *
 * A borrowed resource is a {@link Resource} without disposal methods.
 *
 * Another abstraction owns the resource and controls its lifecycle. Exposing
 * disposal would break that ownership and allow callers to dispose a resource
 * they do not own.
 */
export type BorrowedResource<T extends Resource> = Omit<
  T,
  typeof Symbol.dispose | typeof Symbol.asyncDispose
>;

/**
 * {@link Resource} reference.
 *
 * A {@link MutexRef}-like reference for resources. `ResourceRef` controls the
 * resource lifecycle.
 *
 * Callers get the current resource as {@link BorrowedResource} to ensure only
 * the `ResourceRef` can dispose it.
 *
 * Setting a new resource first disposes the current one and then sets the next.
 * Calling abort on the returned Fiber does not roll that change back once it
 * has started. The create Task must not fail. If it could fail, the current
 * resource would be disposed without the next resource installed.
 */
export interface ResourceRef<
  T extends Resource,
  D = unknown,
> extends AsyncDisposable {
  /** Returns the current resource. */
  readonly get: Task<BorrowedResource<T>, never, D>;

  /**
   * Disposes the current resource and then creates and sets the next.
   *
   * Once started, this operation runs to completion even if the caller aborts
   * its Fiber. Always await the result instead of treating abort as rollback.
   */
  readonly set: (create: Task<T, never, D>) => Task<void, never, D>;
}

/** Creates {@link ResourceRef}. */
export const createResourceRef = <T extends Resource, D>(
  create: Task<T, never, D>,
): Task<ResourceRef<T, D>, never, D> =>
  unabortable<ResourceRef<T, D>, never, D>(async (run) => {
    const resourceRefRun = run.create();

    await using stack = new AsyncDisposableStack();
    stack.use(resourceRefRun);

    const initial = await resourceRefRun(create);
    if (!initial.ok) return initial;

    let current = createOwnedResource(initial.value);

    const mutex = stack.use(createMutex());
    stack.defer(() => current.stack.disposeAsync());
    // Register as the last so disposal aborts further calls first.
    // Repeated registration is safe because disposal is idempotent.
    stack.use(resourceRefRun);

    const moved = stack.move();

    return ok({
      get: () => resourceRefRun(mutex.withLock(() => ok(current.resource))),

      set: (create: Task<T, never, D>): Task<void, never, D> =>
        unabortable(() =>
          resourceRefRun(
            mutex.withLock(async (run) => {
              await current.stack.disposeAsync();
              const next = await run(create);
              if (!next.ok) return next;
              current = createOwnedResource(next.value);
              return ok();
            }),
          ),
        ),

      [Symbol.asyncDispose]: () => moved.disposeAsync(),
    });
  });

/**
 * Shared {@link Resource}.
 *
 * Lazily acquires the underlying resource on the first
 * {@link SharedResource.acquire | acquire} call, shares it across callers, and
 * disposes it when the last caller {@link SharedResource.release | releases}
 * it.
 *
 * Calls to {@link SharedResource.release | release} must be balanced with
 * successful calls to {@link SharedResource.acquire | acquire}. Releasing more
 * times than acquired is a programmer error checked with {@link assert}.
 */
export interface SharedResource<
  T extends Resource,
  D = unknown,
> extends AsyncDisposable {
  /** Returns the current shared-resource state for monitoring/debugging. */
  readonly snapshot: () => SharedResourceSnapshot;

  /** Returns the current resource, or `undefined` if absent. */
  readonly get: () => BorrowedResource<T> | undefined;

  /**
   * Acquires a shared reference.
   *
   * The first call lazily creates the resource. Later calls reuse the same
   * resource until the final {@link SharedResource.release | release} starts the
   * final disposal path. Disposal happens immediately by default, or after
   * {@link SharedResourceOptions.idleDisposeAfter | idleDisposeAfter} elapses
   * when configured.
   *
   * Once started, acquire runs to completion even if the caller aborts its
   * Fiber. Always await the result. A successful result still counts as an
   * acquired lease and must later be balanced with
   * {@link SharedResource.release | release}.
   */
  readonly acquire: Task<BorrowedResource<T>, never, D>;

  /**
   * Releases one previously acquired shared reference.
   *
   * When the last acquired reference is released, the current resource is
   * disposed immediately by default. If
   * {@link SharedResourceOptions.idleDisposeAfter | idleDisposeAfter} is set,
   * disposal is scheduled instead and a new acquire during that delay reuses
   * the current resource.
   *
   * Once started, release runs to completion even if the caller aborts its
   * Fiber. Always await the result instead of assuming no cleanup happened.
   */
  readonly release: Task<void, never, D>;

  /** Returns the current acquire count. */
  readonly getCount: Task<NonNegativeInt, never, D>;
}

/** Snapshot returned by {@link SharedResource.snapshot}. */
export interface SharedResourceSnapshot {
  /**
   * Whether the resource has no current value, no borrowers, and no pending
   * idle disposal.
   */
  readonly isIdle: boolean;

  /** Current mutex state for monitoring/debugging. */
  readonly mutex: SemaphoreSnapshot;
}

/** Options for {@link createSharedResource}. */
export interface SharedResourceOptions {
  /**
   * Keeps the resource alive briefly after the last release.
   *
   * This avoids immediate disposal when the resource is expensive to create and
   * likely to be acquired again soon. A new acquire during this delay cancels
   * the pending disposal and reuses the current resource.
   */
  readonly idleDisposeAfter?: Duration | undefined;

  /** Called after the current resource is disposed and cleared. */
  readonly onDisposed?: () => void;
}

/** Creates {@link SharedResource}. */
export const createSharedResource = <T extends Resource, D>(
  create: Task<T, never, D>,
  { idleDisposeAfter, onDisposed }: SharedResourceOptions = {},
): Task<SharedResource<T, D>, never, D> =>
  unabortable<SharedResource<T, D>, never, D>((run) => {
    const sharedResourceRun = run.create();

    let acquireCount = NonNegativeInt.orThrow(0);
    let current: OwnedResource<T> | undefined;
    let idleDisposeFiber: Fiber<void, AbortError, D> | undefined;

    const stack = new AsyncDisposableStack();

    const mutex = stack.use(createMutex());

    const disposeCurrent = async () => {
      if (!current) return;
      await using stack = new AsyncDisposableStack();
      if (onDisposed) stack.defer(onDisposed);
      stack.use(current.stack);
      current = undefined;
    };
    stack.defer(disposeCurrent);

    // Register as the last so disposal aborts further calls first.
    stack.use(sharedResourceRun);

    const moved = stack.move();

    return ok({
      snapshot: () => ({
        isIdle: acquireCount === 0 && !current && !idleDisposeFiber,
        mutex: mutex.snapshot(),
      }),

      get: () => current?.resource,

      acquire: unabortable<BorrowedResource<T>, never, D>(() =>
        sharedResourceRun(
          mutex.withLock(async (run) => {
            if (idleDisposeFiber) {
              idleDisposeFiber.abort();
              idleDisposeFiber = undefined;
            }

            if (!current) {
              const resource = await run(create);
              if (!resource.ok) return resource;
              current = createOwnedResource(resource.value);
            }

            acquireCount = NonNegativeInt.orThrow(acquireCount + 1);
            return ok(current.resource);
          }),
        ),
      ),

      release: unabortable<void, never, D>(() =>
        sharedResourceRun(
          mutex.withLock(async () => {
            assert(
              acquireCount > 0,
              "Release must not be called more times than acquire.",
            );

            acquireCount = NonNegativeInt.orThrow(acquireCount - 1);
            if (acquireCount > 0) return ok();

            if (!idleDisposeAfter) {
              await disposeCurrent();
              return ok();
            }

            idleDisposeFiber = sharedResourceRun(async (run) => {
              const slept = await run(sleep(idleDisposeAfter));
              if (!slept.ok) return slept;

              return run(
                mutex.withLock(async () => {
                  idleDisposeFiber = undefined;
                  await disposeCurrent();
                  return ok();
                }),
              );
            });

            return ok();
          }),
        ),
      ),

      getCount: () => sharedResourceRun(mutex.withLock(() => ok(acquireCount))),

      [Symbol.asyncDispose]: () => moved.disposeAsync(),
    });
  });

/**
 * Shared {@link Resource}s keyed by {@link StructuralKey}.
 *
 * A map-like registry of {@link SharedResource}s. Each key owns at most one
 * current resource instance.
 *
 * The first {@link SharedResourceByKey.acquire | acquire} for a key lazily
 * creates that key's resource. Later acquires for the same key reuse the same
 * resource until the final {@link SharedResourceByKey.release | release} starts
 * the final disposal path for that key. Disposal and registry removal happen
 * immediately by default, or after
 * {@link SharedResourceByKeyOptions.idleDisposeAfter | idleDisposeAfter} elapses
 * when configured.
 *
 * Different keys are independent and may progress concurrently. Operations for
 * the same key are serialized. Calls to
 * {@link SharedResourceByKey.release | release} must be balanced with successful
 * calls to {@link SharedResourceByKey.acquire | acquire}. Acquire and release
 * may still be aborted before they start on an already-stopped Run, but once
 * started they run to completion. Releasing more times than acquired is a
 * programmer error checked with {@link assert}.
 */
export interface SharedResourceByKey<
  K,
  T extends Resource,
  D = unknown,
> extends AsyncDisposable {
  /** Returns the current resource for `key`, or `undefined` if absent. */
  readonly get: (key: Structural<K>) => BorrowedResource<T> | undefined;

  /**
   * Acquires the shared resource for `key`, creating it on first use.
   *
   * Once started, acquire runs to completion even if the caller aborts its
   * Fiber. Always await the result. A successful result still counts as an
   * acquired lease for `key` and must later be balanced with
   * {@link SharedResourceByKey.release | release}.
   */
  readonly acquire: (key: Structural<K>) => Task<BorrowedResource<T>, never, D>;

  /**
   * Releases one previously acquired shared reference for `key`.
   *
   * When the last acquired reference for `key` is released, that key's current
   * resource is disposed and removed from the registry immediately by default.
   * If {@link SharedResourceByKeyOptions.idleDisposeAfter | idleDisposeAfter} is
   * set, disposal and registry removal are scheduled instead and a new acquire
   * for the same key during that delay reuses the current resource.
   *
   * Once started, release runs to completion even if the caller aborts its
   * Fiber. Always await the result instead of assuming no cleanup happened.
   */
  readonly release: (key: Structural<K>) => Task<void, never, D>;

  /** Returns the current acquire count for `key`. Missing keys return `0`. */
  readonly getCount: (key: Structural<K>) => Task<NonNegativeInt, never, D>;

  /** Returns current keyed resources and their per-key mutex state. */
  readonly snapshot: () => SharedResourceByKeySnapshot<K, T>;
}

/** Snapshot returned by {@link SharedResourceByKey.snapshot}. */
export interface SharedResourceByKeySnapshot<K, T extends Resource> {
  /** Current borrowed resources by key. */
  readonly resourcesByKey: ReadonlyMap<Structural<K>, BorrowedResource<T>>;

  /** Current mutex state for each key in the resource snapshot. */
  readonly mutexByKey: ReadonlyMap<Structural<K>, SemaphoreSnapshot | null>;
}

/** Options for {@link createSharedResourceByKey}. */
export interface SharedResourceByKeyOptions<K> extends Pick<
  SharedResourceOptions,
  "idleDisposeAfter"
> {
  /** Called after `key`'s current resource is disposed and cleared. */
  readonly onDisposed?: (key: Structural<K>) => void;
}

/**
 * Creates {@link SharedResourceByKey}.
 *
 * The `create` Task is scoped to one key. It must not fail, matching
 * {@link createSharedResource}.
 */
export const createSharedResourceByKey = <
  K = StructuralKey,
  T extends Resource = Resource,
  D = unknown,
>(
  create: (key: K) => Task<T, never, D>,
  { idleDisposeAfter, onDisposed }: SharedResourceByKeyOptions<K> = {},
): Task<SharedResourceByKey<K, T, D>, never, D> =>
  unabortable<SharedResourceByKey<K, T, D>, never, D>((run) => {
    const sharedResourceByKeyRun = run.create();
    const sharedResourcesByKey = createStructuralMap<K, SharedResource<T, D>>();

    const stack = new AsyncDisposableStack();

    const mutexByKey = stack.use(createMutexByKey<K>());
    stack.defer(async () => {
      const stack = new AsyncDisposableStack();
      for (const resource of sharedResourcesByKey.values()) stack.use(resource);
      await stack.disposeAsync();
      sharedResourcesByKey.clear();
    });
    // Register as the last so disposal aborts further calls first.
    stack.use(sharedResourceByKeyRun);

    const moved = stack.move();

    return ok({
      get: (key) => sharedResourcesByKey.get(key)?.get(),

      acquire: (key) =>
        unabortable<BorrowedResource<T>, never, D>(() =>
          sharedResourceByKeyRun(
            mutexByKey.withLock(key, async (run) => {
              let sharedResource = sharedResourcesByKey.get(key);

              if (!sharedResource) {
                const sharedResourceResult = await run(
                  createSharedResource(create(key as K), {
                    idleDisposeAfter,
                    onDisposed: () => {
                      onDisposed?.(key);

                      void sharedResourceByKeyRun(
                        mutexByKey.withLock(key, async () => {
                          if (
                            sharedResource &&
                            sharedResourcesByKey.get(key) === sharedResource &&
                            sharedResource.snapshot().isIdle
                          ) {
                            sharedResourcesByKey.delete(key);
                            await sharedResource[Symbol.asyncDispose]();
                          }
                          return ok();
                        }),
                      );
                    },
                  }),
                );
                assertNotAborted(sharedResourceResult);
                sharedResource = sharedResourceResult.value;
                sharedResourcesByKey.set(key, sharedResource);
              }

              return run(sharedResource.acquire);
            }),
          ),
        ),

      release: (key) =>
        unabortable<void, never, D>(() =>
          sharedResourceByKeyRun(
            mutexByKey.withLock(key, async () => {
              const sharedResource = sharedResourcesByKey.get(key);
              assert(
                sharedResource,
                "Release must not be called more times than acquire.",
              );
              return sharedResourceByKeyRun(sharedResource.release);
            }),
          ),
        ),

      getCount: (key) => () =>
        sharedResourceByKeyRun(
          mutexByKey.withLock(key, async (run) => {
            const sharedResource = sharedResourcesByKey.get(key);
            if (!sharedResource) return ok(NonNegativeInt.orThrow(0));
            return run(sharedResource.getCount);
          }),
        ),

      snapshot: () => {
        const resourcesByKey = new Map<Structural<K>, BorrowedResource<T>>();
        const mutexSnapshotsByKey = new Map<
          Structural<K>,
          SemaphoreSnapshot | null
        >();

        for (const [key, sharedResource] of sharedResourcesByKey.entries()) {
          const resource = sharedResource.get();
          if (!resource) continue;

          resourcesByKey.set(key, resource);
          mutexSnapshotsByKey.set(key, mutexByKey.snapshot(key));
        }

        return {
          resourcesByKey,
          mutexByKey: mutexSnapshotsByKey,
        };
      },

      [Symbol.asyncDispose]: () => moved.disposeAsync(),
    });
  });

/**
 * Shared {@link Resource}s keyed by structural keys and retained by claims.
 *
 * This combines {@link SharedResourceByKey} with structural claim tracking.
 * Resources are kept alive while at least one claim retains their key.
 */
export interface SharedResourceByKeyWithClaims<
  K,
  C,
  T extends Resource,
  D = unknown,
> extends AsyncDisposable {
  /** Retains each resource key for `claim`. */
  readonly addClaim: (
    claim: Structural<C>,
    resourceKeys: ReadonlyArray<Structural<K>>,
  ) => Task<void, never, D>;

  /** Releases each previously retained resource key for `claim`. */
  readonly removeClaim: (
    claim: Structural<C>,
    resourceKeys: ReadonlyArray<Structural<K>>,
  ) => Task<void, never, D>;

  /** Returns the current resource for `key`, or `undefined` if absent. */
  readonly getResource: (key: Structural<K>) => BorrowedResource<T> | undefined;

  /** Returns the current unique claims retaining `key`. */
  readonly getClaimsForResource: (
    key: Structural<K>,
  ) => ReadonlySet<Structural<C>>;

  /** Returns the current unique resource keys retained by `claim`. */
  readonly getResourceKeysForClaim: (
    claim: Structural<C>,
  ) => ReadonlySet<Structural<K>>;

  /** Returns the current unique resources retained by `claim`. */
  readonly getResourcesForClaim: (
    claim: Structural<C>,
  ) => ReadonlySet<BorrowedResource<T>>;
}

/** Options for {@link createSharedResourceByKeyWithClaims}. */
export interface SharedResourceByKeyWithClaimsOptions<
  K,
  T extends Resource,
> extends Pick<SharedResourceOptions, "idleDisposeAfter"> {
  /** Called when a key transitions from zero claims to one claim. */
  readonly onFirstClaimAdded?: (
    resource: BorrowedResource<T>,
    resourceKey: Structural<K>,
  ) => void;

  /** Called when a key transitions from one claim to zero claims. */
  readonly onLastClaimRemoved?: (
    resource: BorrowedResource<T>,
    resourceKey: Structural<K>,
  ) => void;
}

/**
 * Creates {@link SharedResourceByKeyWithClaims}.
 *
 * Claim-resource pairs are reference-counted by structural equality. The
 * underlying resource for a key is acquired on the first active claim and
 * released when the last active claim for that key is removed.
 */
export const createSharedResourceByKeyWithClaims = <
  T extends Resource,
  K = StructuralKey,
  C = StructuralKey,
  D = unknown,
>(
  create: (key: K) => Task<T, never, D>,
  {
    idleDisposeAfter,
    onFirstClaimAdded,
    onLastClaimRemoved,
  }: SharedResourceByKeyWithClaimsOptions<K, T> = {},
): Task<SharedResourceByKeyWithClaims<K, C, T, D>, never, D> =>
  unabortable<SharedResourceByKeyWithClaims<K, C, T, D>, never, D>(
    async (run) => {
      const sharedResourceClaimsRun = run.create();

      await using stack = new AsyncDisposableStack();

      const keyByClaim = createStructuralRelation<C, K>();
      const pairRefCountsByClaim = createStructuralMap<
        C,
        ReturnType<typeof createStructuralMap<K, number>>
      >();

      const mutexByKey = stack.use(createMutexByKey<K>());

      stack.defer(() => {
        keyByClaim.clear();
        pairRefCountsByClaim.clear();
      });

      const sharedResourcesByKeyResult = await sharedResourceClaimsRun(
        createSharedResourceByKey(create, { idleDisposeAfter }),
      );
      assertNotAborted(sharedResourcesByKeyResult);
      const sharedResourcesByKey = stack.use(sharedResourcesByKeyResult.value);

      // Register as the last so disposal aborts further calls first.
      stack.use(sharedResourceClaimsRun);

      /** Asserts that one call does not contain the same structural key twice. */
      const assertNoDuplicateResourceKeys = (
        resourceKeys: ReadonlyArray<Structural<K>>,
      ) => {
        assert(
          createStructuralSet(resourceKeys).size === resourceKeys.length,
          "resourceKeys must not contain structural duplicates.",
        );
      };

      const moved = stack.move();

      return ok({
        addClaim: (claim, resourceKeys) =>
          unabortable<void, never, D>(() =>
            sharedResourceClaimsRun(async (run) => {
              assertNoDuplicateResourceKeys(resourceKeys);

              for (const resourceKey of resourceKeys) {
                const added = await run(
                  mutexByKey.withLock(resourceKey, async (run) => {
                    let keyRefCounts = pairRefCountsByClaim.get(claim);
                    if (!keyRefCounts) {
                      keyRefCounts = createStructuralMap<K, number>();
                      pairRefCountsByClaim.set(claim, keyRefCounts);
                    }

                    const currentPairCount = keyRefCounts.get(resourceKey) ?? 0;
                    if (currentPairCount > 0) {
                      keyRefCounts.set(resourceKey, currentPairCount + 1);
                      return ok();
                    }

                    const hasClaimsForKey = keyByClaim.hasB(resourceKey);
                    let firstResource: BorrowedResource<T> | undefined;
                    if (!hasClaimsForKey) {
                      const resourceResult = await run(
                        sharedResourcesByKey.acquire(resourceKey),
                      );
                      assertNotAborted(resourceResult);
                      firstResource = resourceResult.value;
                    }

                    const wasAdded = keyByClaim.add(claim, resourceKey);
                    assert(
                      wasAdded,
                      "Claim-resource relation must be absent before first retain.",
                    );

                    keyRefCounts.set(resourceKey, 1);

                    if (firstResource) {
                      onFirstClaimAdded?.(firstResource, resourceKey);
                    }

                    return ok();
                  }),
                );
                assertNotAborted(added);
              }

              return ok();
            }),
          ),

        removeClaim: (claim, resourceKeys) =>
          unabortable<void, never, D>(() =>
            sharedResourceClaimsRun(async (run) => {
              assertNoDuplicateResourceKeys(resourceKeys);

              for (const resourceKey of resourceKeys) {
                const removed = await run(
                  mutexByKey.withLock(resourceKey, async (run) => {
                    const keyRefCounts = pairRefCountsByClaim.get(claim);

                    assert(
                      keyRefCounts,
                      "Claim-resource pair must not be removed more times than added.",
                    );

                    const currentPairCount = keyRefCounts.get(resourceKey);
                    assert(
                      currentPairCount && currentPairCount > 0,
                      "Claim-resource pair must not be removed more times than added.",
                    );

                    if (currentPairCount > 1) {
                      keyRefCounts.set(resourceKey, currentPairCount - 1);
                      return ok();
                    }

                    keyRefCounts.delete(resourceKey);
                    if (keyRefCounts.size === 0) {
                      pairRefCountsByClaim.delete(claim);
                    }

                    const relationRemoved = keyByClaim.remove(
                      claim,
                      resourceKey,
                    );
                    assert(
                      relationRemoved,
                      "Claim-resource relation must exist while its ref count is positive.",
                    );

                    if (keyByClaim.hasB(resourceKey)) {
                      return ok();
                    }

                    const resource = sharedResourcesByKey.get(resourceKey);
                    assert(
                      resource,
                      "Resource must exist when the last claim is removed.",
                    );

                    onLastClaimRemoved?.(resource, resourceKey);

                    const releaseResult = await run(
                      sharedResourcesByKey.release(resourceKey),
                    );
                    assertNotAborted(releaseResult);

                    return ok();
                  }),
                );
                assertNotAborted(removed);
              }

              return ok();
            }),
          ),

        getResource: (key) => sharedResourcesByKey.get(key),

        getClaimsForResource: (key) => new Set(keyByClaim.iterateA(key)),

        getResourceKeysForClaim: (claim) => new Set(keyByClaim.iterateB(claim)),

        getResourcesForClaim: (claim) => {
          const resources = new Set<BorrowedResource<T>>();
          for (const key of keyByClaim.iterateB(claim)) {
            const resource = sharedResourcesByKey.get(key);
            assert(
              resource,
              "Resource must exist for every retained claim-resource relation.",
            );
            resources.add(resource);
          }
          return resources;
        },

        [Symbol.asyncDispose]: () => moved.disposeAsync(),
      });
    },
  );

interface OwnedResource<T extends Resource> {
  readonly resource: BorrowedResource<T>;
  readonly stack: AsyncDisposableStack;
}

const createOwnedResource = <T extends Resource>(
  resource: T,
): OwnedResource<T> => {
  const stack = new AsyncDisposableStack();
  stack.use(resource);
  return { resource, stack };
};

// TODO: Make lifecycle callbacks exception-safe. `onDisposed`,
// `onFirstClaimAdded`, and `onLastClaimRemoved` can currently leave resource
// bookkeeping in a partially updated state if they throw.
