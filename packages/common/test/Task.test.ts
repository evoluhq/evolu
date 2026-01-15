import { assert, describe, expect, expectTypeOf, test } from "vitest";
import { isNonEmptyArray } from "../src/Array.js";
import { exhaustiveCheck } from "../src/Function.js";
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
  InferFiberErr,
  InferFiberOk,
  InferTaskDone,
  InferTaskErr,
  InferTaskOk,
  NextTask,
  Runner,
  RunnerConfigDep,
  RunnerDeps,
  Task,
} from "../src/Task.js";
import {
  AbortError,
  AsyncDisposableStack,
  createRunner,
  race,
  RaceLostError,
  repeat,
  retry,
  runnerClosingError,
  RunnerEvent,
  RunnerState,
  sleep,
  timeout,
  TimeoutError,
  unabortable,
  unabortableMask,
  yieldNow,
} from "../src/Task.js";
import { createTestDeps, createTestRunner } from "../src/Test.js";
import {
  createTime,
  msLongTask,
  testCreateTime,
  type Millis,
} from "../src/Time.js";
import type { Typed } from "../src/Type.js";
import { Id, PositiveInt } from "../src/Type.js";

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

      const task = () => ok("hello");

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

  describe("time", () => {
    test("exposes injected time", async () => {
      const time = testCreateTime();
      await using run = createTestRunner({ time });

      expect(run.time).toBe(time);
    });

    test("child runners inherit time from parent", async () => {
      await using run = createRunner();

      let childTime: typeof run.time | null = null;

      await run((childRun) => {
        childTime = childRun.time;
        return ok();
      });

      expect(childTime).toBe(run.time);
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

      const childAddedEvents = events.filter((e) => e.type === "childAdded");
      expect(childAddedEvents.length).toBe(1);
      expect(childAddedEvents[0].runnerId).toBe(run.id);
      expect(childAddedEvents[0].childId).toBe(fiber.run.id);

      taskComplete.resolve(ok());
      await fiber;
    });

    test("emits resultSet and childRemoved when child completes", async () => {
      await using run = createTestRunner(eventsEnabled);

      const events: Array<RunnerEvent> = [];
      const taskComplete = Promise.withResolvers<Result<void>>();

      const fiber = run(() => taskComplete.promise);

      run.onEvent = (event) => {
        events.push(event);
      };

      taskComplete.resolve(ok());
      await fiber;

      // Assert exact ordering: resultSet must come before childRemoved
      expect(events.map((e) => e.type)).toMatchInlineSnapshot(`
        [
          "resultSet",
          "stateChanged",
          "stateChanged",
          "childRemoved",
        ]
      `);
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

    test("transitions active → disposing → disposed", async () => {
      const run = createRunner();

      expectTypeOf(run.getState()).toEqualTypeOf<RunnerState>();
      expect(run.getState()).toBe("active");

      const taskStarted = Promise.withResolvers<void>();
      const taskCanFinish = Promise.withResolvers<void>();

      let stateInAbortHandler: RunnerState | null = null;
      let stateAfterAwait: RunnerState | null = null;

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
      expect(run.getState()).toBe("disposing");

      taskCanFinish.resolve();
      await disposePromise;

      expect(stateInAbortHandler).toBe("disposing");
      expect(stateAfterAwait).toBe("disposing");
      expect(run.getState()).toBe("disposed");
    });

    test("is idempotent", async () => {
      await using run = createRunner();

      const promise1 = run[Symbol.asyncDispose]();
      const promise2 = run[Symbol.asyncDispose]();

      expect(promise1).toBe(promise2);
    });

    test("does not run new tasks when disposing", async () => {
      const run = createRunner();
      run[Symbol.asyncDispose]();

      expect(run.getState()).toBe("disposing");

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

      expect(regularFiber.run.getState()).toBe("disposed");
      expect(unabortableFiber.run.getState()).toBe("disposed");
      expect(unabortableMaskFiber.run.getState()).toBe("disposed");

      const expected = err(runnerClosingError);
      expect(regularResult).toEqual(expected);
      expect(unabortableResult).toEqual(expected);
      expect(unabortableMaskResult).toEqual(expected);
    });

    test("does not run new tasks when disposed", async () => {
      const run = createRunner();
      await run[Symbol.asyncDispose]();

      expect(run.getState()).toBe("disposed");

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

      expect(regularFiber.run.getState()).toBe("disposed");
      expect(unabortableFiber.run.getState()).toBe("disposed");
      expect(unabortableMaskFiber.run.getState()).toBe("disposed");

      const expected = err(runnerClosingError);
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
  });
});

describe("Fiber", () => {
  test("is awaitable", async () => {
    await using run = createRunner();

    const task: Task<number> = () => Promise.resolve(ok(42));
    const fiber = run(task);

    expectTypeOf(fiber).toEqualTypeOf<Fiber<number, never, RunnerDeps>>();

    const result = await fiber;

    expectTypeOf(result).toEqualTypeOf<Result<number, AbortError>>();
    expect(result).toEqual(ok(42));
  });

  describe("abort", () => {
    test("before run short-circuits child task", async () => {
      await using run = createRunner();

      let taskRan = false;
      let signalAbortedBeforeInnerRun = false;
      let innerFiberState: string | null = null;
      let innerFiberResult: Result<unknown, unknown> | null = null;

      const fiber = run(async (run) => {
        await Promise.resolve();
        signalAbortedBeforeInnerRun = run.signal.aborted;

        const innerFiber = run(() => {
          taskRan = true;
          return ok();
        });

        await innerFiber;

        innerFiberState = innerFiber.run.getState();
        innerFiberResult = innerFiber.run.getResult();

        return ok();
      });

      fiber.abort("stop");
      const result = await fiber;

      expect(signalAbortedBeforeInnerRun).toBe(true);
      expect(taskRan).toBe(false);
      expect(innerFiberState).toBe("disposed");
      expect(innerFiberResult).toEqual(
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
          reason: undefined,
        }),
      );
    });
  });

  test("getResult returns null while pending, Result after completion", async () => {
    await using run = createRunner();

    const taskComplete = Promise.withResolvers<Result<number, MyError>>();

    const fiber = run(() => taskComplete.promise);

    expect(fiber.getResult()).toBeNull();

    taskComplete.resolve(ok(42));
    await fiber;

    expectTypeOf(fiber.getResult()).toEqualTypeOf<Result<
      number,
      MyError | AbortError
    > | null>();
    expect(fiber.getResult()).toEqual(ok(42));
  });

  test("getOutcome equals getResult when not aborted", async () => {
    await using run = createRunner();

    const taskComplete = Promise.withResolvers<Result<number, MyError>>();

    const fiber = run(() => taskComplete.promise);

    expect(fiber.getOutcome()).toBeNull();
    expect(fiber.getResult()).toBeNull();

    taskComplete.resolve(ok(42));
    await fiber;

    expect(fiber.getOutcome()).toEqual(fiber.getResult());
  });

  test("getOutcome preserves original result when aborted", async () => {
    await using run = createRunner();

    const fiber = run(() => ok("data"));
    fiber.abort("stop");
    await fiber;

    // getResult returns AbortError
    expect(fiber.getResult()).toEqual(
      err({ type: "AbortError", reason: "stop" }),
    );
    // getOutcome preserves what the task actually returned
    expect(fiber.getOutcome()).toEqual(ok("data"));
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

    test("snapshot returns null result while pending, Result after completion", async () => {
      await using run = createRunner();

      const taskComplete = Promise.withResolvers<Result<number>>();

      const fiber = run(() => taskComplete.promise);
      expect(fiber.run.snapshot().result).toBeNull();

      taskComplete.resolve(ok(42));
      await fiber;
      expect(fiber.run.snapshot().result).toEqual(ok(42));
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
    expect(fiber.getOutcome()).toEqual(innerResult);
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

    const task = unabortableMask((restore) => async (run) => {
      return await run(
        restore(() => {
          abortableRan = true;
          return ok();
        }),
      );
    });

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
    let signalAbortedInUnmaskedTask = true;

    const task = unabortableMask((restore) => async (run) => {
      signalAbortedAtStart = run.signal.aborted;
      events.push("acquire");
      acquireStarted.resolve();
      await canContinue.promise;

      signalAbortedAfterAwait = run.signal.aborted;

      // Regular task runs because it inherits the abort mask
      await run(({ signal }) => {
        signalAbortedInUnmaskedTask = signal.aborted;
        events.push("unmasked task");
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
    expect(signalAbortedInUnmaskedTask).toBe(false);
    expect(events).toEqual(["acquire", "unmasked task", "release"]);
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

    const task = unabortableMask((_restore1) => async (run) => {
      return await run(
        unabortableMask((restore2) => (_run) => {
          // restore2 restores to mask=1
          restoreFromInner = restore2;

          return ok();
        }),
      );
    });

    const result = await run(task);
    expect(result).toEqual(ok());
    expect(restoreFromInner).toBeDefined();

    // Using restore2 outside its intended scope would increase abort mask
    // (root mask=0, override=1). This must crash.
    expect(() =>
      run(
        restoreFromInner!(() => {
          return ok();
        }),
      ),
    ).toThrow("restore used outside its unabortableMask");
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
      let stateWhileWorking: RunnerState | null = null;

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
      expect(stateWhileWorking).toBe("active");
      expect(childRunner!.getState()).toBe("disposed");
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

      // Run factory - task scope ends after this
      const bundle = await run(createBundle);
      expect(bundle.ok).toBe(true);
      if (!bundle.ok) throw new Error("unreachable");

      events.push("using bundle after factory ended");

      // Factory task scope is dead, but cleanup should still work
      // because defer() uses daemon (root scope)
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

      // Run factory - task scope ends after this
      const bundle = await run(createBundle);
      expect(bundle.ok).toBe(true);
      if (!bundle.ok) throw new Error("unreachable");

      events.push(`using ${bundle.value.handle.id} after factory ended`);

      // Factory task scope is dead, but disposal should still work
      // because adopt() uses daemon (root scope)
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
    expect(fiber.getOutcome()).toEqual(
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
        attempt: PositiveInt.orThrow(1),
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
    const task = () => {
      return ok(values[index++]);
    };

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

  test("uses forever schedule when unbounded", async () => {
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

    const task: Task<string, never, ConfigDep> = (_run, deps) => {
      return ok(deps.config.apiUrl);
    };

    const result = await run(task);

    expect(result).toEqual(ok("https://api.example.com"));
  });

  test("createRunner without args returns Runner<RunnerDeps>", async () => {
    await using run = createRunner();

    expectTypeOf(run).toEqualTypeOf<Runner<RunnerDeps>>();
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
      (run, deps) => {
        return run(deps.http.get(`/users/${id}`));
      };

    const result = await run(
      retry(fetchUserWithError("Alice"), take(3)(spaced("1ms"))),
    );

    expect(result).toEqual(ok("Alice"));
    expect(attempts).toBe(3);
  });
});

describe("examples TODO: review", () => {
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
      expect(fiber.getOutcome()).toEqual(ok("data"));
    });

    test("unabortable preserves result and outcome", async () => {
      await using run = createRunner();

      const fiber = run(unabortable(() => ok("data")));
      fiber.abort("stop");
      const result = await fiber;

      expect(result).toEqual(ok("data"));
      expect(fiber.getOutcome()).toEqual(ok("data"));
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
