---
"@evolu/sqlite-wasm": minor
"@evolu/web": minor
---

Updated SQLite to 3.54.0

`@evolu/sqlite-wasm` now builds SQLite 3.54.0 from sqlite.org's source, in the
same bare-bones configuration with JSON and the math functions, so its version
is `3.54.0-build1`. Existing databases open unchanged. The binary is 677,479
bytes, 305,733 with `gzip -9`.

SQLite changes that apps may notice:

- `ALTER TABLE` fails when it adds, drops or renames a column named `ROWID`,
  `_ROWID_` or `OID`, such as with "cannot add rowid alias: oid".
- `printf` and `format` have the conversions `%j`, which escapes text for a JSON
  string, and `%J`, which renders a value as a JSON literal, such as `"12"` for
  `12` and `null` for `NULL`.
- The date and time functions accept `weekday -N`, the backward counterpart of
  `weekday N`, and `end of day`, `end of month` and `end of year`, such as
  `datetime('2026-10-11', 'end of month')` for `2026-10-31 23:59:59`.
- An `UPDATE` leaves an expression index alone when the value it indexes does
  not change. `expr OR TRUE`, `expr OR FALSE`, `DISTINCT` on the right side of
  `IN` and `UNION` with `LIMIT 1` are optimized better. SQLite reports about 4%
  fewer CPU cycles than 3.53 in its speed test.

SQLite's bare-bones build now exports the online backup API, so
`@evolu/sqlite-wasm/c-api` adds `sqlite3_backup_init`, `sqlite3_backup_step`,
`sqlite3_backup_remaining`, `sqlite3_backup_pagecount` and
`sqlite3_backup_finish`, and `@evolu/sqlite-wasm` the `SqliteBackupPtr` type of
the backup they pass.
