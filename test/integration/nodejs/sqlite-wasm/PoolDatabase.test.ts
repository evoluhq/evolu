/**
 * `createSqliteDatabase` with File databases on a `SahPool`, on the pinned
 * binary over a fake OPFS.
 *
 * The Memory tests in `Database.test.ts` cover statements, binding, reading and
 * errors; these cover what a pool adds: the file, its persistence, failures the
 * pool records, and releasing the file.
 */

import {
  assert,
  assertEqual,
  assertErr,
  assertFalse,
  assertInstanceOf,
  assertOk,
  assertThrows,
  getOrThrow,
  ok,
  type NonNegativeInt,
} from "@evolu/common";
import { test } from "node:test";
import {
  sqlite3_auto_extension,
  sqlite3_reset_auto_extension,
  sqlite3_trace_v2,
} from "../../../../packages/sqlite-wasm/src/CApi.ts";
import {
  SQLITE_CANTOPEN,
  SQLITE_CONSTRAINT_NOTNULL,
  SQLITE_ERROR,
  SQLITE_FULL,
  SQLITE_IOERR,
  SQLITE_IOERR_DELETE,
  SQLITE_IOERR_WRITE,
  SQLITE_NOTADB,
  SQLITE_OK,
  SQLITE_OPEN_CREATE,
  SQLITE_OPEN_MAIN_DB,
  SQLITE_OPEN_READWRITE,
  SQLITE_TRACE_PROFILE,
} from "../../../../packages/sqlite-wasm/src/Constants.ts";
import {
  createSqliteDatabase,
  SqliteVfsPath,
} from "../../../../packages/sqlite-wasm/src/Database.ts";
import { allocWasm } from "../../../../packages/sqlite-wasm/src/Memory.ts";
import type { SqliteDbPtr } from "../../../../packages/sqlite-wasm/src/Pointer.ts";
import { sahPoolHeaderSize } from "../../../../packages/sqlite-wasm/src/SahPool.ts";
import { installWasmFunctions } from "../../../../packages/sqlite-wasm/src/Wasm.ts";
import { createQuotaExceededError } from "./_fakeOpfs.ts";
import { setupSahPool, type TestSahPool } from "./_sahPool.ts";

/** Opens a path of the pool, `/evolu1.db` by default, as a File database. */
const openPoolDatabase = (t: TestSahPool, path = "/evolu1.db") =>
  createSqliteDatabase(t)({
    type: "File",
    vfs: t.pool,
    path: SqliteVfsPath.orThrow(path),
  });

test("a File database opens its path in the pool, and exec, prepare, run and export work on the file", async () => {
  const t = await setupSahPool();

  const database = getOrThrow(openPoolDatabase(t));

  assertOk(database.exec("CREATE TABLE t(a); INSERT INTO t VALUES (1), (2)"));
  const select = getOrThrow(
    database.prepare("SELECT group_concat(a) AS a FROM t"),
  );
  assertEqual(getOrThrow(select.run([])).rows, [{ a: "1,2" }]);
  assertEqual(
    getOrThrow(database.run("INSERT INTO t VALUES (?)", ["3"])).changes,
    1,
  );
  assertEqual(getOrThrow(select.run([])).rows, [{ a: "1,2,3" }]);
  assertEqual(t.pool.getPaths(), ["/evolu1.db"]);
  const bytes = getOrThrow(database.export());
  assertEqual(
    new TextDecoder().decode(bytes.subarray(0, 15)),
    "SQLite format 3",
  );
  assertEqual(
    bytes,
    getOrThrow(
      t.pool.read(
        "/evolu1.db",
        0 as NonNegativeInt,
        (bytes.length + 1) as NonNegativeInt,
      ),
    ),
  );
  database[Symbol.dispose]();
});

test("a File database keeps its rows after it and its pool are disposed, for the pool a new instance opens on the same files", async () => {
  const t = await setupSahPool();
  const database = getOrThrow(openPoolDatabase(t));
  assertOk(database.exec("CREATE TABLE t(a); INSERT INTO t VALUES ('kept')"));
  database[Symbol.dispose]();
  t.pool[Symbol.dispose]();

  const next = await setupSahPool({ fake: t.fake });
  const reopened = getOrThrow(openPoolDatabase(next));

  assertEqual(getOrThrow(reopened.run("SELECT a FROM t", [])).rows, [
    { a: "kept" },
  ]);
  reopened[Symbol.dispose]();
});

test("exec fails with the parser's error and its sqlOffset in the whole SQL when another connection's schema change leaves a statement after the first unable to re-prepare", async () => {
  const t = await setupSahPool();
  const database = getOrThrow(openPoolDatabase(t));
  const other = getOrThrow(openPoolDatabase(t));
  assertOk(database.exec("CREATE TABLE t(a, b)"));
  // The database keeps the schema it read, so it prepares the statement and
  // re-prepares it when it steps.
  assertOk(database.run("SELECT b FROM t", []));
  assertOk(other.exec("ALTER TABLE t DROP COLUMN b"));
  const sql = "SELECT 1; SELECT b FROM t";

  const executed = database.exec(sql);

  assertErr(executed, {
    type: "SqliteError",
    operation: "exec",
    extendedCode: SQLITE_ERROR,
    message: "no such column: b",
    sqlOffset: 17,
    cause: null,
  });
  assertEqual(sql.slice(17), "b FROM t");
  other[Symbol.dispose]();
  database[Symbol.dispose]();
});

/** Creates a file of 4096 bytes of `j` in the pool through its VFS. */
const createJunkFile = (t: TestSahPool, path: string): void => {
  const { rc, pFile } = t.openFile(
    path,
    SQLITE_OPEN_CREATE | SQLITE_OPEN_READWRITE | SQLITE_OPEN_MAIN_DB,
  );
  assertEqual(rc, SQLITE_OK);
  const junk = getOrThrow(allocWasm(t)(4096));
  t.sqliteWasm.getHeapU8().fill(0x6a, junk, junk + 4096);
  assertEqual(t.callIo(pFile, "xWrite", junk, 4096, 0n), SQLITE_OK);
  assertEqual(t.callIo(pFile, "xClose"), SQLITE_OK);
};

test("a File database on a file that is not a database fails to open with SQLITE_NOTADB and closes the file, so the pool can be disposed", async () => {
  const t = await setupSahPool();
  createJunkFile(t, "/junk.db");

  const opened = openPoolDatabase(t, "/junk.db");

  assertErr(opened);
  assertEqual(opened.error, {
    type: "SqliteError",
    operation: "open",
    extendedCode: SQLITE_NOTADB,
    message: "file is not a database",
    sqlOffset: null,
    cause: null,
  });
  assertEqual(t.pool.getPaths(), ["/junk.db"]);
  t.pool[Symbol.dispose]();
});

test("a File database that finds no free slot fails to open with SQLITE_CANTOPEN, caused by the pool's SahPoolFull record", async () => {
  const t = await setupSahPool();
  for (let index = 0; index < 6; index++) createJunkFile(t, `/full${index}.db`);

  const opened = openPoolDatabase(t);

  assertErr(opened);
  assertEqual(opened.error, {
    type: "SqliteError",
    operation: "open",
    extendedCode: SQLITE_CANTOPEN,
    message: "unable to open database file",
    sqlOffset: null,
    cause: {
      method: "xOpen",
      path: "/evolu1.db",
      error: { type: "SahPoolFull", capacity: 6 },
    },
  });
});

test("opening a File database on a disposed pool throws before entering wasm, so the instance and its other databases keep working", async () => {
  const t = await setupSahPool();
  const memory = getOrThrow(createSqliteDatabase(t)({ type: "Memory" }));
  t.pool[Symbol.dispose]();

  assertThrows(
    () => openPoolDatabase(t, "/test.db"),
    (thrown) => {
      assertInstanceOf(thrown, Error);
      assertEqual(thrown.message, "Cannot use a disposed object.");
    },
  );

  assertFalse(t.sqliteWasm.isBroken());
  assertEqual(getOrThrow(memory.run("SELECT 1 AS a", [])).rows, [{ a: 1 }]);
  const other = getOrThrow(createSqliteDatabase(t)({ type: "Memory" }));
  other[Symbol.dispose]();
  memory[Symbol.dispose]();
});

test("SqliteVfsPath rejects, with SqliteVfsPathError, a path that is not its own canonical path, so SQLite never reads it itself and a pool never maps it to another path, and a path whose super-journal's path a pool slot cannot hold", () => {
  for (const value of [
    // SQLite opens an in-memory database.
    "",
    ":memory:",
    // SQLite opens them on its kvvfs.
    ":localStorage:",
    ":sessionStorage:",
    // SQLite strips a URI's query and fragment and decodes its escapes.
    "file:evolu1.db",
    "file:secret.db?nolock=1",
    "file:frag.db#x",
    "file:a%2fb.db",
    "file::memory:",
    "file:x.db?mode=memory",
    // Other spellings of /evolu1.db.
    "evolu1.db",
    "/./evolu1.db",
    "/x/../evolu1.db",
    " /evolu1.db",
    "/evolu\t1.db",
    "/evolu\n1.db",
    "\\evolu1.db",
    "FILE:evolu1.db",
    // A scheme, so a pool would map them to the relative paths evolu1.db and
    // x.db, which name no file a SqliteVfsPath can open.
    "db:evolu1.db",
    "c:x.db",
    // Spellings of /a%20b.db and /%C5%BE.db.
    "/a b.db",
    "/ž.db",
    // SQLite reads the path only up to a NUL, and the VFS name follows it.
    "/b.db\0opfs-sahpool:.other",
    // The journal's suffix would land in a query, a fragment or a host.
    "/a?b.db",
    "/a#b.db",
    "/x.db?",
    "//evolu.db",
    // A URL drops the trailing space, but not the journal's.
    "/a.db ",
    // Not a valid URL path.
    "//[",
    // 499 bytes, and its super-journal 511, which a slot's header cannot hold.
    `/${"a".repeat(498)}`,
  ])
    assertErr(SqliteVfsPath.from.parent(value), {
      type: "SqliteVfsPath",
      value,
    });
  assertEqual(
    SqliteVfsPath.formatError({ type: "SqliteVfsPath", value: "file:a.db" }),
    'The value "file:a.db" is not a valid SqliteVfsPath.',
  );
});

test("SqliteVfsPath accepts a canonical path up to 498 bytes, which a pool lists and deletes by the same path, so a File database at the longest one opens, commits a transaction that writes an attached database, through a super-journal, and opens again", async () => {
  const longest = `/${"a".repeat(497)}`;
  for (const value of [
    "/evolu1.db",
    "/:memory:",
    "/a%20b.db",
    "/%C5%BE.db",
    longest,
  ]) {
    const path = SqliteVfsPath.orThrow(value);
    const t = await setupSahPool();
    getOrThrow(openPoolDatabase(t, path))[Symbol.dispose]();
    assertEqual(t.pool.getPaths(), [path]);
    assertEqual(t.pool.unlink(path), ok(true));
  }
  const t = await setupSahPool();

  const database = getOrThrow(openPoolDatabase(t, longest));
  assertOk(
    database.exec(
      "CREATE TABLE t(a); ATTACH '/b.db' AS b; CREATE TABLE b.u(a); BEGIN; INSERT INTO t VALUES (1); INSERT INTO b.u VALUES (2); COMMIT",
    ),
  );
  database[Symbol.dispose]();

  using reopened = getOrThrow(openPoolDatabase(t, longest));
  assertOk(reopened.exec("ATTACH '/b.db' AS b"));
  assertEqual(
    getOrThrow(reopened.run("SELECT t.a, u.a AS b FROM t, b.u", [])).rows,
    [{ a: 1, b: 2 }],
  );
  assertEqual(t.pool.getPaths().toSorted(), [longest, "/b.db"]);
});

test("a File database's path is a SqliteVfsPath, not a string", () => {
  void ((t: TestSahPool) =>
    createSqliteDatabase(t)({
      type: "File",
      vfs: t.pool,
      // @ts-expect-error A File database's path is a SqliteVfsPath, not a string.
      path: "file:evolu1.db",
    }));
});

/**
 * Makes the pool record a failure outside any database call, as `xDelete` of a
 * name that is not a valid URL path does.
 */
const recordStaleFailure = (t: TestSahPool): void => {
  t.pool.clearFailure();
  assertEqual(t.callVfs("xDelete", t.cString("//[")), SQLITE_IOERR_DELETE);
  assertEqual(t.pool.getFailure()?.method, "xDelete");
};

test("a SqliteError's cause is never a failure the pool recorded before the call, because open, prepare, run, a statement's run and exec clear the record first", async () => {
  const t = await setupSahPool();
  createJunkFile(t, "/junk.db");
  recordStaleFailure(t);
  const junk = openPoolDatabase(t, "/junk.db");
  assertErr(junk);
  assertEqual(
    [junk.error.extendedCode, junk.error.cause],
    [SQLITE_NOTADB, null],
  );

  const database = getOrThrow(openPoolDatabase(t));
  assertOk(database.exec("CREATE TABLE t(a NOT NULL)"));
  const insertNull = getOrThrow(
    database.prepare("INSERT INTO t VALUES (NULL)"),
  );
  for (const [call, code] of [
    [() => database.prepare("SELEC 1"), SQLITE_ERROR],
    [
      () => database.run("INSERT INTO t VALUES (NULL)", []),
      SQLITE_CONSTRAINT_NOTNULL,
    ],
    [() => insertNull.run([]), SQLITE_CONSTRAINT_NOTNULL],
    [() => database.exec("SELEC 1"), SQLITE_ERROR],
  ] as const) {
    recordStaleFailure(t);

    const result = call();

    assertErr(result);
    assert(result.error.type === "SqliteError", "Expected a SqliteError.");
    assertEqual([result.error.extendedCode, result.error.cause], [code, null]);
  }
  database[Symbol.dispose]();
});

// The build's default page size.
const pageSize = 8192;

test("export fails with SQLITE_IOERR and the pool's record as the cause when a page fails to read during it, which SQLite zero-fills, and succeeds after a failure recorded before it", async () => {
  const t = await setupSahPool();
  const database = getOrThrow(openPoolDatabase(t));
  assertOk(
    database.exec(
      "CREATE TABLE t(a); INSERT INTO t VALUES (randomblob(20000))",
    ),
  );
  database[Symbol.dispose]();
  // A new connection, whose cache holds only the first page.
  const reopened = getOrThrow(openPoolDatabase(t));
  const databaseSlot = t.findSlotPath("/evolu1.db");
  const error = new DOMException("Failed.", "InvalidStateError");
  t.fake.inject((call) =>
    call.method === "read" &&
    call.path === databaseSlot &&
    call.at >= sahPoolHeaderSize + pageSize
      ? { type: "Throw", error }
      : null,
  );

  const exported = reopened.export();

  assertErr(exported);
  assertEqual(exported.error, {
    type: "SqliteError",
    operation: "export",
    extendedCode: SQLITE_IOERR,
    message: "disk I/O error",
    sqlOffset: null,
    cause: { method: "xRead", path: "/evolu1.db", error },
  });
  t.fake.inject(null);
  recordStaleFailure(t);
  assertEqual(
    getOrThrow(reopened.export()),
    getOrThrow(
      t.pool.read(
        "/evolu1.db",
        0 as NonNegativeInt,
        (1 << 20) as NonNegativeInt,
      ),
    ),
  );
  reopened[Symbol.dispose]();
});

test("export fails with the pool's record as the cause also when a callback during it runs a query on the same database or another one on the pool, which leaves the record as it is", async () => {
  for (const isSameDatabase of [true, false]) {
    const t = await setupSahPool();
    const created = getOrThrow(openPoolDatabase(t));
    assertOk(
      created.exec(
        "CREATE TABLE t(a); INSERT INTO t VALUES (randomblob(20000))",
      ),
    );
    created[Symbol.dispose]();
    const other = getOrThrow(openPoolDatabase(t, "/other.db"));
    let isNesting = false;
    const nestedResults: Array<boolean> = [];
    const {
      pointers: [xTrace, xEntryPoint],
    } = installWasmFunctions(t)([
      {
        signature: "i(ippp)",
        // SQLite calls it when a statement finishes, also when the export
        // finalizes its query of the page count, after it read the pages.
        fn: () => {
          if (isNesting) {
            isNesting = false;
            const database = isSameDatabase ? reopened : other;
            nestedResults.push(database.run("SELECT 1", []).ok);
          }
          return 0;
        },
      },
      {
        signature: "i(ppp)",
        fn: (db: SqliteDbPtr) =>
          sqlite3_trace_v2(t)(db, SQLITE_TRACE_PROFILE, xTrace, 0),
      },
    ]);
    assertEqual(sqlite3_auto_extension(t)(xEntryPoint), SQLITE_OK);
    // A new connection, whose cache holds only the first page.
    const reopened = getOrThrow(openPoolDatabase(t));
    sqlite3_reset_auto_extension(t)();
    const databaseSlot = t.findSlotPath("/evolu1.db");
    const error = new DOMException("Failed.", "InvalidStateError");
    t.fake.inject((call) =>
      call.method === "read" &&
      call.path === databaseSlot &&
      call.at >= sahPoolHeaderSize + pageSize
        ? { type: "Throw", error }
        : null,
    );
    isNesting = true;

    const exported = reopened.export();

    assertErr(exported);
    assertEqual(exported.error, {
      type: "SqliteError",
      operation: "export",
      extendedCode: SQLITE_IOERR,
      message: "disk I/O error",
      sqlOffset: null,
      cause: { method: "xRead", path: "/evolu1.db", error },
    });
    assertEqual(nestedResults, [true]);
    t.fake.inject(null);
    reopened[Symbol.dispose]();
    other[Symbol.dispose]();
  }
});

// SQLite rolls back only the statement after SQLITE_FULL writing the journal,
// but the whole transaction after SQLITE_FULL writing the database and after
// SQLITE_IOERR, so a ROLLBACK then fails.
test("isAutocommit reports whether SQLite kept the transaction open after SQLITE_FULL or SQLITE_IOERR, so a ROLLBACK runs only when one is open", async () => {
  const quota = createQuotaExceededError();
  const invalidState = new DOMException("Failed.", "InvalidStateError");
  for (const [file, error, sql, extendedCode, autocommit] of [
    [
      "journal",
      quota,
      "UPDATE t SET a = randomblob(3000) WHERE rowid <= 5",
      SQLITE_FULL,
      false,
    ],
    [
      "journal",
      invalidState,
      "UPDATE t SET a = randomblob(3000) WHERE rowid <= 5",
      SQLITE_IOERR_WRITE,
      true,
    ],
    [
      "database",
      quota,
      "PRAGMA cache_size = 10; UPDATE t SET a = randomblob(3000)",
      SQLITE_FULL,
      true,
    ],
    ["database", quota, "COMMIT", SQLITE_FULL, true],
  ] as const) {
    const t = await setupSahPool();
    const database = getOrThrow(openPoolDatabase(t));
    assertOk(
      database.exec(
        "CREATE TABLE t(a); WITH RECURSIVE c(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM c WHERE i < 300) INSERT INTO t SELECT zeroblob(3000) FROM c",
      ),
    );
    assertOk(
      database.exec(
        "BEGIN; INSERT INTO t VALUES (1); UPDATE t SET a = randomblob(3000) WHERE rowid > 295",
      ),
    );
    const databaseSlot = t.findSlotPath("/evolu1.db");
    t.fake.inject((call) =>
      call.method === "write" &&
      call.at >= sahPoolHeaderSize &&
      (call.path === databaseSlot) === (file === "database")
        ? { type: "Throw", error }
        : null,
    );

    const failed = database.exec(sql);

    t.fake.inject(null);
    assertErr(failed);
    assert(failed.error.type === "SqliteError", "Expected a SqliteError.");
    assertEqual(failed.error.extendedCode, extendedCode);
    assertEqual(database.isAutocommit(), autocommit);
    // It is no operation, so it leaves the pool's record of the failure.
    assertEqual(t.pool.getFailure(), failed.error.cause);
    if (autocommit) assertErr(database.exec("ROLLBACK"));
    else assertOk(database.exec("ROLLBACK"));
    assertEqual(
      getOrThrow(database.run("SELECT count(*) AS n FROM t", [])).rows,
      [{ n: 300 }],
    );
    assertFalse(t.pool.getPaths().includes("/evolu1.db-journal"));
    database[Symbol.dispose]();
  }
});

test("disposing a File database finalizes the statements left open and closes its file, so the pool can be disposed and another context can take it", async () => {
  const t = await setupSahPool();
  const database = getOrThrow(openPoolDatabase(t));
  assertOk(database.exec("CREATE TABLE t(a); INSERT INTO t VALUES (1)"));
  const select = getOrThrow(database.prepare("SELECT a FROM t"));
  assertOk(select.run([]));

  database[Symbol.dispose]();

  t.pool[Symbol.dispose]();
  const next = await setupSahPool({ fake: t.fake });
  assertEqual(next.pool.getPaths(), ["/evolu1.db"]);
});

test("a statement that fails because the disk is full carries the pool's record of the write as its cause, in exec, run and a statement's run", async () => {
  const t = await setupSahPool();
  const database = getOrThrow(openPoolDatabase(t));
  assertOk(database.exec("CREATE TABLE t(a)"));
  const insert = getOrThrow(database.prepare("INSERT INTO t VALUES (1)"));
  const error = createQuotaExceededError();
  t.fake.inject((call) =>
    call.method === "write" && call.at >= sahPoolHeaderSize
      ? { type: "Throw", error }
      : null,
  );

  for (const failed of [
    database.exec("INSERT INTO t VALUES (1)"),
    database.run("INSERT INTO t VALUES (1)", []),
    insert.run([]),
  ]) {
    assertErr(failed);
    assert(failed.error.type === "SqliteError", "Expected a SqliteError.");
    assertEqual(
      [failed.error.extendedCode, failed.error.cause],
      [SQLITE_FULL, { method: "xWrite", path: "/evolu1.db-journal", error }],
    );
  }
  t.fake.inject(null);
  database[Symbol.dispose]();
});

test("opening a File database rolls back a hot journal its dead worker left, and fails, keeping the journal, when the rollback cannot write", async () => {
  const t = await setupSahPool();
  const database = getOrThrow(openPoolDatabase(t));
  assertOk(
    database.exec(
      "CREATE TABLE t(a); WITH RECURSIVE c(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM c WHERE i < 300) INSERT INTO t SELECT zeroblob(3000) FROM c; PRAGMA cache_size = 10; BEGIN; UPDATE t SET a = randomblob(3000)",
    ),
  );
  // The worker dies: its instance is abandoned and its handles released.
  t.fake.releaseHandles();
  const next = await setupSahPool({ fake: t.fake });
  const databaseSlot = next.findSlotPath("/evolu1.db");
  const error = createQuotaExceededError();
  next.fake.inject((call) =>
    call.method === "write" &&
    call.path === databaseSlot &&
    call.at >= sahPoolHeaderSize
      ? { type: "Throw", error }
      : null,
  );

  const failed = openPoolDatabase(next);

  assertErr(failed);
  assertEqual(
    [failed.error.operation, failed.error.extendedCode, failed.error.cause],
    ["open", SQLITE_FULL, { method: "xWrite", path: "/evolu1.db", error }],
  );
  assertEqual(next.pool.getPaths(), ["/evolu1.db", "/evolu1.db-journal"]);
  next.fake.inject(null);

  const reopened = getOrThrow(openPoolDatabase(next));

  assertEqual(next.pool.getPaths(), ["/evolu1.db"]);
  assertEqual(
    getOrThrow(
      reopened.run(
        "SELECT count(*) AS n, sum(a = zeroblob(3000)) AS unchanged FROM t",
        [],
      ),
    ).rows,
    [{ n: 300, unchanged: 300 }],
  );
  reopened[Symbol.dispose]();
});
