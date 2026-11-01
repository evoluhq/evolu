# @evolu/web

## 3.7.0

### Minor Changes

- f4ed930: Implemented Evolu.deleteDatabase

  `deleteDatabase` was declared but threw, so an app couldn't wipe its local data, for example when a user resets the app or removes an account from a device ([#676](https://github.com/evoluhq/evolu/issues/676)). It now deletes the instance's local database on this device and resolves once the database's files are gone, which lets the app wait for the wipe to finish.

  The deletion runs after the mutations and requests made before it. Then every instance of the database disposes itself, in every tab, and the requests they made after the deletion are dropped. Each instance, including the one that asked, first calls `EvoluConfig.onDatabaseDeleted`, which is now called, or reloads the app when it's not set, because rendering a disposed instance throws. Until the app reloads or provides another instance, `@evolu/react` keeps the components that use the disposed one suspended instead of throwing, and other bindings can check the new `isDatabaseDeleted`. On the web, the deletion also removes the database's OPFS directory, whose name would show which owner used the device. A database kept in memory, as with `memoryOnly`, has a name of its own and no files, so deleting it leaves a stored database of the same owner alone.

  It deletes only this device's copy. Changes not yet synced are lost, and an instance created later with the same owner opens a new, empty database, which its transports fill again from relays, so forget the owner first if its data must not come back.

  `deleteDatabase` now returns a promise of a `Result` instead of `void`. It fails with `DatabaseHeldError` when another context keeps holding the files, and with `UnknownError` when the platform fails to delete them. After an `UnknownError`, the instances keep working, and calling it again deletes again. After a `DatabaseHeldError`, the database's next worker waits for the files as every startup does, and Evolu refuses the database when they stay held. It fails with the new `EvoluDisposedError` when its instance is disposed first, so await it before disposing. `exportDatabase` already rejected with that error, which is now a declared type.

  ```ts
  import {
    assertType,
    type DeleteDatabaseError,
    type Evolu,
    type Result,
  } from "@evolu/common";

  const deleteLocalData = (evolu: Evolu) => evolu.deleteDatabase();

  assertType<
    Awaited<ReturnType<typeof deleteLocalData>>,
    Result<void, DeleteDatabaseError>
  >();
  ```

  Custom platform integrations: `DbWorkerDeps` now requires `deleteDatabaseFiles`, a `DeleteDatabaseFiles` that deletes a database's files by name. `@evolu/web` exports its `createDeleteDatabaseFiles`.

### Patch Changes

- d6838fb: Kept a database in memory apart from the stored database of the same owner

  Instances of one `appName` and `appOwner` shared one database whatever their mode, and it kept the mode of the instance that opened it ([#742](https://github.com/evoluhq/evolu/issues/742)). A `memoryOnly` instance created while a stored one was open, or within a few seconds after it was disposed, as an app does to stop keeping data on the device, wrote to the stored database, local-only tables included. A stored instance created while a `memoryOnly` one was open lost the changes that hadn't synced when the memory database closed.

  A database kept in memory, with `memoryOnly` or where the platform offers no persistent storage, as in Safari's Private Browsing, now has a name of its own, `${appName}-${createIdFromString("MemoryDatabase", appOwner.id)}`, so it never shares a local database with the stored one. `Evolu.name` changes for such instances. Instances kept in memory still share one memory database across tabs, as stored instances share the stored one. Both still sync the owner, so while a stored instance of the owner syncs on the device, it stores the changes made in memory too; to keep nothing on the device, dispose it first.

  Each tab now checks whether the browser offers persistent storage when it creates an instance without `memoryOnly`, instead of the shared worker checking once for all its tabs, and `evolu.devicePersistence` resolves when `createEvolu` does.

  Update `@evolu/web` and `@evolu/react-native` together with `@evolu/common`: with an older one, `createEvolu` throws because its deps have no `getDevicePersistence`, and an older `@evolu/common` cannot start the new web shared worker.

  Custom platform integrations: `EvoluPlatformDeps` now requires `getDevicePersistence`, the `DevicePersistenceDep` that `SharedWorkerDeps` no longer takes, and the `OnDevicePersistence` message is gone. Local-first APIs aren't stable yet, so these incompatible changes ship as a patch; see [Updating](https://www.evolu.dev/docs/local-first#updating).

- Updated dependencies [b352b38]
- Updated dependencies [f4ed930]
- Updated dependencies [d6838fb]
  - @evolu/common@8.26.0
  - @evolu/sqlite-wasm@3.54.1-build3

## 3.6.5

### Patch Changes

- d9cfd60: Reported an encrypted database with an altered page size as tampered

  Evolu authenticates every page of an encrypted database, except the page size in the first page's header, which SQLite reads before anything is decrypted, so Evolu checks it separately. Some reads skipped that check, so a database whose page size someone had altered failed to open with an error that had no cause. It now fails as any tampered database does, with `SQLITE_NOTADB` and a `SqlitePageAuthenticationError` cause, and a hot journal altered this way is treated as any other tampered journal. Only someone who can already write an app's files can alter the page size, so databases Evolu wrote aren't affected.

- Updated dependencies [d9cfd60]
  - @evolu/sqlite-wasm@3.54.1-build3

## 3.6.4

### Patch Changes

- Updated dependencies [1095401]
- Updated dependencies [1095401]
  - @evolu/sqlite-wasm@3.54.1-build2

## 3.6.3

### Patch Changes

- 1c89914: Replaced sql.prepared with Sqlite.prepared, which keeps statements per database

  `sqlite.prepared` is a tagged template that runs SQL as `sql` builds it, on a statement the database prepares on the first call and finalizes when it is disposed. The statement belongs to the template and the SQL of its `sql.identifier` and `sql.raw` fragments, so later calls build no SQL text. Pass fragments from a bounded set, such as the tables and columns of a schema, because each combination keeps a statement. Evolu's hot statements, except the one that streams timestamps during sync, use it and no longer build and hash their text. Measured with better-sqlite3, which this release replaces in `@evolu/nodejs`, a fresh client in Node receiving 20,000 todos from a relay used about 14% less CPU and 20,000 local inserts about 13% less, and with the web's SQLite in Node on an in-memory database, inserting and uploading 20,000 todos used about 12% less.

  ```ts
  import { assertEqual, sql, testSetupSqlite } from "@evolu/common";
  import { createNodeJsSqliteDriver } from "@evolu/nodejs";

  await using setup = await testSetupSqlite({
    createSqliteDriver: createNodeJsSqliteDriver,
  });
  const { sqlite } = setup;
  sqlite.exec(sql`create table todo (title text);`);

  // @ts-expect-error sql.prepared was removed; use sqlite.prepared.
  type _SqlPrepared = typeof sql.prepared;
  sqlite.prepared`insert into todo (title) values (${"Buy milk"});`;

  assertEqual(
    sqlite.prepared<{ title: string }>`select title from todo;`.rows,
    [{ title: "Buy milk" }],
  );
  ```

  A query passed as data, such as one made with `createQuery(…, { prepare: true })` and run in the database worker, keeps the `prepare` option. `sqlite.exec` now keeps the statement of such a query per database, by its SQL text, on every driver.

  Drivers no longer cache statements. `SqliteDriver` gained `prepare`, which returns a `SqliteDriverStatement` that runs many times until its owner disposes it, and `exec` runs every query on a statement of its own, also on Node.js, whose driver used to keep every query. `createPreparedStatementsCache` and `PreparedStatements` are removed. Update `@evolu/web`, `@evolu/react-native` and `@evolu/nodejs` together with `@evolu/common`, because older drivers import the removed `createPreparedStatementsCache` and have no `prepare`. A custom `SqliteDriver` drops its cache and implements `prepare`:

  ```ts
  import {
    assertEqual,
    constVoid,
    sql,
    type SqliteDriver,
    type SqliteRow,
  } from "@evolu/common";

  const rows: ReadonlyArray<SqliteRow> = [{ a: 1 }];

  // @ts-expect-error A SqliteDriver must implement prepare.
  const _driverBefore: SqliteDriver = {
    exec: () => ({ rows, changes: 0 }),
    iterate: constVoid,
    export: () => new Uint8Array(),
    deleteDatabase: constVoid,
    [Symbol.dispose]: constVoid,
  };

  const driver: SqliteDriver = {
    exec: () => ({ rows, changes: 0 }),
    prepare: () => ({
      exec: () => ({ rows, changes: 0 }),
      [Symbol.dispose]: constVoid,
    }),
    iterate: constVoid,
    export: () => new Uint8Array(),
    deleteDatabase: constVoid,
    [Symbol.dispose]: constVoid,
  };

  using statement = driver.prepare(sql`select a from t;`.sql);
  assertEqual(statement.exec([]).rows, [{ a: 1 }]);
  ```

  Transactions run `begin`, `commit`, and `rollback` on prepared statements.

  To migrate:

  - `sql.prepared` is removed. Run SQL where it is written with `sqlite.prepared`, and give a query passed as data, such as one made with `createQuery`, the `prepare` option.
  - A custom `Sqlite`, such as a test fake or a wrapper, implements `prepared`. A wrapper that spreads a `Sqlite` and replaces only `exec` still compiles, but it no longer sees Evolu's hot statements, which run on `prepared`.
  - Statements run with `sqlite.prepared` take no `logQueryExecutionTime` or `logExplainQueryPlan` option.
  - On Node.js, a query keeps its statement only with the `prepare` option, because its driver no longer keeps every query.

  ```ts
  import {
    assertEqual,
    sql,
    testSetupSqlite,
    type Sqlite,
    type SqliteQuery,
    type SqliteRow,
    type SqlTemplateParam,
  } from "@evolu/common";
  import { createNodeJsSqliteDriver } from "@evolu/nodejs";

  await using setup = await testSetupSqlite({
    createSqliteDriver: createNodeJsSqliteDriver,
  });
  const { sqlite } = setup;
  const executed: Array<string> = [];
  const exec = <R extends SqliteRow = SqliteRow>(query: SqliteQuery) => {
    executed.push(query.sql);
    return sqlite.exec<R>(query);
  };

  // @ts-expect-error A Sqlite must implement prepared.
  const _loggingBefore: Sqlite = {
    exec,
    iterate: sqlite.iterate,
    transaction: sqlite.transaction,
    export: sqlite.export,
    [Symbol.asyncDispose]: () => sqlite[Symbol.asyncDispose](),
  };

  const logging: Sqlite = {
    ...sqlite,
    exec,
    prepared: <R extends SqliteRow = SqliteRow>(
      strings: TemplateStringsArray,
      ...parameters: Array<SqlTemplateParam>
    ) => {
      executed.push(sql(strings, ...parameters).sql);
      return sqlite.prepared<R>(strings, ...parameters);
    },
  };

  logging.exec(sql`create table todo (title text);`);
  logging.prepared`insert into todo (title) values (${"Buy milk"});`;

  assertEqual(executed, [
    "create table todo (title text);",
    "insert into todo (title) values (?);",
  ]);
  ```

- 7cc5d91: Added links to bundled source, API documentation, and tests

  Package READMEs now point to the source, JSDoc documentation, usage examples,
  and tests included in the installed version. They also clarify that application
  imports use public package exports, since tests may import internal helpers.

- 89b626c: Moved database encryption into Evolu's SQLite core and updated SQLite to 3.54.1

  `@evolu/sqlite-wasm` 3.54.1-build1, which `@evolu/web` now uses, encrypts
  databases with Evolu's SQLite core, Evolu's own C code inside the WebAssembly.
  It's one SQLite for every Evolu platform: the same C compiles natively for
  React Native in `@evolu/react-native` and for Node.js in `@evolu/nodejs`, so
  every platform gets one codec, one behavior after a crash and one set of
  tests. Until now, the web encrypted in TypeScript, React
  Native relied on the SQLCipher that expo-sqlite vendors, and Node.js didn't
  encrypt at all.

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
    `@evolu/sqlite-wasm` is 39,956 bytes of JavaScript minified by esbuild,
    13,493 with `gzip -9`, instead of 194,844 and 67,501. The package has no
    runtime dependencies now that `@awasm/noble` is gone, and a worker that
    encrypts no longer allocates its 30 MiB of WebAssembly memory. The wasm grew
    from 677,479 to 720,542 bytes, from 305,733 to 323,059 with `gzip -9`.
  - SQLite 3.54.1 fixes a regression of 3.54.0 that made a statement with a
    `column = ?` term and an ORDER BY, GROUP BY, `min`, `max`, DISTINCT or a join
    prepare again on every run, as eleven of Evolu's storage queries did. It also
    fixes a possible heap-buffer overflow on 32-bit builds.
  - A database that `@evolu/web` 3.0.0 to 3.4.1 encrypted, whose salt a crash
    tore, opens with the salt its hot journal stores.
  - Opening the pool no longer empties a database whose slot header is torn, as
    a tab killed between the two header writes of SQLite's own pool leaves it.
    Such a file keeps its path, as in SQLite's fix of the same bug
    ([forum report](https://sqlite.org/bugs/forumpost/d1c20a0b1a)). A header
    read that returns fewer bytes than the slot holds, as Safari's has for a
    header that is there, now fails the open with `SahPoolSetupError` and
    changes nothing, where 3.53.4-build1 to 3.54.0-build2 read it as a free
    slot and truncated the database.
  - Any other read that returns fewer bytes than the file holds, which is how
    the File System Standard reports a failed read, now fails as an I/O error:
    the failed statement, open or export has the pool's `SqliteVfsFailure` with
    a `SqliteShortReadError` as its cause, and `SahPool.read` fails with a
    `SqliteVfsIoError`. Earlier builds, like SQLite's own pool, took it for the
    end of the file, so SQLite read and exported zeros as data, and since
    3.53.4-build1, which rolls hot journals back, a hot journal read short was
    taken for none, keeping a half-applied transaction, or rolled back only in
    part and deleted. SQLite declined this change for its own pool in the same
    thread.

  Constant time has a price, paid on writes. On an Apple M5, writing an 8 KiB page
  with its journal record takes about 300 µs instead of about 100 with
  table-based AES, in Chromium, Firefox and WebKit alike. Right after the
  storage idled, as in an app, encryption adds 2.5 to 2.7 ms to a small commit
  instead of 1.4 to 1.9, and
  large write transactions take about twice as long in Chromium. Back-to-back
  small commits in Chromium on macOS cost 2 to 4 ms more each, mostly in slower
  flushes: Chromium flushes OPFS with `F_BARRIERFSYNC`, which on macOS slows down
  after pauses in storage activity of about 100 to 200 µs, and encryption makes
  such pauses. Reads pay less: decrypting a page takes 60 to 70 µs instead of 40
  to 60, and a page SQLite has cached costs nothing extra. We chose constant time
  because protecting the key matters more than raw speed, and the price is
  temporary: once SQLCipher 5.0 is released, Evolu's core switches to its
  AES-256-GCM page format ([#757](https://github.com/evoluhq/evolu/issues/757)),
  whose encryption should cost about what decryption costs now.

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
    functions, Evolu's timestamp storage in C, which Evolu's sync now calls (see
    `@evolu/common`), and `evolu_core_version()`.
  - Every connection is defensive (`SQLITE_DBCONFIG_DEFENSIVE`), so SQL can't
    corrupt its database: it ignores `PRAGMA writable_schema = ON`,
    `journal_mode = OFF` and `schema_version = N`.
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

- Updated dependencies [1c89914]
- Updated dependencies [bc4578a]
- Updated dependencies [7cc5d91]
- Updated dependencies [89b626c]
- Updated dependencies [72177aa]
- Updated dependencies [1c89914]
- Updated dependencies [5c97752]
- Updated dependencies [be5afcb]
- Updated dependencies [fd3565e]
- Updated dependencies [f3a8831]
- Updated dependencies [f43e20e]
- Updated dependencies [1813248]
  - @evolu/common@8.24.0
  - @evolu/sqlite-wasm@3.54.1-build1

## 3.6.2

### Patch Changes

- 7e84eff: Fixed createEvoluDeps throwing in Safari when the app didn't call installPolyfills

  Safari doesn't have `DisposableStack` yet, and `createEvoluDeps` used it before
  anything installed a polyfill, so a web app that didn't call `installPolyfills`
  first threw on start in browsers without it. `createEvoluDeps` now installs
  Evolu's polyfills itself where the browser lacks them: the resource-management
  ones, such as `DisposableStack`, and the `Map` and `WeakMap` upsert methods.
  Apps that already call `installPolyfills` don't need to change anything.

- Updated dependencies [588456f]
  - @evolu/common@8.22.4
  - @evolu/sqlite-wasm@3.54.0-build2

## 3.6.1

### Patch Changes

- 4493e77: Stopped sync from reading timestamps it does not use

  To answer a Timestamps range, sync reads the owner's timestamps in order until
  its frame is full, but storage read every timestamp of the range up front. So
  every round of an initial download read the rest of the owner again, and a relay
  answering a device with nothing stored spent time and memory that grew with the
  owner, about 700 ms for 900,000 changes. Storage now streams the timestamps and
  stops at the last one sync uses. That answer takes about 40 ms at any owner
  size, and syncing 20,000 changes reads about 40,000 rows instead of 138,000 on
  the relay when downloading, and instead of 121,000 on the client when uploading.

  `Sqlite` and `SqliteDriver` gained `iterate`, which passes a query's rows to a
  callback one at a time until it returns `false`. The callback can read the
  database but must not write it. Update `@evolu/web`, `@evolu/react-native` and
  `@evolu/nodejs` together with `@evolu/common`, because sync fails with an older
  driver. A custom `SqliteDriver` must implement `iterate` on a statement of its
  own, because the callback can run queries:

  ```ts
  import {
    assertEqual,
    constVoid,
    sql,
    type SqliteDriver,
    type SqliteRow,
  } from "@evolu/common";

  const rows: ReadonlyArray<SqliteRow> = [{ a: 1 }, { a: 2 }, { a: 3 }];

  // @ts-expect-error A SqliteDriver must implement iterate.
  const _driverBefore: SqliteDriver = {
    exec: () => ({ rows, changes: 0 }),
    export: () => new Uint8Array(),
    deleteDatabase: constVoid,
    [Symbol.dispose]: constVoid,
  };

  const driver: SqliteDriver = {
    exec: () => ({ rows, changes: 0 }),
    iterate: (_query, onRow) => {
      for (const row of rows) if (!onRow(row)) break;
    },
    export: () => new Uint8Array(),
    deleteDatabase: constVoid,
    [Symbol.dispose]: constVoid,
  };

  const passed: Array<SqliteRow> = [];
  driver.iterate(sql`select a from t;`, (row) => {
    passed.push(row);
    return passed.length < 2;
  });
  assertEqual(passed, [{ a: 1 }, { a: 2 }]);
  ```

- Updated dependencies [4493e77]
- Updated dependencies [4493e77]
- Updated dependencies [4aa2c7a]
  - @evolu/sqlite-wasm@3.54.0-build2
  - @evolu/common@8.21.0

## 3.6.0

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

### Patch Changes

- Updated dependencies [74c309b]
  - @evolu/sqlite-wasm@3.54.0-build1

## 3.5.3

### Patch Changes

- 0bc8a3d: Stopped a crashed shared worker from handling later messages

  A panic of Evolu's shared worker closed it only after its cleanup, which can
  wait for a database that is still opening. Until then, creating an Evolu
  instance made the worker throw "Cannot use a disposed object.", which replaced
  the panic's error in every tab's `evoluError`, and a tab opened meanwhile
  connected to the failed worker. The worker now closes as soon as it panics, so
  it drops later messages.

- 2d00a74: Reported a database whose worker failed instead of waiting for it forever

  When a database's worker failed, every instance of the database waited forever:
  `evoluError` stayed `null`, and queries, mutations, and exports never completed.
  At startup, which could also leave `devicePersistence` pending, this happened
  when the SQLite driver threw, for example in an Expo build without SQLCipher;
  when the file could not be read, for example because it was corrupt or
  unencrypted while SQLCipher was on; or when SQLite's wasm failed to load. Later
  it happened when SQLite failed a query or an export, or after a defect while
  applying sync. Only the platform's error reporter saw the error. In React
  Native, a failed query's exception escaped a timer, which React Native treats as
  fatal. On the web, a database also waited forever, with no error reaching the
  app, when its worker's script failed to load, for example after a deployment
  removed it while a tab still ran the previous build.

  A worker that throws while it starts or handles a request now refuses its
  database, and on the web, the tab that hosts a worker whose script fails to load
  refuses the database for it. The refusal carries an `UnknownError` of the error,
  so every tab of the database, including tabs opened later, gets it as
  `evoluError`, `devicePersistence` resolves, and sync state shows the database as
  `Refused`. Other databases keep working. As for other refusals, queries and
  exports stay pending until the instance is disposed, and mutations are not
  stored, so show `evoluError` outside any query-loading boundary and ask the user
  to close all the app's tabs. Once every instance of the database is disposed and
  Evolu disposes it when idle, creating an instance again retries the start. A
  mutation that SQLite fails is still answered with an `UnknownError`, and its
  database keeps working.

  `RefusedSyncTenant.error` can now be an `UnknownError`, so a switch over it
  needs that case. A switch without it no longer compiles:

  ```ts
  import { assertEqual, createUnknownError, Name } from "@evolu/common";
  import type { RefusedSyncTenant } from "@evolu/common/local-first";

  // @ts-expect-error A switch without the UnknownError case does not return a string for every refusal.
  const _refusalMessageBefore = (tenant: RefusedSyncTenant): string => {
    // oxlint-disable-next-line typescript/switch-exhaustiveness-check -- The switch from before, which TypeScript rejects.
    switch (tenant.error.type) {
      case "DatabaseHeldError":
        return "Close the app's other tabs or restart the browser.";
      case "UnsupportedDbVersionError":
        return "Update the app.";
    }
  };

  const refusalMessage = (tenant: RefusedSyncTenant): string => {
    switch (tenant.error.type) {
      case "DatabaseHeldError":
        return "Close the app's other tabs or restart the browser.";
      case "UnknownError":
        return "Close all tabs of this app and open it again.";
      case "UnsupportedDbVersionError":
        return "Update the app.";
    }
  };

  assertEqual(
    refusalMessage({
      type: "Refused",
      name: Name.orThrow("app"),
      error: createUnknownError(new Error("No SQLCipher.")),
    }),
    "Close all tabs of this app and open it again.",
  );
  ```

- Updated dependencies [e7c0b5a]
- Updated dependencies [2d00a74]
  - @evolu/common@8.20.3
  - @evolu/sqlite-wasm@3.53.4-build2

## 3.5.2

### Patch Changes

- bfba9bf: Removed runtime checks that types already guarantee

  Functions no longer validate again at runtime what their parameter types
  already prove. A value that breaks its type can only come from a wrong cast or
  plain JavaScript, so only such values behave differently:

  - `getOk` and `Run.ok` no longer assert that the Result is Ok, so an Err gives
    `undefined`.
  - `retry` and `repeat` no longer validate the delay a Schedule returns. A
    fractional delay goes to the timer unchanged, and with `createTime` an
    infinite one waits until the Run is aborted. `testCreateTime` throws for both.
  - `withDefault` no longer rejects a `strategy` other than `"preserve"`. Such a
    value, including `"replace"`, decodes like `"preserve"`, except inside
    `partial`, where it replaces.
  - `percentageToRatio`, `computeBalancedBuckets`, `fibonacciAt`, and
    `hrDurationToMillis` no longer validate their results.
  - `exponential`, `linear`, `fibonacci`, `jitter`, and `compensate` saturate a
    delay computed from a wrongly typed value instead of throwing, and `fixed` and
    `windowed` return it unchanged. `elapsed`, `during`, `maxElapsed`,
    `resetScheduleAfter`, `fixed`, `windowed`, and `compensate` take a `NaN`
    reading from a wrongly implemented `Time` as the maximum elapsed time.
    `modifyDelay` still throws when its function returns `NaN`.
  - `createEvolu` no longer validates the name it builds from `appName`, and the
    web SQLite driver no longer validates the directory name it builds from a
    database name.

  Checks that keep a wrongly typed value from hanging or silently breaking a
  limit stay: `each`, `race`, `any`, `firstN`, and `firstNSettled` reject an
  empty array, Semaphores reject permit counts below 1, and `durationToMillis`
  rejects a malformed duration.

  The decoder that `json` returns still throws for JSON text that does not match
  the Type, now with the validation error as the cause.

- Updated dependencies [bfba9bf]
- Updated dependencies [609d399]
  - @evolu/common@8.20.1
  - @evolu/sqlite-wasm@3.53.4-build2

## 3.5.1

### Patch Changes

- Updated dependencies [e803b34]
- Updated dependencies [88840c2]
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
  - @evolu/sqlite-wasm@3.53.4-build2

## 3.5.0

### Minor Changes

- ce3b88b: Reported a database that another context keeps holding

  On the web, a database worker that ended without closing its database, for
  example because its tab closed or crashed, can hold the database's files for a
  few seconds. A browser can hold them until it restarts. Chromium does that on
  Windows after site data is cleared. Opening such a database used to wait without
  a bound and warn after 5 seconds.

  Now the database worker tries the files again after 50 ms and then doubles the
  delay each time, up to a second. If the files are still held 10 seconds after
  the first attempt started, the database refuses to start with the new
  `DatabaseHeldError`. Every tab of the database gets the error as its
  `evoluError`, and the database's sync tenant is `Refused`, until all its tabs
  release the database. Ask the user to close the app's other tabs or restart the
  browser, then reload the app.

  `EvoluError` includes `DatabaseHeldError`, so a switch over its type needs a
  case for it.

  The waiting moved from `createWasmSqliteDriver` to the database worker. The
  worker waits for the files before it opens the database, with
  `waitForDatabaseRelease`, a new optional dependency of `startDbWorker` that
  `@evolu/web` creates with `createWaitForDatabaseRelease`. A database worker of
  your own should pass both the driver and `waitForDatabaseRelease`, created from
  the same dependencies, as Evolu's does. Other platforms do not wait.

  ```ts
  import {
    assertEqual,
    Name,
    type CreateSqliteDriverDep,
    type EvoluError,
  } from "@evolu/common";
  import type { WaitForDatabaseReleaseDep } from "@evolu/common/local-first";
  import {
    createRun,
    createWaitForDatabaseRelease,
    createWasmSqliteDriver,
    loadSqliteWasm,
  } from "@evolu/web";

  const toMessage = (error: EvoluError): string => {
    switch (error.type) {
      case "DatabaseHeldError":
        return "Close this app's other tabs or restart the browser, then reload.";
      case "OtherBuildRunningError":
        return "Close this app's tab with a different version.";
      case "UnknownError":
        return "Something went wrong.";
      case "UnsupportedDbVersionError":
        return "Update this app.";
    }
  };

  assertEqual(
    toMessage({ type: "DatabaseHeldError", name: Name.orThrow("App") }),
    "Close this app's other tabs or restart the browser, then reload.",
  );

  // The switch from before, without DatabaseHeldError, no longer compiles.
  const _toMessageBefore = (
    error: EvoluError,
    // @ts-expect-error Without a case for DatabaseHeldError, not every EvoluError returns a string.
  ): string => {
    // oxlint-disable-next-line typescript/switch-exhaustiveness-check -- The switch from before, which TypeScript rejects.
    switch (error.type) {
      case "OtherBuildRunningError":
        return "Close this app's tab with a different version.";
      case "UnknownError":
        return "Something went wrong.";
      case "UnsupportedDbVersionError":
        return "Update this app.";
    }
  };

  // In a database worker of your own, which has OPFS sync access handles.
  const _createWorkerSqliteDeps = (): CreateSqliteDriverDep &
    WaitForDatabaseReleaseDep => {
    const run = createRun();
    const deps = {
      opfsRoot: navigator.storage,
      sqliteWasmLoad: run(loadSqliteWasm),
      subtleCrypto: crypto.subtle,
    };
    return {
      createSqliteDriver: createWasmSqliteDriver(deps),
      waitForDatabaseRelease: createWaitForDatabaseRelease(deps),
    };
  };
  ```

- ce3b88b: Switched to SQLite 3.53.4 built by Evolu

  `@evolu/web` now runs SQLite 3.53.4 from Evolu's own `@evolu/sqlite-wasm`. Evolu
  compiles it to WebAssembly and adds its own TypeScript layer and encryption.
  Until now, `@evolu/web` used `@evolu/sqlite-wasm` 2.2.4, which packaged SQLite
  3.50.4 with SQLite3 Multiple Ciphers and SQLite's JavaScript.

  The binary is 669,403 bytes, 302,491 with `gzip -9`, down from 1,036,167 and
  461,020. No other project builds it anymore. Evolu builds it from SQLite's
  source, reproducibly, so there is less third-party code to trust. The README of
  `@evolu/sqlite-wasm` explains why Evolu builds its own SQLite and what the
  binary contains.

  The encryption now runs in JavaScript and WebAssembly outside SQLite, and it
  costs memory. `@awasm/noble`, which encrypts, gives its AES and SHA-512 code
  fixed WebAssembly memories of 10 and 20 MiB, so a database worker with an
  encrypted database uses about 30 MiB more. Every persistent Evolu database is
  encrypted.

  We compared Evolu's SQLite with 2.2.4 using
  [Evolu's SQLite benchmark](https://github.com/evoluhq/evolu/tree/main/bench/sqlite-wasm).
  It times wa-sqlite's 16 benchmark workloads, taken from SQLite's classic speed
  comparison, on OPFS in Chromium 153, Firefox 155 and WebKit 26.6. We ran it on
  an Apple M5. Its README says how to run it. The figures below are medians of
  ratios taken within each round, and each range covers two runs of the whole
  benchmark.

  An encrypted database is about as fast in Chromium and Firefox and takes 7% to
  8% longer in WebKit.

  Evolu's SQLite writes as many bytes as 2.2.4, encrypted or not, and flushes OPFS
  5 times per commit instead of 6. Without encryption, 1,000 single-row commits
  take 11% to 12% less time in Firefox, 13% to 19% less in WebKit and about the
  same in Chromium. The other workloads together take 1% to 5% longer in every
  engine.

  So WebKit's difference comes from the encryption, which now runs outside SQLite
  and costs more there than SQLite3 Multiple Ciphers did. It costs a little more
  in Firefox too, but the faster commits make up for it. In Chromium, the same
  encryption costs about as much as SQLite3 Multiple Ciphers did, so the
  difference comes from how WebKit runs it, not from the design, and we expect it
  to shrink.

  That is the price of a smaller supply chain. SQLite is now plain SQLite, built
  by Evolu from sqlite.org's source, and the only code that encrypts is
  `@awasm/noble`, which has no dependencies of its own. It comes from Paul Miller.
  `@evolu/common` already depends on his `@noble/ciphers`, `@noble/hashes` and
  `@scure/bip39`, so encrypting databases adds no new party to trust.

  Existing databases open unchanged in every browser. They stay in the same OPFS
  directory, `.<name>`, in the same file and the same format. A database that
  `@evolu/web` 3 encrypted keeps the key that 2.2.4 derived from the encryption
  key. Because of a
  [bug](https://github.com/utelle/SQLite3MultipleCiphers/issues/218), SQLite3
  Multiple Ciphers 2.2.4 took the key, passed in SQLCipher's raw-key notation, as
  a passphrase. A new database is encrypted with the encryption key itself, so
  `@evolu/web` 3.4.1 and earlier cannot open it. A tab still running an older
  build of the app, or the app downgraded to an older `@evolu/web`, fails to open
  a database this version created.

  A transaction that a closed tab or a crash interrupted is now rolled back when
  the database opens again. The pool of 2.2.4 never rolled one back, so the next
  open could see it half-applied.

  When the browser refuses a write because the site's storage quota is exceeded,
  the error now says that storage is full. The write fails with `SQLITE_FULL`,
  "database or disk is full", instead of the generic `SQLITE_IOERR`, "disk I/O
  error". Evolu writes in transactions. After `SQLITE_FULL` writing the journal,
  SQLite rolls back only the statement, and the error is the `SQLITE_FULL` error.
  After `SQLITE_FULL` writing the database, SQLite rolls back the whole
  transaction, so Evolu's `ROLLBACK` fails too, and the error is a
  `SuppressedError` whose `suppressed` is the `SQLITE_FULL` error.

  An integer in a query result outside JavaScript's safe integer range is now a
  number rounded to the nearest double, as with better-sqlite3, instead of a
  `BigInt`. A number that is not a safe integer is now bound as a `REAL`. 2.2.4
  bound such a number without a fraction as an `INTEGER`. From 2^63 on, that
  stored a wrong value, such as `-9223372036854775808` for 2^63 or `0` for
  `1e300`.

  Text containing a NUL character is now returned whole, and a leading byte order
  mark is kept. 2.2.4 stored such text whole but returned it only up to its first
  NUL and without a leading U+FEFF.

  A query whose SQL contains a NUL character or a lone surrogate now fails instead
  of running. 2.2.4 ignored the SQL after a NUL. It replaced a lone surrogate with
  U+FFFD, or with other characters in the SQL of a query without the `prepare`
  option. Either way, it ran other SQL.

  SQLite changes since 3.50.4 that apps may notice:

  - Floats converted to text keep up to 17 significant digits instead of 15, so
    the text converts back to the same number. This affects `CAST(x AS TEXT)`,
    `||`, `printf`'s `%s` and the JSON functions. So `evoluJsonArrayFrom`,
    `evoluJsonObjectFrom` and `evoluJsonBuildObject` now return a stored `REAL`
    exactly, such as `0.30000000000000004` instead of `0.3`. `CAST(1e15 AS TEXT)`
    is now `'1000000000000000.0'` instead of `'1.0e+15'`.
  - `quote` returns that text for a float too, such as `0.30000000000000004`
    instead of `3.000000000000000445e-01`. Its 19 digits already converted back to
    the same number, except for some very large or very small numbers, from about
    `1e118` and below about `1e-82`. Those now convert back too.
  - SQLite has a new parser depth limit. SQL nested deeper, such as more than
    2,493 nested parentheses or 415 nested subqueries in `FROM`, fails with
    "Recursion limit".
  - `UNION`, `INTERSECT` and `EXCEPT` always sort and merge. When values are equal
    under a collation such as `NOCASE`, a different one of them can be returned.
  - `printf` and `format` with the `#` flag no longer print `-0.00` for a negative
    number that rounds to zero.
  - New SQL includes `json_array_insert`, `jsonb_each` and `jsonb_tree`, and
    `ALTER TABLE` can add and remove `NOT NULL` and `CHECK` constraints.

  SQLite is built in its bare-bones configuration with JSON and the math
  functions. Features that 2.2.4 had and Evolu does not use are gone: FTS5,
  R\*Tree, WAL, the `dbstat`, `sqlite_dbpage`, `sqlite_stmt`, `bytecode` and
  `tables_used` virtual tables, `sqlite_offset`, and `PRAGMA function_list`,
  `module_list` and `pragma_list`. Temporary tables, indexes and sorts always stay
  in memory. If you need any of this, start a
  [discussion](https://github.com/evoluhq/evolu/discussions).

  Bundlers emit the binary from `new URL("../wasm/sqlite3.wasm",
import.meta.url)` in `@evolu/sqlite-wasm`. Vite does not process that URL in a
  dependency it prebundles, so keep `@evolu/sqlite-wasm` in
  `optimizeDeps.exclude`.

  For code that creates the driver itself, `createWasmSqliteDriver` now takes its
  dependencies and returns the `CreateSqliteDriver`. Start `loadSqliteWasm` early,
  so SQLite loads while the worker waits for its database.

  The driver throws errors with SQLite's message, without the
  `SQLITE_…: sqlite3 result code N:` prefix, and with the typed error as `cause`.
  A query without the `prepare` option runs exactly one statement, as with the
  better-sqlite3 driver. `changes` is 0 for a statement that changes nothing, and
  rows are objects without a prototype.

  ```ts
  import { assertType, type CreateSqliteDriver } from "@evolu/common";
  import {
    createRun,
    createWasmSqliteDriver,
    loadSqliteWasm,
  } from "@evolu/web";

  // @ts-expect-error createWasmSqliteDriver is no longer a CreateSqliteDriver.
  const _createSqliteDriver: CreateSqliteDriver = createWasmSqliteDriver;

  // In a dedicated worker, which has OPFS sync access handles.
  const createWorkerSqliteDriver = (): CreateSqliteDriver => {
    const run = createRun();
    return createWasmSqliteDriver({
      opfsRoot: navigator.storage,
      sqliteWasmLoad: run(loadSqliteWasm),
      subtleCrypto: crypto.subtle,
    });
  };

  assertType<typeof createWorkerSqliteDriver, () => CreateSqliteDriver>();
  ```

### Patch Changes

- Updated dependencies [ce3b88b]
- Updated dependencies [ce3b88b]
  - @evolu/common@8.19.0
  - @evolu/sqlite-wasm@3.53.4-build1

## 3.4.1

### Patch Changes

- c8f6576: Fixed Chrome keeping the Evolu instances of a tab in its back-forward cache

  When the user navigated away and Chrome kept the page in its back-forward cache,
  the shared worker kept that tab's Evolu instances until Chrome dropped the page.
  Meanwhile it kept syncing their owners, which other tabs still listed in their
  sync state, and kept rerunning their queries. A tab now releases its instances
  when the page enters the cache, as it already stopped the database workers it
  hosts, and disposing the deps releases them too.

- Updated dependencies [3d51568]
- Updated dependencies [969667e]
- Updated dependencies [7d804cd]
- Updated dependencies [8ad3dec]
- Updated dependencies [6878627]
- Updated dependencies [3d51568]
- Updated dependencies [25b2140]
- Updated dependencies [e2d22a3]
- Updated dependencies [7d804cd]
- Updated dependencies [6878627]
- Updated dependencies [7d804cd]
- Updated dependencies [6878627]
- Updated dependencies [739817f]
- Updated dependencies [6878627]
- Updated dependencies [6878627]
  - @evolu/common@8.18.0

## 3.4.0

### Minor Changes

- 6710da3: Added `evolu.devicePersistence`, which replaced `onStorageUnavailable`

  `evolu.devicePersistence` resolves once the database starts to what Evolu knows
  for sure about keeping it on the device:

  - `Persisted`: the database is the app's own file, as in React Native.
  - `NotPersisted`: it is kept in memory, because the `memoryOnly` option asks for
    it or the browser offers no persistent storage, as in Safari's Private
    Browsing and Firefox's private windows. Changes that have not synced are lost
    when the tab hosting the database closes.
  - `Unknown`: a browser stores it but may delete it, as Chrome's incognito does
    when the session ends, without telling the app.

  Show users a notice for `NotPersisted`, and do not tell them their data is saved
  on the device unless it is `Persisted`. The examples no longer say so.

  Browsers may also delete a site's stored data when disk space runs low,
  including changes that have not synced yet. After the first local change of a
  database whose `devicePersistence` is `Unknown`, the web `createEvoluDeps` now
  asks the browser once per tab with `navigator.storage.persist()` to keep the
  site's data until the user deletes it. Chrome and Safari decide silently.
  Firefox shows a permission prompt, and each tab asks until the user allows it.
  To ask at another moment, or never, pass your own `requestPersistentStorage` to
  the web or React web `createEvoluDeps`.

  The `onStorageUnavailable` option of the web and React web `createEvoluDeps` was
  removed; use `evolu.devicePersistence` instead. A custom platform adapter no
  longer receives the `StorageUnavailable` shared worker message, and its shared
  worker must provide `getDevicePersistence` instead of the optional
  `isPersistentStorageAvailable`.

  The minimal React playground renders this inside a `Suspense` boundary:

  ```tsx
  /**
   * Tells the user when this device doesn't keep their data, and shows nothing
   * otherwise. That happens with the `memoryOnly` option, or where the browser
   * offers no persistent storage, as in Safari's Private Browsing or a Firefox
   * private window. See `DevicePersistence` in `@evolu/common/local-first`.
   */
  const DevicePersistenceNotice: FC = () => {
    // Resolves once the database starts.
    const devicePersistence = use(useEvolu().devicePersistence);
    if (devicePersistence !== "NotPersisted") return null;
    return (
      <p className="mb-4 text-sm text-gray-600">
        Your data isn&apos;t kept on this device. Changes that haven&apos;t
        synced are lost when you close this tab.
      </p>
    );
  };
  ```

  To never ask the browser to keep the site's data:

  ```ts
  import { assertSame, constVoid } from "@evolu/common";
  import type { createEvoluDeps } from "@evolu/web";

  type WebEvoluDepsOptions = NonNullable<Parameters<typeof createEvoluDeps>[0]>;

  const neverAsk: WebEvoluDepsOptions = { requestPersistentStorage: constVoid };

  assertSame(neverAsk.requestPersistentStorage, constVoid);
  ```

### Patch Changes

- Updated dependencies [6710da3]
  - @evolu/common@8.14.0

## 3.3.0

### Minor Changes

- d91b559: Reported uncaught shared worker errors in every tab

  Browsers never pass a shared worker's uncaught errors to a page's error
  handlers, so an unexpected failure of Evolu's shared worker, which can stop all
  its work, left `evoluError` empty. The shared worker now posts each uncaught
  error, unhandled rejection, and Task defect to every tab, which logs it and sets
  it as an `UnknownError` in `evoluError`. An app that forwards `evoluError` to an
  error tracker from each tab reports such an error once per tab. Where a
  dedicated worker stands in for a missing SharedWorker, its page also still
  receives the uncaught errors from the browser.

  The new `addUncaughtErrorListener` passes each uncaught error and unhandled
  rejection of a worker global scope to a listener, including the defects of a
  Run from `createRun`, so any shared worker can send them to its pages.

  ```ts
  import { assertEqual } from "@evolu/common";
  import { addUncaughtErrorListener } from "@evolu/web";

  const messages: Array<string> = [];
  // A worker passes its global scope, `self`.
  const scope = new EventTarget();
  using _listener = addUncaughtErrorListener(scope, (error) => {
    messages.push(error.message);
  });

  scope.dispatchEvent(
    Object.assign(new Event("error"), { error: new Error("unexpected") }),
  );
  assertEqual(messages, ["unexpected"]);
  ```

### Patch Changes

- 3a83a48: Closed a failed shared worker so the app can be opened again

  When a defect stopped Evolu's shared worker, tabs opened afterwards connected
  to the failed worker and never loaded their data, even after a reload while
  another tab of the app stayed open. On React Native, deps created again
  connected to it too. The failed worker now closes, so the next tab or deps start
  a new one. Closing each open database also no longer reports an extra "Cannot
  use a disposed object." defect after the original one. Each DbWorker now stops
  once its shared worker ends, so a custom platform setup must give the shared
  worker and its DbWorkers the same `LockManager`, as the web and React Native
  setups do.

  An `UnknownError` in `evoluError` leaves Evolu in an unknown state, so the app
  can only ask the user to close the tab. The documentation now says so instead of
  suggesting to try again.

- 6257650: Fixed a failed SQLite statement breaking its later uses on the web

  The web SQLite driver reuses prepared statements. When running one failed, for
  example on a constraint violation or a full disk, the driver did not reset it,
  so every later use of that statement failed with `SQLITE_MISUSE` until the page
  reloaded. The statement is now reset after every run, so later queries and
  writes that use it work.

- Updated dependencies [9e5a033]
- Updated dependencies [428350e]
- Updated dependencies [428350e]
- Updated dependencies [6257650]
- Updated dependencies [eeaa3c5]
- Updated dependencies [6257650]
- Updated dependencies [428350e]
- Updated dependencies [3a83a48]
- Updated dependencies [36f9f81]
  - @evolu/common@8.13.0

## 3.2.0

### Minor Changes

- 0624d35: Fixed apps that stayed blank where the browser offers no storage

  Safari's Private Browsing offers no OPFS, so Evolu could not open its database
  there, and the app waited forever without reporting an error. Evolu now checks
  storage once when its shared worker starts, and without it keeps every database
  in memory. Data synced with a relay comes back, as on a new device, and nothing
  stays on the device afterwards, which suits checking your app on a borrowed
  phone. A persistent database the browser cannot reach right now is left
  untouched. Data that exists only locally, or has not synced yet, is lost when
  the tab hosting the database closes, even while other tabs stay open.

  The new `onStorageUnavailable` option of the web and React web
  `createEvoluDeps` tells the app, so it can tell the user, for example "Nothing
  from this session is kept on this device."

  A custom platform adapter must handle the new `StorageUnavailable` shared
  worker message in an exhaustive switch, and a platform that can lack persistent
  storage can give the shared worker `isPersistentStorageAvailable`.

- e7d27be: Fixed a new app version not working while an older one was open in another tab

  After a deploy that updated Evolu, opening the app while an older version was
  open in another tab could leave the new tab unresponsive.

  Now only one version of an app uses the local database at a time. When a new
  version opens, tabs of the old version reload by themselves. A tab the user is
  in reloads when they leave it. A reload loses unsaved UI state, so keep drafts
  in local-only tables.

  If an old version keeps running, for example in a tab of an Evolu release
  before this one, the new tab waits and reports the new `OtherBuildRunningError`.
  Apps can show a message asking the user to close the app's other tabs. The
  error clears by itself when the wait ends. An exhaustive `switch` over
  `EvoluError` needs a case for it.

  ```ts
  import { assertEqual, type EvoluError } from "@evolu/common";

  const isOtherBuildRunning = (error: EvoluError | null): boolean =>
    error?.type === "OtherBuildRunningError";

  assertEqual(isOtherBuildRunning({ type: "OtherBuildRunningError" }), true);
  ```

  The web `createEvoluDeps` accepts a custom `reloadApp`, for example to save
  state first; it must still reload the page, because the other build waits until
  this tab reloads or closes. The default one now reloads the current page instead
  of loading `/`. The React web
  `createEvoluDeps` now accepts the same options as the web one, including
  `onSharedWorkerUnsupported`.

  Update `@evolu/web` together with `@evolu/common`; with an older `@evolu/web`,
  queries never complete. A custom platform adapter must forward the new
  `Connected` and `Error` shared worker messages and handle the new `Waiting`
  message. One that runs the shared worker in-process must connect every
  `createEvoluDeps` call in a JS runtime to one worker, as React Native does,
  because the worker holds the build lock until it is disposed. On React Native,
  Evolu keeps working after Fast Refresh recreates its dependencies.

### Patch Changes

- e45a549: Fixed tabs that stopped working after Safari relaunched Evolu's shared worker

  When the process hosting Evolu's shared worker ends, WebKit can start the
  worker again without its state and connect the open tabs to it
  ([WebKit bug 318873](https://bugs.webkit.org/show_bug.cgi?id=318873)). Those
  tabs stopped working until the user reloaded them. A tab now reloads by itself
  when a relaunched worker contacts it, including a tab that was still waiting
  for another build.

- fdac39e: Added sync state

  `createEvoluDeps` exposes `deps.syncState`, a `ReadonlyStore<SyncState | null>`
  beside `evoluError`, shared by every Evolu instance and kept current by the
  shared worker; a tab never receives snapshots from a worker of another app
  version. A snapshot lists every transport with an opaque id, a label that is
  the URL without its query, the ready state, and the last open, close, and error
  times; and every database with its owner registrations, each marked writable or
  readonly, with the transports claimed for the owner and, for a writable owner,
  one route per transport saying whether the database is reconciled with that
  relay: `complete`, `completeAt`, `lastSentAt`, `lastReceivedAt`, and the last
  `error`, whose `type` is a protocol error, the original storage write
  rejection, `WriteFailed`, or `SyncFailed`. Local-only writes leave completed
  routes complete; `isLocalOnlyTable` tells whether a table is local-only.

  A failed route retries at most once by itself before it completes again;
  further retries wait for `requestSync` or a reconnect.

  `syncStateToOwnerSyncStates` folds the routes into one `initial`, `syncing`,
  `synced`, `offline`, or `error` state per database and owner with the last
  synced time, the newest error, and each relay's transport, route, and own
  `syncing`, `synced`, `offline`, or `error` status. The completion rules are
  documented in the Shared module. The
  [Sync playground](https://www.evolu.dev/playgrounds/sync) shows the state of
  two relays while one goes down and catches up.

  ```ts
  import {
    assertEqual,
    createId,
    createStore,
    testCreateDeps,
  } from "@evolu/common";
  import type { SyncState, SyncStateDep } from "@evolu/common/local-first";

  const openRelayLabels = (deps: SyncStateDep): ReadonlyArray<string> =>
    (deps.syncState.get()?.transports ?? [])
      .filter(({ readyState }) => readyState === "open")
      .map(({ label }) => label);

  using syncState = createStore<SyncState | null>(null);
  assertEqual(openRelayLabels({ syncState }), []);

  const deps = testCreateDeps();
  syncState.set({
    transports: [
      {
        id: createId<"SyncTransport">(deps),
        label: "wss://relay.example",
        readyState: "open",
        openedAt: null,
        closedAt: null,
        error: null,
      },
    ],
    tenants: [],
  });
  assertEqual(openRelayLabels({ syncState }), ["wss://relay.example"]);
  ```

- a0c716a: Fixed tabs that stalled or stopped saving after Safari's back-forward cache

  Safari keeps a page the user navigates away from frozen in its back-forward
  cache. When that page's tab hosted the database, the app's other tabs, and any
  tab opened later, waited until the page was restored or dropped. When the user
  went back, the page looked normal but silently dropped every write. A page
  entering the back-forward cache now stops the database workers it hosts, so
  another tab takes the database over as if the tab had closed, and a page
  restored from the cache reloads.

  As when a tab closes, data kept only in memory, as in Safari's Private
  Browsing, is lost when the tab hosting the database navigates away. A cached
  page of an older build still keeps a newer build waiting until Safari drops the
  page or the user goes back to it.

- d17ce92: Fixed losing or failing to open a database right after the tab hosting it closed

  When the tab hosting a database closed or crashed, the browser could hand the
  database to another tab before it released the database files; Safari
  releases them in no set order. Opening the database there failed, and
  SQLite's cleanup after the failure tried to delete the database directory. The
  still-open files usually prevented that, but a file released in between let it
  delete the device's local data. Evolu now waits
  until every database file can be opened before it opens the database, and
  logs a warning when the wait lasts longer than five seconds.

- ecd1c0d: Fixed defect reports that showed only "[object Object]"

  The browser and React Native `createRun` passed a panic's `AbortError`, a plain
  object, to the platform's error reporter, which shows it only as
  "[object Object]" or similar. A worker's error reaches its page, including an
  error tracker listening there, as that text alone, so when a database worker
  failed, nothing said why. Both now report an `Error` from the new
  `defectToError`: a panic reports its defect, and any other value that is not an
  `Error` is described in one whose cause is what was reported. A `DOMException`,
  which Chromium reports from a worker without its name or message, is described
  with both.

  A custom `reportDefect`, such as one passing defects to an error tracker, can
  use `defectToError` too:

  ```ts
  import { assertSame, createRun, defectToError } from "@evolu/common";

  const errors: Array<Error> = [];
  await using run = createRun({
    reportDefect: (reported) => {
      errors.push(defectToError(reported));
    },
  });
  const defect = new Error("boom");

  run.panic(defect);

  assertSame(errors[0], defect);
  ```

- ba8c493: Added database versioning with startup refusal

  Evolu now records a database version, `dbVersion`, in its `evolu_version`
  table instead of the unused `protocolVersion`, and converts existing databases
  at startup. The version covers Evolu's internal storage format and how stored
  data is interpreted. It is independent of the application schema, which still
  evolves append-only, and of the network protocol version. This release supports
  database version 2 and migrates older databases to it.

  A database newer than the code supports appears when an older build opens data
  a newer one migrated: after a deployment, for example when an older build is
  loaded later from a cache, or after a downgrade, including installing an older
  React Native build. Evolu refuses such a database before writing anything, and
  every tab using it gets `UnsupportedDbVersionError` in `evoluError`, where it
  stays for the lifetime of the dependencies. Queries and exports of that
  database stay pending, and mutation `onComplete` callbacks do not run. The
  `EvoluErrorDep` API docs describe when the refusal is reported again. Only code
  from this release onward checks the version, so earlier releases are not
  protected. Nothing produces a newer database yet; the first refusal can come
  when a later release introduces version 3, so handle the error now.

  On the web, a refused tab reloads once for each stored version, so it loads the
  build the server now serves. The error is reported only when the reloaded build
  refuses the database too, or when the tab has no session storage.

  Apps should observe `evoluError` outside query-loading UI and show a blocking
  message for `UnsupportedDbVersionError`, such as asking users to update the
  app. An exhaustive `switch` over `EvoluError` needs a case for it.

  ```ts
  import { assertEqual, PositiveInt, type EvoluError } from "@evolu/common";

  const describeError = (error: EvoluError): string => {
    // oxlint-disable-next-line typescript/switch-exhaustiveness-check -- The default handles every other EvoluError.
    switch (error.type) {
      case "UnsupportedDbVersionError":
        return "Your data requires a newer version of this app. Please update it.";
      default:
        return "Something went wrong.";
    }
  };

  assertEqual(
    describeError({
      type: "UnsupportedDbVersionError",
      storedVersion: PositiveInt.orThrow(3),
      supportedVersion: PositiveInt.orThrow(2),
    }),
    "Your data requires a newer version of this app. Please update it.",
  );
  ```

- Updated dependencies [f0101ca]
- Updated dependencies [fdac39e]
- Updated dependencies [ecbac00]
- Updated dependencies [b506c9b]
- Updated dependencies [fdac39e]
- Updated dependencies [d2973b9]
- Updated dependencies [b75abfa]
- Updated dependencies [69b756c]
- Updated dependencies [5a671b2]
- Updated dependencies [e270e42]
- Updated dependencies [ef320ff]
- Updated dependencies [5a671b2]
- Updated dependencies [09b1b5c]
- Updated dependencies [fdac39e]
- Updated dependencies [0770038]
- Updated dependencies [e270e42]
- Updated dependencies [f52d66b]
- Updated dependencies [d2973b9]
- Updated dependencies [fdac39e]
- Updated dependencies [11ccc28]
- Updated dependencies [2e139eb]
- Updated dependencies [0624d35]
- Updated dependencies [ecd1c0d]
- Updated dependencies [568358b]
- Updated dependencies [237fd7f]
- Updated dependencies [e7d27be]
- Updated dependencies [2e139eb]
- Updated dependencies [daf6295]
- Updated dependencies [d2973b9]
- Updated dependencies [ba8c493]
- Updated dependencies [8e23edb]
- Updated dependencies [fdac39e]
- Updated dependencies [cf68cee]
  - @evolu/common@8.11.0

## 3.1.2

### Patch Changes

- 9fc736f: Updated internal Evolu peer dependency requirements

  Aligned internal peer dependency minimums with the current workspace releases. Upgrade the Evolu packages together when updating an adapter or framework integration.

- Updated dependencies [532feaa]
- Updated dependencies [6bd0a36]
- Updated dependencies [f4d9ad7]
- Updated dependencies [3d84543]
- Updated dependencies [6bd0a36]
- Updated dependencies [76554bd]
- Updated dependencies [918d77b]
- Updated dependencies [f4d9ad7]
- Updated dependencies [6bd0a36]
- Updated dependencies [ad85bdb]
- Updated dependencies [f4d9ad7]
- Updated dependencies [91ff875]
- Updated dependencies [ad85bdb]
- Updated dependencies [6bd0a36]
- Updated dependencies [140c4cf]
- Updated dependencies [3d84543]
- Updated dependencies [3d84543]
- Updated dependencies [f3b5829]
- Updated dependencies [ad85bdb]
- Updated dependencies [f4d9ad7]
- Updated dependencies [9ee6f15]
  - @evolu/common@8.10.0

## 3.1.1

### Patch Changes

- 037c390: Required Node.js 24.20 or newer

  Evolu packages now require Node.js 24.20 or newer, matching the repository's tested LTS baseline.

## 3.1.0

### Minor Changes

- 31d2888: Added Apple platform detection

  Use `isApplePlatform` to detect macOS, iOS, iPadOS, and iPod platforms in the
  browser.

  ```ts
  import { isApplePlatform } from "@evolu/web";

  expectTypeOf(isApplePlatform()).toEqualTypeOf<boolean>();
  ```

## 3.0.2

### Patch Changes

- 34fa9df: Improved API documentation

  Expanded the Result, Task, Type, and Owner documentation with module
  introductions, semantic API groups, and tested examples. Improved the platform
  `createRun` documentation for Web and React Native.

## 3.0.1

### Patch Changes

- 13ee2e8: Updated internal peer dependency ranges to require stable releases.

## 3.0.0

### Major Changes

- 5a4d172: Updated minimum Node.js version from 22 to 24 (current LTS)
- 0528425: - Merged `@evolu/common/local-first/Platform.ts` into `@evolu/common/Platform.ts`
  - Made `@evolu/react-web` re-export everything from `@evolu/web`, allowing React users to install only `@evolu/react-web`
- 2abf93d: Refactored SQLite integration to use Task and throw-first semantics

  - Changed `createSqlite` to `Task<Sqlite, never, CreateSqliteDriverDep>`
  - Changed `CreateSqliteDriver` to `Task<SqliteDriver>`
  - Removed `SqliteError` from SQLite driver/task APIs
  - Changed `Sqlite.exec` to return `SqliteExecResult` directly (no `Result<..., SqliteError>`)
  - Changed `Sqlite.transaction` to support callbacks returning either `Result<T, E>` or `void` (no `SqliteError` in the error channel)
  - Changed `Sqlite.export` to return `Uint8Array` directly (no `Result<..., SqliteError>`)
  - Simplified `SqliteDriver.exec` by removing the `isMutation` parameter, so the driver determines read vs write internally
  - Replaced `options.memory` and `options.encryptionKey` with a discriminated `options.mode` field (`"memory"` | `"encrypted"`)
  - Updated Expo and op-sqlite drivers to match the new API
  - Added SQLite schema metadata primitives (`SqliteSchema`, `SqliteIndex`, `eqSqliteIndex`, `getSqliteSchema`, `getSqliteSnapshot`)
  - Added `testSetupSqlite` helper for SQLite tests

  Why `SqliteError` was removed:

  - In Evolu, SQLite runs in-process. Failures are infrastructure-level and unrecoverable at the call site.
  - Wrapping these failures as `Result` values did not create meaningful recovery paths; callers still had to fail.
  - Such failures now throw as Task defects, panic the owning Run tree, and are reported through its `ReportDefect` dependency.
  - Platform Run adapters provide native defect reporters, and applications can inject a custom reporter at the composition root.

  Boundary handling:

  - At protocol boundaries (for example Protocol ↔ Storage), error handling remains explicit.
  - Since storage implementations may throw, boundary code uses `try/catch`, logs with `console.error(error)`, and returns protocol-level outcomes.
  - Protocol handles all thrown errors as boundary concerns, without coupling to SQLite-specific error types.

- 953c1fb: Replaced interface-based symmetric encryption with direct function-based API

  ### Breaking Changes

  **Removed:**

  - `SymmetricCrypto` interface
  - `SymmetricCryptoDep` interface
  - `createSymmetricCrypto()` factory function
  - `SymmetricCryptoDecryptError` error type

  **Added:**

  - `encryptWithXChaCha20Poly1305()` - Direct encryption function with explicit algorithm name
  - `decryptWithXChaCha20Poly1305()` - Direct decryption function
  - `XChaCha20Poly1305Ciphertext` - Branded type for ciphertext
  - `Entropy24` - Branded type for 24-byte nonces
  - `DecryptWithXChaCha20Poly1305Error` - Algorithm-specific error type
  - `xChaCha20Poly1305NonceLength` - Constant for nonce length (24)

  ### Migration Guide

  **Before:**

  ```ts
  const symmetricCrypto = createSymmetricCrypto({ randomBytes });
  const { nonce, ciphertext } = symmetricCrypto.encrypt(plaintext, key);
  const result = symmetricCrypto.decrypt(ciphertext, key, nonce);
  ```

  **After:**

  ```ts
  const [ciphertext, nonce] = encryptWithXChaCha20Poly1305({ randomBytes })(
    plaintext,
    key,
  );
  const result = decryptWithXChaCha20Poly1305(ciphertext, nonce, key);
  ```

  **Error handling:**

  ```ts
  // Before
  if (!result.ok && result.error.type === "SymmetricCryptoDecryptError") { ... }

  // After
  if (!result.ok && result.error.type === "DecryptWithXChaCha20Poly1305Error") { ... }
  ```

  **Dependency injection:**

  ```ts
  // Before
  interface Deps extends SymmetricCryptoDep { ... }

  // After - only encrypt needs RandomBytesDep
  interface Deps extends RandomBytesDep { ... }
  ```

  ### Rationale

  This change improves API extensibility by using explicit function names instead of a generic interface. Adding new encryption algorithms (e.g., `encryptWithAES256GCM`) is now straightforward without breaking existing code.

- 5c55b05: Changed the local database and ownership layout.

  Upgrading an existing Evolu 7 application to Evolu 8 is not yet supported.
  Applications containing Evolu 7 user data should remain on Evolu 7 until
  migration support is released. New Evolu 8 applications and applications
  already using Evolu 8 preview releases are unaffected.

- 4be336d: Refactored worker abstraction to support all platforms uniformly:

  - Added platform-agnostic worker interfaces: `Worker<Input, Output>`, `SharedWorker<Input, Output>`, `MessagePort<Input, Output>`, `MessageChannel<Input, Output>`
  - Added worker-side interfaces: `WorkerSelf<Input, Output>` and `SharedWorkerSelf<Input, Output>` for typed worker `self` wrappers
  - Changed `onMessage` from a method to a property for consistency with Web APIs
  - Made all worker and message port interfaces `Disposable` for proper resource cleanup
  - Added default generic parameters (`Output = never`) for simpler one-way communication patterns
  - Added complete web platform implementations: `createWorker`, `createSharedWorker`, `createMessageChannel`, `createWorkerSelf`, `createSharedWorkerSelf`, `createMessagePort`
  - Added React Native polyfills for Workers and MessageChannel

### Minor Changes

- 66941ed: Added `availableParallelism()` with a validated `PositiveInt` return value.

### Patch Changes

- c1f97ff: Fixed the SharedWorker fallback on older Chrome Android versions without native SharedWorker support.

  Apps can pass `onSharedWorkerUnsupported` to show a custom message when another fallback tab is already running:

  ```ts
  createEvoluDeps({
    onSharedWorkerUnsupported: () => {
      alert(
        "This browser supports Evolu in one tab only. Close this tab and use the already open tab.",
      );
    },
  });
  ```

## 3.0.0-next.1

### Patch Changes

- c1f97ff: Fixed the SharedWorker fallback on older Chrome Android versions without native SharedWorker support.

  Apps can pass `onSharedWorkerUnsupported` to show a custom message when another fallback tab is already running:

  ```ts
  createEvoluDeps({
    onSharedWorkerUnsupported: () => {
      alert(
        "This browser supports Evolu in one tab only. Close this tab and use the already open tab.",
      );
    },
  });
  ```

- 63dce92: Updated Task and Run dependency injection API.

  Removed `Run.addDeps` because every `Run` now owns its deps. The new API is more flexible and better matches sync Pure DI: deps are passed explicitly where a task is called, can replace existing deps when needed, and can be scoped to an owned disposable `Run` with `run.create(deps)`.
  - Renamed `RunDeps` to `RunDefaultDeps` to describe default Run dependencies more clearly.
  - Replaced `Run.addDeps` with explicit dependency passing via `run(task, deps)`, `run.orThrow(task, deps)`, and `run.create(deps)`.
  - Allowed explicit deps to override default `RunDefaultDeps` when needed.

## 3.0.0-next.0

### Major Changes

- 5a4d172: Updated minimum Node.js version from 22 to 24 (current LTS)
- 0528425: - Merged `@evolu/common/local-first/Platform.ts` into `@evolu/common/Platform.ts`
  - Made `@evolu/react-web` re-export everything from `@evolu/web`, allowing React users to install only `@evolu/react-web`
- 2abf93d: Refactored SQLite integration to use Task and throw-first semantics
  - Changed `createSqlite` to `Task<Sqlite, never, CreateSqliteDriverDep>`
  - Changed `CreateSqliteDriver` to `Task<SqliteDriver>`
  - Removed `SqliteError` from SQLite driver/task APIs
  - Changed `Sqlite.exec` to return `SqliteExecResult` directly (no `Result<..., SqliteError>`)
  - Changed `Sqlite.transaction` to support callbacks returning either `Result<T, E>` or `void` (no `SqliteError` in the error channel)
  - Changed `Sqlite.export` to return `Uint8Array` directly (no `Result<..., SqliteError>`)
  - Simplified `SqliteDriver.exec` by removing the `isMutation` parameter, so the driver determines read vs write internally
  - Replaced `options.memory` and `options.encryptionKey` with a discriminated `options.mode` field (`"memory"` | `"encrypted"`)
  - Updated Expo and op-sqlite drivers to match the new API
  - Added SQLite schema metadata primitives (`SqliteSchema`, `SqliteIndex`, `eqSqliteIndex`, `getSqliteSchema`, `getSqliteSnapshot`)
  - Added `testSetupSqlite` helper for SQLite tests

  Why `SqliteError` was removed:
  - In Evolu, SQLite runs in-process. Failures are infrastructure-level and unrecoverable at the call site.
  - Wrapping these failures as `Result` values did not create meaningful recovery paths; callers still had to fail.
  - The correct behavior is to let such failures throw and surface them through platform `createRun` global handlers (web, nodejs, react-native), which report uncaught errors via Evolu `console.error`.
  - Evolu also propagates `console.error` entries through its messaging layer into the shared `evoluError` global store, so app-level error subscriptions still receive these failures.

  Boundary handling:
  - At protocol boundaries (for example Protocol ↔ Storage), error handling remains explicit.
  - Since storage implementations may throw, boundary code uses `try/catch`, logs with `console.error(error)`, and returns protocol-level outcomes.
  - Protocol handles all thrown errors as boundary concerns, without coupling to SQLite-specific error types.

- 953c1fb: Replaced interface-based symmetric encryption with direct function-based API

  ### Breaking Changes

  **Removed:**
  - `SymmetricCrypto` interface
  - `SymmetricCryptoDep` interface
  - `createSymmetricCrypto()` factory function
  - `SymmetricCryptoDecryptError` error type

  **Added:**
  - `encryptWithXChaCha20Poly1305()` - Direct encryption function with explicit algorithm name
  - `decryptWithXChaCha20Poly1305()` - Direct decryption function
  - `XChaCha20Poly1305Ciphertext` - Branded type for ciphertext
  - `Entropy24` - Branded type for 24-byte nonces
  - `DecryptWithXChaCha20Poly1305Error` - Algorithm-specific error type
  - `xChaCha20Poly1305NonceLength` - Constant for nonce length (24)

  ### Migration Guide

  **Before:**

  ```ts
  const symmetricCrypto = createSymmetricCrypto({ randomBytes });
  const { nonce, ciphertext } = symmetricCrypto.encrypt(plaintext, key);
  const result = symmetricCrypto.decrypt(ciphertext, key, nonce);
  ```

  **After:**

  ```ts
  const [ciphertext, nonce] = encryptWithXChaCha20Poly1305({ randomBytes })(
    plaintext,
    key,
  );
  const result = decryptWithXChaCha20Poly1305(ciphertext, nonce, key);
  ```

  **Error handling:**

  ```ts
  // Before
  if (!result.ok && result.error.type === "SymmetricCryptoDecryptError") { ... }

  // After
  if (!result.ok && result.error.type === "DecryptWithXChaCha20Poly1305Error") { ... }
  ```

  **Dependency injection:**

  ```ts
  // Before
  interface Deps extends SymmetricCryptoDep { ... }

  // After - only encrypt needs RandomBytesDep
  interface Deps extends RandomBytesDep { ... }
  ```

  ### Rationale

  This change improves API extensibility by using explicit function names instead of a generic interface. Adding new encryption algorithms (e.g., `encryptWithAES256GCM`) is now straightforward without breaking existing code.

- 4be336d: Refactored worker abstraction to support all platforms uniformly:
  - Added platform-agnostic worker interfaces: `Worker<Input, Output>`, `SharedWorker<Input, Output>`, `MessagePort<Input, Output>`, `MessageChannel<Input, Output>`
  - Added worker-side interfaces: `WorkerSelf<Input, Output>` and `SharedWorkerSelf<Input, Output>` for typed worker `self` wrappers
  - Changed `onMessage` from a method to a property for consistency with Web APIs
  - Made all worker and message port interfaces `Disposable` for proper resource cleanup
  - Added default generic parameters (`Output = never`) for simpler one-way communication patterns
  - Added complete web platform implementations: `createWorker`, `createSharedWorker`, `createMessageChannel`, `createWorkerSelf`, `createSharedWorkerSelf`, `createMessagePort`
  - Added React Native polyfills for Workers and MessageChannel

### Patch Changes

- Updated dependencies [6fc3bba]
- Updated dependencies [2f39c8e]
- Updated dependencies [98a4b6c]
- Updated dependencies [ce83b24]
- Updated dependencies [97f5314]
- Updated dependencies [5275b07]
- Updated dependencies [cd6b74d]
- Updated dependencies [5a4d172]
- Updated dependencies [87780a3]
- Updated dependencies [bfaa2ca]
- Updated dependencies [f0bbebb]
- Updated dependencies [332dfca]
- Updated dependencies [7da2364]
- Updated dependencies [6f1d6ea]
- Updated dependencies [0528425]
- Updated dependencies [5f97e83]
- Updated dependencies [7fe328d]
- Updated dependencies [3ba2a92]
- Updated dependencies [5720b0b]
- Updated dependencies [e948269]
- Updated dependencies [d1f817f]
- Updated dependencies [2abf93d]
- Updated dependencies [b956a5f]
- Updated dependencies [ece429b]
- Updated dependencies [d30b95a]
- Updated dependencies [953c1fb]
- Updated dependencies [9ba5442]
- Updated dependencies [3b74e48]
- Updated dependencies [c24ec2f]
- Updated dependencies [9373afa]
- Updated dependencies [4be336d]
  - @evolu/common@8.0.0-next.0

## 2.4.0

### Patch Changes

- Updated dependencies [1479665]
  - @evolu/common@7.4.0

## 2.3.0

### Patch Changes

- Updated dependencies [d957af4]
- Updated dependencies [a21a9fa]
- Updated dependencies [604940a]
- Updated dependencies [a04e86e]
- Updated dependencies [5f5a867]
  - @evolu/common@7.3.0

## 2.2.1

### Patch Changes

- 84f1663: Rename `Evolu` directory to `local-first`

  Reorganize internal directory structure to better reflect the local-first architecture. The `Evolu` directory in `src` is now named `local-first` across all packages.

  It's not breaking change unless `@evolu/common/evolu` was used (now its `@evolu/common/local-first`). The JSDoc called is "internal" so not considered as public API change.

- Updated dependencies [84f1663]
  - @evolu/common@7.2.1

## 2.2.0

### Patch Changes

- Updated dependencies [0830d8b]
  - @evolu/common@7.2.0

## 2.1.0

### Patch Changes

- Updated dependencies [be0ad00]
  - @evolu/common@7.1.0

## 2.0.0

### Major Changes

- dd3c865: - Added expo-secure-store backend for LocalAuth
  - Added LocalAuth to Expo example app
  - Added native EvoluAvatar to react-native package
  - Added experimental jsdoc note to LocalAuth
  - Moved LocalAuth out of expo deps to it's own export

### Patch Changes

- Updated dependencies [36af10c]
- Updated dependencies [6452d57]
- Updated dependencies [eec5d8e]
- Updated dependencies [dd3c865]
- Updated dependencies [8f0c0d3]
- Updated dependencies [eec5d8e]
- Updated dependencies [6759c31]
- Updated dependencies [2f87ac8]
- Updated dependencies [6195115]
- Updated dependencies [eec5d8e]
- Updated dependencies [47386b8]
- Updated dependencies [202eaa3]
- Updated dependencies [f4a8866]
- Updated dependencies [eec5d8e]
- Updated dependencies [13b688f]
- Updated dependencies [a1dfb7a]
- Updated dependencies [45c8ca9]
- Updated dependencies [4a960c7]
- Updated dependencies [6279aea]
- Updated dependencies [02e8aa0]
- Updated dependencies [f5e4232]
- Updated dependencies [0911302]
- Updated dependencies [31d0d21]
- Updated dependencies [0777577]
- Updated dependencies [29886ff]
- Updated dependencies [eec5d8e]
- Updated dependencies [de37bd1]
- Updated dependencies [1d8c439]
- Updated dependencies [3daa221]
- Updated dependencies [eed43d5]
- Updated dependencies [05fe5d5]
- Updated dependencies [4a82c06]
  - @evolu/common@7.0.0

## 1.0.1-preview.7

### Patch Changes

- dd3c865: - Added expo-secure-store backend for LocalAuth
  - Added LocalAuth to Expo example app
  - Added native EvoluAvatar to react-native package
  - Added experimental jsdoc note to LocalAuth
  - Moved LocalAuth out of expo deps to it's own export
- Updated dependencies [dd3c865]
  - @evolu/common@6.0.1-preview.23

## 1.0.1-preview.6

### Patch Changes

- 5c05d2e: Internal improvements and dependency updates
- Updated dependencies [eec5d8e]
- Updated dependencies [eec5d8e]
- Updated dependencies [eec5d8e]
- Updated dependencies [eec5d8e]
- Updated dependencies [eec5d8e]
  - @evolu/common@6.0.1-preview.20

## 1.0.1-preview.5

### Patch Changes

- 899d647: Update SQLite and export createWasmSqliteDriver

## 1.0.1-preview.4

### Patch Changes

- 570d28d: Update @sqlite.org/sqlite-wasm to 3.50.3-build1

## 1.0.1-preview.3

### Patch Changes

- 45c8ca9: Add in-memory database support for testing and temporary data

  This change introduces a new `inMemory` configuration option that allows creating SQLite databases in memory instead of persistent storage. In-memory databases exist only in RAM and are completely destroyed when the process ends, making them ideal for:
  - Testing scenarios where data persistence isn't needed
  - Temporary data processing
  - Forensically safe handling of sensitive data

  **Usage:**

  ```ts
  const evolu = createEvolu(deps)(Schema, {
    inMemory: true, // Creates database in memory instead of file
  });
  ```

- Updated dependencies [45c8ca9]
  - @evolu/common@6.0.1-preview.10

## 1.0.1-preview.2

### Patch Changes

- 2a37317: Update dependencies
- Updated dependencies [2a37317]
- Updated dependencies [39cbd9b]
  - @evolu/common@6.0.1-preview.3

## 1.0.1-preview.1

### Patch Changes

- 8ff21e5: GitHub release
- Updated dependencies [8ff21e5]
  - @evolu/common@6.0.1-preview.2

## 1.0.1-preview.0

### Patch Changes

- 632768f: Preview release
- Updated dependencies [632768f]
  - @evolu/common@6.0.1-preview.0

## 1.0.0

### Major Changes

- Updated to use new Evolu architecture
