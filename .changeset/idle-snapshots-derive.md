---
"@evolu/common": patch
---

Removed `isIdle` from semaphore and shared resource snapshots

`SemaphoreSnapshot` and `SharedResourceSnapshot` no longer have `isIdle`,
because it only repeated what their other fields show. This affects the
snapshots of semaphores, mutexes, mutex refs, their keyed variants, and shared
resources. A semaphore snapshot is idle when `taken` is 0 and `waiters` is
empty. A shared resource snapshot is idle when `leaseCount` is 0,
`hasResource` and `idleDisposePending` are false, and its `mutex` snapshot is
idle. `Semaphore.isIdle()` and the keyed `isIdle(key)` functions are
unchanged.

```ts
import { assertSame, assertTrue, createSemaphore } from "@evolu/common";

const semaphore = createSemaphore(2);
const snapshot = semaphore.snapshot();

// @ts-expect-error SemaphoreSnapshot no longer has isIdle.
assertSame(snapshot.isIdle, undefined);

assertTrue(snapshot.taken === 0 && snapshot.waiters.length === 0);
assertTrue(semaphore.isIdle());
```
