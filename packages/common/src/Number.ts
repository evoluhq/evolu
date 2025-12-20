import { NonEmptyReadonlyArray } from "./Array.js";
import { assertNonEmptyReadonlyArray } from "./Assert.js";
import { err, ok, Result } from "./Result.js";
import { NonNegativeInt, PositiveInt } from "./Type.js";
import { IntentionalNever, Predicate, WidenLiteral } from "./Types.js";
import { IsBranded } from "./Brand.js";

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
 * ## Example
 *
 * ```ts
 * const isBetween10And20 = isBetween(10, 20);
 * console.log(isBetween10And20(15)); // true
 * console.log(isBetween10And20(25)); // false
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
  values.reduce((a, b) => (a < b ? a : b)) as IntentionalNever;

/** Returns the maximum value, preserving branded type if applicable. */
export const max = <T extends number>(
  ...values: [T, ...ReadonlyArray<T>]
): IsBranded<T> extends true ? T : WidenLiteral<T> =>
  values.reduce((a, b) => (a > b ? a : b)) as IntentionalNever;

/**
 * Divides items into buckets as evenly as possible, ensuring each bucket has at
 * least the minimum number of items. Returns a success result if the minimum is
 * met, or an error result with the required number of items if not.
 *
 * ## Example
 *
 * ```ts
 * computeBalancedBuckets(10, 3, 2); // Returns ok([4, 7, 10])
 * computeBalancedBuckets(5, 3, 2); // Returns err(6)
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
