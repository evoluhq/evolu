---
"@evolu/nodejs": minor
---

Replaced better-sqlite3 with Evolu's own SQLite, which encrypts databases on Node.js

Node.js now runs Evolu's own SQLite, the core the web and React Native run,
with the same encryption. Until now, the driver on better-sqlite3 ignored the
key Evolu passed it and stored every database in plaintext. The core is
compiled into a Node-API addon that ships prebuilt inside `@evolu/nodejs`, so
installing the package runs no install script, builds nothing, and installs
no other package for it.

`createBetterSqliteDriver` is now `createNodeJsSqliteDriver`. It still stores
a database in `<name>.db` in the working directory, and the mode without
options, which the Evolu Relay uses, still stores plaintext. What changes:

- The `encrypted` mode encrypts the database with its key, and so does every
  Evolu instance on Node.js that isn't in memory.
- A database an earlier release wrote is plaintext, and its encrypted open
  fails with `SQLITE_NOTADB` ("file is not a database"), or, when a crash left
  a hot journal, `SQLITE_NOTADB` or `SQLITE_CORRUPT`, and `SQLITE_CANTOPEN`
  when it left a WAL log. The file keeps every committed row and its journal or
  log, though an encrypted open drops the pages a crashed transaction appended,
  as its rollback would. Nothing converts it. The data a relay holds syncs
  back into a new database; read local-only data from the old file with any
  SQLite tool before you delete it.
- A database file that's a symbolic link fails to open, with
  `SQLITE_CANTOPEN` and the system's `ELOOP`, where better-sqlite3 followed the
  link. Link or mount the database's directory instead.
- The addon is built for macOS 13.5 or later and for Linux with glibc 2.28 or
  later or with musl, each on arm64 and x64, Node.js 24's own floors. Windows
  isn't supported yet: an open there throws, while the package's other exports
  work.
- Bundle `@evolu/nodejs` as an external, so its addon loads from the package.
- Code written against better-sqlite3 meets other behavior:
  - An error's cause is a `NativeSqliteError` with SQLite's numeric
    `extendedCode`, such as 2067 for `SQLITE_CONSTRAINT_UNIQUE`, where
    better-sqlite3's error had the string `code`.
  - One connection of the process holds a file at a time, so a second open of
    it tries again for 10 seconds, then fails with a `DatabaseFileHeldError`
    cause.
  - `pragma function_list`, `pragma module_list` and `pragma pragma_list`
    return no rows.
  - `LIKE` matches blobs, which better-sqlite3 built SQLite not to.
  - A row inherits nothing, so `row.hasOwnProperty` is undefined. Use
    `Object.hasOwn`.
- Evolu's SQLite has the features the web's has: SQLite's defaults, JSON
  among them, and the math functions. Compared with better-sqlite3, it lacks
  FTS, R\*Tree, Geopoly, the `dbstat` table, `percentile`, `soundex`,
  `UPDATE` and `DELETE` with `LIMIT`, and extension loading, and foreign keys
  are off unless a connection turns them on, where better-sqlite3 turned them
  on. Evolu's own schemas use none of them. A pragma that keys a database,
  such as `pragma key`, fails rather than leave it in plaintext, which
  better-sqlite3 did silently, and an attached database is read-only, because
  SQLite ignores the `KEY` clause of `ATTACH`. As with better-sqlite3, every
  connection is in SQLite's defensive mode, so ordinary SQL can't corrupt its
  database, and a file connection waits up to 5 seconds for a lock another
  process holds, also while it opens, and caches up to about 16 MB of pages.

```ts
import { assertEqual, sql, testSetupSqlite } from "@evolu/common";
import { createNodeJsSqliteDriver } from "@evolu/nodejs";

// @ts-expect-error @evolu/nodejs exports no createBetterSqliteDriver.
type _Removed = typeof import("@evolu/nodejs").createBetterSqliteDriver;

await using setup = await testSetupSqlite({
  createSqliteDriver: createNodeJsSqliteDriver,
});

assertEqual(setup.sqlite.exec(sql`select sqlite_version() as v;`).rows, [
  { v: "3.54.1" },
]);
```
