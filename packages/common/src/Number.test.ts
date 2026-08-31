import { test } from "node:test";
import {
  assertEqual,
  assertFalse,
  assertOk,
  assertSame,
  assertTrue,
} from "./Assert.ts";

import {
  clamp,
  computeBalancedBuckets,
  decrement,
  fibonacciAt,
  FibonacciIndex,
  increment,
  type Int0To100OrNonNegativeInt,
  type Int1To100,
  type Int1To100OrPositiveInt,
  type Int1To99,
  isBetween,
  max,
  min,
  type Percentage,
  PercentageLiteral,
  percentageToRatio,
} from "./Number.ts";
import { err, ok } from "./Result.ts";
import { assertType, NonNegativeInt, PositiveInt, Ratio } from "./Type.ts";

test("bounded integer literal types", () => {
  assertType<1 extends Int1To99 ? true : false, true>();
  assertType<50 extends Int1To99 ? true : false, true>();
  assertType<99 extends Int1To99 ? true : false, true>();
  assertType<0 extends Int1To99 ? true : false, false>();
  assertType<100 extends Int1To99 ? true : false, false>();
  assertType<"1" extends Int1To99 ? true : false, false>();

  assertType<1 extends Int1To100 ? true : false, true>();
  assertType<100 extends Int1To100 ? true : false, true>();
  assertType<0 extends Int1To100 ? true : false, false>();
  assertType<101 extends Int1To100 ? true : false, false>();

  assertType<0 extends Int0To100OrNonNegativeInt ? true : false, true>();
  assertType<100 extends Int0To100OrNonNegativeInt ? true : false, true>();
  assertType<
    NonNegativeInt extends Int0To100OrNonNegativeInt ? true : false,
    true
  >();

  assertType<1 extends Int1To100OrPositiveInt ? true : false, true>();
  assertType<100 extends Int1To100OrPositiveInt ? true : false, true>();
  assertType<PositiveInt extends Int1To100OrPositiveInt ? true : false, true>();
});

test("Percentage accepts canonical literals or Ratio", () => {
  assertType<"0%" extends PercentageLiteral ? true : false, true>();
  assertType<"25%" extends PercentageLiteral ? true : false, true>();
  assertType<"12.5%" extends PercentageLiteral ? true : false, true>();
  assertType<"100%" extends PercentageLiteral ? true : false, true>();
  assertType<"01%" extends PercentageLiteral ? true : false, false>();
  assertType<"10.0%" extends PercentageLiteral ? true : false, false>();
  assertType<"100.1%" extends PercentageLiteral ? true : false, false>();
  assertType<Ratio extends Percentage ? true : false, true>();
  assertTrue(PercentageLiteral.is("0%"));
  assertTrue(PercentageLiteral.is("25%"));
  assertTrue(PercentageLiteral.is("12.5%"));
  assertTrue(PercentageLiteral.is("100%"));
  assertFalse(PercentageLiteral.is("01%"));
  assertFalse(PercentageLiteral.is("10.0%"));
  assertFalse(PercentageLiteral.is("100.1%"));
});

test("percentageToRatio converts percentage literals and preserves Ratio", () => {
  assertEqual(percentageToRatio("0%"), 0);
  assertEqual(percentageToRatio("12.5%"), 0.125);
  assertEqual(percentageToRatio("100%"), 1);

  const ratio = Ratio.orThrow(0.123456);
  assertSame(percentageToRatio(ratio), ratio);
});

test("increment", () => {
  assertEqual(increment(1), 2);
});

test("decrement", () => {
  assertEqual(decrement(1), 0);
});

test("clamp", () => {
  assertEqual(clamp(0, 2)(1), 1);
  assertEqual(clamp(0, 2)(3), 2);
  assertEqual(clamp(0, 10)(5), 5);
});

test("isBetween", () => {
  const isBetween10And20 = isBetween(10, 20);

  assertTrue(isBetween10And20(10));
  assertTrue(isBetween10And20(15));
  assertTrue(isBetween10And20(20));

  assertFalse(isBetween10And20(9));
  assertFalse(isBetween10And20(21));
});

test("computeBalancedBuckets", () => {
  assertEqual(
    computeBalancedBuckets(32 as NonNegativeInt),
    ok([2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32]),
  );

  assertEqual(computeBalancedBuckets(31 as NonNegativeInt), err(32));
  assertEqual(computeBalancedBuckets(0 as NonNegativeInt), err(32));
  assertEqual(
    computeBalancedBuckets(10 as NonNegativeInt, 3 as PositiveInt),
    ok([4, 7, 10]),
  );

  assertEqual(
    computeBalancedBuckets(5 as NonNegativeInt, 1 as PositiveInt),
    ok([5]),
  );

  assertEqual(
    computeBalancedBuckets(
      6 as NonNegativeInt,
      3 as PositiveInt,
      2 as PositiveInt,
    ),
    ok([2, 4, 6]),
  );

  assertEqual(
    computeBalancedBuckets(
      5 as NonNegativeInt,
      3 as PositiveInt,
      2 as PositiveInt,
    ),
    err(6),
  );
});

test("min", () => {
  const a = 5 as PositiveInt;
  const b = 3 as PositiveInt;
  const c = 7 as PositiveInt;

  const result = min(a, b, c);
  assertSame(result, b);
  assertType<typeof result, PositiveInt>();

  const result2 = min(5, 3, 7);
  assertEqual(result2, 3);
  assertType<typeof result2, number>();

  const e = 1 as PositiveInt;
  const f = 4 as NonNegativeInt;

  const result3 = min(e, f);
  assertEqual(result3, 1);
  assertType<typeof result3, NonNegativeInt>();
});

test("max", () => {
  const a = 5 as PositiveInt;
  const b = 3 as PositiveInt;
  const c = 7 as PositiveInt;

  const result = max(a, b, c);
  assertSame(result, c);
  assertType<typeof result, PositiveInt>();

  const result2 = max(5, 3, 7);
  assertEqual(result2, 7);
  assertType<typeof result2, number>();

  const e = 1 as PositiveInt;
  const f = 4 as NonNegativeInt;

  const result3 = max(e, f);
  assertEqual(result3, 4);
  assertType<typeof result3, NonNegativeInt>();
});

test("FibonacciIndex", () => {
  assertOk(FibonacciIndex.fromUnknown(1));
  assertOk(FibonacciIndex.fromUnknown(78));
  assertFalse(FibonacciIndex.fromUnknown(79).ok);
  assertFalse(FibonacciIndex.fromUnknown(0).ok);
  assertFalse(FibonacciIndex.fromUnknown(-1).ok);
});

test("fibonacciAt", () => {
  const at = (n: number) => fibonacciAt(FibonacciIndex.orThrow(n));

  // First 10 Fibonacci numbers (1-indexed)
  assertEqual(at(1), 1);
  assertEqual(at(2), 1);
  assertEqual(at(3), 2);
  assertEqual(at(4), 3);
  assertEqual(at(5), 5);
  assertEqual(at(6), 8);
  assertEqual(at(7), 13);
  assertEqual(at(8), 21);
  assertEqual(at(9), 34);
  assertEqual(at(10), 55);

  // F(78) is the largest Fibonacci within MAX_SAFE_INTEGER
  assertTrue(at(78) < Number.MAX_SAFE_INTEGER);

  // Return type is PositiveInt
  {
    const actual = at(1);
    assertType<typeof actual, PositiveInt>();
  }
});
