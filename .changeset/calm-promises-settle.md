---
"@evolu/common": minor
---

Exported the Promise continuation timing assertion

Added `assertContinuationAfterMicrotasks` for tests that intentionally pin the
exact number of microtasks before a continuation attached to a Promise runs
after fulfillment or rejection.

```ts
import { assertContinuationAfterMicrotasks } from "@evolu/common";

await assertContinuationAfterMicrotasks(Promise.resolve("ready"), 1);
```
