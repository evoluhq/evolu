---
"@evolu/common": minor
---

Added assertion utilities for Evolu Types and non-nullable values

`assertType` validates a value against an Evolu Type and narrows it to the inferred TypeScript type. It uses the Type name as the default error message to keep assertion failures readable.

`assertNonNullable` verifies that a value is neither `null` nor `undefined` and narrows it to `NonNullable<T>` for invariants that TypeScript cannot prove statically.

```ts
const length = buffer.getLength();
assertType(NonNegativeInt, length, "buffer length should be non-negative");
```
