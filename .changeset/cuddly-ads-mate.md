---
"@evolu/common": major
"@evolu/nodejs": major
---

Rename `ManyToManyMap` to `Relation`.

- `ManyToManyMap<K, V>` → `Relation<A, B>`
- `createManyToManyMap` → `createRelation`
- `getValues` / `getKeys` → `getB` / `getA`
- `hasPair` / `hasKey` / `hasValue` → `has` / `hasA` / `hasB`
- `deleteKey` / `deleteValue` → `deleteA` / `deleteB`
- `keyCount` / `valueCount` / `pairCount` → `aCount` / `bCount` / `size`
