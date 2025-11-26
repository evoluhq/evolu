---
"@evolu/common": minor
---

Add `set` Type factory

The `set` factory creates a Type for validating `Set` instances with typed elements. It validates that the input is a `Set` and that all elements conform to the specified element type.

```ts
const NumberSet = set(Number);

const result1 = NumberSet.from(new Set([1, 2, 3])); // ok(Set { 1, 2, 3 })
const result2 = NumberSet.from(new Set(["a", "b"])); // err(...)
```
