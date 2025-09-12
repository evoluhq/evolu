import { constTrue } from "./Function.js";
import { Result, err, ok } from "./Result.js";
import { Predicate } from "./Types.js";

/**
 * Helper function to delay execution for a specified number of milliseconds.
 *
 * ### Example
 *
 * ```ts
 * await wait(10);
 * ```
 */
export const wait = (ms: number): Promise<Result<void, never>> =>
  new Promise((resolve) =>
    setTimeout(() => {
      resolve(ok());
    }, ms),
  );

/**
 * Makes any Promise cancellable with an AbortSignal.
 *
 * This utility allows you to add cancellation support to any Promise using an
 * external AbortSignal.
 *
 * ### Example
 *
 * ```ts
 * const result = await withAbort(wait(1000), signal);
 * if (!result.ok) {
 *   // Operation was cancelled
 * }
 * ```
 */
export const withAbort = async <T, E>(
  promise: Promise<Result<T, E>>,
  signal: AbortSignal,
): Promise<Result<T, E | { type: "AbortError" }>> => {
  if (signal.aborted) {
    return err({ type: "AbortError" });
  }

  const abortPromise = new Promise<Result<never, { type: "AbortError" }>>(
    (resolve) => {
      const onAbort = () => {
        resolve(err({ type: "AbortError" }));
      };
      signal.addEventListener("abort", onAbort, { once: true });
    },
  );

  return Promise.race([promise, abortPromise]);
};

/** Options for configuring retry behavior. */
export interface RetryOptions<E> {
  /**
   * Maximum number of retry attempts after the initial attempt (default: 3).
   * For example, with maxRetries = 3, the function will be called up to 4 times
   * (1 initial attempt + 3 retries).
   */
  maxRetries?: number;

  /**
   * Initial delay between retry attempts in milliseconds (default: 100). This
   * is the delay after the first failed attempt. Subsequent delays increase
   * exponentially according to the factor option.
   */
  initialDelay?: number;

  /**
   * Maximum delay between retry attempts in milliseconds (default: 10000). This
   * caps the exponential backoff to prevent extremely long delays after many
   * retries.
   */
  maxDelay?: number;

  /**
   * Multiplier that determines how quickly the delay increases (default: 2).
   * With the default value, each successive delay is twice as long as the
   * previous one (e.g., 100ms, 200ms, 400ms, 800ms, etc).
   */
  factor?: number;

  /**
   * Random jitter factor between 0 and 1 (default: 0.1). Adds randomness to
   * delay times to prevent retry storms in distributed systems.
   */
  jitter?: number;

  /**
   * Optional AbortSignal to cancel retries. If the signal is aborted, the retry
   * operation stops and returns a RetryAbortError.
   */
  signal?: AbortSignal;

  /**
   * Optional predicate to determine if an error should be retried. Returns true
   * if the error is retryable, false otherwise. This allows selectively
   * retrying only certain types of errors. By default, all errors are
   * considered retryable.
   */
  retryable?: Predicate<E>;

  /**
   * Optional callback called before each retry attempt. Receives the error that
   * caused the retry, the current attempt number (starting at 1), and the delay
   * in milliseconds before the next attempt.
   */
  onRetry?: (error: E, attempt: number, delay: number) => void;
}

/** Error representing a retry operation that failed after multiple attempts. */
export interface RetryError<E> {
  readonly type: "RetryError";
  /** The original error that caused the retry to fail */
  readonly cause: E;
  /** Number of retry attempts made */
  readonly attempts: number;
}

/** Error representing a retry operation that was aborted. */
export interface RetryAbortError {
  readonly type: "RetryAbortError";
  readonly abortedBeforeExecution: boolean;
}

/**
 * Executes a function with retry logic using exponential backoff and jitter.
 *
 * ### Example with Result-based API
 *
 * ```ts
 * interface ApiError {
 *   type: "ApiError";
 *   statusCode: number;
 * }
 *
 * const fetchData = async (
 *   url: string,
 * ): Promise<Result<Data, ApiError>> => {
 *   // Implementation that returns Result
 * };
 *
 * const result = await retry(
 *   async () => fetchData("https://api.example.com/data"),
 *   {
 *     maxRetries: 5,
 *     initialDelay: 200,
 *     // Only retry on specific status codes
 *     retryable: (error) =>
 *       error.type === "ApiError" && [429, 503].includes(error.statusCode),
 *   },
 * );
 *
 * if (!result.ok) {
 *   if (result.error.type === "RetryAbortError") {
 *     console.log("Operation was aborted");
 *   } else {
 *     console.log(`Failed after ${result.error.attempts} attempts`);
 *   }
 *   return;
 * }
 *
 * // Use result.value
 * ```
 *
 * ### Example with tryAsync for exception-based API
 *
 * ```ts
 * interface FetchError {
 *   type: "FetchError";
 *   message: string;
 * }
 *
 * const controller = new AbortController();
 *
 * const result = await retry(
 *   async () =>
 *     tryAsync(
 *       async () => {
 *         const response = await fetch("https://api.example.com/data", {
 *           signal: controller.signal,
 *         });
 *
 *         if (!response.ok) {
 *           throw new Error(`HTTP error ${response.status}`);
 *         }
 *
 *         return await response.json();
 *       },
 *       (error): FetchError => ({
 *         type: "FetchError",
 *         message: String(error),
 *       }),
 *     ),
 *   {
 *     maxRetries: 3,
 *     signal: controller.signal,
 *   },
 * );
 * ```
 *
 * ## HTTP Request Recommendations
 *
 * For HTTP requests, configure the `retryable` option to only retry on
 * appropriate errors:
 *
 * - **DO retry**: 429 (Too Many Requests), 503 (Service Unavailable), network
 *   errors
 * - **DON'T retry**: 4xx client errors (except 429), most 5xx server errors
 */
export const retry = async <T, E>(
  fn: () => Promise<Result<T, E>>,
  options: RetryOptions<E> = {},
): Promise<Result<T, RetryError<E> | RetryAbortError>> => {
  const {
    maxRetries = 3,
    initialDelay = 100,
    maxDelay = 10000,
    factor = 2,
    jitter = 0.1,
    signal,
    retryable = constTrue,
    onRetry,
  } = options;

  let attempt = 0;

  if (signal?.aborted) {
    return err({ type: "RetryAbortError", abortedBeforeExecution: true });
  }

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  while (true) {
    const result = await fn();

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
    const exponentialDelay = initialDelay * Math.pow(factor, attempt);
    const cappedDelay = Math.min(exponentialDelay, maxDelay);

    // Apply jitter to prevent thundering herd problem
    const randomFactor = 1 - jitter + Math.random() * jitter * 2;
    const delay = Math.floor(cappedDelay * randomFactor);

    if (onRetry) {
      onRetry(result.error, attempt, delay);
    }

    if (signal?.aborted) {
      return err({ type: "RetryAbortError", abortedBeforeExecution: false });
    }

    // Wait with abort support using the withAbort utility
    if (signal) {
      const delayResult = await withAbort(wait(delay), signal);

      if (!delayResult.ok) {
        return err({ type: "RetryAbortError", abortedBeforeExecution: false });
      }
    } else {
      await wait(delay);
    }
  }
};

export interface TimeoutError {
  readonly type: "TimeoutError";
  readonly timeoutMs: number;
}

/**
 * Wraps an async function with a timeout, returning {@link Result} that fails
 * with {@link TimeoutError} if the timeout is exceeded. The provided function
 * must accept an AbortSignal and return a Result.
 *
 * ### Example
 *
 * ```ts
 * const fetchWithTimeout = () =>
 *   withTimeout((signal) => fetch("url", signal), 5000);
 * const result = await retry(fetchWithTimeout, { maxRetries: 3 });
 * ```
 */
export const withTimeout = async <T, E>(
  fn: (signal: AbortSignal) => Promise<Result<T, E>>,
  timeoutMs: number,
): Promise<Result<T, E | TimeoutError>> => {
  const controller = new AbortController();

  const timeoutPromise = wait(timeoutMs).then(
    (): Result<never, TimeoutError> => {
      controller.abort();
      return err({ type: "TimeoutError", timeoutMs });
    },
  );

  const operationPromise = fn(controller.signal);

  return Promise.race([operationPromise, timeoutPromise]);
};
