import { expect, expectTypeOf, test } from "vitest";
import {
  assert,
  assertNonEmptyArray,
  assertNonEmptyReadonlyArray,
  assertNonNullable,
  assertNotDisposed,
  assertType,
} from "../../../../packages/common/src/Assert.ts";
import { AbortError } from "../../../../packages/common/src/Task.ts";

test("assert", () => {
  // Should not throw when the condition is true
  assert(true, "Should not throw");

  // Should throw when the condition is false
  expect(() => {
    assert(false, "Condition failed");
  }).toThrow("Condition failed");
});

test("assertNonNullable", () => {
  const value = "value" as string | null | undefined;
  assertNonNullable(value);
  expectTypeOf(value).toEqualTypeOf<string>();
  expect(value).toBe("value");

  expect(() => {
    assertNonNullable(null);
  }).toThrow("Expected value to be non-nullable.");

  expect(() => {
    assertNonNullable(undefined, "Custom error");
  }).toThrow("Custom error");
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
  assertType(AbortError, {
    type: "AbortError",
    reason: { type: "Timeout" },
  });

  const value = { type: "Other" };
  const result = AbortError.fromUnknown(value);
  assert(!result.ok, "Expected AbortError validation to fail.");

  expect(() => {
    assertType(AbortError, value);
  }).toThrow(
    expect.objectContaining({
      message: "Expected Object.",
      cause: result.error,
    }),
  );
});

test("assertNotDisposed", async () => {
  const stack = new globalThis.AsyncDisposableStack();

  expect(() => {
    assertNotDisposed(stack);
  }).not.toThrow();

  await stack.disposeAsync();

  expect(() => {
    assertNotDisposed(stack);
  }).toThrow("Cannot use a disposed object.");
});
