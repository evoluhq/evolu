/**
 * Loads the SQLite wasm binary for the Node.js integration tests.
 *
 * Every test file that imports this module compiles
 * `packages/sqlite-wasm/wasm/sqlite3.wasm` once, and fails, never skips, when
 * it is missing or is not the pinned wasm. Each test then gets a fresh instance
 * and fresh dependencies with {@link setupSqliteWasm}, or a `:memory:` database
 * on one with {@link setupDatabase}.
 *
 * @module
 */

import {
  assertEqual,
  getOrThrow,
  testCreateDeps,
  testCreateRun,
  type ReportDefectDep,
  type TestRunDefaultDeps,
} from "@evolu/common";
import {
  sqlite3_auto_extension,
  sqlite3_column_bytes,
  sqlite3_column_text,
  sqlite3_errmsg,
  sqlite3_exec,
  sqlite3_finalize,
  sqlite3_open_v2,
  sqlite3_prepare_v2,
  sqlite3_step,
} from "../../../../packages/sqlite-wasm/src/CApi.ts";
import {
  SQLITE_OK,
  SQLITE_OPEN_CREATE,
  SQLITE_OPEN_READWRITE,
  SQLITE_ROW,
  type SqliteResultCode,
} from "../../../../packages/sqlite-wasm/src/Constants.ts";
import {
  allocCString,
  createSqliteScratch,
  readCString,
  readUtf8,
  type SqliteScratch,
} from "../../../../packages/sqlite-wasm/src/Memory.ts";
import type {
  CStringPtr,
  SqliteDbPtr,
  SqliteOwnedCStringPtr,
  SqliteStmtPtr,
  WasmPtr,
} from "../../../../packages/sqlite-wasm/src/Pointer.ts";
import { readPinnedWasm } from "../../../../packages/sqlite-wasm/scripts/check-wasm.mts";
import {
  createSqliteWasm,
  installWasmFunctions,
  type SqliteWasmDep,
} from "../../../../packages/sqlite-wasm/src/Wasm.ts";

/** The bytes of `packages/sqlite-wasm/wasm/sqlite3.wasm`. */
// oxlint-disable-next-line evolu/require-pure-annotation -- Each test file reads the binary once, when it imports this module.
export const sqliteWasmBinary = readPinnedWasm();

/** The compiled {@link sqliteWasmBinary}. */
// oxlint-disable-next-line evolu/require-pure-annotation -- Each test file compiles the binary once, when it imports this module.
export const sqliteWasmModule = await WebAssembly.compile(sqliteWasmBinary);

/** Loads a fresh instance of the binary with fresh test dependencies. */
export const setupSqliteWasm = async (
  deps: TestRunDefaultDeps = testCreateDeps(),
): Promise<TestRunDefaultDeps & SqliteWasmDep> => {
  await using run = testCreateRun(deps);
  const sqliteWasm = getOrThrow(await run(createSqliteWasm(sqliteWasmModule)));
  return { ...deps, sqliteWasm };
};

/**
 * Makes every later open on the instance trap, as a deliberately broken call:
 * it registers an auto-extension and disposes its function, so the open calls
 * through the emptied slot.
 */
export const trapEveryOpen = (deps: ReportDefectDep & SqliteWasmDep): void => {
  const { pointers, [Symbol.dispose]: dispose } = installWasmFunctions(deps)([
    { signature: "i(ppp)", fn: () => SQLITE_OK },
  ]);
  assertEqual(sqlite3_auto_extension(deps)(pointers[0]), SQLITE_OK);
  dispose();
};

/** A `:memory:` database on a fresh instance, with helpers for it. */
export interface TestDatabase extends TestRunDefaultDeps, SqliteWasmDep {
  readonly scratch: SqliteScratch;
  readonly db: SqliteDbPtr;
  readonly cString: (value: string) => SqliteOwnedCStringPtr;
  readonly readPtr: (ptr: WasmPtr) => number;
  readonly text: (ptr: CStringPtr | 0) => string | null;

  /** Opens a database, returning the handle SQLite returns even on failure. */
  readonly open: (
    filename: string,
    flags?: number,
  ) => { readonly rc: SqliteResultCode; readonly db: SqliteDbPtr };

  readonly errmsg: (target?: SqliteDbPtr) => string | null;

  /** Prepares one statement, failing the test with SQLite's message. */
  readonly prepare: (sql: string, target?: SqliteDbPtr) => SqliteStmtPtr;

  /** Runs SQL without a callback, returning the result code. */
  readonly exec: (sql: string, target?: SqliteDbPtr) => SqliteResultCode;

  /** Reads a text column by its byte length. */
  readonly columnText: (stmt: SqliteStmtPtr, column: number) => string | null;

  /** Returns the first column of the first row of a query, as text. */
  readonly selectText: (sql: string, target?: SqliteDbPtr) => string | null;
}

/**
 * Opens a `:memory:` database on a fresh instance, with helpers for it.
 *
 * The instance ends with the test, so the helpers never free their strings.
 */
export const setupDatabase = async (
  deps?: TestRunDefaultDeps,
): Promise<TestDatabase> => {
  const wasm = await setupSqliteWasm(deps);
  const scratch = getOrThrow(createSqliteScratch(wasm));

  const cString = (value: string): SqliteOwnedCStringPtr =>
    getOrThrow(allocCString(wasm)(value));
  const readPtr = (ptr: WasmPtr): number =>
    wasm.sqliteWasm.getHeapDataView().getUint32(ptr, true);
  const text = (ptr: CStringPtr | 0): string | null =>
    ptr === 0 ? null : readCString(wasm)(ptr);

  const open = (
    filename: string,
    flags = SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE,
  ) => {
    const rc = sqlite3_open_v2(wasm)(cString(filename), scratch.out, flags, 0);
    return { rc, db: readPtr(scratch.out) as SqliteDbPtr };
  };

  const opened = open(":memory:");
  assertEqual(opened.rc, SQLITE_OK);
  const { db } = opened;

  const errmsg = (target = db): string | null =>
    text(sqlite3_errmsg(wasm)(target));

  const prepare = (sql: string, target = db): SqliteStmtPtr => {
    const rc = sqlite3_prepare_v2(wasm)(
      target,
      cString(sql),
      -1,
      scratch.out,
      0,
    );
    assertEqual([rc, errmsg(target)], [SQLITE_OK, "not an error"]);
    return readPtr(scratch.out) as SqliteStmtPtr;
  };

  const exec = (sql: string, target = db) =>
    sqlite3_exec(wasm)(target, cString(sql), 0, 0, 0);

  const columnText = (stmt: SqliteStmtPtr, column: number): string | null => {
    const ptr = sqlite3_column_text(wasm)(stmt, column);
    return ptr === 0
      ? null
      : readUtf8(wasm)(ptr, sqlite3_column_bytes(wasm)(stmt, column));
  };

  const selectText = (sql: string, target = db): string | null => {
    const stmt = prepare(sql, target);
    assertEqual(sqlite3_step(wasm)(stmt), SQLITE_ROW);
    const value = columnText(stmt, 0);
    assertEqual(sqlite3_finalize(wasm)(stmt), SQLITE_OK);
    return value;
  };

  return {
    ...wasm,
    scratch,
    db,
    cString,
    readPtr,
    text,
    open,
    errmsg,
    prepare,
    exec,
    columnText,
    selectText,
  };
};
