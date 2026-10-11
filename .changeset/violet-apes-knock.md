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

- In a table with a rowid, `ALTER TABLE` fails when it adds or drops a column
  named `ROWID`, `_ROWID_` or `OID`, in any letter case, or renames a column to
  or from such a name, such as with "cannot add rowid alias: oid". It doesn't
  fail in `WITHOUT ROWID` tables, such as the tables Evolu creates for an app's
  schema.
- `printf` and `format` have the conversions `%j`, which escapes text for a JSON
  string, and `%J`, which renders a value as a quoted JSON string, such as
  `"12"` for `12`, and `NULL` as `null`.
- The date and time functions accept `weekday -N`, the backward counterpart of
  `weekday N`, and `end of day`, `end of month` and `end of year`, such as
  `datetime('2026-10-11', 'end of month')` for `2026-10-31 23:59:59`.
- The date and time functions read hour 24 differently. `24:00` is now midnight
  of the next day, so `datetime('2026-10-11 24:00')` is `2026-10-12 00:00:00`,
  and a later time, such as `24:30`, is now `NULL`. 3.53 returned both as given.
- An `UPDATE` leaves an expression index alone when the value it indexes does
  not change. `expr OR TRUE`, `expr OR FALSE`, `DISTINCT` on the right side of
  `IN` and `UNION` with `LIMIT 1` are optimized better. SQLite reports about 4%
  fewer CPU cycles than 3.53 in its speed test.

SQLite's bare-bones build now exports the online backup API, so
`@evolu/sqlite-wasm/c-api` adds `sqlite3_backup_init`, `sqlite3_backup_step`,
`sqlite3_backup_remaining`, `sqlite3_backup_pagecount` and
`sqlite3_backup_finish`, and `@evolu/sqlite-wasm` the `SqliteBackupPtr` type of
the backup they pass. `sqlite3_complete` now ends a line comment only at a
newline, so `select 1; -- done` without one is incomplete.
