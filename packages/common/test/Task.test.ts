import { assert, describe, expect, expectTypeOf, test } from "vitest";
import {
  emptyArray,
  isNonEmptyArray,
  type NonEmptyReadonlyArray,
} from "../src/Array.js";
import { testCreateConsole } from "../src/Console.js";
import { exhaustiveCheck, lazyVoid } from "../src/Function.js";
import { emptyRecord } from "../src/Object.js";
import { testCreateRandom } from "../src/Random.js";
import { createRef } from "../src/Ref.js";
import type { Done, Result } from "../src/Result.js";
import { done, err, ok, tryAsync } from "../src/Result.js";
import {
  exponential,
  fixed,
  spaced,
  take,
  whileScheduleInput,
} from "../src/Schedule.js";
import type {
  Fiber,
  FiberState,
  InferFiberErr,
  InferFiberOk,
  InferTaskDone,
  InferTaskErr,
  InferTaskOk,
  NextTask,
  RetryError,
  Runner,
  RunnerConfigDep,
  RunnerDeps,
  Task,
} from "../src/Task.js";
import {
  AbortError,
  all,
  AllAbortError,
  allSettled,
  AllSettledAbortError,
  any,
  AnyAbortError,
  AsyncDisposableStack,
  createDeferred,
  createGate,
  createMutex,
  createRunner,
  createSemaphore,
  deferredDisposedError,
  DeferredDisposedError,
  map,
  MapAbortError,
  mapSettled,
  race,
  RaceLostError,
  repeat,
  retry,
  runnerClosingError,
  RunnerEvent,
  sleep,
  timeout,
  TimeoutError,
  unabortable,
  unabortableMask,
  withConcurrency,
  yieldNow,
} from "../src/Task.js";
import { createTestDeps, createTestRunner } from "../src/Test.js";
import { createTime, Millis, msLongTask, testCreateTime } from "../src/Time.js";
import type { Typed } from "../src/Type.js";
import { Id, minPositiveInt, PositiveInt } from "../src/Type.js";

const eventsEnabled: RunnerConfigDep = {
  runnerConfig: { eventsEnabled: createRef(true) },
};

interface MyError extends Typed<"MyError"> {}

describe("Task", () => {
  test("InferTaskOk and InferTaskErr extract type parameters", () => {
    type MyTask = Task<string, MyError>;
    expectTypeOf<InferTaskOk<MyTask>>().toEqualTypeOf<string>();

    type MyTask2 = Task<void, MyError>;
    expectTypeOf<InferTaskErr<MyTask2>>().toEqualTypeOf<MyError>();

    // Handles void Task
    type VoidTask = Task<void, Error>;
    expectTypeOf<InferTaskOk<VoidTask>>().toEqualTypeOf<void>();
    expectTypeOf<InferTaskErr<VoidTask>>().toEqualTypeOf<Error>();
  });
});

describe("NextTask", () => {
  test("InferTaskDone extracts done type", () => {
    type MyNextTask = NextTask<number, MyError, string>;
    expectTypeOf<InferTaskDone<MyNextTask>>().toEqualTypeOf<string>();

    // void done type
    type VoidDone = NextTask<number>;
    expectTypeOf<InferTaskDone<VoidDone>>().toEqualTypeOf<void>();

    // Regular Task has never as done type
    type RegularTask = Task<number, MyError>;
    expectTypeOf<InferTaskDone<RegularTask>>().toEqualTypeOf<never>();
  });

  test("models three outcomes: value, done, error", async () => {
    await using run = createRunner();

    const valueTask: NextTask<number, MyError, string> = () => ok(42);
    const doneTask: NextTask<number, MyError> = () => err(done());
    const errorTask: NextTask<number, MyError, string> = () =>
      err({ type: "MyError" });

    const valueResult = await run(valueTask);
    const doneResult = await run(doneTask);
    const errorResult = await run(errorTask);

    expect(valueResult).toEqual(ok(42));
    expect(doneResult).toEqual(err({ type: "Done", done: undefined }));
    expect(errorResult).toEqual(err({ type: "MyError" }));
  });

  test("type narrows correctly in pattern matching", async () => {
    await using run = createRunner();

    const task: NextTask<number, MyError, string> = () =>
      err({ type: "Done", done: "summary" });

    const result = await run(task);

    if (result.ok) {
      expectTypeOf(result.value).toEqualTypeOf<number>();
      return;
    }

    switch (result.error.type) {
      case "Done":
        expectTypeOf(result.error).toEqualTypeOf<Done<string>>();
        expect(result.error.done).toBe("summary");
        break;
      case "MyError":
        expectTypeOf(result.error).toEqualTypeOf<MyError>();
        break;
      case "AbortError":
        expectTypeOf(result.error).toEqualTypeOf<AbortError>();
        break;
      default:
        exhaustiveCheck(result.error);
    }
  });

  test("simulates iterator pattern with pull-based protocol", async () => {
    await using run = createRunner();

    const items = [1, 2, 3];
    let index = 0;

    const next: NextTask<number> = () => {
      if (index >= items.length) return err({ type: "Done", done: undefined });
      return ok(items[index++]);
    };

    const collected: Array<number> = [];

    for (;;) {
      const result = await run(next);
      if (!result.ok) {
        if (result.error.type === "Done") break;
        // Handle other errors if any
        return result;
      }
      collected.push(result.value);
    }

    expect(collected).toEqual([1, 2, 3]);
  });
});

describe("Runner", () => {
  describe("run", () => {
    test("executes task and returns result", async () => {
      await using run = createRunner();

      const task: Task<string> = () => ok("hello");

      const result = await run(task);

      expect(result).toEqual(ok("hello"));
    });
  });

  describe("error handling", () => {
    test("synchronous throw does not leak fiber", async () => {
      await using run = createRunner();

      const syncThrowingTask = () => {
        throw new Error("sync throw");
      };

      expect(run.getChildren().size).toBe(0);

      const fiber = run(syncThrowingTask);

      expect(run.getChildren().size).toBe(1);

      await expect(fiber).rejects.toThrow("sync throw");

      expect(run.getChildren().size).toBe(0);
    });

    test("rejected promise does not leak fiber", async () => {
      await using run = createRunner();

      const rejectingTask = () => Promise.reject(new Error("rejected"));

      expect(run.getChildren().size).toBe(0);

      const fiber = run(rejectingTask);

      expect(run.getChildren().size).toBe(1);

      await expect(fiber).rejects.toThrow("rejected");

      expect(run.getChildren().size).toBe(0);
    });
  });

  describe("deps", () => {
    test("exposes injected time", async () => {
      const time = testCreateTime();
      await using run = createTestRunner({ time });

      expect(run.time).toBe(time);
    });

    test("exposes injected console", async () => {
      const console = testCreateConsole();
      await using run = createTestRunner({ console });

      expect(run.console).toBe(console);
    });

    test("exposes injected random", async () => {
      const random = testCreateRandom();
      await using run = createTestRunner({ random });

      expect(run.random).toBe(random);
    });

    test("exposes injected randomBytes", async () => {
      const deps = createTestDeps();
      await using run = createTestRunner(deps);

      expect(run.randomBytes).toBe(deps.randomBytes);
    });
  });

  describe("onEvent", () => {
    test("emits childAdded when child is added", async () => {
      const deps = createTestDeps();
      await using run = createTestRunner({ ...deps, ...eventsEnabled });

      const events: Array<RunnerEvent> = [];
      const taskComplete = Promise.withResolvers<Result<void>>();

      run.onEvent = (event) => {
        events.push(event);
      };

      const fiber = run(() => taskComplete.promise);

      const childAddedEvents = events.filter(
        (e) => e.data.type === "childAdded",
      );
      expect(childAddedEvents.length).toBe(1);
      expect(childAddedEvents[0].id).toBe(run.id);
      assert(childAddedEvents[0].data.type === "childAdded");
      expect(childAddedEvents[0].data.childId).toBe(fiber.run.id);

      taskComplete.resolve(ok());
      await fiber;
    });

    test("emits completing, completed, childRemoved when child completes", async () => {
      await using run = createTestRunner(eventsEnabled);

      const events: Array<RunnerEvent> = [];
      const taskComplete = Promise.withResolvers<Result<void>>();

      const fiber = run(() => taskComplete.promise);

      run.onEvent = (event) => {
        events.push(event);
      };

      taskComplete.resolve(ok());
      await fiber;

      expect(events.map((e) => e.data.type)).toEqual([
        "stateChanged",
        "stateChanged",
        "childRemoved",
      ]);

      const [completing, completed, childRemoved] = events;

      assert(completing.data.type === "stateChanged");
      expect(completing.data.state.type).toBe("completing");

      assert(completed.data.type === "stateChanged");
      expect(completed.data.state.type).toBe("completed");
      assert(completed.data.state.type === "completed");
      expect(completed.data.state.result).toEqual(ok());
      expect(completed.data.state.outcome).toEqual(ok());

      assert(childRemoved.data.type === "childRemoved");
      expect(childRemoved.data.childId).toBe(fiber.run.id);
    });

    test("bubbles up through parent chain", async () => {
      await using run = createTestRunner(eventsEnabled);

      const events: Array<{ level: string; event: RunnerEvent }> = [];

      run.onEvent = (event) => {
        events.push({ level: "root", event });
      };

      const taskComplete = Promise.withResolvers<Result<void>>();

      const fiber = run(async (parentRun) => {
        parentRun.onEvent = (event) => {
          events.push({ level: "parent", event });
        };

        const childFiber = parentRun(async (childRun) => {
          childRun.onEvent = (event) => {
            events.push({ level: "child", event });
          };

          // Start a grandchild
          const grandchildComplete = Promise.withResolvers<Result<void>>();
          const grandchild = childRun(() => grandchildComplete.promise);
          grandchildComplete.resolve(ok());
          await grandchild;

          return ok();
        });

        await childFiber;
        await taskComplete.promise;
        return ok();
      });

      taskComplete.resolve(ok());
      await fiber;

      // Each level should have received events
      expect(events.filter((e) => e.level === "root").length).toBeGreaterThan(
        0,
      );
      expect(events.filter((e) => e.level === "parent").length).toBeGreaterThan(
        0,
      );
      expect(events.filter((e) => e.level === "child").length).toBeGreaterThan(
        0,
      );
    });

    test("not emitted when eventsEnabled is false", async () => {
      await using run = createRunner(); // Events disabled by default

      const events: Array<RunnerEvent> = [];

      run.onEvent = (event) => {
        events.push(event);
      };

      const fiber = run(() => Promise.resolve(ok()));
      await fiber;

      expect(events.length).toBe(0);
    });
  });

  describe("snapshot", () => {
    test("returns same reference when nothing changes", async () => {
      await using run = createRunner();

      const snapshot1 = run.snapshot();
      const snapshot2 = run.snapshot();

      expect(snapshot1).toBe(snapshot2);
    });

    test("returns new reference when children change", async () => {
      await using run = createRunner();

      const taskComplete = Promise.withResolvers<Result<void>>();

      const task = () => taskComplete.promise;

      const before = run.snapshot();
      expect(before.children.length).toBe(0);

      const fiber = run(task);

      const during = run.snapshot();
      expect(during.children.length).toBe(1);
      expect(during).not.toBe(before);

      taskComplete.resolve(ok());
      await fiber;

      const after = run.snapshot();
      expect(after.children.length).toBe(0);
      expect(after).not.toBe(during);
    });

    test("preserves child snapshot references when sibling changes", async () => {
      await using run = createRunner();

      const task1Complete = Promise.withResolvers<Result<void>>();
      const task2Complete = Promise.withResolvers<Result<void>>();

      const fiber1 = run(() => task1Complete.promise);
      const fiber2 = run(() => task2Complete.promise);

      const snapshot1 = run.snapshot();
      const child1Snapshot1 = snapshot1.children[0];

      // Complete fiber2, which changes parent's children array
      task2Complete.resolve(ok());
      await fiber2;

      const snapshot2 = run.snapshot();
      const child1Snapshot2 = snapshot2.children[0];

      // Parent snapshot changed (different children count)
      expect(snapshot2).not.toBe(snapshot1);
      expect(snapshot2.children.length).toBe(1);

      // But fiber1's snapshot is unchanged, same reference
      expect(child1Snapshot2).toBe(child1Snapshot1);

      task1Complete.resolve(ok());
      await fiber1;
    });

    test("structural sharing during rapid concurrent completions", async () => {
      await using run = createRunner();

      const taskCompletes: Array<PromiseWithResolvers<Result<number>>> = [];

      // Start 5 concurrent fibers
      const fibers = Array.from({ length: 5 }, () => {
        const taskComplete = Promise.withResolvers<Result<number>>();
        taskCompletes.push(taskComplete);
        return run(() => taskComplete.promise);
      });

      const initialSnapshot = run.snapshot();
      expect(initialSnapshot.children.length).toBe(5);

      // Complete fibers 0, 2, 4 simultaneously
      taskCompletes[0].resolve(ok(0));
      taskCompletes[2].resolve(ok(2));
      taskCompletes[4].resolve(ok(4));
      await Promise.all([fibers[0], fibers[2], fibers[4]]);

      const midSnapshot = run.snapshot();
      expect(midSnapshot.children.length).toBe(2);

      // Remaining fibers (1, 3) should have same snapshot references
      const fiber1Snap = midSnapshot.children.find(
        (c) => c.id === fibers[1].run.id,
      );
      const fiber3Snap = midSnapshot.children.find(
        (c) => c.id === fibers[3].run.id,
      );
      expect(fiber1Snap).toBeDefined();
      expect(fiber3Snap).toBeDefined();

      // Complete remaining
      taskCompletes[1].resolve(ok(1));
      taskCompletes[3].resolve(ok(3));
      await Promise.all([fibers[1], fibers[3]]);

      const finalSnapshot = run.snapshot();
      expect(finalSnapshot.children.length).toBe(0);
    });
  });

  describe("defer", () => {
    test("runs task when disposed", async () => {
      await using run = createRunner();

      const events: Array<string> = [];

      const cleanup = () => {
        events.push("cleanup");
        return ok();
      };

      const task: Task<void> = async (run) => {
        await using _ = run.defer(cleanup);

        events.push("work");
        return ok();
      };

      const result = await run(task);

      expect(result).toEqual(ok());
      expect(events).toEqual(["work", "cleanup"]);
    });

    test("is unabortable", async () => {
      await using run = createRunner();

      const events: Array<string> = [];
      const taskStarted = Promise.withResolvers<void>();
      const canComplete = Promise.withResolvers<void>();

      const cleanup = () => {
        events.push("cleanup");
        return ok();
      };

      const task: Task<void, AbortError> = async (run) => {
        await using _ = run.defer(cleanup);
        events.push("work started");
        taskStarted.resolve();
        await canComplete.promise;
        if (run.signal.aborted) {
          return err(run.signal.reason);
        }
        return ok();
      };

      const fiber = run(task);
      await taskStarted.promise;
      fiber.abort("stop");
      canComplete.resolve();

      const result = await fiber;

      expect(result).toEqual(err({ type: "AbortError", reason: "stop" }));
      expect(events).toEqual(["work started", "cleanup"]);
    });
  });

  describe("dispose", () => {
    test("aborts all running fibers", async () => {
      const results: Array<string> = [];

      {
        await using run = createRunner();

        const makeTask =
          (id: string): Task<string> =>
          async ({ signal }) => {
            const taskComplete =
              Promise.withResolvers<Result<string, AbortError>>();

            const timeout = setTimeout(() => {
              results.push(`${id} completed`);
              taskComplete.resolve(ok(id));
            }, 1000);

            signal.addEventListener(
              "abort",
              () => {
                clearTimeout(timeout);
                results.push(`${id} aborted`);
                taskComplete.resolve(err(signal.reason));
              },
              { once: true },
            );

            return await taskComplete.promise;
          };

        run(makeTask("task1"));
        run(makeTask("task2"));
      }
      // runner disposed here

      expect(results).toEqual(["task1 aborted", "task2 aborted"]);
    });

    test("transitions running → completing → completed", async () => {
      const run = createRunner();

      expectTypeOf(run.getState()).toEqualTypeOf<FiberState>();
      expect(run.getState().type).toBe("running");

      const taskStarted = Promise.withResolvers<void>();
      const taskCanFinish = Promise.withResolvers<void>();

      let stateInAbortHandler: FiberState | undefined;
      let stateAfterAwait: FiberState | undefined;

      const task: Task<void> = async (run) => {
        run.signal.addEventListener("abort", () => {
          stateInAbortHandler = run.parent!.getState();
        });
        taskStarted.resolve();
        await taskCanFinish.promise;
        stateAfterAwait = run.parent!.getState();
        return ok();
      };

      run(task);
      await taskStarted.promise;

      const disposePromise = run[Symbol.asyncDispose]();
      expect(run.getState().type).toBe("completing");

      taskCanFinish.resolve();
      await disposePromise;

      expect(stateInAbortHandler!.type).toBe("completing");
      expect(stateAfterAwait!.type).toBe("completing");
      expect(run.getState().type).toBe("completed");
    });

    test("defaults completed result and outcome to ok", async () => {
      const run = createRunner();

      await run[Symbol.asyncDispose]();

      const state = run.getState();
      expect(state).toEqual({
        type: "completed",
        result: ok(),
        outcome: ok(),
      });
    });

    test("is idempotent", async () => {
      await using run = createRunner();

      const promise1 = run[Symbol.asyncDispose]();
      const promise2 = run[Symbol.asyncDispose]();

      expect(promise1).toBe(promise2);
    });

    test("does not run new tasks when completing", async () => {
      const run = createRunner();
      run[Symbol.asyncDispose]();

      expect(run.getState().type).toBe("completing");

      let regularRan = false;
      let unabortableRan = false;
      let unabortableMaskRan = false;

      const regularFiber = run(() => {
        regularRan = true;
        return ok();
      });
      const unabortableFiber = run(
        unabortable(() => {
          unabortableRan = true;
          return ok();
        }),
      );
      const unabortableMaskFiber = run(
        unabortableMask(() => () => {
          unabortableMaskRan = true;
          return ok();
        }),
      );

      const regularResult = await regularFiber;
      const unabortableResult = await unabortableFiber;
      const unabortableMaskResult = await unabortableMaskFiber;

      expect(regularRan).toBe(false);
      expect(unabortableRan).toBe(false);
      expect(unabortableMaskRan).toBe(false);

      expect(regularFiber.run.getState().type).toBe("completed");
      expect(unabortableFiber.run.getState().type).toBe("completed");
      expect(unabortableMaskFiber.run.getState().type).toBe("completed");

      const expected = err({ type: "AbortError", reason: runnerClosingError });
      expect(regularResult).toEqual(expected);
      expect(unabortableResult).toEqual(expected);
      expect(unabortableMaskResult).toEqual(expected);
    });

    test("does not run new tasks when completed", async () => {
      const run = createRunner();
      await run[Symbol.asyncDispose]();

      expect(run.getState().type).toBe("completed");

      let regularRan = false;
      let unabortableRan = false;
      let unabortableMaskRan = false;

      const regularFiber = run(() => {
        regularRan = true;
        return ok();
      });
      const unabortableFiber = run(
        unabortable(() => {
          unabortableRan = true;
          return ok();
        }),
      );
      const unabortableMaskFiber = run(
        unabortableMask(() => () => {
          unabortableMaskRan = true;
          return ok();
        }),
      );

      const regularResult = await regularFiber;
      const unabortableResult = await unabortableFiber;
      const unabortableMaskResult = await unabortableMaskFiber;

      expect(regularRan).toBe(false);
      expect(unabortableRan).toBe(false);
      expect(unabortableMaskRan).toBe(false);

      expect(regularFiber.run.getState().type).toBe("completed");
      expect(unabortableFiber.run.getState().type).toBe("completed");
      expect(unabortableMaskFiber.run.getState().type).toBe("completed");

      const expected = err({ type: "AbortError", reason: runnerClosingError });
      expect(regularResult).toEqual(expected);
      expect(unabortableResult).toEqual(expected);
      expect(unabortableMaskResult).toEqual(expected);
    });
  });

  describe("onAbort", () => {
    test("passes the abort reason directly, not wrapped in AbortError", async () => {
      await using run = createRunner();

      const receivedReason = Promise.withResolvers<unknown>();
      const taskStarted = Promise.withResolvers<void>();

      const fiber = run(async (childRun) => {
        childRun.onAbort((reason) => {
          receivedReason.resolve(reason);
        });

        taskStarted.resolve();

        await Promise.resolve();
        return ok();
      });

      await taskStarted.promise;
      fiber.abort("my-reason");

      const reason = await receivedReason.promise;

      expect(reason).toBe("my-reason");
    });

    test("receives undefined when aborted without reason", async () => {
      await using run = createRunner();

      const receivedReason = Promise.withResolvers<unknown>();
      const taskStarted = Promise.withResolvers<void>();

      const fiber = run(async (childRun) => {
        childRun.onAbort((reason) => {
          receivedReason.resolve(reason);
        });

        taskStarted.resolve();

        await Promise.resolve();
        return ok();
      });

      await taskStarted.promise;
      fiber.abort();

      const reason = await receivedReason.promise;

      expect(reason).toBeUndefined();
    });

    test("invokes callback immediately when already aborted", async () => {
      await using run = createRunner();

      const receivedReason = Promise.withResolvers<unknown>();
      const allowRegister = Promise.withResolvers<void>();

      const fiber = run(async (childRun) => {
        await allowRegister.promise;
        childRun.onAbort((reason) => {
          receivedReason.resolve(reason);
        });
        return ok();
      });

      fiber.abort("late-reason");
      allowRegister.resolve();

      const reason = await receivedReason.promise;
      expect(reason).toBe("late-reason");
    });

    test.sequential(
      "removes listener via signal option for cleanup",
      async () => {
        // This test verifies that onAbort uses `signal: requestController.signal`
        // for listener cleanup. Per spec, when the cleanup signal aborts, the
        // listener is removed. We capture the cleanup signal and verify it's
        // aborted after disposal.

        await using run = createRunner();

        let cleanupSignal: AbortSignal | null = null;
        // eslint-disable-next-line @typescript-eslint/unbound-method
        const originalAddEventListener = AbortSignal.prototype.addEventListener;

        let childSignal: AbortSignal | null = null;

        AbortSignal.prototype.addEventListener = function (
          ...args: Parameters<typeof originalAddEventListener>
        ) {
          const [type, , options] = args;
          if (
            type === "abort" &&
            this === childSignal &&
            options &&
            typeof options === "object" &&
            options.signal
          ) {
            cleanupSignal = options.signal;
          }
          originalAddEventListener.apply(this, args);
        };

        try {
          await run((childRun) => {
            childSignal = childRun.signal;
            childRun.onAbort(lazyVoid);
            return ok();
          });

          // Cleanup signal should exist and be aborted after disposal
          expect(cleanupSignal).not.toBeNull();
          expect(cleanupSignal!.aborted).toBe(true);
        } finally {
          AbortSignal.prototype.addEventListener = originalAddEventListener;
        }
      },
    );

    test.sequential(
      "removes parent abort listener via signal option for cleanup",
      async () => {
        // This test verifies that child runners use `signal: requestController.signal`
        // for parent abort listener cleanup. When a child completes, the listener
        // on parent.requestSignal should be removed automatically.

        await using run = createRunner();

        let cleanupSignal: AbortSignal | null = null;
        // eslint-disable-next-line @typescript-eslint/unbound-method
        const originalAddEventListener = AbortSignal.prototype.addEventListener;

        // We need to capture the parent's requestSignal to identify the right listener
        let parentRequestSignal: AbortSignal | null = null;

        AbortSignal.prototype.addEventListener = function (
          ...args: Parameters<typeof originalAddEventListener>
        ) {
          const [type, , options] = args;
          // The parent abort listener is registered on parent.requestSignal
          if (
            type === "abort" &&
            this === parentRequestSignal &&
            options &&
            typeof options === "object" &&
            options.signal
          ) {
            cleanupSignal = options.signal;
          }
          originalAddEventListener.apply(this, args);
        };

        try {
          // First, we need to get access to the parent's internal requestSignal
          // We do this by spawning a child that captures it
          await run((childRun) => {
            // The child registers a listener on parent.requestSignal
            // We can identify it by checking what signal addEventListener is called on
            // The parent's requestSignal is internal, but we can use a trick:
            // spawn another child and that child will register on childRun's requestSignal
            parentRequestSignal = (
              childRun as never as { requestSignal: AbortSignal }
            ).requestSignal;

            const childFiber = childRun(() => ok(42));
            return childFiber;
          });

          // Cleanup signal should exist and be aborted after child disposal
          expect(cleanupSignal).not.toBeNull();
          expect(cleanupSignal!.aborted).toBe(true);
        } finally {
          AbortSignal.prototype.addEventListener = originalAddEventListener;
        }
      },
    );
  });
});

describe("Fiber", () => {
  test("is awaitable", async () => {
    await using run = createRunner();

    const task: Task<number> = () => Promise.resolve(ok(42));
    const fiber = run(task);

    expectTypeOf(fiber).toEqualTypeOf<Fiber<number, never>>();

    const result = await fiber;

    expectTypeOf(result).toEqualTypeOf<Result<number, AbortError>>();
    expect(result).toEqual(ok(42));
  });

  describe("abort", () => {
    test("before run short-circuits child task", async () => {
      await using run = createRunner();

      let taskRan = false;
      let signalAbortedBeforeInnerRun = false;
      let innerFiberState: FiberState<void, never> | undefined;

      const fiber = run(async (run) => {
        await Promise.resolve();
        signalAbortedBeforeInnerRun = run.signal.aborted;

        const innerFiber = run(() => {
          taskRan = true;
          return ok();
        });

        await innerFiber;

        innerFiberState = innerFiber.getState();

        return ok();
      });

      fiber.abort("stop");
      const result = await fiber;

      expect(signalAbortedBeforeInnerRun).toBe(true);
      expect(taskRan).toBe(false);
      assert(innerFiberState?.type === "completed");
      expect(innerFiberState.result).toEqual(
        err({ type: "AbortError", reason: "stop" }),
      );
      expect(result).toEqual(err({ type: "AbortError", reason: "stop" }));
    });

    test("during run signals abort via AbortSignal", async () => {
      await using run = createRunner();

      let signalAbortedInHandler = false;

      const task: Task<void> = async ({ signal }) => {
        const taskComplete = Promise.withResolvers<Result<void, AbortError>>();

        const timeout = setTimeout(() => {
          taskComplete.resolve(ok());
        }, 1000);

        signal.addEventListener(
          "abort",
          () => {
            signalAbortedInHandler = signal.aborted;
            clearTimeout(timeout);
            taskComplete.resolve(err(signal.reason));
          },
          { once: true },
        );

        return await taskComplete.promise;
      };

      const fiber = run(task);
      fiber.abort("test abort");

      const result = await fiber;

      expect(signalAbortedInHandler).toBe(true);
      expect(result).toEqual(
        err({
          type: "AbortError",
          reason: "test abort",
        }),
      );
    });

    /**
     * Native APIs like fetch throw signal.reason when aborted. To properly
     * propagate the Task's AbortError and distinguish abort from other errors,
     * wrap the native API with tryAsync and check signal.aborted in the error
     * handler to return signal.reason (the AbortError) instead of wrapping it
     * as a domain error.
     */
    test("propagates to native APIs", async () => {
      interface FetchError extends Typed<"FetchError"> {
        readonly error: unknown;
      }

      const errorCapture = Promise.withResolvers<unknown>();

      const fetchTask =
        (url: string): Task<Response, FetchError> =>
        ({ signal }) =>
          tryAsync(
            () => fetch(url, { signal }),
            (error): FetchError | AbortError => {
              errorCapture.resolve(error);
              if (AbortError.is(error)) return error;
              return { type: "FetchError", error };
            },
          );

      await using run = createRunner();

      const fiber = run(fetchTask("https://example.com"));
      fiber.abort("cancelled");

      expect(await fiber).toEqual(
        err({
          type: "AbortError",
          reason: "cancelled",
        }),
      );

      expect(await errorCapture.promise).toEqual({
        type: "AbortError",
        reason: "cancelled",
      });
    });
  });

  describe("dispose", () => {
    test("aborts task via using", async () => {
      await using run = createRunner();

      const task: Task<void> = async ({ signal }) => {
        const taskComplete = Promise.withResolvers<Result<void, AbortError>>();

        const timeout = setTimeout(() => {
          taskComplete.resolve(ok());
        }, 1000);

        signal.addEventListener(
          "abort",
          () => {
            clearTimeout(timeout);
            taskComplete.resolve(err(signal.reason));
          },
          { once: true },
        );

        return await taskComplete.promise;
      };

      let fiber: Fiber<void>;
      {
        using f = run(task);
        fiber = f;
      }

      expect(await fiber).toEqual(
        err({
          type: "AbortError",
          cause: undefined,
        }),
      );
    });
  });

  test("getState returns running while running, completed with result after completion", async () => {
    await using run = createRunner();

    const taskComplete = Promise.withResolvers<Result<number, MyError>>();

    const fiber = run(() => taskComplete.promise);

    expect(fiber.getState().type).toBe("running");

    taskComplete.resolve(ok(42));
    await fiber;

    const state = fiber.getState();
    expectTypeOf(state).toEqualTypeOf<FiberState<number, MyError>>();
    assert(state.type === "completed");
    expect(state.result).toEqual(ok(42));
  });

  test("completed state outcome equals result when not aborted", async () => {
    await using run = createRunner();

    const taskComplete = Promise.withResolvers<Result<number, MyError>>();

    const fiber = run(() => taskComplete.promise);

    expect(fiber.getState().type).toBe("running");

    taskComplete.resolve(ok(42));
    await fiber;

    const state = fiber.getState();
    assert(state.type === "completed");
    expect(state.outcome).toEqual(state.result);
  });

  test("completed state outcome preserves original result when aborted", async () => {
    await using run = createRunner();

    const fiber = run(() => ok("data"));
    fiber.abort("stop");
    await fiber;

    const state = fiber.getState();
    assert(state.type === "completed");
    // result returns AbortError
    expect(state.result).toEqual(err({ type: "AbortError", reason: "stop" }));
    // outcome preserves what the task actually returned
    expect(state.outcome).toEqual(ok("data"));
  });

  describe("run", () => {
    test("id matches run.id inside task", async () => {
      await using run = createRunner();

      let parentFiberId: Id | null = null;
      let childFiber: Fiber<void> | null = null;
      let childFiberId: Id | null = null;

      const parentFiber = run(async (run) => {
        parentFiberId = run.id;

        childFiber = run(({ id }) => {
          childFiberId = id;
          return Promise.resolve(ok());
        });
        await childFiber;

        return ok();
      });

      await parentFiber;

      expect(parentFiberId).toBe(parentFiber.run.id);
      expect(childFiberId).toBe(childFiber!.run.id);
      expect(parentFiberId).not.toBe(childFiberId);
    });

    test("snapshot returns running state while running, completed with result after completion", async () => {
      await using run = createRunner();

      const taskComplete = Promise.withResolvers<Result<number>>();

      const fiber = run(() => taskComplete.promise);
      expect(fiber.run.snapshot().state.type).toBe("running");

      taskComplete.resolve(ok(42));
      await fiber;
      const snapshotState = fiber.run.snapshot().state;
      assert(snapshotState.type === "completed");
      expect(snapshotState.result).toEqual(ok(42));
    });
  });

  describe("daemon", () => {
    test("called directly on root runner", async () => {
      const events: Array<string> = [];
      const daemonCanComplete = Promise.withResolvers<void>();

      await using run = createRunner();

      const daemonTask: Task<void> = async () => {
        events.push("daemon started");
        await daemonCanComplete.promise;
        events.push("daemon completed");
        return ok();
      };

      // Call daemon directly on root runner (not from inside a task)
      const fiber = run.daemon(daemonTask);

      expect(events).toEqual(["daemon started"]);

      daemonCanComplete.resolve();
      await fiber;

      expect(events).toEqual(["daemon started", "daemon completed"]);
    });

    test("outlives parent task", async () => {
      const events: Array<string> = [];
      const daemonCanComplete = Promise.withResolvers<void>();
      let daemonFiber: Fiber<void>;

      await using run = createRunner();

      const daemonTask: Task<void> = async () => {
        events.push("daemon started");
        await daemonCanComplete.promise;
        events.push("daemon completed");
        return ok();
      };

      const parentTask: Task<void> = (run) => {
        events.push("parent started");
        daemonFiber = run.daemon(daemonTask);
        events.push("parent completed");
        return ok();
      };

      await run(parentTask);

      // Parent completed but daemon should still be running
      expect(events).toEqual([
        "parent started",
        "daemon started",
        "parent completed",
      ]);

      // Let daemon complete and wait for it
      daemonCanComplete.resolve();
      await daemonFiber!;

      expect(events).toEqual([
        "parent started",
        "daemon started",
        "parent completed",
        "daemon completed",
      ]);
    });

    test("aborted when root runner disposes", async () => {
      const events: Array<string> = [];
      const run = createRunner();

      const daemonTask: Task<void> = async ({ signal }) => {
        events.push("daemon started");
        const taskComplete = Promise.withResolvers<Result<void, AbortError>>();

        const timeout = setTimeout(() => {
          events.push("daemon completed");
          taskComplete.resolve(ok());
        }, 1000);

        signal.addEventListener(
          "abort",
          () => {
            clearTimeout(timeout);
            events.push("daemon aborted");
            taskComplete.resolve(err(signal.reason));
          },
          { once: true },
        );

        return await taskComplete.promise;
      };

      const parentTask: Task<void> = (run) => {
        run.daemon(daemonTask);
        return ok();
      };

      await run(parentTask);
      expect(events).toEqual(["daemon started"]);

      // Dispose root runner
      await run[Symbol.asyncDispose]();

      expect(events).toEqual(["daemon started", "daemon aborted"]);
    });

    test("from nested task runs on root runner", async () => {
      const events: Array<string> = [];
      const daemonCanComplete = Promise.withResolvers<void>();
      let daemonFiber: Fiber<void>;

      await using run = createRunner();

      const daemonTask: Task<void> = async () => {
        events.push("daemon started");
        await daemonCanComplete.promise;
        events.push("daemon completed");
        return ok();
      };

      // Nested task spawns a daemon via run.daemon
      const childTask: Task<void> = (run) => {
        events.push("child started");
        daemonFiber = run.daemon(daemonTask);
        events.push("child completed");
        return ok();
      };

      const parentTask: Task<void> = async (run) => {
        events.push("parent started");
        await run(childTask);
        events.push("parent completed");
        return ok();
      };

      await run(parentTask);

      // Both parent and child completed, but daemon should still be running
      expect(events).toEqual([
        "parent started",
        "child started",
        "daemon started",
        "child completed",
        "parent completed",
      ]);

      daemonCanComplete.resolve();
      await daemonFiber!;

      expect(events).toEqual([
        "parent started",
        "child started",
        "daemon started",
        "child completed",
        "parent completed",
        "daemon completed",
      ]);
    });
  });

  test("InferFiberOk and InferFiberErr extract type parameters", () => {
    type MyFiber = Fiber<string, MyError>;
    expectTypeOf<InferFiberOk<MyFiber>>().toEqualTypeOf<string>();

    type MyFiber2 = Fiber<number, MyError>;
    expectTypeOf<InferFiberErr<MyFiber2>>().toEqualTypeOf<MyError>();

    // Handles void Fiber
    type VoidFiber = Fiber<void, Error>;
    expectTypeOf<InferFiberOk<VoidFiber>>().toEqualTypeOf<void>();
    expectTypeOf<InferFiberErr<VoidFiber>>().toEqualTypeOf<Error>();
  });
});

describe("unabortable", () => {
  test("without abort completes", async () => {
    await using run = createRunner();

    const okResult = await run(unabortable(() => ok(42)));
    const errResult = await run(unabortable(() => err({ type: "MyError" })));

    expect(okResult).toEqual(ok(42));
    expect(errResult).toEqual(err({ type: "MyError" }));
  });

  test("with abort before run masks signal and completes", async () => {
    await using run = createRunner();

    let taskRan = false;
    let innerResult: Result<void, AbortError> | null = null;
    let signalAbortedBeforeUnabortable = false;

    // Abort first, then run unabortable task
    const fiber = run(async (run) => {
      await Promise.resolve(); // yield to let abort propagate
      signalAbortedBeforeUnabortable = run.signal.aborted;

      innerResult = await run(
        unabortable(() => {
          taskRan = true;
          return ok();
        }),
      );
      return innerResult;
    });

    fiber.abort("stop");
    const result = await fiber;

    expect(signalAbortedBeforeUnabortable).toBe(true);
    // Unabortable task ran despite parent being aborted
    expect(taskRan).toBe(true);
    // Inner unabortable task completed successfully
    expect(innerResult).toEqual(ok());
    // But outer abortable task was aborted
    expect(result).toEqual(err({ type: "AbortError", reason: "stop" }));
    // Outcome preserves what the task actually returned
    const state = fiber.getState();
    assert(state.type === "completed");
    expect(state.outcome).toEqual(innerResult);
  });

  test("with abort during run masks signal and completes", async () => {
    await using run = createRunner();

    const canComplete = Promise.withResolvers<void>();
    let signalAbortedAtStart = true;
    let signalAbortedAfterAbort = true;

    const fiber = run(
      unabortable(async ({ signal }) => {
        signalAbortedAtStart = signal.aborted;
        await canComplete.promise;
        // Signal should still be false despite abort
        signalAbortedAfterAbort = signal.aborted;
        return ok();
      }),
    );

    // Abort while task is running
    fiber.abort("stop");

    // Let the task complete
    canComplete.resolve();
    const result = await fiber;

    expect(signalAbortedAtStart).toBe(false);
    expect(signalAbortedAfterAbort).toBe(false);
    expect(result).toEqual(ok());
  });
});

describe("unabortableMask", () => {
  test("without abort completes", async () => {
    await using run = createRunner();

    let abortableRan = false;

    const task = unabortableMask(
      (restore) => async (run) =>
        await run(
          restore(() => {
            abortableRan = true;
            return ok();
          }),
        ),
    );

    const result = await run(task);

    expect(abortableRan).toBe(true);
    expect(result).toEqual(ok());
  });

  test("with abort before run still runs unabortable", async () => {
    await using run = createRunner();

    const events: Array<string> = [];
    let signalAbortedBeforeMask = false;

    const fiber = run(async (run) => {
      await Promise.resolve();
      signalAbortedBeforeMask = run.signal.aborted;

      // unabortableMask runs even though parent is already aborted
      return await run(
        unabortableMask((restore) => async (run) => {
          events.push("acquire");

          // abortable task is skipped because abort was requested
          await run(
            restore(() => {
              events.push("use");
              return ok();
            }),
          );

          events.push("release");
          return ok();
        }),
      );
    });

    fiber.abort("stop");
    const result = await fiber;

    expect(signalAbortedBeforeMask).toBe(true);
    // acquire and release ran, use was skipped (abortable sees the abort)
    expect(events).toEqual(["acquire", "release"]);
    // Outer fiber result is AbortError because outer task was aborted
    expect(result).toEqual(err({ type: "AbortError", reason: "stop" }));
  });

  test("with abort during run masks signal, skips abortable", async () => {
    await using run = createRunner();

    const events: Array<string> = [];
    const acquireStarted = Promise.withResolvers<void>();
    const canContinue = Promise.withResolvers<void>();
    let signalAbortedAtStart = true;
    let signalAbortedAfterAwait = true;
    let signalAbortedInMaskedTask = true;

    const task = unabortableMask((restore) => async (run) => {
      signalAbortedAtStart = run.signal.aborted;
      events.push("acquire");
      acquireStarted.resolve();
      await canContinue.promise;

      signalAbortedAfterAwait = run.signal.aborted;

      // Regular task runs because it inherits the abort mask
      await run(({ signal }) => {
        signalAbortedInMaskedTask = signal.aborted;
        events.push("masked task");
        return ok();
      });

      // Abortable task is skipped
      await run(
        restore(() => {
          events.push("use");
          return ok();
        }),
      );

      events.push("release");
      return ok();
    });

    const fiber = run(task);
    await acquireStarted.promise;
    fiber.abort("stop");
    canContinue.resolve();

    const result = await fiber;

    expect(signalAbortedAtStart).toBe(false);
    expect(signalAbortedAfterAwait).toBe(false);
    expect(signalAbortedInMaskedTask).toBe(false);
    expect(events).toEqual(["acquire", "masked task", "release"]);
    expect(result).toEqual(ok());
  });

  test("nested unabortableMask: outer abortable restores to fully abortable", async () => {
    await using run = createRunner();

    const events: Array<string> = [];
    const innerStarted = Promise.withResolvers<void>();
    const canContinue = Promise.withResolvers<void>();

    const task = unabortableMask((restore1) => async (run) => {
      // mask = 1
      events.push("outer acquire");

      return await run(
        unabortableMask((restore2) => async (run) => {
          // mask = 2
          events.push("inner acquire");
          innerStarted.resolve();
          await canContinue.promise;

          // abortable1 restores to mask=0 (fully abortable)
          await run(
            restore1(({ signal }) => {
              events.push(`abortable1 task (aborted=${signal.aborted})`);
              return ok();
            }),
          );

          // restore2 restores to mask=1 (still protected)
          await run(
            restore2(({ signal }) => {
              events.push(`restore2 task (aborted=${signal.aborted})`);
              return ok();
            }),
          );

          events.push("inner release");
          return ok();
        }),
      );
    });

    const fiber = run(task);
    await innerStarted.promise;
    fiber.abort("stop");
    canContinue.resolve();

    const result = await fiber;

    expect(events).toEqual([
      "outer acquire",
      "inner acquire",
      // abortable1 skipped (mask=0, abort visible)
      "restore2 task (aborted=false)",
      "inner release",
    ]);
    expect(result).toEqual(ok());
  });

  test("restore throws when used outside its unabortableMask", async () => {
    await using run = createRunner();

    let restoreFromInner: (<T, E>(task: Task<T, E>) => Task<T, E>) | undefined;

    const task = unabortableMask(
      (_restore1) => async (run) =>
        await run(
          unabortableMask((restore2) => (_run) => {
            // restore2 restores to mask=1
            restoreFromInner = restore2;

            return ok();
          }),
        ),
    );

    const result = await run(task);
    expect(result).toEqual(ok());
    expect(restoreFromInner).toBeDefined();

    // Using restore2 outside its intended scope would increase abort mask
    // (root mask=0, override=1). This must crash.
    expect(() => run(restoreFromInner!(() => ok()))).toThrow(
      "restore used outside its unabortableMask",
    );
  });
});

describe("AsyncDisposableStack", () => {
  interface Resource extends globalThis.AsyncDisposable {
    readonly id: string;
  }

  const createResource =
    (id: string, events: Array<string>): Task<Resource> =>
    () => {
      events.push(`${id} acquired`);
      return ok({
        id,
        // eslint-disable-next-line @typescript-eslint/require-await
        [Symbol.asyncDispose]: async () => {
          events.push(`${id} released`);
        },
      });
    };

  describe("stack via Runner", () => {
    test("run.stack() creates AsyncDisposableStack", async () => {
      await using run = createRunner();

      const events: Array<string> = [];

      const task: Task<void> = async (run) => {
        await using stack = run.stack();

        expectTypeOf(stack).toEqualTypeOf<AsyncDisposableStack>();

        stack.defer(() => {
          events.push("cleanup");
          return ok();
        });

        events.push("work");
        return ok();
      };

      const result = await run(task);

      expect(result).toEqual(ok());
      expect(events).toEqual(["work", "cleanup"]);
    });
  });

  describe("defer", () => {
    test("runs task on dispose", async () => {
      await using run = createRunner();

      const events: Array<string> = [];

      const cleanup = () => {
        events.push("cleanup");
        return ok();
      };

      const task: Task<void> = async (run) => {
        await using stack = run.stack();
        stack.defer(cleanup);
        events.push("work");
        return ok();
      };

      const result = await run(task);

      expect(result).toEqual(ok());
      expect(events).toEqual(["work", "cleanup"]);
    });

    test("runs multiple deferred tasks in LIFO order", async () => {
      await using run = createRunner();

      const events: Array<string> = [];

      const task: Task<void> = async (run) => {
        await using stack = run.stack();
        stack.defer(() => {
          events.push("cleanup A");
          return ok();
        });
        stack.defer(() => {
          events.push("cleanup B");
          return ok();
        });
        events.push("work");
        return ok();
      };

      const result = await run(task);

      expect(result).toEqual(ok());
      expect(events).toEqual(["work", "cleanup B", "cleanup A"]);
    });

    test("is unabortable", async () => {
      await using run = createRunner();

      const events: Array<string> = [];
      const taskStarted = Promise.withResolvers<void>();
      const canComplete = Promise.withResolvers<void>();

      const task: Task<void, AbortError> = async (run) => {
        await using stack = run.stack();
        stack.defer(() => {
          events.push("cleanup");
          return ok();
        });
        events.push("work started");
        taskStarted.resolve();
        await canComplete.promise;
        if (run.signal.aborted) {
          return err(run.signal.reason);
        }
        return ok();
      };

      const fiber = run(task);
      await taskStarted.promise;
      fiber.abort("stop");
      canComplete.resolve();

      const result = await fiber;

      expect(result).toEqual(err({ type: "AbortError", reason: "stop" }));
      expect(events).toEqual(["work started", "cleanup"]);
    });
  });

  describe("disposeAsync", () => {
    test("disposes the stack", async () => {
      await using run = createRunner();

      const events: Array<string> = [];

      const task: Task<void> = async (run) => {
        const stack = run.stack();

        stack.defer(() => {
          events.push("cleanup");
          return ok();
        });

        events.push("work");
        await stack.disposeAsync();

        return ok();
      };

      const result = await run(task);

      expect(result).toEqual(ok());
      expect(events).toEqual(["work", "cleanup"]);
    });
  });

  describe("disposed", () => {
    test("returns false before dispose, true after", async () => {
      await using run = createRunner();

      const task: Task<void> = async (run) => {
        const stack = run.stack();
        expect(stack.disposed).toBe(false);

        await stack.disposeAsync();
        expect(stack.disposed).toBe(true);

        return ok();
      };

      expect(await run(task)).toEqual(ok());
    });
  });

  describe("use", () => {
    test("acquires and disposes resource", async () => {
      await using run = createRunner();

      const events: Array<string> = [];

      const task: Task<void> = async (run) => {
        await using stack = run.stack();
        const a = await stack.use(createResource("a", events));
        if (!a.ok) return a;
        events.push(`using ${a.value.id}`);
        return ok();
      };

      const result = await run(task);

      expect(result).toEqual(ok());
      expect(events).toEqual(["a acquired", "using a", "a released"]);
    });

    test("acquires multiple resources in LIFO disposal order", async () => {
      await using run = createRunner();

      const events: Array<string> = [];

      const task: Task<void> = async (run) => {
        await using stack = run.stack();

        const a = await stack.use(createResource("a", events));
        if (!a.ok) return a;

        const b = await stack.use(createResource("b", events));
        if (!b.ok) return b;

        const c = await stack.use(createResource("c", events));
        if (!c.ok) return c;

        events.push(`using ${a.value.id}, ${b.value.id}, ${c.value.id}`);
        return ok();
      };

      const result = await run(task);

      expect(result).toEqual(ok());
      expect(events).toEqual([
        "a acquired",
        "b acquired",
        "c acquired",
        "using a, b, c",
        "c released",
        "b released",
        "a released",
      ]);
    });

    test("propagates acquire error and releases acquired resources", async () => {
      await using run = createRunner();

      interface AcquireError extends Typed<"AcquireError"> {}

      const events: Array<string> = [];

      const failingResource: Task<Resource, AcquireError> = () => {
        events.push("b failed");
        return err({ type: "AcquireError" });
      };

      const task: Task<void, AcquireError> = async (run) => {
        await using stack = run.stack();

        const a = await stack.use(createResource("a", events));
        if (!a.ok) return a;

        const b = await stack.use(failingResource);
        if (!b.ok) return b;

        const c = await stack.use(createResource("c", events));
        if (!c.ok) return c;

        events.push(`using ${a.value.id}, ${b.value.id}, ${c.value.id}`);
        return ok();
      };

      const result = await run(task);

      expect(result).toEqual(err({ type: "AcquireError" }));
      expect(events).toEqual(["a acquired", "b failed", "a released"]);
    });

    test("releases acquired resources when acquire throws", async () => {
      await using run = createRunner();

      const events: Array<string> = [];

      const throwingAcquire: Task<Resource> = () => {
        events.push("b throwing");
        throw new Error("acquire threw");
      };

      const task: Task<void> = async (run) => {
        await using stack = run.stack();

        const a = await stack.use(createResource("a", events));
        if (!a.ok) return a;

        const b = await stack.use(throwingAcquire);
        if (!b.ok) return b;

        const c = await stack.use(createResource("c", events));
        if (!c.ok) return c;

        events.push(`using ${a.value.id}, ${b.value.id}, ${c.value.id}`);
        return ok();
      };

      await expect(run(task)).rejects.toThrow("acquire threw");
      expect(events).toEqual(["a acquired", "b throwing", "a released"]);
    });

    test("acquisition is unabortable", async () => {
      await using run = createRunner();

      const events: Array<string> = [];
      const canComplete = Promise.withResolvers<void>();

      const slowAcquire: Task<Resource> = async ({ signal }) => {
        events.push(`acquire started, aborted: ${signal.aborted}`);
        await canComplete.promise;
        events.push(`acquire completed, aborted: ${signal.aborted}`);
        return ok({
          id: "slow",
          // eslint-disable-next-line @typescript-eslint/require-await
          [Symbol.asyncDispose]: async () => {
            events.push("slow released");
          },
        });
      };

      const task: Task<void, AbortError> = async (run) => {
        await using stack = run.stack();
        const a = await stack.use(slowAcquire);
        if (!a.ok) return a;
        if (run.signal.aborted) {
          return err(run.signal.reason);
        }
        events.push(`using ${a.value.id}`);
        return ok();
      };

      const fiber = run(task);
      fiber.abort("stop");
      canComplete.resolve();

      const result = await fiber;

      expect(result).toEqual(err({ type: "AbortError", reason: "stop" }));
      expect(events).toEqual([
        "acquire started, aborted: false",
        "acquire completed, aborted: false",
        "slow released",
      ]);
    });

    test("accepts sync Disposable", async () => {
      await using run = createRunner();

      const events: Array<string> = [];

      interface SyncResource extends Disposable {
        readonly id: string;
      }

      const createSyncResource =
        (id: string): Task<SyncResource> =>
        () => {
          events.push(`${id} acquired`);
          return ok({
            id,
            [Symbol.dispose]: () => {
              events.push(`${id} released`);
            },
          });
        };

      const task: Task<void> = async (run) => {
        await using stack = run.stack();
        const a = await stack.use(createSyncResource("a"));
        if (!a.ok) return a;
        events.push(`using ${a.value.id}`);
        return ok();
      };

      const result = await run(task);

      expect(result).toEqual(ok());
      expect(events).toEqual(["a acquired", "using a", "a released"]);
    });

    test("accepts null without registering disposal", async () => {
      await using run = createRunner();

      const task: Task<null> = async (run) => {
        await using stack = run.stack();
        const result = await stack.use(() => ok(null));
        return result;
      };

      expect(await run(task)).toEqual(ok(null));
    });

    test("accepts undefined without registering disposal", async () => {
      await using run = createRunner();

      const task: Task<undefined> = async (run) => {
        await using stack = run.stack();
        const result = await stack.use(() => ok(undefined));
        return result;
      };

      expect(await run(task)).toEqual(ok(undefined));
    });

    test("accepts direct value (sync)", async () => {
      await using run = createRunner();

      const events: Array<string> = [];

      const task: Task<void> = async (run) => {
        await using stack = run.stack();

        const resource: AsyncDisposable = {
          // eslint-disable-next-line @typescript-eslint/require-await
          [Symbol.asyncDispose]: async () => {
            events.push("released");
          },
        };

        const value = stack.use(resource);
        expectTypeOf(value).toEqualTypeOf<AsyncDisposable>();
        expect(value).toBe(resource);

        events.push("work");
        return ok();
      };

      const result = await run(task);

      expect(result).toEqual(ok());
      expect(events).toEqual(["work", "released"]);
    });

    test("accepts disposable callable (not mistaken for Task)", async () => {
      await using run = createRunner();

      let childRunner: Runner | null = null;
      let stateWhileWorking: FiberState | null = null;

      const task: Task<void> = async (run) => {
        await using stack = run.stack();

        // Runner is a callable with Symbol.asyncDispose
        // use must detect the symbol, not use typeof === "function"
        childRunner = createRunner();
        stack.use(childRunner);

        stateWhileWorking = childRunner.getState();
        return ok();
      };

      const result = await run(task);

      expect(result).toEqual(ok());
      expect(stateWhileWorking!.type).toBe("running");
      expect(childRunner!.getState().type).toBe("completed");
    });

    test("accepts moved native stack", async () => {
      await using run = createRunner();

      const events: Array<string> = [];

      const task: Task<void> = async (run) => {
        await using outerStack = run.stack();

        // Create inner stack with resources
        const innerStack = run.stack();
        innerStack.defer(() => {
          events.push("inner cleanup");
          return ok();
        });

        // Move and add to outer stack
        const moved = innerStack.move();
        outerStack.use(moved);

        events.push("work");
        return ok();
      };

      const result = await run(task);

      expect(result).toEqual(ok());
      expect(events).toEqual(["work", "inner cleanup"]);
    });
  });

  describe("adopt", () => {
    test("acquires value via task and registers task-based disposal", async () => {
      await using run = createRunner();

      const events: Array<string> = [];

      interface Handle {
        readonly id: string;
      }

      const acquireHandle =
        (id: string): Task<Handle> =>
        () => {
          events.push(`${id} acquired`);
          return ok({ id });
        };

      const task: Task<void> = async (run) => {
        await using stack = run.stack();

        const handle = await stack.adopt(acquireHandle("h1"), (h) => () => {
          events.push(`${h.id} released`);
          return ok();
        });
        if (!handle.ok) return handle;

        events.push(`using ${handle.value.id}`);
        return ok();
      };

      const result = await run(task);

      expect(result).toEqual(ok());
      expect(events).toEqual(["h1 acquired", "using h1", "h1 released"]);
    });

    test("disposal is unabortable", async () => {
      await using run = createRunner();

      const events: Array<string> = [];
      const taskStarted = Promise.withResolvers<void>();
      const canComplete = Promise.withResolvers<void>();

      const task: Task<void, AbortError> = async (run) => {
        await using stack = run.stack();

        const handle = await stack.adopt(
          () => ok({ id: "h1" }),
          (h) => () => {
            events.push(`${h.id} released`);
            return ok();
          },
        );
        if (!handle.ok) return handle;

        events.push("work started");
        taskStarted.resolve();
        await canComplete.promise;
        if (run.signal.aborted) {
          return err(run.signal.reason);
        }
        return ok();
      };

      const fiber = run(task);
      await taskStarted.promise;
      fiber.abort("stop");
      canComplete.resolve();

      const result = await fiber;

      expect(result).toEqual(err({ type: "AbortError", reason: "stop" }));
      expect(events).toEqual(["work started", "h1 released"]);
    });

    test("does not register disposal if acquire fails", async () => {
      await using run = createRunner();

      const events: Array<string> = [];

      interface AcquireError extends Typed<"AcquireError"> {}

      const task: Task<void, AcquireError> = async (run) => {
        await using stack = run.stack();

        const handle = await stack.adopt<{ id: string }, AcquireError>(
          () => {
            events.push("acquire failed");
            return err({ type: "AcquireError" });
          },
          (h) => () => {
            events.push(`${h.id} released`);
            return ok();
          },
        );
        if (!handle.ok) return handle;

        events.push(`using ${handle.value.id}`);
        return ok();
      };

      const result = await run(task);

      expect(result).toEqual(err({ type: "AcquireError" }));
      // Release should not be called since acquire failed
      expect(events).toEqual(["acquire failed"]);
    });
  });

  describe("move", () => {
    test("transfers ownership to returned AsyncDisposableStack", async () => {
      await using run = createRunner();

      const events: Array<string> = [];

      const createBundle: Task<
        { a: Resource; b: Resource } & AsyncDisposable
      > = async (run) => {
        await using stack = run.stack();

        const a = await stack.use(createResource("a", events));
        if (!a.ok) return a;

        const b = await stack.use(createResource("b", events));
        if (!b.ok) return b;

        const moved = stack.move();
        return ok({
          a: a.value,
          b: b.value,
          [Symbol.asyncDispose]: () => moved.disposeAsync(),
        });
      };

      const bundle = await run(createBundle);
      expect(bundle.ok).toBe(true);
      if (!bundle.ok) throw new Error("unreachable");

      events.push(`using ${bundle.value.a.id}, ${bundle.value.b.id}`);

      // Resources not released yet
      expect(events).toEqual(["a acquired", "b acquired", "using a, b"]);

      // Dispose the bundle
      await bundle.value[Symbol.asyncDispose]();

      expect(events).toEqual([
        "a acquired",
        "b acquired",
        "using a, b",
        "b released",
        "a released",
      ]);
    });

    test("cleans up on early return after move is possible", async () => {
      await using run = createRunner();

      const events: Array<string> = [];
      const canContinue = Promise.withResolvers<void>();

      // Abortable factory - if aborted, acquired resources are cleaned up
      const createBundle: Task<
        { a: Resource; b: Resource } & AsyncDisposable
      > = async (run) => {
        await using stack = run.stack();

        const a = await stack.use(createResource("a", events));
        if (!a.ok) return a;

        // Simulate slow acquisition
        await canContinue.promise;

        // Check abort after await
        if (run.signal.aborted) {
          return err(run.signal.reason);
        }

        const b = await stack.use(createResource("b", events));
        if (!b.ok) return b;

        const moved = stack.move();
        return ok({
          a: a.value,
          b: b.value,
          [Symbol.asyncDispose]: () => moved.disposeAsync(),
        });
      };

      const fiber = run(createBundle);

      // Abort while 'a' is acquired but waiting for 'b'
      fiber.abort("cancelled");
      canContinue.resolve();

      const result = await fiber;

      expect(result).toEqual(err({ type: "AbortError", reason: "cancelled" }));
      // 'a' was acquired then cleaned up when scope exited
      expect(events).toEqual(["a acquired", "a released"]);
    });
  });

  describe("cleanup runs on root scope", () => {
    test("defer cleanup survives factory task scope", async () => {
      await using run = createRunner();

      const events: Array<string> = [];

      // Factory task creates a resource with Task-based cleanup via defer
      const createBundle: Task<AsyncDisposable> = async (run) => {
        await using stack = run.stack();

        events.push("factory: acquired");
        stack.defer(() => {
          events.push("factory: cleanup via defer");
          return ok();
        });

        const moved = stack.move();
        return ok({
          [Symbol.asyncDispose]: () => moved.disposeAsync(),
        });
      };

      const bundle = await run(createBundle);
      expect(bundle.ok).toBe(true);
      if (!bundle.ok) throw new Error("unreachable");

      events.push("using bundle after factory ended");

      await bundle.value[Symbol.asyncDispose]();

      expect(events).toEqual([
        "factory: acquired",
        "using bundle after factory ended",
        "factory: cleanup via defer",
      ]);
    });

    test("adopt disposal survives factory task scope", async () => {
      await using run = createRunner();

      const events: Array<string> = [];

      interface Handle {
        readonly id: string;
      }

      // Factory task creates a resource with Task-based disposal via adopt
      const createBundle: Task<{ handle: Handle } & AsyncDisposable> = async (
        run,
      ) => {
        await using stack = run.stack();

        const handle = await stack.adopt<Handle>(
          () => {
            events.push("factory: h1 acquired");
            return ok({ id: "h1" });
          },
          (h) => () => {
            events.push(`factory: ${h.id} disposal via adopt`);
            return ok();
          },
        );
        if (!handle.ok) return handle;

        const moved = stack.move();
        return ok({
          handle: handle.value,
          [Symbol.asyncDispose]: () => moved.disposeAsync(),
        });
      };

      const bundle = await run(createBundle);
      expect(bundle.ok).toBe(true);
      if (!bundle.ok) throw new Error("unreachable");

      events.push(`using ${bundle.value.handle.id} after factory ended`);

      await bundle.value[Symbol.asyncDispose]();

      expect(events).toEqual([
        "factory: h1 acquired",
        "using h1 after factory ended",
        "factory: h1 disposal via adopt",
      ]);
    });
  });

  describe("AsyncDisposable with Task-based disposal via run.defer", () => {
    interface Resource extends AsyncDisposable {
      readonly id: string;
    }

    const createResourceFactory = (
      events: Array<string>,
      disposalTask?: Task<void>,
    ) => {
      const createResource: Task<Resource> = (run) => {
        events.push("acquired");
        return ok({
          id: "r1",
          ...run.defer(
            disposalTask ??
              (() => {
                events.push("disposed");
                return ok();
              }),
          ),
        });
      };
      return createResource;
    };

    test("disposal runs when stack disposes", async () => {
      await using run = createRunner();

      const events: Array<string> = [];

      const task: Task<void> = async (run) => {
        await using stack = run.stack();
        const r = await stack.use(createResourceFactory(events));
        if (!r.ok) return r;
        events.push("work");
        return ok();
      };

      const result = await run(task);

      expect(result).toEqual(ok());
      expect(events).toEqual(["acquired", "work", "disposed"]);
    });

    test("disposal completes even when parent task is aborted", async () => {
      await using run = createRunner();

      const events: Array<string> = [];
      const workStarted = Promise.withResolvers<void>();
      const canComplete = Promise.withResolvers<void>();

      const cleanupHelper = () => {
        events.push("cleanup helper ran");
        return ok();
      };

      const task: Task<void, AbortError> = async (run) => {
        await using stack = run.stack();

        const r = await stack.use(
          createResourceFactory(events, async (run) => {
            events.push("disposal started");
            await canComplete.promise;
            // Verify runner works inside disposal task
            await run(cleanupHelper);
            events.push("disposal completed");
            return ok();
          }),
        );
        if (!r.ok) return r;

        events.push("work started");
        workStarted.resolve();

        await new Promise((resolve) => setTimeout(resolve, 10));
        if (run.signal.aborted) return err(run.signal.reason);

        events.push("work completed");
        return ok();
      };

      const fiber = run(task);
      await workStarted.promise;
      fiber.abort("stop");
      canComplete.resolve();

      const result = await fiber;

      expect(result).toEqual(err({ type: "AbortError", reason: "stop" }));
      expect(events).toEqual([
        "acquired",
        "work started",
        "disposal started",
        "cleanup helper ran",
        "disposal completed",
      ]);
    });

    test("disposal survives factory task scope ending", async () => {
      await using run = createRunner();

      const events: Array<string> = [];

      const r = await run(createResourceFactory(events));
      expect(r.ok).toBe(true);
      if (!r.ok) throw new Error("unreachable");

      events.push("using after factory ended");
      await r.value[Symbol.asyncDispose]();

      expect(events).toEqual([
        "acquired",
        "using after factory ended",
        "disposed",
      ]);
    });
  });
});

describe("yieldNow", () => {
  test("is polyfilled properly", async () => {
    await using run = createRunner();

    const events: Array<string> = [];

    const task: Task<void> = async (run) => {
      const p = run(yieldNow).then(() => events.push("yield-resolved"));

      queueMicrotask(() => events.push("queueMicrotask"));
      void Promise.resolve().then(() => {
        events.push("promise");
      });

      events.push("sync");

      await p;
      return ok();
    };

    await run(task);

    // Execution order:
    // 1. sync code runs immediately
    // 2. microtasks drain (queueMicrotask, Promise.then)
    // 3. macrotasks run (scheduler.yield, setImmediate, setTimeout)
    expect(events).toEqual([
      "sync",
      "queueMicrotask",
      "promise",
      "yield-resolved",
    ]);
  });
});

describe("sleep", () => {
  test("completes after duration", async () => {
    const time = testCreateTime();
    await using run = createTestRunner({ time });

    const fiber = run(sleep("100ms"));

    time.advance("100ms");

    const result = await fiber;
    expect(result).toEqual(ok());
  });

  test("returns AbortError and clears timeout when aborted", async () => {
    await using run = createRunner();

    const start = Date.now();
    const fiber = run(sleep("1h"));
    fiber.abort("cancelled");

    const result = await fiber;
    const elapsed = Date.now() - start;

    expect(result).toEqual(err({ type: "AbortError", reason: "cancelled" }));
    const state = fiber.getState();
    assert(state.type === "completed");
    expect(state.outcome).toEqual(
      err({ type: "AbortError", reason: "cancelled" }),
    );
    expect(elapsed).toBeLessThan(50);
  });
});

describe("race", () => {
  test("returns first task to succeed and aborts others", async () => {
    await using run = createRunner();

    const slowObservedAbort = Promise.withResolvers<unknown>();

    const fast = () => ok("fast");
    const slow = async ({ signal }: { signal: AbortSignal }) => {
      await run(sleep("1ms"));
      slowObservedAbort.resolve(signal.reason);
      return ok("slow");
    };

    const result = await run(race([fast, slow]));

    expectTypeOf(result).toEqualTypeOf<Result<string, AbortError>>();
    expect(result).toEqual(ok("fast"));

    const slowAbortReason = await slowObservedAbort.promise;
    assert(AbortError.is(slowAbortReason));
    expect(RaceLostError.is(slowAbortReason.reason)).toBe(true);
  });

  test("returns first task to fail and aborts others", async () => {
    await using run = createRunner();

    const slowObservedAbort = Promise.withResolvers<unknown>();

    interface FastError extends Typed<"FastError"> {}

    const fast: Task<never, FastError> = () => err({ type: "FastError" });
    const slow: Task<string> = async ({ signal }) => {
      await run(sleep("1ms"));
      slowObservedAbort.resolve(signal.reason);
      return ok("slow");
    };

    const result = await run(race([fast, slow]));

    expectTypeOf(result).toEqualTypeOf<
      Result<string, FastError | AbortError>
    >();
    expect(result).toEqual(err({ type: "FastError" }));

    const slowAbortReason = await slowObservedAbort.promise;
    assert(AbortError.is(slowAbortReason));
    expect(RaceLostError.is(slowAbortReason.reason)).toBe(true);
  });

  test("aborts others when one throws", async () => {
    await using run = createRunner();

    const slowObservedAbort = Promise.withResolvers<unknown>();

    const throwing = () => {
      throw new Error("boom");
    };
    const slow = async ({ signal }: { signal: AbortSignal }) => {
      await run(sleep("1ms"));
      slowObservedAbort.resolve(signal.reason);
      return ok("slow");
    };

    await expect(run(race([throwing, slow]))).rejects.toThrow("boom");

    const slowAbortReason = await slowObservedAbort.promise;
    assert(AbortError.is(slowAbortReason));
    expect(RaceLostError.is(slowAbortReason.reason)).toBe(true);
  });

  test("infers union of Ok and Err types from heterogeneous tasks", async () => {
    await using run = createRunner();

    interface ErrorA extends Typed<"ErrorA"> {}
    interface ErrorB extends Typed<"ErrorB"> {}

    const taskA: Task<string, ErrorA> = () => ok("a");
    const taskB: Task<number, ErrorB> = () => ok(42);

    const result = await run(race([taskA, taskB]));

    // race collapses to union of Ok types and union of Err types
    expectTypeOf(result).toEqualTypeOf<
      Result<string | number, ErrorA | ErrorB | AbortError>
    >();
    expect(result.ok).toBe(true);
  });

  test("works with Iterable via isNonEmptyArray", async () => {
    await using run = createRunner();

    // Simulate tasks from an Iterable (e.g., Set, Map.values(), generator)
    const taskSet = new Set<Task<string>>([
      () => ok("first"),
      () => ok("second"),
    ]);

    // Spread to array, then use isNonEmptyArray to narrow type
    const tasksArray = [...taskSet];
    if (!isNonEmptyArray(tasksArray)) {
      throw new Error("Expected non-empty");
    }

    const result = await run(race(tasksArray));

    expect(result.ok).toBe(true);
  });

  test("unabortable loser does not block winner", async () => {
    // Not using `await using` because disposal waits for all fibers to complete,
    // including the unabortable loser (10s). We want to verify race() returns
    // promptly without blocking on unabortable tasks.
    const run = createRunner();

    let loserCompleted = false;

    const winner = () => ok("winner");
    const unabortableLoser = unabortable(async (run) => {
      await run(sleep("10s"));
      loserCompleted = true;
      return ok("loser");
    });

    const start = Date.now();
    const result = await run(race([winner, unabortableLoser]));
    const elapsed = Date.now() - start;

    // race returns promptly with winner, doesn't wait for unabortable loser
    expect(result).toEqual(ok("winner"));
    expect(elapsed).toBeLessThan(50);
    expect(loserCompleted).toBe(false);
  });

  test("propagates external abort to all raced tasks", async () => {
    await using run = createRunner();

    const task1ObservedAbort = Promise.withResolvers<unknown>();
    const task2ObservedAbort = Promise.withResolvers<unknown>();

    const task1: Task<string> = async ({ signal }) => {
      await Promise.resolve();
      task1ObservedAbort.resolve(signal.reason);
      return ok("task1");
    };

    const task2: Task<string> = async ({ signal }) => {
      await Promise.resolve();
      task2ObservedAbort.resolve(signal.reason);
      return ok("task2");
    };

    const fiber = run(race([task1, task2]));

    // Abort the race externally (not by task completion)
    fiber.abort("external abort");

    const result = await fiber;

    expect(result).toEqual(
      err({ type: "AbortError", reason: "external abort" }),
    );

    // Both tasks should have observed the abort
    const task1Reason = await task1ObservedAbort.promise;
    const task2Reason = await task2ObservedAbort.promise;

    assert(AbortError.is(task1Reason));
    assert(AbortError.is(task2Reason));
    expect(task1Reason.reason).toBe("external abort");
    expect(task2Reason.reason).toBe("external abort");
  });

  test("uses custom abortReason for losing tasks", async () => {
    await using run = createRunner();

    const slowObservedAbort = Promise.withResolvers<unknown>();

    const fast = () => ok("fast");
    const slow = async ({ signal }: { signal: AbortSignal }) => {
      await run(sleep("1ms"));
      slowObservedAbort.resolve(signal.reason);
      return ok("slow");
    };

    const customReason = { type: "CustomAbort", message: "you lost" };
    const result = await run(race([fast, slow], { abortReason: customReason }));

    expect(result).toEqual(ok("fast"));

    const slowAbortReason = await slowObservedAbort.promise;
    assert(AbortError.is(slowAbortReason));
    expect(slowAbortReason.reason).toEqual(customReason);
  });
});

describe("timeout", () => {
  test("completes when task finishes before timeout", async () => {
    await using run = createRunner();

    const fast = () => ok();

    const result = await run(timeout(fast, "1s"));

    expectTypeOf(result).toEqualTypeOf<
      Result<void, TimeoutError | AbortError>
    >();
    expect(result).toEqual(ok());
  });

  test("returns TimeoutError when task exceeds duration", async () => {
    const time = testCreateTime();
    await using run = createTestRunner({ time });

    const slow = sleep("100ms");

    const fiber = run(timeout(slow, "10ms"));
    time.advance("10ms");

    const result = await fiber;

    expect(result).toEqual(err({ type: "TimeoutError" }));
  });

  test("aborts task when timeout fires", async () => {
    const time = testCreateTime();
    await using run = createTestRunner({ time });

    const abortReasonCapture = Promise.withResolvers<unknown>();

    const slow: Task<void> = async ({ onAbort }) => {
      onAbort((reason) => {
        abortReasonCapture.resolve(reason);
      });
      const result = await run(sleep("100ms"));
      if (!result.ok) return result;
      return ok();
    };

    const fiber = run(timeout(slow, "10ms"));
    time.advance("10ms");

    const result = await fiber;
    expect(result).toEqual(err({ type: "TimeoutError" }));

    const abortReason = await abortReasonCapture.promise;
    expect(TimeoutError.is(abortReason)).toBe(true);
  });

  test("uses custom abortReason when provided", async () => {
    const time = testCreateTime();
    await using run = createTestRunner({ time });

    const customReason = { type: "CustomTimeout" };
    const abortReasonCapture = Promise.withResolvers<unknown>();

    const slow: Task<void> = async ({ onAbort }) => {
      onAbort((reason) => {
        abortReasonCapture.resolve(reason);
      });
      const result = await run(sleep("100ms"));
      if (!result.ok) return result;
      return ok();
    };

    const fiber = run(timeout(slow, "10ms", { abortReason: customReason }));
    time.advance("10ms");

    await fiber;

    const abortReason = await abortReasonCapture.promise;
    expect(abortReason).toBe(customReason);
  });

  test("returns TimeoutError immediately when unabortable task exceeds duration", async () => {
    const time = testCreateTime();
    await using run = createTestRunner({ time });

    let taskCompleted = false;
    const completionCapture = Promise.withResolvers<void>();

    const slow: Task<void, AbortError> = unabortable(async (run) => {
      const result = await run(sleep("100ms"));
      if (!result.ok) return result;
      taskCompleted = true;
      completionCapture.resolve();
      return ok();
    });

    const fiber = run(timeout(slow, "10ms"));
    time.advance("10ms");

    // timeout returns immediately with TimeoutError
    const result = await fiber;
    expect(result).toEqual(err({ type: "TimeoutError" }));

    // But the unabortable task hasn't completed yet
    expect(taskCompleted).toBe(false);

    // After more time passes, unabortable task completes
    time.advance("100ms");
    await completionCapture.promise;
    expect(taskCompleted).toBe(true);
  });
});

describe("retry", () => {
  test("succeeds on first attempt", async () => {
    await using run = createRunner();

    let attempts = 0;
    const task = () => {
      attempts++;
      return ok();
    };

    const result = await run(retry(task, take(3)(spaced("1ms"))));

    expect(result).toEqual(ok());
    expect(attempts).toBe(1);
  });

  test("succeeds after retries", async () => {
    await using run = createRunner();

    let attempts = 0;
    const task = () => {
      attempts++;
      if (attempts < 3) return err<MyError>({ type: "MyError" });
      return ok();
    };

    const result = await run(retry(task, take(3)(spaced("1ms"))));

    expect(result).toEqual(ok());
    expect(attempts).toBe(3);
  });

  test("returns RetryError when all attempts exhausted", async () => {
    await using run = createRunner();

    let attempts = 0;
    const task = () => {
      attempts++;
      return err<MyError>({ type: "MyError" });
    };

    const result = await run(retry(task, take(2)(spaced("1ms"))));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toEqual({
        type: "RetryError",
        cause: { type: "MyError" },
        attempts: PositiveInt.orThrow(3),
      });
    }
    expect(attempts).toBe(3);
  });

  test("calls onRetry before each retry", async () => {
    await using run = createRunner();

    const retryLog: Array<{
      error: MyError;
      attempt: PositiveInt;
      output: Millis;
      delay: Millis;
    }> = [];
    let attempts = 0;
    const task = () => {
      attempts++;
      if (attempts < 3) return err<MyError>({ type: "MyError" });
      return ok();
    };

    await run(
      retry(task, take(3)(spaced("1ms")), {
        onRetry: ({ error, attempt, output, delay }) =>
          retryLog.push({
            error,
            attempt,
            output,
            delay,
          }),
      }),
    );

    expect(retryLog).toEqual([
      {
        error: { type: "MyError" },
        attempt: minPositiveInt,
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

  test("respects retryable predicate", async () => {
    await using run = createRunner();

    interface RetryableError extends Typed<"RetryableError"> {}
    interface NonRetryableError extends Typed<"NonRetryableError"> {}

    let attempts = 0;
    const task: Task<void, RetryableError | NonRetryableError> = () => {
      attempts++;
      if (attempts === 1)
        return err<RetryableError>({ type: "RetryableError" });
      return err<NonRetryableError>({ type: "NonRetryableError" });
    };

    const result = await run(
      retry(task, take(3)(spaced("1ms")), {
        retryable: (error) => error.type === "RetryableError",
      }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toEqual({
        type: "RetryError",
        cause: { type: "NonRetryableError" },
        attempts: PositiveInt.orThrow(2),
      });
    }
    expect(attempts).toBe(2);
  });

  test("never retries AbortError", async () => {
    await using run = createRunner();

    let attempts = 0;
    const task = () => {
      attempts++;
      return err<AbortError>({ type: "AbortError", reason: "test" });
    };

    const result = await run(retry(task, take(3)(spaced("1ms"))));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(AbortError.is(result.error)).toBe(true);
    }
    expect(attempts).toBe(1);
  });

  test("propagates abort to running task", async () => {
    await using run = createRunner();

    const taskStarted = Promise.withResolvers<void>();

    const task: Task<void, MyError> = async (run) => {
      taskStarted.resolve();
      const result = await run(sleep("1s"));
      if (!result.ok) return result;
      return ok();
    };

    const fiber = run(retry(task, take(3)(spaced("1ms"))));
    await taskStarted.promise;
    fiber.abort();

    const result = await fiber;
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(AbortError.is(result.error)).toBe(true);
    }
  });

  test("uses exponential backoff schedule", async () => {
    await using run = createRunner();

    let attempts = 0;
    const task = () => {
      attempts++;
      if (attempts < 3) return err<MyError>({ type: "MyError" });
      return ok();
    };

    const result = await run(retry(task, take(5)(exponential("1ms"))));

    expect(result).toEqual(ok());
    expect(attempts).toBe(3);
  });

  test("schedule can filter by error type", async () => {
    await using run = createRunner();

    interface RetryableError extends Typed<"RetryableError"> {}
    interface FatalError extends Typed<"FatalError"> {}

    let attempts = 0;
    const task: Task<void, RetryableError | FatalError> = () => {
      attempts++;
      if (attempts === 1)
        return err<RetryableError>({ type: "RetryableError" });
      return err<FatalError>({ type: "FatalError" });
    };

    // Schedule stops on fatal errors via whileScheduleInput
    const result = await run(
      retry(
        task,
        whileScheduleInput<RetryableError | FatalError>(
          (e: RetryableError | FatalError) => e.type !== "FatalError",
        )(take(5)(spaced("1ms"))),
      ),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toEqual({
        type: "RetryError",
        cause: { type: "FatalError" },
        attempts: PositiveInt.orThrow(2),
      });
    }
    expect(attempts).toBe(2);
  });

  test("abort during retry delay returns AbortError", async () => {
    await using run = createRunner();

    let attempts = 0;
    const task: Task<void, MyError> = () => {
      attempts++;
      return err<MyError>({ type: "MyError" });
    };

    // Use a long delay so we can abort during it
    const fiber = run(retry(task, take(3)(spaced("1s"))));

    // Wait for first attempt to complete and delay to start
    await run(sleep("10ms"));
    expect(attempts).toBe(1);

    fiber.abort();

    const result = await fiber;
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(AbortError.is(result.error)).toBe(true);
    }
  });
});

describe("repeat", () => {
  test("runs task n+1 times with take(n)", async () => {
    await using run = createRunner();

    let count = 0;
    const task = () => {
      count++;
      return ok(count);
    };

    // take(3) = 3 repetitions after initial run = 4 total runs
    const result = await run(repeat(task, take(3)(spaced("1ms"))));

    expect(result).toEqual(ok(4));
    expect(count).toBe(4);
  });

  test("returns last successful value when schedule exhausted", async () => {
    await using run = createRunner();

    const values = ["first", "second", "third", "fourth"];
    let index = 0;
    const task = () => ok(values[index++]);

    // take(3) = 4 total runs
    const result = await run(repeat(task, take(3)(fixed("1ms"))));

    expect(result).toEqual(ok("fourth"));
  });

  test("stops and returns error when task fails", async () => {
    await using run = createRunner();

    let count = 0;
    const task = () => {
      count++;
      if (count === 2) return err<MyError>({ type: "MyError" });
      return ok(count);
    };

    const result = await run(repeat(task, take(5)(spaced("1ms"))));

    expect(result).toEqual(err({ type: "MyError" }));
    expect(count).toBe(2);
  });

  test("respects repeatable predicate", async () => {
    await using run = createRunner();

    let count = 0;
    const task = () => {
      count++;
      return ok(count);
    };

    const result = await run(
      repeat(task, take(5)(spaced(Millis.orThrow(0))), {
        repeatable: (value) => value < 1,
      }),
    );

    expect(result).toEqual(ok(1));
    expect(count).toBe(1);
  });

  test("calls onRepeat before each repeat", async () => {
    await using run = createRunner();

    const repeatLog: Array<{
      value: number;
      attempt: PositiveInt;
      output: Millis;
      delay: Millis;
    }> = [];
    let count = 0;
    const task = () => {
      count++;
      return ok(count);
    };

    await run(
      repeat(task, take(2)(spaced(Millis.orThrow(0))), {
        onRepeat: ({ value, attempt, output, delay }) =>
          repeatLog.push({
            value,
            attempt,
            output,
            delay,
          }),
      }),
    );

    expect(repeatLog).toEqual([
      {
        value: 1,
        attempt: minPositiveInt,
        output: Millis.orThrow(0),
        delay: Millis.orThrow(0),
      },
      {
        value: 2,
        attempt: PositiveInt.orThrow(2),
        output: Millis.orThrow(0),
        delay: Millis.orThrow(0),
      },
    ]);
  });

  test("can be aborted", async () => {
    await using run = createRunner();

    let count = 0;
    const task: Task<number> = async () => {
      count++;
      const result = await run(sleep("10ms"));
      if (!result.ok) return result;
      return ok(count);
    };

    const fiber = run(repeat(task, take(100)(spaced("1ms"))));
    await Promise.resolve();
    fiber.abort();

    const result = await fiber;
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(AbortError.is(result.error)).toBe(true);
    }
    expect(count).toBe(1);
  });

  test("uses forever schedule when unlimited", async () => {
    await using run = createRunner();

    let count = 0;
    const task: Task<number> = async () => {
      count++;
      if (count >= 5) {
        // Abort after 5 iterations to prevent infinite loop
        const result = await run(sleep("10ms"));
        if (!result.ok) return result;
      }
      return ok(count);
    };

    const fiber = run(repeat(task, spaced("1ms")));

    // Let a few iterations run
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    fiber.abort();
    const result = await fiber;

    expect(result.ok).toBe(false);
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test("does not sleep when delay is zero", async () => {
    const time = testCreateTime();
    await using run = createTestRunner({ time });

    let count = 0;
    const task = () => {
      count++;
      return ok(count);
    };

    const result = await run(repeat(task, take(2)(fixed(Millis.orThrow(0)))));

    expect(result).toEqual(ok(3));
    expect(count).toBe(3);
  });

  test("aborts while waiting between repeats", async () => {
    const time = testCreateTime();
    await using run = createTestRunner({ time });

    let count = 0;
    const task = () => {
      count++;
      return ok(count);
    };

    const fiber = run(repeat(task, take(1)(fixed("10ms"))));
    await Promise.resolve();
    fiber.abort("stop");

    const result = await fiber;

    expect(result).toEqual(err({ type: "AbortError", reason: "stop" }));
    expect(count).toBe(1);
  });

  test("stops on Done from NextTask", async () => {
    await using run = createRunner();

    let count = 0;
    const next: NextTask<number> = () => {
      count++;
      if (count === 3) return err(done());
      return ok(count);
    };

    const result = await run(repeat(next, spaced(Millis.orThrow(0))));

    expect(result).toEqual(err(done()));
    expect(count).toBe(3);
  });

  test("processes queue until empty (NextTask pattern)", async () => {
    await using run = createRunner();

    const queue = [1, 2, 3];
    const processed: Array<number> = [];

    const processQueue: NextTask<number> = () => {
      const item = queue.shift();
      if (item === undefined) return err(done());
      processed.push(item);
      return ok(item);
    };

    const result = await run(repeat(processQueue, spaced(Millis.orThrow(0))));

    expect(result).toEqual(err(done()));
    expect(processed).toEqual([1, 2, 3]);
  });
});

describe("DI", () => {
  // Define dependencies as interfaces
  interface Http {
    readonly get: (url: string) => Task<string>;
  }

  interface HttpDep {
    readonly http: Http;
  }

  interface Db {
    readonly save: (data: string) => Task<void>;
    readonly load: (id: string) => Task<string>;
  }

  interface DbDep {
    readonly db: Db;
  }

  // Create test implementations
  const createTestHttp = (responses: Record<string, string>): Http => ({
    get: (url) => () => ok(responses[url] ?? "not found"),
  });

  const createTestDb = (): Db & { readonly data: Map<string, string> } => {
    const data = new Map<string, string>();
    return {
      data,
      save: (value) => () => {
        data.set("last", value);
        return ok();
      },
      load: (id) => () => ok(data.get(id) ?? ""),
    };
  };

  // Custom deps must extend RunnerDeps
  type AppDeps = RunnerDeps & HttpDep & DbDep;

  // Tasks declare deps in type parameter D, receive as second arg
  const fetchUser =
    (id: string): Task<string, never, HttpDep> =>
    (run, deps) =>
      run(deps.http.get(`/users/${id}`));

  const saveUser =
    (data: string): Task<void, never, DbDep> =>
    (run, deps) =>
      run(deps.db.save(data));

  // Composition - deps flow through Runner automatically
  const syncUser =
    (id: string): Task<void, never, HttpDep & DbDep> =>
    async (run) => {
      const user = await run(fetchUser(id));
      if (!user.ok) return user;
      return await run(saveUser(user.value));
    };

  test("simple task with deps", async () => {
    const deps = createTestDeps();
    const http = createTestHttp({ "/users/1": "Alice" });

    await using run = createRunner<RunnerDeps & HttpDep>({ ...deps, http });

    const result = await run(fetchUser("1"));

    expect(result).toEqual(ok("Alice"));
  });

  test("createRunner with custom deps infers type from argument", async () => {
    interface Config {
      readonly apiUrl: string;
    }

    interface ConfigDep {
      readonly config: Config;
    }

    const deps = createTestDeps();
    const config: Config = { apiUrl: "https://api.example.com" };
    const customDeps = { ...deps, config };

    await using run = createRunner(customDeps);

    // Type is inferred from argument
    expectTypeOf(run).toEqualTypeOf<Runner<typeof customDeps>>();

    const task: Task<string, never, ConfigDep> = (_run, deps) =>
      ok(deps.config.apiUrl);

    const result = await run(task);

    expect(result).toEqual(ok("https://api.example.com"));
  });

  test("createRunner without args returns Runner<RunnerDeps>", async () => {
    await using run = createRunner();

    expectTypeOf(run).toEqualTypeOf<Runner>();
  });

  test("runner rejects task with missing deps", async () => {
    const task: Task<void, never, HttpDep> = () => ok();
    await using run = createRunner();

    // @ts-expect-error Property 'http' is missing in type 'RunnerDeps'...
    run(task);
  });

  test("fiber.run preserves deps type", async () => {
    const deps = createTestDeps();
    const http = createTestHttp({ "/users/1": "Alice" });

    await using run = createRunner<RunnerDeps & HttpDep>({ ...deps, http });

    const fiber = run(fetchUser("1"));

    expectTypeOf(fiber).toEqualTypeOf<
      Fiber<string, never, RunnerDeps & HttpDep>
    >();
    expectTypeOf(fiber.run).toEqualTypeOf<Runner<RunnerDeps & HttpDep>>();

    const result = await fiber.run(fetchUser("1"));
    expect(result).toEqual(ok("Alice"));
  });

  test("composed tasks with deps", async () => {
    const deps = createTestDeps();
    const http = createTestHttp({ "/users/1": "Alice" });
    const db = createTestDb();

    await using run = createRunner<AppDeps>({ ...deps, http, db });

    const result = await run(syncUser("1"));

    expect(result).toEqual(ok());
    expect(db.data.get("last")).toBe("Alice");
  });

  test("larger composition with multiple operations", async () => {
    const deps = createTestDeps();

    interface Logger {
      readonly log: (msg: string) => void;
    }

    interface LoggerDep {
      readonly logger: Logger;
    }

    const logs: Array<string> = [];
    const logger: Logger = { log: (msg) => logs.push(msg) };
    const http = createTestHttp({
      "/users/1": "Alice",
      "/users/2": "Bob",
    });
    const db = createTestDb();

    // Task that logs before and after - adds LoggerDep
    const withLogging =
      <T, E, D>(
        label: string,
        task: Task<T, E, D>,
      ): Task<T, E, D & LoggerDep> =>
      async (run, deps) => {
        deps.logger.log(`${label}: start`);
        const result = await run(task);
        deps.logger.log(`${label}: ${result.ok ? "ok" : "err"}`);
        return result;
      };

    // Sync multiple users
    const syncUsers =
      (ids: ReadonlyArray<string>): Task<void, never, HttpDep & DbDep> =>
      async (run) => {
        for (const id of ids) {
          const result = await run(syncUser(id));
          if (!result.ok) return result;
        }
        return ok();
      };

    // Full pipeline with logging
    const syncAllWithLogging: Task<void, never, HttpDep & DbDep & LoggerDep> =
      withLogging("syncAll", syncUsers(["1", "2"]));

    type AllDeps = RunnerDeps & HttpDep & DbDep & LoggerDep;

    await using run = createRunner<AllDeps>({ ...deps, http, db, logger });

    const result = await run(syncAllWithLogging);

    expect(result).toEqual(ok());
    expect(logs).toEqual(["syncAll: start", "syncAll: ok"]);
    expect(db.data.get("last")).toBe("Bob");
  });

  test("timeout with deps", async () => {
    const deps = createTestDeps();
    const http = createTestHttp({ "/users/1": "Alice" });

    await using run = createRunner<RunnerDeps & HttpDep>({ ...deps, http });

    // timeout should preserve D from wrapped task
    const fetchWithTimeout = timeout(fetchUser("1"), "5s");
    const result = await run(fetchWithTimeout);

    expect(result).toEqual(ok("Alice"));
  });

  test("race with deps", async () => {
    const deps = createTestDeps();
    const http = createTestHttp({
      "/users/1": "Alice",
      "/users/2": "Bob",
    });
    await using run = createRunner<RunnerDeps & HttpDep>({ ...deps, http });

    // race should preserve D from all tasks
    const result = await run(race([fetchUser("1"), fetchUser("2")]));

    // One of them wins
    expect(result.ok).toBe(true);
    expect(["Alice", "Bob"]).toContain((result as { value: string }).value);
  });

  test("retry with deps", async () => {
    const deps = createTestDeps();

    interface NetworkError {
      readonly type: "NetworkError";
    }

    interface HttpWithError {
      readonly get: (url: string) => Task<string, NetworkError>;
    }

    interface HttpWithErrorDep {
      readonly http: HttpWithError;
    }

    let attempts = 0;
    const http: HttpWithError = {
      get:
        (url): Task<string, NetworkError> =>
        () => {
          attempts++;
          if (attempts < 3) return err<NetworkError>({ type: "NetworkError" });
          return ok(url.split("/").pop()!);
        },
    };

    await using run = createRunner<RunnerDeps & HttpWithErrorDep>({
      ...deps,
      http,
      time: createTime(),
    });

    const fetchUserWithError =
      (id: string): Task<string, NetworkError, HttpWithErrorDep> =>
      (run, deps) =>
        run(deps.http.get(`/users/${id}`));

    const result = await run(
      retry(fetchUserWithError("Alice"), take(3)(spaced("1ms"))),
    );

    expect(result).toEqual(ok("Alice"));
    expect(attempts).toBe(3);
  });
});

describe("concurrency", () => {
  describe("withConcurrency", () => {
    test("defaults to max concurrency when passed only a task", async () => {
      await using run = createRunner();

      const events: Array<string> = [];
      const canFinish = Promise.withResolvers<void>();

      const createTask =
        (id: number): Task<number> =>
        async () => {
          events.push(`start ${id}`);
          await canFinish.promise;
          events.push(`end ${id}`);
          return ok(id);
        };

      const fiber = run(
        withConcurrency(all([createTask(1), createTask(2), createTask(3)])),
      );

      expect(events).toEqual(["start 1", "start 2", "start 3"]);

      canFinish.resolve();
      const result = await fiber;

      expect(result).toEqual(ok([1, 2, 3]));
    });

    test("inherits concurrency", async () => {
      await using run = createRunner();

      const events: Array<string> = [];
      const canFinish = Promise.withResolvers<void>();

      const createTask =
        (id: number): Task<number> =>
        async () => {
          events.push(`start ${id}`);
          await canFinish.promise;
          events.push(`end ${id}`);
          return ok(id);
        };

      const fiber = run(
        withConcurrency(2, (run) =>
          run(
            all([createTask(1), createTask(2), createTask(3), createTask(4)]),
          ),
        ),
      );

      // Only 2 tasks should start (inherited)
      await Promise.resolve();
      expect(events).toEqual(["start 1", "start 2"]);

      canFinish.resolve();
      const result = await fiber;

      expect(result).toEqual(ok([1, 2, 3, 4]));
    });

    test("nested withConcurrency overrides parent", async () => {
      await using run = createRunner();

      const events: Array<string> = [];
      const canFinish = Promise.withResolvers<void>();

      const createTask =
        (id: number): Task<number> =>
        async () => {
          events.push(`start ${id}`);
          await canFinish.promise;
          events.push(`end ${id}`);
          return ok(id);
        };

      const fiber = run(
        withConcurrency(5, (run) =>
          run(
            withConcurrency(1, (run) =>
              run(all([createTask(1), createTask(2), createTask(3)])),
            ),
          ),
        ),
      );

      // Only 1 task should start (inner concurrency overrides)
      await Promise.resolve();
      await Promise.resolve();
      expect(events).toEqual(["start 1"]);

      canFinish.resolve();
      const result = await fiber;

      expect(result).toEqual(ok([1, 2, 3]));
    });

    test("default concurrency is sequential", async () => {
      await using run = createRunner();

      const events: Array<string> = [];

      const createTask =
        (id: number): Task<number> =>
        () => {
          events.push(`start ${id}`);
          events.push(`end ${id}`);
          return ok(id);
        };

      // Default is sequential, tasks run one at a time
      const result = await run(
        all([createTask(1), createTask(2), createTask(3)]),
      );

      // Sequential: 1 starts and finishes, then 2, then 3
      expect(events).toEqual([
        "start 1",
        "end 1",
        "start 2",
        "end 2",
        "start 3",
        "end 3",
      ]);
      expect(result).toEqual(ok([1, 2, 3]));
    });

    test("abort propagates to all tasks", async () => {
      await using run = createRunner();

      const events: Array<string> = [];
      const canFinish = Promise.withResolvers<void>();

      const createTask =
        (id: number): Task<number> =>
        async ({ onAbort }) => {
          events.push(`start ${id}`);
          onAbort(() => events.push(`abort ${id}`));
          await canFinish.promise;
          events.push(`end ${id}`);
          return ok(id);
        };

      const fiber = run(
        withConcurrency(all([createTask(1), createTask(2), createTask(3)])),
      );

      await Promise.resolve();
      expect(events).toEqual(["start 1", "start 2", "start 3"]);

      fiber.abort();
      canFinish.resolve();
      const result = await fiber;

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(AbortError.is(result.error)).toBe(true);
      }
      expect(events).toContain("abort 1");
      expect(events).toContain("abort 2");
      expect(events).toContain("abort 3");
    });

    test("unabortable task does not block error from returning", async () => {
      // Not using `await using` because disposal waits for all fibers to complete,
      // including the unabortable task (10s). We want to verify all() returns
      // promptly on error without blocking on unabortable tasks.
      const run = createRunner();

      let unabortableCompleted = false;

      const failingTask: Task<void, { type: "MyError" }> = () =>
        err({ type: "MyError" });

      const unabortableTask = unabortable(async (run) => {
        await run(sleep("10s"));
        unabortableCompleted = true;
        return ok("done");
      });

      const start = Date.now();
      const result = await run(
        withConcurrency(all([unabortableTask, failingTask])),
      );
      const elapsed = Date.now() - start;

      // all returns promptly with error, doesn't wait for unabortable task
      expect(result).toEqual(err({ type: "MyError" }));
      expect(elapsed).toBeLessThan(50);
      expect(unabortableCompleted).toBe(false);
    });
  });

  describe("Deferred", () => {
    test("resolves with ok", async () => {
      await using run = createRunner();

      const { task, resolve } = createDeferred<string, MyError>();

      const fiber = run(task);
      resolve(ok("value"));

      const result = await fiber;
      expect(result).toEqual(ok("value"));
    });

    test("resolves with error", async () => {
      await using run = createRunner();

      const { task, resolve } = createDeferred<string, MyError>();

      const fiber = run(task);
      resolve(err({ type: "MyError" }));

      const result = await fiber;
      expect(result).toEqual(err({ type: "MyError" }));
    });

    test("resolves with AbortError when fiber aborted", async () => {
      await using run = createRunner();

      const { task } = createDeferred<string, MyError>();

      const fiber = run(task);
      fiber.abort("stop");

      const result = await fiber;
      expect(result).toEqual(err({ type: "AbortError", reason: "stop" }));
    });

    test("resolve returns true only on first call", () => {
      const { resolve } = createDeferred<string, MyError>();

      expect(resolve(ok("value"))).toBe(true);
      expect(resolve(ok("ignored"))).toBe(false);
    });

    test("resolve still works after fiber abort", async () => {
      await using run = createRunner();

      const { task, resolve } = createDeferred<string, MyError>();

      const fiber = run(task);
      fiber.abort("stop");

      await fiber;

      // Fiber abort doesn't affect Deferred state - it can still be resolved
      expect(resolve(ok("value"))).toBe(true);
      expect(resolve(ok("ignored"))).toBe(false);
    });

    test("aborting one does not affect other", async () => {
      await using run = createRunner();

      const { task, resolve } = createDeferred<string, MyError>();

      const fiber1 = run(task);
      const fiber2 = run(task);
      const fiber3 = run(task);

      // Abort only fiber2
      fiber2.abort("stop fiber2");

      // fiber2 should get AbortError
      const result2 = await fiber2;
      expect(result2).toEqual(
        err({ type: "AbortError", reason: "stop fiber2" }),
      );

      // fiber1 and fiber3 should still be pending, resolve them
      resolve(ok("value"));

      const result1 = await fiber1;
      const result3 = await fiber3;

      expect(result1).toEqual(ok("value"));
      expect(result3).toEqual(ok("value"));
    });

    test("dispose aborts waiting fibers", async () => {
      await using run = createRunner();

      const deferred = createDeferred<string, MyError>();

      const fiber1 = run(deferred.task);
      const fiber2 = run(deferred.task);

      deferred[Symbol.dispose]();

      const result1 = await fiber1;
      const result2 = await fiber2;

      expect(result1).toEqual(err(deferredDisposedError));
      expect(result2).toEqual(err(deferredDisposedError));
    });

    test("task returns immediately when already resolved", async () => {
      await using run = createRunner();

      const { task, resolve } = createDeferred<string, MyError>();

      // Resolve before running the task
      resolve(ok("pre-resolved"));

      const result = await run(task);
      expect(result).toEqual(ok("pre-resolved"));
    });
  });

  describe("Gate", () => {
    test("wait blocks until gate is opened", async () => {
      await using run = createRunner();

      const gate = createGate();
      const events: Array<string> = [];

      const fiber = run(async (run) => {
        events.push("waiting");
        const result = await run(gate.wait);
        if (!result.ok) return result;
        events.push("passed");
        return ok();
      });

      await Promise.resolve();
      expect(events).toEqual(["waiting"]);
      expect(gate.isOpen()).toBe(false);

      gate.open();
      await fiber;

      expect(events).toEqual(["waiting", "passed"]);
      expect(gate.isOpen()).toBe(true);
    });

    test("wait returns immediately when gate is already open", async () => {
      await using run = createRunner();

      const gate = createGate();
      gate.open();

      const result = await run(gate.wait);

      expect(result).toEqual(ok());
    });

    test("multiple tasks proceed when gate opens", async () => {
      await using run = createRunner();

      const gate = createGate();
      const events: Array<string> = [];

      const createWaiter =
        (id: number): Task<void, DeferredDisposedError> =>
        async (run) => {
          events.push(`waiting ${id}`);
          const r = await run(gate.wait);
          if (!r.ok) return r;
          events.push(`passed ${id}`);
          return ok();
        };

      const fiber1 = run(createWaiter(1));
      const fiber2 = run(createWaiter(2));
      const fiber3 = run(createWaiter(3));

      await Promise.resolve();
      expect(events).toEqual(["waiting 1", "waiting 2", "waiting 3"]);

      gate.open();
      await Promise.all([fiber1, fiber2, fiber3]);

      expect(events).toEqual([
        "waiting 1",
        "waiting 2",
        "waiting 3",
        "passed 1",
        "passed 2",
        "passed 3",
      ]);
    });

    test("close makes future tasks wait", async () => {
      await using run = createRunner();

      const gate = createGate();
      const events: Array<string> = [];

      gate.open();
      const result1 = await run(gate.wait);
      expect(result1).toEqual(ok());

      gate.close();
      expect(gate.isOpen()).toBe(false);

      const fiber = run(async (run) => {
        events.push("waiting after close");
        const r = await run(gate.wait);
        if (!r.ok) return r;
        events.push("passed after reopen");
        return ok();
      });

      await Promise.resolve();
      expect(events).toEqual(["waiting after close"]);

      gate.open();
      await fiber;

      expect(events).toEqual(["waiting after close", "passed after reopen"]);
    });

    test("abort while waiting returns AbortError", async () => {
      await using run = createRunner();

      const gate = createGate();

      const fiber = run(gate.wait);
      fiber.abort("cancelled");

      const result = await fiber;
      expect(result).toEqual(err({ type: "AbortError", reason: "cancelled" }));
    });

    test("preserves deps type", () => {
      interface GateDeps {
        readonly foo: string;
      }

      const gate = createGate<GateDeps>();

      expectTypeOf(gate.wait).toEqualTypeOf<
        Task<void, DeferredDisposedError, GateDeps>
      >();
    });

    test("dispose aborts waiting tasks", async () => {
      await using run = createRunner();

      const gate = createGate();

      const fiber1 = run(gate.wait);
      const fiber2 = run(gate.wait);

      gate[Symbol.dispose]();

      const result1 = await fiber1;
      const result2 = await fiber2;

      expect(result1).toEqual(err(deferredDisposedError));
      expect(result2).toEqual(err(deferredDisposedError));
    });

    test("dispose is idempotent", () => {
      const gate = createGate();

      gate[Symbol.dispose]();
      gate[Symbol.dispose]();
      gate[Symbol.dispose]();

      expect(gate.isOpen()).toBe(false);
    });

    test("open is idempotent", () => {
      const gate = createGate();

      gate.open();
      expect(gate.isOpen()).toBe(true);

      gate.open();
      gate.open();
      expect(gate.isOpen()).toBe(true);
    });

    test("close is idempotent", () => {
      const gate = createGate();

      // Already closed, close again
      gate.close();
      gate.close();
      expect(gate.isOpen()).toBe(false);

      gate.open();
      gate.close();
      gate.close();
      expect(gate.isOpen()).toBe(false);
    });

    test("open and close are no-op after dispose", () => {
      const gate = createGate();

      gate[Symbol.dispose]();

      // Should not throw or change state
      gate.open();
      gate.close();
      expect(gate.isOpen()).toBe(false);
    });

    test("wait returns DeferredDisposedError after dispose", async () => {
      await using run = createRunner();

      const gate = createGate();
      gate[Symbol.dispose]();

      const result = await run(gate.wait);

      expect(result).toEqual(err(deferredDisposedError));
    });
  });

  describe("Semaphore", () => {
    test("runs a task", async () => {
      await using run = createRunner();

      const semaphore = createSemaphore(1);

      const result = await run(semaphore.withPermit(() => ok("ran")));

      expect(result).toEqual(ok("ran"));
    });

    test("limits concurrent tasks to permit count", async () => {
      await using run = createRunner();

      const semaphore = createSemaphore(2);
      const events: Array<string> = [];

      const task1Started = Promise.withResolvers<void>();
      const task2Started = Promise.withResolvers<void>();
      const canFinish = Promise.withResolvers<void>();

      const createTask =
        (id: number, started: () => void): Task<void> =>
        async () => {
          events.push(`start ${id}`);
          started();
          await canFinish.promise;
          events.push(`end ${id}`);
          return ok();
        };

      // Start 3 tasks with 2 permits
      const fiber1 = run(
        semaphore.withPermit(createTask(1, task1Started.resolve)),
      );
      const fiber2 = run(
        semaphore.withPermit(createTask(2, task2Started.resolve)),
      );

      await task1Started.promise;
      await task2Started.promise;

      // Third task should be queued
      const task3Started = Promise.withResolvers<void>();
      const fiber3 = run(
        semaphore.withPermit(createTask(3, task3Started.resolve)),
      );

      await Promise.resolve();
      expect(events).toEqual(["start 1", "start 2"]);

      // Let task 1 finish
      canFinish.resolve();
      await fiber1;

      // Now task 3 should start
      await task3Started.promise;
      expect(events).toContain("start 3");

      await Promise.all([fiber2, fiber3]);
    });

    test("queues tasks when permits exhausted", async () => {
      await using run = createRunner();

      const semaphore = createSemaphore(1);
      const events: Array<string> = [];

      const task1Started = Promise.withResolvers<void>();
      const task1CanFinish = Promise.withResolvers<void>();

      const fiber1 = run(
        semaphore.withPermit(async () => {
          events.push("start 1");
          task1Started.resolve();
          await task1CanFinish.promise;
          events.push("end 1");
          return ok();
        }),
      );

      await task1Started.promise;

      // Second task should wait
      const fiber2 = run(
        semaphore.withPermit(() => {
          events.push("task 2 ran");
          return ok();
        }),
      );

      await Promise.resolve();
      expect(events).toEqual(["start 1"]);

      // Let first task finish
      task1CanFinish.resolve();
      await fiber1;
      await fiber2;

      expect(events).toEqual(["start 1", "end 1", "task 2 ran"]);
    });

    test("returns task result", async () => {
      await using run = createRunner();

      const semaphore = createSemaphore(1);

      const okResult = await run(semaphore.withPermit(() => ok(42)));
      const errResult = await run(
        semaphore.withPermit(() => err({ type: "MyError" })),
      );

      expect(okResult).toEqual(ok(42));
      expect(errResult).toEqual(err({ type: "MyError" }));
    });

    test("releases permit when task succeeds", async () => {
      await using run = createRunner();

      const semaphore = createSemaphore(1);

      // First task succeeds
      await run(semaphore.withPermit(() => ok("first")));

      // Second task should run immediately (permit released)
      let secondRan = false;
      await run(
        semaphore.withPermit(() => {
          secondRan = true;
          return ok();
        }),
      );

      expect(secondRan).toBe(true);
    });

    test("releases permit when task fails", async () => {
      await using run = createRunner();

      const semaphore = createSemaphore(1);

      // First task fails
      await run(semaphore.withPermit(() => err({ type: "MyError" })));

      // Second task should run immediately (permit released)
      let secondRan = false;
      await run(
        semaphore.withPermit(() => {
          secondRan = true;
          return ok();
        }),
      );

      expect(secondRan).toBe(true);
    });

    test("abort while waiting removes from queue", async () => {
      await using run = createRunner();

      const semaphore = createSemaphore(1);
      const events: Array<string> = [];

      const task1Started = Promise.withResolvers<void>();
      const task1CanFinish = Promise.withResolvers<void>();

      const fiber1 = run(
        semaphore.withPermit(async () => {
          events.push("start 1");
          task1Started.resolve();
          await task1CanFinish.promise;
          events.push("end 1");
          return ok();
        }),
      );

      await task1Started.promise;

      // Second task waits
      const fiber2 = run(
        semaphore.withPermit(() => {
          events.push("task 2 ran");
          return ok();
        }),
      );

      // Abort the waiting task
      fiber2.abort("cancelled");

      const result2 = await fiber2;
      expect(result2).toEqual(err({ type: "AbortError", reason: "cancelled" }));

      // Third task should proceed when permit is released
      const fiber3 = run(
        semaphore.withPermit(() => {
          events.push("task 3 ran");
          return ok();
        }),
      );

      task1CanFinish.resolve();
      await fiber1;
      await fiber3;

      expect(events).toEqual(["start 1", "end 1", "task 3 ran"]);
    });

    test("abort while running aborts task", async () => {
      await using run = createRunner();

      const semaphore = createSemaphore(1);
      let abortReceived = false;

      const fiber = run(
        semaphore.withPermit(
          ({ signal }) =>
            new Promise<Result<void, AbortError>>((resolve) => {
              signal.addEventListener("abort", () => {
                abortReceived = true;
                resolve(err({ type: "AbortError", reason: signal.reason }));
              });
            }),
        ),
      );

      fiber.abort("stop");
      const result = await fiber;

      expect(abortReceived).toBe(true);
      expect(result).toEqual(err({ type: "AbortError", reason: "stop" }));
    });

    test("dispose aborts running tasks", async () => {
      await using run = createRunner();

      const semaphore = createSemaphore(1);
      const events: Array<string> = [];

      const taskStarted = Promise.withResolvers<void>();

      const fiber = run(
        semaphore.withPermit(({ signal }) => {
          events.push("task started");
          taskStarted.resolve();
          return new Promise<Result<void, AbortError>>((resolve) => {
            signal.addEventListener("abort", () => {
              events.push("task aborted");
              resolve(err({ type: "AbortError", reason: signal.reason }));
            });
          });
        }),
      );

      await taskStarted.promise;
      semaphore[Symbol.dispose]();

      const result = await fiber;

      expect(events).toEqual(["task started", "task aborted"]);
      expect(result).toEqual(
        err({
          type: "AbortError",
          reason: { type: "SemaphoreDisposedError" },
        }),
      );
    });

    test("dispose aborts waiting tasks", async () => {
      await using run = createRunner();

      const semaphore = createSemaphore(1);

      const task1Started = Promise.withResolvers<void>();

      // Hold the permit with a task that listens for abort
      const fiber1 = run(
        semaphore.withPermit(({ signal }) => {
          task1Started.resolve();
          return new Promise<Result<void, AbortError>>((resolve) => {
            signal.addEventListener("abort", () => {
              resolve(err({ type: "AbortError", reason: signal.reason }));
            });
          });
        }),
      );

      await task1Started.promise;

      // Waiting task
      const fiber2 = run(semaphore.withPermit(() => ok("should not run")));

      semaphore[Symbol.dispose]();

      const [result1, result2] = await Promise.all([fiber1, fiber2]);

      // Running task was aborted
      expect(result1).toEqual(
        err({
          type: "AbortError",
          reason: { type: "SemaphoreDisposedError" },
        }),
      );

      // Waiting task was aborted
      expect(result2).toEqual(
        err({
          type: "AbortError",
          reason: { type: "SemaphoreDisposedError" },
        }),
      );
    });

    test("acquire after dispose returns SemaphoreDisposedError", async () => {
      await using run = createRunner();

      const semaphore = createSemaphore(1);
      semaphore[Symbol.dispose]();

      const result = await run(
        semaphore.withPermit(() => ok("should not run")),
      );

      expect(result).toEqual(
        err({
          type: "AbortError",
          reason: { type: "SemaphoreDisposedError" },
        }),
      );
    });

    test("dispose is idempotent", () => {
      const semaphore = createSemaphore(1);

      semaphore[Symbol.dispose]();
      semaphore[Symbol.dispose]();
      semaphore[Symbol.dispose]();

      // Should not throw
    });

    test("preserves FIFO order for queued tasks", async () => {
      await using run = createRunner();

      const semaphore = createSemaphore(1);
      const events: Array<string> = [];

      const task1Started = Promise.withResolvers<void>();
      const task1CanFinish = Promise.withResolvers<void>();

      // Hold the permit
      const fiber1 = run(
        semaphore.withPermit(async () => {
          task1Started.resolve();
          await task1CanFinish.promise;
          events.push("task 1");
          return ok();
        }),
      );

      await task1Started.promise;

      // Queue tasks in order
      const fiber2 = run(
        semaphore.withPermit(() => {
          events.push("task 2");
          return ok();
        }),
      );
      const fiber3 = run(
        semaphore.withPermit(() => {
          events.push("task 3");
          return ok();
        }),
      );
      const fiber4 = run(
        semaphore.withPermit(() => {
          events.push("task 4");
          return ok();
        }),
      );

      task1CanFinish.resolve();
      await Promise.all([fiber1, fiber2, fiber3, fiber4]);

      expect(events).toEqual(["task 1", "task 2", "task 3", "task 4"]);
    });

    test("multiple permits allow concurrent execution", async () => {
      await using run = createRunner();

      const semaphore = createSemaphore(3);
      let concurrent = 0;
      let maxConcurrent = 0;

      const taskFinished = Promise.withResolvers<void>();
      let finishedCount = 0;

      const createTask = (): Task<void> => async () => {
        concurrent += 1;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await Promise.resolve();
        concurrent -= 1;
        finishedCount += 1;
        if (finishedCount === 5) taskFinished.resolve();
        return ok();
      };

      // Run 5 tasks with 3 permits
      run(semaphore.withPermit(createTask()));
      run(semaphore.withPermit(createTask()));
      run(semaphore.withPermit(createTask()));
      run(semaphore.withPermit(createTask()));
      run(semaphore.withPermit(createTask()));

      await taskFinished.promise;

      expect(maxConcurrent).toBe(3);
    });
  });

  describe("Mutex", () => {
    test("runs tasks sequentially", async () => {
      await using run = createRunner();

      const mutex = createMutex();
      const events: Array<string> = [];

      const firstStarted = Promise.withResolvers<void>();
      const firstFinish = Promise.withResolvers<void>();
      const secondStarted = Promise.withResolvers<void>();

      const firstTask: Task<void> = async () => {
        events.push("start 1");
        firstStarted.resolve();
        await firstFinish.promise;
        events.push("end 1");
        return ok();
      };

      const secondTask: Task<void> = () => {
        events.push("start 2");
        secondStarted.resolve();
        events.push("end 2");
        return ok();
      };

      const firstFiber = run(mutex.withLock(firstTask));
      await firstStarted.promise;

      const secondFiber = run(mutex.withLock(secondTask));

      await Promise.resolve();
      expect(events).toEqual(["start 1"]);

      firstFinish.resolve();
      await firstFiber;
      await secondStarted.promise;
      await secondFiber;

      expect(events).toEqual(["start 1", "end 1", "start 2", "end 2"]);

      mutex[Symbol.dispose]();
    });
  });
});

describe("all", () => {
  test("runs tasks sequentially by default", async () => {
    await using run = createRunner();

    const events: Array<string> = [];

    const createTask =
      (id: number): Task<number> =>
      async () => {
        events.push(`start ${id}`);
        await Promise.resolve();
        events.push(`end ${id}`);
        return ok(id);
      };

    const result = await run(
      all([createTask(1), createTask(2), createTask(3)]),
    );

    expect(result).toEqual(ok([1, 2, 3]));
    expect(events).toEqual([
      "start 1",
      "end 1",
      "start 2",
      "end 2",
      "start 3",
      "end 3",
    ]);
  });

  test("returns emptyArray for empty array", async () => {
    await using run = createRunner();

    const emptyTasks: Array<Task<number>> = [];
    const result = await run(all(emptyTasks));

    expect(result).toStrictEqual(ok(emptyArray));
  });

  test("returns emptyRecord for empty record", async () => {
    await using run = createRunner();

    const emptyTasks: Record<string, Task<number>> = {};
    const result = await run(all(emptyTasks));

    expect(result).toStrictEqual(ok(emptyRecord));
  });

  test("fails fast on first error", async () => {
    await using run = createRunner();

    const events: Array<string> = [];
    const canFail = Promise.withResolvers<void>();

    const slowTask: Task<string> = async ({ signal }) => {
      events.push("slow start");
      // Wait until aborted or a very long time
      await new Promise<void>((resolve) => {
        if (signal.aborted) {
          resolve();
          return;
        }
        signal.addEventListener("abort", () => resolve(), { once: true });
      });
      if (!signal.aborted) {
        events.push("slow end");
      }
      return ok("slow");
    };

    const failingTask: Task<string, MyError> = async () => {
      events.push("fail start");
      await canFail.promise;
      events.push("fail end");
      return err({ type: "MyError" });
    };

    const fiber = run(withConcurrency(all([slowTask, failingTask])));

    expect(events).toEqual(["slow start", "fail start"]);

    // Let failing task fail
    canFail.resolve();

    const result = await fiber;

    expect(result).toEqual(err({ type: "MyError" }));
    // Slow task was aborted (no "slow end")
    expect(events).not.toContain("slow end");
  });

  test("aborts others when a task throws", async () => {
    await using run = createRunner();

    const slowObservedAbort = Promise.withResolvers<unknown>();

    const slowTask: Task<void> = async (run) => {
      await new Promise<void>((resolve) => {
        run.onAbort(() => resolve());
      });
      slowObservedAbort.resolve(run.signal.reason);
      return ok();
    };

    const throwingTask: Task<void> = () => {
      throw new Error("boom");
    };

    await expect(
      run(withConcurrency(all([slowTask, throwingTask]))),
    ).rejects.toThrow("boom");

    const slowAbortReason = await slowObservedAbort.promise;
    assert(AbortError.is(slowAbortReason));
    expect(AllAbortError.is(slowAbortReason.reason)).toBe(true);
  });

  test("propagates abort cause to other tasks", async () => {
    await using run = createRunner();

    const abortCause = { type: "TestAbort" };
    const causes: Array<unknown> = [];

    const waitForAbort: Task<void> = (run) =>
      new Promise((resolve) => {
        run.onAbort((reason) => {
          causes.push(reason);
          resolve(ok());
        });
      });

    const abortingTask: Task<void, AbortError> = () =>
      err({ type: "AbortError", reason: abortCause });

    const fiber = run(
      withConcurrency(3, all([waitForAbort, abortingTask, waitForAbort])),
    );

    const result = await fiber;

    expect(result).toEqual(err({ type: "AbortError", reason: abortCause }));
    expect(causes).toEqual([abortCause, abortCause]);
  });

  test("limits concurrency with explicit number", async () => {
    await using run = createRunner();

    const events: Array<string> = [];
    const canFinish = Promise.withResolvers<void>();

    const createTask =
      (id: number): Task<number> =>
      async () => {
        events.push(`start ${id}`);
        await canFinish.promise;
        events.push(`end ${id}`);
        return ok(id);
      };

    const fiber = run(
      withConcurrency(
        2,
        all([createTask(1), createTask(2), createTask(3), createTask(4)]),
      ),
    );

    // Only 2 tasks should start
    expect(events).toEqual(["start 1", "start 2"]);

    canFinish.resolve();
    const result = await fiber;

    expect(result).toEqual(ok([1, 2, 3, 4]));
    expect(events).toContain("start 3");
    expect(events).toContain("start 4");
  });

  test("supports struct input and returns object with same keys", async () => {
    await using run = createRunner();

    const taskA: Task<number> = () => ok(42);
    const taskB: Task<string> = () => ok("hello");
    const taskC: Task<boolean> = () => ok(true);

    const result = await run(all({ a: taskA, b: taskB, c: taskC }));

    expect(result).toEqual(ok({ a: 42, b: "hello", c: true }));
  });

  test("struct preserves types", async () => {
    await using run = createRunner();

    const struct = {
      num: (() => ok(42)) as Task<number>,
      str: (() => ok("hello")) as Task<string>,
    };

    const result = await run(all(struct));
    if (result.ok) {
      expectTypeOf(result.value.num).toEqualTypeOf<number>();
      expectTypeOf(result.value.str).toEqualTypeOf<string>();
    }
  });

  test("struct fails fast on first error", async () => {
    await using run = createRunner();

    const events: Array<string> = [];
    const canFail = Promise.withResolvers<void>();

    const goodTask: Task<string> = async ({ signal }) => {
      events.push("good start");
      await new Promise<void>((resolve) => {
        if (signal.aborted) {
          resolve();
          return;
        }
        signal.addEventListener("abort", () => resolve(), { once: true });
      });
      return ok("good");
    };

    const badTask: Task<string, MyError> = async () => {
      events.push("bad start");
      await canFail.promise;
      return err({ type: "MyError" });
    };

    const fiber = run(withConcurrency(all({ good: goodTask, bad: badTask })));

    expect(events).toEqual(["good start", "bad start"]);

    canFail.resolve();
    const result = await fiber;

    expect(result).toEqual(err({ type: "MyError" }));
  });

  test("struct returns empty object for empty input", async () => {
    await using run = createRunner();

    const result = await run(all({}));

    expect(result).toEqual(ok({}));
  });

  test("struct respects withConcurrency", async () => {
    await using run = createRunner();

    const events: Array<string> = [];
    const canFinish = Promise.withResolvers<void>();

    const createTask =
      (id: string): Task<string> =>
      async () => {
        events.push(`start ${id}`);
        await canFinish.promise;
        events.push(`end ${id}`);
        return ok(id);
      };

    const fiber = run(
      withConcurrency(
        minPositiveInt,
        all({ a: createTask("a"), b: createTask("b"), c: createTask("c") }),
      ),
    );

    // Sequential: only one at a time
    expect(events).toEqual(["start a"]);

    canFinish.resolve();
    const result = await fiber;

    expect(result).toEqual(ok({ a: "a", b: "b", c: "c" }));
  });

  test("tuple preserves types", async () => {
    await using run = createRunner();

    const result = await run(
      all([() => ok(42), () => ok("hello"), () => ok(true)]),
    );

    if (result.ok) {
      expectTypeOf(result.value).toEqualTypeOf<
        readonly [number, string, boolean]
      >();
    }
  });

  test("struct preserves readonly properties", async () => {
    await using run = createRunner();

    const readonlyStruct = {
      num: (() => ok(42)) as Task<number>,
      str: (() => ok("hello")) as Task<string>,
    } as const;

    const result = await run(all(readonlyStruct));

    if (result.ok) {
      expectTypeOf(result.value).toEqualTypeOf<{
        readonly num: number;
        readonly str: string;
      }>();
    }
  });

  test("non-empty arrays preserve types", async () => {
    await using run = createRunner();

    const tasks: NonEmptyReadonlyArray<Task<number>> = [() => ok(1)];
    const result = await run(all(tasks));

    if (result.ok) {
      expectTypeOf(result.value).toEqualTypeOf<NonEmptyReadonlyArray<number>>();
    }
  });

  test("returns promptly on external abort even when blocked", async () => {
    // Not using `await using` because disposal waits for all fibers to complete,
    // including the unabortable task (10s).
    const run = createRunner();

    let unabortableCompleted = false;

    const unabortableTask = unabortable(async (run) => {
      await run(sleep("10s"));
      unabortableCompleted = true;
      return ok();
    });

    const abortableWaitsForAbort: Task<void> = async (run) => {
      await new Promise<void>((resolve) => {
        run.onAbort(() => resolve());
      });
      return ok();
    };

    // Run sequentially (default concurrency=1): all() is effectively blocked on
    // the first task. Even then, external abort should make it return promptly.
    const fiber = run(all([unabortableTask, abortableWaitsForAbort]));

    await Promise.resolve();
    fiber.abort("cancelled");

    const result = await Promise.race([
      Promise.resolve(fiber),
      new Promise<"timeout">((resolve) => {
        setTimeout(() => resolve("timeout"), 100);
      }),
    ]);

    expect(result).not.toBe("timeout");

    const taskResult = result as Result<ReadonlyArray<void>, AbortError>;
    expect(taskResult).toEqual(
      err({ type: "AbortError", reason: "cancelled" }),
    );
    expect(unabortableCompleted).toBe(false);
  });

  test("collect: false discards results", async () => {
    await using run = createRunner();

    const events: Array<string> = [];

    const task =
      (id: number): Task<number> =>
      () => {
        events.push(`task ${id}`);
        return ok(id);
      };

    const result = await run(
      all([task(1), task(2), task(3)], { collect: false }),
    );

    expect(result).toEqual(ok(undefined));
    if (result.ok) expectTypeOf(result.value).toEqualTypeOf<void>();
    expect(events).toEqual(["task 1", "task 2", "task 3"]);
  });

  test("collect: false struct discards results", async () => {
    await using run = createRunner();

    const events: Array<string> = [];

    const task =
      (id: string): Task<string> =>
      () => {
        events.push(`task ${id}`);
        return ok(id);
      };

    const result = await run(
      all({ a: task("a"), b: task("b") }, { collect: false }),
    );

    expect(result).toEqual(ok(undefined));
    if (result.ok) expectTypeOf(result.value).toEqualTypeOf<void>();
    expect(events).toEqual(["task a", "task b"]);
  });
});

describe("allSettled", () => {
  test("returns emptyArray for empty array", async () => {
    await using run = createRunner();

    const emptyTasks: Array<Task<number>> = [];
    const result = await run(allSettled(emptyTasks));

    expect(result).toStrictEqual(ok(emptyArray));
  });

  test("returns emptyRecord for empty record", async () => {
    await using run = createRunner();

    const emptyTasks: Record<string, Task<number>> = {};
    const result = await run(allSettled(emptyTasks));

    expect(result).toStrictEqual(ok(emptyRecord));
  });

  test("runs tasks sequentially by default", async () => {
    await using run = createRunner();

    const events: Array<string> = [];

    const createTask =
      (id: number): Task<number> =>
      async () => {
        events.push(`start ${id}`);
        await Promise.resolve();
        events.push(`end ${id}`);
        return ok(id);
      };

    const result = await run(
      allSettled([createTask(1), createTask(2), createTask(3)]),
    );

    expect(result).toEqual(ok([ok(1), ok(2), ok(3)]));
    expect(events).toEqual([
      "start 1",
      "end 1",
      "start 2",
      "end 2",
      "start 3",
      "end 3",
    ]);
  });

  test("runs all tasks even when some fail", async () => {
    await using run = createRunner();

    const events: Array<string> = [];

    const successTask =
      (id: number): Task<number> =>
      () => {
        events.push(`success ${id}`);
        return ok(id);
      };

    const failTask =
      (id: number): Task<number, MyError> =>
      () => {
        events.push(`fail ${id}`);
        return err({ type: "MyError" });
      };

    const result = await run(
      allSettled([successTask(1), failTask(2), successTask(3)]),
    );

    expect(result).toEqual(ok([ok(1), err({ type: "MyError" }), ok(3)]));
    expect(events).toEqual(["success 1", "fail 2", "success 3"]);
  });

  test("non-empty arrays preserve types", async () => {
    await using run = createRunner();

    const tasks: NonEmptyReadonlyArray<Task<number, MyError>> = [() => ok(1)];
    const result = await run(allSettled(tasks));

    if (result.ok) {
      expectTypeOf(result.value).toEqualTypeOf<
        NonEmptyReadonlyArray<Result<number, MyError | AbortError>>
      >();
    }
  });

  test("supports struct input", async () => {
    await using run = createRunner();

    const taskA: Task<number> = () => ok(42);
    const taskB: Task<string, MyError> = () => err({ type: "MyError" });
    const taskC: Task<boolean> = () => ok(true);

    const result = await run(allSettled({ a: taskA, b: taskB, c: taskC }));

    expect(result).toEqual(
      ok({
        a: ok(42),
        b: err({ type: "MyError" }),
        c: ok(true),
      }),
    );
  });

  test("struct returns empty object for empty input", async () => {
    await using run = createRunner();

    const result = await run(allSettled({}));

    expect(result).toEqual(ok({}));
  });

  test("struct preserves types", async () => {
    await using run = createRunner();

    const struct = {
      num: (() => ok(42)) as Task<number>,
      str: (() => ok("hello")) as Task<string>,
    };

    const result = await run(allSettled(struct));
    if (result.ok) {
      expectTypeOf(result.value.num).toEqualTypeOf<
        Result<number, AbortError>
      >();
      expectTypeOf(result.value.str).toEqualTypeOf<
        Result<string, AbortError>
      >();
    }
  });

  test("struct preserves readonly properties", async () => {
    await using run = createRunner();

    const readonlyStruct = {
      num: (() => ok(42)) as Task<number>,
      str: (() => ok("hello")) as Task<string>,
    } as const;

    const result = await run(allSettled(readonlyStruct));

    if (result.ok) {
      expectTypeOf(result.value).toEqualTypeOf<{
        readonly num: Result<number, AbortError>;
        readonly str: Result<string, AbortError>;
      }>();
    }
  });

  test("struct respects withConcurrency", async () => {
    await using run = createRunner();

    const events: Array<string> = [];
    const canFinish = Promise.withResolvers<void>();

    const createTask =
      (id: string): Task<string> =>
      async () => {
        events.push(`start ${id}`);
        await canFinish.promise;
        events.push(`end ${id}`);
        return ok(id);
      };

    const fiber = run(
      withConcurrency(
        minPositiveInt,
        allSettled({
          a: createTask("a"),
          b: createTask("b"),
          c: createTask("c"),
        }),
      ),
    );

    // Sequential: only one at a time
    expect(events).toEqual(["start a"]);

    canFinish.resolve();
    const result = await fiber;

    expect(result).toEqual(
      ok({
        a: ok("a"),
        b: ok("b"),
        c: ok("c"),
      }),
    );
  });

  test("respects withConcurrency", async () => {
    await using run = createRunner();

    const events: Array<string> = [];
    const canFinish = Promise.withResolvers<void>();

    const createTask =
      (id: number): Task<number> =>
      async () => {
        events.push(`start ${id}`);
        await canFinish.promise;
        events.push(`end ${id}`);
        return ok(id);
      };

    const fiber = run(
      withConcurrency(
        2,
        allSettled([createTask(1), createTask(2), createTask(3)]),
      ),
    );

    // Only 2 tasks should start
    expect(events).toEqual(["start 1", "start 2"]);

    canFinish.resolve();
    const result = await fiber;

    expect(result).toEqual(ok([ok(1), ok(2), ok(3)]));
  });

  test("tuple preserves types", async () => {
    await using run = createRunner();

    const result = await run(
      allSettled([
        () => ok(42),
        () => err({ type: "MyError" } as MyError),
        () => ok("hello"),
      ]),
    );

    if (result.ok) {
      expectTypeOf(result.value).toEqualTypeOf<
        readonly [
          Result<number, AbortError>,
          Result<never, MyError | AbortError>,
          Result<string, AbortError>,
        ]
      >();
    }
  });

  test("aborts others when a task throws", async () => {
    await using run = createRunner();

    const slowObservedAbort = Promise.withResolvers<unknown>();

    const slowTask: Task<void> = async (run) => {
      await new Promise<void>((resolve) => {
        run.onAbort(() => resolve());
      });
      slowObservedAbort.resolve(run.signal.reason);
      return ok();
    };

    const throwingTask: Task<void> = () => {
      throw new Error("boom");
    };

    await expect(
      run(withConcurrency(allSettled([slowTask, throwingTask]))),
    ).rejects.toThrow("boom");

    const slowAbortReason = await slowObservedAbort.promise;
    assert(AbortError.is(slowAbortReason));
    expect(AllSettledAbortError.is(slowAbortReason.reason)).toBe(true);
  });

  test("collect: false discards results", async () => {
    await using run = createRunner();

    const events: Array<string> = [];

    const task =
      (id: number): Task<number, MyError> =>
      () => {
        events.push(`task ${id}`);
        return id === 2 ? err({ type: "MyError" }) : ok(id);
      };

    const result = await run(
      allSettled([task(1), task(2), task(3)], { collect: false }),
    );

    expect(result).toEqual(ok(undefined));
    if (result.ok) expectTypeOf(result.value).toEqualTypeOf<void>();
    expect(events).toEqual(["task 1", "task 2", "task 3"]);
  });

  test("collect: false struct discards results", async () => {
    await using run = createRunner();

    const events: Array<string> = [];

    const task =
      (id: string): Task<string, MyError> =>
      () => {
        events.push(`task ${id}`);
        return id === "b" ? err({ type: "MyError" }) : ok(id);
      };

    const result = await run(
      allSettled({ a: task("a"), b: task("b") }, { collect: false }),
    );

    expect(result).toEqual(ok(undefined));
    if (result.ok) expectTypeOf(result.value).toEqualTypeOf<void>();
    expect(events).toEqual(["task a", "task b"]);
  });
});

describe("map", () => {
  test("returns emptyArray for empty array", async () => {
    await using run = createRunner();

    const result = await run(
      map(
        [] as Array<number>,
        (n): Task<number> =>
          () =>
            ok(n * 2),
      ),
    );

    expect(result).toStrictEqual(ok(emptyArray));
  });

  test("returns emptyRecord for empty record", async () => {
    await using run = createRunner();

    const result = await run(
      map(
        {} as Record<string, number>,
        (n): Task<number> =>
          () =>
            ok(n * 2),
      ),
    );

    expect(result).toStrictEqual(ok(emptyRecord));
  });

  test("maps items to tasks and collects results", async () => {
    await using run = createRunner();

    const items = [1, 2, 3];
    const double =
      (n: number): Task<number> =>
      () =>
        ok(n * 2);

    const result = await run(map(items, double));

    expect(result).toEqual(ok([2, 4, 6]));
  });

  test("runs sequentially by default", async () => {
    await using run = createRunner();

    const events: Array<string> = [];

    const trackingTask =
      (id: number): Task<number> =>
      async () => {
        events.push(`start ${id}`);
        await Promise.resolve();
        events.push(`end ${id}`);
        return ok(id);
      };

    await run(map([1, 2, 3], trackingTask));

    expect(events).toEqual([
      "start 1",
      "end 1",
      "start 2",
      "end 2",
      "start 3",
      "end 3",
    ]);
  });

  test("respects withConcurrency", async () => {
    await using run = createRunner();

    const events: Array<string> = [];

    const trackingTask =
      (id: number): Task<number> =>
      async () => {
        events.push(`start ${id}`);
        await Promise.resolve();
        events.push(`end ${id}`);
        return ok(id);
      };

    await run(withConcurrency(2, map([1, 2, 3], trackingTask)));

    // With concurrency 2, tasks 1 and 2 start together
    expect(events[0]).toBe("start 1");
    expect(events[1]).toBe("start 2");
  });

  test("fails fast on first error", async () => {
    await using run = createRunner();

    const mayFail =
      (n: number): Task<number, MyError> =>
      () =>
        n === 2 ? err({ type: "MyError" }) : ok(n);

    const result = await run(map([1, 2, 3], mayFail));

    expect(result).toEqual(err({ type: "MyError" }));
  });

  test("aborts others when a task fails", async () => {
    await using run = createRunner();

    const slowObservedAbort = Promise.withResolvers<unknown>();

    const slowTask =
      (_n: number): Task<number> =>
      async (run) => {
        await new Promise<void>((resolve) => {
          run.onAbort(() => resolve());
        });
        slowObservedAbort.resolve(run.signal.reason);
        return ok(0);
      };

    const failingTask =
      (n: number): Task<number, MyError> =>
      () =>
        n === 2 ? err({ type: "MyError" }) : ok(n);

    const result = await run(
      withConcurrency(
        map([1, 2], (n) => (n === 1 ? slowTask(n) : failingTask(n))),
      ),
    );

    expect(result).toEqual(err({ type: "MyError" }));

    const slowAbortReason = await slowObservedAbort.promise;
    assert(AbortError.is(slowAbortReason));
    expect(MapAbortError.is(slowAbortReason.reason)).toBe(true);
  });

  test("supports struct input and returns object with same keys", async () => {
    await using run = createRunner();

    const double =
      (n: number): Task<number> =>
      () =>
        ok(n * 2);

    const result = await run(map({ a: 1, b: 2, c: 3 }, double));

    expect(result).toEqual(ok({ a: 2, b: 4, c: 6 }));
  });

  test("collect: false discards results", async () => {
    await using run = createRunner();

    const events: Array<string> = [];

    const task =
      (id: number): Task<number> =>
      () => {
        events.push(`task ${id}`);
        return ok(id);
      };

    const result = await run(map([1, 2, 3], task, { collect: false }));

    expect(result).toEqual(ok(undefined));
    if (result.ok) expectTypeOf(result.value).toEqualTypeOf<void>();
    expect(events).toEqual(["task 1", "task 2", "task 3"]);
  });

  test("collect: false struct discards results", async () => {
    await using run = createRunner();

    const events: Array<string> = [];

    const task =
      (id: string): Task<string> =>
      () => {
        events.push(`task ${id}`);
        return ok(id);
      };

    const result = await run(map({ a: "a", b: "b" }, task, { collect: false }));

    expect(result).toEqual(ok(undefined));
    if (result.ok) expectTypeOf(result.value).toEqualTypeOf<void>();
    expect(events).toEqual(["task a", "task b"]);
  });
});

describe("mapSettled", () => {
  test("returns emptyArray for empty array", async () => {
    await using run = createRunner();

    const result = await run(
      mapSettled(
        [] as Array<number>,
        (n): Task<number> =>
          () =>
            ok(n * 2),
      ),
    );

    expect(result).toStrictEqual(ok(emptyArray));
  });

  test("returns emptyRecord for empty record", async () => {
    await using run = createRunner();

    const result = await run(
      mapSettled(
        {} as Record<string, number>,
        (n): Task<number> =>
          () =>
            ok(n * 2),
      ),
    );

    expect(result).toStrictEqual(ok(emptyRecord));
  });

  test("maps items and collects all results even if some fail", async () => {
    await using run = createRunner();

    const events: Array<string> = [];
    const items = [1, 2, 3];
    const mayFail =
      (n: number): Task<number, MyError> =>
      () => {
        events.push(`task ${n}`);
        return n === 2 ? err({ type: "MyError" }) : ok(n * 10);
      };

    const result = await run(mapSettled(items, mayFail));

    expect(result).toEqual(ok([ok(10), err({ type: "MyError" }), ok(30)]));
    expect(events).toEqual(["task 1", "task 2", "task 3"]);
  });

  test("supports struct input and returns object with same keys", async () => {
    await using run = createRunner();

    const mayFail =
      (n: number): Task<number, MyError> =>
      () =>
        n === 2 ? err({ type: "MyError" }) : ok(n * 10);

    const result = await run(mapSettled({ a: 1, b: 2, c: 3 }, mayFail));

    expect(result).toEqual(
      ok({ a: ok(10), b: err({ type: "MyError" }), c: ok(30) }),
    );
  });

  test("runs sequentially by default", async () => {
    await using run = createRunner();

    const events: Array<string> = [];

    const trackingTask =
      (id: number): Task<number> =>
      async () => {
        events.push(`start ${id}`);
        await Promise.resolve();
        events.push(`end ${id}`);
        return ok(id);
      };

    await run(mapSettled([1, 2, 3], trackingTask));

    expect(events).toEqual([
      "start 1",
      "end 1",
      "start 2",
      "end 2",
      "start 3",
      "end 3",
    ]);
  });

  test("respects withConcurrency", async () => {
    await using run = createRunner();

    const events: Array<string> = [];

    const trackingTask =
      (id: number): Task<number> =>
      async () => {
        events.push(`start ${id}`);
        await Promise.resolve();
        events.push(`end ${id}`);
        return ok(id);
      };

    await run(withConcurrency(2, mapSettled([1, 2, 3], trackingTask)));

    // With concurrency 2, tasks 1 and 2 start together
    expect(events[0]).toBe("start 1");
    expect(events[1]).toBe("start 2");
  });

  test("collect: false discards results", async () => {
    await using run = createRunner();

    const events: Array<string> = [];

    const task =
      (id: number): Task<number, MyError> =>
      () => {
        events.push(`task ${id}`);
        return id === 2 ? err({ type: "MyError" }) : ok(id);
      };

    const result = await run(mapSettled([1, 2, 3], task, { collect: false }));

    expect(result).toEqual(ok(undefined));
    if (result.ok) expectTypeOf(result.value).toEqualTypeOf<void>();
    expect(events).toEqual(["task 1", "task 2", "task 3"]);
  });

  test("collect: false struct discards results", async () => {
    await using run = createRunner();

    const events: Array<string> = [];

    const task =
      (id: string): Task<string, MyError> =>
      () => {
        events.push(`task ${id}`);
        return id === "b" ? err({ type: "MyError" }) : ok(id);
      };

    const result = await run(
      mapSettled({ a: "a", b: "b" }, task, { collect: false }),
    );

    expect(result).toEqual(ok(undefined));
    if (result.ok) expectTypeOf(result.value).toEqualTypeOf<void>();
    expect(events).toEqual(["task a", "task b"]);
  });
});

describe("any", () => {
  test("returns first success", async () => {
    await using run = createRunner();

    const result = await run(any([() => ok(1), () => ok(2), () => ok(3)]));

    expect(result).toEqual(ok(1));
  });

  test("returns first success with concurrent execution", async () => {
    await using run = createRunner();

    const events: Array<string> = [];
    const canFinish = Promise.withResolvers<void>();

    const slow: Task<string> = async () => {
      events.push("slow start");
      await canFinish.promise;
      events.push("slow end");
      return ok("slow");
    };

    const fast: Task<string> = () => {
      events.push("fast");
      return ok("fast");
    };

    const fiber = run(withConcurrency(any([slow, fast])));
    await Promise.resolve();
    canFinish.resolve();

    const result = await fiber;
    expect(result).toEqual(ok("fast"));
  });

  test("returns last error when all fail", async () => {
    await using run = createRunner();

    interface MyError {
      readonly type: "MyError";
      readonly value: number;
    }

    const result = await run(
      any<number, MyError, unknown>([
        () => err({ type: "MyError", value: 1 }),
        () => err({ type: "MyError", value: 2 }),
        () => err({ type: "MyError", value: 3 }),
      ]),
    );

    expect(result).toEqual(err({ type: "MyError", value: 3 }));
  });

  test("returns last error when all fail with concurrent execution", async () => {
    await using run = createRunner();

    const events: Array<string> = [];

    interface MyError {
      readonly type: "MyError";
      readonly value: number;
    }

    const createFailingTask =
      (id: number): Task<number, MyError> =>
      () => {
        events.push(`task ${id}`);
        return err({ type: "MyError", value: id });
      };

    const result = await run(
      withConcurrency(
        any([createFailingTask(1), createFailingTask(2), createFailingTask(3)]),
      ),
    );

    // With unlimited concurrency, all tasks run. Last in input order determines error.
    // Since they're sync, order is deterministic: 1, 2, 3
    expect(events).toEqual(["task 1", "task 2", "task 3"]);
    expect(result).toEqual(err({ type: "MyError", value: 3 }));
  });

  test("returns last error by input order, not completion order", async () => {
    await using run = createRunner();

    interface MyError {
      readonly type: "MyError";
      readonly id: "slow" | "fast";
    }

    const canFinish = Promise.withResolvers<void>();

    const slow: Task<never, MyError> = async () => {
      await canFinish.promise;
      return err({ type: "MyError", id: "slow" });
    };

    const fast: Task<never, MyError> = () =>
      err({ type: "MyError", id: "fast" });

    const fiber = run(withConcurrency(any([slow, fast])));
    await Promise.resolve();
    canFinish.resolve();

    const result = await fiber;
    expect(result).toEqual(err({ type: "MyError", id: "fast" }));
  });

  test("can return last error by completion order", async () => {
    await using run = createRunner();

    interface MyError {
      readonly type: "MyError";
      readonly id: "slow" | "fast";
    }

    const canFinish = Promise.withResolvers<void>();

    const slow: Task<never, MyError> = async () => {
      await canFinish.promise;
      return err({ type: "MyError", id: "slow" });
    };

    const fast: Task<never, MyError> = () =>
      err({ type: "MyError", id: "fast" });

    const fiber = run(
      withConcurrency(any([slow, fast], { allFailed: "completion" })),
    );
    await Promise.resolve();
    canFinish.resolve();

    const result = await fiber;
    expect(result).toEqual(err({ type: "MyError", id: "slow" }));
  });

  test("aborts others when first succeeds", async () => {
    await using run = createRunner();

    const slowAbortReason = Promise.withResolvers<unknown>();

    const slow: Task<string> = async (run) => {
      await new Promise<void>((resolve) => {
        run.onAbort((cause) => {
          slowAbortReason.resolve(cause);
          resolve();
        });
      });
      return ok("slow");
    };

    const fast: Task<string> = () => ok("fast");

    const result = await run(withConcurrency(any([slow, fast])));

    expect(result).toEqual(ok("fast"));
    const cause = await slowAbortReason.promise;
    expect(AnyAbortError.is(cause)).toBe(true);
  });

  test("skips failures until success", async () => {
    await using run = createRunner();

    const events: Array<string> = [];

    interface MyError {
      readonly type: "MyError";
      readonly value: number;
    }

    const result = await run(
      any<string, MyError, unknown>([
        () => {
          events.push("fail 1");
          return err({ type: "MyError", value: 1 });
        },
        () => {
          events.push("fail 2");
          return err({ type: "MyError", value: 2 });
        },
        () => {
          events.push("success");
          return ok("winner");
        },
        () => {
          events.push("never runs");
          return ok("too late");
        },
      ]),
    );

    expect(result).toEqual(ok("winner"));
    expect(events).toEqual(["fail 1", "fail 2", "success"]);
  });
});

describe("examples TODO", () => {
  describe.skip("composition types from JSDoc", () => {
    // These tests verify the types shown in Task.ts JSDoc examples are accurate.
    // No runtime behavior - just type-level assertions.

    interface FetchError extends Typed<"FetchError"> {
      readonly error: unknown;
    }

    interface NativeFetchDep {
      readonly fetch: typeof globalThis.fetch;
    }

    // Simulated fetch task - typed but never executed
    const fetch = (
      _url: string,
    ): Task<Response, FetchError, NativeFetchDep> => {
      throw new Error("Not implemented - type test only");
    };

    test("timeout adds TimeoutError to error union", () => {
      const fetchWithTimeout = (url: string) => timeout(fetch(url), "30s");

      expectTypeOf(fetchWithTimeout).toEqualTypeOf<
        (
          url: string,
        ) => Task<Response, FetchError | TimeoutError, NativeFetchDep>
      >();
    });

    test("retry adds RetryError to error union", async () => {
      const fetchWithTimeout = (url: string) => timeout(fetch(url), "30s");

      const fetchWithRetry = (url: string) =>
        retry(fetchWithTimeout(url), take(2)(exponential("100ms")));

      type Expected = (
        url: string,
      ) => Task<
        Response,
        FetchError | TimeoutError | RetryError<FetchError | TimeoutError>,
        NativeFetchDep
      >;

      expectTypeOf(fetchWithRetry).toEqualTypeOf<Expected>();

      const deps: RunnerDeps & NativeFetchDep = {
        ...createTestDeps(),
        fetch: globalThis.fetch,
      };

      await using run = createRunner(deps);

      const urls = [
        "https://api.example.com/users",
        "https://api.example.com/posts",
        "https://api.example.com/comments",
      ];

      // At most 2 concurrent requests
      const _result = await run(withConcurrency(2, map(urls, fetchWithRetry)));
    });

    test("all with NonEmptyReadonlyArray returns NonEmptyReadonlyArray", () => {
      // Create tasks array typed as NonEmptyReadonlyArray
      const tasks: NonEmptyReadonlyArray<Task<string, MyError>> = [
        () => ok("a"),
      ];

      const _composed = all(tasks);

      type ActualResultType = Awaited<ReturnType<typeof _composed>>;

      const _result = null as unknown as ActualResultType;

      expectTypeOf(_result).toEqualTypeOf<
        Result<NonEmptyReadonlyArray<string>, MyError | AbortError>
      >();
    });
  });

  describe("createSemaphore", () => {
    test("limits concurrency with sleep helper", async () => {
      await using run = createRunner();
      // run.console.enabled = true;

      const semaphore = createSemaphore(2);

      const fetchUser =
        (id: string): Task<string> =>
        async (run) => {
          run.console.log("[demo]", "start", id);
          const slept = await run(sleep("5ms"));
          if (!slept.ok) return slept;
          run.console.log("[demo]", "end", id);
          return ok(`user:${id}`);
        };

      const fetchWithPermit = (id: string) =>
        semaphore.withPermit(fetchUser(id));

      await Promise.all([
        run(fetchWithPermit("1")),
        run(fetchWithPermit("2")),
        run(fetchWithPermit("3")),
      ]);
    });
  });

  describe("yieldNow", () => {
    test("keeps UI responsive when processing large arrays", async () => {
      await using run = createRunner();

      const largeArray = Array.from({ length: 50_000 }, (_, i) => i);
      let processedCount = 0;

      const processLargeArray: Task<number> = async (run) => {
        let lastYield = run.time.now();

        for (const item of largeArray) {
          processedCount += item;

          // Yield periodically to keep UI responsive
          if (run.time.now() - lastYield > msLongTask) {
            const r = await run(yieldNow);
            if (!r.ok) return r;
            lastYield = run.time.now();
          }
        }

        return ok(processedCount);
      };

      const result = await run(processLargeArray);

      // Sum of 0..(n-1) = n * (n - 1) / 2
      const expectedSum = (largeArray.length * (largeArray.length - 1)) / 2;
      expect(result).toEqual(ok(expectedSum));
    });

    test("enables stack-safe recursion", async () => {
      await using run = createRunner();

      // When processing a large amount of work recursively (via `run(childTask)`),
      // yield periodically so the recursion stays stack-safe.
      const processLargeCount =
        (count: number, index: number, sum: number): Task<number> =>
        async (run, deps) => {
          if (index >= count) return ok(sum);

          // Yield periodically to break synchronous call chains.
          if (index > 0 && index % 1000 === 0) {
            const y = await run(yieldNow);
            if (!y.ok) return y;
          }

          // Direct tail-call: no fiber overhead, stack-safe thanks to yieldNow.
          return await processLargeCount(
            count,
            index + 1,
            sum + index,
          )(run, deps);
        };

      const count = 50_000;
      const result = await run(processLargeCount(count, 0, 0));

      // Sum of 0..(count-1) = count * (count - 1) / 2
      expect(result).toEqual(ok((count * (count - 1)) / 2));
    });
  });

  describe("Fiber.abort", () => {
    test("abort wins, outcome preserves original result", async () => {
      await using run = createRunner();

      const fiber = run(() => ok("data"));
      fiber.abort("stop");
      const result = await fiber;

      expect(result).toEqual(err({ type: "AbortError", reason: "stop" }));
      const state = fiber.getState();
      assert(state.type === "completed");
      expect(state.outcome).toEqual(ok("data"));
    });

    test("unabortable preserves result and outcome", async () => {
      await using run = createRunner();

      const fiber = run(unabortable(() => ok("data")));
      fiber.abort("stop");
      const result = await fiber;

      expect(result).toEqual(ok("data"));
      const state = fiber.getState();
      assert(state.type === "completed");
      expect(state.outcome).toEqual(ok("data"));
    });
  });

  describe("unabortable", () => {
    test("analytics tracking completes despite abort", async () => {
      await using run = createRunner();

      const events: Array<string> = [];
      const canComplete = Promise.withResolvers<void>();
      let signalAbortedInAnalytics = true;

      // Simulate async analytics API (abortable by default)
      const sendToAnalytics =
        (event: number): Task<void> =>
        async ({ signal }) => {
          await canComplete.promise;
          signalAbortedInAnalytics = signal.aborted;
          events.push(`sent ${event}`);
          return ok();
        };

      // Important events must be sent even if the user navigates away
      const trackImportantEvent = (event: number) =>
        unabortable(sendToAnalytics(event));

      // User clicks, we start tracking (task runs until first await)
      const fiber = run(trackImportantEvent(123));

      // User navigates away (abort requested while task is running)
      fiber.abort();
      canComplete.resolve();

      const result = await fiber;

      expect(signalAbortedInAnalytics).toBe(false);
      // Analytics was sent despite abort
      expect(events).toEqual(["sent 123"]);
      expect(result).toEqual(ok());
    });
  });
});
