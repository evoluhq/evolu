import { describe, expect, expectTypeOf, test } from "vitest";
import {
  assert,
  assertNotAborted,
  assertNotDisposed,
  assertNonEmptyArray,
  assertNonEmptyReadonlyArray,
  assertType,
} from "../src/Assert.js";
import type { Ok } from "../src/Result.js";
import type { Result } from "../src/Result.js";
import { err, ok } from "../src/Result.js";
import { AbortError } from "../src/Task.js";
import { runStoppedError } from "../src/Task.js";
import type { Typed } from "../src/Type.js";

interface MyError extends Typed<"MyError"> {}

test("assert", () => {
  // Should not throw when the condition is true
  assert(true, "Should not throw");

  // Should throw when the condition is false
  expect(() => {
    assert(false, "Condition failed");
  }).toThrow("Condition failed");
});

test("assertNonEmptyArray", () => {
  // Valid non-empty array
  const arr = [1, 2, 3];
  assertNonEmptyArray(arr);
  expect(arr).toEqual([1, 2, 3]); // No type change, just validation

  // Empty array should throw
  expect(() => {
    assertNonEmptyArray([]);
  }).toThrow("Expected a non-empty array.");

  // Custom error message
  expect(() => {
    assertNonEmptyArray([], "Custom error");
  }).toThrow("Custom error");
});

test("assertNonEmptyReadonlyArray", () => {
  // Valid non-empty readonly array
  const arr: ReadonlyArray<number> = [1, 2, 3];
  assertNonEmptyReadonlyArray(arr);
  expect(arr).toEqual([1, 2, 3]); // Ensures no changes

  // Empty readonly array should throw
  expect(() => {
    assertNonEmptyReadonlyArray([]);
  }).toThrow("Expected a non-empty readonly array.");

  // Custom error message
  expect(() => {
    assertNonEmptyReadonlyArray([], "Custom error");
  }).toThrow("Custom error");
});

test("assertType", () => {
  assertType(AbortError, { type: "AbortError", reason: "timeout" });

  expect(() => {
    assertType(AbortError, { type: "Other" });
  }).toThrow("Expected Object.");

  expect(() => {
    assertType(AbortError, { type: "Other" }, "Custom error");
  }).toThrow("Custom error");
});

describe("assertNotAborted", () => {
  test("allows ok and domain errors", () => {
    const okResult = ok(1) as Result<number, MyError | AbortError>;
    assertNotAborted(okResult);
    expect(okResult).toEqual(ok(1));

    const domainError = err<MyError>({ type: "MyError" }) as Result<
      number,
      MyError | AbortError
    >;
    assertNotAborted(domainError);
    expect(domainError).toEqual(err({ type: "MyError" }));
  });

  test("throws for AbortError", () => {
    expect(() => {
      assertNotAborted(err({ type: "AbortError", reason: "timeout" }));
    }).toThrow("Expected result to not be aborted.");

    expect(() => {
      assertNotAborted(
        err({ type: "AbortError", reason: runStoppedError }),
        "Custom error",
      );
    }).toThrow("Custom error");
  });

  test("narrows away AbortError", () => {
    const result = err<MyError>({ type: "MyError" }) as Result<
      number,
      MyError | AbortError
    >;

    assertNotAborted(result);

    if (result.ok) {
      expectTypeOf(result.value).toEqualTypeOf<number>();
    } else {
      expectTypeOf(result.error).toEqualTypeOf<MyError>();
    }
  });

  test("narrows abort-only results to ok", () => {
    const result = ok(1) as Result<number, AbortError>;

    assertNotAborted(result);

    expectTypeOf(result).toEqualTypeOf<Ok<number>>();
    expect(result.value).toBe(1);
  });
});

test("assertNotDisposed", async () => {
  const stack = new globalThis.AsyncDisposableStack();

  expect(() => {
    assertNotDisposed(stack);
  }).not.toThrow();

  await stack.disposeAsync();

  expect(() => {
    assertNotDisposed(stack);
  }).toThrow("Expected value to not be disposed.");
});
