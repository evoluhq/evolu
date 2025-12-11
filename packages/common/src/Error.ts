import { assert } from "./Assert.js";
import type { tryAsync, trySync } from "./Result.js";

/**
 * A wrapper for unknown errors caught at runtime.
 *
 * When catching errors from unsafe code (third-party libraries, worker
 * boundaries, etc.), we wrap them in `UnknownError` so they can be used in
 * union types and distinguished from other error types.
 *
 * The `error` property contains error details (including `message`, `stack`,
 * and `cause` if available), a string, or a fallback value.
 *
 * Use {@link createUnknownError} to create instances.
 */
export interface UnknownError {
  readonly type: "UnknownError";
  readonly error: unknown;
}

/** Creates an {@link UnknownError} from an unknown error. */
export const createUnknownError = (error: unknown): UnknownError => {
  const convertError = (err: Error): Record<string, unknown> => {
    const result: Record<string, unknown> = Object.getOwnPropertyNames(
      err,
    ).reduce<Record<string, unknown>>((acc, key) => {
      const value = (err as never)[key] as unknown;
      if (key === "cause" && value instanceof Error) {
        // Recursively process the `cause` property
        acc[key] = convertError(value);
      } else if (typeof value !== "function") {
        acc[key] = value;
      }
      return acc;
    }, {});
    return result;
  };

  if (error instanceof Error) {
    return {
      type: "UnknownError",
      error: convertError(error),
    };
  }

  try {
    // Clone other values that are structured-clonable
    return {
      type: "UnknownError",
      error: structuredClone(error),
    };
  } catch {
    // Fallback for non-clonable values
    try {
      return {
        type: "UnknownError",
        error: String(error),
      };
    } catch {
      // Final fallback if even `String(error)` fails
      return {
        type: "UnknownError",
        error: "[Unserializable Object]",
      };
    }
  }
};

/**
 * Platform-agnostic scope for capturing global errors.
 *
 * Represents any execution context that can capture uncaught errors and
 * unhandled promise rejections — browser windows, Node.js processes, workers,
 * etc.
 *
 * Implementations hook into platform-specific global error handlers (`onerror`,
 * `onunhandledrejection`, `uncaughtException`, etc.). Any error reaching these
 * handlers is a programming error — all unsafe code should be wrapped with
 * {@link trySync} or {@link tryAsync}. The `onError` callback exists for
 * telemetry and debugging, not error recovery.
 *
 * Implementations use {@link handleGlobalError} to forward errors.
 */
export interface GlobalErrorScope extends Disposable {
  /**
   * Callback for uncaught errors and unhandled promise rejections.
   *
   * Set this to receive notifications when global errors occur in this scope.
   */
  onError: ((error: UnknownError) => void) | null;
}

/**
 * Forwards an error to a {@link GlobalErrorScope}'s `onError` callback.
 *
 * Asserts that `onError` is set, then normalizes the error with
 * {@link createUnknownError} and calls the callback.
 */
export const handleGlobalError = (
  scope: GlobalErrorScope,
  error: unknown,
): void => {
  if (scope.onError == null) {
    // eslint-disable-next-line no-console
    console.error("Unhandled global error:", error);
    assert(false, "onError must be set before global errors occur");
  }
  scope.onError(createUnknownError(error));
};
