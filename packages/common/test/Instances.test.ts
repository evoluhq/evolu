import { expect, test } from "vitest";
import { constVoid } from "../src/Function.js";
import { createInstances } from "../src/Instances.js";

interface TestInstance extends Disposable {
  readonly id: string;
}

test("creates and returns new instance on first call", () => {
  const instances = createInstances<string, TestInstance>();
  let createCount = 0;

  const instance = instances.ensure("test", () => {
    createCount++;
    return {
      id: "test-1",
      [Symbol.dispose]: constVoid,
    };
  });

  expect(instance.id).toBe("test-1");
  expect(createCount).toBe(1);
});

test("returns existing instance on second call with same key", () => {
  const instances = createInstances<string, TestInstance>();
  let createCount = 0;

  const instance1 = instances.ensure("test", () => {
    createCount++;
    return {
      id: "test-1",
      [Symbol.dispose]: constVoid,
    };
  });

  const instance2 = instances.ensure("test", () => {
    createCount++;
    return {
      id: "test-2",
      [Symbol.dispose]: constVoid,
    };
  });

  expect(instance1).toBe(instance2);
  expect(createCount).toBe(1);
});

test("calls onCacheHit when returning existing instance", () => {
  interface TestInstance extends Disposable {
    readonly value: string;
    readonly update: (newValue: string) => void;
  }

  const instances = createInstances<string, TestInstance>();
  let hitCount = 0;

  const createInstance = (initialValue: string): TestInstance => {
    let value = initialValue;
    return {
      get value() {
        return value;
      },
      update: (newValue: string) => {
        value = newValue;
      },
      [Symbol.dispose]: constVoid,
    };
  };

  const instance1 = instances.ensure("test", () => createInstance("initial"));
  expect(instance1.value).toBe("initial");

  const instance2 = instances.ensure(
    "test",
    () => createInstance("new"),
    (existing) => {
      hitCount++;
      existing.update("updated");
    },
  );

  expect(instance2.value).toBe("updated");
  expect(hitCount).toBe(1);
  expect(instance1).toBe(instance2);
});

test("maintains separate instances for different keys", () => {
  const instances = createInstances<string, TestInstance>();

  const instance1 = instances.ensure("key1", () => ({
    id: "instance-1",
    [Symbol.dispose]: constVoid,
  }));

  const instance2 = instances.ensure("key2", () => ({
    id: "instance-2",
    [Symbol.dispose]: constVoid,
  }));

  expect(instance1).not.toBe(instance2);
  expect(instance1.id).toBe("instance-1");
  expect(instance2.id).toBe("instance-2");
});

test("get returns instance if it exists", () => {
  const instances = createInstances<string, TestInstance>();

  instances.ensure("test", () => ({
    id: "test-1",
    [Symbol.dispose]: constVoid,
  }));

  const retrieved = instances.get("test");
  expect(retrieved).not.toBeNull();
  expect(retrieved?.id).toBe("test-1");
});

test("get returns null if instance does not exist", () => {
  const instances = createInstances<string, TestInstance>();
  const retrieved = instances.get("nonexistent");
  expect(retrieved).toBeNull();
});

test("has returns true if instance exists", () => {
  const instances = createInstances<string, TestInstance>();

  instances.ensure("test", () => ({
    id: "test-1",
    [Symbol.dispose]: constVoid,
  }));

  expect(instances.has("test")).toBe(true);
});

test("has returns false if instance does not exist", () => {
  const instances = createInstances<string, TestInstance>();
  expect(instances.has("nonexistent")).toBe(false);
});

test("delete deletes and disposes the instance", () => {
  interface TestInstance extends Disposable {
    readonly id: string;
    disposed: boolean;
  }

  const instances = createInstances<string, TestInstance>();

  const instance = instances.ensure("test", () => ({
    id: "test-1",
    disposed: false,
    [Symbol.dispose]: function () {
      this.disposed = true;
    },
  }));

  expect(instances.has("test")).toBe(true);
  expect(instance.disposed).toBe(false);

  const result = instances.delete("test");

  expect(result).toBe(true);
  expect(instances.has("test")).toBe(false);
  expect(instance.disposed).toBe(true);
});

test("delete returns false if instance does not exist", () => {
  interface TestInstance extends Disposable {
    readonly id: string;
  }

  const instances = createInstances<string, TestInstance>();
  const result = instances.delete("nonexistent");
  expect(result).toBe(false);
});

test("Symbol.dispose disposes all instances", () => {
  interface TestInstance extends Disposable {
    readonly id: string;
    disposed: boolean;
  }

  const instances = createInstances<string, TestInstance>();

  const instance1 = instances.ensure("test1", () => ({
    id: "test-1",
    disposed: false,
    [Symbol.dispose]: function () {
      this.disposed = true;
    },
  }));

  const instance2 = instances.ensure("test2", () => ({
    id: "test-2",
    disposed: false,
    [Symbol.dispose]: function () {
      this.disposed = true;
    },
  }));

  expect(instances.has("test1")).toBe(true);
  expect(instances.has("test2")).toBe(true);
  expect(instance1.disposed).toBe(false);
  expect(instance2.disposed).toBe(false);

  instances[Symbol.dispose]();

  expect(instances.has("test1")).toBe(false);
  expect(instances.has("test2")).toBe(false);
  expect(instance1.disposed).toBe(true);
  expect(instance2.disposed).toBe(true);
});

test("using block syntax disposes all instances", () => {
  interface TestInstance extends Disposable {
    readonly id: string;
    disposed: boolean;
  }

  let instance1: TestInstance | null = null;
  let instance2: TestInstance | null = null;

  {
    using instances = createInstances<string, TestInstance>();

    instance1 = instances.ensure("test1", () => ({
      id: "test-1",
      disposed: false,
      [Symbol.dispose]: function () {
        this.disposed = true;
      },
    }));

    instance2 = instances.ensure("test2", () => ({
      id: "test-2",
      disposed: false,
      [Symbol.dispose]: function () {
        this.disposed = true;
      },
    }));

    expect(instance1.disposed).toBe(false);
    expect(instance2.disposed).toBe(false);
  }

  // After the block, instances should be disposed
  expect(instance1.disposed).toBe(true);
  expect(instance2.disposed).toBe(true);
});

test("delete still deletes instance from map even if dispose throws", () => {
  interface TestInstance extends Disposable {
    readonly id: string;
    disposed: boolean;
  }

  const instances = createInstances<string, TestInstance>();

  const instance = instances.ensure("test", () => ({
    id: "test-1",
    disposed: false,
    [Symbol.dispose]: function () {
      this.disposed = true;
      throw new Error("Disposal failed");
    },
  }));

  expect(instances.has("test")).toBe(true);
  expect(() => instances.delete("test")).toThrow("Disposal failed");
  expect(instances.has("test")).toBe(false);
  expect(instance.disposed).toBe(true);
});

test("Symbol.dispose attempts to dispose all instances even if some throw", () => {
  interface TestInstance extends Disposable {
    readonly id: string;
    disposed: boolean;
  }

  const instances = createInstances<string, TestInstance>();

  const instance1 = instances.ensure("test1", () => ({
    id: "test-1",
    disposed: false,
    [Symbol.dispose]: function () {
      this.disposed = true;
      throw new Error("Disposal 1 failed");
    },
  }));

  const instance2 = instances.ensure("test2", () => ({
    id: "test-2",
    disposed: false,
    [Symbol.dispose]: function () {
      this.disposed = true;
    },
  }));

  const instance3 = instances.ensure("test3", () => ({
    id: "test-3",
    disposed: false,
    [Symbol.dispose]: function () {
      this.disposed = true;
      throw new Error("Disposal 3 failed");
    },
  }));

  expect(() => {
    instances[Symbol.dispose]();
  }).toThrow();

  expect(instance1.disposed).toBe(true);
  expect(instance2.disposed).toBe(true);
  expect(instance3.disposed).toBe(true);
  expect(instances.has("test1")).toBe(false);
  expect(instances.has("test2")).toBe(false);
  expect(instances.has("test3")).toBe(false);
});

test("Symbol.dispose throws single error if only one disposal fails", () => {
  interface TestInstance extends Disposable {
    readonly id: string;
  }

  const instances = createInstances<string, TestInstance>();

  instances.ensure("test1", () => ({
    id: "test-1",
    [Symbol.dispose]: () => {
      throw new Error("Single disposal error");
    },
  }));

  instances.ensure("test2", () => ({
    id: "test-2",
    [Symbol.dispose]: constVoid,
  }));

  expect(() => {
    instances[Symbol.dispose]();
  }).toThrow("Single disposal error");
});

test("Symbol.dispose throws AggregateError if multiple disposals fail", () => {
  interface TestInstance extends Disposable {
    readonly id: string;
  }

  const instances = createInstances<string, TestInstance>();

  instances.ensure("test1", () => ({
    id: "test-1",
    [Symbol.dispose]: () => {
      throw new Error("Error 1");
    },
  }));

  instances.ensure("test2", () => ({
    id: "test-2",
    [Symbol.dispose]: () => {
      throw new Error("Error 2");
    },
  }));

  try {
    instances[Symbol.dispose]();
    expect.fail("Should have thrown");
  } catch (error) {
    expect(error).toBeInstanceOf(AggregateError);
    if (error instanceof AggregateError) {
      expect(error.errors).toHaveLength(2);
      expect(error.errors[0]).toBeInstanceOf(Error);
      expect(error.errors[1]).toBeInstanceOf(Error);
      expect((error.errors[0] as Error).message).toBe("Error 1");
      expect((error.errors[1] as Error).message).toBe("Error 2");
    }
  }
});
