import { test } from "node:test";
import { assertEqual, assertFalse, assertSame, assertTrue } from "./Assert.ts";

import { createLruCache } from "./Cache.ts";
import { onePositiveInt, PositiveInt } from "./Type.ts";

test("LRU cache - basic set and get", () => {
  const cache = createLruCache<string, number>(PositiveInt.orThrow(3));

  cache.set("a", 1);
  cache.set("b", 2);
  cache.set("c", 3);

  assertEqual(cache.get("a"), 1);
  assertEqual(cache.get("b"), 2);
  assertEqual(cache.get("c"), 3);
  assertSame(cache.get("d"), undefined);
});

test("LRU cache - has method", () => {
  const cache = createLruCache<string, number>(PositiveInt.orThrow(2));

  cache.set("a", 1);
  cache.set("b", 2);

  assertTrue(cache.has("a"));
  assertTrue(cache.has("b"));
  assertFalse(cache.has("c"));
});

test("LRU cache - delete method", () => {
  const cache = createLruCache<string, number>(PositiveInt.orThrow(2));

  cache.set("a", 1);
  cache.set("b", 2);

  assertTrue(cache.has("a"));
  cache.delete("a");
  assertFalse(cache.has("a"));
  assertSame(cache.get("a"), undefined);
});

test("LRU cache - evicts least recently used on capacity", () => {
  const cache = createLruCache<string, number>(PositiveInt.orThrow(2));

  cache.set("a", 1);
  cache.set("b", 2);
  // Should evict "a"
  cache.set("c", 3);

  assertFalse(cache.has("a"));
  assertTrue(cache.has("b"));
  assertTrue(cache.has("c"));
});

test("LRU cache - get updates access order", () => {
  const cache = createLruCache<string, number>(PositiveInt.orThrow(2));

  cache.set("a", 1);
  cache.set("b", 2);
  // Access "a", making it most recent
  cache.get("a");
  // Should evict "b", not "a"
  cache.set("c", 3);

  assertTrue(cache.has("a"));
  assertFalse(cache.has("b"));
  assertTrue(cache.has("c"));
});

test("LRU cache - set updates access order for existing key", () => {
  const cache = createLruCache<string, number>(PositiveInt.orThrow(2));

  cache.set("a", 1);
  cache.set("b", 2);
  // Update "a", making it most recent
  cache.set("a", 10);
  // Should evict "b", not "a"
  cache.set("c", 3);

  assertEqual(cache.get("a"), 10);
  assertFalse(cache.has("b"));
  assertTrue(cache.has("c"));
});

test("LRU cache - readonly map view", () => {
  const cache = createLruCache<string, number>(PositiveInt.orThrow(3));

  cache.set("a", 1);
  cache.set("b", 2);
  cache.set("c", 3);

  assertEqual(cache.map.size, 3);
  assertEqual(cache.map.get("a"), 1);
  assertEqual(cache.map.get("b"), 2);
  assertEqual(cache.map.get("c"), 3);
  assertTrue(cache.map.has("a"));
  assertFalse(cache.map.has("d"));
});

test("LRU cache - map view reflects cache changes", () => {
  const cache = createLruCache<string, number>(PositiveInt.orThrow(2));

  cache.set("a", 1);
  assertEqual(cache.map.size, 1);

  cache.set("b", 2);
  assertEqual(cache.map.size, 2);

  // Evicts "a"
  cache.set("c", 3);
  assertEqual(cache.map.size, 2);
  assertFalse(cache.map.has("a"));
  assertTrue(cache.map.has("b"));
  assertTrue(cache.map.has("c"));
});

test("LRU cache - iteration over map", () => {
  const cache = createLruCache<string, number>(PositiveInt.orThrow(3));

  cache.set("a", 1);
  cache.set("b", 2);
  cache.set("c", 3);

  const entries = Array.from(cache.map.entries());
  assertEqual(entries, [
    ["a", 1],
    ["b", 2],
    ["c", 3],
  ]);

  const keys = Array.from(cache.map.keys());
  assertEqual(keys, ["a", "b", "c"]);

  const values = Array.from(cache.map.values());
  assertEqual(values, [1, 2, 3]);
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

  assertEqual(collected, [
    ["a", 1],
    ["b", 2],
    ["c", 3],
  ]);
});

test("LRU cache - reference-based key comparison", () => {
  const cache = createLruCache<object, number>(PositiveInt.orThrow(2));

  const key1 = { id: 1 };
  // Different object, same structure
  const key2 = { id: 1 };

  cache.set(key1, 100);
  cache.set(key2, 200);

  assertEqual(cache.get(key1), 100);
  assertEqual(cache.get(key2), 200);
  assertTrue(cache.has(key1));
  assertTrue(cache.has(key2));
});

test("LRU cache - capacity of 1", () => {
  const cache = createLruCache<string, number>(onePositiveInt);

  cache.set("a", 1);
  assertTrue(cache.has("a"));

  cache.set("b", 2);
  assertFalse(cache.has("a"));
  assertTrue(cache.has("b"));
});
