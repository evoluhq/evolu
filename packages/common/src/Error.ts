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
 * Use {@link createUnknownError} to create instances. It turns an `Error` into a
 * plain object, so the error can be posted between workers, for example in sync
 * state, with its message and stack.
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
 * An `Error` becomes a plain object of its own properties, such as `message`
 * and `stack`, plus its `name`, `message`, and `stack` when they are inherited,
 * as in a `DOMException`. A property that is an `Error`, such as `cause`, is
 * converted the same way, an array, such as the `errors` of an
 * `AggregateError`, is converted element by element, a function is dropped, and
 * any other property is kept when it can be structured-cloned, or described as
 * a string when it cannot. Reference cycles through errors and arrays stay
 * cycles in the result. An `Error`'s properties are not enumerable, so JSON and
 * comparisons by content miss them, and a structured clone creates a new
 * `Error`. Any other value is structured-cloned, or described by `String` when
 * it cannot be, or as `"[Unserializable Object]"` when even that throws.
 */
export const createUnknownError = (error: unknown): UnknownError => {
  // An UnknownError is posted between workers, so its values must clone.
  // Each error and array is converted once and registered before its values,
  // so a reference cycle becomes a cycle in the result instead of endless
  // recursion, and structured cloning preserves it.
  const converted = new Map<object, unknown>();

  const convertValue = (value: unknown): unknown => {
    if (value instanceof Error) return convertError(value);
    if (Array.isArray(value)) {
      const known = converted.get(value);
      if (known !== undefined) return known;
      const result: Array<unknown> = [];
      converted.set(value, result);
      for (const element of value) result.push(convertValue(element));
      return result;
    }
    try {
      structuredClone(value);
      return value;
    } catch {
      return safelyStringifyUnknownValue(value);
    }
  };

  const convertError = (err: Error): unknown => {
    const known = converted.get(err);
    if (known !== undefined) return known;
    const result: Record<string, unknown> = {};
    converted.set(err, result);
    for (const key of Object.getOwnPropertyNames(err)) {
      const value = (err as never)[key] as unknown;
      if (typeof value !== "function") result[key] = convertValue(value);
    }
    // A DOMException keeps `name` and `message` on its prototype, and Firefox
    // defines `stack` as a getter on Error.prototype, so getOwnPropertyNames
    // misses them. Explicitly include them.
    for (const key of ["name", "message", "stack"] as const) {
      const value = err[key];
      if (value !== undefined && !(key in result)) result[key] = value;
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
