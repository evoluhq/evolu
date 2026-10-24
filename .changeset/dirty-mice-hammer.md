---
"@evolu/common": patch
---

Fixed large mutations in one tick blocking the main thread

Each `insert`, `update` and `upsert` copied every change already queued in the
same tick, so a bulk edit or an import of n changes cost O(n²) on the main
thread before anything reached the database worker. `createMicrotaskBatch`,
which queues them, now appends in place. On an Apple M5, queuing 60,000
changes takes about 3 ms instead of 3 s.
