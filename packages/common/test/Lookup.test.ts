import { describe, expect, test } from "vitest";
import {
  createLookupMap,
  createLookupSet,
  structuralLookup,
} from "../src/Lookup.js";

describe("createLookupMap", () => {
  test("LookupMap is not assignable to native Map", () => {
    const lookupMap = createLookupMap<string, number, string>({
      lookup: (key) => key,
    });

    const takesNativeMap = (_map: Map<string, number>) => undefined;

    // LookupMap intentionally does not substitute for Map because callers may
    // rely on native Map key semantics while LookupMap uses derived lookup keys.
    // @ts-expect-error LookupMap is intentionally not substitutable for Map.
    takesNativeMap(lookupMap);
  });

  test("uses natural ids for logical equality", () => {
    interface Person {
      readonly id: string;
      readonly name: string;
    }

    const map = createLookupMap<Person, string, string>({
      lookup: (person) => person.id,
    });

    map.set({ id: "1", name: "Ada" }, "person");

    expect(map.get({ id: "1", name: "Grace" })).toBe("person");
    expect(map.getKey({ id: "1", name: "Grace" })).toEqual({
      id: "1",
      name: "Ada",
    });
  });

  test("initializes from entries and preserves the first representative", () => {
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

    expect(map.size).toBe(2);
    expect(map.has(key2)).toBe(true);
    expect(map.get(key2)).toBe(2);
    expect(map.getKey(key2)).toBe(key1);
    expect([...map.keys()]).toEqual([key1, key3]);
    expect([...map.values()]).toEqual([2, 3]);
    expect([...map.entries()]).toEqual([
      [key1, 2],
      [key3, 3],
    ]);
    expect([...map]).toEqual([
      [key1, 2],
      [key3, 3],
    ]);

    const seen: Array<
      readonly [{ readonly id: string; readonly name: string }, number]
    > = [];
    map.forEach((value, key) => {
      seen.push([key, value]);
    });
    expect(seen).toEqual([
      [key1, 2],
      [key3, 3],
    ]);

    expect(map.delete({ id: "missing", name: "x" })).toBe(false);
    expect(map.delete(key2)).toBe(true);
    expect(map.size).toBe(1);
    map.clear();
    expect(map.size).toBe(0);
  });
});

describe("createLookupSet", () => {
  test("LookupSet is not assignable to native Set", () => {
    const lookupSet = createLookupSet<string, string>({
      lookup: (key) => key,
    });

    const takesNativeSet = (_set: Set<string>) => undefined;

    // LookupSet intentionally does not substitute for Set because callers may
    // rely on native Set value semantics while LookupSet uses derived lookup keys.
    // @ts-expect-error LookupSet is intentionally not substitutable for Set.
    takesNativeSet(lookupSet);
  });

  test("uses natural ids and supports iteration helpers", () => {
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

    expect(set.size).toBe(2);
    expect(set.has(key2)).toBe(true);
    expect(set.get(key2)).toBe(key1);
    expect([...set.keys()]).toEqual([key1, key3]);
    expect([...set.values()]).toEqual([key1, key3]);
    expect([...set.entries()]).toEqual([
      [key1, key1],
      [key3, key3],
    ]);
    expect([...set]).toEqual([key1, key3]);

    const seen: Array<
      readonly [
        { readonly id: string; readonly name: string },
        { readonly id: string; readonly name: string },
      ]
    > = [];
    set.forEach((value, key) => {
      seen.push([key, value]);
    });
    expect(seen).toEqual([
      [key1, key1],
      [key3, key3],
    ]);

    expect(set.delete({ id: "missing", name: "x" })).toBe(false);
    expect(set.delete(key2)).toBe(true);
    expect(set.size).toBe(1);
    set.clear();
    expect(set.size).toBe(0);
  });
});

describe("structuralLookup", () => {
  test("serializes primitives with tagged JSON-like semantics", () => {
    expect(structuralLookup("a")).toBe('s:"a"');
    expect(structuralLookup(1)).toBe("n:1");
    expect(structuralLookup(-0)).toBe("n:0");
    expect(structuralLookup(NaN)).toBe("n:NaN");
    expect(structuralLookup(Number.POSITIVE_INFINITY)).toBe("n:Infinity");
    expect(structuralLookup(Number.NEGATIVE_INFINITY)).toBe("n:-Infinity");
    expect(structuralLookup(true)).toBe("b:true");
    expect(structuralLookup(false)).toBe("b:false");
    expect(structuralLookup(null)).toBe("l:null");
  });

  test("serializes arrays, objects, Uint8Array, and null-prototype objects", () => {
    expect(structuralLookup(["a", { count: 1 }])).toBe(
      'a:[s:"a",o:{"count":n:1}]',
    );
    expect(structuralLookup({ nested: { enabled: true }, id: "a" })).toBe(
      'o:{"id":s:"a","nested":o:{"enabled":b:true}}',
    );
    expect(structuralLookup(new Uint8Array([1, 2, 3]))).toBe("u:AQID");

    const nullPrototype = Object.assign(Object.create(null), { id: "a" }) as {
      readonly id: string;
    };
    expect(structuralLookup(nullPrototype)).toBe('o:{"id":s:"a"}');
  });

  test("memoizes by object identity", () => {
    let accessCount = 0;
    const key = Object.defineProperty({}, "id", {
      enumerable: true,
      get: () => {
        accessCount += 1;
        return "a";
      },
    }) as { readonly id: string };

    expect(structuralLookup(key)).toBe('o:{"id":s:"a"}');
    expect(structuralLookup(key)).toBe('o:{"id":s:"a"}');
    expect(accessCount).toBe(1);
  });

  test("rejects unsupported values and cycles", () => {
    class Example {
      readonly id = "a";
    }

    const cyclicObject: Record<string, unknown> = { id: "a" };
    cyclicObject.self = cyclicObject;

    const cyclicArray: Array<unknown> = [];
    cyclicArray.push(cyclicArray);

    expect(() => structuralLookup(undefined as never)).toThrow(
      "Structural lookup keys must be JSON-like values or Uint8Array.",
    );
    expect(() => structuralLookup((() => undefined) as never)).toThrow(
      "Structural lookup keys must be JSON-like values or Uint8Array.",
    );
    expect(() => structuralLookup(Symbol("x") as never)).toThrow(
      "Structural lookup keys must be JSON-like values or Uint8Array.",
    );
    expect(() => structuralLookup(10n as never)).toThrow(
      "Structural lookup keys must be JSON-like values or Uint8Array.",
    );
    expect(() => structuralLookup(new Date() as never)).toThrow(
      "Structural lookup keys must be JSON-like values or Uint8Array.",
    );
    expect(() => structuralLookup(new Example() as never)).toThrow(
      "Structural lookup keys must be JSON-like values or Uint8Array.",
    );
    expect(() => structuralLookup(["a", undefined] as never)).toThrow(
      "Structural lookup keys must be JSON-like values or Uint8Array.",
    );
    expect(() => structuralLookup(Array(1) as never)).toThrow(
      "Structural lookup keys must be JSON-like values or Uint8Array.",
    );
    expect(() =>
      structuralLookup({ id: "a", optional: undefined } as never),
    ).toThrow("Structural lookup keys must be JSON-like values or Uint8Array.");
    expect(() => structuralLookup(cyclicObject as never)).toThrow(
      "Structural lookup keys must not contain cycles.",
    );
    expect(() => structuralLookup(cyclicArray as never)).toThrow(
      "Structural lookup keys must not contain cycles.",
    );
  });
});
