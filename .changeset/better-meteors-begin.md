---
"@evolu/sqlite-wasm": patch
"@evolu/web": patch
"@evolu/react-native": patch
"@evolu/nodejs": patch
---

Checked page 1's stored page size on every read of an encrypted database

Encrypted databases in SQLite3 Multiple Ciphers' page-1 layout, which every new one and every one the web encrypted has, keep bytes 16 to 23 of page 1 in the clear, outside what the page's HMAC authenticates. So the codec checks the two of them SQLite reads the file by, as it does when it writes page 1. On reads it checked byte 20, the reserved bytes, every time, but the page size, bytes 16 and 17, only on some. Now a page 1 whose page size was altered fails to authenticate on every read:

- An open fails with `SQLITE_NOTADB` and a codec failure, a `SqlitePageAuthenticationError` for page 1. Before, a page size of 0 or another invalid value failed the open with no codec failure, so the error had no cause.
- A hot journal whose page-1 record was altered this way ends its rollback at that record, as one whose other bytes were altered does. Before, the rollback failed at it with `SQLITE_IOERR_WRITE`, and so did every later open.

Only someone who could already write the database's files can alter these bytes. A crash can't: the codec writes every page 1 with its own size and refuses a page size change, and a torn write of those bytes also tears the salt or bytes the HMAC covers.
