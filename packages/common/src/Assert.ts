/**
 * 🚨
 *
 * This module provides assertion utilities to prevent invalid states from
 * propagating through the system by halting execution when a condition fails,
 * improving reliability and debuggability.
 *
 * **Warning**: Do not use this instead of {@link Type}. Assertions are intended
 * for conditions that are logically guaranteed but not statically known by
 * TypeScript, or for catching and signaling developer mistakes eagerly (e.g.,
 * invalid configuration).
 *
 * @module
 */
import type { Type } from "./Type.js";

/**
 * Ensures a condition is true, throwing an error with the provided message if
 * not.
 *
 * Prevents invalid states from propagating through the system by halting
 * execution when a condition fails, improving reliability and debuggability.
 *
 * **Warning**: Do not use this instead of {@link Type}. Assertions are intended
 * for conditions that are logically guaranteed but not statically known by
 * TypeScript, or for catching and signaling developer mistakes eagerly (e.g.,
 * invalid configuration).
 *
 * ### Example
 *
 * ```ts
 * assert(true, "true is not true"); // no-op
 * assert(false, "true is not true"); // throws Error
 *
 * const length = buffer.getLength();
 * // We know length is logically non-negative, but TypeScript doesn't
 * assert(
 *   NonNegativeInt.is(length),
 *   "buffer length should be non-negative",
 * );
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
 * Asserts no error reaches a `.catch` block, throwing a developer error if it
 * does. Used in Promise chains where errors indicate bugs to be fixed.
 *
 * ### Example
 *
 * ```ts
 * Promise.reject("test").catch((e) =>
 *   assertNoErrorInCatch("WebSocket retry", e),
 * );
 * ```
 */
export function assertNoErrorInCatch(context: string, error: unknown): never {
  throw new Error(
    `Error in ${context}: an unexpected error reached a catch block and requires a fix`,
    { cause: error },
  );
}
