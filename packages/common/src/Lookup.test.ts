import { describe, it } from "node:test";
import {
  assertEqual,
  assertFalse,
  assertSame,
  assertThrowsInstanceOf,
  assertTrue,
} from "./Assert.ts";

import { createMutableArray } from "./Array.ts";
import {
  createLookupMap,
  createLookupSet,
  structuralLookup,
} from "./Lookup.ts";
import { installPolyfills } from "./Polyfills.ts";

installPolyfills();

describe("createLookupMap", () => {
  it("LookupMap is not assignable to native Map", () => {
    const lookupMap = createLookupMap<string, number, string>({
      lookup: (key) => key,
    });

    const takesNativeMap = (_map: Map<string, number>) => undefined;

    // LookupMap intentionally does not substitute for Map because callers may
    // rely on native Map key semantics while LookupMap uses derived lookup keys.
    // @ts-expect-error LookupMap is intentionally not substitutable for Map.
    takesNativeMap(lookupMap);
  });

  it("uses natural ids for logical equality", () => {
    interface Person {
      readonly id: string;
      readonly name: string;
    }

    const map = createLookupMap<Person, string, string>({
      lookup: (person) => person.id,
    });

    map.set({ id: "1", name: "Ada" }, "person");

    assertEqual(map.get({ id: "1", name: "Grace" }), "person");
    assertEqual(map.getKey({ id: "1", name: "Grace" }), {
      id: "1",
      name: "Ada",
    });
  });

  it("initializes from entries and preserves the first representative", () => {
    const key1 = { id: "a", name: "Ada" } as const;
    const key2 = { id: "a", name: "Grace" } as const;
    const key3 = { id: "b", name: "Linus" } as const;

    const map = createLookupMap<
      { readonly id: string; readonly name: string },
      number,
      string
    >({
      lookup: (key) => key.id,
      entries: [
        [key1, 1],
        [key2, 2],
        [key3, 3],
      ],
    });

    assertEqual(map.size, 2);
    assertTrue(map.has(key2));
    assertEqual(map.get(key2), 2);
    assertSame(map.getKey(key2), key1);
    assertEqual([...map.keys()], [key1, key3]);
    assertEqual([...map.values()], [2, 3]);
    assertEqual(
      [...map.entries()],
      [
        [key1, 2],
        [key3, 3],
      ],
    );
    assertEqual(
      [...map],
      [
        [key1, 2],
        [key3, 3],
      ],
    );

    const seen: Array<
      readonly [{ readonly id: string; readonly name: string }, number]
    > = [];
    map.forEach((value, key) => {
      seen.push([key, value]);
    });
    assertEqual(seen, [
      [key1, 2],
      [key3, 3],
    ]);

    assertFalse(map.delete({ id: "missing", name: "x" }));
    assertTrue(map.delete(key2));
    assertEqual(map.size, 1);
    map.clear();
    assertEqual(map.size, 0);
  });

  it("getOrInsert uses lookup equality and preserves the first representative", () => {
    interface Person {
      readonly id: string;
      readonly name: string;
    }

    const ada: Person = { id: "a", name: "Ada" };
    const grace: Person = { id: "a", name: "Grace" };

    const map = createLookupMap<Person, number, string>({
      lookup: (key) => key.id,
    });

    assertEqual(map.getOrInsert(ada, 1), 1);
    assertEqual(map.getOrInsert(grace, 2), 1);
    assertEqual(map.size, 1);
    assertEqual(map.get(grace), 1);
    assertSame(map.getKey(grace), ada);
  });

  it("getOrInsertComputed computes only for missing logical keys", () => {
    interface Person {
      readonly id: string;
      readonly name: string;
    }

    const ada: Person = { id: "a", name: "Ada" };
    const grace: Person = { id: "a", name: "Grace" };
    const linus: Person = { id: "b", name: "Linus" };

    const map = createLookupMap<Person, number, string>({
      lookup: (key) => key.id,
    });

    const computedForKeys: Array<string> = [];

    assertEqual(
      map.getOrInsertComputed(ada, (key) => {
        computedForKeys.push(key.name);
        return 1;
      }),
      1,
    );

    assertEqual(
      map.getOrInsertComputed(grace, (key) => {
        computedForKeys.push(key.name);
        return 2;
      }),
      1,
    );

    assertEqual(
      map.getOrInsertComputed(linus, (key) => {
        computedForKeys.push(key.name);
        return 3;
      }),
      3,
    );

    assertEqual(computedForKeys, ["Ada", "Linus"]);
    assertSame(map.getKey(grace), ada);
    assertEqual(map.get(grace), 1);
    assertEqual(map.get(linus), 3);
  });
});

describe("createLookupSet", () => {
  it("LookupSet is not assignable to native Set", () => {
    const lookupSet = createLookupSet<string, string>({
      lookup: (key) => key,
    });

    const takesNativeSet = (_set: Set<string>) => undefined;

    // LookupSet intentionally does not substitute for Set because callers may
    // rely on native Set value semantics while LookupSet uses derived lookup keys.
    // @ts-expect-error LookupSet is intentionally not substitutable for Set.
    takesNativeSet(lookupSet);
  });

  it("uses natural ids and supports iteration helpers", () => {
    const key1 = { id: "a", name: "Ada" } as const;
    const key2 = { id: "a", name: "Grace" } as const;
    const key3 = { id: "b", name: "Linus" } as const;

    const set = createLookupSet<
      { readonly id: string; readonly name: string },
      string
    >({
      lookup: (key) => key.id,
      values: [key1, key2, key3],
    });

    assertEqual(set.size, 2);
    assertTrue(set.has(key2));
    assertSame(set.get(key2), key1);
    assertEqual([...set.keys()], [key1, key3]);
    assertEqual([...set.values()], [key1, key3]);
    assertEqual(
      [...set.entries()],
      [
        [key1, key1],
        [key3, key3],
      ],
    );
    assertEqual([...set], [key1, key3]);

    const seen: Array<
      readonly [
        { readonly id: string; readonly name: string },
        { readonly id: string; readonly name: string },
      ]
    > = [];
    set.forEach((value, key) => {
      seen.push([key, value]);
    });
    assertEqual(seen, [
      [key1, key1],
      [key3, key3],
    ]);

    assertFalse(set.delete({ id: "missing", name: "x" }));
    assertTrue(set.delete(key2));
    assertEqual(set.size, 1);
    set.clear();
    assertEqual(set.size, 0);
  });
});

describe("structuralLookup", () => {
  it("serializes primitives with tagged JSON-like semantics", () => {
    assertEqual(structuralLookup("a"), 's:"a"');
    assertEqual(structuralLookup(1), "n:1");
    assertEqual(structuralLookup(0), "n:0");
    assertEqual(structuralLookup(-0), "n:-0");
    assertEqual(structuralLookup(NaN), "n:NaN");
    assertEqual(structuralLookup(Number.POSITIVE_INFINITY), "n:Infinity");
    assertEqual(structuralLookup(Number.NEGATIVE_INFINITY), "n:-Infinity");
    assertEqual(structuralLookup(true), "b:true");
    assertEqual(structuralLookup(false), "b:false");
    assertEqual(structuralLookup(null), "l:null");
  });

  it("distinguishes signed zero through a Map-backed lookup", () => {
    const map = createLookupMap<number, string, string>({
      lookup: structuralLookup,
    });

    map.set(0, "positive");
    map.set(-0, "negative");

    assertEqual(map.size, 2);
    assertEqual(map.get(0), "positive");
    assertEqual(map.get(-0), "negative");
  });

  it("serializes arrays, objects, Uint8Array, and null-prototype objects", () => {
    assertEqual(
      structuralLookup(["a", { count: 1 }]),
      'a:[s:"a",o:{"count":n:1}]',
    );
    assertEqual(
      structuralLookup({ nested: { enabled: true }, id: "a" }),
      'o:{"id":s:"a","nested":o:{"enabled":b:true}}',
    );
    assertEqual(structuralLookup(new Uint8Array([1, 2, 3])), "u:AQID");

    const nullPrototype = Object.assign(Object.create(null), { id: "a" }) as {
      readonly id: string;
    };
    assertEqual(structuralLookup(nullPrototype), 'o:{"id":s:"a"}');
  });

  it("memoizes by object identity", () => {
    let accessCount = 0;
    const key = Object.defineProperty({}, "id", {
      enumerable: true,
      get: () => {
        accessCount += 1;
        return "a";
      },
    }) as { readonly id: string };

    assertEqual(structuralLookup(key), 'o:{"id":s:"a"}');
    assertEqual(structuralLookup(key), 'o:{"id":s:"a"}');
    assertEqual(accessCount, 1);
  });

  it("rejects symbol-keyed properties at compile time", () => {
    const symbolKey = Symbol("meta");
    const key = { id: "a", [symbolKey]: "x" };

    // @ts-expect-error - symbol-keyed properties are ignored by runtime serialization.
    structuralLookup(key);
  });

  it("rejects unsupported values and cycles", () => {
    class Example {
      readonly id = "a";
    }

    const cyclicObject: Record<string, unknown> = { id: "a" };
    cyclicObject.self = cyclicObject;

    const cyclicArray: Array<unknown> = [];
    cyclicArray.push(cyclicArray);

    const undefinedError = assertThrowsInstanceOf(
      () => structuralLookup(undefined as never),
      Error,
    );
    assertTrue(
      undefinedError.message.includes(
        "Structural lookup keys must be JSON-like values or Uint8Array.",
      ),
    );
    const functionError = assertThrowsInstanceOf(
      () => structuralLookup((() => undefined) as never),
      Error,
    );
    assertTrue(
      functionError.message.includes(
        "Structural lookup keys must be JSON-like values or Uint8Array.",
      ),
    );
    const symbolError = assertThrowsInstanceOf(
      () => structuralLookup(Symbol("x") as never),
      Error,
    );
    assertTrue(
      symbolError.message.includes(
        "Structural lookup keys must be JSON-like values or Uint8Array.",
      ),
    );
    const bigintError = assertThrowsInstanceOf(
      () => structuralLookup(10n as never),
      Error,
    );
    assertTrue(
      bigintError.message.includes(
        "Structural lookup keys must be JSON-like values or Uint8Array.",
      ),
    );
    const dateError = assertThrowsInstanceOf(
      () => structuralLookup(new Date() as never),
      Error,
    );
    assertTrue(
      dateError.message.includes(
        "Structural lookup keys must be JSON-like values or Uint8Array.",
      ),
    );
    const instanceError = assertThrowsInstanceOf(
      () => structuralLookup(new Example() as never),
      Error,
    );
    assertTrue(
      instanceError.message.includes(
        "Structural lookup keys must be JSON-like values or Uint8Array.",
      ),
    );
    const arrayError = assertThrowsInstanceOf(
      () => structuralLookup(["a", undefined] as never),
      Error,
    );
    assertTrue(
      arrayError.message.includes(
        "Structural lookup keys must be JSON-like values or Uint8Array.",
      ),
    );
    const mutableArrayError = assertThrowsInstanceOf(
      () => structuralLookup(createMutableArray(1) as never),
      Error,
    );
    assertTrue(
      mutableArrayError.message.includes(
        "Structural lookup keys must be JSON-like values or Uint8Array.",
      ),
    );
    const objectError = assertThrowsInstanceOf(
      () => structuralLookup({ id: "a", optional: undefined } as never),
      Error,
    );
    assertTrue(
      objectError.message.includes(
        "Structural lookup keys must be JSON-like values or Uint8Array.",
      ),
    );
    const cyclicObjectError = assertThrowsInstanceOf(
      () => structuralLookup(cyclicObject as never),
      Error,
    );
    assertTrue(
      cyclicObjectError.message.includes(
        "Structural lookup keys must not contain cycles.",
      ),
    );
    const cyclicArrayError = assertThrowsInstanceOf(
      () => structuralLookup(cyclicArray as never),
      Error,
    );
    assertTrue(
      cyclicArrayError.message.includes(
        "Structural lookup keys must not contain cycles.",
      ),
    );
  });
});
