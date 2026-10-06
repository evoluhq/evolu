/**
 * SQLite's C API through the generated bindings on the pinned binary, without
 * callbacks.
 *
 * Ports the tests of SQLite's `ext/wasm/tester1.c-pp.js` (public domain), cited
 * by group and test, and covers the scenarios of wa-sqlite's tests (MIT), cited
 * by file, with tests of our own.
 */

import {
  assert,
  assertEqual,
  assertFalse,
  assertNotEqual,
  assertTrue,
  getOrThrow,
  Millis,
  testCreateDeps,
  testCreateTime,
} from "@evolu/common";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  sqlite3_bind_blob,
  sqlite3_bind_double,
  sqlite3_bind_int,
  sqlite3_bind_int64,
  sqlite3_bind_null,
  sqlite3_bind_parameter_count,
  sqlite3_bind_parameter_index,
  sqlite3_bind_parameter_name,
  sqlite3_bind_text,
  sqlite3_bind_zeroblob,
  sqlite3_changes,
  sqlite3_changes64,
  sqlite3_clear_bindings,
  sqlite3_close_v2,
  sqlite3_column_blob,
  sqlite3_column_bytes,
  sqlite3_column_count,
  sqlite3_column_decltype,
  sqlite3_column_double,
  sqlite3_column_int,
  sqlite3_column_int64,
  sqlite3_column_name,
  sqlite3_column_text,
  sqlite3_column_type,
  sqlite3_column_value,
  sqlite3_compileoption_get,
  sqlite3_compileoption_used,
  sqlite3_complete,
  sqlite3_data_count,
  sqlite3_db_filename,
  sqlite3_db_handle,
  sqlite3_db_name,
  sqlite3_db_readonly,
  sqlite3_db_status,
  sqlite3_deserialize,
  sqlite3_errcode,
  sqlite3_error_offset,
  sqlite3_errstr,
  sqlite3_expanded_sql,
  sqlite3_extended_errcode,
  sqlite3_extended_result_codes,
  sqlite3_finalize,
  sqlite3_free,
  sqlite3_get_autocommit,
  sqlite3_interrupt,
  sqlite3_is_interrupted,
  sqlite3_keyword_check,
  sqlite3_keyword_count,
  sqlite3_keyword_name,
  sqlite3_last_insert_rowid,
  sqlite3_limit,
  sqlite3_malloc,
  sqlite3_malloc64,
  sqlite3_msize,
  sqlite3_next_stmt,
  sqlite3_prepare_v2,
  sqlite3_prepare_v3,
  sqlite3_randomness,
  sqlite3_realloc,
  sqlite3_reset,
  sqlite3_serialize,
  sqlite3_set_errmsg,
  sqlite3_set_last_insert_rowid,
  sqlite3_sourceid,
  sqlite3_sql,
  sqlite3_status,
  sqlite3_status64,
  sqlite3_step,
  sqlite3_stmt_busy,
  sqlite3_stmt_explain,
  sqlite3_stmt_isexplain,
  sqlite3_stmt_readonly,
  sqlite3_stmt_status,
  sqlite3_strglob,
  sqlite3_stricmp,
  sqlite3_strlike,
  sqlite3_strnicmp,
  sqlite3_table_column_metadata,
  sqlite3_total_changes64,
  sqlite3_txn_state,
  sqlite3_value_dup,
  sqlite3_value_free,
  sqlite3_value_int,
  sqlite3_value_text,
  sqlite3_value_bytes,
  sqlite3_value_type,
  sqlite3_vfs_find,
} from "../../../../packages/sqlite-wasm/src/CApi.ts";
import {
  SQLITE_BLOB,
  SQLITE_CONSTRAINT,
  SQLITE_CONSTRAINT_PRIMARYKEY,
  SQLITE_CORRUPT,
  SQLITE_DBSTATUS_SCHEMA_USED,
  SQLITE_DESERIALIZE_FREEONCLOSE,
  SQLITE_DESERIALIZE_RESIZEABLE,
  SQLITE_DONE,
  SQLITE_ERROR,
  SQLITE_FLOAT,
  SQLITE_INTEGER,
  SQLITE_IOERR_ACCESS,
  SQLITE_LIMIT_COLUMN,
  SQLITE_MISUSE,
  SQLITE_NULL,
  SQLITE_OK,
  SQLITE_OPEN_CREATE,
  SQLITE_OPEN_READONLY,
  SQLITE_OPEN_READWRITE,
  SQLITE_OPEN_URI,
  SQLITE_PREPARE_PERSISTENT,
  SQLITE_RANGE,
  SQLITE_ROW,
  SQLITE_STATUS_MEMORY_USED,
  SQLITE_STMTSTATUS_RUN,
  SQLITE_TEXT,
  SQLITE_TRANSIENT,
  SQLITE_TXN_NONE,
  SQLITE_TXN_WRITE,
  SQLITE_WASM_DEALLOC,
  sqlite3_io_methods_layout,
  sqlite3_vfs_layout,
} from "../../../../packages/sqlite-wasm/src/Constants.ts";
import {
  allocWasm,
  copyWasmBytes,
  readCString,
  readUtf8,
  writeWasmBytes,
} from "../../../../packages/sqlite-wasm/src/Memory.ts";
import type {
  CStringPtr,
  SqliteDbPtr,
  SqliteStmtPtr,
  WasmPtr,
} from "../../../../packages/sqlite-wasm/src/Pointer.ts";
import { setupDatabase } from "./_sqliteWasm.ts";

// wa-sqlite test/api.test.js and tester1.c-pp.js 'sqlite3.oo1' 'Close db'.
test("sqlite3_open_v2 opens a :memory: database and sqlite3_close_v2 closes it", async () => {
  const t = await setupDatabase();

  const second = t.open(":memory:");

  assertEqual(second.rc, SQLITE_OK);
  assertTrue(second.db !== 0);
  assertNotEqual(second.db, t.db);
  assertEqual(t.text(sqlite3_db_filename(t)(second.db, t.cString("main"))), "");
  assertEqual(t.text(sqlite3_db_name(t)(second.db, 0)), "main");
  assertEqual(sqlite3_close_v2(t)(second.db), SQLITE_OK);
  assertEqual(sqlite3_close_v2(t)(t.db), SQLITE_OK);
});

// wa-sqlite test/sqlite-api-open.test.js.
test("a failed open returns a handle that sqlite3_errmsg describes and sqlite3_close_v2 closes", async () => {
  const t = await setupDatabase();

  const failed = t.open("/missing/database.db", SQLITE_OPEN_READONLY);

  assertEqual(failed.rc, 14);
  assertTrue(failed.db !== 0);
  assertEqual(t.errmsg(failed.db), "unable to open database file");
  assertEqual(sqlite3_close_v2(t)(failed.db), SQLITE_OK);
});

// tester1.c-pp.js 'sqlite3.oo1' 'DB.Stmt'.
test("a statement steps and reads its column in every type", async () => {
  const t = await setupDatabase();
  const stmt = t.prepare("select 3 as a");

  assertEqual(sqlite3_stmt_status(t)(stmt, SQLITE_STMTSTATUS_RUN, 0), 0);
  assertEqual(t.text(sqlite3_column_name(t)(stmt, 0)), "a");
  assertEqual(sqlite3_column_count(t)(stmt), 1);
  assertEqual(sqlite3_bind_parameter_count(t)(stmt), 0);
  assertEqual(sqlite3_bind_null(t)(stmt, 1), SQLITE_RANGE);
  assertEqual(sqlite3_data_count(t)(stmt), 0);
  assertEqual(sqlite3_db_handle(t)(stmt), t.db);

  assertEqual(sqlite3_step(t)(stmt), SQLITE_ROW);
  assertEqual(sqlite3_data_count(t)(stmt), 1);
  assertEqual(sqlite3_column_type(t)(stmt, 0), SQLITE_INTEGER);
  assertEqual(sqlite3_column_int(t)(stmt, 0), 3);
  assertEqual(sqlite3_column_int64(t)(stmt, 0), 3n);
  assertEqual(sqlite3_column_double(t)(stmt, 0), 3);
  assertEqual(t.columnText(stmt, 0), "3");
  const blob = sqlite3_column_blob(t)(stmt, 0);
  assertTrue(blob !== 0);
  assertEqual(
    copyWasmBytes(t)(blob, sqlite3_column_bytes(t)(stmt, 0)),
    Uint8Array.of(0x33),
  );

  assertEqual(sqlite3_step(t)(stmt), SQLITE_DONE);
  assertTrue(sqlite3_stmt_status(t)(stmt, SQLITE_STMTSTATUS_RUN, 0) > 0);
  assertEqual(sqlite3_finalize(t)(stmt), SQLITE_OK);
  assertEqual(sqlite3_next_stmt(t)(t.db, 0), 0);
});

// wa-sqlite test/api_statements.js 'should bind blob'.
test("sqlite3_bind_blob binds bytes that read back as a BLOB", async () => {
  const t = await setupDatabase();
  const stmt = t.prepare("select ?");
  const value = Uint8Array.of(1, 2, 3, 4, 5);
  const ptr = getOrThrow(allocWasm(t)(value.length));
  writeWasmBytes(t)(ptr, value);

  assertEqual(
    sqlite3_bind_blob(t)(stmt, 1, ptr, value.length, SQLITE_TRANSIENT),
    SQLITE_OK,
  );
  assertEqual(sqlite3_step(t)(stmt), SQLITE_ROW);

  assertEqual(sqlite3_column_type(t)(stmt, 0), SQLITE_BLOB);
  const blob = sqlite3_column_blob(t)(stmt, 0);
  assertTrue(blob !== 0);
  assertEqual(copyWasmBytes(t)(blob, sqlite3_column_bytes(t)(stmt, 0)), value);
});

// wa-sqlite test/api_statements.js 'should bind double'.
test("sqlite3_bind_double binds a FLOAT", async () => {
  const t = await setupDatabase();
  const stmt = t.prepare("select ?");

  assertEqual(sqlite3_bind_double(t)(stmt, 1, Math.PI), SQLITE_OK);
  assertEqual(sqlite3_step(t)(stmt), SQLITE_ROW);

  assertEqual(sqlite3_column_type(t)(stmt, 0), SQLITE_FLOAT);
  assertEqual(sqlite3_column_double(t)(stmt, 0), Math.PI);
});

// wa-sqlite test/api_statements.js 'should bind int'.
test("sqlite3_bind_int binds an INTEGER", async () => {
  const t = await setupDatabase();
  const stmt = t.prepare("select ?");

  assertEqual(sqlite3_bind_int(t)(stmt, 1, 42), SQLITE_OK);
  assertEqual(sqlite3_step(t)(stmt), SQLITE_ROW);

  assertEqual(sqlite3_column_type(t)(stmt, 0), SQLITE_INTEGER);
  assertEqual(sqlite3_column_int(t)(stmt, 0), 42);
});

// wa-sqlite test/api_statements.js 'should bind int64' and tester1.c-pp.js
// 'sqlite3.oo1' 'Table t', which selects the largest safe integers.
test("sqlite3_bind_int64 binds integers beyond 2^53 and the 64-bit limits", async () => {
  const t = await setupDatabase();
  const stmt = t.prepare("select ?");

  for (const value of [
    BigInt(Number.MAX_SAFE_INTEGER) + 1n,
    2n ** 63n - 1n,
    -(2n ** 63n),
  ]) {
    assertEqual(sqlite3_bind_int64(t)(stmt, 1, value), SQLITE_OK);
    assertEqual(sqlite3_step(t)(stmt), SQLITE_ROW);
    assertEqual(sqlite3_column_type(t)(stmt, 0), SQLITE_INTEGER);
    assertEqual(sqlite3_column_int64(t)(stmt, 0), value);
    assertEqual(sqlite3_reset(t)(stmt), SQLITE_OK);
  }

  assertEqual(
    t.selectText(`select ${Number.MAX_SAFE_INTEGER}`),
    `${Number.MAX_SAFE_INTEGER}`,
  );
  assertEqual(
    t.selectText(`select ${Number.MIN_SAFE_INTEGER}`),
    `${Number.MIN_SAFE_INTEGER}`,
  );
});

// wa-sqlite test/api_statements.js 'should bind null'.
test("sqlite3_bind_null binds NULL", async () => {
  const t = await setupDatabase();
  const stmt = t.prepare("select ?");
  assertEqual(sqlite3_bind_int(t)(stmt, 1, 1), SQLITE_OK);

  assertEqual(sqlite3_bind_null(t)(stmt, 1), SQLITE_OK);
  assertEqual(sqlite3_step(t)(stmt), SQLITE_ROW);

  assertEqual(sqlite3_column_type(t)(stmt, 0), SQLITE_NULL);
});

// wa-sqlite test/api_statements.js 'should bind text' and 'should bind text
// with NUL bytes'.
test("sqlite3_bind_text binds text of an explicit byte length, embedded NUL characters included", async () => {
  const t = await setupDatabase();
  const stmt = t.prepare("select ?1, hex(?1)");
  const value = "Before\0After 🐴";
  const bytes = new TextEncoder().encode(value);
  const ptr = getOrThrow(allocWasm(t)(bytes.length));
  writeWasmBytes(t)(ptr, bytes);

  assertEqual(
    sqlite3_bind_text(t)(stmt, 1, ptr, bytes.length, SQLITE_TRANSIENT),
    SQLITE_OK,
  );
  assertEqual(sqlite3_step(t)(stmt), SQLITE_ROW);

  assertEqual(sqlite3_column_type(t)(stmt, 0), SQLITE_TEXT);
  assertEqual(t.columnText(stmt, 0), value);
  assertEqual(t.columnText(stmt, 1), "4265666F726500416674657220F09F90B4");
});

// wa-sqlite test/api_statements.js 'should read text with NUL bytes' and
// 'should read text that is only a BOM'.
test("text columns read by byte length keep embedded NUL characters and a leading byte order mark", async () => {
  const t = await setupDatabase();

  assertEqual(
    t.selectText("select char(65279) || 'Before' || char(0) || 'After'"),
    "﻿Before\0After",
  );
  assertEqual(t.selectText("select char(65279)"), "﻿");
});

// wa-sqlite test/api_statements.js 'should return null for a NULL text
// column'.
test("sqlite3_column_text returns NULL for a NULL column", async () => {
  const t = await setupDatabase();
  const stmt = t.prepare("select null");
  assertEqual(sqlite3_step(t)(stmt), SQLITE_ROW);

  assertEqual(sqlite3_column_text(t)(stmt, 0), 0);
  assertEqual(sqlite3_column_blob(t)(stmt, 0), 0);
});

// wa-sqlite test/api_statements.js 'should allow unscoped lifetime'.
test("a statement is reset and bound again for each run", async () => {
  const t = await setupDatabase();
  assertEqual(
    t.exec("create table t as values ('foo', 0), ('bar', 1), ('baz', 2)"),
    SQLITE_OK,
  );
  const stmt = t.prepare("select column2 from t where column1 = ?");

  for (const [key, expected] of [
    ["foo", 0],
    ["bar", 1],
  ] as const) {
    assertEqual(
      sqlite3_bind_text(t)(stmt, 1, t.cString(key), -1, SQLITE_TRANSIENT),
      SQLITE_OK,
    );
    assertEqual(sqlite3_step(t)(stmt), SQLITE_ROW);
    assertEqual(sqlite3_column_int(t)(stmt, 0), expected);
    assertEqual(sqlite3_step(t)(stmt), SQLITE_DONE);
    assertEqual(sqlite3_reset(t)(stmt), SQLITE_OK);
  }
  assertEqual(sqlite3_finalize(t)(stmt), SQLITE_OK);
});

// wa-sqlite test/api_statements.js 'should clear bindings'.
test("sqlite3_clear_bindings sets every parameter to NULL", async () => {
  const t = await setupDatabase();
  const stmt = t.prepare("select ?");
  assertEqual(sqlite3_bind_int(t)(stmt, 1, 42), SQLITE_OK);
  assertEqual(sqlite3_step(t)(stmt), SQLITE_ROW);
  assertEqual(sqlite3_column_int(t)(stmt, 0), 42);
  assertEqual(sqlite3_reset(t)(stmt), SQLITE_OK);

  assertEqual(sqlite3_clear_bindings(t)(stmt), SQLITE_OK);
  assertEqual(sqlite3_step(t)(stmt), SQLITE_ROW);

  assertEqual(sqlite3_column_type(t)(stmt, 0), SQLITE_NULL);
});

// wa-sqlite test/api_statements.js 'should iterate'.
test("sqlite3_prepare_v2 prepares one statement at a time through pzTail", async () => {
  const t = await setupDatabase();
  const sqls = [
    "PRAGMA journal_mode",
    "CREATE TABLE t(x)",
    "SELECT * FROM sqlite_master",
  ];
  const pzTail = getOrThrow(allocWasm(t)(4));
  let sql: number = t.cString(sqls.join(";\n"));

  const prepared: Array<string | null> = [];
  for (;;) {
    assertEqual(
      sqlite3_prepare_v2(t)(t.db, sql as WasmPtr, -1, t.scratch.out, pzTail),
      SQLITE_OK,
    );
    const stmt = t.readPtr(t.scratch.out) as SqliteStmtPtr;
    if (stmt === 0) break;
    prepared.push(t.text(sqlite3_sql(t)(stmt)));
    while (sqlite3_step(t)(stmt) === SQLITE_ROW);
    assertEqual(sqlite3_finalize(t)(stmt), SQLITE_OK);
    sql = t.readPtr(pzTail);
  }

  // Each statement's text runs from the previous tail through its semicolon.
  assertEqual(prepared, [
    "PRAGMA journal_mode;",
    "\nCREATE TABLE t(x);",
    "\nSELECT * FROM sqlite_master",
  ]);
});

// tester1.c-pp.js 'sqlite3.oo1' 'Table t': empty SQL prepares no statement.
test("sqlite3_prepare_v2 of SQL without a statement returns SQLITE_OK and a NULL statement", async () => {
  const t = await setupDatabase();

  assertEqual(
    sqlite3_prepare_v2(t)(
      t.db,
      t.cString("/*empty SQL*/"),
      -1,
      t.scratch.out,
      0,
    ),
    SQLITE_OK,
  );
  assertEqual(t.readPtr(t.scratch.out), 0);
});

// tester1.c-pp.js 'sqlite3.oo1' 'Table t'.
test("changes, total changes, the last rowid, RETURNING and expanded SQL", async () => {
  const t = await setupDatabase();
  assertEqual(
    t.exec(
      "create table t(a, b); insert into t(a, b) values (1, 2), (3, 4), (5, 6)",
    ),
    SQLITE_OK,
  );

  assertEqual(sqlite3_changes(t)(t.db), 3);
  assertEqual(sqlite3_changes64(t)(t.db), 3n);
  assertEqual(sqlite3_total_changes64(t)(t.db), 3n);
  assertEqual(sqlite3_last_insert_rowid(t)(t.db), 3n);
  sqlite3_set_last_insert_rowid(t)(t.db, 42n);
  assertEqual(sqlite3_last_insert_rowid(t)(t.db), 42n);

  assertEqual(
    t.selectText("insert into t(a, b) values ('blob', x'6869') returning 13"),
    "13",
  );
  assertEqual(sqlite3_changes64(t)(t.db), 1n);
  assertEqual(sqlite3_total_changes64(t)(t.db), 4n);

  const stmt = t.prepare("update t set b = :b where a = 'blob'");
  assertEqual(sqlite3_column_count(t)(stmt), 0);
  assertEqual(sqlite3_stmt_readonly(t)(stmt), 0);
  assertEqual(
    sqlite3_bind_text(t)(stmt, 1, t.cString("ima blob"), -1, SQLITE_TRANSIENT),
    SQLITE_OK,
  );
  const expanded = sqlite3_expanded_sql(t)(stmt);
  assertEqual(t.text(expanded), "update t set b = 'ima blob' where a = 'blob'");
  sqlite3_free(t)(expanded);
  assertEqual(sqlite3_finalize(t)(stmt), SQLITE_OK);

  // https://sqlite.org/forum/forumpost/895425b49a
  const tableInfo = t.prepare("pragma table_info('t')");
  const names: Array<string | null> = [];
  while (sqlite3_step(t)(tableInfo) === SQLITE_ROW)
    names.push(t.columnText(tableInfo, 1));
  assertEqual(names, ["a", "b"]);
});

// tester1.c-pp.js 'Misc. APIs' 'bind_parameter_...'.
test("sqlite3_bind_parameter_count, _index and _name describe named parameters", async () => {
  const t = await setupDatabase();
  assertEqual(t.exec("create table t(a)"), SQLITE_OK);
  const stmt = t.prepare("insert into t(a) values($a)");

  assertEqual(sqlite3_bind_parameter_count(t)(stmt), 1);
  assertEqual(sqlite3_bind_parameter_index(t)(stmt, t.cString("$a")), 1);
  assertEqual(sqlite3_bind_parameter_index(t)(stmt, t.cString(":a")), 0);
  assertEqual(t.text(sqlite3_bind_parameter_name(t)(stmt, 1)), "$a");
  assertEqual(sqlite3_bind_parameter_name(t)(stmt, 0), 0);
});

// tester1.c-pp.js 'Misc. APIs' 'Misc. stmt_...'.
test("statement state, column metadata, values and zeroblobs", async () => {
  const t = await setupDatabase();
  assertEqual(
    t.exec("create table t(a doggiebiscuits); insert into t(a) values(123)"),
    SQLITE_OK,
  );
  const stmt = t.prepare("select a, a+1 from t");

  assertTrue(sqlite3_stmt_readonly(t)(stmt) !== 0);
  assertEqual(sqlite3_stmt_isexplain(t)(stmt), 0);
  assertEqual(sqlite3_stmt_explain(t)(stmt, 1), SQLITE_OK);
  assertTrue(sqlite3_stmt_isexplain(t)(stmt) !== 0);
  assertEqual(sqlite3_stmt_explain(t)(stmt, 2), SQLITE_OK);
  assertTrue(sqlite3_stmt_isexplain(t)(stmt) !== 0);
  assertEqual(sqlite3_stmt_explain(t)(stmt, 0), SQLITE_OK);
  assertEqual(sqlite3_stmt_isexplain(t)(stmt), 0);

  let rows = 0;
  while (sqlite3_step(t)(stmt) === SQLITE_ROW) {
    rows++;
    // A busy statement cannot change its explain mode.
    assertTrue(sqlite3_stmt_explain(t)(stmt, 1) !== SQLITE_OK);
    assertTrue(sqlite3_stmt_busy(t)(stmt) !== 0);
    const value = sqlite3_column_value(t)(stmt, 0);
    assertEqual(sqlite3_value_int(t)(value), 123);
    assertEqual(t.text(sqlite3_column_decltype(t)(stmt, 0)), "doggiebiscuits");
    assertEqual(sqlite3_column_decltype(t)(stmt, 1), 0);
  }
  assertEqual(rows, 1);
  assertEqual(sqlite3_stmt_busy(t)(stmt), 0);
  assertEqual(sqlite3_finalize(t)(stmt), SQLITE_OK);

  const textStmt = t.prepare("select cast(?1 as text)");
  const bytes = Uint8Array.of(97, 0, 98, 0, 99);
  const ptr = getOrThrow(allocWasm(t)(bytes.length));
  writeWasmBytes(t)(ptr, bytes);
  assertEqual(
    sqlite3_bind_blob(t)(textStmt, 1, ptr, bytes.length, SQLITE_TRANSIENT),
    SQLITE_OK,
  );
  assertEqual(sqlite3_step(t)(textStmt), SQLITE_ROW);
  const value = sqlite3_column_value(t)(textStmt, 0);
  const valueText = sqlite3_value_text(t)(value);
  assertTrue(valueText !== 0);
  assertEqual(readUtf8(t)(valueText, sqlite3_value_bytes(t)(value)), "a\0b\0c");
  assertEqual(sqlite3_finalize(t)(textStmt), SQLITE_OK);

  // sqlite3_bind_zeroblob was added to the JavaScript API in 3.53.
  const zeroblobStmt = t.prepare("select ?1");
  assertEqual(sqlite3_bind_zeroblob(t)(zeroblobStmt, 1, 53), SQLITE_OK);
  assertEqual(sqlite3_step(t)(zeroblobStmt), SQLITE_ROW);
  assertEqual(sqlite3_column_type(t)(zeroblobStmt, 0), SQLITE_BLOB);
  assertEqual(sqlite3_column_bytes(t)(zeroblobStmt, 0), 53);
});

test("sqlite3_value_dup copies a column value that outlives its statement", async () => {
  const t = await setupDatabase();
  const stmt = t.prepare("select 'kept'");
  assertEqual(sqlite3_step(t)(stmt), SQLITE_ROW);

  const copy = sqlite3_value_dup(t)(sqlite3_column_value(t)(stmt, 0));
  assertTrue(copy !== 0);
  assertEqual(sqlite3_finalize(t)(stmt), SQLITE_OK);

  assertEqual(sqlite3_value_type(t)(copy), SQLITE_TEXT);
  const valueText = sqlite3_value_text(t)(copy);
  assertTrue(valueText !== 0);
  assertEqual(readUtf8(t)(valueText, sqlite3_value_bytes(t)(copy)), "kept");
  sqlite3_value_free(t)(copy);
});

test("SQLITE_WASM_DEALLOC is sqlite3_free, so SQLite frees a value handed to it", async () => {
  const t = await setupDatabase();

  assertTrue(
    t.sqliteWasm.functionTable.get(SQLITE_WASM_DEALLOC) ===
      t.sqliteWasm.exports.sqlite3_free,
  );

  const stmt = t.prepare("select ?");
  const value = t.cString("handed over");
  assertEqual(
    sqlite3_bind_text(t)(stmt, 1, value, -1, SQLITE_WASM_DEALLOC),
    SQLITE_OK,
  );
  assertEqual(sqlite3_step(t)(stmt), SQLITE_ROW);
  assertEqual(t.columnText(stmt, 0), "handed over");
  assertEqual(sqlite3_finalize(t)(stmt), SQLITE_OK);
});

test("syntax errors report SQLITE_ERROR, a message and the error offset", async () => {
  const t = await setupDatabase();

  assertEqual(
    sqlite3_prepare_v2(t)(
      t.db,
      t.cString("select 1 frm t"),
      -1,
      t.scratch.out,
      0,
    ),
    SQLITE_ERROR,
  );

  assertEqual(t.readPtr(t.scratch.out), 0);
  assertEqual(sqlite3_errcode(t)(t.db), SQLITE_ERROR);
  assertEqual(t.errmsg(), 'near "t": syntax error');
  assertEqual(sqlite3_error_offset(t)(t.db), 13);
});

test("constraint violations report the primary code, or the extended one when extended result codes are on", async () => {
  const t = await setupDatabase();
  assertEqual(
    t.exec(
      "create table t(id integer primary key, v text); insert into t values (1, 'a')",
    ),
    SQLITE_OK,
  );
  const stmt = t.prepare("insert into t values (1, 'b')");

  assertEqual(sqlite3_step(t)(stmt), SQLITE_CONSTRAINT);
  assertEqual(sqlite3_errcode(t)(t.db), SQLITE_CONSTRAINT);
  assertEqual(sqlite3_extended_errcode(t)(t.db), SQLITE_CONSTRAINT_PRIMARYKEY);
  assertEqual(t.errmsg(), "UNIQUE constraint failed: t.id");
  assertEqual(sqlite3_reset(t)(stmt), SQLITE_CONSTRAINT);

  assertEqual(sqlite3_extended_result_codes(t)(t.db, 1), SQLITE_OK);
  assertEqual(sqlite3_step(t)(stmt), SQLITE_CONSTRAINT_PRIMARYKEY);
  assertEqual(sqlite3_errcode(t)(t.db), SQLITE_CONSTRAINT_PRIMARYKEY);
});

// tester1.c-pp.js 'Basic sanity checks' 'Namespace object checks'.
test("sqlite3_errstr describes result codes", async () => {
  const t = await setupDatabase();

  assertTrue(
    t.text(sqlite3_errstr(t)(SQLITE_IOERR_ACCESS))?.includes("I/O") === true,
  );
  assertTrue(
    t.text(sqlite3_errstr(t)(SQLITE_CORRUPT))?.includes("malformed") === true,
  );
  assertEqual(t.text(sqlite3_errstr(t)(SQLITE_OK)), "not an error");
});

// tester1.c-pp.js 'Misc. APIs' 'sqlite3_set_errmsg()'.
test("sqlite3_set_errmsg sets the connection's error", async () => {
  const t = await setupDatabase();
  assertEqual(sqlite3_errcode(t)(t.db), SQLITE_OK);
  assertEqual(t.errmsg(), "not an error");

  assertEqual(
    sqlite3_set_errmsg(t)(t.db, SQLITE_RANGE, t.cString("nope")),
    SQLITE_OK,
  );
  assertEqual(sqlite3_errcode(t)(t.db), SQLITE_RANGE);
  assertEqual(t.errmsg(), "nope");

  assertEqual(
    sqlite3_set_errmsg(t)(0 as SqliteDbPtr, SQLITE_OK, 0),
    SQLITE_MISUSE,
  );
  assertEqual(sqlite3_set_errmsg(t)(t.db, SQLITE_OK, 0), SQLITE_OK);
  assertEqual(sqlite3_errcode(t)(t.db), SQLITE_OK);
  assertEqual(t.errmsg(), "not an error");
});

// wa-sqlite test/api_misc.js 'limit'.
test("sqlite3_limit constrains SQL and returns the previous limit", async () => {
  const t = await setupDatabase();
  const sql = "select 1, 2, 3, 4, 5, 6";
  assertEqual(t.exec(sql), SQLITE_OK);

  const previous = sqlite3_limit(t)(t.db, SQLITE_LIMIT_COLUMN, 5);
  assertTrue(previous > 0);
  assertEqual(t.exec(sql), SQLITE_ERROR);
  assertEqual(t.errmsg(), "too many columns in result set");

  assertEqual(sqlite3_limit(t)(t.db, SQLITE_LIMIT_COLUMN, previous), 5);
  assertEqual(t.exec(sql), SQLITE_OK);
});

// tester1.c-pp.js 'Misc. APIs' 'interrupt'.
test("sqlite3_interrupt interrupts the connection", async () => {
  const t = await setupDatabase();
  assertEqual(sqlite3_is_interrupted(t)(t.db), 0);

  sqlite3_interrupt(t)(t.db);

  assertTrue(sqlite3_is_interrupted(t)(t.db) !== 0);
});

// tester1.c-pp.js 'Basic sanity checks' 'strglob/strlike'.
test("sqlite3_strglob, sqlite3_strlike, sqlite3_stricmp and sqlite3_strnicmp compare strings", async () => {
  const t = await setupDatabase();

  assertEqual(sqlite3_strglob(t)(t.cString("*.txt"), t.cString("foo.txt")), 0);
  assertTrue(
    sqlite3_strglob(t)(t.cString("*.txt"), t.cString("foo.xtx")) !== 0,
  );
  assertEqual(
    sqlite3_strlike(t)(t.cString("%.txt"), t.cString("foo.txt"), 0),
    0,
  );
  assertTrue(
    sqlite3_strlike(t)(t.cString("%.txt"), t.cString("foo.xtx"), 0) !== 0,
  );
  assertEqual(sqlite3_stricmp(t)(t.cString("ABC"), t.cString("abc")), 0);
  assertEqual(sqlite3_strnicmp(t)(t.cString("ABCx"), t.cString("abcy"), 3), 0);
  assertTrue(sqlite3_strnicmp(t)(t.cString("ABCx"), t.cString("abcy"), 4) < 0);
});

// tester1.c-pp.js 'sqlite3.oo1' 'sqlite3_table_column_metadata()'.
test("sqlite3_table_column_metadata describes a rowid", async () => {
  const t = await setupDatabase();
  assertEqual(t.exec("create table t(a, b)"), SQLITE_OK);
  const out = getOrThrow(allocWasm(t)(20));

  assertEqual(
    sqlite3_table_column_metadata(t)(
      t.db,
      t.cString("main"),
      t.cString("t"),
      t.cString("rowid"),
      out,
      (out + 4) as WasmPtr,
      (out + 8) as WasmPtr,
      (out + 12) as WasmPtr,
      (out + 16) as WasmPtr,
    ),
    SQLITE_OK,
  );

  assertEqual(t.text(t.readPtr(out) as CStringPtr), "INTEGER");
  assertEqual(t.text(t.readPtr((out + 4) as WasmPtr) as CStringPtr), "BINARY");
  // Not NULL, part of the primary key, autoincrement.
  assertEqual(
    [8, 12, 16].map((offset) =>
      t.sqliteWasm.getHeapDataView().getInt32(out + offset, true),
    ),
    [0, 1, 0],
  );
});

// tester1.c-pp.js 'sqlite3.oo1' 'sqlite3_js_db_export()' and
// 'sqlite3_js_posix_create_file()', with sqlite3_deserialize in place of a
// file.
test("sqlite3_serialize exports a database that sqlite3_deserialize opens", async () => {
  const t = await setupDatabase();
  assertEqual(
    t.exec("create table t(a); insert into t values (1), (2), (3)"),
    SQLITE_OK,
  );
  const piSize = t.scratch.out;

  const pages = sqlite3_serialize(t)(t.db, t.cString("main"), piSize, 0);
  assertTrue(pages !== 0);
  const size = t.sqliteWasm.getHeapDataView().getBigInt64(piSize, true);
  assertTrue(size > 0n && size % 512n === 0n);
  const bytes = copyWasmBytes(t)(pages, Number(size));
  sqlite3_free(t)(pages);

  const copy = t.open(":memory:");
  assertEqual(copy.rc, SQLITE_OK);
  const data = getOrThrow(allocWasm(t)(bytes.length));
  writeWasmBytes(t)(data, bytes);
  assertEqual(
    sqlite3_deserialize(t)(
      copy.db,
      t.cString("main"),
      data,
      size,
      size,
      SQLITE_DESERIALIZE_FREEONCLOSE | SQLITE_DESERIALIZE_RESIZEABLE,
    ),
    SQLITE_OK,
  );
  assertEqual(t.selectText("select group_concat(a) from t", copy.db), "1,2,3");
  assertEqual(t.exec("insert into t values (4)", copy.db), SQLITE_OK);
  assertEqual(t.selectText("select count(*) from t", copy.db), "4");
  assertEqual(sqlite3_close_v2(t)(copy.db), SQLITE_OK);
});

// tester1.c-pp.js 'sqlite3.oo1' 'sqlite3_db_config() and sqlite3_status()'.
test("sqlite3_status, sqlite3_status64 and sqlite3_db_status report memory use", async () => {
  const t = await setupDatabase();
  const out = getOrThrow(allocWasm(t)(16));
  const heap = () => t.sqliteWasm.getHeapDataView();

  assertEqual(
    sqlite3_status(t)(SQLITE_STATUS_MEMORY_USED, out, (out + 8) as WasmPtr, 0),
    SQLITE_OK,
  );
  const current = heap().getInt32(out, true);
  assertTrue(current > 0);
  assertTrue(heap().getInt32(out + 8, true) >= current);

  assertEqual(
    sqlite3_status64(t)(
      SQLITE_STATUS_MEMORY_USED,
      out,
      (out + 8) as WasmPtr,
      0,
    ),
    SQLITE_OK,
  );
  const current64 = heap().getBigInt64(out, true);
  assertTrue(current64 > 0n);
  assertTrue(heap().getBigInt64(out + 8, true) >= current64);

  assertEqual(t.exec("create table t(a)"), SQLITE_OK);
  assertEqual(
    sqlite3_db_status(t)(
      t.db,
      SQLITE_DBSTATUS_SCHEMA_USED,
      out,
      (out + 8) as WasmPtr,
      0,
    ),
    SQLITE_OK,
  );
  assertTrue(heap().getInt32(out, true) > 0);
});

// tester1.c-pp.js 'sqlite3_randomness()' 'To memory buffer'.
test("sqlite3_randomness fills only the requested bytes", async () => {
  const t = await setupDatabase();
  const n = 520;
  const ptr = getOrThrow(allocWasm(t)(n));
  t.sqliteWasm.getHeapU8().fill(0, ptr, ptr + n);

  sqlite3_randomness(t)(n - 10, ptr);

  const heap = t.sqliteWasm.getHeapU8();
  assertTrue(heap.subarray(ptr, ptr + 10).some((byte) => byte !== 0));
  assertEqual(heap.slice(ptr + n - 10, ptr + n), new Uint8Array(10));
});

// tester1.c-pp.js 'sqlite3.oo1' 'ATTACH', without its callbacks.
test("ATTACH adds a schema and DETACH removes it", async () => {
  const t = await setupDatabase();
  assertEqual(
    t.exec(
      "attach ':memory:' as foo; create table foo.bar(a); insert into foo.bar(a) values (1), (2), (3)",
    ),
    SQLITE_OK,
  );
  assertEqual(
    t.selectText("select a from foo.bar where a > 1 order by a"),
    "2",
  );
  assertEqual(t.text(sqlite3_db_name(t)(t.db, 2)), "foo");

  assertEqual(t.exec("detach foo"), SQLITE_OK);

  assertEqual(t.exec("select * from foo.bar"), SQLITE_ERROR);
  assertEqual(t.errmsg(), "no such table: foo.bar");
});

// tester1.c-pp.js 'sqlite3.oo1' 'Read-only', with a shared memdb database in
// place of a file.
test("sqlite3_db_readonly reports a read-only connection", async () => {
  const t = await setupDatabase();
  const flags = SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE | SQLITE_OPEN_URI;
  const writer = t.open("file:/shared?vfs=memdb", flags);
  assertEqual(writer.rc, SQLITE_OK);
  assertEqual(t.exec("create table t(a)", writer.db), SQLITE_OK);

  const reader = t.open("file:/shared?vfs=memdb&mode=ro", flags);
  assertEqual(reader.rc, SQLITE_OK);

  assertEqual(sqlite3_db_readonly(t)(writer.db, t.cString("main")), 0);
  assertEqual(sqlite3_db_readonly(t)(reader.db, t.cString("main")), 1);
  assertEqual(sqlite3_db_readonly(t)(reader.db, t.cString("nope")), -1);
  assertEqual(t.exec("insert into t values (1)", reader.db), 8);
  assertEqual(sqlite3_close_v2(t)(reader.db), SQLITE_OK);
  assertEqual(sqlite3_close_v2(t)(writer.db), SQLITE_OK);
});

// wa-sqlite test/api_exec.js 'should execute multiple queries' and 'should
// allow a transaction to span multiple calls'.
test("sqlite3_exec runs several statements, and a transaction spans calls", async () => {
  const t = await setupDatabase();
  assertEqual(
    t.exec(
      "create table t(x); insert into t values (1); insert into t values (2)",
    ),
    SQLITE_OK,
  );
  assertEqual(sqlite3_get_autocommit(t)(t.db), 1);
  assertEqual(sqlite3_txn_state(t)(t.db, 0), SQLITE_TXN_NONE);

  assertEqual(t.exec("begin"), SQLITE_OK);
  assertEqual(sqlite3_get_autocommit(t)(t.db), 0);
  assertEqual(t.exec("insert into t values (3)"), SQLITE_OK);
  assertEqual(sqlite3_txn_state(t)(t.db, t.cString("main")), SQLITE_TXN_WRITE);
  assertEqual(t.exec("rollback"), SQLITE_OK);

  assertEqual(sqlite3_get_autocommit(t)(t.db), 1);
  assertEqual(t.selectText("select group_concat(x) from t"), "1,2");
});

test("sqlite3_prepare_v3 takes prepare flags", async () => {
  const t = await setupDatabase();

  assertEqual(
    sqlite3_prepare_v3(t)(
      t.db,
      t.cString("select 1"),
      -1,
      SQLITE_PREPARE_PERSISTENT,
      t.scratch.out,
      0,
    ),
    SQLITE_OK,
  );

  const stmt = t.readPtr(t.scratch.out) as SqliteStmtPtr;
  assertEqual(sqlite3_step(t)(stmt), SQLITE_ROW);
  assertEqual(sqlite3_finalize(t)(stmt), SQLITE_OK);
});

test("sqlite3_complete, the keyword functions and the compile options", async () => {
  const t = await setupDatabase();

  assertTrue(sqlite3_complete(t)(t.cString("select 1;")) !== 0);
  assertEqual(sqlite3_complete(t)(t.cString("select 1")), 0);

  const count = sqlite3_keyword_count(t)();
  assertTrue(count > 100);
  const out = getOrThrow(allocWasm(t)(8));
  const keywords = Array.from({ length: count }, (_, index) => {
    assertEqual(
      sqlite3_keyword_name(t)(index, out, (out + 4) as WasmPtr),
      SQLITE_OK,
    );
    const name = t.readPtr(out) as WasmPtr;
    return readUtf8(t)(name, t.readPtr((out + 4) as WasmPtr));
  });
  assertTrue(keywords.includes("SELECT"));
  assertTrue(sqlite3_keyword_check(t)(t.cString("select"), 6) !== 0);
  assertEqual(sqlite3_keyword_check(t)(t.cString("evolu"), 5), 0);

  assertTrue(
    sqlite3_compileoption_used(t)(t.cString("ENABLE_MATH_FUNCTIONS")) !== 0,
  );
  assertEqual(sqlite3_compileoption_used(t)(t.cString("OMIT_EVERYTHING")), 0);
  assertTrue(sqlite3_compileoption_get(t)(0) !== 0);
  assertTrue(
    t
      .text(sqlite3_sourceid(t)())
      ?.startsWith(
        "2026-07-24 19:02:57 bf7c7f30031888f4e796e429ab3978879485813aaca6f641c7b33e4e09459bcc",
      ) === true,
  );
});

test("sqlite3_malloc64, sqlite3_realloc and sqlite3_msize manage SQLite's memory", async () => {
  const t = await setupDatabase();

  const ptr = sqlite3_malloc64(t)(100n);
  assertTrue(ptr !== 0);
  assertTrue(sqlite3_msize(t)(ptr) >= 100n);
  writeWasmBytes(t)(ptr, Uint8Array.of(1, 2, 3));

  const grown = sqlite3_realloc(t)(ptr, 100_000);
  assertTrue(grown !== 0);
  assertTrue(sqlite3_msize(t)(grown) >= 100_000n);
  assertEqual(copyWasmBytes(t)(grown, 3), Uint8Array.of(1, 2, 3));
  sqlite3_free(t)(grown);
  assertEqual(sqlite3_malloc(t)(-1), 0);
});

// tester1.c-pp.js 'sqlite3.oo1' 'sqlite3_js_...()'.
test("sqlite3_vfs_find finds the default VFS and memdb", async () => {
  const t = await setupDatabase();

  const defaultVfs = sqlite3_vfs_find(t)(0);
  const memdb = sqlite3_vfs_find(t)(t.cString("memdb"));

  assertTrue(defaultVfs !== 0);
  assertTrue(memdb !== 0);
  assertNotEqual(memdb, defaultVfs);
  assertEqual(sqlite3_vfs_find(t)(t.cString("nope")), 0);
  assertEqual(
    t.text(
      t.readPtr(
        (memdb + sqlite3_vfs_layout.members.zName.offset) as WasmPtr,
      ) as CStringPtr,
    ),
    "memdb",
  );
});

// tester1.c-pp.js 'Basic sanity checks' 'Namespace object checks', which
// spot-checks the constants and struct layouts.
test("the generated constants and struct layouts describe the binary", async () => {
  const t = await setupDatabase();
  const constants =
    (await import("../../../../packages/sqlite-wasm/src/Constants.ts")) as unknown as Record<
      string,
      unknown
    >;
  const enumJson = (
    t.sqliteWasm.exports as unknown as Record<string, () => number>
  ).sqlite3__wasm_enum_json?.();
  assert(enumJson != null && enumJson !== 0, "sqlite3__wasm_enum_json");
  const json = JSON.parse(readCString(t)(enumJson as CStringPtr)) as Record<
    string,
    unknown
  >;
  const pinned = await readFile(
    new URL(
      "../../../../packages/sqlite-wasm/scripts/upstream/sqlite3-wasm-enum.json",
      import.meta.url,
    ),
    "utf8",
  );
  assertEqual(json, JSON.parse(pinned));

  let checked = 0;
  for (const [group, values] of Object.entries(json)) {
    if (group === "structs" || group === "version") continue;
    for (const [name, value] of Object.entries(
      values as Record<string, unknown>,
    )) {
      if (name.startsWith("SQLITE_MAX_")) continue;
      assertEqual([name, constants[name]], [name, value]);
      checked++;
    }
  }
  assertTrue(checked > 300);

  const structs = json.structs as ReadonlyArray<{
    readonly name: string;
    readonly sizeof: number;
    readonly members: Record<
      string,
      { readonly offset: number; readonly signature: string }
    >;
  }>;
  let layouts = 0;
  for (const struct of structs) {
    const layout = constants[`${struct.name}_layout`] as
      | {
          readonly sizeof: number;
          readonly members: Record<
            string,
            { readonly offset: number; readonly signature: string }
          >;
        }
      | undefined;
    if (layout == null) continue;
    layouts++;
    assertEqual(
      [struct.name, layout.sizeof, layout.members],
      [
        struct.name,
        struct.sizeof,
        Object.fromEntries(
          Object.entries(struct.members).map(
            ([member, { offset, signature }]) => [
              member,
              { offset, signature },
            ],
          ),
        ),
      ],
    );
  }
  assertEqual(layouts, 10);
  assertTrue(sqlite3_vfs_layout.members.szOsFile.offset >= 0);
  assertTrue(sqlite3_io_methods_layout.members.xFileSize.offset > 0);
  assertFalse(Object.hasOwn(constants, "SQLITE_MAX_LENGTH"));
});

test("SQL 'now' is Time's wall-clock time", async () => {
  const t = await setupDatabase({
    ...testCreateDeps(),
    time: testCreateTime({ startAt: Millis.orThrow(1_790_000_000_123) }),
  });

  assertEqual(
    t.selectText("select strftime('%Y-%m-%d %H:%M:%f', 'now')"),
    "2026-09-21 14:13:20.123",
  );
});

test("SQL 'localtime' converts in the local time zone", async () => {
  for (const [timeZone, unixepoch, expected] of [
    ["America/New_York", 1_790_000_000, "2026-09-21 10:13:20"],
    ["America/New_York", 1_767_243_600, "2026-01-01 00:00:00"],
    // Already 2026 in UTC.
    ["America/New_York", 1_767_240_000, "2025-12-31 23:00:00"],
    // 03:30 in UTC.
    ["Asia/Kolkata", 1_790_047_800, "2026-09-22 09:00:00"],
  ] as const) {
    const previous = process.env.TZ;
    process.env.TZ = timeZone;
    try {
      const t = await setupDatabase();

      assertEqual(
        t.selectText(`select datetime(${unixepoch}, 'unixepoch', 'localtime')`),
        expected,
      );
    } finally {
      if (previous === undefined) delete process.env.TZ;
      else process.env.TZ = previous;
    }
  }
});
