---
"@evolu/common": minor
---

Add `popArray` function for removing and returning the last element from a non-empty mutable array.

This complements the existing `shiftArray` function by providing symmetric mutable operations for both ends of arrays. The function ensures type safety by only accepting mutable non-empty arrays and guaranteeing a return value.
