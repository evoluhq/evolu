---
"@evolu/common": minor
---

Added isLeaderLockHeld, which tells whether a caller leads for a name

`isLeaderLockHeld` tells whether a caller leads for a name, as `acquireLeaderLock` or `acquireLeaderLockCallback` makes it. A context that ends leads for nothing, so another context can check that one leading for a name, such as a worker leading for its ID while it runs, still runs.

```ts
import {
  acquireLeaderLock,
  assertFalse,
  assertTrue,
  isLeaderLockHeld,
  testCreateLockManager,
  testCreateRun,
} from "@evolu/common";

await using run = testCreateRun({ lockManager: testCreateLockManager() });
const isHeld = isLeaderLockHeld(run.deps);
assertFalse(await isHeld("example"));

const lease = await run.ok(acquireLeaderLock("example"));
assertTrue(await isHeld("example"));

await lease[Symbol.asyncDispose]();
assertFalse(await isHeld("example"));
```
