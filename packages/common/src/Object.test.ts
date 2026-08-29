import { expect, expectTypeOf, test } from "vitest";
import type { Brand } from "../../../../packages/common/src/Brand.ts";
import type { ReadonlyRecord } from "../../../../packages/common/src/Object.ts";
import {
  createObjectURL,
  createMutableRecord,
  emptyRecord,
  excludeProp,
  getObjectKind,
  getOwnProp,
  isFunction,
  isIterable,
  isPlainObject,
  mapObject,
  objectFrom,
  objectFromEntries,
  objectToEntries,
} from "../../../../packages/common/src/Object.ts";

class NullBase extends null {}

const createNullBase = (): NullBase =>
  Object.create(NullBase.prototype) as NullBase;

test("getObjectKind", () => {
  expect(getObjectKind([])).toBe("Array");
  expect(getObjectKind(new ArrayBuffer(0))).toBe("Unsupported");
  expect(getObjectKind(new Date())).toBe("Date");
  expect(getObjectKind(new Map())).toBe("Map");
  expect(getObjectKind({})).toBe("Object");
  expect(getObjectKind(Object.create(null) as object)).toBe("Object");
  expect(getObjectKind(new Set())).toBe("Set");
  expect(getObjectKind(new Uint8Array())).toBe("Uint8Array");
  expect(getObjectKind(/value/u)).toBe("Unsupported");
  expect(getObjectKind(createNullBase())).toBe("Unsupported");

  const emptyRoot = Object.create(null) as object;
  expect(getObjectKind(Object.create(emptyRoot) as object)).toBe("Unsupported");

  const accessorRoot = Object.defineProperty(
    Object.create(null) as object,
    "constructor",
    { get: () => Object },
  );
  expect(getObjectKind(Object.create(accessorRoot) as object)).toBe(
    "Unsupported",
  );

  const nonFunctionRoot = Object.defineProperty(
    Object.create(null) as object,
    "constructor",
    { value: 1 },
  );
  expect(getObjectKind(Object.create(nonFunctionRoot) as object)).toBe(
    "Unsupported",
  );

  let reads = 0;
  const value = Object.defineProperty({}, Symbol.toStringTag, {
    get: () => {
      reads++;
      return "Custom";
    },
  });
  expect(getObjectKind(value)).toBe("Object");
  expect(reads).toBe(0);
});

test("isPlainObject", () => {
  expect(isPlainObject({})).toBe(true);
  expect(isPlainObject(Object.create(null))).toBe(true);
  expect(isPlainObject(new Date())).toBe(false);

  class Example {
    readonly id = "a";
  }

  expect(isPlainObject(new Example())).toBe(false);
  expect(isPlainObject(createNullBase())).toBe(false);
  expect(isPlainObject([])).toBe(false);
  expect(isPlainObject(null)).toBe(false);

  const root = Object.create(null) as object;
  expect(isPlainObject(Object.create(root))).toBe(false);

  const rootWithObjectConstructor = Object.defineProperty(
    Object.create(null) as object,
    "constructor",
    { value: globalThis.Object },
  );
  expect(isPlainObject(Object.create(rootWithObjectConstructor))).toBe(false);

  const partialObjectPrototype = Object.defineProperty(
    Object.create(null) as object,
    "hasOwnProperty",
    { value: () => false },
  );
  expect(isPlainObject(Object.create(partialObjectPrototype))).toBe(false);
});

test("isFunction", () => {
  expect(isFunction(() => {})).toBe(true);
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

test("createMutableRecord", () => {
  const values = createMutableRecord<string, number>();
  values.__proto__ = 123;

  expect(values.__proto__).toBe(123);

  // Ensure Object.prototype was not changed
  const protoValue = Reflect.get(Object.prototype, "__proto__");
  expect(Reflect.get(Object.prototype, "__proto__")).toBe(protoValue);

  interface Source {
    readonly name: string;
    readonly age?: number;
  }

  const source: Source = { name: "Ada" };
  const copy = createMutableRecord(source);

  copy.name = "Grace";

  expectTypeOf(copy).toEqualTypeOf<{ name: string; age?: number }>();
  expect(copy).toEqual({ name: "Grace" });
  expect(source).toEqual({ name: "Ada" });
  expect(Object.getPrototypeOf(copy)).toBeNull();

  const compileTimeAssertions = () => {
    // @ts-expect-error createMutableRecord source must be an object.
    createMutableRecord("Ada");
  };
  expectTypeOf(compileTimeAssertions).toBeFunction();
});

test("emptyRecord", () => {
  expect(Object.getPrototypeOf(emptyRecord)).toBeNull();
  expect(Object.isFrozen(emptyRecord)).toBe(true);
});

test("getOwnProp", () => {
  const record = { a: 1, b: 2 };
  const stringRecord: Readonly<Record<string, number>> = record;
  const nullPrototypeRecord = createMutableRecord<string, number>();
  const value = getOwnProp(record, "a");

  expectTypeOf(value).toEqualTypeOf<number | undefined>();
  expect(value).toBe(1);
  expect(getOwnProp(record, "b")).toBe(2);
  // @ts-expect-error c does not exists
  expect(getOwnProp(record, "c")).toBe(undefined);
  expect(getOwnProp(stringRecord, "toString")).toBeUndefined();
  expect(getOwnProp(nullPrototypeRecord, "toString")).toBeUndefined();

  Reflect.set(nullPrototypeRecord, "toString", 1);

  expect(getOwnProp(nullPrototypeRecord, "toString")).toBe(1);
});

test("createObjectURL", () => {
  const blob = new Blob(["test"], { type: "text/plain" });
  const objectUrl = createObjectURL(blob);

  expect(objectUrl.url).toMatch(/^blob:/u);

  // Dispose revokes the URL
  objectUrl[Symbol.dispose]();
});
