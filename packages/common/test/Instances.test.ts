import { describe, expect, test } from "vitest";
import { lazyVoid } from "../src/Function.js";
import { createInstances } from "../src/Instances.js";

interface TestInstance extends Disposable {
  readonly id: string;
}

describe("Instances", () => {
  test("returns existing instance on second call with same key", () => {
    const instances = createInstances<string, TestInstance>();
    let createCount = 0;

    const instance1 = instances.ensure("test", () => {
      createCount++;
      return {
        id: "test-1",
        [Symbol.dispose]: lazyVoid,
      };
    });

    const instance2 = instances.ensure("test", () => {
      createCount++;
      return {
        id: "test-2",
        [Symbol.dispose]: lazyVoid,
      };
    });

    expect(instance1).toBe(instance2);
    expect(instance1.id).toBe("test-1");
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
        [Symbol.dispose]: lazyVoid,
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
      [Symbol.dispose]: lazyVoid,
    }));

    const instance2 = instances.ensure("key2", () => ({
      id: "instance-2",
      [Symbol.dispose]: lazyVoid,
    }));

    expect(instance1).not.toBe(instance2);
    expect(instance1.id).toBe("instance-1");
    expect(instance2.id).toBe("instance-2");
  });

  test.each([
    ["test", "test-1"],
    ["nonexistent", null],
  ] as const)("get returns expected value for key %s", (key, expectedId) => {
    const instances = createInstances<string, TestInstance>();

    instances.ensure("test", () => ({
      id: "test-1",
      [Symbol.dispose]: lazyVoid,
    }));

    const retrieved = instances.get(key);
    expect(retrieved?.id ?? null).toBe(expectedId);
  });

  test.each([
    ["test", true],
    ["nonexistent", false],
  ] as const)("has returns expected value for key %s", (key, expected) => {
    const instances = createInstances<string, TestInstance>();

    instances.ensure("test", () => ({
      id: "test-1",
      [Symbol.dispose]: lazyVoid,
    }));

    expect(instances.has(key)).toBe(expected);
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

  test("Symbol.dispose disposes instances in LIFO order", () => {
    interface TestInstance extends Disposable {
      readonly id: string;
    }

    const instances = createInstances<string, TestInstance>();
    const events: Array<string> = [];

    instances.ensure("a", () => ({
      id: "a",
      [Symbol.dispose]: () => {
        events.push("dispose a");
      },
    }));

    instances.ensure("b", () => ({
      id: "b",
      [Symbol.dispose]: () => {
        events.push("dispose b");
      },
    }));

    instances.ensure("c", () => ({
      id: "c",
      [Symbol.dispose]: () => {
        events.push("dispose c");
      },
    }));

    instances[Symbol.dispose]();

    expect(events).toEqual(["dispose c", "dispose b", "dispose a"]);
  });

  test("using block syntax disposes all instances", () => {
    interface TestInstance extends Disposable {
      readonly id: string;
      disposed: boolean;
    }

    let instance1: TestInstance;
    let instance2: TestInstance;

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

  test("dispose clears entries and registry remains reusable", () => {
    interface TestInstance extends Disposable {
      readonly id: string;
      disposed: boolean;
    }

    const instances = createInstances<string, TestInstance>();

    const first = instances.ensure("k", () => ({
      id: "first",
      disposed: false,
      [Symbol.dispose]: function () {
        this.disposed = true;
      },
    }));

    instances[Symbol.dispose]();

    expect(first.disposed).toBe(true);
    expect(instances.has("k")).toBe(false);
    expect(instances.get("k")).toBeNull();
    expect(instances.delete("k")).toBe(false);

    const second = instances.ensure("k", () => ({
      id: "second",
      disposed: false,
      [Symbol.dispose]: function () {
        this.disposed = true;
      },
    }));

    expect(second.id).toBe("second");
    expect(second).not.toBe(first);
    expect(instances.has("k")).toBe(true);
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
      [Symbol.dispose]: lazyVoid,
    }));

    expect(() => {
      instances[Symbol.dispose]();
    }).toThrow("Single disposal error");
  });

  test("Symbol.dispose throws SuppressedError if multiple disposals fail", () => {
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

    const SuppressedErrorCtor = (
      globalThis as {
        readonly SuppressedError?: new (
          error: unknown,
          suppressed: unknown,
          message?: string,
        ) => Error;
      }
    ).SuppressedError;
    expect(SuppressedErrorCtor).toBeDefined();

    try {
      instances[Symbol.dispose]();
      expect.fail("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(SuppressedErrorCtor);

      const suppressedError = error as {
        readonly error: unknown;
        readonly suppressed: unknown;
      };

      expect(suppressedError.error).toBeInstanceOf(Error);
      expect(suppressedError.suppressed).toBeInstanceOf(Error);
      expect((suppressedError.error as Error).message).toBe("Error 1");
      expect((suppressedError.suppressed as Error).message).toBe("Error 2");
    }
  });
});
