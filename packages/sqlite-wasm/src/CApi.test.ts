import { test } from "node:test";

import { assertEqual, assertSame, assertTrue, assertType } from "@evolu/common";
import {
  sqlite3_config,
  sqlite3_db_config,
  type SqliteCExports,
} from "./CApi.ts";
import {
  SQLITE_CONFIG_GETMALLOC,
  SQLITE_CONFIG_LOOKASIDE,
  SQLITE_CONFIG_MEMDB_MAXSIZE,
  SQLITE_CONFIG_URI,
  SQLITE_DBCONFIG_ENABLE_FKEY,
  SQLITE_DBCONFIG_FP_DIGITS,
  SQLITE_DBCONFIG_LOOKASIDE,
  SQLITE_DBCONFIG_MAINDBNAME,
  SQLITE_DBCONFIG_MAX,
  SQLITE_MISUSE,
  SQLITE_NOTFOUND,
  SQLITE_OK,
  SQLITE_SERIALIZE_NOCOPY,
  type SqliteResultCode,
} from "./Constants.ts";
import type { readCString } from "./Memory.ts";
import type {
  CStringPtr,
  NullPtr,
  SqliteDbPtr,
  SqliteOwnedCStringPtr,
  SqliteOwnedPtr,
  SqliteOwnedValuePtr,
  SqliteStmtPtr,
  SqliteValuePtr,
  WasmPtr,
} from "./Pointer.ts";
import type { SqliteWasmDep } from "./Wasm.ts";

// The exports need a loaded binary, so these tests call stubs of their types
// to prove which calls TypeScript accepts, and fakes of the variadic shims to
// prove how options are dispatched.

const db = 8 as SqliteDbPtr;
const pStmt = 16 as SqliteStmtPtr;
const sqlite3_free: SqliteCExports["sqlite3_free"] = () => undefined;

test("sqlite3_serialize returns memory sqlite3_free accepts only for mFlags 0", () => {
  const sqlite3_serialize: SqliteCExports["sqlite3_serialize"] = () => 0;
  const piSize = 24 as WasmPtr;
  const mFlags: number = SQLITE_SERIALIZE_NOCOPY;

  const copy = sqlite3_serialize(db, 0, piSize, 0);
  assertType<typeof copy, SqliteOwnedPtr | NullPtr>();
  sqlite3_free(copy);

  const buffer = sqlite3_serialize(db, 0, piSize, SQLITE_SERIALIZE_NOCOPY);
  assertType<typeof buffer, WasmPtr | NullPtr>();
  // @ts-expect-error SQLITE_SERIALIZE_NOCOPY can return SQLite's own buffer.
  sqlite3_free(buffer);

  const unknown = sqlite3_serialize(db, 0, piSize, mFlags);
  // @ts-expect-error Flags not known to be 0 can include SQLITE_SERIALIZE_NOCOPY.
  sqlite3_free(unknown);
});

test("sqlite3_value_free accepts only values sqlite3_value_dup returns", () => {
  const sqlite3_column_value: SqliteCExports["sqlite3_column_value"] = () =>
    32 as SqliteValuePtr;
  const sqlite3_value_dup: SqliteCExports["sqlite3_value_dup"] = () => 0;
  const sqlite3_value_free: SqliteCExports["sqlite3_value_free"] = () =>
    undefined;

  const column = sqlite3_column_value(pStmt, 0);
  const copy = sqlite3_value_dup(column);
  assertType<typeof copy, SqliteOwnedValuePtr | NullPtr>();
  sqlite3_value_free(copy);

  // @ts-expect-error A column value is borrowed from the statement.
  sqlite3_value_free(column);
  // @ts-expect-error A copied value is freed with sqlite3_value_free.
  sqlite3_free(copy);
});

test("sqlite3_expanded_sql returns a C string sqlite3_free accepts", () => {
  const sqlite3_expanded_sql: SqliteCExports["sqlite3_expanded_sql"] = () => 0;
  const read: ReturnType<typeof readCString> = () => "";

  const sql = sqlite3_expanded_sql(pStmt);
  assertType<typeof sql, SqliteOwnedCStringPtr | NullPtr>();
  if (sql !== 0) read(sql);
  sqlite3_free(sql);
});

/**
 * A fake {@link SqliteWasmDep} whose variadic shims record their calls and
 * return SQLITE_OK.
 */
const setupFakeShims = () => {
  const calls: Array<ReadonlyArray<unknown>> = [];
  const shim =
    (name: string) =>
    (...args: ReadonlyArray<unknown>): SqliteResultCode => {
      calls.push([name, ...args]);
      return SQLITE_OK;
    };
  const deps: SqliteWasmDep = {
    sqliteWasm: {
      exports: {
        sqlite3__wasm_config_i: shim("sqlite3__wasm_config_i"),
        sqlite3__wasm_config_ii: shim("sqlite3__wasm_config_ii"),
        sqlite3__wasm_config_j: shim("sqlite3__wasm_config_j"),
        sqlite3__wasm_db_config_s: shim("sqlite3__wasm_db_config_s"),
        sqlite3__wasm_db_config_pii: shim("sqlite3__wasm_db_config_pii"),
        sqlite3__wasm_db_config_ip: shim("sqlite3__wasm_db_config_ip"),
      } as unknown as SqliteCExports,
      functionTable: new WebAssembly.Table({ initial: 0, element: "anyfunc" }),
      getHeapU8: () => new Uint8Array(),
      getHeapDataView: () => new DataView(new ArrayBuffer(0)),
      call: (fn) => fn(),
      isBroken: () => false,
    },
  };
  return { deps, calls };
};

test("sqlite3_config passes each option to the shim for its arguments", () => {
  const { deps, calls } = setupFakeShims();
  const config = sqlite3_config(deps);

  assertEqual(config(SQLITE_CONFIG_URI, 1), SQLITE_OK);
  assertEqual(config(SQLITE_CONFIG_LOOKASIDE, 64, 10), SQLITE_OK);
  assertEqual(config(SQLITE_CONFIG_MEMDB_MAXSIZE, 1024n), SQLITE_OK);

  assertEqual(calls, [
    ["sqlite3__wasm_config_i", SQLITE_CONFIG_URI, 1],
    ["sqlite3__wasm_config_ii", SQLITE_CONFIG_LOOKASIDE, 64, 10],
    ["sqlite3__wasm_config_j", SQLITE_CONFIG_MEMDB_MAXSIZE, 1024n],
  ]);
});

test("sqlite3_config returns SQLITE_NOTFOUND for any other option without calling wasm", () => {
  const { deps, calls } = setupFakeShims();

  // @ts-expect-error SQLITE_CONFIG_GETMALLOC takes a pointer the shims do not pass.
  const result = sqlite3_config(deps)(SQLITE_CONFIG_GETMALLOC, 1);

  assertEqual(result, SQLITE_NOTFOUND);
  assertEqual(calls, []);
});

test("sqlite3_db_config passes each option to the shim for its arguments, and pResult as NULL when omitted", () => {
  const { deps, calls } = setupFakeShims();
  const dbConfig = sqlite3_db_config(deps);
  const zName = 24 as CStringPtr;
  const buf = 32 as WasmPtr;
  const pResult = 40 as WasmPtr;

  assertEqual(dbConfig(db, SQLITE_DBCONFIG_MAINDBNAME, zName), SQLITE_OK);
  assertEqual(dbConfig(db, SQLITE_DBCONFIG_LOOKASIDE, buf, 64, 10), SQLITE_OK);
  assertEqual(dbConfig(db, SQLITE_DBCONFIG_ENABLE_FKEY, 1, pResult), SQLITE_OK);
  assertEqual(dbConfig(db, SQLITE_DBCONFIG_FP_DIGITS, 5), SQLITE_OK);

  assertEqual(calls, [
    ["sqlite3__wasm_db_config_s", db, SQLITE_DBCONFIG_MAINDBNAME, zName],
    ["sqlite3__wasm_db_config_pii", db, SQLITE_DBCONFIG_LOOKASIDE, buf, 64, 10],
    ["sqlite3__wasm_db_config_ip", db, SQLITE_DBCONFIG_ENABLE_FKEY, 1, pResult],
    ["sqlite3__wasm_db_config_ip", db, SQLITE_DBCONFIG_FP_DIGITS, 5, 0],
  ]);
});

test("sqlite3_db_config returns SQLITE_MISUSE for any other option without calling wasm", () => {
  const { deps, calls } = setupFakeShims();

  // @ts-expect-error The value after SQLITE_DBCONFIG_MAX is not an option.
  const result = sqlite3_db_config(deps)(db, SQLITE_DBCONFIG_MAX + 1, 0);

  assertEqual(result, SQLITE_MISUSE);
  assertEqual(calls, []);
});

test("every generated binding returns the export it names", async () => {
  const exportsByName = new Map<string | symbol, () => void>();
  const exports = new Proxy(
    {},
    {
      get: (_, name) => {
        const fake = exportsByName.get(name) ?? (() => undefined);
        exportsByName.set(name, fake);
        return fake;
      },
    },
  ) as SqliteCExports;
  const deps = { sqliteWasm: { exports } } as SqliteWasmDep;
  // The variadic functions dispatch to shims, tested above, and
  // sqlite3_vtab_config is its shim.
  const exportNames: Readonly<Record<string, string | null>> = {
    sqlite3_config: null,
    sqlite3_db_config: null,
    sqlite3_vtab_config: "sqlite3__wasm_vtab_config",
  };
  const capi = (await import("./CApi.ts")) as unknown as Readonly<
    Record<string, unknown>
  >;

  let checked = 0;
  for (const [name, binding] of Object.entries(capi)) {
    if (typeof binding !== "function") continue;
    const exportName = name in exportNames ? exportNames[name] : name;
    if (exportName == null) continue;
    assertSame(
      (binding as (deps: SqliteWasmDep) => unknown)(deps),
      exports[exportName as keyof SqliteCExports],
    );
    checked++;
  }
  assertTrue(checked > 154);
});
