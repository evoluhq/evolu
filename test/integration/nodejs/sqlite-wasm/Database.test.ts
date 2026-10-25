import {
  assertEqual,
  assertErr,
  assertFalse,
  assertInstanceOf,
  assertOk,
  assertSame,
  assertThrows,
  assertTrue,
  assertType,
  EncryptionKey,
  err,
  exhaustiveCheck,
  FiniteNumber,
  getOrThrow,
  ok,
  trySync,
  type Result,
  type SqliteRow,
  type SqliteValue,
  type SqliteValueInput,
  type TestRunDefaultDeps,
} from "@evolu/common";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { setFlagsFromString } from "node:v8";
import { runInNewContext } from "node:vm";
import type { SqliteCExports } from "../../../../packages/sqlite-wasm/src/CApi.ts";
import type { EvoluCExports } from "../../../../packages/sqlite-wasm/src/EvoluCApi.ts";
import {
  sqlite3_auto_extension,
  sqlite3_collation_needed,
  sqlite3_create_collation_v2,
  sqlite3_create_function_v2,
  sqlite3_deserialize,
  sqlite3_finalize,
  sqlite3_free,
  sqlite3_limit,
  sqlite3_prepare_v3,
  sqlite3_reset_auto_extension,
  sqlite3_result_int,
  sqlite3_trace_v2,
} from "../../../../packages/sqlite-wasm/src/CApi.ts";
import {
  SQLITE_CANTOPEN,
  SQLITE_CONSTRAINT,
  SQLITE_CONSTRAINT_FOREIGNKEY,
  SQLITE_CONSTRAINT_NOTNULL,
  SQLITE_DESERIALIZE_FREEONCLOSE,
  SQLITE_DONE,
  SQLITE_ERROR,
  SQLITE_IOERR,
  SQLITE_IOERR_WRITE,
  SQLITE_LIMIT_LENGTH,
  SQLITE_LIMIT_SQL_LENGTH,
  SQLITE_NOMEM,
  SQLITE_OK,
  SQLITE_OPEN_CREATE,
  SQLITE_OPEN_EXRESCODE,
  SQLITE_OPEN_MAIN_DB,
  SQLITE_OPEN_READWRITE,
  SQLITE_PREPARE_PERSISTENT,
  SQLITE_TOOBIG,
  SQLITE_TRACE_PROFILE,
  SQLITE_TRANSIENT,
  SQLITE_UTF8,
  SQLITE_WASM_DEALLOC,
  sqlite3_io_methods_layout,
  type SqliteDataType,
} from "../../../../packages/sqlite-wasm/src/Constants.ts";
import {
  createSqliteDatabase,
  sqliteResultCodeToPrimary,
  SqliteVfsPath,
  type SqliteDatabaseOptions,
  type SqliteError,
  type SqliteOperation,
  type SqliteRunResult,
} from "../../../../packages/sqlite-wasm/src/Database.ts";
import {
  allocCString,
  allocWasm,
  readCString,
  readUtf8,
  writeWasmBytes,
} from "../../../../packages/sqlite-wasm/src/Memory.ts";
import type {
  CStringPtr,
  SqliteContextPtr,
  SqliteDbPtr,
  SqliteDestructor,
  SqliteOwnedPtr,
  SqliteStmtPtr,
  WasmPtr,
} from "../../../../packages/sqlite-wasm/src/Pointer.ts";
import {
  installWasmFunctions,
  type SqliteWasm,
} from "../../../../packages/sqlite-wasm/src/Wasm.ts";
import { setupSahPool } from "./_sahPool.ts";
import {
  setupDatabase,
  setupMemoryUsed,
  setupSqliteWasm,
  trapEveryOpen,
} from "./_sqliteWasm.ts";

/** Numbers bind as a {@link FiniteNumber}, as {@link SqliteValue} requires. */
const number = (value: number): FiniteNumber => FiniteNumber.orThrow(value);

/** Opens a Memory database on a fresh instance. */
const setupSqliteDatabase = async () => {
  const deps = await setupSqliteWasm();
  const database = getOrThrow(createSqliteDatabase(deps)({ type: "Memory" }));
  return { ...deps, database };
};

/**
 * A fresh instance whose exports are replaced by the given ones, which can
 * record calls or inject failures around the original exports.
 */
const setupSqliteWasmWith = async (
  overrides: (
    sqliteWasm: SqliteWasm,
  ) => Partial<SqliteCExports & EvoluCExports>,
) => {
  const deps = await setupSqliteWasm();
  const { sqliteWasm } = deps;
  return {
    ...deps,
    sqliteWasm: {
      ...sqliteWasm,
      exports: { ...sqliteWasm.exports, ...overrides(sqliteWasm) },
    },
  };
};

/**
 * A fresh instance whose heap views throw what an engine throws when it cannot
 * allocate, for a copy (`slice`) or a view to decode (`subarray`) longer than
 * the limit `failCopiesAbove` sets, which is unlimited until then.
 */
const setupSqliteWasmWithFailingCopies = async () => {
  const deps = await setupSqliteWasm();
  let limit = Infinity;
  const { getHeapU8 } = deps.sqliteWasm;
  const sqliteWasm: SqliteWasm = {
    ...deps.sqliteWasm,
    getHeapU8: () => {
      const { buffer } = getHeapU8();
      const view = new Uint8Array(buffer);
      const heap = new Uint8Array(buffer);
      // V8 and JavaScriptCore throw a RangeError for an ArrayBuffer they
      // cannot allocate, and Node.js's TextDecoder an Error for a string
      // longer than V8's limit.
      heap.slice = (start = 0, end = heap.length) => {
        if (end - start > limit)
          throw new RangeError("Array buffer allocation failed");
        return view.slice(start, end);
      };
      heap.subarray = (start = 0, end = heap.length) => {
        if (end - start > limit)
          throw Object.assign(
            new Error(
              "Cannot create a string longer than 0x1fffffe8 characters",
            ),
            { code: "ERR_STRING_TOO_LONG" },
          );
        return view.subarray(start, end);
      };
      return heap;
    },
  };
  return {
    ...deps,
    sqliteWasm,
    failCopiesAbove: (byteLength: number) => {
      limit = byteLength;
    },
  };
};

/** Asserts that the call throws because its object was disposed. */
const assertThrowsDisposed = (run: () => unknown): void => {
  assertThrows(run, (thrown) => {
    assertInstanceOf(thrown, Error);
    assertEqual(thrown.message, "Cannot use a disposed object.");
  });
};

// wa-sqlite test/api_exec.js 'should allow a transaction to span multiple
// calls'.
test("a transaction spans exec calls, and isAutocommit reports whether one is open", async () => {
  const { database } = await setupSqliteDatabase();

  assertTrue(database.isAutocommit());
  assertOk(database.exec("BEGIN TRANSACTION"));
  assertFalse(database.isAutocommit());
  assertOk(
    database.exec(`
      CREATE TABLE t AS
      WITH RECURSIVE cnt(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM cnt LIMIT 100)
      SELECT x FROM cnt
    `),
  );
  assertFalse(database.isAutocommit());
  assertOk(database.exec("COMMIT"));
  assertTrue(database.isAutocommit());
});

test("createSqliteDatabase opens :memory: on the default VFS with READWRITE, CREATE and EXRESCODE", async () => {
  const opens: Array<readonly [string, number, number]> = [];
  const deps = await setupSqliteWasmWith((sqliteWasm) => ({
    sqlite3_open_v2: (filename, ppDb, flags, zVfs) => {
      opens.push([readCString({ sqliteWasm })(filename), flags, zVfs]);
      return sqliteWasm.exports.sqlite3_open_v2(filename, ppDb, flags, zVfs);
    },
  }));

  assertOk(createSqliteDatabase(deps)({ type: "Memory" }));

  assertEqual(opens, [
    [
      ":memory:",
      SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE | SQLITE_OPEN_EXRESCODE,
      0,
    ],
  ]);
});

test("a Memory database has Evolu's SQL functions, which evolu_core_register registers", async () => {
  const { database } = await setupSqliteDatabase();

  assertEqual(
    getOrThrow(database.run("SELECT evolu_core_version() AS version", [])).rows,
    [{ version: 1 }],
  );
});

// The core's SHA-256 runs only there. SahPoolEncryption.test.ts checks the
// codec's AES-256, HMAC-SHA512 and PBKDF2-HMAC-SHA512 against node:crypto.
test("evolu_skiplist_fingerprints fingerprints each timestamp with the first 12 bytes of its SHA-256, as node:crypto computes it", async () => {
  const { database } = await setupSqliteDatabase();
  // The table and index Storage.ts of @evolu/common creates.
  assertOk(
    database.exec(
      'CREATE TABLE evolu_timestamp ("ownerId" BLOB NOT NULL, "t" BLOB NOT NULL, "h1" INTEGER, "h2" INTEGER, "c" INTEGER, "l" INTEGER NOT NULL, PRIMARY KEY ("ownerId", "t")) STRICT; CREATE INDEX evolu_timestamp_index ON evolu_timestamp ("ownerId", "l", "t", "h1", "h2", "c")',
    ),
  );
  const owner = new Uint8Array(16).fill(1);
  const timestamps = [0, 1, 2].map((index) =>
    Uint8Array.from({ length: 16 }, (_, byte) => index * 16 + byte),
  );
  assertOk(database.exec("BEGIN"));
  for (const timestamp of timestamps)
    assertEqual(
      getOrThrow(
        database.run("SELECT evolu_skiplist_insert(?, ?, 1) AS inserted", [
          owner,
          timestamp,
        ]),
      ).rows,
      [{ inserted: 1 }],
    );
  assertOk(database.exec("COMMIT"));
  // A bucket per timestamp, as big-endian 8-byte counts.
  const buckets = new Uint8Array(8 * timestamps.length);
  for (const index of timestamps.keys())
    new DataView(buckets.buffer).setBigUint64(8 * index, BigInt(index + 1));

  const { rows } = getOrThrow(
    database.run("SELECT evolu_skiplist_fingerprints(?, ?) AS records", [
      owner,
      buckets,
    ]),
  );

  // Each record is the fingerprint of its bucket's timestamp and the next
  // timestamp, or zeros after the last.
  assertEqual(rows, [
    {
      records: Uint8Array.from(
        timestamps.flatMap((timestamp, index) => [
          ...createHash("sha256").update(timestamp).digest().subarray(0, 12),
          ...(timestamps[index + 1] ?? new Uint8Array(16)),
        ]),
      ),
    },
  ]);
});

test("Memory, File and EncryptedFile databases are defensive, so SQL can't write their schema, even with PRAGMA writable_schema on, which they ignore", async () => {
  const t = await setupSahPool();

  const databases: ReadonlyArray<SqliteDatabaseOptions> = [
    { type: "Memory" },
    { type: "File", vfs: t.pool, path: SqliteVfsPath.orThrow("/plain.db") },
    {
      type: "EncryptedFile",
      vfs: t.pool,
      path: SqliteVfsPath.orThrow("/encrypted.db"),
      key: EncryptionKey.orThrow(new Uint8Array(32).fill(7)),
    },
  ];
  const results = databases.map((options) => {
    const database = getOrThrow(createSqliteDatabase(t)(options));
    assertOk(database.exec("CREATE TABLE t(a); PRAGMA writable_schema = ON"));
    const updated = database.exec(
      "UPDATE sqlite_schema SET sql = 'CREATE TABLE t(b)' WHERE name = 't'",
    );
    database[Symbol.dispose]();
    return !updated.ok && updated.error.type === "SqliteError"
      ? updated.error.message
      : updated;
  });

  assertEqual(results, [
    "table sqlite_master may not be modified",
    "table sqlite_master may not be modified",
    "table sqlite_master may not be modified",
  ]);
});

/**
 * Creates Storage.ts's skiplist table and runs a function that keeps
 * statements.
 */
const skiplistInsertSql =
  'CREATE TABLE evolu_timestamp ("ownerId" BLOB NOT NULL, "t" BLOB NOT NULL, "h1" INTEGER, "h2" INTEGER, "c" INTEGER, "l" INTEGER NOT NULL, PRIMARY KEY ("ownerId", "t")) STRICT; CREATE INDEX evolu_timestamp_index ON evolu_timestamp ("ownerId", "l", "t", "h1", "h2", "c"); BEGIN; SELECT evolu_skiplist_insert(zeroblob(16), zeroblob(16), 2); COMMIT';

test("disposing a database whose skiplist functions ran finalizes the statements they keep with evolu_skiplist_finalize before sqlite3_close_v2, as the native close does, and frees its memory", async () => {
  const calls: Array<string> = [];
  const deps = await setupSqliteWasmWith((sqliteWasm) => {
    const exports = sqliteWasm.exports as SqliteCExports & EvoluCExports;
    return {
      evolu_skiplist_finalize: (db) => {
        calls.push("evolu_skiplist_finalize");
        exports.evolu_skiplist_finalize(db);
      },
      sqlite3_close_v2: (db) => {
        calls.push("sqlite3_close_v2");
        return exports.sqlite3_close_v2(db);
      },
    };
  });
  const memoryUsed = setupMemoryUsed(deps);
  // The first open allocates SQLite's global state, which stays.
  getOrThrow(createSqliteDatabase(deps)({ type: "Memory" }))[Symbol.dispose]();
  calls.length = 0;
  const baseline = memoryUsed();
  const database = getOrThrow(createSqliteDatabase(deps)({ type: "Memory" }));
  assertOk(database.exec(skiplistInsertSql));
  assertEqual(
    getOrThrow(
      database.run("SELECT evolu_skiplist_size(zeroblob(16)) AS size", []),
    ).rows,
    [{ size: 1 }],
  );

  database[Symbol.dispose]();

  assertEqual(calls, ["evolu_skiplist_finalize", "sqlite3_close_v2"]);
  assertEqual(memoryUsed(), baseline);
});

test("a Memory database whose evolu_core_register fails, as sqlite3_create_function_v2 can, fails to open with the returned code and closes the connection, leaking nothing", async () => {
  let isFailing = false;
  let closeCount = 0;
  const deps = await setupSqliteWasmWith((sqliteWasm) => ({
    evolu_core_register: (db) =>
      isFailing
        ? SQLITE_NOMEM
        : (
            sqliteWasm.exports as SqliteCExports & EvoluCExports
          ).evolu_core_register(db),
    sqlite3_close_v2: (db) => {
      closeCount++;
      return sqliteWasm.exports.sqlite3_close_v2(db);
    },
  }));
  const memoryUsed = setupMemoryUsed(deps);
  // The first open allocates SQLite's global state, which stays.
  getOrThrow(createSqliteDatabase(deps)({ type: "Memory" }))[Symbol.dispose]();
  closeCount = 0;
  const baseline = memoryUsed();
  isFailing = true;

  const opened = createSqliteDatabase(deps)({ type: "Memory" });

  assertErr(opened, {
    type: "SqliteError",
    operation: "open",
    extendedCode: SQLITE_NOMEM,
    message: "out of memory",
    sqlOffset: null,
    cause: null,
  });
  assertEqual(closeCount, 1);
  assertEqual(memoryUsed(), baseline);
});

// tester1.c-pp.js 'sqlite3.oo1' 'Close db'.
test("disposing a database closes it once and frees its memory, and using it afterwards throws", async () => {
  let closeCount = 0;
  const deps = await setupSqliteWasmWith((sqliteWasm) => ({
    sqlite3_close_v2: (db) => {
      closeCount++;
      return sqliteWasm.exports.sqlite3_close_v2(db);
    },
  }));
  const memoryUsed = setupMemoryUsed(deps);
  // The first open allocates SQLite's global state, which stays.
  getOrThrow(createSqliteDatabase(deps)({ type: "Memory" }))[Symbol.dispose]();
  closeCount = 0;
  const baseline = memoryUsed();
  const database = getOrThrow(createSqliteDatabase(deps)({ type: "Memory" }));
  assertOk(database.exec("CREATE TABLE t(a); INSERT INTO t VALUES (1);"));

  database[Symbol.dispose]();
  database[Symbol.dispose]();

  assertEqual(closeCount, 1);
  assertEqual(memoryUsed(), baseline);
  assertThrowsDisposed(() => database.exec("SELECT 1"));
  assertThrowsDisposed(() => database.isAutocommit());
});

// wa-sqlite test/sqlite-api-open.test.js.
test("a failed open fails with SQLite's error, read before sqlite3_close_v2 closes the handle SQLite returned", async () => {
  let failOpen = false;
  const opened: Array<SqliteDbPtr> = [];
  const closed: Array<SqliteDbPtr | 0> = [];
  const deps = await setupSqliteWasmWith((sqliteWasm) => {
    // The default VFS has no files, so opening a path fails.
    const path = getOrThrow(allocCString({ sqliteWasm })("/missing.db"));
    return {
      sqlite3_open_v2: (filename, ppDb, flags, zVfs) => {
        const rc = sqliteWasm.exports.sqlite3_open_v2(
          failOpen ? path : filename,
          ppDb,
          flags,
          zVfs,
        );
        opened.push(
          sqliteWasm.getHeapDataView().getUint32(ppDb, true) as SqliteDbPtr,
        );
        return rc;
      },
      sqlite3_close_v2: (db) => {
        closed.push(db);
        return sqliteWasm.exports.sqlite3_close_v2(db);
      },
    };
  });
  const memoryUsed = setupMemoryUsed(deps);
  getOrThrow(createSqliteDatabase(deps)({ type: "Memory" }))[Symbol.dispose]();
  const baseline = memoryUsed();
  failOpen = true;

  const result = createSqliteDatabase(deps)({ type: "Memory" });

  assertErr(result, {
    type: "SqliteError",
    operation: "open",
    extendedCode: SQLITE_CANTOPEN,
    message: "unable to open database file",
    sqlOffset: null,
    cause: null,
  });
  assertTrue(opened[1] !== 0);
  assertEqual(closed, opened);
  assertEqual(memoryUsed(), baseline);
});

test("a failed open that returns a handle fails with SQLite's message, not the result code's description", async () => {
  const deps = await setupSqliteWasmWith((sqliteWasm) => {
    const vfs = getOrThrow(allocCString({ sqliteWasm })("nope"));
    return {
      sqlite3_open_v2: (filename, ppDb, flags) =>
        sqliteWasm.exports.sqlite3_open_v2(filename, ppDb, flags, vfs),
    };
  });

  // The description of SQLITE_ERROR is "SQL logic error".
  assertErr(createSqliteDatabase(deps)({ type: "Memory" }), {
    type: "SqliteError",
    operation: "open",
    extendedCode: SQLITE_ERROR,
    message: "no such vfs: nope",
    sqlOffset: null,
    cause: null,
  });
});

test("an open that returns no handle fails with the result code's description", async () => {
  const closed: Array<SqliteDbPtr | 0> = [];
  const deps = await setupSqliteWasmWith((sqliteWasm) => ({
    // As when sqlite3_initialize, which the open calls, fails.
    sqlite3_open_v2: (_filename, ppDb) => {
      sqliteWasm.getHeapDataView().setUint32(ppDb, 0, true);
      return SQLITE_ERROR;
    },
    sqlite3_close_v2: (db) => {
      closed.push(db);
      return sqliteWasm.exports.sqlite3_close_v2(db);
    },
  }));

  const result = createSqliteDatabase(deps)({ type: "Memory" });

  assertErr(result, {
    type: "SqliteError",
    operation: "open",
    extendedCode: SQLITE_ERROR,
    message: "SQL logic error",
    sqlOffset: null,
    cause: null,
  });
  assertEqual(closed, [0]);
});

test("createSqliteDatabase fails with SQLITE_NOMEM when it cannot allocate its memory, freeing what it allocated", async () => {
  // Its 16 bytes of output parameters, then the filename.
  for (const mallocFails of [
    () => true,
    (byteLength: number) => byteLength !== 16,
  ]) {
    let isFailing = false;
    const deps = await setupSqliteWasmWith((sqliteWasm) => ({
      sqlite3_malloc: (byteLength) =>
        isFailing && mallocFails(byteLength)
          ? 0
          : sqliteWasm.exports.sqlite3_malloc(byteLength),
    }));
    const memoryUsed = setupMemoryUsed(deps);
    getOrThrow(createSqliteDatabase(deps)({ type: "Memory" }))[
      Symbol.dispose
    ]();
    const baseline = memoryUsed();
    isFailing = true;

    const result = createSqliteDatabase(deps)({ type: "Memory" });

    assertErr(result, {
      type: "SqliteError",
      operation: "open",
      extendedCode: SQLITE_NOMEM,
      message: "out of memory",
      sqlOffset: null,
      cause: null,
    });
    assertEqual(memoryUsed(), baseline);
  }
});

// tester1.c-pp.js 'sqlite3.oo1' 'DB.Stmt'.
test("a prepared statement runs, returning its rows as null-prototype objects", async () => {
  const { database } = await setupSqliteDatabase();

  const statement = getOrThrow(database.prepare("select 3 as a"));
  const result = statement.run([]);

  assertEqual(statement.parameterCount, 0);
  assertOk(result);
  assertEqual(result.value, { rows: [{ a: 3 }], changes: 0 });
  assertSame(Object.getPrototypeOf(result.value.rows[0]), null);
});

test("prepare passes SQLITE_PREPARE_PERSISTENT and the SQL's byte length, counting its NUL terminator", async () => {
  const prepares: Array<readonly [string, number, number]> = [];
  const deps = await setupSqliteWasmWith((sqliteWasm) => ({
    sqlite3_prepare_v3: (db, zSql, nByte, prepFlags, ppStmt, pzTail) => {
      prepares.push([readUtf8({ sqliteWasm })(zSql, nByte), nByte, prepFlags]);
      return sqliteWasm.exports.sqlite3_prepare_v3(
        db,
        zSql,
        nByte,
        prepFlags,
        ppStmt,
        pzTail,
      );
    },
  }));
  const database = getOrThrow(createSqliteDatabase(deps)({ type: "Memory" }));
  const sql = "select 'kůň' as a";

  assertOk(database.prepare(sql));

  assertEqual(prepares, [
    [
      `${sql}\0`,
      new TextEncoder().encode(sql).length + 1,
      SQLITE_PREPARE_PERSISTENT,
    ],
  ]);
});

test("prepare, run and exec take SQL whose UTF-8 is longer than its UTF-16 length", async () => {
  const { database } = await setupSqliteDatabase();
  // Two bytes per character in UTF-8.
  const text = "ž".repeat(5000);
  const sql = `select '${text}' as a`;
  const expected = ok({ rows: [{ a: text }], changes: 0 });

  assertEqual(getOrThrow(database.prepare(sql)).run([]), expected);
  assertEqual(database.run(sql, []), expected);
  assertOk(database.exec(sql));
  assertEqual(
    database.run("select 'ř' as b", []),
    ok({ rows: [{ b: "ř" }], changes: 0 }),
  );
});

// tester1.c-pp.js 'sqlite3.oo1' 'DB.Stmt' and 'Table t', and wa-sqlite
// test/api_statements.js 'should bind collection array'.
test("run reads each column by its type, integers beyond 2^53 rounded and a BLOB into its own ArrayBuffer", async () => {
  const { database } = await setupSqliteDatabase();
  const statement = getOrThrow(
    database.prepare(`
      select
        42 as integer,
        ${Number.MIN_SAFE_INTEGER} as minSafe,
        9007199254740993 as rounded,
        0.5 as float,
        'kůň' as text,
        x'0102' as blob,
        null as missing
    `),
  );

  const result = statement.run([]);

  assertOk(result);
  const [row] = result.value.rows;
  assertEqual(row, {
    integer: 42,
    minSafe: Number.MIN_SAFE_INTEGER,
    rounded: 2 ** 53,
    float: 0.5,
    text: "kůň",
    blob: Uint8Array.of(1, 2),
    missing: null,
  });
  assertInstanceOf(row?.blob, Uint8Array);
  assertEqual(row.blob.byteOffset, 0);
  assertEqual(row.blob.buffer.byteLength, 2);
});

test("prepare fails with SQLite's error and the byte offset in the UTF-8 SQL where SQLite detected it", async () => {
  const { database } = await setupSqliteDatabase();

  // 'kůň' takes 7 bytes but 5 UTF-16 code units.
  assertErr(database.prepare("select 'kůň', nope"), {
    type: "SqliteError",
    operation: "prepare",
    extendedCode: SQLITE_ERROR,
    message: "no such column: nope",
    sqlOffset: 16,
    cause: null,
  });
  assertErr(database.prepare("selec 1"), {
    type: "SqliteError",
    operation: "prepare",
    extendedCode: SQLITE_ERROR,
    message: 'near "selec": syntax error',
    sqlOffset: 0,
    cause: null,
  });
});

// tester1.c-pp.js 'sqlite3.oo1' 'Table t'.
test("prepare fails with SqliteEmptySqlError for SQL without a statement", async () => {
  const { database } = await setupSqliteDatabase();

  for (const sql of ["", " \n\t", "/*empty SQL*/", "-- comment\n", ";"])
    assertErr(database.prepare(sql), { type: "SqliteEmptySqlError" });
});

// tester1.c-pp.js 'sqlite3.oo1' 'Table t' and wa-sqlite test/api_exec.js
// 'should execute multiple queries'.
test("prepare fails with SqliteMultipleStatementsError for SQL with more than one statement, finalizing what it prepared", async () => {
  const deps = await setupSqliteWasm();
  const memoryUsed = setupMemoryUsed(deps);
  const database = getOrThrow(createSqliteDatabase(deps)({ type: "Memory" }));
  // As SQLite's tokenizer reads them: "/*" needs a byte after it and then
  // runs to "*/" or the end, \v continues a space but cannot start one, and a
  // UTF-8 byte order mark is a space of its own.
  const rejected = [
    "select 1; select 2",
    "select 1; garbage",
    "select 1; select * from nope",
    "select 1;x",
    "select 1; /*",
    "select 1; -",
    "select 1; /",
    "select 1;\v",
    "select 1;\uFEFF\v",
  ];
  const accepted = [
    "select 1;",
    "select 1; -- tail",
    "select 1; /**/ ;\n",
    "select 1; /* never closed",
    "select 1;/*/",
    "select 1; --",
    "select 1; \v",
    "select 1;\uFEFF",
  ];

  for (const sql of rejected)
    assertErr(database.prepare(sql), {
      type: "SqliteMultipleStatementsError",
    });
  for (const sql of accepted) {
    const statement = database.prepare(sql);
    assertOk(statement);
    assertEqual(statement.value.run([]), ok({ rows: [{ 1: 1 }], changes: 0 }));
    statement.value[Symbol.dispose]();
  }
  const used = memoryUsed();
  for (let index = 0; index < 50; index++)
    for (const sql of rejected) database.prepare(sql);
  assertEqual(memoryUsed(), used);
});

test("prepare and run detect a second statement without preparing it, so a pragma in it, which SQLite applies when it prepares it, takes no effect", async () => {
  const { database } = await setupSqliteDatabase();
  assertOk(
    database.exec(`
      pragma foreign_keys = on;
      create table parent(id integer primary key);
      create table child(parentId references parent(id));
    `),
  );

  // SQLite applies the pragma also when the rest does not parse.
  for (const sql of [
    "select 1; pragma foreign_keys = off",
    "select 1; pragma foreign_keys = off garbage",
  ]) {
    assertErr(database.prepare(sql), {
      type: "SqliteMultipleStatementsError",
    });
    assertErr(database.run(sql, []), {
      type: "SqliteMultipleStatementsError",
    });
  }

  assertEqual(
    database.run("pragma foreign_keys", []),
    ok({ rows: [{ foreign_keys: 1 }], changes: 0 }),
  );
  assertErr(database.run("insert into child values (1)", []), {
    type: "SqliteError",
    operation: "step",
    extendedCode: SQLITE_CONSTRAINT_FOREIGNKEY,
    message: "FOREIGN KEY constraint failed",
    sqlOffset: null,
    cause: null,
  });
  // A pragma in the first statement takes effect, as SQLite documents.
  assertErr(database.prepare("pragma foreign_keys = off; select 1"), {
    type: "SqliteMultipleStatementsError",
  });
  assertEqual(
    database.run("pragma foreign_keys", []),
    ok({ rows: [{ foreign_keys: 0 }], changes: 0 }),
  );
});

test("prepare keeps TEMP tables when it rejects a second statement that sets temp_store, which drops them when SQLite prepares it", async () => {
  const { database } = await setupSqliteDatabase();
  assertOk(database.exec("create temp table t(a); insert into t values (1)"));

  assertErr(database.prepare("select 1; pragma temp_store = file"), {
    type: "SqliteMultipleStatementsError",
  });

  assertEqual(
    database.run("select a from temp.t", []),
    ok({ rows: [{ a: 1 }], changes: 0 }),
  );
});

test("prepare detects a second statement as SQLite's tokenizer does, for every tail of up to five separator characters and random tails", async () => {
  const t = await setupDatabase();
  const database = getOrThrow(createSqliteDatabase(t)({ type: "Memory" }));
  // SQLite's verdict, from preparing the tail on another connection.
  const hasStatement = (tail: string): boolean => {
    const zSql = getOrThrow(allocCString(t)(tail));
    const rc = sqlite3_prepare_v3(t)(t.db, zSql, -1, 0, t.scratch.out, 0);
    const stmt = t.readPtr(t.scratch.out) as SqliteStmtPtr;
    sqlite3_finalize(t)(stmt);
    sqlite3_free(t)(zSql);
    return rc !== SQLITE_OK || stmt !== 0;
  };
  const mismatches: Array<string> = [];
  const check = (tail: string): void => {
    const prepared = database.prepare(`select 1;${tail}`);
    if (prepared.ok) prepared.value[Symbol.dispose]();
    else assertEqual(prepared.error, { type: "SqliteMultipleStatementsError" });
    if (prepared.ok === hasStatement(tail)) mismatches.push(tail);
  };
  // Each character that starts or continues a separator, and one that does not.
  const characters = [
    " ",
    "\t",
    "\n",
    "\v",
    "\f",
    "\r",
    ";",
    "-",
    "/",
    "*",
    "\uFEFF",
    "x",
  ];
  const checkEvery = (tail: string, length: number): void => {
    check(tail);
    if (length > 0)
      for (const character of characters)
        checkEvery(tail + character, length - 1);
  };
  // \uFEFE is a byte order mark but for its last byte.
  const moreCharacters = [
    ...characters,
    "é",
    "\u00A0",
    "\uFEFE",
    "\u0001",
    "\u001F",
    "\u007F",
    "'",
    '"',
    "1",
  ];

  checkEvery("", 5);
  for (let index = 0; index < 50_000; index++) {
    let tail = "";
    for (let length = Math.floor(t.random.next() * 12); length > 0; length--)
      tail +=
        moreCharacters[Math.floor(t.random.next() * moreCharacters.length)];
    check(tail);
  }

  assertEqual(mismatches, []);
});

test("prepare, run and exec fail with SqliteInvalidSqlTextError for SQL with a NUL character, which SQLite would read only up to, or a lone surrogate, which UTF-8 cannot encode, and run nothing", async () => {
  const { database } = await setupSqliteDatabase();
  const invalidSql = [
    "select 1;\0select 2",
    "select 'a\0b'",
    "select '\uD800'",
    "select 'a\uDBFFb'",
    "select '\uDC00'",
    // A surrogate pair in the wrong order is two lone surrogates.
    "select '\uDE00\uD83D'",
    "create table a(x);\0create table b(x)",
    "create table a(x); create table \uD800(x)",
  ];

  const results = invalidSql.map((sql) =>
    [database.prepare(sql), database.run(sql, []), database.exec(sql)].map(
      (result) => (result.ok ? "ok" : result.error),
    ),
  );

  assertEqual(
    results,
    invalidSql.map(() => [
      { type: "SqliteInvalidSqlText" },
      { type: "SqliteInvalidSqlText" },
      { type: "SqliteInvalidSqlText" },
    ]),
  );
  assertEqual(
    getOrThrow(database.prepare("select name from sqlite_schema")).run([]),
    ok({ rows: [], changes: 0 }),
  );
  assertEqual(
    database.run("select '😀' as a", []),
    ok({ rows: [{ a: "😀" }], changes: 0 }),
  );
});

// wa-sqlite discussion #186: bindings survive a reset.
test("run fails with SqliteParameterCountError unless it supplies every parameter, named ones included", async () => {
  const { database } = await setupSqliteDatabase();
  // :a is one parameter, however often it appears.
  const statement = getOrThrow(database.prepare("select :a, :a, ?"));

  assertEqual(statement.parameterCount, 2);
  assertErr(statement.run([null]), {
    type: "SqliteParameterCountError",
    expected: 2,
    actual: 1,
  });
  assertErr(statement.run([null, null, null]), {
    type: "SqliteParameterCountError",
    expected: 2,
    actual: 3,
  });
  assertEqual(
    statement.run([number(1), number(2)]),
    // The second :a column has the same name, so it replaces the first.
    ok({ rows: [{ ":a": 1, "?": 2 }], changes: 0 }),
  );
  // No value is left over from the run before.
  assertErr(statement.run([]), {
    type: "SqliteParameterCountError",
    expected: 2,
    actual: 0,
  });
});

// wa-sqlite test/api_statements.js 'should bind ...' and Evolu's integer
// boundaries (wa-sqlite #66) and empty values (wa-sqlite #168).
test("run binds each value by its type, so integers stay INTEGER and empty text and blobs stay non-NULL", async () => {
  const { database } = await setupSqliteDatabase();
  const statement = getOrThrow(
    database.prepare("select ?1 as value, typeof(?1) as type"),
  );

  for (const [value, expected, type] of [
    [null, null, "null"],
    [number(42), 42, "integer"],
    [number(-0), 0, "integer"],
    [number(2 ** 31), 2 ** 31, "integer"],
    [number(-(2 ** 31)), -(2 ** 31), "integer"],
    [number(2 ** 31 - 1), 2 ** 31 - 1, "integer"],
    [number(-(2 ** 31) - 1), -(2 ** 31) - 1, "integer"],
    [number(Number.MAX_SAFE_INTEGER), Number.MAX_SAFE_INTEGER, "integer"],
    [number(Number.MIN_SAFE_INTEGER), Number.MIN_SAFE_INTEGER, "integer"],
    [number(Math.PI), Math.PI, "real"],
    [number(2 ** 60), 2 ** 60, "real"],
    ["kůň", "kůň", "text"],
    ["", "", "text"],
    [Uint8Array.of(1, 2, 3), Uint8Array.of(1, 2, 3), "blob"],
    [new Uint8Array(0), new Uint8Array(0), "blob"],
  ] satisfies ReadonlyArray<readonly [SqliteValue, SqliteValueInput, string]>)
    assertEqual(
      statement.run([value]),
      ok({ rows: [{ value: expected, type }], changes: 0 }),
    );
});

test("run binds a 32-bit integer with sqlite3_bind_int, without a BigInt, and another safe integer with sqlite3_bind_int64", async () => {
  const binds: Array<readonly [string, number | bigint]> = [];
  const deps = await setupSqliteWasmWith((sqliteWasm) => ({
    sqlite3_bind_int: (pStmt, index, value) => {
      binds.push(["sqlite3_bind_int", value]);
      return sqliteWasm.exports.sqlite3_bind_int(pStmt, index, value);
    },
    sqlite3_bind_int64: (pStmt, index, value) => {
      binds.push(["sqlite3_bind_int64", value]);
      return sqliteWasm.exports.sqlite3_bind_int64(pStmt, index, value);
    },
  }));
  const database = getOrThrow(createSqliteDatabase(deps)({ type: "Memory" }));
  const statement = getOrThrow(database.prepare("select ?, ?, ?, ?"));

  assertOk(
    statement.run(
      [2 ** 31 - 1, -(2 ** 31), 2 ** 31, -(2 ** 31) - 1].map(number),
    ),
  );

  assertEqual(binds, [
    ["sqlite3_bind_int", 2 ** 31 - 1],
    ["sqlite3_bind_int", -(2 ** 31)],
    ["sqlite3_bind_int64", 2n ** 31n],
    ["sqlite3_bind_int64", -(2n ** 31n) - 1n],
  ]);
});

// wa-sqlite test/api_statements.js 'should bind text with NUL bytes', PR #348.
test("run binds and reads text by byte length, keeping embedded NUL characters and a leading byte order mark", async () => {
  const { database } = await setupSqliteDatabase();
  const hex = getOrThrow(database.prepare("select hex(?) as hex"));
  const echo = getOrThrow(database.prepare("select ? as text"));

  assertEqual(
    hex.run(["Before\0After"]),
    ok({ rows: [{ hex: "4265666F7265004166746572" }], changes: 0 }),
  );
  for (const text of ["﻿a\0b", "﻿", "a\0"])
    assertEqual(echo.run([text]), ok({ rows: [{ text }], changes: 0 }));
  assertEqual(
    getOrThrow(
      database.prepare(
        "select 'x' || char(0) || 'y' as nul, char(65279) || 'a' as bom",
      ),
    ).run([]),
    ok({ rows: [{ nul: "x\0y", bom: "﻿a" }], changes: 0 }),
  );
});

// SqliteValue's String allows a lone surrogate, which better-sqlite3 binds as
// U+FFFD too.
test("run binds a string parameter's lone surrogate, which UTF-8 cannot encode, as U+FFFD", async () => {
  const { database } = await setupSqliteDatabase();
  const echo = getOrThrow(database.prepare("select ? as text, hex(?) as hex"));

  for (const [text, expected, hex] of [
    ["a\uD800b", "a\uFFFDb", "61EFBFBD62"],
    ["\uDC00", "\uFFFD", "EFBFBD"],
    // A surrogate pair in the wrong order is two lone surrogates.
    ["\uDE00\uD83D", "\uFFFD\uFFFD", "EFBFBDEFBFBD"],
    // Above 64 KiB, which binds from its own allocation.
    [
      `${"x".repeat(30_000)}\uD800`,
      `${"x".repeat(30_000)}\uFFFD`,
      `${"78".repeat(30_000)}EFBFBD`,
    ],
  ] as const)
    assertEqual(
      echo.run([text, text]),
      ok({ rows: [{ text: expected, hex }], changes: 0 }),
    );
  assertEqual(
    database.run("select ? as text", ["a\uD800b"]),
    ok({ rows: [{ text: "a\uFFFDb" }], changes: 0 }),
  );
});

test("run binds text whose UTF-8 is longer than the scratch memory held, and the database then closes cleanly", async () => {
  const deps = await setupSqliteWasm();
  const memoryUsed = setupMemoryUsed(deps);
  getOrThrow(createSqliteDatabase(deps)({ type: "Memory" }))[Symbol.dispose]();
  const baseline = memoryUsed();
  const database = getOrThrow(createSqliteDatabase(deps)({ type: "Memory" }));
  const statement = getOrThrow(database.prepare("select ? as a"));
  // Two bytes per character in UTF-8, below the 64 KiB bound of the scratch
  // memory.
  const first = "ž".repeat(5000);
  const second = "ř".repeat(5000);

  assertEqual(statement.run([first]), ok({ rows: [{ a: first }], changes: 0 }));
  assertEqual(
    database.run("select ? as b", [second]),
    ok({ rows: [{ b: second }], changes: 0 }),
  );
  statement[Symbol.dispose]();
  database[Symbol.dispose]();
  assertEqual(memoryUsed(), baseline);
});

// wa-sqlite #69 and PR #314: views aliasing memory SQLite reuses.
test("run reads each BLOB into its own ArrayBuffer, which later runs do not change", async () => {
  const { database } = await setupSqliteDatabase();
  assertOk(
    database.exec(
      "create table t(b); insert into t values (x'6869'), (x'010203');",
    ),
  );
  const statement = getOrThrow(database.prepare("select b from t order by b"));

  const first = getOrThrow(statement.run([])).rows;
  const second = getOrThrow(statement.run([])).rows;

  const expected = [
    { b: Uint8Array.of(1, 2, 3) },
    { b: Uint8Array.of(0x68, 0x69) },
  ];
  assertEqual(first, expected);
  assertEqual(second, expected);
  for (const { b } of [...first, ...second]) {
    assertInstanceOf(b, Uint8Array);
    assertEqual(b.byteOffset, 0);
    assertEqual(b.buffer.byteLength, b.length);
  }
});

// wa-sqlite test/api_exec.js 'should execute a query', tester1.c-pp.js
// 'sqlite3.oo1' 'selectArray/Object/Values() via INSERT/UPDATE...RETURNING',
// and the driver's 'exec returns changes for writer queries' and 'exec reports
// zero changes for a conflicting insert'.
test("run returns the rows a statement changed, not counting triggers, and 0 for any other statement", async () => {
  const { database } = await setupSqliteDatabase();
  const run = (sql: string, parameters: ReadonlyArray<SqliteValue> = []) =>
    getOrThrow(getOrThrow(database.prepare(sql)).run(parameters));
  assertOk(
    database.exec(`
      create table t(a primary key);
      create table log(a);
      create trigger t_insert after insert on t begin
        insert into log values (new.a);
        insert into log values (new.a);
      end;
    `),
  );

  assertEqual(
    run("insert into t values (?), (?), (?)", [1, 2, 3].map(number)).changes,
    3,
  );
  assertEqual(run("select * from t").changes, 0);
  assertEqual(run("create table u(a)").changes, 0);
  const insertIgnoring = getOrThrow(
    database.prepare("insert into t values (?) on conflict do nothing"),
  );
  assertEqual(getOrThrow(insertIgnoring.run([number(4)])).changes, 1);
  assertEqual(getOrThrow(insertIgnoring.run([number(4)])).changes, 0);
  assertEqual(run("insert into t values (5) returning a * 10 as b"), {
    rows: [{ b: 50 }],
    changes: 1,
  });
  assertEqual(run("update t set a = a + 10 where a > 3 returning a"), {
    rows: [{ a: 14 }, { a: 15 }],
    changes: 2,
  });
  assertEqual(run("delete from t where a < 3").changes, 2);
});

test("run returns 0 changes for a query whose function changes rows, a write's own rows when its function changes rows, and the function's rows for a schema change", async () => {
  const deps = await setupSqliteWasm();
  const name = getOrThrow(allocCString(deps)("write_log"));
  const {
    pointers: [xFunc, xEntryPoint],
  } = installWasmFunctions(deps)([
    {
      signature: "v(pip)",
      // Changes two rows on the same connection and returns NULL.
      fn: () => {
        getOrThrow(database.run("insert into log values (1), (2)", []));
      },
    },
    {
      signature: "i(ppp)",
      fn: (db: SqliteDbPtr) =>
        sqlite3_create_function_v2(deps)(
          db,
          name,
          0,
          SQLITE_UTF8,
          0,
          xFunc,
          0,
          0,
          0,
        ),
    },
  ]);
  assertEqual(sqlite3_auto_extension(deps)(xEntryPoint), SQLITE_OK);
  const database = getOrThrow(createSqliteDatabase(deps)({ type: "Memory" }));
  sqlite3_reset_auto_extension(deps)();
  assertOk(database.exec("create table t(a); create table log(a);"));
  const query = getOrThrow(database.prepare("select write_log() as a"));

  assertEqual(query.run([]), ok({ rows: [{ a: null }], changes: 0 }));
  assertEqual(
    database.run("select write_log() as a", []),
    ok({ rows: [{ a: null }], changes: 0 }),
  );
  assertEqual(
    database.run("insert into t values (write_log())", []),
    ok({ rows: [], changes: 1 }),
  );
  assertEqual(
    database.run("delete from t where a = write_log()", []),
    ok({ rows: [], changes: 0 }),
  );
  // As documented, SQLite cannot tell a schema change from a write here.
  assertEqual(
    database.run("create table u as select write_log() as a", []),
    ok({ rows: [], changes: 2 }),
  );
  assertEqual(
    database.run("select count(*) as n from log", []),
    ok({ rows: [{ n: 10 }], changes: 0 }),
  );
});

// SQLite keeps one count per connection, which a write the profile trace
// callback runs replaces after the statement finished, still within its step.
// better-sqlite3 reads the count the same way but has no sqlite3_stmt_readonly
// check.
test("run returns the count of a write that its statement's profile trace callback runs on the same database, which replaces the statement's own, and 0 for a statement that cannot write", async () => {
  const deps = await setupSqliteWasm();
  let nestedSql: string | null = null;
  const nestedChanges: Array<number> = [];
  const {
    pointers: [xTrace, xEntryPoint],
  } = installWasmFunctions(deps)([
    {
      signature: "i(ippp)",
      fn: () => {
        if (nestedSql != null) {
          const sql = nestedSql;
          nestedSql = null;
          nestedChanges.push(getOrThrow(database.run(sql, [])).changes);
        }
        return 0;
      },
    },
    {
      signature: "i(ppp)",
      fn: (db: SqliteDbPtr) =>
        sqlite3_trace_v2(deps)(db, SQLITE_TRACE_PROFILE, xTrace, 0),
    },
  ]);
  assertEqual(sqlite3_auto_extension(deps)(xEntryPoint), SQLITE_OK);
  const database = getOrThrow(createSqliteDatabase(deps)({ type: "Memory" }));
  sqlite3_reset_auto_extension(deps)();
  assertOk(database.exec("create table t(a); create table log(a);"));
  const insert = getOrThrow(database.prepare("insert into t values (?)"));
  const runNesting = (run: () => Result<SqliteRunResult, unknown>) => {
    nestedSql = "insert into log values (1), (2), (3)";
    return run();
  };

  assertEqual(
    runNesting(() => database.run("insert into t values (1)", [])),
    ok({ rows: [], changes: 3 }),
  );
  assertEqual(
    runNesting(() => insert.run([number(2)])),
    ok({ rows: [], changes: 3 }),
  );
  assertEqual(
    runNesting(() => database.run("create table u(a)", [])),
    ok({ rows: [], changes: 3 }),
  );
  assertEqual(
    runNesting(() => database.run("select count(*) as n from t", [])),
    ok({ rows: [{ n: 2 }], changes: 0 }),
  );
  assertEqual(nestedChanges, [3, 3, 3, 3]);
  assertEqual(
    database.run("select count(*) as n from log", []),
    ok({ rows: [{ n: 12 }], changes: 0 }),
  );
});

// The driver's 'reuses a prepared statement after its step fails'.
test("run fails with the failed step's error and extended code, and the statement runs again", async () => {
  const { database } = await setupSqliteDatabase();
  assertOk(database.exec("create table t(a not null)"));
  const insert = getOrThrow(database.prepare("insert into t values (?)"));

  assertErr(insert.run([null]), {
    type: "SqliteError",
    operation: "step",
    extendedCode: SQLITE_CONSTRAINT_NOTNULL,
    message: "NOT NULL constraint failed: t.a",
    sqlOffset: null,
    cause: null,
  });
  assertEqual(insert.run([number(1)]), ok({ rows: [], changes: 1 }));
});

test("sqliteResultCodeToPrimary returns the primary result code of an extended one, which a SqliteError does not store beside it", () => {
  assertType<Extract<keyof SqliteError, "code">, never>();

  for (const [code, primary] of [
    [SQLITE_CONSTRAINT_NOTNULL, SQLITE_CONSTRAINT],
    [SQLITE_CONSTRAINT_FOREIGNKEY, SQLITE_CONSTRAINT],
    [SQLITE_IOERR_WRITE, SQLITE_IOERR],
    [SQLITE_CONSTRAINT, SQLITE_CONSTRAINT],
    [SQLITE_OK, SQLITE_OK],
    [SQLITE_DONE, SQLITE_DONE],
  ] as const)
    assertEqual(sqliteResultCodeToPrimary(code), primary);
});

test("run fails with the bind's error when SQLite rejects a value, and steps nothing", async () => {
  const deps = await setupSqliteWasmWith((sqliteWasm) => ({
    // Text and blobs longer than 30 bytes, SQLite's minimum, are too big.
    sqlite3_bind_text: (pStmt, index, value, n, destructor) => {
      sqliteWasm.exports.sqlite3_limit(
        sqliteWasm.exports.sqlite3_db_handle(pStmt),
        SQLITE_LIMIT_LENGTH,
        30,
      );
      return sqliteWasm.exports.sqlite3_bind_text(
        pStmt,
        index,
        value,
        n,
        destructor,
      );
    },
  }));
  const database = getOrThrow(createSqliteDatabase(deps)({ type: "Memory" }));
  assertOk(database.exec("create table t(a, b)"));
  const insert = getOrThrow(database.prepare("insert into t values (?, ?)"));

  assertErr(insert.run([null, "x".repeat(31)]), {
    type: "SqliteError",
    operation: "bind",
    extendedCode: SQLITE_TOOBIG,
    message: "string or blob too big",
    sqlOffset: null,
    cause: null,
  });
  assertEqual(
    getOrThrow(database.prepare("select count(*) as n from t")).run([]),
    ok({ rows: [{ n: 0 }], changes: 0 }),
  );
  assertEqual(insert.run([null, "abc"]), ok({ rows: [], changes: 1 }));
});

test("an error SQLite's parser did not raise has no sqlOffset, although a failed prepare before it left one in the connection", async () => {
  let db = 0 as SqliteDbPtr;
  const deps = await setupSqliteWasmWith((sqliteWasm) => ({
    sqlite3_prepare_v3: (pDb, zSql, nByte, prepFlags, ppStmt, pzTail) => {
      db = pDb;
      return sqliteWasm.exports.sqlite3_prepare_v3(
        pDb,
        zSql,
        nByte,
        prepFlags,
        ppStmt,
        pzTail,
      );
    },
  }));
  const database = getOrThrow(createSqliteDatabase(deps)({ type: "Memory" }));
  assertOk(database.exec("create table t(a)"));
  const insert = getOrThrow(database.prepare("insert into t values (?)"));
  // SQLite keeps this offset until a prepare succeeds or a statement resets.
  const failPrepare = () => {
    assertErr(database.prepare("select 1 from t where a = 1 and nope = 1"), {
      type: "SqliteError",
      operation: "prepare",
      extendedCode: SQLITE_ERROR,
      message: "no such column: nope",
      sqlOffset: 32,
      cause: null,
    });
  };
  const tooBig = (operation: SqliteOperation) => ({
    type: "SqliteError",
    operation,
    extendedCode: SQLITE_TOOBIG,
    message: "string or blob too big",
    sqlOffset: null,
    cause: null,
  });

  failPrepare();
  sqlite3_limit(deps)(db, SQLITE_LIMIT_LENGTH, 30);
  assertErr(insert.run(["x".repeat(31)]), tooBig("bind"));
  failPrepare();
  sqlite3_limit(deps)(db, SQLITE_LIMIT_SQL_LENGTH, 10);
  assertErr(database.prepare("select 1 + 2 + 3"), tooBig("prepare"));
  assertErr(database.exec("select 1 + 2 + 3"), tooBig("exec"));
});

test("prepare, exec and run fail with SQLITE_NOMEM when the SQL or a value does not fit in memory", async () => {
  let mallocFails = false;
  const deps = await setupSqliteWasmWith((sqliteWasm) => ({
    sqlite3_malloc: (byteLength) =>
      mallocFails && byteLength >= 1000
        ? 0
        : sqliteWasm.exports.sqlite3_malloc(byteLength),
  }));
  const database = getOrThrow(createSqliteDatabase(deps)({ type: "Memory" }));
  const statement = getOrThrow(database.prepare("select ?"));
  mallocFails = true;
  const noMem = (operation: SqliteOperation) => ({
    type: "SqliteError",
    operation,
    extendedCode: SQLITE_NOMEM,
    message: "out of memory",
    sqlOffset: null,
    cause: null,
  });
  const long = "x".repeat(1000);

  assertErr(database.prepare(`select '${long}'`), noMem("prepare"));
  assertErr(database.exec(`select '${long}'`), noMem("exec"));
  assertErr(statement.run([long]), noMem("bind"));
  assertErr(statement.run([new Uint8Array(1000)]), noMem("bind"));
  assertEqual(statement.run(["x"]), ok({ rows: [{ "?": "x" }], changes: 0 }));
});

// wa-sqlite test/api_exec.js 'should execute multiple queries'.
test("exec runs statements in order and fails at the first failing one, with the error's byte offset in the whole SQL", async () => {
  const { database } = await setupSqliteDatabase();
  const count = (table: string) =>
    getOrThrow(
      getOrThrow(database.prepare(`select count(*) as n from "${table}"`)).run(
        [],
      ),
    ).rows;

  assertOk(
    database.exec("create table t(x); insert into t values (1), (2), (3);"),
  );
  assertEqual(count("t"), [{ n: 3 }]);
  assertErr(database.exec("create table ž(x); selec 2; create table u(x);"), {
    type: "SqliteError",
    operation: "exec",
    extendedCode: SQLITE_ERROR,
    message: 'near "selec": syntax error',
    sqlOffset: 20,
    cause: null,
  });
  assertEqual(count("ž"), [{ n: 0 }]);
  assertErr(database.prepare("select * from u"));
  // A last statement of one character is not skipped.
  assertErr(database.exec("create table w(x);x"), {
    type: "SqliteError",
    operation: "exec",
    extendedCode: SQLITE_ERROR,
    message: 'near "x": syntax error',
    sqlOffset: 18,
    cause: null,
  });
  assertErr(
    database.exec(
      "create table v(x not null); insert into v values (null); insert into t values (4);",
    ),
    {
      type: "SqliteError",
      operation: "exec",
      extendedCode: SQLITE_CONSTRAINT_NOTNULL,
      message: "NOT NULL constraint failed: v.x",
      sqlOffset: null,
      cause: null,
    },
  );
  assertEqual(count("t"), [{ n: 3 }]);
  assertOk(database.exec(""));
  assertOk(database.exec(" -- only a comment"));
});

test("exec fails with SqliteParameterCountError at a statement with parameters, without running it, so no parameter silently binds NULL", async () => {
  const { database } = await setupSqliteDatabase();
  assertOk(database.exec("create table t(x)"));

  assertErr(
    database.exec(
      "insert into t values (1); insert into t values (?); insert into t values (3)",
    ),
    { type: "SqliteParameterCountError", expected: 1, actual: 0 },
  );
  assertErr(database.exec("update t set x = :value + :value + ?3"), {
    type: "SqliteParameterCountError",
    expected: 3,
    actual: 0,
  });
  assertEqual(
    database.run("select x from t", []),
    ok({ rows: [{ x: 1 }], changes: 0 }),
  );
});

test("exec steps each statement to completion, so one that fails after returning a row fails exec and stops it", async () => {
  const { database } = await setupSqliteDatabase();
  assertOk(
    database.exec(`
      pragma foreign_keys = on;
      create table parent(id integer primary key);
      create table child(parentId references parent(id) deferrable initially deferred);
    `),
  );

  // The deferred constraint fails when the statement completes.
  assertErr(
    database.exec(
      "insert into child values (1) returning parentId; create table later(x)",
    ),
    {
      type: "SqliteError",
      operation: "exec",
      extendedCode: SQLITE_CONSTRAINT_FOREIGNKEY,
      message: "FOREIGN KEY constraint failed",
      sqlOffset: null,
      cause: null,
    },
  );
  assertEqual(
    database.run("select count(*) as n from child", []),
    ok({ rows: [{ n: 0 }], changes: 0 }),
  );
  assertErr(database.prepare("select * from later"));
  assertErr(
    database.exec("select 1 union all select abs(-9223372036854775808)"),
    {
      type: "SqliteError",
      operation: "exec",
      extendedCode: SQLITE_ERROR,
      message: "integer overflow",
      sqlOffset: null,
      cause: null,
    },
  );
});

test("exec runs the statements after one whose function runs a query on the same database", async () => {
  const deps = await setupSqliteWasm();
  let nestedSql = "";
  const nestedResults: Array<boolean> = [];
  const name = getOrThrow(allocCString(deps)("nested"));
  const {
    pointers: [xFunc, xEntryPoint],
  } = installWasmFunctions(deps)([
    {
      signature: "v(pip)",
      // Without a result, the function returns NULL.
      fn: () => {
        nestedResults.push(database.run(nestedSql, []).ok);
      },
    },
    {
      signature: "i(ppp)",
      fn: (db: SqliteDbPtr) =>
        sqlite3_create_function_v2(deps)(
          db,
          name,
          0,
          SQLITE_UTF8,
          0,
          xFunc,
          0,
          0,
          0,
        ),
    },
  ]);
  assertEqual(sqlite3_auto_extension(deps)(xEntryPoint), SQLITE_OK);
  const database = getOrThrow(createSqliteDatabase(deps)({ type: "Memory" }));
  sqlite3_reset_auto_extension(deps)();

  // If exec parsed its SQL from memory a nested query reuses, nested SQL longer
  // than exec's would free it, and shorter SQL would overwrite its start, where
  // exec would then spin on the NUL it left, so the shorter runs second.
  for (const [index, sql] of [
    `select '${"y".repeat(2000)}'`,
    "select 123456789",
  ].entries()) {
    nestedSql = sql;
    assertEqual(
      database.exec(
        `select nested(); create table after_nested${index}(a); insert into after_nested${index} values (42);`,
      ),
      ok(),
    );
    assertEqual(
      database.run(`select a from after_nested${index}`, []),
      ok({ rows: [{ a: 42 }], changes: 0 }),
    );
  }
  assertEqual(nestedResults, [true, true]);
});

test("prepare and run keep their SQL while a collation-needed callback runs a query on the same database", async () => {
  const deps = await setupSqliteWasm();
  let nestedSql = "";
  const nestedResults: Array<boolean> = [];
  const {
    pointers: [xCompare, xCollNeeded, xEntryPoint],
  } = installWasmFunctions(deps)([
    {
      signature: "i(pipip)",
      fn: (_pArg: number, n1: number, p1: WasmPtr, n2: number, p2: WasmPtr) =>
        readUtf8(deps)(p1, n1).localeCompare(readUtf8(deps)(p2, n2)),
    },
    {
      signature: "v(ppis)",
      // SQLite asks while it parses the SQL, and then uses the collation.
      fn: (
        _pArg: number,
        db: SqliteDbPtr,
        _eTextRep: number,
        zName: CStringPtr,
      ) => {
        nestedResults.push(database.run(nestedSql, []).ok);
        sqlite3_create_collation_v2(deps)(
          db,
          zName,
          SQLITE_UTF8,
          0,
          xCompare,
          0,
        );
      },
    },
    {
      signature: "i(ppp)",
      fn: (db: SqliteDbPtr) =>
        sqlite3_collation_needed(deps)(db, 0, xCollNeeded),
    },
  ]);
  assertEqual(sqlite3_auto_extension(deps)(xEntryPoint), SQLITE_OK);
  const database = getOrThrow(createSqliteDatabase(deps)({ type: "Memory" }));
  sqlite3_reset_auto_extension(deps)();
  const createT1 = "CREATE TABLE t1(a text collate c1, b text)";
  const createT2 = "CREATE TABLE t2(a text collate c2, b text)";

  // SQLite parses the SQL in place, so a query that reused its memory would
  // first reallocate it, as the first and longest SQL of the database, and
  // then write over it.
  nestedSql = `select '${"y".repeat(4000)}'`;
  const statement = getOrThrow(database.prepare(createT1));
  assertEqual(statement.run([]), ok({ rows: [], changes: 0 }));
  nestedSql = `select '${"y".repeat(100)}'`;
  assertEqual(database.run(createT2, []), ok({ rows: [], changes: 0 }));
  assertEqual(
    database.run("select sql from sqlite_schema", []),
    ok({ rows: [{ sql: createT1 }, { sql: createT2 }], changes: 0 }),
  );
  // SQLite copies a statement's SQL after it parsed it, and a schema change
  // prepares the statement again from that copy.
  assertOk(
    database.exec("create table t(a text); insert into t values ('b'), ('a')"),
  );
  nestedSql = "select 'nested' as x";
  const select = getOrThrow(
    database.prepare("select a from t order by a collate c3"),
  );
  const rows = ok({ rows: [{ a: "a" }, { a: "b" }], changes: 0 });
  assertEqual(select.run([]), rows);
  assertOk(database.exec("create table later(x)"));
  assertEqual(select.run([]), rows);
  assertEqual(nestedResults, [true, true, true]);
});

/**
 * Opens a Memory database with the table t of the values 1 to 5 and the SQL
 * function cb(), which calls the callback and returns 1, or NULL when the
 * callback throws, which is reported as a defect.
 */
const setupCallbackDatabase = async () => {
  const deps = await setupSqliteWasm();
  let callback = (): void => {};
  const name = getOrThrow(allocCString(deps)("cb"));
  const {
    pointers: [xFunc, xEntryPoint],
  } = installWasmFunctions(deps)([
    {
      signature: "v(pip)",
      fn: (context: SqliteContextPtr) => {
        callback();
        sqlite3_result_int(deps)(context, 1);
      },
    },
    {
      signature: "i(ppp)",
      fn: (db: SqliteDbPtr) =>
        sqlite3_create_function_v2(deps)(
          db,
          name,
          0,
          SQLITE_UTF8,
          0,
          xFunc,
          0,
          0,
          0,
        ),
    },
  ]);
  assertEqual(sqlite3_auto_extension(deps)(xEntryPoint), SQLITE_OK);
  const database = getOrThrow(createSqliteDatabase(deps)({ type: "Memory" }));
  sqlite3_reset_auto_extension(deps)();
  assertOk(
    database.exec(
      "create table t(a); insert into t values (1), (2), (3), (4), (5)",
    ),
  );
  return {
    ...deps,
    database,
    setCallback: (fn: () => void) => {
      callback = fn;
    },
  };
};

const runningStatementMessage =
  "A SqliteStatement cannot run or be disposed while it runs.";

const runningDatabaseMessage =
  "A SqliteDatabase cannot be disposed while one of its operations runs.";

/** The rows of `select a, cb() as c from t` when the second cb() threw. */
const rowsWithSecondCallbackFailed = [
  { a: 1, c: 1 },
  { a: 2, c: null },
  { a: 3, c: 1 },
  { a: 4, c: 1 },
  { a: 5, c: 1 },
];

/** Returns the messages of the defects reported so far. */
const getDefectMessages = (deps: TestRunDefaultDeps): ReadonlyArray<string> =>
  deps.reportDefect
    .getDefects()
    .map((defect) =>
      defect instanceof Error ? defect.message : String(defect),
    );

// SQLite documents that a function must not reset or finalize the statement
// that runs it; a run resets its statement, and disposing finalizes it.
test("a statement run again from a function of its own run throws before entering wasm, so the function fails as a defect, the instance keeps working, and the run returns its rows", async () => {
  const t = await setupCallbackDatabase();
  const select = getOrThrow(t.database.prepare("select a, cb() as c from t"));
  let calls = 0;
  t.setCallback(() => {
    if (++calls === 2) select.run([]);
  });

  assertEqual(
    select.run([]),
    ok({ rows: rowsWithSecondCallbackFailed, changes: 0 }),
  );

  assertEqual(getDefectMessages(t), [runningStatementMessage]);
  assertFalse(t.sqliteWasm.isBroken());
  assertEqual(select.run([]).ok, true);
  select[Symbol.dispose]();
  t.database[Symbol.dispose]();
});

test("a statement disposed from a function of its own run throws before entering wasm, so a SELECT returns its rows, a DELETE deletes them, and the statement is disposed later", async () => {
  const t = await setupCallbackDatabase();
  for (const [sql, result] of [
    [
      "select a, cb() as c from t",
      ok({ rows: rowsWithSecondCallbackFailed, changes: 0 }),
    ],
    // The second row's cb() is NULL, so the row stays.
    ["delete from t where cb() > 0", ok({ rows: [], changes: 4 })],
  ] as const) {
    const statement = getOrThrow(t.database.prepare(sql));
    let calls = 0;
    t.setCallback(() => {
      if (++calls === 2) statement[Symbol.dispose]();
    });

    assertEqual(statement.run([]), result);

    statement[Symbol.dispose]();
    assertThrows(
      () => statement.run([]),
      (thrown) => {
        assertInstanceOf(thrown, Error);
        assertEqual(thrown.message, "Cannot use a disposed object.");
      },
    );
  }
  assertEqual(getDefectMessages(t), [
    runningStatementMessage,
    runningStatementMessage,
  ]);
  assertFalse(t.sqliteWasm.isBroken());
  assertEqual(
    t.database.run("select a from t", []),
    ok({ rows: [{ a: 2 }], changes: 0 }),
  );
  t.database[Symbol.dispose]();
});

test("a database disposed from a function during its exec, run or a statement's run throws before entering wasm, so each completes, and the database is disposed later", async () => {
  const t = await setupCallbackDatabase();
  const select = getOrThrow(t.database.prepare("select a, cb() as c from t"));
  let calls = 0;
  t.setCallback(() => {
    if (++calls === 2) t.database[Symbol.dispose]();
  });

  assertEqual(
    t.database.exec("select cb() from t; create table after_exec(a)"),
    ok(),
  );
  calls = 0;
  assertEqual(
    t.database.run("select a, cb() as c from t", []),
    ok({ rows: rowsWithSecondCallbackFailed, changes: 0 }),
  );
  calls = 0;
  assertEqual(
    select.run([]),
    ok({ rows: rowsWithSecondCallbackFailed, changes: 0 }),
  );

  assertEqual(getDefectMessages(t), [
    runningDatabaseMessage,
    runningDatabaseMessage,
    runningDatabaseMessage,
  ]);
  assertFalse(t.sqliteWasm.isBroken());
  assertEqual(
    t.database.run("select count(*) as n from after_exec", []),
    ok({ rows: [{ n: 0 }], changes: 0 }),
  );
  t.database[Symbol.dispose]();
  assertThrows(
    () => select.run([]),
    (thrown) => {
      assertInstanceOf(thrown, Error);
      assertEqual(thrown.message, "Cannot use a disposed object.");
    },
  );
});

test("a database disposed from a collation-needed callback during its prepare throws before entering wasm, so the prepare completes, and the database is disposed later", async () => {
  const deps = await setupSqliteWasm();
  const thrown: Array<unknown> = [];
  const {
    pointers: [xCompare, xCollNeeded, xEntryPoint],
  } = installWasmFunctions(deps)([
    {
      signature: "i(pipip)",
      fn: (_pArg: number, n1: number, p1: WasmPtr, n2: number, p2: WasmPtr) =>
        readUtf8(deps)(p1, n1).localeCompare(readUtf8(deps)(p2, n2)),
    },
    {
      signature: "v(ppis)",
      fn: (
        _pArg: number,
        db: SqliteDbPtr,
        _eTextRep: number,
        zName: CStringPtr,
      ) => {
        try {
          database[Symbol.dispose]();
        } catch (error) {
          thrown.push(error);
        }
        sqlite3_create_collation_v2(deps)(
          db,
          zName,
          SQLITE_UTF8,
          0,
          xCompare,
          0,
        );
      },
    },
    {
      signature: "i(ppp)",
      fn: (db: SqliteDbPtr) =>
        sqlite3_collation_needed(deps)(db, 0, xCollNeeded),
    },
  ]);
  assertEqual(sqlite3_auto_extension(deps)(xEntryPoint), SQLITE_OK);
  const database = getOrThrow(createSqliteDatabase(deps)({ type: "Memory" }));
  sqlite3_reset_auto_extension(deps)();

  const select = getOrThrow(
    database.prepare("select ? as a order by 1 collate c1"),
  );

  assertEqual(thrown.length, 1);
  assertInstanceOf(thrown[0], Error);
  assertEqual(thrown[0].message, runningDatabaseMessage);
  assertFalse(deps.sqliteWasm.isBroken());
  assertEqual(select.run(["x"]), ok({ rows: [{ a: "x" }], changes: 0 }));
  database[Symbol.dispose]();
  assertEqual(deps.reportDefect.getDefects(), []);
});

test("run reads a statement's column names once, not for each row or run", async () => {
  let columnNameCount = 0;
  const deps = await setupSqliteWasmWith((sqliteWasm) => ({
    sqlite3_column_name: (pStmt, N) => {
      columnNameCount++;
      return sqliteWasm.exports.sqlite3_column_name(pStmt, N);
    },
  }));
  const database = getOrThrow(createSqliteDatabase(deps)({ type: "Memory" }));
  assertOk(
    database.exec("create table t(a, b); insert into t values (1, 2), (3, 4);"),
  );
  const statement = getOrThrow(
    database.prepare("select a, b from t order by a"),
  );

  const expected = ok({
    rows: [
      { a: 1, b: 2 },
      { a: 3, b: 4 },
    ],
    changes: 0,
  });
  assertEqual(statement.run([]), expected);
  assertEqual(statement.run([]), expected);
  assertEqual(columnNameCount, 2);
});

// wa-sqlite b5824ac and #228.
test("run reads column names again after a schema change re-prepared the statement, then caches them", async () => {
  let columnNameCount = 0;
  const deps = await setupSqliteWasmWith((sqliteWasm) => ({
    sqlite3_column_name: (pStmt, N) => {
      columnNameCount++;
      return sqliteWasm.exports.sqlite3_column_name(pStmt, N);
    },
  }));
  const database = getOrThrow(createSqliteDatabase(deps)({ type: "Memory" }));
  assertOk(database.exec("create table t(a); insert into t values (1);"));
  const statement = getOrThrow(database.prepare("select * from t"));
  assertEqual(statement.run([]), ok({ rows: [{ a: 1 }], changes: 0 }));
  assertEqual(columnNameCount, 1);

  assertOk(database.exec("alter table t add column b default 2"));

  const expected = ok({ rows: [{ a: 1, b: 2 }], changes: 0 });
  assertEqual(statement.run([]), expected);
  assertEqual(columnNameCount, 3);
  assertEqual(statement.run([]), expected);
  assertEqual(columnNameCount, 3);
});

// SQLite 3.54.0 re-prepared such a statement on every run, as eleven of
// Evolu's storage queries are, and run read its column names each time.
test("run doesn't re-prepare a statement with a column = ? term and an ORDER BY, max or a join", async () => {
  let columnNameCount = 0;
  const deps = await setupSqliteWasmWith((sqliteWasm) => ({
    sqlite3_column_name: (pStmt, N) => {
      columnNameCount++;
      return sqliteWasm.exports.sqlite3_column_name(pStmt, N);
    },
  }));
  const database = getOrThrow(createSqliteDatabase(deps)({ type: "Memory" }));
  assertOk(
    database.exec(`
      create table t(a, b);
      create index t_b on t(b);
      create table u(a);
      insert into t values (1, 'x'), (2, 'y');
      insert into u values (1), (2);
    `),
  );

  for (const sql of [
    "select a from t where b = ? order by a",
    "select max(a) as a from t where b = ?",
    "select t.a from t join u on u.a = t.a where t.b = ?",
  ]) {
    const statement = getOrThrow(database.prepare(sql));
    columnNameCount = 0;
    for (const b of ["x", "y", "x"]) assertOk(statement.run([b]));
    assertEqual(columnNameCount, 1);
  }
});

test("run fails with the parser's error and its sqlOffset when a schema change leaves the statement unable to re-prepare", async () => {
  const { database } = await setupSqliteDatabase();
  assertOk(database.exec("create table t(a, b)"));
  const statement = getOrThrow(database.prepare("select   b from t"));
  assertOk(statement.run([]));
  assertOk(database.exec("alter table t drop column b"));

  assertErr(statement.run([]), {
    type: "SqliteError",
    operation: "step",
    extendedCode: SQLITE_ERROR,
    message: "no such column: b",
    sqlOffset: 9,
    cause: null,
  });
});

test("a column named __proto__ is an ordinary property of its row", async () => {
  const { database } = await setupSqliteDatabase();

  const result = getOrThrow(
    database.prepare("select 1 as __proto__, 2 as constructor"),
  ).run([]);

  assertOk(result);
  const [row] = result.value.rows;
  assertEqual(Object.entries(row ?? {}), [
    ["__proto__", 1],
    ["constructor", 2],
  ]);
});

test("run fails with SQLITE_NOMEM when SQLite returns no pointer for TEXT, or for a BLOB while out of memory, and the statement runs again", async () => {
  let failColumn = "";
  const deps = await setupSqliteWasmWith((sqliteWasm) => ({
    // As SQLite does when it cannot allocate the column's value.
    sqlite3_column_text: (pStmt, iCol) =>
      failColumn === "text"
        ? 0
        : sqliteWasm.exports.sqlite3_column_text(pStmt, iCol),
    sqlite3_column_blob: (pStmt, iCol) => {
      if (failColumn !== "blob")
        return sqliteWasm.exports.sqlite3_column_blob(pStmt, iCol);
      sqliteWasm.exports.sqlite3_set_errmsg(
        sqliteWasm.exports.sqlite3_db_handle(pStmt),
        SQLITE_NOMEM,
        0,
      );
      return 0;
    },
  }));
  const database = getOrThrow(createSqliteDatabase(deps)({ type: "Memory" }));
  const statement = getOrThrow(
    database.prepare("select 'a' as text, x'01' as blob"),
  );

  for (const column of ["text", "blob"]) {
    failColumn = column;
    assertErr(statement.run([]), {
      type: "SqliteError",
      operation: "step",
      extendedCode: SQLITE_NOMEM,
      message: "out of memory",
      sqlOffset: null,
      cause: null,
    });
  }
  failColumn = "";
  assertEqual(
    statement.run([]),
    ok({ rows: [{ text: "a", blob: Uint8Array.of(1) }], changes: 0 }),
  );
});

test("run fails with SQLITE_NOMEM, as when SQLite cannot allocate a value, when JavaScript cannot allocate the TEXT or BLOB it reads, and the instance and the statement keep working", async () => {
  const cases = await Promise.all(
    [
      "select hex(zeroblob(40000)) as value",
      "select zeroblob(80000) as value",
    ].map(async (sql) => {
      const deps = await setupSqliteWasmWithFailingCopies();
      const database = getOrThrow(
        createSqliteDatabase(deps)({ type: "Memory" }),
      );
      return { deps, statement: getOrThrow(database.prepare(sql)) };
    }),
  );

  const results = cases.map(({ deps, statement }) => {
    deps.failCopiesAbove(50_000);
    const result = trySync(
      () => statement.run([]),
      (thrown) => thrown,
    );
    deps.failCopiesAbove(Infinity);
    return result;
  });

  assertEqual(
    results,
    cases.map(() =>
      ok(
        err({
          type: "SqliteError",
          operation: "step",
          extendedCode: SQLITE_NOMEM,
          message: "out of memory",
          sqlOffset: null,
          cause: null,
        }),
      ),
    ),
  );
  for (const { deps, statement } of cases) {
    assertFalse(deps.sqliteWasm.isBroken());
    assertOk(statement.run([]));
  }
});

// The UTF-8 of text whose 3 bytes per UTF-16 code unit can exceed 64 KiB, and
// of the SQL exec copies, is encoded into a new array first. V8 throws a
// RangeError when it cannot allocate it, which runs no wasm.
test("run and exec fail with SQLITE_NOMEM, as when SQLite cannot allocate memory, when JavaScript cannot allocate the UTF-8 of a long text parameter or of the SQL, and the instance keeps working", async (context) => {
  const { database, sqliteWasm } = await setupSqliteDatabase();
  const encoder = new TextEncoder();
  const encode = encoder.encode.bind(encoder);
  let failEncodesAbove = 25_000;
  context.mock.method(TextEncoder.prototype, "encode", (input?: string) => {
    if (input != null && input.length > failEncodesAbove)
      throw new RangeError("Array buffer allocation failed");
    return encode(input);
  });
  const text = "a".repeat(30_000);
  const select = getOrThrow(database.prepare("select length(?) as n"));
  const outOfMemory = (operation: SqliteOperation): SqliteError => ({
    type: "SqliteError",
    operation,
    extendedCode: SQLITE_NOMEM,
    message: "out of memory",
    sqlOffset: null,
    cause: null,
  });

  const results = [
    trySync(
      () => select.run([text]),
      (thrown) => thrown,
    ),
    trySync(
      () => database.exec(`select '${text}'`),
      (thrown) => thrown,
    ),
  ];

  failEncodesAbove = Infinity;
  assertEqual(results, [
    ok(err(outOfMemory("bind"))),
    ok(err(outOfMemory("exec"))),
  ]);
  assertFalse(sqliteWasm.isBroken());
  assertEqual(select.run([text]), ok({ rows: [{ n: 30_000 }], changes: 0 }));
  assertOk(database.exec(`select '${text}'`));
});

test("run fails with SQLITE_NOMEM when SQLite returns no column name, and reads the names in the next run", async () => {
  let failColumnName = true;
  const deps = await setupSqliteWasmWith((sqliteWasm) => ({
    // As SQLite does when it cannot allocate the name.
    sqlite3_column_name: (pStmt, N) =>
      failColumnName ? 0 : sqliteWasm.exports.sqlite3_column_name(pStmt, N),
  }));
  const database = getOrThrow(createSqliteDatabase(deps)({ type: "Memory" }));
  const statement = getOrThrow(database.prepare("select 1 as a"));

  assertErr(statement.run([]), {
    type: "SqliteError",
    operation: "step",
    extendedCode: SQLITE_NOMEM,
    message: "out of memory",
    sqlOffset: null,
    cause: null,
  });
  failColumnName = false;
  assertEqual(statement.run([]), ok({ rows: [{ a: 1 }], changes: 0 }));
});

test("run fails with a deferred constraint violation that a statement's commit finds after it returned rows", async () => {
  const { database } = await setupSqliteDatabase();
  assertOk(
    database.exec(`
      pragma foreign_keys = on;
      create table parent(id integer primary key);
      create table child(parentId references parent(id) deferrable initially deferred);
    `),
  );
  const insert = getOrThrow(
    database.prepare("insert into child values (?) returning parentId"),
  );

  assertErr(insert.run([number(1)]), {
    type: "SqliteError",
    operation: "step",
    extendedCode: SQLITE_CONSTRAINT_FOREIGNKEY,
    message: "FOREIGN KEY constraint failed",
    sqlOffset: null,
    cause: null,
  });
  assertEqual(
    getOrThrow(database.prepare("select count(*) as n from child")).run([]),
    ok({ rows: [{ n: 0 }], changes: 0 }),
  );
});

// wa-sqlite #168, for values above the scratch memory's capacity.
test("run binds text and blobs above 64 KiB from an exact allocation that SQLite takes over with SQLITE_WASM_DEALLOC", async () => {
  const binds: Array<readonly [string, number, SqliteDestructor]> = [];
  const mallocs: Array<number> = [];
  const deps = await setupSqliteWasmWith((sqliteWasm) => ({
    sqlite3_bind_text: (pStmt, index, value, n, destructor) => {
      binds.push(["text", n, destructor]);
      return sqliteWasm.exports.sqlite3_bind_text(
        pStmt,
        index,
        value,
        n,
        destructor,
      );
    },
    sqlite3_bind_blob: (pStmt, index, value, n, destructor) => {
      binds.push(["blob", n, destructor]);
      return sqliteWasm.exports.sqlite3_bind_blob(
        pStmt,
        index,
        value,
        n,
        destructor,
      );
    },
    sqlite3_malloc: (byteLength) => {
      mallocs.push(byteLength);
      return sqliteWasm.exports.sqlite3_malloc(byteLength);
    },
  }));
  const memoryUsed = setupMemoryUsed(deps);
  getOrThrow(createSqliteDatabase(deps)({ type: "Memory" }))[Symbol.dispose]();
  const baseline = memoryUsed();
  const database = getOrThrow(createSqliteDatabase(deps)({ type: "Memory" }));
  const statement = getOrThrow(database.prepare("select ? as text, ? as blob"));
  // 3 bytes per UTF-16 code unit fit 64 KiB up to 21845 code units.
  const smallText = "ž".repeat(21_845);
  const largeText = "ž".repeat(21_846);
  const largeBlob = new Uint8Array(65_537).fill(7);
  mallocs.length = 0;

  assertEqual(
    statement.run([largeText, largeBlob]),
    ok({ rows: [{ text: largeText, blob: largeBlob }], changes: 0 }),
  );
  assertEqual(
    statement.run([smallText, new Uint8Array(65_536)]),
    ok({
      rows: [{ text: smallText, blob: new Uint8Array(65_536) }],
      changes: 0,
    }),
  );

  assertEqual(binds, [
    ["text", 43_692, SQLITE_WASM_DEALLOC],
    ["blob", 65_537, SQLITE_WASM_DEALLOC],
    ["text", 43_690, SQLITE_TRANSIENT],
    ["blob", 65_536, SQLITE_TRANSIENT],
  ]);
  assertEqual(mallocs.slice(0, 2), [43_692, 65_537]);
  statement[Symbol.dispose]();
  database[Symbol.dispose]();
  assertEqual(memoryUsed(), baseline);
});

test("run frees the values above 64 KiB it bound before it returns, also when it fails, so a prepared statement does not keep them until its next run", async () => {
  let mallocFails = false;
  const deps = await setupSqliteWasmWith((sqliteWasm) => ({
    sqlite3_malloc: (byteLength) =>
      mallocFails && byteLength === 80_000
        ? 0
        : sqliteWasm.exports.sqlite3_malloc(byteLength),
  }));
  const memoryUsed = setupMemoryUsed(deps);
  const database = getOrThrow(createSqliteDatabase(deps)({ type: "Memory" }));
  const statement = getOrThrow(
    database.prepare("select length(?) as text, length(?) as blob"),
  );
  // NULL takes no memory.
  assertOk(statement.run([null, null]));
  const baseline = memoryUsed();

  assertEqual(
    statement.run(["x".repeat(30_000), new Uint8Array(70_000)]),
    ok({ rows: [{ text: 30_000, blob: 70_000 }], changes: 0 }),
  );
  const afterRun = memoryUsed();
  mallocFails = true;
  // The first value is bound, and the second cannot be allocated.
  assertErr(
    statement.run([new Uint8Array(70_000).fill(1), new Uint8Array(80_000)]),
    {
      type: "SqliteError",
      operation: "bind",
      extendedCode: SQLITE_NOMEM,
      message: "out of memory",
      sqlOffset: null,
      cause: null,
    },
  );
  mallocFails = false;
  const afterFailedRun = memoryUsed();

  assertEqual([afterRun, afterFailedRun], [baseline, baseline]);
});

test("run fails with SQLITE_NOMEM when a value above 64 KiB cannot be allocated", async () => {
  let mallocFails = false;
  const deps = await setupSqliteWasmWith((sqliteWasm) => ({
    sqlite3_malloc: (byteLength) =>
      mallocFails && byteLength > 65_536
        ? 0
        : sqliteWasm.exports.sqlite3_malloc(byteLength),
  }));
  const database = getOrThrow(createSqliteDatabase(deps)({ type: "Memory" }));
  const statement = getOrThrow(database.prepare("select ? as value"));
  mallocFails = true;

  for (const value of ["x".repeat(65_537), new Uint8Array(65_537)])
    assertErr(statement.run([value]), {
      type: "SqliteError",
      operation: "bind",
      extendedCode: SQLITE_NOMEM,
      message: "out of memory",
      sqlOffset: null,
      cause: null,
    });
});

// tester1.c-pp.js 'sqlite3.oo1' 'Close db'.
test("disposing a database finalizes its open statements once before it closes it fully, and the statements then throw when used", async () => {
  const calls: Array<string> = [];
  const deps = await setupSqliteWasmWith((sqliteWasm) => ({
    sqlite3_finalize: (pStmt) => {
      calls.push("finalize");
      return sqliteWasm.exports.sqlite3_finalize(pStmt);
    },
    sqlite3_close_v2: (db) => {
      calls.push("close");
      return sqliteWasm.exports.sqlite3_close_v2(db);
    },
  }));
  const memoryUsed = setupMemoryUsed(deps);
  getOrThrow(createSqliteDatabase(deps)({ type: "Memory" }))[Symbol.dispose]();
  const baseline = memoryUsed();
  calls.length = 0;
  const database = getOrThrow(createSqliteDatabase(deps)({ type: "Memory" }));
  const open = getOrThrow(database.prepare("select 1"));
  const disposed = getOrThrow(database.prepare("select 2"));
  assertOk(open.run([]));
  disposed[Symbol.dispose]();
  assertEqual(calls, ["finalize"]);

  database[Symbol.dispose]();

  // A close before the finalizes would only defer it until the last one.
  assertEqual(calls, ["finalize", "finalize", "close"]);
  assertEqual(memoryUsed(), baseline);
  open[Symbol.dispose]();
  assertEqual(calls, ["finalize", "finalize", "close"]);
  assertThrowsDisposed(() => open.run([]));
});

test("a disposed statement is not kept by its database", async () => {
  // node:test runs each file in its own process, so the flag affects only this file.
  setFlagsFromString("--expose-gc");
  const gc = runInNewContext("gc") as () => void;
  const { database } = await setupSqliteDatabase();
  const statement = (() => {
    const statement = getOrThrow(database.prepare("select 1"));
    statement[Symbol.dispose]();
    return new WeakRef(statement);
  })();
  // A WeakRef keeps its target until the current job ends.
  await new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
  gc();

  assertSame(statement.deref(), undefined);
  database[Symbol.dispose]();
});

// tester1.c-pp.js 'sqlite3.oo1' 'sqlite3_js_db_export()'.
test("export returns the database's pages in their own ArrayBuffer, and a new database's first page", async () => {
  const { database } = await setupSqliteDatabase();
  const empty = database.export();
  assertOk(
    database.exec(
      "create table t(a); insert into t values ('kůň'), (x'0102');",
    ),
  );

  const exported = database.export();

  // The build's page size.
  assertOk(empty);
  assertEqual(empty.value.length, 8192);
  assertOk(exported);
  const bytes = exported.value;
  assertEqual(bytes.length % 8192, 0);
  assertEqual(bytes.byteOffset, 0);
  assertEqual(bytes.buffer.byteLength, bytes.length);
  assertEqual(
    new TextDecoder().decode(bytes.subarray(0, 16)),
    "SQLite format 3\0",
  );
  const t = await setupDatabase();
  const data = getOrThrow(allocWasm(t)(bytes.length));
  writeWasmBytes(t)(data, bytes);
  assertEqual(
    sqlite3_deserialize(t)(
      t.db,
      t.cString("main"),
      data,
      BigInt(bytes.length),
      BigInt(bytes.length),
      SQLITE_DESERIALIZE_FREEONCLOSE,
    ),
    SQLITE_OK,
  );
  assertEqual(
    t.selectText("select group_concat(hex(a)) from t"),
    "6BC5AFC588,0102",
  );
});

test("export frees SQLite's copy of the pages", async () => {
  const deps = await setupSqliteWasm();
  const memoryUsed = setupMemoryUsed(deps);
  const database = getOrThrow(createSqliteDatabase(deps)({ type: "Memory" }));
  assertOk(database.export());
  const used = memoryUsed();

  for (let index = 0; index < 20; index++) assertOk(database.export());

  assertEqual(memoryUsed(), used);
});

test("export fails with SQLITE_NOMEM, as when SQLite cannot allocate its copy, when JavaScript cannot allocate the copy of the pages, freeing SQLite's copy, and the instance keeps working", async () => {
  const deps = await setupSqliteWasmWithFailingCopies();
  const memoryUsed = setupMemoryUsed(deps);
  const database = getOrThrow(createSqliteDatabase(deps)({ type: "Memory" }));
  assertOk(
    database.exec(
      "create table t(a); insert into t values (randomblob(100000))",
    ),
  );
  const exported = getOrThrow(database.export());
  const used = memoryUsed();
  deps.failCopiesAbove(50_000);

  const result = trySync(
    () => database.export(),
    (thrown) => thrown,
  );

  deps.failCopiesAbove(Infinity);
  assertEqual(
    result,
    ok(
      err({
        type: "SqliteError",
        operation: "export",
        extendedCode: SQLITE_NOMEM,
        message: "out of memory",
        sqlOffset: null,
        cause: null,
      }),
    ),
  );
  assertFalse(deps.sqliteWasm.isBroken());
  assertEqual(memoryUsed(), used);
  assertEqual(database.export(), ok(exported));
});

test("export returns the database's pages although a trace callback during it runs a query on the same database", async () => {
  const deps = await setupSqliteWasm();
  let isNesting = false;
  const nestedResults: Array<boolean> = [];
  const {
    pointers: [xTrace, xEntryPoint],
  } = installWasmFunctions(deps)([
    {
      signature: "i(ippp)",
      // SQLite calls it when a statement finishes, also when the export
      // finalizes its query of the page count, after it wrote the size.
      fn: () => {
        if (isNesting) {
          isNesting = false;
          nestedResults.push(database.run("select 1", []).ok);
        }
        return 0;
      },
    },
    {
      signature: "i(ppp)",
      fn: (db: SqliteDbPtr) =>
        sqlite3_trace_v2(deps)(db, SQLITE_TRACE_PROFILE, xTrace, 0),
    },
  ]);
  assertEqual(sqlite3_auto_extension(deps)(xEntryPoint), SQLITE_OK);
  const database = getOrThrow(createSqliteDatabase(deps)({ type: "Memory" }));
  sqlite3_reset_auto_extension(deps)();
  assertOk(
    database.exec(
      "create table t(a); insert into t values (randomblob(20000))",
    ),
  );
  const expected = getOrThrow(database.export());

  isNesting = true;
  const exported = database.export();

  assertOk(exported);
  // A wrong size shows as a wrong length, which is cheaper to compare.
  assertEqual(exported.value.length, expected.length);
  assertEqual(exported.value, expected);
  assertEqual(nestedResults, [true]);
});

test("export fails with SQLITE_NOMEM when it cannot allocate the memory SQLite writes the size to", async () => {
  let mallocFails = false;
  const deps = await setupSqliteWasmWith((sqliteWasm) => ({
    sqlite3_malloc: (byteLength) =>
      mallocFails ? 0 : sqliteWasm.exports.sqlite3_malloc(byteLength),
  }));
  const database = getOrThrow(createSqliteDatabase(deps)({ type: "Memory" }));
  mallocFails = true;

  assertErr(database.export(), {
    type: "SqliteError",
    operation: "export",
    extendedCode: SQLITE_NOMEM,
    message: "out of memory",
    sqlOffset: null,
    cause: null,
  });
  mallocFails = false;
  assertOk(database.export());
});

test("export fails with the error SQLite reports when it cannot serialize the database", async () => {
  const wasm = await setupSqliteWasm();
  const { exports } = wasm.sqliteWasm;
  const deps = {
    ...wasm,
    sqliteWasm: {
      ...wasm.sqliteWasm,
      exports: {
        ...exports,
        sqlite3_serialize: ((db, zSchema, piSize, mFlags) => {
          // Too short for the PRAGMA page_count that sqlite3_serialize runs.
          exports.sqlite3_limit(db, SQLITE_LIMIT_SQL_LENGTH, 1);
          return exports.sqlite3_serialize(db, zSchema, piSize, mFlags);
        }) as SqliteCExports["sqlite3_serialize"],
      },
    },
  };
  const database = getOrThrow(createSqliteDatabase(deps)({ type: "Memory" }));

  assertErr(database.export(), {
    type: "SqliteError",
    operation: "export",
    extendedCode: SQLITE_TOOBIG,
    message: "string or blob too big",
    sqlOffset: null,
    cause: null,
  });
  assertEqual(wasm.reportDefect.getDefects(), []);
});

test("export fails with SQLITE_NOMEM when SQLite cannot allocate its copy or its query", async () => {
  // A size of -1 is the failed allocation of its query, any other size the
  // failed allocation of its copy.
  let size = 0n;
  const deps = await setupSqliteWasmWith((sqliteWasm) => ({
    sqlite3_serialize: (_db, _zSchema, piSize) => {
      sqliteWasm.getHeapDataView().setBigInt64(piSize, size, true);
      return 0;
    },
  }));
  const database = getOrThrow(createSqliteDatabase(deps)({ type: "Memory" }));

  for (size of [8192n, -1n])
    assertErr(database.export(), {
      type: "SqliteError",
      operation: "export",
      extendedCode: SQLITE_NOMEM,
      message: "out of memory",
      sqlOffset: null,
      cause: null,
    });
});

test("export of a database without pages that cannot get one returns zero bytes in their own ArrayBuffer", async () => {
  const { database } = await setupSqliteDatabase();
  // sqlite3_serialize gives an empty database its first page by writing it.
  assertOk(database.exec("pragma query_only = 1"));

  const result = database.export();

  assertOk(result);
  assertEqual(result.value, new Uint8Array(0));
  assertEqual(result.value.buffer.byteLength, 0);
});

test("export fails with SQLITE_NOMEM, not with the error of an earlier call, when SQLite cannot allocate its query", async () => {
  const deps = await setupSqliteWasmWith((sqliteWasm) => ({
    // As when sqlite3_serialize cannot allocate its query, which reports
    // nothing to the connection.
    sqlite3_serialize: (_db, _zSchema, piSize) => {
      sqliteWasm.getHeapDataView().setBigInt64(piSize, -1n, true);
      return 0;
    },
  }));
  const database = getOrThrow(createSqliteDatabase(deps)({ type: "Memory" }));
  assertErr(database.prepare("selec 1"));

  assertErr(database.export(), {
    type: "SqliteError",
    operation: "export",
    extendedCode: SQLITE_NOMEM,
    message: "out of memory",
    sqlOffset: null,
    cause: null,
  });
});

test("run on the database prepares one statement without SQLITE_PREPARE_PERSISTENT, runs it and finalizes it, also when the run fails", async () => {
  let db = 0 as SqliteDbPtr;
  const prepareFlags: Array<number> = [];
  const deps = await setupSqliteWasmWith((sqliteWasm) => ({
    sqlite3_prepare_v3: (pDb, zSql, nByte, prepFlags, ppStmt, pzTail) => {
      db = pDb;
      prepareFlags.push(prepFlags);
      return sqliteWasm.exports.sqlite3_prepare_v3(
        pDb,
        zSql,
        nByte,
        prepFlags,
        ppStmt,
        pzTail,
      );
    },
  }));
  const memoryUsed = setupMemoryUsed(deps);
  const database = getOrThrow(createSqliteDatabase(deps)({ type: "Memory" }));
  assertOk(database.exec("create table t(a not null)"));
  prepareFlags.length = 0;
  const runs = (index: number) => {
    assertOk(database.run("select * from t where a = ?", [number(index)]));
    assertErr(database.run("insert into t values (null)", []), {
      type: "SqliteError",
      operation: "step",
      extendedCode: SQLITE_CONSTRAINT_NOTNULL,
      message: "NOT NULL constraint failed: t.a",
      sqlOffset: null,
      cause: null,
    });
    assertErr(database.run("select ?", []), {
      type: "SqliteParameterCountError",
      expected: 1,
      actual: 0,
    });
    // Text longer than 30 bytes, SQLite's minimum, fails to bind. The limit
    // shortens error messages too, so it is restored.
    const length = sqlite3_limit(deps)(db, SQLITE_LIMIT_LENGTH, 30);
    assertErr(database.run("select ?", ["x".repeat(31)]), {
      type: "SqliteError",
      operation: "bind",
      extendedCode: SQLITE_TOOBIG,
      message: "string or blob too big",
      sqlOffset: null,
      cause: null,
    });
    sqlite3_limit(deps)(db, SQLITE_LIMIT_LENGTH, length);
  };

  assertEqual(
    database.run("insert into t values (?), (?) returning a", [
      number(1),
      number(2),
    ]),
    ok({ rows: [{ a: 1 }, { a: 2 }], changes: 2 }),
  );
  assertEqual(prepareFlags, [0]);
  // The first text bound grows the scratch memory, which then keeps its size.
  runs(0);
  const used = memoryUsed();
  for (let index = 1; index < 20; index++) runs(index);
  assertEqual(memoryUsed(), used);
  assertErr(database.run("select 1; select 2", []), {
    type: "SqliteMultipleStatementsError",
  });
});

test("a prepared statement iterates its rows as null-prototype objects, steps no row past the one onRow stops at, and runs again", async () => {
  const t = await setupCallbackDatabase();
  const select = getOrThrow(t.database.prepare("select a, cb() as c from t"));
  let steps = 0;
  t.setCallback(() => {
    steps++;
  });

  const rows: Array<SqliteRow> = [];
  assertOk(
    select.iterate([], (row) => {
      rows.push(row);
      return rows.length < 2;
    }),
  );

  assertEqual(rows, [
    { a: 1, c: 1 },
    { a: 2, c: 1 },
  ]);
  assertSame(Object.getPrototypeOf(rows[0]), null);
  assertSame(steps, 2);
  // The iteration reset the statement, so it runs again from the first row.
  assertEqual(
    select.run([]),
    ok({
      rows: [1, 2, 3, 4, 5].map((a) => ({ a, c: 1 })),
      changes: 0,
    }),
  );
  select[Symbol.dispose]();
  t.database[Symbol.dispose]();
});

test("a prepared statement iterates every row when onRow does not stop it, with its parameters bound, and fails with SqliteParameterCountError without stepping", async () => {
  const t = await setupCallbackDatabase();
  const select = getOrThrow(
    t.database.prepare("select a, cb() as c from t where a > ?"),
  );
  let steps = 0;
  t.setCallback(() => {
    steps++;
  });

  const rows: Array<SqliteRow> = [];
  assertOk(
    select.iterate([number(2)], (row) => {
      rows.push(row);
      return true;
    }),
  );
  assertEqual(
    rows,
    [3, 4, 5].map((a) => ({ a, c: 1 })),
  );

  steps = 0;
  assertErr(
    select.iterate([], () => true),
    { type: "SqliteParameterCountError", expected: 1, actual: 0 },
  );
  assertSame(steps, 0);
  select[Symbol.dispose]();
  t.database[Symbol.dispose]();
});

test("iterate fails with the failed step's error after passing the rows before it, and the statement iterates again", async () => {
  const { database } = await setupSqliteDatabase();
  assertOk(
    database.exec("create table t(a); insert into t values (1), (2), (3), (4)"),
  );
  // abs() of the smallest integer overflows, which fails the third row's step.
  const select = getOrThrow(
    database.prepare(
      "select a, case when a = 3 then abs(-9223372036854775807 - 1) else 0 end as b from t",
    ),
  );

  for (let attempt = 0; attempt < 2; attempt++) {
    const rows: Array<SqliteRow> = [];
    assertErr(
      select.iterate([], (row) => {
        rows.push(row);
        return true;
      }),
      {
        type: "SqliteError",
        operation: "step",
        extendedCode: SQLITE_ERROR,
        message: "integer overflow",
        sqlOffset: null,
        cause: null,
      },
    );
    assertEqual(rows, [
      { a: 1, b: 0 },
      { a: 2, b: 0 },
    ]);
  }
});

test("iterate fails with the step's error, with the sqlOffset that the reset after it clears", async () => {
  const { database } = await setupSqliteDatabase();
  assertOk(database.exec("create table t(a, b); insert into t values (1, 2)"));
  const select = getOrThrow(database.prepare("select a, b from t"));
  // The step re-prepares the statement, which no longer parses.
  assertOk(database.exec("alter table t drop column b"));
  const rows: Array<SqliteRow> = [];

  assertErr(
    select.iterate([], (row) => {
      rows.push(row);
      return true;
    }),
    {
      type: "SqliteError",
      operation: "step",
      extendedCode: SQLITE_ERROR,
      message: "no such column: b",
      sqlOffset: 10,
      cause: null,
    },
  );
  assertEqual(rows, []);
  select[Symbol.dispose]();
});

test("iterate resets its statement and rethrows when onRow throws, and the instance and the statement keep working", async () => {
  const t = await setupCallbackDatabase();
  const select = getOrThrow(t.database.prepare("select a from t"));
  const thrown = new Error("onRow failed");

  assertThrows(
    () =>
      select.iterate([], () => {
        throw thrown;
      }),
    (error) => {
      assertSame(error, thrown);
    },
  );

  assertFalse(t.sqliteWasm.isBroken());
  assertEqual(
    select.run([]),
    ok({ rows: [1, 2, 3, 4, 5].map((a) => ({ a })), changes: 0 }),
  );
  select[Symbol.dispose]();
  t.database[Symbol.dispose]();
});

test("a statement run, iterated or disposed from onRow of its own iteration throws before entering wasm, and the statement keeps working", async () => {
  const t = await setupCallbackDatabase();
  const select = getOrThrow(t.database.prepare("select a from t"));

  for (const reenter of [
    () => select.run([]),
    () => select.iterate([], () => true),
    () => {
      select[Symbol.dispose]();
    },
  ])
    assertThrows(
      () =>
        select.iterate([], () => {
          reenter();
          return true;
        }),
      (error) => {
        assertInstanceOf(error, Error);
        assertEqual(error.message, runningStatementMessage);
      },
    );

  assertFalse(t.sqliteWasm.isBroken());
  assertEqual(select.run([]).ok, true);
  select[Symbol.dispose]();
  t.database[Symbol.dispose]();
});

test("onRow can run other statements on the same database, and a database disposed from onRow throws before entering wasm and is disposed later", async () => {
  const t = await setupCallbackDatabase();
  assertOk(t.database.exec("create table u(a)"));
  const select = getOrThrow(t.database.prepare("select a from t"));
  const insert = getOrThrow(t.database.prepare("insert into u values (?)"));

  assertOk(
    select.iterate([], (row) => {
      assertOk(insert.run([row.a as FiniteNumber]));
      assertOk(t.database.exec("update u set a = a"));
      return true;
    }),
  );
  assertEqual(
    t.database.run("select count(*) as count from u", []),
    ok({ rows: [{ count: 5 }], changes: 0 }),
  );

  assertThrows(
    () =>
      select.iterate([], () => {
        t.database[Symbol.dispose]();
        return true;
      }),
    (error) => {
      assertInstanceOf(error, Error);
      assertEqual(error.message, runningDatabaseMessage);
    },
  );
  assertFalse(t.sqliteWasm.isBroken());
  insert[Symbol.dispose]();
  select[Symbol.dispose]();
  t.database[Symbol.dispose]();
});

test("iterate lets a throw from onRow that broke the instance escape at once, so SQLite is not entered again, not even to reset the statement", async () => {
  let resets = 0;
  const deps = await setupSqliteWasmWith((sqliteWasm) => ({
    sqlite3_column_type: (pStmt, iCol) =>
      iCol === 1
        ? (6 as SqliteDataType)
        : sqliteWasm.exports.sqlite3_column_type(pStmt, iCol),
    sqlite3_reset: (pStmt) => {
      resets++;
      return sqliteWasm.exports.sqlite3_reset(pStmt);
    },
  }));
  const database = getOrThrow(createSqliteDatabase(deps)({ type: "Memory" }));
  const select = getOrThrow(database.prepare("select 1 as a"));
  resets = 0;

  assertThrows(
    () =>
      select.iterate([], () => {
        // Its second column breaks the instance.
        database.run("select 1 as a, 2 as b", []);
        return true;
      }),
    (thrown) => {
      assertInstanceOf(thrown, Error);
      assertEqual(thrown.message, "exhaustiveCheck unhandled case: 6");
    },
  );
  assertTrue(deps.sqliteWasm.isBroken());
  assertSame(resets, 0);
});

test("a nested call that broke the instance ends iterate with the instance's refusal, also when onRow caught what it threw, and iterate enters SQLite no more", async () => {
  for (const onDatabase of [false, true])
    for (const continues of [false, true]) {
      let broken = false;
      const callsAfterBreak: Array<string> = [];
      const deps = await setupSqliteWasmWith((sqliteWasm) => ({
        sqlite3_column_type: (pStmt, iCol) => {
          if (iCol !== 1)
            return sqliteWasm.exports.sqlite3_column_type(pStmt, iCol);
          broken = true;
          return 6 as SqliteDataType;
        },
        sqlite3_step: (pStmt) => {
          if (broken) callsAfterBreak.push("step");
          return sqliteWasm.exports.sqlite3_step(pStmt);
        },
        sqlite3_reset: (pStmt) => {
          if (broken) callsAfterBreak.push("reset");
          return sqliteWasm.exports.sqlite3_reset(pStmt);
        },
        sqlite3_finalize: (pStmt) => {
          if (broken) callsAfterBreak.push("finalize");
          return sqliteWasm.exports.sqlite3_finalize(pStmt);
        },
      }));
      const database = getOrThrow(
        createSqliteDatabase(deps)({ type: "Memory" }),
      );
      assertOk(
        database.exec("create table t(a); insert into t values (1), (2), (3)"),
      );
      const select = getOrThrow(database.prepare("select a from t"));
      // Its second column breaks the instance, and onRow carries on.
      const onRow = () => {
        try {
          database.run("select 1 as a, 2 as b", []);
        } catch (error) {
          assertInstanceOf(error, Error);
        }
        return continues;
      };

      assertThrows(
        () =>
          onDatabase
            ? database.iterate("select a from t", [], onRow)
            : select.iterate([], onRow),
        (thrown) => {
          assertInstanceOf(thrown, Error);
          assertEqual(
            thrown.message,
            "The SQLite wasm instance is broken: an exception escaped a wasm call.",
          );
          assertInstanceOf(thrown.cause, Error);
          assertEqual(
            thrown.cause.message,
            "exhaustiveCheck unhandled case: 6",
          );
        },
      );
      assertTrue(deps.sqliteWasm.isBroken());
      assertEqual(callsAfterBreak, []);
    }
});

test("iterate stopped before the last row reports a commit failure of a write with RETURNING, as run does, and the write is rolled back", async () => {
  const { database } = await setupSqliteDatabase();
  assertOk(
    database.exec(
      "pragma foreign_keys = on; create table p(id integer primary key); create table c(pid references p(id) deferrable initially deferred)",
    ),
  );
  const sql = "insert into c values (1), (2) returning pid";
  const insert = getOrThrow(database.prepare(sql));
  const failure = {
    type: "SqliteError",
    operation: "step",
    extendedCode: SQLITE_CONSTRAINT_FOREIGNKEY,
    message: "FOREIGN KEY constraint failed",
    sqlOffset: null,
    cause: null,
  } as const;

  // The commit runs in the reset after onRow stops at the first row.
  assertErr(
    insert.iterate([], () => false),
    failure,
  );
  assertErr(
    database.iterate(sql, [], () => false),
    failure,
  );
  assertErr(insert.run([]), failure);

  assertEqual(
    database.run("select count(*) as count from c", []),
    ok({ rows: [{ count: 0 }], changes: 0 }),
  );
  // A query stopped early has nothing to commit.
  assertOk(database.iterate("select 1 union all select 2", [], () => false));
});

test("iterate frees the values above 64 KiB it bound, also when onRow stops it or throws", async () => {
  const deps = await setupSqliteWasm();
  const memoryUsed = setupMemoryUsed(deps);
  const database = getOrThrow(createSqliteDatabase(deps)({ type: "Memory" }));
  const statement = getOrThrow(
    database.prepare(
      "select length(?) as blob from (select 1 union all select 2)",
    ),
  );
  // NULL takes no memory.
  assertOk(statement.run([null]));
  const baseline = memoryUsed();

  assertOk(statement.iterate([new Uint8Array(70_000)], () => false));
  const afterStop = memoryUsed();
  assertThrows(
    () =>
      statement.iterate([new Uint8Array(70_000)], () => {
        throw new Error("onRow failed");
      }),
    (thrown) => {
      assertInstanceOf(thrown, Error);
    },
  );
  const afterThrow = memoryUsed();

  assertEqual([afterStop, afterThrow], [baseline, baseline]);
});

test("iterate on the database prepares one statement without SQLITE_PREPARE_PERSISTENT, iterates it and finalizes it, also when it fails or onRow throws", async () => {
  const prepareFlags: Array<number> = [];
  const deps = await setupSqliteWasmWith((sqliteWasm) => ({
    sqlite3_prepare_v3: (pDb, zSql, nByte, prepFlags, ppStmt, pzTail) => {
      prepareFlags.push(prepFlags);
      return sqliteWasm.exports.sqlite3_prepare_v3(
        pDb,
        zSql,
        nByte,
        prepFlags,
        ppStmt,
        pzTail,
      );
    },
  }));
  const memoryUsed = setupMemoryUsed(deps);
  const database = getOrThrow(createSqliteDatabase(deps)({ type: "Memory" }));
  assertOk(
    database.exec(
      "create table t(a not null); insert into t values (1), (2), (3)",
    ),
  );
  prepareFlags.length = 0;
  const iterates = () => {
    const rows: Array<SqliteRow> = [];
    assertOk(
      database.iterate("select a from t where a > ?", [number(1)], (row) => {
        rows.push(row);
        return false;
      }),
    );
    assertEqual(rows, [{ a: 2 }]);
    assertErr(
      database.iterate("insert into t values (null)", [], () => true),
      {
        type: "SqliteError",
        operation: "step",
        extendedCode: SQLITE_CONSTRAINT_NOTNULL,
        message: "NOT NULL constraint failed: t.a",
        sqlOffset: null,
        cause: null,
      },
    );
    assertErr(
      database.iterate("select ?", [], () => true),
      {
        type: "SqliteParameterCountError",
        expected: 1,
        actual: 0,
      },
    );
    assertThrows(
      () =>
        database.iterate("select a from t", [], () => {
          throw new Error("onRow failed");
        }),
      (error) => {
        assertInstanceOf(error, Error);
        assertEqual(error.message, "onRow failed");
      },
    );
  };

  iterates();
  assertEqual(prepareFlags, [0, 0, 0, 0]);
  const used = memoryUsed();
  for (let index = 0; index < 20; index++) iterates();
  assertEqual(memoryUsed(), used);
  assertErr(
    database.iterate("select 1; select 2", [], () => true),
    { type: "SqliteMultipleStatementsError" },
  );
  database[Symbol.dispose]();
});

// tester1.c-pp.js 'sqlite3.oo1' 'Table t', 'selectArray/Object()',
// 'selectArrays/Objects()' and 'selectArray/Object/Values() via
// INSERT/UPDATE...RETURNING'.
test("tester1's table t: inserts, selects with bound values and aliases, RETURNING, and table_info", async () => {
  const { database } = await setupSqliteDatabase();
  assertOk(database.exec("CREATE TABLE t(a,b);"));
  const run = (sql: string, parameters: ReadonlyArray<SqliteValue> = []) =>
    getOrThrow(database.run(sql, parameters));

  assertEqual(
    run("INSERT INTO t(a,b) VALUES(1,2),(3,4),(?,?)", [number(5), number(6)])
      .changes,
    3,
  );
  assertEqual(run("INSERT INTO t(a,b) values('blob',X'6869') RETURNING 13"), {
    rows: [{ 13: 13 }],
    changes: 1,
  });
  assertEqual(run("select a from t order by a limit 2").rows, [
    { a: 1 },
    { a: 3 },
  ]);
  assertEqual(run("select b from t where a='blob'").rows, [
    { b: Uint8Array.of(0x68, 0x69) },
  ]);
  assertEqual(run("select a, b from t where a=?", [number(5)]).rows, [
    { a: 5, b: 6 },
  ]);
  assertEqual(run("select a, b from t where b=-1").rows, []);
  assertEqual(run("select a A, b b from t where b=?", [number(6)]).rows, [
    { A: 5, b: 6 },
  ]);
  const sql = "select a, b from t where a=? or b=? order by a";
  assertEqual(run(sql, [number(1), number(4)]).rows, [
    { a: 1, b: 2 },
    { a: 3, b: 4 },
  ]);
  assertEqual(run(sql, [number(99), number(99)]).rows, []);
  assertEqual(run("INSERT INTO t(a,b) VALUES(83,84) RETURNING a as AA").rows, [
    { AA: 83 },
  ]);
  assertEqual(run("UPDATE T set a=85 WHERE a=83 RETURNING b as BB"), {
    rows: [{ BB: 84 }],
    changes: 1,
  });
  const updated = run(
    "UPDATE T set a=a*1 WHERE typeof(a) = 'integer' RETURNING a",
  );
  assertEqual(updated.changes, 4);
  assertEqual(
    updated.rows.map(({ a }) => a),
    [1, 3, 5, 85],
  );
  assertEqual(
    run("pragma table_info('t')").rows.map(({ name }) => name),
    ["a", "b"],
  );
});

// wa-sqlite test/api_statements.js 'should bind collection array' and
// 'should return null for a NULL text column'.
test("wa-sqlite's collection: five positional values of every type, and a NULL column named NULL", async () => {
  const { database } = await setupSqliteDatabase();
  const statement = getOrThrow(database.prepare("VALUES (?, ?, ?, ?, ?)"));
  const blob = Uint8Array.of(8, 6, 7, 5, 3, 0, 9);

  assertEqual(statement.parameterCount, 5);
  assertEqual(
    statement.run([blob, number(Math.PI), number(42), null, "foobar"]),
    ok({
      rows: [
        {
          column1: blob,
          column2: Math.PI,
          column3: 42,
          column4: null,
          column5: "foobar",
        },
      ],
      changes: 0,
    }),
  );
  assertEqual(
    database.run("SELECT NULL", []),
    ok({ rows: [{ NULL: null }], changes: 0 }),
  );
});

// wa-sqlite test/api_statements.js 'should allow unscoped lifetime' and the
// driver's 'prepared statements are cached and reused'.
test("a prepared statement runs again and again with other values, and disposing it and then its database closes cleanly", async () => {
  const deps = await setupSqliteWasm();
  const memoryUsed = setupMemoryUsed(deps);
  getOrThrow(createSqliteDatabase(deps)({ type: "Memory" }))[Symbol.dispose]();
  const baseline = memoryUsed();
  const database = getOrThrow(createSqliteDatabase(deps)({ type: "Memory" }));
  assertOk(
    database.exec(
      "CREATE TABLE t AS VALUES ('foo', 0), ('bar', 1), ('baz', 2)",
    ),
  );
  const select = getOrThrow(
    database.prepare("SELECT column2 FROM t WHERE column1 = ?"),
  );
  const insert = getOrThrow(database.prepare("INSERT INTO t VALUES (?, ?)"));

  assertEqual(select.run(["foo"]), ok({ rows: [{ column2: 0 }], changes: 0 }));
  assertEqual(select.run(["bar"]), ok({ rows: [{ column2: 1 }], changes: 0 }));
  for (const [index, name] of ["qux", "quux"].entries())
    assertEqual(
      insert.run([name, number(index + 3)]),
      ok({ rows: [], changes: 1 }),
    );
  assertEqual(
    database.run("SELECT column1 FROM t ORDER BY column2", []),
    ok({
      rows: ["foo", "bar", "baz", "qux", "quux"].map((column1) => ({
        column1,
      })),
      changes: 0,
    }),
  );
  select[Symbol.dispose]();
  insert[Symbol.dispose]();
  database[Symbol.dispose]();
  assertEqual(memoryUsed(), baseline);
});

// wa-sqlite test/sql_0001.js 'should rollback a transaction'.
test("wa-sqlite's sql_0001: a transaction rolled back in a later call leaves the earlier rows", async () => {
  const { database } = await setupSqliteDatabase();
  const count = () =>
    getOrThrow(database.run("SELECT COUNT(*) AS n FROM foo", [])).rows;
  assertOk(
    database.exec(`
      CREATE TABLE foo (x PRIMARY KEY);
      INSERT INTO foo VALUES ('foo'), ('bar'), ('baz');
    `),
  );
  assertEqual(count(), [{ n: 3 }]);

  assertOk(
    database.exec(`
      BEGIN TRANSACTION;
      WITH RECURSIVE cnt(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM cnt LIMIT 100)
      INSERT INTO foo SELECT * FROM cnt;
    `),
  );
  assertEqual(count(), [{ n: 103 }]);
  assertOk(database.exec("ROLLBACK"));

  assertEqual(count(), [{ n: 3 }]);
  assertEqual(
    database.run("PRAGMA integrity_check", []),
    ok({ rows: [{ integrity_check: "ok" }], changes: 0 }),
  );
});

// wa-sqlite test/sql_0002.js 'should vacuum to minimize page count'.
test("wa-sqlite's sql_0002: VACUUM lowers the page count after most rows are deleted", async () => {
  const { database } = await setupSqliteDatabase();
  const pageCount = () => {
    const [row] = getOrThrow(database.run("PRAGMA page_count", [])).rows;
    assertTrue(typeof row?.page_count === "number");
    return row.page_count;
  };
  assertOk(
    database.exec(`
      CREATE TABLE t AS
      WITH RECURSIVE cnt(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM cnt LIMIT 10000)
      SELECT x FROM cnt;
      DELETE FROM t WHERE x > 10;
    `),
  );
  const before = pageCount();

  assertOk(database.exec("VACUUM"));

  assertTrue(pageCount() < before);
  assertEqual(
    database.run("PRAGMA integrity_check", []),
    ok({ rows: [{ integrity_check: "ok" }], changes: 0 }),
  );
});

// wa-sqlite #87 and #243: deep SQL recursion.
test("a compound SELECT of 500 terms runs, and 501 terms fail with SQLite's limit and no position, in run and in exec after another statement, leaving the database usable", async () => {
  const { database } = await setupSqliteDatabase();
  const compound = (terms: number) =>
    Array.from({ length: terms }, (_, index) => `SELECT ${index}`).join(
      " UNION ALL ",
    );

  assertEqual(getOrThrow(database.run(compound(500), [])).rows.length, 500);
  assertErr(database.run(compound(501), []), {
    type: "SqliteError",
    operation: "prepare",
    extendedCode: SQLITE_ERROR,
    message: "too many terms in compound SELECT",
    sqlOffset: null,
    cause: null,
  });
  assertErr(database.exec(`select 1; ${compound(501)}`), {
    type: "SqliteError",
    operation: "exec",
    extendedCode: SQLITE_ERROR,
    message: "too many terms in compound SELECT",
    sqlOffset: null,
    cause: null,
  });
  assertEqual(
    database.run("SELECT 1 AS a", []),
    ok({ rows: [{ a: 1 }], changes: 0 }),
  );
});

for (const { operation, target } of [
  { operation: "open", target: "sqlite3_open_v2" },
  { operation: "open", target: "sqlite3_malloc" },
  { operation: "prepare", target: "sqlite3_prepare_v3" },
  { operation: "exec", target: "sqlite3_prepare_v3" },
  { operation: "exec", target: "sqlite3_step" },
  { operation: "export", target: "sqlite3_set_errmsg" },
  { operation: "export", target: "sqlite3_serialize" },
] as const)
  test(`${operation} latches a direct ${target} trap before cleanup enters C`, async () => {
    const trap = new WebAssembly.RuntimeError("unreachable");
    let armed = false;
    let trapped = false;
    let allocations = 0;
    const callsAfterTrap: Array<string> = [];
    const deps = await setupSqliteWasmWith(({ exports }) =>
      Object.fromEntries(
        Object.entries(exports).map(([name, fn]) => [
          name,
          (...args: ReadonlyArray<number | bigint>) => {
            if (trapped) {
              callsAfterTrap.push(name);
              return 0;
            }
            if (
              armed &&
              name === target &&
              // The filename allocation follows the owned scratch allocation.
              (target !== "sqlite3_malloc" || ++allocations === 2)
            ) {
              trapped = true;
              throw trap;
            }
            return Reflect.apply(
              fn as (...args: ReadonlyArray<number | bigint>) => unknown,
              undefined,
              args,
            );
          },
        ]),
      ),
    );
    const database = getOrThrow(createSqliteDatabase(deps)({ type: "Memory" }));
    const statement = getOrThrow(database.prepare("SELECT 1"));
    armed = true;

    assertThrows(
      () => {
        switch (operation) {
          case "open":
            createSqliteDatabase(deps)({ type: "Memory" });
            break;
          case "prepare":
            database.prepare("SELECT 1");
            break;
          case "exec":
            database.exec("SELECT 1");
            break;
          case "export":
            database.export();
            break;
          default:
            exhaustiveCheck(operation);
        }
      },
      (thrown) => {
        assertSame(thrown, trap);
      },
    );

    assertTrue(deps.sqliteWasm.isBroken());
    assertEqual(callsAfterTrap, []);
    for (const invoke of [
      () => database.exec("SELECT 1"),
      () => statement[Symbol.dispose](),
      () => database[Symbol.dispose](),
    ])
      assertThrows(invoke, (thrown) => {
        assertInstanceOf(thrown, Error);
      });
    assertEqual(callsAfterTrap, []);
  });

for (const operation of ["open", "exec"] as const)
  test(`${operation} frees nothing after a nested call broke the instance`, async () => {
    const trap = new WebAssembly.RuntimeError("unreachable");
    let armed = false;
    let trapped = false;
    const callsAfterTrap: Array<string> = [];
    const deps = await setupSqliteWasmWith(({ exports }) =>
      Object.fromEntries(
        Object.entries(exports).map(([name, fn]) => [
          name,
          (...args: ReadonlyArray<number | bigint>) => {
            if (trapped) {
              callsAfterTrap.push(name);
              return 0;
            }
            if (armed && name === "sqlite3_prepare_v3") {
              trapped = true;
              throw trap;
            }
            return Reflect.apply(
              fn as (...args: ReadonlyArray<number | bigint>) => unknown,
              undefined,
              args,
            );
          },
        ]),
      ),
    );
    const other = getOrThrow(createSqliteDatabase(deps)({ type: "Memory" }));
    const runNested = () => {
      armed = true;
      other.run("select 1", []);
    };
    const name = getOrThrow(allocCString(deps)("nested"));
    const {
      pointers: [xFunc, xEntryPoint],
    } = installWasmFunctions(deps)([
      { signature: "v(pip)", fn: runNested },
      {
        signature: "i(ppp)",
        fn: (db: SqliteDbPtr) => {
          if (operation === "open") runNested();
          return sqlite3_create_function_v2(deps)(
            db,
            name,
            0,
            SQLITE_UTF8,
            0,
            xFunc,
            0,
            0,
            0,
          );
        },
      },
    ]);
    assertEqual(sqlite3_auto_extension(deps)(xEntryPoint), SQLITE_OK);
    let invoke: () => unknown;
    if (operation === "open")
      invoke = () => createSqliteDatabase(deps)({ type: "Memory" });
    else {
      const database = getOrThrow(
        createSqliteDatabase(deps)({ type: "Memory" }),
      );
      sqlite3_reset_auto_extension(deps)();
      invoke = () => database.exec("select nested()");
    }

    assertThrows(invoke, (thrown) => {
      assertSame(thrown, trap);
    });

    assertTrue(deps.sqliteWasm.isBroken());
    assertEqual(callsAfterTrap, []);
  });

test("an encrypted open latches a key-allocation trap before freeing its filename and scratch memory", async () => {
  const t = await setupSahPool();
  const trap = new WebAssembly.RuntimeError("unreachable");
  const { exports } = t.sqliteWasm;
  let allocations = 0;
  let trapped = false;
  let freesAfterTrap = 0;
  const deps = {
    ...t,
    sqliteWasm: {
      ...t.sqliteWasm,
      exports: {
        ...exports,
        sqlite3_malloc: (size: number) => {
          // The scratch and filename allocations precede the staged key.
          if (++allocations === 3) {
            trapped = true;
            throw trap;
          }
          return exports.sqlite3_malloc(size);
        },
        sqlite3_free: (pointer: SqliteOwnedPtr | 0) => {
          if (trapped) {
            freesAfterTrap++;
            return;
          }
          exports.sqlite3_free(pointer);
        },
      },
    },
  };

  assertThrows(
    () =>
      createSqliteDatabase(deps)({
        type: "EncryptedFile",
        vfs: t.pool,
        path: SqliteVfsPath.orThrow("/key-allocation.db"),
        key: EncryptionKey.orThrow(new Uint8Array(32).fill(7)),
      }),
    (thrown) => {
      assertSame(thrown, trap);
    },
  );

  assertEqual(allocations, 3);
  assertTrue(t.sqliteWasm.isBroken());
  assertEqual(freesAfterTrap, 0);
});

test("exec frees nothing after SQL overflows SQLite's C stack and throws the trap itself", async () => {
  let trapped = false;
  let freesAfterTrap = 0;
  const deps = await setupSqliteWasmWith(({ exports }) => ({
    sqlite3_prepare_v3: (db, zSql, nByte, prepFlags, ppStmt, pzTail) => {
      try {
        return exports.sqlite3_prepare_v3(
          db,
          zSql,
          nByte,
          prepFlags,
          ppStmt,
          pzTail,
        );
      } catch (error) {
        trapped = true;
        throw error;
      }
    },
    sqlite3_free: (pointer) => {
      if (trapped) {
        freesAfterTrap++;
        return;
      }
      exports.sqlite3_free(pointer);
    },
  }));
  const database = getOrThrow(createSqliteDatabase(deps)({ type: "Memory" }));
  assertOk(
    database.exec(
      Array.from({ length: 601 }, (_, i) =>
        i === 0
          ? "CREATE TABLE t0(x);"
          : `CREATE TABLE t${i}(x);
             CREATE TRIGGER g${i} AFTER INSERT ON t${i - 1}
             BEGIN INSERT INTO t${i} VALUES (new.x); END;`,
      ).join("\n"),
    ),
  );

  assertThrows(
    () => database.exec("INSERT INTO t0 VALUES (1)"),
    (thrown) => {
      assertInstanceOf(thrown, WebAssembly.RuntimeError);
      assertEqual(thrown.message, "SQLite's C stack overflowed.");
    },
  );

  assertTrue(deps.sqliteWasm.isBroken());
  assertTrue(trapped);
  assertEqual(freesAfterTrap, 0);
});

test("disposing a database on a broken instance frees none of its memory and finalizes none of the statements its skiplist functions keep, because no C runs on a broken instance", async () => {
  const calls: Array<string> = [];
  const deps = await setupSqliteWasmWith((sqliteWasm) => {
    const exports = sqliteWasm.exports as SqliteCExports & EvoluCExports;
    return {
      sqlite3_free: (pointer) => {
        calls.push("sqlite3_free");
        exports.sqlite3_free(pointer);
      },
      sqlite3_finalize: (pStmt) => {
        calls.push("sqlite3_finalize");
        return exports.sqlite3_finalize(pStmt);
      },
      evolu_skiplist_finalize: (db) => {
        calls.push("evolu_skiplist_finalize");
        exports.evolu_skiplist_finalize(db);
      },
    };
  });
  const database = getOrThrow(createSqliteDatabase(deps)({ type: "Memory" }));
  assertOk(database.exec(skiplistInsertSql));
  trapEveryOpen(deps);
  assertThrows(
    () => createSqliteDatabase(deps)({ type: "Memory" }),
    (thrown) => {
      assertInstanceOf(thrown, WebAssembly.RuntimeError);
    },
  );
  calls.length = 0;

  assertThrows(
    () => {
      database[Symbol.dispose]();
    },
    (thrown) => {
      assertInstanceOf(thrown, Error);
    },
  );

  assertEqual(calls, []);
});

test("a trap escaping a database call breaks the instance: it is rethrown, and every later call on any database of the instance throws without entering wasm", async () => {
  const { database, ...deps } = await setupSqliteDatabase();
  const statement = getOrThrow(database.prepare("SELECT 1"));
  trapEveryOpen(deps);

  const trapped = trySync(() => createSqliteDatabase(deps)({ type: "Memory" }));

  assertErr(trapped);
  const trap = trapped.error;
  assertInstanceOf(trap, WebAssembly.RuntimeError);
  for (const call of [
    () => createSqliteDatabase(deps)({ type: "Memory" }),
    () => database.prepare("SELECT 1"),
    () => database.run("SELECT 1", []),
    () => database.exec("SELECT 1"),
    () => database.export(),
    () => database.isAutocommit(),
    () => statement.run([]),
    () => {
      statement[Symbol.dispose]();
    },
  ])
    assertThrows(call, (thrown) => {
      assertInstanceOf(thrown, Error);
      assertSame(thrown.cause, trap);
    });
  // Its close is refused, and its scratch memory isn't freed.
  assertThrows(
    () => {
      database[Symbol.dispose]();
    },
    (thrown) => {
      assertInstanceOf(thrown, Error);
      assertSame(thrown.cause, trap);
    },
  );
});

test("disposing a database on a broken instance throws only its close refusal also with statements open, which then refuse their own disposal", async () => {
  const { database, ...deps } = await setupSqliteDatabase();
  const statements = [
    getOrThrow(database.prepare("SELECT 1")),
    getOrThrow(database.prepare("SELECT 2")),
  ];
  trapEveryOpen(deps);
  const trapped = trySync(() => createSqliteDatabase(deps)({ type: "Memory" }));
  assertErr(trapped);
  const trap = trapped.error;

  for (const disposable of [database, ...statements])
    assertThrows(
      () => {
        disposable[Symbol.dispose]();
      },
      (thrown) => {
        assertInstanceOf(thrown, Error);
        assertSame(thrown.cause, trap);
      },
    );
});

// evolu_codec_open rolls back a hot journal and reads the schema, so a trap
// there breaks the instance, and only an installed function lets a trap
// through, where a pool read that throws fails with SQLITE_IOERR_READ. So the
// pool's xRead is replaced with one that passes the 100-byte header read
// sqlite3_open_v2 makes through and traps on the next read: of a File
// database, page 1 in the schema read, and of an EncryptedFile database, the
// start of page 1, which the codec reads to decrypt it inside sqlite3_open_v2.
// Each database exists first, since the schema read of a new one reads
// nothing.
test("a trap inside evolu_codec_open breaks the instance before the open's deferred frees, so no C runs on the state the trap left, and an EncryptedFile database's staged key is zeroed anyway", async () => {
  const key = EncryptionKey.orThrow(new Uint8Array(32).fill(7));
  const path = SqliteVfsPath.orThrow("/evolu1.db");
  for (const { type, trappedRead, staged } of [
    { type: "File", trappedRead: 8192, staged: null },
    {
      type: "EncryptedFile",
      trappedRead: 18,
      staged: [key, new Uint8Array(key.length)],
    },
  ] as const) {
    const t = await setupSahPool();
    const options: SqliteDatabaseOptions =
      type === "File"
        ? { type, vfs: t.pool, path }
        : { type, vfs: t.pool, path, key };
    const created = getOrThrow(createSqliteDatabase(t)(options));
    assertOk(created.exec("CREATE TABLE t(a)"));
    created[Symbol.dispose]();
    const trap = new WebAssembly.RuntimeError("unreachable");
    let isTrapped = false;
    const reads: Array<readonly [number, number]> = [];
    const callsAfterTrap: Array<string> = [];
    const stagedKeys: Array<{
      readonly pointer: number;
      readonly bytes: Uint8Array;
    } | null> = [];
    const { pFile } = t.openFile(
      path,
      SQLITE_OPEN_READWRITE | SQLITE_OPEN_MAIN_DB,
    );
    const ioMethods = t.readPtr(pFile);
    assertEqual(t.callIo(pFile, "xClose"), SQLITE_OK);
    const { offset, signature } = sqlite3_io_methods_layout.members.xRead;
    const slot = (ioMethods + offset) as WasmPtr;
    const xRead = t.sqliteWasm.functionTable.get(t.readPtr(slot)) as (
      ...args: ReadonlyArray<number | bigint>
    ) => number;
    const {
      pointers: [trapping],
    } = installWasmFunctions(t)([
      {
        signature,
        fn: (file: number, buffer: number, amount: number, at: bigint) => {
          reads.push([amount, Number(at)]);
          if (reads.length === 1) return xRead(file, buffer, amount, at);
          isTrapped = true;
          throw trap;
        },
      },
    ]);
    t.sqliteWasm.getHeapDataView().setUint32(slot, trapping, true);
    const recordAfterTrap = (name: string) => {
      if (isTrapped) callsAfterTrap.push(name);
    };
    const exports = t.sqliteWasm.exports as SqliteCExports & EvoluCExports;
    const overrides: Partial<SqliteCExports & EvoluCExports> = {
      evolu_codec_open: (filename, ppDb, zVfs, zKey, flags) => {
        stagedKeys.push(
          zKey === 0
            ? null
            : {
                pointer: zKey,
                bytes: t.sqliteWasm.getHeapU8().slice(zKey, zKey + key.length),
              },
        );
        return exports.evolu_codec_open(filename, ppDb, zVfs, zKey, flags);
      },
      evolu_codec_take_failure: (db, pFailure) => {
        recordAfterTrap("evolu_codec_take_failure");
        return exports.evolu_codec_take_failure(db, pFailure);
      },
      sqlite3_free: (pointer) => {
        recordAfterTrap("sqlite3_free");
        exports.sqlite3_free(pointer);
      },
      sqlite3_close_v2: (db) => {
        recordAfterTrap("sqlite3_close_v2");
        return exports.sqlite3_close_v2(db);
      },
    };
    const deps = {
      ...t,
      sqliteWasm: { ...t.sqliteWasm, exports: { ...exports, ...overrides } },
    };

    assertThrows(
      () => createSqliteDatabase(deps)(options),
      (thrown) => {
        assertSame(thrown, trap);
      },
    );

    assertTrue(t.sqliteWasm.isBroken());
    assertEqual(reads, [
      [100, 0],
      [trappedRead, 0],
    ]);
    assertEqual(callsAfterTrap, []);
    assertEqual(
      stagedKeys.map(
        (stagedKey) =>
          stagedKey && [
            stagedKey.bytes,
            t.sqliteWasm
              .getHeapU8()
              .slice(stagedKey.pointer, stagedKey.pointer + key.length),
          ],
      ),
      [staged],
    );
  }
});

test("run throws and breaks the instance when SQLite returns a column type that is none of its five, rather than leave the column out of the row", async () => {
  const deps = await setupSqliteWasmWith((sqliteWasm) => ({
    sqlite3_column_type: (pStmt, iCol) =>
      iCol === 1
        ? (6 as SqliteDataType)
        : sqliteWasm.exports.sqlite3_column_type(pStmt, iCol),
  }));
  const database = getOrThrow(createSqliteDatabase(deps)({ type: "Memory" }));
  const statement = getOrThrow(database.prepare("select 1 as a, 2 as b"));

  assertThrows(
    () => statement.run([]),
    (thrown) => {
      assertInstanceOf(thrown, Error);
      assertEqual(thrown.message, "exhaustiveCheck unhandled case: 6");
    },
  );
  assertTrue(deps.sqliteWasm.isBroken());
});
