/**
 * Vitest assertions for Evolu.
 *
 * @module
 */

import type { Err, Ok, Result } from "@evolu/common";
import { expect } from "vitest";

/**
 * Expects an {@link Ok} Result whose value matches the expected value using
 * Vitest's `toEqual`, and narrows the Result.
 *
 * Use `toBe` on the narrowed value when reference identity also matters.
 */
export const expectOk: <R extends Result<unknown, unknown>>(
  result: R,
  expectedValue: unknown,
) => asserts result is Extract<R, Ok<unknown>> = (result, expectedValue) => {
  expect(result).toEqual({ ok: true, value: expectedValue });
};

/**
 * Expects an {@link Err} Result whose error matches the expected error using
 * Vitest's `toEqual`, and narrows the Result.
 *
 * Use `toBe` on the narrowed error when reference identity also matters.
 */
export const expectErr: <R extends Result<unknown, unknown>>(
  result: R,
  expectedError: unknown,
) => asserts result is Extract<R, Err<unknown>> = (result, expectedError) => {
  expect(result).toEqual({ ok: false, error: expectedError });
};
