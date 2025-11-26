import { isNonEmptyArray, shiftArray } from "./Array.js";
import { Result, err, ok } from "./Result.js";
import { Duration, durationToNonNegativeInt } from "./Time.js";
import { NonNegativeInt, PositiveInt } from "./Type.js";

/**
 * `Task` is a function that creates and returns an optionally cancellable
 * Promise using {@link Result}.
 *
 * The laziness allows safe composition, e.g. retry logic, because it prevents
 * eager execution until the Task is actually invoked.
 *
 * ### Cancellation
 *
 * Tasks support optional cancellation via signal in {@link TaskContext}. When a
 * Task is called without a signal, it cannot be cancelled and {@link AbortError}
 * will never be returned. When called with a signal, the Task can be cancelled
 * and AbortError is added to the error union with precise type safety.
 *
 * When composing Tasks, we typically have context and want to abort ASAP by
 * passing it through. However, there are valid cases where we don't want to
 * abort because we need some atomic unit to complete. For simple scripts and
 * tests, omitting context is fine.
 *
 * ### Task Helpers
 *
 * - {@link toTask} - Convert async function to Task
 * - {@link wait} - Delay execution for a specified {@link Duration}
 * - {@link timeout} - Add timeout to any Task
 * - {@link retry} - Retry failed Tasks with configurable backoff
 *
 * ### Example
 *
 * ```ts
 * interface FetchError {
 *   readonly type: "FetchError";
 *   readonly error: unknown;
 * }
 *
 * // Task version of fetch with proper error handling and cancellation support.
 * const fetch = (url: string) =>
 *   toTask((context) =>
 *     tryAsync(
 *       () => globalThis.fetch(url, { signal: context?.signal ?? null }),
 *       (error): FetchError => ({ type: "FetchError", error }),
 *     ),
 *   );
 *
 * // `satisfies` shows the expected type signature.
 * fetch satisfies (url: string) => Task<Response, FetchError>;
 *
 * // Add timeout to prevent hanging
 * const fetchWithTimeout = (url: string) => timeout("30s", fetch(url));
 *
 * fetchWithTimeout satisfies (
 *   url: string,
 * ) => Task<Response, TimeoutError | FetchError>;
 *
 * // Add retry for resilience
 * const fetchWithRetry = (url: string) =>
 *   retry(
 *     {
 *       retries: PositiveInt.orThrow(3),
 *       initialDelay: "100ms",
 *     },
 *     fetchWithTimeout(url),
 *   );
 *
 * fetchWithRetry satisfies (
 *   url: string,
 * ) => Task<
 *   Response,
 *   TimeoutError | FetchError | RetryError<TimeoutError | FetchError>
 * >;
 *
 * const semaphore = createSemaphore(PositiveInt.orThrow(2));
 *
 * // Control concurrency with semaphore
 * const fetchWithPermit = (url: string) =>
 *   semaphore.withPermit(fetchWithRetry(url));
 *
 * fetchWithPermit satisfies (url: string) => Task<
 *   Response,
 *   | TimeoutError
 *   | FetchError
 *   | AbortError // Semaphore dispose aborts Tasks
 *   | RetryError<TimeoutError | FetchError>
 * >;
 *
 * // Usage
 * const results = await Promise.all(
 *   [
 *     "https://api.example.com/users",
 *     "https://api.example.com/posts",
 *     "https://api.example.com/comments",
 *   ]
 *     .map(fetchWithPermit)
 *     .map((task) => task()),
 * );
 *
 * results satisfies Array<
 *   Result<
 *     Response,
 *     | AbortError
 *     | TimeoutError
 *     | FetchError
 *     | RetryError<TimeoutError | FetchError>
 *   >
 * >;
 *
 * // Handle results
 * for (const result of results) {
 *   if (result.ok) {
 *     // Process successful response
 *     const response = result.value;
 *     expect(response).toBeInstanceOf(Response);
 *   } else {
 *     // Handle error (TimeoutError, FetchError, RetryError, or AbortError)
 *     expect(result.error).toBeDefined();
 *   }
 * }
 *
 * // Cancellation support
 * const controller = new AbortController();
 * const cancelableTask = fetchWithPermit("https://api.example.com/data");
 *
 * // Start task
 * const promise = cancelableTask(controller);
 *
 * // Cancel after some time
 * setTimeout(() => {
 *   controller.abort("User cancelled");
 * }, 1000);
 *
 * const _result = await promise;
 * // Result will be AbortError if cancelled
 * ```
 *
 * ### Dependency Injection Integration
 *
 * Tasks integrate naturally with Evolu's DI pattern. Use `deps` for static
 * dependencies and `TaskContext` for execution context like cancellation. Usage
 * follows the pattern: deps → arguments → execution context.
 */
export interface Task<T, E> {
  /**
   * Invoke the Task.
   *
   * Provide a context with an AbortSignal to enable cancellation. When called
   * without a signal, {@link AbortError} cannot occur and the error type narrows
   * accordingly.
   *
   * ### Example
   *
   * ```ts
   * interface FetchError {
   *   readonly type: "FetchError";
   *   readonly error: unknown;
   * }
   *
   * // Task version of fetch with proper error handling and cancellation support.
   * const fetch = (url: string) =>
   *   toTask((context) =>
   *     tryAsync(
   *       () => globalThis.fetch(url, { signal: context?.signal ?? null }),
   *       (error): FetchError => ({ type: "FetchError", error }),
   *     ),
   *   );
   *
   * // `satisfies` shows the expected type signature.
   * fetch satisfies (url: string) => Task<Response, FetchError>;
   *
   * const result1 = await fetch("https://api.example.com/data")();
   * expectTypeOf(result1).toEqualTypeOf<Result<Response, FetchError>>();
   *
   * // With AbortController
   * const controller = new AbortController();
   * const result2 = await fetch("https://api.example.com/data")(
   *   controller,
   * );
   * expectTypeOf(result2).toEqualTypeOf<
   *   Result<Response, FetchError | AbortError>
   * >();
   * ```
   */
  // eslint-disable-next-line @typescript-eslint/prefer-function-type
  <TContext extends TaskContext | undefined = undefined>(
    context?: TContext,
  ): Promise<
    Result<T, TContext extends { signal: AbortSignal } ? E | AbortError : E>
  >;
}

/** Context passed to {@link Task}s for cancellation. */
export interface TaskContext {
  /** Signal for cancellation */
  readonly signal?: AbortSignal;
}

/** Error returned when a {@link Task} is cancelled via AbortSignal. */
export interface AbortError {
  readonly type: "AbortError";
  readonly reason?: unknown;
}

/** Narrower check to detect AbortError objects at runtime. */
const isAbortError = (error: unknown): error is AbortError =>
  typeof error === "object" &&
  error !== null &&
  (error as { type?: unknown }).type === "AbortError";

// For React Native
if (typeof AbortSignal.any !== "function") {
  AbortSignal.any = function (signals: Array<AbortSignal>): AbortSignal {
    const controller = new AbortController();

    const onAbort = (event: Event) => {
      controller.abort((event.target as AbortSignal).reason);
      cleanup();
    };

    const cleanup = () => {
      for (const s of signals) s.removeEventListener("abort", onAbort);
    };

    for (const s of signals) {
      if (s.aborted) {
        controller.abort(s.reason);
        return controller.signal;
      }
      s.addEventListener("abort", onAbort);
    }

    return controller.signal;
  };
}

/**
 * Combines user signal from context with an internal signal.
 *
 * If the context has a signal, combines both signals using AbortSignal.any().
 * Otherwise, returns just the internal signal.
 */
const combineSignal = (
  context: TaskContext | undefined,
  internalSignal: AbortSignal,
): AbortSignal =>
  context?.signal
    ? AbortSignal.any([context.signal, internalSignal])
    : internalSignal;

/**
 * Converts async function returning {@link Result} to a {@link Task}.
 *
 * ### Example
 *
 * ```ts
 * interface FetchError {
 *   readonly type: "FetchError";
 *   readonly error: unknown;
 * }
 *
 * // Task version of fetch with proper error handling and cancellation support.
 * const fetch = (url: string) =>
 *   toTask((context) =>
 *     tryAsync(
 *       () => globalThis.fetch(url, { signal: context?.signal ?? null }),
 *       (error): FetchError => ({ type: "FetchError", error }),
 *     ),
 *   );
 *
 * // `satisfies` shows the expected type signature.
 * fetch satisfies (url: string) => Task<Response, FetchError>;
 *
 * const result1 = await fetch("https://api.example.com/data")();
 * result1 satisfies Result<Response, FetchError>;
 *
 * // With AbortController
 * const controller = new AbortController();
 * const result2 = await fetch("https://api.example.com/data")(controller);
 * result2 satisfies Result<Response, FetchError | AbortError>;
 * ```
 */
export const toTask = <T, E>(
  fn: (context?: TaskContext) => Promise<Result<T, E>>,
): Task<T, E> =>
  // Note: Not using async to avoid Promise wrapper overhead in fast path
  ((context) => {
    const signal = context?.signal;

    // Fast path when no signal – return promise directly
    if (!signal) {
      // Preserve future context fields (e.g., tracing) even without a signal
      return fn(context);
    }

    if (signal.aborted) {
      return Promise.resolve(
        err({ type: "AbortError", reason: signal.reason as unknown }),
      );
    }

    // Use Promise.withResolvers for clean abort handling and cleanup
    const { promise: abortPromise, resolve: resolveAbort } =
      Promise.withResolvers<Result<never, AbortError>>();

    const handleAbort = () => {
      resolveAbort(
        err({ type: "AbortError", reason: signal.reason as unknown }),
      );
    };

    signal.addEventListener("abort", handleAbort, { once: true });

    // No finally: we expect no throws in normal flow; Result path removes listener.
    // Unexpected throws indicate a bug and are allowed to crash (no recovery here).
    return Promise.race([
      abortPromise,
      fn(context).then((result) => {
        signal.removeEventListener("abort", handleAbort);
        return result;
      }),
    ]);
  }) as Task<T, E>;

// For React Native
if (typeof AbortSignal.timeout !== "function") {
  AbortSignal.timeout = function (ms: number): AbortSignal {
    const controller = new AbortController();
    const id = setTimeout(() => {
      controller.abort();
    }, ms);
    // clear timeout if aborted early
    controller.signal.addEventListener("abort", () => {
      clearTimeout(id);
    });
    return controller.signal;
  };
}

/**
 * Creates a {@link Task} that waits for the specified duration.
 *
 * ### Example
 *
 * ```ts
 * const result1 = await wait("10ms")();
 * result1 satisfies Result<void, never>;
 *
 * // With AbortController
 * const controller = new AbortController();
 * const result2 = await wait("10ms")(controller);
 * result2 satisfies Result<void, AbortError>;
 * ```
 */
export const wait = (duration: Duration): Task<void, never> =>
  toTask(
    (context) =>
      new Promise<Result<void, never>>((resolve) => {
        const ms = durationToNonNegativeInt(duration);
        const timeoutSignal = AbortSignal.timeout(ms);

        const signal = combineSignal(context, timeoutSignal);

        // Listen for abort - either from timeout completion or external abort
        signal.addEventListener(
          "abort",
          () => {
            resolve(ok());
          },
          { once: true },
        );
      }),
  );

/** Error returned when {@link timeout} exceeds the specified duration. */
export interface TimeoutError {
  readonly type: "TimeoutError";
  readonly timeoutMs: number;
}

/**
 * Adds timeout behavior to a {@link Task}.
 *
 * ### Example
 *
 * ```ts
 * interface FetchError {
 *   readonly type: "FetchError";
 *   readonly error: unknown;
 * }
 *
 * // Task version of fetch with proper error handling and cancellation support.
 * const fetch = (url: string) =>
 *   toTask((context) =>
 *     tryAsync(
 *       () => globalThis.fetch(url, { signal: context?.signal ?? null }),
 *       (error): FetchError => ({ type: "FetchError", error }),
 *     ),
 *   );
 *
 * // `satisfies` shows the expected type signature.
 * fetch satisfies (url: string) => Task<Response, FetchError>;
 *
 * const fetchWithTimeout = (url: string) => timeout("2m", fetch(url));
 *
 * const result1 = await fetchWithTimeout("https://api.example.com/data")();
 * result1 satisfies Result<Response, FetchError | TimeoutError>;
 *
 * // With AbortController
 * const controller = new AbortController();
 * const result2 = await fetchWithTimeout("https://api.example.com/data")(
 *   controller,
 * );
 * result2 satisfies Result<
 *   Response,
 *   FetchError | TimeoutError | AbortError
 * >;
 * ```
 */
export const timeout = <T, E>(
  duration: Duration,
  task: Task<T, E>,
): Task<T, E | TimeoutError> =>
  toTask(async (context) => {
    const timeoutMs = durationToNonNegativeInt(duration);
    const timeoutSignal = AbortSignal.timeout(timeoutMs);

    const signal = combineSignal(context, timeoutSignal);

    const result = await task({ signal });

    if (timeoutSignal.aborted) {
      return err({ type: "TimeoutError", timeoutMs });
    }

    return result as Result<T, E | TimeoutError>;
  });

/** Options for configuring {@link retry} behavior. */
export interface RetryOptions<E> {
  /** Number of retry attempts after the initial failure. */
  readonly retries: PositiveInt;

  /**
   * Initial delay for exponential backoff (1st retry uses this, 2nd uses
   * this×factor, 3rd uses this×factor², etc.). Actual delays are randomized by
   * {@link RetryOptions.jitter}.
   */
  readonly initialDelay?: Duration;

  /** Maximum delay between retries. */
  readonly maxDelay?: Duration;

  /** Exponential backoff multiplier. */
  readonly factor?: number;

  /** Random jitter factor (0-1) to prevent thundering herd. */
  readonly jitter?: number;

  /**
   * Predicate to determine if error should trigger retry. Receives AbortError
   * too.
   */
  readonly retryable?: (error: E | AbortError) => boolean;

  /** Callback invoked before each retry attempt. */
  readonly onRetry?: (error: E, attempt: number, delay: number) => void;
}

/** Error returned when {@link retry} exhausts all retry attempts. */
export interface RetryError<E> {
  readonly type: "RetryError";
  readonly cause: E;
  readonly attempts: number;
}

/**
 * Adds retry logic with exponential backoff and jitter to a {@link Task}.
 *
 * ### Example
 *
 * ```ts
 * interface FetchError {
 *   readonly type: "FetchError";
 *   readonly error: unknown;
 * }
 *
 * // Task version of fetch with proper error handling and cancellation support.
 * const fetch = (url: string) =>
 *   toTask((context) =>
 *     tryAsync(
 *       () => globalThis.fetch(url, { signal: context?.signal ?? null }),
 *       (error): FetchError => ({ type: "FetchError", error }),
 *     ),
 *   );
 *
 * // `satisfies` shows the expected type signature.
 * fetch satisfies (url: string) => Task<Response, FetchError>;
 *
 * const fetchWithRetry = (url: string) =>
 *   retry({ retries: PositiveInt.orThrow(3) }, fetch(url));
 *
 * const result1 = await fetchWithRetry("https://api.example.com/data")();
 * result1 satisfies Result<Response, FetchError | RetryError<FetchError>>;
 *
 * // With AbortController
 * const controller = new AbortController();
 * const result2 = await fetchWithRetry("https://api.example.com/data")(
 *   controller,
 * );
 * result2 satisfies Result<
 *   Response,
 *   FetchError | RetryError<FetchError> | AbortError
 * >;
 * ```
 */
export const retry = <T, E>(
  {
    retries,
    initialDelay = "1s",
    maxDelay = "30s",
    factor = 2,
    jitter = 0.5,
    retryable = (error: E | AbortError) => !isAbortError(error),
    onRetry,
  }: RetryOptions<E>,
  task: Task<T, E>,
): Task<T, E | RetryError<E>> =>
  toTask(async (context): Promise<Result<T, E | RetryError<E>>> => {
    const initialDelayMs = durationToNonNegativeInt(initialDelay);
    const maxDelayMs = durationToNonNegativeInt(maxDelay);
    const maxRetries = PositiveInt.orThrow(retries);

    let attempt = 0;

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    while (true) {
      const result = await task(context);

      if (result.ok) {
        return result;
      }

      // Never retry on AbortError; propagate it directly
      if (isAbortError(result.error)) {
        return err(result.error) as Result<T, E | RetryError<E>>;
      }

      attempt += 1;

      if (attempt > maxRetries || !retryable(result.error)) {
        return err({
          type: "RetryError",
          cause: result.error,
          attempts: attempt,
        });
      }

      // Calculate delay with exponential backoff
      const exponentialDelay = initialDelayMs * Math.pow(factor, attempt - 1);
      const cappedDelay = Math.min(exponentialDelay, maxDelayMs);

      // Apply jitter to prevent thundering herd problem
      const randomFactor = 1 - jitter + Math.random() * jitter * 2;
      const delay = Math.floor(cappedDelay * randomFactor);

      if (onRetry) {
        onRetry(result.error, attempt, delay);
      }

      // Wait before retry
      {
        const result = await wait(NonNegativeInt.orThrow(delay))(context);
        if (!result.ok) {
          // If delay was aborted, return AbortError (will be handled by toTask)
          return result;
        }
      }
    }
  });

/**
 * A semaphore that limits the number of concurrent async Tasks.
 *
 * For mutual exclusion (limiting to exactly one Task), consider using
 * {@link Mutex} instead.
 *
 * @see {@link createSemaphore} to create a semaphore instance.
 */
export interface Semaphore extends Disposable {
  /**
   * Executes a Task while holding a semaphore permit.
   *
   * The Task will wait until a permit is available before executing. Supports
   * cancellation via AbortSignal - if the signal is aborted while waiting for a
   * permit or during execution, the Task is cancelled and permits are properly
   * released.
   */
  readonly withPermit: <T, E>(task: Task<T, E>) => Task<T, E | AbortError>;
}

/**
 * Creates a semaphore that limits concurrent async Tasks to the specified
 * count.
 *
 * A semaphore controls access to a resource by maintaining a count of available
 * permits. Tasks acquire a permit before executing and release it when
 * complete.
 *
 * For mutual exclusion (exactly one Task at a time), consider using
 * {@link createMutex} instead.
 *
 * ### Example
 *
 * ```ts
 * // Allow maximum 3 concurrent Tasks
 * const semaphore = createSemaphore(PositiveInt.orThrow(3));
 *
 * let currentConcurrent = 0;
 * const events: Array<string> = [];
 *
 * const fetchData = (id: number) =>
 *   toTask<number, never>(async (context) => {
 *     currentConcurrent++;
 *     events.push(`start ${id} (concurrent: ${currentConcurrent})`);
 *
 *     await wait("10ms")(context);
 *
 *     currentConcurrent--;
 *     events.push(`end ${id} (concurrent: ${currentConcurrent})`);
 *     return ok(id * 10);
 *   });
 *
 * // These will execute with at most 3 running concurrently
 * const results = await Promise.all([
 *   semaphore.withPermit(fetchData(1))(),
 *   semaphore.withPermit(fetchData(2))(),
 *   semaphore.withPermit(fetchData(3))(),
 *   semaphore.withPermit(fetchData(4))(), // waits for one above to complete
 *   semaphore.withPermit(fetchData(5))(), // waits for permit
 * ]);
 *
 * expect(results.map(getOrThrow)).toEqual([10, 20, 30, 40, 50]);
 * expect(events).toMatchInlineSnapshot(`
 *   [
 *     "start 1 (concurrent: 1)",
 *     "start 2 (concurrent: 2)",
 *     "start 3 (concurrent: 3)",
 *     "end 1 (concurrent: 2)",
 *     "start 4 (concurrent: 3)",
 *     "end 2 (concurrent: 2)",
 *     "start 5 (concurrent: 3)",
 *     "end 3 (concurrent: 2)",
 *     "end 4 (concurrent: 1)",
 *     "end 5 (concurrent: 0)",
 *   ]
 * `);
 * ```
 */
export const createSemaphore = (maxConcurrent: PositiveInt): Semaphore => {
  let isDisposed = false;
  let availablePermits = maxConcurrent;
  const waitingQueue: Array<() => void> = [];
  const semaphoreController = new AbortController();

  const acquire = (): Promise<void> => {
    if (availablePermits > 0) {
      availablePermits--;
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      waitingQueue.push(resolve);
    });
  };

  const release = (): void => {
    if (isNonEmptyArray(waitingQueue)) {
      shiftArray(waitingQueue)();
    } else {
      availablePermits++;
    }
  };

  return {
    withPermit: <T, E>(task: Task<T, E>): Task<T, E | AbortError> =>
      toTask(async (context): Promise<Result<T, E | AbortError>> => {
        await acquire();

        // Check if semaphore was disposed while waiting
        if (isDisposed) {
          return err({
            type: "AbortError",
            reason: "Semaphore disposed",
          });
        }

        const signal = combineSignal(context, semaphoreController.signal);

        const result = await task({ signal });

        release();

        return result;
      }),

    [Symbol.dispose]: () => {
      if (isDisposed) return;
      isDisposed = true;

      // Cancel all running and waiting tasks
      semaphoreController.abort("Semaphore disposed");

      // Release all waiting tasks so they can continue and check isDisposed
      while (isNonEmptyArray(waitingQueue)) {
        shiftArray(waitingQueue)();
      }
    },
  };
};

/**
 * A mutex (mutual exclusion) that ensures only one Task runs at a time.
 *
 * This is a specialized version of a {@link Semaphore} with a permit count of 1.
 *
 * @see {@link createMutex} to create a mutex instance.
 */
export interface Mutex extends Disposable {
  /**
   * Executes a Task while holding the mutex lock.
   *
   * Only one Task can hold the lock at a time. Other Tasks will wait until the
   * lock is released. Supports cancellation via AbortSignal.
   */
  readonly withLock: <T, E>(task: Task<T, E>) => Task<T, E | AbortError>;
}

/**
 * Creates a new mutex for ensuring mutual exclusion.
 *
 * A mutex is a {@link createSemaphore} with exactly one permit, ensuring that
 * only one Task can execute at a time.
 *
 * ### Example
 *
 * ```ts
 * const mutex = createMutex();
 *
 * const updateTask = (id: number) =>
 *   toTask((context) =>
 *     tryAsync(
 *       () => updateSharedResource(id, context),
 *       (error): UpdateError => ({ type: "UpdateError", error }),
 *     ),
 *   );
 *
 * // These Tasks will execute one at a time
 * const results = await Promise.all([
 *   mutex.withLock(updateTask(1))(),
 *   mutex.withLock(updateTask(2))(),
 *   mutex.withLock(updateTask(3))(),
 * ]);
 * ```
 */
export const createMutex = (): Mutex => {
  const mutex = createSemaphore(PositiveInt.orThrow(1));

  return {
    withLock: mutex.withPermit,
    [Symbol.dispose]: mutex[Symbol.dispose],
  };
};

/**
 * Schedule a task to run after all interactions (animations, gestures,
 * navigation) have completed.
 *
 * This uses `requestIdleCallback` when available, otherwise falls back to
 * `setTimeout(0)` for cross-platform compatibility.
 *
 * ### Example
 *
 * ```ts
 * const processDataTask: Task<void, ProcessError> = toTask(async () => {
 *   // Heavy processing work
 *   return ok();
 * });
 *
 * // Schedule the task to run when idle
 * void requestIdleTask(processDataTask)();
 * ```
 */
export const requestIdleTask = <T, E>(task: Task<T, E>): Task<T, E> =>
  toTask(
    async (context?: TaskContext) =>
      new Promise<Result<T, E>>((resolve) => {
        idleCallback(() => {
          void task(context).then(resolve);
        });
      }),
  );

const idleCallback: (callback: () => void) => void =
  typeof globalThis.requestIdleCallback === "function"
    ? globalThis.requestIdleCallback
    : (callback) => setTimeout(callback, 0);

/**
 * Represents a value that can be either synchronous or asynchronous.
 *
 * This type is useful for functions that may complete synchronously or
 * asynchronously depending on runtime conditions (e.g., cache hit vs network
 * fetch).
 *
 * ### Why MaybeAsync?
 *
 * When a function can be sync or async, the typical approaches are:
 *
 * 1. **Always return Promise** - Simple but forces microtask overhead even for
 *    sync values (see "await always adds microtask" test in Task.test.ts)
 * 2. **Use callbacks** - Can avoid microtask, but calling code must still `await`
 *    for sane composition, which adds microtask anyway
 * 3. **Return `T | PromiseLike<T>`** - Calling code can check the value and only
 *    `await` when needed, avoiding microtask overhead for sync cases
 *
 * The third approach (MaybeAsync) provides:
 *
 * - **Performance**: No microtask overhead for synchronous operations
 * - **Reliability**: No interleaving via microtask queue when operations are
 *   _synchronous_, reducing need for mutexes to protect shared state
 *
 * ### Example
 *
 * ```ts
 * // Function that may be sync or async
 * const getData = (id: string): MaybeAsync<Data> => {
 *   const cached = cache.get(id);
 *   if (cached) return cached; // Sync path
 *   return fetchData(id); // Async path
 * };
 *
 * // Caller can optimize based on actual behavior
 * const result = getData(id);
 * const data = isAsync(result) ? await result : result;
 * ```
 *
 * ### Alternative Approaches
 *
 * It's possible to eliminate the sync/async distinction using complex
 * frameworks with custom schedulers. However, such frameworks require depending
 * on other people's code that controls how your code executes, resulting in
 * more complex stack traces and debugging experiences. With MaybeAsync, we
 * don't need that machinery - it works directly with JavaScript's native
 * primitives and TypeScript's type system.
 *
 * ### TODO: Consider
 *
 * Use MaybeAsync in Task and Task helpers to preserve synchronous execution
 * when possible (e.g., mutex with available permit, retry on first success).
 */
export type MaybeAsync<T> = T | PromiseLike<T>;

/**
 * Type guard to check if a {@link MaybeAsync} value is async (a promise).
 *
 * This function narrows the type of a {@link MaybeAsync} value, allowing you to
 * conditionally `await` only when necessary.
 *
 * ### Example
 *
 * ```ts
 * const getData = (id: string): MaybeAsync<Data> => {
 *   const cached = cache.get(id);
 *   if (cached) return cached; // Sync path
 *   return fetchData(id); // Async path
 * };
 *
 * const result = getData(id);
 * const data = isAsync(result) ? await result : result;
 * // No microtask overhead when cached!
 * ```
 */
export const isAsync = <T>(
  value: MaybeAsync<T>,
): value is T extends PromiseLike<unknown> ? never : PromiseLike<T> =>
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  typeof (value as any)?.then === "function";

// TODO: Add tracing support
// - Extend TaskContext with optional tracing field
// - Add traced(name, task) helper that wraps Task execution
// - Collect span data (name, timing, parent-child relationships, status)
// - Support OpenTelemetry export format with proper traceId/spanId generation
// - Automatic parent-child span relationships through context propagation
