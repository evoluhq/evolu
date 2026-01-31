import { ok, testCreateConsole, type MainTask } from "@evolu/common";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { runMain } from "../src/Task.js";

describe("runMain", () => {
  beforeEach(() => {
    // Clean up any signal listeners from previous tests
    process.removeAllListeners("SIGINT");
    process.removeAllListeners("SIGTERM");
    process.removeAllListeners("SIGHUP");
    process.removeAllListeners("uncaughtException");
    process.removeAllListeners("unhandledRejection");
    process.exitCode = undefined;
  });

  afterEach(() => {
    // Clean up signal listeners added during tests
    process.removeAllListeners("SIGINT");
    process.removeAllListeners("SIGTERM");
    process.removeAllListeners("SIGHUP");
    process.removeAllListeners("uncaughtException");
    process.removeAllListeners("unhandledRejection");
    process.exitCode = undefined;
  });

  test("executes main task", async () => {
    let called = false;
    const executed = Promise.withResolvers<void>();

    runMain({})(() => {
      called = true;
      executed.resolve();
      return ok();
    });

    await executed.promise;
    expect(called).toBe(true);
    process.emit("SIGINT");
  });

  test("passes custom deps", async () => {
    const depsValue = Promise.withResolvers<number>();
    const customDep = { myValue: 42 };

    interface MyDep {
      readonly myValue: number;
    }

    const main: MainTask<MyDep> = (run) => {
      const { myValue } = run.deps;
      depsValue.resolve(myValue);
      return ok();
    };

    runMain(customDep)(main);

    expect(await depsValue.promise).toBe(42);
    process.emit("SIGINT");
  });

  test("handles aborted runner", async () => {
    let taskRan = false;
    const taskCompleted = Promise.withResolvers<void>();

    runMain({})(async (run) => {
      taskRan = true;
      // Dispose the runner, which triggers abort
      await run[Symbol.asyncDispose]();
      taskCompleted.resolve();
      return ok();
    });

    await taskCompleted.promise;
    expect(taskRan).toBe(true);
    // No need to emit signal - the runMain should still complete
    // because it waits for the callback which gets aborted
  });

  test("disposes returned Disposable after signal", async () => {
    let disposed = false;
    const taskStarted = Promise.withResolvers<void>();
    const disposeCalled = Promise.withResolvers<void>();

    runMain({})(() => {
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

    runMain({})(() => {
      taskStarted.resolve();
      return ok({
        // eslint-disable-next-line @typescript-eslint/require-await
        [Symbol.asyncDispose]: async () => {
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

    runMain({})(() => {
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

    runMain({})(() => {
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

    runMain({})(() => {
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

    runMain({})(() =>
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

  test("sets exitCode to 1 on uncaughtException", async () => {
    const disposed = Promise.withResolvers<void>();
    const taskStarted = Promise.withResolvers<void>();
    const console = testCreateConsole();

    runMain({ console })(() => {
      taskStarted.resolve();
      return ok({
        [Symbol.dispose]: () => {
          disposed.resolve();
        },
      });
    });

    await taskStarted.promise;
    await new Promise((r) => setTimeout(r, 10));

    expect(process.exitCode).toBeUndefined();
    process.emit("uncaughtException", new Error("test error"));
    await disposed.promise;
    expect(process.exitCode).toBe(1);

    const entries = console.getEntriesSnapshot();
    expect(entries).toHaveLength(1);
    expect(entries[0].method).toBe("error");
    expect(entries[0].args[0]).toMatchObject({
      type: "UnknownError",
      error: expect.objectContaining({ message: "test error" }),
    });
  });

  test("sets exitCode to 1 on unhandledRejection", async () => {
    const disposed = Promise.withResolvers<void>();
    const taskStarted = Promise.withResolvers<void>();
    const console = testCreateConsole();

    runMain({ console })(() => {
      taskStarted.resolve();
      return ok({
        [Symbol.dispose]: () => {
          disposed.resolve();
        },
      });
    });

    await taskStarted.promise;
    await new Promise((r) => setTimeout(r, 10));

    expect(process.exitCode).toBeUndefined();
    (process as NodeJS.EventEmitter).emit(
      "unhandledRejection",
      new Error("test rejection"),
    );
    await disposed.promise;
    expect(process.exitCode).toBe(1);

    const entries = console.getEntriesSnapshot();
    expect(entries).toHaveLength(1);
    expect(entries[0].method).toBe("error");
    expect(entries[0].args[0]).toMatchObject({
      type: "UnknownError",
      error: expect.objectContaining({ message: "test rejection" }),
    });
  });
});
