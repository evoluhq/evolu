/**
 * Number arithmetic, comparison, and branded numeric types.
 *
 * @module
 */

import type { NonEmptyReadonlyArray } from "./Array.ts";
import { assertNonEmptyReadonlyArray } from "./Assert.ts";
import type { IsBranded } from "./Brand.ts";
import type { Result } from "./Result.ts";
import { err, ok } from "./Result.ts";
import {
  brand,
  Digit1To9,
  Digit1To99,
  lessThanOrEqualTo,
  onePositiveInt,
  NonNegativeInt,
  PositiveInt,
  Ratio,
  templateLiteral,
  union,
} from "./Type.ts";
import type { Predicate, WidenLiteral } from "./Types.ts";

/** Integer literal from `1` to `99`. */
export type Int1To99 = Digit1To99 extends `${infer Value extends number}`
  ? Value
  : never;

/** Integer literal from `1` to `100`. */
export type Int1To100 = Int1To99 | 100;

/**
 * Integer literal from 0 to 100 or {@link NonNegativeInt}.
 *
 * Convenience input accepting integer literals from 0 to 100 or an
 * already-validated {@link NonNegativeInt} for larger or dynamic values.
 *
 * ### Example
 *
 * ```ts
 * import {
 *   assertEqual,
 *   NonNegativeInt,
 *   type Int0To100OrNonNegativeInt,
 * } from "@evolu/common";
 *
 * const literal: Int0To100OrNonNegativeInt = 10;
 * const validated: Int0To100OrNonNegativeInt = NonNegativeInt.orThrow(101);
 *
 * assertEqual(literal, 10);
 * assertEqual(validated, 101);
 * ```
 */
export type Int0To100OrNonNegativeInt = 0 | Int1To100 | NonNegativeInt;

/**
 * {@link Int1To100} or {@link PositiveInt}.
 *
 * Convenience input accepting integer literals from 1 to 100 or an
 * already-validated {@link PositiveInt} for larger or dynamic values.
 *
 * ### Example
 *
 * ```ts
 * import {
 *   assertEqual,
 *   PositiveInt,
 *   type Int1To100OrPositiveInt,
 * } from "@evolu/common";
 *
 * const literal: Int1To100OrPositiveInt = 10;
 * const validated: Int1To100OrPositiveInt = PositiveInt.orThrow(101);
 *
 * assertEqual(literal, 10);
 * assertEqual(validated, 101);
 * ```
 */
export type Int1To100OrPositiveInt = Int1To100 | PositiveInt;

/**
 * {@link PercentageLiteral} or {@link Ratio}.
 *
 * Convenience input accepting a readable {@link PercentageLiteral} or a
 * validated {@link Ratio}. APIs normalize it to `Ratio`.
 *
 * ### Example
 *
 * ```ts
 * import { Ratio, assertType, jitter } from "@evolu/common";
 *
 * const readableJitter = jitter("50%");
 * const computedJitter = jitter(Ratio.orThrow(0.5));
 *
 * assertType<typeof readableJitter, typeof computedJitter>();
 * ```
 */
export type Percentage = PercentageLiteral | Ratio;

/**
 * Percentage literal from `"0%"` to `"100%"`.
 *
 * Decimal literals support one decimal place. Use {@link Ratio} for computed
 * values or greater precision.
 */
export const PercentageLiteral = /*#__PURE__*/ union(
  "0%",
  "100%",
  /*#__PURE__*/ templateLiteral(Digit1To99, "%"),
  /*#__PURE__*/ templateLiteral(
    /*#__PURE__*/ union("0", Digit1To99),
    ".",
    Digit1To9,
    "%",
  ),
);
export type PercentageLiteral = typeof PercentageLiteral.Output;

/** Converts a {@link Percentage} to its numeric {@link Ratio}. */
export const percentageToRatio = (percentage: Percentage): Ratio =>
  typeof percentage === "number"
    ? percentage
    : Ratio.orThrow(globalThis.Number.parseFloat(percentage) / 100);

export const increment = (n: number): number => n + 1;

export const decrement = (n: number): number => n - 1;

/** Clamps a number within a given range. */
export const clamp =
  (min: number, max: number) =>
  (n: number): number =>
    Math.min(Math.max(n, min), max);

/**
 * Creates a predicate that checks if a number is within a range, inclusive.
 *
 * ### Example
 *
 * ```ts
 * import { assertFalse, assertTrue, isBetween } from "@evolu/common";
 *
 * const isBetween10And20 = isBetween(10, 20);
 *
 * assertTrue(isBetween10And20(20));
 * assertFalse(isBetween10And20(25));
 * ```
 */
export const isBetween =
  (min: number, max: number): Predicate<number> =>
  (value) =>
    value >= min && value <= max;

/** Returns the minimum value, preserving branded type if applicable. */
export const min = <T extends number>(
  ...values: [T, ...ReadonlyArray<T>]
): IsBranded<T> extends true ? T : WidenLiteral<T> =>
  values.reduce((a, b) => (a < b ? a : b)) as never;

/** Returns the maximum value, preserving branded type if applicable. */
export const max = <T extends number>(
  ...values: [T, ...ReadonlyArray<T>]
): IsBranded<T> extends true ? T : WidenLiteral<T> =>
  values.reduce((a, b) => (a > b ? a : b)) as never;

/**
 * Divides items into buckets as evenly as possible, ensuring each bucket has at
 * least the minimum number of items. Returns a success result if the minimum is
 * met, or an error result with the required number of items if not.
 *
 * ### Example
 *
 * ```ts
 * import {
 *   assertErr,
 *   assertOk,
 *   computeBalancedBuckets,
 *   NonNegativeInt,
 *   PositiveInt,
 * } from "@evolu/common";
 *
 * const balanced = computeBalancedBuckets(
 *   NonNegativeInt.orThrow(10),
 *   PositiveInt.orThrow(3),
 *   PositiveInt.orThrow(2),
 * );
 * assertOk(balanced, [4, 7, 10]);
 *
 * const insufficient = computeBalancedBuckets(
 *   NonNegativeInt.orThrow(5),
 *   PositiveInt.orThrow(3),
 *   PositiveInt.orThrow(2),
 * );
 * assertErr(insufficient, 6);
 * ```
 */
export const computeBalancedBuckets = (
  numberOfItems: NonNegativeInt,

  /** Default: 16 */
  numberOfBuckets = PositiveInt.orThrow(16),

  /** Default: 2 */
  minNumberOfItemsPerBucket = PositiveInt.orThrow(2),
): Result<NonEmptyReadonlyArray<PositiveInt>, PositiveInt> => {
  const minRequiredItems = numberOfBuckets * minNumberOfItemsPerBucket;

  if (numberOfItems < minRequiredItems)
    return err(PositiveInt.orThrow(minRequiredItems));

  const indexes: Array<PositiveInt> = [];
  const itemsPerBucket = Math.floor(numberOfItems / numberOfBuckets);
  const extraItems = numberOfItems % numberOfBuckets;

  let bucketBoundary = 0;
  for (let i = 0; i < numberOfBuckets; i++) {
    const hasExtraItem = i < extraItems;
    const itemsInThisBucket = itemsPerBucket + (hasExtraItem ? 1 : 0);
    bucketBoundary += itemsInThisBucket;
    indexes.push(PositiveInt.orThrow(bucketBoundary));
  }

  assertNonEmptyReadonlyArray(indexes);
  return ok(indexes);
};

/**
 * Valid index for {@link fibonacciAt}, constrained to 1-78.
 *
 * Limited to 78 because F(79) exceeds JavaScript's `MAX_SAFE_INTEGER`.
 */
export const FibonacciIndex = /*#__PURE__*/ brand(
  "FibonacciIndex",
  /*#__PURE__*/ lessThanOrEqualTo(78)(PositiveInt),
);
export type FibonacciIndex = typeof FibonacciIndex.Output;

/** Returns the Fibonacci number at the given index (1-indexed: 1,1,2,3,5,8,...). */
export const fibonacciAt = (index: FibonacciIndex): PositiveInt => {
  if (index <= 2) return onePositiveInt;
  let a = 1;
  let b = 1;
  for (let i = 3; i <= index; i++) [a, b] = [b, a + b];
  return PositiveInt.orThrow(b);
};
