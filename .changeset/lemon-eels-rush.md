---
"@evolu/common": patch
---

Experimental new feature: Local only tables

A local-only table is a table prefixed with "\_" that will never be synced—a small but handy addition. Imagine editing huge JSON. Should we store it on any change or allow the user to "commit" data later? In an ideal world, we would have CRDT abstraction for any data, and we will have, but for now, we can postpone or even cancel sync with local-only tables. Another use-case is device-only data, for example, some settings that should not be shared with other devices. Local-only tables also allow real deletion. Use the isDeleted common column and the row will be deleted instead of marked as deleted.
