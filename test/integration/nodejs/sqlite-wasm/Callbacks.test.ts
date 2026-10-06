/**
 * SQLite's callback-taking C API through the generated bindings and
 * {@link installWasmFunctions} on the pinned binary.
 *
 * Ports the tests of SQLite's `ext/wasm/tester1.c-pp.js` (public domain), cited
 * by group and test, and covers the scenarios of wa-sqlite's tests (MIT), cited
 * by file, with tests of our own. Callbacks only collect what SQLite passes
 * them, and the tests assert after the C call returns, because a callback that
 * throws is reported as a defect instead of failing the test.
 */

import {
  assertEqual,
  assertErr,
  assertInstanceOf,
  assertSame,
  getOrThrow,
  trySync,
  type NonEmptyReadonlyArray,
} from "@evolu/common";
import { test } from "node:test";
import {
  sqlite3_aggregate_context,
  sqlite3_auto_extension,
  sqlite3_bind_pointer,
  sqlite3_bind_text,
  sqlite3_busy_handler,
  sqlite3_cancel_auto_extension,
  sqlite3_close_v2,
  sqlite3_collation_needed,
  sqlite3_column_count,
  sqlite3_column_int,
  sqlite3_column_type,
  sqlite3_column_value,
  sqlite3_commit_hook,
  sqlite3_context_db_handle,
  sqlite3_create_collation,
  sqlite3_create_collation_v2,
  sqlite3_create_function_v2,
  sqlite3_exec,
  sqlite3_extended_errcode,
  sqlite3_finalize,
  sqlite3_free,
  sqlite3_get_auxdata,
  sqlite3_reset,
  sqlite3_reset_auto_extension,
  sqlite3_result_blob,
  sqlite3_result_double,
  sqlite3_result_error,
  sqlite3_result_error_code,
  sqlite3_result_error_nomem,
  sqlite3_result_error_toobig,
  sqlite3_result_int,
  sqlite3_result_int64,
  sqlite3_result_null,
  sqlite3_result_pointer,
  sqlite3_result_text,
  sqlite3_rollback_hook,
  sqlite3_set_auxdata,
  sqlite3_step,
  sqlite3_strnicmp,
  sqlite3_trace_v2,
  sqlite3_update_hook,
  sqlite3_user_data,
  sqlite3_value_blob,
  sqlite3_value_bytes,
  sqlite3_value_double,
  sqlite3_value_int64,
  sqlite3_value_pointer,
  sqlite3_value_text,
  sqlite3_value_type,
} from "../../../../packages/sqlite-wasm/src/CApi.ts";
import {
  SQLITE_ABORT,
  SQLITE_BLOB,
  SQLITE_BUSY,
  SQLITE_CONSTRAINT,
  SQLITE_CONSTRAINT_COMMITHOOK,
  SQLITE_DELETE,
  SQLITE_DETERMINISTIC,
  SQLITE_ERROR,
  SQLITE_ERROR_MISSING_COLLSEQ,
  SQLITE_FLOAT,
  SQLITE_INSERT,
  SQLITE_INTEGER,
  SQLITE_NOMEM,
  SQLITE_NULL,
  SQLITE_OK,
  SQLITE_OPEN_CREATE,
  SQLITE_OPEN_READWRITE,
  SQLITE_OPEN_URI,
  SQLITE_ROW,
  SQLITE_TEXT,
  SQLITE_TOOBIG,
  SQLITE_TRACE_CLOSE,
  SQLITE_TRACE_PROFILE,
  SQLITE_TRACE_ROW,
  SQLITE_TRACE_STMT,
  SQLITE_UPDATE,
  SQLITE_UTF8,
  SQLITE_WASM_DEALLOC,
} from "../../../../packages/sqlite-wasm/src/Constants.ts";
import {
  allocCString,
  allocWasm,
  copyWasmBytes,
  readCString,
  readUtf8,
  writeWasmBytes,
} from "../../../../packages/sqlite-wasm/src/Memory.ts";
import type {
  CStringPtr,
  SqliteContextPtr,
  SqliteDbPtr,
  SqliteFunctionPtr,
  SqliteOwnedPtr,
  SqliteValuePtr,
  WasmPtr,
} from "../../../../packages/sqlite-wasm/src/Pointer.ts";
import {
  installWasmFunctions,
  type SqliteWasmFunction,
} from "../../../../packages/sqlite-wasm/src/Wasm.ts";
import { setupDatabase, trapEveryOpen } from "./_sqliteWasm.ts";

/** A SQL value read into JavaScript, INTEGER as a bigint. */
type Value = bigint | number | string | Uint8Array | null;

/**
 * A `:memory:` database on a fresh instance, with helpers that install
 * functions, read SQL values and pass results.
 */
const setupCallbacks = async () => {
  const t = await setupDatabase();

  const install = (
    functions: NonEmptyReadonlyArray<SqliteWasmFunction>,
  ): NonEmptyReadonlyArray<SqliteFunctionPtr> =>
    installWasmFunctions(t)(functions).pointers;

  /** Reads the C strings of an array of `count` pointers, such as `argv`. */
  const readCStrings = (
    array: WasmPtr,
    count: number,
  ): ReadonlyArray<string | null> =>
    Array.from({ length: count }, (_, index) =>
      t.text(t.readPtr((array + index * 4) as WasmPtr) as CStringPtr),
    );

  const readValue = (value: SqliteValuePtr): Value => {
    switch (sqlite3_value_type(t)(value)) {
      case SQLITE_INTEGER:
        return sqlite3_value_int64(t)(value);
      case SQLITE_FLOAT:
        return sqlite3_value_double(t)(value);
      case SQLITE_TEXT: {
        const ptr = sqlite3_value_text(t)(value);
        return ptr === 0
          ? null
          : readUtf8(t)(ptr, sqlite3_value_bytes(t)(value));
      }
      case SQLITE_BLOB: {
        const ptr = sqlite3_value_blob(t)(value);
        return ptr === 0
          ? new Uint8Array()
          : copyWasmBytes(t)(ptr, sqlite3_value_bytes(t)(value));
      }
      case SQLITE_NULL:
        return null;
    }
  };

  /** Reads the `argc` values of a function's `argv`. */
  const readArgs = (argc: number, argv: WasmPtr): ReadonlyArray<Value> =>
    Array.from({ length: argc }, (_, index) =>
      readValue(t.readPtr((argv + index * 4) as WasmPtr) as SqliteValuePtr),
    );

  /** Returns the values of a query's first row. */
  const selectRow = (sql: string): ReadonlyArray<Value> => {
    const stmt = t.prepare(sql);
    assertEqual(sqlite3_step(t)(stmt), SQLITE_ROW);
    const row = Array.from(
      { length: sqlite3_column_count(t)(stmt) },
      (_, index) => readValue(sqlite3_column_value(t)(stmt, index)),
    );
    assertEqual(sqlite3_finalize(t)(stmt), SQLITE_OK);
    return row;
  };

  /** Copies bytes into memory SQLite frees, for a result or a binding. */
  const allocBytes = (bytes: Uint8Array): SqliteOwnedPtr => {
    const ptr = getOrThrow(allocWasm(t)(bytes.length));
    writeWasmBytes(t)(ptr, bytes);
    return ptr;
  };

  const resultText = (context: SqliteContextPtr, value: string): void => {
    const bytes = new TextEncoder().encode(value);
    sqlite3_result_text(t)(
      context,
      allocBytes(bytes),
      bytes.length,
      SQLITE_WASM_DEALLOC,
    );
  };

  const resultBlob = (context: SqliteContextPtr, value: Uint8Array): void => {
    sqlite3_result_blob(t)(
      context,
      allocBytes(value),
      value.length,
      SQLITE_WASM_DEALLOC,
    );
  };

  return {
    ...t,
    install,
    readCStrings,
    readValue,
    readArgs,
    selectRow,
    allocBytes,
    resultText,
    resultBlob,
  };
};

// tester1.c-pp.js 'sqlite3.oo1' 'ATTACH', which demonstrates the full
// sqlite3_exec() callback signature, and wa-sqlite test/api_exec.js 'should
// return query results via callback'.
test("sqlite3_exec calls its callback with pArg and each row's text and column names", async () => {
  const t = await setupCallbacks();
  const rows: Array<unknown> = [];
  const [callback] = t.install([
    {
      signature: "i(pipp)",
      fn: (pArg: number, count: number, values: WasmPtr, names: WasmPtr) => {
        rows.push([
          pArg,
          t.readCStrings(values, count),
          t.readCStrings(names, count),
        ]);
        return 0;
      },
    },
  ]);

  const rc = sqlite3_exec(t)(
    t.db,
    t.cString("select 1 as a, 'x' as b, null as c union all select 2, 'y', 3"),
    callback,
    42 as WasmPtr,
    0,
  );

  assertEqual(rc, SQLITE_OK);
  assertEqual(rows, [
    [42, ["1", "x", null], ["a", "b", "c"]],
    [42, ["2", "y", "3"], ["a", "b", "c"]],
  ]);
});

// tester1.c-pp.js 'sqlite3.oo1' 'ATTACH', which throws from the callback.
test("sqlite3_exec stops with SQLITE_ABORT when its callback returns non-zero or throws, which is reported as a defect", async () => {
  const t = await setupCallbacks();
  const error = new Error("from the exec callback");
  let calls = 0;
  const [nonZero, throwing] = t.install([
    {
      signature: "i(pipp)",
      fn: () => {
        calls++;
        return 1;
      },
    },
    {
      signature: "i(pipp)",
      fn: () => {
        calls++;
        throw error;
      },
    },
  ]);
  const sql = t.cString("select 1 union all select 2");

  const nonZeroRc = sqlite3_exec(t)(t.db, sql, nonZero, 0, 0);
  const throwingRc = sqlite3_exec(t)(t.db, sql, throwing, 0, 0);

  assertEqual([nonZeroRc, throwingRc, calls], [SQLITE_ABORT, SQLITE_ABORT, 2]);
  assertEqual(t.errmsg(), "query aborted");
  const defects = t.reportDefect.getDefects();
  assertEqual(defects.length, 1);
  assertSame(defects[0], error);
});

test("sqlite3_exec stops with SQLITE_ABORT when its callback returns a bigint, which is reported as a defect, and leaves the C stack as it was", async () => {
  const t = await setupCallbacks();
  // A callback typed to return nothing may return anything. Converting a
  // bigint to i32 at the wasm boundary would throw past the C frames, which
  // then never restore the stack pointer.
  // oxlint-disable-next-line typescript/strict-void-return -- The case under test.
  const fn: () => void = () => 1n;
  const [callback] = t.install([{ signature: "i(pipp)", fn }]);
  const sql = t.cString("select 1");
  const { emscripten_stack_get_current } = t.sqliteWasm.exports as unknown as {
    readonly emscripten_stack_get_current: () => number;
  };
  const stackPointer = emscripten_stack_get_current();

  const rc = sqlite3_exec(t)(t.db, sql, callback, 0, 0);

  assertEqual(rc, SQLITE_ABORT);
  assertEqual(emscripten_stack_get_current(), stackPointer);
  const defects = t.reportDefect.getDefects();
  assertEqual(defects.length, 1);
  assertInstanceOf(defects[0], TypeError);
});

// wa-sqlite test/callbacks.test.js commit_hook 'can change commit hook'.
test("a replaced commit hook's functions are disposed, and the next install reuses their slot", async () => {
  const t = await setupCallbacks();
  const commits: Array<string> = [];
  const hook = (name: string) =>
    installWasmFunctions(t)([
      {
        signature: "i(p)",
        fn: () => {
          commits.push(name);
          return 0;
        },
      },
    ]);
  assertEqual(t.exec("create table t(a)"), SQLITE_OK);
  const first = hook("first");
  assertEqual(sqlite3_commit_hook(t)(t.db, first.pointers[0], 1 as WasmPtr), 0);
  assertEqual(t.exec("insert into t values (1)"), SQLITE_OK);

  const second = hook("second");
  assertEqual(
    sqlite3_commit_hook(t)(t.db, second.pointers[0], 2 as WasmPtr),
    1,
  );
  first[Symbol.dispose]();
  assertEqual(t.exec("insert into t values (2)"), SQLITE_OK);
  const tableLength = t.sqliteWasm.functionTable.length;
  const third = hook("third");
  assertEqual(sqlite3_commit_hook(t)(t.db, third.pointers[0], 3 as WasmPtr), 2);
  second[Symbol.dispose]();
  assertEqual(t.exec("insert into t values (3)"), SQLITE_OK);
  assertEqual(sqlite3_commit_hook(t)(t.db, 0, 0), 3);
  third[Symbol.dispose]();
  assertEqual(t.exec("insert into t values (4)"), SQLITE_OK);

  assertEqual(commits, ["first", "second", "third"]);
  assertEqual(third.pointers, first.pointers);
  assertEqual(t.sqliteWasm.functionTable.length, tableLength);
});

// wa-sqlite test/callbacks.test.js create_function 'should return an int',
// 'should return an int64', 'should return a double', 'should return a
// string', 'should return a string with NUL bytes', 'should return a blob' and
// 'should return null'.
test("a scalar function returns a value of every type with the sqlite3_result functions", async () => {
  const t = await setupCallbacks();
  const results: Readonly<Record<string, (context: SqliteContextPtr) => void>> =
    {
      int: (context) => sqlite3_result_int(t)(context, 42),
      int64: (context) =>
        sqlite3_result_int64(t)(context, 0x7fff_ffff_ffff_ffffn),
      double: (context) => sqlite3_result_double(t)(context, 3.14),
      text: (context) => t.resultText(context, "foobar"),
      textWithNul: (context) => t.resultText(context, "foo\0bar"),
      emptyText: (context) => t.resultText(context, ""),
      blob: (context) => t.resultBlob(context, Uint8Array.of(0x12, 0x34, 0x56)),
      emptyBlob: (context) => t.resultBlob(context, new Uint8Array()),
      null: (context) => sqlite3_result_null(t)(context),
    };
  const [xFunc] = t.install([
    {
      signature: "v(pip)",
      fn: (context: SqliteContextPtr, argc: number, argv: WasmPtr) => {
        results[String(t.readArgs(argc, argv)[0])]?.(context);
      },
    },
  ]);
  assertEqual(
    sqlite3_create_function_v2(t)(
      t.db,
      t.cString("fn"),
      1,
      SQLITE_UTF8 | SQLITE_DETERMINISTIC,
      0,
      xFunc,
      0,
      0,
      0,
    ),
    SQLITE_OK,
  );

  const names = Object.keys(results);
  const row = t.selectRow(
    `select ${names.map((name) => `fn('${name}'), typeof(fn('${name}'))`).join(", ")}`,
  );

  assertEqual(row, [
    42n,
    "integer",
    0x7fff_ffff_ffff_ffffn,
    "integer",
    3.14,
    "real",
    "foobar",
    "text",
    "foo\0bar",
    "text",
    "",
    "text",
    Uint8Array.of(0x12, 0x34, 0x56),
    "blob",
    new Uint8Array(),
    "blob",
    null,
    "null",
  ]);
  assertEqual(t.reportDefect.getDefects(), []);
});

// wa-sqlite test/callbacks.test.js create_function 'should pass a fixed number
// of arguments', 'should pass a variable number of arguments' and 'should pass
// a string with NUL bytes', and tester1.c-pp.js 'sqlite3.oo1' 'Scalar UDFs'.
test("a scalar function receives arguments of every type, its pApp and its connection", async () => {
  const t = await setupCallbacks();
  const calls: Array<unknown> = [];
  const [xFunc] = t.install([
    {
      signature: "v(pip)",
      fn: (context: SqliteContextPtr, argc: number, argv: WasmPtr) => {
        calls.push([
          sqlite3_user_data(t)(context),
          sqlite3_context_db_handle(t)(context) === t.db,
          t.readArgs(argc, argv),
        ]);
        sqlite3_result_int(t)(context, argc);
      },
    },
  ]);
  for (const [name, nArg] of [
    ["fixed", 6],
    ["variable", -1],
  ] as const)
    assertEqual(
      sqlite3_create_function_v2(t)(
        t.db,
        t.cString(name),
        nArg,
        SQLITE_UTF8,
        7 as WasmPtr,
        xFunc,
        0,
        0,
        0,
      ),
      SQLITE_OK,
    );
  const args =
    "42, 9223372036854775807, 3.14, 'foo' || char(0) || 'bar', x'123456', null";

  const row = t.selectRow(
    `select fixed(${args}), variable(), variable(${args})`,
  );

  assertEqual(row, [6n, 0n, 6n]);
  const values = [
    42n,
    9_223_372_036_854_775_807n,
    3.14,
    "foo\0bar",
    Uint8Array.of(0x12, 0x34, 0x56),
    null,
  ];
  assertEqual(calls, [
    [7, true, values],
    [7, true, []],
    [7, true, values],
  ]);
});

// tester1.c-pp.js 'sqlite3.oo1' 'Scalar UDFs', which maps one function to
// several arities.
test("a function name registers per arity, and a NULL xFunc removes one arity", async () => {
  const t = await setupCallbacks();
  const argcs: Array<number> = [];
  const [xFunc] = t.install([
    {
      signature: "v(pip)",
      fn: (context: SqliteContextPtr, argc: number) => {
        argcs.push(argc);
        sqlite3_result_int(t)(context, argc);
      },
    },
  ]);
  const create = (nArg: number, fn: SqliteFunctionPtr | 0) =>
    sqlite3_create_function_v2(t)(
      t.db,
      t.cString("nary"),
      nArg,
      SQLITE_UTF8,
      0,
      fn,
      0,
      0,
      0,
    );
  assertEqual([create(0, xFunc), create(1, xFunc)], [SQLITE_OK, SQLITE_OK]);

  assertEqual(t.selectRow("select nary(), nary(1)"), [0n, 1n]);
  assertEqual(create(0, 0), SQLITE_OK);
  assertEqual(t.exec("select nary()"), SQLITE_ERROR);
  assertEqual(t.errmsg(), "wrong number of arguments to function nary()");
  assertEqual(t.selectRow("select nary(1)"), [1n]);
  assertEqual(create(1, 0), SQLITE_OK);
  assertEqual(t.exec("select nary(1)"), SQLITE_ERROR);
  assertEqual(t.errmsg(), "no such function: nary");

  assertEqual(argcs, [0, 1, 1]);
});

// wa-sqlite test/callbacks.test.js create_function, whose functions report
// results, and tester1.c-pp.js 'sqlite3.oo1' 'Scalar UDFs'.
test("a scalar function fails its statement with sqlite3_result_error, and one that throws returns NULL and is reported as a defect", async () => {
  const t = await setupCallbacks();
  const error = new Error("from a scalar function");
  const [failing, throwing] = t.install([
    {
      signature: "v(pip)",
      fn: (context: SqliteContextPtr, argc: number, argv: WasmPtr) => {
        const [kind] = t.readArgs(argc, argv);
        if (kind === "message") {
          const message = new TextEncoder().encode("custom failure");
          const ptr = t.allocBytes(message);
          sqlite3_result_error(t)(context, ptr, message.length);
          sqlite3_free(t)(ptr);
        } else if (kind === "code")
          sqlite3_result_error_code(t)(context, SQLITE_CONSTRAINT);
        else if (kind === "nomem") sqlite3_result_error_nomem(t)(context);
        else sqlite3_result_error_toobig(t)(context);
      },
    },
    {
      signature: "v(pip)",
      fn: () => {
        throw error;
      },
    },
  ]);
  for (const [name, xFunc] of [
    ["failing", failing],
    ["throwing", throwing],
  ] as const)
    assertEqual(
      sqlite3_create_function_v2(t)(
        t.db,
        t.cString(name),
        -1,
        SQLITE_UTF8,
        0,
        xFunc,
        0,
        0,
        0,
      ),
      SQLITE_OK,
    );

  const failures = ["message", "code", "nomem", "toobig"].map((kind) => [
    t.exec(`select failing('${kind}')`),
    t.errmsg(),
  ]);

  assertEqual(failures, [
    [SQLITE_ERROR, "custom failure"],
    [SQLITE_CONSTRAINT, "constraint failed"],
    [SQLITE_NOMEM, "out of memory"],
    [SQLITE_TOOBIG, "string or blob too big"],
  ]);
  assertEqual(t.selectRow("select throwing()"), [null]);
  const defects = t.reportDefect.getDefects();
  assertEqual(defects.length, 1);
  assertSame(defects[0], error);
});

test("a function that catches what it threw returns into SQLite, but one that catches what escaped a nested call that broke the instance makes the outer call throw the refusal, caused by what broke it", async () => {
  const t = await setupCallbacks();
  const error = new Error("from a scalar function");
  const caught: Array<unknown> = [];
  const [xFunc] = t.install([
    {
      signature: "v(pip)",
      fn: (context: SqliteContextPtr) => {
        try {
          t.sqliteWasm.call(() => t.open(":memory:"));
          throw error;
        } catch (thrown) {
          caught.push(thrown);
        }
        sqlite3_result_int(t)(context, 1);
      },
    },
  ]);
  assertEqual(
    sqlite3_create_function_v2(t)(
      t.db,
      t.cString("f"),
      0,
      SQLITE_UTF8,
      0,
      xFunc,
      0,
      0,
      0,
    ),
    SQLITE_OK,
  );
  assertEqual(t.exec("create table t(x)"), SQLITE_OK);
  assertEqual(t.exec("insert into t values (f())"), SQLITE_OK);
  assertEqual(t.selectText("select count(*) from t"), "1");
  trapEveryOpen(t);

  const outer = trySync(
    () => t.sqliteWasm.call(() => t.exec("insert into t values (f())")),
    (thrown) => thrown,
  );

  assertEqual(caught.length, 2);
  assertSame(caught[0], error);
  assertInstanceOf(caught[1], WebAssembly.RuntimeError);
  assertErr(outer);
  assertInstanceOf(outer.error, Error);
  assertEqual(
    outer.error.message,
    "The SQLite wasm instance is broken: an exception escaped a wasm call.",
  );
  assertSame(outer.error.cause, caught[1]);
  assertEqual(t.reportDefect.getDefects(), []);
});

// Evolu's ReportDefect calls no SQLite, but a custom one can, as can an error
// event listener that its reportError runs, and break the instance itself.
test("a function that throws, whose ReportDefect catches what escaped a nested call that broke the instance, makes the outer call throw the refusal, caused by what broke it", async () => {
  const t = await setupCallbacks();
  const error = new Error("from a scalar function");
  const reported: Array<unknown> = [];
  const caught: Array<unknown> = [];
  const {
    pointers: [xFunc],
  } = installWasmFunctions({
    sqliteWasm: t.sqliteWasm,
    reportDefect: (defect) => {
      reported.push(defect);
      try {
        t.sqliteWasm.call(() => t.open(":memory:"));
      } catch (thrown) {
        caught.push(thrown);
      }
    },
  })([
    {
      signature: "v(pip)",
      fn: () => {
        throw error;
      },
    },
  ]);
  assertEqual(
    sqlite3_create_function_v2(t)(
      t.db,
      t.cString("f"),
      0,
      SQLITE_UTF8,
      0,
      xFunc,
      0,
      0,
      0,
    ),
    SQLITE_OK,
  );
  assertEqual(t.exec("create table t(x)"), SQLITE_OK);
  trapEveryOpen(t);

  const outer = trySync(
    () => t.sqliteWasm.call(() => t.exec("insert into t values (f())")),
    (thrown) => thrown,
  );

  assertEqual(reported.length, 1);
  assertSame(reported[0], error);
  assertEqual(caught.length, 1);
  assertInstanceOf(caught[0], WebAssembly.RuntimeError);
  assertErr(outer);
  assertInstanceOf(outer.error, Error);
  assertEqual(
    outer.error.message,
    "The SQLite wasm instance is broken: an exception escaped a wasm call.",
  );
  assertSame(outer.error.cause, caught[0]);
  assertEqual(t.reportDefect.getDefects(), []);
});

test("sqlite3_create_function_v2 calls xDestroy with pApp when the function is replaced and when the connection closes", async () => {
  const t = await setupCallbacks();
  const destroyed: Array<number> = [];
  const [xFunc, xDestroy] = t.install([
    {
      signature: "v(pip)",
      fn: (context: SqliteContextPtr) =>
        sqlite3_result_int(t)(context, sqlite3_user_data(t)(context)),
    },
    {
      signature: "v(p)",
      fn: (pApp: number) => {
        destroyed.push(pApp);
      },
    },
  ]);
  const create = (pApp: number) =>
    sqlite3_create_function_v2(t)(
      t.db,
      t.cString("app"),
      0,
      SQLITE_UTF8,
      pApp as WasmPtr,
      xFunc,
      0,
      0,
      xDestroy,
    );

  assertEqual(create(1), SQLITE_OK);
  assertEqual(t.selectRow("select app()"), [1n]);
  assertEqual(create(2), SQLITE_OK);
  assertEqual(t.selectRow("select app()"), [2n]);
  assertEqual(destroyed, [1]);
  assertEqual(sqlite3_close_v2(t)(t.db), SQLITE_OK);

  assertEqual(destroyed, [1, 2]);
});

// tester1.c-pp.js 'sqlite3.oo1' 'Aggregate UDFs' and 'Aggregate UDFs
// (64-bit)', and wa-sqlite test/callbacks.test.js create_function 'should
// create an aggregate function'.
test("an aggregate function keeps a running total per call in sqlite3_aggregate_context", async () => {
  const t = await setupCallbacks();
  const view = () => t.sqliteWasm.getHeapDataView();
  const [xStep, xFinal] = t.install([
    {
      signature: "v(pip)",
      fn: (context: SqliteContextPtr, argc: number, argv: WasmPtr) => {
        const total = sqlite3_aggregate_context(t)(context, 8);
        if (total === 0) return sqlite3_result_error_nomem(t)(context);
        let sum = view().getBigInt64(total, true);
        for (const value of t.readArgs(argc, argv)) sum += value as bigint;
        view().setBigInt64(total, sum, true);
      },
    },
    {
      signature: "v(p)",
      fn: (context: SqliteContextPtr) => {
        // Without rows, no context was allocated and 0 bytes allocate none.
        const total = sqlite3_aggregate_context(t)(context, 0);
        sqlite3_result_int64(t)(
          context,
          total === 0 ? 0n : view().getBigInt64(total, true),
        );
      },
    },
  ]);
  for (const [name, nArg] of [
    ["summer", 1],
    ["summerN", -1],
  ] as const)
    assertEqual(
      sqlite3_create_function_v2(t)(
        t.db,
        t.cString(name),
        nArg,
        SQLITE_UTF8,
        0,
        0,
        xStep,
        xFinal,
        0,
      ),
      SQLITE_OK,
    );

  assertEqual(
    t.selectRow(
      "with cte(v) as (select 3 union all select 5 union all select 7) select summer(v), summer(v + 1) from cte",
    ),
    [15n, 18n],
  );
  assertEqual(t.selectRow("select summerN(1, 8, 9), summerN(2, 3, 4)"), [
    18n,
    9n,
  ]);
  assertEqual(
    t.selectRow(
      "with cte(v) as (select 9007199254740991 union all select 1 union all select 2) select summer(v), summer(v + 1) from cte",
    ),
    [9_007_199_254_740_994n, 9_007_199_254_740_997n],
  );
  assertEqual(t.selectRow("select summer(v) from (select 1 as v) where 0"), [
    0n,
  ]);
  assertEqual(t.exec("select summer(1, 2)"), SQLITE_ERROR);
  assertEqual(t.errmsg(), "wrong number of arguments to function summer()");
});

// tester1.c-pp.js 'Bug Reports' 'sqlite3_set_auxdata() binding signature',
// https://github.com/sqlite/sqlite-wasm/issues/92.
test("sqlite3_set_auxdata keeps data for a constant argument across rows, and SQLite calls its destructor", async () => {
  const t = await setupCallbacks();
  const pAux = getOrThrow(allocWasm(t)(4));
  const events: Array<string> = [];
  const [xFunc, xDelete] = t.install([
    {
      signature: "v(pip)",
      fn: (context: SqliteContextPtr, argc: number, argv: WasmPtr) => {
        const aux = sqlite3_get_auxdata(t)(context, 0);
        if (aux === 0) {
          events.push("set");
          sqlite3_set_auxdata(t)(context, 0, pAux, xDelete);
        } else events.push(aux === pAux ? "reused" : "other");
        const [, value] = t.readArgs(argc, argv);
        sqlite3_result_int64(t)(context, value as bigint);
      },
    },
    {
      signature: "v(p)",
      fn: (ptr: number) => {
        events.push(ptr === pAux ? "deleted" : "deleted other");
      },
    },
  ]);
  assertEqual(
    sqlite3_create_function_v2(t)(
      t.db,
      t.cString("auxtest"),
      2,
      SQLITE_UTF8,
      0,
      xFunc,
      0,
      0,
      0,
    ),
    SQLITE_OK,
  );
  assertEqual(
    t.exec("create table t(a); insert into t(a) values (1), (2), (1)"),
    SQLITE_OK,
  );

  const stmt = t.prepare("select auxtest(1, a) from t order by a");
  const values: Array<number> = [];
  while (sqlite3_step(t)(stmt) === SQLITE_ROW)
    values.push(sqlite3_column_int(t)(stmt, 0));
  assertEqual(sqlite3_finalize(t)(stmt), SQLITE_OK);

  assertEqual(values, [1, 1, 2]);
  assertEqual(events, ["set", "reused", "reused", "deleted"]);
});

// tester1.c-pp.js 'sqlite3.oo1' 'Custom collation'.
test("a collation compares text with xCompare, is replaced by a later one of the same name, and removed by NULL", async () => {
  const t = await setupCallbacks();
  const compared: Array<unknown> = [];
  const destroyed: Array<number> = [];
  const [caseInsensitive, alwaysEqual, xDestroy] = t.install([
    {
      signature: "i(pipip)",
      fn: (pArg: number, n1: number, p1: WasmPtr, n2: number, p2: WasmPtr) => {
        compared.push([pArg, readUtf8(t)(p1, n1), readUtf8(t)(p2, n2)]);
        const rc = sqlite3_strnicmp(t)(
          p1 as CStringPtr,
          p2 as CStringPtr,
          Math.min(n1, n2),
        );
        return rc === 0 ? n1 - n2 : rc;
      },
    },
    {
      signature: "i(pipip)",
      fn: (pArg: number) => {
        compared.push([pArg]);
        return 0;
      },
    },
    {
      signature: "v(p)",
      fn: (pArg: number) => {
        destroyed.push(pArg);
      },
    },
  ]);
  const create = (
    name: string,
    pArg: number,
    xCompare: SqliteFunctionPtr | 0,
  ) =>
    sqlite3_create_collation_v2(t)(
      t.db,
      t.cString(name),
      SQLITE_UTF8,
      pArg as WasmPtr,
      xCompare,
      xDestroy,
    );

  assertEqual(create("mycollation", 1, caseInsensitive), SQLITE_OK);
  assertEqual(
    t.selectRow(
      "select 'hi' = 'HI' collate mycollation, 'hii' = 'HI' collate mycollation, 'hi' = 'HIi' collate mycollation",
    ),
    [1n, 0n, 0n],
  );
  assertEqual(create("MYCOLLATION", 2, alwaysEqual), SQLITE_OK);
  assertEqual(t.selectRow("select 'a' = 'b' collate mycollation"), [1n]);
  assertEqual(create("mycollation", 3, 0), SQLITE_OK);
  assertEqual(t.exec("select 'a' = 'b' collate mycollation"), SQLITE_ERROR);
  assertEqual(sqlite3_extended_errcode(t)(t.db), SQLITE_ERROR_MISSING_COLLSEQ);

  assertEqual(compared, [
    [1, "hi", "HI"],
    [1, "hii", "HI"],
    [1, "hi", "HIi"],
    [2],
  ]);
  assertEqual(destroyed, [1, 2]);
});

test("sqlite3_collation_needed asks for an undefined collation, which the callback can create", async () => {
  const t = await setupCallbacks();
  const needed: Array<unknown> = [];
  const [xCompare, xCollNeeded] = t.install([
    {
      signature: "i(pipip)",
      fn: (_pArg: number, n1: number, p1: WasmPtr, n2: number, p2: WasmPtr) =>
        // Reverse order.
        readUtf8(t)(p2, n2).localeCompare(readUtf8(t)(p1, n1)),
    },
    {
      signature: "v(ppis)",
      fn: (
        pArg: number,
        db: SqliteDbPtr,
        eTextRep: number,
        zName: CStringPtr,
      ) => {
        const name = readCString(t)(zName);
        needed.push([pArg, db === t.db, eTextRep, name]);
        if (name === "reverse")
          sqlite3_create_collation(t)(db, zName, SQLITE_UTF8, 0, xCompare);
      },
    },
  ]);
  assertEqual(
    sqlite3_collation_needed(t)(t.db, 5 as WasmPtr, xCollNeeded),
    SQLITE_OK,
  );

  assertEqual(
    t.selectRow(
      "select group_concat(x, '') from (select column1 as x from (values ('a'), ('c'), ('b')) order by x collate reverse)",
    ),
    ["cba"],
  );
  assertEqual(t.exec("select 'a' = 'b' collate unknown"), SQLITE_ERROR);
  assertEqual(t.errmsg(), "no such collation sequence: unknown");

  assertEqual(needed, [
    [5, true, SQLITE_UTF8, "reverse"],
    [5, true, SQLITE_UTF8, "unknown"],
  ]);
});

// tester1.c-pp.js 'Hook APIs' 'sqlite3_commit/rollback/update_hook()' and
// wa-sqlite test/callbacks.test.js commit_hook 'should call commit hook' and
// 'can rollback based on return value'.
test("the commit hook runs before each commit and turns it into a rollback by returning non-zero, and the rollback hook runs for each rollback", async () => {
  const t = await setupCallbacks();
  const events: Array<unknown> = [];
  let veto = false;
  const [xCommit, xRollback] = t.install([
    {
      signature: "i(p)",
      fn: (pArg: number) => {
        events.push(["commit", pArg]);
        return veto ? 1 : 0;
      },
    },
    {
      signature: "v(p)",
      fn: (pArg: number) => {
        events.push(["rollback", pArg]);
      },
    },
  ]);
  assertEqual(sqlite3_commit_hook(t)(t.db, xCommit, 17 as WasmPtr), 0);
  assertEqual(sqlite3_rollback_hook(t)(t.db, xRollback, 21 as WasmPtr), 0);

  assertEqual(t.exec("create table t(a)"), SQLITE_OK);
  assertEqual(t.exec("select * from t"), SQLITE_OK);
  assertEqual(t.exec("begin; insert into t values (1); rollback"), SQLITE_OK);
  assertEqual(
    t.exec("begin; insert into t values (2); insert into t values (3); commit"),
    SQLITE_OK,
  );
  veto = true;
  const vetoed = [
    t.exec("insert into t values (4)"),
    sqlite3_extended_errcode(t)(t.db),
    t.errmsg(),
  ];

  assertEqual(vetoed, [
    SQLITE_CONSTRAINT,
    SQLITE_CONSTRAINT_COMMITHOOK,
    "constraint failed",
  ]);
  assertEqual(t.selectRow("select group_concat(a) from t"), ["2,3"]);
  assertEqual(events, [
    ["commit", 17],
    ["rollback", 21],
    ["commit", 17],
    ["commit", 17],
    ["rollback", 21],
  ]);
  assertEqual(sqlite3_commit_hook(t)(t.db, 0, 0), 17);
  assertEqual(sqlite3_rollback_hook(t)(t.db, 0, 0), 21);
});

// wa-sqlite test/callbacks.test.js update_hook 'should call update hook' and
// commit_hook 'does not overwrite update_hook', and tester1.c-pp.js 'Hook
// APIs' 'sqlite3_commit/rollback/update_hook()'.
test("the update hook receives each change's operation, names and 64-bit rowid, alongside the commit hook", async () => {
  const t = await setupCallbacks();
  const changes: Array<unknown> = [];
  let commits = 0;
  const [xUpdate, xCommit] = t.install([
    {
      signature: "v(pippj)",
      fn: (
        pArg: number,
        operation: number,
        zDb: CStringPtr,
        zTable: CStringPtr,
        rowid: bigint,
      ) => {
        changes.push([pArg, operation, t.text(zDb), t.text(zTable), rowid]);
      },
    },
    {
      signature: "i(p)",
      fn: () => {
        commits++;
        return 0;
      },
    },
  ]);
  assertEqual(sqlite3_update_hook(t)(t.db, xUpdate, 33 as WasmPtr), 0);
  assertEqual(sqlite3_commit_hook(t)(t.db, xCommit, 0), 0);

  assertEqual(
    t.exec(`
      create table t(i integer primary key, x);
      insert into t values (1, 'foo'), (2, 'bar'), (12345678987654321, 'baz');
      delete from t where i = 2;
      update t set x = 'qux' where i = 1;
    `),
    SQLITE_OK,
  );

  assertEqual(changes, [
    [33, SQLITE_INSERT, "main", "t", 1n],
    [33, SQLITE_INSERT, "main", "t", 2n],
    [33, SQLITE_INSERT, "main", "t", 12_345_678_987_654_321n],
    [33, SQLITE_DELETE, "main", "t", 2n],
    [33, SQLITE_UPDATE, "main", "t", 1n],
  ]);
  assertEqual(commits, 4);
  assertEqual(sqlite3_update_hook(t)(t.db, 0, 0), 33);
});

test("sqlite3_trace_v2 reports the statements, rows, run times and closes in its mask", async () => {
  const t = await setupCallbacks();
  const events: Array<unknown> = [];
  const [xCallback] = t.install([
    {
      signature: "i(ippp)",
      fn: (event: number, pCtx: number, p: number, x: number) => {
        switch (event) {
          case SQLITE_TRACE_STMT:
            events.push(["stmt", pCtx, t.text(x as CStringPtr)]);
            break;
          case SQLITE_TRACE_PROFILE:
            events.push([
              "profile",
              pCtx,
              t.sqliteWasm.getHeapDataView().getBigInt64(x, true) >= 0n,
            ]);
            break;
          case SQLITE_TRACE_ROW:
            events.push(["row", pCtx, p !== 0]);
            break;
          case SQLITE_TRACE_CLOSE:
            events.push(["close", pCtx, p === t.db]);
            break;
        }
        return 0;
      },
    },
  ]);
  assertEqual(
    sqlite3_trace_v2(t)(
      t.db,
      SQLITE_TRACE_STMT |
        SQLITE_TRACE_PROFILE |
        SQLITE_TRACE_ROW |
        SQLITE_TRACE_CLOSE,
      xCallback,
      3 as WasmPtr,
    ),
    SQLITE_OK,
  );

  assertEqual(t.exec("select 1 union all select 2"), SQLITE_OK);
  assertEqual(sqlite3_close_v2(t)(t.db), SQLITE_OK);

  assertEqual(events, [
    ["stmt", 3, "select 1 union all select 2"],
    ["row", 3, true],
    ["row", 3, true],
    ["profile", 3, true],
    ["close", 3, true],
  ]);
});

// The busy handler needs two connections that lock the same database, which
// a shared memdb database provides.
test("the busy handler is called with the count of retries, retries while it returns non-zero, and fails with SQLITE_BUSY at 0", async () => {
  const t = await setupCallbacks();
  const open = () => {
    const opened = t.open(
      "file:/shared?vfs=memdb",
      SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE | SQLITE_OPEN_URI,
    );
    assertEqual(opened.rc, SQLITE_OK);
    return opened.db;
  };
  const writer = open();
  const reader = open();
  assertEqual(t.exec("create table t(a)", writer), SQLITE_OK);
  const counts: Array<unknown> = [];
  let commitAt = -1;
  const [xBusy] = t.install([
    {
      signature: "i(pi)",
      fn: (pArg: number, count: number) => {
        counts.push([pArg, count]);
        if (count < commitAt) return 1;
        if (count === commitAt) {
          // Releases the lock, so the retry succeeds.
          counts.push(t.exec("commit", writer));
          return 1;
        }
        return 0;
      },
    },
  ]);
  assertEqual(sqlite3_busy_handler(t)(reader, xBusy, 4 as WasmPtr), SQLITE_OK);
  assertEqual(
    t.exec("begin exclusive; insert into t values (1)", writer),
    SQLITE_OK,
  );

  const busy = [t.exec("select count(*) from t", reader), t.errmsg(reader)];
  commitAt = 2;
  const retried = t.selectText("select count(*) from t", reader);

  assertEqual(busy, [SQLITE_BUSY, "database is locked"]);
  assertEqual(retried, "1");
  assertEqual(counts, [[4, 0], [4, 0], [4, 1], [4, 2], SQLITE_OK]);
});

// tester1.c-pp.js 'Auto-extension API' 'Auto-extension sanity checks.'
test("an auto-extension runs for each new connection until cancelled or reset, and its error fails the open", async () => {
  const t = await setupCallbacks();
  const opened: Array<boolean> = [];
  let fail = false;
  const [xEntryPoint] = t.install([
    {
      signature: "i(ppp)",
      fn: (db: SqliteDbPtr, pzErrMsg: WasmPtr) => {
        opened.push(db !== 0);
        if (!fail) return SQLITE_OK;
        const message = getOrThrow(allocCString(t)("extension failed"));
        t.sqliteWasm.getHeapDataView().setUint32(pzErrMsg, message, true);
        return SQLITE_ERROR;
      },
    },
  ]);
  const openAndClose = () => {
    const { rc, db } = t.open(":memory:");
    const message = t.errmsg(db);
    assertEqual(sqlite3_close_v2(t)(db), SQLITE_OK);
    return [rc, message];
  };

  openAndClose();
  assertEqual(opened, []);
  assertEqual(sqlite3_auto_extension(t)(xEntryPoint), SQLITE_OK);
  assertEqual(sqlite3_auto_extension(t)(xEntryPoint), SQLITE_OK);
  openAndClose();
  openAndClose();
  assertEqual(opened, [true, true]);
  fail = true;
  assertEqual(openAndClose(), [
    SQLITE_ERROR,
    "automatic extension loading failed: extension failed",
  ]);
  assertEqual(sqlite3_cancel_auto_extension(t)(xEntryPoint), 1);
  assertEqual(sqlite3_cancel_auto_extension(t)(xEntryPoint), 0);
  openAndClose();
  assertEqual(sqlite3_auto_extension(t)(xEntryPoint), SQLITE_OK);
  sqlite3_reset_auto_extension(t)();
  openAndClose();

  assertEqual(opened, [true, true, true]);
});

test("a pointer passes through SQL with sqlite3_bind_pointer, sqlite3_value_pointer and sqlite3_result_pointer, and SQLite calls their destructors", async () => {
  const t = await setupCallbacks();
  // The type strings must outlive the pointers.
  const type = t.cString("evolu-test");
  const otherType = t.cString("other");
  const bound = 100 as WasmPtr;
  const returned = 200 as WasmPtr;
  const events: Array<unknown> = [];
  const [xFunc, xBoundDestructor, xReturnedDestructor] = t.install([
    {
      signature: "v(pip)",
      fn: (context: SqliteContextPtr, _argc: number, argv: WasmPtr) => {
        const value = t.readPtr(argv) as SqliteValuePtr;
        events.push([
          "received",
          sqlite3_value_pointer(t)(value, type),
          sqlite3_value_pointer(t)(value, otherType),
          sqlite3_value_type(t)(value),
        ]);
        sqlite3_result_pointer(t)(context, returned, type, xReturnedDestructor);
      },
    },
    {
      signature: "v(p)",
      fn: (ptr: number) => {
        events.push(["bound destroyed", ptr]);
      },
    },
    {
      signature: "v(p)",
      fn: (ptr: number) => {
        events.push(["returned destroyed", ptr]);
      },
    },
  ]);
  assertEqual(
    sqlite3_create_function_v2(t)(
      t.db,
      t.cString("passthrough"),
      1,
      SQLITE_UTF8,
      0,
      xFunc,
      0,
      0,
      0,
    ),
    SQLITE_OK,
  );
  const stmt = t.prepare("select passthrough(?)");

  assertEqual(
    sqlite3_bind_pointer(t)(stmt, 1, bound, type, xBoundDestructor),
    SQLITE_OK,
  );
  assertEqual(sqlite3_step(t)(stmt), SQLITE_ROW);
  const column = sqlite3_column_value(t)(stmt, 0);
  events.push([
    "column",
    sqlite3_value_pointer(t)(column, type),
    sqlite3_column_type(t)(stmt, 0),
  ]);
  assertEqual(sqlite3_finalize(t)(stmt), SQLITE_OK);

  assertEqual(events, [
    ["received", bound, 0, SQLITE_NULL],
    ["column", returned, SQLITE_NULL],
    ["returned destroyed", returned],
    ["bound destroyed", bound],
  ]);
});

test("SQLite calls an installed destructor of bound text once it no longer needs the memory", async () => {
  const t = await setupCallbacks();
  const destroyed: Array<number> = [];
  const [xDestructor] = t.install([
    {
      signature: "v(p)",
      fn: (ptr: SqliteOwnedPtr) => {
        destroyed.push(ptr);
        sqlite3_free(t)(ptr);
      },
    },
  ]);
  const stmt = t.prepare("select ?");
  const text = new TextEncoder().encode("borrowed");
  const first = t.allocBytes(text);
  const second = t.allocBytes(text);

  assertEqual(
    sqlite3_bind_text(t)(stmt, 1, first, text.length, xDestructor),
    SQLITE_OK,
  );
  assertEqual(sqlite3_step(t)(stmt), SQLITE_ROW);
  assertEqual(t.columnText(stmt, 0), "borrowed");
  assertEqual(destroyed, []);
  assertEqual(sqlite3_reset(t)(stmt), SQLITE_OK);
  assertEqual(
    sqlite3_bind_text(t)(stmt, 1, second, text.length, xDestructor),
    SQLITE_OK,
  );
  assertEqual(destroyed, [first]);
  assertEqual(sqlite3_finalize(t)(stmt), SQLITE_OK);

  assertEqual(destroyed, [first, second]);
});
