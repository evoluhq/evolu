import { test } from "node:test";
import {
  clampBigInt,
  decrementBigInt,
  incrementBigInt,
  isBetweenBigInt,
} from "./BigInt.ts";
import { assertEqual, assertFalse, assertTrue } from "./Assert.ts";

test("incrementBigInt", () => {
  assertEqual(incrementBigInt(1n), 2n);
});

test("decrementBigInt", () => {
  assertEqual(decrementBigInt(1n), 0n);
});

test("clampBigInt", () => {
  assertEqual(clampBigInt(0n, 2n)(1n), 1n);
  assertEqual(clampBigInt(0n, 2n)(3n), 2n);
  assertEqual(clampBigInt(0n, 2n)(-1n), 0n);
});

test("isBetweenBigInt", () => {
  assertTrue(isBetweenBigInt(0n, 2n)(1n));
  assertFalse(isBetweenBigInt(0n, 2n)(3n));
  assertFalse(isBetweenBigInt(0n, 2n)(-1n));
});
