/**
 * The variadic {@link sqlite3_config} and {@link sqlite3_db_config} on the pinned
 * binary, for every group of options.
 *
 * Ports tests of SQLite's `ext/wasm/tester1.c-pp.js` (public domain), cited by
 * group and test.
 */

import { assertEqual, assertOk, assertType, getOrThrow } from "@evolu/common";
import { test } from "node:test";
import {
  sqlite3_close_v2,
  sqlite3_config,
  sqlite3_db_config,
  sqlite3_finalize,
  sqlite3_shutdown,
  type SqliteDbConfigIntOp,
} from "../../../../packages/sqlite-wasm/src/CApi.ts";
import {
  SQLITE_BUSY,
  SQLITE_CONFIG_COVERING_INDEX_SCAN,
  SQLITE_CONFIG_GETMALLOC,
  SQLITE_CONFIG_LOOKASIDE,
  SQLITE_CONFIG_MEMDB_MAXSIZE,
  SQLITE_CONFIG_MEMSTATUS,
  SQLITE_CONFIG_SMALL_MALLOC,
  SQLITE_CONFIG_SORTERREF_SIZE,
  SQLITE_CONFIG_STMTJRNL_SPILL,
  SQLITE_CONFIG_URI,
  SQLITE_DBCONFIG_DEFENSIVE,
  SQLITE_DBCONFIG_DQS_DDL,
  SQLITE_DBCONFIG_DQS_DML,
  SQLITE_DBCONFIG_ENABLE_ATTACH_CREATE,
  SQLITE_DBCONFIG_ENABLE_ATTACH_WRITE,
  SQLITE_DBCONFIG_ENABLE_COMMENTS,
  SQLITE_DBCONFIG_ENABLE_FKEY,
  SQLITE_DBCONFIG_ENABLE_LOAD_EXTENSION,
  SQLITE_DBCONFIG_ENABLE_QPSG,
  SQLITE_DBCONFIG_ENABLE_TRIGGER,
  SQLITE_DBCONFIG_ENABLE_VIEW,
  SQLITE_DBCONFIG_FP_DIGITS,
  SQLITE_DBCONFIG_LEGACY_ALTER_TABLE,
  SQLITE_DBCONFIG_LEGACY_FILE_FORMAT,
  SQLITE_DBCONFIG_LOOKASIDE,
  SQLITE_DBCONFIG_MAINDBNAME,
  SQLITE_DBCONFIG_MAX,
  SQLITE_DBCONFIG_NO_CKPT_ON_CLOSE,
  SQLITE_DBCONFIG_RESET_DATABASE,
  SQLITE_DBCONFIG_REVERSE_SCANORDER,
  SQLITE_DBCONFIG_STMT_SCANSTATUS,
  SQLITE_DBCONFIG_TRIGGER_EQP,
  SQLITE_DBCONFIG_TRUSTED_SCHEMA,
  SQLITE_DBCONFIG_WRITABLE_SCHEMA,
  SQLITE_ERROR,
  SQLITE_FULL,
  SQLITE_MISUSE,
  SQLITE_NOTFOUND,
  SQLITE_OK,
} from "../../../../packages/sqlite-wasm/src/Constants.ts";
import { allocWasm } from "../../../../packages/sqlite-wasm/src/Memory.ts";
import { initializeSqliteWasm } from "../../../../packages/sqlite-wasm/src/Wasm.ts";
import { setupDatabase, type TestDatabase } from "./_sqliteWasm.ts";

/** Reads the int a `pResult` argument received. */
const readResult = (t: TestDatabase): number =>
  t.sqliteWasm.getHeapDataView().getInt32(t.scratch.out, true);

// tester1.c-pp.js 'sqlite3.oo1' 'sqlite3_db_config() and sqlite3_status()'.
test("sqlite3_db_config sets, clears and reads a flag, writing it to pResult", async () => {
  const t = await setupDatabase();
  const dbConfig = sqlite3_db_config(t);

  assertEqual(
    dbConfig(t.db, SQLITE_DBCONFIG_ENABLE_FKEY, -1, t.scratch.out),
    SQLITE_OK,
  );
  assertEqual(readResult(t), 0);
  assertEqual(
    dbConfig(t.db, SQLITE_DBCONFIG_ENABLE_FKEY, 1, t.scratch.out),
    SQLITE_OK,
  );
  assertEqual(readResult(t), 1);
  assertEqual(dbConfig(t.db, SQLITE_DBCONFIG_ENABLE_FKEY, 0), SQLITE_OK);
  assertEqual(
    dbConfig(t.db, SQLITE_DBCONFIG_ENABLE_FKEY, -1, t.scratch.out),
    SQLITE_OK,
  );
  assertEqual(readResult(t), 0);
  assertEqual(
    dbConfig(t.db, SQLITE_DBCONFIG_LEGACY_ALTER_TABLE, 0, 0),
    SQLITE_OK,
  );

  assertEqual(dbConfig(t.db, SQLITE_DBCONFIG_ENABLE_COMMENTS, 0), SQLITE_OK);
  assertEqual(t.exec("select 1 /* with comments */"), SQLITE_ERROR);
  assertEqual(dbConfig(t.db, SQLITE_DBCONFIG_ENABLE_COMMENTS, 1), SQLITE_OK);
  assertEqual(t.exec("select 1 /* with comments */"), SQLITE_OK);
});

test("sqlite3_db_config reads and sets every flag the build supports", async () => {
  const t = await setupDatabase();
  const dbConfig = sqlite3_db_config(t);
  const flags = [
    SQLITE_DBCONFIG_ENABLE_FKEY,
    SQLITE_DBCONFIG_ENABLE_TRIGGER,
    SQLITE_DBCONFIG_ENABLE_LOAD_EXTENSION,
    SQLITE_DBCONFIG_NO_CKPT_ON_CLOSE,
    SQLITE_DBCONFIG_ENABLE_QPSG,
    SQLITE_DBCONFIG_TRIGGER_EQP,
    SQLITE_DBCONFIG_RESET_DATABASE,
    SQLITE_DBCONFIG_DEFENSIVE,
    SQLITE_DBCONFIG_WRITABLE_SCHEMA,
    SQLITE_DBCONFIG_LEGACY_ALTER_TABLE,
    SQLITE_DBCONFIG_DQS_DML,
    SQLITE_DBCONFIG_DQS_DDL,
    SQLITE_DBCONFIG_ENABLE_VIEW,
    SQLITE_DBCONFIG_LEGACY_FILE_FORMAT,
    SQLITE_DBCONFIG_TRUSTED_SCHEMA,
    SQLITE_DBCONFIG_STMT_SCANSTATUS,
    SQLITE_DBCONFIG_REVERSE_SCANORDER,
    SQLITE_DBCONFIG_ENABLE_ATTACH_CREATE,
    SQLITE_DBCONFIG_ENABLE_ATTACH_WRITE,
    SQLITE_DBCONFIG_ENABLE_COMMENTS,
  ] as const;
  // Every int option but SQLITE_DBCONFIG_FP_DIGITS is a flag.
  assertType<
    (typeof flags)[number],
    Exclude<SqliteDbConfigIntOp, typeof SQLITE_DBCONFIG_FP_DIGITS>
  >();
  /** Calls with pResult holding 7, so its result shows that it was written. */
  const callFlag = (flag: (typeof flags)[number], value: number) => {
    t.sqliteWasm.getHeapDataView().setInt32(t.scratch.out, 7, true);
    return [dbConfig(t.db, flag, value, t.scratch.out), readResult(t)];
  };

  const results = flags.map((flag) => {
    const [readCode, initial] = callFlag(flag, -1);
    return [flag, readCode, initial === 0 || initial === 1, callFlag(flag, 1)];
  });

  assertEqual(
    results,
    flags.map((flag) => [flag, SQLITE_OK, true, [SQLITE_OK, 1]]),
  );
});

test("sqlite3_db_config sets the significant digits of floating-point text", async () => {
  const t = await setupDatabase();
  const dbConfig = sqlite3_db_config(t);

  // A value outside 4 to 23 only reads the setting.
  assertEqual(
    dbConfig(t.db, SQLITE_DBCONFIG_FP_DIGITS, 0, t.scratch.out),
    SQLITE_OK,
  );
  assertEqual(readResult(t), 17);

  assertEqual(
    dbConfig(t.db, SQLITE_DBCONFIG_FP_DIGITS, 5, t.scratch.out),
    SQLITE_OK,
  );
  assertEqual(readResult(t), 5);
  assertEqual(t.selectText("select 1.0 / 3"), "0.33333");
});

// tester1.c-pp.js 'sqlite3.oo1' 'sqlite3_db_config() and sqlite3_status()'.
test("sqlite3_db_config renames the main schema", async () => {
  const t = await setupDatabase();
  const dbConfig = sqlite3_db_config(t);

  assertEqual(
    dbConfig(t.db, SQLITE_DBCONFIG_MAINDBNAME, t.cString("main")),
    SQLITE_OK,
  );
  assertEqual(
    dbConfig(t.db, SQLITE_DBCONFIG_MAINDBNAME, t.cString("other")),
    SQLITE_OK,
  );

  assertEqual(t.selectText("select name from pragma_database_list"), "other");
});

test("sqlite3_db_config sets the lookaside allocator only while it is unused", async () => {
  const t = await setupDatabase();
  const dbConfig = sqlite3_db_config(t);
  const withBuffer = t.open(":memory:");
  const buffer = getOrThrow(allocWasm(t)(64 * 10));

  assertEqual(dbConfig(t.db, SQLITE_DBCONFIG_LOOKASIDE, 0, 64, 10), SQLITE_OK);
  assertEqual(
    dbConfig(withBuffer.db, SQLITE_DBCONFIG_LOOKASIDE, buffer, 64, 10),
    SQLITE_OK,
  );
  assertEqual(t.selectText("select 1", withBuffer.db), "1");

  // A prepared statement holds lookaside memory.
  const stmt = t.prepare("select 1");
  assertEqual(
    dbConfig(t.db, SQLITE_DBCONFIG_LOOKASIDE, 0, 64, 10),
    SQLITE_BUSY,
  );
  assertEqual(sqlite3_finalize(t)(stmt), SQLITE_OK);
  assertEqual(dbConfig(t.db, SQLITE_DBCONFIG_LOOKASIDE, 0, 32, 20), SQLITE_OK);
  assertEqual(sqlite3_close_v2(t)(withBuffer.db), SQLITE_OK);
});

// tester1.c-pp.js 'sqlite3.oo1' 'sqlite3_db_config() and sqlite3_status()'.
test("sqlite3_db_config returns SQLITE_MISUSE for an option it does not take", async () => {
  const t = await setupDatabase();

  assertEqual(
    // @ts-expect-error The value after SQLITE_DBCONFIG_MAX is not an option.
    sqlite3_db_config(t)(t.db, SQLITE_DBCONFIG_MAX + 1, 0),
    SQLITE_MISUSE,
  );
});

// tester1.c-pp.js 'Basic sanity checks' 'sqlite3_config()'.
test("sqlite3_config returns SQLITE_MISUSE once the library is initialized and SQLITE_NOTFOUND for an option it does not take", async () => {
  const t = await setupDatabase();
  const config = sqlite3_config(t);

  assertEqual(config(SQLITE_CONFIG_URI, 1), SQLITE_MISUSE);
  assertEqual(
    // @ts-expect-error SQLITE_CONFIG_GETMALLOC takes a pointer the shims do not pass.
    config(SQLITE_CONFIG_GETMALLOC, 1),
    SQLITE_NOTFOUND,
  );
});

// tester1.c-pp.js 'Basic sanity checks' 'sqlite3_config()' cannot shut the
// library down; an instance per test can.
test("sqlite3_config changes the library's options after sqlite3_shutdown", async () => {
  const t = await setupDatabase();
  const config = sqlite3_config(t);
  assertEqual(sqlite3_close_v2(t)(t.db), SQLITE_OK);
  assertEqual(sqlite3_shutdown(t)(), SQLITE_OK);

  assertEqual(config(SQLITE_CONFIG_MEMSTATUS, 0), SQLITE_OK);
  assertEqual(config(SQLITE_CONFIG_SMALL_MALLOC, 1), SQLITE_OK);
  assertEqual(config(SQLITE_CONFIG_COVERING_INDEX_SCAN, 0), SQLITE_OK);
  assertEqual(config(SQLITE_CONFIG_STMTJRNL_SPILL, 1024), SQLITE_OK);
  // This build does not enable sorter references.
  assertEqual(config(SQLITE_CONFIG_SORTERREF_SIZE, 1), SQLITE_ERROR);
  assertEqual(config(SQLITE_CONFIG_LOOKASIDE, 64, 10), SQLITE_OK);
  assertEqual(config(SQLITE_CONFIG_URI, 1), SQLITE_OK);
  assertEqual(config(SQLITE_CONFIG_MEMDB_MAXSIZE, 65536n), SQLITE_OK);
  assertOk(initializeSqliteWasm(t)());

  // A URI filename opens without SQLITE_OPEN_URI, and a memdb database stops
  // growing at the configured size.
  const memdb = t.open("file:/limited?vfs=memdb");
  assertEqual(memdb.rc, SQLITE_OK);
  assertEqual(
    t.exec(
      "create table t(a); with recursive n(i) as (select 1 union all select i + 1 from n where i < 100) insert into t select randomblob(1000) from n",
      memdb.db,
    ),
    SQLITE_FULL,
  );
});
