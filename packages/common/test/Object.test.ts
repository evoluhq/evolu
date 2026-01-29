import { expect, expectTypeOf, test } from "vitest";
import type { Brand } from "../src/Brand.js";
import type { ReadonlyRecord } from "../src/Object.js";
import {
  createObjectURL,
  createRecord,
  excludeProp,
  getProperty,
  isFunction,
  isIterable,
  isPlainObject,
  mapObject,
  objectFrom,
  objectFromEntries,
  objectToEntries,
} from "../src/Object.js";

test("isPlainObject", () => {
  expect(isPlainObject({})).toBe(true);
  expect(isPlainObject(new Date())).toBe(false);
  expect(isPlainObject([])).toBe(false);
  expect(isPlainObject(null)).toBe(false);
});

test("isFunction", () => {
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  expect(isFunction(() => {})).toBe(true);
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  expect(isFunction(function () {})).toBe(true);
  expect(isFunction({})).toBe(false);
  expect(isFunction([])).toBe(false);
  expect(isFunction("fn")).toBe(false);
  expect(isFunction(123)).toBe(false);
  expect(isFunction(null)).toBe(false);
  expect(isFunction(undefined)).toBe(false);
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

test("objectToEntries", () => {
  const record = { a: 1, b: 2 };
  const entries = objectToEntries(record);

  expect(entries).toEqual([
    ["a", 1],
    ["b", 2],
  ]);

  // Preserves branded key types
  type UserId = string & Brand<"UserId">;
  const users: Record<UserId, string> = { ["u1" as UserId]: "Alice" };
  const userEntries = objectToEntries(users);
  expectTypeOf(userEntries).toEqualTypeOf<ReadonlyArray<[UserId, string]>>();

  expect(userEntries).toEqual([["u1", "Alice"]]);
});

test("objectFromEntries", () => {
  const entries: ReadonlyArray<[string, number]> = [
    ["a", 1],
    ["b", 2],
  ];
  const record = objectFromEntries(entries);

  expect(record).toEqual({ a: 1, b: 2 });

  // Preserves branded key types
  type UserId = string & Brand<"UserId">;
  const userEntries: ReadonlyArray<[UserId, string]> = [
    ["u1" as UserId, "Alice"],
  ];
  const users = objectFromEntries(userEntries);
  expectTypeOf(users).toEqualTypeOf<ReadonlyRecord<UserId, string>>();

  expect(users).toEqual({ u1: "Alice" });
});

test("objectFrom", () => {
  const result = objectFrom(["a", "b", "c"], (key) => key.toUpperCase());
  expect(result).toEqual({ a: "A", b: "B", c: "C" });

  // Key is available in the mapper
  const indexed = objectFrom(["x", "y"], (key) => `value-${key}`);
  expect(indexed).toEqual({ x: "value-x", y: "value-y" });

  // Preserves key types
  type Lang = "en" | "fr" | "de";
  const langs: ReadonlyArray<Lang> = ["en", "fr", "de"];
  const translations = objectFrom(langs, (lang) => `Hello in ${lang}`);
  expectTypeOf(translations).toEqualTypeOf<ReadonlyRecord<Lang, string>>();
});

test("mapObject", () => {
  const record = { a: 1, b: 2, c: 3 };
  const doubled = mapObject(record, (value) => value * 2);

  expect(doubled).toEqual({ a: 2, b: 4, c: 6 });

  // Preserves branded key types
  type UserId = string & Brand<"UserId">;
  const users: ReadonlyRecord<UserId, number> = {
    ["u1" as UserId]: 10,
    ["u2" as UserId]: 20,
  };
  const mapped = mapObject(users, (value, key) => `${key}:${value}`);
  expectTypeOf(mapped).toEqualTypeOf<ReadonlyRecord<UserId, string>>();

  expect(mapped).toEqual({ u1: "u1:10", u2: "u2:20" });
});

test("excludeProp", () => {
  const obj = { a: 1, b: 2, c: 3 };

  // Without condition (default: excludes)
  const withoutB = excludeProp(obj, "b");
  expect(withoutB).toEqual({ a: 1, c: 3 });

  // With condition = true (keeps all)
  const keepAll = excludeProp(obj, "b", true);
  expect(keepAll).toEqual({ a: 1, b: 2, c: 3 });

  // With condition = false (excludes)
  const excluded = excludeProp(obj, "a", false);
  expect(excluded).toEqual({ b: 2, c: 3 });
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
  const record = { a: 1, b: 2 };

  expect(getProperty(record, "a")).toBe(1);
  expect(getProperty(record, "b")).toBe(2);
  // @ts-expect-error c does not exists
  expect(getProperty(record, "c")).toBe(undefined);
});

test("createObjectURL", () => {
  const blob = new Blob(["test"], { type: "text/plain" });
  const objectUrl = createObjectURL(blob);

  expect(objectUrl.url).toMatch(/^blob:/);

  // Dispose revokes the URL
  objectUrl[Symbol.dispose]();
});
