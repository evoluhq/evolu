/**
 * Concurrency-safe helpers for efficient reuse of disposable resources.
 *
 * @module
 */

import { assert, assertNotAborted } from "./Assert.js";
import { identity } from "./Function.js";
import {
  createLookupMap,
  createLookupSet,
  type Lookup,
  type LookupOption,
} from "./Lookup.js";
import {
  createRefCount,
  createRefCountByKey,
  type RefCountByKey,
} from "./RefCount.js";
import { createRelation } from "./Relation.js";
import { ok } from "./Result.js";
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
import { NonNegativeInt, zeroNonNegativeInt } from "./Type.js";

export {
  createRefCount,
  createRefCountByKey,
  type CreateRefCountByKeyOptions,
  type RefCount,
  type RefCountByKey,
} from "./RefCount.js";

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

  /** Returns the current resource, or `undefined` if absent. */
  readonly get: () => BorrowedResource<T> | undefined;

  /** Returns the current shared-resource state for monitoring/debugging. */
  readonly snapshot: () => SharedResourceSnapshot;
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
  unabortable<SharedResource<T, D>, never, D>(async (run) => {
    const sharedResourceRun = run.create();
    let current: OwnedResource<T> | undefined;
    let idleDisposeFiber: Fiber<void, AbortError, D> | undefined;

    await using stack = new AsyncDisposableStack();
    const refCount = stack.use(createRefCount());

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

            refCount.increment();
            return ok(current.resource);
          }),
        ),
      ),

      release: unabortable<void, never, D>(() =>
        sharedResourceRun(
          mutex.withLock(async () => {
            if (refCount.decrement() > 0) return ok();

            if (!idleDisposeAfter) {
              await disposeCurrent();
              return ok();
            }

            idleDisposeFiber = sharedResourceRun<void, never>(async (run) => {
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

      getCount: () =>
        sharedResourceRun(mutex.withLock(() => ok(refCount.getCount()))),

      get: () => current?.resource,

      snapshot: () => ({
        isIdle: refCount.getCount() === 0 && !current && !idleDisposeFiber,
        mutex: mutex.snapshot(),
      }),

      [Symbol.asyncDispose]: () => moved.disposeAsync(),
    });
  });

/**
 * Shared {@link Resource}s keyed by logical identity.
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
 *
 * By default, {@link createSharedResourceByKey} uses reference identity for
 * keys, matching native `Map`. Callers may instead provide a
 * {@link Lookup
 * lookup} so logical equality is based on a derived stable key.
 */
export interface SharedResourceByKey<
  K,
  T extends Resource,
  D = unknown,
> extends AsyncDisposable {
  /**
   * Acquires the shared resource for `key`, creating it on first use.
   *
   * Once started, acquire runs to completion even if the caller aborts its
   * Fiber. Always await the result. A successful result still counts as an
   * acquired lease for `key` and must later be balanced with
   * {@link SharedResourceByKey.release | release}.
   */
  readonly acquire: (key: K) => Task<BorrowedResource<T>, never, D>;

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
  readonly release: (key: K) => Task<void, never, D>;

  /** Returns the current acquire count for `key`. Missing keys return `0`. */
  readonly getCount: (key: K) => Task<NonNegativeInt, never, D>;

  /** Returns the current resource for `key`, or `undefined` if absent. */
  readonly get: (key: K) => BorrowedResource<T> | undefined;

  /** Returns current keyed resources and their per-key mutex state. */
  readonly snapshot: () => SharedResourceByKeySnapshot<K, T>;
}

/** Snapshot returned by {@link SharedResourceByKey.snapshot}. */
export interface SharedResourceByKeySnapshot<K, T extends Resource> {
  /** Current borrowed resources by key. */
  readonly resourcesByKey: ReadonlyMap<K, BorrowedResource<T>>;

  /** Current mutex state for each key in the resource snapshot. */
  readonly mutexByKey: ReadonlyMap<K, SemaphoreSnapshot | null>;
}

/** Options for {@link createSharedResourceByKey}. */
export interface SharedResourceByKeyOptions<K, L = K>
  extends Pick<SharedResourceOptions, "idleDisposeAfter">, LookupOption<K, L> {
  /** Called after `key`'s current resource is disposed and cleared. */
  readonly onDisposed?: (key: K) => void;
}

/**
 * Creates {@link SharedResourceByKey}.
 *
 * The `create` Task is scoped to one key. It must not fail, matching
 * {@link createSharedResource}.
 */
export function createSharedResourceByKey<
  K = unknown,
  T extends Resource = Resource,
  D = unknown,
>(
  create: (key: K) => Task<T, never, D>,
): Task<SharedResourceByKey<K, T, D>, never, D>;
export function createSharedResourceByKey<K, T extends Resource, D, L = K>(
  create: (key: K) => Task<T, never, D>,
  options: SharedResourceByKeyOptions<K, L>,
): Task<SharedResourceByKey<K, T, D>, never, D>;
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
): Task<SharedResourceByKey<K, T, D>, never, D> {
  return unabortable<SharedResourceByKey<K, T, D>, never, D>(async (run) => {
    const sharedResourceByKeyRun = run.create();
    const sharedResourcesByKey = createLookupMap<K, SharedResource<T, D>, L>({
      lookup,
    });

    await using stack = new AsyncDisposableStack();

    const mutexByKey = stack.use(createMutexByKey<K, L>({ lookup }));
    stack.defer(async () => {
      await using stack = new AsyncDisposableStack();
      for (const resource of sharedResourcesByKey.values()) stack.use(resource);
      await stack.disposeAsync();
      sharedResourcesByKey.clear();
    });
    // Register as the last so disposal aborts further calls first.
    stack.use(sharedResourceByKeyRun);

    const moved = stack.move();

    return ok({
      acquire: (key) =>
        unabortable<BorrowedResource<T>, never, D>(() =>
          sharedResourceByKeyRun(
            mutexByKey.withLock(key, async (run) => {
              let sharedResource = sharedResourcesByKey.get(key);

              if (!sharedResource) {
                const sharedResourceResult = await run(
                  createSharedResource(create(key), {
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
            if (!sharedResource) return ok(zeroNonNegativeInt);
            return run(sharedResource.getCount);
          }),
        ),

      get: (key) => sharedResourcesByKey.get(key)?.get(),

      snapshot: () => {
        const resourcesByKey = new Map<K, BorrowedResource<T>>();
        const mutexSnapshotsByKey = new Map<K, SemaphoreSnapshot | null>();

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
}

/**
 * Shared {@link Resource}s keyed by logical identity and retained by claims.
 *
 * This combines {@link SharedResourceByKey} with claim tracking. Resources are
 * kept alive while at least one claim retains their key.
 *
 * By default, {@link createSharedResourceByKeyWithClaims} uses reference
 * identity for both resource keys and claims, matching native `Map` and `Set`.
 * Callers may instead provide {@link Lookup lookup} functions so logical
 * equality is based on derived stable keys.
 */
export interface SharedResourceByKeyWithClaims<
  K,
  C,
  T extends Resource,
  D = unknown,
> extends AsyncDisposable {
  /** Retains each resource key for `claim`. */
  readonly addClaim: (
    claim: C,
    resourceKeys: ReadonlyArray<K>,
  ) => Task<void, never, D>;

  /** Releases each previously retained resource key for `claim`. */
  readonly removeClaim: (
    claim: C,
    resourceKeys: ReadonlyArray<K>,
  ) => Task<void, never, D>;

  /** Returns the current resource for `key`, or `undefined` if absent. */
  readonly getResource: (key: K) => BorrowedResource<T> | undefined;

  /** Returns the current unique claims retaining `key`. */
  readonly getClaimsForResource: (key: K) => ReadonlySet<C>;

  /** Returns the current unique resource keys retained by `claim`. */
  readonly getResourceKeysForClaim: (claim: C) => ReadonlySet<K>;

  /** Returns the current unique resources retained by `claim`. */
  readonly getResourcesForClaim: (claim: C) => ReadonlySet<BorrowedResource<T>>;
}

/** Options for {@link createSharedResourceByKeyWithClaims}. */
export interface SharedResourceByKeyWithClaimsOptions<
  K,
  C,
  T extends Resource,
  LK = K,
  LC = C,
> extends Pick<SharedResourceOptions, "idleDisposeAfter"> {
  /** Derives logical identity for resource keys. Defaults to {@link identity}. */
  readonly resourceLookup?: Lookup<K, LK>;

  /** Derives logical identity for claims. Defaults to {@link identity}. */
  readonly claimLookup?: Lookup<C, LC>;

  /** Called when a key transitions from zero claims to one claim. */
  readonly onFirstClaimAdded?: (
    claim: C,
    resource: BorrowedResource<T>,
    resourceKey: K,
  ) => void;

  /** Called when a key transitions from one claim to zero claims. */
  readonly onLastClaimRemoved?: (
    claim: C,
    resource: BorrowedResource<T>,
    resourceKey: K,
  ) => void;
}

/**
 * Creates {@link SharedResourceByKeyWithClaims}.
 *
 * Claim-resource pairs are reference-counted by logical identity. The
 * underlying resource for a key is acquired on the first active claim and
 * released when the last active claim for that key is removed.
 */
export function createSharedResourceByKeyWithClaims<
  T extends Resource,
  K = unknown,
  C = unknown,
  D = unknown,
>(
  create: (key: K) => Task<T, never, D>,
): Task<SharedResourceByKeyWithClaims<K, C, T, D>, never, D>;
export function createSharedResourceByKeyWithClaims<
  T extends Resource,
  K,
  C,
  D,
  LK = K,
  LC = C,
>(
  create: (key: K) => Task<T, never, D>,
  options: SharedResourceByKeyWithClaimsOptions<K, C, T, LK, LC>,
): Task<SharedResourceByKeyWithClaims<K, C, T, D>, never, D>;
export function createSharedResourceByKeyWithClaims<
  T extends Resource,
  K = unknown,
  C = unknown,
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
): Task<SharedResourceByKeyWithClaims<K, C, T, D>, never, D> {
  return unabortable<SharedResourceByKeyWithClaims<K, C, T, D>, never, D>(
    async (run) => {
      const sharedResourceClaimsRun = run.create();
      await using stack = new AsyncDisposableStack();

      const keyByClaim = createRelation<C, K, LC, LK>({
        lookupA: claimLookup,
        lookupB: resourceLookup,
      });
      const pairRefCountsByClaim = stack.adopt(
        createLookupMap<C, RefCountByKey<K>, LC>({ lookup: claimLookup }),
        (pairRefCountsByClaim) => {
          for (const pairRefCountByKey of pairRefCountsByClaim.values()) {
            pairRefCountByKey[Symbol.dispose]();
          }
          pairRefCountsByClaim.clear();
        },
      );

      const mutexByKey = stack.use(
        createMutexByKey<K, LK>({ lookup: resourceLookup }),
      );

      stack.defer(() => {
        keyByClaim.clear();
      });

      const sharedResourcesByKeyResult = await sharedResourceClaimsRun(
        createSharedResourceByKey(create, {
          idleDisposeAfter,
          lookup: resourceLookup,
        }),
      );
      assertNotAborted(sharedResourcesByKeyResult);
      const sharedResourcesByKey = stack.use(sharedResourcesByKeyResult.value);

      // Register as the last so disposal aborts further calls first.
      stack.use(sharedResourceClaimsRun);

      /** Asserts that one call does not contain the same logical key twice. */
      const assertNoDuplicateResourceKeys = (
        resourceKeys: ReadonlyArray<K>,
      ) => {
        assert(
          createLookupSet<K, LK>({
            lookup: resourceLookup,
            values: resourceKeys,
          }).size === resourceKeys.length,
          "resourceKeys must not contain lookup duplicates.",
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
                    let pairRefCountByKey = pairRefCountsByClaim.get(claim);
                    if (!pairRefCountByKey) {
                      pairRefCountByKey = createRefCountByKey<K, LK>({
                        lookup: resourceLookup,
                      });
                      pairRefCountsByClaim.set(claim, pairRefCountByKey);
                    }

                    if (pairRefCountByKey.has(resourceKey)) {
                      pairRefCountByKey.increment(resourceKey);
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

                    assert(
                      keyByClaim.add(claim, resourceKey),
                      "Claim-resource relation must be absent before first retain.",
                    );

                    pairRefCountByKey.increment(resourceKey);

                    if (firstResource) {
                      onFirstClaimAdded?.(claim, firstResource, resourceKey);
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
                    const pairRefCountByKey = pairRefCountsByClaim.get(claim);

                    assert(
                      pairRefCountByKey,
                      "Claim-resource pair must not be removed more times than added.",
                    );

                    if (pairRefCountByKey.decrement(resourceKey) > 0) {
                      return ok();
                    }

                    if (pairRefCountByKey.keys().size === 0) {
                      pairRefCountsByClaim.delete(claim);
                      pairRefCountByKey[Symbol.dispose]();
                    }

                    assert(
                      keyByClaim.remove(claim, resourceKey),
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

                    onLastClaimRemoved?.(claim, resource, resourceKey);

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
}

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
