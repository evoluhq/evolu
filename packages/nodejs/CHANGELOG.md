# @evolu/nodejs

## 4.6.0

### Minor Changes

- b352b38: Sent an empty text frame with each relay ping, so clients notice connections that die without closing

  The WebSocket API answers pings without telling JavaScript, in browsers, React Native and Node alike, so a client could not tell a connection that died silently from an idle one. The relay now sends an empty text frame as each connection's first frame and right after each ping, which clients from `@evolu/common` 8.26.0 watch; older clients ignore it. A proxy in front of the relay must allow more than thirty seconds of idle time, as it already had to for the pings.

  `pingInterval` of `createRelay` must now be at most thirty seconds, `relayHeartbeatInterval`, and a longer one panics before the relay opens its database.

### Patch Changes

- Updated dependencies [b352b38]
- Updated dependencies [f4ed930]
- Updated dependencies [d6838fb]
  - @evolu/common@8.26.0

## 4.5.0

### Minor Changes

- f4e7be7: Added deleteOwner to Relay, which deletes an owner's data

  A relay operator can now delete everything a relay stores for an owner, its messages, timestamps, usage, and write key, such as the data of a customer who leaves a paid relay, without editing the relay's database file. `relay.deleteOwner(ownerId)` waits for the owner's write in progress and closes the connections subscribed to the owner. Refuse the owner's writes first with `isOwnerWithinQuota`, or its devices upload their data again on their next sync. `isOwnerAllowed` is not enough, because it checks only the OwnerId a connection names when it connects.

  `Storage` no longer has `deleteOwner`, which sync never called; `BaseSqliteStorage` and the new `RelaySqliteStorage` have it. `createRelaySqliteStorage` now returns a `RelaySqliteStorage`, whose `deleteOwner` returns a `Task` instead of deleting right away, so run it, as in `await run(storage.deleteOwner(ownerIdBytes))`. A call such as `storage.deleteOwner(ownerIdBytes)` still compiles but deletes nothing. A custom implementation of `Relay` needs `deleteOwner`.

  ```ts
  import {
    assertType,
    type OwnerId,
    type OwnerIdBytes,
    type Result,
    type Run,
    type Task,
    type UnknownError,
  } from "@evolu/common";
  import type { Relay, RelaySqliteStorage } from "@evolu/common/local-first";

  // The relay's isOwnerWithinQuota answers with !deletedOwnerIds.has(ownerId).
  const deletedOwnerIds = new Set<OwnerId>();

  const deleteCustomer = (
    relay: Relay,
    ownerId: OwnerId,
  ): Task<void, UnknownError> => {
    deletedOwnerIds.add(ownerId);
    return relay.deleteOwner(ownerId);
  };

  assertType<ReturnType<typeof deleteCustomer>, Task<void, UnknownError>>();

  // RelaySqliteStorage's deleteOwner returns a Task, so a custom relay runs it.
  const deleteFromStorage = (
    run: Run,
    storage: RelaySqliteStorage,
    ownerIdBytes: OwnerIdBytes,
  ): Promise<Result<void, UnknownError>> =>
    run(storage.deleteOwner(ownerIdBytes));

  assertType<
    ReturnType<RelaySqliteStorage["deleteOwner"]>,
    Task<void, UnknownError>
  >();
  assertType<
    ReturnType<typeof deleteFromStorage>,
    Promise<Result<void, UnknownError>>
  >();
  ```

### Patch Changes

- Updated dependencies [f4e7be7]
- Updated dependencies [d2cbfd4]
- Updated dependencies [952cee0]
- Updated dependencies [b2e5000]
- Updated dependencies [9b66810]
- Updated dependencies [7a7e311]
- Updated dependencies [ef25d85]
- Updated dependencies [ff5cc09]
- Updated dependencies [f50d979]
- Updated dependencies [b2e5000]
- Updated dependencies [ed0da2a]
- Updated dependencies [1e73148]
  - @evolu/common@8.25.0

## 4.4.3

### Patch Changes

- d9cfd60: Reported an encrypted database with an altered page size as tampered

  Evolu authenticates every page of an encrypted database, except the page size in the first page's header, which SQLite reads before anything is decrypted, so Evolu checks it separately. Some reads skipped that check, so a database whose page size someone had altered failed to open with an error that had no cause. It now fails as any tampered database does, with `SQLITE_NOTADB` and a `SqlitePageAuthenticationError` cause, and a hot journal altered this way is treated as any other tampered journal. Only someone who can already write an app's files can alter the page size, so databases Evolu wrote aren't affected.

## 4.4.2

### Patch Changes

- 8c8e86c: Required oxlint-tsgolint 7.0.2005

  oxlint 1.90 and later require oxlint-tsgolint 7.0.2005 or later, so the previous pin to 7.0.2004 conflicted with current oxlint. `@evolu/oxlint-config` and `@evolu/nodejs` now require oxlint-tsgolint 7.0.2005 and still accept oxlint `^1.87.0`.

- Updated dependencies [8c8e86c]
- Updated dependencies [8c8e86c]
- Updated dependencies [8c8e86c]
  - @evolu/oxlint-config@0.4.1
  - @evolu/common@8.24.1

## 4.4.1

### Patch Changes

- 4f6a40d: Logged requests the relay can't decode only at debug level

  A client that sent malformed frames in a loop could fill the relay's disk with
  logs: each one logged `invalid protocol request` with its decoding error's stack
  at the default level, about 2 KB per frame, while the relay kept the connection
  open. A malformed request is the client's failure, so the relay now logs it at
  `debug`, which `EVOLU_RELAY_LOG_LEVEL=debug` shows.

## 4.4.0

### Minor Changes

- 057ead0: Replaced better-sqlite3 with Evolu's own SQLite, which encrypts databases on Node.js

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
    - A blob reads as a `Uint8Array`, where better-sqlite3 returned a `Buffer`,
      so it has no `Buffer` methods such as `toString("hex")` or `equals`. Use
      `Buffer.from(value)` where code needs one.
  - Evolu's SQLite has the features the web's has: SQLite's defaults, JSON
    among them, and the math functions. Compared with better-sqlite3, it lacks
    FTS, R\*Tree, Geopoly, the `dbstat` table, `percentile`, `soundex`,
    `UPDATE` and `DELETE` with `LIMIT`, and extension loading, and foreign keys
    are off unless a connection turns them on, where better-sqlite3 turned them
    on. Evolu's own schemas use none of them. A pragma that keys a database,
    such as `pragma key`, fails rather than leave it in plaintext, which
    better-sqlite3 did silently, and an attached database is read-only, because
    SQLite ignores the `KEY` clause of `ATTACH`. As with better-sqlite3, every
    connection is in SQLite's defensive mode, so ordinary SQL can't deliberately
    corrupt its database, and a file connection waits up to 5 seconds for a lock another
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

- Updated dependencies [1c89914]
- Updated dependencies [bc4578a]
- Updated dependencies [7cc5d91]
- Updated dependencies [72177aa]
- Updated dependencies [1c89914]
- Updated dependencies [5c97752]
- Updated dependencies [1c89914]
- Updated dependencies [be5afcb]
- Updated dependencies [fd3565e]
- Updated dependencies [f3a8831]
- Updated dependencies [f43e20e]
  - @evolu/common@8.24.0
  - @evolu/oxlint-config@0.4.0

## 4.3.4

### Patch Changes

- 5402ec8: Pinned external runtime dependencies to exact versions

  A version range let an app that installed or updated Evolu resolve a newer
  release of a dependency that Evolu was never tested with, including a
  compromised one. These packages now depend on the exact versions they were
  tested with. Their own dependencies still resolve within the ranges they
  declare, so an app's lockfile is what fixes the whole tree. Peer dependencies
  keep their ranges. If an app also depends on one of these dependencies in
  another version, its package manager installs both copies.

  A newer release of one of them, such as a security fix, reaches an app only
  with an Evolu release that updates it, or sooner through its package manager's
  overrides.

- Updated dependencies [5402ec8]
- Updated dependencies [5402ec8]
  - @evolu/common@8.23.0
  - @evolu/oxlint-config@0.3.2

## 4.3.3

### Patch Changes

- b57803e: Stopped logging the bytes of a request the relay can't decode

  When the Node.js relay couldn't decode a request, it logged the whole failed
  result with the request's bytes, which hold the OwnerId and the write key and
  can be up to a megabyte. It now logs `invalid protocol request` with the
  request's byte length and the decoding error.

  `ProtocolInvalidDataError` no longer has a `data` property with the malformed
  message's or change's bytes, so logging the error can't leak an OwnerId or a
  write key. Code that read `data` can use the message or change it passed to
  the function that returned the error.

- 06a86d9: Updated better-sqlite3 to 13

  better-sqlite3 13 runs on Node-API and ships prebuilt binaries for macOS, Linux (glibc and musl), and Windows on x64 and arm64 inside the package, so installing `@evolu/nodejs` or `@evolu/relay` no longer downloads a binary from GitHub. Node.js 24 remains supported. It also brings SQLite 3.53.4.

- Updated dependencies [b57803e]
  - @evolu/common@8.22.3

## 4.3.2

### Patch Changes

- c791716: Required oxlint 1.87 and oxlint-tsgolint 7.0.2004

  oxlint 1.86 and later require oxlint-tsgolint 7.0.2003 or later, so the previous peers, oxlint `^1.79.0` with oxlint-tsgolint pinned to 7.0.2001, conflicted with current oxlint. `@evolu/oxlint-config` and `@evolu/nodejs` now require oxlint `^1.87.0` and oxlint-tsgolint 7.0.2004.

  `@evolu/oxlint-config` also updates eslint-plugin-jsdoc to 65.

- a9d2ff0: Allowed documentation examples to install Evolu's polyfills themselves

  `testJSDocExamples` now preloads Evolu's polyfills in the process that runs the examples instead of adding an `installPolyfills` import to each example. An example that imports and calls `installPolyfills` itself no longer fails with a duplicate identifier, and the modules an example imports run with the polyfills already installed.

- Updated dependencies [c791716]
- Updated dependencies [ca3ce67]
  - @evolu/oxlint-config@0.3.0

## 4.3.1

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

- 4aa2c7a: Kept one connection from blocking the relay

  The relay handled each WebSocket message as soon as it arrived. A burst of cheap
  requests on one connection blocked every other connection for seconds, one
  request of many cheap ranges, such as empty Timestamps ranges, took about a
  second, and a client that did not read its replies made the relay queue them
  without limit.

  The relay now serves each connection's requests one at a time and serves other
  connections in between. It does not read a connection while its requests wait,
  and it serves the next one only after the previous reply is written, so a client
  that sends faster than it reads is slowed down instead of growing the relay's
  memory. A request waiting for an asynchronous `isOwnerWithinQuota` holds the
  later requests of its connection, so the callback should settle quickly.

  One sync answer makes a bounded number of storage reads. Past that limit its
  frame closes and the rest syncs in the next round, so one request holds the
  relay for at most about half a second, even for an owner of hundreds of
  thousands of changes. Limit connections per IP address in a reverse proxy in
  front of the relay.

- Updated dependencies [4493e77]
- Updated dependencies [4aa2c7a]
  - @evolu/common@8.21.0

## 4.3.0

### Minor Changes

- 8e58bcb: Added TSX example support to testJSDocExamples

  `testJSDocExamples` now tests `tsx` fences, which it skipped before. They are
  compiled with the automatic React JSX runtime, linted, and run after Vite
  transforms their JSX, because Node.js cannot strip JSX. Projects with TSX
  examples need `vite`, `react`, and `@types/react` installed.

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

- 8e58bcb: Restricted testJSDocExamples fences to ts and tsx

  `testJSDocExamples` used to treat `typescript` fences, and fences in any
  letter case such as `TS`, as TypeScript examples. It now accepts only `ts` and
  `tsx`, and fails on other spellings of them, so that one language has one
  spelling and no example is skipped because of how its fence is written. Rename
  such fences to `ts` or `tsx`.

- Updated dependencies [bfba9bf]
- Updated dependencies [609d399]
  - @evolu/common@8.20.1

## 4.2.1

### Patch Changes

- 848ea9c: Fixed TestOverviewReporter hiding failed test files and their output

  The reporter dropped what test files wrote to standard output and standard
  error, so a file that failed to load, for example on a top-level assertion,
  was reported only as `test failed`, without its error. The reporter now prints
  the output of each failed test file under "Output of failed test files:",
  after the failed tests. Output of other files is still omitted.

  The "Test files:" list now marks a file as failed whenever the file or any of
  its tests fails. Before, it marked a file that exited with a nonzero code after
  its tests passed with ✔, and left out a file that reported no tests, such as
  one that failed to load, defined no tests, or exited during its tests. Such a
  file is now listed as `(no tests reported)`, with ✔ when it exits with code 0,
  which Node.js counts as passed even when the file exits before its tests run.

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

## 4.2.0

### Minor Changes

- 20e329e: Added a health endpoint to the relay

  `createRelay` now answers `GET` and `HEAD` requests for `/health` with status
  200 and `{"status":"ok"}` while its database file can be read, and with status
  503 and `{"status":"error"}` otherwise, so uptime monitors and load balancers
  can check a relay. Other plain HTTP requests get status 426 instead of no
  response at all. The relay's Docker image now checks `/health` instead of only
  opening a TCP connection, so a relay that cannot read its database file is
  reported unhealthy.

### Patch Changes

- Updated dependencies [a09e87b]
- Updated dependencies [90b0c0b]
- Updated dependencies [a09e87b]
- Updated dependencies [f7e9439]
- Updated dependencies [a09e87b]
- Updated dependencies [1137d52]
- Updated dependencies [2b2c7fb]
- Updated dependencies [90b0c0b]
- Updated dependencies [eb06ba1]
- Updated dependencies [1137d52]
- Updated dependencies [0e95535]
  - @evolu/common@8.16.0

## 4.1.1

### Patch Changes

- 93f2a30: Fixed createTimingSafeEqual throwing for arrays of different lengths

  The Node.js `TimingSafeEqual` passed arrays straight to `node:crypto`, which
  throws `ERR_CRYPTO_TIMING_SAFE_EQUAL_LENGTH` when their lengths differ. It now
  returns `false`, as `TimingSafeEqual` documents.

- Updated dependencies [fb4c82f]
- Updated dependencies [9dbf790]
- Updated dependencies [d1e22b4]
- Updated dependencies [bc56001]
- Updated dependencies [d1e22b4]
- Updated dependencies [4d7e66b]
  - @evolu/common@8.15.0

## 4.1.0

### Minor Changes

- 950d79b: Added WebSocket pings to the relay

  The relay pings every connection at `pingInterval`, thirty seconds by default,
  and terminates a connection from which nothing has arrived since the previous
  ping, so an idle dead path is detected within two intervals and NAT mappings
  stay alive. Any incoming data counts, so an upload that delays a client's answer
  on a slow link keeps its connection. A connection with data still queued in the
  relay for it, such as a large reply on a slow link, is not pinged or terminated
  until the operating system takes that data, because the answer waits behind it;
  TCP ends such a connection if its path is dead. Data the operating system
  already holds can still delay the answer past an interval, and the connection
  then reconnects once after that data arrives. A connection is terminated instead
  of queuing a broadcast that would leave more than 16 MB of broadcasts unsent to
  it, whether its client stopped reading or reads more slowly than its owners'
  traffic arrives, which bounds the relay's memory for it; the client reconciles
  after it reconnects. Replies to a client's own requests do not count, because
  their total follows its requests. Browsers answer pings automatically, so
  clients need no change.

  ```ts
  import { assertEqual } from "@evolu/common";
  import type { NodeJsRelayConfig } from "@evolu/nodejs";

  // Detects a dead connection within about twenty seconds instead of a minute.
  const config: Pick<NodeJsRelayConfig, "pingInterval"> = {
    pingInterval: "10s",
  };
  assertEqual(config, { pingInterval: "10s" });
  ```

### Patch Changes

- 2d2d162: Fixed SQLite changes for writes with a returning clause

  The better-sqlite3 driver reported zero `changes` for an insert, update, or
  delete with a `returning` clause, because it treated every statement that
  returns rows as a read. It now reports the number of rows the statement changed.

- 78d0052: Fixed relay crashes on rejected frames and during shutdown

  A client that sent a frame the relay rejects, such as one larger than the
  maximum protocol message size, crashed the relay process and disconnected every
  client. The relay now closes only that connection and logs the error at debug
  level.

  A frame, or a connection attempt to a relay configured with `isOwnerAllowed`,
  that arrived while the relay was shutting down, such as from a client syncing
  during a deploy, crashed the process before shutdown finished. The relay now
  ignores frames and refuses connections once shutdown starts.

- d54eff8: Measured production code in Vite bundle tests

  The Vite adapter in `testBundle` now replaces `process.env.NODE_ENV` with
  `"production"`, matching webpack. Development-only branches are removed before
  bundles are executed and measured, so size snapshots no longer include that
  development code.

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

## 4.0.0

### Major Changes

- 2183ca3: Required validated Port values in relay configuration

  `NodeJsRelayConfig.port` remains optional, but a supplied value must now be a
  validated `Port` instead of a plain number. This ensures ports are integers
  from 0 through 65535 before starting the server. Zero requests an automatically
  assigned listening port.

  Use `Port.orThrow` for startup constants or handle the Result from
  `Port.fromUnknown` or `PortFromString.fromUnknown` for external input.

  ```ts
  import { assertType, Port, type Task } from "@evolu/common";
  import type { Relay } from "@evolu/common/local-first";
  import { createRelay, type RelayDeps } from "@evolu/nodejs";

  // @ts-expect-error Relay configuration requires a validated Port, not a number.
  const _old = createRelay({ port: 4000, isOwnerWithinQuota: () => true });

  const main = createRelay({
    port: Port.orThrow(4000),
    isOwnerWithinQuota: () => true,
  });
  assertType<typeof main, Task<Relay, never, RelayDeps>>();

  const defaultPort = createRelay({ isOwnerWithinQuota: () => true });
  assertType<typeof defaultPort, Task<Relay, never, RelayDeps>>();
  ```

### Minor Changes

- 918d77b: Added file system operations for Tasks

  `Fs` provides `readFile`, `writeFile`, `readDirectory`, `createDirectory`, `copy`,
  `copyFile`, `rename`, `remove`, `getMetadata`, `exists`, and `createTempDirectory`.
  Each operation returns a Task.

  Tasks can sequence file operations without synchronous I/O. Node.js's synchronous
  methods are intentionally omitted to avoid accidentally blocking the event loop.

  Inject `createNodeFs()` through `runMain` or `createRun`. Tasks declare `FsDep`
  and access the file system through `run.deps.fs`.

  On Node.js, `readFile` and `writeFile` pass the Run's abort signal to the native
  operation. If it rejects after cancellation, the Task propagates the Run's abort
  reason. Cancellation can leave a write partially completed. Successful operations
  return their values even if an abort was requested. Other operations run to
  completion and return their results once started.

  File system errors include a reason such as `NotFound` or `IsDirectory`, a
  diagnostic message, and the operation's path. URL paths are represented by `href`.
  Copy and rename errors also include the destination. `exists` returns `false`
  for `NotFound` and preserves other errors, including permission failures.

  `getMetadata` returns data with a `type` field such as `"File"` or `"Directory"`.
  `readDirectory` lists relative entry names and supports recursive listing.
  On Node.js, `copy` delegates to recursive `node:fs/promises.cp`. By default it
  merges directories and replaces files. Its options are Node's `force`,
  `errorOnExist`, and `preserveTimestamps`: `force: false` skips existing files,
  and adding `errorOnExist: true` rejects existing files and directories.
  Symbolic links retain Node's behavior and may still be replaced with both of
  those options set. Tree copying provides no exclusive-creation or atomicity
  guarantee, and a failure can leave a partial copy.

  `copyFile` copies a single file and fails with `AlreadyExists` if the destination
  exists, unless `overwrite: true` is set. Its default exclusive creation also
  protects against competing copies. File contents are not published atomically.
  `rename` uses the platform's rename semantics and can replace an existing file.

  `createTempDirectory()` uses the system temporary directory by default. Its
  `directory` option selects an existing parent directory, and `prefix` sets a
  prefix for the generated directory name. The returned directory supports cleanup
  with `await using`. Once creation starts, it returns its result even if the Run
  aborts, so the caller can dispose the directory.
  On Node.js, the parent is resolved through the file system before creation, so
  symbolic links followed by `..` retain their file system meaning. The returned
  path is absolute, so cleanup still removes the created directory if the process
  changes its working directory before disposal. Resolution errors identify the
  supplied parent; creation errors identify the resolved parent and name prefix.

  ```ts
  import {
    assertEqual,
    assertErr,
    ok,
    type FsDep,
    type FsError,
    type Task,
  } from "@evolu/common";
  import { createNodeFs, runMain } from "@evolu/nodejs";
  import { join } from "node:path";

  const main: Task<void, FsError, FsDep> = async (run) => {
    const { fs } = run.deps;
    const temp = await run(fs.createTempDirectory({ prefix: "evolu-fs-" }));
    if (!temp.ok) return temp;

    await using directory = temp.value;
    const path = join(directory.path, "message.txt");

    const result = await run(fs.writeFile(path, "hello"));
    if (!result.ok) return result;

    const text = await run(fs.readFile(path, "utf8"));
    if (!text.ok) return text;
    assertEqual(text.value, "hello");

    const metadata = await run(fs.getMetadata(path));
    if (!metadata.ok) return metadata;
    assertEqual(metadata.value.type, "File");

    const copyPath = join(directory.path, "copy.txt");
    const copied = await run(fs.copy(path, copyPath));
    if (!copied.ok) return copied;
    const copyConflict = await run(
      fs.copy(path, copyPath, { force: false, errorOnExist: true }),
    );
    assertErr(copyConflict);
    assertEqual(copyConflict.error.reason, "AlreadyExists");

    const conflict = await run(fs.copyFile(path, copyPath));
    assertErr(conflict);
    assertEqual(conflict.error.reason, "AlreadyExists");

    return ok();
  };

  await runMain({ fs: createNodeFs() }, { mode: "command" })(main);
  ```

  Use `testCreateFs(overrides)` to supply file system behavior in application tests.
  Unconfigured operations throw a defect naming the method when their Task runs.

  ```ts
  import {
    assertErr,
    testCreateFs,
    testCreateRun,
    err,
    type FsError,
  } from "@evolu/common";

  const error: FsError = {
    type: "FsError",
    reason: "PermissionDenied",
    path: "protected.txt",
    syscall: "open",
    message: "Permission denied",
  };

  await using run = testCreateRun({
    fs: testCreateFs({ readFile: () => () => err(error) }),
  });

  assertErr(await run(run.deps.fs.readFile("protected.txt", "utf8")), error);
  ```

- 8ac49c8: Allowed main Tasks to return errors

  `runMain` accepts fallible Tasks. A returned error is fatal: it is preserved in
  `Error.cause`, reported through `reportDefect`, and sets `process.exitCode` to 1.
  Cleanup finishes before `runMain` resolves.

  ```ts
  import {
    assertEqual,
    IntFromString,
    ok,
    type Task,
    type TypeError,
  } from "@evolu/common";
  import { runMain } from "@evolu/nodejs";

  const main: Task<void, TypeError> = () => {
    const port = IntFromString.fromUnknown("4000");
    if (!port.ok) return port;

    assertEqual(port.value, 4000);
    return ok();
  };

  await runMain(main, { mode: "command" });
  ```

### Patch Changes

- 9fc736f: Updated internal Evolu peer dependency requirements

  Aligned internal peer dependency minimums with the current workspace releases. Upgrade the Evolu packages together when updating an adapter or framework integration.

- 918d77b: Fixed type resolution in documentation examples

  `testJSDocExamples` now applies package aliases when type-checking imports
  within aliased modules. Examples can use branded types across common and
  platform packages without mixing source and built declarations.

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

## 3.2.0

### Minor Changes

- a6335c5: Added a Node.js test overview reporter

  The new `@evolu/nodejs/TestOverviewReporter` entry point lists test files slowest-first while preserving Node.js failure diagnostics, run totals, and coverage output. Durations longer than 300 ms are highlighted when terminal colors are supported.

  Use it directly with Node.js:

  ```sh
  node --test --test-reporter=@evolu/nodejs/TestOverviewReporter
  ```

### Patch Changes

- 037c390: Required Node.js 24.20 or newer

  Evolu packages now require Node.js 24.20 or newer, matching the repository's tested LTS baseline.

- Updated dependencies [037c390]
- Updated dependencies [638dd22]
- Updated dependencies [4769956]
  - @evolu/oxlint-config@0.2.0

## 3.1.0

### Minor Changes

- 54c289e: Removed Vitest from documentation example testing

  `testJSDocExamples` no longer depends on Vitest, now lints examples with
  `@evolu/oxlint-config`, and is much faster. As a result, it moved from
  `@evolu/vitest` to `@evolu/nodejs`; import it from `@evolu/nodejs/TestJSDoc`.

  Documentation examples no longer receive Vitest or Result assertion globals.
  They explicitly import platform-independent assertions from `@evolu/common`,
  making each example standalone and portable. Compilation uses
  `@evolu/typescript-config`.

  Projects calling this helper must install its optional tooling peers as
  development dependencies:

  ```sh
  pnpm add -D @evolu/oxlint-config @evolu/typescript-config oxlint oxlint-tsgolint typescript
  ```

  Prefix intentionally unused example declarations with `_`; used
  underscore-prefixed declarations fail linting.

  Write documentation examples as standalone TypeScript modules with explicitly
  imported assertions:

  ```ts
  import { assertEqual } from "@evolu/common";

  const _intentionallyUnused = "example";

  assertEqual(1 + 1, 2);
  ```

### Patch Changes

- Updated dependencies [4aa82e4]
  - @evolu/typescript-config@0.1.0

## 3.0.1

### Patch Changes

- 13ee2e8: Updated internal peer dependency ranges to require stable releases.

## 3.0.0

### Major Changes

- 5a4d172: Updated minimum Node.js version from 22 to 24 (current LTS)
- a883a8c: Added signal-aware relay authorization and exposed the actual bound port from Node.js relays.

  Added WebSocket test helpers for native client setup and raw upgrade requests.

  Made relay storage count duplicate timestamped messages only once when computing owner usage.

  Renamed the Node.js `startRelay` API to `createRelay` and made it return a Resource-producing Task whose disposal owns the relay lifecycle.

  Replaced the Node.js `createRun` and `ShutdownDep` APIs with `runMain`, which owns the root Run, handles termination signals, disposes returned resources, reports defects, and supports service and command exit behavior.

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

- 5c55b05: Changed the local database and ownership layout.

  Upgrading an existing Evolu 7 application to Evolu 8 is not yet supported.
  Applications containing Evolu 7 user data should remain on Evolu 7 until
  migration support is released. New Evolu 8 applications and applications
  already using Evolu 8 preview releases are unaffected.

### Minor Changes

- 6202f42: Added an abort-aware `spawn` Task for running CLI commands with inherited stdio and typed unsuccessful-exit errors.
- e10699b: Added production bundle testing utilities.

  The new `@evolu/nodejs/TestBundle` entry point bundles named cases with every
  supported bundler and records their raw and Brotli-compressed sizes together
  with the bundler names and versions. The returned record is ready for inline
  size snapshots. Assertions run outside the measured bundles, so test code does
  not affect size results. All case and bundler jobs share one concurrent Evolu
  Task pool bounded by the CPU parallelism available to the process.

  Each emitted bundle is executed in an isolated worker. Evaluation errors,
  rejected results, unhandled rejections, early exits, and timeouts fail the test,
  ensuring that size and tree-shaking assertions describe code that actually
  runs. Bundle production also runs in isolated workers with its own timeout, so
  a stuck bundler cannot hang the test process. Failures from multiple jobs are
  reported together with their case and bundler names.

- 66941ed: Added `availableParallelism()` with a validated `PositiveInt` return value.
- b85837f: Improved wall-clock, performance, and monotonic time APIs.

  **Common:**

  - Replaced `Time.nowDateIso()` with the `Time.now("DateIso")` overload.
  - Added `Time.performance` with a high-resolution clock and time origin, plus branded `PerformanceTime`, `PerformanceTimeOrigin`, and `PerformanceDuration` values.
  - Added `performanceDurationBetween()` for measuring elapsed performance time.
  - Made timeout IDs instance-owned so clearing an ID with another `Time` instance throws.
  - Made native-range timeouts independent of wall-clock changes while retaining absolute-deadline handling for longer timeouts.
  - Extended `formatMillisAsDuration()` to format days, weeks, and years.

  **Node.js:**

  - Added `NodejsTime` and `createNodejsTime()` with `hrtime()` for monotonic nanosecond readings.
  - Added branded `HrTime` and `HrDuration` values with `hrDurationBetween()`.
  - Added `hrDurationToMillis()` and `millisToHrDuration()` conversions.

### Patch Changes

- 65c1fe6: Documented `createTimingSafeEqual` in the Node.js crypto module.

## 3.0.0-next.3

### Patch Changes

- 63dce92: Updated Task and Run dependency injection API.

  Removed `Run.addDeps` because every `Run` now owns its deps. The new API is more flexible and better matches sync Pure DI: deps are passed explicitly where a task is called, can replace existing deps when needed, and can be scoped to an owned disposable `Run` with `run.create(deps)`.
  - Renamed `RunDeps` to `RunDefaultDeps` to describe default Run dependencies more clearly.
  - Replaced `Run.addDeps` with explicit dependency passing via `run(task, deps)`, `run.orThrow(task, deps)`, and `run.create(deps)`.
  - Allowed explicit deps to override default `RunDefaultDeps` when needed.

## 3.0.0-next.2

### Patch Changes

- 65c1fe6: Documented `createTimingSafeEqual` in the Node.js crypto module.

## 3.0.0-next.1

### Minor Changes

- a883a8c: Added signal-aware relay authorization and exposed the actual bound port from Node.js relays.

  Added WebSocket test helpers for native client setup and raw upgrade requests.

  Made relay storage count duplicate timestamped messages only once when computing owner usage.

## 3.0.0-next.0

### Major Changes

- 5a4d172: Updated minimum Node.js version from 22 to 24 (current LTS)
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

- 6759c31: Rename `ManyToManyMap` to `Relation`.
  - `ManyToManyMap<K, V>` → `Relation<A, B>`
  - `createManyToManyMap` → `createRelation`
  - `getValues` / `getKeys` → `getB` / `getA`
  - `hasPair` / `hasKey` / `hasValue` → `has` / `hasA` / `hasB`
  - `deleteKey` / `deleteValue` → `deleteA` / `deleteB`
  - `keyCount` / `valueCount` / `pairCount` → `aCount` / `bCount` / `size`

- f4a8866: Add owner usage tracking and storage improvements

  ### Breaking Changes
  - Renamed `TransportConfig` to `OwnerTransport` and `WebSocketTransportConfig` to `OwnerWebSocketTransport` for clearer naming
  - Renamed `SqliteStorageBase` to `BaseSqliteStorage` and `createSqliteStorageBase` to `createBaseSqliteStorage`
  - Extracted storage table creation into separate functions: `createBaseSqliteStorageTables` and `createRelayStorageTables` to support serverless deployments where table setup must be separate from storage operations
  - Removed `assertNoErrorInCatch` - it was unnecessary

  ### Features
  - **Owner usage tracking** (in progress): Added `evolu_usage` table and `OwnerUsage` interface to track data consumption metrics per owner (stored bytes, received bytes, sent bytes, first/last timestamps). Table structure is in place but not yet fully implemented
  - **Timestamp privacy documentation**: Added privacy considerations explaining that timestamps are metadata visible to relays, with guidance on implementing local write queues for maximum privacy
  - **React Native polyfills**: Added polyfills for `AbortSignal.any()` and `AbortSignal.timeout()` to support Task cancellation on React Native platforms that don't yet implement these APIs

  ### Performance
  - **isSqlMutation optimization**: Added LRU cache (10,000 entries) to `isSqlMutation` function, restoring Timestamp insert benchmark from 34k back to 57k inserts/sec.

### Minor Changes

- 6195115: Relay access control and quota management

  **Access Control**
  - Added `isOwnerAllowed` callback to control which owners can connect to the relay
  - Allows synchronous or asynchronous authorization checks before accepting WebSocket connections
  - Replaces the previous `authenticateOwner` configuration option

  **Quota Management**
  - Added `isOwnerWithinQuota` callback for checking storage limits before accepting writes
  - Relays can now enforce per-owner storage quotas
  - New `ProtocolQuotaError` for quota violations
  - When quota is exceeded, only the affected device stops syncing - other devices continue normally
  - Usage is measured per owner as logical data size, excluding storage implementation overhead

  Check the Relay example in `/apps/relay`.

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

## 1.0.1-preview.12

### Patch Changes

- e2547d2: isOwnerWithinQuota is required, improve docs
- Updated dependencies [e2547d2]
- Updated dependencies [05fe5d5]
  - @evolu/common@6.0.1-preview.30

## 1.0.1-preview.11

### Patch Changes

- 6195115: Relay access control and quota management

  **Access Control**
  - Added `isOwnerAllowed` callback to control which owners can connect to the relay
  - Allows synchronous or asynchronous authorization checks before accepting WebSocket connections
  - Replaces the previous `authenticateOwner` configuration option

  **Quota Management**
  - Added `isOwnerWithinQuota` callback for checking storage limits before accepting writes
  - Relays can now enforce per-owner storage quotas
  - New `ProtocolQuotaError` for quota violations
  - When quota is exceeded, only the affected device stops syncing - other devices continue normally
  - Usage is measured per owner as logical data size, excluding storage implementation overhead

  Check the Relay example in `/apps/relay`.

- Updated dependencies [36af10c]
- Updated dependencies [91c132c]
- Updated dependencies [6195115]
- Updated dependencies [13b688f]
  - @evolu/common@6.0.1-preview.29

## 1.0.1-preview.10

### Patch Changes

- f4a8866: Add owner usage tracking and storage improvements

  ### Breaking Changes
  - Renamed `TransportConfig` to `OwnerTransport` and `WebSocketTransportConfig` to `OwnerWebSocketTransport` for clearer naming
  - Renamed `SqliteStorageBase` to `BaseSqliteStorage` and `createSqliteStorageBase` to `createBaseSqliteStorage`
  - Extracted storage table creation into separate functions: `createBaseSqliteStorageTables` and `createRelayStorageTables` to support serverless deployments where table setup must be separate from storage operations
  - Removed `assertNoErrorInCatch` - it was unnecessary

  ### Features
  - **Owner usage tracking** (in progress): Added `evolu_usage` table and `OwnerUsage` interface to track data consumption metrics per owner (stored bytes, received bytes, sent bytes, first/last timestamps). Table structure is in place but not yet fully implemented
  - **Timestamp privacy documentation**: Added privacy considerations explaining that timestamps are metadata visible to relays, with guidance on implementing local write queues for maximum privacy
  - **React Native polyfills**: Added polyfills for `AbortSignal.any()` and `AbortSignal.timeout()` to support Task cancellation on React Native platforms that don't yet implement these APIs

  ### Performance
  - **isSqlMutation optimization**: Added LRU cache (10,000 entries) to `isSqlMutation` function, restoring Timestamp insert benchmark from 34k back to 57k inserts/sec.

- Updated dependencies [f4a8866]
- Updated dependencies [02e8aa0]
- Updated dependencies [31d0d21]
  - @evolu/common@6.0.1-preview.26

## 1.0.1-preview.9

### Patch Changes

- d913cf9: Add relay authentication support with `authenticateOwner` callback
  - Add `createWebSocketTransportConfig` helper to create WebSocket transports with OwnerId for relay authentication
  - Add `parseOwnerIdFromUrl` to extract OwnerId from URL query strings on relay side
  - Add `authenticateOwner` callback to `RelayConfig` for controlling relay access by OwnerId
  - Add comprehensive relay logging with `createRelayLogger`
  - Refactor `createNodeJsRelay` to return `Result<Relay, SqliteError>` for proper error handling
  - Add HTTP upgrade authentication flow with appropriate status codes (400, 401, 500)
  - Rename `createRelayStorage` to `createRelaySqliteStorage` for clarity
  - Add `ProtocolQuotaExceededError` for storage/billing quota management (placeholder for future implementation)
  - Improve transport configuration documentation with redundancy best practices

- Updated dependencies [d913cf9]
  - @evolu/common@6.0.1-preview.21

## 1.0.1-preview.8

### Patch Changes

- 5c05d2e: Internal improvements and dependency updates
- Updated dependencies [eec5d8e]
- Updated dependencies [eec5d8e]
- Updated dependencies [eec5d8e]
- Updated dependencies [eec5d8e]
- Updated dependencies [eec5d8e]
  - @evolu/common@6.0.1-preview.20

## 1.0.1-preview.7

### Patch Changes

- 2f30dcd: Update deps
- Updated dependencies [2f30dcd]
- Updated dependencies [4a82c06]
  - @evolu/common@6.0.1-preview.18

## 1.0.1-preview.6

### Patch Changes

- d636768: Remove versioned database naming from relay

## 1.0.1-preview.5

### Patch Changes

- 7283ca1: Update better-sqlite3 version
- Updated dependencies [7283ca1]
  - @evolu/common@6.0.1-preview.9

## 1.0.1-preview.4

### Patch Changes

- d319317: Ensure "Evolu Relay started" is always logged
- Updated dependencies [f5e4232]
  - @evolu/common@6.0.1-preview.7

## 1.0.1-preview.3

### Patch Changes

- c86cb14: Add timing-safe comparison for WriteKey validation

  ### Security Improvements
  - Add `TimingSafeEqual` type and `TimingSafeEqualDep` interface for platform-independent timing-safe comparison
  - Implement Node.js timing-safe comparison using `crypto.timingSafeEqual()`
  - Replace vulnerable `eqArrayNumber` WriteKey comparison with constant-time algorithm to prevent timing attacks

- Updated dependencies [c86cb14]
  - @evolu/common@6.0.1-preview.5

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
