---
"@evolu/vue": patch
---

Removed the useSyncState hook

It threw on every call. Read `deps.syncState` from the shared Evolu deps
instead.
