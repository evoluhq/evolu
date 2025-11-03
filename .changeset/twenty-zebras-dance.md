---
"@evolu/common": patch
---

Add `orNull` method to Evolu Type

Returns the validated value or `null` on failure. Useful when the error is not important and you just want the value or nothing.

```ts
const age = PositiveInt.orNull(userInput) ?? 0;
```
