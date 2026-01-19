---
"@evolu/common": minor
---

Added `assertType` helper for asserting values against Evolu Types.

Uses the Type name as the default error message to keep assertion failures readable.

```ts
const length = buffer.getLength();
assertType(NonNegativeInt, length, "buffer length should be non-negative");
```
