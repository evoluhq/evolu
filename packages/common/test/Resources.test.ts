import { expect, test } from "vitest";
import type { Brand } from "../src/Brand.js";
import { createResources } from "../src/Resources.js";
import { err } from "../src/Result.js";
import { testCreateTime, type Duration } from "../src/Time.js";

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

const createResource = (config: ResourceConfig): Resource => {
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
};

const createTestResources = (disposalDelay: Duration = "10ms") => {
  const time = testCreateTime();
  const resources = createResources<
    Resource,
    ResourceKey,
    ResourceConfig,
    Consumer,
    ConsumerId
  >({ time })({
    createResource,
    getResourceKey: (config) => config.key,
    getConsumerId: (consumer) => consumer.id,
    disposalDelay,
  });

  return { resources, time };
};

const consumer1: Consumer = { id: "consumer1" as ConsumerId, name: "Alice" };
const consumer2: Consumer = { id: "consumer2" as ConsumerId, name: "Bob" };

const resourceConfig1: ResourceConfig = { key: "resource1" as ResourceKey };
const resourceConfig2: ResourceConfig = { key: "resource2" as ResourceKey };
const resourceConfig3: ResourceConfig = { key: "resource3" as ResourceKey };

test("creates resources on demand when adding consumers", () => {
  const { resources } = createTestResources();

  resources.addConsumer(consumer1, [resourceConfig1, resourceConfig2]);

  expect(resources.getResource(resourceConfig1.key)?.id).toBe(
    resourceConfig1.key,
  );
  expect(resources.getResource(resourceConfig2.key)?.id).toBe(
    resourceConfig2.key,
  );
});

test("tracks consumers for each resource", () => {
  const { resources } = createTestResources();

  resources.addConsumer(consumer1, [resourceConfig1]);
  resources.addConsumer(consumer2, [resourceConfig1, resourceConfig2]);

  expect(resources.getConsumersForResource(resourceConfig1.key)).toEqual([
    "consumer1",
    "consumer2",
  ]);

  expect(resources.getConsumersForResource(resourceConfig2.key)).toEqual([
    "consumer2",
  ]);
});

test("deduplicates resources for multiple consumers", () => {
  const { resources } = createTestResources();

  resources.addConsumer(consumer1, [resourceConfig1]);
  resources.addConsumer(consumer2, [resourceConfig1]);

  const resource1 = resources.getResource(resourceConfig1.key);
  const resource2 = resources.getResource(resourceConfig1.key);

  expect(resource1).toBe(resource2);
  expect(resource1).not.toBeNull();

  expect(resources.getConsumersForResource(resourceConfig1.key)).toEqual([
    "consumer1",
    "consumer2",
  ]);
});

test("increments reference counts for the same consumer", () => {
  const { resources } = createTestResources();

  resources.addConsumer(consumer1, [resourceConfig1]);
  resources.addConsumer(consumer1, [resourceConfig1]);
  resources.addConsumer(consumer1, [resourceConfig1]);

  const consumers = resources.getConsumersForResource(resourceConfig1.key);
  expect(consumers).toEqual(["consumer1"]);

  const result1 = resources.removeConsumer(consumer1, [resourceConfig1]);
  expect(result1.ok).toBe(true);
  const result2 = resources.removeConsumer(consumer1, [resourceConfig1]);
  expect(result2.ok).toBe(true);

  const resource = resources.getResource(resourceConfig1.key);
  expect(resource?.disposed).toBe(false);

  const result3 = resources.removeConsumer(consumer1, [resourceConfig1]);
  expect(result3.ok).toBe(true);
  expect(resource?.disposed).toBe(false);
});

test("removes consumers and decrements reference counts", () => {
  const { resources } = createTestResources();

  resources.addConsumer(consumer1, [resourceConfig1]);
  resources.addConsumer(consumer2, [resourceConfig1]);

  const removeResult = resources.removeConsumer(consumer1, [resourceConfig1]);
  expect(removeResult.ok).toBe(true);

  const consumers = resources.getConsumersForResource(resourceConfig1.key);
  expect(consumers).toEqual(["consumer2"]);

  const resource = resources.getResource(resourceConfig1.key);
  expect(resource).toBeTruthy();
  expect(resource?.disposed).toBe(false);
});

test("schedules resource disposal when no consumers remain", () => {
  const { resources, time } = createTestResources("50ms");

  resources.addConsumer(consumer1, [resourceConfig1]);
  const resource = resources.getResource(resourceConfig1.key);
  expect(resource).toBeTruthy();

  const removeResult = resources.removeConsumer(consumer1, [resourceConfig1]);
  expect(removeResult.ok).toBe(true);

  expect(resources.getResource(resourceConfig1.key)).toBeTruthy();
  expect(resource?.disposed).toBe(false);

  time.advance("100ms");

  expect(resources.getResource(resourceConfig1.key)).toBeNull();
  expect(resource?.disposed).toBe(true);
});

test("cancels pending disposal when consumer is re-added", () => {
  const { resources, time } = createTestResources("50ms");

  resources.addConsumer(consumer1, [resourceConfig1]);
  const resource = resources.getResource(resourceConfig1.key);

  const removeResult = resources.removeConsumer(consumer1, [resourceConfig1]);
  expect(removeResult.ok).toBe(true);

  time.advance("25ms");

  resources.addConsumer(consumer1, [resourceConfig1]);

  time.advance("50ms");

  expect(resources.getResource(resourceConfig1.key)).toBeTruthy();
  expect(resource?.disposed).toBe(false);
});

test("hasConsumerAnyResource returns correct status", () => {
  const { resources } = createTestResources();

  expect(resources.hasConsumerAnyResource(consumer1)).toBe(false);
  expect(resources.hasConsumerAnyResource(consumer2)).toBe(false);

  resources.addConsumer(consumer1, [resourceConfig1, resourceConfig2]);
  expect(resources.hasConsumerAnyResource(consumer1)).toBe(true);
  expect(resources.hasConsumerAnyResource(consumer2)).toBe(false);

  resources.addConsumer(consumer2, [resourceConfig3]);
  expect(resources.hasConsumerAnyResource(consumer1)).toBe(true);
  expect(resources.hasConsumerAnyResource(consumer2)).toBe(true);

  const removeResult = resources.removeConsumer(consumer1, [
    resourceConfig1,
    resourceConfig2,
  ]);
  expect(removeResult.ok).toBe(true);
  expect(resources.hasConsumerAnyResource(consumer1)).toBe(false);
  expect(resources.hasConsumerAnyResource(consumer2)).toBe(true);
});

test("removeConsumer keeps consumer when still using another resource", () => {
  const { resources } = createTestResources();

  resources.addConsumer(consumer1, [resourceConfig1, resourceConfig2]);

  const result = resources.removeConsumer(consumer1, [resourceConfig1]);
  expect(result.ok).toBe(true);

  expect(resources.hasConsumerAnyResource(consumer1)).toBe(true);
  expect(resources.getConsumer(consumer1.id)).toEqual(consumer1);
  expect(resources.getConsumersForResource(resourceConfig1.key)).toEqual([]);
  expect(resources.getConsumersForResource(resourceConfig2.key)).toEqual([
    consumer1.id,
  ]);
});

test("returns error when removing consumer from non-existent resource", () => {
  const { resources } = createTestResources();

  const nonexistentConfig: ResourceConfig = {
    key: "nonexistent" as ResourceKey,
  };
  const result = resources.removeConsumer(consumer1, [nonexistentConfig]);

  expect(result).toEqual(
    err({
      type: "ResourceNotFoundError",
      resourceKey: "nonexistent",
    }),
  );
});

test("returns error when removing consumer not added to resource", () => {
  const { resources } = createTestResources();

  resources.addConsumer(consumer1, [resourceConfig1]);

  const result = resources.removeConsumer(consumer2, [resourceConfig1]);

  expect(result).toEqual(
    err({
      type: "ConsumerNotFoundError",
      consumerId: "consumer2",
      resourceKey: "resource1",
    }),
  );
});

test("disposes all resources when disposed", () => {
  const { resources } = createTestResources();

  resources.addConsumer(consumer1, [
    resourceConfig1,
    resourceConfig2,
    resourceConfig3,
  ]);

  const resource1 = resources.getResource(resourceConfig1.key);
  const resource2 = resources.getResource(resourceConfig2.key);
  const resource3 = resources.getResource(resourceConfig3.key);

  expect(resource1?.disposed).toBe(false);
  expect(resource2?.disposed).toBe(false);
  expect(resource3?.disposed).toBe(false);

  resources[Symbol.dispose]();

  expect(resource1?.disposed).toBe(true);
  expect(resource2?.disposed).toBe(true);
  expect(resource3?.disposed).toBe(true);
});

test("returns empty array for non-existent resource consumers", () => {
  const { resources } = createTestResources();

  const consumers = resources.getConsumersForResource(
    "nonexistent" as ResourceKey,
  );
  expect(consumers).toEqual([]);
});

test("returns null for non-existent resource", () => {
  const { resources } = createTestResources();

  const resource = resources.getResource("nonexistent" as ResourceKey);
  expect(resource).toBeNull();
});

test("getConsumer returns consumer data when consumer is using resources", () => {
  const { resources } = createTestResources();
  const consumer1 = { id: "consumer1" as ConsumerId, name: "Consumer 1" };
  const consumer2 = { id: "consumer2" as ConsumerId, name: "Consumer 2" };
  const resourceConfig1 = { key: "resource1" as ResourceKey };

  resources.addConsumer(consumer1, [resourceConfig1]);

  expect(resources.getConsumer(consumer1.id)).toEqual(consumer1);
  expect(resources.getConsumer(consumer2.id)).toBeNull();
});

test("getConsumer returns null when consumer is not using any resources", () => {
  const { resources } = createTestResources();
  const consumer1 = { id: "consumer1" as ConsumerId, name: "Consumer 1" };
  const resourceConfig1 = { key: "resource1" as ResourceKey };

  resources.addConsumer(consumer1, [resourceConfig1]);
  expect(resources.getConsumer(consumer1.id)).toEqual(consumer1);

  const removeResult = resources.removeConsumer(consumer1, [resourceConfig1]);
  expect(removeResult.ok).toBe(true);
  expect(resources.getConsumer(consumer1.id)).toBeNull();
});

test("getConsumer returns null for stale consumer entry after partial remove failure", () => {
  const { resources } = createTestResources();
  const consumer = { id: "consumer-stale" as ConsumerId, name: "Stale" };
  const existingResource = { key: "existing" as ResourceKey };
  const missingResource = { key: "missing" as ResourceKey };

  resources.addConsumer(consumer, [existingResource]);

  const result = resources.removeConsumer(consumer, [
    existingResource,
    missingResource,
  ]);

  expect(result).toEqual(
    err({
      type: "ResourceNotFoundError",
      resourceKey: "missing",
    }),
  );

  expect(resources.hasConsumerAnyResource(consumer)).toBe(false);
  expect(resources.getConsumer(consumer.id)).toBeNull();
});

test("getConsumer returns updated consumer data when re-added", () => {
  const { resources } = createTestResources();
  const consumer1 = { id: "consumer1" as ConsumerId, name: "Consumer 1" };
  const consumer1Updated = {
    id: "consumer1" as ConsumerId,
    name: "Consumer 1 Updated",
    extra: "data",
  };
  const resourceConfig1 = { key: "resource1" as ResourceKey };

  resources.addConsumer(consumer1, [resourceConfig1]);
  expect(resources.getConsumer(consumer1.id)).toEqual(consumer1);

  resources.addConsumer(consumer1Updated, [resourceConfig1]);
  expect(resources.getConsumer(consumer1.id)).toEqual(consumer1Updated);
});

test("operations after disposal return safe defaults", () => {
  const { resources } = createTestResources();
  const consumer1 = { id: "consumer1" as ConsumerId, name: "Consumer 1" };
  const resourceConfig1 = { key: "resource1" as ResourceKey };

  resources.addConsumer(consumer1, [resourceConfig1]);
  expect(resources.getResource(resourceConfig1.key)).not.toBeNull();

  resources[Symbol.dispose]();

  expect(resources.getResource(resourceConfig1.key)).toBeNull();
  expect(resources.getConsumer(consumer1.id)).toBeNull();
  expect(resources.getConsumersForResource(resourceConfig1.key)).toEqual([]);
  expect(resources.hasConsumerAnyResource(consumer1)).toBe(false);

  resources.addConsumer(consumer1, [resourceConfig1]);
  expect(resources.getResource(resourceConfig1.key)).toBeNull();

  const result = resources.removeConsumer(consumer1, [resourceConfig1]);
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

  const resources = createResources<
    Resource,
    ResourceKey,
    ResourceConfig,
    Consumer,
    ConsumerId
  >({ time: testCreateTime() })({
    createResource,
    getResourceKey: (config) => config.key,
    getConsumerId: (consumer) => consumer.id,
    disposalDelay: "10ms",
    onConsumerAdded: (consumer, resource, resourceKey) => {
      addedCalls.push({ consumer, resource, resourceKey });
    },
    onConsumerRemoved: (consumer, resource, resourceKey) => {
      removedCalls.push({ consumer, resource, resourceKey });
    },
  });

  resources.addConsumer(consumer1, [resourceConfig1]);
  expect(addedCalls).toHaveLength(1);
  expect(addedCalls[0].consumer).toBe(consumer1);
  expect(addedCalls[0].resourceKey).toBe(resourceConfig1.key);
  expect(removedCalls).toHaveLength(0);

  resources.addConsumer(consumer1, [resourceConfig1]);
  expect(addedCalls).toHaveLength(1);
  expect(removedCalls).toHaveLength(0);

  resources.removeConsumer(consumer1, [resourceConfig1]);
  expect(addedCalls).toHaveLength(1);
  expect(removedCalls).toHaveLength(0);

  resources.removeConsumer(consumer1, [resourceConfig1]);
  expect(addedCalls).toHaveLength(1);
  expect(removedCalls).toHaveLength(1);
  expect(removedCalls[0].consumer).toBe(consumer1);
  expect(removedCalls[0].resourceKey).toBe(resourceConfig1.key);
});

test("multiple dispose calls are safe", () => {
  const { resources } = createTestResources();
  const consumer1 = { id: "consumer1" as ConsumerId, name: "Consumer 1" };
  const resourceConfig1 = { key: "resource1" as ResourceKey };

  resources.addConsumer(consumer1, [resourceConfig1]);
  const resource = resources.getResource(resourceConfig1.key);

  resources[Symbol.dispose]();
  expect(resource?.disposed).toBe(true);

  expect(() => {
    resources[Symbol.dispose]();
  }).not.toThrow();
});

test("dispose clears scheduled disposal timeouts", () => {
  const { resources, time } = createTestResources("50ms");

  resources.addConsumer(consumer1, [resourceConfig1]);
  const resource = resources.getResource(resourceConfig1.key);
  expect(resource).not.toBeNull();

  const result = resources.removeConsumer(consumer1, [resourceConfig1]);
  expect(result.ok).toBe(true);

  resources[Symbol.dispose]();

  time.advance("100ms");

  expect(resource?.disposed).toBe(true);
  expect(resources.getResource(resourceConfig1.key)).toBeNull();
});

test("handles falsy resource values and uses default disposal delay", () => {
  const addedCalls: Array<unknown> = [];
  const removedCalls: Array<unknown> = [];
  const time = testCreateTime();

  const resources = createResources<
    Resource,
    ResourceKey,
    ResourceConfig,
    Consumer,
    ConsumerId
  >({ time })({
    createResource: () => null as unknown as Resource,
    getResourceKey: (config) => config.key,
    getConsumerId: (consumer) => consumer.id,
    onConsumerAdded: (...args) => {
      addedCalls.push(args);
    },
    onConsumerRemoved: (...args) => {
      removedCalls.push(args);
    },
  });

  resources.addConsumer(consumer1, [resourceConfig1]);
  expect(addedCalls).toHaveLength(0);

  const result = resources.removeConsumer(consumer1, [resourceConfig1]);
  expect(result.ok).toBe(true);
  expect(removedCalls).toHaveLength(0);

  time.advance("120ms");
  expect(resources.getResource(resourceConfig1.key)).toBeNull();
});
