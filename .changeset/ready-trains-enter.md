---
"@evolu/common": minor
---

Reported timestamp insertion results

`BaseSqliteStorage.insertTimestamp` now returns `true` for a new timestamp and
`false` for a duplicate. Calls that ignore the result continue to work; custom
storage implementations must return whether they inserted the timestamp.

```ts
import { assertType } from "@evolu/common";
import type { BaseSqliteStorage } from "@evolu/common/local-first";

assertType<ReturnType<BaseSqliteStorage["insertTimestamp"]>, boolean>();
```
