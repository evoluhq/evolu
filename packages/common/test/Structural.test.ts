import { describe, expect, test } from "vitest";
import {
  createStructuralMap,
  createStructuralRelation,
  createStructuralSet,
} from "../src/Structural.js";

interface Person {
  readonly name: string;
}

interface PersonWithMethod {
  readonly name: string;
  readonly save: () => void;
}

describe("StructuralMap", () => {
  test("types accept interface keys and reject methods", () => {
    const map = createStructuralMap<Person, string>();
    const person: Person = { name: "Ada" };
    const personKey: Parameters<typeof map.set>[0] = person;

    map.set(personKey, "value");
    expect(personKey).toEqual(person);

    const _invalidMap = createStructuralMap<PersonWithMethod, string>();

    const _invalidKey: Parameters<typeof _invalidMap.set>[0] = {
      name: "Ada",
      // @ts-expect-error methods are not structural
      save: () => undefined,
    };
  });

  test("initializes from entries", () => {
    const key1 = { id: "a" } as const;
    const key2 = { id: "a" } as const;
    const key3 = { id: "b" } as const;

    const map = createStructuralMap<{ readonly id: string }, number>([
      [key1, 1],
      [key2, 2],
      [key3, 3],
    ]);

    expect(map.size).toBe(2);
    expect(map.get(key2)).toBe(2);
    expect(map.getKey(key2)).toBe(key1);
    expect([...map.keys()]).toEqual([key1, key3]);
  });

  test("stores and retrieves primitive keys", () => {
    const map = createStructuralMap<number | string | boolean | null, string>();

    map.set("x", "string");
    map.set(1, "number");
    map.set(true, "boolean");
    map.set(false, "boolean-false");
    map.set(null, "null");

    expect(map.size).toBe(5);
    expect(map.get("x")).toBe("string");
    expect(map.get(1)).toBe("number");
    expect(map.get(true)).toBe("boolean");
    expect(map.get(false)).toBe("boolean-false");
    expect(map.get(null)).toBe("null");
    expect(map.has("missing")).toBe(false);
    expect(map.delete("missing")).toBe(false);
  });

  test("treats equal numbers with JSON-like semantics", () => {
    const map = createStructuralMap<number, string>();

    map.set(-0, "zero");
    map.set(NaN, "nan");
    map.set(Number.POSITIVE_INFINITY, "infinity");
    map.set(Number.NEGATIVE_INFINITY, "negative-infinity");

    expect(map.get(0)).toBe("zero");
    expect(map.get(-0)).toBe("zero");
    expect(map.get(NaN)).toBe("nan");
    expect(map.get(Number.POSITIVE_INFINITY)).toBe("infinity");
    expect(map.get(Number.NEGATIVE_INFINITY)).toBe("negative-infinity");
  });

  test("shares entries for structurally equal object keys", () => {
    const map = createStructuralMap<
      { readonly id: string; readonly nested: { readonly enabled: boolean } },
      string
    >();

    map.set({ id: "a", nested: { enabled: true } }, "value");

    expect(map.get({ nested: { enabled: true }, id: "a" })).toBe("value");
    expect(map.size).toBe(1);
  });

  test("shares entries for structurally equal array keys", () => {
    const map = createStructuralMap<
      readonly [string, { readonly count: number }],
      string
    >();

    map.set(["a", { count: 1 }], "value");

    expect(map.get(["a", { count: 1 }])).toBe("value");
    expect(map.has(["a", { count: 2 }])).toBe(false);
  });

  test("shares entries for equal Uint8Array keys", () => {
    const map = createStructuralMap<Uint8Array, string>();

    map.set(new Uint8Array([1, 2, 3]), "value");

    expect(map.get(new Uint8Array([1, 2, 3]))).toBe("value");
    expect(map.has(new Uint8Array([1, 2, 4]))).toBe(false);
    expect(map.size).toBe(1);
  });

  test("shares entries for structurally equal keys containing Uint8Array", () => {
    const map = createStructuralMap<
      {
        readonly id: string;
        readonly bytes: Uint8Array;
      },
      string
    >();

    map.set({ id: "a", bytes: new Uint8Array([1, 2, 3]) }, "value");

    expect(map.get({ bytes: new Uint8Array([1, 2, 3]), id: "a" })).toBe(
      "value",
    );
    expect(
      map.get({ bytes: new Uint8Array([1, 2, 4]), id: "a" }),
    ).toBeUndefined();
  });

  test("supports iteration and forEach", () => {
    const map = createStructuralMap<string | { readonly id: string }, number>();

    map.set("a", 1);
    map.set({ id: "b" }, 2);

    expect(Array.from(map.keys())).toEqual(["a", { id: "b" }]);
    expect(Array.from(map.values())).toEqual([1, 2]);
    expect(Array.from(map.entries())).toEqual([
      ["a", 1],
      [{ id: "b" }, 2],
    ]);
    expect(Array.from(map)).toEqual([
      ["a", 1],
      [{ id: "b" }, 2],
    ]);

    const entries: Array<readonly [string | { readonly id: string }, number]> =
      [];
    map.forEach((value, key) => {
      entries.push([key, value]);
    });

    expect(entries).toEqual([
      ["a", 1],
      [{ id: "b" }, 2],
    ]);
  });

  test("deletes and clears entries using structural equality", () => {
    const map = createStructuralMap<{ readonly id: string }, string>();

    map.set({ id: "a" }, "value");

    expect(map.delete({ id: "a" })).toBe(true);
    expect(map.size).toBe(0);

    map.set({ id: "b" }, "next");
    map.clear();

    expect(map.size).toBe(0);
    expect(map.get({ id: "b" })).toBeUndefined();
  });

  test("reuses cached structural ids for repeated object lookups", () => {
    const map = createStructuralMap<{ readonly id: string }, string>();
    const key = { id: "a" } as const;

    map.set(key, "value");

    expect(map.get(key)).toBe("value");
    expect(map.has(key)).toBe(true);
  });

  test("preserves the first inserted canonical key for structural overwrites", () => {
    const map = createStructuralMap<{ readonly id: string }, number>();
    const key1 = { id: "a" } as const;
    const key2 = { id: "a" } as const;

    map.set(key1, 1);
    map.set(key2, 2);

    expect(map.get(key2)).toBe(2);
    expect(map.getKey(key2)).toBe(key1);
    expect([...map.keys()]).toEqual([key1]);
  });

  test("rejects undefined values in arrays and objects", () => {
    const map = createStructuralMap<{ readonly id: string }, string>();

    expect(() => map.set(["a", undefined] as never, "value")).toThrow(
      "Structural keys must be JSON-like values or Uint8Array.",
    );
    expect(() =>
      map.set({ id: "a", optional: undefined } as never, "value"),
    ).toThrow("Structural keys must be JSON-like values or Uint8Array.");
  });

  test("rejects sparse array keys", () => {
    const map = createStructuralMap<readonly [string], string>();

    expect(() => map.set(Array(1) as never, "value")).toThrow(
      "Structural keys must be JSON-like values or Uint8Array.",
    );
  });

  test("rejects cyclic keys", () => {
    const map = createStructuralMap<string, string>();
    const key: Record<string, unknown> = { id: "a" };
    key.self = key;

    expect(() => map.set(key as never, "value")).toThrow(
      "Structural keys must not contain cycles.",
    );
  });

  test("supports null-prototype object keys", () => {
    const map = createStructuralMap<{ readonly id: string }, string>();
    const key = Object.assign(Object.create(null), { id: "a" }) as {
      readonly id: string;
    };

    map.set(key, "value");

    expect(map.get({ id: "a" })).toBe("value");
  });

  test("rejects keys outside JSON-like values and Uint8Array", () => {
    const map = createStructuralMap<string, string>();

    class Example {
      readonly id = "a";
    }

    expect(() => map.set((() => undefined) as never, "value")).toThrow(
      "Structural keys must be JSON-like values or Uint8Array.",
    );
    expect(() => map.set(new Date() as never, "value")).toThrow(
      "Structural keys must be JSON-like values or Uint8Array.",
    );
    expect(() => map.set(new Example() as never, "value")).toThrow(
      "Structural keys must be JSON-like values or Uint8Array.",
    );
  });

  test("rejects top-level undefined keys", () => {
    const map = createStructuralMap<string, string>();

    expect(() => map.set(undefined as never, "value")).toThrow(
      "Structural keys must be JSON-like values or Uint8Array.",
    );
  });
});

describe("StructuralSet", () => {
  test("initializes from values", () => {
    const key1 = { id: "a" } as const;
    const key2 = { id: "a" } as const;
    const key3 = { id: "b" } as const;

    const set = createStructuralSet([{ id: "a" }, key2, key3]);

    expect(set.size).toBe(2);
    expect(set.has(key1)).toBe(true);
    expect(set.get(key2)).toEqual({ id: "a" });
    expect([...set]).toEqual([{ id: "a" }, key3]);
  });

  test("returns the first inserted canonical representative", () => {
    const set = createStructuralSet<{ readonly id: string }>();
    const key1 = { id: "a" } as const;
    const key2 = { id: "a" } as const;

    set.add(key1);
    set.add(key2);

    expect(set.size).toBe(1);
    expect(set.get(key2)).toBe(key1);
    expect([...set]).toEqual([key1]);
    expect([...set.keys()]).toEqual([key1]);
    expect([...set.values()]).toEqual([key1]);
    expect([...set.entries()]).toEqual([[key1, key1]]);

    const seen: Array<
      readonly [{ readonly id: string }, { readonly id: string }]
    > = [];
    set.forEach((value, key) => {
      seen.push([value, key]);
    });

    expect(seen).toEqual([[key1, key1]]);
  });

  test("deletes and clears values structurally", () => {
    const set = createStructuralSet<Uint8Array>();

    set.add(new Uint8Array([1, 2, 3]));

    expect(set.delete(new Uint8Array([1, 2, 3]))).toBe(true);
    expect(set.size).toBe(0);
    expect(set.delete(new Uint8Array([1, 2, 3]))).toBe(false);

    set.add(new Uint8Array([4, 5, 6]));
    set.clear();

    expect(set.size).toBe(0);
    expect(set.has(new Uint8Array([4, 5, 6]))).toBe(false);
  });
});

describe("StructuralRelation", () => {
  test("adds pairs and iterates structurally in both directions", () => {
    const relation = createStructuralRelation<
      { readonly ownerId: string },
      { readonly type: string; readonly url: string }
    >();

    relation.add({ ownerId: "a" }, { type: "WebSocket", url: "ws://1" });
    relation.add({ ownerId: "a" }, { type: "WebSocket", url: "ws://2" });
    relation.add({ ownerId: "b" }, { type: "WebSocket", url: "ws://2" });

    expect([
      ...relation.iterateA({ url: "ws://1", type: "WebSocket" }),
    ]).toEqual([{ ownerId: "a" }]);
    expect([
      ...relation.iterateA({ url: "ws://2", type: "WebSocket" }),
    ]).toEqual([{ ownerId: "a" }, { ownerId: "b" }]);
    expect([
      ...relation.iterateA({ type: "WebSocket", url: "ws://3" }),
    ]).toEqual([]);

    expect([...relation.iterateB({ ownerId: "a" })]).toEqual([
      { type: "WebSocket", url: "ws://1" },
      { type: "WebSocket", url: "ws://2" },
    ]);
    expect([...relation.iterateB({ ownerId: "b" })]).toEqual([
      { type: "WebSocket", url: "ws://2" },
    ]);
    expect([...relation.iterateB({ ownerId: "c" })]).toEqual([]);
  });

  test("deduplicates structurally equal adds", () => {
    const relation = createStructuralRelation<
      { readonly ownerId: string },
      { readonly type: string; readonly url: string }
    >();

    expect(
      relation.add({ ownerId: "a" }, { type: "WebSocket", url: "ws://1" }),
    ).toBe(true);
    expect(
      relation.add({ ownerId: "a" }, { url: "ws://1", type: "WebSocket" }),
    ).toBe(false);

    expect(relation.size()).toBe(1);
    expect(relation.bCountForA({ ownerId: "a" })).toBe(1);
    expect(relation.aCountForB({ url: "ws://1", type: "WebSocket" })).toBe(1);
  });

  test("has, hasA, and hasB use structural equality", () => {
    const relation = createStructuralRelation<
      { readonly ownerId: string },
      { readonly type: string; readonly url: string }
    >();

    relation.add({ ownerId: "a" }, { type: "WebSocket", url: "ws://1" });
    relation.add({ ownerId: "b" }, { type: "WebSocket", url: "ws://2" });

    expect(
      relation.has({ ownerId: "a" }, { url: "ws://1", type: "WebSocket" }),
    ).toBe(true);
    expect(
      relation.has({ ownerId: "a" }, { type: "WebSocket", url: "ws://2" }),
    ).toBe(false);
    expect(
      relation.has(
        { ownerId: "missing" },
        { type: "WebSocket", url: "ws://1" },
      ),
    ).toBe(false);
    expect(relation.hasA({ ownerId: "b" })).toBe(true);
    expect(relation.hasA({ ownerId: "c" })).toBe(false);
    expect(relation.hasB({ url: "ws://1", type: "WebSocket" })).toBe(true);
    expect(relation.hasB({ url: "ws://3", type: "WebSocket" })).toBe(false);
  });

  test("remove deletes an existing structural pair", () => {
    const relation = createStructuralRelation<
      { readonly ownerId: string },
      { readonly type: string; readonly url: string }
    >();

    relation.add({ ownerId: "a" }, { type: "WebSocket", url: "ws://1" });
    relation.add({ ownerId: "a" }, { type: "WebSocket", url: "ws://2" });
    relation.add({ ownerId: "b" }, { type: "WebSocket", url: "ws://2" });

    expect(
      relation.remove({ ownerId: "a" }, { url: "ws://1", type: "WebSocket" }),
    ).toBe(true);
    expect(
      relation.has({ ownerId: "a" }, { type: "WebSocket", url: "ws://1" }),
    ).toBe(false);
    expect(relation.hasA({ ownerId: "a" })).toBe(true);
    expect(relation.hasB({ type: "WebSocket", url: "ws://1" })).toBe(false);
  });

  test("remove keeps the opposite side when another structural pair still exists", () => {
    const relation = createStructuralRelation<
      { readonly ownerId: string },
      { readonly type: string; readonly url: string }
    >();

    relation.add({ ownerId: "a" }, { type: "WebSocket", url: "ws://2" });
    relation.add({ ownerId: "b" }, { type: "WebSocket", url: "ws://2" });

    expect(
      relation.remove({ ownerId: "b" }, { url: "ws://2", type: "WebSocket" }),
    ).toBe(true);
    expect(relation.hasA({ ownerId: "b" })).toBe(false);
    expect(relation.hasB({ type: "WebSocket", url: "ws://2" })).toBe(true);
    expect([
      ...relation.iterateA({ type: "WebSocket", url: "ws://2" }),
    ]).toEqual([{ ownerId: "a" }]);
  });

  test("remove returns false for missing structural pairs", () => {
    const relation = createStructuralRelation<
      { readonly ownerId: string },
      { readonly type: string; readonly url: string }
    >();

    expect(
      relation.remove({ ownerId: "a" }, { type: "WebSocket", url: "ws://1" }),
    ).toBe(false);
  });

  test("removeByA removes all related pairs structurally", () => {
    const relation = createStructuralRelation<
      { readonly ownerId: string },
      { readonly type: string; readonly url: string }
    >();

    relation.add({ ownerId: "a" }, { type: "WebSocket", url: "ws://1" });
    relation.add({ ownerId: "a" }, { type: "WebSocket", url: "ws://2" });
    relation.add({ ownerId: "b" }, { type: "WebSocket", url: "ws://2" });
    relation.add({ ownerId: "c" }, { type: "WebSocket", url: "ws://3" });

    expect(relation.removeByA({ ownerId: "a" })).toBe(true);
    expect(relation.hasA({ ownerId: "a" })).toBe(false);
    expect(relation.hasB({ type: "WebSocket", url: "ws://1" })).toBe(false);
    expect(relation.hasB({ type: "WebSocket", url: "ws://2" })).toBe(true);
    expect([
      ...relation.iterateA({ type: "WebSocket", url: "ws://2" }),
    ]).toEqual([{ ownerId: "b" }]);
    expect(relation.removeByA({ ownerId: "missing" })).toBe(false);
  });

  test("removeByB removes all related pairs structurally", () => {
    const relation = createStructuralRelation<
      { readonly ownerId: string },
      { readonly type: string; readonly url: string }
    >();

    relation.add({ ownerId: "a" }, { type: "WebSocket", url: "ws://1" });
    relation.add({ ownerId: "b" }, { type: "WebSocket", url: "ws://1" });
    relation.add({ ownerId: "b" }, { type: "WebSocket", url: "ws://2" });

    expect(relation.removeByB({ url: "ws://1", type: "WebSocket" })).toBe(true);
    expect(relation.hasB({ type: "WebSocket", url: "ws://1" })).toBe(false);
    expect(relation.hasA({ ownerId: "a" })).toBe(false);
    expect(relation.hasA({ ownerId: "b" })).toBe(true);
    expect([...relation.iterateB({ ownerId: "b" })]).toEqual([
      { type: "WebSocket", url: "ws://2" },
    ]);
    expect(relation.removeByB({ type: "WebSocket", url: "ws://missing" })).toBe(
      false,
    );
  });

  test("iterator yields structural pairs using canonical inserted values", () => {
    const relation = createStructuralRelation<
      { readonly ownerId: string },
      { readonly type: string; readonly url: string }
    >();

    relation.add({ ownerId: "a" }, { type: "WebSocket", url: "ws://1" });
    relation.add({ ownerId: "a" }, { type: "WebSocket", url: "ws://2" });
    relation.add({ ownerId: "b" }, { type: "WebSocket", url: "ws://2" });

    expect([...relation]).toEqual([
      [{ ownerId: "a" }, { type: "WebSocket", url: "ws://1" }],
      [{ ownerId: "a" }, { type: "WebSocket", url: "ws://2" }],
      [{ ownerId: "b" }, { type: "WebSocket", url: "ws://2" }],
    ]);
  });

  test("iterateA uses the same canonical A instance as the relation iterator", () => {
    const relation = createStructuralRelation<
      { readonly ownerId: string },
      { readonly type: string; readonly url: string }
    >();
    const a1 = { ownerId: "a" } as const;
    const a2 = { ownerId: "a" } as const;
    const b1 = { type: "WebSocket", url: "ws://1" } as const;
    const b2 = { type: "WebSocket", url: "ws://2" } as const;

    relation.add(a1, b1);
    relation.add(a2, b2);

    const iterateAResult = [...relation.iterateA(b2)][0];
    const iteratorResult = [...relation].find(([, b]) => b === b2)?.[0];

    expect(iterateAResult).toBeDefined();
    expect(iteratorResult).toBeDefined();
    expect(iterateAResult).toBe(iteratorResult);
  });

  test("iterator returns no pairs for an empty relation", () => {
    const relation = createStructuralRelation<
      { readonly ownerId: string },
      { readonly type: string; readonly url: string }
    >();

    expect([...relation]).toEqual([]);
  });

  test("counts grow and shrink with structural pairs", () => {
    const relation = createStructuralRelation<
      { readonly ownerId: string },
      { readonly type: string; readonly url: string }
    >();

    expect(relation.aCount()).toBe(0);
    expect(relation.bCount()).toBe(0);
    expect(relation.size()).toBe(0);

    relation.add({ ownerId: "a" }, { type: "WebSocket", url: "ws://1" });
    expect(relation.aCount()).toBe(1);
    expect(relation.bCount()).toBe(1);
    expect(relation.size()).toBe(1);

    relation.add({ ownerId: "a" }, { type: "WebSocket", url: "ws://2" });
    expect(relation.aCount()).toBe(1);
    expect(relation.bCount()).toBe(2);
    expect(relation.size()).toBe(2);

    relation.add({ ownerId: "b" }, { type: "WebSocket", url: "ws://2" });
    expect(relation.aCount()).toBe(2);
    expect(relation.bCount()).toBe(2);
    expect(relation.size()).toBe(3);

    relation.removeByB({ type: "WebSocket", url: "ws://2" });
    expect(relation.aCount()).toBe(1);
    expect(relation.bCount()).toBe(1);
    expect(relation.size()).toBe(1);

    relation.removeByA({ ownerId: "a" });
    expect(relation.aCount()).toBe(0);
    expect(relation.bCount()).toBe(0);
    expect(relation.size()).toBe(0);
  });

  test("directional counts return zero for missing structural keys", () => {
    const relation = createStructuralRelation<
      { readonly ownerId: string },
      { readonly type: string; readonly url: string }
    >();

    expect(relation.bCountForA({ ownerId: "missing" })).toBe(0);
    expect(
      relation.aCountForB({ type: "WebSocket", url: "ws://missing" }),
    ).toBe(0);
  });

  test("clear removes all structural pairs", () => {
    const relation = createStructuralRelation<
      { readonly ownerId: string },
      { readonly type: string; readonly url: string }
    >();

    relation.add({ ownerId: "a" }, { type: "WebSocket", url: "ws://1" });
    relation.add({ ownerId: "b" }, { type: "WebSocket", url: "ws://2" });

    relation.clear();

    expect(relation.hasA({ ownerId: "a" })).toBe(false);
    expect(relation.hasB({ type: "WebSocket", url: "ws://1" })).toBe(false);
    expect([...relation.iterateB({ ownerId: "a" })]).toEqual([]);
    expect([
      ...relation.iterateA({ type: "WebSocket", url: "ws://1" }),
    ]).toEqual([]);
    expect(relation.aCount()).toBe(0);
    expect(relation.bCount()).toBe(0);
    expect(relation.size()).toBe(0);
  });
});
