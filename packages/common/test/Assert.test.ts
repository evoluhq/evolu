import { expect, test } from "vitest";
import {
  assert,
  assertNonEmptyArray,
  assertNonEmptyReadonlyArray,
} from "../src/Assert.js";

test("assert", () => {
  // Should not throw when the condition is true
  assert(true, "Should not throw");

  // Should throw when the condition is false
  expect(() => {
    assert(false, "Condition failed");
  }).toThrowError("Condition failed");
});

test("assertNonEmptyArray", () => {
  // Valid non-empty array
  const arr = [1, 2, 3];
  assertNonEmptyArray(arr);
  expect(arr).toEqual([1, 2, 3]); // No type change, just validation

  // Empty array should throw
  expect(() => {
    assertNonEmptyArray([]);
  }).toThrowError("Expected a non-empty array.");

  // Custom error message
  expect(() => {
    assertNonEmptyArray([], "Custom error");
  }).toThrowError("Custom error");
});

test("assertNonEmptyReadonlyArray", () => {
  // Valid non-empty readonly array
  const arr: ReadonlyArray<number> = [1, 2, 3];
  assertNonEmptyReadonlyArray(arr);
  expect(arr).toEqual([1, 2, 3]); // Ensures no changes

  // Empty readonly array should throw
  expect(() => {
    assertNonEmptyReadonlyArray([]);
  }).toThrowError("Expected a non-empty readonly array.");

  // Custom error message
  expect(() => {
    assertNonEmptyReadonlyArray([], "Custom error");
  }).toThrowError("Custom error");
});
