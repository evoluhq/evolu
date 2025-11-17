---
"@evolu/common": patch
---

Improve Array module docs and refactor helpers.

**Improvements:**

- Reorganize Array module documentation with clearer structure, code examples, and categories (Types, Guards, Operations, Transformations, Accessors, Mutations)
- Swap parameter order in `appendToArray` and `prependToArray` to follow data-first pattern (array parameter first)
- Add `@category` JSDoc tags to all exported items for better TypeDoc organization
- Add `### Example` sections to all functions with practical usage demonstrations
- Update `dedupeArray` to use function overloads (similar to `mapArray`) for better type preservation with non-empty arrays
