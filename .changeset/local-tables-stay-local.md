---
"@evolu/common": patch
---

Fixed received changes being applied to local-only tables

Tables whose names start with an underscore are local-only: their changes are
never synced. A received change to such a table, which only non-standard code
can send, was still applied, overwriting the device's local data. It is now
kept in quarantine, stored for sync but never applied.
