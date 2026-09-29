import nodeAssert from "node:assert/strict";
import { describe, it, test } from "node:test";
import {
  assertEqual,
  assertFalse,
  assertNonNullable,
  assertNotSame,
  assertSame,
  assertTrue,
} from "./Assert.ts";

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
  shareStructure,
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

test("isPlainObject checks the root markers of Object.prototype", () => {
  for (const key of ["hasOwnProperty", "isPrototypeOf"]) {
    const descriptor = Object.getOwnPropertyDescriptor(Object.prototype, key);
    assertNonNullable(descriptor);
    Reflect.deleteProperty(Object.prototype, key);
    try {
      assertFalse(isPlainObject({}));
      assertTrue(isPlainObject(Object.create(null)));
    } finally {
      // oxlint-disable-next-line eslint/no-extend-native -- Restores the built-in property this test deleted.
      Object.defineProperty(Object.prototype, key, descriptor);
    }
  }
  assertTrue(isPlainObject({}));
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

    void (() => {
      // @ts-expect-error filterObjectKeys requires an object source.
      filterObjectKeys("text", () => true);
      // @ts-expect-error Selected properties are readonly.
      selected.APP_PORT = "5000";
    });
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

describe("shareStructure", () => {
  it("returns the previous value when the next one is deep-equal", () => {
    const previous = {
      name: "Alice",
      tags: ["a", "b", Number.NaN],
      nested: { items: [{ id: 1 }, { id: 2 }], missing: null },
      count: Number.NaN,
    };

    assertSame(shareStructure(previous, structuredClone(previous)), previous);
    assertSame(shareStructure(1, 1), 1);
    const nullPrototype = Object.assign(Object.create(null) as object, {
      a: 1,
    });
    assertSame(shareStructure(nullPrototype, { a: 1 }), nullPrototype);
  });

  it("keeps every unchanged part of a changed value", () => {
    const previous = {
      user: { name: "Alice" },
      todos: [{ title: "Buy milk" }, { title: "Walk the dog" }],
    };
    const next = structuredClone(previous);
    next.todos[1] = { title: "Walk the cat" };

    const shared = shareStructure(previous, next);
    assertNotSame(shared, previous);
    assertEqual(shared, next);
    assertSame(shared.user, previous.user);
    assertNotSame(shared.todos, previous.todos);
    assertSame(shared.todos[0], previous.todos[0]);
    assertNotSame(shared.todos[1], previous.todos[1]);
  });

  it("treats added and removed keys and resized arrays as changes", () => {
    const previous: Record<string, { readonly id: number }> = {
      a: { id: 1 },
      b: { id: 2 },
    };

    const added = shareStructure(previous, {
      a: { id: 1 },
      b: { id: 2 },
      c: { id: 3 },
    });
    assertNotSame(added, previous);
    assertSame(added.a, previous.a);

    const removed = shareStructure(previous, { a: { id: 1 } });
    assertNotSame(removed, previous);
    assertEqual(removed, { a: { id: 1 } });
    assertSame(removed.a, previous.a);

    // A key whose value is undefined is still a key.
    const withUndefined = shareStructure<Record<string, unknown>>(
      { a: 1 },
      { a: 1, b: undefined },
    );
    assertEqual(Object.keys(withUndefined), ["a", "b"]);
    // So is a renamed key with the same number of keys.
    const renamed = shareStructure<Record<string, unknown>>(
      { a: undefined },
      { b: undefined },
    );
    assertEqual(Object.keys(renamed), ["b"]);

    const items = [{ id: 1 }, { id: 2 }];
    const longer = shareStructure(items, [{ id: 1 }, { id: 2 }, { id: 3 }]);
    assertNotSame(longer, items);
    assertSame(longer[0], items[0]);
    const shorter = shareStructure(items, [{ id: 1 }]);
    assertNotSame(shorter, items);
    assertEqual(shorter, [{ id: 1 }]);
    // An item that is undefined is still an item.
    assertEqual(shareStructure<ReadonlyArray<unknown>>([1], [1, undefined]), [
      1,
      undefined,
    ]);
  });

  it("returns the next value when its kind differs", () => {
    const object = { a: 1 };
    const array = [1];
    const bytes = Uint8Array.of(1);
    const pairs: ReadonlyArray<readonly [unknown, unknown]> = [
      [object, null],
      [null, object],
      [array, null],
      [null, array],
      [array, { 0: 1 }],
      [bytes, null],
      [null, bytes],
      [array, bytes],
    ];

    for (const [previous, next] of pairs)
      assertSame(shareStructure(previous, next), next);
  });

  it("compares the properties an object spread copies", () => {
    const hidden = Object.defineProperty({ a: 1 }, "b", { value: 2 });
    const shared = shareStructure<Record<string, unknown>>(hidden, { b: 2 });
    assertNotSame(shared, hidden);
    assertEqual(shared, { b: 2 });

    const symbol = Symbol("symbol");
    const plain = { a: 1 };
    assertSame(
      shareStructure<object>(
        plain,
        Object.defineProperty({ a: 1 }, symbol, { value: 2 }),
      ),
      plain,
    );
    const previous = { a: 1, [symbol]: { id: 1 } };
    assertSame(shareStructure(previous, { ...previous }), previous);
    const changedSymbol = shareStructure(previous, {
      a: 1,
      [symbol]: { id: 2 },
    });
    assertNotSame(changedSymbol, previous);
    assertEqual(changedSymbol[symbol], { id: 2 });
    const changedString = shareStructure(previous, { ...previous, a: 2 });
    assertSame(changedString[symbol], previous[symbol]);
    const withoutSymbol = shareStructure<object>(previous, { a: 1 });
    assertNotSame(withoutSymbol, previous);
    assertFalse(symbol in withoutSymbol);
  });

  it("returns a part that a cycle leads back to as it is in the next value", () => {
    interface Node {
      readonly id: number;
      readonly items: Array<unknown>;
    }
    const createValue = () => {
      const node: Node = { id: 1, items: [] };
      node.items.push(node);
      return { unchanged: { id: 2 }, node };
    };
    const previous = createValue();
    const next = createValue();

    const shared = shareStructure(previous, next);
    assertSame(shared.unchanged, previous.unchanged);
    assertSame(shared.node, next.node);
    assertSame(shared.node.items[0], shared.node);
    assertSame(shareStructure(previous.node, next.node), next.node);
  });

  it("compares a part referenced from several places at each place", () => {
    const shared = { id: 1 };
    const previous = { a: shared, b: shared };

    assertSame(shareStructure(previous, structuredClone(previous)), previous);
  });

  it("compares an array item with the previous item of the same key", () => {
    const itemToKey = (item: unknown): unknown =>
      isPlainObject(item) ? item.id : undefined;
    const previous = {
      items: [
        { id: 1, meta: { tag: "a" } },
        { id: 2, meta: { tag: "b" } },
        { id: 3, meta: { tag: "c" } },
      ],
    };

    // Removing an item keeps the objects of the items after it.
    const removed = shareStructure(
      previous,
      { items: [structuredClone(previous.items[1]), { id: 3, meta: null }] },
      itemToKey,
    );
    assertEqual(removed, {
      items: [
        { id: 2, meta: { tag: "b" } },
        { id: 3, meta: null },
      ],
    });
    assertSame(removed.items[0], previous.items[1]);

    // Moved items keep their objects in a new array.
    const moved = shareStructure(
      previous,
      { items: structuredClone(previous.items).toReversed() },
      itemToKey,
    );
    assertNotSame(moved.items, previous.items);
    assertSame(moved.items[0], previous.items[2]);
    assertSame(moved.items[2], previous.items[0]);

    // A changed item keeps its unchanged parts.
    const changed = shareStructure<ReadonlyArray<Record<string, unknown>>>(
      previous.items,
      [{ id: 2, meta: { tag: "b" }, done: true }],
      itemToKey,
    );
    assertSame(changed[0]?.meta, previous.items[1].meta);

    // An item with a new key has no previous item to share with.
    const added = shareStructure(
      previous.items,
      [{ id: 4, meta: { tag: "a" } }],
      itemToKey,
    );
    assertNotSame(added[0]?.meta, previous.items[0].meta);

    // An item without a key is compared with the item at its index.
    const unkeyed = [{ tag: "a" }, { tag: "b" }];
    assertSame(
      shareStructure(unkeyed, structuredClone(unkeyed), itemToKey),
      unkeyed,
    );
  });

  it("compares Uint8Arrays by their bytes", () => {
    const previous = { blob: Uint8Array.of(1, 2, 3) };

    assertSame(shareStructure(previous, structuredClone(previous)), previous);
    const changed = shareStructure(previous, { blob: Uint8Array.of(1, 2, 4) });
    assertNotSame(changed, previous);
    assertEqual(changed.blob, Uint8Array.of(1, 2, 4));
    assertNotSame(
      shareStructure(previous, { blob: Uint8Array.of(1, 2) }),
      previous,
    );
    assertNotSame(
      shareStructure(previous, { blob: Uint8Array.of(1, 2, 3, 4) }),
      previous,
    );
  });

  it("compares a hole in an array as a missing item", () => {
    const previous = [1, 2, 3];
    // oxlint-disable-next-line no-sparse-arrays -- The hole is what is tested.
    const next = [1, , 3];

    const shared = shareStructure<ReadonlyArray<number | undefined>>(
      previous,
      next,
    );
    assertNotSame(shared, previous);
    assertSame(shared[1], undefined);

    // A hole in a keyed previous array has no key.
    // oxlint-disable-next-line no-sparse-arrays -- The hole is what is tested.
    const sparse = [, { id: 1 }];
    const keyed = shareStructure<ReadonlyArray<unknown>>(
      sparse,
      [{ id: 1 }],
      (item) => (isPlainObject(item) ? item.id : undefined),
    );
    assertEqual(keyed, [{ id: 1 }]);
    assertSame(keyed[0], sparse[1]);
  });

  it("compares values other than plain objects and arrays by identity", () => {
    const date = new Date(0);
    assertNotSame(shareStructure(date, new Date(0)), date);

    class Example {
      readonly value = "example";
    }
    const example = new Example();
    assertNotSame(shareStructure(example, new Example()), example);

    assertTrue(Object.is(shareStructure(0, -0), -0));
  });

  it("keeps a __proto__ key as own data of an ordinary object", () => {
    const next = JSON.parse(
      '{"__proto__": {"polluted": true}, "b": 1}',
    ) as Record<string, unknown>;

    const shared = shareStructure<Record<string, unknown>>({ b: 2 }, next);
    assertSame(Object.getPrototypeOf(shared), Object.prototype);
    assertTrue(Object.hasOwn(shared, "__proto__"));
    assertEqual(Object.getOwnPropertyDescriptor(shared, "__proto__")?.value, {
      polluted: true,
    });
    assertFalse("polluted" in {});

    // An empty `__proto__` value is not mistaken for Object.prototype.
    const empty = shareStructure<Record<string, unknown>>(
      {},
      JSON.parse('{"__proto__": {}}') as Record<string, unknown>,
    );
    assertNotSame(
      Object.getOwnPropertyDescriptor(empty, "__proto__")?.value,
      Object.prototype,
    );
  });
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
