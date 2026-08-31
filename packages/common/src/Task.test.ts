import { describe, it, mock } from "node:test";
import {
  assertEqual,
  assertErr,
  assertFalse,
  assertInstanceOf,
  assertLength,
  assertNotUndefined,
  assertOk,
  assertRejects,
  assertRejectsInstanceOf,
  assertRejectsSame,
  assertSame,
  assertThrows,
  assertThrowsInstanceOf,
  assertThrowsSame,
  assertTrue,
} from "./Assert.ts";

import { emptyArray, type NonEmptyReadonlyArray } from "./Array.ts";
import { emptyRecord } from "./Object.ts";
import type { Int1To100OrPositiveInt } from "./Number.ts";
import { none, some, type Option } from "./Option.ts";
import {
  isDev,
  testGlobalUncaughtErrors,
  testGlobalUnhandledRejections,
} from "./Platform.ts";
import { installPolyfills } from "./Polyfills.ts";
import type { Random, RandomDep, RandomNumber } from "./Random.ts";
import { createRef } from "./Ref.ts";
import { done, err, ok, type Done, type Result } from "./Result.ts";
import { fixed, spaced, take, type Schedule } from "./Schedule.ts";
import {
  daemon,
  AbortError,
  acquireUseRelease,
  all,
  allSettled,
  any,
  each,
  callback,
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
  type AllOptions,
  type AbortableFiber,
  type AbortReason,
  type AnyTask,
  type DisposableRun,
  type Fiber,
  type InferFiberDeps,
  type InferFiberErr,
  type InferFiberOk,
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
  type TaskCollectionOptions,
  type TaskPriority,
  type TestReportDefectDep,
  type TestRunDefaultDeps,
  type TimeoutError,
} from "./Task.ts";
import { testStubGlobal } from "./Test.ts";
import { Millis, testCreateTime, type Time } from "./Time.ts";
import {
  assertType,
  maxPositiveInt,
  onePositiveInt,
  PositiveInt,
  type DateIso,
  type Id,
} from "./Type.ts";

installPolyfills();

const panic = (defect: unknown): AbortError =>
  createAbortError({ type: "PanicAbortReason", defect });

const availableParallelism = (): PositiveInt => PositiveInt.orThrow(2);

const assertPanicAbortError: (
  error: unknown,
  defect: unknown,
) => asserts error is AbortError = (error, defect) => {
  assertType(AbortError, error);
  assertSame(error.reason.type, "PanicAbortReason");
  assertSame(error.reason.defect, defect);
};

const assertPanicAbortErrorMessage: (
  error: unknown,
  message: string,
) => asserts error is AbortError = (error, message) => {
  assertType(AbortError, error);
  assertSame(error.reason.type, "PanicAbortReason");
  assertInstanceOf(error.reason.defect, Error);
  assertEqual(error.reason.defect.message, message);
};

const assertRejectsPanicAbortErrorMessage = async (
  promise: PromiseLike<unknown>,
  message: string,
): Promise<AbortError> => {
  let rejection: AbortError | undefined;

  await assertRejects(promise, (reason) => {
    assertPanicAbortErrorMessage(reason, message);
    rejection = reason;
  });

  assertNotUndefined(rejection);
  return rejection;
};

const assertReportedDefectOnly =
  <T, E, D = unknown>(
    expectedDefect: unknown,
    task: Task<T, E, D>,
  ): Task<T, E, D & TestReportDefectDep> =>
  async (run) => {
    using uncaughtErrors = testGlobalUncaughtErrors();
    using unhandledRejections = testGlobalUnhandledRejections();

    const result = await run(task);

    assertEqual(await run.deps.reportDefect.next(), expectedDefect);
    assertEqual(uncaughtErrors.errors, []);
    assertEqual(unhandledRejections.errors, []);

    return result;
  };

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
  it("extract Task and Fiber type parameters", () => {
    interface UserError {
      readonly type: "UserError";
    }

    type LoadUserTask = Task<string, UserError, DbDep>;
    type LoadUserFiber = Fiber<string, UserError, DbDep>;
    type AbortableLoadUserFiber = AbortableFiber<string, UserError, DbDep>;

    assertType<InferTaskOk<LoadUserTask>, string>();
    assertType<InferTaskErr<LoadUserTask>, UserError>();
    assertType<InferTaskDeps<LoadUserTask>, DbDep>();
    assertType<InferFiberOk<LoadUserFiber>, string>();
    assertType<InferFiberErr<LoadUserFiber>, UserError>();
    assertType<InferFiberDeps<LoadUserFiber>, DbDep>();
    assertType<InferFiberErr<AbortableLoadUserFiber>, UserError | AbortError>();
  });

  it("abort reasons preserve their sentinel types", () => {
    const panicAbortReason = createPanicAbortReason(new Error("boom"));

    assertType<
      typeof runDisposedAbortReason extends AbortReason ? true : false,
      true
    >();
    assertType<typeof runDisposedAbortReason.type, "RunDisposedAbortReason">();
    assertType<
      typeof panicAbortReason extends AbortReason ? true : false,
      true
    >();
    assertType<typeof panicAbortReason.type, "PanicAbortReason">();
  });
});

describe("Task", () => {
  it("an explicit worklist is stack-safe for deeply nested input", async () => {
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
          assertNotUndefined(node);
          sum += node.value;
          remaining.push(...node.children);
        }

        return ok(sum);
      };

    await using run = createRun();

    assertEqual(await run(sumTree(root)), ok(5_000_050_000));
  });
});

describe("NextTask", () => {
  it("models value, done, and error results", async () => {
    interface PullError {
      readonly type: "PullError";
    }

    type PullTask = NextTask<number, PullError, string, DbDep>;

    assertType<InferTaskDone<PullTask>, string>();
    assertType<InferTaskDeps<PullTask>, DbDep>();
    assertType<InferTaskDone<NextTask<number>>, void>();
    assertType<InferTaskDone<Task<number, PullError>>, never>();

    await using run = createRun(dbDep);

    const valueTask: PullTask = ({ deps }) => {
      assertSame(deps.db, dbDep.db);
      return ok(42);
    };
    const doneTask: NextTask<number, PullError> = () => err(done());
    const errorTask: NextTask<number, PullError, string> = () =>
      err({ type: "PullError" });

    const valueResult = await run(valueTask);
    const doneResult = await run(doneTask);
    const errorResult = await run(errorTask);

    assertEqual(valueResult, ok(42));
    assertEqual(doneResult, err(done()));
    assertEqual(errorResult, err({ type: "PullError" }));

    if (!doneResult.ok) {
      assertType<typeof doneResult.error, PullError | Done<void>>();
    }
  });
});

describe("createRun", () => {
  it("creates async disposable Run to run Tasks", async () => {
    await using run = createRun();
    let taskStarted = false;

    const loadUser: Task<string> = () => {
      taskStarted = true;
      return ok("Ada");
    };

    const promise = run(loadUser);

    assertTrue(taskStarted);
    assertEqual(await promise, ok("Ada"));
  });
});

describe("testCreateDeps", () => {
  it("nativeFetch requires a test double", () => {
    const error = assertThrowsInstanceOf(
      () => testCreateDeps().nativeFetch("https://example.com"),
      Error,
    );
    assertTrue(error.message.includes("Provide a nativeFetch test double"));
  });

  it("creates fresh deterministic baseline deps", () => {
    const first = testCreateDeps();
    const second = testCreateDeps();

    assertFalse(Object.is(first, second));
    assertFalse(Object.is(first.console, second.console));
    assertEqual(first.random.next(), second.random.next());
    assertEqual(first.randomLib.int(0, 1000), second.randomLib.int(0, 1000));
    assertEqual(
      Array.from(first.randomBytes.create(8)),
      Array.from(second.randomBytes.create(8)),
    );

    assertEqual(first.time.now(), 0);
    first.time.advance("1s");
    assertEqual(first.time.now(), 1000);
    assertEqual(second.time.now(), 0);
  });

  it("uses custom seed when provided", () => {
    const first = testCreateDeps({ seed: "custom-seed" });
    const second = testCreateDeps({ seed: "custom-seed" });

    assertEqual(first.random.next(), second.random.next());
    assertEqual(first.randomLib.int(0, 1000), second.randomLib.int(0, 1000));
    assertEqual(
      Array.from(first.randomBytes.create(8)),
      Array.from(second.randomBytes.create(8)),
    );
  });

  it("reportDefect getDefects returns a copy", () => {
    const deps = testCreateDeps();

    deps.reportDefect("defect");
    const defects = deps.reportDefect.getDefects();
    assertEqual(defects, ["defect"]);

    (defects as Array<unknown>).push("mutation");
    assertEqual(deps.reportDefect.getDefects(), ["defect"]);

    deps.reportDefect.clearDefects();

    assertEqual(deps.reportDefect.getDefects(), []);
    assertEqual(deps.reportDefect.getDefectsSnapshot(), []);
  });

  it("reportDefect clearDefects throws with pending next waiters", async () => {
    const deps = testCreateDeps();
    const nextDefect = deps.reportDefect.next();

    const error = assertThrowsInstanceOf(
      () => deps.reportDefect.clearDefects(),
      Error,
    );
    assertTrue(
      error.message.includes(
        "clearDefects must not be called while reportDefect.next() is pending",
      ),
    );

    deps.reportDefect("defect");
    assertEqual(await nextDefect, "defect");
  });

  it("reportDefect getDefectsSnapshot throws with pending next waiters", async () => {
    const deps = testCreateDeps();
    const nextDefect = deps.reportDefect.next();

    const error = assertThrowsInstanceOf(
      () => deps.reportDefect.getDefectsSnapshot(),
      Error,
    );
    assertTrue(
      error.message.includes(
        "getDefectsSnapshot must not be called while reportDefect.next() is pending",
      ),
    );

    deps.reportDefect("defect");
    assertEqual(await nextDefect, "defect");
  });
});

describe("testCreateRun", () => {
  it("creates Task Run with deterministic deps", async () => {
    await using run = testCreateRun();

    assertType<typeof run, DisposableRun<TestRunDefaultDeps>>();
    assertEqual(run.deps.time.now(), 0);

    run.deps.console.info("hello");
    assertEqual(run.deps.console.getEntriesSnapshot(), [
      { method: "info", path: [], args: ["hello"] },
    ]);

    assertEqual(await run(() => ok(run.deps.time.now())), ok(0));
  });

  it("accepts seeded test deps", async () => {
    await using first = testCreateRun(testCreateDeps({ seed: "custom-seed" }));
    await using second = testCreateRun(testCreateDeps({ seed: "custom-seed" }));
    await using defaultSeed = testCreateRun();

    assertEqual(
      {
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
      },
      {
        customSeed: {
          random: 0.12083238029952814,
          randomBytes: [53, 205, 232, 45, 93, 200, 245, 107],
          randomLib: 149,
        },
        defaultSeed: {
          random: 0.6133348181104821,
          randomBytes: [246, 87, 195, 248, 64, 124, 159, 31],
          randomLib: 633,
        },
        repeatedCustomSeed: {
          random: 0.12083238029952814,
          randomBytes: [53, 205, 232, 45, 93, 200, 245, 107],
          randomLib: 149,
        },
      },
    );
  });

  it("merges custom deps", async () => {
    const db = { query: (sql: string) => `result:${sql}` };
    await using run = testCreateRun({ db });

    assertSame(run.deps.db, db);
    assertEqual(
      await run((run) => ok(run.deps.db.query("select 1"))),
      ok("result:select 1"),
    );
  });

  it("accepts custom deps with optional compatible default deps", async () => {
    const deps: DbDep & Partial<RunConfigDep> = dbDep;
    await using run = testCreateRun(deps);

    assertType<typeof run, DisposableRun<TestRunDefaultDeps & typeof deps>>();
    assertSame(run.deps.db, dbDep.db);
  });
});

describe("AbortError", () => {
  it("is detected structurally", () => {
    assertTrue(AbortError.is(createAbortError(testAbortReason)));
    assertType(AbortError, testAbortError);
    assertFalse(AbortError.is({ type: "AbortError" }));
  });
});

describe("Run", () => {
  describe("calling a Task", () => {
    it("creates child Run, passes it to Task, and returns Fiber exposing it", async () => {
      await using run = createRun();
      let childRun: Run | undefined;

      const loadUser: Task<string> = (run) => {
        assertType<typeof run, Run>();
        assertType<
          [typeof run] extends [DisposableRun]
            ? [DisposableRun] extends [typeof run]
              ? true
              : false
            : false,
          false
        >();
        // @ts-expect-error - Task Runs cannot panic manually.
        void run.panic;
        childRun = run;
        return ok("Ada");
      };

      const userFiber = run(loadUser);

      assertType<typeof userFiber, Fiber<string, never>>();
      const compileTimeAssertions = () => {
        // oxlint-disable-next-line typescript/no-floating-promises -- Verifies that a Fiber must be handled or explicitly discarded with void.
        run(loadUser);
      };
      assertType<
        typeof compileTimeAssertions extends (...args: Array<never>) => unknown
          ? true
          : false,
        true
      >();
      assertNotUndefined(childRun);
      assertFalse(Object.is(childRun, run));
      assertSame(userFiber.run, childRun);
      assertEqual(await userFiber, ok("Ada"));
    });

    it("can start nested child Tasks", async () => {
      await using run = createRun();
      let nestedTaskStarted = false;

      const parentFiber = run(async (run) =>
        run(() => {
          nestedTaskStarted = true;
          return ok("Ada");
        }),
      );

      assertTrue(nestedTaskStarted);
      assertEqual(await parentFiber, ok("Ada"));
    });

    it("id matches Run passed to Task", async () => {
      await using run = createRun();
      let parentRunId: Id | undefined;
      let childRunId: Id | undefined;
      let childFiber: Fiber<void> | undefined;

      assertType<typeof run.id, Id>();

      const parentFiber = run(async (run) => {
        parentRunId = run.id;

        childFiber = run(({ id }) => {
          childRunId = id;
          assertType<typeof id, Id>();
          return ok();
        });

        return childFiber;
      });

      assertEqual(await parentFiber, ok());

      assertNotUndefined(childFiber);
      assertSame(parentRunId, parentFiber.run.id);
      assertSame(childRunId, childFiber.run.id);
      assertFalse(Object.is(run.id, parentFiber.run.id));
      assertFalse(Object.is(parentRunId, childRunId));
    });
  });

  describe("orThrow", () => {
    it("unwraps Ok values and throws Result errors", async () => {
      await using run = createRun();
      const userError = { type: "UserError", message: "Missing user" };
      const loadUser: Task<string, typeof userError> = () => ok("Ada");

      assertEqual(await run.orThrow(loadUser), "Ada");

      const failUser: Task<string, typeof userError> = () => err(userError);

      const error = await assertRejectsInstanceOf(run.orThrow(failUser), Error);
      assertEqual(error.message, "getOrThrow");
      assertSame(error.cause, userError);

      const queryDb: Task<string, typeof userError, DbDep> = ({ deps }) =>
        ok(deps.db.query("select 1"));

      assertEqual(await run.orThrow(queryDb, dbDep), "result:select 1");

      const loadCurrentUser: Task<string> = () => ok("Ada");

      const assertRunOrThrowTypes = () => {
        // @ts-expect-error - run.orThrow only accepts Tasks with Result errors.
        void run.orThrow(loadCurrentUser);
      };

      void assertRunOrThrowTypes;
    });
  });

  describe("ok", () => {
    it("unwraps Tasks with no Result error", async () => {
      await using run = createRun();
      const loadUser: Task<string> = () => ok("Ada");

      assertEqual(await run.ok(loadUser), "Ada");

      assertEqual(
        await run.ok(({ deps }) => ok(deps.db.query("select 1")), dbDep),
        "result:select 1",
      );

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
    it("distinguishes Result errors and defects", async () => {
      await using run = createRun();
      const userError = { type: "UserError" } as const;

      assertEqual(await run(() => err(userError)), err(userError));

      const defectRun = testCreateRun();
      const defect = new Error("boom");
      try {
        await assertRejects(
          defectRun(() => {
            throw defect;
          }),
          panic(defect),
        );
        assertEqual(await defectRun.deps.reportDefect.next(), panic(defect));
      } finally {
        await defectRun[Symbol.asyncDispose]();
      }
    });

    it(
      "panics when a Task returns a non-Result",
      { skip: !isDev },
      async () => {
        await using run = testCreateRun();
        const malformedTask = (() =>
          "not a Result") as unknown as Task<unknown>;

        const fiber = run(malformedTask);

        const rejection = await assertRejectsPanicAbortErrorMessage(
          fiber,
          "Task must return Result.",
        );
        const panicAbortError = await run.deps.reportDefect.next();
        assertSame(panicAbortError, rejection);
        assertSame(panicAbortError, run.signal.reason);
      },
    );
  });

  describe("lifecycle", () => {
    it("aborts Task Run after Task settles", async () => {
      await using run = createRun();
      let childRun: Run | undefined;

      const fiber = run((run) => {
        childRun = run;
        return ok();
      });

      assertEqual(await fiber, ok());
      assertNotUndefined(childRun);
      assertTrue(childRun.signal.aborted);
      assertEqual(childRun.signal.reason, {
        type: "AbortError",
        reason: runDisposedAbortReason,
      });
    });

    it("aborts owned child Tasks and waits before Fiber resolves", async () => {
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

      assertTrue(childSignal.aborted);
      assertEqual(childSignal.reason, {
        type: "AbortError",
        reason: runDisposedAbortReason,
      });
      assertFalse(parentSettled);

      completeChild.resolve();

      assertEqual(await parentFiber, ok("parent"));
      assertTrue(parentSettled);
    });

    it("settles Fiber continuations after parent Run records Aborted", async () => {
      const run = createRun();
      const completeChild = Promise.withResolvers<void>();

      const childFiber = run(async () => {
        await completeChild.promise;
        return ok();
      });
      const childFiberContinuation = childFiber.then((result) => {
        assertEqual(run.getState(), {
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

      assertEqual(await childFiberContinuation, ok());

      await disposePromise;
    });
  });

  describe("abortable", () => {
    it("returns AbortableFiber that catches abort as Result error", async () => {
      await using run = createRun();
      const checkAbort = Promise.withResolvers<void>();

      const fiber = run.abortable(async ({ signal }) => {
        await checkAbort.promise;
        signal.throwIfAborted();
        return ok("Ada");
      });
      assertType<typeof fiber, AbortableFiber<string, never>>();

      fiber.abort(testAbortReason);
      checkAbort.resolve();
      const result = await fiber;

      assertErr(result, testAbortError);
    });

    it("returns panic abort for defects and reports panic abort", async () => {
      await using run = testCreateRun();
      const error = new Error("boom");

      const fiber = run.abortable(() => {
        throw error;
      });

      assertEqual(await fiber, err(panic(error)));
      assertEqual(await run.deps.reportDefect.next(), panic(error));
    });

    it("aborts with explicit AbortReason by default", async () => {
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

      assertErr(result);
      assertEqual(result.error, {
        type: "AbortError",
        reason: explicitAbortReason,
      });
    });

    it("settles abort before Run disposal observes it", async () => {
      const run = createRun();
      const continueTask = Promise.withResolvers<void>();

      const fiber = run.abortable(async ({ signal }) => {
        await continueTask.promise;

        assertTrue(signal.aborted);
        assertEqual(signal.reason, testAbortError);

        signal.throwIfAborted();
        return ok("Ada");
      });

      fiber.abort(testAbortReason);
      const disposePromise = run[Symbol.asyncDispose]();

      continueTask.resolve();

      assertEqual(await fiber, err(testAbortError));
      await disposePromise;
    });
  });

  describe("abort propagation", () => {
    it("does not start nested child Tasks after parent aborts", async () => {
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

      assertFalse(nestedTaskStarted);
      await assertRejects(childFiber, testAbortError);

      completeParentTask.resolve();

      assertEqual(await parentFiber, ok());
    });

    it("does not start child Tasks created by abort listeners", async () => {
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

      assertNotUndefined(nestedFiber);
      completeParentTask.resolve();

      assertFalse(nestedTaskStarted);
      await assertRejects(nestedFiber, testAbortError);

      assertEqual(await parentFiber, ok());
    });

    it("propagates parent abort to descendant Runs", async () => {
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

          return grandchild;
        });

        return child;
      });

      assertNotUndefined(grandchildRun);

      fiber.abort(testAbortReason);

      const grandchildAborted = grandchildRun.signal.aborted;
      const grandchildAbortReason = grandchildRun.signal.reason;

      continueGrandchild.resolve();

      assertEqual(await fiber, err(testAbortError));
      assertTrue(grandchildAborted);
      assertEqual(grandchildAbortReason, testAbortError);
    });
  });

  describe("onAbort", () => {
    it("calls abort callbacks for future and already-observed aborts", async () => {
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
      assertEqual(events, ["abort", "late"]);
      assertEqual(callbackError, {
        type: "AbortError",
        reason: runDisposedAbortReason,
      });
    });

    it("disposes abort callback registration", async () => {
      await using run = createRun();
      let callbackCalled = false;

      {
        using _ = run.onAbort(() => {
          callbackCalled = true;
        });
      }

      await run[Symbol.asyncDispose]();
      assertFalse(callbackCalled);
    });

    it("does not call abort callback while abort is masked", async () => {
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

      assertFalse(callbackCalled);

      continueTask.resolve();

      assertEqual(await fiber, ok());
    });
  });

  describe("daemon", () => {
    it("outlives the current Task", async () => {
      await using run = createRun();
      const completeDaemon = Promise.withResolvers<void>();
      let taskRun: Run | undefined;
      let daemonFiber: AbortableFiber<void> | undefined;

      const taskFiber = run((run) => {
        assertType<typeof run.daemon, Run["daemon"]>();
        taskRun = run;
        daemonFiber = run.daemon(async () => {
          await completeDaemon.promise;
          return ok();
        });
        return ok();
      });

      assertEqual(await taskFiber, ok());

      assertNotUndefined(taskRun);
      assertNotUndefined(daemonFiber);
      assertType<typeof daemonFiber, AbortableFiber<void>>();
      assertTrue(taskRun.signal.aborted);
      assertEqual(taskRun.signal.reason, {
        type: "AbortError",
        reason: runDisposedAbortReason,
      });
      assertFalse(daemonFiber.run.signal.aborted);

      completeDaemon.resolve();

      assertEqual(await daemonFiber, ok());
    });

    it("abort on the daemon Fiber aborts the daemon Task", async () => {
      await using run = createRun();
      const checkAbort = Promise.withResolvers<void>();

      const daemonFiber = run.daemon(async ({ signal }) => {
        await checkAbort.promise;
        signal.throwIfAborted();
        return ok();
      });

      daemonFiber.abort();

      assertTrue(daemonFiber.run.signal.aborted);
      assertEqual(daemonFiber.run.signal.reason, {
        type: "AbortError",
        reason: explicitAbortReason,
      });

      checkAbort.resolve();

      assertEqual(await daemonFiber, err(daemonFiber.run.signal.reason));
    });

    it("throws when current Task was aborted before daemon starts", async () => {
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
      assertErr(result);
      assertEqual(result.error, {
        type: "AbortError",
        reason: explicitAbortReason,
      });
      assertFalse(daemonStarted);
    });

    it("throws inside unabortable mask after abort request", async () => {
      await using run = createRun();
      const continueTask = Promise.withResolvers<void>();
      let daemonStarted = false;

      // The mask keeps in-flight work running, but detached work attaches to
      // the root and would outlive the scope, so daemon checks the raw abort
      // request and throws even while signal stays un-aborted.
      const fiber = run.abortable(
        unabortable(async (run) => {
          await continueTask.promise;

          assertFalse(run.signal.aborted);

          assertThrows(() => {
            void run.daemon(() => {
              daemonStarted = true;
              return ok();
            });
          }, testAbortError);

          return ok("done");
        }),
      );

      fiber.abort(testAbortReason);
      continueTask.resolve();

      assertEqual(await fiber, ok("done"));
      assertFalse(daemonStarted);
    });

    it("does not inherit the caller's abort mask", async () => {
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

      assertEqual(maskedResult, ok());
      assertNotUndefined(daemonFiber);
      assertEqual(daemonFiber.run.snapshot().abortMask, 0);

      daemonFiber.abort(testAbortReason);

      assertTrue(daemonFiber.run.signal.aborted);
      assertEqual(daemonFiber.run.signal.reason, testAbortError);

      checkAbort.resolve();

      assertEqual(await daemonFiber, err(daemonFiber.run.signal.reason));
    });

    it("aborts and waits for daemon Tasks when root Run disposes", async () => {
      const run = createRun();
      const completeDaemon = Promise.withResolvers<void>();
      let disposeFinished = false;

      const daemonFiber = run.daemon(async ({ signal }) => {
        await completeDaemon.promise;
        if (signal.aborted) {
          const abortError = signal.reason;
          assertEqual(abortError, {
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

      assertTrue(daemonFiber.run.signal.aborted);
      assertEqual(daemonFiber.run.signal.reason, {
        type: "AbortError",
        reason: runDisposedAbortReason,
      });
      assertFalse(disposeFinished);

      completeDaemon.resolve();

      assertEqual(await daemonFiber, err(daemonFiber.run.signal.reason));
      await disposePromise;
      assertTrue(disposeFinished);
    });
  });

  describe("create", () => {
    it("creates DisposableRun that outlives the current Task", async () => {
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

      assertEqual(await taskFiber, ok("task"));

      assertNotUndefined(taskRun);
      assertNotUndefined(createdRun);
      assertNotUndefined(createdFiber);
      assertType<typeof createdRun, DisposableRun>();
      assertTrue(taskRun.signal.aborted);
      assertEqual(taskRun.signal.reason, {
        type: "AbortError",
        reason: runDisposedAbortReason,
      });
      assertFalse(createdRun.signal.aborted);

      completeCreatedTask.resolve();

      assertEqual(await createdFiber, ok("created"));
    });

    it("created Run runs multiple Tasks and rejects later starts after disposal", async () => {
      const run = createRun();
      const createdRun = run.create();

      assertEqual(await createdRun(() => ok("a")), ok("a"));
      assertEqual(await createdRun(() => ok("b")), ok("b"));

      createdRun[Symbol.dispose]();
      const createdRunError = assertThrowsInstanceOf(
        () => createdRun(() => ok("later")),
        Error,
      );
      assertTrue(
        createdRunError.message.includes("Cannot use a disposed object."),
      );

      const rootDisposedRun = run.create();
      await run[Symbol.asyncDispose]();
      const rootRunError = assertThrowsInstanceOf(
        () => rootDisposedRun(() => ok("later")),
        Error,
      );
      assertTrue(
        rootRunError.message.includes("Cannot use a disposed object."),
      );
    });

    it("aborts and waits for child Tasks when created Run disposes", async () => {
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
          assertEqual(abortError, {
            type: "AbortError",
            reason: runDisposedAbortReason,
          });
          return err(abortError);
        }

        return ok();
      });

      assertNotUndefined(childSignal);
      const disposePromise = createdRun[Symbol.asyncDispose]().then(() => {
        disposeFinished = true;
      });

      assertTrue(childSignal.aborted);
      assertEqual(childSignal.reason, {
        type: "AbortError",
        reason: runDisposedAbortReason,
      });
      assertFalse(disposeFinished);

      completeChild.resolve();

      assertEqual(await childFiber, err(childSignal.reason));
      await disposePromise;
      assertTrue(disposeFinished);
      const error = assertThrowsInstanceOf(() => createdRun(() => ok()), Error);
      assertTrue(error.message.includes("Cannot use a disposed object."));
    });

    it("aborts and waits for created Run when root Run disposes", async () => {
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
          assertEqual(abortError, {
            type: "AbortError",
            reason: runDisposedAbortReason,
          });
          return err(abortError);
        }

        return ok();
      });

      assertNotUndefined(childSignal);
      const disposePromise = run[Symbol.asyncDispose]().then(() => {
        disposeFinished = true;
      });

      assertTrue(createdRun.signal.aborted);
      assertEqual(createdRun.signal.reason, {
        type: "AbortError",
        reason: runDisposedAbortReason,
      });
      assertTrue(childSignal.aborted);
      assertEqual(childSignal.reason, {
        type: "AbortError",
        reason: runDisposedAbortReason,
      });
      assertFalse(disposeFinished);

      completeChild.resolve();

      assertEqual(await childFiber, err(childSignal.reason));
      await disposePromise;
      assertTrue(disposeFinished);
    });

    it("created Run has Settled state after root disposal", async () => {
      const run = createRun();
      const createdRun = run.create();

      await run[Symbol.asyncDispose]();

      assertEqual(createdRun.getState(), {
        type: "Settled",
        abort: {
          request: runDisposedAbortReason,
          observed: runDisposedAbortReason,
        },
        exit: ok(ok()),
      });
    });

    it("created Run abort has custom abort in Settled state", async () => {
      await using root = createRun();
      const createdRun = root.create();

      createdRun.abort(testAbortReason);
      await createdRun[Symbol.asyncDispose]();

      assertEqual(createdRun.getState(), {
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
    it("prevents Run APIs after automatic Task Run disposal", async () => {
      await using run = createRun();
      let childRun: Run | undefined;

      const fiber = run((run) => {
        childRun = run;
        return ok();
      });

      assertEqual(await fiber, ok());

      assertNotUndefined(childRun);
      const disposedChildRun = childRun;
      const runError = assertThrowsInstanceOf(
        () => disposedChildRun(() => ok()),
        Error,
      );
      assertTrue(runError.message.includes("Cannot use a disposed object."));
      const abortableError = assertThrowsInstanceOf(
        () => disposedChildRun.abortable(() => ok()),
        Error,
      );
      assertTrue(
        abortableError.message.includes("Cannot use a disposed object."),
      );
      const daemonError = assertThrowsInstanceOf(
        () => disposedChildRun.daemon(() => ok()),
        Error,
      );
      assertTrue(daemonError.message.includes("Cannot use a disposed object."));
      const createError = assertThrowsInstanceOf(
        () => disposedChildRun.create(),
        Error,
      );
      assertTrue(createError.message.includes("Cannot use a disposed object."));
    });
  });

  describe("dependency injection", () => {
    it("provides default deps from createRun", async () => {
      await using run = createRun();

      assertType<typeof run.deps, RunDefaultDeps>();

      const fiber = run(({ deps }) => {
        assertType<typeof deps, RunDefaultDeps>();
        assertSame(deps, run.deps);
        return ok();
      });

      assertEqual(await fiber, ok());
    });

    it("creates independent default consoles", async () => {
      await using firstRun = createRun();
      await using secondRun = createRun();
      const secondRunLevel = secondRun.deps.console.getLevel();

      firstRun.deps.console.setLevel("silent");

      assertSame(secondRun.deps.console.getLevel(), secondRunLevel);
    });

    it("lets custom deps override defaults in createRun", async () => {
      await using run = createRun({ random });

      assertSame(run.deps.random, random);
    });

    it("merges custom deps and lets child Tasks inherit them", async () => {
      await using run = createRun(dbDep);

      assertType<typeof run, DisposableRun<DbDep>>();
      assertType<typeof run.deps, RunDefaultDeps & DbDep>();
      assertSame(run.deps.db, dbDep.db);

      const fiber = run(({ deps }) => {
        assertType<typeof deps, RunDefaultDeps & DbDep>();
        assertSame(deps.db, dbDep.db);
        return ok();
      });

      assertType<typeof fiber.run.deps.db, Db>();
      assertEqual(await fiber, ok());
    });

    describe("replaces custom deps and preserves overridden defaults", () => {
      it("for run(task, deps)", async () => {
        await using run = createRun({ ...dbDep, random });

        const fiber = run((run) => {
          assertSame(run.deps.db, dbDep.db);
          assertSame(run.deps.random, random);

          return run(({ deps }) => {
            assertType<typeof deps, RunDefaultDeps & SessionDep>();
            assertFalse("db" in deps);
            assertSame(deps.random, random);
            assertSame(deps.session, sessionDep.session);
            return ok();
          }, sessionDep);
        });

        assertEqual(await fiber, ok());
      });

      it("for run.abortable(task, deps)", async () => {
        await using run = createRun({ ...dbDep, random });

        const result = await run.abortable(({ deps }) => {
          assertFalse("db" in deps);
          assertSame(deps.random, random);
          assertSame(deps.session, sessionDep.session);
          assertType<typeof deps, RunDefaultDeps & SessionDep>();
          return ok(deps.session.userId);
        }, sessionDep);

        assertOk(result, "ada");
      });

      it("for run.daemon(task, deps)", async () => {
        await using run = createRun({ ...dbDep, random });

        const taskFiber = run(async ({ daemon }) => {
          const daemonResult = await daemon(({ deps }) => {
            assertFalse("db" in deps);
            assertSame(deps.random, random);
            assertSame(deps.session, sessionDep.session);
            assertType<typeof deps, RunDefaultDeps & SessionDep>();
            return ok(deps.session.userId);
          }, sessionDep);

          assertOk(daemonResult);
          return ok(daemonResult.value);
        });

        assertEqual(await taskFiber, ok("ada"));
      });

      it("for run.create(deps)", async () => {
        await using run = createRun({ ...dbDep, random });

        const taskFiber = run(async (run) => {
          await using createdRun = run.create(sessionDep);
          assertType<typeof createdRun, DisposableRun<SessionDep>>();

          return await createdRun(({ deps }) => {
            assertFalse("db" in deps);
            assertSame(deps.random, random);
            assertSame(deps.session, sessionDep.session);
            assertType<typeof deps, RunDefaultDeps & SessionDep>();
            return ok(deps.session.userId);
          });
        });

        assertEqual(await taskFiber, ok("ada"));
      });
    });

    describe("inherits current deps", () => {
      it("for run.daemon(task, deps)", async () => {
        await using run = createRun(dbDep);

        const taskFiber = run(async (run) => {
          const childResult = await run(async ({ daemon }) => {
            const daemonResult = await daemon(({ deps }) => {
              assertFalse("db" in deps);
              assertSame(deps.session, sessionDep.session);
              assertType<typeof deps, RunDefaultDeps & SessionDep>();
              return ok(deps.session.userId);
            });

            assertOk(daemonResult);
            return ok(daemonResult.value);
          }, sessionDep);

          assertOk(childResult);
          return ok(childResult.value);
        });

        assertEqual(await taskFiber, ok("ada"));
      });

      it("for run.create() by default", async () => {
        await using run = createRun(dbDep);

        const taskFiber = run(async (run) => {
          await using createdRun = run.create();
          assertType<typeof createdRun, DisposableRun<DbDep>>();

          return await createdRun(({ deps }) => {
            assertSame(deps.db, dbDep.db);
            assertType<typeof deps, RunDefaultDeps & DbDep>();
            return ok(deps.db.query("select"));
          });
        });

        assertEqual(await taskFiber, ok("result:select"));
      });
    });

    describe("rejects incompatible default dependency overrides", () => {
      it("in createRun", () => {
        // @ts-expect-error - Overlapping default deps must be compatible.
        void createRun({ random: "not random" });
      });

      it("for run(task, deps)", () => {
        const run = createRun();
        const task: Task<void, never, RandomDep> = () => ok();

        // @ts-expect-error - Overlapping default deps must be compatible.
        void run(task, { random: "not random" });
      });

      it("for run.abortable(task, deps)", () => {
        const run = createRun();
        const task: Task<void, never, RandomDep> = () => ok();

        // @ts-expect-error - Overlapping default deps must be compatible.
        void run.abortable(task, { random: "not random" });
      });

      it("for run.daemon(task, deps)", () => {
        const run = createRun();
        const task: Task<void, never, RandomDep> = () => ok();

        // @ts-expect-error - Overlapping default deps must be compatible.
        void run.daemon(task, { random: "not random" });
      });

      it("for run.create(deps)", async () => {
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
      it("for run.create(deps)", async () => {
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

      it("for Task deps overloads", () => {
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
    it("new Run starts in Running state", async () => {
      await using run = createRun();

      assertEqual(run.getState(), { type: "Running" });
    });

    it("pending Task Run stays in Running state", async () => {
      await using run = createRun();
      const completeTask = Promise.withResolvers<void>();
      let childRun: Run | undefined;

      const fiber = run(async (run) => {
        childRun = run;
        await completeTask.promise;
        return ok();
      });

      assertNotUndefined(childRun);
      assertEqual(childRun.getState(), { type: "Running" });

      completeTask.resolve();

      assertEqual(await fiber, ok());
    });

    it("async disposal records Aborted before child Tasks finish", async () => {
      const run = createRun();
      const completeChild = Promise.withResolvers<void>();

      const childFiber = run(async () => {
        await completeChild.promise;
        return ok();
      });

      const disposePromise = run[Symbol.asyncDispose]();
      assertEqual(run.getState(), {
        type: "Aborted",
        abort: {
          request: runDisposedAbortReason,
          observed: runDisposedAbortReason,
        },
      });

      completeChild.resolve();

      assertEqual(await childFiber, ok());
      await disposePromise;
    });

    it("created Run async disposal records Aborted before Settled", async () => {
      await using run = createRun();
      const createdRun = run.create();

      const disposePromise = createdRun[Symbol.asyncDispose]();
      assertEqual(createdRun.getState(), {
        type: "Aborted",
        abort: {
          request: runDisposedAbortReason,
          observed: runDisposedAbortReason,
        },
      });

      await disposePromise;
      assertEqual(createdRun.getState(), {
        type: "Settled",
        abort: {
          request: runDisposedAbortReason,
          observed: runDisposedAbortReason,
        },
        exit: ok(ok()),
      });
    });

    it("async disposal has successful Settled state", async () => {
      const run = createRun();

      await run[Symbol.asyncDispose]();

      assertEqual(run.getState(), {
        type: "Settled",
        abort: {
          request: runDisposedAbortReason,
          observed: runDisposedAbortReason,
        },
        exit: ok(ok()),
      });
    });

    it("Task Run has Task Result in Settled state", async () => {
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

      assertEqual(await okFiber, ok("Ada"));
      assertEqual(await errFiber, err(notFoundError));

      assertNotUndefined(okRun);
      assertEqual(okRun.getState(), {
        type: "Settled",
        abort: {
          request: runDisposedAbortReason,
          observed: runDisposedAbortReason,
        },
        exit: ok(ok("Ada")),
      });
      assertNotUndefined(errRun);
      assertEqual(errRun.getState(), {
        type: "Settled",
        abort: {
          request: runDisposedAbortReason,
          observed: runDisposedAbortReason,
        },
        exit: ok(err(notFoundError)),
      });
    });

    it("Task Run has observed abort in Settled state", async () => {
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

      assertEqual(await fiber, err(testAbortError));

      assertNotUndefined(childRun);
      assertEqual(childRun.getState(), {
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
    it("returns current state and child snapshots", async () => {
      await using run = createRun();
      const completeChild = Promise.withResolvers<void>();

      assertEqual(run.snapshot(), {
        id: run.id,
        state: { type: "Running" },
        children: [],
        abortMask: 0,
      });

      const childFiber = run(async () => {
        await completeChild.promise;
        return ok("child");
      });

      assertEqual(run.snapshot(), {
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

      assertEqual(await childFiber, ok("child"));
      assertEqual(run.snapshot(), {
        id: run.id,
        state: { type: "Running" },
        children: [],
        abortMask: 0,
      });
    });

    it("includes abort mask depth and requested versus observed aborts", async () => {
      const run = createRun();
      const completeChild = Promise.withResolvers<void>();

      const childFiber = run(
        unabortable(async () => {
          await completeChild.promise;
          return ok();
        }),
      );

      try {
        const runningSnapshot = run.snapshot();
        assertEqual(runningSnapshot.abortMask, 0);
        assertLength(runningSnapshot.children, 1);
        assertEqual(runningSnapshot.children[0].abortMask, 1);

        const disposePromise = run[Symbol.asyncDispose]();
        const snapshot = run.snapshot();
        const state = snapshot.state;
        assertSame(state.type, "Aborted");
        assertSame(state.abort.request, runDisposedAbortReason);
        assertSame(state.abort.observed, state.abort.request);

        assertLength(snapshot.children, 1);
        const childState = snapshot.children[0].state;
        assertSame(childState.type, "Aborted");
        assertSame(childState.abort.request, state.abort.request);
        assertSame(childState.abort.observed, null);

        completeChild.resolve();
        await disposePromise;
      } finally {
        completeChild.resolve();
        assertEqual(await childFiber, ok());
      }
    });

    it("snapshot reuses unchanged snapshot objects", async () => {
      await using run = createRun();

      const emptySnapshot = run.snapshot();

      assertSame(run.snapshot(), emptySnapshot);

      const completeChild = Promise.withResolvers<void>();
      const childFiber = run(async () => {
        await completeChild.promise;
        return ok();
      });

      const snapshotWithChild = run.snapshot();
      const childSnapshot = snapshotWithChild.children.at(0);
      assertNotUndefined(childSnapshot);

      try {
        const repeatedSnapshotWithChild = run.snapshot();

        assertSame(repeatedSnapshotWithChild, snapshotWithChild);
        assertSame(repeatedSnapshotWithChild.children[0], childSnapshot);
      } finally {
        completeChild.resolve();
        assertEqual(await childFiber, ok());
      }

      assertFalse(Object.is(run.snapshot(), snapshotWithChild));
    });

    it("snapshot reuses unchanged aborted snapshot objects", () => {
      using run = createRun();

      run.abort({ type: "TestAbort" });
      const snapshot = run.snapshot();

      assertSame(run.snapshot(), snapshot);
    });

    it("includes a starting child observed from its Task synchronous prefix", async () => {
      await using run = createRun();
      let childrenDuringStart: ReadonlyArray<RunSnapshot> | undefined;

      // The child Run is registered before its Task starts, so disposal can
      // wait for it and observability can see it during the Task's
      // synchronous prefix.
      const childFiber = run((taskRun) => {
        childrenDuringStart = taskRun.parent?.snapshot().children;
        return ok("child");
      });

      assertEqual(await childFiber, ok("child"));
      assertNotUndefined(childrenDuringStart);
      assertLength(childrenDuringStart, 1);
      assertSame(childrenDuringStart[0].id, childFiber.run.id);
    });
  });

  describe("event reporting", () => {
    it("emits Run events only while eventsEnabled is true", async () => {
      const eventsEnabled = createRef(false);
      await using run = testCreateRun({ runConfig: { eventsEnabled } });
      const events: Array<RunEvent> = [];

      run.onEvent = (event) => {
        events.push(event);
      };

      assertEqual(await run(() => ok("disabled")), ok("disabled"));
      assertEqual(events, []);

      eventsEnabled.set(true);

      const fiber = run(() => ok("enabled"));

      assertEqual(await fiber, ok("enabled"));
      assertEqual(events, [
        {
          data: { childId: "in2khoBFZNo9ESZlzuacxA", type: "ChildAdded" },
          id: "ncqMQ1uwd5-zf5YKUbT3VA",
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
          id: "in2khoBFZNo9ESZlzuacxA",
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
          id: "in2khoBFZNo9ESZlzuacxA",
          timestamp: 0,
        },
        {
          data: { childId: "in2khoBFZNo9ESZlzuacxA", type: "ChildRemoved" },
          id: "ncqMQ1uwd5-zf5YKUbT3VA",
          timestamp: 0,
        },
      ]);
    });

    it("preserves eventsEnabled when replacing custom deps", async () => {
      await using run = testCreateRun({ ...eventsEnabled, ...dbDep });
      const events: Array<RunEvent> = [];

      run.onEvent = (event) => {
        events.push(event);
      };

      assertEqual(
        await run(({ deps }) => ok(deps.session.userId), sessionDep),
        ok("ada"),
      );

      // Replacing custom deps must keep runConfig, so events are still
      // emitted. The full event shape is covered by the snapshot above.
      assertEqual(
        events.map((event) => event.data.type),
        ["ChildAdded", "StateChanged", "StateChanged", "ChildRemoved"],
      );
    });

    it("uses root time for child Run event timestamps when child replaces time", async () => {
      await using run = testCreateRun(eventsEnabled);
      const events: Array<RunEvent> = [];
      const childTime = testCreateTime({ startAt: Millis.orThrow(1000) });

      run.onEvent = (event) => {
        events.push(event);
      };

      assertEqual(
        await run(() => ok("child"), {
          runConfig: { eventsEnabled: createRef(true) },
          time: childTime,
        }),
        ok("child"),
      );

      assertEqual(
        events.map((event) => event.timestamp),
        [0, 0, 0, 0],
      );
    });

    it("explicit runConfig override silences child events for ancestors", async () => {
      await using run = testCreateRun(eventsEnabled);
      const events: Array<RunEvent> = [];

      run.onEvent = (event) => {
        events.push(event);
      };

      // eventsEnabled gates the emitter, not observers: the parent still
      // emits its own ChildAdded/ChildRemoved, but the opted-out child and its
      // descendants emit nothing, even though the ancestor monitors.
      const silencedFiber = run(async (run) => run(() => ok("grandchild")), {
        runConfig: { eventsEnabled: createRef(false) },
      });

      assertEqual(await silencedFiber, ok("grandchild"));
      assertEqual(
        events.map((event) => event.data.type),
        ["ChildAdded", "ChildRemoved"],
      );
      // Both events come from the parent Run; the silenced child and its
      // descendants emitted nothing.
      assertEqual(
        events.map((event) => event.id),
        [run.id, run.id],
      );
    });

    it("sets parent and bubbles Run events", async () => {
      await using run = testCreateRun(eventsEnabled);
      const events: Array<RunEvent> = [];

      run.onEvent = (event) => {
        events.push(event);
      };

      assertSame(run.parent, null);

      const fiber = run((childRun) => {
        assertSame(childRun.parent, run);
        return ok("Ada");
      });

      assertSame(fiber.run.parent, run);

      assertEqual(await fiber, ok("Ada"));
      assertEqual(
        events.map((event) => event.data.type),
        ["ChildAdded", "StateChanged", "StateChanged", "ChildRemoved"],
      );
      // The StateChanged events are emitted by the child Run and bubble to
      // the parent handler.
      assertEqual(
        events
          .filter((event) => event.data.type === "StateChanged")
          .map((event) => event.id),
        [fiber.run.id, fiber.run.id],
      );
    });

    it("does not delay ChildRemoved for Fiber settlement reactions", async () => {
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

      assertFalse(await childRemovedDelayedForFiberSettlement.promise);
      assertEqual(await fiber, ok("Ada"));
    });

    it("bubbles StateChanged after child snapshot records observed abort", async () => {
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

      assertEqual(await fiber, ok());

      assertNotUndefined(abortedRunId);
      assertNotUndefined(abortedSnapshot);
      const childSnapshot = abortedSnapshot.children.find(
        (child) => child.id === abortedRunId,
      );
      assertNotUndefined(childSnapshot);
      assertNotUndefined(abortReason);
      assertSame(abortReason, runDisposedAbortReason);
      assertEqual(childSnapshot.state, {
        type: "Aborted",
        abort: { request: abortReason, observed: abortReason },
      });
    });

    it("reports Run event handler defects", async () => {
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

      assertSame(await run.deps.reportDefect.next(), error);
    });

    it("routes Run event handler defects through custom reportDefect", async () => {
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

      assertSame(await reportedError.promise, error);
    });

    it("continues bubbling current Run event after handler defects", async () => {
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

      assertEqual(await fiber, ok("Ada"));
      assertSame(await run.deps.reportDefect.next(), error);
      // The defecting child handler did not stop delivery to the parent.
      assertEqual(
        events.map((event) => event.data.type),
        ["ChildAdded", "StateChanged", "StateChanged", "ChildRemoved"],
      );
    });

    it("reports Run event emission defects without interrupting Task settlement", async () => {
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

      assertEqual(await fiber, ok("Ada"));
      assertSame(await run.deps.reportDefect.next(), error);
    });
  });

  describe("panic", () => {
    describe("from Task defects", () => {
      it("has Task Run Settled state and aborts root with PanicAbortReason", async () => {
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

        await assertRejects(observedFiber, panic(error));
        assertNotUndefined(rootStateAfterDefect);
        assertPanicAbortError(rootAbortObservedAfterDefect, error);
        assertEqual(rootStateAfterDefect, {
          type: "Aborted",
          abort: {
            request: rootAbortObservedAfterDefect.reason,
            observed: rootAbortObservedAfterDefect.reason,
          },
        });
        assertEqual(fiber.run.getState(), {
          type: "Settled",
          abort: {
            request: rootAbortObservedAfterDefect.reason,
            observed: rootAbortObservedAfterDefect.reason,
          },
          exit: err(rootAbortObservedAfterDefect),
        });

        assertTrue(run.signal.aborted);
        const panicAbortError: unknown = run.signal.reason;
        assertType(AbortError, panicAbortError);
        assertEqual(panicAbortError.reason, {
          type: "PanicAbortReason",
          defect: error,
        });
        assertSame(await run.deps.reportDefect.next(), panicAbortError);

        await run[Symbol.asyncDispose]();

        assertEqual(run.getState(), {
          type: "Settled",
          abort: {
            request: panicAbortError.reason,
            observed: panicAbortError.reason,
          },
          exit: err(panicAbortError),
        });
      });

      it("aborts child Tasks of defecting Task and reports panic abort", async () => {
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
        assertType(AbortError, panicAbortError);
        assertEqual(panicAbortError.reason, {
          type: "PanicAbortReason",
          defect: error,
        });
        assertTrue(childSignal.aborted);
        assertType(AbortError, childSignal.reason);
        assertSame(childSignal.reason.reason, panicAbortError.reason);
        assertSame(await run.deps.reportDefect.next(), panicAbortError);

        completeChild.resolve();

        await assertRejects(defectFiber, panic(error));
        await run[Symbol.asyncDispose]();
      });

      it("preserves parent Ok when an unjoined child defects during cleanup", async () => {
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
        assertPanicAbortError(panicAbortError, error);
        assertEqual(await parentFiber, ok("parent"));
        await run[Symbol.asyncDispose]();
      });

      it("aborts running sibling Task, waits for it, and reports panic abort", async () => {
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

        await assertRejects(defectFiber, panic(error));

        const panicAbortError: unknown = run.signal.reason;
        assertType(AbortError, panicAbortError);
        assertEqual(panicAbortError.reason, {
          type: "PanicAbortReason",
          defect: error,
        });

        const siblingSignal = await siblingAborted.promise;
        assertTrue(siblingSignal.aborted);
        assertType(AbortError, siblingSignal.reason);
        assertSame(siblingSignal.reason.reason, panicAbortError.reason);
        assertEqual(run.getState(), {
          type: "Aborted",
          abort: {
            request: panicAbortError.reason,
            observed: panicAbortError.reason,
          },
        });
        assertSame(await run.deps.reportDefect.next(), panicAbortError);

        completeSibling.resolve();

        assertEqual(await siblingFiber, ok("sibling"));
        await run[Symbol.asyncDispose]();
        assertEqual(run.getState(), {
          type: "Settled",
          abort: {
            request: panicAbortError.reason,
            observed: panicAbortError.reason,
          },
          exit: err(panicAbortError),
        });
      });

      it("prevents new Tasks from panic abort callbacks and reports panic abort", async () => {
        await using run = testCreateRun();
        const error = new Error("boom");
        let panicAbortCallbackCalled = false;
        let childTaskStarted = false;

        using _ = run.onAbort(() => {
          panicAbortCallbackCalled = true;

          const error = assertThrowsInstanceOf(() => {
            const childFiber = run(() => {
              childTaskStarted = true;
              return ok();
            });
            void childFiber.catch(() => undefined);
          }, Error);
          assertTrue(error.message.includes("Cannot use a disposed object."));
        });

        const fiber = run(() => {
          throw error;
        });

        await assertRejects(fiber, panic(error));

        assertTrue(panicAbortCallbackCalled);
        assertFalse(childTaskStarted);
        assertEqual(await run.deps.reportDefect.next(), panic(error));
      });

      it("stores reported panic exit during root disposal", async () => {
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
        assertEqual(disposalAbortError, {
          type: "AbortError",
          reason: runDisposedAbortReason,
        });

        try {
          defectTask.resolve();

          const panicAbortError = await run.deps.reportDefect.next();
          await assertRejectsSame(fiber, panicAbortError);
          await disposePromise;
          assertEqual(run.getState(), {
            type: "Settled",
            abort: {
              request: disposalAbortReason,
              observed: disposalAbortReason,
            },
            exit: err(panicAbortError),
          });
          assertEqual(run.snapshot().state, {
            type: "Settled",
            abort: {
              request: disposalAbortReason,
              observed: disposalAbortReason,
            },
            exit: err(panicAbortError),
          });
        } finally {
          await disposePromise;
        }
      });

      it("keeps first panic exit and reports every Fiber defect", async () => {
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
          assertType(AbortError, panicAbortError);
          await assertRejectsSame(firstFiber, panicAbortError);
          assertEqual(panicAbortError.reason, {
            type: "PanicAbortReason",
            defect: firstError,
          });

          defectSecondTask.resolve();

          const secondPanicAbortError = await run.deps.reportDefect.next();
          await assertRejectsSame(secondFiber, secondPanicAbortError);
          assertEqual(secondPanicAbortError, panic(secondError));
          await run[Symbol.asyncDispose]();
          assertEqual(run.getState(), {
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

      it("panics root and reports Task helper user code defects", async () => {
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

        assertEqual(await siblingAborted.promise, {
          type: "PanicAbortReason",
          defect,
        });
        const panicAbortError = run.signal.reason;
        assertSame(await run.deps.reportDefect.next(), panicAbortError);
        await assertRejects(defectFiber, panic(defect));
        assertEqual(run.deps.reportDefect.getDefectsSnapshot(), [
          panicAbortError,
        ]);

        completeSibling.resolve();

        assertEqual(await siblingFiber, ok("sibling"));
      });
    });

    describe("from abort callback defects", () => {
      it("panics root synchronously and reports abort callback defects", async () => {
        const run = testCreateRun();
        const createdRun = run.create();
        const error = new Error("abort callback failed");

        using _ = createdRun.onAbort((): void => {
          throw error;
        });

        const disposePromise = createdRun[Symbol.asyncDispose]();
        const panicAbortError: unknown = run.signal.reason;
        assertType(AbortError, panicAbortError);
        assertEqual(panicAbortError.reason, {
          type: "PanicAbortReason",
          defect: error,
        });
        assertEqual(run.getState(), {
          type: "Aborted",
          abort: {
            request: panicAbortError.reason,
            observed: panicAbortError.reason,
          },
        });

        try {
          assertSame(await run.deps.reportDefect.next(), panicAbortError);
          await disposePromise;
          await run[Symbol.asyncDispose]();
          assertEqual(run.getState(), {
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

      it("keeps first panic abort and reports repeated panics", async () => {
        const run = testCreateRun();
        const firstError = new Error("first boom");
        const secondError = new Error("second boom");

        run.panic(firstError);
        run.panic(secondError);

        const panicAbortError: unknown = run.signal.reason;
        assertType(AbortError, panicAbortError);
        assertEqual(panicAbortError.reason, {
          type: "PanicAbortReason",
          defect: firstError,
        });
        assertSame(await run.deps.reportDefect.next(), panicAbortError);
        assertEqual(await run.deps.reportDefect.next(), panic(secondError));

        await run[Symbol.asyncDispose]();
        assertEqual(run.getState(), {
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
});

describe("DisposableRun", () => {
  describe("defer", () => {
    it("runs finalizers LIFO after child Tasks settle and awaits them", async () => {
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
        assertEqual(events, []);

        completeChild.resolve();
        await finalizerStarted.promise;

        assertEqual(events, ["child settled", "second finalizer"]);
        assertFalse(disposalSettled);

        continueFinalizer.resolve();
        await disposal;

        assertEqual(events, [
          "child settled",
          "second finalizer",
          "first finalizer",
        ]);
        assertEqual(await childFiber, ok());
      } finally {
        completeChild.resolve();
        continueFinalizer.resolve();
        await disposal;
      }
    });

    it("reports a finalizer defect once and async disposal rejects with the same AbortError", async () => {
      const run = testCreateRun();
      const defect = new Error("finalizer failed");

      run.defer(() => {
        throw defect;
      });

      await assertRejects(run[Symbol.asyncDispose](), (disposalError) => {
        assertPanicAbortError(disposalError, defect);
        assertEqual(run.deps.reportDefect.getDefectsSnapshot(), [
          disposalError,
        ]);
      });
    });

    it("after disposal starts throws", async () => {
      const run = createRun();

      run[Symbol.dispose]();

      const error = assertThrowsInstanceOf(
        () => run.defer(() => undefined),
        Error,
      );
      assertTrue(error.message.includes("Cannot use a disposed object."));

      await run[Symbol.asyncDispose]();
    });

    it("reports multiple finalizer defects as SuppressedError", async () => {
      const run = testCreateRun();
      const firstDefect = new Error("first finalizer failed");
      const secondDefect = new Error("second finalizer failed");

      run.defer(() => {
        throw firstDefect;
      });
      run.defer(() => {
        throw secondDefect;
      });

      await assertRejects(run[Symbol.asyncDispose](), (disposalError) => {
        assertType(AbortError, disposalError);
        assertSame(disposalError.reason.type, "PanicAbortReason");
        const defect = disposalError.reason.defect;
        assertInstanceOf(defect, SuppressedError);
        assertSame(defect.error, firstDefect);
        assertSame(defect.suppressed, secondDefect);
        assertEqual(run.deps.reportDefect.getDefectsSnapshot(), [
          disposalError,
        ]);
      });
    });
  });

  describe("abort", () => {
    it("aborts with custom reason without waiting for child Tasks", async () => {
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
      assertNotUndefined(childRun);

      run.abort(testAbortReason);

      assertEqual(run.getState(), {
        type: "Aborted",
        abort: {
          request: testAbortReason,
          observed: testAbortReason,
        },
      });
      assertTrue(childRun.signal.aborted);
      assertEqual(childRun.signal.reason, testAbortError);
      assertFalse(childContinued);

      completeChild.resolve();

      await assertRejects(childFiber, testAbortError);
      await run[Symbol.asyncDispose]();
      assertEqual(run.getState(), {
        type: "Settled",
        abort: {
          request: testAbortReason,
          observed: testAbortReason,
        },
        exit: err(testAbortError),
      });
    });

    it("does nothing after disposal starts", async () => {
      const run = createRun();

      run[Symbol.dispose]();
      run.abort(testAbortReason);

      assertEqual(run.signal.reason, {
        type: "AbortError",
        reason: runDisposedAbortReason,
      });

      await run[Symbol.asyncDispose]();
      assertEqual(run.getState(), {
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
    it("prevents new Tasks immediately when dispose runs", async () => {
      const run = createRun();
      let taskStarted = false;

      run[Symbol.dispose]();

      const error = assertThrowsInstanceOf(
        () =>
          run(() => {
            taskStarted = true;
            return ok("Ada");
          }),
        Error,
      );
      assertTrue(error.message.includes("Cannot use a disposed object."));
      assertFalse(taskStarted);

      await run[Symbol.asyncDispose]();
    });

    it("aborts self immediately", async () => {
      const run = createRun();

      assertFalse(run.signal.aborted);

      run[Symbol.dispose]();

      assertTrue(run.signal.aborted);
      assertEqual(run.signal.reason, {
        type: "AbortError",
        reason: runDisposedAbortReason,
      });

      await run[Symbol.asyncDispose]();
    });

    it("settles on next microtask after sync dispose", async () => {
      const run = createRun();

      run[Symbol.dispose]();

      assertEqual(run.getState(), {
        type: "Aborted",
        abort: {
          request: runDisposedAbortReason,
          observed: runDisposedAbortReason,
        },
      });

      await Promise.resolve();

      assertEqual(run.getState(), {
        type: "Settled",
        abort: {
          request: runDisposedAbortReason,
          observed: runDisposedAbortReason,
        },
        exit: ok(ok()),
      });
    });

    it("aborts already-running child Runs immediately", async () => {
      const run = createRun();
      const completeChild = Promise.withResolvers<void>();
      let childRun: Run | undefined;

      void run(async (run) => {
        childRun = run;
        await completeChild.promise;
        return ok();
      });
      assertNotUndefined(childRun);

      assertFalse(childRun.signal.aborted);

      run[Symbol.dispose]();

      assertTrue(childRun.signal.aborted);
      assertEqual(childRun.signal.reason, {
        type: "AbortError",
        reason: runDisposedAbortReason,
      });

      completeChild.resolve();

      await run[Symbol.asyncDispose]();
    });

    it("dispose returns before already-running child Tasks settle", async () => {
      const run = createRun();
      const completeChild = Promise.withResolvers<void>();
      let childSettled = false;

      const childFiber = run(async () => {
        await completeChild.promise;
        childSettled = true;
        return ok();
      });

      run[Symbol.dispose]();

      assertFalse(childSettled);

      completeChild.resolve();

      assertEqual(await childFiber, ok());
      await run[Symbol.asyncDispose]();
    });
  });

  describe("asyncDispose", () => {
    it("prevents new Tasks immediately when asyncDispose starts", async () => {
      const run = createRun();
      let taskStarted = false;

      const disposePromise = run[Symbol.asyncDispose]();

      const error = assertThrowsInstanceOf(
        () =>
          run(() => {
            taskStarted = true;
            return ok("Ada");
          }),
        Error,
      );
      assertTrue(error.message.includes("Cannot use a disposed object."));
      assertFalse(taskStarted);

      await disposePromise;
    });

    it("aborts self immediately", async () => {
      const run = createRun();

      assertFalse(run.signal.aborted);

      const disposePromise = run[Symbol.asyncDispose]();

      assertTrue(run.signal.aborted);
      assertEqual(run.signal.reason, {
        type: "AbortError",
        reason: runDisposedAbortReason,
      });

      await disposePromise;
    });

    it("aborts self before waiting for child Tasks", async () => {
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

      assertTrue(run.signal.aborted);
      assertFalse(disposeFinished);

      completeChild.resolve();

      assertEqual(await childFiber, ok());
      await disposePromise;
    });

    it("waits for child Task that disposes Run while starting", async () => {
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

      assertNotUndefined(disposePromise);

      const disposeFinishedWhileChildRunning = disposeFinished;

      completeChild.resolve();

      assertEqual(await childFiber, ok());
      await disposePromise;
      assertFalse(disposeFinishedWhileChildRunning);
      assertTrue(disposeFinished);
    });

    it("aborts already-running child Runs immediately", async () => {
      const run = createRun();
      const completeChild = Promise.withResolvers<void>();
      let childRun: Run | undefined;

      void run(async (run) => {
        childRun = run;
        await completeChild.promise;
        return ok();
      });
      assertNotUndefined(childRun);
      let disposeFinished = false;

      assertFalse(childRun.signal.aborted);
      const disposePromise = run[Symbol.asyncDispose]().then(() => {
        disposeFinished = true;
      });
      assertTrue(childRun.signal.aborted);
      assertEqual(childRun.signal.reason, {
        type: "AbortError",
        reason: runDisposedAbortReason,
      });
      assertFalse(disposeFinished);

      completeChild.resolve();

      await disposePromise;
      assertTrue(disposeFinished);
    });

    it("waits for already-running child Tasks to settle", async () => {
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

      assertEqual(await firstChildFiber, ok("first"));
      assertEqual(await secondChildFiber, ok("second"));
      await disposePromise;

      assertFalse(disposeFinishedWhileChildrenRunning);
      assertTrue(disposeFinished);
    });
  });
});

describe("AbortableFiber", () => {
  it("asyncDispose aborts and waits for Task settlement", async () => {
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

    assertNotUndefined(signal);
    const disposePromise = fiber[Symbol.asyncDispose]().then(() => {
      disposeFinished = true;
    });

    assertTrue(signal.aborted);
    assertEqual(signal.reason, {
      type: "AbortError",
      reason: explicitAbortReason,
    });

    assertFalse(disposeFinished);

    continueTask.resolve();

    assertEqual(await fiber, err(signal.reason));
    await disposePromise;
    assertTrue(disposeFinished);
  });
});

describe("collection helpers", () => {
  describe("runtime", () => {
    const helpers: ReadonlyArray<{
      readonly name: string;
      readonly mapsValues: boolean;
      readonly resultMode: "values" | "results" | "void";
      readonly errorMode: "failFast" | "settled";
      readonly fromArray: (
        tasks: ReadonlyArray<AnyTask>,
        options?: TaskCollectionOptions,
      ) => AnyTask;
      readonly fromRecord: (
        tasks: Readonly<Record<string, AnyTask>>,
        options?: TaskCollectionOptions,
      ) => AnyTask;
    }> = [
      {
        name: "all",
        mapsValues: false,
        resultMode: "values",
        errorMode: "failFast",
        fromArray: (tasks, options) => all(tasks, options),
        fromRecord: (tasks, options) => all(tasks, options),
      },
      {
        name: "allSettled",
        mapsValues: false,
        resultMode: "results",
        errorMode: "settled",
        fromArray: (tasks, options) => allSettled(tasks, options),
        fromRecord: (tasks, options) => allSettled(tasks, options),
      },
      {
        name: "all mapping overload",
        mapsValues: true,
        resultMode: "values",
        errorMode: "failFast",
        fromArray: (tasks, options) => all(tasks, (task) => task, options),
        fromRecord: (tasks, options) => all(tasks, (task) => task, options),
      },
      {
        name: "allSettled mapping overload",
        mapsValues: true,
        resultMode: "results",
        errorMode: "settled",
        fromArray: (tasks, options) =>
          allSettled(tasks, (task) => task, options),
        fromRecord: (tasks, options) =>
          allSettled(tasks, (task) => task, options),
      },
      {
        name: "all without collecting",
        mapsValues: false,
        resultMode: "void",
        errorMode: "failFast",
        fromArray: (tasks, options) =>
          all(tasks, { ...options, collect: false }),
        fromRecord: (tasks, options) =>
          all(tasks, { ...options, collect: false }),
      },
      {
        name: "all mapping overload without collecting",
        mapsValues: true,
        resultMode: "void",
        errorMode: "failFast",
        fromArray: (tasks, options) =>
          all(tasks, (task) => task, { ...options, collect: false }),
        fromRecord: (tasks, options) =>
          all(tasks, (task) => task, { ...options, collect: false }),
      },
    ];

    for (const helper of helpers) {
      const expectedArrayValue = (
        values: ReadonlyArray<unknown>,
      ): ReadonlyArray<unknown> | undefined =>
        helper.resultMode === "results"
          ? values.map((value) => ok(value))
          : helper.resultMode === "values"
            ? values
            : undefined;

      const expectedRecordValue = (
        values: Readonly<Record<string, unknown>>,
      ): Readonly<Record<string, unknown>> | undefined =>
        helper.resultMode === "results"
          ? Object.fromEntries(
              Object.entries(values).map(([key, value]) => [key, ok(value)]),
            )
          : helper.resultMode === "values"
            ? values
            : undefined;

      const taskNoun = helper.mapsValues ? "mapped Tasks" : "Tasks";
      const taskSingular = taskNoun === "Tasks" ? "Task" : "mapped Task";

      describe(helper.name, () => {
        describe("returns", () => {
          it("Ok with empty collections", async () => {
            await using run = createRun();

            assertEqual(
              await run(helper.fromArray(emptyArray)),
              ok(expectedArrayValue(emptyArray)),
            );
            assertEqual(
              await run(helper.fromRecord({})),
              ok(expectedRecordValue(emptyRecord)),
            );
          });

          if (helper.resultMode === "values") {
            it(`Ok with all values when all ${taskNoun} return Ok`, async () => {
              await using run = createRun();

              const tasks: ReadonlyArray<AnyTask> = [
                () => ok("Ada"),
                () => ok(37),
                () => ok(true),
              ];

              assertEqual(
                await run(helper.fromArray(tasks)),
                ok(["Ada", 37, true]),
              );
            });
          } else if (helper.resultMode === "results") {
            it(`Ok with all Results when ${taskNoun} return Ok or Err`, async () => {
              const taskError = { type: "TaskError" } as const;

              await using run = createRun();

              const tasks: ReadonlyArray<AnyTask> = [
                () => ok("Ada"),
                () => err(taskError),
                () => ok(true),
              ];

              assertEqual(
                await run(helper.fromArray(tasks)),
                ok([ok("Ada"), err(taskError), ok(true)]),
              );
            });
          } else {
            it(`Ok with void when all ${taskNoun} return Ok`, async () => {
              await using run = createRun();

              const tasks: ReadonlyArray<AnyTask> = [
                () => ok("Ada"),
                () => ok(37),
                () => ok(true),
              ];

              assertEqual(await run(helper.fromArray(tasks)), ok());
            });
          }

          it(
            helper.resultMode === "void"
              ? `Ok with void when all record ${taskNoun} return Ok`
              : `preserves record keys when ${taskNoun} return Ok`,
            async () => {
              await using run = createRun();

              const tasks: Readonly<Record<string, AnyTask>> = {
                name: () => ok("Ada"),
                age: () => ok(37),
                active: () => ok(true),
              };

              assertEqual(
                await run(helper.fromRecord(tasks)),
                ok(
                  expectedRecordValue({
                    name: "Ada",
                    age: 37,
                    active: true,
                  }),
                ),
              );
            },
          );

          if (helper.errorMode === "failFast") {
            it(`the first Err when a ${taskSingular} returns Err`, async () => {
              await using run = createRun();
              const firstError = { type: "FirstError" } as const;
              const secondError = { type: "SecondError" } as const;

              const first: Task<string, typeof firstError> = () =>
                err(firstError);
              const second: Task<string, typeof secondError> = () =>
                err(secondError);

              assertEqual(
                await run(helper.fromArray([first, second])),
                err(firstError),
              );
            });
          }

          if (helper.mapsValues) {
            it("maps values to Tasks", async () => {
              interface Deps {
                readonly prefix: string;
              }
              interface TaskError {
                readonly type: "TaskError";
              }

              await using run = createRun<Deps>({ prefix: "#" });
              const calls: Array<ReadonlyArray<unknown>> = [];

              if (helper.errorMode === "failFast") {
                const mapper = (
                  ...args: [number, ...ReadonlyArray<unknown>]
                ): Task<string, TaskError, Deps> => {
                  calls.push(args);
                  const [value] = args;
                  return (run) => ok(`${run.deps.prefix}${value}`);
                };
                const task: AnyTask =
                  helper.resultMode === "void"
                    ? all([1, 2, 3], mapper, { collect: false })
                    : all([1, 2, 3], mapper);

                assertEqual(calls, [
                  [1, 0],
                  [2, 1],
                  [3, 2],
                ]);
                assertEqual(
                  await run(task),
                  helper.resultMode === "void" ? ok() : ok(["#1", "#2", "#3"]),
                );
              } else {
                const taskError: TaskError = { type: "TaskError" };
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
                const task = allSettled([1, 2, 3], mapper);

                assertEqual(calls, [
                  [1, 0],
                  [2, 1],
                  [3, 2],
                ]);
                assertEqual(
                  await run(task),
                  ok([ok("#1"), err(taskError), ok("#3")]),
                );
              }

              assertEqual(calls, [
                [1, 0],
                [2, 1],
                [3, 2],
              ]);
            });

            it("maps record values to Tasks", async () => {
              interface Deps {
                readonly prefix: string;
              }
              interface TaskError {
                readonly type: "TaskError";
              }

              await using run = createRun<Deps>({ prefix: "#" });

              const values = { one: 1, two: 2, three: 3 } as const;
              const calls: Array<ReadonlyArray<unknown>> = [];

              if (helper.errorMode === "failFast") {
                const mapper = (
                  ...args: [number, ...ReadonlyArray<unknown>]
                ): Task<string, TaskError, Deps> => {
                  calls.push(args);
                  const [value] = args;
                  return (run) => ok(`${run.deps.prefix}${value}`);
                };
                const task: AnyTask =
                  helper.resultMode === "void"
                    ? all(values, mapper, { collect: false })
                    : all(values, mapper);

                assertEqual(calls, [
                  [1, "one"],
                  [2, "two"],
                  [3, "three"],
                ]);
                assertEqual(
                  await run(task),
                  helper.resultMode === "void"
                    ? ok()
                    : ok({ one: "#1", two: "#2", three: "#3" }),
                );
              } else {
                const taskError: TaskError = { type: "TaskError" };
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
                const task = allSettled(values, mapper);

                assertEqual(calls, [
                  [1, "one"],
                  [2, "two"],
                  [3, "three"],
                ]);
                assertEqual(
                  await run(task),
                  ok({
                    one: ok("#1"),
                    two: err(taskError),
                    three: ok("#3"),
                  }),
                );
              }

              assertEqual(calls, [
                [1, "one"],
                [2, "two"],
                [3, "three"],
              ]);
            });

            it("mapped Task output with metadata applied", async () => {
              const priorities: Array<TaskPriority | undefined> = [];

              using _scheduler = testStubGlobal("scheduler", {
                postTask: async <T>(
                  callback: () => T | PromiseLike<T>,
                  options?: { readonly priority?: TaskPriority },
                ): Promise<T> => {
                  priorities.push(options?.priority);
                  return callback();
                },
              });

              await using run = createRun();
              const task = helper.fromArray([
                prioritized("background", () => ok(1)),
              ]);

              assertEqual(await run(task), ok(expectedArrayValue([1])));
              assertEqual(priorities, ["background"]);
            });
          }

          if (helper.resultMode !== "void") {
            it(`preserves input order when ${taskNoun} settle out of order`, async () => {
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
                helper.fromArray([first, second], { concurrency: 2 }),
              );

              completeSecond.resolve();
              completeFirst.resolve();

              assertEqual(
                await fiber,
                ok(expectedArrayValue(["first", "second"])),
              );
            });
          }
        });

        describe("by default", () => {
          it(`runs ${taskNoun} sequentially`, async () => {
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

            assertEqual(events, ["first start"]);

            completeFirst.resolve();

            assertEqual(
              await fiber,
              ok(expectedArrayValue(["first", "second"])),
            );
            assertEqual(events, ["first start", "first end", "second start"]);
          });

          if (helper.errorMode === "failFast") {
            it(`does not run later ${taskNoun} after the first Err`, async () => {
              await using run = createRun();
              const taskError = { type: "TaskError" } as const;
              let laterStarted = false;

              const failing: Task<string, typeof taskError> = () =>
                err(taskError);
              const later: Task<string, typeof taskError> = () => {
                laterStarted = true;
                return ok("later");
              };

              assertEqual(
                await run(helper.fromArray([failing, later])),
                err(taskError),
              );
              assertFalse(laterStarted);
            });
          } else {
            it(`runs later ${taskNoun} after an Err`, async () => {
              await using run = createRun();
              const taskError = { type: "TaskError" } as const;
              let laterStarted = false;

              const failing: Task<string, typeof taskError> = () =>
                err(taskError);
              const later: Task<string, typeof taskError> = () => {
                laterStarted = true;
                return ok("later");
              };

              assertEqual(
                await run(helper.fromArray([failing, later])),
                ok([err(taskError), ok("later")]),
              );
              assertTrue(laterStarted);
            });
          }

          it(`aborts running ${taskNoun} when aborted`, async () => {
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
            assertNotUndefined(taskSignal);

            fiber.abort(testAbortReason);
            completeTask.resolve();

            assertTrue(taskSignal.aborted);
            assertEqual(taskSignal.reason, testAbortError);
            assertEqual(await fiber, err(testAbortError));
          });
        });

        describe("with concurrency", () => {
          it(`runs ${taskNoun} concurrently`, async () => {
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
              helper.fromArray([createTask(1), createTask(2), createTask(3)], {
                concurrency: 2,
              }),
            );

            try {
              assertEqual(events, ["start 1", "start 2"]);

              completeTasks.resolve();

              assertEqual(await fiber, ok(expectedArrayValue([1, 2, 3])));
              assertEqual(events, [
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
            it(`waits for running ${taskNoun} and does not start queued ${taskNoun} after the first Err`, async () => {
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
                helper.fromArray([slow, failing, later], { concurrency: 2 }),
              );
              let helperFiberSettled = false;
              void helperFiber.then(() => {
                helperFiberSettled = true;
              });

              try {
                assertSame(await slowAborted.promise, runDisposedAbortReason);
                assertFalse(helperFiberSettled);

                const snapshot = helperFiber.run.snapshot();
                assertEqual(snapshot.state, { type: "Running" });

                const childSnapshot = snapshot.children.at(0);
                assertNotUndefined(childSnapshot);
                assertSame(childSnapshot.state.type, "Aborted");
                const abortReason = childSnapshot.state.abort.request;
                assertSame(abortReason, runDisposedAbortReason);
                assertSame(childSnapshot.state.abort.observed, abortReason);

                const grandchildSnapshot = childSnapshot.children.at(0);
                assertNotUndefined(grandchildSnapshot);
                assertSame(grandchildSnapshot.state.type, "Aborted");
                assertSame(grandchildSnapshot.state.abort.request, abortReason);
                assertSame(
                  grandchildSnapshot.state.abort.observed,
                  abortReason,
                );
              } finally {
                completeSlow.resolve();
              }

              assertEqual(await helperFiber, err(taskError));
              assertTrue(slowSettled);
              assertFalse(laterStarted);
            });

            if (helper.name === "all") {
              it("aborts an already-started slow Task after sync Err", async () => {
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

                assertEqual(
                  await run(
                    helper.fromArray([syncOk, syncErr, slow], {
                      concurrency: 2,
                    }),
                  ),
                  err(taskError),
                );
                assertTrue(slowStarted);
                assertTrue(slowSettled);
              });
            }
          } else {
            it(`waits for running ${taskNoun} after an Err`, async () => {
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
                helper.fromArray([slow, failing], { concurrency: 2 }),
              );

              assertFalse(slowSettled);

              completeSlow.resolve();

              assertEqual(await fiber, ok([ok("slow"), err(taskError)]));
              assertTrue(slowSettled);
            });
          }

          it(`rejects with panic abort and aborts running ${taskNoun} when a ${taskSingular} defects`, async () => {
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
              helper.fromArray([slow, defecting], { concurrency: 2 }),
            );

            assertEqual(await slowAborted.promise, {
              type: "PanicAbortReason",
              defect,
            });

            completeSlow.resolve();

            await assertRejects(fiber, panic(defect));
          });
        });
      });
    }

    it("nested collections resolve concurrency independently", async () => {
      await using run = createRun();
      const completeInnerFirst = Promise.withResolvers<void>();
      const events: Array<string> = [];

      const innerFirst: Task<string> = async () => {
        events.push("inner first start");
        await completeInnerFirst.promise;
        events.push("inner first end");
        return ok("inner first");
      };
      const innerSecond: Task<string> = () => {
        events.push("inner second start");
        return ok("inner second");
      };
      const nested: Task<readonly [string, string]> = (run) =>
        run(all([innerFirst, innerSecond]));
      const sibling: Task<string> = () => {
        events.push("outer sibling start");
        return ok("outer sibling");
      };

      const fiber = run(all([nested, sibling], { concurrency: 2 }));

      assertEqual(events, ["inner first start", "outer sibling start"]);

      completeInnerFirst.resolve();

      assertEqual(
        await fiber,
        ok([["inner first", "inner second"], "outer sibling"]),
      );
      assertEqual(events, [
        "inner first start",
        "outer sibling start",
        "inner first end",
        "inner second start",
      ]);
    });

    it("collection mapping overloads throw when mapper defects", () => {
      const defect = new Error("boom");
      const defectingMapper = (): Task<string> => {
        throw defect;
      };

      assertThrowsSame(() => all([1], defectingMapper), defect);
      assertThrowsSame(
        () => all([1], defectingMapper, { collect: false }),
        defect,
      );
      assertThrowsSame(
        () => all({ one: 1 }, defectingMapper, { collect: false }),
        defect,
      );
      assertThrowsSame(() => allSettled([1], defectingMapper), defect);
    });
  });

  describe("types", () => {
    it("Task helpers infer dependency intersections", () => {
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

      assertType<InferTaskDeps<ReturnType<typeof each<Tasks>>>, Deps>();
      assertType<InferTaskDeps<ReturnType<typeof race<Tasks>>>, Deps>();
      assertType<InferTaskDeps<ReturnType<typeof any<Tasks>>>, Deps>();
      assertType<InferTasksResult<Tasks>, Result<Value, Error>>();
      assertType<ReturnType<typeof race<Tasks>>, Task<Value, Error, Deps>>();
      assertType<ReturnType<typeof any<Tasks>>, Task<Value, Error, Deps>>();
    });

    it("Task helpers infer widened task array dependency intersections", () => {
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

      assertType<InferTaskDeps<ReturnType<typeof each<Tasks>>>, Deps>();
      assertType<InferTaskDeps<ReturnType<typeof race<Tasks>>>, Deps>();
      assertType<InferTaskDeps<ReturnType<typeof any<Tasks>>>, Deps>();
      assertType<ReturnType<typeof each<Tasks>>, Task<void, never, Deps>>();
      assertType<ReturnType<typeof race<Tasks>>, Task<Value, never, Deps>>();
      assertType<ReturnType<typeof any<Tasks>>, Task<Value, never, Deps>>();
    });

    it("collection concurrency options preserve overload types", () => {
      const stringTask: Task<string, "TaskError", DbDep> = ({ deps }) =>
        ok(deps.db.query("value"));
      const numberTask: Task<number, never, SessionDep> = ({ deps }) =>
        ok(deps.session.userId.length);
      const tasks: ReadonlyArray<typeof stringTask> = [stringTask];
      const tuple = [stringTask, numberTask] as const;
      const record = { string: stringTask, number: numberTask } as const;
      const values: ReadonlyArray<number> = [1, 2];
      const valuesByKey = { first: 1, second: 2 } as const;
      const toTask =
        (value: number): Task<string, "TaskError", DbDep> =>
        ({ deps }) =>
          ok(deps.db.query(String(value)));

      {
        const actual = all(tasks, { concurrency: 1 });
        assertType<
          typeof actual,
          Task<ReadonlyArray<string>, "TaskError", DbDep>
        >();
      }
      {
        const actual = all(tuple, { concurrency: 100 });
        assertType<
          typeof actual,
          Task<readonly [string, number], "TaskError", DbDep & SessionDep>
        >();
      }
      {
        const actual = all(record, { concurrency: PositiveInt.orThrow(101) });
        assertType<
          typeof actual,
          Task<
            { readonly string: string; readonly number: number },
            "TaskError",
            DbDep & SessionDep
          >
        >();
      }
      {
        const actual = all(values, toTask, {
          concurrency: availableParallelism(),
        });
        assertType<
          typeof actual,
          Task<ReadonlyArray<string>, "TaskError", DbDep>
        >();
      }
      {
        const actual = all(valuesByKey, toTask, {
          concurrency: maxPositiveInt,
        });
        assertType<
          typeof actual,
          Task<
            { readonly first: string; readonly second: string },
            "TaskError",
            DbDep
          >
        >();
      }

      const allOptions: AllOptions = {
        collect: false,
        concurrency: 2,
      };
      {
        const actual = all(tasks, allOptions);
        assertType<typeof actual, Task<void, "TaskError", DbDep>>();
      }
      {
        const actual = all(tasks, { collect: false, concurrency: 2 });
        assertType<typeof actual, Task<void, "TaskError", DbDep>>();
      }
      {
        const actual = all(record, { collect: false, concurrency: 2 });
        assertType<
          typeof actual,
          Task<void, "TaskError", DbDep & SessionDep>
        >();
      }
      {
        const actual = all(values, toTask, { collect: false, concurrency: 2 });
        assertType<typeof actual, Task<void, "TaskError", DbDep>>();
      }
      {
        const actual = all(valuesByKey, toTask, {
          collect: false,
          concurrency: 2,
        });
        assertType<typeof actual, Task<void, "TaskError", DbDep>>();
      }

      {
        const actual = allSettled(tasks, { concurrency: 2 });
        assertType<
          typeof actual,
          Task<ReadonlyArray<Result<string, "TaskError">>, never, DbDep>
        >();
      }
      {
        const actual = allSettled(tuple, { concurrency: 2 });
        assertType<
          typeof actual,
          Task<
            readonly [Result<string, "TaskError">, Result<number>],
            never,
            DbDep & SessionDep
          >
        >();
      }
      {
        const actual = allSettled(record, { concurrency: 2 });
        assertType<
          typeof actual,
          Task<
            {
              readonly string: Result<string, "TaskError">;
              readonly number: Result<number>;
            },
            never,
            DbDep & SessionDep
          >
        >();
      }
      {
        const actual = allSettled(values, toTask, { concurrency: 2 });
        assertType<
          typeof actual,
          Task<ReadonlyArray<Result<string, "TaskError">>, never, DbDep>
        >();
      }
      {
        const actual = allSettled(valuesByKey, toTask, { concurrency: 2 });
        assertType<
          typeof actual,
          Task<
            {
              readonly first: Result<string, "TaskError">;
              readonly second: Result<string, "TaskError">;
            },
            never,
            DbDep
          >
        >();
      }

      {
        const actual = any([stringTask], { concurrency: 2 });
        assertType<typeof actual, Task<string, "TaskError", DbDep>>();
      }
      {
        const actual = firstN([stringTask], 1, { concurrency: 2 });
        assertType<typeof actual, Task<ReadonlyArray<string>, never, DbDep>>();
      }
      {
        const actual = firstNSettled([stringTask], 1, { concurrency: 2 });
        assertType<
          typeof actual,
          Task<ReadonlyArray<Result<string, "TaskError">>, never, DbDep>
        >();
      }
      {
        const actual = each([stringTask], () => "continue", { concurrency: 2 });
        assertType<typeof actual, Task<void, never, DbDep>>();
      }

      const assertRejectedConcurrencyTypes = () => {
        // @ts-expect-error - concurrency must be positive.
        void all([stringTask], { concurrency: 0 });
        // @ts-expect-error - raw integer literals above 100 must be validated as PositiveInt.
        void all([stringTask], { concurrency: 101 });
        // @ts-expect-error - booleans are not concurrency limits.
        void all([stringTask], { concurrency: true });
        // @ts-expect-error - booleans are not concurrency limits.
        void all([stringTask], { concurrency: false });
        // @ts-expect-error - string sentinels are not concurrency limits.
        void all([stringTask], { concurrency: "availableParallelism" });
        // @ts-expect-error - string sentinels are not concurrency limits.
        void all([stringTask], { concurrency: "available" });
        // @ts-expect-error - string sentinels are not concurrency limits.
        void all([stringTask], { concurrency: "unbounded" });
        // @ts-expect-error - string sentinels are not concurrency limits.
        void all([stringTask], { concurrency: "all" });
        // @ts-expect-error - string sentinels are not concurrency limits.
        void all([stringTask], { concurrency: "full" });
      };

      void assertRejectedConcurrencyTypes;
    });

    it("InferTasksOk maps Task arrays and records to Ok values", () => {
      interface MyError {
        readonly type: "MyError";
      }

      type Tasks = readonly [Task<string>, Task<number, MyError>];
      interface TasksRecord {
        readonly name: Task<string>;
        readonly age: Task<number, MyError>;
      }

      assertType<InferTasksOk<Tasks>, readonly [string, number]>();
      assertType<
        InferTasksOk<ReadonlyArray<Task<string>>>,
        ReadonlyArray<string>
      >();
      assertType<
        InferTasksOk<NonEmptyReadonlyArray<Task<string>>>,
        NonEmptyReadonlyArray<string>
      >();
      assertType<
        InferTasksOk<TasksRecord>,
        {
          readonly name: string;
          readonly age: number;
        }
      >();
      assertType<
        InferTasksOk<{ readonly notTask: string }>,
        {
          readonly notTask: never;
        }
      >();
    });

    describe("all", () => {
      describe("returns", () => {
        it("tuple values", () => {
          const name: Task<string> = () => ok("Ada");
          const age: Task<number> = () => ok(37);
          const active: Task<boolean> = () => ok(true);
          const task = all([name, age, active]);

          assertType<typeof task, Task<readonly [string, number, boolean]>>();
        });

        it("error union", () => {
          const firstError = { type: "FirstError" } as const;
          const secondError = { type: "SecondError" } as const;
          const first: Task<string, typeof firstError> = () => err(firstError);
          const second: Task<string, typeof secondError> = () =>
            err(secondError);
          const task = all([first, second]);

          assertType<
            typeof task,
            Task<
              readonly [string, string],
              typeof firstError | typeof secondError
            >
          >();
        });

        it("record dependency intersection", () => {
          const name: Task<string, never, DbDep> = ({ deps }) =>
            ok(deps.db.query("name"));
          const userId: Task<string, never, SessionDep> = ({ deps }) =>
            ok(deps.session.userId);
          const task = all({ name, userId });

          assertType<
            typeof task,
            Task<
              { readonly name: string; readonly userId: string },
              never,
              DbDep & SessionDep
            >
          >();
        });

        it("void without collecting tuple values", () => {
          interface FirstError {
            readonly type: "FirstError";
          }
          interface SecondError {
            readonly type: "SecondError";
          }
          const first: Task<string, FirstError, DbDep> = ({ deps }) =>
            ok(deps.db.query("first"));
          const second: Task<number, SecondError, SessionDep> = ({ deps }) =>
            ok(deps.session.userId.length);
          const task = all([first, second], { collect: false });

          assertType<
            typeof task,
            Task<void, FirstError | SecondError, DbDep & SessionDep>
          >();
        });

        it("void without collecting record values", () => {
          interface FirstError {
            readonly type: "FirstError";
          }
          interface SecondError {
            readonly type: "SecondError";
          }
          const first: Task<string, FirstError, DbDep> = ({ deps }) =>
            ok(deps.db.query("first"));
          const second: Task<number, SecondError, SessionDep> = ({ deps }) =>
            ok(deps.session.userId.length);
          const task = all({ first, second }, { collect: false });

          assertType<
            typeof task,
            Task<void, FirstError | SecondError, DbDep & SessionDep>
          >();
        });
      });

      describe("accepts", () => {
        it("an empty array", () => {
          const tasks: ReadonlyArray<Task<string>> = emptyArray;
          const task = all(tasks);

          assertType<typeof task, Task<ReadonlyArray<string>>>();
        });

        it("an array", () => {
          const tasks: ReadonlyArray<Task<string>> = [
            () => ok("Ada"),
            () => ok("Grace"),
          ];
          const task = all(tasks);

          assertType<typeof task, Task<ReadonlyArray<string>>>();
        });

        it("a non-empty array", () => {
          const tasks: NonEmptyReadonlyArray<Task<string>> = [() => ok("Ada")];
          const task = all(tasks);

          assertType<typeof task, Task<NonEmptyReadonlyArray<string>>>();
        });

        it("an empty tuple", () => {
          const task = all([]);

          assertType<typeof task, Task<readonly []>>();
        });

        it("a tuple", () => {
          const task = all([() => ok("Ada"), () => ok(37)]);

          assertType<typeof task, Task<readonly [string, number]>>();
        });

        it("an empty record", () => {
          const task = all({});

          assertType<typeof task, Task<Record<never, never>>>();
        });

        it("a record", () => {
          const name: Task<string> = () => ok("Ada");
          const age: Task<number> = () => ok(37);
          const active: Task<boolean> = () => ok(true);
          const task = all({ name, age, active });

          assertType<
            typeof task,
            Task<{
              readonly name: string;
              readonly age: number;
              readonly active: boolean;
            }>
          >();
        });
      });
    });

    it("InferTasksSettled maps Task arrays and records to Results", () => {
      interface MyError {
        readonly type: "MyError";
      }

      type Tasks = readonly [Task<string>, Task<number, MyError>];
      interface TasksRecord {
        readonly name: Task<string>;
        readonly age: Task<number, MyError>;
      }

      assertType<
        InferTasksSettled<Tasks>,
        readonly [Result<string>, Result<number, MyError>]
      >();
      assertType<
        InferTasksSettled<TasksRecord>,
        {
          readonly name: Result<string>;
          readonly age: Result<number, MyError>;
        }
      >();
    });

    describe("allSettled", () => {
      describe("returns", () => {
        it("result tuple", () => {
          const taskError = { type: "TaskError" } as const;
          const name: Task<string> = () => ok("Ada");
          const age: Task<number, typeof taskError> = () => err(taskError);
          const active: Task<boolean> = () => ok(true);
          const task = allSettled([name, age, active]);

          assertType<
            typeof task,
            Task<
              readonly [
                Result<string>,
                Result<number, typeof taskError>,
                Result<boolean>,
              ]
            >
          >();
        });

        it("record dependency intersection", () => {
          const name: Task<string, never, DbDep> = ({ deps }) =>
            ok(deps.db.query("name"));
          const userId: Task<string, never, SessionDep> = ({ deps }) =>
            ok(deps.session.userId);
          const task = allSettled({ name, userId });

          assertType<
            typeof task,
            Task<
              {
                readonly name: Result<string>;
                readonly userId: Result<string>;
              },
              never,
              DbDep & SessionDep
            >
          >();
        });
      });

      describe("accepts", () => {
        it("an empty array", () => {
          const tasks: ReadonlyArray<Task<string>> = emptyArray;
          const task = allSettled(tasks);

          assertType<typeof task, Task<ReadonlyArray<Result<string>>>>();
        });

        it("an array", () => {
          const taskError = { type: "TaskError" } as const;
          const tasks: ReadonlyArray<Task<string, typeof taskError>> = [
            () => ok("Ada"),
            () => err(taskError),
          ];
          const task = allSettled(tasks);

          assertType<
            typeof task,
            Task<ReadonlyArray<Result<string, typeof taskError>>>
          >();
        });

        it("a non-empty array", () => {
          const taskError = { type: "TaskError" } as const;
          const tasks: NonEmptyReadonlyArray<Task<string, typeof taskError>> = [
            () => err(taskError),
          ];
          const task = allSettled(tasks);

          assertType<
            typeof task,
            Task<NonEmptyReadonlyArray<Result<string, typeof taskError>>>
          >();
        });

        it("an empty tuple", () => {
          const task = allSettled([]);

          assertType<typeof task, Task<readonly []>>();
        });

        it("a tuple", () => {
          const taskError = { type: "TaskError" } as const;
          const name: Task<string> = () => ok("Ada");
          const age: Task<number, typeof taskError> = () => err(taskError);
          const task = allSettled([name, age]);

          assertType<
            typeof task,
            Task<readonly [Result<string>, Result<number, typeof taskError>]>
          >();
        });

        it("an empty record", () => {
          const task = allSettled({});

          assertType<typeof task, Task<Record<never, never>>>();
        });

        it("a record", () => {
          const taskError = { type: "TaskError" } as const;
          const name: Task<string> = () => ok("Ada");
          const age: Task<number, typeof taskError> = () => err(taskError);
          const active: Task<boolean> = () => ok(true);
          const task = allSettled({ name, age, active });

          assertType<
            typeof task,
            Task<{
              readonly name: Result<string>;
              readonly age: Result<number, typeof taskError>;
              readonly active: Result<boolean>;
            }>
          >();
        });
      });
    });

    describe("all mapping overload", () => {
      describe("returns", () => {
        it("mapped tuple values", () => {
          interface Deps {
            readonly prefix: string;
          }
          interface TaskError {
            readonly type: "TaskError";
          }

          const task = all(
            [1, 2, 3],
            (value): Task<string, TaskError, Deps> =>
              (run) =>
                ok(`${run.deps.prefix}${value}`),
          );

          assertType<
            typeof task,
            Task<readonly [string, string, string], TaskError, Deps>
          >();
        });

        it("error union", () => {
          const taskError = { type: "TaskError" } as const;
          const task = all(
            [1, 2],
            (value): Task<string, typeof taskError> =>
              () =>
                value === 1 ? err(taskError) : ok(String(value)),
          );

          assertType<
            typeof task,
            Task<readonly [string, string], typeof taskError>
          >();
        });

        it("heterogeneous array mapper dependency intersection", () => {
          interface FirstError {
            readonly type: "FirstError";
          }
          interface SecondError {
            readonly type: "SecondError";
          }
          type FirstTask = Task<string, FirstError, DbDep>;
          type SecondTask = Task<number, SecondError, SessionDep>;

          const first: FirstTask = ({ deps }) => ok(deps.db.query("first"));
          const second: SecondTask = ({ deps }) =>
            ok(deps.session.userId.length);
          const values = ["first", "second"] as const;
          const toTask = (
            value: (typeof values)[number],
          ): FirstTask | SecondTask => (value === "first" ? first : second);

          const task = all(values, toTask);
          const taskWithoutValues = all(values, toTask, { collect: false });

          assertType<
            typeof task,
            Task<
              readonly [string | number, string | number],
              FirstError | SecondError,
              DbDep & SessionDep
            >
          >();
          assertType<
            typeof taskWithoutValues,
            Task<void, FirstError | SecondError, DbDep & SessionDep>
          >();
        });

        it("heterogeneous record mapper dependency intersection", () => {
          interface FirstError {
            readonly type: "FirstError";
          }
          interface SecondError {
            readonly type: "SecondError";
          }
          type FirstTask = Task<string, FirstError, DbDep>;
          type SecondTask = Task<number, SecondError, SessionDep>;

          const first: FirstTask = ({ deps }) => ok(deps.db.query("first"));
          const second: SecondTask = ({ deps }) =>
            ok(deps.session.userId.length);
          const values = { first: 1, second: 2 } as const;
          const toTask = (
            _value: (typeof values)[keyof typeof values],
            key: keyof typeof values,
          ): FirstTask | SecondTask => (key === "first" ? first : second);

          const task = all(values, toTask);
          const taskWithoutValues = all(values, toTask, { collect: false });

          assertType<
            typeof task,
            Task<
              {
                readonly first: string | number;
                readonly second: string | number;
              },
              FirstError | SecondError,
              DbDep & SessionDep
            >
          >();
          assertType<
            typeof taskWithoutValues,
            Task<void, FirstError | SecondError, DbDep & SessionDep>
          >();
        });

        it("void without collecting mapped array values", () => {
          interface TaskError {
            readonly type: "TaskError";
          }
          const task = all(
            [1, 2],
            (value): Task<string, TaskError, DbDep> =>
              ({ deps }) =>
                ok(deps.db.query(String(value))),
            { collect: false },
          );

          assertType<typeof task, Task<void, TaskError, DbDep>>();
        });

        it("void without collecting mapped record values", () => {
          interface TaskError {
            readonly type: "TaskError";
          }
          const values = { first: 1, second: 2 } as const;
          const task = all(
            values,
            (value, key): Task<string, TaskError, DbDep> => {
              assertType<typeof value, 1 | 2>();
              assertType<typeof key, "first" | "second">();
              return ({ deps }) => ok(deps.db.query(String(value)));
            },
            { collect: false },
          );

          assertType<typeof task, Task<void, TaskError, DbDep>>();
        });
      });

      describe("accepts", () => {
        it("an empty array", () => {
          const values: ReadonlyArray<number> = emptyArray;
          const task = all(values, (value) => () => ok(String(value)));

          assertType<typeof task, Task<ReadonlyArray<string>>>();
        });

        it("an array", () => {
          const values: ReadonlyArray<number> = [1, 2];
          const task = all(values, (value) => () => ok(String(value)));

          assertType<typeof task, Task<ReadonlyArray<string>>>();
        });

        it("an array mapper with indexes", () => {
          const values = ["Ada", "Grace"] as const;
          const task = all(values, (value, index) => {
            assertType<typeof value, "Ada" | "Grace">();
            assertType<typeof index, number>();
            return () => ok(`${index}:${value}`);
          });

          assertType<typeof task, Task<readonly [string, string]>>();
        });

        it("a non-empty array", () => {
          const values: NonEmptyReadonlyArray<number> = [1];
          const task = all(values, (value) => () => ok(String(value)));

          assertType<typeof task, Task<NonEmptyReadonlyArray<string>>>();
        });

        it("an empty tuple", () => {
          const task = all([], () => () => ok("unused"));

          assertType<typeof task, Task<readonly []>>();
        });

        it("a tuple", () => {
          const task = all(["Ada", 37], (value) => () => ok(String(value)));

          assertType<typeof task, Task<readonly [string, string]>>();
        });

        it("an empty record", () => {
          const task = all({}, () => () => ok("unused"));

          assertType<typeof task, Task<Record<never, never>>>();
        });

        it("a record", () => {
          const task = all(
            { name: "Ada", age: 37, active: true },
            (value) => () => ok(String(value)),
          );

          assertType<
            typeof task,
            Task<{
              readonly name: string;
              readonly age: string;
              readonly active: string;
            }>
          >();
        });

        it("a record mapper with keys", () => {
          const values = { name: "Ada", age: 37 } as const;
          const task = all(values, (value, key) => {
            assertType<typeof value, "Ada" | 37>();
            assertType<typeof key, "name" | "age">();
            return () => ok(`${key}:${value}`);
          });

          assertType<
            typeof task,
            Task<{ readonly name: string; readonly age: string }>
          >();
        });
      });
    });

    describe("allSettled mapping overload", () => {
      describe("returns", () => {
        it("result tuple", () => {
          const taskError = { type: "TaskError" } as const;
          const task = allSettled([1, 2, 3], (value) =>
            value === 2 ? () => err(taskError) : () => ok(String(value)),
          );

          assertType<
            typeof task,
            Task<
              readonly [
                Result<string, typeof taskError>,
                Result<string, typeof taskError>,
                Result<string, typeof taskError>,
              ]
            >
          >();
        });

        it("mapped Task dependencies", () => {
          const task = allSettled(
            [1, 2],
            (value): Task<string, never, DbDep> =>
              ({ deps }) =>
                ok(deps.db.query(String(value))),
          );

          assertType<
            typeof task,
            Task<readonly [Result<string>, Result<string>], never, DbDep>
          >();
        });

        it("heterogeneous array mapper dependency intersection", () => {
          interface FirstError {
            readonly type: "FirstError";
          }
          interface SecondError {
            readonly type: "SecondError";
          }
          type FirstTask = Task<string, FirstError, DbDep>;
          type SecondTask = Task<number, SecondError, SessionDep>;

          const first: FirstTask = ({ deps }) => ok(deps.db.query("first"));
          const second: SecondTask = ({ deps }) =>
            ok(deps.session.userId.length);
          const values = ["first", "second"] as const;
          const toTask = (
            value: (typeof values)[number],
          ): FirstTask | SecondTask => (value === "first" ? first : second);
          const task = allSettled(values, toTask);

          assertType<
            typeof task,
            Task<
              readonly [
                Result<string | number, FirstError | SecondError>,
                Result<string | number, FirstError | SecondError>,
              ],
              never,
              DbDep & SessionDep
            >
          >();
        });

        it("heterogeneous record mapper dependency intersection", () => {
          interface FirstError {
            readonly type: "FirstError";
          }
          interface SecondError {
            readonly type: "SecondError";
          }
          type FirstTask = Task<string, FirstError, DbDep>;
          type SecondTask = Task<number, SecondError, SessionDep>;

          const first: FirstTask = ({ deps }) => ok(deps.db.query("first"));
          const second: SecondTask = ({ deps }) =>
            ok(deps.session.userId.length);
          const values = { first: 1, second: 2 } as const;
          const toTask = (
            _value: (typeof values)[keyof typeof values],
            key: keyof typeof values,
          ): FirstTask | SecondTask => (key === "first" ? first : second);
          const task = allSettled(values, toTask);

          assertType<
            typeof task,
            Task<
              {
                readonly first: Result<
                  string | number,
                  FirstError | SecondError
                >;
                readonly second: Result<
                  string | number,
                  FirstError | SecondError
                >;
              },
              never,
              DbDep & SessionDep
            >
          >();
        });
      });

      describe("accepts", () => {
        it("an empty array", () => {
          const values: ReadonlyArray<number> = emptyArray;
          const task = allSettled(values, (value) => () => ok(String(value)));

          assertType<typeof task, Task<ReadonlyArray<Result<string>>>>();
        });

        it("an array", () => {
          const taskError = { type: "TaskError" } as const;
          const values: ReadonlyArray<number> = [1, 2];
          const task = allSettled(
            values,
            (value): Task<string, typeof taskError> =>
              value === 1 ? () => ok(String(value)) : () => err(taskError),
          );

          assertType<
            typeof task,
            Task<ReadonlyArray<Result<string, typeof taskError>>>
          >();
        });

        it("an array mapper with indexes", () => {
          const task = allSettled(["Ada", "Grace"] as const, (value, index) => {
            assertType<typeof value, "Ada" | "Grace">();
            assertType<typeof index, number>();
            return () => ok(`${index}:${value}`);
          });

          assertType<
            typeof task,
            Task<readonly [Result<string>, Result<string>]>
          >();
        });

        it("a non-empty array", () => {
          const taskError = { type: "TaskError" } as const;
          const values: NonEmptyReadonlyArray<number> = [1];
          const task = allSettled(
            values,
            (): Task<string, typeof taskError> => () => err(taskError),
          );

          assertType<
            typeof task,
            Task<NonEmptyReadonlyArray<Result<string, typeof taskError>>>
          >();
        });

        it("an empty tuple", () => {
          const task = allSettled([], () => () => ok("unused"));

          assertType<typeof task, Task<readonly []>>();
        });

        it("a tuple", () => {
          const task = allSettled(
            ["Ada", 37],
            (value) => () => ok(String(value)),
          );

          assertType<
            typeof task,
            Task<readonly [Result<string>, Result<string>]>
          >();
        });

        it("an empty record", () => {
          const task = allSettled({}, () => () => ok("unused"));

          assertType<typeof task, Task<Record<never, never>>>();
        });

        it("a record", () => {
          const task = allSettled(
            { name: "Ada", age: 37, active: true },
            (value) => () => ok(String(value)),
          );

          assertType<
            typeof task,
            Task<{
              readonly name: Result<string>;
              readonly age: Result<string>;
              readonly active: Result<string>;
            }>
          >();
        });

        it("a record mapper with keys", () => {
          const values = { name: "Ada", age: 37 } as const;
          const task = allSettled(values, (value, key) => {
            assertType<typeof value, "Ada" | 37>();
            assertType<typeof key, "name" | "age">();
            return () => ok(`${key}:${value}`);
          });

          assertType<
            typeof task,
            Task<{
              readonly name: Result<string>;
              readonly age: Result<string>;
            }>
          >();
        });
      });
    });
  });
});

describe("callback", () => {
  it("resolve accepts ok Result", async () => {
    await using run = createRun();

    const task = callback<string>(({ resolve }) => {
      resolve(ok("hello"));
    });

    assertEqual(await run(task), ok("hello"));
  });

  it("resolve accepts err Result", async () => {
    await using run = createRun();
    const myError = { type: "MyError" } as const;

    const task = callback<string, typeof myError>(({ resolve }) => {
      resolve(err(myError));
    });

    assertEqual(await run(task), err(myError));
  });

  it("reject panics the Run tree", async () => {
    await using run = testCreateRun();
    const defect = new Error("boom");

    const task = callback<string>(({ reject }) => {
      reject(defect);
    });

    await assertRejects(run(task), panic(defect));

    const panicAbortError: unknown = run.signal.reason;
    assertType(AbortError, panicAbortError);
    assertEqual(panicAbortError.reason, {
      type: "PanicAbortReason",
      defect,
    });
    assertSame(await run.deps.reportDefect.next(), panicAbortError);
  });

  it("setup defect panics the Run tree", async () => {
    await using run = testCreateRun();
    const defect = new Error("boom");

    const task = callback<string>(() => {
      throw defect;
    });

    await assertRejects(run(task), panic(defect));

    const panicAbortError: unknown = run.signal.reason;
    assertType(AbortError, panicAbortError);
    assertEqual(panicAbortError.reason, {
      type: "PanicAbortReason",
      defect,
    });
    assertSame(await run.deps.reportDefect.next(), panicAbortError);
  });

  it("setup defect after resolve still panics the Run tree", async () => {
    await using run = testCreateRun();
    const defect = new Error("boom");

    const task = callback<string>(({ resolve }) => {
      resolve(ok("hello"));
      throw defect;
    });

    await assertRejects(run(task), panic(defect));
    assertEqual(run.signal.reason, panic(defect));
    assertEqual(run.deps.reportDefect.getDefectsSnapshot(), [panic(defect)]);
  });

  it("releases partially acquired resources when setup defects", async () => {
    await using run = testCreateRun();
    const defect = new Error("setup failed");
    const cleanupLog: Array<string> = [];

    const task = callback<void>(() => {
      using disposer = new DisposableStack();

      cleanupLog.push("acquire first");
      disposer.defer(() => {
        cleanupLog.push("release first");
      });

      cleanupLog.push("acquire second");
      disposer.defer(() => {
        cleanupLog.push("release second");
      });

      throw defect;
    });

    await assertRejects(run(task), panic(defect));
    assertEqual(cleanupLog, [
      "acquire first",
      "acquire second",
      "release second",
      "release first",
    ]);
  });

  it("callback receives current Run signal", async () => {
    await using run = createRun();
    let callbackSignal: AbortSignal | undefined;

    const task = callback<string>(({ run, resolve }) => {
      callbackSignal = run.signal;
      resolve(ok("hello"));
    });

    const fiber = run(task);

    assertEqual(await fiber, ok("hello"));
    assertSame(callbackSignal, fiber.run.signal);
  });

  it("callback receives current Run deps", async () => {
    await using run = createRun(dbDep);
    let callbackDb: Db | undefined;

    const task = callback<string, never, DbDep>(({ run, resolve }) => {
      callbackDb = run.deps.db;
      resolve(ok("hello"));
    });

    assertEqual(await run(task), ok("hello"));
    assertSame(callbackDb, dbDep.db);
  });

  it("runs cleanup after resolving", async () => {
    await using run = createRun();
    let cleanupCalled = false;

    const task = callback<string>(({ resolve }) => {
      resolve(ok("hello"));
      return () => {
        cleanupCalled = true;
      };
    });

    const fiber = run(task);

    assertFalse(cleanupCalled);
    assertEqual(await fiber, ok("hello"));
    assertTrue(cleanupCalled);
  });

  it("runs cleanup when aborted", async () => {
    await using run = createRun();
    let cleanupCalled = false;

    const task = callback<void>(() => () => {
      cleanupCalled = true;
    });

    const fiber = run.abortable(task);

    fiber.abort(testAbortReason);

    assertTrue(cleanupCalled);
    assertEqual(await fiber, err(testAbortError));
  });

  it("abort settles a callback Task that never resolves", async () => {
    await using run = createRun();

    const task = callback<void>(() => undefined);

    const fiber = run.abortable(task);

    fiber.abort(testAbortReason);

    assertEqual(await fiber, err(testAbortError));
  });

  it("runs cleanup when called with an already-aborted Run", async () => {
    await using run = createRun();
    const continueParent = Promise.withResolvers<void>();
    let cleanupCalled = false;

    const task = callback<void>(() => () => {
      cleanupCalled = true;
    });

    const fiber = run.abortable(async (run) => {
      await continueParent.promise;
      return task(run);
    });

    fiber.abort(testAbortReason);
    continueParent.resolve();

    assertEqual(await fiber, err(testAbortError));
    assertTrue(cleanupCalled);
  });

  it("aborts when Run aborts during callback setup", async () => {
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
      assertEqual(abortError, {
        type: "AbortError",
        reason: runDisposedAbortReason,
      });

      resolveCallback?.();

      assertTrue(cleanupCalled);
      assertEqual(await fiber, err(abortError));
    } finally {
      resolveCallback?.();
      await run[Symbol.asyncDispose]();
    }
  });

  it("keeps callback result when aborted after resolving", async () => {
    await using run = createRun();

    const task = callback<string>(({ resolve }) => {
      resolve(ok("hello"));
    });

    const fiber = run.abortable(task);

    fiber.abort(testAbortReason);

    assertEqual(await fiber, ok("hello"));
  });

  it("preserves abort and reports panic abort when cleanup defects", async () => {
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
      assertReportedDefectOnly(panicAbortError, async (run) => {
        const fiber = run.abortable(task);

        fiber.abort(testAbortReason);

        assertEqual(await fiber, err(testAbortError));

        return ok();
      }),
    );

    assertOk(result, undefined);
  });
});

describe("sleep", () => {
  it("requires a positive duration", () => {
    sleep("1ms");
    // @ts-expect-error - Zero Millis is not a positive duration.
    sleep(0 as Millis);
  });

  it("completes after duration", async () => {
    await using run = testCreateRun();

    const fiber = run(sleep("100ms"));

    run.deps.time.advance("100ms");

    assertEqual(await fiber, ok());
  });

  it("clears timeout when aborted", async () => {
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

    assertEqual(await fiber, err(testAbortError));
    assertSame(clearedTimeoutId, timeoutId);
  });
});

describe("timeout", () => {
  it("requires a positive duration", () => {
    const task: Task<void> = () => ok();

    timeout(task, "1ms");
    // @ts-expect-error - Zero Millis is not a positive duration.
    timeout(task, 0 as Millis);
  });

  it("returns the Task Result when it settles within the duration", async () => {
    await using run = testCreateRun();

    const task: Task<string> = async (run) => {
      await run(sleep("50ms"));
      return ok("value");
    };

    const fiber = run(timeout(task, "100ms"));

    run.deps.time.advance("50ms");

    assertEqual(await fiber, ok("value"));
  });

  it("returns TimeoutError when the duration elapses first", async () => {
    await using run = testCreateRun();

    const task: Task<string> = async (run) => {
      await run(sleep("100ms"));
      return ok("value");
    };

    const fiber = run(timeout(task, "50ms"));

    run.deps.time.advance("50ms");

    assertEqual(await fiber, err(timeoutError));
  });

  it("waits for the losing Task to settle", async () => {
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
      assertFalse(timeoutFiberSettled);
      assertEqual(timeoutFiber.run.getState(), { type: "Running" });

      const snapshot = timeoutFiber.run.snapshot();
      assertEqual(snapshot.state, { type: "Running" });

      const childSnapshot = snapshot.children.at(0);
      assertNotUndefined(childSnapshot);
      assertSame(childSnapshot.state.type, "Aborted");
      const abortReason = childSnapshot.state.abort.request;
      assertSame(abortReason, runDisposedAbortReason);
      assertSame(childSnapshot.state.abort.observed, abortReason);

      const grandchildSnapshot = childSnapshot.children.at(0);
      assertNotUndefined(grandchildSnapshot);
      assertSame(grandchildSnapshot.state.type, "Aborted");
      assertSame(grandchildSnapshot.state.abort.request, abortReason);
      assertSame(grandchildSnapshot.state.abort.observed, abortReason);
    } finally {
      completeTask.resolve();
    }

    assertEqual(await timeoutFiber, err(timeoutError));
    assertTrue(taskSettled);
  });
});

describe("retry", () => {
  it("returns Ok from the first attempt", async () => {
    await using run = createRun();

    interface MyError {
      readonly type: "MyError";
    }

    const step = mock.fn((_: MyError) => ok([1, 1 as Millis] as const));
    const schedule: Schedule<number, MyError> = () => step;

    let attempts = 0;
    const task: Task<void, MyError> = () => {
      attempts += 1;
      return ok();
    };

    const result = await run(retry(task, schedule));

    assertOk(result, undefined);
    assertEqual(attempts, 1);
    assertEqual(step.mock.callCount(), 0);
  });

  it("retries errors until the Task returns Ok", async () => {
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

    assertOk(result, undefined);
    assertEqual(attempts, 3);
  });

  it("returns RetryError when the schedule is exhausted", async () => {
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

    assertErr(result, {
      type: "RetryError",
      lastError: { type: "MyError" },
      attempts: PositiveInt.orThrow(3),
    });
    assertEqual(attempts, 3);
  });

  it("calls onRetry before each retry", async () => {
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
        onRetry: ({ error, attempt, output, delay }) => {
          retryLog.push({ error, attempt, output, delay });
        },
      }),
    );

    assertEqual(retryLog, [
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

  it("stops when shouldRetry returns false", async () => {
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

    assertErr(result, {
      type: "RetryError",
      lastError: { type: "NonRetryableError" },
      attempts: PositiveInt.orThrow(2),
    });
    assertEqual(attempts, 2);
  });

  it("stops when shouldRetry returns false on the first error", async () => {
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

    assertErr(result, {
      type: "RetryError",
      lastError: { type: "MyError" },
      attempts: onePositiveInt,
    });
    assertEqual(attempts, 1);
  });

  it("stops when the Task aborts", async () => {
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

    assertEqual(await fiber, err(testAbortError));
    assertEqual(attempts, 1);
  });

  it("passes through AbortError results without retrying", async () => {
    await using run = createRun();

    interface MyError {
      readonly type: "MyError";
    }

    const abortError = createAbortError({ type: "TestAbort" });
    const step = mock.fn((_: MyError) => ok([1, 1 as Millis] as const));
    const schedule: Schedule<number, MyError> = () => step;
    const onRetry = mock.fn<() => void>();

    let attempts = 0;
    const task: Task<void, MyError | AbortError> = () => {
      attempts += 1;
      return err(abortError);
    };

    const result = await run(retry(task, schedule, { onRetry }));

    assertErr(result, abortError);
    assertEqual(attempts, 1);
    assertEqual(step.mock.callCount(), 0);
    assertEqual(onRetry.mock.callCount(), 0);
  });

  it("aborts during retry sleep without starting another attempt", async () => {
    await using run = testCreateRun();

    interface MyError {
      readonly type: "MyError";
    }

    const retryStarted = Promise.withResolvers<void>();
    const onRetry = mock.fn(() => {
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
    assertEqual(onRetry.mock.callCount(), 1);

    fiber.abort(testAbortReason);

    assertEqual(await fiber, err(testAbortError));
    assertEqual(attempts, 1);
  });

  it("rejects panic abort without retrying and reports panic abort", async () => {
    await using run = testCreateRun();
    const error = new Error("boom");
    const onRetry = mock.fn<() => void>();

    let attempts = 0;
    const task: Task<void> = () => {
      attempts += 1;
      throw error;
    };

    await assertRejects(
      run(retry(task, take(3)(spaced("1ms")), { onRetry })),
      panic(error),
    );

    assertEqual(attempts, 1);
    assertEqual(onRetry.mock.callCount(), 0);
    assertEqual(await run.deps.reportDefect.next(), panic(error));
  });

  describe("types", () => {
    it("RetryTaskError wraps domain errors and preserves AbortError", () => {
      interface MyError {
        readonly type: "MyError";
      }

      assertType<RetryTaskError<MyError>, RetryError<MyError>>();
      assertType<
        RetryTaskError<MyError | AbortError>,
        RetryError<MyError> | AbortError
      >();
      assertType<
        RetryTaskError<MyError | TimeoutError>,
        RetryError<MyError | TimeoutError>
      >();
      assertType<RetryTaskError<AbortError>, AbortError>();
      assertType<RetryTaskError<never>, never>();
    });

    it("keeps AbortError outside RetryError", () => {
      interface MyError {
        readonly type: "MyError";
      }

      const task: Task<string, MyError, DbDep> = () => ok("done");

      // daemon(task) can return AbortError as a Result error. retry should
      // keep cancellation as AbortError, not report it as retry exhaustion.
      const retried = retry(daemon(task), take(3)(spaced("1ms")));

      assertType<
        typeof retried,
        Task<string, RetryError<MyError> | AbortError, DbDep>
      >();
    });

    it("does not add RetryError without domain errors", () => {
      const task: Task<string> = () => ok("done");
      const abortTask: Task<string, AbortError> = () => ok("done");

      {
        const actual = retry(task, take(3)(spaced("1ms")));
        assertType<typeof actual, Task<string>>();
      }
      {
        const actual = retry(abortTask, take(3)(spaced("1ms")));
        assertType<typeof actual, Task<string, AbortError>>();
      }
    });
  });
});

describe("repeat", () => {
  it("runs a Task n + 1 times with take(n)", async () => {
    await using run = createRun();

    let count = 0;
    const task: Task<number> = () => {
      count += 1;
      return ok(count);
    };

    const result = await run(repeat(task, take(3)(spaced("1ms"))));

    assertOk(result, 4);
    assertEqual(count, 4);
  });

  it("returns last successful value when schedule is exhausted", async () => {
    await using run = createRun();

    const values = ["first", "second", "third", "fourth"];
    let index = 0;
    const task: Task<string> = () => ok(values[index++]);

    const result = await run(repeat(task, take(3)(fixed("1ms"))));

    assertOk(result, "fourth");
  });

  it("stops when the Task returns Err", async () => {
    await using run = createRun();

    interface MyError {
      readonly type: "MyError";
    }

    let count = 0;
    const task: Task<number, MyError> = () => {
      count += 1;
      return err({ type: "MyError" });
    };
    const onRepeat = mock.fn<() => void>();
    const step = mock.fn((_: number) => ok([1, 1 as Millis] as const));
    const schedule: Schedule<number, number> = () => step;

    const result = await run(repeat(task, schedule, { onRepeat }));

    assertErr(result, { type: "MyError" });
    assertEqual(count, 1);
    assertEqual(step.mock.callCount(), 0);
    assertEqual(onRepeat.mock.callCount(), 0);
  });

  it("stops when shouldRepeat returns false", async () => {
    await using run = createRun();

    let count = 0;
    const task: Task<number> = () => {
      count += 1;
      return ok(count);
    };
    const step = mock.fn((_: number) => ok([1, 1 as Millis] as const));
    const schedule: Schedule<number, number> = () => step;

    const result = await run(
      repeat(task, schedule, { shouldRepeat: (value) => value < 1 }),
    );

    assertOk(result, 1);
    assertEqual(count, 1);
    assertEqual(step.mock.callCount(), 0);
  });

  it("calls onRepeat before each repeat", async () => {
    await using run = createRun();

    const repeatLog: Array<unknown> = [];
    let count = 0;
    const task: Task<number> = () => {
      count += 1;
      return ok(count);
    };

    await run(
      repeat(task, take(2)(spaced(0 as Millis)), {
        onRepeat: ({ value, attempt, output, delay }) => {
          repeatLog.push({ value, attempt, output, delay });
        },
      }),
    );

    assertEqual(repeatLog, [
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

  it("aborts during repeat sleep without starting another attempt", async () => {
    await using run = testCreateRun();

    const repeatStarted = Promise.withResolvers<void>();
    const onRepeat = mock.fn(() => {
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
    assertEqual(onRepeat.mock.callCount(), 1);

    fiber.abort(testAbortReason);

    assertEqual(await fiber, err(testAbortError));
    assertEqual(count, 1);
  });

  it("aborts while Task is running without scheduling a repeat", async () => {
    await using run = testCreateRun();

    const onRepeat = mock.fn<() => void>();

    let count = 0;
    const task: Task<number> = async (run) => {
      count += 1;
      await run.ok(sleep("1h"));
      return ok(count);
    };

    const fiber = run.abortable(
      repeat(task, take(3)(spaced("1ms")), { onRepeat }),
    );

    assertEqual(count, 1);

    fiber.abort(testAbortReason);

    assertEqual(await fiber, err(testAbortError));
    assertEqual(count, 1);
    assertEqual(onRepeat.mock.callCount(), 0);
  });

  it("rejects panic abort without repeating and reports panic abort", async () => {
    await using run = testCreateRun();
    const error = new Error("boom");
    const onRepeat = mock.fn<() => void>();

    let count = 0;
    const task: Task<void> = () => {
      count += 1;
      throw error;
    };

    await assertRejects(
      run(repeat(task, take(3)(spaced("1ms")), { onRepeat })),
      panic(error),
    );

    assertEqual(count, 1);
    assertEqual(onRepeat.mock.callCount(), 0);
    assertEqual(await run.deps.reportDefect.next(), panic(error));
  });

  it("stops when NextTask returns Done", async () => {
    await using run = createRun();

    let count = 0;
    const next: NextTask<number> = () => {
      count += 1;
      if (count === 3) return err(done());
      return ok(count);
    };

    const result = await run(repeat(next, spaced(0 as Millis)));

    assertErr(result, done());
    assertEqual(count, 3);
  });

  describe("types", () => {
    it("preserves Task error and dependency types", () => {
      interface MyError {
        readonly type: "MyError";
      }

      const task: Task<string, MyError, DbDep> = () => ok("done");

      {
        const actual = repeat(task, take(3)(spaced("1ms")));
        assertType<typeof actual, Task<string, MyError, DbDep>>();
      }
    });

    it("preserves Done from NextTask", () => {
      interface MyError {
        readonly type: "MyError";
      }

      const next: NextTask<string, MyError, "done", DbDep> = () => ok("done");

      {
        const actual = repeat(next, spaced("1ms"));
        assertType<
          typeof actual,
          Task<string, MyError | Done<"done">, DbDep>
        >();
      }
    });
  });
});

describe("any", () => {
  it("infers result and dependency intersections", () => {
    interface FirstError {
      readonly type: "FirstError";
    }
    interface SecondError {
      readonly type: "SecondError";
    }

    const first: Task<string, FirstError, DbDep> = () => ok("first");
    const second: Task<number, SecondError, SessionDep> = () => ok(2);

    const task = any([first, second]);

    assertType<
      typeof task,
      Task<string | number, FirstError | SecondError, DbDep & SessionDep>
    >();

    const assertAnyTypes = () => {
      // @ts-expect-error - any requires at least one Task.
      void any([]);
    };

    void assertAnyTypes;
  });

  it("runs sequentially by default and returns the first Ok result", async () => {
    await using run = createRun();
    const completeFast = Promise.withResolvers<void>();
    const fastError = { type: "FastError" } as const;
    let fallbackStarted = false;

    const fast: Task<string, typeof fastError> = async () => {
      await completeFast.promise;
      return err(fastError);
    };
    const slow: Task<string, typeof fastError> = () => {
      fallbackStarted = true;
      return ok("slow");
    };

    const resultPromise = run(any([fast, slow]));

    assertFalse(fallbackStarted);

    completeFast.resolve();

    assertEqual(await resultPromise, ok("slow"));
    assertTrue(fallbackStarted);
  });

  it("returns sync Ok after sync Err", async () => {
    await using run = createRun();
    const taskError = { type: "TaskError" } as const;

    const first: Task<string, typeof taskError> = () => err(taskError);
    const second: Task<string, typeof taskError> = () => ok("second");

    assertEqual(await run(any([first, second])), ok("second"));
  });

  it("returns last Err result by input order when Errs settle out of order", async () => {
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
    const resultPromise = run(any([first, second], { concurrency: 2 }));

    completeFirst.resolve();

    assertEqual(await resultPromise, err(secondError));
  });

  it("returns last Err result by input order when run sequentially", async () => {
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

    assertEqual(
      await run(any([first, second, third], { concurrency: 1 })),
      err(thirdError),
    );
    assertEqual(events, ["first", "second", "third"]);
  });

  it("uses local concurrency and refills worker slots", async () => {
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
      any([createTask(1), createTask(2), createTask(3)], { concurrency: 2 }),
    );

    try {
      assertEqual(events, ["start 1", "start 2"]);

      completeTasks.resolve();

      assertEqual(await fiber, ok("third"));
    } finally {
      completeTasks.resolve();
    }
  });

  it("waits for aborted losers to settle", async () => {
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

    const anyFiber = run(any([slow, fast], { concurrency: 2 }));
    let anyFiberSettled = false;
    void anyFiber.then(() => {
      anyFiberSettled = true;
    });

    try {
      assertSame(await slowAborted.promise, runDisposedAbortReason);
      assertFalse(anyFiberSettled);

      const snapshot = anyFiber.run.snapshot();
      assertEqual(snapshot.state, { type: "Running" });

      const childSnapshot = snapshot.children.at(0);
      assertNotUndefined(childSnapshot);
      assertSame(childSnapshot.state.type, "Aborted");
      const abortReason = childSnapshot.state.abort.request;
      assertSame(abortReason, runDisposedAbortReason);
      assertSame(childSnapshot.state.abort.observed, abortReason);

      const grandchildSnapshot = childSnapshot.children.at(0);
      assertNotUndefined(grandchildSnapshot);
      assertSame(grandchildSnapshot.state.type, "Aborted");
      assertSame(grandchildSnapshot.state.abort.request, abortReason);
      assertSame(grandchildSnapshot.state.abort.observed, abortReason);
    } finally {
      completeSlow.resolve();
    }

    assertEqual(await anyFiber, ok("fast"));
    assertTrue(slowSettled);
  });

  it("does not start queued Tasks after the first Ok", async () => {
    await using run = createRun();
    const slowAborted = Promise.withResolvers<void>();
    const later = mock.fn(() => ok("later"));

    const slow: Task<string> = async (run) => {
      using _ = run.onAbort(() => slowAborted.resolve());
      await slowAborted.promise;
      return ok("slow");
    };
    const fast: Task<string> = () => ok("fast");

    assertEqual(
      await run(any([slow, fast, later], { concurrency: 2 })),
      ok("fast"),
    );
    assertEqual(later.mock.callCount(), 0);
  });

  it("aborts running Tasks when aborted", async () => {
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
    assertNotUndefined(taskSignal);

    fiber.abort(testAbortReason);
    completeTask.resolve();

    assertTrue(taskSignal.aborted);
    assertEqual(taskSignal.reason, testAbortError);

    assertEqual(await fiber, err(testAbortError));
  });
});

describe("race", () => {
  it("infers result and dependency intersections", () => {
    interface FirstError {
      readonly type: "FirstError";
    }
    interface SecondError {
      readonly type: "SecondError";
    }

    const first: Task<string, FirstError, DbDep> = () => ok("first");
    const second: Task<number, SecondError, SessionDep> = () => ok(2);

    const task = race([first, second]);

    assertType<
      typeof task,
      Task<string | number, FirstError | SecondError, DbDep & SessionDep>
    >();

    const assertRaceTypes = () => {
      // @ts-expect-error - race requires at least one Task.
      void race([]);
    };

    void assertRaceTypes;
  });

  it("asserts a non-empty Task array at runtime", async () => {
    await using run = testCreateRun();
    const tasks: ReadonlyArray<Task<string>> = [];
    const rejection = await assertRejectsPanicAbortErrorMessage(
      // @ts-expect-error A plain JavaScript caller can pass an empty array.
      run(race(tasks)),
      "Expected a non-empty readonly array.",
    );
    assertSame(await run.deps.reportDefect.next(), rejection);
  });

  it("returns first Ok result", async () => {
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

    assertEqual(await run(race([slow, fast])), ok("fast"));
  });

  it("returns sync Ok and aborts a pending loser", async () => {
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

    assertEqual(await run(race([syncOk, pending])), ok("sync"));
    assertTrue(pendingSettled);
  });

  it("returns first Err result", async () => {
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

    assertEqual(await run(race([slow, fast])), err(fastError));
  });

  it("aborts running Tasks when aborted", async () => {
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
    assertNotUndefined(taskSignal);

    fiber.abort(testAbortReason);
    completeTask.resolve();

    assertTrue(taskSignal.aborted);
    assertEqual(taskSignal.reason, testAbortError);

    assertEqual(await fiber, err(testAbortError));
  });

  it("waits for aborted losers to settle", async () => {
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
      assertSame(await slowAborted.promise, runDisposedAbortReason);
      assertFalse(raceFiberSettled);

      const snapshot = raceFiber.run.snapshot();
      assertEqual(snapshot.state, { type: "Running" });

      const childSnapshot = snapshot.children.at(0);
      assertNotUndefined(childSnapshot);
      assertSame(childSnapshot.state.type, "Aborted");
      const abortReason = childSnapshot.state.abort.request;
      assertSame(abortReason, runDisposedAbortReason);
      assertSame(childSnapshot.state.abort.observed, abortReason);

      const grandchildSnapshot = childSnapshot.children.at(0);
      assertNotUndefined(grandchildSnapshot);
      assertSame(grandchildSnapshot.state.type, "Aborted");
      assertSame(grandchildSnapshot.state.abort.request, abortReason);
      assertSame(grandchildSnapshot.state.abort.observed, abortReason);
    } finally {
      completeSlow.resolve();
    }

    assertEqual(await raceFiber, ok("fast"));
    assertTrue(slowSettled);
  });
});

describe("firstN", () => {
  it("infers readonly Ok array and dependency intersections", () => {
    interface FirstError {
      readonly type: "FirstError";
    }
    interface SecondError {
      readonly type: "SecondError";
    }

    const first: Task<string, FirstError, DbDep> = () => ok("first");
    const second: Task<number, SecondError, SessionDep> = () => ok(2);

    const task = firstN([first, second], 2);

    assertType<
      typeof task,
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

  it("returns Ok values in settlement order and ignores Errs", async () => {
    await using run = createRun();
    const completeSlow = Promise.withResolvers<void>();
    const taskError = { type: "TaskError" } as const;

    const slow: Task<string, typeof taskError> = async () => {
      await completeSlow.promise;
      return ok("slow");
    };
    const fastErr: Task<string, typeof taskError> = () => err(taskError);
    const fastOk: Task<string, typeof taskError> = () => ok("fast");

    const fiber = run(firstN([slow, fastErr, fastOk], 2, { concurrency: 3 }));

    completeSlow.resolve();

    assertEqual(await fiber, ok(["fast", "slow"]));
  });

  it("runs sequentially by default", async () => {
    await using run = createRun();
    const completeFirst = Promise.withResolvers<void>();
    const second = mock.fn(() => ok("second"));
    const first: Task<string> = async () => {
      await completeFirst.promise;
      return ok("first");
    };

    const fiber = run(firstN([first, second], 2));

    assertEqual(second.mock.callCount(), 0);
    completeFirst.resolve();

    assertEqual(await fiber, ok(["first", "second"]));
    assertEqual(second.mock.callCount(), 1);
  });

  it("returns available Ok values when fewer than count Tasks succeed", async () => {
    await using run = createRun();
    const taskError = { type: "TaskError" } as const;

    assertEqual(
      await run(firstN([() => ok("value"), () => err(taskError)], 2)),
      ok(["value"]),
    );
  });

  it("stops after count Ok values and aborts running Tasks", async () => {
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
    const later = mock.fn(() => ok("later"));

    const fiber = run(firstN([slow, fast, later], 1, { concurrency: 2 }));

    try {
      assertSame(await slowAborted.promise, runDisposedAbortReason);
      assertFalse(slowSettled);
    } finally {
      completeSlow.resolve();
    }

    assertEqual(await fiber, ok(["fast"]));
    assertTrue(slowSettled);
    assertEqual(later.mock.callCount(), 0);
  });
});

describe("firstNSettled", () => {
  it("infers readonly Result array and dependency intersections", () => {
    interface FirstError {
      readonly type: "FirstError";
    }
    interface SecondError {
      readonly type: "SecondError";
    }

    const first: Task<string, FirstError, DbDep> = () => ok("first");
    const second: Task<number, SecondError, SessionDep> = () => ok(2);

    const task = firstNSettled([first, second], 2);

    assertType<
      typeof task,
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

  it("returns Results in settlement order", async () => {
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
      firstNSettled([slow, fastErr, fastOk], 2, { concurrency: 3 }),
    );

    try {
      await slowAborted.promise;
    } finally {
      completeSlow.resolve();
    }

    assertEqual(await fiber, ok([err(taskError), ok("fast")]));
  });

  it("runs sequentially by default", async () => {
    await using run = createRun();
    const completeFirst = Promise.withResolvers<void>();
    const second = mock.fn(() => ok("second"));
    const first: Task<string> = async () => {
      await completeFirst.promise;
      return ok("first");
    };

    const fiber = run(firstNSettled([first, second], 2));

    assertEqual(second.mock.callCount(), 0);
    completeFirst.resolve();

    assertEqual(await fiber, ok([ok("first"), ok("second")]));
    assertEqual(second.mock.callCount(), 1);
  });

  it("stops at the threshold and does not start queued Tasks", async () => {
    await using run = createRun();
    const slowAborted = Promise.withResolvers<void>();
    const later = mock.fn(() => ok("later"));
    const slow: Task<string> = async (run) => {
      using _ = run.onAbort(() => slowAborted.resolve());
      await slowAborted.promise;
      return ok("slow");
    };
    const fast: Task<string> = () => ok("fast");

    assertEqual(
      await run(firstNSettled([slow, fast, later], 1, { concurrency: 2 })),
      ok([ok("fast")]),
    );
    assertEqual(later.mock.callCount(), 0);
  });

  it("returns all Results when count exceeds Task count", async () => {
    await using run = createRun();
    const taskError = { type: "TaskError" } as const;

    assertEqual(
      await run(firstNSettled([() => ok("value"), () => err(taskError)], 3)),
      ok([ok("value"), err(taskError)]),
    );
  });
});

describe("concurrency", () => {
  describe("each", () => {
    describe("input", () => {
      it("requires at least one Task", () => {
        const assertBatchTypes = () => {
          // @ts-expect-error - each requires at least one Task.
          void each([], () => "continue");
        };

        void assertBatchTypes;
      });

      it("asserts non-empty Task array at runtime instead of hanging", async () => {
        await using run = testCreateRun();

        // The non-empty tuple type is compile-time only; plain JS can still pass
        // an empty array, which must assert, not await forever.
        const tasks: ReadonlyArray<Task<string>> = [];

        await assertRejectsPanicAbortErrorMessage(
          // @ts-expect-error - Exercise the runtime assertion for plain JS callers.
          run(each(tasks, () => "continue")),
          "Expected a non-empty readonly array.",
        );
      });
    });

    describe("queue processing", () => {
      it("runs one Task at a time when concurrency is 1", async () => {
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

        assertEqual(events, ["first start"]);

        completeFirst.resolve();

        assertEqual(await fiber, ok());
        assertEqual(events, ["first start", "first end", "second start"]);
      });

      it("uses local concurrency and refills worker slots", async () => {
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
          each(
            [createTask(1), createTask(2), createTask(3)],
            () => "continue",
            {
              concurrency: 2,
            },
          ),
        );

        try {
          assertEqual(startedIds, [1, 2]);

          completeTasks.resolve();

          assertEqual(await fiber, ok());
          assertEqual(startedIds, [1, 2, 3]);
        } finally {
          completeTasks.resolve();
        }
      });

      it("calls onResult with results and indexes", async () => {
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

        assertOk(result, undefined);
        assertEqual(results, [
          [ok("first"), 0],
          [ok("second"), 1],
        ]);
      });

      it("waits for already-started Tasks after no queued Tasks remain", async () => {
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
          each(
            [slow, fast],
            (_result, index) => {
              if (index === 1) fastReported.resolve();
              return "continue";
            },
            { concurrency: 2 },
          ),
        ).then((result) => {
          settled = true;
          return result;
        });

        await fastReported.promise;

        assertFalse(settled);

        completeSlow.resolve();

        assertEqual(await fiber, ok());
        assertTrue(settled);
      });

      it("starts a queued Task after the running Task frees capacity", async () => {
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

        assertEqual(await fiber, ok());
        assertEqual(results, ["first", "second"]);
      });
    });

    describe("stop decision", () => {
      it("records Aborted and waits for running Tasks after stop", async () => {
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
        const later = mock.fn(() => ok("later"));

        const fiber = run(
          each([slow, fast, later], () => "stop", { concurrency: 2 }),
        );

        try {
          assertSame(await slowAborted.promise, runDisposedAbortReason);
          assertEqual(fiber.run.getState(), {
            type: "Aborted",
            abort: {
              request: runDisposedAbortReason,
              observed: runDisposedAbortReason,
            },
          });
        } finally {
          completeSlow.resolve();
        }

        assertEqual(await fiber, ok());
        assertEqual(fiber.run.getState(), {
          type: "Settled",
          abort: {
            request: runDisposedAbortReason,
            observed: runDisposedAbortReason,
          },
          exit: ok(ok()),
        });
        assertEqual(later.mock.callCount(), 0);
      });
    });

    describe("caller abort", () => {
      it("does not start queued Tasks after abort", async () => {
        await using run = createRun();
        const first: Task<string> = () => ok("first");
        const second = mock.fn(() => ok("second"));

        const fiber = run.abortable(
          each([first, second], () => {
            fiber.abort(testAbortReason);
            return "continue";
          }),
        );

        assertEqual(await fiber, err(testAbortError));
        assertEqual(second.mock.callCount(), 0);
      });

      it("keeps abort result when onResult also stops", async () => {
        await using run = createRun();

        const fiber = run.abortable(
          each([() => ok("first")], () => {
            fiber.abort(testAbortReason);
            return "stop";
          }),
        );

        assertEqual(await fiber, err(testAbortError));
      });

      it("does not call onResult after caller abort", async () => {
        await using run = createRun();
        const completeFirst = Promise.withResolvers<void>();
        const onResult = mock.fn(() => "stop" as const);

        const first: Task<string> = async () => {
          await completeFirst.promise;
          return ok("first");
        };

        const fiber = run.abortable(each([first], onResult));

        fiber.abort(testAbortReason);
        completeFirst.resolve();

        assertEqual(await fiber, err(testAbortError));
        assertEqual(onResult.mock.callCount(), 0);
      });

      it("keeps caller abort when a masked Task settles after abort", async () => {
        await using run = createRun();
        const taskStarted = Promise.withResolvers<void>();
        const completeTask = Promise.withResolvers<void>();
        const onResult = mock.fn(() => "continue" as const);

        const masked: Task<string> = unabortable(async (run) => {
          taskStarted.resolve();
          await completeTask.promise;
          assertFalse(run.signal.aborted);
          return ok("masked");
        });

        const fiber = run.abortable(each([masked], onResult));

        await taskStarted.promise;
        fiber.abort(testAbortReason);
        completeTask.resolve();

        assertEqual(await fiber, err(testAbortError));
        assertEqual(onResult.mock.callCount(), 0);
      });

      it("does not start queued Tasks after caller abort before result", async () => {
        await using run = createRun();
        const completeFirst = Promise.withResolvers<void>();

        const first: Task<string> = async () => {
          await completeFirst.promise;
          return ok("first");
        };
        const second = mock.fn(() => ok("second"));

        const fiber = run.abortable(each([first, second], () => "continue"));

        fiber.abort(testAbortReason);
        completeFirst.resolve();

        assertEqual(await fiber, err(testAbortError));
        assertEqual(second.mock.callCount(), 0);
      });
    });

    describe("child Fiber rejection", () => {
      it("propagates child Fiber AbortError rejection", async () => {
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
          each([aborting, slow], () => "continue", { concurrency: 2 }),
        );

        completeSlow.resolve();

        assertEqual(await fiber, err(abortError));
      });

      it("propagates child Fiber AbortError rejection while sibling is pending", async () => {
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
          each([slow, aborting], () => "continue", { concurrency: 2 }),
        );

        assertEqual(await fiber, err(abortError));
        await slowAborted.promise;
      });

      it("does not call onResult after child Fiber AbortError rejection", async () => {
        await using run = createRun();
        const abortError = createAbortError({ type: "TestAbort" });
        const onResult = mock.fn(() => "continue" as const);

        const aborting: Task<string> = callback<string>(({ reject }) => {
          reject(abortError);
        });
        const succeeding: Task<string> = () => ok("succeeding");

        const fiber = run.abortable(
          each([aborting, succeeding], onResult, { concurrency: 2 }),
        );

        assertEqual(await fiber, err(abortError));
        assertEqual(onResult.mock.callCount(), 0);
      });
    });

    describe("defects", () => {
      it("rejects when onResult throws for a sync-settling Task", async () => {
        await using run = testCreateRun();
        const defect = new Error("boom");

        const fiber = run(
          each([() => ok("first")], () => {
            throw defect;
          }),
        );

        const panicAbortError = await run.deps.reportDefect.next();
        assertPanicAbortError(panicAbortError, defect);
        await assertRejectsSame(fiber, panicAbortError);
      });

      it("rejects with panic abort and aborts running Tasks when onResult defects", async () => {
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
          each(
            [slow, fast],
            () => {
              throw defect;
            },
            { concurrency: 2 },
          ),
        );

        const panicAbortError = await run.deps.reportDefect.next();
        assertPanicAbortError(panicAbortError, defect);
        assertSame(await slowAborted.promise, panicAbortError.reason);

        completeSlow.resolve();

        await assertRejects(fiber, panic(defect));
      });

      it("rejects with panic abort and aborts running Tasks when an each Task defects", async () => {
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
          each([slow, defecting], () => "continue", { concurrency: 2 }),
        );

        const panicAbortError = await run.deps.reportDefect.next();
        assertPanicAbortError(panicAbortError, defect);
        assertSame(await slowAborted.promise, panicAbortError.reason);

        completeSlow.resolve();

        await assertRejects(fiber, panic(defect));
      });

      it("does not start queued Tasks after sibling defect", async () => {
        await using run = testCreateRun();
        const completeFirst = Promise.withResolvers<void>();
        const defect = new Error("boom");

        const first: Task<string> = async () => {
          await completeFirst.promise;
          return ok("first");
        };
        const second = mock.fn(() => ok("second"));

        const fiber = run(async (run) => {
          const eachFiber = run(
            each([first, second], () => "continue", { concurrency: 1 }),
          );
          void run(() => {
            throw defect;
          }).catch(() => undefined);

          completeFirst.resolve();

          return eachFiber;
        });

        await assertRejects(fiber, {
          type: "AbortError",
          reason: { type: "PanicAbortReason", defect },
        });
        assertEqual(second.mock.callCount(), 0);
      });

      it("does not call onResult after synchronous child scheduling defect", async () => {
        await using run = testCreateRun();
        const completeFirst = Promise.withResolvers<void>();
        let restoreFromCompletedMask:
          (<T, E>(task: Task<T, E>) => Task<T, E>) | undefined;

        assertEqual(
          await run(
            unabortableMask((restore) => {
              restoreFromCompletedMask = restore;
              return () => ok();
            }),
          ),
          ok(),
        );

        const restore = restoreFromCompletedMask;
        assertNotUndefined(restore);

        const first: Task<string> = async () => {
          await completeFirst.promise;
          return ok("first");
        };
        const staleRestore = restore(() => ok("second"));
        const onResult = mock.fn(() => "continue" as const);

        const fiber = run(
          each([first, staleRestore], onResult, { concurrency: 2 }),
        );

        const panicAbortError = await run.deps.reportDefect.next();
        assertPanicAbortErrorMessage(
          panicAbortError,
          "restore is only valid inside the unabortableMask that created it",
        );

        completeFirst.resolve();

        await assertRejectsSame(fiber, panicAbortError);
        assertEqual(onResult.mock.callCount(), 0);
      });

      it("does not start later Tasks after synchronous child scheduling defect", async () => {
        await using run = testCreateRun();
        let restoreFromCompletedMask:
          (<T, E>(task: Task<T, E>) => Task<T, E>) | undefined;

        assertEqual(
          await run(
            unabortableMask((restore) => {
              restoreFromCompletedMask = restore;
              return () => ok();
            }),
          ),
          ok(),
        );

        const restore = restoreFromCompletedMask;
        assertNotUndefined(restore);

        const staleRestore = restore(() => ok("bad"));
        const later = mock.fn(() => ok("later"));

        const fiber = run(
          each([staleRestore, later], () => "continue", { concurrency: 3 }),
        );

        const panicAbortError = await run.deps.reportDefect.next();

        await assertRejectsSame(fiber, panicAbortError);
        assertEqual(later.mock.callCount(), 0);
      });

      it("reports running Task panic after stop", async () => {
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

        const fiber = run(each([slow, fast], () => "stop", { concurrency: 2 }));

        assertSame(await slowAborted.promise, runDisposedAbortReason);

        completeSlow.resolve();

        assertEqual(await fiber, ok());
        assertEqual(await run.deps.reportDefect.next(), panic(defect));
      });
    });
  });
});

describe("prioritized", () => {
  it("uses native priorities", async () => {
    const priorities: Array<TaskPriority | undefined> = [];

    using _scheduler = testStubGlobal("scheduler", {
      postTask: async <T>(
        callback: () => T | PromiseLike<T>,
        options?: { readonly priority?: TaskPriority },
      ): Promise<T> => {
        priorities.push(options?.priority);
        return callback();
      },
    });

    await using run = createRun();

    assertEqual(
      await run(prioritized("user-blocking", () => ok("blocking"))),
      ok("blocking"),
    );
    assertEqual(
      await run(prioritized("user-visible", () => ok("visible"))),
      ok("visible"),
    );
    assertEqual(
      await run(prioritized("background", () => ok("background"))),
      ok("background"),
    );

    assertEqual(priorities, ["user-blocking", "user-visible", "background"]);
  });

  it("uses the outer priority wrapper", async () => {
    const priorities: Array<TaskPriority | undefined> = [];

    using _scheduler = testStubGlobal("scheduler", {
      postTask: async <T>(
        callback: () => T | PromiseLike<T>,
        options?: { readonly priority?: TaskPriority },
      ): Promise<T> => {
        priorities.push(options?.priority);
        return callback();
      },
    });

    await using run = createRun();

    assertEqual(
      await run(
        prioritized(
          "user-blocking",
          prioritized("background", () => ok("done")),
        ),
      ),
      ok("done"),
    );

    assertEqual(priorities, ["user-blocking"]);
  });

  it("composes with abort behavior", async () => {
    const priorities: Array<TaskPriority | undefined> = [];

    using _scheduler = testStubGlobal("scheduler", {
      postTask: async <T>(
        callback: () => T | PromiseLike<T>,
        options?: { readonly priority?: TaskPriority },
      ): Promise<T> => {
        priorities.push(options?.priority);
        return callback();
      },
    });

    await using run = createRun();

    assertEqual(
      await run(unabortable(prioritized("background", () => ok("first")))),
      ok("first"),
    );
    assertEqual(
      await run(
        prioritized(
          "background",
          unabortable(() => ok("second")),
        ),
      ),
      ok("second"),
    );

    assertEqual(priorities, ["background", "background"]);
  });

  it("composes through unabortableMask returned body Task", async () => {
    const priorities: Array<TaskPriority | undefined> = [];

    using _scheduler = testStubGlobal("scheduler", {
      postTask: async <T>(
        callback: () => T | PromiseLike<T>,
        options?: { readonly priority?: TaskPriority },
      ): Promise<T> => {
        priorities.push(options?.priority);
        return callback();
      },
    });

    await using run = createRun();

    assertEqual(
      await run(
        unabortableMask(() => prioritized("user-blocking", () => ok("body"))),
      ),
      ok("body"),
    );

    assertEqual(priorities, ["user-blocking"]);
  });

  it("cancels queued postTask when scheduler rejects with signal.reason", async () => {
    const postTaskNotAborted = new Error("postTask was not aborted");
    let taskStarted = false;

    using _scheduler = testStubGlobal("scheduler", {
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
            assertType(AbortError, reason);
            assertEqual(reason, testAbortError);
            rejectUnknown(reason);
          };

          options?.signal?.addEventListener("abort", abort, { once: true });
          queueMicrotask(() => reject(postTaskNotAborted));
        });
      },
    });

    await using run = testCreateRun();
    const fiber = run.abortable(
      prioritized("background", () => {
        taskStarted = true;
        return ok("started");
      }),
    );

    fiber.abort(testAbortReason);

    assertEqual(await fiber, err(testAbortError));
    assertFalse(taskStarted);
  });

  it("treats queued postTask abort-like rejections as defects", async () => {
    const hostAbortError = { name: "AbortError", message: "aborted" };
    const postTaskNotAborted = new Error("postTask was not aborted");
    let taskStarted = false;

    using _scheduler = testStubGlobal("scheduler", {
      postTask: <T>(
        callback: () => T | PromiseLike<T>,
        options?: {
          readonly priority?: TaskPriority;
          readonly signal?: AbortSignal;
        },
      ): Promise<T> => {
        void callback;

        return new Promise<T>((_resolve, reject) => {
          // oxlint-disable-next-line typescript/prefer-promise-reject-errors -- Host APIs can reject with non-Error abort values.
          const abort = (): void => reject(hostAbortError);

          options?.signal?.addEventListener("abort", abort, { once: true });
          queueMicrotask(() => reject(postTaskNotAborted));
        });
      },
    });

    await using run = testCreateRun();
    const fiber = run.abortable(
      prioritized("background", () => {
        taskStarted = true;
        return ok("started");
      }),
    );

    fiber.abort(testAbortReason);

    assertEqual(await fiber, err(panic(hostAbortError)));
    assertFalse(taskStarted);
    assertEqual(await run.deps.reportDefect.next(), panic(hostAbortError));
  });

  it("observes abort after postTask callback starts", async () => {
    const continueTask = Promise.withResolvers<void>();
    let taskStarted = false;

    using _scheduler = testStubGlobal("scheduler", {
      postTask: async <T>(callback: () => T | PromiseLike<T>): Promise<T> =>
        callback(),
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

      assertTrue(taskStarted);
      fiber.abort(testAbortReason);
      continueTask.resolve();

      assertEqual(await fiber, err(testAbortError));
    } finally {
      continueTask.resolve();
    }
  });
});

describe("yieldNow", () => {
  it("uses native yield", async () => {
    const calls: Array<string> = [];

    using _scheduler = testStubGlobal("scheduler", {
      yield: (): Promise<void> => {
        calls.push("yield");
        return Promise.resolve();
      },
    });

    await using run = createRun();

    assertEqual(await run(yieldNow), ok());
    assertEqual(calls, ["yield"]);
  });

  it("uses setImmediate fallback", async () => {
    const calls: Array<string> = [];

    using _scheduler = testStubGlobal("scheduler", undefined);
    using _setImmediate = testStubGlobal(
      "setImmediate",
      (callback: () => void): number => {
        calls.push("setImmediate");
        callback();
        return 0;
      },
    );

    await using run = createRun();

    assertEqual(await run(yieldNow), ok());
    assertEqual(calls, ["setImmediate"]);
  });

  it("uses setTimeout fallback", async () => {
    const calls: Array<string> = [];

    using _scheduler = testStubGlobal("scheduler", undefined);
    using _setImmediate = testStubGlobal("setImmediate", undefined);
    using _setTimeout = testStubGlobal(
      "setTimeout",
      (callback: () => void): number => {
        calls.push("setTimeout");
        callback();
        return 0;
      },
    );

    await using run = createRun();

    assertEqual(await run(yieldNow), ok());
    assertEqual(calls, ["setTimeout"]);
  });

  it("yields during a long-running loop", async () => {
    let yields = 0;

    using _scheduler = testStubGlobal("scheduler", {
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

    assertEqual(await run(sumTo(count)), ok((count * (count - 1)) / 2));
    assertEqual(yields, 4);
  });

  it("yields as monitored child Task", async () => {
    await using run = testCreateRun(eventsEnabled);
    const eventTypes: Array<string> = [];

    run.onEvent = (event) => {
      eventTypes.push(event.data.type);
    };

    const result = await run(async (run) => {
      await run(yieldNow);
      return ok("done");
    });

    assertOk(result, "done");
    assertLength(
      eventTypes.filter((type) => type === "ChildAdded"),
      2,
    );
    assertLength(
      eventTypes.filter((type) => type === "ChildRemoved"),
      2,
    );
  });

  it("observes abort after yielding", async () => {
    await using run = createRun();

    const fiber = run.abortable(async (run) => {
      await run(yieldNow);
      return ok("done");
    });

    fiber.abort(testAbortReason);

    assertEqual(await fiber, err(testAbortError));
  });
});

describe("waitForAbort", () => {
  it("waits until the Run aborts", async () => {
    await using run = createRun();

    const fiber = run(waitForAbort);

    assertEqual(fiber.run.getState(), { type: "Running" });

    run.abort(testAbortReason);

    await assertRejects(fiber, testAbortError);
  });
});

describe("daemon", () => {
  it("passes through the Result when not aborted", async () => {
    await using run = createRun();

    const okResult = await run(daemon(() => ok(42)));
    const errResult = await run(daemon(() => err({ type: "MyError" })));

    assertEqual(okResult, ok(42));
    assertEqual(errResult, err({ type: "MyError" }));
  });

  it("rethrows non-AbortError from daemon start", async () => {
    await using run = createRun();
    const childRun = run.create();
    await childRun[Symbol.asyncDispose]();

    const error = await assertRejectsInstanceOf(
      Promise.resolve(daemon(() => ok("done"))(childRun)),
      Error,
    );
    assertTrue(error.message.includes("Cannot use a disposed object."));
  });

  it("settles and reports panic abort when the wrapped Task defects", async () => {
    await using run = testCreateRun();
    const defect = new Error("boom");
    const panicAbortError = createAbortError({
      type: "PanicAbortReason",
      defect,
    });

    const result = await run(
      assertReportedDefectOnly(
        panicAbortError,
        daemon(() => {
          throw defect;
        }),
      ),
    );

    assertErr(result, panicAbortError);
  });

  it("settles with AbortError without waiting for the Task", async () => {
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
      assertEqual(await fiber, err(testAbortError));
      assertFalse(taskSettled);
    } finally {
      completeTask.resolve();
    }
  });

  it("root disposal waits for an abandoned daemon Task", async () => {
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
      assertEqual(await fiber, err(testAbortError));

      const disposePromise = run[Symbol.asyncDispose]().then(() => {
        rootDisposed = true;
      });

      await Promise.resolve();
      assertFalse(rootDisposed);

      completeTask.resolve();

      await disposePromise;
      assertTrue(rootDisposed);
    } finally {
      completeTask.resolve();
      await run[Symbol.asyncDispose]();
    }
  });

  it("requests abort for the abandoned Task", async () => {
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
      assertEqual(await fiber, err(testAbortError));
      assertEqual(taskAbortError, testAbortError);
    } finally {
      completeTask.resolve();
    }
  });

  it("settles with AbortError and does not start the Task when the Run is already aborted", async () => {
    await using run = createRun();
    const continueParent = Promise.withResolvers<void>();
    let taskStarted = false;

    const task: Task<string> = () => {
      taskStarted = true;
      return ok("done");
    };

    const fiber = run.abortable(async (run) => {
      await continueParent.promise;
      return run(daemon(task));
    });

    fiber.abort(testAbortReason);
    continueParent.resolve();

    assertEqual(await fiber, err(testAbortError));
    assertFalse(taskStarted);
  });

  it("settles with AbortError and does not start the Task inside a masked Run with a recorded abort request", async () => {
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

        assertFalse(run.signal.aborted);

        return run(daemon(task));
      }),
    );

    fiber.abort(testAbortReason);
    continueParent.resolve();

    assertEqual(await fiber, err(testAbortError));
    assertFalse(taskStarted);
  });

  it("returns caller abort and reports later abandoned Task defects as panic aborts", async () => {
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
      assertReportedDefectOnly(panicAbortError, async (run) => {
        const fiber = run.abortable(daemon(defectAfterRelease));

        fiber.abort(callerAbortReason);

        assertEqual(
          await fiber,
          err({ type: "AbortError", reason: callerAbortReason }),
        );

        releaseAbandonedTask.resolve();

        return ok();
      }),
    );

    assertOk(result, undefined);
  });

  it("infers result with AbortError and preserves deps", () => {
    interface MyError {
      readonly type: "MyError";
    }

    const task: Task<string, MyError, DbDep> = () => ok("done");

    const wrapped = daemon(task);

    assertType<typeof wrapped, Task<string, MyError | AbortError, DbDep>>();
  });

  it("returns AbortError when daemon start is prevented by a masked abort request", async () => {
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

    assertEqual(await fiber, ok());
    assertSame(rejection, undefined);
    assertNotUndefined(result);
    assertErr(result, testAbortError);
    assertFalse(taskStarted);
  });
});

describe("unabortable", () => {
  it("passes through Ok and Err Results", async () => {
    await using run = createRun();

    const okResult = await run(unabortable(() => ok(42)));
    const errResult = await run(unabortable(() => err({ type: "MyError" })));

    assertEqual(okResult, ok(42));
    assertEqual(errResult, err({ type: "MyError" }));
  });

  it("masks abort after Task starts when used with run.abortable", async () => {
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

    assertEqual(await fiber, ok("done"));
    assertFalse(signalAbortedAtStart);
    assertFalse(signalAbortedAfterAbort);
  });

  it("records requested abort and disposal observed reasons for masked Task", async () => {
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

    assertEqual(await fiber, ok("done"));
    assertEqual(fiber.run.getState(), {
      type: "Settled",
      abort: {
        request: testAbortReason,
        observed: runDisposedAbortReason,
      },
      exit: ok(ok("done")),
    });
  });

  it("does not start after parent abort request when used with run.abortable", async () => {
    await using run = createRun();
    const continueTask = Promise.withResolvers<void>();
    let parentSignalAborted = false;
    let childTaskRan = false;

    const fiber = run.abortable(async (run) => {
      await continueTask.promise;
      parentSignalAborted = run.signal.aborted;

      return run(
        unabortable(({ signal }) => {
          childTaskRan = true;
          assertFalse(signal.aborted);
          return ok("child");
        }),
      );
    });

    fiber.abort(testAbortReason);
    continueTask.resolve();

    assertEqual(await fiber, err(testAbortError));
    assertTrue(parentSignalAborted);
    assertFalse(childTaskRan);
  });

  it("lets daemon Tasks finish naturally after abort request", async () => {
    await using run = createRun();
    const abortRequested = Promise.withResolvers<void>();
    const checkedAbort = Promise.withResolvers<void>();

    const fiber = run.daemon(
      unabortable(async ({ signal }) => {
        await abortRequested.promise;
        assertFalse(signal.aborted);
        checkedAbort.resolve();
        return ok();
      }),
    );

    fiber.abort();
    abortRequested.resolve();

    await checkedAbort.promise;
    assertEqual(await fiber, ok());
  });

  it("lets created Run disposal wait for child Tasks", async () => {
    await using run = createRun();
    const createdRun = run.create();
    const completeChild = Promise.withResolvers<void>();
    let disposeFinished = false;
    let childSignal: AbortSignal | undefined;

    const childFiber = createdRun(
      unabortable(async ({ signal }) => {
        childSignal = signal;
        await completeChild.promise;
        assertFalse(signal.aborted);
        return ok("child");
      }),
    );

    assertNotUndefined(childSignal);
    const disposePromise = createdRun[Symbol.asyncDispose]().then(() => {
      disposeFinished = true;
    });

    assertFalse(childSignal.aborted);
    assertFalse(disposeFinished);

    completeChild.resolve();

    assertEqual(await childFiber, ok("child"));
    await disposePromise;
    assertTrue(disposeFinished);
  });

  it("passes Fiber run to wrapped Task", async () => {
    await using run = createRun();
    let taskRun: Run | undefined;

    const fiber = run(
      unabortable((run) => {
        taskRun = run;
        return ok("done");
      }),
    );

    assertNotUndefined(taskRun);
    assertSame(fiber.run, taskRun);
    assertEqual(await fiber, ok("done"));
  });
});

describe("unabortableMask", () => {
  it("restores abortability for selected child Tasks when used with run.abortable", async () => {
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
        assertErr(restoredResult);
        assertEqual(restoredResult.error, {
          type: "AbortError",
          reason: explicitAbortReason,
        });

        events.push("release");
        return ok(events);
      }),
    );

    fiber.abort();
    continueTask.resolve();

    assertEqual(
      await fiber,
      ok(["acquire", "masked child aborted=false", "release"]),
    );
  });

  it("does not start after parent abort request when used with run.abortable", async () => {
    await using run = createRun();
    const continueParent = Promise.withResolvers<void>();
    let maskBodyRan = false;

    const fiber = run.abortable(async (run) => {
      await continueParent.promise;

      return run(
        unabortableMask((restore) => async (run) => {
          maskBodyRan = true;
          return run(restore(() => ok("restored")));
        }),
      );
    });

    fiber.abort(testAbortReason);
    continueParent.resolve();

    assertEqual(await fiber, err(testAbortError));
    assertFalse(maskBodyRan);
  });

  it("restore works from a descendant Run in the same mask scope", async () => {
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
        assertErr(useResult);
        assertEqual(useResult.error, {
          type: "AbortError",
          reason: explicitAbortReason,
        });

        events.push(`helper release aborted=${run.signal.aborted}`);
        return ok();
      };

    const fiber = run.abortable(
      unabortableMask((restore) => async (run) => run(helper(restore))),
    );

    fiber.abort();
    continueUse.resolve();

    assertEqual(await fiber, ok());
    assertEqual(events, [
      "helper acquire aborted=false",
      "helper use started aborted=false",
      "helper use aborted=true",
      "helper release aborted=false",
    ]);
  });

  it("restore supports child Tasks with replacement deps", async () => {
    await using run = createRun(dbDep);

    const task: Task<string, never, DbDep> = unabortableMask(
      (restore) => async (run) => {
        const useSession: Task<string, never, SessionDep> = ({ deps }) => {
          assertType<typeof deps, RunDefaultDeps & SessionDep>();
          assertFalse("db" in deps);
          assertSame(deps.session, sessionDep.session);
          return ok(deps.session.userId);
        };

        return run(restore(useSession), sessionDep);
      },
    );

    assertEqual(await run(task), ok("ada"));
  });

  it("throws when abort behavior helpers wrap the same Task", async () => {
    const task: Task<void> = () => ok();

    const error = assertThrowsInstanceOf(
      () => unabortable(unabortable(task)),
      Error,
    );
    assertTrue(
      error.message.includes(
        "abort behavior helpers cannot wrap the same Task",
      ),
    );

    await using run = testCreateRun();

    const rejection = await assertRejectsPanicAbortErrorMessage(
      run(unabortableMask((restore) => restore(unabortable(task)))),
      "abort behavior helpers cannot wrap the same Task",
    );
    assertSame(await run.deps.reportDefect.next(), rejection);
  });

  it("throws when called directly", async () => {
    await using run = createRun();
    const task = unabortableMask(() => () => ok());

    const error = assertThrowsInstanceOf(() => task(run), Error);
    assertTrue(
      error.message.includes(
        "unabortableMask requires a masked Run; use run(task), not a direct call",
      ),
    );
  });

  // These tests intentionally exercise restore misuse. A restore helper is
  // valid only for descendant Runs still inside the mask that created it.
  describe("restore scope rejects restore", () => {
    const restoreScopeError =
      "restore is only valid inside the unabortableMask that created it";

    it("captured from a completed inner mask", async () => {
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
        assertNotUndefined(restore);

        const error = assertThrowsInstanceOf(
          () => run(restore(() => ok())),
          Error,
        );
        assertEqual(error.message, restoreScopeError);

        return ok();
      });

      assertEqual(await run(task), ok());
    });

    it("after its mask settles", async () => {
      await using run = createRun();
      let restoreFromOuter:
        (<T, E>(task: Task<T, E>) => Task<T, E>) | undefined;

      assertEqual(
        await run(
          unabortableMask((restore) => {
            restoreFromOuter = restore;
            return () => ok();
          }),
        ),
        ok(),
      );

      const restore = restoreFromOuter;
      assertNotUndefined(restore);

      const error = assertThrowsInstanceOf(
        () => run(restore(() => ok())),
        Error,
      );
      assertEqual(error.message, restoreScopeError);
    });

    it("inside sibling mask", async () => {
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
        assertNotUndefined(restore);

        return run(unabortableMask(() => (run) => run(restore(() => ok()))));
      });

      await assertRejectsPanicAbortErrorMessage(run(task), restoreScopeError);
      const panicAbortError = await run.deps.reportDefect.next();
      assertPanicAbortErrorMessage(panicAbortError, restoreScopeError);
    });

    it("from daemon Run", async () => {
      await using run = testCreateRun();
      const continueDaemon = Promise.withResolvers<void>();

      const fiber = run(
        unabortableMask((restore) => async (run) => {
          const daemonFiber = run.daemon(async (run) => {
            await continueDaemon.promise;

            return run(restore(() => ok()));
          });

          continueDaemon.resolve();

          const daemonResult = await daemonFiber;
          assertErr(daemonResult);
          assertPanicAbortErrorMessage(daemonResult.error, restoreScopeError);

          return ok();
        }),
      );

      assertEqual(await fiber, ok());
      const panicAbortError = await run.deps.reportDefect.next();
      assertPanicAbortErrorMessage(panicAbortError, restoreScopeError);
    });

    it("from created Run", async () => {
      await using run = createRun();

      assertEqual(
        await run(
          unabortableMask((restore) => async (run) => {
            await using createdRun = run.create();

            const error = assertThrowsInstanceOf(
              () => createdRun(restore(() => ok())),
              Error,
            );
            assertEqual(error.message, restoreScopeError);

            return ok();
          }),
        ),
        ok(),
      );
    });
  });

  it("nested masks restore active outer scope from descendant Runs", async () => {
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

                assertEqual(await innerUse, ok());
                const outerUseResult = await outerUse;
                assertErr(outerUseResult);
                assertEqual(outerUseResult.error, {
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

    assertEqual(
      await fiber,
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

  it("supports unabortable acquire and release with abortable use", async () => {
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
    assertErr(result);
    assertEqual(result.error, {
      type: "AbortError",
      reason: explicitAbortReason,
    });
    assertEqual(events, [
      "acquire aborted=false",
      "use resource started aborted=false",
      "use resource aborted=true",
      "release resource aborted=false",
    ]);
  });

  it("does not enter nested unabortableMask after abort request", async () => {
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
    assertErr(result);
    assertEqual(result.error, {
      type: "AbortError",
      reason: explicitAbortReason,
    });
    assertEqual(events, ["use started aborted=false", "use aborted=true"]);
  });
});

describe("acquireUseRelease", () => {
  it("masks acquire and release while restoring use", async () => {
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
    assertErr(result);
    assertEqual(result.error, {
      type: "AbortError",
      reason: explicitAbortReason,
    });
    assertEqual(events, [
      "acquire aborted=false",
      "use resource started aborted=false",
      "use resource aborted=true",
      "release resource aborted=false",
    ]);
  });

  it("skips release when acquire fails", async () => {
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

    assertErr(result, acquireError);
    assertFalse(useRan);
    assertFalse(releaseRan);
  });

  it("runs release when use returns Err", async () => {
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

    assertErr(result, useError);
    assertTrue(released);
  });

  it("runs release when use defects", async () => {
    await using run = testCreateRun();
    const defect = new Error("boom");
    let released = false;

    await assertRejects(
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
      panic(defect),
    );

    assertTrue(released);
    assertEqual(await run.deps.reportDefect.next(), panic(defect));
  });

  it("release defect overrides use result", async () => {
    await using run = testCreateRun();
    const useError = { type: "UseError" } as const;
    const releaseDefect = new Error("release failed");

    await assertRejects(
      run(
        acquireUseRelease(
          () => ok("resource"),
          () => () => err(useError),
          () => () => {
            throw releaseDefect;
          },
        ),
      ),
      panic(releaseDefect),
    );
    assertEqual(await run.deps.reportDefect.next(), panic(releaseDefect));
  });

  it("does not start acquireUseRelease after parent abort request", async () => {
    await using run = createRun();
    const continueParent = Promise.withResolvers<void>();
    let acquired = false;

    const fiber = run.abortable(async (run) => {
      await continueParent.promise;

      return run(
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

    assertEqual(await fiber, err(testAbortError));
    assertFalse(acquired);
  });
});

describe("Deferred", () => {
  it("resolves a waiting Task with Ok", async () => {
    await using run = createRun();

    const deferred = createDeferred<string>();

    const fiber = run(deferred.task);

    assertEqual(fiber.run.getState(), { type: "Running" });

    deferred.resolve(ok("value"));

    assertEqual(await fiber, ok("value"));
  });

  it("resolves all waiting Tasks", async () => {
    await using run = createRun();

    const deferred = createDeferred<string>();
    const first = run(deferred.task);
    const second = run(deferred.task);

    deferred.resolve(ok("value"));

    assertEqual(await first, ok("value"));
    assertEqual(await second, ok("value"));
  });

  it("resolves a waiting Task with Err", async () => {
    await using run = createRun();

    const myError = { type: "MyError" } as const;
    const deferred = createDeferred<string, typeof myError>();
    const fiber = run(deferred.task);

    assertEqual(fiber.run.getState(), { type: "Running" });

    deferred.resolve(err(myError));

    assertEqual(await fiber, err(myError));
  });

  it("can still resolve after a waiter aborts", async () => {
    await using run = createRun();

    const deferred = createDeferred<string>();
    const fiber = run.abortable(deferred.task);

    assertEqual(fiber.run.getState(), { type: "Running" });

    fiber.abort(testAbortReason);

    assertEqual(await fiber, err(testAbortError));

    deferred.resolve(ok("value"));

    assertEqual(await run(deferred.task), ok("value"));
  });

  it("resolves a Task started after resolving", async () => {
    await using run = createRun();

    const deferred = createDeferred<string>();
    deferred.resolve(ok("value"));

    assertEqual(await run(deferred.task), ok("value"));
  });

  it("ignores resolving after already resolved", async () => {
    await using run = createRun();

    const deferred = createDeferred<string>();
    assertTrue(deferred.resolve(ok("value")));
    assertFalse(deferred.resolve(ok("later")));

    assertEqual(await run(deferred.task), ok("value"));
  });

  it("aborting one waiter does not affect other waiters", async () => {
    await using run = createRun();

    const deferred = createDeferred<string>();
    const first = run.abortable(deferred.task);
    const second = run.abortable(deferred.task);

    first.abort(testAbortReason);
    assertEqual(await first, err(testAbortError));
    assertEqual(second.run.getState(), { type: "Running" });

    deferred.resolve(ok("value"));

    assertEqual(await second, ok("value"));
  });
});

describe("Gate", () => {
  describe("wait", () => {
    it("blocks until gate opens", async () => {
      await using run = createRun();

      const gate = createGate();
      const events: Array<string> = [];

      const fiber = run(async (run) => {
        events.push("waiting");
        await run.ok(gate.wait);
        events.push("passed");
        return ok();
      });

      assertEqual(events, ["waiting"]);
      assertFalse(gate.isOpen());

      gate.open();

      assertEqual(await fiber, ok());
      assertEqual(events, ["waiting", "passed"]);
      assertTrue(gate.isOpen());
    });

    it("returns immediately when gate is already open", async () => {
      await using run = createRun();

      const gate = createGate();

      gate.open();

      await run.ok(gate.wait);
    });

    it("returns immediately when gate is created open", async () => {
      await using run = createRun();

      const gate = createGate({ isOpen: true });

      assertTrue(gate.isOpen());

      await run.ok(gate.wait);
    });
  });

  describe("open", () => {
    it("resolves all waiting Tasks", async () => {
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

      assertEqual(events, ["first waiting", "second waiting"]);

      gate.open();

      assertEqual(await Promise.all([firstFiber, secondFiber]), [ok(), ok()]);
      assertEqual(events, [
        "first waiting",
        "second waiting",
        "first passed",
        "second passed",
      ]);
    });
  });

  describe("close", () => {
    it("makes future Tasks wait", async () => {
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

      assertEqual(events, ["waiting"]);
      assertFalse(gate.isOpen());

      gate.open();

      assertEqual(await fiber, ok());
      assertEqual(events, ["waiting", "passed"]);
    });

    it("keeps future waiters blocked until open", async () => {
      await using run = createRun();
      const continueParent = Promise.withResolvers<void>();

      const gate = createGate();

      gate.open();
      gate.close();

      const fiber = run.abortable(async (run) => {
        await continueParent.promise;
        return run(gate.wait);
      });

      fiber.abort(testAbortReason);
      continueParent.resolve();

      assertEqual(await fiber, err(testAbortError));

      gate.open();

      assertEqual(await run(gate.wait), ok());
    });
  });

  describe("release", () => {
    it("resolves current waiters without opening gate", async () => {
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

      assertEqual(events, ["first waiting", "second waiting"]);

      assertTrue(gate.release());

      assertEqual(await Promise.all([firstFiber, secondFiber]), [ok(), ok()]);
      assertEqual(events, [
        "first waiting",
        "second waiting",
        "first passed",
        "second passed",
      ]);
      assertFalse(gate.isOpen());

      const futureFiber = run.abortable(async (run) => {
        events.push("future waiting");
        await continueFuture.promise;
        return run(gate.wait);
      });

      assertEqual(events, [
        "first waiting",
        "second waiting",
        "first passed",
        "second passed",
        "future waiting",
      ]);

      futureFiber.abort(testAbortReason);
      continueFuture.resolve();

      assertEqual(await futureFiber, err(testAbortError));
    });

    it("reports false when gate is open", () => {
      const gate = createGate();

      gate.open();

      assertFalse(gate.release());
      assertTrue(gate.isOpen());
    });

    it("reports true for a closed gate without waiters", () => {
      const gate = createGate();

      assertTrue(gate.release());
      assertFalse(gate.isOpen());
    });
  });

  describe("state changes", () => {
    it("open and close report whether state changed", () => {
      const gate = createGate();

      assertTrue(gate.open());
      assertFalse(gate.open());

      assertTrue(gate.close());
      assertFalse(gate.close());
    });
  });
});

describe("Semaphore", () => {
  describe("withPermit", () => {
    it("holds one permit while the Task runs", async () => {
      await using run = createRun();

      const semaphore = createSemaphore(1);
      const completeTask = Promise.withResolvers<void>();

      const fiber = run(
        semaphore.withPermit(async () => {
          assertEqual(semaphore.snapshot(), {
            policy: "fifo",
            permits: 1,
            taken: 1,
            waiters: [],
            available: 0,
            isIdle: false,
          });

          await completeTask.promise;
          return ok("value");
        }),
      );

      completeTask.resolve();

      assertEqual(await fiber, ok("value"));
      assertEqual(semaphore.snapshot(), {
        policy: "fifo",
        permits: 1,
        taken: 0,
        waiters: [],
        available: 1,
        isIdle: true,
      });
    });
  });

  describe("withPermits", () => {
    it("returns a Task preserving error and dependency types", () => {
      interface MyError {
        readonly type: "MyError";
      }

      const semaphore = createSemaphore(1);
      const task: Task<string, MyError, DbDep> = () => ok("value");

      {
        const actual = semaphore.withPermits(1)(task);
        assertType<typeof actual, Task<string, MyError, DbDep>>();
      }
    });

    it("runs a Task while holding permits", async () => {
      await using run = createRun();

      const semaphore = createSemaphore(3);

      const result = await run(
        semaphore.withPermits(2)(() => {
          assertEqual(semaphore.snapshot(), {
            policy: "fifo",
            permits: 3,
            taken: 2,
            waiters: [],
            available: 1,
            isIdle: false,
          });
          return ok("value");
        }),
      );

      assertOk(result, "value");
    });

    it("waits until enough permits are released", async () => {
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

      assertEqual(semaphore.snapshot(), {
        policy: "fifo",
        permits: 2,
        taken: 2,
        waiters: [{ permits: 1 }],
        available: 0,
        isIdle: false,
      });
      assertEqual(events, ["first acquired"]);

      completeFirstTask.resolve();

      assertEqual(await firstFiber, ok("first"));
      assertEqual(await secondFiber, ok("second"));
      assertEqual(events, [
        "first acquired",
        "first completed",
        "second acquired",
      ]);
      assertEqual(semaphore.snapshot(), {
        policy: "fifo",
        permits: 2,
        taken: 0,
        waiters: [],
        available: 2,
        isIdle: true,
      });
    });

    it("removes queued waiter when aborted before acquisition", async () => {
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

      assertEqual(semaphore.snapshot(), {
        policy: "fifo",
        permits: 1,
        taken: 1,
        waiters: [{ permits: 1 }],
        available: 0,
        isIdle: false,
      });

      fiber.abort(testAbortReason);
      await Promise.resolve();

      assertEqual(semaphore.snapshot(), {
        policy: "fifo",
        permits: 1,
        taken: 1,
        waiters: [],
        available: 0,
        isIdle: false,
      });
      assertFalse(taskStarted);

      held.release();

      assertEqual(await fiber, err(testAbortError));
    });

    it("releases permits after Ok", async () => {
      await using run = createRun();

      const semaphore = createSemaphore(2);

      const result = await run(semaphore.withPermits(2)(() => ok("value")));

      assertOk(result, "value");
      assertEqual(semaphore.snapshot(), {
        policy: "fifo",
        permits: 2,
        taken: 0,
        waiters: [],
        available: 2,
        isIdle: true,
      });
    });

    it("releases permits after Err", async () => {
      await using run = createRun();

      const semaphore = createSemaphore(2);

      const result = await run(
        semaphore.withPermits(2)(() => {
          assertEqual(semaphore.snapshot(), {
            policy: "fifo",
            permits: 2,
            taken: 2,
            waiters: [],
            available: 0,
            isIdle: false,
          });
          return err("error");
        }),
      );

      assertErr(result, "error");
      assertEqual(semaphore.snapshot(), {
        policy: "fifo",
        permits: 2,
        taken: 0,
        waiters: [],
        available: 2,
        isIdle: true,
      });
    });

    it("releases permits after abort", async () => {
      await using run = createRun();

      const semaphore = createSemaphore(2);
      const taskStarted = Promise.withResolvers<void>();

      const fiber = run.abortable(
        semaphore.withPermits(2)(async (run) => {
          assertEqual(semaphore.snapshot(), {
            policy: "fifo",
            permits: 2,
            taken: 2,
            waiters: [],
            available: 0,
            isIdle: false,
          });
          taskStarted.resolve();
          await run.ok(
            callback(({ run: { signal } }) => {
              assertFalse(signal.aborted);
            }),
          );
          return ok();
        }),
      );

      await taskStarted.promise;
      fiber.abort(testAbortReason);

      assertEqual(await fiber, err(testAbortError));
      assertEqual(semaphore.snapshot(), {
        policy: "fifo",
        permits: 2,
        taken: 0,
        waiters: [],
        available: 2,
        isIdle: true,
      });
    });
  });

  describe("withPermitsIfAvailable", () => {
    it("returns a Task of Option and preserves error and dependency types", () => {
      interface MyError {
        readonly type: "MyError";
      }

      const semaphore = createSemaphore(1);
      const task: Task<string, MyError, DbDep> = () => ok("value");

      {
        const actual = semaphore.withPermitsIfAvailable(1)(task);
        assertType<typeof actual, Task<Option<string>, MyError, DbDep>>();
      }
    });

    it("returns Some after running the Task while holding permits", async () => {
      await using run = createRun();

      const semaphore = createSemaphore(2);

      const result = await run(
        semaphore.withPermitsIfAvailable(2)(() => {
          assertEqual(semaphore.snapshot(), {
            policy: "fifo",
            permits: 2,
            taken: 2,
            waiters: [],
            available: 0,
            isIdle: false,
          });
          return ok("value");
        }),
      );

      assertOk(result, some("value"));
      assertEqual(semaphore.snapshot(), {
        policy: "fifo",
        permits: 2,
        taken: 0,
        waiters: [],
        available: 2,
        isIdle: true,
      });
    });

    it("returns None without queueing when permits are unavailable", async () => {
      await using run = createRun();

      const semaphore = createSemaphore(1);
      let taskStarted = false;

      const result = await run(
        semaphore.withPermitsIfAvailable(2)(() => {
          taskStarted = true;
          return ok("value");
        }),
      );

      assertOk(result, none);
      assertFalse(taskStarted);
      assertEqual(semaphore.snapshot(), {
        policy: "fifo",
        permits: 1,
        taken: 0,
        waiters: [],
        available: 1,
        isIdle: true,
      });
    });

    it("returns None in FIFO when waiters exist", async () => {
      await using run = createRun();

      const semaphore = createSemaphore(3);
      let taskStarted = false;

      using firstPermit = await run.ok(semaphore.take(2));

      const waitingFiber = run.abortable(semaphore.take(2));

      assertEqual(semaphore.snapshot(), {
        policy: "fifo",
        permits: 3,
        taken: 2,
        waiters: [{ permits: 2 }],
        available: 0,
        isIdle: false,
      });

      const result = await run(
        semaphore.withPermitsIfAvailable(1)(() => {
          taskStarted = true;
          return ok("value");
        }),
      );

      assertOk(result, none);
      assertFalse(taskStarted);

      waitingFiber.abort(testAbortReason);
      assertEqual(await waitingFiber, err(testAbortError));
      firstPermit.release();
    });

    it("bypasses waiters in greedy policy", async () => {
      await using run = createRun();

      const semaphore = createSemaphore(3, { policy: "greedy" });

      using firstPermit = await run.ok(semaphore.take(2));

      const waitingFiber = run.abortable(semaphore.take(2));

      assertEqual(semaphore.snapshot(), {
        policy: "greedy",
        permits: 3,
        taken: 2,
        waiters: [{ permits: 2 }],
        available: 1,
        isIdle: false,
      });

      const result = await run(
        semaphore.withPermitsIfAvailable(1)(() => ok("value")),
      );

      assertOk(result, some("value"));

      waitingFiber.abort(testAbortReason);
      assertEqual(await waitingFiber, err(testAbortError));
      firstPermit.release();
    });

    it("releases permits after Err", async () => {
      await using run = createRun();

      const semaphore = createSemaphore(1);

      const result = await run(
        semaphore.withPermitsIfAvailable(1)(() => err("error")),
      );

      assertErr(result, "error");
      assertEqual(semaphore.snapshot(), {
        policy: "fifo",
        permits: 1,
        taken: 0,
        waiters: [],
        available: 1,
        isIdle: true,
      });
    });

    it("releases permits after abort", async () => {
      await using run = createRun();

      const semaphore = createSemaphore(1);
      const taskStarted = Promise.withResolvers<void>();

      const fiber = run.abortable(
        semaphore.withPermitsIfAvailable(1)(async (run) => {
          assertEqual(semaphore.snapshot(), {
            policy: "fifo",
            permits: 1,
            taken: 1,
            waiters: [],
            available: 0,
            isIdle: false,
          });
          taskStarted.resolve();
          await run.ok(
            callback(({ run: { signal } }) => {
              assertFalse(signal.aborted);
            }),
          );
          return ok("value");
        }),
      );

      await taskStarted.promise;
      fiber.abort(testAbortReason);

      assertEqual(await fiber, err(testAbortError));
      assertEqual(semaphore.snapshot(), {
        policy: "fifo",
        permits: 1,
        taken: 0,
        waiters: [],
        available: 1,
        isIdle: true,
      });
    });
  });

  describe("take", () => {
    it("reports a leaked permit", async () => {
      await using run = testCreateRun();

      const semaphore = createSemaphore(1);
      await run.ok(semaphore.take(1));

      assertEqual(run.deps.leakDetector.collect(), 1);
    });

    it("returns a permit when enough permits are available", async () => {
      await using run = createRun();

      const semaphore = createSemaphore(2);

      using permit = await run.ok(semaphore.take(1));

      assertEqual(permit.permits, 1);
    });

    it("waits until enough permits are released", async () => {
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

      assertEqual(semaphore.snapshot(), {
        policy: "fifo",
        permits: 1,
        taken: 1,
        waiters: [{ permits: 1 }],
        available: 0,
        isIdle: false,
      });
      assertEqual(events, ["waiting"]);

      firstPermit.release();

      assertEqual(await secondFiber, ok());
      assertEqual(events, ["waiting", "acquired 1"]);
    });

    it("serves waiters in FIFO order by default", async () => {
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

      assertEqual(semaphore.snapshot(), {
        policy: "fifo",
        permits: 3,
        taken: 2,
        waiters: [{ permits: 2 }],
        available: 0,
        isIdle: false,
      });

      const smallerFiber = run(async (run) => {
        events.push("smaller requesting");
        using permit = await run.ok(semaphore.take(1));
        events.push(`smaller acquired ${permit.permits}`);
        return ok();
      });

      assertEqual(semaphore.snapshot(), {
        policy: "fifo",
        permits: 3,
        taken: 2,
        waiters: [{ permits: 2 }, { permits: 1 }],
        available: 0,
        isIdle: false,
      });
      assertEqual(events, ["larger requesting", "smaller requesting"]);

      // Re-drive the queue without changing capacity; FIFO must still not let
      // the smaller waiter bypass the older larger waiter.
      semaphore.resize(3);

      assertEqual(semaphore.snapshot(), {
        policy: "fifo",
        permits: 3,
        taken: 2,
        waiters: [{ permits: 2 }, { permits: 1 }],
        available: 0,
        isIdle: false,
      });

      firstPermit.release();

      assertEqual(await largerFiber, ok());
      assertEqual(await smallerFiber, ok());
      assertEqual(events, [
        "larger requesting",
        "smaller requesting",
        "larger acquired 2",
        "smaller acquired 1",
      ]);
    });

    it("greedy policy grants compatible waiters before earlier blocked waiters", async () => {
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

      assertEqual(semaphore.snapshot(), {
        policy: "greedy",
        permits: 3,
        taken: 2,
        waiters: [{ permits: 2 }],
        available: 1,
        isIdle: false,
      });

      const smallerFiber = run(async (run) => {
        events.push("smaller requesting");
        using permit = await run.ok(semaphore.take(1));
        events.push(`smaller acquired ${permit.permits}`);
        return ok();
      });

      assertEqual(await smallerFiber, ok());
      assertEqual(events, [
        "larger requesting",
        "smaller requesting",
        "smaller acquired 1",
      ]);

      firstPermit.release();

      assertEqual(await largerFiber, ok());
      assertEqual(events, [
        "larger requesting",
        "smaller requesting",
        "smaller acquired 1",
        "larger acquired 2",
      ]);
    });

    it("greedy release grants later compatible queued waiter", async () => {
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

      assertEqual(semaphore.snapshot(), {
        policy: "greedy",
        permits: 3,
        taken: 3,
        waiters: [{ permits: 2 }, { permits: 1 }],
        available: 0,
        isIdle: false,
      });

      secondPermit.release();

      assertEqual(await smallerFiber, ok());
      assertEqual(events, [
        "larger requesting",
        "smaller requesting",
        "smaller acquired 1",
      ]);
      assertEqual(semaphore.snapshot(), {
        policy: "greedy",
        permits: 3,
        taken: 2,
        waiters: [{ permits: 2 }],
        available: 1,
        isIdle: false,
      });

      firstPermit.release();

      assertEqual(await largerFiber, ok());
      assertEqual(events, [
        "larger requesting",
        "smaller requesting",
        "smaller acquired 1",
        "larger acquired 2",
      ]);
    });

    it("disposing a permit releases its permits", async () => {
      await using run = createRun();

      const semaphore = createSemaphore(2);

      {
        using _permit = await run.ok(semaphore.take(2));
        assertEqual(semaphore.snapshot(), {
          policy: "fifo",
          permits: 2,
          taken: 2,
          waiters: [],
          available: 0,
          isIdle: false,
        });
      }

      assertEqual(semaphore.snapshot(), {
        policy: "fifo",
        permits: 2,
        taken: 0,
        waiters: [],
        available: 2,
        isIdle: true,
      });
    });

    it("permit release is idempotent", async () => {
      await using run = createRun();

      const semaphore = createSemaphore(1);
      const permit = await run.ok(semaphore.take(1));

      assertTrue(permit.release());
      assertFalse(permit.release());
      assertEqual(semaphore.snapshot(), {
        policy: "fifo",
        permits: 1,
        taken: 0,
        waiters: [],
        available: 1,
        isIdle: true,
      });
    });

    it("aborting a waiter removes it from the queue", async () => {
      await using run = createRun();

      const semaphore = createSemaphore(1);

      using _permit = await run.ok(semaphore.take(1));

      const waiterFiber = run.abortable(semaphore.take(1));

      assertEqual(semaphore.snapshot(), {
        policy: "fifo",
        permits: 1,
        taken: 1,
        waiters: [{ permits: 1 }],
        available: 0,
        isIdle: false,
      });

      waiterFiber.abort(testAbortReason);

      assertEqual(await waiterFiber, err(testAbortError));
      assertEqual(semaphore.snapshot(), {
        policy: "fifo",
        permits: 1,
        taken: 1,
        waiters: [],
        available: 0,
        isIdle: false,
      });
    });

    it("aborting FIFO head releases later compatible waiter", async () => {
      await using run = createRun();

      const semaphore = createSemaphore(3);

      using firstPermit = await run.ok(semaphore.take(2));

      const largerFiber = run.abortable(semaphore.take(2));
      const smallerFiber = run(async (run) => {
        using permit = await run.ok(semaphore.take(1));
        return ok(permit.permits);
      });

      assertEqual(semaphore.snapshot(), {
        policy: "fifo",
        permits: 3,
        taken: 2,
        waiters: [{ permits: 2 }, { permits: 1 }],
        available: 0,
        isIdle: false,
      });

      largerFiber.abort(testAbortReason);

      assertEqual(await largerFiber, err(testAbortError));
      assertEqual(await smallerFiber, ok(1));
      assertEqual(semaphore.snapshot(), {
        policy: "fifo",
        permits: 3,
        taken: 2,
        waiters: [],
        available: 1,
        isIdle: false,
      });

      firstPermit.release();
    });

    it("aborting one waiter does not affect other waiters", async () => {
      await using run = createRun();

      const semaphore = createSemaphore(1);

      using firstPermit = await run.ok(semaphore.take(1));

      const firstWaiterFiber = run.abortable(semaphore.take(1));
      const secondWaiterFiber = run(async (run) => {
        using permit = await run.ok(semaphore.take(1));
        return ok(permit.permits);
      });

      assertEqual(semaphore.snapshot(), {
        policy: "fifo",
        permits: 1,
        taken: 1,
        waiters: [{ permits: 1 }, { permits: 1 }],
        available: 0,
        isIdle: false,
      });

      firstWaiterFiber.abort(testAbortReason);

      assertEqual(await firstWaiterFiber, err(testAbortError));
      assertEqual(semaphore.snapshot(), {
        policy: "fifo",
        permits: 1,
        taken: 1,
        waiters: [{ permits: 1 }],
        available: 0,
        isIdle: false,
      });

      firstPermit.release();

      assertEqual(await secondWaiterFiber, ok(1));
      assertEqual(semaphore.snapshot(), {
        policy: "fifo",
        permits: 1,
        taken: 0,
        waiters: [],
        available: 1,
        isIdle: true,
      });
    });
  });

  describe("resize", () => {
    it("asserts positive permit count at runtime", () => {
      const semaphore = createSemaphore(1);
      const permits = 0 as unknown as Int1To100OrPositiveInt;

      assertThrowsInstanceOf(() => semaphore.resize(permits), Error);
    });

    it("resize increases capacity and releases waiting Tasks", async () => {
      await using run = createRun();

      const semaphore = createSemaphore(1);
      const events: Array<string> = [];

      const fiber = run(async (run) => {
        events.push("waiting");
        using permit = await run.ok(semaphore.take(2));
        events.push(`acquired ${permit.permits}`);
        return ok();
      });

      assertEqual(semaphore.snapshot(), {
        policy: "fifo",
        permits: 1,
        taken: 0,
        waiters: [{ permits: 2 }],
        available: 0,
        isIdle: false,
      });
      assertEqual(events, ["waiting"]);

      semaphore.resize(2);

      assertEqual(await fiber, ok());
      assertEqual(events, ["waiting", "acquired 2"]);
      assertEqual(semaphore.snapshot(), {
        policy: "fifo",
        permits: 2,
        taken: 0,
        waiters: [],
        available: 2,
        isIdle: true,
      });
    });

    it("resize decreases capacity without releasing held permits", async () => {
      await using run = createRun();

      const semaphore = createSemaphore(2);

      using permit = await run.ok(semaphore.take(2));

      semaphore.resize(1);

      assertEqual(semaphore.snapshot(), {
        policy: "fifo",
        permits: 1,
        taken: 2,
        waiters: [],
        available: 0,
        isIdle: false,
      });

      permit.release();

      assertEqual(semaphore.snapshot(), {
        policy: "fifo",
        permits: 1,
        taken: 0,
        waiters: [],
        available: 1,
        isIdle: true,
      });
    });
  });

  describe("snapshot", () => {
    it("reports available, taken, waiters, and idle state", async () => {
      await using run = createRun();

      const semaphore = createSemaphore(2);

      assertEqual(semaphore.snapshot(), {
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

      assertEqual(semaphore.snapshot(), {
        policy: "fifo",
        permits: 2,
        taken: 1,
        waiters: [{ permits: 2 }],
        available: 0,
        isIdle: false,
      });

      firstPermit.release();

      assertEqual(await waiterFiber, ok());
      assertEqual(semaphore.snapshot(), {
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
    it("reports whether no permits are held and no requests are queued", async () => {
      await using run = createRun();

      const semaphore = createSemaphore(1);

      assertTrue(semaphore.isIdle());

      const firstPermit = await run.ok(semaphore.take(1));
      const waiterFiber = run.abortable(semaphore.take(1));

      assertFalse(semaphore.isIdle());

      waiterFiber.abort(testAbortReason);
      assertEqual(await waiterFiber, err(testAbortError));
      assertFalse(semaphore.isIdle());

      firstPermit.release();

      assertTrue(semaphore.isIdle());
    });
  });
});

describe("Mutex", () => {
  describe("withLock", () => {
    it("returns a Task preserving error and dependency types", () => {
      interface MyError {
        readonly type: "MyError";
      }

      const mutex = createMutex();
      const task: Task<string, MyError, DbDep> = () => ok("value");

      {
        const actual = mutex.withLock(task);
        assertType<typeof actual, Task<string, MyError, DbDep>>();
      }
    });

    it("runs one Task at a time", async () => {
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

      assertEqual(mutex.snapshot(), {
        policy: "fifo",
        permits: 1,
        taken: 1,
        waiters: [{ permits: 1 }],
        available: 0,
        isIdle: false,
      });
      assertEqual(events, ["first acquired"]);

      completeFirstTask.resolve();

      assertEqual(await firstFiber, ok("first"));
      assertEqual(await secondFiber, ok("second"));
      assertEqual(events, [
        "first acquired",
        "first completed",
        "second acquired",
      ]);
      assertEqual(mutex.snapshot(), {
        policy: "fifo",
        permits: 1,
        taken: 0,
        waiters: [],
        available: 1,
        isIdle: true,
      });
    });

    it("releases the lock after Err", async () => {
      await using run = createRun();

      const mutex = createMutex();

      const result = await run(
        mutex.withLock(() => {
          assertEqual(mutex.snapshot(), {
            policy: "fifo",
            permits: 1,
            taken: 1,
            waiters: [],
            available: 0,
            isIdle: false,
          });
          return err("error");
        }),
      );

      assertErr(result, "error");
      assertEqual(mutex.snapshot(), {
        policy: "fifo",
        permits: 1,
        taken: 0,
        waiters: [],
        available: 1,
        isIdle: true,
      });
      assertEqual(await run(mutex.withLock(() => ok("next"))), ok("next"));
    });

    it("releases the lock after abort", async () => {
      await using run = createRun();

      const mutex = createMutex();
      const taskStarted = Promise.withResolvers<void>();

      const fiber = run.abortable(
        mutex.withLock(async (run) => {
          assertEqual(mutex.snapshot(), {
            policy: "fifo",
            permits: 1,
            taken: 1,
            waiters: [],
            available: 0,
            isIdle: false,
          });
          taskStarted.resolve();
          await run.ok(
            callback(({ run: { signal } }) => {
              assertFalse(signal.aborted);
            }),
          );
          return ok();
        }),
      );

      await taskStarted.promise;
      fiber.abort(testAbortReason);

      assertEqual(await fiber, err(testAbortError));
      assertEqual(mutex.snapshot(), {
        policy: "fifo",
        permits: 1,
        taken: 0,
        waiters: [],
        available: 1,
        isIdle: true,
      });
      assertEqual(await run(mutex.withLock(() => ok("next"))), ok("next"));
    });
  });

  describe("snapshot", () => {
    it("reports the underlying semaphore state", async () => {
      await using run = createRun();

      const mutex = createMutex();

      assertEqual(mutex.snapshot(), {
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

      assertEqual(mutex.snapshot(), {
        policy: "fifo",
        permits: 1,
        taken: 1,
        waiters: [{ permits: 1 }],
        available: 0,
        isIdle: false,
      });

      completeFirstTask.resolve();

      assertEqual(await firstFiber, ok("first"));
      assertEqual(await secondFiber, ok("second"));
      assertEqual(mutex.snapshot(), {
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
  it("createSemaphoreByKey requires initial permits", () => {
    // @ts-expect-error - initial permits are required.
    createSemaphoreByKey<string>();
  });

  describe("withPermit", () => {
    it("serializes Tasks with the same key", async () => {
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

      assertEqual(events, ["first acquired"]);

      completeFirstTask.resolve();

      assertEqual(await firstFiber, ok("first"));
      assertEqual(await secondFiber, ok("second"));
      assertEqual(events, [
        "first acquired",
        "first completed",
        "second acquired",
      ]);
    });

    it("uses lookup to share permits for logically equal keys", async () => {
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

      assertEqual(semaphoreByKey.snapshot({ id: "shared" }), {
        policy: "fifo",
        permits: 1,
        taken: 1,
        waiters: [{ permits: 1 }],
        available: 0,
        isIdle: false,
      });
      assertEqual(events, ["first acquired"]);

      completeFirstTask.resolve();

      assertEqual(await firstFiber, ok("first"));
      assertEqual(await secondFiber, ok("second"));
      assertEqual(events, [
        "first acquired",
        "first completed",
        "second acquired",
      ]);
    });

    it("does not block Tasks with different keys", async () => {
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

      assertEqual(await secondFiber, ok("second"));
      assertEqual(events, ["first acquired", "second acquired"]);

      completeFirstTask.resolve();

      assertEqual(await firstFiber, ok("first"));
      assertEqual(events, [
        "first acquired",
        "second acquired",
        "first completed",
      ]);
    });
  });

  describe("withPermits", () => {
    it("runs the Task directly under the keyed wrapper Run", async () => {
      await using run = createRun();

      const semaphoreByKey = createSemaphoreByKey<string>(1);

      const fiber = run(
        semaphoreByKey.withPermits("key", 1)((taskRun) => ok(taskRun.parent)),
      );

      const result = await fiber;

      assertSame(result.ok && result.value, fiber.run);
    });

    it("withPermits uses the requested permits for the key", async () => {
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

      assertEqual(events, ["first acquired"]);

      completeFirstTask.resolve();

      assertEqual(await firstFiber, ok("first"));
      assertEqual(await secondFiber, ok("second"));
      assertEqual(events, [
        "first acquired",
        "first completed",
        "second acquired",
      ]);
    });
  });

  it("SemaphoreByKey isIdle reports whether a key has active permits or waiters", async () => {
    await using run = createRun();

    const semaphoreByKey = createSemaphoreByKey<string>(1);
    const firstTaskStarted = Promise.withResolvers<void>();
    const completeFirstTask = Promise.withResolvers<void>();

    assertTrue(semaphoreByKey.isIdle("key"));

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

    assertFalse(semaphoreByKey.isIdle("key"));

    completeFirstTask.resolve();

    assertEqual(await firstFiber, ok("first"));
    assertEqual(await secondFiber, ok("second"));
    assertTrue(semaphoreByKey.isIdle("key"));
  });

  describe("snapshot", () => {
    it("returns state for an active key and null after it becomes idle", async () => {
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

      assertEqual(semaphoreByKey.snapshot("key"), {
        policy: "fifo",
        permits: 1,
        taken: 1,
        waiters: [],
        available: 0,
        isIdle: false,
      });

      completeTask.resolve();

      assertEqual(await fiber, ok("value"));
      assertSame(semaphoreByKey.snapshot("key"), null);
    });

    it("removes key after Err", async () => {
      await using run = createRun();

      const semaphoreByKey = createSemaphoreByKey<string>(1);

      const result = await run(
        semaphoreByKey.withPermit("key", () => err("error")),
      );

      assertErr(result, "error");
      assertSame(semaphoreByKey.snapshot("key"), null);
    });

    it("removes key after defect", async () => {
      await using run = testCreateRun();

      const semaphoreByKey = createSemaphoreByKey<string>(1);
      const defect = new Error("boom");

      await assertRejects(
        run(
          semaphoreByKey.withPermit("key", () => {
            throw defect;
          }),
        ),
        panic(defect),
      );

      assertSame(semaphoreByKey.snapshot("key"), null);
      assertEqual(await run.deps.reportDefect.next(), panic(defect));
    });

    it("removes key after abort while holding permit", async () => {
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

      assertEqual(await fiber, err(testAbortError));
      assertSame(semaphoreByKey.snapshot("key"), null);
    });

    it("removes key after queued waiter is aborted", async () => {
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

      assertEqual(semaphoreByKey.snapshot("key"), {
        policy: "fifo",
        permits: 1,
        taken: 1,
        waiters: [{ permits: 1 }],
        available: 0,
        isIdle: false,
      });

      secondFiber.abort(testAbortReason);
      assertEqual(await secondFiber, err(testAbortError));
      assertFalse(secondTaskStarted);
      assertEqual(semaphoreByKey.snapshot("key"), {
        policy: "fifo",
        permits: 1,
        taken: 1,
        waiters: [],
        available: 0,
        isIdle: false,
      });

      completeFirstTask.resolve();

      assertEqual(await firstFiber, ok("first"));
      assertSame(semaphoreByKey.snapshot("key"), null);
    });
  });
});

describe("MutexByKey", () => {
  describe("withLock", () => {
    it("serializes Tasks with the same key", async () => {
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

      assertEqual(events, ["first acquired"]);

      completeFirstTask.resolve();

      assertEqual(await firstFiber, ok("first"));
      assertEqual(await secondFiber, ok("second"));
      assertEqual(events, [
        "first acquired",
        "first completed",
        "second acquired",
      ]);
    });

    it("uses lookup to share locks for logically equal keys", async () => {
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

      assertEqual(mutexByKey.snapshot({ id: "shared" }), {
        policy: "fifo",
        permits: 1,
        taken: 1,
        waiters: [{ permits: 1 }],
        available: 0,
        isIdle: false,
      });
      assertEqual(events, ["first acquired"]);

      completeFirstTask.resolve();

      assertEqual(await firstFiber, ok("first"));
      assertEqual(await secondFiber, ok("second"));
      assertEqual(events, [
        "first acquired",
        "first completed",
        "second acquired",
      ]);
    });

    it("does not block Tasks with different keys", async () => {
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

      assertEqual(await secondFiber, ok("second"));
      assertEqual(events, ["first acquired", "second acquired"]);

      completeFirstTask.resolve();

      assertEqual(await firstFiber, ok("first"));
      assertEqual(events, [
        "first acquired",
        "second acquired",
        "first completed",
      ]);
    });
  });

  it("isIdle reports whether a key is locked or queued", async () => {
    await using run = createRun();

    const mutexByKey = createMutexByKey<string>();
    const firstTaskStarted = Promise.withResolvers<void>();
    const completeFirstTask = Promise.withResolvers<void>();

    assertTrue(mutexByKey.isIdle("key"));

    const firstFiber = run(
      mutexByKey.withLock("key", async () => {
        firstTaskStarted.resolve();
        await completeFirstTask.promise;
        return ok("first");
      }),
    );

    await firstTaskStarted.promise;

    const secondFiber = run(mutexByKey.withLock("key", () => ok("second")));

    assertFalse(mutexByKey.isIdle("key"));

    completeFirstTask.resolve();

    assertEqual(await firstFiber, ok("first"));
    assertEqual(await secondFiber, ok("second"));
    assertTrue(mutexByKey.isIdle("key"));
  });

  describe("snapshot", () => {
    it("returns state for an active key and null after it becomes idle", async () => {
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

      assertEqual(mutexByKey.snapshot("key"), {
        policy: "fifo",
        permits: 1,
        taken: 1,
        waiters: [],
        available: 0,
        isIdle: false,
      });

      completeTask.resolve();

      assertEqual(await fiber, ok("value"));
      assertSame(mutexByKey.snapshot("key"), null);
    });
  });
});

describe("MutexRef", () => {
  it("get returns the current value", async () => {
    await using run = testCreateRun();
    const ref = createMutexRef(42);

    assertEqual(await run.ok(ref.get), 42);
  });

  it("set updates the value", async () => {
    await using run = testCreateRun();
    const ref = createMutexRef(0);

    await run.ok(ref.set(1));

    assertEqual(await run.ok(ref.get), 1);
  });

  it("getAndSet returns the previous value and updates the value", async () => {
    await using run = testCreateRun();
    const ref = createMutexRef(1);

    assertEqual(await run.ok(ref.getAndSet(2)), 1);
    assertEqual(await run.ok(ref.get), 2);
  });

  it("setAndGet returns the updated value", async () => {
    await using run = testCreateRun();
    const ref = createMutexRef(1);

    assertEqual(await run.ok(ref.setAndGet(2)), 2);
    assertEqual(await run.ok(ref.get), 2);
  });

  it("update applies a Task updater", async () => {
    await using run = testCreateRun();
    const ref = createMutexRef(1);

    await run.ok(ref.update((n) => () => ok(n + 1)));

    assertEqual(await run.ok(ref.get), 2);
  });

  it("getAndUpdate returns the previous value and updates the value", async () => {
    await using run = testCreateRun();
    const ref = createMutexRef(1);

    assertEqual(await run.ok(ref.getAndUpdate((n) => () => ok(n + 1))), 1);
    assertEqual(await run.ok(ref.get), 2);
  });

  it("updateAndGet returns the updated value", async () => {
    await using run = testCreateRun();
    const ref = createMutexRef(1);

    assertEqual(await run.ok(ref.updateAndGet((n) => () => ok(n + 1))), 2);
    assertEqual(await run.ok(ref.get), 2);
  });

  it("modify returns a computed result and updates the value", async () => {
    await using run = testCreateRun();
    const ref = createMutexRef(0);

    const result = await run.ok(
      ref.modify((n) => () => ok([`was:${n}`, n + 1] as const)),
    );

    assertEqual(result, "was:0");
    assertEqual(await run.ok(ref.get), 1);
  });

  it("serializes concurrent updates", async () => {
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

    assertEqual(await first, ok());
    assertEqual(await second, ok());

    // A lost update would read [0, 0]; the mutex serializes the transitions.
    assertEqual(reads, [0, 1]);
    assertEqual(await run.ok(ref.get), 2);
  });

  it("a failed updater preserves the previous value", async () => {
    await using run = testCreateRun();
    const ref = createMutexRef(1);
    const testError = { type: "TestError" } as const;
    const fail = () => () => err(testError);

    assertEqual(await run(ref.update(fail)), err(testError));
    assertEqual(await run(ref.getAndUpdate(fail)), err(testError));
    assertEqual(await run(ref.updateAndGet(fail)), err(testError));
    assertEqual(await run(ref.modify(fail)), err(testError));

    assertEqual(await run.ok(ref.get), 1);
  });

  it("an aborted updater preserves the previous value", async () => {
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

    assertErr(result);
    assertEqual(await run.ok(ref.get), 0);
  });

  it("snapshot reports lock state", async () => {
    await using run = testCreateRun();
    const gate = createGate();
    const ref = createMutexRef(0);
    const started = Promise.withResolvers<void>();

    assertTrue(ref.snapshot().isIdle);

    const fiber = run(
      ref.update((current) => async (run) => {
        started.resolve();
        const opened = await run(gate.wait);
        if (!opened.ok) return opened;
        return ok(current + 1);
      }),
    );
    await started.promise;

    assertEqual(ref.snapshot(), {
      policy: "fifo",
      permits: 1,
      taken: 1,
      waiters: [],
      available: 0,
      isIdle: false,
    });

    gate.open();

    assertEqual(await fiber, ok());
    assertTrue(ref.snapshot().isIdle);
  });

  it("types: operations infer error and deps from the updater", () => {
    interface TestDep {
      readonly value: string;
    }
    interface TestError {
      readonly type: "TestError";
    }

    const ref = createMutexRef(0);

    assertType<typeof ref.get, Task<number>>();
    {
      const actual = ref.set(1);
      assertType<typeof actual, Task<void>>();
    }
    {
      const actual = ref.getAndSet(1);
      assertType<typeof actual, Task<number>>();
    }
    {
      const actual = ref.setAndGet(1);
      assertType<typeof actual, Task<number>>();
    }

    {
      const actual = ref.update(
        (n) => (() => ok(n)) as Task<number, TestError, TestDep>,
      );
      assertType<typeof actual, Task<void, TestError, TestDep>>();
    }

    {
      const actual = ref.modify(
        (n) =>
          (() => ok(["r", n] as const)) as Task<
            readonly [string, number],
            TestError,
            TestDep
          >,
      );
      assertType<typeof actual, Task<string, TestError, TestDep>>();
    }
  });
});
