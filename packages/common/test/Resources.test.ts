import { expect, test } from "vitest";
import type { Brand } from "../src/Brand.js";
import { createResources } from "../src/Resources.js";
import { testCreateRun } from "../src/Test.js";

type ResourceKey = string & Brand<"ResourceKey">;
type ConsumerId = string & Brand<"ConsumerId">;

interface ResourceConfig {
  readonly key: ResourceKey;
}

interface Consumer {
  readonly id: ConsumerId;
}

interface TestResource extends Disposable {
  readonly id: ResourceKey;
  readonly isDisposed: () => boolean;
}

const testCreateResource = (id: ResourceKey): Promise<TestResource> => {
  let disposed = false;

  return Promise.resolve({
    id,
    isDisposed: () => disposed,
    [Symbol.dispose]: () => {
      disposed = true;
    },
  });
};

test("addConsumer creates resource and indexes consumer-resource relation", async () => {
  await using run = testCreateRun();

  await using resources = createResources<
    TestResource,
    ResourceKey,
    ResourceConfig,
    Consumer,
    ConsumerId
  >({
    createResource: (resourceConfig) => testCreateResource(resourceConfig.key),
    getResourceId: (resourceConfig) => resourceConfig.key,
    getConsumerId: (consumer) => consumer.id,
  });

  const consumer: Consumer = { id: "consumer-1" as ConsumerId };
  const resourceConfig: ResourceConfig = { key: "resource-1" as ResourceKey };

  await run(resources.addConsumer(consumer, [resourceConfig]));

  expect(resources.getConsumerIdsForResource(resourceConfig.key)).toEqual(
    new Set([consumer.id]),
  );

  const resourcesForConsumer = resources.getResourcesForConsumerId(consumer.id);
  expect(resourcesForConsumer.size).toBe(1);

  const [resource] = Array.from(resourcesForConsumer);
  expect(resource.id).toBe(resourceConfig.key);

  await run(resources.removeConsumer(consumer, [resourceConfig]));
});

test("addConsumer reuses existing resource for the same key", async () => {
  await using run = testCreateRun();

  let createResourceCallCount = 0;
  await using resources = createResources<
    TestResource,
    ResourceKey,
    ResourceConfig,
    Consumer,
    ConsumerId
  >({
    createResource: (resourceConfig) => {
      createResourceCallCount += 1;
      return testCreateResource(resourceConfig.key);
    },
    getResourceId: (resourceConfig) => resourceConfig.key,
    getConsumerId: (consumer) => consumer.id,
  });

  const consumer1: Consumer = { id: "consumer-1" as ConsumerId };
  const consumer2: Consumer = { id: "consumer-2" as ConsumerId };
  const resourceConfig: ResourceConfig = { key: "resource-1" as ResourceKey };

  await run(resources.addConsumer(consumer1, [resourceConfig]));
  await run(resources.addConsumer(consumer2, [resourceConfig]));

  expect(createResourceCallCount).toBe(1);
  expect(resources.getConsumerIdsForResource(resourceConfig.key)).toEqual(
    new Set([consumer1.id, consumer2.id]),
  );
});

test("lookups return empty sets for unknown keys", async () => {
  await using _run = testCreateRun();

  await using resources = createResources<
    TestResource,
    ResourceKey,
    ResourceConfig,
    Consumer,
    ConsumerId
  >({
    createResource: (resourceConfig) => testCreateResource(resourceConfig.key),
    getResourceId: (resourceConfig) => resourceConfig.key,
    getConsumerId: (consumer) => consumer.id,
  });

  expect(
    resources.getConsumerIdsForResource("resource-missing" as ResourceKey),
  ).toEqual(new Set());
  expect(
    resources.getResourcesForConsumerId("consumer-missing" as ConsumerId),
  ).toEqual(new Set());
});

test("removeConsumer disposes resource when last consumer is removed", async () => {
  await using run = testCreateRun();

  await using resources = createResources<
    TestResource,
    ResourceKey,
    ResourceConfig,
    Consumer,
    ConsumerId
  >({
    createResource: (resourceConfig) => testCreateResource(resourceConfig.key),
    getResourceId: (resourceConfig) => resourceConfig.key,
    getConsumerId: (consumer) => consumer.id,
  });

  const consumer: Consumer = { id: "consumer-1" as ConsumerId };
  const resourceConfig: ResourceConfig = { key: "resource-1" as ResourceKey };

  await run(resources.addConsumer(consumer, [resourceConfig]));
  const [resource] = Array.from(
    resources.getResourcesForConsumerId(consumer.id),
  );

  await run(resources.removeConsumer(consumer, [resourceConfig]));

  expect(resource.isDisposed()).toBe(true);
  expect(resources.getConsumerIdsForResource(resourceConfig.key)).toEqual(
    new Set(),
  );
  expect(resources.getResourcesForConsumerId(consumer.id)).toEqual(new Set());
});

test("removeConsumer decrements reference count for repeated addConsumer", async () => {
  await using run = testCreateRun();

  await using resources = createResources<
    TestResource,
    ResourceKey,
    ResourceConfig,
    Consumer,
    ConsumerId
  >({
    createResource: (resourceConfig) => testCreateResource(resourceConfig.key),
    getResourceId: (resourceConfig) => resourceConfig.key,
    getConsumerId: (consumer) => consumer.id,
  });

  const consumer: Consumer = { id: "consumer-1" as ConsumerId };
  const resourceConfig: ResourceConfig = { key: "resource-1" as ResourceKey };

  await run(resources.addConsumer(consumer, [resourceConfig]));
  await run(resources.addConsumer(consumer, [resourceConfig]));

  const [resource] = Array.from(
    resources.getResourcesForConsumerId(consumer.id),
  );

  await run(resources.removeConsumer(consumer, [resourceConfig]));
  expect(resource.isDisposed()).toBe(false);
  expect(resources.getConsumerIdsForResource(resourceConfig.key)).toEqual(
    new Set([consumer.id]),
  );

  await run(resources.removeConsumer(consumer, [resourceConfig]));
  expect(resource.isDisposed()).toBe(true);
  expect(resources.getConsumerIdsForResource(resourceConfig.key)).toEqual(
    new Set(),
  );
  expect(resources.getResourcesForConsumerId(consumer.id)).toEqual(new Set());
});

test("removeConsumer is no-op for unknown resource and unknown consumer", async () => {
  await using run = testCreateRun();

  await using resources = createResources<
    TestResource,
    ResourceKey,
    ResourceConfig,
    Consumer,
    ConsumerId
  >({
    createResource: (resourceConfig) => testCreateResource(resourceConfig.key),
    getResourceId: (resourceConfig) => resourceConfig.key,
    getConsumerId: (consumer) => consumer.id,
  });

  const consumer1: Consumer = { id: "consumer-1" as ConsumerId };
  const consumer2: Consumer = { id: "consumer-2" as ConsumerId };
  const existingResourceConfig: ResourceConfig = {
    key: "resource-1" as ResourceKey,
  };
  const missingResourceConfig: ResourceConfig = {
    key: "resource-missing" as ResourceKey,
  };

  await run(resources.addConsumer(consumer1, [existingResourceConfig]));

  await run(resources.removeConsumer(consumer1, [missingResourceConfig]));
  await run(resources.removeConsumer(consumer2, [existingResourceConfig]));

  expect(
    resources.getConsumerIdsForResource(existingResourceConfig.key),
  ).toEqual(new Set([consumer1.id]));
  expect(resources.getResourcesForConsumerId(consumer1.id).size).toBe(1);
});

test("removeConsumer preserves symmetry when ref counts are already cleared", async () => {
  await using run = testCreateRun();

  await using resources = createResources<
    TestResource,
    ResourceKey,
    ResourceConfig,
    Consumer,
    ConsumerId
  >({
    createResource: (resourceConfig) => testCreateResource(resourceConfig.key),
    getResourceId: (resourceConfig) => resourceConfig.key,
    getConsumerId: (consumer) => consumer.id,
  });

  const consumer: Consumer = { id: "consumer-1" as ConsumerId };
  const resourceConfig: ResourceConfig = { key: "resource-1" as ResourceKey };

  await run(resources.addConsumer(consumer, [resourceConfig]));
  await run(resources.removeConsumer(consumer, [resourceConfig]));

  // First removal disposes and clears ref counts; mutex instance remains cached.
  await run(resources.removeConsumer(consumer, [resourceConfig]));

  expect(resources.getConsumerIdsForResource(resourceConfig.key)).toEqual(
    new Set(),
  );
  expect(resources.getResourcesForConsumerId(consumer.id)).toEqual(new Set());
});

test("concurrent add/remove on same resource is serialized", async () => {
  await using run = testCreateRun();

  const onCreateRelease = Promise.withResolvers<void>();
  let createResourceCallCount = 0;
  let disposeCallCount = 0;

  await using resources = createResources<
    TestResource,
    ResourceKey,
    ResourceConfig,
    Consumer,
    ConsumerId
  >({
    createResource: async (resourceConfig) => {
      createResourceCallCount += 1;
      await onCreateRelease.promise;

      let disposed = false;
      return {
        id: resourceConfig.key,
        isDisposed: () => disposed,
        [Symbol.dispose]: () => {
          disposed = true;
          disposeCallCount += 1;
        },
      };
    },
    getResourceId: (resourceConfig) => resourceConfig.key,
    getConsumerId: (consumer) => consumer.id,
  });

  const consumer1: Consumer = { id: "consumer-1" as ConsumerId };
  const consumer2: Consumer = { id: "consumer-2" as ConsumerId };
  const resourceConfig: ResourceConfig = { key: "resource-1" as ResourceKey };

  const add1 = run(resources.addConsumer(consumer1, [resourceConfig]));
  const add2 = run(resources.addConsumer(consumer2, [resourceConfig]));

  onCreateRelease.resolve();

  await Promise.all([add1, add2]);

  expect(createResourceCallCount).toBe(1);
  expect(resources.getConsumerIdsForResource(resourceConfig.key)).toEqual(
    new Set([consumer1.id, consumer2.id]),
  );

  const remove1 = run(resources.removeConsumer(consumer1, [resourceConfig]));
  const remove2 = run(resources.removeConsumer(consumer2, [resourceConfig]));
  await Promise.all([remove1, remove2]);

  expect(disposeCallCount).toBe(1);
  expect(resources.getConsumerIdsForResource(resourceConfig.key)).toEqual(
    new Set(),
  );
});

test("queued addConsumer during last removeConsumer does not fail", async () => {
  await using run = testCreateRun();

  let createResourceCallCount = 0;
  let disposeCallCount = 0;

  await using resources = createResources<
    TestResource,
    ResourceKey,
    ResourceConfig,
    Consumer,
    ConsumerId
  >({
    createResource: (resourceConfig) => {
      createResourceCallCount += 1;
      let disposed = false;

      return Promise.resolve({
        id: resourceConfig.key,
        isDisposed: () => disposed,
        [Symbol.dispose]: () => {
          disposeCallCount += 1;
          disposed = true;
        },
      });
    },
    getResourceId: (resourceConfig) => resourceConfig.key,
    getConsumerId: (consumer) => consumer.id,
  });

  const consumer1: Consumer = { id: "consumer-1" as ConsumerId };
  const consumer2: Consumer = { id: "consumer-2" as ConsumerId };
  const resourceConfig: ResourceConfig = { key: "resource-1" as ResourceKey };

  await run(resources.addConsumer(consumer1, [resourceConfig]));

  const remove = run(resources.removeConsumer(consumer1, [resourceConfig]));
  const queuedAdd = run(resources.addConsumer(consumer2, [resourceConfig]));

  await remove;
  await queuedAdd;

  expect(createResourceCallCount).toBe(2);
  expect(disposeCallCount).toBe(1);
  expect(resources.getConsumerIdsForResource(resourceConfig.key)).toEqual(
    new Set([consumer2.id]),
  );

  await run(resources.removeConsumer(consumer2, [resourceConfig]));
  expect(disposeCallCount).toBe(2);
});
