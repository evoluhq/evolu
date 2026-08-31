import { test } from "node:test";
import { assertEqual } from "./Assert.ts";

import {
  createOrder,
  orderBigInt,
  orderNumber,
  orderString,
  orderUint8Array,
  reverseOrder,
} from "./Order.ts";

test("createOrder", () => {
  const orderNumber = createOrder<number>((x, y) => x < y);
  assertEqual(orderNumber(1, 2), -1);
  assertEqual(orderNumber(2, 1), 1);
  assertEqual(orderNumber(1, 1), 0);

  const orderString = createOrder<string>((x, y) => x.localeCompare(y) < 0);
  assertEqual(orderString("a", "b"), -1);
  assertEqual(orderString("b", "a"), 1);
  assertEqual(orderString("a", "a"), 0);
});

test("reverseOrder", () => {
  const orderNumberDesc = reverseOrder(orderNumber);
  assertEqual([2, 1, 3].toSorted(orderNumberDesc), [3, 2, 1]);
});

test("orderString", () => {
  assertEqual(["b", "a", "c"].toSorted(orderString), ["a", "b", "c"]);
});

test("orderNumber", () => {
  assertEqual([2, 1, 3].toSorted(orderNumber), [1, 2, 3]);
});

test("orderBigInt", () => {
  assertEqual([2n, 1n, 3n].toSorted(orderBigInt), [1n, 2n, 3n]);
});

test("orderUint8Array", () => {
  const a = new Uint8Array([0x01, 0x02, 0x03]);
  const b = new Uint8Array([0x01, 0x02, 0x04]);
  const c = new Uint8Array([0x01, 0x02, 0x03]);
  // shorter
  const d = new Uint8Array([0x01, 0x02]);
  // longer
  const e = new Uint8Array([0x01, 0x02, 0x03, 0x00]);

  assertEqual(orderUint8Array(a, b), -1);
  assertEqual(orderUint8Array(b, a), 1);
  assertEqual(orderUint8Array(a, c), 0);
  assertEqual(orderUint8Array(a, d), 1);
  assertEqual(orderUint8Array(a, e), -1);
});
