import { expect, test } from "vitest";
import {
  clampBigInt,
  decrementBigInt,
  incrementBigInt,
  isBetweenBigInt,
} from "../src/BigInt.js";

test("incrementBigInt", () => {
  expect(incrementBigInt(1n)).toEqual(2n);
});

test("decrementBigInt", () => {
  expect(decrementBigInt(1n)).toEqual(0n);
});

test("clampBigInt", () => {
  expect(clampBigInt(0n, 2n)(1n)).toEqual(1n);
  expect(clampBigInt(0n, 2n)(3n)).toEqual(2n);
  expect(clampBigInt(0n, 2n)(-1n)).toEqual(0n);
});

test("isBetweenBigInt", () => {
  expect(isBetweenBigInt(0n, 2n)(1n)).toEqual(true);
  expect(isBetweenBigInt(0n, 2n)(3n)).toEqual(false);
  expect(isBetweenBigInt(0n, 2n)(-1n)).toEqual(false);
});
