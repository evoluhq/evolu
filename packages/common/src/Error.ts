/**
 * Error types and utilities for safe error handling.
 *
 * @module
 */

import { safelyStringifyUnknownValue } from "./String.ts";
import { AbortError, type createRun, type ReportDefect } from "./Task.ts";
import { type InferType, typed, type TypedType, Unknown } from "./Type.ts";

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
export const UnknownError: TypedType<
  "UnknownError",
  { readonly error: typeof Unknown }
> = /*#__PURE__*/ typed("UnknownError", {
  error: Unknown,
});
export interface UnknownError extends InferType<typeof UnknownError> {}

/**
 * Creates an {@link UnknownError} from an unknown error.
 *
 * Error objects cannot be directly structured-cloned (for worker messaging) or
 * JSON-serialized because their properties (`message`, `stack`, `cause`) are
 * non-enumerable. This function extracts those properties into a plain object.
 */
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
    // Firefox defines `stack` as a getter on Error.prototype, not as an own
    // property, so getOwnPropertyNames misses it. Explicitly include it.
    if (err.stack !== undefined && !("stack" in result)) {
      result.stack = err.stack;
    }
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
 * Converts a reported defect to an `Error` that a host error reporter shows
 * readably.
 *
 * Hosts such as browsers and React Native show a reported value that is not an
 * `Error` only as text such as "[object Object]", and a worker's error reaches
 * its page, including an error tracker listening there, as that text alone. A
 * panic reports a plain {@link AbortError}, so its defect is converted instead.
 * An `Error` is returned as it is, including one from another realm, such as an
 * iframe. A `DOMException` is described in an `Error` with its name and
 * message, because Chromium reports one from a worker without them. Any other
 * value is described in an `Error` whose cause is what was reported.
 *
 * Platform {@link createRun} adapters use it for their default reporting. A
 * custom {@link ReportDefect} can use it too, such as before passing a defect to
 * an error tracker.
 *
 * ### Example
 *
 * ```ts
 * import {
 *   assertEqual,
 *   assertSame,
 *   createRun,
 *   defectToError,
 * } from "@evolu/common";
 *
 * const errors: Array<Error> = [];
 * await using run = createRun({
 *   reportDefect: (reported) => {
 *     errors.push(defectToError(reported));
 *   },
 * });
 * const defect = new Error("boom");
 *
 * run.panic(defect);
 *
 * assertSame(errors[0], defect);
 * assertEqual(
 *   defectToError({ type: "UnexpectedState" }).message,
 *   'Defect: {"type":"UnexpectedState"}',
 * );
 * ```
 */
export const defectToError = (reported: unknown): Error => {
  const defect =
    AbortError.is(reported) && reported.reason.type === "PanicAbortReason"
      ? reported.reason.defect
      : reported;
  // The internal tag survives crossing realms, such as from an iframe, where
  // instanceof fails.
  const tag = Object.prototype.toString.call(defect);
  // Chromium reports a DOMException from a worker without its name or message,
  // so it is described in an Error.
  if (tag === "[object DOMException]") {
    const { name, message } = defect as Error;
    return new Error(`${name}: ${message}`, { cause: defect });
  }
  if (defect instanceof Error || tag === "[object Error]") {
    return defect as Error;
  }
  // A value with a cycle or a bigint falls back to String, often
  // "[object Object]", and a nested Error shows as "{}". That is enough:
  // Evolu's own defects are Errors, and the cause still holds the value.
  return new Error(`Defect: ${safelyStringifyUnknownValue(defect)}`, {
    cause: reported,
  });
};
