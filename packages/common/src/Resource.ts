/**
 * Resource lifecycle primitives.
 *
 * @module
 */

import { assert, assertNotAborted } from "./Assert.js";
import { ok } from "./Result.js";
import { createStructuralMap, type StructuralKey } from "./StructuralMap.js";
import {
  createMutex,
  createMutexByKey,
  sleep,
  unabortable,
  type AbortError,
  type Fiber,
  type MutexRef,
  type Task,
  type SemaphoreSnapshot,
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
  K extends StructuralKey,
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
}

/** Options for {@link createSharedResourceByKey}. */
export interface SharedResourceByKeyOptions<
  K extends StructuralKey,
> extends Pick<SharedResourceOptions, "idleDisposeAfter"> {
  /** Called after `key`'s current resource is disposed and cleared. */
  readonly onDisposed?: (key: K) => void;
}

/**
 * Creates {@link SharedResourceByKey}.
 *
 * The `create` Task is scoped to one key. It must not fail, matching
 * {@link createSharedResource}.
 */
export const createSharedResourceByKey = <
  K extends StructuralKey,
  T extends Resource,
  D,
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
      await disposeResources(sharedResourcesByKey.values());
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
                          assert(
                            sharedResource,
                            "Shared resource must exist when disposal callback runs.",
                          );

                          if (
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

      [Symbol.asyncDispose]: () => moved.disposeAsync(),
    });
  });

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

/**
 * Disposes resources via a temporary stack so one disposal failure does not
 * prevent later resources from being attempted.
 */
const disposeResources = async (
  resources: Iterable<Resource>,
): Promise<void> => {
  const stack = new AsyncDisposableStack();
  for (const resource of resources) stack.use(resource);
  await stack.disposeAsync();
};

// /**
//  *
//  * Tracks which consumers use which shared resources and keeps resources alive
//  * while at least one consumer is attached.
//  *
//  * ### Example
//  *
//  * ```ts
//  * interface TransportConfig {
//  *   readonly url: UrlString;
//  * }
//  *
//  * interface Owner {
//  *   readonly id: OwnerId;
//  * }
//  *
//  * const resources = createResources<
//  *   WebSocket,
//  *   UrlString,
//  *   TransportConfig,
//  *   Owner,
//  *   OwnerId
//  * >({
//  *   createResource: async (transport) => {
//  *     const { createWebSocket } = run.deps;
//  *     return await run.orThrow(
//  *       createWebSocket(transport.url, {
//  *         onOpen: handleWebSocketOpen(transport.url),
//  *       }),
//  *     );
//  *   },
//  *   getResourceId: (transportConfig) => transportConfig.url,
//  *   getConsumerId: (owner) => owner.id,
//  * });
//  *
//  * const handleWebSocketOpen = (transportUrl: UrlString) => (): void => {
//  *   const ownerIds = resources.getConsumerIdsForResource(transportUrl);
//  *   dbWorker.postMessage({ type: "CreateSyncMessages", ownerIds });
//  * };
//  *
//  * dbWorker.onMessage = (message) => {
//  *   switch (message.type) {
//  *     case "OnSyncMessage":
//  *       for (const [ownerId, syncMessage] of message.messagesByOwnerId) {
//  *         const webSockets = resources.getResourcesForConsumerId(ownerId);
//  *         for (const webSocket of webSockets) {
//  *           if (webSocket.isOpen()) webSocket.send(syncMessage);
//  *         }
//  *       }
//  *   }
//  * };
//  *
//  * await run(
//  *   resources.addConsumer({ id: "owner-1" as OwnerId }, [
//  *     { url: "wss://server1.com" as UrlString },
//  *     { url: "wss://server2.com" as UrlString },
//  *   ]),
//  * );
//  *
//  * await run(
//  *   resources.addConsumer({ id: "owner-2" as OwnerId }, [
//  *     { url: "wss://server1.com" as UrlString },
//  *   ]),
//  * );
//  *
//  * await run(
//  *   resources.removeConsumer({ id: "owner-1" as OwnerId }, [
//  *     { url: "wss://server1.com" as UrlString },
//  *     { url: "wss://server2.com" as UrlString },
//  *   ]),
//  * );
//  *
//  * // The WebSocket for wss://server2.com is disposed because it has no consumers.
//  * // The WebSocket for wss://server1.com stays alive because owner-2 still uses it.
//  * ```
//  */
// export interface Resources<
//   TResource extends Disposable | AsyncDisposable,
//   TResourceId extends string,
//   TResourceConfig,
//   TConsumer,
//   TConsumerId extends string,
// > extends AsyncDisposable {
//   /** Attaches a consumer to resources. */
//   readonly addConsumer: (
//     consumer: TConsumer,
//     resourceConfigs: ReadonlyArray<TResourceConfig>,
//   ) => Task<void>;

//   /** Detaches a consumer from resources. */
//   readonly removeConsumer: (
//     consumer: TConsumer,
//     resourceConfigs: ReadonlyArray<TResourceConfig>,
//   ) => Task<void>;

//   readonly getConsumerIdsForResource: (
//     resourceId: TResourceId,
//   ) => ReadonlySet<TConsumerId>;

//   readonly getResourcesForConsumerId: (
//     consumerId: TConsumerId,
//   ) => ReadonlySet<TResource>;
// }

// /** Creates {@link Resources}. */
// export const createResources = <
//   TResource extends Disposable | AsyncDisposable,
//   TResourceId extends string,
//   TResourceConfig,
//   TConsumer,
//   TConsumerId extends string,
// >({
//   createResource,
//   getResourceId,
//   getConsumerId,
// }: {
//   /** Creates a resource for the provided configuration. */
//   createResource: (resourceConfig: TResourceConfig) => Promise<TResource>;

//   /** Maps a resource configuration to its shared resource identifier. */
//   getResourceId: (resourceConfig: TResourceConfig) => TResourceId;

//   /** Maps a consumer value to its stable consumer identifier. */
//   getConsumerId: (consumer: TConsumer) => TConsumerId;
// }): Resources<
//   TResource,
//   TResourceId,
//   TResourceConfig,
//   TConsumer,
//   TConsumerId
// > => {
//   const resourcesById = new Map<TResourceId, TResource>();
//   const consumerRefCountsByResourceId = new Map<
//     TResourceId,
//     RefCount<TConsumerId>
//   >();
//   const consumerIdsByResourceId = createRelation<TResourceId, TConsumerId>();
//   const mutexByResourceId = createMutexByKey<TResourceId>();

//   return {
//     addConsumer: (consumer, resourceConfigs) => async (run) => {
//       const consumerId = getConsumerId(consumer);

//       for (const resourceConfig of resourceConfigs) {
//         const resourceId = getResourceId(resourceConfig);

//         const result = await run(
//           unabortable(
//             mutexByResourceId.withLock(resourceId, async () => {
//               let resource = resourcesById.get(resourceId);
//               if (!resource) {
//                 resource = await createResource(resourceConfig);
//                 resourcesById.set(resourceId, resource);
//               }

//               let consumerRefCountsByConsumerId =
//                 consumerRefCountsByResourceId.get(resourceId);
//               if (!consumerRefCountsByConsumerId) {
//                 consumerRefCountsByConsumerId = createRefCount<TConsumerId>();
//                 consumerRefCountsByResourceId.set(
//                   resourceId,
//                   consumerRefCountsByConsumerId,
//                 );
//               }

//               const nextCount =
//                 consumerRefCountsByConsumerId.increment(consumerId);

//               if (nextCount === 1) {
//                 consumerIdsByResourceId.add(resourceId, consumerId);
//               }

//               return ok();
//             }),
//           ),
//         );
//         assert(result.ok, "Unabortable addConsumer lock must not abort");
//       }

//       return ok();
//     },

//     removeConsumer: (consumer, resourceConfigs) => async (run) => {
//       const consumerId = getConsumerId(consumer);

//       for (const resourceConfig of resourceConfigs) {
//         const resourceId = getResourceId(resourceConfig);

//         const result = await run(
//           unabortable(
//             mutexByResourceId.withLock(resourceId, () => {
//               const consumerRefCountsByConsumerId =
//                 consumerRefCountsByResourceId.get(resourceId);
//               if (!consumerRefCountsByConsumerId) {
//                 assert(
//                   !consumerIdsByResourceId.hasA(resourceId) &&
//                     !resourcesById.has(resourceId),
//                   "Ref counts, relation, and resources must stay symmetric",
//                 );
//                 return ok();
//               }

//               const nextCount =
//                 consumerRefCountsByConsumerId.decrement(consumerId);
//               if (isNone(nextCount)) return ok();

//               if (nextCount.value === 0) {
//                 consumerIdsByResourceId.remove(resourceId, consumerId);
//               }

//               if (!consumerIdsByResourceId.hasA(resourceId)) {
//                 consumerRefCountsByResourceId.delete(resourceId);
//                 const resource = resourcesById.get(resourceId);
//                 assert(
//                   resource,
//                   "Resource must exist when last consumer reference is removed",
//                 );
//                 resourcesById.delete(resourceId);
//                 // await disposeResource(resource);
//               }

//               return ok();
//             }),
//           ),
//         );
//         assert(result.ok, "Unabortable removeConsumer lock must not abort");
//       }

//       return ok();
//     },

//     getConsumerIdsForResource: (resourceId) =>
//       new Set(consumerIdsByResourceId.iterateB(resourceId)),

//     getResourcesForConsumerId: (consumerId) => {
//       const resources = new Set<TResource>();
//       for (const resourceId of consumerIdsByResourceId.iterateA(consumerId)) {
//         resources.add(resourcesById.get(resourceId)!);
//       }

//       return resources;
//     },

//     [Symbol.asyncDispose]: async () => {
//       for (const resource of resourcesById.values()) {
//         await disposeResource(resource);
//       }
//       resourcesById.clear();
//       consumerRefCountsByResourceId.clear();
//       consumerIdsByResourceId.clear();
//       mutexByResourceId[Symbol.dispose]();
//     },
//   };
// };
