---
"@evolu/common": minor
---

Added databaseHeldTimeout

`databaseHeldTimeout` is how long Evolu waits for another context to release a database, such as a tab of another build of the app that keeps it open, or another process of a native app, before it fails with `DatabaseHeldError`.

```ts
import { assertEqual, databaseHeldTimeout } from "@evolu/common";

assertEqual(databaseHeldTimeout, "10s");
```
