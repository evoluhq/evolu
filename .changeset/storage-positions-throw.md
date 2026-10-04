---
"@evolu/common": patch
---

Fixed storage queries hanging on a position past an owner's timestamps

`getTimestampByIndex`, and the `iterate`, `fingerprint`, and
`fingerprintRanges` of `createBaseSqliteStorage`, looped in SQLite forever and
blocked the thread on an index at or past the owner's size, as the index of
`getTimestampByIndex` or the `begin` of `iterate`, or on a bucket past that
size, in `fingerprint` and `fingerprintRanges`. Sync never passes such a
position. Those calls now throw an assertion error, and the `Storage` interface
documents that no index may exceed the owner's size.
