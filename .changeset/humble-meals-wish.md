---
"@evolu/common": minor
---

Added `readonly` helper function

The `readonly` function casts arrays, sets, records, and maps to their readonly counterparts with zero runtime cost. It preserves `NonEmptyArray` as `NonEmptyReadonlyArray` and provides proper type inference for all supported collection types.
