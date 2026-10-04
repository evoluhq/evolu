---
"@evolu/common": patch
---

Fixed `deleteOwner` of `createBaseSqliteStorage` keeping the owner's usage row

It deleted the owner's timestamps but kept its `evolu_usage` row, whose stored
bytes and timestamp bounds then described data that was gone. The relay storage
deleted that row itself, so relays were not affected.
