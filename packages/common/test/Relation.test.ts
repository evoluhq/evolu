import { describe, expect, expectTypeOf, test } from "vitest";
import {
  createRefCountedRelation,
  createRelation,
  type RefCountedRelation,
} from "../src/Relation.ts";
import { type NonNegativeInt, type PositiveInt } from "../src/Type.ts";

describe("Relation", () => {
  test("add and iterateA/iterateB", () => {
    const relation = createRelation<string, number>();

    relation.add("a", 1);
    relation.add("a", 2);
    relation.add("b", 2);

    expect([...relation.iterateA(1)]).toEqual(["a"]);
    expect([...relation.iterateA(2)]).toEqual(["a", "b"]);
    expect([...relation.iterateA(3)]).toEqual([]);

    expect([...relation.iterateB("a")]).toEqual([1, 2]);
    expect([...relation.iterateB("b")]).toEqual([2]);
    expect([...relation.iterateB("c")]).toEqual([]);
  });

  test("has", () => {
    const relation = createRelation<string, number>();

    relation.add("a", 1);
    relation.add("b", 2);

    expect(relation.has("a", 1)).toBe(true);
    expect(relation.has("b", 2)).toBe(true);
    expect(relation.has("a", 2)).toBe(false);
    expect(relation.has("b", 1)).toBe(false);
    expect(relation.has("c", 1)).toBe(false);
  });

  test("hasA and hasB", () => {
    const relation = createRelation<string, number>();

    relation.add("a", 1);
    relation.add("a", 2);
    relation.add("b", 2);

    expect(relation.hasA("a")).toBe(true);
    expect(relation.hasA("b")).toBe(true);
    expect(relation.hasA("c")).toBe(false);

    expect(relation.hasB(1)).toBe(true);
    expect(relation.hasB(2)).toBe(true);
    expect(relation.hasB(3)).toBe(false);
  });

  test("remove deletes an existing pair", () => {
    const relation = createRelation<string, number>();

    relation.add("a", 1);
    relation.add("a", 2);
    relation.add("b", 2);

    expect(relation.remove("a", 1)).toBe(true);
    expect(relation.has("a", 1)).toBe(false);
    expect(relation.has("a", 2)).toBe(true);
    expect(relation.has("b", 2)).toBe(true);
  });

  test("remove returns false for missing pairs", () => {
    const relation = createRelation<string, number>();

    expect(relation.remove("a", 3)).toBe(false);
    expect(relation.remove("c", 1)).toBe(false);
  });

  test("remove deletes empty side indexes", () => {
    const relation = createRelation<string, number>();

    relation.add("a", 1);
    relation.add("a", 2);
    relation.add("b", 2);

    expect(relation.remove("a", 1)).toBe(true);
    expect(relation.remove("a", 2)).toBe(true);
    expect(relation.hasA("a")).toBe(false);

    expect(relation.remove("b", 2)).toBe(true);
    expect(relation.hasB(2)).toBe(false);
  });

  test("removeByA", () => {
    const relation = createRelation<string, number>();

    relation.add("a", 1);
    relation.add("a", 2);
    relation.add("b", 2);
    relation.add("c", 3);

    expect(relation.removeByA("a")).toBe(true);
    expect(relation.hasA("a")).toBe(false);
    expect(relation.hasB(1)).toBe(false);
    expect(relation.hasB(2)).toBe(true);
    expect(relation.hasA("b")).toBe(true);

    expect(relation.removeByA("nonexistent")).toBe(false);
  });

  test("removeByB", () => {
    const relation = createRelation<string, number>();

    relation.add("a", 1);
    relation.add("a", 2);
    relation.add("b", 2);
    relation.add("c", 3);

    expect(relation.removeByB(2)).toBe(true);
    expect(relation.hasB(2)).toBe(false);
    expect(relation.hasA("a")).toBe(true);
    expect(relation.hasA("b")).toBe(false);

    expect(relation.removeByB(99)).toBe(false);
  });

  test("removeByA and removeByB remove all related pairs", () => {
    const relation = createRelation<string, number>();

    relation.add("a", 1);
    relation.add("a", 2);
    relation.add("a", 3);
    relation.add("b", 3);
    relation.add("c", 3);

    // Bulk removal mutates the same internal indexes it is iterating, so this
    // guards against implementations that accidentally skip later pairs.
    expect(relation.removeByA("a")).toBe(true);
    expect(relation.hasA("a")).toBe(false);
    expect([...relation.iterateA(1)]).toEqual([]);
    expect([...relation.iterateA(2)]).toEqual([]);
    expect([...relation.iterateA(3)]).toEqual(["b", "c"]);
    expect(relation.size()).toBe(2);

    expect(relation.removeByB(3)).toBe(true);
    expect(relation.hasB(3)).toBe(false);
    expect(relation.hasA("b")).toBe(false);
    expect(relation.hasA("c")).toBe(false);
    expect(relation.aCount()).toBe(0);
    expect(relation.bCount()).toBe(0);
    expect(relation.size()).toBe(0);
  });

  test("clear", () => {
    const relation = createRelation<string, number>();

    relation.add("a", 1);
    relation.add("b", 2);

    relation.clear();

    expect(relation.hasA("a")).toBe(false);
    expect(relation.hasA("b")).toBe(false);
    expect(relation.hasB(1)).toBe(false);
    expect(relation.hasB(2)).toBe(false);
    expect([...relation.iterateB("a")]).toEqual([]);
    expect([...relation.iterateA(1)]).toEqual([]);
    expect(relation.aCount()).toBe(0);
    expect(relation.bCount()).toBe(0);
    expect(relation.size()).toBe(0);
  });

  test("works with complex objects as A and B", () => {
    interface Person {
      name: string;
      age: number;
    }
    interface City {
      name: string;
      country: string;
    }

    const relation = createRelation<Person, City>();

    const alice = { name: "Alice", age: 30 };
    const bob = { name: "Bob", age: 25 };
    const newyork = { name: "New York", country: "USA" };
    const london = { name: "London", country: "UK" };

    relation.add(alice, newyork);
    relation.add(alice, london);
    relation.add(bob, london);

    expect(relation.has(alice, newyork)).toBe(true);
    expect(relation.has(alice, london)).toBe(true);
    expect(relation.has(bob, london)).toBe(true);
    expect(relation.has(bob, newyork)).toBe(false);

    expect(new Set(relation.iterateB(alice))).toEqual(
      new Set([newyork, london]),
    );
    expect(new Set(relation.iterateA(london))).toEqual(new Set([alice, bob]));

    expect(relation.remove(alice, newyork)).toBe(true);
    expect(relation.has(alice, newyork)).toBe(false);

    expect(relation.removeByA(alice)).toBe(true);
    expect(relation.hasA(alice)).toBe(false);
    expect(relation.has(alice, london)).toBe(false);
  });

  test("duplicate adds and return value", () => {
    const relation = createRelation<string, number>();
    expect(relation.add("a", 1)).toBe(true); // new
    expect(relation.add("a", 1)).toBe(false); // duplicate
    expect(relation.add("a", 2)).toBe(true); // new B for existing A
    expect(relation.add("b", 2)).toBe(true); // new A referencing existing B
    expect(relation.bCountForA("a")).toBe(2);
    expect(relation.aCountForB(1)).toBe(1);
    expect(relation.aCountForB(2)).toBe(2);
  });

  test("directional counts return zero for missing keys", () => {
    const relation = createRelation<string, number>();

    expect(relation.bCountForA("missing")).toBe(0);
    expect(relation.aCountForB(99)).toBe(0);
  });

  test("iterator yields pairs", () => {
    const relation = createRelation<string, number>();
    relation.add("a", 1);
    relation.add("a", 2);
    relation.add("b", 2);
    const pairs = [...relation];
    expect(pairs).toEqual([
      ["a", 1],
      ["a", 2],
      ["b", 2],
    ]);
  });

  test("counts grow when adding new pairs", () => {
    const relation = createRelation<string, number>();

    expect(relation.aCount()).toBe(0);
    expect(relation.bCount()).toBe(0);
    expect(relation.size()).toBe(0);

    relation.add("a", 1);
    expect(relation.aCount()).toBe(1);
    expect(relation.bCount()).toBe(1);
    expect(relation.size()).toBe(1);

    relation.add("a", 2);
    expect(relation.aCount()).toBe(1);
    expect(relation.bCount()).toBe(2);
    expect(relation.size()).toBe(2);

    relation.add("b", 2);
    expect(relation.aCount()).toBe(2);
    expect(relation.bCount()).toBe(2);
    expect(relation.size()).toBe(3);

    relation.add("b", 2);
    expect(relation.size()).toBe(3);
  });

  test("counts shrink when removing pairs", () => {
    const relation = createRelation<string, number>();

    relation.add("a", 1);
    relation.add("a", 2);
    relation.add("b", 2);

    relation.remove("a", 1);
    expect(relation.size()).toBe(2);

    relation.removeByA("b");
    expect(relation.size()).toBe(1);

    relation.removeByB(2);
    expect(relation.size()).toBe(0);
    expect(relation.aCount()).toBe(0);
    expect(relation.bCount()).toBe(0);
  });

  test("supports custom lookup functions with typed keys", () => {
    const uint8ArrayLookup = (bytes: Uint8Array): string =>
      JSON.stringify(Array.from(bytes));

    const relation = createRelation({
      lookupA: uint8ArrayLookup,
      lookupB: uint8ArrayLookup,
    });

    const a1 = new Uint8Array([1, 2, 3]);
    const a2 = new Uint8Array([1, 2, 3]);
    const b1 = new Uint8Array([4, 5, 6]);
    const b2 = new Uint8Array([4, 5, 6]);

    expect(relation.add(a1, b1)).toBe(true);
    expect(relation.add(a2, b2)).toBe(false);
    expect(relation.has(a2, b2)).toBe(true);
    expect([...relation.iterateB(a2)]).toEqual([b1]);
    expect([...relation.iterateA(b2)]).toEqual([a1]);

    // @ts-expect-error custom lookup restricts A to Uint8Array
    relation.add("a", b1);
    // @ts-expect-error custom lookup restricts B to Uint8Array
    relation.add(a1, "b");
  });
});

describe("RefCountedRelation", () => {
  test("types expose canonical changes with precise count types", () => {
    const relation = createRefCountedRelation<string, number>();

    expectTypeOf(relation).toEqualTypeOf<RefCountedRelation<string, number>>();
    expectTypeOf(relation.increment("a", 1).count).toEqualTypeOf<PositiveInt>();
    expectTypeOf(
      relation.decrement("a", 1).count,
    ).toEqualTypeOf<NonNegativeInt>();
  });

  test("increments and decrements pair counts while indexing both directions", () => {
    const relation = createRefCountedRelation<string, number>();

    expect(relation.increment("a", 1)).toEqual({ a: "a", b: 1, count: 1 });
    expect(relation.increment("a", 1)).toEqual({ a: "a", b: 1, count: 2 });
    relation.increment("a", 2);
    relation.increment("b", 2);

    expect(relation.getCount("a", 1)).toBe(2);
    expect(relation.getCount("missing", 1)).toBe(0);
    expect(relation.getCount("a", 3)).toBe(0);
    expect(relation.getAs(2)).toEqual(["a", "b"]);
    expect(relation.getAs(3)).toEqual([]);
    expect(relation.getBs("a")).toEqual([1, 2]);
    expect(relation.getBs("missing")).toEqual([]);
    expect(relation.hasA("a")).toBe(true);
    expect(relation.hasA("missing")).toBe(false);
    expect(relation.hasB(2)).toBe(true);
    expect(relation.hasB(3)).toBe(false);
    expect(relation.getEntries()).toEqual([
      ["a", 1, 2],
      ["a", 2, 1],
      ["b", 2, 1],
    ]);

    expect(relation.decrement("a", 1)).toEqual({ a: "a", b: 1, count: 1 });
    expect(relation.decrement("a", 1)).toEqual({ a: "a", b: 1, count: 0 });
    expect(relation.getCount("a", 1)).toBe(0);
    expect(relation.hasB(1)).toBe(false);
    expect(relation.hasA("a")).toBe(true);
  });

  test("preserves first-active canonical representatives and insertion order", () => {
    interface Value {
      readonly id: string;
      readonly label: string;
    }

    const firstA = { id: "a", label: "first-a" };
    const equivalentA = { id: "a", label: "equivalent-a" };
    const secondA = { id: "b", label: "second-a" };
    const firstB = { id: "x", label: "first-b" };
    const equivalentB = { id: "x", label: "equivalent-b" };
    const secondB = { id: "y", label: "second-b" };
    const relation = createRefCountedRelation({
      lookupA: (value: Value) => value.id,
      lookupB: (value: Value) => value.id,
    });

    relation.increment(firstA, firstB);
    relation.increment(secondA, equivalentB);
    const incremented = relation.increment(equivalentA, secondB);

    expect(incremented.a).toBe(firstA);
    expect(incremented.b).toBe(secondB);
    expect(incremented.count).toBe(1);
    const relatedAs = relation.getAs(equivalentB);
    expect(relatedAs[0]).toBe(firstA);
    expect(relatedAs[1]).toBe(secondA);
    const relatedBs = relation.getBs(equivalentA);
    expect(relatedBs[0]).toBe(firstB);
    expect(relatedBs[1]).toBe(secondB);

    relation.decrement(firstA, firstB);
    const removed = relation.decrement(equivalentA, secondB);

    expect(removed.a).toBe(firstA);
    expect(removed.b).toBe(secondB);
    expect(removed.count).toBe(0);

    relation.decrement(secondA, equivalentB);
    const nextA = { id: "a", label: "next-a" };
    const nextB = { id: "x", label: "next-b" };
    const next = relation.increment(nextA, nextB);

    expect(next.a).toBe(nextA);
    expect(next.b).toBe(nextB);
    expect(next.count).toBe(1);
  });

  test("preserves canonical representatives when decrement keeps a pair retained", () => {
    interface Value {
      readonly id: string;
      readonly label: string;
    }

    const firstA = { id: "a", label: "first-a" };
    const firstB = { id: "b", label: "first-b" };
    const relation = createRefCountedRelation({
      lookupA: (value: Value) => value.id,
      lookupB: (value: Value) => value.id,
    });

    relation.increment(firstA, firstB);
    const incremented = relation.increment(
      { id: "a", label: "second-a" },
      { id: "b", label: "second-b" },
    );

    expect(incremented.a).toBe(firstA);
    expect(incremented.b).toBe(firstB);
    expect(incremented.count).toBe(2);

    const decremented = relation.decrement(
      { id: "a", label: "third-a" },
      { id: "b", label: "third-b" },
    );

    expect(decremented.a).toBe(firstA);
    expect(decremented.b).toBe(firstB);
    expect(decremented.count).toBe(1);
    expect(relation.getCount(firstA, firstB)).toBe(1);
    expect(relation.getAs(firstB)[0]).toBe(firstA);
    expect(relation.getBs(firstA)[0]).toBe(firstB);
  });

  test("directional and entry reads are snapshots", () => {
    const relation = createRefCountedRelation<string, number>();
    relation.increment("a", 1);

    const as = relation.getAs(1);
    const bs = relation.getBs("a");
    const entries = relation.getEntries();
    relation.increment("b", 1);
    relation.increment("a", 2);

    expect(as).toEqual(["a"]);
    expect(bs).toEqual([1]);
    expect(entries).toEqual([["a", 1, 1]]);
  });

  test("decrement rejects a missing pair without changing existing relations", () => {
    const relation = createRefCountedRelation<string, number>();
    relation.increment("a", 1);

    expect(() => relation.decrement("a", 2)).toThrow(
      "RefCountedRelation pair must exist before decrement.",
    );
    expect(() => relation.decrement("missing", 1)).toThrow(
      "RefCountedRelation pair must exist before decrement.",
    );
    expect(relation.getEntries()).toEqual([["a", 1, 1]]);
  });

  test("clear removes pair counts and both directional indexes", () => {
    const relation = createRefCountedRelation<string, number>();
    relation.increment("a", 1);
    relation.increment("b", 2);

    relation.clear();

    expect(relation.getEntries()).toEqual([]);
    expect(relation.getAs(1)).toEqual([]);
    expect(relation.getBs("a")).toEqual([]);
    expect(relation.hasA("a")).toBe(false);
    expect(relation.hasB(1)).toBe(false);
  });
});
