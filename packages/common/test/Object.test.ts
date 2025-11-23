import { expect, test } from "vitest";
import { createRecord, isPlainObject } from "../src/Object.js";

test("isPlainObject", () => {
  expect(isPlainObject({})).toBe(true);
  expect(isPlainObject(new Date())).toBe(false);
  expect(isPlainObject([])).toBe(false);
  expect(isPlainObject(null)).toBe(false);
});

test("createRecord", () => {
  const values = createRecord<string, number>();
  values.__proto__ = 123;

  expect(values.__proto__).toBe(123);

  // Ensure Object.prototype was not changed
  const protoValue = (Object.prototype as any).__proto__;
  expect((Object.prototype as any).__proto__).toBe(protoValue);
});
