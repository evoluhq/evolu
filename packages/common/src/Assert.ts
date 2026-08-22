/**
 * Runtime assertions for invariant checking.
 *
 * @module
 */

import type { NonEmptyArray, NonEmptyReadonlyArray } from "./Array.ts";
import type { Type } from "./Type.ts";

/**
 * Ensures a condition is true, throwing an error with the provided message if
 * not.
 *
 * Prevents invalid states from propagating through the system by halting
 * execution when a condition fails, improving reliability and debuggability.
 *
 * Do not use this instead of {@link Type}. Assertions are intended when a
 * condition is logically guaranteed to be true but TypeScript cannot prove it,
 * or for catching and signaling developer mistakes eagerly.
 *
 * ### Example
 *
 * ```ts
 * import { assert as assertInvariant } from "@evolu/common";
 *
 * expect(() => assertInvariant(true, "Expected true.")).not.toThrow();
 * expect(() => assertInvariant(false, "Expected true.")).toThrow(
 *   "Expected true.",
 * );
 * ```
 */
export const assert: (
  condition: unknown,
  message: string,
) => asserts condition = (condition, message) => {
  // oxlint-disable-next-line typescript/strict-boolean-expressions -- JavaScript truthiness is the contract of assert.
  if (!condition) {
    throw new Error(message);
  }
};

/**
 * Asserts that a value is non-nullable.
 *
 * Following TypeScript's {@link NonNullable}, non-nullable here means neither
 * null nor undefined. Use this when a value is logically guaranteed to be
 * non-nullable but TypeScript cannot prove it.
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
 * Asserts that a value is not null while preserving undefined.
 *
 * Use this when a value is logically guaranteed not to be null but TypeScript
 * cannot prove it.
 *
 * ### Example
 *
 * ```ts
 * import { assertNotNull } from "@evolu/common";
 *
 * const value = undefined as string | null | undefined;
 * assertNotNull(value);
 * expectTypeOf(value).toEqualTypeOf<string | undefined>();
 * expect(value).toBeUndefined();
 * expect(() => assertNotNull(null)).toThrow(
 *   "Expected value not to be null.",
 * );
 * ```
 */
export const assertNotNull: <T>(
  value: T,
  message?: string,
) => asserts value is T & ({} | undefined) = (
  value,
  message = "Expected value not to be null.",
) => {
  assert(value !== null, message);
};

/**
 * Asserts that a value is not undefined while preserving null.
 *
 * Use this when a value is logically guaranteed not to be undefined but
 * TypeScript cannot prove it.
 *
 * ### Example
 *
 * ```ts
 * import { assertNotUndefined } from "@evolu/common";
 *
 * const value = null as string | null | undefined;
 * assertNotUndefined(value);
 * expectTypeOf(value).toEqualTypeOf<string | null>();
 * expect(value).toBeNull();
 * expect(() => assertNotUndefined(undefined)).toThrow(
 *   "Expected value not to be undefined.",
 * );
 * ```
 */
export const assertNotUndefined: <T>(
  value: T,
  message?: string,
) => asserts value is T & ({} | null) = (
  value,
  message = "Expected value not to be undefined.",
) => {
  assert(value !== undefined, message);
};

/**
 * Asserts that an array is non-empty.
 *
 * Use this when an array is logically guaranteed to be non-empty but TypeScript
 * cannot prove it.
 *
 * ### Example
 *
 * ```ts
 * import { assertNonEmptyArray, type NonEmptyArray } from "@evolu/common";
 *
 * const values = [1, 2, 3];
 * assertNonEmptyArray(values);
 * expectTypeOf(values).toEqualTypeOf<NonEmptyArray<number>>();
 * expect(values[0]).toBe(1);
 * expect(() => assertNonEmptyArray([])).toThrow();
 * ```
 */
export const assertNonEmptyArray: <T>(
  arr: Array<T>,
  message?: string,
) => asserts arr is NonEmptyArray<T> = (
  arr,
  message = "Expected a non-empty array.",
) => {
  assert(arr.length > 0, message);
};

/**
 * Asserts that a readonly array is non-empty.
 *
 * Use this when a readonly array is logically guaranteed to be non-empty but
 * TypeScript cannot prove it.
 *
 * ### Example
 *
 * ```ts
 * import {
 *   assertNonEmptyReadonlyArray,
 *   type NonEmptyReadonlyArray,
 * } from "@evolu/common";
 *
 * const values: ReadonlyArray<number> = [1, 2, 3];
 * assertNonEmptyReadonlyArray(values);
 * expectTypeOf(values).toEqualTypeOf<NonEmptyReadonlyArray<number>>();
 * expect(values[0]).toBe(1);
 * expect(() => assertNonEmptyReadonlyArray([])).toThrow();
 * ```
 */
export const assertNonEmptyReadonlyArray: <T>(
  arr: ReadonlyArray<T>,
  message?: string,
) => asserts arr is NonEmptyReadonlyArray<T> = (
  arr,
  message = "Expected a non-empty readonly array.",
) => {
  assert(arr.length > 0, message);
};

/**
 * Guards synchronous methods on objects that may be called after disposal.
 *
 * Use when an API must fail fast before touching already-disposed state.
 *
 * ### Example
 *
 * ```ts
 * import { assertNotDisposed } from "@evolu/common";
 *
 * await using disposer = new globalThis.AsyncDisposableStack();
 * expect(() => assertNotDisposed(disposer)).not.toThrow();
 * await disposer.disposeAsync();
 * expect(() => assertNotDisposed(disposer)).toThrow(
 *   "Cannot use a disposed object.",
 * );
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
