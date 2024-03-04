---
"@evolu/common-web": major
---

6x faster update, 2x faster sync, and no COOP/COEP headers

Sync is 2x faster because Evolu doesn't create sync messages for createdAt and updatedAt columns anymore. They are inferred from the sync message timestamp instead. This change also made updates 2x faster.

@evolu/common-web is roughly 3x faster because we switched from OPFS via sqlite3_vfs to OPFS SyncAccessHandle Pool VFS.

The "opfs-sahpool" also does not require COOP/COEP HTTP headers (and associated restrictions), and it works on all major browsers released since March 2023.

This change was challenging because, by default, the "opfs-sahpool" does not support multiple simultaneous connections and can be instantiated only within a web worker and only within one tab of the same origin. Evolu uses Web Locks and BroadcastChannel to re-enable multiple tabs functionality.
