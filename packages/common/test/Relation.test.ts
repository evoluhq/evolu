import { expect, test } from "vitest";
import { createRelation } from "../src/Relation.js";

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

  expect(new Set(relation.iterateB(alice))).toEqual(new Set([newyork, london]));
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
