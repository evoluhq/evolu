import { expect, test } from "vitest";
import { createLruCache } from "../src/Cache.js";
import { minPositiveInt, PositiveInt } from "../src/Type.js";

test("LRU cache - basic set and get", () => {
  const cache = createLruCache<string, number>(PositiveInt.orThrow(3));

  cache.set("a", 1);
  cache.set("b", 2);
  cache.set("c", 3);

  expect(cache.get("a")).toBe(1);
  expect(cache.get("b")).toBe(2);
  expect(cache.get("c")).toBe(3);
  expect(cache.get("d")).toBeUndefined();
});

test("LRU cache - has method", () => {
  const cache = createLruCache<string, number>(PositiveInt.orThrow(2));

  cache.set("a", 1);
  cache.set("b", 2);

  expect(cache.has("a")).toBe(true);
  expect(cache.has("b")).toBe(true);
  expect(cache.has("c")).toBe(false);
});

test("LRU cache - delete method", () => {
  const cache = createLruCache<string, number>(PositiveInt.orThrow(2));

  cache.set("a", 1);
  cache.set("b", 2);

  expect(cache.has("a")).toBe(true);
  cache.delete("a");
  expect(cache.has("a")).toBe(false);
  expect(cache.get("a")).toBeUndefined();
});

test("LRU cache - evicts least recently used on capacity", () => {
  const cache = createLruCache<string, number>(PositiveInt.orThrow(2));

  cache.set("a", 1);
  cache.set("b", 2);
  cache.set("c", 3); // Should evict "a"

  expect(cache.has("a")).toBe(false);
  expect(cache.has("b")).toBe(true);
  expect(cache.has("c")).toBe(true);
});

test("LRU cache - get updates access order", () => {
  const cache = createLruCache<string, number>(PositiveInt.orThrow(2));

  cache.set("a", 1);
  cache.set("b", 2);
  cache.get("a"); // Access "a", making it most recent
  cache.set("c", 3); // Should evict "b", not "a"

  expect(cache.has("a")).toBe(true);
  expect(cache.has("b")).toBe(false);
  expect(cache.has("c")).toBe(true);
});

test("LRU cache - set updates access order for existing key", () => {
  const cache = createLruCache<string, number>(PositiveInt.orThrow(2));

  cache.set("a", 1);
  cache.set("b", 2);
  cache.set("a", 10); // Update "a", making it most recent
  cache.set("c", 3); // Should evict "b", not "a"

  expect(cache.get("a")).toBe(10);
  expect(cache.has("b")).toBe(false);
  expect(cache.has("c")).toBe(true);
});

test("LRU cache - readonly map view", () => {
  const cache = createLruCache<string, number>(PositiveInt.orThrow(3));

  cache.set("a", 1);
  cache.set("b", 2);
  cache.set("c", 3);

  expect(cache.map.size).toBe(3);
  expect(cache.map.get("a")).toBe(1);
  expect(cache.map.get("b")).toBe(2);
  expect(cache.map.get("c")).toBe(3);
  expect(cache.map.has("a")).toBe(true);
  expect(cache.map.has("d")).toBe(false);
});

test("LRU cache - map view reflects cache changes", () => {
  const cache = createLruCache<string, number>(PositiveInt.orThrow(2));

  cache.set("a", 1);
  expect(cache.map.size).toBe(1);

  cache.set("b", 2);
  expect(cache.map.size).toBe(2);

  cache.set("c", 3); // Evicts "a"
  expect(cache.map.size).toBe(2);
  expect(cache.map.has("a")).toBe(false);
  expect(cache.map.has("b")).toBe(true);
  expect(cache.map.has("c")).toBe(true);
});

test("LRU cache - iteration over map", () => {
  const cache = createLruCache<string, number>(PositiveInt.orThrow(3));

  cache.set("a", 1);
  cache.set("b", 2);
  cache.set("c", 3);

  const entries = Array.from(cache.map.entries());
  expect(entries).toEqual([
    ["a", 1],
    ["b", 2],
    ["c", 3],
  ]);

  const keys = Array.from(cache.map.keys());
  expect(keys).toEqual(["a", "b", "c"]);

  const values = Array.from(cache.map.values());
  expect(values).toEqual([1, 2, 3]);
});

test("LRU cache - forEach on map", () => {
  const cache = createLruCache<string, number>(PositiveInt.orThrow(3));

  cache.set("a", 1);
  cache.set("b", 2);
  cache.set("c", 3);

  const collected: Array<[string, number]> = [];
  cache.map.forEach((value, key) => {
    collected.push([key, value]);
  });

  expect(collected).toEqual([
    ["a", 1],
    ["b", 2],
    ["c", 3],
  ]);
});

test("LRU cache - reference-based key comparison", () => {
  const cache = createLruCache<object, number>(PositiveInt.orThrow(2));

  const key1 = { id: 1 };
  const key2 = { id: 1 }; // Different object, same structure

  cache.set(key1, 100);
  cache.set(key2, 200);

  expect(cache.get(key1)).toBe(100);
  expect(cache.get(key2)).toBe(200);
  expect(cache.has(key1)).toBe(true);
  expect(cache.has(key2)).toBe(true);
});

test("LRU cache - capacity of 1", () => {
  const cache = createLruCache<string, number>(minPositiveInt);

  cache.set("a", 1);
  expect(cache.has("a")).toBe(true);

  cache.set("b", 2);
  expect(cache.has("a")).toBe(false);
  expect(cache.has("b")).toBe(true);
});
