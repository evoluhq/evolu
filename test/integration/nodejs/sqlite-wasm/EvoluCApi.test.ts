/**
 * The bindings of Evolu's C core that `src/EvoluCApi.ts` generates, on the
 * pinned binary.
 */

import {
  assert,
  assertEqual,
  assertErr,
  assertInstanceOf,
  assertSame,
  assertTrue,
  getOrThrow,
  testCreateDeps,
  testCreateReportDefect,
  trySync,
  type RandomBytes,
  type TestRunDefaultDeps,
} from "@evolu/common";
import { test } from "node:test";
import {
  SQLITE_CANTOPEN,
  SQLITE_CORRUPT,
  SQLITE_ERROR,
  SQLITE_IOERR_WRITE,
  SQLITE_MISUSE,
  SQLITE_OK,
  SQLITE_OPEN_CREATE,
  SQLITE_OPEN_READWRITE,
  SQLITE_ROW,
} from "../../../../packages/sqlite-wasm/src/Constants.ts";
import {
  sqlite3_close_v2,
  sqlite3_exec,
  sqlite3_finalize,
  sqlite3_next_stmt,
  sqlite3_open_v2,
  sqlite3_prepare_v2,
  sqlite3_step,
} from "../../../../packages/sqlite-wasm/src/CApi.ts";
import {
  evolu_codec_open,
  evolu_codec_take_failure,
  evolu_core_register,
  evolu_skiplist_finalize,
} from "../../../../packages/sqlite-wasm/src/EvoluCApi.ts";
import { allocWasm } from "../../../../packages/sqlite-wasm/src/Memory.ts";
import type {
  NullPtr,
  SqliteDbPtr,
  SqliteStmtPtr,
  WasmPtr,
} from "../../../../packages/sqlite-wasm/src/Pointer.ts";
import { sahPoolHeaderSize } from "../../../../packages/sqlite-wasm/src/SahPool.ts";
import { setupSahPool, type TestSahPool } from "./_sahPool.ts";
import {
  setupDatabase,
  setupMemoryUsed,
  trapEveryOpen,
} from "./_sqliteWasm.ts";

test("evolu_core_register sets up a connection sqlite3_open_v2 opened: it's defensive and has the core's SQL functions", async () => {
  const t = await setupDatabase();

  assertEqual(evolu_core_register(t)(t.db), SQLITE_OK);

  assertEqual(t.selectText("SELECT evolu_core_version()"), "1");
  assertEqual(
    t.exec("CREATE TABLE t(a); PRAGMA writable_schema = ON"),
    SQLITE_OK,
  );
  assertEqual(
    t.exec(
      "UPDATE sqlite_schema SET sql = 'CREATE TABLE t(b)' WHERE name = 't'",
    ),
    SQLITE_ERROR,
  );
  assertEqual(t.errmsg(), "table sqlite_master may not be modified");
});

test("evolu_skiplist_finalize finalizes the statements the skiplist functions keep, so code that then finalizes every statement through sqlite3_next_stmt and closes the connection frees all its memory", async () => {
  const t = await setupDatabase();
  const memoryUsed = setupMemoryUsed(t);
  // Allocated first, since the helpers never free their strings.
  const memory = t.cString(":memory:");
  const sql = t.cString(
    'CREATE TABLE evolu_timestamp ("ownerId" BLOB NOT NULL, "t" BLOB NOT NULL, "h1" INTEGER, "h2" INTEGER, "c" INTEGER, "l" INTEGER NOT NULL, PRIMARY KEY ("ownerId", "t")) STRICT; BEGIN; SELECT evolu_skiplist_insert(zeroblob(16), zeroblob(16), 2); COMMIT; SELECT evolu_skiplist_size(zeroblob(16))',
  );
  const select = t.cString("SELECT 1");
  const baseline = memoryUsed();
  assertEqual(
    sqlite3_open_v2(t)(
      memory,
      t.scratch.out,
      SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE,
      0,
    ),
    SQLITE_OK,
  );
  const db = t.readPtr(t.scratch.out) as SqliteDbPtr;
  assertEqual(evolu_core_register(t)(db), SQLITE_OK);
  assertEqual(sqlite3_exec(t)(db, sql, 0, 0, 0), SQLITE_OK);
  // A statement of the code's own, still running.
  assertEqual(
    sqlite3_prepare_v2(t)(db, select, -1, t.scratch.out, 0),
    SQLITE_OK,
  );
  assertEqual(
    sqlite3_step(t)(t.readPtr(t.scratch.out) as SqliteStmtPtr),
    SQLITE_ROW,
  );

  evolu_skiplist_finalize(t)(db);
  // Calling it again finds nothing to finalize.
  evolu_skiplist_finalize(t)(db);
  for (
    let statement = sqlite3_next_stmt(t)(db, 0);
    statement !== 0;
    statement = sqlite3_next_stmt(t)(db, 0)
  )
    sqlite3_finalize(t)(statement);

  assertEqual(sqlite3_close_v2(t)(db), SQLITE_OK);
  assertEqual(memoryUsed(), baseline);
});

test("a skiplist function a statement calls after sqlite3_close_v2 closed its connection fails with SQLITE_MISUSE, and finalizing the statement closes the connection, freeing all its memory", async () => {
  const t = await setupDatabase();
  const memoryUsed = setupMemoryUsed(t);
  // Allocated first, since the helpers never free their strings.
  const memory = t.cString(":memory:");
  const sql = t.cString(
    'CREATE TABLE evolu_timestamp ("ownerId" BLOB NOT NULL, "t" BLOB NOT NULL, "h1" INTEGER, "h2" INTEGER, "c" INTEGER, "l" INTEGER NOT NULL, PRIMARY KEY ("ownerId", "t")) STRICT; BEGIN; SELECT evolu_skiplist_insert(zeroblob(16), zeroblob(16), 2); COMMIT',
  );
  const size = t.cString("SELECT evolu_skiplist_size(zeroblob(16))");
  const baseline = memoryUsed();
  assertEqual(
    sqlite3_open_v2(t)(
      memory,
      t.scratch.out,
      SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE,
      0,
    ),
    SQLITE_OK,
  );
  const db = t.readPtr(t.scratch.out) as SqliteDbPtr;
  assertEqual(evolu_core_register(t)(db), SQLITE_OK);
  // The insert leaves statements the functions keep.
  assertEqual(sqlite3_exec(t)(db, sql, 0, 0, 0), SQLITE_OK);
  assertEqual(sqlite3_prepare_v2(t)(db, size, -1, t.scratch.out, 0), SQLITE_OK);
  const statement = t.readPtr(t.scratch.out) as SqliteStmtPtr;

  // The statement keeps the connection open as a zombie.
  assertEqual(sqlite3_close_v2(t)(db), SQLITE_OK);

  assertEqual(sqlite3_step(t)(statement), SQLITE_MISUSE);
  assertEqual(sqlite3_finalize(t)(statement), SQLITE_MISUSE);
  assertEqual(memoryUsed(), baseline);
});

test("evolu_codec_take_failure fails with SQLITE_MISUSE for a NULL connection", async () => {
  const t = await setupDatabase();
  const failure = getOrThrow(allocWasm(t)(8));

  assertEqual(evolu_codec_take_failure(t)(0, failure), SQLITE_MISUSE);
});

test("a keyed database on a codec VFS over the pool draws its IVs through random_get, and a write whose random source throws fails with a RANDOM failure", async () => {
  const error = new Error("no randomness");
  const deps = testCreateDeps();
  let isRandomFailing = false;
  const randomBytes = {
    create: (length: number) => {
      if (isRandomFailing) throw error;
      return deps.randomBytes.create(length);
    },
  } as RandomBytes;
  const { t, db } = await setupKeyedDatabase({ ...deps, randomBytes });
  const failure = getOrThrow(allocWasm(t)(8));
  const readFailure = () => {
    const view = t.sqliteWasm.getHeapDataView();
    return [view.getInt32(failure, true), view.getUint32(failure + 4, true)];
  };

  assertEqual(evolu_codec_take_failure(t)(db, failure), SQLITE_OK);
  // EVOLU_CODEC_FAILURE_NONE.
  assertEqual(readFailure(), [0, 0]);

  isRandomFailing = true;
  assertEqual(t.exec("INSERT INTO t VALUES (1)", db), SQLITE_IOERR_WRITE);
  isRandomFailing = false;

  assertEqual(evolu_codec_take_failure(t)(db, failure), SQLITE_OK);
  // EVOLU_CODEC_FAILURE_RANDOM.
  assertEqual(readFailure(), [3, 0]);
  assertEqual(t.reportDefect.getDefects(), [error]);
  assertEqual(t.selectText("SELECT count(*) FROM t", db), "0");
});

test("a write whose random source throws after a nested call broke the instance lets what it threw unwind, unreported", async () => {
  const error = new Error("no randomness");
  const deps = testCreateDeps();
  const caught: Array<unknown> = [];
  let isRandomFailing = false;
  const randomBytes = {
    create: (length: number) => {
      if (!isRandomFailing) return deps.randomBytes.create(length);
      try {
        t.sqliteWasm.call(() => t.open(":memory:"));
      } catch (thrown) {
        caught.push(thrown);
      }
      throw error;
    },
  } as RandomBytes;
  const { t, db } = await setupKeyedDatabase({ ...deps, randomBytes });
  trapEveryOpen(t);

  isRandomFailing = true;
  const outer = trySync(
    () => t.sqliteWasm.call(() => t.exec("INSERT INTO t VALUES (1)", db)),
    (thrown) => thrown,
  );

  assertEqual(caught.length, 1);
  assertInstanceOf(caught[0], WebAssembly.RuntimeError);
  assertErr(outer);
  assertSame(outer.error, error);
  assertEqual(t.reportDefect.getDefects(), []);
});

test("a write whose random source returns bytes after catching what a nested call that broke the instance threw makes the outer call throw the refusal before any more VFS work", async () => {
  const deps = testCreateDeps();
  const caught: Array<unknown> = [];
  let opfsCallsWhenBroken = -1;
  let isBreaking = false;
  const randomBytes = {
    create: (length: number) => {
      if (isBreaking) {
        isBreaking = false;
        try {
          t.sqliteWasm.call(() => t.open(":memory:"));
        } catch (thrown) {
          caught.push(thrown);
        }
        opfsCallsWhenBroken = t.fake.calls.length;
      }
      return deps.randomBytes.create(length);
    },
  } as RandomBytes;
  const { t, db } = await setupKeyedDatabase({ ...deps, randomBytes });
  trapEveryOpen(t);

  isBreaking = true;
  const outer = trySync(
    () => t.sqliteWasm.call(() => t.exec("INSERT INTO t VALUES (1)", db)),
    (thrown) => thrown,
  );

  assertEqual(caught.length, 1);
  assertInstanceOf(caught[0], WebAssembly.RuntimeError);
  assertErr(outer);
  assertInstanceOf(outer.error, Error);
  assertEqual(
    outer.error.message,
    "The SQLite wasm instance is broken: an exception escaped a wasm call.",
  );
  assertSame(outer.error.cause, caught[0]);
  assertEqual(t.fake.calls.length, opfsCallsWhenBroken);
  assertEqual(t.reportDefect.getDefects(), []);
});

test("a write whose random source grows the memory with a nested allocation writes", async () => {
  const deps = testCreateDeps();
  let isGrowing = false;
  let didGrow = false;
  const randomBytes = {
    create: (length: number) => {
      if (isGrowing) {
        isGrowing = false;
        const before = t.sqliteWasm.getHeapU8().byteLength;
        const ptr = getOrThrow(allocWasm(t)(32 * 1024 * 1024));
        didGrow = t.sqliteWasm.getHeapU8().byteLength > before;
        t.sqliteWasm.exports.sqlite3_free(ptr);
      }
      return deps.randomBytes.create(length);
    },
  } as RandomBytes;
  const { t, db } = await setupKeyedDatabase({ ...deps, randomBytes });

  isGrowing = true;
  assertEqual(t.exec("INSERT INTO t VALUES (1)", db), SQLITE_OK);

  assertTrue(didGrow);
  assertEqual(t.reportDefect.getDefects(), []);
  assertEqual(t.selectText("SELECT count(*) FROM t", db), "1");
});

// Evolu's ReportDefect calls no SQLite, but a custom one can, and break the
// instance itself.
test("a write whose random source throws, with a ReportDefect that breaks the instance, makes the outer call throw the refusal, caused by what broke it, before the core resumes", async () => {
  const error = new Error("no randomness");
  const deps = testCreateDeps();
  const reported: Array<unknown> = [];
  const caught: Array<unknown> = [];
  let isRandomFailing = false;
  const randomBytes = {
    create: (length: number) => {
      if (isRandomFailing) throw error;
      return deps.randomBytes.create(length);
    },
  } as RandomBytes;
  const reportDefect = Object.assign((defect: unknown) => {
    reported.push(defect);
    try {
      t.sqliteWasm.call(() => t.open(":memory:"));
    } catch (thrown) {
      caught.push(thrown);
    }
  }, testCreateReportDefect());
  const { t, db } = await setupKeyedDatabase({
    ...deps,
    randomBytes,
    reportDefect,
  });
  const failure = getOrThrow(allocWasm(t)(8));
  trapEveryOpen(t);

  isRandomFailing = true;
  const outer = trySync(
    () => t.sqliteWasm.call(() => t.exec("INSERT INTO t VALUES (1)", db)),
    (thrown) => thrown,
  );

  assertEqual(reported, [error]);
  assertEqual(caught.length, 1);
  assertInstanceOf(caught[0], WebAssembly.RuntimeError);
  assertErr(outer);
  assertInstanceOf(outer.error, Error);
  assertEqual(
    outer.error.message,
    "The SQLite wasm instance is broken: an exception escaped a wasm call.",
  );
  assertSame(outer.error.cause, caught[0]);
  // No C ran after random_get, so the codec recorded no failure for the write.
  // The binding calls the export directly, past the refusal.
  assertEqual(evolu_codec_take_failure(t)(db, failure), SQLITE_OK);
  const view = t.sqliteWasm.getHeapDataView();
  assertEqual(
    [view.getInt32(failure, true), view.getUint32(failure + 4, true)],
    [0, 0],
  );
});

// The binding reads the struct as two i32s, and generate.mts maps every
// pointer type to i32, so only a test on wasm32 pins its layout.
test("evolu_codec_take_failure writes each failure type in 8 bytes, the type at 0 and the page number unsigned at 4", async () => {
  const deps = testCreateDeps();
  let isRandomFailing = false;
  const randomBytes = {
    create: (length: number) => {
      if (isRandomFailing) throw new Error("no randomness");
      return deps.randomBytes.create(length);
    },
  } as RandomBytes;
  const { t, db } = await setupKeyedDatabase({ ...deps, randomBytes });

  // EVOLU_CODEC_FAILURE_NONE.
  assertEqual(takeFailureBetweenSentinels(t, db), [0, 0]);

  isRandomFailing = true;
  assertEqual(t.exec("INSERT INTO t VALUES (1)", db), SQLITE_IOERR_WRITE);
  isRandomFailing = false;
  // EVOLU_CODEC_FAILURE_RANDOM.
  assertEqual(takeFailureBetweenSentinels(t, db), [3, 0]);

  // The worker dies in a transaction, so a hot journal stays.
  assertEqual(
    t.exec(
      "WITH RECURSIVE c(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM c WHERE i < 300) INSERT INTO t SELECT zeroblob(3000) FROM c; PRAGMA cache_size = 10; BEGIN; UPDATE t SET x = randomblob(3000)",
      db,
    ),
    SQLITE_OK,
  );
  t.fake.releaseHandles();
  const next = await setupSahPool({ fake: t.fake });
  // Its first record, past the header's sector, numbered above 2^31.
  const journalSlot = next.findSlotPath("/test.db-journal");
  const journal = next.fake.readFile(journalSlot);
  assert(journal != null, "The journal's slot exists.");
  const view = new DataView(journal.buffer, sahPoolHeaderSize);
  view.setUint32(view.getUint32(20), 0x89abcdef);
  next.fake.writeFile(journalSlot, journal);

  const keyless = openCodecDatabase(next, null);
  assertEqual(keyless.rc, SQLITE_CANTOPEN);
  // EVOLU_CODEC_FAILURE_ENCRYPTION_UNSUPPORTED.
  assertEqual(takeFailureBetweenSentinels(next, keyless.db), [2, 0]);
  assertEqual(sqlite3_close_v2(next)(keyless.db), SQLITE_OK);

  const wrongKey = openCodecDatabase(next, 8);
  assertEqual(wrongKey.rc, SQLITE_CORRUPT);
  // EVOLU_CODEC_FAILURE_PAGE_AUTHENTICATION.
  assertEqual(takeFailureBetweenSentinels(next, wrongKey.db), [1, 0x89abcdef]);
  assertEqual(sqlite3_close_v2(next)(wrongKey.db), SQLITE_OK);
});

/**
 * Takes the connection's codec failure into 8 bytes between 4 sentinel bytes on
 * each side, asserting that the sentinels stay, and returns its type and page
 * number.
 */
const takeFailureBetweenSentinels = (
  t: TestSahPool,
  db: SqliteDbPtr,
): [number, number] => {
  const block = getOrThrow(allocWasm(t)(16));
  t.sqliteWasm.getHeapU8().fill(0xa5, block, block + 16);
  assertEqual(
    evolu_codec_take_failure(t)(db, (block + 4) as WasmPtr),
    SQLITE_OK,
  );
  const heap = t.sqliteWasm.getHeapU8();
  assertEqual(
    [
      ...heap.subarray(block, block + 4),
      ...heap.subarray(block + 12, block + 16),
    ],
    Array.from({ length: 8 }, () => 0xa5),
  );
  const view = t.sqliteWasm.getHeapDataView();
  const failure: [number, number] = [
    view.getInt32(block + 4, true),
    view.getUint32(block + 8, true),
  ];
  t.sqliteWasm.exports.sqlite3_free(block);
  return failure;
};

/**
 * Opens `/test.db` on the pool's codec, keyed with 32 bytes of the given value
 * or keyless, returning the handle the open returns even on failure.
 */
const openCodecDatabase = (t: TestSahPool, keyByte: number | null) => {
  let key: WasmPtr | NullPtr = 0;
  if (keyByte != null) {
    key = getOrThrow(allocWasm(t)(32));
    t.sqliteWasm.getHeapU8().fill(keyByte, key, key + 32);
  }
  const rc = evolu_codec_open(t)(
    t.cString("/test.db"),
    t.scratch.out,
    t.cString(t.pool.vfsName),
    key,
    0,
  );
  return { rc, db: t.readPtr(t.scratch.out) as SqliteDbPtr };
};

/**
 * Opens a keyed database with a table on a pool on a fake OPFS, whose name is
 * Evolu's codec, on a fresh instance with the given dependencies.
 */
const setupKeyedDatabase = async (deps: TestRunDefaultDeps) => {
  const t = await setupSahPool({ deps });
  const key = getOrThrow(allocWasm(t)(32));
  t.sqliteWasm.getHeapU8().fill(7, key, key + 32);
  assertEqual(
    evolu_codec_open(t)(
      t.cString("/test.db"),
      t.scratch.out,
      t.cString(t.pool.vfsName),
      key,
      0,
    ),
    SQLITE_OK,
  );
  const db = t.readPtr(t.scratch.out) as SqliteDbPtr;
  assertEqual(t.exec("CREATE TABLE t (x)", db), SQLITE_OK);
  return { t, db };
};
