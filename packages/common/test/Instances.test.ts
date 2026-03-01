import { describe, expect, test } from "vitest";
import { lazyVoid } from "../src/Function.js";
import { createInstances, createTaskInstances } from "../src/Instances.js";
import { ok } from "../src/Result.js";
import { testCreateRun } from "../src/Test.js";

interface TestInstance extends Disposable {
  readonly id: string;
}

describe("Instances", () => {
  test("creates and returns new instance on first call", () => {
    const instances = createInstances<string, TestInstance>();
    let createCount = 0;

    const instance = instances.ensure("test", () => {
      createCount++;
      return {
        id: "test-1",
        [Symbol.dispose]: lazyVoid,
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

  test("get returns instance if it exists", () => {
    const instances = createInstances<string, TestInstance>();

    instances.ensure("test", () => ({
      id: "test-1",
      [Symbol.dispose]: lazyVoid,
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
      [Symbol.dispose]: lazyVoid,
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
});

interface PrefixDep {
  readonly prefix: string;
}

interface AsyncTestInstance extends AsyncDisposable {
  id: string;
  disposed: boolean;
}

const createAsyncTestInstance = (
  id: string,
  onDispose?: () => void | Promise<void>,
): AsyncTestInstance => ({
  id,
  disposed: false,
  [Symbol.asyncDispose]: async function () {
    this.disposed = true;
    await Promise.resolve();
    if (onDispose) await onDispose();
  },
});

describe("TaskInstances", () => {
  test("ensures instance from task create and reuses it with cache-hit task", async () => {
    await using run = testCreateRun<PrefixDep>({ prefix: "dep" });
    const instances = createTaskInstances<
      string,
      AsyncTestInstance,
      PrefixDep
    >();

    const instance1 = await run.orThrow(
      instances.ensure("k", ({ deps }) =>
        ok(createAsyncTestInstance(`${deps.prefix}-1`)),
      ),
    );

    let cacheHitCount = 0;
    const instance2 = await run.orThrow(
      instances.ensure(
        "k",
        () => ok(createAsyncTestInstance("should-not-create")),
        (instance) =>
          ({ deps }) => {
            cacheHitCount++;
            instance.id = `${deps.prefix}-updated`;
            return ok();
          },
      ),
    );

    expect(instance1).toBe(instance2);
    expect(instance2.id).toBe("dep-updated");
    expect(cacheHitCount).toBe(1);
  });

  test("get and has return task results", async () => {
    await using run = testCreateRun<PrefixDep>({ prefix: "dep" });
    const instances = createTaskInstances<
      string,
      AsyncTestInstance,
      PrefixDep
    >();

    expect(await run.orThrow(instances.has("missing"))).toBe(false);
    expect(await run.orThrow(instances.get("missing"))).toBeNull();

    await run.orThrow(
      instances.ensure("k", ({ deps }) =>
        ok(createAsyncTestInstance(`${deps.prefix}-1`)),
      ),
    );

    expect(await run.orThrow(instances.has("k"))).toBe(true);
    const existing = await run.orThrow(instances.get("k"));
    expect(existing?.id).toBe("dep-1");
  });

  test("serializes concurrent ensure for same key with mutex", async () => {
    await using run = testCreateRun<PrefixDep>({ prefix: "dep" });
    const instances = createTaskInstances<
      string,
      AsyncTestInstance,
      PrefixDep
    >();

    const canFinishFirstCreate = Promise.withResolvers<void>();
    const events: Array<string> = [];

    const firstEnsure = run(
      instances.ensure("k", async ({ deps }) => {
        events.push("create-1-start");
        await canFinishFirstCreate.promise;
        events.push("create-1-end");

        return ok(createAsyncTestInstance(`${deps.prefix}-1`));
      }),
    );

    const secondEnsure = run(
      instances.ensure(
        "k",
        () => {
          events.push("create-2");
          return ok(createAsyncTestInstance("should-not-create"));
        },
        () => () => {
          events.push("cache-hit");
          return ok();
        },
      ),
    );

    await Promise.resolve();
    expect(events).toEqual(["create-1-start"]);

    canFinishFirstCreate.resolve();

    const [firstResult, secondResult] = await Promise.all([
      firstEnsure,
      secondEnsure,
    ]);

    expect(firstResult.ok).toBe(true);
    expect(secondResult.ok).toBe(true);
    expect(events).toEqual(["create-1-start", "create-1-end", "cache-hit"]);
  });

  test("delete calls onDelete, disposes instance, and returns false on repeated delete", async () => {
    await using run = testCreateRun<PrefixDep>({ prefix: "dep" });
    const instances = createTaskInstances<
      string,
      AsyncTestInstance,
      PrefixDep
    >();

    const instance = await run.orThrow(
      instances.ensure("k", ({ deps }) =>
        ok(createAsyncTestInstance(`${deps.prefix}-1`)),
      ),
    );

    let onDeleteCalled = 0;
    const deleted = await run.orThrow(
      instances.delete("k", () => ({ deps }) => {
        onDeleteCalled++;
        expect(deps.prefix).toBe("dep");
        return ok();
      }),
    );

    expect(deleted).toBe(true);
    expect(onDeleteCalled).toBe(1);
    expect(instance.disposed).toBe(true);
    expect(await run.orThrow(instances.has("k"))).toBe(false);

    expect(await run.orThrow(instances.delete("k"))).toBe(false);
  });

  test("delete returns false when key has never been ensured", async () => {
    await using run = testCreateRun<PrefixDep>({ prefix: "dep" });
    const instances = createTaskInstances<
      string,
      AsyncTestInstance,
      PrefixDep
    >();

    expect(await run.orThrow(instances.delete("missing"))).toBe(false);
  });

  test("reuses existing instance without onCacheHit and deletes without onDelete", async () => {
    await using run = testCreateRun<PrefixDep>({ prefix: "dep" });
    const instances = createTaskInstances<
      string,
      AsyncTestInstance,
      PrefixDep
    >();

    const created = await run.orThrow(
      instances.ensure("k", ({ deps }) =>
        ok(createAsyncTestInstance(`${deps.prefix}-1`)),
      ),
    );

    const reused = await run.orThrow(
      instances.ensure("k", () =>
        ok(createAsyncTestInstance("should-not-create")),
      ),
    );

    expect(reused).toBe(created);

    expect(await run.orThrow(instances.delete("k"))).toBe(true);
    expect(created.disposed).toBe(true);
  });

  test("Symbol.asyncDispose disposes all instances", async () => {
    await using run = testCreateRun<PrefixDep>({ prefix: "dep" });
    const instances = createTaskInstances<
      string,
      AsyncTestInstance,
      PrefixDep
    >();

    const instance1 = await run.orThrow(
      instances.ensure("k1", ({ deps }) =>
        ok(createAsyncTestInstance(`${deps.prefix}-1`)),
      ),
    );

    const instance2 = await run.orThrow(
      instances.ensure("k2", ({ deps }) =>
        ok(createAsyncTestInstance(`${deps.prefix}-2`)),
      ),
    );

    await instances[Symbol.asyncDispose]();

    expect(instance1.disposed).toBe(true);
    expect(instance2.disposed).toBe(true);
    expect(await run.orThrow(instances.has("k1"))).toBe(false);
    expect(await run.orThrow(instances.has("k2"))).toBe(false);
  });

  test("Symbol.asyncDispose throws single error when one disposal fails", async () => {
    await using run = testCreateRun<PrefixDep>({ prefix: "dep" });
    const instances = createTaskInstances<
      string,
      AsyncTestInstance,
      PrefixDep
    >();

    await run.orThrow(
      instances.ensure("k1", ({ deps }) =>
        ok(
          createAsyncTestInstance(`${deps.prefix}-1`, () => {
            throw new Error("single async dispose error");
          }),
        ),
      ),
    );

    await run.orThrow(
      instances.ensure("k2", ({ deps }) =>
        ok(createAsyncTestInstance(`${deps.prefix}-2`)),
      ),
    );

    await expect(instances[Symbol.asyncDispose]()).rejects.toThrow(
      "single async dispose error",
    );
  });

  test("Symbol.asyncDispose throws AggregateError when multiple disposals fail", async () => {
    await using run = testCreateRun<PrefixDep>({ prefix: "dep" });
    const instances = createTaskInstances<
      string,
      AsyncTestInstance,
      PrefixDep
    >();

    await run.orThrow(
      instances.ensure("k1", ({ deps }) =>
        ok(
          createAsyncTestInstance(`${deps.prefix}-1`, () => {
            throw new Error("error 1");
          }),
        ),
      ),
    );

    await run.orThrow(
      instances.ensure("k2", ({ deps }) =>
        ok(
          createAsyncTestInstance(`${deps.prefix}-2`, () => {
            throw new Error("error 2");
          }),
        ),
      ),
    );

    await expect(instances[Symbol.asyncDispose]()).rejects.toBeInstanceOf(
      AggregateError,
    );
  });
});
