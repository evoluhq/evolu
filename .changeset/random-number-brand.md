---
"@evolu/common": minor
---

Added `RandomNumber` branded type for type-safe random values

- `RandomNumber` — branded `number` type for values in [0, 1) range
- `Random.next()` now returns `RandomNumber` instead of `number`
- Prevents accidentally passing arbitrary numbers where random values are expected
