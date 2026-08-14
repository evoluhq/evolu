/**
 * BigInt arithmetic and comparison utilities.
 *
 * @module
 */

import type { Predicate } from "./Types.ts";

/** Increments a bigint by 1. */
export const incrementBigInt = (n: bigint): bigint => n + 1n;

/** Decrements a bigint by 1. */
export const decrementBigInt = (n: bigint): bigint => n - 1n;

/** Clamps a bigint within a given range. */
export const clampBigInt =
  (min: bigint, max: bigint) =>
  (n: bigint): bigint =>
    n < min ? min : n > max ? max : n;

/**
 * Creates a predicate that checks if a BigInt is within a range, inclusive.
 *
 * ### Example
 *
 * ```ts
 * import { isBetweenBigInt } from "@evolu/common";
 *
 * const isBetween10And20 = isBetweenBigInt(10n, 20n);
 *
 * expect(isBetween10And20(20n)).toBe(true);
 * expect(isBetween10And20(25n)).toBe(false);
 * ```
 */
export const isBetweenBigInt =
  (min: bigint, max: bigint): Predicate<bigint> =>
  (value) =>
    value >= min && value <= max;
