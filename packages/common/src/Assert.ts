/**
 * Runtime assertions for invariant checking.
 *
 * @module
 */

import type { Ok, Result } from "./Result.js";
import type { AbortError } from "./Task.js";
import type { AnyType, InferType, Type } from "./Type.js";

/**
 * Ensures a condition is true, throwing an error with the provided message if
 * not.
 *
 * Prevents invalid states from propagating through the system by halting
 * execution when a condition fails, improving reliability and debuggability.
 *
 * Do not use this instead of {@link Type}. Assertions are intended for
 * conditions that are logically guaranteed but not statically known by
 * TypeScript, or for catching and signaling developer mistakes eagerly.
 *
 * ### Example
 *
 * ```ts
 * assert(true, "true is not true"); // no-op
 * assert(false, "true is not true"); // throws Error
 * ```
 */
export const assert: (
  condition: unknown,
  message: string,
) => asserts condition = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

/**
 * Asserts that an array is non-empty.
 *
 * Ensures the provided array has at least one element, helping TypeScript infer
 * the array as non-empty when this is logically guaranteed but not statically
 * known.
 *
 * ### Example
 *
 * ```ts
 * assertNonEmptyArray([1, 2, 3]); // no-op
 * assertNonEmptyArray([]); // throws Error
 * ```
 */
export const assertNonEmptyArray: <T>(
  arr: Array<T>,
  message?: string,
) => asserts arr is [T, ...Array<T>] = (
  arr,
  message = "Expected a non-empty array.",
) => {
  assert(arr.length > 0, message);
};

/**
 * Asserts that a readonly array is non-empty.
 *
 * Ensures the provided readonly array has at least one element, helping
 * TypeScript infer non-emptiness when this is logically guaranteed but not
 * statically known.
 *
 * ### Example
 *
 * ```ts
 * assertNonEmptyReadonlyArray([1, 2, 3]); // no-op
 * assertNonEmptyReadonlyArray([]); // throws Error
 * ```
 */
export const assertNonEmptyReadonlyArray: <T>(
  arr: ReadonlyArray<T>,
  message?: string,
) => asserts arr is readonly [T, ...Array<T>] = (
  arr,
  message = "Expected a non-empty readonly array.",
) => {
  assert(arr.length > 0, message);
};

/**
 * Ensures a value conforms to a {@link Type}.
 *
 * Uses the Type name for the default error message.
 *
 * ### Example
 *
 * ```ts
 * const length = buffer.getLength();
 *
 * // We know length is logically non-negative, but TypeScript doesn't.
 * assertType(NonNegativeInt, length);
 * ```
 */
export const assertType: <T extends AnyType>(
  type: T,
  value: unknown,
  message?: string,
) => asserts value is InferType<T> = (type, value, message) => {
  assert(type.is(value), message ?? `Expected ${type.name}.`);
};

/**
 * Asserts that a {@link Result} did not fail with `AbortError`.
 *
 * Use when abort would indicate a programmer error rather than ordinary control
 * flow. A typical case is code that uses `unabortable` for work that must
 * survive ordinary cancellation, but still wants to fail fast if that work was
 * started on an already-stopped Run.
 */
export function assertNotAborted<T>(
  result: Result<T, AbortError>,
  message?: string,
): asserts result is Ok<T>;
export function assertNotAborted<T, E>(
  result: Result<T, E | AbortError>,
  message?: string,
): asserts result is Result<T, E>;
export function assertNotAborted<T, E>(
  result: Result<T, E | AbortError>,
  message = "Expected result to not be aborted.",
): asserts result is Result<T, E> {
  const isAbortError =
    !result.ok &&
    (result.error as { readonly type?: unknown }).type === "AbortError";

  assert(!isAbortError, message);
}

/**
 * Guards synchronous methods on objects that may be called after disposal.
 *
 * Use when an API must fail fast before touching already-disposed state.
 *
 * ### Example
 *
 * ```ts
 * const stack = new globalThis.AsyncDisposableStack();
 * assertNotDisposed(stack); // no-op
 * await stack.disposeAsync();
 * assertNotDisposed(stack); // throws Error
 * ```
 */
export const assertNotDisposed = (
  value: globalThis.DisposableStack | globalThis.AsyncDisposableStack,
): void => {
  assert(!value.disposed, "Expected value to not be disposed.");
};
