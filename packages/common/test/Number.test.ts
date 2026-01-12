import { expect, expectTypeOf, test } from "vitest";
import {
  clamp,
  computeBalancedBuckets,
  decrement,
  fibonacciAt,
  FibonacciIndex,
  increment,
  isBetween,
  max,
  min,
} from "../src/Number.js";
import { err, ok } from "../src/Result.js";
import { NonNegativeInt, PositiveInt } from "../src/Type.js";

test("increment", () => {
  expect(increment(1)).toEqual(2);
});

test("decrement", () => {
  expect(decrement(1)).toEqual(0);
});

test("clamp", () => {
  expect(clamp(0, 2)(1)).toEqual(1);
  expect(clamp(0, 2)(3)).toEqual(2);
  expect(clamp(0, 10)(5)).toEqual(5);
});

test("isBetween", () => {
  const isBetween10And20 = isBetween(10, 20);

  expect(isBetween10And20(10)).toBe(true);
  expect(isBetween10And20(15)).toBe(true);
  expect(isBetween10And20(20)).toBe(true);

  expect(isBetween10And20(9)).toBe(false);
  expect(isBetween10And20(21)).toBe(false);
});

test("computeBalancedBuckets", () => {
  expect(computeBalancedBuckets(32 as NonNegativeInt)).toEqual(
    ok([2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32]),
  );

  expect(computeBalancedBuckets(31 as NonNegativeInt)).toEqual(err(32));
  expect(computeBalancedBuckets(0 as NonNegativeInt)).toEqual(err(32));
  expect(
    computeBalancedBuckets(10 as NonNegativeInt, 3 as PositiveInt),
  ).toEqual(ok([4, 7, 10]));

  expect(computeBalancedBuckets(5 as NonNegativeInt, 1 as PositiveInt)).toEqual(
    ok([5]),
  );

  expect(
    computeBalancedBuckets(
      6 as NonNegativeInt,
      3 as PositiveInt,
      2 as PositiveInt,
    ),
  ).toEqual(ok([2, 4, 6]));

  expect(
    computeBalancedBuckets(
      5 as NonNegativeInt,
      3 as PositiveInt,
      2 as PositiveInt,
    ),
  ).toEqual(err(6));
});

test("min", () => {
  const a = 5 as PositiveInt;
  const b = 3 as PositiveInt;
  const c = 7 as PositiveInt;

  const result = min(a, b, c);
  expect(result).toBe(b);
  expectTypeOf<typeof result>().toEqualTypeOf<PositiveInt>();

  const result2 = min(5, 3, 7);
  expect(result2).toBe(3);
  expectTypeOf<typeof result2>().toEqualTypeOf<number>();

  const e = 1 as PositiveInt;
  const f = 4 as NonNegativeInt;

  const result3 = min(e, f);
  expect(result3).toBe(1);
  expectTypeOf<typeof result3>().toEqualTypeOf<NonNegativeInt>();
});

test("max", () => {
  const a = 5 as PositiveInt;
  const b = 3 as PositiveInt;
  const c = 7 as PositiveInt;

  const result = max(a, b, c);
  expect(result).toBe(c);
  expectTypeOf<typeof result>().toEqualTypeOf<PositiveInt>();

  const result2 = max(5, 3, 7);
  expect(result2).toBe(7);
  expectTypeOf<typeof result2>().toEqualTypeOf<number>();

  const e = 1 as PositiveInt;
  const f = 4 as NonNegativeInt;

  const result3 = max(e, f);
  expect(result3).toBe(4);
  expectTypeOf<typeof result3>().toEqualTypeOf<NonNegativeInt>();
});

test("FibonacciIndex", () => {
  expect(FibonacciIndex.from(1).ok).toBe(true);
  expect(FibonacciIndex.from(78).ok).toBe(true);
  expect(FibonacciIndex.from(79).ok).toBe(false);
  expect(FibonacciIndex.from(0).ok).toBe(false);
  expect(FibonacciIndex.from(-1).ok).toBe(false);
});

test("fibonacciAt", () => {
  const at = (n: number) => fibonacciAt(FibonacciIndex.orThrow(n));

  // First 10 Fibonacci numbers (1-indexed)
  expect(at(1)).toBe(1);
  expect(at(2)).toBe(1);
  expect(at(3)).toBe(2);
  expect(at(4)).toBe(3);
  expect(at(5)).toBe(5);
  expect(at(6)).toBe(8);
  expect(at(7)).toBe(13);
  expect(at(8)).toBe(21);
  expect(at(9)).toBe(34);
  expect(at(10)).toBe(55);

  // F(78) is the largest Fibonacci within MAX_SAFE_INTEGER
  expect(at(78)).toBeLessThan(Number.MAX_SAFE_INTEGER);

  // Return type is PositiveInt
  expectTypeOf(at(1)).toEqualTypeOf<PositiveInt>();
});
