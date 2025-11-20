---
"@evolu/common": minor
---

Added `partitionArray` function and refinement support to `filterArray`.

- New `partitionArray` function partitions arrays returning a tuple of matched/unmatched with type narrowing support
- Enhanced `filterArray` with refinement overloads for type-safe filtering (e.g., `PositiveInt.is`)
- Added `PredicateWithIndex` and `RefinementWithIndex` types for index-aware predicates and type guards
- Improved documentation and cleaned up module headers
