import { assert, describe, expect, test, vi } from "vitest";
import { isServer } from "../../../../packages/common/src/Platform.ts";
import { err, ok } from "../../../../packages/common/src/Result.ts";
import { parseStackTrace } from "../../../../packages/common/src/StackTrace.ts";
import {
  AbortError,
  all,
  createAbortError,
  createRun,
  runDisposedAbortReason,
  testCreateRun,
  type Task,
} from "../../../../packages/common/src/Task.ts";
import {
  assertContinuationAfterMicrotasks,
  testGlobalUncaughtErrors,
  testGlobalUnhandledRejections,
} from "../_vitest.ts";

const panic = (defect: unknown): AbortError =>
  createAbortError({ type: "PanicAbortReason", defect });

type JsEngine = "v8" | "spidermonkey" | "jsc";

const jsEngine: Promise<JsEngine> = isServer
  ? Promise.resolve("v8")
  : import("vitest/browser").then(({ server }) =>
      server.browser === "chromium"
        ? "v8"
        : server.browser === "firefox"
          ? "spidermonkey"
          : "jsc",
    );

describe("createRun", () => {
  test("uses default reportDefect", async () => {
    await using run = createRun();
    using uncaughtErrors = testGlobalUncaughtErrors();
    const error = new Error("boom");

    run.deps.reportDefect(error);

    expect(await uncaughtErrors.next()).toBe(error);
  });
});

describe("Run", () => {
  test("continues panic shutdown when defect reporter throws", async () => {
    const error = new Error("boom");
    const reporterDefect = new Error("reporter failed");
    using uncaughtErrors = testGlobalUncaughtErrors();
    const run = createRun({
      reportDefect: () => {
        throw reporterDefect;
      },
    });

    try {
      await expect(
        run(() => {
          throw error;
        }),
      ).rejects.toEqual(panic(error));

      const panicAbortError: unknown = run.signal.reason;
      assert(AbortError.is(panicAbortError));
      expect(panicAbortError.reason).toEqual({
        type: "PanicAbortReason",
        defect: error,
      });
      await run[Symbol.asyncDispose]();
      expect(run.getState()).toEqual({
        type: "Settled",
        abort: {
          request: panicAbortError.reason,
          observed: panicAbortError.reason,
        },
        exit: err(panicAbortError),
      });
      const uncaughtError = await uncaughtErrors.next();
      assert(uncaughtError instanceof AggregateError);
      expect(uncaughtError.message).toBe(
        "ReportDefect failed while reporting a defect",
      );
      expect(uncaughtError.errors).toEqual([panicAbortError, reporterDefect]);
    } finally {
      await run[Symbol.asyncDispose]();
    }
  });

  test("panics in production when a Task returns a non-Result", async () => {
    const testProcess = Reflect.get(globalThis, "process") as unknown as
      { readonly env: { NODE_ENV: string | undefined } } | undefined;
    const originalNodeEnv = testProcess?.env.NODE_ENV;

    try {
      if (testProcess) {
        testProcess.env.NODE_ENV = "production";
      }
      vi.resetModules();

      const platformModule =
        await import("../../../../packages/common/src/Platform.ts");
      const taskModule =
        await import("../../../../packages/common/src/Task.ts");
      expect(platformModule.isDev).toBe(false);
      await using run = taskModule.testCreateRun();
      const malformedTask = (() => "not a Result") as unknown as Task<unknown>;

      const fiber = run(malformedTask);

      await expect(fiber).rejects.toMatchObject({
        reason: { type: "PanicAbortReason" },
      });
      const panicAbortError = await run.deps.reportDefect.next();
      assert(taskModule.AbortError.is(panicAbortError));
      assert(panicAbortError.reason.type === "PanicAbortReason");
      const { defect } = panicAbortError.reason;
      assert(defect instanceof Error);
      expect(defect.message).toBe("Task must return Result.");
      expect(panicAbortError).toBe(run.signal.reason);
    } finally {
      if (testProcess) {
        testProcess.env.NODE_ENV = originalNodeEnv;
      }
      vi.resetModules();
    }
  });

  /* oxlint-disable typescript/return-await -- This test intentionally verifies direct await edges in defect stack traces. */
  test("defect stack traces link across Run boundaries", async () => {
    await using run = testCreateRun();

    const childDefectTask = async (): Promise<never> => {
      await Promise.resolve();
      // The stack is captured at construction, after resuming from the
      // await, so it only contains whatever async chain the engine
      // reconstructs.
      throw new Error("boom");
    };
    const middleDefectTask: Task<never> = async (run) =>
      await run(childDefectTask);
    const parentDefectTask: Task<never> = async (run) =>
      await run(middleDefectTask);

    const result = await run.abortable(parentDefectTask);

    assert(!result.ok);
    assert(result.error.reason.type === "PanicAbortReason");
    const { defect } = result.error.reason;
    assert(defect instanceof Error);
    expect(await run.deps.reportDefect.next()).toEqual(panic(defect));

    const engine = await jsEngine;

    // Frame names relevant to the cross-Run chain. Async markers are
    // stripped: Node rewrites stacks for source maps and drops "at async",
    // so markers are not stable even within V8. Runner frames are filtered
    // out because they differ per engine and test runner version.
    const stackTrace = parseStackTrace(defect.stack, {
      sourceNameAllowlist: new Set(["Task.test.ts", "Task.ts"]),
    });

    if (engine === "v8") {
      expect(stackTrace.names).toEqual([
        "childDefectTask",
        "runTask",
        "middleDefectTask",
        "runTask",
        "parentDefectTask",
        "runTask",
      ]);
    } else if (engine === "spidermonkey") {
      expect(stackTrace.names).toEqual([
        "childDefectTask",
        "runTask",
        "run",
        "middleDefectTask",
        "runTask",
        "run",
        "parentDefectTask",
        "runTask",
        "run",
        "createRunInternal/run.abortable",
      ]);
    } else {
      // JSC also links the async chain across every Run boundary, but it
      // drops function names, so the named extraction above finds nothing
      // and the chain is documented via file basenames instead: the Task
      // frames (Task.test.ts) alternate with runTask frames (Task.ts).
      expect(stackTrace.names).toEqual([]);

      expect(stackTrace.files).toEqual([
        "Task.test.ts",
        "Task.ts",
        "Task.test.ts",
        "Task.ts",
        "Task.test.ts",
        "Task.ts",
        "Task.test.ts",
      ]);
    }
  });

  /* oxlint-enable typescript/return-await */

  // The Run tree is the ultimate handler of every Fiber: a discarded Fiber
  // never reaches the global unhandled rejection handler, whether it settles
  // with a defect (reported via reportDefect) or an abort (expected control
  // flow). Supervision covers only the Fiber itself; an awaiter's own promise
  // stays unsupervised, so an un-caught abort still surfaces there.
  describe("Fiber supervision", () => {
    test("reports unobserved Fiber defect only through reportDefect", async () => {
      await using run = testCreateRun();
      const error = new Error("boom");
      using unhandledRejections = testGlobalUnhandledRejections();

      void run(() => {
        throw error;
      });

      const panicAbortError: unknown = run.signal.reason;
      assert(AbortError.is(panicAbortError));
      expect(panicAbortError.reason).toEqual({
        type: "PanicAbortReason",
        defect: error,
      });
      expect(await run.deps.reportDefect.next()).toBe(panicAbortError);

      await run[Symbol.asyncDispose]();
      expect(run.getState()).toEqual({
        type: "Settled",
        abort: {
          request: panicAbortError.reason,
          observed: panicAbortError.reason,
        },
        exit: err(panicAbortError),
      });

      // The Run tree supervises the Fiber, so the rejection never reaches
      // the global unhandled rejection handler — the defect is reported
      // exactly once, via reportDefect.
      expect(await unhandledRejections.settle()).toEqual([]);
    });

    test("does not surface ignored child AbortError as unhandled rejection", async () => {
      using unhandledRejections = testGlobalUnhandledRejections();

      {
        await using run = createRun();

        void run(async (run) => {
          await Promise.resolve();
          run.signal.throwIfAborted();
          return ok();
        });
      }

      // Aborting a fire-and-forget Fiber during disposal is expected control
      // flow and must not reach global handlers (in Node, an unhandled
      // rejection crashes the process).
      expect(await unhandledRejections.settle()).toEqual([]);
    });

    test("surfaces awaited child AbortError from an un-caught boundary awaiter", async () => {
      using unhandledRejections = testGlobalUnhandledRejections();

      {
        await using run = createRun();

        // Boundary code that awaits the Fiber but forgot run.abortable: the
        // abort rethrows into this async function, and its promise — which
        // the Run tree does not supervise — is unhandled. An abort must exit
        // Task code either through run.abortable (Result) or as a throw the
        // boundary must handle.
        void (async () => {
          await run(async (run) => {
            await Promise.resolve();
            run.signal.throwIfAborted();
            return ok();
          });
        })();
      }

      const error = await unhandledRejections.next();
      expect(error).toEqual({
        type: "AbortError",
        reason: runDisposedAbortReason,
      });
    });
  });

  // Application code must not depend on these internal microtask counts. They
  // are pinned to catch accidental scheduling regressions during refactoring;
  // deliberate settlement pipeline changes may update them after review.
  describe("internal settlement timing", () => {
    describe("settles Fiber after exact microtask count", () => {
      test("for sync Task", async () => {
        await using run = testCreateRun();
        const fiber = run(() => ok("done"));

        await assertContinuationAfterMicrotasks(fiber, 4);

        expect(await fiber).toEqual(ok("done"));
      });

      test("for resolved Promise Task", async () => {
        await using run = testCreateRun();
        const fiber = run(() => Promise.resolve(ok("done")));

        await assertContinuationAfterMicrotasks(fiber, 4);

        expect(await fiber).toEqual(ok("done"));
      });

      test("for awaited Task", async () => {
        await using run = testCreateRun();
        const fiber = run(async () => {
          await Promise.resolve();
          return ok("done");
        });

        await assertContinuationAfterMicrotasks(fiber, 5);

        expect(await fiber).toEqual(ok("done"));
      });

      test("for nested sync Task", async () => {
        await using run = createRun();
        // oxlint-disable-next-line typescript/return-await -- This fixture measures the exact microtask count of a nested awaited Task.
        const fiber = run(async (run) => await run(() => ok("done")));

        await assertContinuationAfterMicrotasks(fiber, 8);

        expect(await fiber).toEqual(ok("done"));
      });
    });

    describe("rejects Fiber after exact microtask count", () => {
      test("for defecting Task", async () => {
        await using run = testCreateRun();
        const error = new Error("boom");
        const fiber = run(() => {
          throw error;
        });

        await assertContinuationAfterMicrotasks(fiber, 3);

        await expect(fiber).rejects.toEqual(panic(error));
        expect(await run.deps.reportDefect.next()).toEqual(panic(error));
      });
    });
  });
});

describe("each", () => {
  /* oxlint-disable typescript/return-await -- This test intentionally verifies direct await edges in defect stack traces. */
  test("child defect stack traces link to the caller", async () => {
    await using run = testCreateRun();

    const eachChildDefectTask = async (): Promise<never> => {
      await Promise.resolve();
      throw new Error("boom");
    };
    const eachParentDefectTask: Task<unknown, unknown> = async (run) =>
      await run(all([eachChildDefectTask]));

    const result = await run.abortable(eachParentDefectTask);

    assert(!result.ok);
    assert(AbortError.is(result.error));
    assert(result.error.reason.type === "PanicAbortReason");
    const { defect } = result.error.reason;
    assert(defect instanceof Error);
    expect(await run.deps.reportDefect.next()).toEqual(panic(defect));

    // Panic abort propagation rejects each's wake arm while the worker is
    // still suspended in await run(tasks[index]). eachWorker remains in
    // the stack because async linkage is captured at the child throw site.
    const stackTrace = parseStackTrace(defect.stack, {
      sourceNameAllowlist: new Set(["Task.test.ts", "Task.ts"]),
    });
    const engine = await jsEngine;

    if (engine === "v8") {
      expect(stackTrace.names).toEqual([
        "eachChildDefectTask",
        "runTask",
        "eachWorker",
        "runTask",
        "runTask",
        "eachParentDefectTask",
        "runTask",
      ]);
    } else if (engine === "spidermonkey") {
      expect(stackTrace.names).toEqual([
        "eachChildDefectTask",
        "runTask",
        "run",
        "eachWorker",
        "each",
        "runTask",
        "run",
        "collect",
        "runTask",
        "run",
        "eachParentDefectTask",
        "runTask",
        "run",
        "createRunInternal/run.abortable",
      ]);
    } else {
      expect(stackTrace.names).toEqual([]);

      expect(stackTrace.files).toEqual([
        "Task.test.ts",
        "Task.ts",
        "Task.ts",
        "Task.ts",
        "Task.ts",
        "Task.ts",
        "Task.ts",
        "Task.test.ts",
        "Task.ts",
        "Task.test.ts",
      ]);
    }
  });
});

describe("native AbortSignal APIs", () => {
  /* oxlint-enable typescript/return-await */

  test("require non-trivial plumbing", async () => {
    const abortReason = { type: "TestAbort" };

    const myCoolPromiseAPI = async ({
      signal,
    }: {
      signal: AbortSignal;
    }): Promise<string> => {
      // If the signal is already aborted, immediately throw in order to reject
      // the promise.
      signal.throwIfAborted();

      const operation = Promise.withResolvers<string>();
      const abort = () => {
        // Stop the main operation.
        // Reject the promise with the abort reason.
        operation.reject(signal.reason);
      };

      // Watch for 'abort' signals.
      signal.addEventListener("abort", abort, { once: true });

      try {
        return await operation.promise;
      } finally {
        // `{ once: true }` only removes the listener if abort fires. Operations
        // that settle without abort must remove it manually.
        signal.removeEventListener("abort", abort);
      }
    };

    const parent = async (): Promise<string> => {
      const controller = new AbortController();
      const promise = myCoolPromiseAPI({ signal: controller.signal });

      controller.abort(abortReason);

      try {
        return await promise;
      } catch (error) {
        // Callers also have to distinguish abort from defects and rethrow
        // anything they do not handle.
        if (error === abortReason) return "aborted";
        throw error;
      }
    };

    expect(await parent()).toBe("aborted");
  });
});
