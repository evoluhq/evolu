---
"@evolu/common": minor
---

Added Result composition helpers for arrays and structs.

- **`allResult`** — extracts all values from an array/struct of Results, returning the first error if any fails
- **`mapResult`** — maps items to Results and extracts all values, returning the first error if any fails
- **`anyResult`** — returns the first successful Result, or the last error if all fail

```ts
// Extract values from array of Results
const results = [ok(1), ok(2), ok(3)];
const all = allResult(results); // ok([1, 2, 3])

// Map items to Results
const users = mapResult(userIds, fetchUser);
// Result<ReadonlyArray<User>, FetchError>

// First success wins
const result = anyResult([err("a"), ok(42), err("b")]); // ok(42)

// Struct support
const struct = allResult({ a: ok(1), b: ok("two") });
// ok({ a: 1, b: "two" })
```
