---
"@evolu/common": minor
---

Added assertion utilities for Evolu Types and non-nullable values

`assertType` validates a value against an Evolu Type and narrows it to the inferred TypeScript type. It uses the Type name for the error message and preserves the Type validation error as the cause.

`assertNonNullable` verifies that a value is neither `null` nor `undefined` and narrows it to `NonNullable<T>` for invariants that TypeScript cannot prove statically.

```ts
const length = buffer.getLength();
assertType(NonNegativeInt, length);
```
