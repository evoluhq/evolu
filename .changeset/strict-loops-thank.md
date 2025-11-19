---
"@evolu/common": patch
---

Add ownerId system column and strict app tables

- Add `ownerId` as a system column to all application tables and include it in the primary key.
- Create app tables as strict, without rowid, and using `any` affinity for user columns to preserve data exactly as stored.
- Make soft deletes explicit in the sync protocol so `isDeleted` changes are propagated and replayed consistently across devices.
