import {
  assertEqual,
  assertFalse,
  assertLength,
  assertNotUndefined,
  assertThrowsSame,
  assertTrue,
  assertType,
  ok,
  testCreateConsole,
  testCreateReportDefect,
  waitForAbort,
  type DisposableRun,
  type Resource,
  type Run,
  type Task,
} from "@evolu/common";
import { afterEach, beforeEach, describe, it } from "node:test";
import { runMain } from "../../../../packages/nodejs/src/Task.ts";

describe("runMain", () => {
  let previousExitCode: typeof process.exitCode;

  beforeEach(() => {
    previousExitCode = process.exitCode;
    process.exitCode = undefined;
  });

  afterEach(() => {
    process.exitCode = previousExitCode;
  });

  it("runs the main Task and disposes its root Run after completion", async () => {
    let mainRun: Run | undefined;

    const done = runMain((run) => {
      mainRun = run;
      return ok();
    });
    assertType<typeof done, Promise<void>>();
    await done;

    assertEqual(mainRun?.getState().type, "Settled");
    assertEqual(mainRun?.parent?.getState().type, "Settled");
    assertEqual(process.exitCode, undefined);
  });

  for (const kind of ["async", "sync"] as const) {
    it(`owns a returned ${kind} Resource until signal shutdown`, async () => {
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
        assertFalse(state.disposed);
        process.emit("SIGTERM", "SIGTERM");
        await done;
        assertTrue(state.disposed);
      } finally {
        if (!state.disposed) {
          process.emit("SIGTERM", "SIGTERM");
          await done;
        }
      }
    });
  }

  it("provides custom deps to the main Task", async () => {
    const customDep = { customValue: 42 };
    let customValue: number | undefined;

    const runMainWithDeps = runMain(customDep, { mode: "service" });
    assertType<
      typeof runMainWithDeps,
      <T extends void | Resource>(
        main: Task<T, never, typeof customDep>,
      ) => Promise<void>
    >();

    await runMainWithDeps((run) => {
      customValue = run.deps.customValue;
      return ok();
    });

    assertEqual(customValue, 42);
  });

  for (const signal of ["SIGINT", "SIGTERM", "SIGBREAK"] as const) {
    it(`aborts on ${signal} and waits for cleanup`, async () => {
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
        assertEqual(
          process.listenerCount(signal),
          initialListeners[signal] + 1,
        );
        assertEqual(
          process.listenerCount("uncaughtException"),
          initialListeners.uncaughtException,
        );
        assertEqual(
          process.listenerCount("uncaughtExceptionMonitor"),
          initialListeners.uncaughtExceptionMonitor,
        );
        assertEqual(
          process.listenerCount("unhandledRejection"),
          initialListeners.unhandledRejection,
        );

        process.emit(signal, signal);
        await done;

        assertTrue(state.cleanedUp);
        assertEqual(process.listenerCount(signal), initialListeners[signal]);
        assertEqual(process.exitCode, undefined);
      } finally {
        if (!state.cleanedUp) {
          process.emit("SIGTERM", "SIGTERM");
          await done;
        }
      }
    });
  }

  it("logs shutdown progress around signal cleanup", async () => {
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
      assertEqual(console.getEntriesSnapshot(), [
        { method: "info", path: ["main"], args: ["Shutting down..."] },
      ]);

      finishCleanup.resolve();
      await done;

      assertEqual(console.getEntriesSnapshot(), [
        { method: "info", path: ["main"], args: ["Shutdown complete"] },
      ]);
    } finally {
      finishCleanup.resolve();
      await done;
    }
  });

  for (const [firstSignal, secondSignal, exitCode] of [
    ["SIGINT", "SIGINT", 130],
    ["SIGTERM", "SIGINT", 130],
  ] as const) {
    it(`${firstSignal} followed by ${secondSignal} forces immediate exit`, async (t) => {
      const console = testCreateConsole();
      const started = Promise.withResolvers<void>();
      const cleanupStarted = Promise.withResolvers<void>();
      const finishCleanup = Promise.withResolvers<void>();
      const forcedExit = new Error("forced exit");
      const exit = t.mock.method(process, "exit", () => {
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
        assertThrowsSame(
          () => process.emit(secondSignal, secondSignal),
          forcedExit,
        );
        assertLength(exit.mock.calls, 1);
        assertEqual(exit.mock.calls[0].arguments, [exitCode]);
        assertEqual(console.getEntriesSnapshot(), [
          { method: "info", path: ["main"], args: ["Shutting down..."] },
          { method: "warn", path: ["main"], args: ["Forcing shutdown..."] },
        ]);
      } finally {
        exit.mock.restore();
        finishCleanup.resolve();
        await done;
      }
    });
  }

  it("command mode sets signal exit code after handled abort", async () => {
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

    assertEqual(process.exitCode, 130);
  });

  for (const [signal, exitCode] of [
    ["SIGINT", 130],
    ["SIGTERM", 143],
    ["SIGBREAK", 149],
  ] as const) {
    it(`command mode sets exit code for ${signal} after cleanup`, async () => {
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

      assertTrue(cleanedUp);
      assertEqual(process.exitCode, exitCode);
    });
  }

  it("reports a defect and sets exit code 1", async () => {
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

    assertEqual(console.getEntriesSnapshot(), [
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
    assertEqual(process.exitCode, 1);
    assertEqual(
      process.listenerCount("SIGINT"),
      initialSignalListenerCounts.SIGINT,
    );
    assertEqual(
      process.listenerCount("SIGTERM"),
      initialSignalListenerCounts.SIGTERM,
    );
    assertEqual(
      process.listenerCount("SIGBREAK"),
      initialSignalListenerCounts.SIGBREAK,
    );
  });

  it("shutdown defect takes precedence over command signal exit code", async () => {
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

      assertLength(reportDefect.getDefectsSnapshot(), 1);
      assertEqual(console.getEntriesSnapshot(), [
        { method: "info", path: ["main"], args: ["Shutting down..."] },
        {
          method: "warn",
          path: ["main"],
          args: ["Shutdown finished with errors"],
        },
      ]);
      assertEqual(process.exitCode, 1);
    } finally {
      if (!signaled) {
        process.emit("SIGINT", "SIGINT");
        await done;
      }
    }
  });

  it("reportDefect sets exit code 1", async () => {
    const reportDefect = testCreateReportDefect();
    const defect = new Error("reported defect");

    await runMain({ reportDefect })((run) => {
      run.deps.reportDefect(defect);
      return ok();
    });

    assertEqual(reportDefect.getDefectsSnapshot(), [defect]);
    assertEqual(process.exitCode, 1);
  });

  it("reports a root finalizer defect and sets exit code 1", async () => {
    const console = testCreateConsole();
    const defect = new Error("test finalizer defect");

    await runMain({ console })((run) => {
      const rootRun = run.parent?.parent;
      assertNotUndefined(rootRun);
      (rootRun as DisposableRun).defer(() => {
        throw defect;
      });
      return ok();
    });

    assertEqual(console.getEntriesSnapshot(), [
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
    assertEqual(process.exitCode, 1);
  });
});
