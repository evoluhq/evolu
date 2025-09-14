import { isNonEmptyArray, shiftArray } from "./Array.js";
import { Result, err, ok } from "./Result.js";
import { Duration, durationToNonNegativeInt } from "./Time.js";
import { NonNegativeInt, PositiveInt } from "./Type.js";
import { Predicate } from "./Types.js";

/**
 * A lazy, cancellable Promise that returns a typed {@link Result} instead of
 * throwing.
 *
 * Tasks are functions that create Promises when called. This laziness allows
 * safe composition, e.g. retry logic because it prevents eager execution.
 *
 * ### Cancellation
 *
 * Tasks support cancellation via
 * [AbortSignal](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal).
 * When called without a signal, the operation cannot be cancelled and
 * AbortError will never be returned. When called with a signal, the operation
 * can be cancelled and AbortError is added to the error union with precise type
 * safety.
 *
 * ### Task Helpers
 *
 * - {@link toTask} - Convert async function to Task
 * - {@link wait} - Delay execution for a specified duration
 * - {@link timeout} - Add timeout to any Task operation
 * - {@link retry} - Retry failed operations with configurable backoff
 */
export type Task<T, E> = <TContext extends TaskContext | undefined = undefined>(
  context?: TContext,
) => Promise<
  Result<T, TContext extends { signal: AbortSignal } ? E | AbortError : E>
>;

/** Context passed to {@link Task} operations for cancellation. */
export interface TaskContext {
  /** Signal for cancellation */
  readonly signal?: AbortSignal | null;
}

/** Error returned when a {@link Task} is cancelled via AbortSignal. */
export interface AbortError {
  readonly type: "AbortError";
  readonly reason?: unknown;
}

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
 * const fetchTask = (url: string) =>
 *   toTask((signal) =>
 *     tryAsync(
 *       () => fetch(url, { signal }),
 *       (error): FetchError => ({ type: "FetchError", error }),
 *     ),
 *   );
 *
 * const result1 = await fetchTask("https://api.example.com/data")();
 * expectTypeOf(result1).toEqualTypeOf<Result<Response, FetchError>>();
 *
 * // With AbortController
 * const controller = new AbortController();
 * const result2 = await fetchTask("https://api.example.com/data")({
 *   signal: controller.signal,
 * });
 * expectTypeOf(result2).toEqualTypeOf<
 *   Result<Response, FetchError | AbortError>
 * >();
 * ```
 */
export function toTask<T, E>(
  fn: (signal: AbortSignal | null) => Promise<Result<T, E>>,
): Task<T, E> {
  return (async (context) => {
    const signal = context?.signal;

    // Fast path when no signal
    if (!signal) {
      return fn(null);
    }

    // Check if already aborted
    if (signal.aborted) {
      return err({ type: "AbortError", reason: signal.reason as unknown });
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

    return Promise.race([
      abortPromise,
      fn(signal).then((result) => {
        signal.removeEventListener("abort", handleAbort);
        return result;
      }),
    ]);
  }) as Task<T, E>;
}

/**
 * Creates a {@link Task} that waits for the specified duration.
 *
 * ### Example
 *
 * ```ts
 * const result1 = await wait("10ms")();
 * expect(result1).toEqual(ok());
 * expectTypeOf(result1).toEqualTypeOf<Result<void, never>>();
 *
 * // With AbortController
 * const controller = new AbortController();
 * const result2 = await wait("10ms")(controller);
 * expectTypeOf(result2).toEqualTypeOf<Result<void, AbortError>>();
 * ```
 */
export const wait = (duration: Duration): Task<void, never> =>
  toTask(
    (signal) =>
      new Promise<Result<void, never>>((resolve) => {
        const ms = durationToNonNegativeInt(duration);
        const timeoutSignal = AbortSignal.timeout(ms);

        const combinedSignal = signal
          ? AbortSignal.any([signal, timeoutSignal])
          : timeoutSignal;

        // Listen for abort - either from timeout completion or external abort
        combinedSignal.addEventListener(
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
 * const fetchTask = (url: string) =>
 *   toTask((signal) =>
 *     tryAsync(
 *       () => fetch(url, { signal }),
 *       (error): FetchError => ({ type: "FetchError", error }),
 *     ),
 *   );
 *
 * const fetchWithTimeout = (url: string) => timeout("2m", fetchTask(url));
 *
 * const result1 = await fetchWithTimeout("https://api.example.com/data")();
 * expectTypeOf(result1).toEqualTypeOf<
 *   Result<Response, FetchError | TimeoutError>
 * >();
 *
 * // With AbortController
 * const controller = new AbortController();
 * const result2 = await fetchWithTimeout("https://api.example.com/data")({
 *   signal: controller.signal,
 * });
 * expectTypeOf(result2).toEqualTypeOf<
 *   Result<Response, FetchError | TimeoutError | AbortError>
 * >();
 * ```
 */
export const timeout = <T, E>(
  duration: Duration,
  task: Task<T, E>,
): Task<T, E | TimeoutError> =>
  toTask(async (signal) => {
    const timeoutMs = durationToNonNegativeInt(duration);
    const timeoutSignal = AbortSignal.timeout(timeoutMs);

    const combinedSignal = signal
      ? AbortSignal.any([signal, timeoutSignal])
      : timeoutSignal;

    const result = await task({ signal: combinedSignal });

    // If the task was aborted and it was due to timeout (not external signal)
    if (!result.ok && timeoutSignal.aborted && !signal?.aborted) {
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

  /** {@link Predicate} to determine if error should trigger retry. */
  readonly retryable?: Predicate<E>;

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
 * const fetchTask = (url: string) =>
 *   toTask((signal) =>
 *     tryAsync(
 *       () => fetch(url, { signal }),
 *       (error): FetchError => ({ type: "FetchError", error }),
 *     ),
 *   );
 *
 * const fetchWithRetry = (url: string) =>
 *   retry({ retries: PositiveInt.orThrow(3) }, fetchTask(url));
 *
 * const result1 = await fetchWithRetry("https://api.example.com/data")();
 * expectTypeOf(result1).toEqualTypeOf<
 *   Result<Response, FetchError | RetryError<FetchError>>
 * >();
 *
 * // With AbortController
 * const controller = new AbortController();
 * const result2 = await fetchWithRetry("https://api.example.com/data")({
 *   signal: controller.signal,
 * });
 * expectTypeOf(result2).toEqualTypeOf<
 *   Result<Response, FetchError | RetryError<FetchError> | AbortError>
 * >();
 * ```
 */
export const retry = <T, E>(
  options: RetryOptions<E>,
  task: Task<T, E>,
): Task<T, E | RetryError<E>> =>
  toTask(async (signal): Promise<Result<T, E | RetryError<E>>> => {
    const {
      retries,
      initialDelay = "100ms",
      maxDelay = "10s",
      factor = 2,
      jitter = 0.1,
      retryable = () => true,
      onRetry,
    } = options;

    const initialDelayMs = durationToNonNegativeInt(initialDelay);
    const maxDelayMs = durationToNonNegativeInt(maxDelay);
    const maxRetries = PositiveInt.orThrow(retries);

    let attempt = 0;

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    while (true) {
      const result = await task({ signal });

      if (result.ok) {
        return result;
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
      const delayResult = await wait(delay as NonNegativeInt)({ signal });
      if (!delayResult.ok) {
        // If delay was aborted, return AbortError (will be handled by toTask)
        return delayResult;
      }
    }
  });

/**
 * A semaphore that limits the number of concurrent async operations.
 *
 * For mutual exclusion (limiting to exactly one operation), consider using
 * {@link Mutex} instead.
 *
 * @see {@link createSemaphore} to create a semaphore instance.
 */
export interface Semaphore {
  /**
   * Executes an async operation while holding a semaphore permit.
   *
   * The operation will wait until a permit is available before executing. If
   * the operation throws an unexpected error, the permit will not be released
   * and the error will bubble up (fail fast, check {@link Result} docs).
   */
  readonly withPermit: <T>(operation: () => Promise<T>) => Promise<T>;
}

/**
 * Creates a semaphore that limits concurrent async operations to the specified
 * count.
 *
 * A semaphore controls access to a resource by maintaining a count of available
 * permits. Operations acquire a permit before executing and release it when
 * complete.
 *
 * For mutual exclusion (exactly one operation at a time), consider using
 * {@link createMutex} instead.
 *
 * ### Example
 *
 * ```ts
 * // Allow maximum 3 concurrent operations
 * const semaphore = createSemaphore(3);
 *
 * // These will execute with at most 3 running concurrently
 * const results = await Promise.all([
 *   semaphore.withPermit(() => fetchData(1)),
 *   semaphore.withPermit(() => fetchData(2)),
 *   semaphore.withPermit(() => fetchData(3)),
 *   semaphore.withPermit(() => fetchData(4)), // waits for one above to complete
 *   semaphore.withPermit(() => fetchData(5)), // waits for permit
 * ]);
 * ```
 */
export const createSemaphore = (maxConcurrent: number): Semaphore => {
  let availablePermits = maxConcurrent;
  const waitingQueue: Array<() => void> = [];

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
    withPermit: async <T>(operation: () => Promise<T>): Promise<T> => {
      await acquire();
      const result = await operation();
      release();
      return result;
    },
  };
};

/**
 * A mutex (mutual exclusion) that ensures only one operation runs at a time.
 *
 * This is a specialized version of a {@link Semaphore} with a permit count of 1.
 *
 * @see {@link createMutex} to create a mutex instance.
 */
export interface Mutex {
  /**
   * Executes an operation while holding the mutex lock.
   *
   * Only one operation can hold the lock at a time. Other operations will wait
   * until the lock is released.
   */
  readonly withLock: <T>(operation: () => Promise<T>) => Promise<T>;
}

/**
 * Creates a new mutex for ensuring mutual exclusion.
 *
 * A mutex is a {@link createSemaphore} with exactly one permit, ensuring that
 * only one operation can execute at a time.
 *
 * ### Example
 *
 * ```ts
 * const mutex = createMutex();
 *
 * // These operations will execute one at a time
 * const results = await Promise.all([
 *   mutex.withLock(() => updateSharedResource(1)),
 *   mutex.withLock(() => updateSharedResource(2)),
 *   mutex.withLock(() => updateSharedResource(3)),
 * ]);
 * ```
 */
export const createMutex = (): Mutex => {
  const semaphore = createSemaphore(1 as PositiveInt);

  return {
    withLock: semaphore.withPermit,
  };
};
