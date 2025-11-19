---
"@evolu/common": minor
---

Add Cache module with generic cache interface and LRU cache implementation

- New `Cache<K, V>` interface with `has`, `get`, `set`, `delete` methods
- New `createLruCache` factory function for creating LRU caches with configurable capacity
- Keys are compared by reference (standard Map semantics)
- LRU cache automatically evicts least recently used entries when capacity is reached
- Both `get` and `set` operations update access order
- Exposes readonly `map` property for iteration and inspection

Example:

```ts
const cache = createLruCache<string, number>(2);
cache.set("a", 1);
cache.set("b", 2);
cache.set("c", 3); // Evicts "a"
cache.has("a"); // false
```
