---
"@evolu/common": minor
---

Added `RefCountedRelation` for bidirectional retain counts

`createRefCountedRelation` tracks a retain count for each pair while indexing canonical values in both directions. It supports custom lookup functions, reports pair transitions through `increment` and `decrement`, and returns snapshots that remain stable while the relation is mutated.