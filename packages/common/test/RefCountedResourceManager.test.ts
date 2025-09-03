import { expect, test } from "vitest";
import type { Brand } from "../src/Brand.js";
import { wait } from "../src/Promise.js";
import { createRefCountedResourceManager } from "../src/RefCountedResourceManager.js";
import { err } from "../src/Result.js";

interface Resource extends Disposable {
  readonly id: ResourceKey;
  readonly disposed: boolean;
}

type ResourceKey = string & Brand<"ResourceKey">;

interface ResourceConfig {
  readonly key: ResourceKey;
}

interface Consumer {
  readonly id: ConsumerId;
  readonly name: string;
}

type ConsumerId = string & Brand<"ConsumerId">;

const createTestManager = (disposalDelay = 10) =>
  createRefCountedResourceManager<
    Resource,
    ResourceKey,
    ResourceConfig,
    Consumer,
    ConsumerId
  >({
    createResource: (config) => {
      let disposed = false;
      return {
        id: config.key,
        get disposed() {
          return disposed;
        },
        [Symbol.dispose]() {
          disposed = true;
        },
      };
    },
    getResourceKey: (config) => config.key,
    getConsumerId: (consumer) => consumer.id,
    disposalDelay,
  });

const consumer1: Consumer = { id: "consumer1" as ConsumerId, name: "Alice" };
const consumer2: Consumer = { id: "consumer2" as ConsumerId, name: "Bob" };

const resourceConfig1: ResourceConfig = { key: "resource1" as ResourceKey };
const resourceConfig2: ResourceConfig = { key: "resource2" as ResourceKey };
const resourceConfig3: ResourceConfig = { key: "resource3" as ResourceKey };

test("creates resources on demand when adding consumers", () => {
  const manager = createTestManager();

  manager.addConsumer(consumer1, [resourceConfig1, resourceConfig2]);

  expect(manager.getResource(resourceConfig1.key)?.id).toBe(
    resourceConfig1.key,
  );
  expect(manager.getResource(resourceConfig2.key)?.id).toBe(
    resourceConfig2.key,
  );
});

test("tracks consumers for each resource", () => {
  const manager = createTestManager();

  manager.addConsumer(consumer1, [resourceConfig1]);
  manager.addConsumer(consumer2, [resourceConfig1, resourceConfig2]);

  expect(manager.getConsumersForResource(resourceConfig1.key)).toEqual([
    "consumer1",
    "consumer2",
  ]);

  expect(manager.getConsumersForResource(resourceConfig2.key)).toEqual([
    "consumer2",
  ]);
});

test("deduplicates resources - multiple consumers get same resource instance", () => {
  const manager = createTestManager();

  // Add two consumers to the same resource config
  manager.addConsumer(consumer1, [resourceConfig1]);
  manager.addConsumer(consumer2, [resourceConfig1]);

  // They should get the exact same resource instance
  const resource1 = manager.getResource(resourceConfig1.key);
  const resource2 = manager.getResource(resourceConfig1.key);

  expect(resource1).toBe(resource2);
  expect(resource1).not.toBeNull();

  // Verify both consumers are tracked for the same resource
  expect(manager.getConsumersForResource(resourceConfig1.key)).toEqual([
    "consumer1",
    "consumer2",
  ]);
});

test("increments reference counts for same consumer", () => {
  const manager = createTestManager();

  // Add consumer to same resource multiple times
  manager.addConsumer(consumer1, [resourceConfig1]);
  manager.addConsumer(consumer1, [resourceConfig1]);
  manager.addConsumer(consumer1, [resourceConfig1]);

  const consumers = manager.getConsumersForResource(resourceConfig1.key);
  expect(consumers).toEqual(["consumer1"]);

  const result1 = manager.removeConsumer(consumer1, [resourceConfig1]);
  expect(result1.ok).toBe(true);
  const result2 = manager.removeConsumer(consumer1, [resourceConfig1]);
  expect(result2.ok).toBe(true);

  const resource = manager.getResource(resourceConfig1.key);
  expect(resource?.disposed).toBe(false);

  const result3 = manager.removeConsumer(consumer1, [resourceConfig1]);
  expect(result3.ok).toBe(true);
  expect(resource?.disposed).toBe(false); // is delayed
});

test("removes consumers and decrements reference counts", () => {
  const manager = createTestManager();

  manager.addConsumer(consumer1, [resourceConfig1]);
  manager.addConsumer(consumer2, [resourceConfig1]);

  const removeResult = manager.removeConsumer(consumer1, [resourceConfig1]);
  expect(removeResult.ok).toBe(true);

  const consumers = manager.getConsumersForResource(resourceConfig1.key);
  expect(consumers).toEqual(["consumer2"]);

  const resource = manager.getResource(resourceConfig1.key);
  expect(resource).toBeTruthy();
  expect(resource?.disposed).toBe(false);
});

test("schedules resource disposal when no consumers remain", async () => {
  const manager = createTestManager(50);

  manager.addConsumer(consumer1, [resourceConfig1]);
  const resource = manager.getResource(resourceConfig1.key);
  expect(resource).toBeTruthy();

  const removeResult = manager.removeConsumer(consumer1, [resourceConfig1]);
  expect(removeResult.ok).toBe(true);

  // Resource should still exist immediately after removal
  expect(manager.getResource(resourceConfig1.key)).toBeTruthy();
  expect(resource?.disposed).toBe(false);

  // Wait for disposal delay
  await wait(100);

  expect(manager.getResource(resourceConfig1.key)).toBeNull();
  expect(resource?.disposed).toBe(true);
});

test("cancels pending disposal when consumer is re-added", async () => {
  const manager = createTestManager(50);

  manager.addConsumer(consumer1, [resourceConfig1]);
  const resource = manager.getResource(resourceConfig1.key);

  const removeResult = manager.removeConsumer(consumer1, [resourceConfig1]);
  expect(removeResult.ok).toBe(true);

  // Wait a bit but not the full disposal delay
  await wait(25);

  // Re-add consumer before disposal
  manager.addConsumer(consumer1, [resourceConfig1]);

  // Wait past the original disposal time
  await wait(50);

  // Resource should still be alive
  expect(manager.getResource(resourceConfig1.key)).toBeTruthy();
  expect(resource?.disposed).toBe(false);
});

test("hasConsumerAnyResource returns correct status", () => {
  const manager = createTestManager();

  expect(manager.hasConsumerAnyResource(consumer1)).toBe(false);
  expect(manager.hasConsumerAnyResource(consumer2)).toBe(false);

  manager.addConsumer(consumer1, [resourceConfig1, resourceConfig2]);
  expect(manager.hasConsumerAnyResource(consumer1)).toBe(true);
  expect(manager.hasConsumerAnyResource(consumer2)).toBe(false);

  manager.addConsumer(consumer2, [resourceConfig3]);
  expect(manager.hasConsumerAnyResource(consumer1)).toBe(true);
  expect(manager.hasConsumerAnyResource(consumer2)).toBe(true);

  const removeResult = manager.removeConsumer(consumer1, [
    resourceConfig1,
    resourceConfig2,
  ]);
  expect(removeResult.ok).toBe(true);
  expect(manager.hasConsumerAnyResource(consumer1)).toBe(false);
  expect(manager.hasConsumerAnyResource(consumer2)).toBe(true);
});

test("returns error when removing consumer from non-existent resource", () => {
  const manager = createTestManager();

  const nonexistentConfig: ResourceConfig = {
    key: "nonexistent" as ResourceKey,
  };
  const result = manager.removeConsumer(consumer1, [nonexistentConfig]);

  expect(result).toEqual(
    err({
      type: "ResourceNotFoundError",
      resourceKey: "nonexistent",
    }),
  );
});

test("returns error when removing consumer not added to resource", () => {
  const manager = createTestManager();

  manager.addConsumer(consumer1, [resourceConfig1]);

  const result = manager.removeConsumer(consumer2, [resourceConfig1]);

  expect(result).toEqual(
    err({
      type: "ConsumerNotFoundError",
      consumerId: "consumer2",
      resourceKey: "resource1",
    }),
  );
});

test("disposes all resources when manager is disposed", () => {
  const manager = createTestManager();

  manager.addConsumer(consumer1, [
    resourceConfig1,
    resourceConfig2,
    resourceConfig3,
  ]);

  const resource1 = manager.getResource(resourceConfig1.key);
  const resource2 = manager.getResource(resourceConfig2.key);
  const resource3 = manager.getResource(resourceConfig3.key);

  expect(resource1?.disposed).toBe(false);
  expect(resource2?.disposed).toBe(false);
  expect(resource3?.disposed).toBe(false);

  manager[Symbol.dispose]();

  expect(resource1?.disposed).toBe(true);
  expect(resource2?.disposed).toBe(true);
  expect(resource3?.disposed).toBe(true);
});

test("returns empty array for non-existent resource consumers", () => {
  const manager = createTestManager();

  const consumers = manager.getConsumersForResource(
    "nonexistent" as ResourceKey,
  );
  expect(consumers).toEqual([]);
});

test("returns null for non-existent resource", () => {
  const manager = createTestManager();

  const resource = manager.getResource("nonexistent" as ResourceKey);
  expect(resource).toBeNull();
});

test("getConsumer returns consumer data when consumer is using resources", () => {
  const manager = createTestManager();
  const consumer1 = { id: "consumer1" as ConsumerId, name: "Consumer 1" };
  const consumer2 = { id: "consumer2" as ConsumerId, name: "Consumer 2" };
  const resourceConfig1 = { key: "resource1" as ResourceKey };

  manager.addConsumer(consumer1, [resourceConfig1]);

  expect(manager.getConsumer(consumer1.id)).toEqual(consumer1);
  expect(manager.getConsumer(consumer2.id)).toBeNull();
});

test("getConsumer returns null when consumer is not using any resources", () => {
  const manager = createTestManager();
  const consumer1 = { id: "consumer1" as ConsumerId, name: "Consumer 1" };
  const resourceConfig1 = { key: "resource1" as ResourceKey };

  manager.addConsumer(consumer1, [resourceConfig1]);
  expect(manager.getConsumer(consumer1.id)).toEqual(consumer1);

  const removeResult = manager.removeConsumer(consumer1, [resourceConfig1]);
  expect(removeResult.ok).toBe(true);
  expect(manager.getConsumer(consumer1.id)).toBeNull();
});

test("getConsumer returns updated consumer data when re-added", () => {
  const manager = createTestManager();
  const consumer1 = { id: "consumer1" as ConsumerId, name: "Consumer 1" };
  const consumer1Updated = {
    id: "consumer1" as ConsumerId,
    name: "Consumer 1 Updated",
    extra: "data",
  };
  const resourceConfig1 = { key: "resource1" as ResourceKey };

  manager.addConsumer(consumer1, [resourceConfig1]);
  expect(manager.getConsumer(consumer1.id)).toEqual(consumer1);

  // Re-add with updated data
  manager.addConsumer(consumer1Updated, [resourceConfig1]);
  expect(manager.getConsumer(consumer1.id)).toEqual(consumer1Updated);
});

test("operations after disposal return safe defaults", () => {
  const manager = createTestManager();
  const consumer1 = { id: "consumer1" as ConsumerId, name: "Consumer 1" };
  const resourceConfig1 = { key: "resource1" as ResourceKey };

  // Add consumer before disposal
  manager.addConsumer(consumer1, [resourceConfig1]);
  expect(manager.getResource(resourceConfig1.key)).not.toBeNull();

  // Dispose manager
  manager[Symbol.dispose]();

  // Operations after disposal should return safe defaults
  expect(manager.getResource(resourceConfig1.key)).toBeNull();
  expect(manager.getConsumer(consumer1.id)).toBeNull();
  expect(manager.getConsumersForResource(resourceConfig1.key)).toEqual([]);
  expect(manager.hasConsumerAnyResource(consumer1)).toBe(false);

  // addConsumer should be a no-op
  manager.addConsumer(consumer1, [resourceConfig1]);
  expect(manager.getResource(resourceConfig1.key)).toBeNull();

  // removeConsumer should return ok (no-op)
  const result = manager.removeConsumer(consumer1, [resourceConfig1]);
  expect(result.ok).toBe(true);
});

test("calls onConsumerAdded and onConsumerRemoved callbacks", () => {
  const addedCalls: Array<{
    consumer: Consumer;
    resourceKey: ResourceKey;
    resource: Resource;
  }> = [];
  const removedCalls: Array<{
    consumer: Consumer;
    resourceKey: ResourceKey;
    resource: Resource;
  }> = [];

  const manager = createRefCountedResourceManager<
    Resource,
    ResourceKey,
    ResourceConfig,
    Consumer,
    ConsumerId
  >({
    createResource: (config) => {
      let disposed = false;
      return {
        id: config.key,
        get disposed() {
          return disposed;
        },
        [Symbol.dispose]() {
          disposed = true;
        },
      };
    },
    getResourceKey: (config) => config.key,
    getConsumerId: (consumer) => consumer.id,
    disposalDelay: 10,
    onConsumerAdded: (consumer, resource, resourceKey) => {
      addedCalls.push({ consumer, resource, resourceKey });
    },
    onConsumerRemoved: (consumer, resource, resourceKey) => {
      removedCalls.push({ consumer, resource, resourceKey });
    },
  });

  // Add consumer - should call onConsumerAdded
  manager.addConsumer(consumer1, [resourceConfig1]);
  expect(addedCalls).toHaveLength(1);
  expect(addedCalls[0].consumer).toBe(consumer1);
  expect(addedCalls[0].resourceKey).toBe(resourceConfig1.key);
  expect(removedCalls).toHaveLength(0);

  // Add same consumer again - should NOT call onConsumerAdded (just increment)
  manager.addConsumer(consumer1, [resourceConfig1]);
  expect(addedCalls).toHaveLength(1); // Still 1, not 2
  expect(removedCalls).toHaveLength(0);

  // Remove consumer - should NOT call onConsumerRemoved (just decrement)
  manager.removeConsumer(consumer1, [resourceConfig1]);
  expect(addedCalls).toHaveLength(1);
  expect(removedCalls).toHaveLength(0); // Still 0

  // Remove consumer again - should call onConsumerRemoved (completely removed)
  manager.removeConsumer(consumer1, [resourceConfig1]);
  expect(addedCalls).toHaveLength(1);
  expect(removedCalls).toHaveLength(1);
  expect(removedCalls[0].consumer).toBe(consumer1);
  expect(removedCalls[0].resourceKey).toBe(resourceConfig1.key);
});

test("multiple dispose calls are safe", () => {
  const manager = createTestManager();
  const consumer1 = { id: "consumer1" as ConsumerId, name: "Consumer 1" };
  const resourceConfig1 = { key: "resource1" as ResourceKey };

  manager.addConsumer(consumer1, [resourceConfig1]);
  const resource = manager.getResource(resourceConfig1.key);

  // First dispose
  manager[Symbol.dispose]();
  expect(resource?.disposed).toBe(true);

  // Second dispose should be safe
  expect(() => {
    manager[Symbol.dispose]();
  }).not.toThrow();
});
