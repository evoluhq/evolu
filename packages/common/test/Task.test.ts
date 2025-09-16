import { beforeEach, describe, expect, expectTypeOf, test, vi } from "vitest";
import { err, getOrThrow, ok, Result, tryAsync } from "../src/Result.js";
import {
  AbortError,
  createMutex,
  createSemaphore,
  retry,
  RetryError,
  Task,
  timeout,
  TimeoutError,
  toTask,
  wait,
} from "../src/Task.js";
import { NonNegativeInt, PositiveInt } from "../src/Type.js";

describe("toTask", () => {
  test("returns correct types based on context", async () => {
    const mockFn = () => Promise.resolve<Result<void, never>>(ok());
    const task = toTask(mockFn);

    // Without context: Result<void, never> (no AbortError possible)
    const result1 = await task();
    expect(result1).toEqual(ok());
    expectTypeOf(result1).toEqualTypeOf<Result<void, never>>();

    // With empty context: Result<void, never> (no AbortError - same as fast path)
    const result2 = await task({});
    expect(result2).toEqual(ok());
    expectTypeOf(result2).toEqualTypeOf<Result<void, never>>();

    // With context containing signal: Result<void, AbortError>
    const controller = new AbortController();
    const result3 = await task(controller);
    expect(result3).toEqual(ok());
    expectTypeOf(result3).toEqualTypeOf<Result<void, AbortError>>();
  });

  test("supports cancellation when signal is provided", async () => {
    const mockFn = () =>
      new Promise<Result<void, never>>((resolve) => {
        setTimeout(() => {
          resolve(ok());
        }, 100);
      });

    const task = toTask(mockFn);
    const controller = new AbortController();

    // Start the task
    const promise = task(controller);

    // Abort immediately
    controller.abort("test abort");

    const result = await promise;
    expect(result).toEqual(
      err({
        type: "AbortError",
        reason: "test abort",
      }),
    );
  });

  test("fast path when no context provided", async () => {
    const mockFn = () => Promise.resolve<Result<void, never>>(ok());
    const task = toTask(mockFn);

    const result = await task();
    expect(result).toEqual(ok());

    // Verify this is the fast path type without AbortError
    expectTypeOf(result).toEqualTypeOf<Result<void, never>>();
  });
});

describe("wait", () => {
  test("returns correct types based on context", async () => {
    const waitTask = wait("5ms");

    // Without context: Result<void, never> (no AbortError possible)
    const result1 = await waitTask();
    expect(result1).toEqual(ok());
    expectTypeOf(result1).toEqualTypeOf<Result<void, never>>();

    // With empty context: Result<void, never> (no AbortError - same as fast path)
    const result2 = await waitTask({});
    expect(result2).toEqual(ok());
    expectTypeOf(result2).toEqualTypeOf<Result<void, never>>();

    // With context containing signal: Result<void, AbortError>
    const controller = new AbortController();
    const result3 = await waitTask(controller);
    expect(result3).toEqual(ok());
    expectTypeOf(result3).toEqualTypeOf<Result<void, AbortError>>();
  });

  test("supports cancellation when signal is provided", async () => {
    const controller = new AbortController();
    const start = Date.now();

    // Start the wait
    const promise = wait("100ms")(controller);

    // Abort after 25ms
    setTimeout(() => {
      controller.abort("test abort");
    }, 25);

    const result = await promise;
    const elapsed = Date.now() - start;

    expect(result).toEqual(
      err({
        type: "AbortError",
        reason: "test abort",
      }),
    );
    expect(elapsed).toBeLessThan(50); // Should abort early
  });

  test("handles already aborted signal", async () => {
    const controller = new AbortController();
    controller.abort("already aborted");

    const result = await wait("100ms")(controller);

    expect(result).toEqual(
      err({
        type: "AbortError",
        reason: "already aborted",
      }),
    );
  });
});

describe("timeout", () => {
  test("returns correct types based on context", async () => {
    const mockTask = toTask(() => Promise.resolve<Result<void, never>>(ok()));
    const timeoutTask = timeout("100ms", mockTask);

    // Without context: Result<void, TimeoutError>
    const result1 = await timeoutTask();
    expectTypeOf(result1).toEqualTypeOf<Result<void, TimeoutError>>();

    // With empty context: Result<void, TimeoutError>
    const result2 = await timeoutTask({});
    expectTypeOf(result2).toEqualTypeOf<Result<void, TimeoutError>>();

    // With context containing signal: Result<void, TimeoutError | AbortError>
    const controller = new AbortController();
    const result3 = await timeoutTask(controller);
    expectTypeOf(result3).toEqualTypeOf<
      Result<void, TimeoutError | AbortError>
    >();
  });

  test("returns result when task completes before timeout", async () => {
    const fastTask = toTask(() =>
      Promise.resolve<Result<string, never>>(ok("success")),
    );
    const timeoutTask = timeout("100ms", fastTask);

    const result = await timeoutTask();
    expect(result).toEqual(ok("success"));
  });

  test("returns TimeoutError when task exceeds timeout", async () => {
    const slowTask = toTask(
      () =>
        new Promise<Result<string, never>>((resolve) => {
          setTimeout(() => {
            resolve(ok("too late"));
          }, 100);
        }),
    );
    const timeoutTask = timeout("50ms", slowTask);

    const result = await timeoutTask();
    expect(result).toEqual(err({ type: "TimeoutError", timeoutMs: 50 }));
  });

  test("supports cancellation when signal is provided", async () => {
    const slowTask = toTask(
      () =>
        new Promise<Result<string, never>>((resolve) => {
          setTimeout(() => {
            resolve(ok("should not complete"));
          }, 100);
        }),
    );
    const timeoutTask = timeout("200ms", slowTask);
    const controller = new AbortController();

    // Start the timeout task
    const promise = timeoutTask(controller);

    // Abort after 25ms
    setTimeout(() => {
      controller.abort("test abort");
    }, 25);

    const result = await promise;
    expect(result).toEqual(
      err({
        type: "AbortError",
        reason: "test abort",
      }),
    );
  });

  test("handles already aborted signal", async () => {
    const task = toTask(() =>
      Promise.resolve<Result<string, never>>(ok("success")),
    );
    const timeoutTask = timeout("100ms", task);
    const controller = new AbortController();
    controller.abort("already aborted");

    const result = await timeoutTask(controller);

    expect(result).toEqual(
      err({
        type: "AbortError",
        reason: "already aborted",
      }),
    );
  });

  test("correctly returns AbortError when signal is aborted before timeout", async () => {
    const slowTask = toTask(
      () =>
        new Promise<Result<string, never>>((resolve) => {
          setTimeout(() => {
            resolve(ok("should not complete"));
          }, 1000); // Long delay
        }),
    );
    const timeoutTask = timeout("500ms", slowTask); // Timeout longer than abort
    const controller = new AbortController();

    const promise = timeoutTask(controller);

    // Abort before timeout fires
    setTimeout(() => {
      controller.abort("external abort");
    }, 100);

    const result = await promise;

    // This works correctly - external abort is handled by toTask wrapper
    expect(result).toEqual(
      err({
        type: "AbortError",
        reason: "external abort",
      }),
    );
  });

  test("cancels underlying task when timeout fires", async () => {
    let taskAborted = false;
    const slowTask = toTask(
      (context) =>
        new Promise<Result<string, never>>((resolve) => {
          context?.signal?.addEventListener("abort", () => {
            taskAborted = true;
          });

          setTimeout(() => {
            resolve(ok("completed"));
          }, 1000);
        }),
    );

    const timeoutTask = timeout("100ms", slowTask);
    const result = await timeoutTask();

    expect(result).toEqual(err({ type: "TimeoutError", timeoutMs: 100 }));

    // Task should be cancelled when timeout fires
    expect(taskAborted).toBe(true);
  });
});

describe("retry", () => {
  test("returns correct types based on context", async () => {
    const mockTask = toTask(() => Promise.resolve<Result<void, never>>(ok()));
    const retryTask = retry({ retries: PositiveInt.orThrow(1) }, mockTask);

    // Without context: Result<void, RetryError<never>>
    const result1 = await retryTask();
    expectTypeOf(result1).toEqualTypeOf<Result<void, RetryError<never>>>();

    // With empty context: Result<void, RetryError<never>>
    const result2 = await retryTask({});
    expectTypeOf(result2).toEqualTypeOf<Result<void, RetryError<never>>>();

    // With context containing signal: Result<void, RetryError<never> | AbortError>
    const controller = new AbortController();
    const result3 = await retryTask(controller);
    expectTypeOf(result3).toEqualTypeOf<
      Result<void, RetryError<never> | AbortError>
    >();
  });

  test("succeeds on first attempt", async () => {
    const mockTask = toTask(() => Promise.resolve<Result<void, never>>(ok()));
    const retryTask = retry({ retries: PositiveInt.orThrow(1) }, mockTask);

    const result = await retryTask();

    expect(result).toEqual(ok());
  });

  test("succeeds after several attempts", async () => {
    let attempts = 0;
    const flakyTask = toTask(() => {
      attempts++;
      if (attempts < 3) {
        return Promise.resolve<
          Result<void, { type: "TestError"; message: string }>
        >(err({ type: "TestError", message: `Error ${attempts}` }));
      }
      return Promise.resolve<
        Result<void, { type: "TestError"; message: string }>
      >(ok());
    });

    const retryTask = retry(
      { retries: PositiveInt.orThrow(2), initialDelay: "1ms" },
      flakyTask,
    );
    const result = await retryTask();

    expect(result).toEqual(ok());
    expect(attempts).toBe(3);
  });

  test("returns error after max retries", async () => {
    const testError = { type: "TestError", message: "Failed" };
    const failingTask = toTask(() =>
      Promise.resolve<Result<never, typeof testError>>(err(testError)),
    );

    const retryTask = retry(
      { retries: PositiveInt.orThrow(3), initialDelay: "1ms" },
      failingTask,
    );
    const result = await retryTask();

    expect(result).toEqual(
      err({
        type: "RetryError",
        cause: testError,
        attempts: 4, // initial + 3 retries = 4 attempts
      }),
    );
  });

  test("supports cancellation when signal is provided", async () => {
    const slowTask = toTask(
      () =>
        new Promise<Result<never, { type: "TestError" }>>((resolve) => {
          setTimeout(() => {
            resolve(err({ type: "TestError" }));
          }, 50);
        }),
    );

    const retryTask = retry(
      { retries: PositiveInt.orThrow(1), initialDelay: "20ms" },
      slowTask,
    );
    const controller = new AbortController();

    // Start the retry task
    const promise = retryTask(controller);

    // Abort after 10ms (should abort during first attempt or delay)
    setTimeout(() => {
      controller.abort("test abort");
    }, 10);

    const result = await promise;
    expect(result).toEqual(
      err({
        type: "AbortError",
        reason: "test abort",
      }),
    );
  });

  test("uses retryable predicate", async () => {
    interface RetryableError {
      type: "RetryableError";
      attempt: number;
    }
    interface NonRetryableError {
      type: "NonRetryableError";
      reason: string;
    }

    let attempts = 0;
    const taskWithMixedErrors = toTask(() => {
      attempts++;
      if (attempts === 1) {
        return Promise.resolve<
          Result<never, RetryableError | NonRetryableError>
        >(err({ type: "RetryableError", attempt: 1 }));
      }
      return Promise.resolve<Result<never, RetryableError | NonRetryableError>>(
        err({ type: "NonRetryableError", reason: "fatal" }),
      );
    });

    const retryTask = retry(
      {
        retries: PositiveInt.orThrow(1),
        initialDelay: "1ms",
        retryable: (error) => error.type === "RetryableError",
      },
      taskWithMixedErrors,
    );

    const result = await retryTask();

    expect(result).toEqual(
      err({
        type: "RetryError",
        cause: { type: "NonRetryableError", reason: "fatal" },
        attempts: 2,
      }),
    );
    expect(attempts).toBe(2);
  });

  test("calls onRetry callback", async () => {
    const onRetry = vi.fn();
    const testError = { type: "TestError", message: "Failed" };

    let attempts = 0;
    const flakyTask = toTask(() => {
      attempts++;
      if (attempts < 3) {
        return Promise.resolve<Result<never, typeof testError>>(err(testError));
      }
      return Promise.resolve<Result<void, typeof testError>>(ok());
    });

    const retryTask = retry(
      {
        retries: PositiveInt.orThrow(2),
        initialDelay: "1ms",
        onRetry,
      },
      flakyTask,
    );

    const result = await retryTask();

    expect(result).toEqual(ok());
    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledWith(testError, 1, expect.any(Number));
    expect(onRetry).toHaveBeenCalledWith(testError, 2, expect.any(Number));
  });

  test("handles already aborted signal", async () => {
    const task = toTask(() => Promise.resolve<Result<void, never>>(ok()));
    const retryTask = retry({ retries: PositiveInt.orThrow(1) }, task);
    const controller = new AbortController();
    controller.abort("already aborted");

    const result = await retryTask(controller);

    expect(result).toEqual(
      err({
        type: "AbortError",
        reason: "already aborted",
      }),
    );
  });

  test("uses exponential backoff with jitter", async () => {
    const onRetry = vi.fn();
    let attempts = 0;
    const failingTask = toTask(() => {
      attempts++;
      if (attempts < 4) {
        return Promise.resolve<Result<never, { type: "TestError" }>>(
          err({ type: "TestError" }),
        );
      }
      return Promise.resolve<Result<void, { type: "TestError" }>>(ok());
    });

    const result = await retry(
      {
        retries: PositiveInt.orThrow(3),
        initialDelay: "10ms", // Use small delays for fast test
        factor: 2,
        jitter: 0.1,
        onRetry,
      },
      failingTask,
    )();

    expect(result).toEqual(ok());
    expect(attempts).toBe(4); // initial + 3 retries
    expect(onRetry).toHaveBeenCalledTimes(3);

    // Verify delays are called with exponential backoff
    // First retry: ~10ms (10 * 2^0 = 10)
    expect(onRetry).toHaveBeenNthCalledWith(
      1,
      { type: "TestError" },
      1,
      expect.any(Number),
    );
    const firstDelay = onRetry.mock.calls[0]?.[2] as number;
    expect(firstDelay).toBeGreaterThanOrEqual(9); // 10 * (1 - 0.1) = 9
    expect(firstDelay).toBeLessThanOrEqual(12); // 10 * (1 + 0.1) = 11, rounded up

    // Second retry: ~20ms (10 * 2^1 = 20)
    expect(onRetry).toHaveBeenNthCalledWith(
      2,
      { type: "TestError" },
      2,
      expect.any(Number),
    );
    const secondDelay = onRetry.mock.calls[1]?.[2] as number;
    expect(secondDelay).toBeGreaterThanOrEqual(18); // 20 * (1 - 0.1) = 18
    expect(secondDelay).toBeLessThanOrEqual(24); // 20 * (1 + 0.1) = 22, rounded up

    // Third retry: ~40ms (10 * 2^2 = 40)
    expect(onRetry).toHaveBeenNthCalledWith(
      3,
      { type: "TestError" },
      3,
      expect.any(Number),
    );
    const thirdDelay = onRetry.mock.calls[2]?.[2] as number;
    expect(thirdDelay).toBeGreaterThanOrEqual(36); // 40 * (1 - 0.1) = 36
    expect(thirdDelay).toBeLessThanOrEqual(48); // 40 * (1 + 0.1) = 44, rounded up
  });

  test("with real delays works as expected", async () => {
    // Keep track of when each attempt happens
    const attemptTimes: Array<number> = [];
    const onRetry = vi.fn();

    // Function that fails 3 times then succeeds
    let attempts = 0;
    const failingTask = toTask(() => {
      attempts++;
      const now = Date.now();
      attemptTimes.push(now);

      if (attempts <= 3) {
        return Promise.resolve<Result<never, { type: "TestError" }>>(
          err({ type: "TestError" }),
        );
      } else {
        return Promise.resolve<Result<void, { type: "TestError" }>>(ok());
      }
    });

    // Use real short delays
    const result = await retry(
      {
        retries: PositiveInt.orThrow(3),
        initialDelay: "50ms", // 50ms initial delay
        factor: 2, // Double each time
        jitter: 0, // No jitter for predictable testing
        onRetry,
      },
      failingTask,
    )();

    // Should succeed after 4 attempts (1 initial + 3 retries)
    expect(result).toEqual(ok());
    expect(attempts).toBe(4);
    expect(onRetry).toHaveBeenCalledTimes(3);

    // Check delays between attempts
    // First retry should be ~50ms after initial attempt
    expect(attemptTimes[1] - attemptTimes[0]).toBeGreaterThanOrEqual(45);

    // Second retry should be ~100ms after first retry
    expect(attemptTimes[2] - attemptTimes[1]).toBeGreaterThanOrEqual(95);

    // Third retry should be ~200ms after second retry
    expect(attemptTimes[3] - attemptTimes[2]).toBeGreaterThanOrEqual(195);

    // Total time should be at least 50 + 100 + 200 = 350ms
    expect(attemptTimes[3] - attemptTimes[0]).toBeGreaterThanOrEqual(345);
  });

  test("respects maxDelay option", async () => {
    // Keep track of when each attempt happens
    const attemptTimes: Array<number> = [];
    const onRetry = vi.fn();

    // Function that always fails
    let attempts = 0;
    const failingTask = toTask(() => {
      attempts++;
      const now = Date.now();
      attemptTimes.push(now);
      return Promise.resolve<Result<never, { type: "TestError" }>>(
        err({ type: "TestError" }),
      );
    });

    // Use a very short maxDelay to demonstrate the capping effect
    const result = await retry(
      {
        retries: PositiveInt.orThrow(3),
        initialDelay: "50ms", // 50ms initial delay
        factor: 10, // Would normally increase 50 -> 500 -> 5000, but maxDelay caps it
        maxDelay: "100ms", // Cap delays at 100ms
        jitter: 0, // No jitter for predictable testing
        onRetry,
      },
      failingTask,
    )();

    // Should fail after 4 attempts (1 initial + 3 retries)
    expect(result).toEqual(
      err({
        type: "RetryError",
        cause: { type: "TestError" },
        attempts: 4,
      }),
    );
    expect(attempts).toBe(4);
    expect(onRetry).toHaveBeenCalledTimes(3);

    // First retry should be ~50ms after initial attempt
    expect(attemptTimes[1] - attemptTimes[0]).toBeGreaterThanOrEqual(45);

    // Second retry would normally be 500ms, but maxDelay caps it at 100ms
    expect(attemptTimes[2] - attemptTimes[1]).toBeGreaterThanOrEqual(95);
    expect(attemptTimes[2] - attemptTimes[1]).toBeLessThan(200);

    // Third retry would normally be 5000ms, but maxDelay caps it at 100ms
    expect(attemptTimes[3] - attemptTimes[2]).toBeGreaterThanOrEqual(95);
    expect(attemptTimes[3] - attemptTimes[2]).toBeLessThan(200);
  });
});

describe("createSemaphore", () => {
  test("allows concurrent Tasks up to limit", async () => {
    const semaphore = createSemaphore(PositiveInt.orThrow(2));
    let runningCount = 0;
    let maxRunning = 0;

    const task = (duration: number) =>
      toTask<number, never>(async () => {
        runningCount++;
        maxRunning = Math.max(maxRunning, runningCount);
        await wait(duration as NonNegativeInt)();
        runningCount--;
        return ok(runningCount);
      });

    // Start 4 Tasks, but only 2 should run concurrently
    await Promise.all([
      semaphore.withPermit(task(50))(),
      semaphore.withPermit(task(50))(),
      semaphore.withPermit(task(50))(),
      semaphore.withPermit(task(50))(),
    ]);

    // Should never have more than 2 running at once
    expect(maxRunning).toBe(2);
  });

  test("executes Tasks sequentially with limit of 1", async () => {
    const semaphore = createSemaphore(PositiveInt.orThrow(1));
    const events: Array<{
      id: number;
      event: "start" | "end";
    }> = [];

    const task = (id: number) =>
      toTask<number, never>(async () => {
        events.push({ id, event: "start" });
        await wait("20ms")(); // Longer delay to ensure overlap would be detectable
        events.push({ id, event: "end" });
        return ok(id);
      });

    await Promise.all([
      semaphore.withPermit(task(1))(),
      semaphore.withPermit(task(2))(),
      semaphore.withPermit(task(3))(),
    ]);

    // Verify sequential execution: each Task must fully complete before the next starts
    expect(events.map((i) => JSON.stringify(i))).toMatchInlineSnapshot(`
      [
        "{"id":1,"event":"start"}",
        "{"id":1,"event":"end"}",
        "{"id":2,"event":"start"}",
        "{"id":2,"event":"end"}",
        "{"id":3,"event":"start"}",
        "{"id":3,"event":"end"}",
      ]
    `);
  });

  test("fails fast on unexpected errors without releasing permits", async () => {
    const semaphore = createSemaphore(PositiveInt.orThrow(1));

    const failingTask = () => {
      throw new Error("Unexpected error");
    };

    // Task throws unexpected error - should bubble up
    await expect(semaphore.withPermit(failingTask)).rejects.toThrow(
      "Unexpected error",
    );

    // Note: In real code, the app would have crashed at this point.
    // The semaphore permit is intentionally "leaked" because we don't
    // attempt to recover from unexpected errors.
  });

  test("aborting individual tasks", async () => {
    // Allow maximum 3 concurrent Tasks
    const semaphore = createSemaphore(PositiveInt.orThrow(3));

    let currentConcurrent = 0;
    const events: Array<string> = [];

    const fetchData = (id: number) =>
      toTask<number, never>(async (context) => {
        currentConcurrent++;
        events.push(`start ${id} (concurrent: ${currentConcurrent})`);

        await wait("100ms")(context);

        currentConcurrent--;
        events.push(`end ${id} (concurrent: ${currentConcurrent})`);
        return ok(id * 10);
      });

    // Create individual controllers for some tasks
    const controller2 = new AbortController();
    const controller4 = new AbortController();

    // Start multiple tasks, some with individual abort controllers
    const promises = [
      semaphore.withPermit(fetchData(1))(), // No individual controller
      semaphore.withPermit(fetchData(2))(controller2), // Individual controller - will be running
      semaphore.withPermit(fetchData(3))(), // No individual controller
      semaphore.withPermit(fetchData(4))(controller4), // Individual controller - will be pending
      semaphore.withPermit(fetchData(5))(), // No individual controller - will be pending
    ];

    // Give tasks time to start (1, 2, 3 should be running, 4, 5 pending)
    await wait("20ms")();

    // Abort task 2 while it's running
    controller2.abort("Individual abort task 2");

    // Abort task 4 while it's pending (hasn't started yet)
    controller4.abort("Individual abort task 4");

    // Wait for all tasks to complete or abort
    const results = await Promise.all(promises);

    // Check results
    expect(results[0]).toEqual(ok(10)); // Task 1 should succeed
    expect(results[1]).toEqual(
      err({ type: "AbortError", reason: "Individual abort task 2" }),
    );
    expect(results[2]).toEqual(ok(30)); // Task 3 should succeed
    expect(results[3]).toEqual(
      err({ type: "AbortError", reason: "Individual abort task 4" }),
    );
    expect(results[4]).toEqual(ok(50)); // Task 5 should succeed

    // Verify the sequence of events - properly limited to 3 concurrent
    // Note: aborted tasks may or may not reach "end" events depending on timing
    expect(events).toMatchInlineSnapshot(`
      [
        "start 1 (concurrent: 1)",
        "start 2 (concurrent: 2)",
        "start 3 (concurrent: 3)",
        "end 2 (concurrent: 2)",
        "start 5 (concurrent: 3)",
        "end 1 (concurrent: 2)",
        "end 3 (concurrent: 1)",
        "end 5 (concurrent: 0)",
      ]
    `);
  });

  test("disposal cancels tasks", async () => {
    const semaphore = createSemaphore(PositiveInt.orThrow(1));

    const slowTask = wait("100ms");
    const waitingTask = wait("10ms");

    // Start a slow task that will hold the permit
    const firstPromise = semaphore.withPermit(slowTask)();

    // Start a second task that will wait for permit
    const secondPromise = semaphore.withPermit(waitingTask)();

    // Give tasks time to start
    await wait("20ms")();

    // Dispose the semaphore while second task is waiting
    semaphore[Symbol.dispose]();

    // Running task should be cancelled with AbortError
    expect(await firstPromise).toEqual(
      err({
        type: "AbortError",
        reason: "Semaphore disposed",
      }),
    );

    // Waiting task should be cancelled with AbortError
    expect(await secondPromise).toEqual(
      err({
        type: "AbortError",
        reason: "Semaphore disposed",
      }),
    );
  });

  test("disposal prevents new Tasks from being accepted", async () => {
    const semaphore = createSemaphore(PositiveInt.orThrow(1));

    // Dispose the semaphore
    semaphore[Symbol.dispose]();

    const task = toTask(() => Promise.resolve(ok("should-not-run")));

    // Try to execute a task on disposed semaphore
    const result = await semaphore.withPermit(task)();

    expect(result).toEqual(
      err({
        type: "AbortError",
        reason: "Semaphore disposed",
      }),
    );
  });

  test("disposal is idempotent", () => {
    const semaphore = createSemaphore(PositiveInt.orThrow(1));

    // Multiple disposals should not throw
    expect(() => {
      semaphore[Symbol.dispose]();
      semaphore[Symbol.dispose]();
      semaphore[Symbol.dispose]();
    }).not.toThrow();
  });
});

describe("createMutex", () => {
  test("executes Tasks sequentially", async () => {
    const mutex = createMutex();
    const events: Array<string> = [];

    const task = (id: number) =>
      toTask(async () => {
        events.push(`start-${id}`);
        await wait("10ms")();
        events.push(`end-${id}`);
        return ok(id);
      });

    const results = await Promise.all([
      mutex.withLock(task(1))(),
      mutex.withLock(task(2))(),
    ]);

    expect(results.map((r) => (r.ok ? r.value : null))).toEqual([1, 2]);
    expect(events).toEqual(["start-1", "end-1", "start-2", "end-2"]);
  });

  test("behaves as semaphore with permit count of 1", async () => {
    const mutex = createMutex();
    const semaphore = createSemaphore(PositiveInt.orThrow(1));

    const mutexEvents: Array<string> = [];
    const semaphoreEvents: Array<string> = [];

    const task = (id: number, events: Array<string>) =>
      toTask(async () => {
        events.push(`start-${id}`);
        await wait("10ms")();
        events.push(`end-${id}`);
        return ok(id);
      });

    await Promise.all([
      mutex.withLock(task(1, mutexEvents))(),
      mutex.withLock(task(2, mutexEvents))(),
    ]);

    await Promise.all([
      semaphore.withPermit(task(1, semaphoreEvents))(),
      semaphore.withPermit(task(2, semaphoreEvents))(),
    ]);

    // Both should exhibit identical behavior
    expect(mutexEvents).toEqual(semaphoreEvents);
  });

  test("disposal cancels running and waiting tasks", async () => {
    const mutex = createMutex();

    const slowTask = wait("100ms");
    const waitingTask = wait("10ms");

    // Start a slow task that will hold the lock
    const firstPromise = mutex.withLock(slowTask)();

    // Start a second task that will wait for lock
    const secondPromise = mutex.withLock(waitingTask)();

    // Give tasks time to start
    await wait("20ms")();

    // Dispose the mutex while second task is waiting
    mutex[Symbol.dispose]();

    // Running task should be cancelled with AbortError
    const firstResult = await firstPromise;
    expect(firstResult).toEqual(
      err({
        type: "AbortError",
        reason: "Semaphore disposed",
      }),
    );

    // Waiting task should be cancelled with AbortError
    const secondResult = await secondPromise;
    expect(secondResult).toEqual(
      err({
        type: "AbortError",
        reason: "Semaphore disposed",
      }),
    );
  });

  test("disposal prevents new Tasks from being accepted", async () => {
    const mutex = createMutex();

    // Dispose the mutex
    mutex[Symbol.dispose]();

    const task = toTask(() => {
      return Promise.resolve(ok("should-not-run"));
    });

    // Try to execute a task on disposed mutex
    const result = await mutex.withLock(task)();

    expect(result).toEqual(
      err({
        type: "AbortError",
        reason: "Semaphore disposed",
      }),
    );
  });

  test("disposal is idempotent", () => {
    const mutex = createMutex();

    // Multiple disposals should not throw
    expect(() => {
      mutex[Symbol.dispose]();
      mutex[Symbol.dispose]();
      mutex[Symbol.dispose]();
    }).not.toThrow();
  });
});

describe("Task Composition", () => {
  // Mock fetch for testing
  const mockFetch = vi.fn();
  const urlCalls = new Map<string, number>();

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockClear();
  });

  interface FetchError {
    readonly type: "FetchError";
    readonly error: unknown;
  }

  test("timeout, retry, and semaphore working together", async () => {
    mockFetch.mockImplementation((url: string) => {
      const currentCalls = urlCalls.get(url) ?? 0;
      urlCalls.set(url, currentCalls + 1);

      // Simulate flaky network - fail first few times per specific URL
      if (url.includes("users") && currentCalls < 2) {
        return Promise.reject(new Error("Network timeout"));
      }
      if (url.includes("posts") && currentCalls < 2) {
        return Promise.reject(new Error("Server error"));
      }
      // Eventually succeed
      return Promise.resolve(new Response(`Success for ${url}`));
    });

    // Basic fetch task
    const fetchTask = (url: string) =>
      toTask((context) =>
        tryAsync(
          () => fetch(url, { signal: context?.signal ?? null }),
          (error): FetchError => ({ type: "FetchError", error }),
        ),
      );

    // Compose timeout and retry for resilient fetching
    const resilientFetch = (url: string) =>
      retry(
        {
          retries: PositiveInt.orThrow(3),
          initialDelay: "1ms", // Fast for testing
          retryable: (error: FetchError | TimeoutError) =>
            error.type === "FetchError",
        },
        timeout("100ms", fetchTask(url)),
      );

    // Limit concurrent requests to prevent overwhelming the server
    const semaphore = createSemaphore(PositiveInt.orThrow(2));

    const fetchWithConcurrencyLimit = (url: string) =>
      semaphore.withPermit(resilientFetch(url));

    // Usage: Fetch multiple URLs with timeout, retry, and concurrency control
    const urls = [
      "https://api.example.com/users",
      "https://api.example.com/posts",
      "https://api.example.com/comments",
    ];

    const results = await Promise.all(
      urls.map((url) => fetchWithConcurrencyLimit(url)()),
    );

    // All should succeed after retries
    expect(results.every((r) => r.ok)).toBe(true);

    // Verify the retry patterns worked correctly
    expect(Array.from(urlCalls.entries())).toMatchInlineSnapshot(`
      [
        [
          "https://api.example.com/users",
          3,
        ],
        [
          "https://api.example.com/posts",
          3,
        ],
        [
          "https://api.example.com/comments",
          1,
        ],
      ]
    `);

    // Test with cancellation support
    urlCalls.clear();
    const controller = new AbortController();
    const result = await fetchWithConcurrencyLimit(
      "https://api.example.com/data",
    )(controller);

    // Verify the complete error type includes all composed errors
    expect(result.ok).toBe(true);

    // Snapshot after successful data fetch
    expect(Array.from(urlCalls.entries())).toMatchInlineSnapshot(`
      [
        [
          "https://api.example.com/data",
          1,
        ],
      ]
    `);

    // Test cancellation actually works
    urlCalls.clear();
    const controller2 = new AbortController();
    controller2.abort("Test cancellation");
    const cancelledResult = await fetchWithConcurrencyLimit(
      "https://api.example.com/cancelled",
    )(controller2);

    expect(cancelledResult).toEqual(
      err({
        type: "AbortError",
        reason: "Test cancellation",
      }),
    );

    // Final snapshot showing the cancelled call didn't get tracked
    expect(Array.from(urlCalls.entries())).toMatchInlineSnapshot(`[]`);
  });
});

describe("Examples", () => {
  // Mock fetch for testing
  const mockFetch = vi.fn();
  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockClear();
  });

  interface FetchError {
    readonly type: "FetchError";
    readonly error: unknown;
  }

  // Task version of fetch with proper error handling and cancellation support.
  const fetch = (url: string) =>
    toTask((context) =>
      tryAsync(
        () => globalThis.fetch(url, { signal: context?.signal ?? null }),
        (error): FetchError => ({ type: "FetchError", error }),
      ),
    );

  // `satisfies` shows the expected type signature.
  fetch satisfies (url: string) => Task<Response, FetchError>;

  test("toTask", async () => {
    mockFetch.mockResolvedValue(new Response("success"));

    const result1 = await fetch("https://api.example.com/data")();
    result1 satisfies Result<Response, FetchError>;

    // With AbortController
    const controller = new AbortController();
    const result2 = await fetch("https://api.example.com/data")(controller);
    result2 satisfies Result<Response, FetchError | AbortError>;
  });

  test("wait", async () => {
    const result1 = await wait("10ms")();
    result1 satisfies Result<void, never>;

    // With AbortController
    const controller = new AbortController();
    const result2 = await wait("10ms")(controller);
    result2 satisfies Result<void, AbortError>;
  });

  test("timeout", async () => {
    const fetchWithTimeout = (url: string) => timeout("2m", fetch(url));

    const result1 = await fetchWithTimeout("https://api.example.com/data")();
    result1 satisfies Result<Response, FetchError | TimeoutError>;

    // With AbortController
    const controller = new AbortController();
    const result2 = await fetchWithTimeout("https://api.example.com/data")(
      controller,
    );
    result2 satisfies Result<Response, FetchError | TimeoutError | AbortError>;
  });

  test("retry", async () => {
    const fetchWithRetry = (url: string) =>
      retry({ retries: PositiveInt.orThrow(3) }, fetch(url));

    const result1 = await fetchWithRetry("https://api.example.com/data")();
    result1 satisfies Result<Response, FetchError | RetryError<FetchError>>;

    // With AbortController
    const controller = new AbortController();
    const result2 = await fetchWithRetry("https://api.example.com/data")(
      controller,
    );
    result2 satisfies Result<
      Response,
      FetchError | RetryError<FetchError> | AbortError
    >;
  });

  test("semaphore", async () => {
    // Allow maximum 3 concurrent Tasks
    const semaphore = createSemaphore(PositiveInt.orThrow(3));

    let currentConcurrent = 0;
    const events: Array<string> = [];

    const fetchData = (id: number) =>
      toTask<number, never>(async (context) => {
        currentConcurrent++;
        events.push(`start ${id} (concurrent: ${currentConcurrent})`);

        await wait("10ms")(context);

        currentConcurrent--;
        events.push(`end ${id} (concurrent: ${currentConcurrent})`);
        return ok(id * 10);
      });

    // These will execute with at most 3 running concurrently
    const results = await Promise.all([
      semaphore.withPermit(fetchData(1))(),
      semaphore.withPermit(fetchData(2))(),
      semaphore.withPermit(fetchData(3))(),
      semaphore.withPermit(fetchData(4))(), // waits for one above to complete
      semaphore.withPermit(fetchData(5))(), // waits for permit
    ]);

    expect(results.map(getOrThrow)).toEqual([10, 20, 30, 40, 50]);
    expect(events).toMatchInlineSnapshot(`
      [
        "start 1 (concurrent: 1)",
        "start 2 (concurrent: 2)",
        "start 3 (concurrent: 3)",
        "end 1 (concurrent: 2)",
        "start 4 (concurrent: 3)",
        "end 2 (concurrent: 2)",
        "start 5 (concurrent: 3)",
        "end 3 (concurrent: 2)",
        "end 4 (concurrent: 1)",
        "end 5 (concurrent: 0)",
      ]
    `);
  });

  test("composing timeout, retry, and semaphore", async () => {
    // Add timeout to prevent hanging
    const fetchWithTimeout = (url: string) => timeout("30s", fetch(url));

    fetchWithTimeout satisfies (
      url: string,
    ) => Task<Response, TimeoutError | FetchError>;

    // Add retry for resilience
    const fetchWithRetry = (url: string) =>
      retry(
        {
          retries: PositiveInt.orThrow(3),
          initialDelay: "100ms",
          retryable: (error) => error.type === "FetchError",
        },
        fetchWithTimeout(url),
      );

    fetchWithRetry satisfies (
      url: string,
    ) => Task<
      Response,
      TimeoutError | FetchError | RetryError<TimeoutError | FetchError>
    >;

    const semaphore = createSemaphore(PositiveInt.orThrow(2));

    // Control concurrency with semaphore
    const fetchWithPermit = (url: string) =>
      semaphore.withPermit(fetchWithRetry(url));

    fetchWithPermit satisfies (url: string) => Task<
      Response,
      | TimeoutError
      | FetchError
      | AbortError // Semaphore dispose aborts Tasks
      | RetryError<TimeoutError | FetchError>
    >;

    // Usage
    const results = await Promise.all(
      [
        "https://api.example.com/users",
        "https://api.example.com/posts",
        "https://api.example.com/comments",
      ]
        .map(fetchWithPermit)
        .map((task) => task()),
    );

    results satisfies Array<
      Result<
        Response,
        | AbortError
        | TimeoutError
        | FetchError
        | RetryError<TimeoutError | FetchError>
      >
    >;

    // Handle results
    for (const result of results) {
      if (result.ok) {
        // Process successful response
        const response = result.value;
        expect(response).toBeInstanceOf(Response);
      } else {
        // Handle error (TimeoutError, FetchError, RetryError, or AbortError)
        expect(result.error).toBeDefined();
      }
    }

    // Cancellation support
    const controller = new AbortController();
    const cancelableTask = fetchWithPermit("https://api.example.com/data");

    // Start task
    const promise = cancelableTask(controller);

    // Cancel after some time
    setTimeout(() => {
      controller.abort("User cancelled");
    }, 1000);

    const _result = await promise;
    // Result will be AbortError if cancelled
  });
});
