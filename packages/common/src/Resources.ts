/**
 * Reference-counted resource management.
 *
 * @module
 */

import { assert } from "./Assert.js";
import { isNone } from "./Option.js";
import { createRefCount, type RefCount } from "./RefCount.js";
import { createRelation } from "./Relation.js";
import { ok } from "./Result.js";
import { createMutexByKey, unabortable, type Task } from "./Task.js";

/**
 * Async reference-counted resource management.
 *
 * Tracks which consumers use which shared resources and keeps resources alive
 * while at least one consumer is attached.
 *
 * ### Example
 *
 * ```ts
 * interface TransportConfig {
 *   readonly url: UrlString;
 * }
 *
 * interface Owner {
 *   readonly id: OwnerId;
 * }
 *
 * const resources = createResources<
 *   WebSocket,
 *   UrlString,
 *   TransportConfig,
 *   Owner,
 *   OwnerId
 * >({
 *   createResource: async (transport) => {
 *     const { createWebSocket } = run.deps;
 *     return await run.orThrow(
 *       createWebSocket(transport.url, {
 *         onOpen: handleWebSocketOpen(transport.url),
 *       }),
 *     );
 *   },
 *   getResourceId: (transportConfig) => transportConfig.url,
 *   getConsumerId: (owner) => owner.id,
 * });
 *
 * const handleWebSocketOpen = (transportUrl: UrlString) => (): void => {
 *   const ownerIds = resources.getConsumerIdsForResource(transportUrl);
 *   dbWorker.postMessage({ type: "CreateSyncMessages", ownerIds });
 * };
 *
 * dbWorker.onMessage = (message) => {
 *   switch (message.type) {
 *     case "OnSyncMessage":
 *       for (const [ownerId, syncMessage] of message.messagesByOwnerId) {
 *         const webSockets = resources.getResourcesForConsumerId(ownerId);
 *         for (const webSocket of webSockets) {
 *           if (webSocket.isOpen()) webSocket.send(syncMessage);
 *         }
 *       }
 *   }
 * };
 *
 * await run(
 *   resources.addConsumer({ id: "owner-1" as OwnerId }, [
 *     { url: "wss://server1.com" as UrlString },
 *     { url: "wss://server2.com" as UrlString },
 *   ]),
 * );
 *
 * await run(
 *   resources.addConsumer({ id: "owner-2" as OwnerId }, [
 *     { url: "wss://server1.com" as UrlString },
 *   ]),
 * );
 *
 * await run(
 *   resources.removeConsumer({ id: "owner-1" as OwnerId }, [
 *     { url: "wss://server1.com" as UrlString },
 *     { url: "wss://server2.com" as UrlString },
 *   ]),
 * );
 *
 * // The WebSocket for wss://server2.com is disposed because it has no consumers.
 * // The WebSocket for wss://server1.com stays alive because owner-2 still uses it.
 * ```
 */
export interface Resources<
  TResource extends Disposable,
  TResourceId extends string,
  TResourceConfig,
  TConsumer,
  TConsumerId extends string,
> extends AsyncDisposable {
  /** Attaches a consumer to resources. */
  readonly addConsumer: (
    consumer: TConsumer,
    resourceConfigs: ReadonlyArray<TResourceConfig>,
  ) => Task<void>;

  /** Detaches a consumer from resources. */
  readonly removeConsumer: (
    consumer: TConsumer,
    resourceConfigs: ReadonlyArray<TResourceConfig>,
  ) => Task<void>;

  readonly getConsumerIdsForResource: (
    resourceId: TResourceId,
  ) => ReadonlySet<TConsumerId>;

  readonly getResourcesForConsumerId: (
    consumerId: TConsumerId,
  ) => ReadonlySet<TResource>;
}

/** Creates {@link Resources}. */
export const createResources = <
  TResource extends Disposable,
  TResourceId extends string,
  TResourceConfig,
  TConsumer,
  TConsumerId extends string,
>({
  createResource,
  getResourceId,
  getConsumerId,
}: {
  /** Creates a resource for the provided configuration. */
  createResource: (resourceConfig: TResourceConfig) => Promise<TResource>;

  /** Maps a resource configuration to its shared resource identifier. */
  getResourceId: (resourceConfig: TResourceConfig) => TResourceId;

  /** Maps a consumer value to its stable consumer identifier. */
  getConsumerId: (consumer: TConsumer) => TConsumerId;
}): Resources<
  TResource,
  TResourceId,
  TResourceConfig,
  TConsumer,
  TConsumerId
> => {
  const resourcesById = new Map<TResourceId, TResource>();
  const consumerRefCountsByResourceId = new Map<
    TResourceId,
    RefCount<TConsumerId>
  >();
  const consumerIdsByResourceId = createRelation<TResourceId, TConsumerId>();
  const mutexByResourceId = createMutexByKey<TResourceId>();

  return {
    addConsumer: (consumer, resourceConfigs) => async (run) => {
      const consumerId = getConsumerId(consumer);

      for (const resourceConfig of resourceConfigs) {
        const resourceId = getResourceId(resourceConfig);

        const result = await run(
          unabortable(
            mutexByResourceId.withLock(resourceId, async () => {
              let resource = resourcesById.get(resourceId);
              if (!resource) {
                resource = await createResource(resourceConfig);
                resourcesById.set(resourceId, resource);
              }

              let consumerRefCountsByConsumerId =
                consumerRefCountsByResourceId.get(resourceId);
              if (!consumerRefCountsByConsumerId) {
                consumerRefCountsByConsumerId = createRefCount<TConsumerId>();
                consumerRefCountsByResourceId.set(
                  resourceId,
                  consumerRefCountsByConsumerId,
                );
              }

              const nextCount =
                consumerRefCountsByConsumerId.increment(consumerId);

              if (nextCount === 1) {
                consumerIdsByResourceId.add(resourceId, consumerId);
              }

              return ok();
            }),
          ),
        );
        assert(result.ok, "Unabortable addConsumer lock must not abort");
      }

      return ok();
    },

    removeConsumer: (consumer, resourceConfigs) => async (run) => {
      const consumerId = getConsumerId(consumer);

      for (const resourceConfig of resourceConfigs) {
        const resourceId = getResourceId(resourceConfig);

        const result = await run(
          unabortable(
            mutexByResourceId.withLock(resourceId, () => {
              const consumerRefCountsByConsumerId =
                consumerRefCountsByResourceId.get(resourceId);
              if (!consumerRefCountsByConsumerId) {
                assert(
                  !consumerIdsByResourceId.hasA(resourceId) &&
                    !resourcesById.has(resourceId),
                  "Ref counts, relation, and resources must stay symmetric",
                );
                return ok();
              }

              const nextCount =
                consumerRefCountsByConsumerId.decrement(consumerId);
              if (isNone(nextCount)) return ok();

              if (nextCount.value === 0) {
                consumerIdsByResourceId.remove(resourceId, consumerId);
              }

              if (!consumerIdsByResourceId.hasA(resourceId)) {
                consumerRefCountsByResourceId.delete(resourceId);
                const resource = resourcesById.get(resourceId);
                assert(
                  resource,
                  "Resource must exist when last consumer reference is removed",
                );
                resourcesById.delete(resourceId);
                resource[Symbol.dispose]();
              }

              return ok();
            }),
          ),
        );
        assert(result.ok, "Unabortable removeConsumer lock must not abort");
      }

      return ok();
    },

    getConsumerIdsForResource: (resourceId) =>
      new Set(consumerIdsByResourceId.getB(resourceId)),

    getResourcesForConsumerId: (consumerId) => {
      const resources = new Set<TResource>();
      const resourceIds = consumerIdsByResourceId.getA(consumerId);
      if (!resourceIds) return resources;

      for (const resourceId of resourceIds) {
        resources.add(resourcesById.get(resourceId)!);
      }

      return resources;
    },

    [Symbol.asyncDispose]: () => {
      for (const resource of resourcesById.values()) {
        resource[Symbol.dispose]();
      }
      resourcesById.clear();
      consumerRefCountsByResourceId.clear();
      consumerIdsByResourceId.clear();
      mutexByResourceId[Symbol.dispose]();
      return Promise.resolve();
    },
  };
};
