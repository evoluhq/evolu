import { ok } from "@evolu/common";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { runMain, type MainTask } from "../src/Task.js";

describe("runMain", () => {
  beforeEach(() => {
    // Clean up any signal listeners from previous tests
    process.removeAllListeners("SIGINT");
    process.removeAllListeners("SIGTERM");
    process.removeAllListeners("SIGHUP");
  });

  afterEach(() => {
    // Clean up signal listeners added during tests
    process.removeAllListeners("SIGINT");
    process.removeAllListeners("SIGTERM");
    process.removeAllListeners("SIGHUP");
  });

  test("executes main task", async () => {
    let called = false;
    const executed = Promise.withResolvers<void>();

    runMain(() => {
      called = true;
      executed.resolve();
      return ok();
    });

    await executed.promise;
    expect(called).toBe(true);
    process.emit("SIGINT");
  });

  test("curried form passes custom deps", async () => {
    const depsValue = Promise.withResolvers<number>();
    const customDep = { myValue: 42 };

    interface MyDep {
      readonly myValue: number;
    }

    const main: MainTask<MyDep> = (_run, deps) => {
      depsValue.resolve(deps.myValue);
      return ok();
    };

    runMain(customDep)(main);

    expect(await depsValue.promise).toBe(42);
    process.emit("SIGINT");
  });

  test("disposes returned Disposable after signal", async () => {
    let disposed = false;
    const taskStarted = Promise.withResolvers<void>();
    const disposeCalled = Promise.withResolvers<void>();

    runMain(() => {
      taskStarted.resolve();
      return ok({
        [Symbol.dispose]: () => {
          disposed = true;
          disposeCalled.resolve();
        },
      });
    });

    await taskStarted.promise;
    await new Promise((r) => setTimeout(r, 10));
    process.emit("SIGINT");
    await disposeCalled.promise;
    expect(disposed).toBe(true);
  });

  test("disposes returned AsyncDisposable after signal", async () => {
    let disposed = false;
    const taskStarted = Promise.withResolvers<void>();
    const disposeCalled = Promise.withResolvers<void>();

    runMain(() => {
      taskStarted.resolve();
      return ok({
        [Symbol.asyncDispose]: () => {
          disposed = true;
          disposeCalled.resolve();
        },
      });
    });

    await taskStarted.promise;
    await new Promise((r) => setTimeout(r, 10));
    process.emit("SIGINT");
    await disposeCalled.promise;
    expect(disposed).toBe(true);
  });

  test("handles void return without disposal", async () => {
    let called = false;
    const taskStarted = Promise.withResolvers<void>();

    runMain(() => {
      called = true;
      taskStarted.resolve();
      return ok();
    });

    await taskStarted.promise;
    expect(called).toBe(true);
    await new Promise((r) => setTimeout(r, 10));
    process.emit("SIGINT");
  });

  test("responds to SIGTERM", async () => {
    let disposed = false;
    const taskStarted = Promise.withResolvers<void>();
    const disposeCalled = Promise.withResolvers<void>();

    runMain(() => {
      taskStarted.resolve();
      return ok({
        [Symbol.dispose]: () => {
          disposed = true;
          disposeCalled.resolve();
        },
      });
    });

    await taskStarted.promise;
    await new Promise((r) => setTimeout(r, 10));
    process.emit("SIGTERM");
    await disposeCalled.promise;
    expect(disposed).toBe(true);
  });

  test("responds to SIGHUP", async () => {
    let disposed = false;
    const taskStarted = Promise.withResolvers<void>();
    const disposeCalled = Promise.withResolvers<void>();

    runMain(() => {
      taskStarted.resolve();
      return ok({
        [Symbol.dispose]: () => {
          disposed = true;
          disposeCalled.resolve();
        },
      });
    });

    await taskStarted.promise;
    await new Promise((r) => setTimeout(r, 10));
    process.emit("SIGHUP");
    await disposeCalled.promise;
    expect(disposed).toBe(true);
  });

  test("cleans up signal listeners after signal", async () => {
    const taskCompleted = Promise.withResolvers<void>();
    const initialSigintCount = process.listenerCount("SIGINT");

    runMain(() =>
      ok({
        [Symbol.asyncDispose]: async () => {
          await Promise.resolve();
          taskCompleted.resolve();
        },
      }),
    );

    await new Promise((r) => setTimeout(r, 10));

    expect(process.listenerCount("SIGINT")).toBeGreaterThan(initialSigintCount);

    process.emit("SIGINT");
    await taskCompleted.promise;

    await new Promise((r) => setTimeout(r, 10));

    expect(process.listenerCount("SIGINT")).toBe(initialSigintCount);
  });
});
