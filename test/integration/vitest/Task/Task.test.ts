import { expectErr, expectOk } from "@evolu/vitest";
import { assert, describe, expect, expectTypeOf, test, vi } from "vitest";
import {
  emptyArray,
  type NonEmptyReadonlyArray,
} from "../../../../packages/common/src/Array.ts";
import { emptyRecord } from "../../../../packages/common/src/Object.ts";
import {
  none,
  some,
  type Option,
} from "../../../../packages/common/src/Option.ts";
import { isDev, isServer } from "../../../../packages/common/src/Platform.ts";
import type {
  Random,
  RandomDep,
  RandomNumber,
} from "../../../../packages/common/src/Random.ts";
import { createRef } from "../../../../packages/common/src/Ref.ts";
import {
  done,
  err,
  ok,
  type Done,
  type Result,
} from "../../../../packages/common/src/Result.ts";
import {
  fixed,
  spaced,
  take,
  type Schedule,
} from "../../../../packages/common/src/Schedule.ts";
import { parseStackTrace } from "../../../../packages/common/src/StackTrace.ts";
import {
  daemon,
  AbortError,
  acquireUseRelease,
  all,
  allSettled,
  any,
  each,
  callback,
  concurrently,
  createAbortError,
  createDeferred,
  createGate,
  createMutex,
  createMutexByKey,
  createMutexRef,
  createPanicAbortReason,
  createRun,
  createSemaphore,
  createSemaphoreByKey,
  explicitAbortReason,
  firstN,
  firstNSettled,
  map,
  mapSettled,
  prioritized,
  race,
  repeat,
  retry,
  runDisposedAbortReason,
  sleep,
  testAbortError,
  testAbortReason,
  testCreateDeps,
  testCreateRun,
  timeout,
  timeoutError,
  unabortable,
  unabortableMask,
  waitForAbort,
  yieldNow,
  type AbortableFiber,
  type AbortReason,
  type AnyTask,
  type DisposableRun,
  type Fiber,
  type InferFiberDeps,
  type InferFiberErr,
  type InferFiberOk,
  type InferMapOk,
  type InferMapSettled,
  type InferTaskDeps,
  type InferTaskDone,
  type InferTaskErr,
  type InferTaskOk,
  type InferTasksOk,
  type InferTasksResult,
  type InferTasksSettled,
  type NextTask,
  type RetryError,
  type RetryTaskError,
  type Run,
  type RunConfigDep,
  type RunDefaultDeps,
  type RunEvent,
  type RunSnapshot,
  type Task,
  type TaskPriority,
  type TestReportDefectDep,
  type TestRunDefaultDeps,
  type TimeoutError,
} from "../../../../packages/common/src/Task.ts";
import {
  Millis,
  testCreateTime,
  type Time,
} from "../../../../packages/common/src/Time.ts";
import {
  type Int1To100OrPositiveInt,
  maxPositiveInt,
  onePositiveInt,
  PositiveInt,
  type DateIso,
  type Id,
} from "../../../../packages/common/src/Type.ts";
import {
  expectContinuationAfterMicrotasks,
  testGlobalUncaughtErrors,
  testGlobalUnhandledRejections,
} from "../../../unit/vitest/common/_vitest.ts";

const panic = (defect: unknown): AbortError =>
  createAbortError({ type: "PanicAbortReason", defect });

const expectPanicAbortError: (
  error: unknown,
  defect: unknown,
) => asserts error is AbortError = (error, defect) => {
  assert(AbortError.is(error));
  expect(error.reason).toMatchObject({ type: "PanicAbortReason" });
  expect(error.reason.defect).toBe(defect);
};

const expectReportedDefectOnly =
  <T, E, D = unknown>(
    expectedDefect: unknown,
    task: Task<T, E, D>,
  ): Task<T, E, D & TestReportDefectDep> =>
  async (run) => {
    using uncaughtErrors = testGlobalUncaughtErrors();
    using unhandledRejections = testGlobalUnhandledRejections();

    const result = await run(task);

    expect(await run.deps.reportDefect.next()).toEqual(expectedDefect);
    expect(uncaughtErrors.errors).toEqual([]);
    expect(unhandledRejections.errors).toEqual([]);

    return result;
  };

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

interface Db {
  readonly query: (sql: string) => string;
}

interface DbDep {
  readonly db: Db;
}

interface Session {
  readonly userId: string;
}

interface SessionDep {
  readonly session: Session;
}

const createDb = (): Db => ({ query: (sql) => `result:${sql}` });
const dbDep: DbDep = { db: createDb() };
const random: Random = { next: () => 0.123 as RandomNumber };
const sessionDep: SessionDep = { session: { userId: "ada" } };
const eventsEnabled: RunConfigDep = {
  runConfig: { eventsEnabled: createRef(true) },
};

describe("Task type utilities", () => {
  test("extract Task and Fiber type parameters", () => {
    interface UserError {
      readonly type: "UserError";
    }

    type LoadUserTask = Task<string, UserError, DbDep>;
    type LoadUserFiber = Fiber<string, UserError, DbDep>;
    type AbortableLoadUserFiber = AbortableFiber<string, UserError, DbDep>;

    expectTypeOf<InferTaskOk<LoadUserTask>>().toEqualTypeOf<string>();
    expectTypeOf<InferTaskErr<LoadUserTask>>().toEqualTypeOf<UserError>();
    expectTypeOf<InferTaskDeps<LoadUserTask>>().toEqualTypeOf<DbDep>();
    expectTypeOf<InferFiberOk<LoadUserFiber>>().toEqualTypeOf<string>();
    expectTypeOf<InferFiberErr<LoadUserFiber>>().toEqualTypeOf<UserError>();
    expectTypeOf<InferFiberDeps<LoadUserFiber>>().toEqualTypeOf<DbDep>();
    expectTypeOf<InferFiberErr<AbortableLoadUserFiber>>().toEqualTypeOf<
      UserError | AbortError
    >();
  });

  test("abort reasons preserve their sentinel types", () => {
    const panicAbortReason = createPanicAbortReason(new Error("boom"));

    expectTypeOf(runDisposedAbortReason).toExtend<AbortReason>();
    expectTypeOf(
      runDisposedAbortReason.type,
    ).toEqualTypeOf<"RunDisposedAbortReason">();
    expectTypeOf(panicAbortReason).toExtend<AbortReason>();
    expectTypeOf(panicAbortReason.type).toEqualTypeOf<"PanicAbortReason">();
  });
});

describe("NextTask", () => {
  test("models value, done, and error results", async () => {
    interface PullError {
      readonly type: "PullError";
    }

    type PullTask = NextTask<number, PullError, string, DbDep>;

    expectTypeOf<InferTaskDone<PullTask>>().toEqualTypeOf<string>();
    expectTypeOf<InferTaskDeps<PullTask>>().toEqualTypeOf<DbDep>();
    expectTypeOf<InferTaskDone<NextTask<number>>>().toEqualTypeOf<void>();
    expectTypeOf<
      InferTaskDone<Task<number, PullError>>
    >().toEqualTypeOf<never>();

    await using run = createRun(dbDep);

    const valueTask: PullTask = ({ deps }) => {
      expect(deps.db).toBe(dbDep.db);
      return ok(42);
    };
    const doneTask: NextTask<number, PullError> = () => err(done());
    const errorTask: NextTask<number, PullError, string> = () =>
      err({ type: "PullError" });

    const valueResult = await run(valueTask);
    const doneResult = await run(doneTask);
    const errorResult = await run(errorTask);

    expect(valueResult).toEqual(ok(42));
    expect(doneResult).toEqual(err(done()));
    expect(errorResult).toEqual(err({ type: "PullError" }));

    if (!doneResult.ok) {
      expectTypeOf(doneResult.error).toEqualTypeOf<PullError | Done<void>>();
    }
  });
});

describe("createRun", () => {
  test("creates async disposable Run to run Tasks", async () => {
    await using run = createRun();
    let taskStarted = false;

    const loadUser: Task<string> = () => {
      taskStarted = true;
      return ok("Ada");
    };

    const promise = run(loadUser);

    expect(taskStarted).toBe(true);
    expect(await promise).toEqual(ok("Ada"));
  });

  test("uses default reportDefect", async () => {
    await using run = createRun();
    using uncaughtErrors = testGlobalUncaughtErrors();
    const error = new Error("boom");

    run.deps.reportDefect(error);

    expect(await uncaughtErrors.next()).toBe(error);
  });
});

describe("testCreateDeps", () => {
  test("nativeFetch requires a test double", () => {
    expect(() => testCreateDeps().nativeFetch("https://example.com")).toThrow(
      "Provide a nativeFetch test double",
    );
  });

  test("creates fresh deterministic baseline deps", () => {
    const first = testCreateDeps();
    const second = testCreateDeps();

    expect(first).not.toBe(second);
    expect(first.console).not.toBe(second.console);
    expect(first.random.next()).toBe(second.random.next());
    expect(first.randomLib.int(0, 1000)).toBe(second.randomLib.int(0, 1000));
    expect(Array.from(first.randomBytes.create(8))).toEqual(
      Array.from(second.randomBytes.create(8)),
    );

    expect(first.time.now()).toBe(0);
    first.time.advance("1s");
    expect(first.time.now()).toBe(1000);
    expect(second.time.now()).toBe(0);
  });

  test("uses custom seed when provided", () => {
    const first = testCreateDeps({ seed: "custom-seed" });
    const second = testCreateDeps({ seed: "custom-seed" });

    expect(first.random.next()).toBe(second.random.next());
    expect(first.randomLib.int(0, 1000)).toBe(second.randomLib.int(0, 1000));
    expect(Array.from(first.randomBytes.create(8))).toEqual(
      Array.from(second.randomBytes.create(8)),
    );
  });

  test("reportDefect getDefects returns a copy", () => {
    const deps = testCreateDeps();

    deps.reportDefect("defect");
    const defects = deps.reportDefect.getDefects();
    expect(defects).toEqual(["defect"]);

    (defects as Array<unknown>).push("mutation");
    expect(deps.reportDefect.getDefects()).toEqual(["defect"]);

    deps.reportDefect.clearDefects();

    expect(deps.reportDefect.getDefects()).toEqual([]);
    expect(deps.reportDefect.getDefectsSnapshot()).toEqual([]);
  });

  test("reportDefect clearDefects throws with pending next waiters", async () => {
    const deps = testCreateDeps();
    const nextDefect = deps.reportDefect.next();

    expect(() => deps.reportDefect.clearDefects()).toThrow(
      "clearDefects must not be called while reportDefect.next() is pending",
    );

    deps.reportDefect("defect");
    await expect(nextDefect).resolves.toBe("defect");
  });

  test("reportDefect getDefectsSnapshot throws with pending next waiters", async () => {
    const deps = testCreateDeps();
    const nextDefect = deps.reportDefect.next();

    expect(() => deps.reportDefect.getDefectsSnapshot()).toThrow(
      "getDefectsSnapshot must not be called while reportDefect.next() is pending",
    );

    deps.reportDefect("defect");
    await expect(nextDefect).resolves.toBe("defect");
  });
});

describe("testCreateRun", () => {
  test("creates Task Run with deterministic deps", async () => {
    await using run = testCreateRun();

    expectTypeOf(run).toEqualTypeOf<DisposableRun<TestRunDefaultDeps>>();
    expect(run.deps.time.now()).toBe(0);

    run.deps.console.info("hello");
    expect(run.deps.console.getEntriesSnapshot()).toEqual([
      { method: "info", path: [], args: ["hello"] },
    ]);

    await expect(run(() => ok(run.deps.time.now()))).resolves.toEqual(ok(0));
  });

  test("accepts seeded test deps", async () => {
    await using first = testCreateRun(testCreateDeps({ seed: "custom-seed" }));
    await using second = testCreateRun(testCreateDeps({ seed: "custom-seed" }));
    await using defaultSeed = testCreateRun();

    expect({
      customSeed: {
        random: first.deps.random.next(),
        randomLib: first.deps.randomLib.int(0, 1000),
        randomBytes: Array.from(first.deps.randomBytes.create(8)),
      },
      repeatedCustomSeed: {
        random: second.deps.random.next(),
        randomLib: second.deps.randomLib.int(0, 1000),
        randomBytes: Array.from(second.deps.randomBytes.create(8)),
      },
      defaultSeed: {
        random: defaultSeed.deps.random.next(),
        randomLib: defaultSeed.deps.randomLib.int(0, 1000),
        randomBytes: Array.from(defaultSeed.deps.randomBytes.create(8)),
      },
    }).toEqual({
      customSeed: {
        random: 0.2016834503330904,
        randomBytes: [245, 134, 211, 214, 27, 3, 165, 56],
        randomLib: 154,
      },
      defaultSeed: {
        random: 0.1257169227085495,
        randomBytes: [93, 169, 86, 19, 180, 45, 103, 217],
        randomLib: 823,
      },
      repeatedCustomSeed: {
        random: 0.2016834503330904,
        randomBytes: [245, 134, 211, 214, 27, 3, 165, 56],
        randomLib: 154,
      },
    });
  });

  test("merges custom deps", async () => {
    const db = { query: (sql: string) => `result:${sql}` };
    await using run = testCreateRun({ db });

    expect(run.deps.db).toBe(db);
    await expect(
      run((run) => ok(run.deps.db.query("select 1"))),
    ).resolves.toEqual(ok("result:select 1"));
  });

  test("accepts custom deps with optional compatible default deps", async () => {
    const deps: DbDep & Partial<RunConfigDep> = dbDep;
    await using run = testCreateRun(deps);

    expectTypeOf(run).toEqualTypeOf<
      DisposableRun<TestRunDefaultDeps & typeof deps>
    >();
    expect(run.deps.db).toBe(dbDep.db);
  });
});

describe("AbortError", () => {
  test("is detected structurally", () => {
    expect(AbortError.is(createAbortError(testAbortReason))).toBe(true);
    expect(AbortError.is(testAbortError)).toBe(true);
    expect(AbortError.is({ type: "AbortError" })).toBe(false);
  });
});

describe("Run", () => {
  describe("calling a Task", () => {
    test("creates child Run, passes it to Task, and returns Fiber exposing it", async () => {
      await using run = createRun();
      let childRun: Run | undefined;

      const loadUser: Task<string> = (run) => {
        expectTypeOf(run).toEqualTypeOf<Run>();
        expectTypeOf(run).not.toEqualTypeOf<DisposableRun>();
        // @ts-expect-error - Task Runs cannot panic manually.
        void run.panic;
        childRun = run;
        return ok("Ada");
      };

      const userFiber = run(loadUser);

      expectTypeOf(userFiber).toEqualTypeOf<Fiber<string, never>>();
      // Fiber must be a real Promise so no-floating-promises catches bare
      // run(loadUser) calls: https://typescript-eslint.io/rules/no-floating-promises/
      // A PromiseLike Fiber would be awaitable but silent.
      expectTypeOf(userFiber).toExtend<Promise<unknown>>();
      expectTypeOf<PromiseLike<unknown>>().not.toExtend<Promise<unknown>>();
      expect(childRun).toBeDefined();
      expect(childRun).not.toBe(run);
      expect(userFiber.run).toBe(childRun);
      expect(await userFiber).toEqual(ok("Ada"));
    });

    test("can start nested child Tasks", async () => {
      await using run = createRun();
      let nestedTaskStarted = false;

      const parentFiber = run(
        async (run) =>
          await run(() => {
            nestedTaskStarted = true;
            return ok("Ada");
          }),
      );

      expect(nestedTaskStarted).toBe(true);
      expect(await parentFiber).toEqual(ok("Ada"));
    });

    test("id matches Run passed to Task", async () => {
      await using run = createRun();
      let parentRunId: Id | undefined;
      let childRunId: Id | undefined;
      let childFiber: Fiber<void> | undefined;

      expectTypeOf(run.id).toEqualTypeOf<Id>();

      const parentFiber = run(async (run) => {
        parentRunId = run.id;

        childFiber = run(({ id }) => {
          childRunId = id;
          expectTypeOf(id).toEqualTypeOf<Id>();
          return ok();
        });

        return await childFiber;
      });

      expect(await parentFiber).toEqual(ok());

      assert(childFiber);
      expect(parentRunId).toBe(parentFiber.run.id);
      expect(childRunId).toBe(childFiber.run.id);
      expect(run.id).not.toBe(parentFiber.run.id);
      expect(parentRunId).not.toBe(childRunId);
    });
  });

  describe("orThrow", () => {
    test("unwraps Ok values and throws Result errors", async () => {
      await using run = createRun();
      const userError = { type: "UserError", message: "Missing user" };
      const loadUser: Task<string, typeof userError> = () => ok("Ada");

      expect(await run.orThrow(loadUser)).toBe("Ada");

      const failUser: Task<string, typeof userError> = () => err(userError);

      await expect(run.orThrow(failUser)).rejects.toMatchObject({
        message: "getOrThrow",
        cause: userError,
      });

      const queryDb: Task<string, typeof userError, DbDep> = ({ deps }) =>
        ok(deps.db.query("select 1"));

      expect(await run.orThrow(queryDb, dbDep)).toBe("result:select 1");

      const loadCurrentUser: Task<string> = () => ok("Ada");

      const assertRunOrThrowTypes = () => {
        // @ts-expect-error - run.orThrow only accepts Tasks with Result errors.
        void run.orThrow(loadCurrentUser);
      };

      void assertRunOrThrowTypes;
    });
  });

  describe("ok", () => {
    test("unwraps Tasks with no Result error", async () => {
      await using run = createRun();
      const loadUser: Task<string> = () => ok("Ada");

      expect(await run.ok(loadUser)).toBe("Ada");

      expect(
        await run.ok(({ deps }) => ok(deps.db.query("select 1")), dbDep),
      ).toBe("result:select 1");

      const userError = { type: "UserError", message: "Missing user" };
      const failUser: Task<string, typeof userError> = () => err(userError);

      const assertRunOkTypes = () => {
        // @ts-expect-error - run.ok only accepts Tasks with no Result error.
        void run.ok(failUser);
      };

      void assertRunOkTypes;
    });
  });

  describe("Result errors versus defects", () => {
    test("distinguishes Result errors and defects", async () => {
      await using run = createRun();
      const userError = { type: "UserError" } as const;

      expect(await run(() => err(userError))).toEqual(err(userError));

      const defectRun = testCreateRun();
      const defect = new Error("boom");
      try {
        await expect(
          defectRun(() => {
            throw defect;
          }),
        ).rejects.toEqual(panic(defect));
        expect(await defectRun.deps.reportDefect.next()).toEqual(panic(defect));
      } finally {
        await defectRun[Symbol.asyncDispose]();
      }
    });

    test.runIf(isDev)("panics when a Task returns a non-Result", async () => {
      await using run = testCreateRun();
      const malformedTask = (() => "not a Result") as unknown as Task<unknown>;

      const fiber = run(malformedTask);

      await expect(fiber).rejects.toMatchObject({
        reason: { type: "PanicAbortReason" },
      });
      const panicAbortError = await run.deps.reportDefect.next();
      assert(AbortError.is(panicAbortError));
      assert(panicAbortError.reason.type === "PanicAbortReason");
      const { defect } = panicAbortError.reason;
      assert(defect instanceof Error);
      expect(defect.message).toBe("Task must return Result.");
      expect(panicAbortError).toBe(run.signal.reason);
    });

    test("panics in production when a Task returns a non-Result", async () => {
      const testProcess = (
        globalThis as unknown as {
          readonly process?: { readonly env: { NODE_ENV: string | undefined } };
        }
      ).process;
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
        const malformedTask = (() =>
          "not a Result") as unknown as Task<unknown>;

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

    test("defect stack traces link across Run boundaries", async () => {
      await using run = testCreateRun();

      const childDefectTask = async (): Promise<never> => {
        await Promise.resolve();
        // The stack is captured at construction, after resuming from the
        // await, so it only contains whatever async chain the engine
        // reconstructs.
        throw new Error("boom");
      };
      const middleDefectTask: Task<never, never> = async (run) =>
        await run(childDefectTask);
      const parentDefectTask: Task<never, never> = async (run) =>
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
  });

  describe("lifecycle", () => {
    test("aborts Task Run after Task settles", async () => {
      await using run = createRun();
      let childRun: Run | undefined;

      const fiber = run((run) => {
        childRun = run;
        return ok();
      });

      expect(await fiber).toEqual(ok());
      assert(childRun);
      expect(childRun.signal.aborted).toBe(true);
      expect(childRun.signal.reason).toEqual({
        type: "AbortError",
        reason: runDisposedAbortReason,
      });
    });

    test("aborts owned child Tasks and waits before Fiber resolves", async () => {
      await using run = createRun();
      const childAborted = Promise.withResolvers<AbortSignal>();
      const completeChild = Promise.withResolvers<void>();
      let parentSettled = false;

      const parentFiber = run((run) => {
        void run(async ({ signal }) => {
          signal.addEventListener(
            "abort",
            () => {
              childAborted.resolve(signal);
            },
            { once: true },
          );
          await completeChild.promise;
          return ok();
        });

        return ok("parent");
      }).then((result) => {
        parentSettled = true;
        return result;
      });

      const childSignal = await childAborted.promise;

      expect(childSignal.aborted).toBe(true);
      expect(childSignal.reason).toEqual({
        type: "AbortError",
        reason: runDisposedAbortReason,
      });
      expect(parentSettled).toBe(false);

      completeChild.resolve();

      expect(await parentFiber).toEqual(ok("parent"));
      expect(parentSettled).toBe(true);
    });

    test("settles Fiber continuations after parent Run records Aborted", async () => {
      const run = createRun();
      const completeChild = Promise.withResolvers<void>();

      const childFiber = run(async () => {
        await completeChild.promise;
        return ok();
      });
      const childFiberContinuation = childFiber.then((result) => {
        expect(run.getState()).toEqual({
          type: "Aborted",
          abort: {
            request: runDisposedAbortReason,
            observed: runDisposedAbortReason,
          },
        });
        return result;
      });

      const disposePromise = run[Symbol.asyncDispose]();

      completeChild.resolve();

      expect(await childFiberContinuation).toEqual(ok());

      await disposePromise;
    });
  });

  describe("abortable", () => {
    test("returns AbortableFiber that catches abort as Result error", async () => {
      await using run = createRun();
      const checkAbort = Promise.withResolvers<void>();

      const fiber = run.abortable(async ({ signal }) => {
        await checkAbort.promise;
        signal.throwIfAborted();
        return ok("Ada");
      });
      expectTypeOf(fiber).toEqualTypeOf<AbortableFiber<string, never>>();

      fiber.abort(testAbortReason);
      checkAbort.resolve();
      const result = await fiber;

      expectErr(result, testAbortError);
    });

    test("returns panic abort for defects and reports panic abort", async () => {
      await using run = testCreateRun();
      const error = new Error("boom");

      const fiber = run.abortable(() => {
        throw error;
      });

      await expect(fiber).resolves.toEqual(err(panic(error)));
      expect(await run.deps.reportDefect.next()).toEqual(panic(error));
    });

    test("aborts with explicit AbortReason by default", async () => {
      await using run = createRun();
      const checkAbort = Promise.withResolvers<void>();

      const fiber = run.abortable(async ({ signal }) => {
        await checkAbort.promise;
        signal.throwIfAborted();
        return ok("Ada");
      });

      fiber.abort();
      checkAbort.resolve();
      const result = await fiber;

      assert(!result.ok);
      expect(result.error).toEqual({
        type: "AbortError",
        reason: explicitAbortReason,
      });
    });

    test("settles abort before Run disposal observes it", async () => {
      const run = createRun();
      const continueTask = Promise.withResolvers<void>();

      const fiber = run.abortable(async ({ signal }) => {
        await continueTask.promise;

        expect(signal.aborted).toBe(true);
        expect(signal.reason).toEqual(testAbortError);

        signal.throwIfAborted();
        return ok("Ada");
      });

      fiber.abort(testAbortReason);
      const disposePromise = run[Symbol.asyncDispose]();

      continueTask.resolve();

      expect(await fiber).toEqual(err(testAbortError));
      await disposePromise;
    });
  });

  describe("abort propagation", () => {
    test("does not start nested child Tasks after parent aborts", async () => {
      await using run = createRun();
      const completeParentTask = Promise.withResolvers<void>();

      const parentFiber = run.abortable(async () => {
        await completeParentTask.promise;
        return ok();
      });

      parentFiber.abort(testAbortReason);

      let nestedTaskStarted = false;
      const childFiber = parentFiber.run(() => {
        nestedTaskStarted = true;
        return ok("Ada");
      });

      expect(nestedTaskStarted).toBe(false);
      await expect(childFiber).rejects.toEqual(testAbortError);

      completeParentTask.resolve();

      expect(await parentFiber).toEqual(ok());
    });

    test("does not start child Tasks created by abort listeners", async () => {
      await using run = createRun();
      const completeParentTask = Promise.withResolvers<void>();
      let nestedTaskStarted = false;
      let nestedFiber: Fiber<string> | undefined;

      const parentFiber = run.abortable(async (run) => {
        run.signal.addEventListener(
          "abort",
          () => {
            nestedFiber = run(() => {
              nestedTaskStarted = true;
              return ok("Ada");
            });
          },
          { once: true },
        );
        await completeParentTask.promise;
        return ok();
      });

      parentFiber.abort(testAbortReason);

      assert(nestedFiber);
      completeParentTask.resolve();

      expect(nestedTaskStarted).toBe(false);
      await expect(nestedFiber).rejects.toEqual(testAbortError);

      expect(await parentFiber).toEqual(ok());
    });

    test("propagates parent abort to descendant Runs", async () => {
      await using run = createRun();
      const continueGrandchild = Promise.withResolvers<void>();
      let grandchildRun: Run | undefined;

      const fiber = run.abortable(async (run) => {
        const child = run(async (run) => {
          const grandchild = run(async (run) => {
            grandchildRun = run;
            await continueGrandchild.promise;
            run.signal.throwIfAborted();
            return ok("grandchild");
          });

          return await grandchild;
        });

        return await child;
      });

      assert(grandchildRun);

      fiber.abort(testAbortReason);

      const grandchildAborted = grandchildRun.signal.aborted;
      const grandchildAbortReason = grandchildRun.signal.reason;

      continueGrandchild.resolve();

      expect(await fiber).toEqual(err(testAbortError));
      expect(grandchildAborted).toBe(true);
      expect(grandchildAbortReason).toEqual(testAbortError);
    });
  });

  describe("onAbort", () => {
    test("calls abort callbacks for future and already-observed aborts", async () => {
      await using run = createRun();
      const events: Array<string> = [];
      let callbackError: AbortError | undefined;

      using _ = run.onAbort((error) => {
        events.push("abort");
        callbackError = error;
      });

      const disposePromise = run[Symbol.asyncDispose]();

      using _late = run.onAbort(() => {
        events.push("late");
      });

      await disposePromise;
      expect(events).toEqual(["abort", "late"]);
      expect(callbackError).toEqual({
        type: "AbortError",
        reason: runDisposedAbortReason,
      });
    });

    test("disposes abort callback registration", async () => {
      await using run = createRun();
      let callbackCalled = false;

      {
        using _ = run.onAbort(() => {
          callbackCalled = true;
        });
      }

      await run[Symbol.asyncDispose]();
      expect(callbackCalled).toBe(false);
    });

    test("does not call abort callback while abort is masked", async () => {
      await using run = createRun();
      const continueTask = Promise.withResolvers<void>();
      let callbackCalled = false;

      const fiber = run.abortable(
        unabortable(async (run) => {
          using _ = run.onAbort(() => {
            callbackCalled = true;
          });
          await continueTask.promise;
          return ok();
        }),
      );

      fiber.abort();

      expect(callbackCalled).toBe(false);

      continueTask.resolve();

      expect(await fiber).toEqual(ok());
    });
  });

  describe("daemon", () => {
    test("outlives the current Task", async () => {
      await using run = createRun();
      const completeDaemon = Promise.withResolvers<void>();
      let taskRun: Run | undefined;
      let daemonFiber: AbortableFiber<void> | undefined;

      const taskFiber = run((run) => {
        expectTypeOf(run.daemon).toEqualTypeOf<Run["daemon"]>();
        taskRun = run;
        daemonFiber = run.daemon(async () => {
          await completeDaemon.promise;
          return ok();
        });
        return ok();
      });

      expect(await taskFiber).toEqual(ok());

      assert(taskRun);
      assert(daemonFiber);
      expectTypeOf(daemonFiber).toEqualTypeOf<AbortableFiber<void>>();
      expect(taskRun.signal.aborted).toBe(true);
      expect(taskRun.signal.reason).toEqual({
        type: "AbortError",
        reason: runDisposedAbortReason,
      });
      expect(daemonFiber.run.signal.aborted).toBe(false);

      completeDaemon.resolve();

      expect(await daemonFiber).toEqual(ok());
    });

    test("abort on the daemon Fiber aborts the daemon Task", async () => {
      await using run = createRun();
      const checkAbort = Promise.withResolvers<void>();

      const daemonFiber = run.daemon(async ({ signal }) => {
        await checkAbort.promise;
        signal.throwIfAborted();
        return ok();
      });

      daemonFiber.abort();

      expect(daemonFiber.run.signal.aborted).toBe(true);
      expect(daemonFiber.run.signal.reason).toEqual({
        type: "AbortError",
        reason: explicitAbortReason,
      });

      checkAbort.resolve();

      expect(await daemonFiber).toEqual(err(daemonFiber.run.signal.reason));
    });

    test("inherits current concurrency", async () => {
      await using run = createRun();
      const concurrency = 2;
      let daemonConcurrency: Int1To100OrPositiveInt | undefined;

      const result = await run(
        concurrently(concurrency, async (run) => {
          const daemonFiber = run.daemon((run) => {
            daemonConcurrency = run.concurrency;
            return ok();
          });

          return await daemonFiber;
        }),
      );

      expectOk(result, undefined);
      expect(daemonConcurrency).toBe(concurrency);
    });

    test("uses explicit Task concurrency over current concurrency", async () => {
      await using run = createRun();
      const currentConcurrency = 2;
      const explicitConcurrency = 3;
      let daemonConcurrency: Int1To100OrPositiveInt | undefined;

      const result = await run(
        concurrently(currentConcurrency, async (run) => {
          const daemonFiber = run.daemon(
            concurrently(explicitConcurrency, (run) => {
              daemonConcurrency = run.concurrency;
              return ok();
            }),
          );

          return await daemonFiber;
        }),
      );

      expectOk(result, undefined);
      expect(daemonConcurrency).toBe(explicitConcurrency);
    });

    test("throws when current Task was aborted before daemon starts", async () => {
      await using run = createRun();
      const continueTask = Promise.withResolvers<void>();
      let daemonStarted = false;

      const fiber = run.abortable(async (run) => {
        await continueTask.promise;

        void run.daemon(() => {
          daemonStarted = true;
          return ok();
        });

        return ok();
      });

      fiber.abort();
      continueTask.resolve();

      const result = await fiber;
      assert(!result.ok);
      expect(result.error).toEqual({
        type: "AbortError",
        reason: explicitAbortReason,
      });
      expect(daemonStarted).toBe(false);
    });

    test("throws inside unabortable mask after abort request", async () => {
      await using run = createRun();
      const continueTask = Promise.withResolvers<void>();
      let daemonStarted = false;
      let daemonThrew: unknown;

      // The mask keeps in-flight work running, but detached work attaches to
      // the root and would outlive the scope, so daemon checks the raw abort
      // request and throws even while signal stays un-aborted.
      const fiber = run.abortable(
        unabortable(async (run) => {
          await continueTask.promise;

          expect(run.signal.aborted).toBe(false);

          try {
            void run.daemon(() => {
              daemonStarted = true;
              return ok();
            });
          } catch (error) {
            daemonThrew = error;
          }

          return ok("done");
        }),
      );

      fiber.abort(testAbortReason);
      continueTask.resolve();

      expect(await fiber).toEqual(ok("done"));
      expect(daemonStarted).toBe(false);
      expect(daemonThrew).toEqual(testAbortError);
    });

    test("does not inherit the caller's abort mask", async () => {
      await using run = createRun();
      const checkAbort = Promise.withResolvers<void>();
      let daemonFiber: AbortableFiber<void> | undefined;

      // The daemon detaches to the root, so the caller's mask does not follow
      // it; a mask-inheriting daemon could never observe abort and would hang
      // root disposal. Wrap with unabortable explicitly to opt in.
      const maskedResult = await run(
        unabortable((run) => {
          daemonFiber = run.daemon(async ({ signal }) => {
            await checkAbort.promise;
            signal.throwIfAborted();
            return ok();
          });
          return ok();
        }),
      );

      expect(maskedResult).toEqual(ok());
      assert(daemonFiber);
      expect(daemonFiber.run.snapshot().abortMask).toBe(0);

      daemonFiber.abort(testAbortReason);

      expect(daemonFiber.run.signal.aborted).toBe(true);
      expect(daemonFiber.run.signal.reason).toEqual(testAbortError);

      checkAbort.resolve();

      expect(await daemonFiber).toEqual(err(daemonFiber.run.signal.reason));
    });

    test("aborts and waits for daemon Tasks when root Run disposes", async () => {
      const run = createRun();
      const completeDaemon = Promise.withResolvers<void>();
      let disposeFinished = false;

      const daemonFiber = run.daemon(async ({ signal }) => {
        await completeDaemon.promise;
        if (signal.aborted) {
          const abortError = signal.reason;
          expect(abortError).toEqual({
            type: "AbortError",
            reason: runDisposedAbortReason,
          });
          return err(abortError);
        }
        return ok();
      });

      const disposePromise = run[Symbol.asyncDispose]().then(() => {
        disposeFinished = true;
      });

      expect(daemonFiber.run.signal.aborted).toBe(true);
      expect(daemonFiber.run.signal.reason).toEqual({
        type: "AbortError",
        reason: runDisposedAbortReason,
      });
      expect(disposeFinished).toBe(false);

      completeDaemon.resolve();

      expect(await daemonFiber).toEqual(err(daemonFiber.run.signal.reason));
      await disposePromise;
      expect(disposeFinished).toBe(true);
    });
  });

  describe("create", () => {
    test("creates DisposableRun that outlives the current Task", async () => {
      await using run = createRun();
      const completeCreatedTask = Promise.withResolvers<void>();
      let taskRun: Run | undefined;
      let createdRun: DisposableRun | undefined;
      let createdFiber: Fiber<string> | undefined;

      const taskFiber = run((run) => {
        taskRun = run;
        createdRun = run.create();
        createdFiber = createdRun(async ({ signal }) => {
          await completeCreatedTask.promise;
          signal.throwIfAborted();
          return ok("created");
        });
        return ok("task");
      });

      expect(await taskFiber).toEqual(ok("task"));

      assert(taskRun);
      assert(createdRun);
      assert(createdFiber);
      expectTypeOf(createdRun).toEqualTypeOf<DisposableRun>();
      expect(taskRun.signal.aborted).toBe(true);
      expect(taskRun.signal.reason).toEqual({
        type: "AbortError",
        reason: runDisposedAbortReason,
      });
      expect(createdRun.signal.aborted).toBe(false);

      completeCreatedTask.resolve();

      expect(await createdFiber).toEqual(ok("created"));
    });

    test("inherits current concurrency", async () => {
      await using run = createRun();
      const concurrency = 2;
      let createdConcurrency: Int1To100OrPositiveInt | undefined;

      const result = await run(
        concurrently(concurrency, (run) => {
          using createdRun = run.create();
          createdConcurrency = createdRun.concurrency;
          return ok();
        }),
      );

      expectOk(result, undefined);
      expect(createdConcurrency).toBe(concurrency);
    });

    test("created Run runs multiple Tasks and rejects later starts after disposal", async () => {
      const run = createRun();
      const createdRun = run.create();

      expect(await createdRun(() => ok("a"))).toEqual(ok("a"));
      expect(await createdRun(() => ok("b"))).toEqual(ok("b"));

      createdRun[Symbol.dispose]();
      expect(() => createdRun(() => ok("later"))).toThrow(
        "Cannot use a disposed object.",
      );

      const rootDisposedRun = run.create();
      await run[Symbol.asyncDispose]();
      expect(() => rootDisposedRun(() => ok("later"))).toThrow(
        "Cannot use a disposed object.",
      );
    });

    test("aborts and waits for child Tasks when created Run disposes", async () => {
      await using run = createRun();
      const createdRun = run.create();
      const completeChild = Promise.withResolvers<void>();
      let disposeFinished = false;
      let childSignal: AbortSignal | undefined;

      const childFiber = createdRun(async ({ signal }) => {
        childSignal = signal;
        await completeChild.promise;

        if (signal.aborted) {
          const abortError = signal.reason;
          expect(abortError).toEqual({
            type: "AbortError",
            reason: runDisposedAbortReason,
          });
          return err(abortError);
        }

        return ok();
      });

      assert(childSignal);
      const disposePromise = createdRun[Symbol.asyncDispose]().then(() => {
        disposeFinished = true;
      });

      expect(childSignal.aborted).toBe(true);
      expect(childSignal.reason).toEqual({
        type: "AbortError",
        reason: runDisposedAbortReason,
      });
      expect(disposeFinished).toBe(false);

      completeChild.resolve();

      expect(await childFiber).toEqual(err(childSignal.reason));
      await disposePromise;
      expect(disposeFinished).toBe(true);
      expect(() => createdRun(() => ok())).toThrow(
        "Cannot use a disposed object.",
      );
    });

    test("aborts and waits for created Run when root Run disposes", async () => {
      const run = createRun();
      const createdRun = run.create();
      const completeChild = Promise.withResolvers<void>();
      let disposeFinished = false;
      let childSignal: AbortSignal | undefined;

      const childFiber = createdRun(async ({ signal }) => {
        childSignal = signal;
        await completeChild.promise;

        if (signal.aborted) {
          const abortError = signal.reason;
          expect(abortError).toEqual({
            type: "AbortError",
            reason: runDisposedAbortReason,
          });
          return err(abortError);
        }

        return ok();
      });

      assert(childSignal);
      const disposePromise = run[Symbol.asyncDispose]().then(() => {
        disposeFinished = true;
      });

      expect(createdRun.signal.aborted).toBe(true);
      expect(createdRun.signal.reason).toEqual({
        type: "AbortError",
        reason: runDisposedAbortReason,
      });
      expect(childSignal.aborted).toBe(true);
      expect(childSignal.reason).toEqual({
        type: "AbortError",
        reason: runDisposedAbortReason,
      });
      expect(disposeFinished).toBe(false);

      completeChild.resolve();

      expect(await childFiber).toEqual(err(childSignal.reason));
      await disposePromise;
      expect(disposeFinished).toBe(true);
    });

    test("created Run has Settled state after root disposal", async () => {
      const run = createRun();
      const createdRun = run.create();

      await run[Symbol.asyncDispose]();

      expect(createdRun.getState()).toEqual({
        type: "Settled",
        abort: {
          request: runDisposedAbortReason,
          observed: runDisposedAbortReason,
        },
        exit: ok(ok()),
      });
    });

    test("created Run abort has custom abort in Settled state", async () => {
      await using root = createRun();
      const createdRun = root.create();

      createdRun.abort(testAbortReason);
      await createdRun[Symbol.asyncDispose]();

      expect(createdRun.getState()).toEqual({
        type: "Settled",
        abort: {
          request: testAbortReason,
          observed: testAbortReason,
        },
        exit: err(testAbortError),
      });
    });
  });

  describe("disposed Task Run", () => {
    test("prevents Run APIs after automatic Task Run disposal", async () => {
      await using run = createRun();
      let childRun: Run | undefined;

      const fiber = run((run) => {
        childRun = run;
        return ok();
      });

      expect(await fiber).toEqual(ok());

      assert(childRun);
      const disposedChildRun = childRun;
      expect(() => disposedChildRun(() => ok())).toThrow(
        "Cannot use a disposed object.",
      );
      expect(() => disposedChildRun.abortable(() => ok())).toThrow(
        "Cannot use a disposed object.",
      );
      expect(() => disposedChildRun.daemon(() => ok())).toThrow(
        "Cannot use a disposed object.",
      );
      expect(() => disposedChildRun.create()).toThrow(
        "Cannot use a disposed object.",
      );
    });
  });

  describe("dependency injection", () => {
    test("provides default deps from createRun", async () => {
      await using run = createRun();

      expectTypeOf(run.deps).toEqualTypeOf<RunDefaultDeps>();

      const fiber = run(({ deps }) => {
        expectTypeOf(deps).toEqualTypeOf<RunDefaultDeps>();
        expect(deps).toBe(run.deps);
        return ok();
      });

      expect(await fiber).toEqual(ok());
    });

    test("creates independent default consoles", async () => {
      await using firstRun = createRun();
      await using secondRun = createRun();
      const secondRunLevel = secondRun.deps.console.getLevel();

      firstRun.deps.console.setLevel("silent");

      expect(secondRun.deps.console.getLevel()).toBe(secondRunLevel);
    });

    test("lets custom deps override defaults in createRun", async () => {
      await using run = createRun({ random });

      expect(run.deps.random).toBe(random);
    });

    test("merges custom deps and lets child Tasks inherit them", async () => {
      await using run = createRun(dbDep);

      expectTypeOf(run).toEqualTypeOf<DisposableRun<DbDep>>();
      expectTypeOf(run.deps).toEqualTypeOf<RunDefaultDeps & DbDep>();
      expect(run.deps.db).toBe(dbDep.db);

      const fiber = run(({ deps }) => {
        expectTypeOf(deps).toEqualTypeOf<RunDefaultDeps & DbDep>();
        expect(deps.db).toBe(dbDep.db);
        return ok();
      });

      expectTypeOf(fiber.run.deps.db).toEqualTypeOf<Db>();
      expect(await fiber).toEqual(ok());
    });

    describe("replaces custom deps and preserves overridden defaults", () => {
      test("for run(task, deps)", async () => {
        await using run = createRun({ ...dbDep, random });

        const fiber = run((run) => {
          expect(run.deps.db).toBe(dbDep.db);
          expect(run.deps.random).toBe(random);

          return run(({ deps }) => {
            expectTypeOf(deps).toEqualTypeOf<RunDefaultDeps & SessionDep>();
            expect("db" in deps).toBe(false);
            expect(deps.random).toBe(random);
            expect(deps.session).toBe(sessionDep.session);
            return ok();
          }, sessionDep);
        });

        expect(await fiber).toEqual(ok());
      });

      test("for run.abortable(task, deps)", async () => {
        await using run = createRun({ ...dbDep, random });

        const result = await run.abortable(({ deps }) => {
          expect("db" in deps).toBe(false);
          expect(deps.random).toBe(random);
          expect(deps.session).toBe(sessionDep.session);
          expectTypeOf(deps).toEqualTypeOf<RunDefaultDeps & SessionDep>();
          return ok(deps.session.userId);
        }, sessionDep);

        expectOk(result, "ada");
      });

      test("for run.daemon(task, deps)", async () => {
        await using run = createRun({ ...dbDep, random });

        const taskFiber = run(async ({ daemon }) => {
          const daemonResult = await daemon(({ deps }) => {
            expect("db" in deps).toBe(false);
            expect(deps.random).toBe(random);
            expect(deps.session).toBe(sessionDep.session);
            expectTypeOf(deps).toEqualTypeOf<RunDefaultDeps & SessionDep>();
            return ok(deps.session.userId);
          }, sessionDep);

          assert(daemonResult.ok);
          return ok(daemonResult.value);
        });

        expect(await taskFiber).toEqual(ok("ada"));
      });

      test("for run.create(deps)", async () => {
        await using run = createRun({ ...dbDep, random });

        const taskFiber = run(async (run) => {
          await using createdRun = run.create(sessionDep);
          expectTypeOf(createdRun).toEqualTypeOf<DisposableRun<SessionDep>>();

          return await createdRun(({ deps }) => {
            expect("db" in deps).toBe(false);
            expect(deps.random).toBe(random);
            expect(deps.session).toBe(sessionDep.session);
            expectTypeOf(deps).toEqualTypeOf<RunDefaultDeps & SessionDep>();
            return ok(deps.session.userId);
          });
        });

        expect(await taskFiber).toEqual(ok("ada"));
      });
    });

    describe("inherits current deps", () => {
      test("for run.daemon(task, deps)", async () => {
        await using run = createRun(dbDep);

        const taskFiber = run(async (run) => {
          const childResult = await run(async ({ daemon }) => {
            const daemonResult = await daemon(({ deps }) => {
              expect("db" in deps).toBe(false);
              expect(deps.session).toBe(sessionDep.session);
              expectTypeOf(deps).toEqualTypeOf<RunDefaultDeps & SessionDep>();
              return ok(deps.session.userId);
            });

            assert(daemonResult.ok);
            return ok(daemonResult.value);
          }, sessionDep);

          assert(childResult.ok);
          return ok(childResult.value);
        });

        expect(await taskFiber).toEqual(ok("ada"));
      });

      test("for run.create() by default", async () => {
        await using run = createRun(dbDep);

        const taskFiber = run(async (run) => {
          await using createdRun = run.create();
          expectTypeOf(createdRun).toEqualTypeOf<DisposableRun<DbDep>>();

          return await createdRun(({ deps }) => {
            expect(deps.db).toBe(dbDep.db);
            expectTypeOf(deps).toEqualTypeOf<RunDefaultDeps & DbDep>();
            return ok(deps.db.query("select"));
          });
        });

        expect(await taskFiber).toEqual(ok("result:select"));
      });
    });

    describe("rejects incompatible default dependency overrides", () => {
      test("in createRun", () => {
        // @ts-expect-error - Overlapping default deps must be compatible.
        void createRun({ random: "not random" });
      });

      test("for run(task, deps)", () => {
        const run = createRun();
        const task: Task<void, never, RandomDep> = () => ok();

        // @ts-expect-error - Overlapping default deps must be compatible.
        void run(task, { random: "not random" });
      });

      test("for run.abortable(task, deps)", () => {
        const run = createRun();
        const task: Task<void, never, RandomDep> = () => ok();

        // @ts-expect-error - Overlapping default deps must be compatible.
        void run.abortable(task, { random: "not random" });
      });

      test("for run.daemon(task, deps)", () => {
        const run = createRun();
        const task: Task<void, never, RandomDep> = () => ok();

        // @ts-expect-error - Overlapping default deps must be compatible.
        void run.daemon(task, { random: "not random" });
      });

      test("for run.create(deps)", async () => {
        const run = createRun();

        const assertCreateDepsTypes = () => {
          // @ts-expect-error - Overlapping default deps must be compatible.
          void run.create({ random: "not random" });
        };

        void assertCreateDepsTypes;

        await run[Symbol.asyncDispose]();
      });
    });

    describe("requires object deps", () => {
      test("for run.create(deps)", async () => {
        const run = createRun();

        const assertCreateDepsTypes = () => {
          void run.create(sessionDep);

          // @ts-expect-error - Custom deps must be an object.
          void run.create(undefined);

          // @ts-expect-error - Custom deps must be an object.
          void run.create("deps");
        };

        void assertCreateDepsTypes;

        await run[Symbol.asyncDispose]();
      });

      test("for Task deps overloads", () => {
        const run = createRun();
        const task: Task<void, never, SessionDep> = () => ok();

        void run(task, sessionDep);
        void run.abortable(task, sessionDep);
        void run.daemon(task, sessionDep);

        // @ts-expect-error - Custom deps must be an object.
        void run(task, undefined);

        // @ts-expect-error - Custom deps must be an object.
        void run(task, "deps");

        // @ts-expect-error - Custom deps must be an object.
        void run.abortable(task, undefined);

        // @ts-expect-error - Custom deps must be an object.
        void run.abortable(task, "deps");

        // @ts-expect-error - Custom deps must be an object.
        void run.daemon(task, undefined);

        // @ts-expect-error - Custom deps must be an object.
        void run.daemon(task, "deps");

        void run;
      });
    });
  });

  describe("state", () => {
    test("new Run starts in Running state", async () => {
      await using run = createRun();

      expect(run.getState()).toEqual({ type: "Running" });
    });

    test("pending Task Run stays in Running state", async () => {
      await using run = createRun();
      const completeTask = Promise.withResolvers<void>();
      let childRun: Run | undefined;

      const fiber = run(async (run) => {
        childRun = run;
        await completeTask.promise;
        return ok();
      });

      assert(childRun);
      expect(childRun.getState()).toEqual({ type: "Running" });

      completeTask.resolve();

      expect(await fiber).toEqual(ok());
    });

    test("async disposal records Aborted before child Tasks finish", async () => {
      const run = createRun();
      const completeChild = Promise.withResolvers<void>();

      const childFiber = run(async () => {
        await completeChild.promise;
        return ok();
      });

      const disposePromise = run[Symbol.asyncDispose]();
      expect(run.getState()).toEqual({
        type: "Aborted",
        abort: {
          request: runDisposedAbortReason,
          observed: runDisposedAbortReason,
        },
      });

      completeChild.resolve();

      expect(await childFiber).toEqual(ok());
      await disposePromise;
    });

    test("created Run async disposal records Aborted before Settled", async () => {
      await using run = createRun();
      const createdRun = run.create();

      const disposePromise = createdRun[Symbol.asyncDispose]();
      expect(createdRun.getState()).toEqual({
        type: "Aborted",
        abort: {
          request: runDisposedAbortReason,
          observed: runDisposedAbortReason,
        },
      });

      await disposePromise;
      expect(createdRun.getState()).toEqual({
        type: "Settled",
        abort: {
          request: runDisposedAbortReason,
          observed: runDisposedAbortReason,
        },
        exit: ok(ok()),
      });
    });

    test("async disposal has successful Settled state", async () => {
      const run = createRun();

      await run[Symbol.asyncDispose]();

      expect(run.getState()).toEqual({
        type: "Settled",
        abort: {
          request: runDisposedAbortReason,
          observed: runDisposedAbortReason,
        },
        exit: ok(ok()),
      });
    });

    test("Task Run has Task Result in Settled state", async () => {
      await using run = createRun();
      const notFoundError = { type: "NotFound" } as const;
      let okRun: Run | undefined;
      let errRun: Run | undefined;

      const okFiber = run((run) => {
        okRun = run;
        return ok("Ada");
      });
      const errFiber = run((run) => {
        errRun = run;
        return err(notFoundError);
      });

      expect(await okFiber).toEqual(ok("Ada"));
      expect(await errFiber).toEqual(err(notFoundError));

      assert(okRun);
      expect(okRun.getState()).toEqual({
        type: "Settled",
        abort: {
          request: runDisposedAbortReason,
          observed: runDisposedAbortReason,
        },
        exit: ok(ok("Ada")),
      });
      assert(errRun);
      expect(errRun.getState()).toEqual({
        type: "Settled",
        abort: {
          request: runDisposedAbortReason,
          observed: runDisposedAbortReason,
        },
        exit: ok(err(notFoundError)),
      });
    });

    test("Task Run has observed abort in Settled state", async () => {
      await using run = createRun();
      const checkAbort = Promise.withResolvers<void>();
      let childRun: Run | undefined;

      const fiber = run.abortable(async (run) => {
        childRun = run;
        await checkAbort.promise;
        run.signal.throwIfAborted();
        return ok("Ada");
      });

      fiber.abort(testAbortReason);
      checkAbort.resolve();

      expect(await fiber).toEqual(err(testAbortError));

      assert(childRun);
      expect(childRun.getState()).toEqual({
        type: "Settled",
        abort: {
          request: testAbortReason,
          observed: testAbortReason,
        },
        exit: err(testAbortError),
      });
    });
  });

  describe("snapshot", () => {
    test("returns current state and child snapshots", async () => {
      await using run = createRun();
      const completeChild = Promise.withResolvers<void>();

      expect(run.snapshot()).toEqual({
        id: run.id,
        state: { type: "Running" },
        children: [],
        abortMask: 0,
      });

      const childFiber = run(async () => {
        await completeChild.promise;
        return ok("child");
      });

      expect(run.snapshot()).toEqual({
        id: run.id,
        state: { type: "Running" },
        children: [
          {
            id: childFiber.run.id,
            state: { type: "Running" },
            children: [],
            abortMask: 0,
          },
        ],
        abortMask: 0,
      });

      completeChild.resolve();

      expect(await childFiber).toEqual(ok("child"));
      expect(run.snapshot()).toEqual({
        id: run.id,
        state: { type: "Running" },
        children: [],
        abortMask: 0,
      });
    });

    test("includes abort mask depth and requested versus observed aborts", async () => {
      const run = createRun();
      const completeChild = Promise.withResolvers<void>();

      const childFiber = run(
        unabortable(async () => {
          await completeChild.promise;
          return ok();
        }),
      );

      try {
        expect(run.snapshot()).toMatchObject({
          abortMask: 0,
          children: [{ abortMask: 1 }],
        });

        const disposePromise = run[Symbol.asyncDispose]();
        const snapshot = run.snapshot();
        const state = snapshot.state;
        assert(state.type === "Aborted");
        expect(state.abort.request).toBe(runDisposedAbortReason);
        expect(state.abort.observed).toBe(state.abort.request);

        expect(snapshot).toMatchObject({
          children: [
            {
              state: {
                type: "Aborted",
                abort: { request: state.abort.request, observed: null },
              },
            },
          ],
        });

        completeChild.resolve();
        await disposePromise;
      } finally {
        completeChild.resolve();
        expect(await childFiber).toEqual(ok());
      }
    });

    test("snapshot reuses unchanged snapshot objects", async () => {
      await using run = createRun();

      const emptySnapshot = run.snapshot();

      expect(run.snapshot()).toBe(emptySnapshot);

      const completeChild = Promise.withResolvers<void>();
      const childFiber = run(async () => {
        await completeChild.promise;
        return ok();
      });

      const snapshotWithChild = run.snapshot();
      const childSnapshot = snapshotWithChild.children[0];
      assert(childSnapshot);

      try {
        const repeatedSnapshotWithChild = run.snapshot();

        expect(repeatedSnapshotWithChild).toBe(snapshotWithChild);
        expect(repeatedSnapshotWithChild.children[0]).toBe(childSnapshot);
      } finally {
        completeChild.resolve();
        expect(await childFiber).toEqual(ok());
      }

      expect(run.snapshot()).not.toBe(snapshotWithChild);
    });

    test("snapshot reuses unchanged aborted snapshot objects", () => {
      using run = createRun();

      run.abort({ type: "TestAbort" });
      const snapshot = run.snapshot();

      expect(run.snapshot()).toBe(snapshot);
    });

    test("includes a starting child observed from its Task synchronous prefix", async () => {
      await using run = createRun();
      let childrenDuringStart: ReadonlyArray<RunSnapshot> | undefined;

      // The child Run is registered before its Task starts, so disposal can
      // wait for it and observability can see it during the Task's
      // synchronous prefix.
      const childFiber = run((taskRun) => {
        childrenDuringStart = taskRun.parent?.snapshot().children;
        return ok("child");
      });

      expect(await childFiber).toEqual(ok("child"));
      expect(childrenDuringStart).toEqual([
        expect.objectContaining({ id: childFiber.run.id }),
      ]);
    });
  });

  describe("event reporting", () => {
    test("emits Run events only while eventsEnabled is true", async () => {
      const eventsEnabled = createRef(false);
      await using run = testCreateRun({ runConfig: { eventsEnabled } });
      const events: Array<RunEvent> = [];

      run.onEvent = (event) => {
        events.push(event);
      };

      expect(await run(() => ok("disabled"))).toEqual(ok("disabled"));
      expect(events).toEqual([]);

      eventsEnabled.set(true);

      const fiber = run(() => ok("enabled"));

      expect(await fiber).toEqual(ok("enabled"));
      expect(events).toEqual([
        {
          data: { childId: "mg8id41Qk7HxDoApjp0mZA", type: "ChildAdded" },
          id: "IGNl5t4ulaaQpdnwDhgoCA",
          timestamp: 0,
        },
        {
          data: {
            state: {
              abort: {
                observed: { type: "RunDisposedAbortReason" },
                request: { type: "RunDisposedAbortReason" },
              },
              type: "Aborted",
            },
            type: "StateChanged",
          },
          id: "mg8id41Qk7HxDoApjp0mZA",
          timestamp: 0,
        },
        {
          data: {
            state: {
              abort: {
                observed: { type: "RunDisposedAbortReason" },
                request: { type: "RunDisposedAbortReason" },
              },
              exit: { ok: true, value: { ok: true, value: "enabled" } },
              type: "Settled",
            },
            type: "StateChanged",
          },
          id: "mg8id41Qk7HxDoApjp0mZA",
          timestamp: 0,
        },
        {
          data: { childId: "mg8id41Qk7HxDoApjp0mZA", type: "ChildRemoved" },
          id: "IGNl5t4ulaaQpdnwDhgoCA",
          timestamp: 0,
        },
      ]);
    });

    test("preserves eventsEnabled when replacing custom deps", async () => {
      await using run = testCreateRun({ ...eventsEnabled, ...dbDep });
      const events: Array<RunEvent> = [];

      run.onEvent = (event) => {
        events.push(event);
      };

      expect(
        await run(({ deps }) => ok(deps.session.userId), sessionDep),
      ).toEqual(ok("ada"));

      // Replacing custom deps must keep runConfig, so events are still
      // emitted. The full event shape is covered by the snapshot above.
      expect(events.map((event) => event.data.type)).toEqual([
        "ChildAdded",
        "StateChanged",
        "StateChanged",
        "ChildRemoved",
      ]);
    });

    test("uses root time for child Run event timestamps when child replaces time", async () => {
      await using run = testCreateRun(eventsEnabled);
      const events: Array<RunEvent> = [];
      const childTime = testCreateTime({ startAt: Millis.orThrow(1000) });

      run.onEvent = (event) => {
        events.push(event);
      };

      expect(
        await run(() => ok("child"), {
          runConfig: { eventsEnabled: createRef(true) },
          time: childTime,
        }),
      ).toEqual(ok("child"));

      expect(events.map((event) => event.timestamp)).toEqual([0, 0, 0, 0]);
    });

    test("explicit runConfig override silences child events for ancestors", async () => {
      await using run = testCreateRun(eventsEnabled);
      const events: Array<RunEvent> = [];

      run.onEvent = (event) => {
        events.push(event);
      };

      // eventsEnabled gates the emitter, not observers: the parent still
      // emits its own ChildAdded/ChildRemoved, but the opted-out child and its
      // descendants emit nothing, even though the ancestor monitors.
      const silencedFiber = run(
        async (run) => await run(() => ok("grandchild")),
        { runConfig: { eventsEnabled: createRef(false) } },
      );

      expect(await silencedFiber).toEqual(ok("grandchild"));
      expect(events.map((event) => event.data.type)).toEqual([
        "ChildAdded",
        "ChildRemoved",
      ]);
      // Both events come from the parent Run; the silenced child and its
      // descendants emitted nothing.
      expect(events.map((event) => event.id)).toEqual([run.id, run.id]);
    });

    test("sets parent and bubbles Run events", async () => {
      await using run = testCreateRun(eventsEnabled);
      const events: Array<RunEvent> = [];

      run.onEvent = (event) => {
        events.push(event);
      };

      expect(run.parent).toBe(null);

      const fiber = run((childRun) => {
        expect(childRun.parent).toBe(run);
        return ok("Ada");
      });

      expect(fiber.run.parent).toBe(run);

      expect(await fiber).toEqual(ok("Ada"));
      expect(events.map((event) => event.data.type)).toEqual([
        "ChildAdded",
        "StateChanged",
        "StateChanged",
        "ChildRemoved",
      ]);
      // The StateChanged events are emitted by the child Run and bubble to
      // the parent handler.
      expect(
        events
          .filter((event) => event.data.type === "StateChanged")
          .map((event) => event.id),
      ).toEqual([fiber.run.id, fiber.run.id]);
    });

    test("does not delay ChildRemoved for Fiber settlement reactions", async () => {
      await using run = testCreateRun(eventsEnabled);
      const childRemovedDelayedForFiberSettlement =
        Promise.withResolvers<boolean>();
      let fiberSettled = false;

      run.onEvent = (event) => {
        if (event.data.type !== "ChildRemoved") return;

        queueMicrotask(() => {
          childRemovedDelayedForFiberSettlement.resolve(fiberSettled);
        });
      };

      const fiber = run(() => ok("Ada"));
      void fiber.then(() => {
        fiberSettled = true;
      });

      expect(await childRemovedDelayedForFiberSettlement.promise).toBe(false);
      expect(await fiber).toEqual(ok("Ada"));
    });

    test("bubbles StateChanged after child snapshot records observed abort", async () => {
      await using run = createRun(eventsEnabled);
      let abortedRunId: Id | undefined;
      let abortedSnapshot: ReturnType<Run["snapshot"]> | undefined;
      let abortReason: AbortReason | undefined;

      run.onEvent = (event) => {
        if (event.data.type !== "StateChanged") return;
        if (event.data.state.type !== "Aborted") return;
        if (event.data.state.abort.observed === null) return;

        abortedRunId = event.id;
        abortReason = event.data.state.abort.observed;
        abortedSnapshot = run.snapshot();
      };

      const fiber = run(() => ok());

      expect(await fiber).toEqual(ok());

      assert(abortedRunId);
      assert(abortedSnapshot);
      const childSnapshot = abortedSnapshot.children.find(
        (child) => child.id === abortedRunId,
      );
      assert(childSnapshot);
      assert(abortReason);
      expect(abortReason).toBe(runDisposedAbortReason);
      expect(childSnapshot.state).toEqual({
        type: "Aborted",
        abort: { request: abortReason, observed: abortReason },
      });
    });

    test("reports Run event handler defects", async () => {
      await using run = testCreateRun(eventsEnabled);
      const error = new Error("event handler failed");
      let eventHandlerDefected = false;

      void run((run) => {
        run.onEvent = () => {
          if (eventHandlerDefected) return;
          eventHandlerDefected = true;
          throw error;
        };
        return ok();
      });

      expect(await run.deps.reportDefect.next()).toBe(error);
    });

    test("routes Run event handler defects through custom reportDefect", async () => {
      const error = new Error("event handler failed");
      const reportedError = Promise.withResolvers<unknown>();
      await using run = testCreateRun({
        ...eventsEnabled,
        reportDefect: reportedError.resolve,
      });
      let eventHandlerDefected = false;

      void run((run) => {
        run.onEvent = () => {
          if (eventHandlerDefected) return;
          eventHandlerDefected = true;
          throw error;
        };
        return ok();
      });

      expect(await reportedError.promise).toBe(error);
    });

    test("continues bubbling current Run event after handler defects", async () => {
      await using run = testCreateRun(eventsEnabled);
      const error = new Error("event handler failed");
      const events: Array<RunEvent> = [];
      let eventHandlerDefected = false;

      run.onEvent = (event) => {
        events.push(event);
      };

      const fiber = run((run) => {
        run.onEvent = () => {
          if (eventHandlerDefected) return;
          eventHandlerDefected = true;
          throw error;
        };
        return ok("Ada");
      });

      expect(await fiber).toEqual(ok("Ada"));
      expect(await run.deps.reportDefect.next()).toBe(error);
      // The defecting child handler did not stop delivery to the parent.
      expect(events.map((event) => event.data.type)).toEqual([
        "ChildAdded",
        "StateChanged",
        "StateChanged",
        "ChildRemoved",
      ]);
    });

    test("reports Run event emission defects without interrupting Task settlement", async () => {
      const error = new Error("event emission failed");
      let nowDefected = false;
      function now(): Millis;
      function now(type: "DateIso"): DateIso;
      function now(type?: "DateIso"): Millis | DateIso {
        if (!nowDefected) {
          nowDefected = true;
          throw error;
        }
        return type === "DateIso"
          ? ("1970-01-01T00:00:00.000Z" as DateIso)
          : (0 as Millis);
      }
      const throwingTime: Time = {
        now,
        performance: {
          timeOrigin: 0 as Time["performance"]["timeOrigin"],
          now: () => 0 as ReturnType<Time["performance"]["now"]>,
        },
        setTimeout: () => 0 as unknown as ReturnType<Time["setTimeout"]>,
        clearTimeout: () => undefined,
      };
      await using run = testCreateRun({ ...eventsEnabled, time: throwingTime });

      const fiber = run(() => ok("Ada"));

      expect(await fiber).toEqual(ok("Ada"));
      expect(await run.deps.reportDefect.next()).toBe(error);
    });
  });

  describe("panic", () => {
    describe("from Task defects", () => {
      test("has Task Run Settled state and aborts root with PanicAbortReason", async () => {
        await using run = testCreateRun();
        const error = new Error("boom");
        let rootAbortObservedAfterDefect: unknown;
        let rootStateAfterDefect: ReturnType<Run["getState"]> | undefined;

        const fiber = run(() => {
          throw error;
        });
        const observedFiber = fiber.catch((error: unknown) => {
          rootAbortObservedAfterDefect = run.signal.reason;
          rootStateAfterDefect = run.getState();
          throw error;
        });

        await expect(observedFiber).rejects.toEqual(panic(error));
        assert(rootStateAfterDefect);
        expectPanicAbortError(rootAbortObservedAfterDefect, error);
        expect(rootStateAfterDefect).toEqual({
          type: "Aborted",
          abort: {
            request: rootAbortObservedAfterDefect.reason,
            observed: rootAbortObservedAfterDefect.reason,
          },
        });
        expect(fiber.run.getState()).toEqual({
          type: "Settled",
          abort: {
            request: rootAbortObservedAfterDefect.reason,
            observed: rootAbortObservedAfterDefect.reason,
          },
          exit: err(rootAbortObservedAfterDefect),
        });

        expect(run.signal.aborted).toBe(true);
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
      });

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
          expect(uncaughtError.errors).toEqual([
            panicAbortError,
            reporterDefect,
          ]);
        } finally {
          await run[Symbol.asyncDispose]();
        }
      });

      test("aborts child Tasks of defecting Task and reports panic abort", async () => {
        const run = testCreateRun();
        const error = new Error("boom");
        const childAborted = Promise.withResolvers<AbortSignal>();
        const completeChild = Promise.withResolvers<void>();

        const defectFiber = run((run) => {
          void run(async ({ signal }) => {
            signal.addEventListener(
              "abort",
              () => {
                childAborted.resolve(signal);
              },
              { once: true },
            );
            await completeChild.promise;
            return ok("child");
          });

          throw error;
        });

        const childSignal = await childAborted.promise;
        const panicAbortError: unknown = run.signal.reason;
        assert(AbortError.is(panicAbortError));
        expect(panicAbortError.reason).toEqual({
          type: "PanicAbortReason",
          defect: error,
        });
        expect(childSignal.aborted).toBe(true);
        assert(AbortError.is(childSignal.reason));
        expect(childSignal.reason.reason).toBe(panicAbortError.reason);
        expect(await run.deps.reportDefect.next()).toBe(panicAbortError);

        completeChild.resolve();

        await expect(defectFiber).rejects.toEqual(panic(error));
        await run[Symbol.asyncDispose]();
      });

      test("preserves parent Ok when an unjoined child defects during cleanup", async () => {
        const run = testCreateRun();
        const error = new Error("boom");
        const defectChild = Promise.withResolvers<void>();

        const parentFiber = run((run) => {
          const childFiber = run(async () => {
            await defectChild.promise;
            throw error;
          });
          void childFiber.catch(() => undefined);

          return ok("parent");
        });

        defectChild.resolve();

        const panicAbortError = await run.deps.reportDefect.next();
        expectPanicAbortError(panicAbortError, error);
        expect(await parentFiber).toEqual(ok("parent"));
        await run[Symbol.asyncDispose]();
      });

      test("aborts running sibling Task, waits for it, and reports panic abort", async () => {
        const run = testCreateRun();
        const error = new Error("boom");
        const siblingAborted = Promise.withResolvers<AbortSignal>();
        const completeSibling = Promise.withResolvers<void>();

        const siblingFiber = run(async ({ signal }) => {
          signal.addEventListener(
            "abort",
            () => {
              siblingAborted.resolve(signal);
            },
            { once: true },
          );
          await completeSibling.promise;
          return ok("sibling");
        });

        const defectFiber = run(() => {
          throw error;
        });

        await expect(defectFiber).rejects.toEqual(panic(error));

        const panicAbortError: unknown = run.signal.reason;
        assert(AbortError.is(panicAbortError));
        expect(panicAbortError.reason).toEqual({
          type: "PanicAbortReason",
          defect: error,
        });

        const siblingSignal = await siblingAborted.promise;
        expect(siblingSignal.aborted).toBe(true);
        assert(AbortError.is(siblingSignal.reason));
        expect(siblingSignal.reason.reason).toBe(panicAbortError.reason);
        expect(run.getState()).toEqual({
          type: "Aborted",
          abort: {
            request: panicAbortError.reason,
            observed: panicAbortError.reason,
          },
        });
        expect(await run.deps.reportDefect.next()).toBe(panicAbortError);

        completeSibling.resolve();

        expect(await siblingFiber).toEqual(ok("sibling"));
        await run[Symbol.asyncDispose]();
        expect(run.getState()).toEqual({
          type: "Settled",
          abort: {
            request: panicAbortError.reason,
            observed: panicAbortError.reason,
          },
          exit: err(panicAbortError),
        });
      });

      test("prevents new Tasks from panic abort callbacks and reports panic abort", async () => {
        await using run = testCreateRun();
        const error = new Error("boom");
        let panicAbortCallbackCalled = false;
        let childTaskStarted = false;

        using _ = run.onAbort(() => {
          panicAbortCallbackCalled = true;

          expect(() => {
            const childFiber = run(() => {
              childTaskStarted = true;
              return ok();
            });
            void childFiber.catch(() => undefined);
          }).toThrow("Cannot use a disposed object.");
        });

        const fiber = run(() => {
          throw error;
        });

        await expect(fiber).rejects.toEqual(panic(error));

        expect(panicAbortCallbackCalled).toBe(true);
        expect(childTaskStarted).toBe(false);
        expect(await run.deps.reportDefect.next()).toEqual(panic(error));
      });

      test("stores reported panic exit during root disposal", async () => {
        const run = testCreateRun();
        const defectTask = Promise.withResolvers<void>();
        const error = new Error("boom");

        const fiber = run(async () => {
          await defectTask.promise;
          throw error;
        });

        const disposePromise = run[Symbol.asyncDispose]();
        const disposalAbortError = run.signal.reason;
        const disposalAbortReason = runDisposedAbortReason;
        expect(disposalAbortError).toEqual({
          type: "AbortError",
          reason: runDisposedAbortReason,
        });

        try {
          defectTask.resolve();

          const panicAbortError = await run.deps.reportDefect.next();
          await expect(fiber).rejects.toBe(panicAbortError);
          await disposePromise;
          expect(run.getState()).toEqual({
            type: "Settled",
            abort: {
              request: disposalAbortReason,
              observed: disposalAbortReason,
            },
            exit: err(panicAbortError),
          });
          expect(run.snapshot()).toMatchObject({
            state: {
              type: "Settled",
              abort: {
                request: disposalAbortReason,
                observed: disposalAbortReason,
              },
              exit: err(panicAbortError),
            },
          });
        } finally {
          await disposePromise;
        }
      });

      test("keeps first panic exit and reports every Fiber defect", async () => {
        const run = testCreateRun();
        const defectFirstTask = Promise.withResolvers<void>();
        const defectSecondTask = Promise.withResolvers<void>();
        const firstError = new Error("first boom");
        const secondError = new Error("second boom");

        const firstFiber = run(async () => {
          await defectFirstTask.promise;
          throw firstError;
        });
        const secondFiber = run(async () => {
          await defectSecondTask.promise;
          throw secondError;
        });

        try {
          defectFirstTask.resolve();

          const panicAbortError = await run.deps.reportDefect.next();
          assert(AbortError.is(panicAbortError));
          await expect(firstFiber).rejects.toBe(panicAbortError);
          expect(panicAbortError.reason).toEqual({
            type: "PanicAbortReason",
            defect: firstError,
          });

          defectSecondTask.resolve();

          const secondPanicAbortError = await run.deps.reportDefect.next();
          await expect(secondFiber).rejects.toBe(secondPanicAbortError);
          expect(secondPanicAbortError).toEqual(panic(secondError));
          await run[Symbol.asyncDispose]();
          expect(run.getState()).toEqual({
            type: "Settled",
            abort: {
              request: panicAbortError.reason,
              observed: panicAbortError.reason,
            },
            exit: err(panicAbortError),
          });
        } finally {
          defectFirstTask.resolve();
          defectSecondTask.resolve();
          await run[Symbol.asyncDispose]();
        }
      });

      test("panics root and reports Task helper user code defects", async () => {
        await using run = testCreateRun();
        const completeSibling = Promise.withResolvers<void>();
        const siblingAborted = Promise.withResolvers<unknown>();
        const defect = new Error("boom");

        const callUserCode =
          (callback: () => void): Task<void> =>
          () => {
            callback();
            return ok();
          };

        const siblingFiber = run(async (run) => {
          using _ = run.onAbort((abortError) => {
            siblingAborted.resolve(abortError.reason);
          });
          await completeSibling.promise;
          return ok("sibling");
        });

        const defectFiber = run(
          callUserCode(() => {
            throw defect;
          }),
        );

        expect(await siblingAborted.promise).toEqual({
          type: "PanicAbortReason",
          defect,
        });
        const panicAbortError = run.signal.reason;
        expect(await run.deps.reportDefect.next()).toBe(panicAbortError);
        await expect(defectFiber).rejects.toEqual(panic(defect));
        expect(run.deps.reportDefect.getDefectsSnapshot()).toEqual([
          panicAbortError,
        ]);

        completeSibling.resolve();

        expect(await siblingFiber).toEqual(ok("sibling"));
      });
    });

    describe("from abort callback defects", () => {
      test("panics root synchronously and reports abort callback defects", async () => {
        const run = testCreateRun();
        const createdRun = run.create();
        const error = new Error("abort callback failed");

        using _ = createdRun.onAbort((): void => {
          throw error;
        });

        const disposePromise = createdRun[Symbol.asyncDispose]();
        const panicAbortError: unknown = run.signal.reason;
        assert(AbortError.is(panicAbortError));
        expect(panicAbortError.reason).toEqual({
          type: "PanicAbortReason",
          defect: error,
        });
        expect(run.getState()).toEqual({
          type: "Aborted",
          abort: {
            request: panicAbortError.reason,
            observed: panicAbortError.reason,
          },
        });

        try {
          expect(await run.deps.reportDefect.next()).toBe(panicAbortError);
          await disposePromise;
          await run[Symbol.asyncDispose]();
          expect(run.getState()).toEqual({
            type: "Settled",
            abort: {
              request: panicAbortError.reason,
              observed: panicAbortError.reason,
            },
            exit: err(panicAbortError),
          });
        } finally {
          await disposePromise;
          await run[Symbol.asyncDispose]();
        }
      });

      test("keeps first panic abort and reports repeated panics", async () => {
        const run = testCreateRun();
        const firstError = new Error("first boom");
        const secondError = new Error("second boom");

        run.panic(firstError);
        run.panic(secondError);

        const panicAbortError: unknown = run.signal.reason;
        assert(AbortError.is(panicAbortError));
        expect(panicAbortError.reason).toEqual({
          type: "PanicAbortReason",
          defect: firstError,
        });
        expect(await run.deps.reportDefect.next()).toBe(panicAbortError);
        expect(await run.deps.reportDefect.next()).toEqual(panic(secondError));

        await run[Symbol.asyncDispose]();
        expect(run.getState()).toEqual({
          type: "Settled",
          abort: {
            request: panicAbortError.reason,
            observed: panicAbortError.reason,
          },
          exit: err(panicAbortError),
        });
      });
    });
  });

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

        await expectContinuationAfterMicrotasks(fiber, 4);

        expect(await fiber).toEqual(ok("done"));
      });

      test("for resolved Promise Task", async () => {
        await using run = testCreateRun();
        const fiber = run(() => Promise.resolve(ok("done")));

        await expectContinuationAfterMicrotasks(fiber, 4);

        expect(await fiber).toEqual(ok("done"));
      });

      test("for awaited Task", async () => {
        await using run = testCreateRun();
        const fiber = run(async () => {
          await Promise.resolve();
          return ok("done");
        });

        await expectContinuationAfterMicrotasks(fiber, 5);

        expect(await fiber).toEqual(ok("done"));
      });

      test("for nested sync Task", async () => {
        await using run = createRun();
        const fiber = run(async (run) => await run(() => ok("done")));

        await expectContinuationAfterMicrotasks(fiber, 8);

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

        await expectContinuationAfterMicrotasks(fiber, 3);

        await expect(fiber).rejects.toEqual(panic(error));
        expect(await run.deps.reportDefect.next()).toEqual(panic(error));
      });
    });
  });
});

describe("DisposableRun", () => {
  describe("defer", () => {
    test("runs finalizers LIFO after child Tasks settle and awaits them", async () => {
      const run = createRun();
      const completeChild = Promise.withResolvers<void>();
      const finalizerStarted = Promise.withResolvers<void>();
      const continueFinalizer = Promise.withResolvers<void>();
      const events: Array<string> = [];

      run.defer(() => {
        events.push("first finalizer");
      });
      run.defer(async () => {
        events.push("second finalizer");
        finalizerStarted.resolve();
        await continueFinalizer.promise;
      });

      const childFiber = run(async () => {
        await completeChild.promise;
        events.push("child settled");
        return ok();
      });

      let disposalSettled = false;
      const disposal = run[Symbol.asyncDispose]().then(() => {
        disposalSettled = true;
      });

      try {
        expect(events).toEqual([]);

        completeChild.resolve();
        await finalizerStarted.promise;

        expect(events).toEqual(["child settled", "second finalizer"]);
        expect(disposalSettled).toBe(false);

        continueFinalizer.resolve();
        await disposal;

        expect(events).toEqual([
          "child settled",
          "second finalizer",
          "first finalizer",
        ]);
        expect(await childFiber).toEqual(ok());
      } finally {
        completeChild.resolve();
        continueFinalizer.resolve();
        await disposal;
      }
    });

    test("reports a finalizer defect once and async disposal rejects with the same AbortError", async () => {
      const run = testCreateRun();
      const defect = new Error("finalizer failed");

      run.defer(() => {
        throw defect;
      });

      let disposalError: unknown;
      try {
        await run[Symbol.asyncDispose]();
      } catch (error) {
        disposalError = error;
      }

      expectPanicAbortError(disposalError, defect);
      expect(run.deps.reportDefect.getDefectsSnapshot()).toEqual([
        disposalError,
      ]);
    });

    test("after disposal starts throws", async () => {
      const run = createRun();

      run[Symbol.dispose]();

      expect(() => run.defer(() => undefined)).toThrow(
        "Cannot use a disposed object.",
      );

      await run[Symbol.asyncDispose]();
    });

    test("reports multiple finalizer defects as SuppressedError", async () => {
      const run = testCreateRun();
      const firstDefect = new Error("first finalizer failed");
      const secondDefect = new Error("second finalizer failed");

      run.defer(() => {
        throw firstDefect;
      });
      run.defer(() => {
        throw secondDefect;
      });

      let disposalError: unknown;
      try {
        await run[Symbol.asyncDispose]();
      } catch (error) {
        disposalError = error;
      }

      assert(AbortError.is(disposalError));
      assert(disposalError.reason.type === "PanicAbortReason");
      const defect = disposalError.reason.defect;
      assert(defect instanceof SuppressedError);
      expect(defect.error).toBe(firstDefect);
      expect(defect.suppressed).toBe(secondDefect);
      expect(run.deps.reportDefect.getDefectsSnapshot()).toEqual([
        disposalError,
      ]);
    });
  });

  describe("abort", () => {
    test("aborts with custom reason without waiting for child Tasks", async () => {
      const run = createRun();
      const completeChild = Promise.withResolvers<void>();
      let childRun: Run | undefined;
      let childContinued = false;

      const childFiber = run(async (run) => {
        childRun = run;
        await completeChild.promise;
        childContinued = true;
        run.signal.throwIfAborted();
        return ok();
      });
      assert(childRun);

      run.abort(testAbortReason);

      expect(run.getState()).toEqual({
        type: "Aborted",
        abort: {
          request: testAbortReason,
          observed: testAbortReason,
        },
      });
      expect(childRun.signal.aborted).toBe(true);
      expect(childRun.signal.reason).toEqual(testAbortError);
      expect(childContinued).toBe(false);

      completeChild.resolve();

      await expect(childFiber).rejects.toEqual(testAbortError);
      await run[Symbol.asyncDispose]();
      expect(run.getState()).toEqual({
        type: "Settled",
        abort: {
          request: testAbortReason,
          observed: testAbortReason,
        },
        exit: err(testAbortError),
      });
    });

    test("does nothing after disposal starts", async () => {
      const run = createRun();

      run[Symbol.dispose]();
      run.abort(testAbortReason);

      expect(run.signal.reason).toEqual({
        type: "AbortError",
        reason: runDisposedAbortReason,
      });

      await run[Symbol.asyncDispose]();
      expect(run.getState()).toEqual({
        type: "Settled",
        abort: {
          request: runDisposedAbortReason,
          observed: runDisposedAbortReason,
        },
        exit: ok(ok()),
      });
    });
  });

  describe("dispose", () => {
    test("prevents new Tasks immediately when dispose runs", async () => {
      const run = createRun();
      let taskStarted = false;

      run[Symbol.dispose]();

      expect(() =>
        run(() => {
          taskStarted = true;
          return ok("Ada");
        }),
      ).toThrow("Cannot use a disposed object.");
      expect(taskStarted).toBe(false);

      await run[Symbol.asyncDispose]();
    });

    test("aborts self immediately", async () => {
      const run = createRun();

      expect(run.signal.aborted).toBe(false);

      run[Symbol.dispose]();

      expect(run.signal.aborted).toBe(true);
      expect(run.signal.reason).toEqual({
        type: "AbortError",
        reason: runDisposedAbortReason,
      });

      await run[Symbol.asyncDispose]();
    });

    test("settles on next microtask after sync dispose", async () => {
      const run = createRun();

      run[Symbol.dispose]();

      expect(run.getState()).toEqual({
        type: "Aborted",
        abort: {
          request: runDisposedAbortReason,
          observed: runDisposedAbortReason,
        },
      });

      await Promise.resolve();

      expect(run.getState()).toEqual({
        type: "Settled",
        abort: {
          request: runDisposedAbortReason,
          observed: runDisposedAbortReason,
        },
        exit: ok(ok()),
      });
    });

    test("aborts already-running child Runs immediately", async () => {
      const run = createRun();
      const completeChild = Promise.withResolvers<void>();
      let childRun: Run | undefined;

      void run(async (run) => {
        childRun = run;
        await completeChild.promise;
        return ok();
      });
      assert(childRun);

      expect(childRun.signal.aborted).toBe(false);

      run[Symbol.dispose]();

      expect(childRun.signal.aborted).toBe(true);
      expect(childRun.signal.reason).toEqual({
        type: "AbortError",
        reason: runDisposedAbortReason,
      });

      completeChild.resolve();

      await run[Symbol.asyncDispose]();
    });

    test("dispose returns before already-running child Tasks settle", async () => {
      const run = createRun();
      const completeChild = Promise.withResolvers<void>();
      let childSettled = false;

      const childFiber = run(async () => {
        await completeChild.promise;
        childSettled = true;
        return ok();
      });

      run[Symbol.dispose]();

      expect(childSettled).toBe(false);

      completeChild.resolve();

      expect(await childFiber).toEqual(ok());
      await run[Symbol.asyncDispose]();
    });
  });

  describe("asyncDispose", () => {
    test("prevents new Tasks immediately when asyncDispose starts", async () => {
      const run = createRun();
      let taskStarted = false;

      const disposePromise = run[Symbol.asyncDispose]();

      expect(() =>
        run(() => {
          taskStarted = true;
          return ok("Ada");
        }),
      ).toThrow("Cannot use a disposed object.");
      expect(taskStarted).toBe(false);

      await disposePromise;
    });

    test("aborts self immediately", async () => {
      const run = createRun();

      expect(run.signal.aborted).toBe(false);

      const disposePromise = run[Symbol.asyncDispose]();

      expect(run.signal.aborted).toBe(true);
      expect(run.signal.reason).toEqual({
        type: "AbortError",
        reason: runDisposedAbortReason,
      });

      await disposePromise;
    });

    test("aborts self before waiting for child Tasks", async () => {
      const run = createRun();
      const completeChild = Promise.withResolvers<void>();
      let disposeFinished = false;

      const childFiber = run(async () => {
        await completeChild.promise;
        return ok();
      });

      const disposePromise = run[Symbol.asyncDispose]().then(() => {
        disposeFinished = true;
      });

      expect(run.signal.aborted).toBe(true);
      expect(disposeFinished).toBe(false);

      completeChild.resolve();

      expect(await childFiber).toEqual(ok());
      await disposePromise;
    });

    test("waits for child Task that disposes Run while starting", async () => {
      const run = createRun();
      const completeChild = Promise.withResolvers<void>();
      let disposePromise: PromiseLike<void> | undefined;
      let disposeFinished = false;

      const childFiber = run(async () => {
        disposePromise = run[Symbol.asyncDispose]().then(() => {
          disposeFinished = true;
        });

        await completeChild.promise;
        return ok();
      });

      assert(disposePromise);

      const disposeFinishedWhileChildRunning = disposeFinished;

      completeChild.resolve();

      expect(await childFiber).toEqual(ok());
      await disposePromise;
      expect(disposeFinishedWhileChildRunning).toBe(false);
      expect(disposeFinished).toBe(true);
    });

    test("aborts already-running child Runs immediately", async () => {
      const run = createRun();
      const completeChild = Promise.withResolvers<void>();
      let childRun: Run | undefined;

      void run(async (run) => {
        childRun = run;
        await completeChild.promise;
        return ok();
      });
      assert(childRun);
      let disposeFinished = false;

      expect(childRun.signal.aborted).toBe(false);
      const disposePromise = run[Symbol.asyncDispose]().then(() => {
        disposeFinished = true;
      });
      expect(childRun.signal.aborted).toBe(true);
      expect(childRun.signal.reason).toEqual({
        type: "AbortError",
        reason: runDisposedAbortReason,
      });
      expect(disposeFinished).toBe(false);

      completeChild.resolve();

      await disposePromise;
      expect(disposeFinished).toBe(true);
    });

    test("waits for already-running child Tasks to settle", async () => {
      const run = createRun();
      const completeFirstChild = Promise.withResolvers<void>();
      const completeSecondChild = Promise.withResolvers<void>();
      let disposeFinished = false;

      const firstChildFiber = run(async () => {
        await completeFirstChild.promise;
        return ok("first");
      });
      const secondChildFiber = run(async () => {
        await completeSecondChild.promise;
        return ok("second");
      });

      const disposePromise = run[Symbol.asyncDispose]().then(() => {
        disposeFinished = true;
      });

      const disposeFinishedWhileChildrenRunning = disposeFinished;

      completeFirstChild.resolve();
      completeSecondChild.resolve();

      expect(await firstChildFiber).toEqual(ok("first"));
      expect(await secondChildFiber).toEqual(ok("second"));
      await disposePromise;

      expect(disposeFinishedWhileChildrenRunning).toBe(false);
      expect(disposeFinished).toBe(true);
    });
  });
});

describe("AbortableFiber", () => {
  test("asyncDispose aborts and waits for Task settlement", async () => {
    await using run = createRun();
    const continueTask = Promise.withResolvers<void>();
    let disposeFinished = false;
    let signal: AbortSignal | undefined;

    const fiber = run.abortable(async (run) => {
      signal = run.signal;
      await continueTask.promise;
      run.signal.throwIfAborted();
      return ok();
    });

    assert(signal);
    const disposePromise = fiber[Symbol.asyncDispose]().then(() => {
      disposeFinished = true;
    });

    expect(signal.aborted).toBe(true);
    expect(signal.reason).toEqual({
      type: "AbortError",
      reason: explicitAbortReason,
    });

    expect(disposeFinished).toBe(false);

    continueTask.resolve();

    expect(await fiber).toEqual(err(signal.reason));
    await disposePromise;
    expect(disposeFinished).toBe(true);
  });
});

describe("collection helpers", () => {
  describe("runtime", () => {
    for (const helper of [
      {
        name: "all",
        resultMode: "values",
        errorMode: "failFast",
        fromArray: (tasks: ReadonlyArray<AnyTask>) => all(tasks),
        fromRecord: (tasks: Readonly<Record<string, AnyTask>>) => all(tasks),
      },
      {
        name: "allSettled",
        resultMode: "results",
        errorMode: "settled",
        fromArray: (tasks: ReadonlyArray<AnyTask>) => allSettled(tasks),
        fromRecord: (tasks: Readonly<Record<string, AnyTask>>) =>
          allSettled(tasks),
      },
      {
        name: "map",
        resultMode: "values",
        errorMode: "failFast",
        fromArray: (tasks: ReadonlyArray<AnyTask>) =>
          map(tasks, (task) => task),
        fromRecord: (tasks: Readonly<Record<string, AnyTask>>) =>
          map(tasks, (task) => task),
      },
      {
        name: "mapSettled",
        resultMode: "results",
        errorMode: "settled",
        fromArray: (tasks: ReadonlyArray<AnyTask>) =>
          mapSettled(tasks, (task) => task),
        fromRecord: (tasks: Readonly<Record<string, AnyTask>>) =>
          mapSettled(tasks, (task) => task),
      },
    ] as const) {
      const expectedArrayValue = (
        values: ReadonlyArray<unknown>,
      ): ReadonlyArray<unknown> =>
        helper.resultMode === "results"
          ? values.map((value) => ok(value))
          : values;

      const expectedRecordValue = (
        values: Readonly<Record<string, unknown>>,
      ): Readonly<Record<string, unknown>> =>
        helper.resultMode === "results"
          ? Object.fromEntries(
              Object.entries(values).map(([key, value]) => [key, ok(value)]),
            )
          : values;

      const taskNoun =
        helper.name === "map" || helper.name === "mapSettled"
          ? "mapped Tasks"
          : "Tasks";
      const taskSingular = taskNoun === "Tasks" ? "Task" : "mapped Task";

      describe(helper.name, () => {
        describe("returns", () => {
          test("Ok with empty collections", async () => {
            await using run = createRun();

            expect(await run(helper.fromArray(emptyArray))).toEqual(
              ok(emptyArray),
            );
            expect(await run(helper.fromRecord({}))).toEqual(ok(emptyRecord));
          });

          if (helper.resultMode === "values") {
            test(`Ok with all values when all ${taskNoun} return Ok`, async () => {
              await using run = createRun();

              const tasks: ReadonlyArray<AnyTask> = [
                () => ok("Ada"),
                () => ok(37),
                () => ok(true),
              ];

              expect(await run(helper.fromArray(tasks))).toEqual(
                ok(["Ada", 37, true]),
              );
            });
          } else {
            test(`Ok with all Results when ${taskNoun} return Ok or Err`, async () => {
              const taskError = { type: "TaskError" } as const;

              await using run = createRun();

              const tasks: ReadonlyArray<AnyTask> = [
                () => ok("Ada"),
                () => err(taskError),
                () => ok(true),
              ];

              expect(await run(helper.fromArray(tasks))).toEqual(
                ok([ok("Ada"), err(taskError), ok(true)]),
              );
            });
          }

          test(`preserves record keys when ${taskNoun} return Ok`, async () => {
            await using run = createRun();

            const tasks: Readonly<Record<string, AnyTask>> = {
              name: () => ok("Ada"),
              age: () => ok(37),
              active: () => ok(true),
            };

            expect(await run(helper.fromRecord(tasks))).toEqual(
              ok(
                expectedRecordValue({
                  name: "Ada",
                  age: 37,
                  active: true,
                }),
              ),
            );
          });

          if (helper.errorMode === "failFast") {
            test(`the first Err when a ${taskSingular} returns Err`, async () => {
              await using run = createRun();
              const firstError = { type: "FirstError" } as const;
              const secondError = { type: "SecondError" } as const;

              const first: Task<string, typeof firstError> = () =>
                err(firstError);
              const second: Task<string, typeof secondError> = () =>
                err(secondError);

              expect(await run(helper.fromArray([first, second]))).toEqual(
                err(firstError),
              );
            });
          }

          if (helper.name === "map" || helper.name === "mapSettled") {
            test("maps values to Tasks", async () => {
              interface Deps {
                readonly prefix: string;
              }
              interface TaskError {
                readonly type: "TaskError";
              }

              await using run = createRun<Deps>({ prefix: "#" });

              if (helper.name === "map") {
                const calls: Array<ReadonlyArray<unknown>> = [];
                const mapper = (
                  ...args: [number, ...ReadonlyArray<unknown>]
                ): Task<string, TaskError, Deps> => {
                  calls.push(args);
                  const [value] = args;
                  return (run) => ok(`${run.deps.prefix}${value}`);
                };
                const task = map([1, 2, 3], mapper);

                expect(calls).toEqual([
                  [1, 0],
                  [2, 1],
                  [3, 2],
                ]);
                expect(await run(task)).toEqual(ok(["#1", "#2", "#3"]));
                expect(calls).toEqual([
                  [1, 0],
                  [2, 1],
                  [3, 2],
                ]);
              } else {
                const taskError: TaskError = { type: "TaskError" };
                const calls: Array<ReadonlyArray<unknown>> = [];
                const mapper = (
                  ...args: [number, ...ReadonlyArray<unknown>]
                ): Task<string, TaskError, Deps> => {
                  calls.push(args);
                  const [value] = args;
                  return (run) =>
                    value === 2
                      ? err(taskError)
                      : ok(`${run.deps.prefix}${value}`);
                };
                const task = mapSettled([1, 2, 3], mapper);

                expect(calls).toEqual([
                  [1, 0],
                  [2, 1],
                  [3, 2],
                ]);
                expect(await run(task)).toEqual(
                  ok([ok("#1"), err(taskError), ok("#3")]),
                );
                expect(calls).toEqual([
                  [1, 0],
                  [2, 1],
                  [3, 2],
                ]);
              }
            });

            test("maps record values to Tasks", async () => {
              interface Deps {
                readonly prefix: string;
              }
              interface TaskError {
                readonly type: "TaskError";
              }

              await using run = createRun<Deps>({ prefix: "#" });

              const values = { one: 1, two: 2, three: 3 } as const;

              if (helper.name === "map") {
                const calls: Array<ReadonlyArray<unknown>> = [];
                const mapper = (
                  ...args: [number, ...ReadonlyArray<unknown>]
                ): Task<string, TaskError, Deps> => {
                  calls.push(args);
                  const [value] = args;
                  return (run) => ok(`${run.deps.prefix}${value}`);
                };
                const task = map(values, mapper);

                expect(calls).toEqual([
                  [1, "one"],
                  [2, "two"],
                  [3, "three"],
                ]);
                expect(await run(task)).toEqual(
                  ok({ one: "#1", two: "#2", three: "#3" }),
                );
                expect(calls).toEqual([
                  [1, "one"],
                  [2, "two"],
                  [3, "three"],
                ]);
              } else {
                const taskError: TaskError = { type: "TaskError" };
                const calls: Array<ReadonlyArray<unknown>> = [];
                const mapper = (
                  ...args: [number, ...ReadonlyArray<unknown>]
                ): Task<string, TaskError, Deps> => {
                  calls.push(args);
                  const [value] = args;
                  return (run) =>
                    value === 2
                      ? err(taskError)
                      : ok(`${run.deps.prefix}${value}`);
                };
                const task = mapSettled(values, mapper);

                expect(calls).toEqual([
                  [1, "one"],
                  [2, "two"],
                  [3, "three"],
                ]);
                expect(await run(task)).toEqual(
                  ok({
                    one: ok("#1"),
                    two: err(taskError),
                    three: ok("#3"),
                  }),
                );
                expect(calls).toEqual([
                  [1, "one"],
                  [2, "two"],
                  [3, "three"],
                ]);
              }
            });

            test("mapped Task output with metadata applied", async () => {
              const priorities: Array<TaskPriority | undefined> = [];

              vi.stubGlobal("scheduler", {
                postTask: async <T>(
                  callback: () => T | PromiseLike<T>,
                  options?: { readonly priority?: TaskPriority },
                ): Promise<T> => {
                  priorities.push(options?.priority);
                  return await callback();
                },
              });

              try {
                await using run = createRun();
                const task = helper.fromArray([
                  prioritized("background", () => ok(1)),
                ]);

                expect(await run(task)).toEqual(ok(expectedArrayValue([1])));
                expect(priorities).toEqual(["background"]);
              } finally {
                vi.unstubAllGlobals();
              }
            });
          }

          test(`preserves input order when ${taskNoun} settle out of order`, async () => {
            await using run = createRun();
            const completeFirst = Promise.withResolvers<void>();
            const completeSecond = Promise.withResolvers<void>();

            const first: Task<string> = async () => {
              await completeFirst.promise;
              return ok("first");
            };
            const second: Task<string> = async () => {
              await completeSecond.promise;
              return ok("second");
            };

            const fiber = run(
              concurrently(2, helper.fromArray([first, second])),
            );

            completeSecond.resolve();
            completeFirst.resolve();

            expect(await fiber).toEqual(
              ok(expectedArrayValue(["first", "second"])),
            );
          });
        });

        describe("by default", () => {
          test(`runs ${taskNoun} sequentially`, async () => {
            await using run = createRun();
            const completeFirst = Promise.withResolvers<void>();
            const events: Array<string> = [];

            const first: Task<string> = async () => {
              events.push("first start");
              await completeFirst.promise;
              events.push("first end");
              return ok("first");
            };
            const second: Task<string> = () => {
              events.push("second start");
              return ok("second");
            };

            const fiber = run(helper.fromArray([first, second]));

            expect(events).toEqual(["first start"]);

            completeFirst.resolve();

            expect(await fiber).toEqual(
              ok(expectedArrayValue(["first", "second"])),
            );
            expect(events).toEqual([
              "first start",
              "first end",
              "second start",
            ]);
          });

          if (helper.errorMode === "failFast") {
            test(`does not run later ${taskNoun} after the first Err`, async () => {
              await using run = createRun();
              const taskError = { type: "TaskError" } as const;
              let laterStarted = false;

              const failing: Task<string, typeof taskError> = () =>
                err(taskError);
              const later: Task<string, typeof taskError> = () => {
                laterStarted = true;
                return ok("later");
              };

              expect(await run(helper.fromArray([failing, later]))).toEqual(
                err(taskError),
              );
              expect(laterStarted).toBe(false);
            });
          } else {
            test(`runs later ${taskNoun} after an Err`, async () => {
              await using run = createRun();
              const taskError = { type: "TaskError" } as const;
              let laterStarted = false;

              const failing: Task<string, typeof taskError> = () =>
                err(taskError);
              const later: Task<string, typeof taskError> = () => {
                laterStarted = true;
                return ok("later");
              };

              expect(await run(helper.fromArray([failing, later]))).toEqual(
                ok([err(taskError), ok("later")]),
              );
              expect(laterStarted).toBe(true);
            });
          }

          test(`aborts running ${taskNoun} when aborted`, async () => {
            await using run = createRun();
            const completeTask = Promise.withResolvers<void>();
            let taskSignal: AbortSignal | undefined;

            const task: Task<string> = async (run) => {
              taskSignal = run.signal;
              await completeTask.promise;
              run.signal.throwIfAborted();
              return ok("task");
            };

            const fiber = run.abortable(helper.fromArray([task]));
            assert(taskSignal);

            fiber.abort(testAbortReason);
            completeTask.resolve();

            expect(taskSignal.aborted).toBe(true);
            expect(taskSignal.reason).toEqual(testAbortError);
            expect(await fiber).toEqual(err(testAbortError));
          });
        });

        describe("with concurrently", () => {
          test(`runs ${taskNoun} concurrently`, async () => {
            await using run = createRun();
            const completeTasks = Promise.withResolvers<void>();
            const events: Array<string> = [];

            const createTask =
              (id: number): Task<number> =>
              async () => {
                events.push(`start ${id}`);
                await completeTasks.promise;
                events.push(`end ${id}`);
                return ok(id);
              };

            const fiber = run(
              concurrently(
                2,
                helper.fromArray([createTask(1), createTask(2), createTask(3)]),
              ),
            );

            try {
              expect(events).toEqual(["start 1", "start 2"]);

              completeTasks.resolve();

              expect(await fiber).toEqual(ok(expectedArrayValue([1, 2, 3])));
              expect(events).toEqual([
                "start 1",
                "start 2",
                "end 1",
                "end 2",
                "start 3",
                "end 3",
              ]);
            } finally {
              completeTasks.resolve();
            }
          });

          if (helper.errorMode === "failFast") {
            test(`waits for running ${taskNoun} and does not start queued ${taskNoun} after the first Err`, async () => {
              await using run = createRun();
              const completeSlow = Promise.withResolvers<void>();
              const slowAborted = Promise.withResolvers<unknown>();
              const taskError = { type: "TaskError" } as const;
              let slowSettled = false;
              let laterStarted = false;

              const slow: Task<string, typeof taskError> = async (run) => {
                using _ = run.onAbort((abortError) => {
                  slowAborted.resolve(abortError.reason);
                });
                await completeSlow.promise;
                slowSettled = true;
                return ok("slow");
              };
              const failing: Task<string, typeof taskError> = () =>
                err(taskError);
              const later: Task<string, typeof taskError> = () => {
                laterStarted = true;
                return ok("later");
              };

              const helperFiber = run(
                concurrently(2, helper.fromArray([slow, failing, later])),
              );
              let helperFiberSettled = false;
              void helperFiber.then(() => {
                helperFiberSettled = true;
              });

              try {
                expect(await slowAborted.promise).toBe(runDisposedAbortReason);
                expect(helperFiberSettled).toBe(false);

                const snapshot = helperFiber.run.snapshot();
                expect(snapshot.state).toEqual({ type: "Running" });

                const childSnapshot = snapshot.children[0];
                assert(childSnapshot);
                assert(childSnapshot.state.type === "Aborted");
                const abortReason = childSnapshot.state.abort.request;
                expect(abortReason).toBe(runDisposedAbortReason);
                expect(childSnapshot.state.abort.observed).toBe(abortReason);

                const grandchildSnapshot = childSnapshot.children[0];
                assert(grandchildSnapshot);
                assert(grandchildSnapshot.state.type === "Aborted");
                expect(grandchildSnapshot.state.abort.request).toBe(
                  abortReason,
                );
                expect(grandchildSnapshot.state.abort.observed).toBe(
                  abortReason,
                );
              } finally {
                completeSlow.resolve();
              }

              expect(await helperFiber).toEqual(err(taskError));
              expect(slowSettled).toBe(true);
              expect(laterStarted).toBe(false);
            });

            if (helper.name === "all") {
              test("aborts an already-started slow Task after sync Err", async () => {
                await using run = createRun();
                const taskError = { type: "TaskError" } as const;
                const slowAborted = Promise.withResolvers<void>();
                let slowStarted = false;
                let slowSettled = false;

                const syncOk: Task<string, typeof taskError> = () => ok("sync");
                const syncErr: Task<string, typeof taskError> = () =>
                  err(taskError);
                const slow: Task<string, typeof taskError> = async (run) => {
                  slowStarted = true;
                  using _ = run.onAbort(() => {
                    slowAborted.resolve();
                  });
                  await slowAborted.promise;
                  slowSettled = true;
                  return ok("slow");
                };

                expect(
                  await run(
                    concurrently(2, helper.fromArray([syncOk, syncErr, slow])),
                  ),
                ).toEqual(err(taskError));
                expect(slowStarted).toBe(true);
                expect(slowSettled).toBe(true);
              });
            }
          } else {
            test(`waits for running ${taskNoun} after an Err`, async () => {
              await using run = createRun();
              const completeSlow = Promise.withResolvers<void>();
              const taskError = { type: "TaskError" } as const;
              let slowSettled = false;

              const slow: Task<string, typeof taskError> = async () => {
                await completeSlow.promise;
                slowSettled = true;
                return ok("slow");
              };
              const failing: Task<string, typeof taskError> = () =>
                err(taskError);

              const fiber = run(
                concurrently(2, helper.fromArray([slow, failing])),
              );

              expect(slowSettled).toBe(false);

              completeSlow.resolve();

              expect(await fiber).toEqual(ok([ok("slow"), err(taskError)]));
              expect(slowSettled).toBe(true);
            });
          }

          test(`rejects with panic abort and aborts running ${taskNoun} when a ${taskSingular} defects`, async () => {
            await using run = testCreateRun();
            const completeSlow = Promise.withResolvers<void>();
            const slowAborted = Promise.withResolvers<unknown>();
            const defect = new Error("boom");

            const slow: Task<string> = async (run) => {
              using _ = run.onAbort((abortError) => {
                slowAborted.resolve(abortError.reason);
              });
              await completeSlow.promise;
              return ok("slow");
            };
            const defecting: Task<string> = () => {
              throw defect;
            };

            const fiber = run(
              concurrently(2, helper.fromArray([slow, defecting])),
            );

            expect(await slowAborted.promise).toEqual({
              type: "PanicAbortReason",
              defect,
            });

            completeSlow.resolve();

            await expect(fiber).rejects.toEqual(panic(defect));
          });
        });
      });
    }

    test("map and mapSettled throw when mapper defects", () => {
      const defect = new Error("boom");
      const defectingMapper = (): Task<string> => {
        throw defect;
      };

      expect(() => map([1], defectingMapper)).toThrow(defect);
      expect(() => mapSettled([1], defectingMapper)).toThrow(defect);
    });
  });

  describe("types", () => {
    test("Task helpers infer dependency intersections", () => {
      interface FirstDep {
        readonly first: unknown;
      }
      interface FirstError {
        readonly type: "FirstError";
      }
      interface SecondDep {
        readonly second: unknown;
      }
      interface SecondError {
        readonly type: "SecondError";
      }

      type First = Task<string, FirstError, FirstDep>;
      type Second = Task<number, SecondError, SecondDep>;
      type Third = Task<boolean>;
      type Tasks = readonly [First, Second, Third];
      type Deps = FirstDep & SecondDep;
      type Error = FirstError | SecondError;
      type Value = string | number | boolean;

      expectTypeOf<
        InferTaskDeps<ReturnType<typeof each<Tasks>>>
      >().toEqualTypeOf<Deps>();
      expectTypeOf<
        InferTaskDeps<ReturnType<typeof race<Tasks>>>
      >().toEqualTypeOf<Deps>();
      expectTypeOf<
        InferTaskDeps<ReturnType<typeof any<Tasks>>>
      >().toEqualTypeOf<Deps>();
      expectTypeOf<InferTasksResult<Tasks>>().toEqualTypeOf<
        Result<Value, Error>
      >();
      expectTypeOf<ReturnType<typeof race<Tasks>>>().toEqualTypeOf<
        Task<Value, Error, Deps>
      >();
      expectTypeOf<ReturnType<typeof any<Tasks>>>().toEqualTypeOf<
        Task<Value, Error, Deps>
      >();
    });

    test("Task helpers infer widened task array dependency intersections", () => {
      interface FirstDep {
        readonly first: unknown;
      }
      interface SecondDep {
        readonly second: unknown;
      }

      type First = Task<string, never, FirstDep>;
      type Second = Task<number, never, SecondDep>;
      type Tasks = readonly [First | Second, ...ReadonlyArray<First | Second>];
      type Deps = FirstDep & SecondDep;
      type Value = string | number;

      expectTypeOf<
        InferTaskDeps<ReturnType<typeof each<Tasks>>>
      >().toEqualTypeOf<Deps>();
      expectTypeOf<
        InferTaskDeps<ReturnType<typeof race<Tasks>>>
      >().toEqualTypeOf<Deps>();
      expectTypeOf<
        InferTaskDeps<ReturnType<typeof any<Tasks>>>
      >().toEqualTypeOf<Deps>();
      expectTypeOf<ReturnType<typeof each<Tasks>>>().toEqualTypeOf<
        Task<void, never, Deps>
      >();
      expectTypeOf<ReturnType<typeof race<Tasks>>>().toEqualTypeOf<
        Task<Value, never, Deps>
      >();
      expectTypeOf<ReturnType<typeof any<Tasks>>>().toEqualTypeOf<
        Task<Value, never, Deps>
      >();
    });

    test("InferTasksOk maps Task arrays and records to Ok values", () => {
      interface MyError {
        readonly type: "MyError";
      }

      type Tasks = readonly [Task<string>, Task<number, MyError>];
      interface TasksRecord {
        readonly name: Task<string>;
        readonly age: Task<number, MyError>;
      }

      expectTypeOf<InferTasksOk<Tasks>>().toEqualTypeOf<
        readonly [string, number]
      >();
      expectTypeOf<InferTasksOk<ReadonlyArray<Task<string>>>>().toEqualTypeOf<
        ReadonlyArray<string>
      >();
      expectTypeOf<
        InferTasksOk<NonEmptyReadonlyArray<Task<string>>>
      >().toEqualTypeOf<NonEmptyReadonlyArray<string>>();
      expectTypeOf<InferTasksOk<TasksRecord>>().toEqualTypeOf<{
        readonly name: string;
        readonly age: number;
      }>();
      expectTypeOf<InferTasksOk<{ readonly notTask: string }>>().toEqualTypeOf<{
        readonly notTask: never;
      }>();
    });

    describe("all", () => {
      describe("returns", () => {
        test("tuple values", () => {
          const name: Task<string> = () => ok("Ada");
          const age: Task<number> = () => ok(37);
          const active: Task<boolean> = () => ok(true);
          const task = all([name, age, active]);

          expectTypeOf(task).toEqualTypeOf<
            Task<readonly [string, number, boolean]>
          >();
        });

        test("error union", () => {
          const firstError = { type: "FirstError" } as const;
          const secondError = { type: "SecondError" } as const;
          const first: Task<string, typeof firstError> = () => err(firstError);
          const second: Task<string, typeof secondError> = () =>
            err(secondError);
          const task = all([first, second]);

          expectTypeOf(task).toEqualTypeOf<
            Task<
              readonly [string, string],
              typeof firstError | typeof secondError
            >
          >();
        });

        test("record dependency intersection", () => {
          const name: Task<string, never, DbDep> = ({ deps }) =>
            ok(deps.db.query("name"));
          const userId: Task<string, never, SessionDep> = ({ deps }) =>
            ok(deps.session.userId);
          const task = all({ name, userId });

          expectTypeOf(task).toEqualTypeOf<
            Task<
              { readonly name: string; readonly userId: string },
              never,
              DbDep & SessionDep
            >
          >();
        });
      });

      describe("accepts", () => {
        test("an empty array", () => {
          const tasks: ReadonlyArray<Task<string>> = emptyArray;
          const task = all(tasks);

          expectTypeOf(task).toEqualTypeOf<Task<ReadonlyArray<string>>>();
        });

        test("an array", () => {
          const tasks: ReadonlyArray<Task<string>> = [
            () => ok("Ada"),
            () => ok("Grace"),
          ];
          const task = all(tasks);

          expectTypeOf(task).toEqualTypeOf<Task<ReadonlyArray<string>>>();
        });

        test("a non-empty array", () => {
          const tasks: NonEmptyReadonlyArray<Task<string>> = [() => ok("Ada")];
          const task = all(tasks);

          expectTypeOf(task).toEqualTypeOf<
            Task<NonEmptyReadonlyArray<string>>
          >();
        });

        test("an empty tuple", () => {
          const task = all([]);

          expectTypeOf(task).toEqualTypeOf<Task<readonly []>>();
        });

        test("a tuple", () => {
          const task = all([() => ok("Ada"), () => ok(37)]);

          expectTypeOf(task).toEqualTypeOf<Task<readonly [string, number]>>();
        });

        test("an empty record", () => {
          const task = all({});

          expectTypeOf(task).toEqualTypeOf<Task<Record<never, never>>>();
        });

        test("a record", () => {
          const name: Task<string> = () => ok("Ada");
          const age: Task<number> = () => ok(37);
          const active: Task<boolean> = () => ok(true);
          const task = all({ name, age, active });

          expectTypeOf(task).toEqualTypeOf<
            Task<{
              readonly name: string;
              readonly age: number;
              readonly active: boolean;
            }>
          >();
        });
      });
    });

    test("InferTasksSettled maps Task arrays and records to Results", () => {
      interface MyError {
        readonly type: "MyError";
      }

      type Tasks = readonly [Task<string>, Task<number, MyError>];
      interface TasksRecord {
        readonly name: Task<string>;
        readonly age: Task<number, MyError>;
      }

      expectTypeOf<InferTasksSettled<Tasks>>().toEqualTypeOf<
        readonly [Result<string, never>, Result<number, MyError>]
      >();
      expectTypeOf<InferTasksSettled<TasksRecord>>().toEqualTypeOf<{
        readonly name: Result<string, never>;
        readonly age: Result<number, MyError>;
      }>();
    });

    describe("allSettled", () => {
      describe("returns", () => {
        test("result tuple", () => {
          const taskError = { type: "TaskError" } as const;
          const name: Task<string> = () => ok("Ada");
          const age: Task<number, typeof taskError> = () => err(taskError);
          const active: Task<boolean> = () => ok(true);
          const task = allSettled([name, age, active]);

          expectTypeOf(task).toEqualTypeOf<
            Task<
              readonly [
                Result<string, never>,
                Result<number, typeof taskError>,
                Result<boolean, never>,
              ]
            >
          >();
        });

        test("record dependency intersection", () => {
          const name: Task<string, never, DbDep> = ({ deps }) =>
            ok(deps.db.query("name"));
          const userId: Task<string, never, SessionDep> = ({ deps }) =>
            ok(deps.session.userId);
          const task = allSettled({ name, userId });

          expectTypeOf(task).toEqualTypeOf<
            Task<
              {
                readonly name: Result<string, never>;
                readonly userId: Result<string, never>;
              },
              never,
              DbDep & SessionDep
            >
          >();
        });
      });

      describe("accepts", () => {
        test("an empty array", () => {
          const tasks: ReadonlyArray<Task<string>> = emptyArray;
          const task = allSettled(tasks);

          expectTypeOf(task).toEqualTypeOf<
            Task<ReadonlyArray<Result<string, never>>>
          >();
        });

        test("an array", () => {
          const taskError = { type: "TaskError" } as const;
          const tasks: ReadonlyArray<Task<string, typeof taskError>> = [
            () => ok("Ada"),
            () => err(taskError),
          ];
          const task = allSettled(tasks);

          expectTypeOf(task).toEqualTypeOf<
            Task<ReadonlyArray<Result<string, typeof taskError>>>
          >();
        });

        test("a non-empty array", () => {
          const taskError = { type: "TaskError" } as const;
          const tasks: NonEmptyReadonlyArray<Task<string, typeof taskError>> = [
            () => err(taskError),
          ];
          const task = allSettled(tasks);

          expectTypeOf(task).toEqualTypeOf<
            Task<NonEmptyReadonlyArray<Result<string, typeof taskError>>>
          >();
        });

        test("an empty tuple", () => {
          const task = allSettled([]);

          expectTypeOf(task).toEqualTypeOf<Task<readonly []>>();
        });

        test("a tuple", () => {
          const taskError = { type: "TaskError" } as const;
          const name: Task<string> = () => ok("Ada");
          const age: Task<number, typeof taskError> = () => err(taskError);
          const task = allSettled([name, age]);

          expectTypeOf(task).toEqualTypeOf<
            Task<
              readonly [Result<string, never>, Result<number, typeof taskError>]
            >
          >();
        });

        test("an empty record", () => {
          const task = allSettled({});

          expectTypeOf(task).toEqualTypeOf<Task<Record<never, never>>>();
        });

        test("a record", () => {
          const taskError = { type: "TaskError" } as const;
          const name: Task<string> = () => ok("Ada");
          const age: Task<number, typeof taskError> = () => err(taskError);
          const active: Task<boolean> = () => ok(true);
          const task = allSettled({ name, age, active });

          expectTypeOf(task).toEqualTypeOf<
            Task<{
              readonly name: Result<string, never>;
              readonly age: Result<number, typeof taskError>;
              readonly active: Result<boolean, never>;
            }>
          >();
        });
      });
    });

    test("InferMapOk maps input arrays and records to mapped Task Ok values", () => {
      interface MyError {
        readonly type: "MyError";
      }

      type MappingTask = Task<number, MyError, DbDep>;

      expectTypeOf<
        InferMapOk<readonly [string, boolean], MappingTask>
      >().toEqualTypeOf<readonly [number, number]>();
      expectTypeOf<
        InferMapOk<ReadonlyArray<string>, MappingTask>
      >().toEqualTypeOf<ReadonlyArray<number>>();
      expectTypeOf<
        InferMapOk<{ readonly a: string; readonly b: boolean }, MappingTask>
      >().toEqualTypeOf<{ readonly a: number; readonly b: number }>();
    });

    describe("map", () => {
      describe("returns", () => {
        test("mapped tuple values", () => {
          interface Deps {
            readonly prefix: string;
          }
          interface TaskError {
            readonly type: "TaskError";
          }

          const task = map(
            [1, 2, 3],
            (value): Task<string, TaskError, Deps> =>
              (run) =>
                ok(`${run.deps.prefix}${value}`),
          );

          expectTypeOf(task).toEqualTypeOf<
            Task<readonly [string, string, string], TaskError, Deps>
          >();
        });

        test("error union", () => {
          const taskError = { type: "TaskError" } as const;
          const task = map(
            [1, 2],
            (value): Task<string, typeof taskError> =>
              () =>
                value === 1 ? err(taskError) : ok(String(value)),
          );

          expectTypeOf(task).toEqualTypeOf<
            Task<readonly [string, string], typeof taskError>
          >();
        });
      });

      describe("accepts", () => {
        test("an empty array", () => {
          const values: ReadonlyArray<number> = emptyArray;
          const task = map(values, (value) => () => ok(String(value)));

          expectTypeOf(task).toEqualTypeOf<Task<ReadonlyArray<string>>>();
        });

        test("an array", () => {
          const values: ReadonlyArray<number> = [1, 2];
          const task = map(values, (value) => () => ok(String(value)));

          expectTypeOf(task).toEqualTypeOf<Task<ReadonlyArray<string>>>();
        });

        test("an array mapper with indexes", () => {
          const values = ["Ada", "Grace"] as const;
          const task = map(values, (value, index) => {
            expectTypeOf(value).toEqualTypeOf<"Ada" | "Grace">();
            expectTypeOf(index).toEqualTypeOf<number>();
            return () => ok(`${index}:${value}`);
          });

          expectTypeOf(task).toEqualTypeOf<Task<readonly [string, string]>>();
        });

        test("a non-empty array", () => {
          const values: NonEmptyReadonlyArray<number> = [1];
          const task = map(values, (value) => () => ok(String(value)));

          expectTypeOf(task).toEqualTypeOf<
            Task<NonEmptyReadonlyArray<string>>
          >();
        });

        test("an empty tuple", () => {
          const task = map([], () => () => ok("unused"));

          expectTypeOf(task).toEqualTypeOf<Task<readonly []>>();
        });

        test("a tuple", () => {
          const task = map(["Ada", 37], (value) => () => ok(String(value)));

          expectTypeOf(task).toEqualTypeOf<Task<readonly [string, string]>>();
        });

        test("an empty record", () => {
          const task = map({}, () => () => ok("unused"));

          expectTypeOf(task).toEqualTypeOf<Task<Record<never, never>>>();
        });

        test("a record", () => {
          const task = map(
            { name: "Ada", age: 37, active: true },
            (value) => () => ok(String(value)),
          );

          expectTypeOf(task).toEqualTypeOf<
            Task<{
              readonly name: string;
              readonly age: string;
              readonly active: string;
            }>
          >();
        });

        test("a record mapper with keys", () => {
          const values = { name: "Ada", age: 37 } as const;
          const task = map(values, (value, key) => {
            expectTypeOf(value).toEqualTypeOf<"Ada" | 37>();
            expectTypeOf(key).toEqualTypeOf<"name" | "age">();
            return () => ok(`${key}:${value}`);
          });

          expectTypeOf(task).toEqualTypeOf<
            Task<{ readonly name: string; readonly age: string }>
          >();
        });
      });
    });

    test("InferMapSettled maps input arrays and records to mapped Task Results", () => {
      interface MyError {
        readonly type: "MyError";
      }

      type MappingTask = Task<number, MyError, DbDep>;

      expectTypeOf<
        InferMapSettled<readonly [string, boolean], MappingTask>
      >().toEqualTypeOf<
        readonly [Result<number, MyError>, Result<number, MyError>]
      >();
      expectTypeOf<
        InferMapSettled<
          { readonly a: string; readonly b: boolean },
          MappingTask
        >
      >().toEqualTypeOf<{
        readonly a: Result<number, MyError>;
        readonly b: Result<number, MyError>;
      }>();
    });

    describe("mapSettled", () => {
      describe("returns", () => {
        test("result tuple", () => {
          const taskError = { type: "TaskError" } as const;
          const task = mapSettled([1, 2, 3], (value) =>
            value === 2 ? () => err(taskError) : () => ok(String(value)),
          );

          expectTypeOf(task).toEqualTypeOf<
            Task<
              readonly [
                Result<string, typeof taskError>,
                Result<string, typeof taskError>,
                Result<string, typeof taskError>,
              ]
            >
          >();
        });

        test("mapped Task dependencies", () => {
          const task = mapSettled(
            [1, 2],
            (value): Task<string, never, DbDep> =>
              ({ deps }) =>
                ok(deps.db.query(String(value))),
          );

          expectTypeOf(task).toEqualTypeOf<
            Task<
              readonly [Result<string, never>, Result<string, never>],
              never,
              DbDep
            >
          >();
        });
      });

      describe("accepts", () => {
        test("an empty array", () => {
          const values: ReadonlyArray<number> = emptyArray;
          const task = mapSettled(values, (value) => () => ok(String(value)));

          expectTypeOf(task).toEqualTypeOf<
            Task<ReadonlyArray<Result<string, never>>>
          >();
        });

        test("an array", () => {
          const taskError = { type: "TaskError" } as const;
          const values: ReadonlyArray<number> = [1, 2];
          const task = mapSettled(
            values,
            (value): Task<string, typeof taskError> =>
              value === 1 ? () => ok(String(value)) : () => err(taskError),
          );

          expectTypeOf(task).toEqualTypeOf<
            Task<ReadonlyArray<Result<string, typeof taskError>>>
          >();
        });

        test("an array mapper with indexes", () => {
          const task = mapSettled(["Ada", "Grace"] as const, (value, index) => {
            expectTypeOf(value).toEqualTypeOf<"Ada" | "Grace">();
            expectTypeOf(index).toEqualTypeOf<number>();
            return () => ok(`${index}:${value}`);
          });

          expectTypeOf(task).toEqualTypeOf<
            Task<readonly [Result<string, never>, Result<string, never>]>
          >();
        });

        test("a non-empty array", () => {
          const taskError = { type: "TaskError" } as const;
          const values: NonEmptyReadonlyArray<number> = [1];
          const task = mapSettled(
            values,
            (): Task<string, typeof taskError> => () => err(taskError),
          );

          expectTypeOf(task).toEqualTypeOf<
            Task<NonEmptyReadonlyArray<Result<string, typeof taskError>>>
          >();
        });

        test("an empty tuple", () => {
          const task = mapSettled([], () => () => ok("unused"));

          expectTypeOf(task).toEqualTypeOf<Task<readonly []>>();
        });

        test("a tuple", () => {
          const task = mapSettled(
            ["Ada", 37],
            (value) => () => ok(String(value)),
          );

          expectTypeOf(task).toEqualTypeOf<
            Task<readonly [Result<string, never>, Result<string, never>]>
          >();
        });

        test("an empty record", () => {
          const task = mapSettled({}, () => () => ok("unused"));

          expectTypeOf(task).toEqualTypeOf<Task<Record<never, never>>>();
        });

        test("a record", () => {
          const task = mapSettled(
            { name: "Ada", age: 37, active: true },
            (value) => () => ok(String(value)),
          );

          expectTypeOf(task).toEqualTypeOf<
            Task<{
              readonly name: Result<string, never>;
              readonly age: Result<string, never>;
              readonly active: Result<string, never>;
            }>
          >();
        });

        test("a record mapper with keys", () => {
          const values = { name: "Ada", age: 37 } as const;
          const task = mapSettled(values, (value, key) => {
            expectTypeOf(value).toEqualTypeOf<"Ada" | 37>();
            expectTypeOf(key).toEqualTypeOf<"name" | "age">();
            return () => ok(`${key}:${value}`);
          });

          expectTypeOf(task).toEqualTypeOf<
            Task<{
              readonly name: Result<string, never>;
              readonly age: Result<string, never>;
            }>
          >();
        });
      });
    });
  });
});

describe("callback", () => {
  test("resolve accepts ok Result", async () => {
    await using run = createRun();

    const task = callback<string>(({ resolve }) => {
      resolve(ok("hello"));
    });

    expect(await run(task)).toEqual(ok("hello"));
  });

  test("resolve accepts err Result", async () => {
    await using run = createRun();
    const myError = { type: "MyError" } as const;

    const task = callback<string, typeof myError>(({ resolve }) => {
      resolve(err(myError));
    });

    expect(await run(task)).toEqual(err(myError));
  });

  test("reject panics the Run tree", async () => {
    await using run = testCreateRun();
    const defect = new Error("boom");

    const task = callback<string>(({ reject }) => {
      reject(defect);
    });

    await expect(run(task)).rejects.toEqual(panic(defect));

    const panicAbortError: unknown = run.signal.reason;
    assert(AbortError.is(panicAbortError));
    expect(panicAbortError.reason).toEqual({
      type: "PanicAbortReason",
      defect,
    });
    expect(await run.deps.reportDefect.next()).toBe(panicAbortError);
  });

  test("setup defect panics the Run tree", async () => {
    await using run = testCreateRun();
    const defect = new Error("boom");

    const task = callback<string>(() => {
      throw defect;
    });

    await expect(run(task)).rejects.toEqual(panic(defect));

    const panicAbortError: unknown = run.signal.reason;
    assert(AbortError.is(panicAbortError));
    expect(panicAbortError.reason).toEqual({
      type: "PanicAbortReason",
      defect,
    });
    expect(await run.deps.reportDefect.next()).toBe(panicAbortError);
  });

  test("setup defect after resolve still panics the Run tree", async () => {
    await using run = testCreateRun();
    const defect = new Error("boom");

    const task = callback<string>(({ resolve }) => {
      resolve(ok("hello"));
      throw defect;
    });

    await expect(run(task)).rejects.toEqual(panic(defect));
    expect(run.signal.reason).toEqual(panic(defect));
    expect(run.deps.reportDefect.getDefectsSnapshot()).toEqual([panic(defect)]);
  });

  test("releases partially acquired resources when setup defects", async () => {
    await using run = testCreateRun();
    const defect = new Error("setup failed");
    const cleanupLog: Array<string> = [];

    const task = callback<void>(() => {
      using disposer = new DisposableStack();

      cleanupLog.push("acquire first");
      disposer.defer(() => cleanupLog.push("release first"));

      cleanupLog.push("acquire second");
      disposer.defer(() => cleanupLog.push("release second"));

      throw defect;
    });

    await expect(run(task)).rejects.toEqual(panic(defect));
    expect(cleanupLog).toEqual([
      "acquire first",
      "acquire second",
      "release second",
      "release first",
    ]);
  });

  test("callback receives current Run signal", async () => {
    await using run = createRun();
    let callbackSignal: AbortSignal | undefined;

    const task = callback<string>(({ run, resolve }) => {
      callbackSignal = run.signal;
      resolve(ok("hello"));
    });

    const fiber = run(task);

    expect(await fiber).toEqual(ok("hello"));
    expect(callbackSignal).toBe(fiber.run.signal);
  });

  test("callback receives current Run deps", async () => {
    await using run = createRun(dbDep);
    let callbackDb: Db | undefined;

    const task = callback<string, never, DbDep>(({ run, resolve }) => {
      callbackDb = run.deps.db;
      resolve(ok("hello"));
    });

    expect(await run(task)).toEqual(ok("hello"));
    expect(callbackDb).toBe(dbDep.db);
  });

  test("runs cleanup after resolving", async () => {
    await using run = createRun();
    let cleanupCalled = false;

    const task = callback<string>(({ resolve }) => {
      resolve(ok("hello"));
      return () => {
        cleanupCalled = true;
      };
    });

    const fiber = run(task);

    expect(cleanupCalled).toBe(false);
    expect(await fiber).toEqual(ok("hello"));
    expect(cleanupCalled).toBe(true);
  });

  test("runs cleanup when aborted", async () => {
    await using run = createRun();
    let cleanupCalled = false;

    const task = callback<void>(() => () => {
      cleanupCalled = true;
    });

    const fiber = run.abortable(task);

    fiber.abort(testAbortReason);

    expect(cleanupCalled).toBe(true);
    expect(await fiber).toEqual(err(testAbortError));
  });

  test("abort settles a callback Task that never resolves", async () => {
    await using run = createRun();

    const task = callback<void>(() => undefined);

    const fiber = run.abortable(task);

    fiber.abort(testAbortReason);

    expect(await fiber).toEqual(err(testAbortError));
  });

  test("runs cleanup when called with an already-aborted Run", async () => {
    await using run = createRun();
    const continueParent = Promise.withResolvers<void>();
    let cleanupCalled = false;

    const task = callback<void>(() => () => {
      cleanupCalled = true;
    });

    const fiber = run.abortable(async (run) => {
      await continueParent.promise;
      // eslint-disable-next-line evolu/no-direct-task-call -- Exercise abort during direct Task execution.
      return await task(run);
    });

    fiber.abort(testAbortReason);
    continueParent.resolve();

    expect(await fiber).toEqual(err(testAbortError));
    expect(cleanupCalled).toBe(true);
  });

  test("aborts when Run aborts during callback setup", async () => {
    const run = createRun();
    let resolveCallback: (() => void) | undefined;
    let cleanupCalled = false;

    try {
      const fiber = run.abortable(
        callback<void>(({ resolve }) => {
          resolveCallback = () => resolve(ok());
          void run[Symbol.asyncDispose]();
          return () => {
            cleanupCalled = true;
          };
        }),
      );
      const abortError = run.signal.reason;
      expect(abortError).toEqual({
        type: "AbortError",
        reason: runDisposedAbortReason,
      });

      resolveCallback?.();

      expect(cleanupCalled).toBe(true);
      expect(await fiber).toEqual(err(abortError));
    } finally {
      resolveCallback?.();
      await run[Symbol.asyncDispose]();
    }
  });

  test("keeps callback result when aborted after resolving", async () => {
    await using run = createRun();

    const task = callback<string>(({ resolve }) => {
      resolve(ok("hello"));
    });

    const fiber = run.abortable(task);

    fiber.abort(testAbortReason);

    expect(await fiber).toEqual(ok("hello"));
  });

  test("preserves abort and reports panic abort when cleanup defects", async () => {
    await using run = testCreateRun();
    const cleanupError = new Error("cleanup failed");
    const panicAbortError = createAbortError({
      type: "PanicAbortReason",
      defect: cleanupError,
    });

    const task = callback<void>(() => () => {
      throw cleanupError;
    });

    const result = await run(
      expectReportedDefectOnly(panicAbortError, async (run) => {
        const fiber = run.abortable(task);

        fiber.abort(testAbortReason);

        expect(await fiber).toEqual(err(testAbortError));

        return ok();
      }),
    );

    expectOk(result, undefined);
  });
});

describe("sleep", () => {
  test("requires a positive duration", () => {
    sleep("1ms");
    // @ts-expect-error - Zero Millis is not a positive duration.
    sleep(0 as Millis);
  });

  test("completes after duration", async () => {
    await using run = testCreateRun();

    const fiber = run(sleep("100ms"));

    run.deps.time.advance("100ms");

    expect(await fiber).toEqual(ok());
  });

  test("clears timeout when aborted", async () => {
    const timeoutId = 1 as unknown as ReturnType<Time["setTimeout"]>;
    let clearedTimeoutId: ReturnType<Time["setTimeout"]> | undefined;
    function now(): Millis;
    function now(type: "DateIso"): DateIso;
    function now(type?: "DateIso"): Millis | DateIso {
      return type === "DateIso"
        ? ("1970-01-01T00:00:00.000Z" as DateIso)
        : (0 as Millis);
    }
    const time: Time = {
      now,
      performance: {
        timeOrigin: 0 as Time["performance"]["timeOrigin"],
        now: () => 0 as ReturnType<Time["performance"]["now"]>,
      },
      setTimeout: () => timeoutId,
      clearTimeout: (id) => {
        clearedTimeoutId = id;
      },
    };
    await using run = createRun({ time });

    const fiber = run.abortable(sleep("100ms"));

    fiber.abort(testAbortReason);

    expect(await fiber).toEqual(err(testAbortError));
    expect(clearedTimeoutId).toBe(timeoutId);
  });
});

describe("timeout", () => {
  test("requires a positive duration", () => {
    const task: Task<void> = () => ok();

    timeout(task, "1ms");
    // @ts-expect-error - Zero Millis is not a positive duration.
    timeout(task, 0 as Millis);
  });

  test("returns the Task Result when it settles within the duration", async () => {
    await using run = testCreateRun();

    const task: Task<string> = async (run) => {
      await run(sleep("50ms"));
      return ok("value");
    };

    const fiber = run(timeout(task, "100ms"));

    run.deps.time.advance("50ms");

    expect(await fiber).toEqual(ok("value"));
  });

  test("returns TimeoutError when the duration elapses first", async () => {
    await using run = testCreateRun();

    const task: Task<string> = async (run) => {
      await run(sleep("100ms"));
      return ok("value");
    };

    const fiber = run(timeout(task, "50ms"));

    run.deps.time.advance("50ms");

    expect(await fiber).toEqual(err(timeoutError));
  });

  test("waits for the losing Task to settle", async () => {
    await using run = testCreateRun();
    const completeTask = Promise.withResolvers<void>();
    const taskAborted = Promise.withResolvers<void>();
    let taskSettled = false;

    const task: Task<string> = async (run) => {
      using _ = run.onAbort(() => {
        taskAborted.resolve();
      });
      await completeTask.promise;
      taskSettled = true;
      return ok("value");
    };

    const timeoutFiber = run(timeout(task, "50ms"));
    let timeoutFiberSettled = false;
    void timeoutFiber.then(() => {
      timeoutFiberSettled = true;
    });

    run.deps.time.advance("50ms");

    try {
      await taskAborted.promise;
      expect(timeoutFiberSettled).toBe(false);
      expect(timeoutFiber.run.getState()).toEqual({ type: "Running" });

      const snapshot = timeoutFiber.run.snapshot();
      expect(snapshot.state).toEqual({ type: "Running" });

      const childSnapshot = snapshot.children[0];
      assert(childSnapshot);
      assert(childSnapshot.state.type === "Aborted");
      const abortReason = childSnapshot.state.abort.request;
      expect(abortReason).toBe(runDisposedAbortReason);
      expect(childSnapshot.state.abort.observed).toBe(abortReason);

      const grandchildSnapshot = childSnapshot.children[0];
      assert(grandchildSnapshot);
      assert(grandchildSnapshot.state.type === "Aborted");
      expect(grandchildSnapshot.state.abort.request).toBe(abortReason);
      expect(grandchildSnapshot.state.abort.observed).toBe(abortReason);
    } finally {
      completeTask.resolve();
    }

    expect(await timeoutFiber).toEqual(err(timeoutError));
    expect(taskSettled).toBe(true);
  });
});

describe("retry", () => {
  test("returns Ok from the first attempt", async () => {
    await using run = createRun();

    interface MyError {
      readonly type: "MyError";
    }

    const step = vi.fn((_: MyError) => ok([1, 1 as Millis] as const));
    const schedule: Schedule<number, MyError> = () => step;

    let attempts = 0;
    const task: Task<void, MyError> = () => {
      attempts += 1;
      return ok();
    };

    const result = await run(retry(task, schedule));

    expectOk(result, undefined);
    expect(attempts).toBe(1);
    expect(step).not.toHaveBeenCalled();
  });

  test("retries errors until the Task returns Ok", async () => {
    await using run = createRun();

    interface MyError {
      readonly type: "MyError";
    }

    let attempts = 0;
    const task: Task<void, MyError> = () => {
      attempts += 1;
      if (attempts < 3) return err({ type: "MyError" });
      return ok();
    };

    const result = await run(retry(task, take(3)(spaced("1ms"))));

    expectOk(result, undefined);
    expect(attempts).toBe(3);
  });

  test("returns RetryError when the schedule is exhausted", async () => {
    await using run = createRun();

    interface MyError {
      readonly type: "MyError";
    }

    let attempts = 0;
    const task: Task<void, MyError> = () => {
      attempts += 1;
      return err({ type: "MyError" });
    };

    const result = await run(retry(task, take(2)(spaced("1ms"))));

    expectErr(result, {
      type: "RetryError",
      lastError: { type: "MyError" },
      attempts: PositiveInt.orThrow(3),
    });
    expect(attempts).toBe(3);
  });

  test("calls onRetry before each retry", async () => {
    await using run = createRun();

    interface MyError {
      readonly type: "MyError";
    }

    const retryLog: Array<unknown> = [];
    let attempts = 0;
    const task: Task<void, MyError> = () => {
      attempts += 1;
      if (attempts < 3) return err({ type: "MyError" });
      return ok();
    };

    await run(
      retry(task, take(3)(spaced("1ms")), {
        onRetry: ({ error, attempt, output, delay }) =>
          retryLog.push({ error, attempt, output, delay }),
      }),
    );

    expect(retryLog).toEqual([
      {
        error: { type: "MyError" },
        attempt: onePositiveInt,
        output: 1,
        delay: 1,
      },
      {
        error: { type: "MyError" },
        attempt: PositiveInt.orThrow(2),
        output: 1,
        delay: 1,
      },
    ]);
  });

  test("stops when shouldRetry returns false", async () => {
    await using run = createRun();

    interface RetryableError {
      readonly type: "RetryableError";
    }

    interface NonRetryableError {
      readonly type: "NonRetryableError";
    }

    let attempts = 0;
    const task: Task<void, RetryableError | NonRetryableError> = () => {
      attempts += 1;
      if (attempts === 1) return err({ type: "RetryableError" });
      return err({ type: "NonRetryableError" });
    };

    const result = await run(
      retry(task, take(3)(spaced("1ms")), {
        shouldRetry: (error) => error.type === "RetryableError",
      }),
    );

    expectErr(result, {
      type: "RetryError",
      lastError: { type: "NonRetryableError" },
      attempts: PositiveInt.orThrow(2),
    });
    expect(attempts).toBe(2);
  });

  test("stops when shouldRetry returns false on the first error", async () => {
    await using run = createRun();

    interface MyError {
      readonly type: "MyError";
    }

    let attempts = 0;
    const task: Task<void, MyError> = () => {
      attempts += 1;
      return err({ type: "MyError" });
    };

    const result = await run(
      retry(task, take(3)(spaced("1ms")), { shouldRetry: () => false }),
    );

    expectErr(result, {
      type: "RetryError",
      lastError: { type: "MyError" },
      attempts: onePositiveInt,
    });
    expect(attempts).toBe(1);
  });

  test("stops when the Task aborts", async () => {
    await using run = createRun();

    interface MyError {
      readonly type: "MyError";
    }

    let attempts = 0;
    const task: Task<void, MyError> = async (run) => {
      attempts += 1;
      await run(sleep("1h"));
      return ok();
    };

    const fiber = run.abortable(retry(task, take(3)(spaced("1ms"))));
    fiber.abort(testAbortReason);

    expect(await fiber).toEqual(err(testAbortError));
    expect(attempts).toBe(1);
  });

  test("passes through AbortError results without retrying", async () => {
    await using run = createRun();

    interface MyError {
      readonly type: "MyError";
    }

    const abortError = createAbortError({ type: "TestAbort" });
    const step = vi.fn((_: MyError) => ok([1, 1 as Millis] as const));
    const schedule: Schedule<number, MyError> = () => step;
    const onRetry = vi.fn();

    let attempts = 0;
    const task: Task<void, MyError | AbortError> = () => {
      attempts += 1;
      return err(abortError);
    };

    const result = await run(retry(task, schedule, { onRetry }));

    expectErr(result, abortError);
    expect(attempts).toBe(1);
    expect(step).not.toHaveBeenCalled();
    expect(onRetry).not.toHaveBeenCalled();
  });

  test("aborts during retry sleep without starting another attempt", async () => {
    await using run = testCreateRun();

    interface MyError {
      readonly type: "MyError";
    }

    const retryStarted = Promise.withResolvers<void>();
    const onRetry = vi.fn(() => {
      retryStarted.resolve();
    });

    let attempts = 0;
    const task: Task<void, MyError> = () => {
      attempts += 1;
      return err({ type: "MyError" });
    };

    const fiber = run.abortable(
      retry(task, take(3)(spaced("1h")), { onRetry }),
    );

    await retryStarted.promise;
    expect(onRetry).toHaveBeenCalledTimes(1);

    fiber.abort(testAbortReason);

    expect(await fiber).toEqual(err(testAbortError));
    expect(attempts).toBe(1);
  });

  test("rejects panic abort without retrying and reports panic abort", async () => {
    await using run = testCreateRun();
    const error = new Error("boom");
    const onRetry = vi.fn();

    let attempts = 0;
    const task: Task<void> = () => {
      attempts += 1;
      throw error;
    };

    await expect(
      run(retry(task, take(3)(spaced("1ms")), { onRetry })),
    ).rejects.toEqual(panic(error));

    expect(attempts).toBe(1);
    expect(onRetry).not.toHaveBeenCalled();
    expect(await run.deps.reportDefect.next()).toEqual(panic(error));
  });

  describe("types", () => {
    test("RetryTaskError wraps domain errors and preserves AbortError", () => {
      interface MyError {
        readonly type: "MyError";
      }

      expectTypeOf<RetryTaskError<MyError>>().toEqualTypeOf<
        RetryError<MyError>
      >();
      expectTypeOf<RetryTaskError<MyError | AbortError>>().toEqualTypeOf<
        RetryError<MyError> | AbortError
      >();
      expectTypeOf<RetryTaskError<MyError | TimeoutError>>().toEqualTypeOf<
        RetryError<MyError | TimeoutError>
      >();
      expectTypeOf<RetryTaskError<AbortError>>().toEqualTypeOf<AbortError>();
      expectTypeOf<RetryTaskError<never>>().toEqualTypeOf<never>();
    });

    test("keeps AbortError outside RetryError", () => {
      interface MyError {
        readonly type: "MyError";
      }

      const task: Task<string, MyError, DbDep> = () => ok("done");

      // daemon(task) can return AbortError as a Result error. retry should
      // keep cancellation as AbortError, not report it as retry exhaustion.
      const retried = retry(daemon(task), take(3)(spaced("1ms")));

      expectTypeOf(retried).toEqualTypeOf<
        Task<string, RetryError<MyError> | AbortError, DbDep>
      >();
    });

    test("does not add RetryError without domain errors", () => {
      const task: Task<string> = () => ok("done");
      const abortTask: Task<string, AbortError> = () => ok("done");

      expectTypeOf(retry(task, take(3)(spaced("1ms")))).toEqualTypeOf<
        Task<string>
      >();
      expectTypeOf(retry(abortTask, take(3)(spaced("1ms")))).toEqualTypeOf<
        Task<string, AbortError>
      >();
    });
  });
});

describe("repeat", () => {
  test("runs a Task n + 1 times with take(n)", async () => {
    await using run = createRun();

    let count = 0;
    const task: Task<number> = () => {
      count += 1;
      return ok(count);
    };

    const result = await run(repeat(task, take(3)(spaced("1ms"))));

    expectOk(result, 4);
    expect(count).toBe(4);
  });

  test("returns last successful value when schedule is exhausted", async () => {
    await using run = createRun();

    const values = ["first", "second", "third", "fourth"];
    let index = 0;
    const task: Task<string> = () => ok(values[index++]);

    const result = await run(repeat(task, take(3)(fixed("1ms"))));

    expectOk(result, "fourth");
  });

  test("stops when the Task returns Err", async () => {
    await using run = createRun();

    interface MyError {
      readonly type: "MyError";
    }

    let count = 0;
    const task: Task<number, MyError> = () => {
      count += 1;
      return err({ type: "MyError" });
    };
    const onRepeat = vi.fn();
    const step = vi.fn((_: number) => ok([1, 1 as Millis] as const));
    const schedule: Schedule<number, number> = () => step;

    const result = await run(repeat(task, schedule, { onRepeat }));

    expectErr(result, { type: "MyError" });
    expect(count).toBe(1);
    expect(step).not.toHaveBeenCalled();
    expect(onRepeat).not.toHaveBeenCalled();
  });

  test("stops when shouldRepeat returns false", async () => {
    await using run = createRun();

    let count = 0;
    const task: Task<number> = () => {
      count += 1;
      return ok(count);
    };
    const step = vi.fn((_: number) => ok([1, 1 as Millis] as const));
    const schedule: Schedule<number, number> = () => step;

    const result = await run(
      repeat(task, schedule, { shouldRepeat: (value) => value < 1 }),
    );

    expectOk(result, 1);
    expect(count).toBe(1);
    expect(step).not.toHaveBeenCalled();
  });

  test("calls onRepeat before each repeat", async () => {
    await using run = createRun();

    const repeatLog: Array<unknown> = [];
    let count = 0;
    const task: Task<number> = () => {
      count += 1;
      return ok(count);
    };

    await run(
      repeat(task, take(2)(spaced(0 as Millis)), {
        onRepeat: ({ value, attempt, output, delay }) =>
          repeatLog.push({ value, attempt, output, delay }),
      }),
    );

    expect(repeatLog).toEqual([
      {
        value: 1,
        attempt: onePositiveInt,
        output: 0,
        delay: 0,
      },
      {
        value: 2,
        attempt: PositiveInt.orThrow(2),
        output: 0,
        delay: 0,
      },
    ]);
  });

  test("aborts during repeat sleep without starting another attempt", async () => {
    await using run = testCreateRun();

    const repeatStarted = Promise.withResolvers<void>();
    const onRepeat = vi.fn(() => {
      repeatStarted.resolve();
    });

    let count = 0;
    const task: Task<number> = () => {
      count += 1;
      return ok(count);
    };

    const fiber = run.abortable(
      repeat(task, take(3)(spaced("1h")), { onRepeat }),
    );

    await repeatStarted.promise;
    expect(onRepeat).toHaveBeenCalledTimes(1);

    fiber.abort(testAbortReason);

    expect(await fiber).toEqual(err(testAbortError));
    expect(count).toBe(1);
  });

  test("aborts while Task is running without scheduling a repeat", async () => {
    await using run = testCreateRun();

    const onRepeat = vi.fn();

    let count = 0;
    const task: Task<number> = async (run) => {
      count += 1;
      await run.ok(sleep("1h"));
      return ok(count);
    };

    const fiber = run.abortable(
      repeat(task, take(3)(spaced("1ms")), { onRepeat }),
    );

    expect(count).toBe(1);

    fiber.abort(testAbortReason);

    expect(await fiber).toEqual(err(testAbortError));
    expect(count).toBe(1);
    expect(onRepeat).not.toHaveBeenCalled();
  });

  test("rejects panic abort without repeating and reports panic abort", async () => {
    await using run = testCreateRun();
    const error = new Error("boom");
    const onRepeat = vi.fn();

    let count = 0;
    const task: Task<void> = () => {
      count += 1;
      throw error;
    };

    await expect(
      run(repeat(task, take(3)(spaced("1ms")), { onRepeat })),
    ).rejects.toEqual(panic(error));

    expect(count).toBe(1);
    expect(onRepeat).not.toHaveBeenCalled();
    expect(await run.deps.reportDefect.next()).toEqual(panic(error));
  });

  test("stops when NextTask returns Done", async () => {
    await using run = createRun();

    let count = 0;
    const next: NextTask<number> = () => {
      count += 1;
      if (count === 3) return err(done());
      return ok(count);
    };

    const result = await run(repeat(next, spaced(0 as Millis)));

    expectErr(result, done());
    expect(count).toBe(3);
  });

  describe("types", () => {
    test("preserves Task error and dependency types", () => {
      interface MyError {
        readonly type: "MyError";
      }

      const task: Task<string, MyError, DbDep> = () => ok("done");

      expectTypeOf(repeat(task, take(3)(spaced("1ms")))).toEqualTypeOf<
        Task<string, MyError, DbDep>
      >();
    });

    test("preserves Done from NextTask", () => {
      interface MyError {
        readonly type: "MyError";
      }

      const next: NextTask<string, MyError, "done", DbDep> = () => ok("done");

      expectTypeOf(repeat(next, spaced("1ms"))).toEqualTypeOf<
        Task<string, MyError | Done<"done">, DbDep>
      >();
    });
  });
});

describe("any", () => {
  test("infers result and dependency intersections", () => {
    interface FirstError {
      readonly type: "FirstError";
    }
    interface SecondError {
      readonly type: "SecondError";
    }

    const first: Task<string, FirstError, DbDep> = () => ok("first");
    const second: Task<number, SecondError, SessionDep> = () => ok(2);

    const task = any([first, second]);

    expectTypeOf(task).toEqualTypeOf<
      Task<string | number, FirstError | SecondError, DbDep & SessionDep>
    >();

    const assertAnyTypes = () => {
      // @ts-expect-error - any requires at least one Task.
      void any([]);
    };

    void assertAnyTypes;
  });

  test("returns first Ok result", async () => {
    await using run = createRun();
    const completeFast = Promise.withResolvers<void>();
    const fastError = { type: "FastError" } as const;

    const fast: Task<string, typeof fastError> = async () => {
      await completeFast.promise;
      return err(fastError);
    };
    const slow: Task<string, typeof fastError> = () => ok("slow");

    const resultPromise = run(any([fast, slow]));

    completeFast.resolve();

    expect(await resultPromise).toEqual(ok("slow"));
  });

  test("returns sync Ok after sync Err", async () => {
    await using run = createRun();
    const taskError = { type: "TaskError" } as const;

    const first: Task<string, typeof taskError> = () => err(taskError);
    const second: Task<string, typeof taskError> = () => ok("second");

    expect(await run(any([first, second]))).toEqual(ok("second"));
  });

  test("returns last Err result by input order when Errs settle out of order", async () => {
    await using run = createRun();
    const completeFirst = Promise.withResolvers<void>();
    const firstError = { type: "FirstError" } as const;
    const secondError = { type: "SecondError" } as const;

    const first: Task<
      string,
      typeof firstError | typeof secondError
    > = async () => {
      await completeFirst.promise;
      return err(firstError);
    };
    const second: Task<string, typeof firstError | typeof secondError> = () =>
      err(secondError);

    // With concurrency 2, second errs while first is still pending; the
    // earlier-index Err settling later must not replace the last Err.
    const resultPromise = run(concurrently(2, any([first, second])));

    completeFirst.resolve();

    expect(await resultPromise).toEqual(err(secondError));
  });

  test("returns last Err result by input order when run sequentially", async () => {
    await using run = createRun();
    const firstError = { type: "FirstError" } as const;
    const secondError = { type: "SecondError" } as const;
    const thirdError = { type: "ThirdError" } as const;
    const events: Array<string> = [];

    const first: Task<
      string,
      typeof firstError | typeof secondError | typeof thirdError
    > = () => {
      events.push("first");
      return err(firstError);
    };
    const second: Task<
      string,
      typeof firstError | typeof secondError | typeof thirdError
    > = () => {
      events.push("second");
      return err(secondError);
    };
    const third: Task<
      string,
      typeof firstError | typeof secondError | typeof thirdError
    > = () => {
      events.push("third");
      return err(thirdError);
    };

    expect(await run(concurrently(1, any([first, second, third])))).toEqual(
      err(thirdError),
    );
    expect(events).toEqual(["first", "second", "third"]);
  });

  test("uses inherited concurrency", async () => {
    await using run = createRun();
    const completeTasks = Promise.withResolvers<void>();
    const taskError = { type: "TaskError" } as const;
    const events: Array<string> = [];

    const createTask =
      (id: number): Task<string, typeof taskError> =>
      async () => {
        events.push(`start ${id}`);
        await completeTasks.promise;
        events.push(`end ${id}`);
        return id === 3 ? ok("third") : err(taskError);
      };

    const fiber = run(
      concurrently(2, any([createTask(1), createTask(2), createTask(3)])),
    );

    try {
      expect(events).toEqual(["start 1", "start 2"]);

      completeTasks.resolve();

      expect(await fiber).toEqual(ok("third"));
    } finally {
      completeTasks.resolve();
    }
  });

  test("waits for aborted losers to settle", async () => {
    await using run = createRun();
    const completeSlow = Promise.withResolvers<void>();
    const slowAborted = Promise.withResolvers<unknown>();
    let slowSettled = false;

    const slow: Task<string> = async (run) => {
      using _ = run.onAbort((abortError) => {
        slowAborted.resolve(abortError.reason);
      });
      await completeSlow.promise;
      slowSettled = true;
      return ok("slow");
    };
    const fast: Task<string> = () => ok("fast");

    const anyFiber = run(concurrently(2, any([slow, fast])));
    let anyFiberSettled = false;
    void anyFiber.then(() => {
      anyFiberSettled = true;
    });

    try {
      expect(await slowAborted.promise).toBe(runDisposedAbortReason);
      expect(anyFiberSettled).toBe(false);

      const snapshot = anyFiber.run.snapshot();
      expect(snapshot.state).toEqual({ type: "Running" });

      const childSnapshot = snapshot.children[0];
      assert(childSnapshot);
      assert(childSnapshot.state.type === "Aborted");
      const abortReason = childSnapshot.state.abort.request;
      expect(abortReason).toBe(runDisposedAbortReason);
      expect(childSnapshot.state.abort.observed).toBe(abortReason);

      const grandchildSnapshot = childSnapshot.children[0];
      assert(grandchildSnapshot);
      assert(grandchildSnapshot.state.type === "Aborted");
      expect(grandchildSnapshot.state.abort.request).toBe(abortReason);
      expect(grandchildSnapshot.state.abort.observed).toBe(abortReason);
    } finally {
      completeSlow.resolve();
    }

    expect(await anyFiber).toEqual(ok("fast"));
    expect(slowSettled).toBe(true);
  });

  test("aborts running Tasks when aborted", async () => {
    await using run = createRun();
    const completeTask = Promise.withResolvers<void>();
    let taskSignal: AbortSignal | undefined;

    const task: Task<string> = async (run) => {
      taskSignal = run.signal;
      await completeTask.promise;
      run.signal.throwIfAborted();
      return ok("task");
    };

    const fiber = run.abortable(any([task]));
    assert(taskSignal);

    fiber.abort(testAbortReason);
    completeTask.resolve();

    expect(taskSignal.aborted).toBe(true);
    expect(taskSignal.reason).toEqual(testAbortError);

    expect(await fiber).toEqual(err(testAbortError));
  });
});

describe("race", () => {
  test("infers result and dependency intersections", () => {
    interface FirstError {
      readonly type: "FirstError";
    }
    interface SecondError {
      readonly type: "SecondError";
    }

    const first: Task<string, FirstError, DbDep> = () => ok("first");
    const second: Task<number, SecondError, SessionDep> = () => ok(2);

    const task = race([first, second]);

    expectTypeOf(task).toEqualTypeOf<
      Task<string | number, FirstError | SecondError, DbDep & SessionDep>
    >();

    const assertRaceTypes = () => {
      // @ts-expect-error - race requires at least one Task.
      void race([]);
    };

    void assertRaceTypes;
  });

  test("asserts non-empty Task array at runtime before setting concurrency", async () => {
    await using run = testCreateRun();
    const tasks: ReadonlyArray<Task<string>> = [];
    const defect = expect.objectContaining({
      message: "Expected a non-empty readonly array.",
    });

    await expect(
      // @ts-expect-error - Exercise the runtime assertion for plain JS callers.
      run(race(tasks)),
    ).rejects.toEqual(panic(defect));
    expect(await run.deps.reportDefect.next()).toEqual(panic(defect));
  });

  test("returns first Ok result", async () => {
    await using run = createRun();
    const completeSlow = Promise.withResolvers<void>();

    const slow: Task<string> = async (run) => {
      using _ = run.onAbort(() => {
        completeSlow.resolve();
      });
      await completeSlow.promise;
      return ok("slow");
    };
    const fast: Task<string> = () => ok("fast");

    expect(await run(race([slow, fast]))).toEqual(ok("fast"));
  });

  test("returns sync Ok and aborts a pending loser", async () => {
    await using run = createRun();
    const pendingAborted = Promise.withResolvers<void>();
    let pendingSettled = false;

    const syncOk: Task<string> = () => ok("sync");
    const pending: Task<string> = async (run) => {
      using _ = run.onAbort(() => {
        pendingAborted.resolve();
      });
      await pendingAborted.promise;
      pendingSettled = true;
      return ok("pending");
    };

    expect(await run(race([syncOk, pending]))).toEqual(ok("sync"));
    expect(pendingSettled).toBe(true);
  });

  test("returns first Err result", async () => {
    await using run = createRun();
    const completeSlow = Promise.withResolvers<void>();
    const fastError = { type: "FastError" } as const;

    const slow: Task<string, typeof fastError> = async (run) => {
      using _ = run.onAbort(() => {
        completeSlow.resolve();
      });
      await completeSlow.promise;
      return ok("slow");
    };
    const fast: Task<string, typeof fastError> = () => err(fastError);

    expect(await run(race([slow, fast]))).toEqual(err(fastError));
  });

  test("aborts running Tasks when aborted", async () => {
    await using run = createRun();
    const completeTask = Promise.withResolvers<void>();
    let taskSignal: AbortSignal | undefined;

    const task: Task<string> = async (run) => {
      taskSignal = run.signal;
      await completeTask.promise;
      run.signal.throwIfAborted();
      return ok("task");
    };

    const fiber = run.abortable(race([task]));
    assert(taskSignal);

    fiber.abort(testAbortReason);
    completeTask.resolve();

    expect(taskSignal.aborted).toBe(true);
    expect(taskSignal.reason).toEqual(testAbortError);

    expect(await fiber).toEqual(err(testAbortError));
  });

  test("waits for aborted losers to settle", async () => {
    await using run = createRun();
    const completeSlow = Promise.withResolvers<void>();
    const slowAborted = Promise.withResolvers<unknown>();
    let slowSettled = false;

    const slow: Task<string> = async (run) => {
      using _ = run.onAbort((abortError) => {
        slowAborted.resolve(abortError.reason);
      });
      await completeSlow.promise;
      slowSettled = true;
      return ok("slow");
    };
    const fast: Task<string> = () => ok("fast");

    const raceFiber = run(race([slow, fast]));
    let raceFiberSettled = false;
    void raceFiber.then(() => {
      raceFiberSettled = true;
    });

    try {
      expect(await slowAborted.promise).toBe(runDisposedAbortReason);
      expect(raceFiberSettled).toBe(false);

      const snapshot = raceFiber.run.snapshot();
      expect(snapshot.state).toEqual({ type: "Running" });

      const childSnapshot = snapshot.children[0];
      assert(childSnapshot);
      assert(childSnapshot.state.type === "Aborted");
      const abortReason = childSnapshot.state.abort.request;
      expect(abortReason).toBe(runDisposedAbortReason);
      expect(childSnapshot.state.abort.observed).toBe(abortReason);

      const grandchildSnapshot = childSnapshot.children[0];
      assert(grandchildSnapshot);
      assert(grandchildSnapshot.state.type === "Aborted");
      expect(grandchildSnapshot.state.abort.request).toBe(abortReason);
      expect(grandchildSnapshot.state.abort.observed).toBe(abortReason);
    } finally {
      completeSlow.resolve();
    }

    expect(await raceFiber).toEqual(ok("fast"));
    expect(slowSettled).toBe(true);
  });
});

describe("firstN", () => {
  test("infers readonly Ok array and dependency intersections", () => {
    interface FirstError {
      readonly type: "FirstError";
    }
    interface SecondError {
      readonly type: "SecondError";
    }

    const first: Task<string, FirstError, DbDep> = () => ok("first");
    const second: Task<number, SecondError, SessionDep> = () => ok(2);

    const task = firstN([first, second], 2);

    expectTypeOf(task).toEqualTypeOf<
      Task<ReadonlyArray<string | number>, never, DbDep & SessionDep>
    >();

    const assertFirstNTypes = () => {
      // @ts-expect-error - firstN requires at least one Task.
      void firstN([], 1);
      // @ts-expect-error - count must be a 1-100 literal or PositiveInt.
      void firstN([first], 101);
      void firstN([first], PositiveInt.orThrow(101));
    };

    void assertFirstNTypes;
  });

  test("returns Ok values in settlement order and ignores Errs", async () => {
    await using run = createRun();
    const completeSlow = Promise.withResolvers<void>();
    const taskError = { type: "TaskError" } as const;

    const slow: Task<string, typeof taskError> = async () => {
      await completeSlow.promise;
      return ok("slow");
    };
    const fastErr: Task<string, typeof taskError> = () => err(taskError);
    const fastOk: Task<string, typeof taskError> = () => ok("fast");

    const fiber = run(concurrently(3, firstN([slow, fastErr, fastOk], 2)));

    completeSlow.resolve();

    expect(await fiber).toEqual(ok(["fast", "slow"]));
  });

  test("returns available Ok values when fewer than count Tasks succeed", async () => {
    await using run = createRun();
    const taskError = { type: "TaskError" } as const;

    expect(
      await run(firstN([() => ok("value"), () => err(taskError)], 2)),
    ).toEqual(ok(["value"]));
  });

  test("stops after count Ok values and aborts running Tasks", async () => {
    await using run = createRun();
    const completeSlow = Promise.withResolvers<void>();
    const slowAborted = Promise.withResolvers<unknown>();
    let slowSettled = false;

    const slow: Task<string> = async (run) => {
      using _ = run.onAbort((abortError) => {
        slowAborted.resolve(abortError.reason);
      });
      await completeSlow.promise;
      slowSettled = true;
      return ok("slow");
    };
    const fast: Task<string> = () => ok("fast");

    const fiber = run(concurrently(2, firstN([slow, fast], 1)));

    try {
      expect(await slowAborted.promise).toBe(runDisposedAbortReason);
      expect(slowSettled).toBe(false);
    } finally {
      completeSlow.resolve();
    }

    expect(await fiber).toEqual(ok(["fast"]));
    expect(slowSettled).toBe(true);
  });

  test("asserts positive count at runtime", async () => {
    await using run = testCreateRun();
    const count = 0 as unknown as Int1To100OrPositiveInt;

    const result = await run.abortable(firstN([() => ok("value")], count));

    assert(!result.ok);
    assert(AbortError.is(result.error));
    assert(result.error.reason.type === "PanicAbortReason");
    expect(await run.deps.reportDefect.next()).toEqual(result.error);
  });
});

describe("firstNSettled", () => {
  test("infers readonly Result array and dependency intersections", () => {
    interface FirstError {
      readonly type: "FirstError";
    }
    interface SecondError {
      readonly type: "SecondError";
    }

    const first: Task<string, FirstError, DbDep> = () => ok("first");
    const second: Task<number, SecondError, SessionDep> = () => ok(2);

    const task = firstNSettled([first, second], 2);

    expectTypeOf(task).toEqualTypeOf<
      Task<
        ReadonlyArray<Result<string | number, FirstError | SecondError>>,
        never,
        DbDep & SessionDep
      >
    >();

    const assertFirstNSettledTypes = () => {
      // @ts-expect-error - firstNSettled requires at least one Task.
      void firstNSettled([], 1);
      // @ts-expect-error - count must be a 1-100 literal or PositiveInt.
      void firstNSettled([first], 101);
      void firstNSettled([first], PositiveInt.orThrow(101));
    };

    void assertFirstNSettledTypes;
  });

  test("returns Results in settlement order", async () => {
    await using run = createRun();
    const completeSlow = Promise.withResolvers<void>();
    const slowAborted = Promise.withResolvers<void>();
    const taskError = { type: "TaskError" } as const;

    const slow: Task<string, typeof taskError> = async (run) => {
      using _ = run.onAbort(() => slowAborted.resolve());
      await completeSlow.promise;
      return ok("slow");
    };
    const fastErr: Task<string, typeof taskError> = () => err(taskError);
    const fastOk: Task<string, typeof taskError> = () => ok("fast");

    const fiber = run(
      concurrently(3, firstNSettled([slow, fastErr, fastOk], 2)),
    );

    try {
      await slowAborted.promise;
    } finally {
      completeSlow.resolve();
    }

    expect(await fiber).toEqual(ok([err(taskError), ok("fast")]));
  });

  test("returns all Results when count exceeds Task count", async () => {
    await using run = createRun();
    const taskError = { type: "TaskError" } as const;

    expect(
      await run(firstNSettled([() => ok("value"), () => err(taskError)], 3)),
    ).toEqual(ok([ok("value"), err(taskError)]));
  });

  test("asserts positive count at runtime", async () => {
    await using run = testCreateRun();
    const count = 0 as unknown as Int1To100OrPositiveInt;

    const result = await run.abortable(
      firstNSettled([() => ok("value")], count),
    );

    assert(!result.ok);
    assert(AbortError.is(result.error));
    assert(result.error.reason.type === "PanicAbortReason");
    expect(await run.deps.reportDefect.next()).toEqual(result.error);
  });
});

describe("concurrency", () => {
  test("sets and inherits Run concurrency", async () => {
    await using run = createRun();
    const concurrency = 2;
    const observedConcurrency: Array<Int1To100OrPositiveInt> = [];

    expect(run.concurrency).toBe(onePositiveInt);

    const result = await run(
      concurrently(concurrency, async (run) => {
        observedConcurrency.push(run.concurrency);

        await run.ok((childRun) => {
          observedConcurrency.push(childRun.concurrency);
          return ok();
        });

        return ok();
      }),
    );

    expectOk(result, undefined);
    expect(observedConcurrency).toEqual([concurrency, concurrency]);
  });

  describe("concurrently", () => {
    test("preserves Task type and runs wrapped Task", async () => {
      interface MyError {
        readonly type: "MyError";
      }

      const task: Task<string, MyError, DbDep> = ({ deps }) =>
        ok(deps.db.query("select user"));

      const wrapped = concurrently(2, task);

      expectTypeOf(wrapped).toEqualTypeOf<Task<string, MyError, DbDep>>();

      await using run = createRun(dbDep);

      expect(await run(wrapped)).toEqual(ok("result:select user"));
    });

    test("runs wrapped Task without explicit concurrency", async () => {
      await using run = createRun();

      const wrapped = concurrently((run) => ok(run.concurrency));

      expect(await run(wrapped)).toEqual(ok(maxPositiveInt));
    });

    test("throws when concurrency is invalid", () => {
      const task: Task<void> = () => ok();
      const concurrency = 0 as unknown as Int1To100OrPositiveInt;

      expect(() => concurrently(concurrency, task)).toThrow();
    });

    test("uses the outer concurrency wrapper", async () => {
      await using run = createRun();

      const result = await run(
        concurrently(
          3,
          concurrently(2, (run) => ok(run.concurrency)),
        ),
      );

      expectOk(result, 3);
    });
  });

  describe("each", () => {
    describe("input", () => {
      test("requires at least one Task", () => {
        const assertBatchTypes = () => {
          // @ts-expect-error - each requires at least one Task.
          void each([], () => "continue");
        };

        void assertBatchTypes;
      });

      test("asserts non-empty Task array at runtime instead of hanging", async () => {
        await using run = testCreateRun();

        // The non-empty tuple type is compile-time only; plain JS can still pass
        // an empty array, which must assert, not await forever.
        const tasks: ReadonlyArray<Task<string>> = [];

        await expect(
          // @ts-expect-error - Exercise the runtime assertion for plain JS callers.
          run(each(tasks, () => "continue")),
        ).rejects.toThrow();
      });
    });

    describe("queue processing", () => {
      test("runs one Task at a time when concurrency is 1", async () => {
        await using run = createRun();
        const completeFirst = Promise.withResolvers<void>();
        const events: Array<string> = [];

        const first: Task<string> = async () => {
          events.push("first start");
          await completeFirst.promise;
          events.push("first end");
          return ok("first");
        };
        const second: Task<string> = () => {
          events.push("second start");
          return ok("second");
        };

        const fiber = run(each([first, second], () => "continue"));

        expect(events).toEqual(["first start"]);

        completeFirst.resolve();

        expect(await fiber).toEqual(ok());
        expect(events).toEqual(["first start", "first end", "second start"]);
      });

      test("uses inherited concurrency by default", async () => {
        await using run = createRun();
        const completeTasks = Promise.withResolvers<void>();
        const startedIds: Array<number> = [];

        const createTask =
          (id: number): Task<number> =>
          async () => {
            startedIds.push(id);
            await completeTasks.promise;
            return ok(id);
          };

        const fiber = run(
          concurrently(
            2,
            each(
              [createTask(1), createTask(2), createTask(3)],
              () => "continue",
            ),
          ),
        );

        try {
          expect(startedIds).toEqual([1, 2]);

          completeTasks.resolve();

          expect(await fiber).toEqual(ok());
          expect(startedIds).toEqual([1, 2, 3]);
        } finally {
          completeTasks.resolve();
        }
      });

      test("calls onResult with results and indexes", async () => {
        await using run = createRun();
        const results: Array<readonly [unknown, number]> = [];

        const first: Task<string> = () => ok("first");
        const second: Task<string> = () => ok("second");

        const result = await run(
          each([first, second], (result, index) => {
            results.push([result, index]);
            return "continue";
          }),
        );

        expectOk(result, undefined);
        expect(results).toEqual([
          [ok("first"), 0],
          [ok("second"), 1],
        ]);
      });

      test("waits for already-started Tasks after no queued Tasks remain", async () => {
        await using run = createRun();
        const completeSlow = Promise.withResolvers<void>();
        const fastReported = Promise.withResolvers<void>();
        let settled = false;

        const slow: Task<string> = async () => {
          await completeSlow.promise;
          return ok("slow");
        };
        const fast: Task<string> = () => ok("fast");

        const fiber = run(
          concurrently(
            2,
            each([slow, fast], (_result, index) => {
              if (index === 1) fastReported.resolve();
              return "continue";
            }),
          ),
        ).then((result) => {
          settled = true;
          return result;
        });

        await fastReported.promise;

        expect(settled).toBe(false);

        completeSlow.resolve();

        expect(await fiber).toEqual(ok());
        expect(settled).toBe(true);
      });

      test("starts a queued Task after the running Task frees capacity", async () => {
        await using run = createRun();
        const completeFirst = Promise.withResolvers<void>();
        const results: Array<string> = [];

        const first: Task<string> = async () => {
          await completeFirst.promise;
          return ok("first");
        };
        const second: Task<string> = () => ok("second");

        const fiber = run(
          each([first, second], (result) => {
            if (result.ok) results.push(result.value);
            return "continue";
          }),
        );

        completeFirst.resolve();

        expect(await fiber).toEqual(ok());
        expect(results).toEqual(["first", "second"]);
      });

      test("each child defect stack traces link to the caller", async () => {
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

    describe("stop decision", () => {
      test("records Aborted and waits for running Tasks after stop", async () => {
        await using run = createRun();
        const completeSlow = Promise.withResolvers<void>();
        const slowAborted = Promise.withResolvers<unknown>();

        const slow: Task<string> = async (run) => {
          using _ = run.onAbort((abortError) => {
            slowAborted.resolve(abortError.reason);
          });
          await completeSlow.promise;
          return ok("slow");
        };
        const fast: Task<string> = () => ok("fast");

        const fiber = run(
          concurrently(
            2,
            each([slow, fast], () => "stop"),
          ),
        );

        try {
          expect(await slowAborted.promise).toBe(runDisposedAbortReason);
          expect(fiber.run.getState()).toEqual({
            type: "Aborted",
            abort: {
              request: runDisposedAbortReason,
              observed: runDisposedAbortReason,
            },
          });
        } finally {
          completeSlow.resolve();
        }

        expect(await fiber).toEqual(ok());
        expect(fiber.run.getState()).toEqual({
          type: "Settled",
          abort: {
            request: runDisposedAbortReason,
            observed: runDisposedAbortReason,
          },
          exit: ok(ok()),
        });
      });
    });

    describe("caller abort", () => {
      test("does not start queued Tasks after abort", async () => {
        await using run = createRun();
        const first: Task<string> = () => ok("first");
        const second = vi.fn(() => ok("second"));

        const fiber = run.abortable(
          each([first, second], () => {
            fiber.abort(testAbortReason);
            return "continue";
          }),
        );

        expect(await fiber).toEqual(err(testAbortError));
        expect(second).not.toHaveBeenCalled();
      });

      test("keeps abort result when onResult also stops", async () => {
        await using run = createRun();

        const fiber = run.abortable(
          each([() => ok("first")], () => {
            fiber.abort(testAbortReason);
            return "stop";
          }),
        );

        expect(await fiber).toEqual(err(testAbortError));
      });

      test("does not call onResult after caller abort", async () => {
        await using run = createRun();
        const completeFirst = Promise.withResolvers<void>();
        const onResult = vi.fn(() => "stop" as const);

        const first: Task<string> = async () => {
          await completeFirst.promise;
          return ok("first");
        };

        const fiber = run.abortable(each([first], onResult));

        fiber.abort(testAbortReason);
        completeFirst.resolve();

        expect(await fiber).toEqual(err(testAbortError));
        expect(onResult).not.toHaveBeenCalled();
      });

      test("keeps caller abort when a masked Task settles after abort", async () => {
        await using run = createRun();
        const taskStarted = Promise.withResolvers<void>();
        const completeTask = Promise.withResolvers<void>();
        const onResult = vi.fn(() => "continue" as const);

        const masked: Task<string> = unabortable(async (run) => {
          taskStarted.resolve();
          await completeTask.promise;
          expect(run.signal.aborted).toBe(false);
          return ok("masked");
        });

        const fiber = run.abortable(each([masked], onResult));

        await taskStarted.promise;
        fiber.abort(testAbortReason);
        completeTask.resolve();

        expect(await fiber).toEqual(err(testAbortError));
        expect(onResult).not.toHaveBeenCalled();
      });

      test("does not start queued Tasks after caller abort before result", async () => {
        await using run = createRun();
        const completeFirst = Promise.withResolvers<void>();

        const first: Task<string> = async () => {
          await completeFirst.promise;
          return ok("first");
        };
        const second = vi.fn(() => ok("second"));

        const fiber = run.abortable(each([first, second], () => "continue"));

        fiber.abort(testAbortReason);
        completeFirst.resolve();

        expect(await fiber).toEqual(err(testAbortError));
        expect(second).not.toHaveBeenCalled();
      });
    });

    describe("child Fiber rejection", () => {
      test("propagates child Fiber AbortError rejection", async () => {
        await using run = createRun();
        const completeSlow = Promise.withResolvers<void>();
        const abortError = createAbortError({ type: "TestAbort" });

        const aborting: Task<string> = callback<string>(({ reject }) => {
          reject(abortError);
        });
        const slow: Task<string> = async () => {
          await completeSlow.promise;
          return ok("slow");
        };

        const fiber = run.abortable(
          concurrently(
            2,
            each([aborting, slow], () => "continue"),
          ),
        );

        completeSlow.resolve();

        expect(await fiber).toEqual(err(abortError));
      });

      test("propagates child Fiber AbortError rejection while sibling is pending", async () => {
        await using run = createRun();
        const abortError = createAbortError({ type: "TestAbort" });
        const slowAborted = Promise.withResolvers<void>();

        const slow: Task<string> = callback<string>(({ run }) => {
          run.onAbort(() => {
            slowAborted.resolve();
          });
        });
        const aborting: Task<string> = callback<string>(({ reject }) => {
          reject(abortError);
        });

        const fiber = run.abortable(
          concurrently(
            2,
            each([slow, aborting], () => "continue"),
          ),
        );

        expect(await fiber).toEqual(err(abortError));
        await slowAborted.promise;
      });

      test("does not call onResult after child Fiber AbortError rejection", async () => {
        await using run = createRun();
        const abortError = createAbortError({ type: "TestAbort" });
        const onResult = vi.fn(() => "continue" as const);

        const aborting: Task<string> = callback<string>(({ reject }) => {
          reject(abortError);
        });
        const succeeding: Task<string> = () => ok("succeeding");

        const fiber = run.abortable(
          concurrently(2, each([aborting, succeeding], onResult)),
        );

        expect(await fiber).toEqual(err(abortError));
        expect(onResult).not.toHaveBeenCalled();
      });
    });

    describe("defects", () => {
      test("rejects when onResult throws for a sync-settling Task", async () => {
        await using run = testCreateRun();
        const defect = new Error("boom");

        const fiber = run(
          each([() => ok("first")], () => {
            throw defect;
          }),
        );

        const panicAbortError = await run.deps.reportDefect.next();
        expectPanicAbortError(panicAbortError, defect);
        await expect(fiber).rejects.toBe(panicAbortError);
      });

      test("rejects with panic abort and aborts running Tasks when onResult defects", async () => {
        await using run = testCreateRun();
        const completeSlow = Promise.withResolvers<void>();
        const slowAborted = Promise.withResolvers<unknown>();
        const defect = new Error("boom");

        const slow: Task<string> = async (run) => {
          using _ = run.onAbort((abortError) => {
            slowAborted.resolve(abortError.reason);
          });
          await completeSlow.promise;
          return ok("slow");
        };
        const fast: Task<string> = () => ok("fast");

        const fiber = run(
          concurrently(
            2,
            each([slow, fast], () => {
              throw defect;
            }),
          ),
        );

        const panicAbortError = await run.deps.reportDefect.next();
        expectPanicAbortError(panicAbortError, defect);
        expect(await slowAborted.promise).toBe(panicAbortError.reason);

        completeSlow.resolve();

        await expect(fiber).rejects.toEqual(panic(defect));
      });

      test("rejects with panic abort and aborts running Tasks when an each Task defects", async () => {
        await using run = testCreateRun();
        const completeSlow = Promise.withResolvers<void>();
        const slowAborted = Promise.withResolvers<unknown>();
        const defect = new Error("boom");

        const slow: Task<string> = async (run) => {
          using _ = run.onAbort((abortError) => {
            slowAborted.resolve(abortError.reason);
          });
          await completeSlow.promise;
          return ok("slow");
        };
        const defecting: Task<string> = () => {
          throw defect;
        };

        const fiber = run(
          concurrently(
            2,
            each([slow, defecting], () => "continue"),
          ),
        );

        const panicAbortError = await run.deps.reportDefect.next();
        expectPanicAbortError(panicAbortError, defect);
        expect(await slowAborted.promise).toBe(panicAbortError.reason);

        completeSlow.resolve();

        await expect(fiber).rejects.toEqual(panic(defect));
      });

      test("does not start queued Tasks after sibling defect", async () => {
        await using run = testCreateRun();
        const completeFirst = Promise.withResolvers<void>();
        const defect = new Error("boom");

        const first: Task<string> = async () => {
          await completeFirst.promise;
          return ok("first");
        };
        const second = vi.fn(() => ok("second"));

        const fiber = run(async (run) => {
          const eachFiber = run(
            concurrently(
              1,
              each([first, second], () => "continue"),
            ),
          );
          void run(() => {
            throw defect;
          }).catch(() => undefined);

          completeFirst.resolve();

          return await eachFiber;
        });

        await expect(fiber).rejects.toEqual({
          type: "AbortError",
          reason: { type: "PanicAbortReason", defect },
        });
        expect(second).not.toHaveBeenCalled();
      });

      test("does not call onResult after synchronous child scheduling defect", async () => {
        await using run = testCreateRun();
        const completeFirst = Promise.withResolvers<void>();
        let restoreFromCompletedMask:
          (<T, E>(task: Task<T, E>) => Task<T, E>) | undefined;

        expect(
          await run(
            unabortableMask((restore) => {
              restoreFromCompletedMask = restore;
              return () => ok();
            }),
          ),
        ).toEqual(ok());

        const restore = restoreFromCompletedMask;
        assert(restore);

        const first: Task<string> = async () => {
          await completeFirst.promise;
          return ok("first");
        };
        const staleRestore = restore(() => ok("second"));
        const onResult = vi.fn(() => "continue" as const);

        const fiber = run(
          concurrently(2, each([first, staleRestore], onResult)),
        );

        const panicAbortError = await run.deps.reportDefect.next();
        assert(AbortError.is(panicAbortError));
        expect(panicAbortError.reason).toMatchObject({
          type: "PanicAbortReason",
          defect: expect.objectContaining({
            message:
              "restore is only valid inside the unabortableMask that created it",
          }),
        });

        completeFirst.resolve();

        await expect(fiber).rejects.toBe(panicAbortError);
        expect(onResult).not.toHaveBeenCalled();
      });

      test("does not start later Tasks after synchronous child scheduling defect", async () => {
        await using run = testCreateRun();
        let restoreFromCompletedMask:
          (<T, E>(task: Task<T, E>) => Task<T, E>) | undefined;

        expect(
          await run(
            unabortableMask((restore) => {
              restoreFromCompletedMask = restore;
              return () => ok();
            }),
          ),
        ).toEqual(ok());

        const restore = restoreFromCompletedMask;
        assert(restore);

        const staleRestore = restore(() => ok("bad"));
        const later = vi.fn(() => ok("later"));

        const fiber = run(
          concurrently(
            3,
            each([staleRestore, later], () => "continue"),
          ),
        );

        const panicAbortError = await run.deps.reportDefect.next();

        await expect(fiber).rejects.toBe(panicAbortError);
        expect(later).not.toHaveBeenCalled();
      });

      test("reports running Task panic after stop", async () => {
        await using run = testCreateRun();
        const completeSlow = Promise.withResolvers<void>();
        const slowAborted = Promise.withResolvers<unknown>();
        const defect = new Error("boom");

        const slow: Task<string> = async (run) => {
          using _ = run.onAbort((abortError) => {
            slowAborted.resolve(abortError.reason);
          });
          await completeSlow.promise;
          throw defect;
        };
        const fast: Task<string> = () => ok("fast");

        const fiber = run(
          concurrently(
            2,
            each([slow, fast], () => "stop"),
          ),
        );

        expect(await slowAborted.promise).toBe(runDisposedAbortReason);

        completeSlow.resolve();

        expect(await fiber).toEqual(ok());
        expect(await run.deps.reportDefect.next()).toEqual(panic(defect));
      });
    });
  });
});

describe("prioritized", () => {
  test("uses native priorities", async () => {
    const priorities: Array<TaskPriority | undefined> = [];

    vi.stubGlobal("scheduler", {
      postTask: async <T>(
        callback: () => T | PromiseLike<T>,
        options?: { readonly priority?: TaskPriority },
      ): Promise<T> => {
        priorities.push(options?.priority);
        return await callback();
      },
    });

    try {
      await using run = createRun();

      expect(
        await run(prioritized("user-blocking", () => ok("blocking"))),
      ).toEqual(ok("blocking"));
      expect(
        await run(prioritized("user-visible", () => ok("visible"))),
      ).toEqual(ok("visible"));
      expect(
        await run(prioritized("background", () => ok("background"))),
      ).toEqual(ok("background"));

      expect(priorities).toEqual([
        "user-blocking",
        "user-visible",
        "background",
      ]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  test("uses the outer priority wrapper", async () => {
    const priorities: Array<TaskPriority | undefined> = [];

    vi.stubGlobal("scheduler", {
      postTask: async <T>(
        callback: () => T | PromiseLike<T>,
        options?: { readonly priority?: TaskPriority },
      ): Promise<T> => {
        priorities.push(options?.priority);
        return await callback();
      },
    });

    try {
      await using run = createRun();

      expect(
        await run(
          prioritized(
            "user-blocking",
            prioritized("background", () => ok("done")),
          ),
        ),
      ).toEqual(ok("done"));

      expect(priorities).toEqual(["user-blocking"]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  test("composes with abort behavior", async () => {
    const priorities: Array<TaskPriority | undefined> = [];

    vi.stubGlobal("scheduler", {
      postTask: async <T>(
        callback: () => T | PromiseLike<T>,
        options?: { readonly priority?: TaskPriority },
      ): Promise<T> => {
        priorities.push(options?.priority);
        return await callback();
      },
    });

    try {
      await using run = createRun();

      expect(
        await run(unabortable(prioritized("background", () => ok("first")))),
      ).toEqual(ok("first"));
      expect(
        await run(
          prioritized(
            "background",
            unabortable(() => ok("second")),
          ),
        ),
      ).toEqual(ok("second"));

      expect(priorities).toEqual(["background", "background"]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  test("composes through unabortableMask returned body Task", async () => {
    const priorities: Array<TaskPriority | undefined> = [];

    vi.stubGlobal("scheduler", {
      postTask: async <T>(
        callback: () => T | PromiseLike<T>,
        options?: { readonly priority?: TaskPriority },
      ): Promise<T> => {
        priorities.push(options?.priority);
        return await callback();
      },
    });

    try {
      await using run = createRun();

      expect(
        await run(
          unabortableMask(() => prioritized("user-blocking", () => ok("body"))),
        ),
      ).toEqual(ok("body"));

      expect(priorities).toEqual(["user-blocking"]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  test("cancels queued postTask when scheduler rejects with signal.reason", async () => {
    const postTaskNotAborted = new Error("postTask was not aborted");
    let taskStarted = false;

    vi.stubGlobal("scheduler", {
      postTask: <T>(
        callback: () => T | PromiseLike<T>,
        options?: {
          readonly priority?: TaskPriority;
          readonly signal?: AbortSignal;
        },
      ): Promise<T> => {
        // Keep the callback queued. Native scheduler.postTask rejects queued
        // aborts with AbortSignal.reason, which is the behavior this test
        // exercises.
        void callback;

        return new Promise<T>((_resolve, reject) => {
          const rejectUnknown = (reason: unknown): void => {
            Reflect.apply(reject, undefined, [reason]);
          };
          const abort = (): void => {
            const reason = options?.signal?.reason;
            assert(AbortError.is(reason));
            expect(reason).toEqual(testAbortError);
            rejectUnknown(reason);
          };

          options?.signal?.addEventListener("abort", abort, { once: true });
          queueMicrotask(() => reject(postTaskNotAborted));
        });
      },
    });

    try {
      await using run = testCreateRun();
      const fiber = run.abortable(
        prioritized("background", () => {
          taskStarted = true;
          return ok("started");
        }),
      );

      fiber.abort(testAbortReason);

      expect(await fiber).toEqual(err(testAbortError));
      expect(taskStarted).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  test("treats queued postTask abort-like rejections as defects", async () => {
    const hostAbortError = { name: "AbortError", message: "aborted" };
    const postTaskNotAborted = new Error("postTask was not aborted");
    let taskStarted = false;

    vi.stubGlobal("scheduler", {
      postTask: <T>(
        callback: () => T | PromiseLike<T>,
        options?: {
          readonly priority?: TaskPriority;
          readonly signal?: AbortSignal;
        },
      ): Promise<T> => {
        void callback;

        return new Promise<T>((_resolve, reject) => {
          // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- Host APIs can reject with non-Error abort values.
          const abort = (): void => reject(hostAbortError);

          options?.signal?.addEventListener("abort", abort, { once: true });
          queueMicrotask(() => reject(postTaskNotAborted));
        });
      },
    });

    try {
      await using run = testCreateRun();
      const fiber = run.abortable(
        prioritized("background", () => {
          taskStarted = true;
          return ok("started");
        }),
      );

      fiber.abort(testAbortReason);

      await expect(fiber).resolves.toEqual(err(panic(hostAbortError)));
      expect(taskStarted).toBe(false);
      expect(await run.deps.reportDefect.next()).toEqual(panic(hostAbortError));
    } finally {
      vi.unstubAllGlobals();
    }
  });

  test("observes abort after postTask callback starts", async () => {
    const continueTask = Promise.withResolvers<void>();
    let taskStarted = false;

    vi.stubGlobal("scheduler", {
      postTask: async <T>(callback: () => T | PromiseLike<T>): Promise<T> =>
        await callback(),
    });

    try {
      await using run = createRun();
      const fiber = run.abortable(
        prioritized("background", async ({ signal }) => {
          taskStarted = true;
          await continueTask.promise;
          signal.throwIfAborted();
          return ok("started");
        }),
      );

      expect(taskStarted).toBe(true);
      fiber.abort(testAbortReason);
      continueTask.resolve();

      expect(await fiber).toEqual(err(testAbortError));
    } finally {
      continueTask.resolve();
      vi.unstubAllGlobals();
    }
  });
});

describe("yieldNow", () => {
  test("uses native yield", async () => {
    const calls: Array<string> = [];

    vi.stubGlobal("scheduler", {
      yield: (): Promise<void> => {
        calls.push("yield");
        return Promise.resolve();
      },
    });

    try {
      await using run = createRun();

      expect(await run(yieldNow)).toEqual(ok());
      expect(calls).toEqual(["yield"]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  test("uses setImmediate fallback", async () => {
    const calls: Array<string> = [];

    vi.stubGlobal("scheduler", undefined);
    vi.stubGlobal("setImmediate", (callback: () => void): number => {
      calls.push("setImmediate");
      callback();
      return 0;
    });

    try {
      await using run = createRun();

      expect(await run(yieldNow)).toEqual(ok());
      expect(calls).toEqual(["setImmediate"]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  test("uses setTimeout fallback", async () => {
    const calls: Array<string> = [];

    vi.stubGlobal("scheduler", undefined);
    vi.stubGlobal("setImmediate", undefined);
    vi.stubGlobal("setTimeout", (callback: () => void): number => {
      calls.push("setTimeout");
      callback();
      return 0;
    });

    try {
      await using run = createRun();

      expect(await run(yieldNow)).toEqual(ok());
      expect(calls).toEqual(["setTimeout"]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  test("yields during a long-running loop", async () => {
    let yields = 0;

    vi.stubGlobal("scheduler", {
      yield: (): Promise<void> => {
        yields++;
        return Promise.resolve();
      },
    });

    await using run = createRun();

    const sumTo =
      (count: number): Task<number> =>
      async (run) => {
        let sum = 0;

        for (let index = 0; index < count; index++) {
          if (index > 0 && index % 1000 === 0) await run.ok(yieldNow);
          sum += index;
        }

        return ok(sum);
      };

    const count = 5000;

    try {
      expect(await run(sumTo(count))).toEqual(ok((count * (count - 1)) / 2));
      expect(yields).toBe(4);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  test("yields as monitored child Task", async () => {
    await using run = testCreateRun(eventsEnabled);
    const eventTypes: Array<string> = [];

    run.onEvent = (event) => {
      eventTypes.push(event.data.type);
    };

    const result = await run(async (run) => {
      await run(yieldNow);
      return ok("done");
    });

    expectOk(result, "done");
    expect(eventTypes.filter((type) => type === "ChildAdded")).toHaveLength(2);
    expect(eventTypes.filter((type) => type === "ChildRemoved")).toHaveLength(
      2,
    );
  });

  test("observes abort after yielding", async () => {
    await using run = createRun();

    const fiber = run.abortable(async (run) => {
      await run(yieldNow);
      return ok("done");
    });

    fiber.abort(testAbortReason);

    expect(await fiber).toEqual(err(testAbortError));
  });
});

describe("waitForAbort", () => {
  test("waits until the Run aborts", async () => {
    await using run = createRun();

    const fiber = run(waitForAbort);

    expect(fiber.run.getState()).toEqual({ type: "Running" });

    run.abort(testAbortReason);

    await expect(fiber).rejects.toEqual(testAbortError);
  });
});

describe("daemon", () => {
  test("passes through the Result when not aborted", async () => {
    await using run = createRun();

    const okResult = await run(daemon(() => ok(42)));
    const errResult = await run(daemon(() => err({ type: "MyError" })));

    expect(okResult).toEqual(ok(42));
    expect(errResult).toEqual(err({ type: "MyError" }));
  });

  test("rethrows non-AbortError from daemon start", async () => {
    await using run = createRun();
    const childRun = run.create();
    await childRun[Symbol.asyncDispose]();

    // eslint-disable-next-line evolu/no-direct-task-call -- Exercise daemon with an already disposed Run.
    await expect(daemon(() => ok("done"))(childRun)).rejects.toThrow(
      "Cannot use a disposed object.",
    );
  });

  test("preserves explicit concurrency through daemon Task", async () => {
    await using run = createRun();
    let taskConcurrency: Int1To100OrPositiveInt | undefined;

    const result = await run(
      concurrently(
        2,
        daemon(
          concurrently(3, (run) => {
            taskConcurrency = run.concurrency;
            return ok("done");
          }),
        ),
      ),
    );

    expectOk(result, "done");
    expect(taskConcurrency).toBe(3);
  });

  test("settles and reports panic abort when the wrapped Task defects", async () => {
    await using run = testCreateRun();
    const defect = new Error("boom");
    const panicAbortError = createAbortError({
      type: "PanicAbortReason",
      defect,
    });

    const result = await run(
      expectReportedDefectOnly(
        panicAbortError,
        daemon(() => {
          throw defect;
        }),
      ),
    );

    expectErr(result, panicAbortError);
  });

  test("settles with AbortError without waiting for the Task", async () => {
    await using run = createRun();
    const completeTask = Promise.withResolvers<void>();
    let taskSettled = false;

    // Simulates a natively unabortable API: ignores the abort signal.
    const ignoresAbort: Task<string> = async () => {
      await completeTask.promise;
      taskSettled = true;
      return ok("done");
    };

    const fiber = run.abortable(daemon(ignoresAbort));

    fiber.abort(testAbortReason);

    try {
      expect(await fiber).toEqual(err(testAbortError));
      expect(taskSettled).toBe(false);
    } finally {
      completeTask.resolve();
    }
  });

  test("root disposal waits for an abandoned daemon Task", async () => {
    const run = createRun();
    const completeTask = Promise.withResolvers<void>();
    let rootDisposed = false;

    const task: Task<string> = async () => {
      await completeTask.promise;
      return ok("done");
    };

    const fiber = run.abortable(daemon(task));

    fiber.abort(testAbortReason);

    try {
      expect(await fiber).toEqual(err(testAbortError));

      const disposePromise = run[Symbol.asyncDispose]().then(() => {
        rootDisposed = true;
      });

      await Promise.resolve();
      expect(rootDisposed).toBe(false);

      completeTask.resolve();

      await disposePromise;
      expect(rootDisposed).toBe(true);
    } finally {
      completeTask.resolve();
      await run[Symbol.asyncDispose]();
    }
  });

  test("requests abort for the abandoned Task", async () => {
    await using run = createRun();
    const completeTask = Promise.withResolvers<void>();
    let taskAbortError: AbortError | undefined;

    const task: Task<string> = async (run) => {
      using _ = run.onAbort((abortError) => {
        taskAbortError = abortError;
      });
      await completeTask.promise;
      return ok("done");
    };

    const fiber = run.abortable(daemon(task));

    fiber.abort(testAbortReason);

    try {
      expect(await fiber).toEqual(err(testAbortError));
      expect(taskAbortError).toEqual(testAbortError);
    } finally {
      completeTask.resolve();
    }
  });

  test("settles with AbortError and does not start the Task when the Run is already aborted", async () => {
    await using run = createRun();
    const continueParent = Promise.withResolvers<void>();
    let taskStarted = false;

    const task: Task<string> = () => {
      taskStarted = true;
      return ok("done");
    };

    const fiber = run.abortable(async (run) => {
      await continueParent.promise;
      return await run(daemon(task));
    });

    fiber.abort(testAbortReason);
    continueParent.resolve();

    expect(await fiber).toEqual(err(testAbortError));
    expect(taskStarted).toBe(false);
  });

  test("settles with AbortError and does not start the Task inside a masked Run with a recorded abort request", async () => {
    await using run = createRun();
    const continueParent = Promise.withResolvers<void>();
    let taskStarted = false;

    const task: Task<string> = () => {
      taskStarted = true;
      return ok("done");
    };

    // Inside a mask, run.onAbort never fires while the Task runs, so the
    // Run.daemon start guard is the only point where a recorded abort request
    // can be honored. Wrapping with `daemon` opts the wait back into abort
    // observation even under the mask.
    const fiber = run.abortable(
      unabortable(async (run) => {
        await continueParent.promise;

        expect(run.signal.aborted).toBe(false);

        return await run(daemon(task));
      }),
    );

    fiber.abort(testAbortReason);
    continueParent.resolve();

    expect(await fiber).toEqual(err(testAbortError));
    expect(taskStarted).toBe(false);
  });

  test("returns caller abort and reports later abandoned Task defects as panic aborts", async () => {
    await using run = testCreateRun();
    const releaseAbandonedTask = Promise.withResolvers<void>();
    const callerAbortReason = { type: "TestAbort" } as const;
    const defect = new Error("boom");
    const panicAbortError = createAbortError({
      type: "PanicAbortReason",
      defect,
    });

    const defectAfterRelease: Task<string> = async () => {
      await releaseAbandonedTask.promise;
      throw defect;
    };

    const result = await run(
      expectReportedDefectOnly(panicAbortError, async (run) => {
        const fiber = run.abortable(daemon(defectAfterRelease));

        fiber.abort(callerAbortReason);

        expect(await fiber).toEqual(
          err({ type: "AbortError", reason: callerAbortReason }),
        );

        releaseAbandonedTask.resolve();

        return ok();
      }),
    );

    expectOk(result, undefined);
  });

  test("infers result with AbortError and preserves deps", () => {
    interface MyError {
      readonly type: "MyError";
    }

    const task: Task<string, MyError, DbDep> = () => ok("done");

    const wrapped = daemon(task);

    expectTypeOf(wrapped).toEqualTypeOf<
      Task<string, MyError | AbortError, DbDep>
    >();
  });

  test("returns AbortError when daemon start is prevented by a masked abort request", async () => {
    await using run = createRun();
    const continueTask = Promise.withResolvers<void>();
    let taskStarted = false;
    let result: Result<string, AbortError> | undefined;
    let rejection: unknown;

    const fiber = run.abortable(
      unabortable(async (run) => {
        await continueTask.promise;

        // The mask keeps run.signal un-aborted for owned work, but daemon
        // starts the Task with run.daemon. Daemons detach to the root Run, so
        // run.daemon checks the recorded abort request and refuses to spawn new
        // daemon work after shutdown has started.
        try {
          result = await run(
            daemon(() => {
              taskStarted = true;
              return ok("done");
            }),
          );
        } catch (error) {
          rejection = error;
        }

        return ok();
      }),
    );

    fiber.abort(testAbortReason);
    continueTask.resolve();

    expect(await fiber).toEqual(ok());
    expect(rejection).toBeUndefined();
    assert(result);
    expectErr(result, testAbortError);
    expect(taskStarted).toBe(false);
  });
});

describe("unabortable", () => {
  test("passes through Ok and Err Results", async () => {
    await using run = createRun();

    const okResult = await run(unabortable(() => ok(42)));
    const errResult = await run(unabortable(() => err({ type: "MyError" })));

    expect(okResult).toEqual(ok(42));
    expect(errResult).toEqual(err({ type: "MyError" }));
  });

  test("masks abort after Task starts when used with run.abortable", async () => {
    await using run = createRun();
    const completeTask = Promise.withResolvers<void>();
    let signalAbortedAtStart = true;
    let signalAbortedAfterAbort = true;

    const fiber = run.abortable(
      unabortable(async (run) => {
        signalAbortedAtStart = run.signal.aborted;
        await completeTask.promise;
        signalAbortedAfterAbort = run.signal.aborted;
        return ok("done");
      }),
    );

    fiber.abort();
    completeTask.resolve();

    expect(await fiber).toEqual(ok("done"));
    expect(signalAbortedAtStart).toBe(false);
    expect(signalAbortedAfterAbort).toBe(false);
  });

  test("records requested abort and disposal observed reasons for masked Task", async () => {
    await using run = createRun();
    const completeTask = Promise.withResolvers<void>();

    const fiber = run.abortable(
      unabortable(async () => {
        await completeTask.promise;
        return ok("done");
      }),
    );

    fiber.abort(testAbortReason);
    completeTask.resolve();

    expect(await fiber).toEqual(ok("done"));
    expect(fiber.run.getState()).toEqual({
      type: "Settled",
      abort: {
        request: testAbortReason,
        observed: runDisposedAbortReason,
      },
      exit: ok(ok("done")),
    });
  });

  test("does not start after parent abort request when used with run.abortable", async () => {
    await using run = createRun();
    const continueTask = Promise.withResolvers<void>();
    let parentSignalAborted = false;
    let childTaskRan = false;

    const fiber = run.abortable(async (run) => {
      await continueTask.promise;
      parentSignalAborted = run.signal.aborted;

      return await run(
        unabortable(({ signal }) => {
          childTaskRan = true;
          expect(signal.aborted).toBe(false);
          return ok("child");
        }),
      );
    });

    fiber.abort(testAbortReason);
    continueTask.resolve();

    expect(await fiber).toEqual(err(testAbortError));
    expect(parentSignalAborted).toBe(true);
    expect(childTaskRan).toBe(false);
  });

  test("lets daemon Tasks finish naturally after abort request", async () => {
    await using run = createRun();
    const abortRequested = Promise.withResolvers<void>();
    const checkedAbort = Promise.withResolvers<void>();

    const fiber = run.daemon(
      unabortable(async ({ signal }) => {
        await abortRequested.promise;
        expect(signal.aborted).toBe(false);
        checkedAbort.resolve();
        return ok();
      }),
    );

    fiber.abort();
    abortRequested.resolve();

    await checkedAbort.promise;
    expect(await fiber).toEqual(ok());
  });

  test("lets created Run disposal wait for child Tasks", async () => {
    await using run = createRun();
    const createdRun = run.create();
    const completeChild = Promise.withResolvers<void>();
    let disposeFinished = false;
    let childSignal: AbortSignal | undefined;

    const childFiber = createdRun(
      unabortable(async ({ signal }) => {
        childSignal = signal;
        await completeChild.promise;
        expect(signal.aborted).toBe(false);
        return ok("child");
      }),
    );

    assert(childSignal);
    const disposePromise = createdRun[Symbol.asyncDispose]().then(() => {
      disposeFinished = true;
    });

    expect(childSignal.aborted).toBe(false);
    expect(disposeFinished).toBe(false);

    completeChild.resolve();

    expect(await childFiber).toEqual(ok("child"));
    await disposePromise;
    expect(disposeFinished).toBe(true);
  });

  test("passes Fiber run to wrapped Task", async () => {
    await using run = createRun();
    let taskRun: Run | undefined;

    const fiber = run(
      unabortable((run) => {
        taskRun = run;
        return ok("done");
      }),
    );

    expect(taskRun).toBeDefined();
    expect(fiber.run).toBe(taskRun);
    expect(await fiber).toEqual(ok("done"));
  });
});

describe("unabortableMask", () => {
  test("restores abortability for selected child Tasks when used with run.abortable", async () => {
    await using run = createRun();
    const continueTask = Promise.withResolvers<void>();
    const events: Array<string> = [];

    const fiber = run.abortable(
      unabortableMask((restore) => async (run) => {
        events.push("acquire");
        await continueTask.promise;

        await run(({ signal }) => {
          events.push(`masked child aborted=${signal.aborted}`);
          return ok();
        });

        const restoredResult = await run.abortable(
          restore(() => {
            events.push("use");
            return ok();
          }),
        );
        assert(!restoredResult.ok);
        expect(restoredResult.error).toEqual({
          type: "AbortError",
          reason: explicitAbortReason,
        });

        events.push("release");
        return ok(events);
      }),
    );

    fiber.abort();
    continueTask.resolve();

    expect(await fiber).toEqual(
      ok(["acquire", "masked child aborted=false", "release"]),
    );
  });

  test("does not start after parent abort request when used with run.abortable", async () => {
    await using run = createRun();
    const continueParent = Promise.withResolvers<void>();
    let maskBodyRan = false;

    const fiber = run.abortable(async (run) => {
      await continueParent.promise;

      return await run(
        unabortableMask((restore) => async (run) => {
          maskBodyRan = true;
          return await run(restore(() => ok("restored")));
        }),
      );
    });

    fiber.abort(testAbortReason);
    continueParent.resolve();

    expect(await fiber).toEqual(err(testAbortError));
    expect(maskBodyRan).toBe(false);
  });

  test("restore works from a descendant Run in the same mask scope", async () => {
    await using run = createRun();
    const continueUse = Promise.withResolvers<void>();
    const events: Array<string> = [];

    const helper =
      (restore: <T, E>(task: Task<T, E>) => Task<T, E>): Task<void> =>
      async (run) => {
        events.push(`helper acquire aborted=${run.signal.aborted}`);

        const useResult = await run.abortable(
          restore(async ({ signal }) => {
            events.push(`helper use started aborted=${signal.aborted}`);
            await continueUse.promise;
            events.push(`helper use aborted=${signal.aborted}`);
            signal.throwIfAborted();
            return ok();
          }),
        );
        assert(!useResult.ok);
        expect(useResult.error).toEqual({
          type: "AbortError",
          reason: explicitAbortReason,
        });

        events.push(`helper release aborted=${run.signal.aborted}`);
        return ok();
      };

    const fiber = run.abortable(
      unabortableMask((restore) => async (run) => await run(helper(restore))),
    );

    fiber.abort();
    continueUse.resolve();

    expect(await fiber).toEqual(ok());
    expect(events).toEqual([
      "helper acquire aborted=false",
      "helper use started aborted=false",
      "helper use aborted=true",
      "helper release aborted=false",
    ]);
  });

  test("restore supports child Tasks with replacement deps", async () => {
    await using run = createRun(dbDep);

    const task: Task<string, never, DbDep> = unabortableMask(
      (restore) => async (run) => {
        const useSession: Task<string, never, SessionDep> = ({ deps }) => {
          expectTypeOf(deps).toEqualTypeOf<RunDefaultDeps & SessionDep>();
          expect("db" in deps).toBe(false);
          expect(deps.session).toBe(sessionDep.session);
          return ok(deps.session.userId);
        };

        return await run(restore(useSession), sessionDep);
      },
    );

    expect(await run(task)).toEqual(ok("ada"));
  });

  test("throws when abort behavior helpers wrap the same Task", async () => {
    const task: Task<void, never> = () => ok();

    expect(() => unabortable(unabortable(task))).toThrow(
      "abort behavior helpers cannot wrap the same Task",
    );

    await using run = testCreateRun();

    await expect(
      run(unabortableMask((restore) => restore(unabortable(task)))),
    ).rejects.toEqual(
      panic(
        expect.objectContaining({
          message: "abort behavior helpers cannot wrap the same Task",
        }),
      ),
    );
    expect(await run.deps.reportDefect.next()).toEqual(
      panic(
        expect.objectContaining({
          message: "abort behavior helpers cannot wrap the same Task",
        }),
      ),
    );
  });

  test("throws when called directly", async () => {
    await using run = createRun();
    const task = unabortableMask(() => () => ok());

    // eslint-disable-next-line evolu/no-direct-task-call -- Verify the direct-call guard.
    expect(() => task(run)).toThrow(
      "unabortableMask requires a masked Run; use run(task), not a direct call",
    );
  });

  // These tests intentionally exercise restore misuse. A restore helper is
  // valid only for descendant Runs still inside the mask that created it.
  describe("restore scope rejects restore", () => {
    const restoreScopeError =
      "restore is only valid inside the unabortableMask that created it";

    test("captured from a completed inner mask", async () => {
      await using run = createRun();
      let restoreFromInner:
        (<T, E>(task: Task<T, E>) => Task<T, E>) | undefined;

      const task = unabortableMask(() => async (run) => {
        await run.ok(
          unabortableMask((restore) => () => {
            restoreFromInner = restore;
            return ok();
          }),
        );

        const restore = restoreFromInner;
        assert(restore);

        expect(() => run(restore(() => ok()))).toThrow(restoreScopeError);

        return ok();
      });

      expect(await run(task)).toEqual(ok());
    });

    test("after its mask settles", async () => {
      await using run = createRun();
      let restoreFromOuter:
        (<T, E>(task: Task<T, E>) => Task<T, E>) | undefined;

      expect(
        await run(
          unabortableMask((restore) => {
            restoreFromOuter = restore;
            return () => ok();
          }),
        ),
      ).toEqual(ok());

      const restore = restoreFromOuter;
      assert(restore);

      expect(() => run(restore(() => ok()))).toThrow(restoreScopeError);
    });

    test("inside sibling mask", async () => {
      await using run = testCreateRun();
      let restoreFromFirst:
        (<T, E>(task: Task<T, E>) => Task<T, E>) | undefined;

      const task = unabortableMask(() => async (run) => {
        await run.ok(
          unabortableMask((restore) => {
            restoreFromFirst = restore;
            return () => ok();
          }),
        );

        const restore = restoreFromFirst;
        assert(restore);

        return await run(
          unabortableMask(() => (run) => run(restore(() => ok()))),
        );
      });

      await expect(run(task)).rejects.toEqual(
        panic(expect.objectContaining({ message: restoreScopeError })),
      );
      const panicAbortError = await run.deps.reportDefect.next();
      assert(AbortError.is(panicAbortError));
      expect(panicAbortError.reason).toMatchObject({
        type: "PanicAbortReason",
        defect: expect.objectContaining({ message: restoreScopeError }),
      });
    });

    test("from daemon Run", async () => {
      await using run = testCreateRun();
      const continueDaemon = Promise.withResolvers<void>();

      const fiber = run(
        unabortableMask((restore) => async (run) => {
          const daemonFiber = run.daemon(async (run) => {
            await continueDaemon.promise;

            return await run(restore(() => ok()));
          });

          continueDaemon.resolve();

          await expect(daemonFiber).resolves.toEqual(
            err(panic(expect.objectContaining({ message: restoreScopeError }))),
          );

          return ok();
        }),
      );

      expect(await fiber).toEqual(ok());
      const panicAbortError = await run.deps.reportDefect.next();
      assert(AbortError.is(panicAbortError));
      expect(panicAbortError.reason).toMatchObject({
        type: "PanicAbortReason",
        defect: expect.objectContaining({ message: restoreScopeError }),
      });
    });

    test("from created Run", async () => {
      await using run = createRun();

      expect(
        await run(
          unabortableMask((restore) => async (run) => {
            await using createdRun = run.create();

            expect(() => createdRun(restore(() => ok()))).toThrow(
              restoreScopeError,
            );

            return ok();
          }),
        ),
      ).toEqual(ok());
    });
  });

  test("nested masks restore active outer scope from descendant Runs", async () => {
    await using run = createRun();
    const continueUse = Promise.withResolvers<void>();
    const events: Array<string> = [];

    const fiber = run.abortable(
      unabortableMask((outerRestore) => async (outerRun) => {
        events.push(`outer acquire aborted=${outerRun.signal.aborted}`);

        try {
          await outerRun.ok(
            unabortableMask((innerRestore) => async (innerRun) => {
              events.push(`inner acquire aborted=${innerRun.signal.aborted}`);

              try {
                const innerUse = innerRun(
                  innerRestore(async ({ signal }) => {
                    events.push(`inner use started aborted=${signal.aborted}`);
                    await continueUse.promise;
                    events.push(`inner use aborted=${signal.aborted}`);
                    return ok();
                  }),
                );

                const outerUse = innerRun.abortable(
                  outerRestore(async ({ signal }) => {
                    events.push(`outer use started aborted=${signal.aborted}`);
                    await continueUse.promise;
                    events.push(`outer use aborted=${signal.aborted}`);
                    signal.throwIfAborted();
                    return ok();
                  }),
                );

                expect(await innerUse).toEqual(ok());
                const outerUseResult = await outerUse;
                assert(!outerUseResult.ok);
                expect(outerUseResult.error).toEqual({
                  type: "AbortError",
                  reason: explicitAbortReason,
                });
              } finally {
                events.push(`inner release aborted=${innerRun.signal.aborted}`);
              }

              return ok();
            }),
          );
        } finally {
          events.push(`outer release aborted=${outerRun.signal.aborted}`);
        }

        return ok(events);
      }),
    );

    fiber.abort();
    continueUse.resolve();

    expect(await fiber).toEqual(
      ok([
        "outer acquire aborted=false",
        "inner acquire aborted=false",
        "inner use started aborted=false",
        "outer use started aborted=false",
        "inner use aborted=false",
        "outer use aborted=true",
        "inner release aborted=false",
        "outer release aborted=false",
      ]),
    );
  });

  test("supports unabortable acquire and release with abortable use", async () => {
    await using run = createRun();
    const useStarted = Promise.withResolvers<void>();
    const continueUse = Promise.withResolvers<void>();
    const events: Array<string> = [];

    const acquire: Task<string> = ({ signal }) => {
      events.push(`acquire aborted=${signal.aborted}`);
      return ok("resource");
    };

    const operate =
      (resource: string): Task<void> =>
      async ({ signal }) => {
        events.push(`use ${resource} started aborted=${signal.aborted}`);
        useStarted.resolve();
        await continueUse.promise;
        events.push(`use ${resource} aborted=${signal.aborted}`);

        signal.throwIfAborted();
        return ok();
      };

    const release =
      (resource: string): Task<void> =>
      ({ signal }) => {
        events.push(`release ${resource} aborted=${signal.aborted}`);
        return ok();
      };

    const fiber = run.abortable(
      unabortableMask((restore) => async (run) => {
        const resource = await run.ok(acquire);

        try {
          return await run(restore(operate(resource)));
        } finally {
          await run.ok(release(resource));
        }
      }),
    );

    await useStarted.promise;
    fiber.abort();
    continueUse.resolve();

    const result = await fiber;
    assert(!result.ok);
    expect(result.error).toEqual({
      type: "AbortError",
      reason: explicitAbortReason,
    });
    expect(events).toEqual([
      "acquire aborted=false",
      "use resource started aborted=false",
      "use resource aborted=true",
      "release resource aborted=false",
    ]);
  });

  test("does not enter nested unabortableMask after abort request", async () => {
    await using run = createRun();
    const useStarted = Promise.withResolvers<void>();
    const continueUse = Promise.withResolvers<void>();
    const events: Array<string> = [];

    const fiber = run.abortable(
      unabortableMask((restore) => async (run) => {
        try {
          await run(
            restore(async ({ signal }) => {
              events.push(`use started aborted=${signal.aborted}`);
              useStarted.resolve();
              await continueUse.promise;
              events.push(`use aborted=${signal.aborted}`);

              signal.throwIfAborted();
              return ok();
            }),
          );
        } finally {
          await run(
            unabortableMask(() => ({ signal }) => {
              events.push(`nested mask entered aborted=${signal.aborted}`);
              return ok();
            }),
          );
        }

        return ok();
      }),
    );

    await useStarted.promise;
    fiber.abort();
    continueUse.resolve();

    const result = await fiber;
    assert(!result.ok);
    expect(result.error).toEqual({
      type: "AbortError",
      reason: explicitAbortReason,
    });
    expect(events).toEqual(["use started aborted=false", "use aborted=true"]);
  });
});

describe("acquireUseRelease", () => {
  test("masks acquire and release while restoring use", async () => {
    await using run = createRun();
    const useStarted = Promise.withResolvers<void>();
    const continueUse = Promise.withResolvers<void>();
    const events: Array<string> = [];

    const acquire: Task<string> = ({ signal }) => {
      events.push(`acquire aborted=${signal.aborted}`);
      return ok("resource");
    };

    const operate =
      (resource: string): Task<void> =>
      async ({ signal }) => {
        events.push(`use ${resource} started aborted=${signal.aborted}`);
        useStarted.resolve();
        await continueUse.promise;
        events.push(`use ${resource} aborted=${signal.aborted}`);

        signal.throwIfAborted();
        return ok();
      };

    const release =
      (resource: string): Task<void> =>
      ({ signal }) => {
        events.push(`release ${resource} aborted=${signal.aborted}`);
        return ok();
      };

    const fiber = run.abortable(acquireUseRelease(acquire, operate, release));

    await useStarted.promise;
    fiber.abort();
    continueUse.resolve();

    const result = await fiber;
    assert(!result.ok);
    expect(result.error).toEqual({
      type: "AbortError",
      reason: explicitAbortReason,
    });
    expect(events).toEqual([
      "acquire aborted=false",
      "use resource started aborted=false",
      "use resource aborted=true",
      "release resource aborted=false",
    ]);
  });

  test("skips release when acquire fails", async () => {
    await using run = createRun();
    const acquireError = { type: "AcquireError" } as const;
    let useRan = false;
    let releaseRan = false;

    const result = await run(
      acquireUseRelease(
        () => err(acquireError),
        (): Task<void> => () => {
          useRan = true;
          return ok();
        },
        (): Task<void> => () => {
          releaseRan = true;
          return ok();
        },
      ),
    );

    expectErr(result, acquireError);
    expect(useRan).toBe(false);
    expect(releaseRan).toBe(false);
  });

  test("runs release when use returns Err", async () => {
    await using run = createRun();
    const useError = { type: "UseError" } as const;
    let released = false;

    const result = await run(
      acquireUseRelease(
        () => ok("resource"),
        () => () => err(useError),
        () => () => {
          released = true;
          return ok();
        },
      ),
    );

    expectErr(result, useError);
    expect(released).toBe(true);
  });

  test("runs release when use defects", async () => {
    await using run = testCreateRun();
    const defect = new Error("boom");
    let released = false;

    await expect(
      run(
        acquireUseRelease(
          () => ok("resource"),
          () => () => {
            throw defect;
          },
          () => () => {
            released = true;
            return ok();
          },
        ),
      ),
    ).rejects.toEqual(panic(defect));

    expect(released).toBe(true);
    expect(await run.deps.reportDefect.next()).toEqual(panic(defect));
  });

  test("release defect overrides use result", async () => {
    await using run = testCreateRun();
    const useError = { type: "UseError" } as const;
    const releaseDefect = new Error("release failed");

    await expect(
      run(
        acquireUseRelease(
          () => ok("resource"),
          () => () => err(useError),
          () => () => {
            throw releaseDefect;
          },
        ),
      ),
    ).rejects.toEqual(panic(releaseDefect));
    expect(await run.deps.reportDefect.next()).toEqual(panic(releaseDefect));
  });

  test("does not start acquireUseRelease after parent abort request", async () => {
    await using run = createRun();
    const continueParent = Promise.withResolvers<void>();
    let acquired = false;

    const fiber = run.abortable(async (run) => {
      await continueParent.promise;

      return await run(
        acquireUseRelease(
          () => {
            acquired = true;
            return ok("resource");
          },
          () => () => ok(),
          () => () => ok(),
        ),
      );
    });

    fiber.abort(testAbortReason);
    continueParent.resolve();

    expect(await fiber).toEqual(err(testAbortError));
    expect(acquired).toBe(false);
  });
});

describe("native AbortSignal APIs", () => {
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

describe("Deferred", () => {
  test("resolves a waiting Task with Ok", async () => {
    await using run = createRun();

    const deferred = createDeferred<string>();

    const fiber = run(deferred.task);

    expect(fiber.run.getState()).toEqual({ type: "Running" });

    deferred.resolve(ok("value"));

    expect(await fiber).toEqual(ok("value"));
  });

  test("resolves all waiting Tasks", async () => {
    await using run = createRun();

    const deferred = createDeferred<string>();
    const first = run(deferred.task);
    const second = run(deferred.task);

    deferred.resolve(ok("value"));

    expect(await first).toEqual(ok("value"));
    expect(await second).toEqual(ok("value"));
  });

  test("resolves a waiting Task with Err", async () => {
    await using run = createRun();

    const myError = { type: "MyError" } as const;
    const deferred = createDeferred<string, typeof myError>();
    const fiber = run(deferred.task);

    expect(fiber.run.getState()).toEqual({ type: "Running" });

    deferred.resolve(err(myError));

    expect(await fiber).toEqual(err(myError));
  });

  test("can still resolve after a waiter aborts", async () => {
    await using run = createRun();

    const deferred = createDeferred<string>();
    const fiber = run.abortable(deferred.task);

    expect(fiber.run.getState()).toEqual({ type: "Running" });

    fiber.abort(testAbortReason);

    expect(await fiber).toEqual(err(testAbortError));

    deferred.resolve(ok("value"));

    expect(await run(deferred.task)).toEqual(ok("value"));
  });

  test("resolves a Task started after resolving", async () => {
    await using run = createRun();

    const deferred = createDeferred<string>();
    deferred.resolve(ok("value"));

    expect(await run(deferred.task)).toEqual(ok("value"));
  });

  test("ignores resolving after already resolved", async () => {
    await using run = createRun();

    const deferred = createDeferred<string>();
    expect(deferred.resolve(ok("value"))).toBe(true);
    expect(deferred.resolve(ok("later"))).toBe(false);

    expect(await run(deferred.task)).toEqual(ok("value"));
  });

  test("aborting one waiter does not affect other waiters", async () => {
    await using run = createRun();

    const deferred = createDeferred<string>();
    const first = run.abortable(deferred.task);
    const second = run.abortable(deferred.task);

    first.abort(testAbortReason);
    expect(await first).toEqual(err(testAbortError));
    expect(second.run.getState()).toEqual({ type: "Running" });

    deferred.resolve(ok("value"));

    expect(await second).toEqual(ok("value"));
  });
});

describe("Gate", () => {
  describe("wait", () => {
    test("blocks until gate opens", async () => {
      await using run = createRun();

      const gate = createGate();
      const events: Array<string> = [];

      const fiber = run(async (run) => {
        events.push("waiting");
        await run.ok(gate.wait);
        events.push("passed");
        return ok();
      });

      expect(events).toEqual(["waiting"]);
      expect(gate.isOpen()).toBe(false);

      gate.open();

      expect(await fiber).toEqual(ok());
      expect(events).toEqual(["waiting", "passed"]);
      expect(gate.isOpen()).toBe(true);
    });

    test("returns immediately when gate is already open", async () => {
      await using run = createRun();

      const gate = createGate();

      gate.open();

      await run.ok(gate.wait);
    });

    test("returns immediately when gate is created open", async () => {
      await using run = createRun();

      const gate = createGate({ isOpen: true });

      expect(gate.isOpen()).toBe(true);

      await run.ok(gate.wait);
    });
  });

  describe("open", () => {
    test("resolves all waiting Tasks", async () => {
      await using run = createRun();

      const gate = createGate();
      const events: Array<string> = [];

      const firstFiber = run(async (run) => {
        events.push("first waiting");
        await run.ok(gate.wait);
        events.push("first passed");
        return ok();
      });

      const secondFiber = run(async (run) => {
        events.push("second waiting");
        await run.ok(gate.wait);
        events.push("second passed");
        return ok();
      });

      expect(events).toEqual(["first waiting", "second waiting"]);

      gate.open();

      expect(await Promise.all([firstFiber, secondFiber])).toEqual([
        ok(),
        ok(),
      ]);
      expect(events).toEqual([
        "first waiting",
        "second waiting",
        "first passed",
        "second passed",
      ]);
    });
  });

  describe("close", () => {
    test("makes future Tasks wait", async () => {
      await using run = createRun();

      const gate = createGate();
      const events: Array<string> = [];

      gate.open();
      await run.ok(gate.wait);
      gate.close();

      const fiber = run(async (run) => {
        events.push("waiting");
        await run.ok(gate.wait);
        events.push("passed");
        return ok();
      });

      expect(events).toEqual(["waiting"]);
      expect(gate.isOpen()).toBe(false);

      gate.open();

      expect(await fiber).toEqual(ok());
      expect(events).toEqual(["waiting", "passed"]);
    });

    test("keeps future waiters blocked until open", async () => {
      await using run = createRun();
      const continueParent = Promise.withResolvers<void>();

      const gate = createGate();

      gate.open();
      gate.close();

      const fiber = run.abortable(async (run) => {
        await continueParent.promise;
        return await run(gate.wait);
      });

      fiber.abort(testAbortReason);
      continueParent.resolve();

      expect(await fiber).toEqual(err(testAbortError));

      gate.open();

      expect(await run(gate.wait)).toEqual(ok());
    });
  });

  describe("release", () => {
    test("resolves current waiters without opening gate", async () => {
      await using run = createRun();
      const continueFuture = Promise.withResolvers<void>();

      const gate = createGate();
      const events: Array<string> = [];

      const firstFiber = run(async (run) => {
        events.push("first waiting");
        await run.ok(gate.wait);
        events.push("first passed");
        return ok();
      });

      const secondFiber = run(async (run) => {
        events.push("second waiting");
        await run.ok(gate.wait);
        events.push("second passed");
        return ok();
      });

      expect(events).toEqual(["first waiting", "second waiting"]);

      expect(gate.release()).toBe(true);

      expect(await Promise.all([firstFiber, secondFiber])).toEqual([
        ok(),
        ok(),
      ]);
      expect(events).toEqual([
        "first waiting",
        "second waiting",
        "first passed",
        "second passed",
      ]);
      expect(gate.isOpen()).toBe(false);

      const futureFiber = run.abortable(async (run) => {
        events.push("future waiting");
        await continueFuture.promise;
        return await run(gate.wait);
      });

      expect(events).toEqual([
        "first waiting",
        "second waiting",
        "first passed",
        "second passed",
        "future waiting",
      ]);

      futureFiber.abort(testAbortReason);
      continueFuture.resolve();

      expect(await futureFiber).toEqual(err(testAbortError));
    });

    test("reports false when gate is open", () => {
      const gate = createGate();

      gate.open();

      expect(gate.release()).toBe(false);
      expect(gate.isOpen()).toBe(true);
    });

    test("reports true for a closed gate without waiters", () => {
      const gate = createGate();

      expect(gate.release()).toBe(true);
      expect(gate.isOpen()).toBe(false);
    });
  });

  describe("state changes", () => {
    test("open and close report whether state changed", () => {
      const gate = createGate();

      expect(gate.open()).toBe(true);
      expect(gate.open()).toBe(false);

      expect(gate.close()).toBe(true);
      expect(gate.close()).toBe(false);
    });
  });
});

describe("Semaphore", () => {
  describe("withPermit", () => {
    test("holds one permit while the Task runs", async () => {
      await using run = createRun();

      const semaphore = createSemaphore(1);
      const completeTask = Promise.withResolvers<void>();

      const fiber = run(
        semaphore.withPermit(async () => {
          expect(semaphore.snapshot()).toMatchObject({
            taken: 1,
            available: 0,
          });

          await completeTask.promise;
          return ok("value");
        }),
      );

      completeTask.resolve();

      expect(await fiber).toEqual(ok("value"));
      expect(semaphore.snapshot()).toMatchObject({ taken: 0, isIdle: true });
    });
  });

  describe("withPermits", () => {
    test("returns a Task preserving error and dependency types", () => {
      interface MyError {
        readonly type: "MyError";
      }

      const semaphore = createSemaphore(1);
      const task: Task<string, MyError, DbDep> = () => ok("value");

      expectTypeOf(semaphore.withPermits(1)(task)).toEqualTypeOf<
        Task<string, MyError, DbDep>
      >();
    });

    test("runs a Task while holding permits", async () => {
      await using run = createRun();

      const semaphore = createSemaphore(3);

      const result = await run(
        semaphore.withPermits(2)(() => {
          expect(semaphore.snapshot()).toMatchObject({
            taken: 2,
            available: 1,
          });
          return ok("value");
        }),
      );

      expectOk(result, "value");
    });

    test("waits until enough permits are released", async () => {
      await using run = createRun();

      const semaphore = createSemaphore(2);
      const firstTaskStarted = Promise.withResolvers<void>();
      const completeFirstTask = Promise.withResolvers<void>();
      const events: Array<string> = [];

      const firstFiber = run(
        semaphore.withPermits(2)(async () => {
          events.push("first acquired");
          firstTaskStarted.resolve();
          await completeFirstTask.promise;
          events.push("first completed");
          return ok("first");
        }),
      );

      await firstTaskStarted.promise;

      const secondFiber = run(
        semaphore.withPermits(1)(() => {
          events.push("second acquired");
          return ok("second");
        }),
      );

      expect(semaphore.snapshot()).toMatchObject({
        taken: 2,
        waiters: [{ permits: 1 }],
      });
      expect(events).toEqual(["first acquired"]);

      completeFirstTask.resolve();

      expect(await firstFiber).toEqual(ok("first"));
      expect(await secondFiber).toEqual(ok("second"));
      expect(events).toEqual([
        "first acquired",
        "first completed",
        "second acquired",
      ]);
      expect(semaphore.snapshot()).toMatchObject({ taken: 0, waiters: [] });
    });

    test("removes queued waiter when aborted before acquisition", async () => {
      await using run = createRun();

      const semaphore = createSemaphore(1);
      let taskStarted = false;

      using held = await run.ok(semaphore.take(1));

      const fiber = run.abortable(
        semaphore.withPermits(1)(() => {
          taskStarted = true;
          return ok();
        }),
      );

      expect(semaphore.snapshot()).toMatchObject({
        taken: 1,
        waiters: [{ permits: 1 }],
      });

      fiber.abort(testAbortReason);
      await Promise.resolve();

      expect(semaphore.snapshot()).toMatchObject({
        taken: 1,
        waiters: [],
      });
      expect(taskStarted).toBe(false);

      held.release();

      expect(await fiber).toEqual(err(testAbortError));
    });

    test("releases permits after Ok", async () => {
      await using run = createRun();

      const semaphore = createSemaphore(2);

      const result = await run(semaphore.withPermits(2)(() => ok("value")));

      expectOk(result, "value");
      expect(semaphore.snapshot()).toMatchObject({ taken: 0, isIdle: true });
    });

    test("releases permits after Err", async () => {
      await using run = createRun();

      const semaphore = createSemaphore(2);

      const result = await run(
        semaphore.withPermits(2)(() => {
          expect(semaphore.snapshot()).toMatchObject({ taken: 2 });
          return err("error");
        }),
      );

      expectErr(result, "error");
      expect(semaphore.snapshot()).toMatchObject({ taken: 0, isIdle: true });
    });

    test("releases permits after abort", async () => {
      await using run = createRun();

      const semaphore = createSemaphore(2);
      const taskStarted = Promise.withResolvers<void>();

      const fiber = run.abortable(
        semaphore.withPermits(2)(async (run) => {
          expect(semaphore.snapshot()).toMatchObject({ taken: 2 });
          taskStarted.resolve();
          await run.ok(
            callback(({ run: { signal } }) => {
              expect(signal.aborted).toBe(false);
            }),
          );
          return ok();
        }),
      );

      await taskStarted.promise;
      fiber.abort(testAbortReason);

      expect(await fiber).toEqual(err(testAbortError));
      expect(semaphore.snapshot()).toMatchObject({ taken: 0, isIdle: true });
    });
  });

  describe("withPermitsIfAvailable", () => {
    test("returns a Task of Option and preserves error and dependency types", () => {
      interface MyError {
        readonly type: "MyError";
      }

      const semaphore = createSemaphore(1);
      const task: Task<string, MyError, DbDep> = () => ok("value");

      expectTypeOf(semaphore.withPermitsIfAvailable(1)(task)).toEqualTypeOf<
        Task<Option<string>, MyError, DbDep>
      >();
    });

    test("returns Some after running the Task while holding permits", async () => {
      await using run = createRun();

      const semaphore = createSemaphore(2);

      const result = await run(
        semaphore.withPermitsIfAvailable(2)(() => {
          expect(semaphore.snapshot()).toMatchObject({ taken: 2 });
          return ok("value");
        }),
      );

      expectOk(result, some("value"));
      expect(semaphore.snapshot()).toMatchObject({ taken: 0, isIdle: true });
    });

    test("returns None without queueing when permits are unavailable", async () => {
      await using run = createRun();

      const semaphore = createSemaphore(1);
      let taskStarted = false;

      const result = await run(
        semaphore.withPermitsIfAvailable(2)(() => {
          taskStarted = true;
          return ok("value");
        }),
      );

      expectOk(result, none);
      expect(taskStarted).toBe(false);
      expect(semaphore.snapshot()).toMatchObject({ taken: 0, waiters: [] });
    });

    test("returns None in FIFO when waiters exist", async () => {
      await using run = createRun();

      const semaphore = createSemaphore(3);
      let taskStarted = false;

      using firstPermit = await run.ok(semaphore.take(2));

      const waitingFiber = run.abortable(semaphore.take(2));

      expect(semaphore.snapshot()).toMatchObject({
        taken: 2,
        waiters: [{ permits: 2 }],
        available: 0,
      });

      const result = await run(
        semaphore.withPermitsIfAvailable(1)(() => {
          taskStarted = true;
          return ok("value");
        }),
      );

      expectOk(result, none);
      expect(taskStarted).toBe(false);

      waitingFiber.abort(testAbortReason);
      expect(await waitingFiber).toEqual(err(testAbortError));
      firstPermit.release();
    });

    test("bypasses waiters in greedy policy", async () => {
      await using run = createRun();

      const semaphore = createSemaphore(3, { policy: "greedy" });

      using firstPermit = await run.ok(semaphore.take(2));

      const waitingFiber = run.abortable(semaphore.take(2));

      expect(semaphore.snapshot()).toMatchObject({
        taken: 2,
        waiters: [{ permits: 2 }],
        available: 1,
      });

      const result = await run(
        semaphore.withPermitsIfAvailable(1)(() => ok("value")),
      );

      expectOk(result, some("value"));

      waitingFiber.abort(testAbortReason);
      expect(await waitingFiber).toEqual(err(testAbortError));
      firstPermit.release();
    });

    test("releases permits after Err", async () => {
      await using run = createRun();

      const semaphore = createSemaphore(1);

      const result = await run(
        semaphore.withPermitsIfAvailable(1)(() => err("error")),
      );

      expectErr(result, "error");
      expect(semaphore.snapshot()).toMatchObject({ taken: 0, isIdle: true });
    });

    test("releases permits after abort", async () => {
      await using run = createRun();

      const semaphore = createSemaphore(1);
      const taskStarted = Promise.withResolvers<void>();

      const fiber = run.abortable(
        semaphore.withPermitsIfAvailable(1)(async (run) => {
          expect(semaphore.snapshot()).toMatchObject({ taken: 1 });
          taskStarted.resolve();
          await run.ok(
            callback(({ run: { signal } }) => {
              expect(signal.aborted).toBe(false);
            }),
          );
          return ok("value");
        }),
      );

      await taskStarted.promise;
      fiber.abort(testAbortReason);

      expect(await fiber).toEqual(err(testAbortError));
      expect(semaphore.snapshot()).toMatchObject({ taken: 0, isIdle: true });
    });
  });

  describe("take", () => {
    test("reports a leaked permit", async () => {
      await using run = testCreateRun();

      const semaphore = createSemaphore(1);
      await run.ok(semaphore.take(1));

      expect(run.deps.leakDetector.collect()).toBe(1);
    });

    test("returns a permit when enough permits are available", async () => {
      await using run = createRun();

      const semaphore = createSemaphore(2);

      using permit = await run.ok(semaphore.take(1));

      expect(permit.permits).toBe(1);
    });

    test("waits until enough permits are released", async () => {
      await using run = createRun();

      const semaphore = createSemaphore(1);
      const events: Array<string> = [];

      using firstPermit = await run.ok(semaphore.take(1));

      const secondFiber = run(async (run) => {
        events.push("waiting");
        using permit = await run.ok(semaphore.take(1));
        events.push(`acquired ${permit.permits}`);
        return ok();
      });

      expect(semaphore.snapshot()).toMatchObject({
        taken: 1,
        waiters: [{ permits: 1 }],
      });
      expect(events).toEqual(["waiting"]);

      firstPermit.release();

      expect(await secondFiber).toEqual(ok());
      expect(events).toEqual(["waiting", "acquired 1"]);
    });

    test("serves waiters in FIFO order by default", async () => {
      await using run = createRun();

      const semaphore = createSemaphore(3);
      const events: Array<string> = [];

      using firstPermit = await run.ok(semaphore.take(2));

      const largerFiber = run(async (run) => {
        events.push("larger requesting");
        using permit = await run.ok(semaphore.take(2));
        events.push(`larger acquired ${permit.permits}`);
        return ok();
      });

      expect(semaphore.snapshot()).toMatchObject({
        taken: 2,
        waiters: [{ permits: 2 }],
      });

      const smallerFiber = run(async (run) => {
        events.push("smaller requesting");
        using permit = await run.ok(semaphore.take(1));
        events.push(`smaller acquired ${permit.permits}`);
        return ok();
      });

      expect(semaphore.snapshot()).toMatchObject({
        taken: 2,
        waiters: [{ permits: 2 }, { permits: 1 }],
      });
      expect(events).toEqual(["larger requesting", "smaller requesting"]);

      // Re-drive the queue without changing capacity; FIFO must still not let
      // the smaller waiter bypass the older larger waiter.
      semaphore.resize(3);

      expect(semaphore.snapshot()).toMatchObject({
        taken: 2,
        waiters: [{ permits: 2 }, { permits: 1 }],
      });

      firstPermit.release();

      expect(await largerFiber).toEqual(ok());
      expect(await smallerFiber).toEqual(ok());
      expect(events).toEqual([
        "larger requesting",
        "smaller requesting",
        "larger acquired 2",
        "smaller acquired 1",
      ]);
    });

    test("greedy policy grants compatible waiters before earlier blocked waiters", async () => {
      await using run = createRun();

      const semaphore = createSemaphore(3, { policy: "greedy" });
      const events: Array<string> = [];

      using firstPermit = await run.ok(semaphore.take(2));

      const largerFiber = run(async (run) => {
        events.push("larger requesting");
        using permit = await run.ok(semaphore.take(2));
        events.push(`larger acquired ${permit.permits}`);
        return ok();
      });

      expect(semaphore.snapshot()).toMatchObject({
        taken: 2,
        waiters: [{ permits: 2 }],
      });

      const smallerFiber = run(async (run) => {
        events.push("smaller requesting");
        using permit = await run.ok(semaphore.take(1));
        events.push(`smaller acquired ${permit.permits}`);
        return ok();
      });

      expect(await smallerFiber).toEqual(ok());
      expect(events).toEqual([
        "larger requesting",
        "smaller requesting",
        "smaller acquired 1",
      ]);

      firstPermit.release();

      expect(await largerFiber).toEqual(ok());
      expect(events).toEqual([
        "larger requesting",
        "smaller requesting",
        "smaller acquired 1",
        "larger acquired 2",
      ]);
    });

    test("greedy release grants later compatible queued waiter", async () => {
      await using run = createRun();

      const semaphore = createSemaphore(3, { policy: "greedy" });
      const events: Array<string> = [];

      using firstPermit = await run.ok(semaphore.take(2));
      using secondPermit = await run.ok(semaphore.take(1));

      const largerFiber = run(async (run) => {
        events.push("larger requesting");
        using permit = await run.ok(semaphore.take(2));
        events.push(`larger acquired ${permit.permits}`);
        return ok();
      });

      const smallerFiber = run(async (run) => {
        events.push("smaller requesting");
        using permit = await run.ok(semaphore.take(1));
        events.push(`smaller acquired ${permit.permits}`);
        return ok();
      });

      expect(semaphore.snapshot()).toMatchObject({
        taken: 3,
        waiters: [{ permits: 2 }, { permits: 1 }],
      });

      secondPermit.release();

      expect(await smallerFiber).toEqual(ok());
      expect(events).toEqual([
        "larger requesting",
        "smaller requesting",
        "smaller acquired 1",
      ]);
      expect(semaphore.snapshot()).toMatchObject({
        taken: 2,
        waiters: [{ permits: 2 }],
      });

      firstPermit.release();

      expect(await largerFiber).toEqual(ok());
      expect(events).toEqual([
        "larger requesting",
        "smaller requesting",
        "smaller acquired 1",
        "larger acquired 2",
      ]);
    });

    test("disposing a permit releases its permits", async () => {
      await using run = createRun();

      const semaphore = createSemaphore(2);

      {
        using _permit = await run.ok(semaphore.take(2));
        expect(semaphore.snapshot()).toMatchObject({ taken: 2, isIdle: false });
      }

      expect(semaphore.snapshot()).toMatchObject({ taken: 0, isIdle: true });
    });

    test("permit release is idempotent", async () => {
      await using run = createRun();

      const semaphore = createSemaphore(1);
      const permit = await run.ok(semaphore.take(1));

      expect(permit.release()).toBe(true);
      expect(permit.release()).toBe(false);
      expect(semaphore.snapshot()).toMatchObject({ taken: 0, isIdle: true });
    });

    test("aborting a waiter removes it from the queue", async () => {
      await using run = createRun();

      const semaphore = createSemaphore(1);

      using _permit = await run.ok(semaphore.take(1));

      const waiterFiber = run.abortable(semaphore.take(1));

      expect(semaphore.snapshot()).toMatchObject({
        taken: 1,
        waiters: [{ permits: 1 }],
      });

      waiterFiber.abort(testAbortReason);

      expect(await waiterFiber).toEqual(err(testAbortError));
      expect(semaphore.snapshot()).toMatchObject({ taken: 1, waiters: [] });
    });

    test("aborting FIFO head releases later compatible waiter", async () => {
      await using run = createRun();

      const semaphore = createSemaphore(3);

      using firstPermit = await run.ok(semaphore.take(2));

      const largerFiber = run.abortable(semaphore.take(2));
      const smallerFiber = run(async (run) => {
        using permit = await run.ok(semaphore.take(1));
        return ok(permit.permits);
      });

      expect(semaphore.snapshot()).toMatchObject({
        taken: 2,
        waiters: [{ permits: 2 }, { permits: 1 }],
      });

      largerFiber.abort(testAbortReason);

      expect(await largerFiber).toEqual(err(testAbortError));
      expect(await smallerFiber).toEqual(ok(1));
      expect(semaphore.snapshot()).toMatchObject({ taken: 2, waiters: [] });

      firstPermit.release();
    });

    test("aborting one waiter does not affect other waiters", async () => {
      await using run = createRun();

      const semaphore = createSemaphore(1);

      using firstPermit = await run.ok(semaphore.take(1));

      const firstWaiterFiber = run.abortable(semaphore.take(1));
      const secondWaiterFiber = run(async (run) => {
        using permit = await run.ok(semaphore.take(1));
        return ok(permit.permits);
      });

      expect(semaphore.snapshot()).toMatchObject({
        taken: 1,
        waiters: [{ permits: 1 }, { permits: 1 }],
      });

      firstWaiterFiber.abort(testAbortReason);

      expect(await firstWaiterFiber).toEqual(err(testAbortError));
      expect(semaphore.snapshot()).toMatchObject({
        taken: 1,
        waiters: [{ permits: 1 }],
      });

      firstPermit.release();

      expect(await secondWaiterFiber).toEqual(ok(1));
      expect(semaphore.snapshot()).toMatchObject({ taken: 0, waiters: [] });
    });
  });

  describe("resize", () => {
    test("asserts positive permit count at runtime", () => {
      const semaphore = createSemaphore(1);
      const permits = 0 as unknown as Int1To100OrPositiveInt;

      expect(() => semaphore.resize(permits)).toThrow();
    });

    test("resize increases capacity and releases waiting Tasks", async () => {
      await using run = createRun();

      const semaphore = createSemaphore(1);
      const events: Array<string> = [];

      const fiber = run(async (run) => {
        events.push("waiting");
        using permit = await run.ok(semaphore.take(2));
        events.push(`acquired ${permit.permits}`);
        return ok();
      });

      expect(semaphore.snapshot()).toMatchObject({
        waiters: [{ permits: 2 }],
      });
      expect(events).toEqual(["waiting"]);

      semaphore.resize(2);

      expect(await fiber).toEqual(ok());
      expect(events).toEqual(["waiting", "acquired 2"]);
      expect(semaphore.snapshot()).toMatchObject({
        permits: 2,
        taken: 0,
        isIdle: true,
      });
    });

    test("resize decreases capacity without releasing held permits", async () => {
      await using run = createRun();

      const semaphore = createSemaphore(2);

      using permit = await run.ok(semaphore.take(2));

      semaphore.resize(1);

      expect(semaphore.snapshot()).toMatchObject({
        permits: 1,
        taken: 2,
        available: 0,
        isIdle: false,
      });

      permit.release();

      expect(semaphore.snapshot()).toMatchObject({
        permits: 1,
        taken: 0,
        available: 1,
        isIdle: true,
      });
    });
  });

  describe("snapshot", () => {
    test("reports available, taken, waiters, and idle state", async () => {
      await using run = createRun();

      const semaphore = createSemaphore(2);

      expect(semaphore.snapshot()).toEqual({
        policy: "fifo",
        permits: 2,
        taken: 0,
        waiters: [],
        available: 2,
        isIdle: true,
      });

      const firstPermit = await run.ok(semaphore.take(1));
      const waiterFiber = run(async (run) => {
        using _permit = await run.ok(semaphore.take(2));
        return ok();
      });

      expect(semaphore.snapshot()).toEqual({
        policy: "fifo",
        permits: 2,
        taken: 1,
        waiters: [{ permits: 2 }],
        available: 0,
        isIdle: false,
      });

      firstPermit.release();

      expect(await waiterFiber).toEqual(ok());
      expect(semaphore.snapshot()).toEqual({
        policy: "fifo",
        permits: 2,
        taken: 0,
        waiters: [],
        available: 2,
        isIdle: true,
      });
    });
  });

  describe("isIdle", () => {
    test("reports whether no permits are held and no requests are queued", async () => {
      await using run = createRun();

      const semaphore = createSemaphore(1);

      expect(semaphore.isIdle()).toBe(true);

      const firstPermit = await run.ok(semaphore.take(1));
      const waiterFiber = run.abortable(semaphore.take(1));

      expect(semaphore.isIdle()).toBe(false);

      waiterFiber.abort(testAbortReason);
      expect(await waiterFiber).toEqual(err(testAbortError));
      expect(semaphore.isIdle()).toBe(false);

      firstPermit.release();

      expect(semaphore.isIdle()).toBe(true);
    });
  });
});

describe("Mutex", () => {
  describe("withLock", () => {
    test("returns a Task preserving error and dependency types", () => {
      interface MyError {
        readonly type: "MyError";
      }

      const mutex = createMutex();
      const task: Task<string, MyError, DbDep> = () => ok("value");

      expectTypeOf(mutex.withLock(task)).toEqualTypeOf<
        Task<string, MyError, DbDep>
      >();
    });

    test("runs one Task at a time", async () => {
      await using run = createRun();

      const mutex = createMutex();
      const firstTaskStarted = Promise.withResolvers<void>();
      const completeFirstTask = Promise.withResolvers<void>();
      const events: Array<string> = [];

      const firstFiber = run(
        mutex.withLock(async () => {
          events.push("first acquired");
          firstTaskStarted.resolve();
          await completeFirstTask.promise;
          events.push("first completed");
          return ok("first");
        }),
      );

      await firstTaskStarted.promise;

      const secondFiber = run(
        mutex.withLock(() => {
          events.push("second acquired");
          return ok("second");
        }),
      );

      expect(mutex.snapshot()).toMatchObject({
        taken: 1,
        waiters: [{ permits: 1 }],
      });
      expect(events).toEqual(["first acquired"]);

      completeFirstTask.resolve();

      expect(await firstFiber).toEqual(ok("first"));
      expect(await secondFiber).toEqual(ok("second"));
      expect(events).toEqual([
        "first acquired",
        "first completed",
        "second acquired",
      ]);
      expect(mutex.snapshot()).toMatchObject({ taken: 0, isIdle: true });
    });

    test("releases the lock after Err", async () => {
      await using run = createRun();

      const mutex = createMutex();

      const result = await run(
        mutex.withLock(() => {
          expect(mutex.snapshot()).toMatchObject({ taken: 1 });
          return err("error");
        }),
      );

      expectErr(result, "error");
      expect(mutex.snapshot()).toMatchObject({ taken: 0, isIdle: true });
      expect(await run(mutex.withLock(() => ok("next")))).toEqual(ok("next"));
    });

    test("releases the lock after abort", async () => {
      await using run = createRun();

      const mutex = createMutex();
      const taskStarted = Promise.withResolvers<void>();

      const fiber = run.abortable(
        mutex.withLock(async (run) => {
          expect(mutex.snapshot()).toMatchObject({ taken: 1 });
          taskStarted.resolve();
          await run.ok(
            callback(({ run: { signal } }) => {
              expect(signal.aborted).toBe(false);
            }),
          );
          return ok();
        }),
      );

      await taskStarted.promise;
      fiber.abort(testAbortReason);

      expect(await fiber).toEqual(err(testAbortError));
      expect(mutex.snapshot()).toMatchObject({ taken: 0, isIdle: true });
      expect(await run(mutex.withLock(() => ok("next")))).toEqual(ok("next"));
    });
  });

  describe("snapshot", () => {
    test("reports the underlying semaphore state", async () => {
      await using run = createRun();

      const mutex = createMutex();

      expect(mutex.snapshot()).toEqual({
        policy: "fifo",
        permits: 1,
        taken: 0,
        waiters: [],
        available: 1,
        isIdle: true,
      });

      const completeFirstTask = Promise.withResolvers<void>();
      const firstTaskStarted = Promise.withResolvers<void>();

      const firstFiber = run(
        mutex.withLock(async () => {
          firstTaskStarted.resolve();
          await completeFirstTask.promise;
          return ok("first");
        }),
      );

      await firstTaskStarted.promise;

      const secondFiber = run(mutex.withLock(() => ok("second")));

      expect(mutex.snapshot()).toEqual({
        policy: "fifo",
        permits: 1,
        taken: 1,
        waiters: [{ permits: 1 }],
        available: 0,
        isIdle: false,
      });

      completeFirstTask.resolve();

      expect(await firstFiber).toEqual(ok("first"));
      expect(await secondFiber).toEqual(ok("second"));
      expect(mutex.snapshot()).toEqual({
        policy: "fifo",
        permits: 1,
        taken: 0,
        waiters: [],
        available: 1,
        isIdle: true,
      });
    });
  });
});

describe("SemaphoreByKey", () => {
  test("createSemaphoreByKey requires initial permits", () => {
    // @ts-expect-error - initial permits are required.
    createSemaphoreByKey<string>();
  });

  describe("withPermit", () => {
    test("serializes Tasks with the same key", async () => {
      await using run = createRun();

      const semaphoreByKey = createSemaphoreByKey<string>(1);
      const firstTaskStarted = Promise.withResolvers<void>();
      const completeFirstTask = Promise.withResolvers<void>();
      const events: Array<string> = [];

      const firstFiber = run(
        semaphoreByKey.withPermit("shared", async () => {
          events.push("first acquired");
          firstTaskStarted.resolve();
          await completeFirstTask.promise;
          events.push("first completed");
          return ok("first");
        }),
      );

      await firstTaskStarted.promise;

      const secondFiber = run(
        semaphoreByKey.withPermit("shared", () => {
          events.push("second acquired");
          return ok("second");
        }),
      );

      expect(events).toEqual(["first acquired"]);

      completeFirstTask.resolve();

      expect(await firstFiber).toEqual(ok("first"));
      expect(await secondFiber).toEqual(ok("second"));
      expect(events).toEqual([
        "first acquired",
        "first completed",
        "second acquired",
      ]);
    });

    test("uses lookup to share permits for logically equal keys", async () => {
      await using run = createRun();

      const semaphoreByKey = createSemaphoreByKey<{ readonly id: string }>(1, {
        lookup: (key: { readonly id: string }) => key.id,
      });
      const firstTaskStarted = Promise.withResolvers<void>();
      const completeFirstTask = Promise.withResolvers<void>();
      const events: Array<string> = [];

      const firstFiber = run(
        semaphoreByKey.withPermit({ id: "shared" }, async () => {
          events.push("first acquired");
          firstTaskStarted.resolve();
          await completeFirstTask.promise;
          events.push("first completed");
          return ok("first");
        }),
      );

      await firstTaskStarted.promise;

      const secondFiber = run(
        semaphoreByKey.withPermit({ id: "shared" }, () => {
          events.push("second acquired");
          return ok("second");
        }),
      );

      expect(semaphoreByKey.snapshot({ id: "shared" })).toMatchObject({
        taken: 1,
        waiters: [{ permits: 1 }],
      });
      expect(events).toEqual(["first acquired"]);

      completeFirstTask.resolve();

      expect(await firstFiber).toEqual(ok("first"));
      expect(await secondFiber).toEqual(ok("second"));
      expect(events).toEqual([
        "first acquired",
        "first completed",
        "second acquired",
      ]);
    });

    test("does not block Tasks with different keys", async () => {
      await using run = createRun();

      const semaphoreByKey = createSemaphoreByKey<string>(1);
      const firstTaskStarted = Promise.withResolvers<void>();
      const completeFirstTask = Promise.withResolvers<void>();
      const events: Array<string> = [];

      const firstFiber = run(
        semaphoreByKey.withPermit("first", async () => {
          events.push("first acquired");
          firstTaskStarted.resolve();
          await completeFirstTask.promise;
          events.push("first completed");
          return ok("first");
        }),
      );

      await firstTaskStarted.promise;

      const secondFiber = run(
        semaphoreByKey.withPermit("second", () => {
          events.push("second acquired");
          return ok("second");
        }),
      );

      expect(await secondFiber).toEqual(ok("second"));
      expect(events).toEqual(["first acquired", "second acquired"]);

      completeFirstTask.resolve();

      expect(await firstFiber).toEqual(ok("first"));
      expect(events).toEqual([
        "first acquired",
        "second acquired",
        "first completed",
      ]);
    });
  });

  describe("withPermits", () => {
    test("runs the Task directly under the keyed wrapper Run", async () => {
      await using run = createRun();

      const semaphoreByKey = createSemaphoreByKey<string>(1);

      const fiber = run(
        semaphoreByKey.withPermits("key", 1)((taskRun) => ok(taskRun.parent)),
      );

      const result = await fiber;

      expect(result.ok && result.value).toBe(fiber.run);
    });

    test("withPermits uses the requested permits for the key", async () => {
      await using run = createRun();

      const semaphoreByKey = createSemaphoreByKey<string>(2);
      const firstTaskStarted = Promise.withResolvers<void>();
      const completeFirstTask = Promise.withResolvers<void>();
      const events: Array<string> = [];

      const firstFiber = run(
        semaphoreByKey.withPermits(
          "shared",
          2,
        )(async () => {
          events.push("first acquired");
          firstTaskStarted.resolve();
          await completeFirstTask.promise;
          events.push("first completed");
          return ok("first");
        }),
      );

      await firstTaskStarted.promise;

      const secondFiber = run(
        semaphoreByKey.withPermit("shared", () => {
          events.push("second acquired");
          return ok("second");
        }),
      );

      expect(events).toEqual(["first acquired"]);

      completeFirstTask.resolve();

      expect(await firstFiber).toEqual(ok("first"));
      expect(await secondFiber).toEqual(ok("second"));
      expect(events).toEqual([
        "first acquired",
        "first completed",
        "second acquired",
      ]);
    });
  });

  test("SemaphoreByKey isIdle reports whether a key has active permits or waiters", async () => {
    await using run = createRun();

    const semaphoreByKey = createSemaphoreByKey<string>(1);
    const firstTaskStarted = Promise.withResolvers<void>();
    const completeFirstTask = Promise.withResolvers<void>();

    expect(semaphoreByKey.isIdle("key")).toBe(true);

    const firstFiber = run(
      semaphoreByKey.withPermit("key", async () => {
        firstTaskStarted.resolve();
        await completeFirstTask.promise;
        return ok("first");
      }),
    );

    await firstTaskStarted.promise;

    const secondFiber = run(
      semaphoreByKey.withPermit("key", () => ok("second")),
    );

    expect(semaphoreByKey.isIdle("key")).toBe(false);

    completeFirstTask.resolve();

    expect(await firstFiber).toEqual(ok("first"));
    expect(await secondFiber).toEqual(ok("second"));
    expect(semaphoreByKey.isIdle("key")).toBe(true);
  });

  describe("snapshot", () => {
    test("returns state for an active key and null after it becomes idle", async () => {
      await using run = createRun();

      const semaphoreByKey = createSemaphoreByKey<string>(1);
      const taskStarted = Promise.withResolvers<void>();
      const completeTask = Promise.withResolvers<void>();

      const fiber = run(
        semaphoreByKey.withPermit("key", async () => {
          taskStarted.resolve();
          await completeTask.promise;
          return ok("value");
        }),
      );

      await taskStarted.promise;

      expect(semaphoreByKey.snapshot("key")).toMatchObject({
        permits: 1,
        taken: 1,
        isIdle: false,
      });

      completeTask.resolve();

      expect(await fiber).toEqual(ok("value"));
      expect(semaphoreByKey.snapshot("key")).toBeNull();
    });

    test("removes key after Err", async () => {
      await using run = createRun();

      const semaphoreByKey = createSemaphoreByKey<string>(1);

      const result = await run(
        semaphoreByKey.withPermit("key", () => err("error")),
      );

      expectErr(result, "error");
      expect(semaphoreByKey.snapshot("key")).toBeNull();
    });

    test("removes key after defect", async () => {
      await using run = testCreateRun();

      const semaphoreByKey = createSemaphoreByKey<string>(1);
      const defect = new Error("boom");

      await expect(
        run(
          semaphoreByKey.withPermit("key", () => {
            throw defect;
          }),
        ),
      ).rejects.toEqual(panic(defect));

      expect(semaphoreByKey.snapshot("key")).toBeNull();
      expect(await run.deps.reportDefect.next()).toEqual(panic(defect));
    });

    test("removes key after abort while holding permit", async () => {
      await using run = createRun();

      const semaphoreByKey = createSemaphoreByKey<string>(1);
      const taskStarted = Promise.withResolvers<void>();

      const fiber = run.abortable(
        semaphoreByKey.withPermit("key", async (run) => {
          taskStarted.resolve();
          await run.ok(callback(() => undefined));
          return ok();
        }),
      );

      await taskStarted.promise;
      fiber.abort(testAbortReason);

      expect(await fiber).toEqual(err(testAbortError));
      expect(semaphoreByKey.snapshot("key")).toBeNull();
    });

    test("removes key after queued waiter is aborted", async () => {
      await using run = createRun();

      const semaphoreByKey = createSemaphoreByKey<string>(1);
      const firstTaskStarted = Promise.withResolvers<void>();
      const completeFirstTask = Promise.withResolvers<void>();
      let secondTaskStarted = false;

      const firstFiber = run(
        semaphoreByKey.withPermit("key", async () => {
          firstTaskStarted.resolve();
          await completeFirstTask.promise;
          return ok("first");
        }),
      );

      await firstTaskStarted.promise;

      const secondFiber = run.abortable(
        semaphoreByKey.withPermit("key", () => {
          secondTaskStarted = true;
          return ok("second");
        }),
      );

      expect(semaphoreByKey.snapshot("key")).toMatchObject({
        taken: 1,
        waiters: [{ permits: 1 }],
      });

      secondFiber.abort(testAbortReason);
      expect(await secondFiber).toEqual(err(testAbortError));
      expect(secondTaskStarted).toBe(false);
      expect(semaphoreByKey.snapshot("key")).toMatchObject({
        taken: 1,
        waiters: [],
      });

      completeFirstTask.resolve();

      expect(await firstFiber).toEqual(ok("first"));
      expect(semaphoreByKey.snapshot("key")).toBeNull();
    });
  });
});

describe("MutexByKey", () => {
  describe("withLock", () => {
    test("serializes Tasks with the same key", async () => {
      await using run = createRun();

      const mutexByKey = createMutexByKey<string>();
      const firstTaskStarted = Promise.withResolvers<void>();
      const completeFirstTask = Promise.withResolvers<void>();
      const events: Array<string> = [];

      const firstFiber = run(
        mutexByKey.withLock("shared", async () => {
          events.push("first acquired");
          firstTaskStarted.resolve();
          await completeFirstTask.promise;
          events.push("first completed");
          return ok("first");
        }),
      );

      await firstTaskStarted.promise;

      const secondFiber = run(
        mutexByKey.withLock("shared", () => {
          events.push("second acquired");
          return ok("second");
        }),
      );

      expect(events).toEqual(["first acquired"]);

      completeFirstTask.resolve();

      expect(await firstFiber).toEqual(ok("first"));
      expect(await secondFiber).toEqual(ok("second"));
      expect(events).toEqual([
        "first acquired",
        "first completed",
        "second acquired",
      ]);
    });

    test("uses lookup to share locks for logically equal keys", async () => {
      await using run = createRun();

      const mutexByKey = createMutexByKey<{ readonly id: string }>({
        lookup: (key: { readonly id: string }) => key.id,
      });
      const firstTaskStarted = Promise.withResolvers<void>();
      const completeFirstTask = Promise.withResolvers<void>();
      const events: Array<string> = [];

      const firstFiber = run(
        mutexByKey.withLock({ id: "shared" }, async () => {
          events.push("first acquired");
          firstTaskStarted.resolve();
          await completeFirstTask.promise;
          events.push("first completed");
          return ok("first");
        }),
      );

      await firstTaskStarted.promise;

      const secondFiber = run(
        mutexByKey.withLock({ id: "shared" }, () => {
          events.push("second acquired");
          return ok("second");
        }),
      );

      expect(mutexByKey.snapshot({ id: "shared" })).toMatchObject({
        taken: 1,
        waiters: [{ permits: 1 }],
      });
      expect(events).toEqual(["first acquired"]);

      completeFirstTask.resolve();

      expect(await firstFiber).toEqual(ok("first"));
      expect(await secondFiber).toEqual(ok("second"));
      expect(events).toEqual([
        "first acquired",
        "first completed",
        "second acquired",
      ]);
    });

    test("does not block Tasks with different keys", async () => {
      await using run = createRun();

      const mutexByKey = createMutexByKey<string>();
      const firstTaskStarted = Promise.withResolvers<void>();
      const completeFirstTask = Promise.withResolvers<void>();
      const events: Array<string> = [];

      const firstFiber = run(
        mutexByKey.withLock("first", async () => {
          events.push("first acquired");
          firstTaskStarted.resolve();
          await completeFirstTask.promise;
          events.push("first completed");
          return ok("first");
        }),
      );

      await firstTaskStarted.promise;

      const secondFiber = run(
        mutexByKey.withLock("second", () => {
          events.push("second acquired");
          return ok("second");
        }),
      );

      expect(await secondFiber).toEqual(ok("second"));
      expect(events).toEqual(["first acquired", "second acquired"]);

      completeFirstTask.resolve();

      expect(await firstFiber).toEqual(ok("first"));
      expect(events).toEqual([
        "first acquired",
        "second acquired",
        "first completed",
      ]);
    });
  });

  test("isIdle reports whether a key is locked or queued", async () => {
    await using run = createRun();

    const mutexByKey = createMutexByKey<string>();
    const firstTaskStarted = Promise.withResolvers<void>();
    const completeFirstTask = Promise.withResolvers<void>();

    expect(mutexByKey.isIdle("key")).toBe(true);

    const firstFiber = run(
      mutexByKey.withLock("key", async () => {
        firstTaskStarted.resolve();
        await completeFirstTask.promise;
        return ok("first");
      }),
    );

    await firstTaskStarted.promise;

    const secondFiber = run(mutexByKey.withLock("key", () => ok("second")));

    expect(mutexByKey.isIdle("key")).toBe(false);

    completeFirstTask.resolve();

    expect(await firstFiber).toEqual(ok("first"));
    expect(await secondFiber).toEqual(ok("second"));
    expect(mutexByKey.isIdle("key")).toBe(true);
  });

  describe("snapshot", () => {
    test("returns state for an active key and null after it becomes idle", async () => {
      await using run = createRun();

      const mutexByKey = createMutexByKey<string>();
      const taskStarted = Promise.withResolvers<void>();
      const completeTask = Promise.withResolvers<void>();

      const fiber = run(
        mutexByKey.withLock("key", async () => {
          taskStarted.resolve();
          await completeTask.promise;
          return ok("value");
        }),
      );

      await taskStarted.promise;

      expect(mutexByKey.snapshot("key")).toMatchObject({
        permits: 1,
        taken: 1,
        isIdle: false,
      });

      completeTask.resolve();

      expect(await fiber).toEqual(ok("value"));
      expect(mutexByKey.snapshot("key")).toBeNull();
    });
  });
});

describe("MutexRef", () => {
  test("get returns the current value", async () => {
    await using run = testCreateRun();
    const ref = createMutexRef(42);

    expect(await run.ok(ref.get)).toBe(42);
  });

  test("set updates the value", async () => {
    await using run = testCreateRun();
    const ref = createMutexRef(0);

    await run.ok(ref.set(1));

    expect(await run.ok(ref.get)).toBe(1);
  });

  test("getAndSet returns the previous value and updates the value", async () => {
    await using run = testCreateRun();
    const ref = createMutexRef(1);

    expect(await run.ok(ref.getAndSet(2))).toBe(1);
    expect(await run.ok(ref.get)).toBe(2);
  });

  test("setAndGet returns the updated value", async () => {
    await using run = testCreateRun();
    const ref = createMutexRef(1);

    expect(await run.ok(ref.setAndGet(2))).toBe(2);
    expect(await run.ok(ref.get)).toBe(2);
  });

  test("update applies a Task updater", async () => {
    await using run = testCreateRun();
    const ref = createMutexRef(1);

    await run.ok(ref.update((n) => () => ok(n + 1)));

    expect(await run.ok(ref.get)).toBe(2);
  });

  test("getAndUpdate returns the previous value and updates the value", async () => {
    await using run = testCreateRun();
    const ref = createMutexRef(1);

    expect(await run.ok(ref.getAndUpdate((n) => () => ok(n + 1)))).toBe(1);
    expect(await run.ok(ref.get)).toBe(2);
  });

  test("updateAndGet returns the updated value", async () => {
    await using run = testCreateRun();
    const ref = createMutexRef(1);

    expect(await run.ok(ref.updateAndGet((n) => () => ok(n + 1)))).toBe(2);
    expect(await run.ok(ref.get)).toBe(2);
  });

  test("modify returns a computed result and updates the value", async () => {
    await using run = testCreateRun();
    const ref = createMutexRef(0);

    const result = await run.ok(
      ref.modify((n) => () => ok([`was:${n}`, n + 1] as const)),
    );

    expect(result).toBe("was:0");
    expect(await run.ok(ref.get)).toBe(1);
  });

  test("serializes concurrent updates", async () => {
    await using run = testCreateRun();
    const gate = createGate();
    const ref = createMutexRef(0);
    const reads: Array<number> = [];

    const slowIncrement = ref.update((current) => async (run) => {
      reads.push(current);
      const opened = await run(gate.wait);
      if (!opened.ok) return opened;
      return ok(current + 1);
    });

    const first = run(slowIncrement);
    const second = run(slowIncrement);
    gate.open();

    expect(await first).toEqual(ok());
    expect(await second).toEqual(ok());

    // A lost update would read [0, 0]; the mutex serializes the transitions.
    expect(reads).toEqual([0, 1]);
    expect(await run.ok(ref.get)).toBe(2);
  });

  test("a failed updater preserves the previous value", async () => {
    await using run = testCreateRun();
    const ref = createMutexRef(1);
    const testError = { type: "TestError" } as const;
    const fail = () => () => err(testError);

    expect(await run(ref.update(fail))).toEqual(err(testError));
    expect(await run(ref.getAndUpdate(fail))).toEqual(err(testError));
    expect(await run(ref.updateAndGet(fail))).toEqual(err(testError));
    expect(await run(ref.modify(fail))).toEqual(err(testError));

    expect(await run.ok(ref.get)).toBe(1);
  });

  test("an aborted updater preserves the previous value", async () => {
    await using run = testCreateRun();
    const gate = createGate();
    const ref = createMutexRef(0);

    const fiber = run.abortable(
      ref.update((current) => async (run) => {
        const opened = await run(gate.wait);
        if (!opened.ok) return opened;
        return ok(current + 1);
      }),
    );
    fiber.abort(testAbortReason);

    const result = await fiber;

    assert(!result.ok);
    expect(await run.ok(ref.get)).toBe(0);
  });

  test("snapshot reports lock state", async () => {
    await using run = testCreateRun();
    const gate = createGate();
    const ref = createMutexRef(0);
    const started = Promise.withResolvers<void>();

    expect(ref.snapshot().isIdle).toBe(true);

    const fiber = run(
      ref.update((current) => async (run) => {
        started.resolve();
        const opened = await run(gate.wait);
        if (!opened.ok) return opened;
        return ok(current + 1);
      }),
    );
    await started.promise;

    expect(ref.snapshot()).toMatchObject({ taken: 1, isIdle: false });

    gate.open();

    expect(await fiber).toEqual(ok());
    expect(ref.snapshot().isIdle).toBe(true);
  });

  test("types: operations infer error and deps from the updater", () => {
    interface TestDep {
      readonly value: string;
    }
    interface TestError {
      readonly type: "TestError";
    }

    const ref = createMutexRef(0);

    expectTypeOf(ref.get).toEqualTypeOf<Task<number>>();
    expectTypeOf(ref.set(1)).toEqualTypeOf<Task<void>>();
    expectTypeOf(ref.getAndSet(1)).toEqualTypeOf<Task<number>>();
    expectTypeOf(ref.setAndGet(1)).toEqualTypeOf<Task<number>>();

    expectTypeOf(
      ref.update((n) => (() => ok(n)) as Task<number, TestError, TestDep>),
    ).toEqualTypeOf<Task<void, TestError, TestDep>>();

    expectTypeOf(
      ref.modify(
        (n) =>
          (() => ok(["r", n] as const)) as Task<
            readonly [string, number],
            TestError,
            TestDep
          >,
      ),
    ).toEqualTypeOf<Task<string, TestError, TestDep>>();
  });
});

describe("examples", () => {
  test("uses an explicit worklist for stack-safe tree traversal", async () => {
    interface TreeNode {
      readonly value: number;
      readonly children: ReadonlyArray<TreeNode>;
    }

    let root: TreeNode = { value: 0, children: [] };
    for (let value = 1; value <= 100_000; value++) {
      root = { value, children: [root] };
    }

    const sumTree =
      (root: TreeNode): Task<number> =>
      () => {
        const remaining = [root];
        let sum = 0;

        while (remaining.length > 0) {
          const node = remaining.pop();
          assert(node);
          sum += node.value;
          remaining.push(...node.children);
        }

        return ok(sum);
      };

    await using run = createRun();

    expect(await run(sumTree(root))).toEqual(ok(5_000_050_000));
  });

  test("Task overview naive dependency-backed fetch example works", async () => {
    // A dependency - wraps native fetch for testability.
    interface NativeFetchDep {
      readonly nativeFetch: typeof globalThis.fetch;
    }

    interface NaiveFetchError {
      readonly type: "NaiveFetchError";
      readonly error: unknown;
    }

    // A naive Task wrapping native fetch - adds abortability.
    const naiveFetch =
      (url: string): Task<Response, NaiveFetchError, NativeFetchDep> =>
      async ({ deps, signal }) => {
        try {
          const response = await deps.nativeFetch(url, { signal });
          return ok(response);
        } catch (error) {
          if (AbortError.is(error)) throw error;
          return err({ type: "NaiveFetchError", error });
        }
      };

    // Provide dependencies at the composition root.
    const deps: NativeFetchDep = {
      nativeFetch: (input, init) => {
        if (input !== "/users/456") return Promise.resolve(new Response("ok"));

        const abortError = Object.assign(new Error("Aborted"), testAbortError);

        return new Promise((_, reject) => {
          const signal = init?.signal;

          if (signal?.aborted) {
            reject(abortError);
            return;
          }

          signal?.addEventListener("abort", () => reject(abortError), {
            once: true,
          });
        });
      },
    };

    // Create a Run with those dependencies.
    await using run = createRun(deps);

    // Running a Task returns a Fiber; awaiting it gives a Result.
    const result = await run(naiveFetch("/users/123"));
    expectTypeOf(result).toEqualTypeOf<Result<Response, NaiveFetchError>>();

    const fiber = run.abortable(naiveFetch("/users/456"));
    fiber.abort();
    const abortResult = await fiber;
    expectTypeOf(abortResult).toEqualTypeOf<
      Result<Response, NaiveFetchError | AbortError>
    >();
  });
});
