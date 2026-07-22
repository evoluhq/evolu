/**
 * Vitest assertions for Evolu.
 *
 * @module
 */

import type { Err, Ok, Result } from "@evolu/common";
import { expect } from "vitest";

/** Expects an {@link Ok} Result with the specified value and narrows it. */
export const expectOk: <R extends Result<unknown, unknown>>(
  result: R,
  expectedValue: unknown,
) => asserts result is Extract<R, Ok<unknown>> = (result, expectedValue) => {
  expect(result).toEqual({ ok: true, value: expectedValue });
};

/** Expects an {@link Err} Result with the specified error and narrows it. */
export const expectErr: <R extends Result<unknown, unknown>>(
  result: R,
  expectedError: unknown,
) => asserts result is Extract<R, Err<unknown>> = (result, expectedError) => {
  expect(result).toEqual({ ok: false, error: expectedError });
};
