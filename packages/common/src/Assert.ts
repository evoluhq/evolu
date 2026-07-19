/**
 * Runtime assertions for invariant checking.
 *
 * @module
 */

import type { AnyType, InferType, Type } from "./Type.ts";

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
 * Asserts that a value is non-nullable.
 *
 * Narrows a nullable value to {@link NonNullable} when null or undefined is
 * logically impossible but TypeScript cannot prove it.
 */
export const assertNonNullable: <T>(
  value: T,
  message?: string,
) => asserts value is NonNullable<T> = (
  value,
  message = "Expected value to be non-nullable.",
) => {
  assert(value != null, message);
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
 * Uses the Type name for the error message and preserves the Type validation
 * error as the cause.
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
) => asserts value is InferType<T> = (type, value) => {
  const result = type.fromUnknown(value);
  if (!result.ok) {
    throw new Error(`Expected ${type.name}.`, { cause: result.error });
  }
};

/**
 * Guards synchronous methods on objects that may be called after disposal.
 *
 * Use when an API must fail fast before touching already-disposed state.
 *
 * ### Example
 *
 * ```ts
 * using disposer = new globalThis.AsyncDisposableStack();
 * assertNotDisposed(disposer); // no-op
 * await disposer.disposeAsync();
 * assertNotDisposed(disposer); // throws Error
 * ```
 *
 * This is the JavaScript equivalent of the .NET `ObjectDisposedException`
 * pattern: once a helper has been disposed, calling its synchronous methods is
 * a programmer error and should throw immediately instead of continuing with
 * invalid state.
 */
export const assertNotDisposed = (
  value:
    DisposableStack | AsyncDisposableStack | { readonly disposed: boolean },
): void => {
  assert(!value.disposed, "Cannot use a disposed object.");
};
