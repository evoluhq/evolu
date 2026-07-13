import {
  assert,
  ok,
  testCreateConsole,
  testCreateReportDefect,
  waitForAbort,
  type DisposableRun,
  type Resource,
  type Run,
  type Task,
} from "@evolu/common";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  expectTypeOf,
  test,
  vi,
} from "vitest";
import { runMain } from "../src/Task.js";

describe("runMain", () => {
  let previousExitCode: typeof process.exitCode;

  beforeEach(() => {
    previousExitCode = process.exitCode;
    process.exitCode = undefined;
  });

  afterEach(() => {
    process.exitCode = previousExitCode;
  });

  test("runs the main Task and disposes its root Run after completion", async () => {
    let mainRun: Run | undefined;

    const done = runMain((run) => {
      mainRun = run;
      return ok();
    });
    expectTypeOf(done).toEqualTypeOf<Promise<void>>();
    await done;

    expect(mainRun?.getState()).toMatchObject({ type: "Settled" });
    expect(mainRun?.parent?.getState()).toMatchObject({ type: "Settled" });
    expect(process.exitCode).toBeUndefined();
  });

  test.each(["async", "sync"] as const)(
    "owns a returned %s Resource until signal shutdown",
    async (kind) => {
      const console = testCreateConsole();
      const created = Promise.withResolvers<void>();
      const state = { disposed: false };

      const done = runMain({ console })(() => {
        created.resolve();
        return ok(
          kind === "async"
            ? {
                [Symbol.asyncDispose]: (): Promise<void> => {
                  state.disposed = true;
                  return Promise.resolve();
                },
              }
            : {
                [Symbol.dispose]: (): void => {
                  state.disposed = true;
                },
              },
        );
      });

      await created.promise;

      try {
        expect(state.disposed).toBe(false);
        process.emit("SIGTERM", "SIGTERM");
        await done;
        expect(state.disposed).toBe(true);
      } finally {
        if (!state.disposed) {
          process.emit("SIGTERM", "SIGTERM");
          await done;
        }
      }
    },
  );

  test("provides custom deps to the main Task", async () => {
    const customDep = { customValue: 42 };
    let customValue: number | undefined;

    const runMainWithDeps = runMain(customDep, { mode: "service" });
    expectTypeOf(runMainWithDeps).toEqualTypeOf<
      <T extends void | Resource>(
        main: Task<T, never, typeof customDep>,
      ) => Promise<void>
    >();

    await runMainWithDeps((run) => {
      customValue = run.deps.customValue;
      return ok();
    });

    expect(customValue).toBe(42);
  });

  test.each(["SIGINT", "SIGTERM", "SIGBREAK"] as const)(
    "aborts on %s and waits for cleanup",
    async (signal) => {
      const console = testCreateConsole();
      const initialListeners = {
        SIGINT: process.listenerCount("SIGINT"),
        SIGTERM: process.listenerCount("SIGTERM"),
        SIGBREAK: process.listenerCount("SIGBREAK"),
        uncaughtException: process.listenerCount("uncaughtException"),
        uncaughtExceptionMonitor: process.listenerCount(
          "uncaughtExceptionMonitor",
        ),
        unhandledRejection: process.listenerCount("unhandledRejection"),
      };
      const started = Promise.withResolvers<void>();
      const state = { cleanedUp: false };

      const done = runMain({ console })(async (run) => {
        await using _resource = {
          [Symbol.asyncDispose]: (): Promise<void> => {
            state.cleanedUp = true;
            return Promise.resolve();
          },
        };

        started.resolve();
        return await run(waitForAbort);
      });

      await started.promise;

      try {
        expect(process.listenerCount(signal)).toBe(
          initialListeners[signal] + 1,
        );
        expect(process.listenerCount("uncaughtException")).toBe(
          initialListeners.uncaughtException,
        );
        expect(process.listenerCount("uncaughtExceptionMonitor")).toBe(
          initialListeners.uncaughtExceptionMonitor,
        );
        expect(process.listenerCount("unhandledRejection")).toBe(
          initialListeners.unhandledRejection,
        );

        process.emit(signal, signal);
        await done;

        expect(state.cleanedUp).toBe(true);
        expect(process.listenerCount(signal)).toBe(initialListeners[signal]);
        expect(process.exitCode).toBeUndefined();
      } finally {
        if (!state.cleanedUp) {
          process.emit("SIGTERM", "SIGTERM");
          await done;
        }
      }
    },
  );

  test("logs shutdown progress around signal cleanup", async () => {
    const console = testCreateConsole();
    const started = Promise.withResolvers<void>();
    const cleanupStarted = Promise.withResolvers<void>();
    const finishCleanup = Promise.withResolvers<void>();

    const done = runMain({ console })(async (run) => {
      await using _resource = {
        [Symbol.asyncDispose]: async (): Promise<void> => {
          cleanupStarted.resolve();
          await finishCleanup.promise;
        },
      };

      started.resolve();
      return await run(waitForAbort);
    });

    await started.promise;
    process.emit("SIGINT", "SIGINT");
    await cleanupStarted.promise;

    try {
      expect(console.getEntriesSnapshot()).toEqual([
        { method: "info", path: ["main"], args: ["Shutting down..."] },
      ]);

      finishCleanup.resolve();
      await done;

      expect(console.getEntriesSnapshot()).toEqual([
        { method: "info", path: ["main"], args: ["Shutdown complete"] },
      ]);
    } finally {
      finishCleanup.resolve();
      await done;
    }
  });

  test.each([
    ["SIGINT", "SIGINT", 130],
    ["SIGTERM", "SIGINT", 130],
  ] as const)(
    "%s followed by %s forces immediate exit",
    async (firstSignal, secondSignal, exitCode) => {
      const console = testCreateConsole();
      const started = Promise.withResolvers<void>();
      const cleanupStarted = Promise.withResolvers<void>();
      const finishCleanup = Promise.withResolvers<void>();
      const forcedExit = new Error("forced exit");
      const exit = vi.spyOn(process, "exit").mockImplementation(() => {
        throw forcedExit;
      });

      const done = runMain({ console })(async (run) => {
        await using _resource = {
          [Symbol.asyncDispose]: async (): Promise<void> => {
            cleanupStarted.resolve();
            await finishCleanup.promise;
          },
        };

        started.resolve();
        return await run(waitForAbort);
      });

      await started.promise;
      process.emit(firstSignal, firstSignal);
      await cleanupStarted.promise;

      try {
        expect(() => process.emit(secondSignal, secondSignal)).toThrow(
          forcedExit,
        );
        expect(exit).toHaveBeenCalledWith(exitCode);
        expect(console.getEntriesSnapshot()).toEqual([
          { method: "info", path: ["main"], args: ["Shutting down..."] },
          { method: "warn", path: ["main"], args: ["Forcing shutdown..."] },
        ]);
      } finally {
        exit.mockRestore();
        finishCleanup.resolve();
        await done;
      }
    },
  );

  test("command mode sets signal exit code after handled abort", async () => {
    const console = testCreateConsole();
    const started = Promise.withResolvers<void>();

    const done = runMain(
      { console },
      { mode: "command" },
    )(async (run) => {
      started.resolve();
      await run.abortable(waitForAbort);
      return ok();
    });

    await started.promise;
    process.emit("SIGINT", "SIGINT");
    await done;

    expect(process.exitCode).toBe(130);
  });

  test.each([
    ["SIGINT", 130],
    ["SIGTERM", 143],
    ["SIGBREAK", 149],
  ] as const)(
    "command mode sets exit code for %s after cleanup",
    async (signal, exitCode) => {
      const console = testCreateConsole();
      const started = Promise.withResolvers<void>();
      let cleanedUp = false;

      const done = runMain(
        { console },
        { mode: "command" },
      )(async (run) => {
        await using _resource = {
          [Symbol.asyncDispose]: (): Promise<void> => {
            cleanedUp = true;
            return Promise.resolve();
          },
        };

        started.resolve();
        return await run(waitForAbort);
      });

      await started.promise;
      process.emit(signal, signal);
      await done;

      expect(cleanedUp).toBe(true);
      expect(process.exitCode).toBe(exitCode);
    },
  );

  test("reports a defect and sets exit code 1", async () => {
    const console = testCreateConsole();
    const defect = new Error("test defect");
    const initialSignalListenerCounts = {
      SIGINT: process.listenerCount("SIGINT"),
      SIGTERM: process.listenerCount("SIGTERM"),
      SIGBREAK: process.listenerCount("SIGBREAK"),
    };

    await runMain(
      { console },
      { mode: "command" },
    )(() => {
      throw defect;
    });

    expect(console.getEntriesSnapshot()).toEqual([
      {
        method: "error",
        path: [],
        args: [
          {
            type: "AbortError",
            reason: { type: "PanicAbortReason", defect },
          },
        ],
      },
    ]);
    expect(process.exitCode).toBe(1);
    expect(process.listenerCount("SIGINT")).toBe(
      initialSignalListenerCounts.SIGINT,
    );
    expect(process.listenerCount("SIGTERM")).toBe(
      initialSignalListenerCounts.SIGTERM,
    );
    expect(process.listenerCount("SIGBREAK")).toBe(
      initialSignalListenerCounts.SIGBREAK,
    );
  });

  test("shutdown defect takes precedence over command signal exit code", async () => {
    const console = testCreateConsole();
    const reportDefect = testCreateReportDefect();
    const started = Promise.withResolvers<void>();
    const defect = new Error("shutdown defect");

    const done = runMain(
      { console, reportDefect },
      { mode: "command" },
    )(() => {
      started.resolve();
      return ok({
        [Symbol.asyncDispose]: (): Promise<void> => Promise.reject(defect),
      });
    });

    await started.promise;
    let signaled = false;

    try {
      process.emit("SIGINT", "SIGINT");
      signaled = true;
      await done;

      expect(reportDefect.getDefectsSnapshot()).toHaveLength(1);
      expect(console.getEntriesSnapshot()).toEqual([
        { method: "info", path: ["main"], args: ["Shutting down..."] },
        {
          method: "warn",
          path: ["main"],
          args: ["Shutdown finished with errors"],
        },
      ]);
      expect(process.exitCode).toBe(1);
    } finally {
      if (!signaled) {
        process.emit("SIGINT", "SIGINT");
        await done;
      }
    }
  });

  test("reportDefect sets exit code 1", async () => {
    const reportDefect = testCreateReportDefect();
    const defect = new Error("reported defect");

    await runMain({ reportDefect })((run) => {
      run.deps.reportDefect(defect);
      return ok();
    });

    expect(reportDefect.getDefectsSnapshot()).toEqual([defect]);
    expect(process.exitCode).toBe(1);
  });

  test("reports a root finalizer defect and sets exit code 1", async () => {
    const console = testCreateConsole();
    const defect = new Error("test finalizer defect");

    await runMain({ console })((run) => {
      const rootRun = run.parent?.parent;
      assert(rootRun, "Expected root Run");
      (rootRun as DisposableRun).defer(() => {
        throw defect;
      });
      return ok();
    });

    expect(console.getEntriesSnapshot()).toEqual([
      {
        method: "error",
        path: [],
        args: [
          {
            type: "AbortError",
            reason: { type: "PanicAbortReason", defect },
          },
        ],
      },
    ]);
    expect(process.exitCode).toBe(1);
  });
});
