import { expect, test } from "vitest";
import {
  createOrder,
  orderBigInt,
  orderNumber,
  orderUint8Array,
  reverseOrder,
} from "../src/Order.js";

test("createOrder", () => {
  const orderNumber = createOrder<number>((x, y) => x < y);
  expect(orderNumber(1, 2)).toBe(-1);
  expect(orderNumber(2, 1)).toBe(1);
  expect(orderNumber(1, 1)).toBe(0);

  const orderString = createOrder<string>((x, y) => x.localeCompare(y) < 0);
  expect(orderString("a", "b")).toBe(-1);
  expect(orderString("b", "a")).toBe(1);
  expect(orderString("a", "a")).toBe(0);
});

test("reverseOrder", () => {
  const orderNumberDesc = reverseOrder(orderNumber);
  expect([2, 1, 3].toSorted(orderNumberDesc)).toEqual([3, 2, 1]);
});

test("orderNumber", () => {
  expect([2, 1, 3].toSorted(orderNumber)).toEqual([1, 2, 3]);
});

test("orderBigInt", () => {
  expect([2n, 1n, 3n].toSorted(orderBigInt)).toEqual([1n, 2n, 3n]);
});

test("orderUint8Array", () => {
  const a = new Uint8Array([0x01, 0x02, 0x03]);
  const b = new Uint8Array([0x01, 0x02, 0x04]);
  const c = new Uint8Array([0x01, 0x02, 0x03]);
  const d = new Uint8Array([0x01, 0x02]); // shorter
  const e = new Uint8Array([0x01, 0x02, 0x03, 0x00]); // longer

  expect(orderUint8Array(a, b)).toBe(-1);
  expect(orderUint8Array(b, a)).toBe(1);
  expect(orderUint8Array(a, c)).toBe(0);
  expect(orderUint8Array(a, d)).toBe(1);
  expect(orderUint8Array(a, e)).toBe(-1);
});
