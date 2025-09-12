import { describe, expect, test, vi } from "vitest";
import {
  RetryOptions,
  createMutex,
  createSemaphore,
  retry,
  wait,
  withAbort,
  withTimeout,
} from "../src/Promise.js";
import { Result, err, ok } from "../src/Result.js";
import { PositiveInt } from "../src/Type.js";

describe("wait", () => {
  test("delays execution for specified milliseconds", async () => {
    vi.useFakeTimers();

    const cbSpy = vi.fn();
    const waitWrapper = async (ms: number, cb: () => void) => {
      await wait(ms);
      cb();
    };

    void waitWrapper(10, cbSpy);
    expect(cbSpy).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(10);

    expect(cbSpy).toHaveBeenCalled();

    vi.useRealTimers();
  });
});

describe("withAbort", () => {
  test("allows promise to complete when not aborted", async () => {
    const controller = new AbortController();
    const promise = wait(10);

    const result = await withAbort(promise, controller.signal);

    expect(result).toEqual(ok());
  });

  test("cancels promise when signal is aborted", async () => {
    const controller = new AbortController();
    const promise = wait(100); // Long delay

    // Abort after a short delay
    setTimeout(() => {
      controller.abort();
    }, 10);

    const result = await withAbort(promise, controller.signal);

    expect(result).toEqual(err({ type: "AbortError" }));
  });

  test("returns AbortError immediately when signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    const promise = wait(10);
    const result = await withAbort(promise, controller.signal);

    expect(result).toEqual(err({ type: "AbortError" }));
  });
});

describe("retry", () => {
  test("succeeds on first attempt", async () => {
    const fn = vi.fn().mockResolvedValue(ok());

    const result = await retry(fn);

    expect(result).toEqual(ok());
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test("succeeds after several attempts", async () => {
    // Mock function fails twice then succeeds
    const fn = vi
      .fn()
      .mockResolvedValueOnce(err({ type: "TestError", message: "Error 1" }))
      .mockResolvedValueOnce(err({ type: "TestError", message: "Error 2" }))
      .mockResolvedValueOnce(ok());

    const result = await retry(fn, { initialDelay: 1 });

    expect(result).toEqual(ok());
    expect(fn).toHaveBeenCalledTimes(3);
  });

  test("returns error after max retries", async () => {
    const testError = { type: "TestError", message: "Failed" };
    const fn = vi.fn().mockResolvedValue(err(testError));

    const result = await retry(fn, { maxRetries: 3, initialDelay: 1 });

    expect(result).toEqual(
      err({
        type: "RetryError",
        cause: testError,
        attempts: 4, // initial + 3 retries = 4 attempts
      }),
    );
    expect(fn).toHaveBeenCalledTimes(4); // initial + 3 retries = 4 attempts
  });

  test("handles abort before execution", async () => {
    const fn = vi.fn();
    const controller = new AbortController();

    // Abort before calling retry
    controller.abort();

    const result = await retry(fn, { signal: controller.signal });

    expect(result).toEqual(
      err({ type: "RetryAbortError", abortedBeforeExecution: true }),
    );
    expect(fn).not.toHaveBeenCalled();
  });

  test("handles abort during delay", async () => {
    // Function that fails on first call
    const fn = vi
      .fn()
      .mockResolvedValueOnce(err({ type: "TestError" }))
      .mockResolvedValueOnce(ok());

    const controller = new AbortController();

    // Set up a delayed abort
    setTimeout(() => {
      controller.abort();
    }, 5);

    const result = await retry(fn, {
      signal: controller.signal,
      initialDelay: 10, // longer than our abort timeout,
    });

    expect(result).toEqual(
      err({ type: "RetryAbortError", abortedBeforeExecution: false }),
    );
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test("uses retryable predicate", async () => {
    // Error types we'll use
    interface RetryableError {
      type: "RetryableError";
      attempt: number;
    }
    interface NonRetryableError {
      type: "NonRetryableError";
      reason: string;
    }

    // Function that returns different error types
    const fn = vi
      .fn()
      .mockResolvedValueOnce(err({ type: "RetryableError", attempt: 1 }))
      .mockResolvedValueOnce(
        err({ type: "NonRetryableError", reason: "fatal" }),
      )
      .mockResolvedValueOnce(ok());

    // Create options with retryable predicate
    const options: RetryOptions<RetryableError | NonRetryableError> = {
      initialDelay: 1,
      retryable: (error) => error.type === "RetryableError",
    };

    const result = await retry<string, RetryableError | NonRetryableError>(
      fn,
      options,
    );

    expect(result).toEqual(
      err({
        type: "RetryError",
        cause: { type: "NonRetryableError", reason: "fatal" },
        attempts: 2,
      }),
    );
    expect(fn).toHaveBeenCalledTimes(2);
  });

  test("calls onRetry callback", async () => {
    const onRetry = vi.fn();
    const testError = { type: "TestError", message: "Failed" };

    // Function that fails twice then succeeds
    const fn = vi
      .fn()
      .mockResolvedValueOnce(err(testError))
      .mockResolvedValueOnce(err(testError))
      .mockResolvedValueOnce(ok());

    const result = await retry(fn, {
      initialDelay: 1,
      onRetry,
    });

    expect(result).toEqual(ok());
    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledWith(testError, 1, expect.any(Number));
    expect(onRetry).toHaveBeenCalledWith(testError, 2, expect.any(Number));
  });

  test("uses exponential backoff with jitter", async () => {
    vi.useFakeTimers();
    const fn = vi
      .fn()
      .mockResolvedValueOnce(err({ type: "TestError" }))
      .mockResolvedValueOnce(err({ type: "TestError" }))
      .mockResolvedValueOnce(ok());

    // Create a promise we can resolve later
    let resolvePromise: (value: Result<string, unknown>) => void;
    const promise = new Promise<Result<string, unknown>>((resolve) => {
      resolvePromise = resolve;
    });

    // Start the retry process but don't await it
    const _retryPromise = retry<string, { type: "TestError" }>(fn, {
      initialDelay: 100,
      factor: 2,
      jitter: 0.1,
    }).then((result) => {
      resolvePromise(result);
      return result;
    });

    // First attempt happens immediately
    expect(fn).toHaveBeenCalledTimes(1);

    // Wait for first delay (~100ms with jitter)
    await vi.advanceTimersToNextTimerAsync();
    expect(fn).toHaveBeenCalledTimes(2);

    // Wait for second delay (~200ms with jitter)
    await vi.advanceTimersToNextTimerAsync();
    expect(fn).toHaveBeenCalledTimes(3);

    const result = await promise;
    expect(result).toEqual(ok());

    vi.useRealTimers();
  });

  test("with real delays works as expected", async () => {
    // Keep track of when each attempt happens
    const attemptTimes: Array<number> = [];
    const onRetry = vi.fn();

    // Function that fails 3 times then succeeds
    const fn = vi.fn().mockImplementation(() => {
      const now = Date.now();
      attemptTimes.push(now);

      if (attemptTimes.length <= 3) {
        return Promise.resolve(err({ type: "TestError" }));
      } else {
        return Promise.resolve(ok());
      }
    });

    // Use real short delays
    const result = await retry(fn, {
      maxRetries: 3,
      initialDelay: 50, // 50ms initial delay
      factor: 2, // Double each time
      jitter: 0, // No jitter for predictable testing
      onRetry,
    });

    // Should succeed after 4 attempts (1 initial + 3 retries)
    expect(result).toEqual(ok());
    expect(fn).toHaveBeenCalledTimes(4);
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
    const fn = vi.fn().mockImplementation(() => {
      const now = Date.now();
      attemptTimes.push(now);
      return Promise.resolve(err({ type: "TestError" }));
    });

    // Use a very short maxDelay to demonstrate the capping effect
    const result = await retry(fn, {
      maxRetries: 3,
      initialDelay: 50, // 50ms initial delay
      factor: 10, // Would normally increase 50 -> 500 -> 5000, but maxDelay caps it
      maxDelay: 100, // Cap delays at 100ms
      jitter: 0, // No jitter for predictable testing
      onRetry,
    });

    // Should fail after 4 attempts (1 initial + 3 retries)
    expect(result).toEqual(
      err({
        type: "RetryError",
        cause: { type: "TestError" },
        attempts: 4,
      }),
    );
    expect(fn).toHaveBeenCalledTimes(4);
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

describe("withTimeout", () => {
  test("returns result when function completes before timeout", async () => {
    const expectedResult = ok();
    const fn = vi.fn().mockImplementation((signal: AbortSignal) => {
      expect(signal).toBeInstanceOf(AbortSignal);
      expect(signal.aborted).toBe(false);
      return Promise.resolve(expectedResult);
    });

    const result = await withTimeout(fn, 100);

    expect(result).toEqual(expectedResult);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test("returns TimeoutError when function exceeds timeout", async () => {
    // Use a small timeout for faster test execution
    const timeoutMs = 10;

    // Create a function that never resolves within our timeout
    const fn = vi.fn().mockImplementation((_signal: AbortSignal) => {
      return new Promise<Result<string, never>>((resolve) => {
        // This promise intentionally doesn't resolve during our timeout
        const id = setTimeout(() => {
          resolve(ok("too late"));
        }, 1000);
        return () => {
          clearTimeout(id); // Just to avoid hanging promises
        };
      });
    });

    const result = await withTimeout(fn, timeoutMs);

    // Should return a TimeoutError
    expect(result).toEqual(err({ type: "TimeoutError", timeoutMs }));
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test("passes AbortSignal to function", async () => {
    const fn = vi.fn().mockImplementation((signal: AbortSignal) => {
      expect(signal).toBeInstanceOf(AbortSignal);
      expect(signal.aborted).toBe(false);
      return Promise.resolve(ok());
    });

    await withTimeout(fn, 100);

    expect(fn).toHaveBeenCalledWith(expect.any(AbortSignal));
  });

  test("handles function completion efficiently", async () => {
    // This test verifies that withTimeout works correctly when the function completes
    // before the timeout, without relying on implementation details
    const fn = vi.fn().mockResolvedValue(ok("completed"));

    const result = await withTimeout(fn, 100);

    expect(result).toEqual(ok("completed"));
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test("works with a function returning an error result", async () => {
    const expectedError = { type: "CustomError", message: "Failed" };
    const fn = vi.fn().mockResolvedValue(err(expectedError));

    const result = await withTimeout(fn, 100);

    expect(result).toEqual(err(expectedError));
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test("integrates with AbortController from outside", async () => {
    const externalController = new AbortController();
    let innerSignal: AbortSignal | null = null;

    const fn = vi.fn().mockImplementation((signal: AbortSignal) => {
      innerSignal = signal;
      return new Promise<Result<void, "aborted">>((resolve) => {
        const timeoutId = setTimeout(() => {
          resolve(ok());
        }, 200);

        signal.addEventListener("abort", () => {
          clearTimeout(timeoutId);
          resolve(err("aborted"));
        });
      });
    });

    const timeoutPromise = withTimeout((signal) => {
      // Pass the signal to our function but also make sure to respect the external abort
      externalController.signal.addEventListener("abort", () => {
        if (!signal.aborted) {
          // This would happen if the external controller aborts before the timeout
          // In a real implementation, you would handle this appropriately
        }
      });

      return fn(signal) as never;
    }, 100);

    // Abort from the external controller
    externalController.abort();

    const _result = await timeoutPromise;

    expect(fn).toHaveBeenCalledTimes(1);
    expect(innerSignal).not.toBeNull();
  });
});

describe("createSemaphore", () => {
  test("allows concurrent operations up to limit", async () => {
    const semaphore = createSemaphore(PositiveInt.fromOrThrow(2));
    let runningCount = 0;
    let maxRunning = 0;

    const operation = async (duration: number) => {
      runningCount++;
      maxRunning = Math.max(maxRunning, runningCount);
      await wait(duration);
      runningCount--;
      return runningCount;
    };

    // Start 4 operations, but only 2 should run concurrently
    await Promise.all([
      semaphore.withPermit(() => operation(50)),
      semaphore.withPermit(() => operation(50)),
      semaphore.withPermit(() => operation(50)),
      semaphore.withPermit(() => operation(50)),
    ]);

    // Should never have more than 2 running at once
    expect(maxRunning).toBe(2);
  });

  test("executes operations sequentially with limit of 1", async () => {
    const semaphore = createSemaphore(PositiveInt.fromOrThrow(1));
    const events: Array<{
      id: number;
      event: "start" | "end";
      timestamp: number;
    }> = [];

    const operation = async (id: number) => {
      events.push({ id, event: "start", timestamp: Date.now() });
      await wait(20); // Longer delay to ensure overlap would be detectable
      events.push({ id, event: "end", timestamp: Date.now() });
      return id;
    };

    await Promise.all([
      semaphore.withPermit(() => operation(1)),
      semaphore.withPermit(() => operation(2)),
      semaphore.withPermit(() => operation(3)),
    ]);

    // Verify sequential execution: each operation must fully complete before the next starts
    expect(events).toEqual([
      expect.objectContaining({ id: 1, event: "start" }),
      expect.objectContaining({ id: 1, event: "end" }),
      expect.objectContaining({ id: 2, event: "start" }),
      expect.objectContaining({ id: 2, event: "end" }),
      expect.objectContaining({ id: 3, event: "start" }),
      expect.objectContaining({ id: 3, event: "end" }),
    ]);
  });

  test("fails fast on unexpected errors without releasing permits", async () => {
    const semaphore = createSemaphore(PositiveInt.fromOrThrow(1));

    const failingOperation = () => {
      throw new Error("Unexpected error");
    };

    // Operation throws unexpected error - should bubble up
    await expect(semaphore.withPermit(failingOperation)).rejects.toThrow(
      "Unexpected error",
    );

    // Note: In real code, the app would have crashed at this point.
    // The semaphore permit is intentionally "leaked" because we don't
    // attempt to recover from unexpected errors.
  });
});

describe("createMutex", () => {
  test("executes operations sequentially", async () => {
    const mutex = createMutex();
    const events: Array<string> = [];

    const operation = async (id: number) => {
      events.push(`start-${id}`);
      await wait(10);
      events.push(`end-${id}`);
      return id;
    };

    const results = await Promise.all([
      mutex.withLock(() => operation(1)),
      mutex.withLock(() => operation(2)),
    ]);

    expect(results).toEqual([1, 2]);
    expect(events).toEqual(["start-1", "end-1", "start-2", "end-2"]);
  });

  test("behaves as semaphore with permit count of 1", async () => {
    const mutex = createMutex();
    const semaphore = createSemaphore(PositiveInt.fromOrThrow(1));

    const mutexEvents: Array<string> = [];
    const semaphoreEvents: Array<string> = [];

    const operation = async (id: number, events: Array<string>) => {
      events.push(`start-${id}`);
      await wait(10);
      events.push(`end-${id}`);
      return id;
    };

    await Promise.all([
      mutex.withLock(() => operation(1, mutexEvents)),
      mutex.withLock(() => operation(2, mutexEvents)),
    ]);

    await Promise.all([
      semaphore.withPermit(() => operation(1, semaphoreEvents)),
      semaphore.withPermit(() => operation(2, semaphoreEvents)),
    ]);

    // Both should exhibit identical behavior
    expect(mutexEvents).toEqual(semaphoreEvents);
  });
});
