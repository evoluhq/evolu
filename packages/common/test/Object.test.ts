import { expect, test } from "vitest";
import {
  createRecord,
  getProperty,
  isIterable,
  isPlainObject,
} from "../src/Object.js";

test("isPlainObject", () => {
  expect(isPlainObject({})).toBe(true);
  expect(isPlainObject(new Date())).toBe(false);
  expect(isPlainObject([])).toBe(false);
  expect(isPlainObject(null)).toBe(false);
});

test("isIterable", () => {
  expect(isIterable([1, 2, 3])).toBe(true);
  expect(isIterable("abc")).toBe(true);
  expect(isIterable(new Set([1]))).toBe(true);
  expect(isIterable(new Map([["a", 1]]))).toBe(true);
  expect(isIterable({})).toBe(false);
  expect(isIterable(0)).toBe(false);
  expect(isIterable(null)).toBe(false);
  expect(isIterable(undefined)).toBe(false);
  expect(isIterable({ [Symbol.iterator]: 1 })).toBe(false);
});

test("createRecord", () => {
  const values = createRecord<string, number>();
  values.__proto__ = 123;

  expect(values.__proto__).toBe(123);

  // Ensure Object.prototype was not changed
  const protoValue = (Object.prototype as any).__proto__;
  expect((Object.prototype as any).__proto__).toBe(protoValue);
});

test("getProperty", () => {
  const record: Record<string, number> = { a: 1, b: 2 };

  expect(getProperty(record, "a")).toBe(1);
  expect(getProperty(record, "b")).toBe(2);
  expect(getProperty(record, "c")).toBe(undefined);
});
