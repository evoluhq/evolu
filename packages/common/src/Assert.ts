/**
 * Platform-agnostic assertions for invariants, examples, and tests.
 *
 * An assertion documents a condition required for the program to be correct.
 * Ideally, the type system should enforce it so incorrect code cannot compile,
 * but that is not always possible (not even in Rust). A runtime assertion
 * failure therefore indicates a bug that must be fixed. Throwing at the point
 * of violation prevents invalid state from propagating and makes the defect
 * easier to diagnose.
 *
 * Evolu provides its own assertions so the same concise API works for
 * production invariants, executable examples, and tests on every platform. The
 * general {@link assert} requires a message explaining the invariant, and
 * specialized assertions provide focused diagnostics and narrowing. The API
 * deliberately favors strict and predictable contracts: one {@link assertEqual}
 * covers primitives and structural Data comparisons, {@link assertEqualBytes}
 * compares bytes across array representations, and {@link assertSame} is
 * reserved for SameValue or reference identity. Generic partial structural
 * assertions such as `assertMatches` are omitted so unmentioned state cannot
 * hide regressions. If a complete expected value is too large to keep inline,
 * use a fixture or a focused domain helper that keeps the contract explicit.
 * {@link assertOk} and {@link assertErr} provide convenient Result narrowing,
 * while {@link assertType} provides runtime Type assertions and compile-time
 * type equality similar to Vitest's `expectTypeOf` without requiring a test
 * runner. {@link assertThrows} and {@link assertRejects} verify thrown and
 * rejected values without matcher semantics. Together, these assertions keep
 * documentation examples concise and directly copyable.
 *
 * In Node.js, failures use the native `AssertionError` for structured
 * diagnostics and diffs. Other platforms use a compatible fallback. You should
 * not need to import Node.js assertions unless Evolu does not provide an
 * equivalent or a test requires exact Node.js semantics.
 *
 * Do not use assertions to validate external input. Use a {@link Type}
 * declaration's `fromUnknown` so invalid input is represented by a typed
 * {@link Result}.
 *
 * TODO(next major): Add a separate production build that replaces full
 * assertion messages with numeric error codes and a decoder, following React's
 * approach, to reduce the core bundle size since Evolu has many assertions.
 *
 * @module
 */

import type { NonEmptyArray, NonEmptyReadonlyArray } from "./Array.ts";
import { eqArrayNumber, eqData, eqSameValue, type Eq } from "./Eq.ts";
import type {
  AnyResult,
  Err,
  InferErr,
  InferOk,
  Ok,
  Result,
} from "./Result.ts";
import type { assertType, Type } from "./Type.ts";
import type { ValueWithLength } from "./Types.ts";

/**
 * Asserts that a condition is truthy.
 *
 * Throws an `AssertionError` with the provided message if the condition is
 * falsy, preventing invalid state from propagating and making the failure
 * easier to diagnose.
 *
 * Use `assert` only when a more specific assertion, such as {@link assertTrue}
 * or {@link assertEqual}, does not apply. For that reason, `assert` requires a
 * custom message explaining the expected condition.
 *
 * Options provide structured diagnostics for custom assertions. Pass an
 * underlying failure as `cause` when it explains why the asserted condition
 * failed, and pass the custom assertion as `stackStartFn` to omit its
 * implementation from the stack trace.
 *
 * ### Example
 *
 * ```ts
 * import { assert, assertEqual, assertType } from "@evolu/common";
 *
 * const value: unknown = "Evolu";
 * assert(typeof value === "string", "Expected a string.");
 *
 * assertType<typeof value, string>();
 * assertEqual(value, "Evolu");
 * ```
 *
 * @group Assertions
 */
export const assert: (
  condition: unknown,
  message: string,
  options?: {
    readonly actual?: unknown;
    readonly expected?: unknown;
    readonly operator?: string;
    readonly diff?: "full" | undefined;
    readonly cause?: unknown;
    readonly stackStartFn?: (...args: Array<never>) => unknown;
  },
) => asserts condition = (condition, message, options = {}) => {
  // oxlint-disable-next-line typescript/strict-boolean-expressions -- JavaScript truthiness is the contract of assert.
  if (condition) return;

  const actual = Object.hasOwn(options, "actual") ? options.actual : condition;
  const expected = Object.hasOwn(options, "expected") ? options.expected : true;
  const operator = options.operator ?? "==";
  const stackStartFn = options.stackStartFn ?? assert;
  if (NodeAssert !== undefined) {
    const error = new NodeAssert.AssertionError({
      message,
      actual,
      expected,
      operator: options.diff === "full" ? "deepStrictEqual" : operator,
      diff: options.diff,
      stackStartFn,
    });

    if (options.diff === "full") {
      error.operator = operator;
    }

    if (options.cause !== undefined) {
      Object.defineProperty(error, "cause", {
        configurable: true,
        value: options.cause,
        writable: true,
      });
    }

    throw error;
  }

  const error = Object.assign(
    new Error(
      message,
      options.cause === undefined ? undefined : { cause: options.cause },
    ),
    {
      name: "AssertionError",
      code: "ERR_ASSERTION" as const,
      actual,
      expected,
      generatedMessage: false,
      operator,
    },
  );

  Error.captureStackTrace?.(error, stackStartFn);

  throw error;
};

// Node.js generates assertion diffs inside its AssertionError constructor; the
// test runner does not derive them from actual and expected metadata alone. Use
// the native constructor when available and the portable fallback elsewhere.
const NodeAssert = globalThis.process?.getBuiltinModule?.("node:assert/strict");

/**
 * Asserts that a value is exactly `true`.
 *
 * Boolean conditions preserve their control-flow narrowing, including named
 * type guards. Unknown values narrow to the literal `true`. Unlike
 * {@link assert}, this checks an exact boolean value instead of truthiness and
 * does not require a custom message.
 *
 * ### Example
 *
 * ```ts
 * import { assertTrue, assertType } from "@evolu/common";
 *
 * interface User {
 *   readonly name: string;
 * }
 *
 * const isUser = (value: unknown): value is User =>
 *   typeof value === "object" &&
 *   value !== null &&
 *   "name" in value &&
 *   typeof value.name === "string";
 *
 * const value: unknown = { name: "Ada" };
 * assertTrue(isUser(value));
 * assertType<typeof value, User>();
 *
 * const condition: unknown = true;
 * assertTrue(condition);
 * assertType<typeof condition, true>();
 * ```
 *
 * @group Assertions
 */
export function assertTrue(condition: boolean): asserts condition;
export function assertTrue(value: unknown): asserts value is true;
export function assertTrue(value: unknown): void {
  assert(value === true, "Expected true.", {
    actual: value,
    expected: true,
    operator: "strictEqual",
    stackStartFn: assertTrue,
  });
}

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
 * assertType<typeof value, false>();
 * ```
 *
 * @group Assertions
 */
export const assertFalse: (value: unknown) => asserts value is false = (
  value,
) => {
  assert(value === false, "Expected false.", {
    actual: value,
    expected: false,
    operator: "strictEqual",
    stackStartFn: assertFalse,
  });
};

/**
 * Asserts that a condition becomes true after exactly the specified number of
 * microtasks.
 *
 * Use this in tests that intentionally specify async scheduling behavior.
 * Application code must not depend on exact microtask counts. Maintainers
 * should review count changes because they indicate that an async pipeline
 * changed.
 *
 * ### Example
 *
 * ```ts
 * import { assertConditionAfterMicrotasks } from "@evolu/common";
 *
 * let ready = false;
 * queueMicrotask(() => {
 *   ready = true;
 * });
 *
 * await assertConditionAfterMicrotasks(() => ready, 1);
 * ```
 *
 * @group Assertions
 */
export const assertConditionAfterMicrotasks = async (
  condition: () => boolean,
  expectedMicrotaskCount: number,
): Promise<void> => {
  for (
    let microtaskCount = 0;
    microtaskCount < expectedMicrotaskCount;
    microtaskCount++
  ) {
    const actual = condition();
    assert(
      !actual,
      `Expected condition to be false after ${microtaskCount} microtasks.`,
      {
        actual,
        expected: false,
        operator: "strictEqual",
        stackStartFn: assertConditionAfterMicrotasks,
      },
    );
    await Promise.resolve();
  }

  const actual = condition();
  assert(
    actual,
    `Expected condition to be true after exactly ${expectedMicrotaskCount} microtasks.`,
    {
      actual,
      expected: true,
      operator: "strictEqual",
      stackStartFn: assertConditionAfterMicrotasks,
    },
  );
};

/**
 * Asserts that a function throws the expected value.
 *
 * Expected values use {@link assertEqual} semantics. To perform several or
 * specialized assertions, pass an assertion function that receives the thrown
 * value and returns nothing. Returning a predicate result fails. Use
 * {@link assertThrowsSame} for SameValue or reference identity and
 * {@link assertThrowsInstanceOf} for a runtime type.
 *
 * Because JavaScript permits throwing functions, a function second argument is
 * always treated as an assertion function. Use `assertThrowsSame` to assert
 * that a particular function was thrown.
 *
 * ### Example
 *
 * ```ts
 * import { assertThrows } from "@evolu/common";
 *
 * assertThrows(
 *   () => {
 *     // oxlint-disable-next-line eslint/no-throw-literal, typescript/only-throw-error -- Exercise arbitrary thrown values.
 *     throw { type: "ExpectedFailure", value: 42 };
 *   },
 *   { type: "ExpectedFailure", value: 42 },
 * );
 * ```
 *
 * @group Assertions
 */
export function assertThrows(
  run: () => unknown,
  assertThrown: (thrown: unknown) => void,
): void;
export function assertThrows(run: () => unknown, expected: unknown): void;
export function assertThrows(
  run: () => unknown,
  expectedOrAssert: unknown,
): void {
  const thrown = captureThrown(run, assertThrows);

  if (typeof expectedOrAssert === "function") {
    const result = (expectedOrAssert as (thrown: unknown) => unknown)(thrown);
    assert(
      result === undefined,
      "Expected the thrown value assertion to return undefined.",
      {
        actual: result,
        expected: undefined,
        operator: "strictEqual",
        stackStartFn: assertThrows,
      },
    );
    return;
  }

  assert(
    eqUnknown(thrown, expectedOrAssert),
    "Expected the thrown value to equal the expected value.",
    {
      actual: thrown,
      expected: expectedOrAssert,
      operator: "eqData",
      diff: "full",
      stackStartFn: assertThrows,
    },
  );
}

/**
 * Asserts that a function throws the same value using `Object.is`.
 *
 * Use this to verify that a thrown value was propagated unchanged. For value
 * comparisons, use {@link assertThrows}.
 *
 * ### Example
 *
 * ```ts
 * import { assertThrowsSame } from "@evolu/common";
 *
 * const expected = new Error("Unavailable.");
 * assertThrowsSame(() => {
 *   throw expected;
 * }, expected);
 * ```
 *
 * @group Assertions
 */
export const assertThrowsSame = (
  run: () => unknown,
  expected: unknown,
): void => {
  const thrown = captureThrown(run, assertThrowsSame);
  assert(
    eqSameValue(thrown, expected),
    "Expected the thrown value to be the same as the expected value.",
    {
      actual: thrown,
      expected,
      operator: "strictEqual",
      stackStartFn: assertThrowsSame,
    },
  );
};

/**
 * Asserts that a function throws an instance of a constructor.
 *
 * Returns the narrowed instance so additional properties can be asserted
 * without running the function again.
 *
 * ### Example
 *
 * ```ts
 * import { assertEqual, assertThrowsInstanceOf } from "@evolu/common";
 *
 * const error = assertThrowsInstanceOf(() => {
 *   throw new TypeError("Expected a string.");
 * }, TypeError);
 * assertEqual(error.message, "Expected a string.");
 * ```
 *
 * @group Assertions
 */
export const assertThrowsInstanceOf = <
  T extends {
    readonly name: string;
  } & (abstract new (...args: Array<never>) => unknown),
>(
  run: () => unknown,
  constructor: T,
): InstanceType<T> => {
  const thrown = captureThrown(run, assertThrowsInstanceOf);
  assert(
    thrown instanceof constructor,
    constructor.name === ""
      ? "Expected the thrown value to be an instance of the provided constructor."
      : `Expected the thrown value to be an instance of ${constructor.name}.`,
    {
      actual: thrown,
      expected: constructor,
      operator: "instanceof",
      stackStartFn: assertThrowsInstanceOf,
    },
  );
  return thrown as InstanceType<T>;
};

const captureThrown = (
  run: () => unknown,
  stackStartFn: (...args: Array<never>) => unknown,
): unknown => {
  let value: unknown;

  try {
    value = run();
  } catch (error) {
    return error;
  }

  assert(false, "Expected function to throw.", {
    actual: value,
    expected: "throw",
    operator: "throws",
    stackStartFn,
  });
};

/**
 * Asserts that a promise rejects with the expected value.
 *
 * Expected values use {@link assertEqual} semantics. To perform several or
 * specialized assertions, pass an assertion function that receives the
 * rejection reason and returns nothing. Returning a predicate result fails. Use
 * {@link assertRejectsSame} for SameValue or reference identity and
 * {@link assertRejectsInstanceOf} for a runtime type.
 *
 * Because JavaScript permits rejecting with functions, a function second
 * argument is always treated as an assertion function. Use `assertRejectsSame`
 * to assert that a particular function was rejected.
 *
 * ### Example
 *
 * ```ts
 * import { assertRejects } from "@evolu/common";
 *
 * const expected = new Error("Unavailable.");
 * await assertRejects(Promise.reject(expected), expected);
 * ```
 *
 * @group Assertions
 */
export function assertRejects(
  promise: PromiseLike<unknown>,
  assertRejected: (reason: unknown) => void,
): Promise<void>;
export function assertRejects(
  promise: PromiseLike<unknown>,
  expected: unknown,
): Promise<void>;
export async function assertRejects(
  promise: PromiseLike<unknown>,
  expectedOrAssert: unknown,
): Promise<void> {
  const rejected = await captureRejected(promise, assertRejects);

  if (typeof expectedOrAssert === "function") {
    const result = (expectedOrAssert as (reason: unknown) => unknown)(rejected);
    assert(
      result === undefined,
      "Expected the rejection assertion to return undefined.",
      {
        actual: result,
        expected: undefined,
        operator: "strictEqual",
        stackStartFn: assertRejects,
      },
    );
    return;
  }

  assert(
    eqUnknown(rejected, expectedOrAssert),
    "Expected the rejection reason to equal the expected value.",
    {
      actual: rejected,
      expected: expectedOrAssert,
      operator: "eqData",
      diff: "full",
      stackStartFn: assertRejects,
    },
  );
}

/**
 * Asserts that a promise rejects with the same value using `Object.is`.
 *
 * Use this to verify that a rejection reason was propagated unchanged. For
 * value comparisons, use {@link assertRejects}.
 *
 * ### Example
 *
 * ```ts
 * import { assertRejectsSame } from "@evolu/common";
 *
 * const expected = new Error("Unavailable.");
 * await assertRejectsSame(Promise.reject(expected), expected);
 * ```
 *
 * @group Assertions
 */
export const assertRejectsSame = async (
  promise: PromiseLike<unknown>,
  expected: unknown,
): Promise<void> => {
  const rejected = await captureRejected(promise, assertRejectsSame);
  assert(
    eqSameValue(rejected, expected),
    "Expected the rejection reason to be the same as the expected value.",
    {
      actual: rejected,
      expected,
      operator: "strictEqual",
      stackStartFn: assertRejectsSame,
    },
  );
};

/**
 * Asserts that a promise rejects with an instance of a constructor.
 *
 * Returns the narrowed instance so additional properties can be asserted.
 *
 * ### Example
 *
 * ```ts
 * import { assertEqual, assertRejectsInstanceOf } from "@evolu/common";
 *
 * const error = await assertRejectsInstanceOf(
 *   Promise.reject(new TypeError("Unavailable.")),
 *   TypeError,
 * );
 * assertEqual(error.message, "Unavailable.");
 * ```
 *
 * @group Assertions
 */
export const assertRejectsInstanceOf = async <
  T extends {
    readonly name: string;
  } & (abstract new (...args: Array<never>) => unknown),
>(
  promise: PromiseLike<unknown>,
  constructor: T,
): Promise<InstanceType<T>> => {
  const rejected = await captureRejected(promise, assertRejectsInstanceOf);
  assert(
    rejected instanceof constructor,
    constructor.name === ""
      ? "Expected the rejection reason to be an instance of the provided constructor."
      : `Expected the rejection reason to be an instance of ${constructor.name}.`,
    {
      actual: rejected,
      expected: constructor,
      operator: "instanceof",
      stackStartFn: assertRejectsInstanceOf,
    },
  );
  return rejected as InstanceType<T>;
};

const captureRejected = async (
  promise: PromiseLike<unknown>,
  stackStartFn: (...args: Array<never>) => unknown,
): Promise<unknown> => {
  let value: unknown;

  try {
    value = await promise;
  } catch (error) {
    return error;
  }

  assert(false, "Expected promise to reject.", {
    actual: value,
    expected: "rejection",
    operator: "rejects",
    stackStartFn,
  });
};

/**
 * Asserts that a value is an instance of a constructor and narrows it.
 *
 * ### Example
 *
 * ```ts
 * import { assertInstanceOf, assertType } from "@evolu/common";
 *
 * const value: unknown = new TypeError("Invalid value.");
 * assertInstanceOf(value, TypeError);
 * assertType<typeof value, TypeError>();
 * ```
 *
 * @group Assertions
 */
export const assertInstanceOf: <
  Constructor extends {
    readonly name: string;
  } & (abstract new (...args: Array<never>) => unknown),
>(
  value: unknown,
  constructor: Constructor,
) => asserts value is InstanceType<Constructor> = (value, constructor) => {
  assert(
    value instanceof constructor,
    constructor.name === ""
      ? "Expected an instance of the provided constructor."
      : `Expected an instance of ${constructor.name}.`,
    {
      actual: value,
      expected: constructor,
      operator: "instanceof",
      stackStartFn: assertInstanceOf,
    },
  );
};

/**
 * Asserts that a value is non-nullable.
 *
 * Following TypeScript's {@link NonNullable}, non-nullable here means neither
 * null nor undefined.
 *
 * @group Assertions
 */
export const assertNonNullable: <T>(
  value: T,
  message?: string,
) => asserts value is NonNullable<T> = (
  value,
  message = "Expected value to be non-nullable.",
) => {
  assert(value != null, message, {
    actual: value,
    expected: null,
    operator: "!=",
    stackStartFn: assertNonNullable,
  });
};

/**
 * Asserts that a value is not null while preserving undefined.
 *
 * ### Example
 *
 * ```ts
 * import {
 *   assertEqual,
 *   assert,
 *   assertErr,
 *   assertNotNull,
 *   assertType,
 *   trySync,
 * } from "@evolu/common";
 *
 * const value = undefined as string | null | undefined;
 * assertNotNull(value);
 *
 * assertType<typeof value, string | undefined>();
 * assertEqual(value, undefined);
 *
 * const result = trySync(() => assertNotNull(null));
 * assertErr(result);
 * assert(result.error instanceof Error, "Expected an Error.");
 * assertEqual(result.error.message, "Expected value not to be null.");
 * ```
 *
 * @group Assertions
 */
export const assertNotNull: <T>(
  value: T,
  message?: string,
) => asserts value is T & ({} | undefined) = (
  value,
  message = "Expected value not to be null.",
) => {
  assert(value !== null, message, {
    actual: value,
    expected: null,
    operator: "notStrictEqual",
    stackStartFn: assertNotNull,
  });
};

/**
 * Asserts that a value is not undefined while preserving null.
 *
 * ### Example
 *
 * ```ts
 * import {
 *   assertEqual,
 *   assert,
 *   assertErr,
 *   assertNotUndefined,
 *   assertType,
 *   trySync,
 * } from "@evolu/common";
 *
 * const value = null as string | null | undefined;
 * assertNotUndefined(value);
 * assertType<typeof value, string | null>();
 * assertEqual(value, null);
 * const result = trySync(() => assertNotUndefined(undefined));
 * assertErr(result);
 * assert(result.error instanceof Error, "Expected an Error.");
 * assertEqual(result.error.message, "Expected value not to be undefined.");
 * ```
 *
 * @group Assertions
 */
export const assertNotUndefined: <T>(
  value: T,
  message?: string,
) => asserts value is T & ({} | null) = (
  value,
  message = "Expected value not to be undefined.",
) => {
  assert(value !== undefined, message, {
    actual: value,
    expected: undefined,
    operator: "notStrictEqual",
    stackStartFn: assertNotUndefined,
  });
};

/**
 * Asserts that a value has the expected length and narrows its length.
 *
 * ### Example
 *
 * ```ts
 * import { assertLength, assertType } from "@evolu/common";
 *
 * const values: ReadonlyArray<string> = ["Ada", "Grace"];
 * assertLength(values, 2);
 * assertType<typeof values.length, 2>();
 * ```
 *
 * @group Assertions
 */
export const assertLength: <
  Value extends ValueWithLength,
  const Length extends number,
>(
  value: Value,
  expectedLength: Length,
) => asserts value is Value & { readonly length: Length } = (
  value,
  expectedLength,
) => {
  assert(
    eqSameValue(value.length, expectedLength),
    `Expected value to have length ${expectedLength}.`,
    {
      actual: value.length,
      expected: expectedLength,
      operator: "strictEqual",
      stackStartFn: assertLength,
    },
  );
};

/**
 * Asserts that an array is non-empty.
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
 * assertType<typeof values, NonEmptyArray<number>>();
 * assertEqual(values[0], 1);
 * const result = trySync(() => assertNonEmptyArray([]));
 * assertErr(result);
 * ```
 *
 * @group Assertions
 */
export const assertNonEmptyArray: <T>(
  arr: Array<T>,
  message?: string,
) => asserts arr is NonEmptyArray<T> = (
  arr,
  message = "Expected a non-empty array.",
) => {
  assert(arr.length > 0, message, {
    actual: arr.length,
    expected: 0,
    operator: ">",
    stackStartFn: assertNonEmptyArray,
  });
};

/**
 * Asserts that a readonly array is non-empty.
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
 * assertType<typeof values, NonEmptyReadonlyArray<number>>();
 * assertEqual(values[0], 1);
 * const result = trySync(() => assertNonEmptyReadonlyArray([]));
 * assertErr(result);
 * ```
 *
 * @group Assertions
 */
export const assertNonEmptyReadonlyArray: <T>(
  arr: ReadonlyArray<T>,
  message?: string,
) => asserts arr is NonEmptyReadonlyArray<T> = (
  arr,
  message = "Expected a non-empty readonly array.",
) => {
  assert(arr.length > 0, message, {
    actual: arr.length,
    expected: 0,
    operator: ">",
    stackStartFn: assertNonEmptyReadonlyArray,
  });
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
 * await using disposer = new AsyncDisposableStack();
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
 * a bug and should throw immediately instead of continuing with invalid state.
 *
 * @group Assertions
 */
export const assertNotDisposed = (
  value:
    DisposableStack | AsyncDisposableStack | { readonly disposed: boolean },
): void => {
  assert(!value.disposed, "Cannot use a disposed object.", {
    actual: value.disposed,
    expected: false,
    operator: "==",
    stackStartFn: assertNotDisposed,
  });
};

/**
 * Asserts that two values are the same using `Object.is`.
 *
 * Use this when exact sameness is the contract, such as asserting reference
 * identity or narrowing the actual value to the expected value's type, as shown
 * below. For value comparisons, use {@link assertEqual}.
 *
 * Uses the same equality semantics as `assert.strictEqual` from
 * `node:assert/strict`, but is platform-agnostic. See {@link eqSameValue} for
 * the equality semantics.
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
 * // `assertSame` narrows `value` from `unknown` to `User`.
 * assertType<typeof value, User>();
 * ```
 *
 * @group Assertions
 */
export const assertSame: <Expected>(
  actual: unknown,
  expected: Expected,
) => asserts actual is Expected = (actual, expected) => {
  // `Object.is` implements ECMAScript SameValue, whereas strict equality means
  // `===`. Keep the platform-agnostic "same" wording instead of reproducing
  // Node.js's value-dependent messages, which sometimes say "strictly equal".
  assert(eqSameValue(actual, expected), "Expected values to be the same.", {
    actual,
    expected,
    operator: "strictEqual",
    stackStartFn: assertSame,
  });
};

/**
 * Asserts that two values are not the same using `Object.is`.
 *
 * The opposite of {@link assertSame}.
 *
 * ### Example
 *
 * ```ts
 * import { assertNotSame } from "@evolu/common";
 *
 * const first = { name: "Ada" };
 * const second = { name: "Ada" };
 *
 * assertNotSame(first, second);
 * assertNotSame(0, -0);
 * ```
 *
 * @group Assertions
 */
export const assertNotSame = (actual: unknown, expected: unknown): void => {
  // `Object.is` implements ECMAScript SameValue, whereas strict equality means
  // `===`. Keep the platform-agnostic "same" wording instead of reproducing
  // Node.js's value-dependent messages, which sometimes say "strictly equal".
  assert(
    !eqSameValue(actual, expected),
    "Expected values not to be the same.",
    {
      actual,
      expected,
      operator: "notStrictEqual",
      stackStartFn: assertNotSame,
    },
  );
};

// oxlint-disable eslint/func-style -- Function declarations make TypeDoc categorize these APIs as functions.

/**
 * Asserts that two values are equal.
 *
 * Use this for value comparisons of both primitive and deeply structured
 * values. Use {@link assertSame} when exact sameness or narrowing is required.
 *
 * Like `assert.deepEqual` from `node:assert/strict`, it performs deep
 * structural comparison, but uses deliberately smaller, platform-agnostic
 * equality logic based on {@link eqData}. More complex comparison logic is
 * difficult to reason about and rarely needed. Other values are opaque and
 * compare equal only by identity. If broader comparison semantics are needed in
 * Node.js, use the native assertion instead.
 *
 * ### Example
 *
 * ```ts
 * import { assertEqual } from "@evolu/common";
 *
 * assertEqual(21 * 2, 42);
 *
 * const actual: unknown = new Map([
 *   ["roles", new Set(["admin", "author"])],
 * ]);
 * const expected = new Map([["roles", new Set(["author", "admin"])]]);
 *
 * assertEqual(actual, expected);
 * ```
 *
 * @group Assertions
 */
export function assertEqual(actual: unknown, expected: unknown): void {
  assert(eqUnknown(actual, expected), "Expected values to be equal.", {
    actual,
    expected,
    operator: "eqData",
    diff: "full",
    stackStartFn: assertEqual,
  });
}

/**
 * Asserts that a `Uint8Array` contains the expected bytes.
 *
 * Uses {@link eqArrayNumber}, so the runtime representations may differ. For
 * example, a `Uint8Array` can be compared directly with a regular array.
 *
 * ### Example
 *
 * ```ts
 * import { assertEqualBytes } from "@evolu/common";
 *
 * const bytes = new Uint8Array([1, 5, 39, 254]);
 *
 * assertEqualBytes(bytes, [1, 5, 39, 254]);
 * ```
 *
 * @group Assertions
 */
export const assertEqualBytes = (
  actual: Uint8Array,
  expected: ArrayLike<number>,
): void => {
  assert(eqArrayNumber(actual, expected), "Expected bytes to be equal.", {
    actual,
    expected,
    operator: "eqArrayNumber",
    diff: "full",
    stackStartFn: assertEqualBytes,
  });
};

/**
 * Asserts that two values are not equal.
 *
 * The opposite of {@link assertEqual}.
 *
 * ### Example
 *
 * ```ts
 * import { assertNotEqual } from "@evolu/common";
 *
 * assertNotEqual({ name: "Ada" }, { name: "Grace" });
 * assertNotEqual([1, 2], [2, 1]);
 * ```
 *
 * @group Assertions
 */
export function assertNotEqual(actual: unknown, expected: unknown): void {
  assert(!eqUnknown(actual, expected), "Expected values not to be equal.", {
    actual,
    expected,
    operator: "notEqData",
    stackStartFn: assertNotEqual,
  });
}

// oxlint-enable eslint/func-style

// Assertion equality extends eqData to unknown values. The comparator's
// SameValue fast path treats identical opaque values as equal, while its
// unsupported branches make distinct opaque values unequal.
const eqUnknown = eqData as Eq<unknown>;

/**
 * Asserts that a {@link Result} is an {@link Ok} and narrows it, optionally
 * comparing its value.
 *
 * When an expected value is provided, it is compared using {@link assertEqual}
 * semantics by default. Pass a custom {@link Eq} for different equality
 * semantics.
 *
 * ### Example
 *
 * ```ts
 * import {
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
 * assertOk(result, { id: "user-1" });
 * assertType<typeof result, Ok<User>>();
 * ```
 *
 * @group Assertions
 */
export function assertOk<R extends Result<unknown, unknown>>(
  result: R,
): asserts result is Extract<R, Ok<unknown>>;
export function assertOk<R extends Result<unknown, unknown>>(
  result: R,
  expectedValue: InferOk<R>,
  eq: Eq<InferOk<R>>,
): asserts result is Extract<R, Ok<unknown>>;
export function assertOk<R extends Result<unknown, unknown>>(
  result: R,
  expectedValue: unknown,
): asserts result is Extract<R, Ok<unknown>>;
export function assertOk(
  result: AnyResult,
  ...comparison: [] | [expectedValue: unknown, eq?: Eq<any>]
): asserts result is Ok<unknown> {
  assert(result.ok, "Expected an Ok result.", {
    actual: result.ok,
    expected: true,
    operator: "strictEqual",
    stackStartFn: assertOk,
  });
  if (comparison.length === 0) return;

  const expectedValue = comparison[0];
  assert(
    (comparison[1] ?? eqUnknown)(result.value, expectedValue),
    "Expected the value to equal the expected value.",
    {
      actual: result.value,
      expected: expectedValue,
      operator: comparison[1] === undefined ? "eqData" : "Eq",
      diff: comparison[1] === undefined ? "full" : undefined,
      stackStartFn: assertOk,
    },
  );
}

/**
 * Asserts that a {@link Result} is an {@link Err} and narrows it, optionally
 * comparing its error.
 *
 * When an expected error is provided, it is compared using {@link assertEqual}
 * semantics by default. Pass a custom {@link Eq} for different equality
 * semantics.
 *
 * ### Example
 *
 * ```ts
 * import {
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
 * assertErr(result, { type: "UserNotFound", id: "user-1" });
 * assertType<typeof result, Err<UserNotFoundError>>();
 * ```
 *
 * @group Assertions
 */
export function assertErr<R extends Result<unknown, unknown>>(
  result: R,
): asserts result is Extract<R, Err<unknown>>;
export function assertErr<R extends Result<unknown, unknown>>(
  result: R,
  expectedError: InferErr<R>,
  eq: Eq<InferErr<R>>,
): asserts result is Extract<R, Err<unknown>>;
export function assertErr<R extends Result<unknown, unknown>>(
  result: R,
  expectedError: unknown,
): asserts result is Extract<R, Err<unknown>>;
export function assertErr(
  result: AnyResult,
  ...comparison: [] | [expectedError: unknown, eq?: Eq<any>]
): asserts result is Err<unknown> {
  assert(!result.ok, "Expected an Err result.", {
    actual: result.ok,
    expected: false,
    operator: "strictEqual",
    stackStartFn: assertErr,
  });
  if (comparison.length === 0) return;

  const expectedError = comparison[0];
  assert(
    (comparison[1] ?? eqUnknown)(result.error, expectedError),
    "Expected the error to equal the expected error.",
    {
      actual: result.error,
      expected: expectedError,
      operator: comparison[1] === undefined ? "eqData" : "Eq",
      diff: comparison[1] === undefined ? "full" : undefined,
      stackStartFn: assertErr,
    },
  );
}
