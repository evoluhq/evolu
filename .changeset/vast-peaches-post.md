---
"@evolu/common": patch
---

Add firstInArray and lastInArray helpers

New helpers for safely accessing the first and last elements of non-empty arrays. Both functions work with `NonEmptyReadonlyArray` to guarantee type-safe access without runtime checks.
