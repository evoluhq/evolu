---
"@evolu/common": patch
---

Made local changes faster

Evolu now spends less CPU encoding changes:

- Encoding a string value calls `JSON.parse` only on text that starts and ends
  like `JSON.stringify` output, so most plain text no longer throws inside it.
- Timestamps convert to and from bytes without `BigInt` and reuse the bytes of
  the last NodeId.

In Node with better-sqlite3, 20,000 local inserts used about 12% less CPU,
and with the web's SQLite in Node on an in-memory database, inserting and
uploading 20,000 todos used about 20% less. Synced bytes are unchanged.
