---
"@evolu/common": minor
---

Added Set module with type-safe helpers for immutable set operations.

**Types:**

- `NonEmptyReadonlySet<T>` — branded type for sets with at least one element (no mutable variant because `clear()`/`delete()` would break the guarantee)

**Constants:**

- `emptySet` — singleton empty set to avoid allocations

**Type Guards:**

- `isNonEmptySet` — narrows to branded `NonEmptyReadonlySet`

**Transformations:**

- `addToSet` — returns branded non-empty set with item added
- `deleteFromSet` — returns new set with item removed
- `mapSet` — maps over set, preserves non-empty type
- `filterSet` — filters set with predicate or refinement

**Accessors:**

- `firstInSet` — returns first element by insertion order (requires branded type)
