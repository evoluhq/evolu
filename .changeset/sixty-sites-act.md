---
"@evolu/common": patch
---

Made database writes safe to replay after leader replacement

Pending writes use the same clock and time inputs across DbWorker replacement,
preventing duplicate CRDT changes and changes to local-only system columns.
SharedWorker ignores stale attempts and adopts the committed clock even when
the originating instance has closed.

Queued writes remain in memory. This change does not add worker-crash detection
or completion for existing error paths that leave requests pending.
