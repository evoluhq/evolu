---
"@evolu/common": patch
---

Fixed writes stored twice after the tab hosting the database closed

When the tab hosting the database closed or crashed while a write was in
progress, Evolu retried the write in another tab with new timestamps. A write
that had already been saved was then stored and synced again as a second change,
and a retried write to a local-only table rewrote its `createdAt` or `updatedAt`
with a later time. A retried write now reuses the timestamps and time of its
first attempt, so it is stored once.
