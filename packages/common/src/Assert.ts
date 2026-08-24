/**
 * Runtime assertions for invariants and value checks.
 *
 * @module
 */

import type { NonEmptyArray, NonEmptyReadonlyArray } from "./Array.ts";
import { eqData, eqStrict, type Eq } from "./Eq.ts";
import type {
  AnyResult,
  Err,
  InferErr,
  InferOk,
  Ok,
  Result,
} from "./Result.ts";
import type { Data, IsData, Type } from "./Type.ts";
import type { CompileTimeError } from "./Types.ts";

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
 * import { assert, assertEqual, assertErr, trySync } from "@evolu/common";
 *
 * assert(true, "Expected true.");
 * const result = trySync(() => assert(false, "Expected true."));
 * assertErr(result);
 * assert(result.error instanceof Error, "Expected an Error.");
 * assertEqual(result.error.message, "Expected true.");
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
 * Asserts that two values are the same according to {@link eqStrict}.
 *
 * `eqStrict` uses SameValue equality: it considers `NaN` the same as itself,
 * distinguishes `0` from `-0`, and compares objects by reference identity.
 *
 * ### Example
 *
 * ```ts
 * import { assertSame, assertType } from "@evolu/common";
 *
 * interface User {
 *   readonly name: string;
 * }
 *
 * const user: User = { name: "Ada" };
 * const value: unknown = user;
 *
 * assertSame(value, user);
 * assertType<User, typeof value>();
 * ```
 */
export const assertSame: <Expected>(
  actual: unknown,
  expected: Expected,
) => asserts actual is Expected = (actual, expected) => {
  assert(eqStrict(actual, expected), "Expected values to be the same.");
};

/**
 * Asserts that a value is exactly `true` and narrows it to `true`.
 *
 * Unlike {@link assert}, this checks an exact boolean value instead of
 * truthiness and does not require a custom message.
 *
 * ### Example
 *
 * ```ts
 * import { assertTrue, assertType } from "@evolu/common";
 *
 * const value: unknown = true;
 * assertTrue(value);
 * assertType<true, typeof value>();
 * ```
 */
export const assertTrue: (value: unknown) => asserts value is true = (
  value,
) => {
  assert(value === true, "Expected true.");
};

/**
 * Asserts that a value is exactly `false` and narrows it to `false`.
 *
 * Unlike {@link assert}, this checks an exact boolean value instead of falsiness
 * and does not require a custom message.
 *
 * ### Example
 *
 * ```ts
 * import { assertFalse, assertType } from "@evolu/common";
 *
 * const value: unknown = false;
 * assertFalse(value);
 * assertType<false, typeof value>();
 * ```
 */
export const assertFalse: (value: unknown) => asserts value is false = (
  value,
) => {
  assert(value === false, "Expected false.");
};

/**
 * Asserts that two {@link Data} values are equal according to {@link eqData}.
 *
 * Use this for concise value checks in platform-independent examples. Use
 * {@link assert} with a descriptive message for application invariants.
 *
 * ### Example
 *
 * ```ts
 * import { assertEqual } from "@evolu/common";
 *
 * const actual = new Map([["roles", new Set(["admin", "author"])]]);
 * const expected = new Map([["roles", new Set(["author", "admin"])]]);
 *
 * assertEqual(actual, expected);
 * ```
 */
export function assertEqual<Actual, Expected>(
  actual: Actual,
  expected: Expected,
  ...dataError: AssertEqualError<Actual | Expected>
): void;
export function assertEqual(actual: Data, expected: Data): void {
  assert(eqData(actual, expected), "Expected values to be equal.");
}

type AssertEqualError<Value> =
  IsData<Value> extends true
    ? []
    : [
        error: CompileTimeError<
          "assertEqual",
          "Actual and expected values must consist only of Data."
        >,
      ];

/**
 * Asserts that a {@link Result} is an {@link Ok}, optionally compares its value,
 * and narrows the Result.
 *
 * With only a Result, this checks the variant without inspecting the value.
 * When an expected value is provided, it uses {@link eqData}; its Data type is
 * inferred independently, so an unbranded literal can compare a branded
 * primitive or collection. Pass a custom {@link Eq} when either value is outside
 * {@link Data} or needs domain-specific equality.
 *
 * ### Example
 *
 * ```ts
 * import {
 *   assertEqual,
 *   assertOk,
 *   assertType,
 *   ok,
 *   type Ok,
 *   type Result,
 *   type Typed,
 * } from "@evolu/common";
 *
 * interface User {
 *   readonly id: string;
 * }
 *
 * interface UserNotFoundError extends Typed<"UserNotFound"> {}
 *
 * const result: Result<User, UserNotFoundError> = ok({ id: "user-1" });
 *
 * assertOk(result);
 * assertType<Ok<User>, typeof result>();
 * assertEqual(result.value.id, "user-1");
 * ```
 */
export function assertOk<R extends Result<unknown, unknown>>(
  result: R,
): asserts result is Extract<R, Ok<unknown>>;
export function assertOk<R extends Result<unknown, unknown>>(
  result: R,
  expectedValue: InferOk<R>,
  eq: Eq<InferOk<R>>,
): asserts result is Extract<R, Ok<unknown>>;
// Constrain the argument tuple so any cannot absorb the CompileTimeError.
export function assertOk<R extends Result<unknown, unknown>, ExpectedValue>(
  result: R,
  ...comparison: [expectedValue: ExpectedValue] &
    (IsData<InferOk<R> | ExpectedValue> extends true
      ? unknown
      : {
          readonly [
            Error in CompileTimeError<
              "assertOk",
              "Result value and expected value must consist only of Data when no custom Eq is provided."
            >
          ]: never;
        })
): asserts result is Extract<R, Ok<unknown>>;
export function assertOk(
  result: AnyResult,
  ...comparison: [] | [expectedValue: unknown, eq?: Eq<any>]
): asserts result is Ok<unknown> {
  assert(result.ok, "Expected an Ok result.");
  if (comparison.length === 0) return;

  const expectedValue = comparison[0];
  const eq: Eq<any> = comparison[1] ?? eqData;
  assert(
    eq(result.value, expectedValue),
    "Expected the value to equal the expected value.",
  );
}

/**
 * Asserts that a {@link Result} is an {@link Err}, optionally compares its error,
 * and narrows the Result.
 *
 * With only a Result, this checks the variant without inspecting the error.
 * When an expected error is provided, it uses {@link eqData}; its Data type is
 * inferred independently, so an unbranded literal can compare a branded
 * primitive or collection. Pass a custom {@link Eq} when either value is outside
 * {@link Data} or needs domain-specific equality.
 *
 * ### Example
 *
 * ```ts
 * import {
 *   assertEqual,
 *   assertErr,
 *   assertType,
 *   err,
 *   type Err,
 *   type Result,
 *   type Typed,
 * } from "@evolu/common";
 *
 * interface UserNotFoundError extends Typed<"UserNotFound"> {
 *   readonly id: string;
 * }
 *
 * const result: Result<string, UserNotFoundError> = err({
 *   type: "UserNotFound",
 *   id: "user-1",
 * });
 *
 * assertErr(result);
 * assertType<Err<UserNotFoundError>, typeof result>();
 * assertEqual(result.error.id, "user-1");
 * ```
 */
export function assertErr<R extends Result<unknown, unknown>>(
  result: R,
): asserts result is Extract<R, Err<unknown>>;
export function assertErr<R extends Result<unknown, unknown>>(
  result: R,
  expectedError: InferErr<R>,
  eq: Eq<InferErr<R>>,
): asserts result is Extract<R, Err<unknown>>;
// Constrain the argument tuple so any cannot absorb the CompileTimeError.
export function assertErr<R extends Result<unknown, unknown>, ExpectedError>(
  result: R,
  ...comparison: [expectedError: ExpectedError] &
    (IsData<InferErr<R> | ExpectedError> extends true
      ? unknown
      : {
          readonly [
            Error in CompileTimeError<
              "assertErr",
              "Result error and expected error must consist only of Data when no custom Eq is provided."
            >
          ]: never;
        })
): asserts result is Extract<R, Err<unknown>>;
export function assertErr(
  result: AnyResult,
  ...comparison: [] | [expectedError: unknown, eq?: Eq<any>]
): asserts result is Err<unknown> {
  assert(!result.ok, "Expected an Err result.");
  if (comparison.length === 0) return;

  const expectedError = comparison[0];
  const eq: Eq<any> = comparison[1] ?? eqData;
  assert(
    eq(result.error, expectedError),
    "Expected the error to equal the expected error.",
  );
}

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
 * import {
 *   assert,
 *   assertEqual,
 *   assertErr,
 *   assertNotNull,
 *   assertType,
 *   trySync,
 * } from "@evolu/common";
 *
 * const value = undefined as string | null | undefined;
 * assertNotNull(value);
 * assertType<string | undefined, typeof value>();
 * assertEqual(value, undefined);
 * const result = trySync(() => assertNotNull(null));
 * assertErr(result);
 * assert(result.error instanceof Error, "Expected an Error.");
 * assertEqual(result.error.message, "Expected value not to be null.");
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
 * import {
 *   assert,
 *   assertEqual,
 *   assertErr,
 *   assertNotUndefined,
 *   assertType,
 *   trySync,
 * } from "@evolu/common";
 *
 * const value = null as string | null | undefined;
 * assertNotUndefined(value);
 * assertType<string | null, typeof value>();
 * assertEqual(value, null);
 * const result = trySync(() => assertNotUndefined(undefined));
 * assertErr(result);
 * assert(result.error instanceof Error, "Expected an Error.");
 * assertEqual(result.error.message, "Expected value not to be undefined.");
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
 * import {
 *   assertEqual,
 *   assertErr,
 *   assertNonEmptyArray,
 *   assertType,
 *   trySync,
 *   type NonEmptyArray,
 * } from "@evolu/common";
 *
 * const values = [1, 2, 3];
 * assertNonEmptyArray(values);
 * assertType<NonEmptyArray<number>, typeof values>();
 * assertEqual(values[0], 1);
 * const result = trySync(() => assertNonEmptyArray([]));
 * assertErr(result);
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
 *   assertEqual,
 *   assertErr,
 *   assertNonEmptyReadonlyArray,
 *   assertType,
 *   trySync,
 *   type NonEmptyReadonlyArray,
 * } from "@evolu/common";
 *
 * const values: ReadonlyArray<number> = [1, 2, 3];
 * assertNonEmptyReadonlyArray(values);
 * assertType<NonEmptyReadonlyArray<number>, typeof values>();
 * assertEqual(values[0], 1);
 * const result = trySync(() => assertNonEmptyReadonlyArray([]));
 * assertErr(result);
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
 * import {
 *   assert,
 *   assertEqual,
 *   assertErr,
 *   assertNotDisposed,
 *   trySync,
 * } from "@evolu/common";
 *
 * await using disposer = new globalThis.AsyncDisposableStack();
 * assertNotDisposed(disposer);
 * await disposer.disposeAsync();
 * const result = trySync(() => assertNotDisposed(disposer));
 * assertErr(result);
 * assert(result.error instanceof Error, "Expected an Error.");
 * assertEqual(result.error.message, "Cannot use a disposed object.");
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
