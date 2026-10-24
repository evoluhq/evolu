# @evolu/sqlite-wasm

## 3.54.1-build1

### Major Changes

- 89b626c: Moved database encryption into Evolu's SQLite core and updated SQLite to 3.54.1

  `@evolu/sqlite-wasm` 3.54.1-build1, which `@evolu/web` now uses, encrypts
  databases with Evolu's SQLite core, Evolu's own C code inside the WebAssembly.
  It's the start of one SQLite for every Evolu platform. The same C compiles
  natively for React Native in `@evolu/react-native` and will for Node.js, so
  every platform gets one file format, one behavior after a crash and one set of
  tests. Until now, the web encrypted in TypeScript, React Native relied on the
  SQLCipher that expo-sqlite vendors, and Node.js didn't encrypt at all.

  What this brings:

  - The file format is unchanged. Databases encrypted by earlier versions open as
    they did, and earlier builds open what this one writes.
  - AES runs in constant time, with BearSSL's bitsliced AES. Unlike the
    table-based AES it replaces, it leaves no trace of the key in the CPU's
    caches for code running beside it, such as another tab or app. WebAssembly
    engines promise no constant time, so this holds as long as they add no
    secret-dependent branch or memory access of their own. A check of the
    compiled WebAssembly finds none in Evolu's build.
  - Less to load and less to trust. What `@evolu/web` imports from
    `@evolu/sqlite-wasm` is 39,614 bytes of JavaScript minified by esbuild,
    13,357 with `gzip -9`, instead of 194,844 and 67,501. The package has no
    runtime dependencies now that `@awasm/noble` is gone, and a worker that
    encrypts no longer allocates its 30 MiB of WebAssembly memory. The wasm grew
    from 677,479 to 719,360 bytes, from 305,733 to 322,492 with `gzip -9`.
  - SQLite 3.54.1 fixes a regression of 3.54.0 that made a statement with a
    `column = ?` term and an ORDER BY, GROUP BY, `min`, `max`, DISTINCT or a join
    prepare again on every run, as eleven of Evolu's storage queries did. It also
    fixes a possible heap-buffer overflow on 32-bit builds.
  - A database that `@evolu/web` 3.0.0 to 3.4.1 encrypted, whose salt a crash
    tore, opens with the salt its hot journal stores.

  Constant time has a price, paid on writes. On an Apple M5, writing an 8 KiB page
  with its journal record takes about 300 µs instead of about 100 with
  table-based AES, in Chromium, Firefox and WebKit alike. A small commit after the
  storage idled, as in an app, gains 2.5 to 2.7 ms instead of 1.4 to 1.9, and
  large write transactions take about twice as long in Chromium. Back-to-back
  small commits in Chromium on macOS cost about 4 ms more each: Chromium flushes
  OPFS with `F_BARRIERFSYNC`, which slows down after about 100 to 200 µs without
  storage activity, and encrypting a page with constant-time AES takes longer
  than that, so each of a commit's five flushes is slow. Reads barely change:
  decrypting a page takes 60 to 70 µs instead of 40 to 60. We chose constant time
  because protecting the key matters more than raw speed. The README of
  `@evolu/sqlite-wasm` explains how writes could be faster and why we keep the
  codec simple instead.

  Tabs of earlier versions sharing the pool:

  - Tabs of `@evolu/web` 3.5.0 and later, with `@evolu/sqlite-wasm`
    3.53.4-build1 to 3.54.0-build2, share databases in SQLite's default DELETE
    journal mode, which Evolu keeps, and roll back each other's interrupted
    transactions. With a journal SQLite keeps, in PERSIST mode or with EXCLUSIVE
    locking and a database recreated at its path, those builds can keep a
    half-applied transaction, so that is not supported.
  - As since 3.5.0, a tab of `@evolu/web` 3.4.1 or earlier opens only the
    databases those versions created, and its `@evolu/sqlite-wasm` 2.2.4 never
    rolls back a hot journal. After a crash, it reads the rows the interrupted
    transaction half wrote, and its next write transaction keeps them.

  Behavior changes:

  - `PRAGMA key`, `hexkey`, `textkey`, `rekey`, `hexrekey`, `textrekey` and the
    `cipher` pragmas fail with `SQLITE_ERROR` on `File` and `EncryptedFile`
    databases instead of being ignored, so no database is keyed through SQL.
    Memory databases still ignore them, and `ATTACH` still ignores its `KEY`
    clause.
  - A `File` or `EncryptedFile` connection attaches databases read-only and
    creates no file, so a transaction no longer spans two databases, and
    `VACUUM INTO` writes a plaintext file.
  - Every connection has Evolu's SQL functions: the `evolu_skiplist_*`
    functions, Evolu's timestamp storage in C, for Evolu's sync to switch to in a
    later release, and `evolu_core_version()`.
  - The key is staged in wasm memory for the open and zeroed right after, and the
    core keeps its keys in wasm memory until the database is disposed. SQLite's
    heap shares that memory, so a memory-disclosure bug in SQLite could reach the
    keys, where with the TypeScript codec it could reach plaintext but not the
    key. After a trap, no C can run to wipe them, so they stay until the instance
    ends.
  - A trap reaches the caller as the trap itself, also from a `File` or
    `EncryptedFile` open, which threw a `SuppressedError` whose `suppressed` was
    the trap. Disposing a database afterwards throws only the refusal of its
    close, whose `cause` is the trap, also with statements open, and disposing
    its `SahPool` closes the pool's handles instead of throwing.
  - A database shorter than 16 bytes fails with the raw key's error without
    deriving a legacy key.
  - The package ships `THIRD_PARTY_NOTICES.md`, with the notices that the
    licenses of the code in its WebAssembly ask for.

  API changes in `@evolu/sqlite-wasm`:

  - `File` and `EncryptedFile` databases take a `SahPool`. `SqliteVfs` and
    `SqliteEncryptingVfs` are gone, and so is the pool's `registerKey`, with the
    encrypted files `ATTACH` and `VACUUM INTO` could write through it.
    `SqliteEncryptedDatabaseOptions` is gone too: `createEncryptedSqliteDatabase`
    takes `SqliteEncryptedFileDatabaseOptions`.
  - `SqliteError.cause` is a `SqliteFailure`: the pool's `SqliteVfsFailure`, now
    tagged with `type`, or the codec's `SqliteCodecFailure`, whose
    `SqliteCodecError` is a `SqlitePageAuthenticationError`, a
    `SqliteEncryptionUnsupportedError` or a `SqliteRandomSourceError`. A page
    that fails to authenticate is now a `SqliteCodecFailure`, not a
    `SqliteVfsFailure`, so a cause has a `method` only once narrowed.
    `SqliteEncryptionUnsupportedError`, whose `type` is
    `SqliteEncryptionUnsupported`, replaces `SahPoolEncryptionUnsupportedError`,
    whose `type` was `SahPoolEncryptionUnsupported`. `SqliteVfsMethod` lists
    only the methods whose failures the pool records: no longer `xFileControl`,
    which records none now, nor `xAccess`, `xClose`, `xLock`, `xUnlock` and
    `xCheckReservedLock`, which never recorded any.

  ```ts
  import { assertType, type EncryptionKey } from "@evolu/common";
  import {
    SqliteVfsPath,
    type SahPool,
    type SqliteCodecFailure,
    type SqliteEncryptedFileDatabaseOptions,
    type SqliteEncryptionUnsupportedError,
    type SqliteError,
    type SqliteFailure,
    type SqliteVfsFailure,
    type SqliteVfsMethod,
  } from "@evolu/sqlite-wasm";
  // @ts-expect-error SqliteVfs is no longer exported; File databases take a SahPool.
  import type { SqliteVfs as _SqliteVfs } from "@evolu/sqlite-wasm";
  // @ts-expect-error SqliteEncryptingVfs is no longer exported; EncryptedFile databases take a SahPool.
  import type { SqliteEncryptingVfs as _SqliteEncryptingVfs } from "@evolu/sqlite-wasm";
  // @ts-expect-error SqliteEncryptedDatabaseOptions is no longer exported; use SqliteEncryptedFileDatabaseOptions.
  import type { SqliteEncryptedDatabaseOptions as _SqliteEncryptedDatabaseOptions } from "@evolu/sqlite-wasm";
  // @ts-expect-error SahPoolEncryptionUnsupportedError is no longer exported; use SqliteEncryptionUnsupportedError.
  import type { SahPoolEncryptionUnsupportedError as _SahPoolEncryptionUnsupportedError } from "@evolu/sqlite-wasm";

  // @ts-expect-error A SahPool has no registerKey: only a database it opens is keyed.
  type _RegisterKey = SahPool["registerKey"];

  // createEncryptedSqliteDatabase takes these options, with the pool itself.
  const _options = (
    pool: SahPool,
    key: EncryptionKey,
  ): SqliteEncryptedFileDatabaseOptions => ({
    type: "EncryptedFile",
    vfs: pool,
    path: SqliteVfsPath.orThrow("/evolu1.db"),
    key,
  });

  // A cause can be the codec's, which has no method, so narrow it first.
  const _failedMethod = (error: SqliteError): SqliteVfsMethod | null => {
    // @ts-expect-error A SqliteCodecFailure has no method.
    const _isWrite = error.cause?.method === "xWrite";
    return error.cause?.type === "SqliteVfsFailure" ? error.cause.method : null;
  };

  // @ts-expect-error The pool no longer records xFileControl failures.
  const _fileControl: SqliteVfsMethod = "xFileControl";
  // The methods whose failures the pool records.
  assertType<
    SqliteVfsMethod,
    | "xOpen"
    | "xDelete"
    | "xRead"
    | "xWrite"
    | "xTruncate"
    | "xSync"
    | "xFileSize"
  >();

  assertType<SqliteError["cause"], SqliteFailure | null>();
  assertType<SqliteFailure, SqliteVfsFailure | SqliteCodecFailure>();
  assertType<
    SqliteEncryptionUnsupportedError["type"],
    "SqliteEncryptionUnsupported"
  >();
  ```

### Patch Changes

- 7cc5d91: Added links to bundled source, API documentation, and tests

  Package READMEs now point to the source, JSDoc documentation, usage examples,
  and tests included in the installed version. They also clarify that application
  imports use public package exports, since tests may import internal helpers.

- Updated dependencies [bc4578a]
- Updated dependencies [7cc5d91]
- Updated dependencies [be5afcb]
  - @evolu/common@8.23.3

## 3.54.0-build2

### Minor Changes

- 4493e77: Added iterate to read a query's rows one at a time

  `SqliteStatement.iterate` and `SqliteDatabase.iterate` pass a query's rows to a
  callback one at a time and stop when it returns `false`, so SQLite steps no row
  after that one, while `run` collects every row. A query whose plan sorts, groups
  or aggregates still reads all its input before the first row, so stream a query
  that an index orders.

  The statement is reset also when a step fails or the callback throws, and the
  throw is rethrown without breaking the instance. When the callback stops a write
  with RETURNING early, the reset commits it, and `iterate` returns that commit's
  error. The callback can run other statements of the same database, but not run,
  iterate or dispose the statement it iterates. `SqliteDatabase.iterate` prepares
  and finalizes a statement of its own.

  ```ts
  import {
    assertType,
    getOrThrow,
    type Result,
    type SqliteRow,
  } from "@evolu/common";
  import type {
    SqliteDatabase,
    SqlitePrepareError,
    SqliteRunError,
    SqliteStatement,
  } from "@evolu/sqlite-wasm";

  // Reads at most `count` rows, however many the query returns.
  const readFirstRows = (
    statement: SqliteStatement,
    count: number,
  ): ReadonlyArray<SqliteRow> => {
    const rows: Array<SqliteRow> = [];
    if (count > 0)
      getOrThrow(
        statement.iterate([], (row) => {
          rows.push(row);
          return rows.length < count;
        }),
      );
    return rows;
  };

  assertType<
    ReturnType<SqliteStatement["iterate"]>,
    Result<void, SqliteRunError>
  >();
  assertType<
    ReturnType<SqliteDatabase["iterate"]>,
    Result<void, SqlitePrepareError | SqliteRunError>
  >();
  assertType<ReturnType<typeof readFirstRows>, ReadonlyArray<SqliteRow>>();
  ```

### Patch Changes

- Updated dependencies [4493e77]
- Updated dependencies [4aa2c7a]
  - @evolu/common@8.21.0

## 3.54.0-build1

### Minor Changes

- 74c309b: Updated SQLite to 3.54.0

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

## 3.53.4-build2

### Patch Changes

- 88840c2: Computed the build guard hash with fnv1a32 from @evolu/common

  The build guard that checks a loaded binary against the pinned build now hashes
  with `fnv1a32` from `@evolu/common` instead of its own copy of FNV-1a, so this
  release requires the `@evolu/common` release that adds `fnv1a32`. The hash and
  `sqliteWasmBuildHash` are unchanged.

- Updated dependencies [e803b34]
- Updated dependencies [88840c2]
- Updated dependencies [87f0678]
- Updated dependencies [ea707cc]
- Updated dependencies [74cc737]
- Updated dependencies [fbdb9a4]
- Updated dependencies [e803b34]
- Updated dependencies [b599e0d]
- Updated dependencies [c3fa5c7]
- Updated dependencies [c3fa5c7]
- Updated dependencies [74cc737]
  - @evolu/common@8.20.0

## 3.53.4-build1

### Major Changes

- ce3b88b: Switched to Evolu's own SQLite build and TypeScript layer

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
  import {
    assertEqual,
    assertType,
    createRun,
    getOrThrow,
  } from "@evolu/common";
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

### Patch Changes

- Updated dependencies [ce3b88b]
  - @evolu/common@8.19.0
