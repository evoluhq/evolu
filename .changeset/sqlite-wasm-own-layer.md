---
"@evolu/sqlite-wasm": major
---

Switched to Evolu's own SQLite build and TypeScript layer

`@evolu/sqlite-wasm` no longer packages SQLite3 Multiple Ciphers with SQLite's
JavaScript. It is now plain SQLite 3.53.4, which Evolu compiles to WebAssembly
in SQLite's bare-bones configuration with JSON and the math functions. On top of
it sits a TypeScript layer of Evolu's own. The README explains why and what the
package contains. The layer returns `Result` and `Task` of `@evolu/common`, a
new peer dependency. 2.2.4 had none.

`createSqliteWasm` loads the binary, which `sqliteWasmUrl` locates for bundlers.
Given a `fetch` of the binary, it compiles the binary while it downloads if the
server sends it as `application/wasm`, and from its bytes otherwise. A response
that is not ok, such as a 404 for a wrong URL, fails with its HTTP status.
`initializeSqliteWasm` initializes SQLite again after `sqlite3_shutdown`.

`createSqliteDatabase` opens an in-memory database or a database file on a VFS.
It uses the VFS only through the `SqliteVfs` and `SqliteEncryptingVfs`
interfaces. `createEncryptedSqliteDatabase` opens an encrypted database in a
pool.

A file's path is a `SqliteVfsPath`, a canonical path of up to 498 bytes, such as
`/evolu1.db`. Each file has one spelling, and the VFS also lists and deletes the
file by it. SQLite passes the path to the VFS as it is, so `SqliteVfsPath`
rejects any other spelling, such as `evolu1.db`, with `SqliteVfsPathError`. It
also rejects what SQLite would read itself, such as `:memory:` or a `file:` URI.
SQLite would strip the URI's query, so an encrypted database would get no key.

`openSahPool` opens a pool of OPFS sync access handles in the format of SQLite's
opfs-sahpool. The pool is a VFS that encrypts databases in the format of
SQLCipher 4, as the `sqlcipher` scheme of SQLite3 Multiple Ciphers writes it.

Its `directory` is a non-empty array of the names of the directories from the
OPFS root to the pool, such as `[OpfsName.orThrow(".evolu")]`. The names joined
with `/` name its VFS, `opfs-sahpool:.evolu`. `OpfsName` accepts only a valid
file name of the File System Standard on every platform, in one spelling. It
rejects with `OpfsNameError` an empty name, `.`, `..`, a name with `/`, `\`, NUL
or a lone surrogate, and a name not in Unicode NFC. In WebKit on macOS, names
that differ only in case name one directory, so spell each directory in one
case.

As in opfs-sahpool, one pool may use a directory at a time, across workers and
wasm instances. The caller must serialize opens of a directory, as Evolu does
with its leader Web Lock. Otherwise, two openers of a new or empty directory can
each create their own slots. On the next open, only one version of a file shows,
and the other stays hidden and is never reused.

With the `heldTimeout` option, `openSahPool` keeps trying while another context
still holds a slot of the pool, such as a worker that ended without closing its
database. The attempts are from 50 ms up to a second apart. Once an attempt ends
`heldTimeout` after the first one started, it fails with `SahPoolHeldError`.

`@evolu/sqlite-wasm/c-api` exports every public C function of the build as a
standalone function.

SQLite's JavaScript API is gone, and with it the default export that initialized
it, its other VFSes and its worker API. The SQLite features the bare-bones build
leaves out are gone too, such as FTS5, R\*Tree and WAL.

Pools that 2.2.4 created open unchanged, with their unencrypted databases and
the ones `@evolu/web` 3 encrypted. An encrypted one opens with the key that
2.2.4 derived from the key text, as before. Because of a
[bug](https://github.com/utelle/SQLite3MultipleCiphers/issues/218), SQLite3
Multiple Ciphers 2.2.4 took the key in SQLCipher's raw-key notation, `x'<hex>'`,
as a passphrase. A new database is encrypted with the key itself. 2.2.4 opens it
only with the key in its raw-key notation, `raw:<hex>`, so `@evolu/web` 3.4.1
and earlier cannot open it.

In a pool, a transaction that a closed tab or a crash interrupted is now rolled
back when the database opens again. The opfs-sahpool of 2.2.4 reported every
file as locked by another connection, so SQLite never rolled one back, and the
next open could see it half-applied.

SQL that nests deeply enough to overflow SQLite's C stack, such as a chain of
600 triggers, now throws a `WebAssembly.RuntimeError`. Like any trap, it breaks
the instance. In 2.2.4, such SQL silently overwrote SQLite's memory, which made
it hang.

On an encrypted database, a `VACUUM` after `PRAGMA page_size` set another page
size now fails with `SQLITE_IOERR_WRITE` and leaves the database as it was.
2.2.4 kept the old page size. A worker that dies right after writing a journal
record's page number can leave a database mid-transaction with
`synchronous = OFF` under `journal_mode = PERSIST` or
`locking_mode = EXCLUSIVE`. Such an encrypted database is now rolled back.
SQLite3 Multiple Ciphers fails that rollback with `SQLITE_CORRUPT`. The
opfs-sahpool of 2.2.4 never ran it, because it never rolled a journal back. A
connection can also open an encrypted database's path while it is empty, and
another connection then creates the database there with another page size. The
first connection now reads it. 2.2.4 failed with `SQLITE_NOTADB` until it was
opened again.

An encrypted database whose page 1 doesn't store 80 reserved bytes now fails
with `SQLITE_NOTADB`. The format leaves that byte unauthenticated, and 2.2.4
read a database that reserves more anyway, returning wrong bytes for any value
that overflows its page. When a worker dies during an `UPDATE` that allocates
no page, which journals page 1 last, and the start of the database's page 1 is
torn to zeros, a database this release created is rolled back. A database 2.2.4
created still fails to open there, as with 2.2.4, because its key is derived
from those bytes.

On an encrypted database, `PRAGMA secure_delete` set to anything but `on`,
`yes`, `true` or `1` now fails with `SQLITE_ERROR`, because a freed page SQLite
does not write would fail to authenticate. 2.2.4 accepted it. Opening an
encrypted database without its key while it has a hot journal that records
pages, such as one a worker left when it ended mid-transaction, now fails with
`SQLITE_CANTOPEN`, and the journal stays for the key. 2.2.4's opfs-sahpool
failed with `SQLITE_NOTADB`. A leftover journal that is not hot, as
`journal_mode = PERSIST` or `TRUNCATE` keeps it, still gives `SQLITE_NOTADB`, as
no journal does.

`VACUUM INTO` and `ATTACH` on an encrypted database now write an unencrypted
file, because SQLite ignores the `KEY` clause of `ATTACH` and `PRAGMA key`,
`rekey` and `cipher`. 2.2.4 encrypted both with the database's key, or with the
`KEY` of `ATTACH`. To encrypt the file, register its key for its path with the
pool's `registerKey` while the statement opens it. A file that `ATTACH` creates
cannot be encrypted, because SQLite reserves no bytes in it. With a key
registered, its first write fails with `SQLITE_IOERR_WRITE`. But `VACUUM INTO`
can create an encrypted copy, which `ATTACH` then opens with its key registered.

The version is now the version of SQLite the package builds, followed by
`-build<n>`, as in SQLite's own npm package. This release is `3.53.4-build1`.
Later builds of SQLite 3.53.4 are `-build2`, `-build3` and so on, and a new
SQLite release starts again at `-build1`. A build may also change the TypeScript
API, so pin the exact version and read the release notes before upgrading.

```ts
import { readFile } from "node:fs/promises";
import { assertEqual, assertType, createRun, getOrThrow } from "@evolu/common";
import {
  createSqliteDatabase,
  createSqliteWasm,
  sqliteWasmUrl,
} from "@evolu/sqlite-wasm";

// SQLite's JavaScript, initialized by the default export, is gone.
assertType<
  Extract<keyof typeof import("@evolu/sqlite-wasm"), "default">,
  never
>();

await using run = createRun();
// In a browser, pass fetch(sqliteWasmUrl) to compile while it downloads.
const sqliteWasm = await run.orThrow(
  createSqliteWasm(await readFile(sqliteWasmUrl)),
  run.deps,
);
using database = getOrThrow(
  createSqliteDatabase({ sqliteWasm })({ type: "Memory" }),
);

const { rows } = getOrThrow(database.run("select 1 + 1 as two;", []));
assertEqual(rows, [{ two: 2 }]);
```
