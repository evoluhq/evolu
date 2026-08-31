import { describe, it } from "node:test";
import {
  assertEqual,
  assertFalse,
  assertSame,
  assertThrowsInstanceOf,
  assertTrue,
} from "./Assert.ts";

import {
  createRefCountedRelation,
  createRelation,
  type RefCountedRelation,
} from "./Relation.ts";
import { assertType, type NonNegativeInt, type PositiveInt } from "./Type.ts";

describe("Relation", () => {
  it("add and iterateA/iterateB", () => {
    const relation = createRelation<string, number>();

    relation.add("a", 1);
    relation.add("a", 2);
    relation.add("b", 2);

    assertEqual([...relation.iterateA(1)], ["a"]);
    assertEqual([...relation.iterateA(2)], ["a", "b"]);
    assertEqual([...relation.iterateA(3)], []);

    assertEqual([...relation.iterateB("a")], [1, 2]);
    assertEqual([...relation.iterateB("b")], [2]);
    assertEqual([...relation.iterateB("c")], []);
  });

  it("has", () => {
    const relation = createRelation<string, number>();

    relation.add("a", 1);
    relation.add("b", 2);

    assertTrue(relation.has("a", 1));
    assertTrue(relation.has("b", 2));
    assertFalse(relation.has("a", 2));
    assertFalse(relation.has("b", 1));
    assertFalse(relation.has("c", 1));
  });

  it("hasA and hasB", () => {
    const relation = createRelation<string, number>();

    relation.add("a", 1);
    relation.add("a", 2);
    relation.add("b", 2);

    assertTrue(relation.hasA("a"));
    assertTrue(relation.hasA("b"));
    assertFalse(relation.hasA("c"));

    assertTrue(relation.hasB(1));
    assertTrue(relation.hasB(2));
    assertFalse(relation.hasB(3));
  });

  it("remove deletes an existing pair", () => {
    const relation = createRelation<string, number>();

    relation.add("a", 1);
    relation.add("a", 2);
    relation.add("b", 2);

    assertTrue(relation.remove("a", 1));
    assertFalse(relation.has("a", 1));
    assertTrue(relation.has("a", 2));
    assertTrue(relation.has("b", 2));
  });

  it("remove returns false for missing pairs", () => {
    const relation = createRelation<string, number>();

    assertFalse(relation.remove("a", 3));
    assertFalse(relation.remove("c", 1));
  });

  it("remove deletes empty side indexes", () => {
    const relation = createRelation<string, number>();

    relation.add("a", 1);
    relation.add("a", 2);
    relation.add("b", 2);

    assertTrue(relation.remove("a", 1));
    assertTrue(relation.remove("a", 2));
    assertFalse(relation.hasA("a"));

    assertTrue(relation.remove("b", 2));
    assertFalse(relation.hasB(2));
  });

  it("removeByA", () => {
    const relation = createRelation<string, number>();

    relation.add("a", 1);
    relation.add("a", 2);
    relation.add("b", 2);
    relation.add("c", 3);

    assertTrue(relation.removeByA("a"));
    assertFalse(relation.hasA("a"));
    assertFalse(relation.hasB(1));
    assertTrue(relation.hasB(2));
    assertTrue(relation.hasA("b"));

    assertFalse(relation.removeByA("nonexistent"));
  });

  it("removeByB", () => {
    const relation = createRelation<string, number>();

    relation.add("a", 1);
    relation.add("a", 2);
    relation.add("b", 2);
    relation.add("c", 3);

    assertTrue(relation.removeByB(2));
    assertFalse(relation.hasB(2));
    assertTrue(relation.hasA("a"));
    assertFalse(relation.hasA("b"));

    assertFalse(relation.removeByB(99));
  });

  it("removeByA and removeByB remove all related pairs", () => {
    const relation = createRelation<string, number>();

    relation.add("a", 1);
    relation.add("a", 2);
    relation.add("a", 3);
    relation.add("b", 3);
    relation.add("c", 3);

    // Bulk removal mutates the same internal indexes it is iterating, so this
    // guards against implementations that accidentally skip later pairs.
    assertTrue(relation.removeByA("a"));
    assertFalse(relation.hasA("a"));
    assertEqual([...relation.iterateA(1)], []);
    assertEqual([...relation.iterateA(2)], []);
    assertEqual([...relation.iterateA(3)], ["b", "c"]);
    assertEqual(relation.size(), 2);

    assertTrue(relation.removeByB(3));
    assertFalse(relation.hasB(3));
    assertFalse(relation.hasA("b"));
    assertFalse(relation.hasA("c"));
    assertEqual(relation.aCount(), 0);
    assertEqual(relation.bCount(), 0);
    assertEqual(relation.size(), 0);
  });

  it("clear", () => {
    const relation = createRelation<string, number>();

    relation.add("a", 1);
    relation.add("b", 2);

    relation.clear();

    assertFalse(relation.hasA("a"));
    assertFalse(relation.hasA("b"));
    assertFalse(relation.hasB(1));
    assertFalse(relation.hasB(2));
    assertEqual([...relation.iterateB("a")], []);
    assertEqual([...relation.iterateA(1)], []);
    assertEqual(relation.aCount(), 0);
    assertEqual(relation.bCount(), 0);
    assertEqual(relation.size(), 0);
  });

  it("works with complex objects as A and B", () => {
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

    assertTrue(relation.has(alice, newyork));
    assertTrue(relation.has(alice, london));
    assertTrue(relation.has(bob, london));
    assertFalse(relation.has(bob, newyork));

    assertEqual(new Set(relation.iterateB(alice)), new Set([newyork, london]));
    assertEqual(new Set(relation.iterateA(london)), new Set([alice, bob]));

    assertTrue(relation.remove(alice, newyork));
    assertFalse(relation.has(alice, newyork));

    assertTrue(relation.removeByA(alice));
    assertFalse(relation.hasA(alice));
    assertFalse(relation.has(alice, london));
  });

  it("duplicate adds and return value", () => {
    const relation = createRelation<string, number>();
    // new
    assertTrue(relation.add("a", 1));
    // duplicate
    assertFalse(relation.add("a", 1));
    // new B for existing A
    assertTrue(relation.add("a", 2));
    // new A referencing existing B
    assertTrue(relation.add("b", 2));
    assertEqual(relation.bCountForA("a"), 2);
    assertEqual(relation.aCountForB(1), 1);
    assertEqual(relation.aCountForB(2), 2);
  });

  it("directional counts return zero for missing keys", () => {
    const relation = createRelation<string, number>();

    assertEqual(relation.bCountForA("missing"), 0);
    assertEqual(relation.aCountForB(99), 0);
  });

  it("iterator yields pairs", () => {
    const relation = createRelation<string, number>();
    relation.add("a", 1);
    relation.add("a", 2);
    relation.add("b", 2);
    const pairs = [...relation];
    assertEqual(pairs, [
      ["a", 1],
      ["a", 2],
      ["b", 2],
    ]);
  });

  it("counts grow when adding new pairs", () => {
    const relation = createRelation<string, number>();

    assertEqual(relation.aCount(), 0);
    assertEqual(relation.bCount(), 0);
    assertEqual(relation.size(), 0);

    relation.add("a", 1);
    assertEqual(relation.aCount(), 1);
    assertEqual(relation.bCount(), 1);
    assertEqual(relation.size(), 1);

    relation.add("a", 2);
    assertEqual(relation.aCount(), 1);
    assertEqual(relation.bCount(), 2);
    assertEqual(relation.size(), 2);

    relation.add("b", 2);
    assertEqual(relation.aCount(), 2);
    assertEqual(relation.bCount(), 2);
    assertEqual(relation.size(), 3);

    relation.add("b", 2);
    assertEqual(relation.size(), 3);
  });

  it("counts shrink when removing pairs", () => {
    const relation = createRelation<string, number>();

    relation.add("a", 1);
    relation.add("a", 2);
    relation.add("b", 2);

    relation.remove("a", 1);
    assertEqual(relation.size(), 2);

    relation.removeByA("b");
    assertEqual(relation.size(), 1);

    relation.removeByB(2);
    assertEqual(relation.size(), 0);
    assertEqual(relation.aCount(), 0);
    assertEqual(relation.bCount(), 0);
  });

  it("supports custom lookup functions with typed keys", () => {
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

    assertTrue(relation.add(a1, b1));
    assertFalse(relation.add(a2, b2));
    assertTrue(relation.has(a2, b2));
    assertEqual([...relation.iterateB(a2)], [b1]);
    assertEqual([...relation.iterateA(b2)], [a1]);

    // @ts-expect-error custom lookup restricts A to Uint8Array
    relation.add("a", b1);
    // @ts-expect-error custom lookup restricts B to Uint8Array
    relation.add(a1, "b");
  });
});

describe("RefCountedRelation", () => {
  it("types expose canonical changes with precise count types", () => {
    const relation = createRefCountedRelation<string, number>();

    assertType<typeof relation, RefCountedRelation<string, number>>();
    {
      const actual = relation.increment("a", 1).count;
      assertType<typeof actual, PositiveInt>();
    }
    {
      const actual = relation.decrement("a", 1).count;
      assertType<typeof actual, NonNegativeInt>();
    }
  });

  it("increments and decrements pair counts while indexing both directions", () => {
    const relation = createRefCountedRelation<string, number>();

    assertEqual(relation.increment("a", 1), { a: "a", b: 1, count: 1 });
    assertEqual(relation.increment("a", 1), { a: "a", b: 1, count: 2 });
    relation.increment("a", 2);
    relation.increment("b", 2);

    assertEqual(relation.getCount("a", 1), 2);
    assertEqual(relation.getCount("missing", 1), 0);
    assertEqual(relation.getCount("a", 3), 0);
    assertEqual(relation.getAs(2), ["a", "b"]);
    assertEqual(relation.getAs(3), []);
    assertEqual(relation.getBs("a"), [1, 2]);
    assertEqual(relation.getBs("missing"), []);
    assertTrue(relation.hasA("a"));
    assertFalse(relation.hasA("missing"));
    assertTrue(relation.hasB(2));
    assertFalse(relation.hasB(3));
    assertEqual(relation.getEntries(), [
      ["a", 1, 2],
      ["a", 2, 1],
      ["b", 2, 1],
    ]);

    assertEqual(relation.decrement("a", 1), { a: "a", b: 1, count: 1 });
    assertEqual(relation.decrement("a", 1), { a: "a", b: 1, count: 0 });
    assertEqual(relation.getCount("a", 1), 0);
    assertFalse(relation.hasB(1));
    assertTrue(relation.hasA("a"));
  });

  it("preserves first-active canonical representatives and insertion order", () => {
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

    assertSame(incremented.a, firstA);
    assertSame(incremented.b, secondB);
    assertEqual(incremented.count, 1);
    const relatedAs = relation.getAs(equivalentB);
    assertSame(relatedAs[0], firstA);
    assertSame(relatedAs[1], secondA);
    const relatedBs = relation.getBs(equivalentA);
    assertSame(relatedBs[0], firstB);
    assertSame(relatedBs[1], secondB);

    relation.decrement(firstA, firstB);
    const removed = relation.decrement(equivalentA, secondB);

    assertSame(removed.a, firstA);
    assertSame(removed.b, secondB);
    assertEqual(removed.count, 0);

    relation.decrement(secondA, equivalentB);
    const nextA = { id: "a", label: "next-a" };
    const nextB = { id: "x", label: "next-b" };
    const next = relation.increment(nextA, nextB);

    assertSame(next.a, nextA);
    assertSame(next.b, nextB);
    assertEqual(next.count, 1);
  });

  it("preserves canonical representatives when decrement keeps a pair retained", () => {
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

    assertSame(incremented.a, firstA);
    assertSame(incremented.b, firstB);
    assertEqual(incremented.count, 2);

    const decremented = relation.decrement(
      { id: "a", label: "third-a" },
      { id: "b", label: "third-b" },
    );

    assertSame(decremented.a, firstA);
    assertSame(decremented.b, firstB);
    assertEqual(decremented.count, 1);
    assertEqual(relation.getCount(firstA, firstB), 1);
    assertSame(relation.getAs(firstB)[0], firstA);
    assertSame(relation.getBs(firstA)[0], firstB);
  });

  it("directional and entry reads are snapshots", () => {
    const relation = createRefCountedRelation<string, number>();
    relation.increment("a", 1);

    const as = relation.getAs(1);
    const bs = relation.getBs("a");
    const entries = relation.getEntries();
    relation.increment("b", 1);
    relation.increment("a", 2);

    assertEqual(as, ["a"]);
    assertEqual(bs, [1]);
    assertEqual(entries, [["a", 1, 1]]);
  });

  it("decrement rejects a missing pair without changing existing relations", () => {
    const relation = createRefCountedRelation<string, number>();
    relation.increment("a", 1);

    const missingPairError = assertThrowsInstanceOf(
      () => relation.decrement("a", 2),
      Error,
    );
    assertTrue(
      missingPairError.message.includes(
        "RefCountedRelation pair must exist before decrement.",
      ),
    );
    const missingAError = assertThrowsInstanceOf(
      () => relation.decrement("missing", 1),
      Error,
    );
    assertTrue(
      missingAError.message.includes(
        "RefCountedRelation pair must exist before decrement.",
      ),
    );
    assertEqual(relation.getEntries(), [["a", 1, 1]]);
  });

  it("clear removes pair counts and both directional indexes", () => {
    const relation = createRefCountedRelation<string, number>();
    relation.increment("a", 1);
    relation.increment("b", 2);

    relation.clear();

    assertEqual(relation.getEntries(), []);
    assertEqual(relation.getAs(1), []);
    assertEqual(relation.getBs("a"), []);
    assertFalse(relation.hasA("a"));
    assertFalse(relation.hasB(1));
  });
});
