import { err, ok, Result } from "./Result.js";
import { PositiveInt } from "./Type.js";

/**
 * A generic resource manager that handles reference counting and delayed
 * disposal of shared resources. Useful for managing expensive resources like
 * WebSocket connections, database connections, or file handles that need to be
 * shared among multiple consumers.
 */
export interface RefCountedResourceManager<
  TResource extends Disposable,
  TResourceKey extends string,
  TResourceConfig,
  TConsumer,
  TConsumerId extends string,
> extends Disposable {
  /**
   * Adds a consumer to resources, creating them if necessary. Increments
   * reference counts for existing consumer-resource pairs.
   */
  readonly addConsumer: (
    consumer: TConsumer,
    resourceConfigs: ReadonlyArray<TResourceConfig>,
  ) => void;

  /**
   * Removes a consumer from resources. Decrements reference counts and
   * schedules disposal when no consumers remain.
   *
   * Returns an error if the resource doesn't exist or if the consumer wasn't
   * added to the resource.
   */
  readonly removeConsumer: (
    consumer: TConsumer,
    resourceConfigs: ReadonlyArray<TResourceConfig>,
  ) => Result<
    void,
    | ResourceNotFoundError<TResourceKey>
    | ConsumerNotFoundError<TConsumerId, TResourceKey>
  >;

  /** Gets the resource for the specified key, or null if it doesn't exist. */
  readonly getResource: (key: TResourceKey) => TResource | null;

  /** Gets all consumer IDs currently using the specified resource key. */
  readonly getConsumersForResource: (
    key: TResourceKey,
  ) => ReadonlyArray<TConsumerId>;

  /** Checks if a consumer is currently using any resources. */
  readonly hasConsumerAnyResource: (consumer: TConsumer) => boolean;

  /**
   * Gets the consumer for the specified consumer ID, or null if not found or
   * not using any resources.
   */
  readonly getConsumer: (consumerId: TConsumerId) => TConsumer | null;
}

/** Error when trying to remove a consumer from a resource that doesn't exist. */
export interface ResourceNotFoundError<TResourceKey extends string = string> {
  readonly type: "ResourceNotFoundError";
  readonly resourceKey: TResourceKey;
}

/** Error when trying to remove a consumer that wasn't added to a resource. */
export interface ConsumerNotFoundError<
  TConsumerId extends string = string,
  TResourceKey extends string = string,
> {
  readonly type: "ConsumerNotFoundError";
  readonly consumerId: TConsumerId;
  readonly resourceKey: TResourceKey;
}

export interface ResourceManagerConfig<
  TResource extends Disposable,
  TResourceKey extends string,
  TResourceConfig,
  TConsumer,
  TConsumerId extends string,
> {
  /** Creates a new resource for the given config. */
  readonly createResource: (config: TResourceConfig) => TResource;

  /** Extracts a unique key from a resource config for deduplication. */
  readonly getResourceKey: (config: TResourceConfig) => TResourceKey;

  /** Extracts a unique identifier from a consumer for reference counting. */
  readonly getConsumerId: (consumer: TConsumer) => TConsumerId;

  /**
   * Delay in milliseconds before disposing unused resources. Helps avoid
   * resource churn during rapid add/remove cycles. Defaults to 100ms.
   */
  readonly disposalDelay?: number;
}

/**
 * Creates a reference-counted resource manager.
 *
 * This manager tracks which consumers are using which resources and maintains
 * reference counts to know when it's safe to dispose resources. Resources are
 * created on-demand and disposed with a configurable delay to avoid churn.
 *
 * ### Example Usage
 *
 * ```ts
 * // WebSocket connections manager
 * interface WebSocketConfig {
 *   readonly url: WebSocketUrl;
 * }
 *
 * type WebSocketUrl = string & Brand<"WebSocketUrl">;
 * type UserId = string & Brand<"UserId">;
 *
 * const wsManager = createRefCountedResourceManager<
 *   WebSocket,
 *   WebSocketUrl,
 *   WebSocketConfig,
 *   User,
 *   UserId
 * >({
 *   createResource: (config) => new WebSocket(config.url),
 *   getResourceKey: (config) => config.url,
 *   getConsumerId: (user) => user.id,
 *   disposalDelay: 1000,
 * });
 *
 * // Add users to WebSocket connections
 * wsManager.addConsumer(user1, [
 *   { url: "ws://server1.com" as WebSocketUrl },
 *   { url: "ws://server2.com" as WebSocketUrl },
 * ]);
 * wsManager.addConsumer(user2, [
 *   { url: "ws://server1.com" as WebSocketUrl },
 * ]);
 *
 * // Remove users - server1 stays alive (user2 still using it)
 * wsManager.removeConsumer(user1, [
 *   { url: "ws://server1.com" as WebSocketUrl },
 *   { url: "ws://server2.com" as WebSocketUrl },
 * ]);
 *
 * // server2 gets disposed after delay, server1 stays alive
 * ```
 */
export const createRefCountedResourceManager = <
  TResource extends Disposable,
  TResourceKey extends string,
  TResourceConfig,
  TConsumer,
  TConsumerId extends string,
>(
  config: ResourceManagerConfig<
    TResource,
    TResourceKey,
    TResourceConfig,
    TConsumer,
    TConsumerId
  >,
): RefCountedResourceManager<
  TResource,
  TResourceKey,
  TResourceConfig,
  TConsumer,
  TConsumerId
> => {
  let isDisposed = false;

  const resources = new Map<TResourceKey, TResource>();
  const consumerCounts = new Map<TResourceKey, Map<TConsumerId, PositiveInt>>();
  const consumers = new Map<TConsumerId, TConsumer>();
  const disposalTimeouts = new Map<
    TResourceKey,
    ReturnType<typeof setTimeout>
  >();

  const disposalDelay = config.disposalDelay ?? 100;

  const ensureResource = (resourceConfig: TResourceConfig) => {
    const key = config.getResourceKey(resourceConfig);
    const timeout = disposalTimeouts.get(key);
    if (timeout) {
      clearTimeout(timeout);
      disposalTimeouts.delete(key);
    }

    if (!resources.has(key)) {
      const resource = config.createResource(resourceConfig);
      resources.set(key, resource);
    }
  };

  const scheduleDisposal = (key: TResourceKey): void => {
    const timeout = setTimeout(() => {
      const resource = resources.get(key);
      if (resource) {
        resource[Symbol.dispose]();
        resources.delete(key);
      }
      disposalTimeouts.delete(key);
    }, disposalDelay);

    disposalTimeouts.set(key, timeout);
  };

  const manager: RefCountedResourceManager<
    TResource,
    TResourceKey,
    TResourceConfig,
    TConsumer,
    TConsumerId
  > = {
    addConsumer: (consumer, resourceConfigs) => {
      if (isDisposed) return;

      const consumerId = config.getConsumerId(consumer);

      // Store consumer (last added consumer for this ID)
      consumers.set(consumerId, consumer);

      for (const resourceConfig of resourceConfigs) {
        ensureResource(resourceConfig);
        const resourceKey = config.getResourceKey(resourceConfig);

        let counts = consumerCounts.get(resourceKey);
        if (!counts) {
          counts = new Map<TConsumerId, PositiveInt>();
          consumerCounts.set(resourceKey, counts);
        }

        const currentCount = counts.get(consumerId) ?? 0;
        counts.set(consumerId, PositiveInt.fromOrThrow(currentCount + 1));
      }
    },

    removeConsumer: (consumer, resourceConfigs) => {
      if (isDisposed) return ok();

      const consumerId = config.getConsumerId(consumer);

      for (const resourceConfig of resourceConfigs) {
        const key = config.getResourceKey(resourceConfig);
        const counts = consumerCounts.get(key);
        if (!counts) {
          return err({ type: "ResourceNotFoundError", resourceKey: key });
        }

        const currentCount = counts.get(consumerId);
        if (currentCount == null) {
          return err({
            type: "ConsumerNotFoundError",
            consumerId: consumerId,
            resourceKey: key,
          });
        }

        if (currentCount === 1) {
          counts.delete(consumerId);

          if (counts.size === 0) {
            consumerCounts.delete(key);
            scheduleDisposal(key);
          }
        } else {
          counts.set(consumerId, PositiveInt.fromOrThrow(currentCount - 1));
        }
      }

      if (!manager.hasConsumerAnyResource(consumer)) {
        consumers.delete(consumerId);
      }

      return ok();
    },

    getResource: (key) => {
      if (isDisposed) return null;
      return resources.get(key) ?? null;
    },

    getConsumersForResource: (key) => {
      if (isDisposed) return [];
      const counts = consumerCounts.get(key);
      return counts ? Array.from(counts.keys()) : [];
    },

    hasConsumerAnyResource: (consumer) => {
      if (isDisposed) return false;
      const consumerId = config.getConsumerId(consumer);
      // If slow, can be optimized with reverse index
      return consumerCounts.values().some((counts) => counts.has(consumerId));
    },

    getConsumer: (consumerId) => {
      if (isDisposed) return null;
      const consumer = consumers.get(consumerId);
      if (!consumer) return null;

      // Only return consumer if it's currently using any resources
      if (!manager.hasConsumerAnyResource(consumer)) {
        return null;
      }

      return consumer;
    },

    [Symbol.dispose]: () => {
      if (isDisposed) return;
      isDisposed = true;

      for (const timeout of disposalTimeouts.values()) {
        clearTimeout(timeout);
      }
      disposalTimeouts.clear();

      for (const resource of resources.values()) {
        resource[Symbol.dispose]();
      }
      resources.clear();
      consumerCounts.clear();
      consumers.clear();
    },
  };

  return manager;
};
