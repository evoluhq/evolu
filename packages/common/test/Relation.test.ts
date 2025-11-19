import { expect, test } from "vitest";
import { createRelation } from "../src/Relation.js";

test("Relation - add and getB/getA", () => {
  const relation = createRelation<string, number>();

  relation.add("a", 1);
  relation.add("a", 2);
  relation.add("b", 2);

  expect(relation.getB("a")?.has(1)).toBe(true);
  expect(relation.getB("a")?.has(2)).toBe(true);
  expect(relation.getB("a")?.has(3)).toBe(false);
  expect(relation.getB("b")?.has(2)).toBe(true);
  expect(relation.getB("c")).toBeUndefined();

  expect(relation.getA(1)?.has("a")).toBe(true);
  expect(relation.getA(1)?.has("b")).toBe(false);
  expect(relation.getA(2)?.has("a")).toBe(true);
  expect(relation.getA(2)?.has("b")).toBe(true);
  expect(relation.getA(3)).toBeUndefined();
});

test("Relation - has", () => {
  const relation = createRelation<string, number>();

  relation.add("a", 1);
  relation.add("b", 2);

  expect(relation.has("a", 1)).toBe(true);
  expect(relation.has("b", 2)).toBe(true);
  expect(relation.has("a", 2)).toBe(false);
  expect(relation.has("b", 1)).toBe(false);
  expect(relation.has("c", 1)).toBe(false);
});

test("Relation - hasA and hasB", () => {
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

test("Relation - remove", () => {
  const relation = createRelation<string, number>();

  relation.add("a", 1);
  relation.add("a", 2);
  relation.add("b", 2);

  expect(relation.remove("a", 1)).toBe(true);
  expect(relation.has("a", 1)).toBe(false);
  expect(relation.has("a", 2)).toBe(true);
  expect(relation.has("b", 2)).toBe(true);

  // Remove non-existent pair should return false
  expect(relation.remove("a", 3)).toBe(false);
  expect(relation.remove("c", 1)).toBe(false);

  // Remove last B for an A should remove the A
  expect(relation.remove("a", 2)).toBe(true);
  expect(relation.hasA("a")).toBe(false);

  // Remove last A for a B should remove the B
  expect(relation.remove("b", 2)).toBe(true);
  expect(relation.hasB(2)).toBe(false);
});

test("Relation - deleteA", () => {
  const relation = createRelation<string, number>();

  relation.add("a", 1);
  relation.add("a", 2);
  relation.add("b", 2);
  relation.add("c", 3);

  expect(relation.deleteA("a")).toBe(true);
  expect(relation.hasA("a")).toBe(false);
  expect(relation.hasB(1)).toBe(false);
  expect(relation.hasB(2)).toBe(true);
  expect(relation.hasA("b")).toBe(true);

  expect(relation.deleteA("nonexistent")).toBe(false);
});

test("Relation - deleteB", () => {
  const relation = createRelation<string, number>();

  relation.add("a", 1);
  relation.add("a", 2);
  relation.add("b", 2);
  relation.add("c", 3);

  expect(relation.deleteB(2)).toBe(true);
  expect(relation.hasB(2)).toBe(false);
  expect(relation.hasA("a")).toBe(true);
  expect(relation.hasA("b")).toBe(false);

  expect(relation.deleteB(99)).toBe(false);
});

test("Relation - clear", () => {
  const relation = createRelation<string, number>();

  relation.add("a", 1);
  relation.add("b", 2);

  relation.clear();

  expect(relation.hasA("a")).toBe(false);
  expect(relation.hasA("b")).toBe(false);
  expect(relation.hasB(1)).toBe(false);
  expect(relation.hasB(2)).toBe(false);
});

test("Relation - with complex objects as A and B", () => {
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

  expect(relation.getB(alice)?.has(newyork)).toBe(true);
  expect(relation.getB(alice)?.has(london)).toBe(true);
  expect(relation.getA(london)?.has(alice)).toBe(true);
  expect(relation.getA(london)?.has(bob)).toBe(true);

  expect(relation.remove(alice, newyork)).toBe(true);
  expect(relation.has(alice, newyork)).toBe(false);

  expect(relation.deleteA(alice)).toBe(true);
  expect(relation.hasA(alice)).toBe(false);
  expect(relation.has(alice, london)).toBe(false);
});

test("Relation - duplicate adds and return value", () => {
  const relation = createRelation<string, number>();
  expect(relation.add("a", 1)).toBe(true); // new
  expect(relation.add("a", 1)).toBe(false); // duplicate
  expect(relation.add("a", 2)).toBe(true); // new B for existing A
  expect(relation.add("b", 2)).toBe(true); // new A referencing existing B
  expect(relation.getB("a")?.size).toBe(2);
  expect(relation.getA(1)?.size).toBe(1);
  expect(relation.getA(2)?.size).toBe(2);
});

test("Relation - forEach iterates over pairs", () => {
  const relation = createRelation<string, number>();
  relation.add("a", 1);
  relation.add("a", 2);
  relation.add("b", 2);
  const pairs: Array<[string, number]> = [];
  relation.forEach((a, b) => pairs.push([a, b]));
  expect(pairs).toEqual([
    ["a", 1],
    ["a", 2],
    ["b", 2],
  ]);
});

test("Relation - iterator yields pairs", () => {
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

test("Relation - counts", () => {
  const relation = createRelation<string, number>();
  expect(relation.aCount()).toBe(0);
  expect(relation.bCount()).toBe(0);
  expect(relation.size()).toBe(0);
  relation.add("a", 1); // new pair
  expect(relation.aCount()).toBe(1);
  expect(relation.bCount()).toBe(1);
  expect(relation.size()).toBe(1);
  relation.add("a", 2); // new B same A
  expect(relation.aCount()).toBe(1);
  expect(relation.bCount()).toBe(2);
  expect(relation.size()).toBe(2);
  relation.add("b", 2); // new A same B
  expect(relation.aCount()).toBe(2);
  expect(relation.bCount()).toBe(2);
  expect(relation.size()).toBe(3);
  relation.add("b", 2); // duplicate
  expect(relation.size()).toBe(3);
  relation.remove("a", 1);
  expect(relation.size()).toBe(2);
  relation.deleteA("b"); // removes (b,2)
  expect(relation.size()).toBe(1);
  relation.deleteB(2); // removes (a,2)
  expect(relation.size()).toBe(0);
  expect(relation.aCount()).toBe(0);
  expect(relation.bCount()).toBe(0);
});
