---
"@evolu/common": minor
---

Added `getProperty` helper function

Safely gets a property from a record, returning `undefined` if the key doesn't exist. TypeScript's `Record<K, V>` type assumes all keys exist, but at runtime accessing a non-existent key returns `undefined`. This helper provides proper typing for that case without needing a type assertion.

```ts
const users: Record<string, User> = { alice: { name: "Alice" } };
const user = getProperty(users, "bob"); // User | undefined
```
