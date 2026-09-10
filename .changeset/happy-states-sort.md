---
"@evolu/common": patch
---

Refreshed queries invalidated before subscription

Queries now catch up when a mutation or incoming sync invalidates a loaded result before its listener subscribes. This prevents an empty or stale UI during startup. Previously loaded rows remain available without suspending while the subscription refreshes them. Pending reads retain their promise identity, and valid cached reads are reused.
