import { describe, expect, test } from "vitest";
import { constVoid } from "../src/Function.js";
import { createMultiton } from "../src/Multiton.js";

interface TestInstance extends Disposable {
  readonly id: string;
}

describe("Multiton", () => {
  test("creates and returns new instance on first call", () => {
    const multiton = createMultiton<string, TestInstance>();
    let createCount = 0;

    const instance = multiton.ensure("test", () => {
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
    const multiton = createMultiton<string, TestInstance>();
    let createCount = 0;

    const instance1 = multiton.ensure("test", () => {
      createCount++;
      return {
        id: "test-1",
        [Symbol.dispose]: constVoid,
      };
    });

    const instance2 = multiton.ensure("test", () => {
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

    const multiton = createMultiton<string, TestInstance>();
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

    const instance1 = multiton.ensure("test", () => createInstance("initial"));
    expect(instance1.value).toBe("initial");

    const instance2 = multiton.ensure(
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
    const multiton = createMultiton<string, TestInstance>();

    const instance1 = multiton.ensure("key1", () => ({
      id: "instance-1",
      [Symbol.dispose]: constVoid,
    }));

    const instance2 = multiton.ensure("key2", () => ({
      id: "instance-2",
      [Symbol.dispose]: constVoid,
    }));

    expect(instance1).not.toBe(instance2);
    expect(instance1.id).toBe("instance-1");
    expect(instance2.id).toBe("instance-2");
  });

  test("get returns instance if it exists", () => {
    const multiton = createMultiton<string, TestInstance>();

    multiton.ensure("test", () => ({
      id: "test-1",
      [Symbol.dispose]: constVoid,
    }));

    const retrieved = multiton.get("test");
    expect(retrieved).not.toBeNull();
    expect(retrieved?.id).toBe("test-1");
  });

  test("get returns null if instance does not exist", () => {
    const multiton = createMultiton<string, TestInstance>();
    const retrieved = multiton.get("nonexistent");
    expect(retrieved).toBeNull();
  });

  test("has returns true if instance exists", () => {
    const multiton = createMultiton<string, TestInstance>();

    multiton.ensure("test", () => ({
      id: "test-1",
      [Symbol.dispose]: constVoid,
    }));

    expect(multiton.has("test")).toBe(true);
  });

  test("has returns false if instance does not exist", () => {
    const multiton = createMultiton<string, TestInstance>();
    expect(multiton.has("nonexistent")).toBe(false);
  });

  test("disposeInstance removes and disposes the instance", () => {
    interface TestInstance extends Disposable {
      readonly id: string;
      disposed: boolean;
    }

    const multiton = createMultiton<string, TestInstance>();

    const instance = multiton.ensure("test", () => ({
      id: "test-1",
      disposed: false,
      [Symbol.dispose]: function () {
        this.disposed = true;
      },
    }));

    expect(multiton.has("test")).toBe(true);
    expect(instance.disposed).toBe(false);

    const result = multiton.disposeInstance("test");

    expect(result).toBe(true);
    expect(multiton.has("test")).toBe(false);
    expect(instance.disposed).toBe(true);
  });

  test("disposeInstance returns false if instance does not exist", () => {
    interface TestInstance extends Disposable {
      readonly id: string;
    }

    const multiton = createMultiton<string, TestInstance>();
    const result = multiton.disposeInstance("nonexistent");
    expect(result).toBe(false);
  });

  test("Symbol.dispose disposes all instances", () => {
    interface TestInstance extends Disposable {
      readonly id: string;
      disposed: boolean;
    }

    const multiton = createMultiton<string, TestInstance>();

    const instance1 = multiton.ensure("test1", () => ({
      id: "test-1",
      disposed: false,
      [Symbol.dispose]: function () {
        this.disposed = true;
      },
    }));

    const instance2 = multiton.ensure("test2", () => ({
      id: "test-2",
      disposed: false,
      [Symbol.dispose]: function () {
        this.disposed = true;
      },
    }));

    expect(multiton.has("test1")).toBe(true);
    expect(multiton.has("test2")).toBe(true);
    expect(instance1.disposed).toBe(false);
    expect(instance2.disposed).toBe(false);

    multiton[Symbol.dispose]();

    expect(multiton.has("test1")).toBe(false);
    expect(multiton.has("test2")).toBe(false);
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
      using multiton = createMultiton<string, TestInstance>();

      instance1 = multiton.ensure("test1", () => ({
        id: "test-1",
        disposed: false,
        [Symbol.dispose]: function () {
          this.disposed = true;
        },
      }));

      instance2 = multiton.ensure("test2", () => ({
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
});
