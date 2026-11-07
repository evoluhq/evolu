---
"@evolu/common": patch
---

Kept late cleanup from deleting a newer keyed semaphore

`createSemaphoreByKey` and `createMutexByKey` keep a replacement registered
when a cancelled waiter finishes cleaning up the previous entry. Tasks with the
same key continue to share one semaphore or mutex.
