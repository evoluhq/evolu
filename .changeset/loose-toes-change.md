---
"@evolu/common": minor
---

Add `dedupeArray` helper for immutable array deduplication. The function removes duplicate items from an array, optionally using a key extractor function. Returns a readonly array and does not mutate the input.

```ts
dedupeArray([1, 2, 1, 3, 2]); // [1, 2, 3]

dedupeArray([{ id: 1 }, { id: 2 }, { id: 1 }], (x) => x.id); // [{ id: 1 }, { id: 2 }]
```
