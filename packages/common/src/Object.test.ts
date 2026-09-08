import nodeAssert from "node:assert/strict";
import { describe, it, test } from "node:test";
import { assertEqual, assertFalse, assertSame, assertTrue } from "./Assert.ts";

import type { Brand } from "./Brand.ts";
import type { ReadonlyRecord } from "./Object.ts";
import {
  createObjectURL,
  createMutableRecord,
  emptyRecord,
  excludeProp,
  filterObjectKeys,
  getObjectKind,
  getOwnProp,
  isFunction,
  isIterable,
  isPlainObject,
  mapObject,
  objectFrom,
  objectFromEntries,
  objectToEntries,
} from "./Object.ts";
import { assertType } from "./Type.ts";

class NullBase extends null {}

const createNullBase = (): NullBase =>
  Object.create(NullBase.prototype) as NullBase;

test("getObjectKind", () => {
  assertEqual(getObjectKind([]), "Array");
  assertEqual(getObjectKind(new ArrayBuffer(0)), "Unsupported");
  assertEqual(getObjectKind(new Date()), "Date");
  assertEqual(getObjectKind(new Map()), "Map");
  assertEqual(getObjectKind({}), "Object");
  assertEqual(getObjectKind(Object.create(null) as object), "Object");
  assertEqual(getObjectKind(new Set()), "Set");
  assertEqual(getObjectKind(new Uint8Array()), "Uint8Array");
  assertEqual(getObjectKind(/value/u), "Unsupported");
  assertEqual(getObjectKind(createNullBase()), "Unsupported");

  const emptyRoot = Object.create(null) as object;
  assertEqual(getObjectKind(Object.create(emptyRoot) as object), "Unsupported");

  const accessorRoot = Object.defineProperty(
    Object.create(null) as object,
    "constructor",
    { get: () => Object },
  );
  assertEqual(
    getObjectKind(Object.create(accessorRoot) as object),
    "Unsupported",
  );

  const nonFunctionRoot = Object.defineProperty(
    Object.create(null) as object,
    "constructor",
    { value: 1 },
  );
  assertEqual(
    getObjectKind(Object.create(nonFunctionRoot) as object),
    "Unsupported",
  );

  let reads = 0;
  const value = Object.defineProperty({}, Symbol.toStringTag, {
    get: () => {
      reads++;
      return "Custom";
    },
  });
  assertEqual(getObjectKind(value), "Object");
  assertEqual(reads, 0);
});

test("isPlainObject", () => {
  assertTrue(isPlainObject({}));
  assertTrue(isPlainObject(Object.create(null)));
  assertFalse(isPlainObject(new Date()));

  class Example {
    readonly id = "a";
  }

  assertFalse(isPlainObject(new Example()));
  assertFalse(isPlainObject(createNullBase()));
  assertFalse(isPlainObject([]));
  assertFalse(isPlainObject(null));

  const root = Object.create(null) as object;
  assertFalse(isPlainObject(Object.create(root)));

  const rootWithObjectConstructor = Object.defineProperty(
    Object.create(null) as object,
    "constructor",
    { value: Object },
  );
  assertFalse(isPlainObject(Object.create(rootWithObjectConstructor)));

  const partialObjectPrototype = Object.defineProperty(
    Object.create(null) as object,
    "hasOwnProperty",
    { value: () => false },
  );
  assertFalse(isPlainObject(Object.create(partialObjectPrototype)));
});

test("isFunction", () => {
  assertTrue(isFunction(() => {}));
  assertTrue(isFunction(function () {}));

  const constructable: unknown = class Example {
    readonly value = 1;
  };
  assertTrue(isFunction(constructable));
  // oxlint-disable-next-line evolu/no-unnecessary-global-this -- @evolu/common also exports an Evolu Function Type, while isFunction recognizes JavaScript function objects.
  assertType<typeof constructable, globalThis.Function>();

  assertFalse(isFunction({}));
  assertFalse(isFunction([]));
  assertFalse(isFunction("fn"));
  assertFalse(isFunction(123));
  assertFalse(isFunction(null));
  assertFalse(isFunction(undefined));
});

test("isIterable", () => {
  assertTrue(isIterable([1, 2, 3]));
  assertTrue(isIterable("abc"));
  assertTrue(isIterable(new Set([1])));
  assertTrue(isIterable(new Map([["a", 1]])));
  assertFalse(isIterable({}));
  assertFalse(isIterable(0));
  assertFalse(isIterable(null));
  assertFalse(isIterable(undefined));
  assertFalse(isIterable({ [Symbol.iterator]: 1 }));
});

test("objectToEntries", () => {
  const record = { a: 1, b: 2 };
  const entries = objectToEntries(record);

  assertEqual(entries, [
    ["a", 1],
    ["b", 2],
  ]);

  // Preserves branded key types
  type UserId = string & Brand<"UserId">;
  const users: Record<UserId, string> = { ["u1" as UserId]: "Alice" };
  const userEntries = objectToEntries(users);
  assertType<typeof userEntries, ReadonlyArray<[UserId, string]>>();

  assertEqual(userEntries, [["u1", "Alice"]]);
});

test("objectFromEntries", () => {
  const entries: ReadonlyArray<[string, number]> = [
    ["a", 1],
    ["b", 2],
  ];
  const record = objectFromEntries(entries);

  assertEqual(record, { a: 1, b: 2 });

  // Preserves branded key types
  type UserId = string & Brand<"UserId">;
  const userEntries: ReadonlyArray<[UserId, string]> = [
    ["u1" as UserId, "Alice"],
  ];
  const users = objectFromEntries(userEntries);
  assertType<typeof users, ReadonlyRecord<UserId, string>>();

  assertEqual(users, { u1: "Alice" });
});

test("objectFrom", () => {
  const result = objectFrom(["a", "b", "c"], (key) => key.toUpperCase());
  assertEqual(result, { a: "A", b: "B", c: "C" });

  // Key is available in the mapper
  const indexed = objectFrom(["x", "y"], (key) => `value-${key}`);
  assertEqual(indexed, { x: "value-x", y: "value-y" });

  // Preserves key types
  type Lang = "en" | "fr" | "de";
  const langs: ReadonlyArray<Lang> = ["en", "fr", "de"];
  const translations = objectFrom(langs, (lang) => `Hello in ${lang}`);
  assertType<typeof translations, ReadonlyRecord<Lang, string>>();
});

test("mapObject", () => {
  const record = { a: 1, b: 2, c: 3 };
  const doubled = mapObject(record, (value) => value * 2);

  assertEqual(doubled, { a: 2, b: 4, c: 6 });

  // Preserves branded key types
  type UserId = string & Brand<"UserId">;
  const users: ReadonlyRecord<UserId, number> = {
    ["u1" as UserId]: 10,
    ["u2" as UserId]: 20,
  };
  const mapped = mapObject(users, (value, key) => `${key}:${value}`);
  assertType<typeof mapped, ReadonlyRecord<UserId, string>>();

  assertEqual(mapped, { u1: "u1:10", u2: "u2:20" });
});

describe("filterObjectKeys", () => {
  it("preserves field types and makes selected fields optional", () => {
    const symbol = Symbol("ignored");
    const source = {
      APP_PORT: "4000",
      other: 1,
      42: true,
      [symbol]: "ignored",
    };
    const selected = filterObjectKeys(source, (key) => {
      assertType<typeof key, string>();
      return key.startsWith("APP_") || key === "42";
    });
    assertType<
      typeof selected,
      {
        readonly APP_PORT?: string;
        readonly other?: number;
        readonly 42?: boolean;
      }
    >();
    assertEqual(selected, { APP_PORT: "4000", 42: true });
    assertFalse(selected === source);
    assertEqual(
      filterObjectKeys(source, () => false),
      {},
    );

    type UserId = string & Brand<"UserId">;
    const users: ReadonlyRecord<UserId, number> = { ["u1" as UserId]: 1 };
    const selectedUsers = filterObjectKeys(users, () => true);
    assertType<
      typeof selectedUsers,
      Readonly<Partial<Record<UserId, number>>>
    >();
    assertEqual(selectedUsers, { u1: 1 });

    const reject = () => {
      // @ts-expect-error filterObjectKeys requires an object source.
      filterObjectKeys("text", () => true);
      // @ts-expect-error Selected properties are readonly.
      selected.APP_PORT = "5000";
    };
    assertType<typeof reject, () => void>();
  });

  it("preserves descriptors without reading getters", () => {
    let reads = 0;
    const getter = () => {
      reads++;
      return "value";
    };
    const source = Object.defineProperties(Object.create({ inherited: 1 }), {
      visible: { value: { nested: true }, enumerable: true, writable: true },
      hidden: { value: undefined },
      accessor: { get: getter, enumerable: true, configurable: true },
      excluded: { get: getter },
      [Symbol("ignored")]: { get: getter },
    });
    const visited: Array<string> = [];
    const selected = filterObjectKeys(source, (key) => {
      visited.push(key);
      return key !== "excluded";
    });
    assertEqual(visited, ["visible", "hidden", "accessor", "excluded"]);
    assertEqual(Object.getOwnPropertyNames(selected), [
      "visible",
      "hidden",
      "accessor",
    ]);
    for (const key of Object.getOwnPropertyNames(selected)) {
      nodeAssert.deepEqual(
        Object.getOwnPropertyDescriptor(selected, key),
        Object.getOwnPropertyDescriptor(source, key),
      );
    }
    assertEqual(reads, 0);
    assertFalse(Object.hasOwn(selected, "inherited"));
    assertEqual(Object.getOwnPropertySymbols(selected), []);
    assertSame(Object.getPrototypeOf(selected), Object.prototype);
    assertSame(
      Reflect.get(selected, "visible"),
      Reflect.get(source, "visible"),
    );
    assertSame(Reflect.get(selected, "accessor"), "value");
    assertEqual(reads, 1);
  });

  it("safely copies special keys and handles arrays as objects", () => {
    const source = createMutableRecord();
    source.__proto__ = "value";
    Object.defineProperty(source, "constructor", {
      value: "constructor",
      enumerable: true,
    });
    const selected = filterObjectKeys(source, () => true);
    assertTrue(Object.hasOwn(selected, "__proto__"));
    assertSame(Object.getPrototypeOf(selected), Object.prototype);
    assertEqual(selected, {
      ["__proto__"]: "value",
      constructor: "constructor",
    });

    const values: ReadonlyArray<number> = [10, 20];
    const array = filterObjectKeys(values, (key) => key === "0");
    assertFalse(Array.isArray(array));
    assertEqual(array, { 0: 10 });
    assertType<(typeof array)[0], number | undefined>();
    assertType<typeof array.map, ReadonlyArray<number>["map"] | undefined>();
  });
});

test("excludeProp", () => {
  const obj = { a: 1, b: 2, c: 3 };

  // Without condition (default: excludes)
  const withoutB = excludeProp(obj, "b");
  assertEqual(withoutB, { a: 1, c: 3 });

  // With condition = true (keeps all)
  const keepAll = excludeProp(obj, "b", true);
  assertEqual(keepAll, { a: 1, b: 2, c: 3 });

  // With condition = false (excludes)
  const excluded = excludeProp(obj, "a", false);
  assertEqual(excluded, { b: 2, c: 3 });
});

test("createMutableRecord", () => {
  const values = createMutableRecord<string, number>();
  values.__proto__ = 123;

  assertEqual(values.__proto__, 123);

  // Ensure Object.prototype was not changed
  const protoValue = Reflect.get(Object.prototype, "__proto__");
  assertSame(Reflect.get(Object.prototype, "__proto__"), protoValue);

  interface Source {
    readonly name: string;
    readonly age?: number;
  }

  const source: Source = { name: "Ada" };
  const copy = createMutableRecord(source);

  copy.name = "Grace";

  assertType<typeof copy, { name: string; age?: number }>();
  assertEqual(copy, { name: "Grace" });
  assertEqual(source, { name: "Ada" });
  assertSame(Object.getPrototypeOf(copy), null);

  void (() => {
    // @ts-expect-error createMutableRecord source must be an object.
    createMutableRecord("Ada");
  });
});

test("emptyRecord", () => {
  assertSame(Object.getPrototypeOf(emptyRecord), null);
  assertTrue(Object.isFrozen(emptyRecord));
});

test("getOwnProp", () => {
  const record = { a: 1, b: 2 };
  const stringRecord: Readonly<Record<string, number>> = record;
  const nullPrototypeRecord = createMutableRecord<string, number>();
  const value = getOwnProp(record, "a");

  assertType<typeof value, number | undefined>();
  assertEqual(value, 1);
  assertEqual(getOwnProp(record, "b"), 2);
  // @ts-expect-error c does not exists
  assertSame(getOwnProp(record, "c"), undefined);
  assertSame(getOwnProp(stringRecord, "toString"), undefined);
  assertSame(getOwnProp(nullPrototypeRecord, "toString"), undefined);

  Reflect.set(nullPrototypeRecord, "toString", 1);

  assertEqual(getOwnProp(nullPrototypeRecord, "toString"), 1);
});

test("createObjectURL", () => {
  const blob = new Blob(["test"], { type: "text/plain" });
  const objectUrl = createObjectURL(blob);

  assertTrue(objectUrl.url.startsWith("blob:"));

  // Dispose revokes the URL
  objectUrl[Symbol.dispose]();
});
