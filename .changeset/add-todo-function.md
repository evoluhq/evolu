---
"@evolu/common": minor
---

Added `todo` function, a development placeholder that always throws

Use to sketch function bodies before implementing them. TypeScript infers the return type from context, so surrounding code still type-checks. Use an explicit generic when there is no return type annotation.

```ts
// Type inferred from return type annotation
const fetchUser = (id: UserId): Result<User, FetchError> => todo();

// Explicit generic when no return type
const getConfig = () => todo<Config>();
```
