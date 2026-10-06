import {
  assert,
  assertEqual,
  assertErr,
  assertFalse,
  assertOk,
  assertTrue,
  EncryptionKey,
  getOrThrow,
} from "@evolu/common";
import { test } from "node:test";
import { sqlite3_vfs_find } from "../../../../packages/sqlite-wasm/src/CApi.ts";
import {
  SQLITE_CONSTRAINT_DATATYPE,
  SQLITE_NOTADB,
  SQLITE_OPEN_DELETEONCLOSE,
  sqlite3_vfs_layout,
} from "../../../../packages/sqlite-wasm/src/Constants.ts";
import {
  createSqliteDatabase,
  SqliteVfsPath,
} from "../../../../packages/sqlite-wasm/src/Database.ts";
import type {
  CStringPtr,
  SqliteVfsPtr,
  WasmPtr,
} from "../../../../packages/sqlite-wasm/src/Pointer.ts";
import { installWasmFunctions } from "../../../../packages/sqlite-wasm/src/Wasm.ts";
import { setupSahPool } from "./_sahPool.ts";
import { readSqliteJsFile, setupSqliteJs, writePoolFile } from "./_sqliteJs.ts";
import {
  setupDatabase,
  setupSqliteWasm,
  sqliteWasmModule,
  type TestDatabase,
} from "./_sqliteWasm.ts";

/** Opens a Memory database on a fresh instance. */
const setupMemoryDatabase = async () =>
  getOrThrow(createSqliteDatabase(await setupSqliteWasm())({ type: "Memory" }));

test("the binary is SQLite's bare-bones configuration with JSON, math functions, in-memory temporary files and no WAL", async () => {
  using database = await setupMemoryDatabase();

  const { rows } = getOrThrow(database.run("PRAGMA compile_options", []));

  assertEqual(
    rows.map((row) => row.compile_options),
    [
      "ATOMIC_INTRINSICS=1",
      "COMPILER=clang-23.0.0",
      "DEFAULT_AUTOVACUUM",
      "DEFAULT_CACHE_SIZE=-16384",
      "DEFAULT_FILE_FORMAT=4",
      "DEFAULT_JOURNAL_SIZE_LIMIT=-1",
      "DEFAULT_MMAP_SIZE=0",
      "DEFAULT_PAGE_SIZE=8192",
      "DEFAULT_PCACHE_INITSZ=20",
      "DEFAULT_RECURSIVE_TRIGGERS",
      "DEFAULT_SECTOR_SIZE=4096",
      "DEFAULT_SYNCHRONOUS=2",
      "DEFAULT_WAL_AUTOCHECKPOINT=1000",
      "DEFAULT_WAL_SYNCHRONOUS=2",
      "DEFAULT_WORKER_THREADS=0",
      "DIRECT_OVERFLOW_READ",
      "DQS=0",
      "ENABLE_API_ARMOR",
      "ENABLE_MATH_FUNCTIONS",
      "MALLOC_SOFT_LIMIT=1024",
      "MAX_ATTACHED=10",
      "MAX_COLUMN=2000",
      "MAX_COMPOUND_SELECT=500",
      "MAX_DEFAULT_PAGE_SIZE=8192",
      "MAX_EXPR_DEPTH=1000",
      "MAX_FUNCTION_ARG=1000",
      "MAX_LENGTH=1000000000",
      "MAX_LIKE_PATTERN_LENGTH=50000",
      "MAX_MMAP_SIZE=0",
      "MAX_PAGE_COUNT=0xfffffffe",
      "MAX_PAGE_SIZE=65536",
      "MAX_SQL_LENGTH=1000000000",
      "MAX_TRIGGER_DEPTH=1000",
      "MAX_VARIABLE_NUMBER=32766",
      "MAX_VDBE_OP=250000000",
      "MAX_WORKER_THREADS=0",
      "MUTEX_OMIT",
      "OMIT_AUTHORIZATION",
      "OMIT_DEPRECATED",
      "OMIT_INCRBLOB",
      "OMIT_INTROSPECTION_PRAGMAS",
      "OMIT_LOAD_EXTENSION",
      "OMIT_PROGRESS_CALLBACK",
      "OMIT_SHARED_CACHE",
      "OMIT_UTF16",
      "OMIT_WAL",
      "STRICT_SUBTYPE",
      "SYSTEM_MALLOC",
      "TEMP_STORE=3",
      "THREADSAFE=0",
      "USE_URI",
    ],
  );
});

test("the binary has the JSON functions, window functions, upsert and STRICT tables Evolu uses", async () => {
  using database = await setupMemoryDatabase();
  getOrThrow(
    database.exec(
      "CREATE TABLE t(id INTEGER PRIMARY KEY, v TEXT) STRICT; INSERT INTO t VALUES (1, 'a'), (2, 'b')",
    ),
  );

  assertEqual(
    getOrThrow(
      database.run(
        "INSERT INTO t VALUES (2, 'c') ON CONFLICT(id) DO UPDATE SET v = excluded.v RETURNING v",
        [],
      ),
    ).rows,
    [{ v: "c" }],
  );
  assertEqual(
    getOrThrow(
      database.run(
        "SELECT id, row_number() OVER (ORDER BY id DESC) AS n FROM t ORDER BY id",
        [],
      ),
    ).rows,
    [
      { id: 1, n: 2 },
      { id: 2, n: 1 },
    ],
  );
  assertEqual(
    getOrThrow(
      database.run(
        "SELECT json_group_array(value) AS a, json_object('k', 1) ->> '$.k' AS k FROM json_each('[1,2]')",
        [],
      ),
    ).rows,
    [{ a: "[1,2]", k: 1 }],
  );
  const strict = database.run("INSERT INTO t VALUES (3, x'00')", []);
  assertErr(strict);
  assert(strict.error.type === "SqliteError", strict.error.type);
  assertEqual(
    [strict.error.extendedCode, strict.error.message],
    [SQLITE_CONSTRAINT_DATATYPE, "cannot store BLOB value in TEXT column t.v"],
  );
});

test("the binary has every SQL math function, which apps can call through Evolu's query builder", async () => {
  using database = await setupMemoryDatabase();

  const { rows } = getOrThrow(
    database.run(
      `SELECT acos(1), acosh(1), asin(0), asinh(0), atan(0), atan2(0, 1),
        atanh(0), ceil(1.2), ceiling(1.2), cos(0), cosh(0), degrees(pi()),
        exp(0), floor(-1.5), ln(1), log(100), log(2, 8), log10(1000), log2(8),
        mod(7, 3), pi(), pow(2, 10), power(2, 10), radians(180), sin(0),
        sinh(0), sqrt(16), tan(0), tanh(0), trunc(-1.5)`,
      [],
    ),
  );

  assertEqual(Object.values(rows[0] ?? {}), [
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    2,
    2,
    1,
    1,
    180,
    1,
    -2,
    0,
    2,
    3,
    3,
    3,
    1,
    Math.PI,
    1024,
    1024,
    Math.PI,
    0,
    0,
    4,
    0,
    0,
    -1,
  ]);
});

test("the binary has neither FTS5 nor R*Tree", async () => {
  using database = await setupMemoryDatabase();

  for (const [module, sql] of [
    ["fts5", "CREATE VIRTUAL TABLE f USING fts5(a)"],
    ["rtree", "CREATE VIRTUAL TABLE r USING rtree(id, x0, x1)"],
  ] as const) {
    const result = database.exec(sql);
    assertErr(result);
    assert(result.error.type === "SqliteError", result.error.type);
    assertEqual(result.error.message, `no such module: ${module}`);
  }
});

test("the binary exports no function of the session extension", () => {
  const exports = WebAssembly.Module.exports(sqliteWasmModule).map(
    ({ name }) => name,
  );

  assertTrue(exports.includes("sqlite3_open_v2"));
  assertFalse(
    exports.some((name) =>
      /^sqlite3(session|changeset|changegroup|rebaser)_/u.test(name),
    ),
  );
});

// opfs-sahpool tabs share the pool's directory, and 2.2.4 switches a database
// to WAL in exclusive locking mode.
test("a database whose header says WAL fails to open with SQLITE_NOTADB, and the instance keeps working", async () => {
  const sqliteJs = await setupSqliteJs();
  const walDatabase = new sqliteJs.oo1.DB("/wal.db", "c");
  walDatabase.exec(
    "PRAGMA locking_mode = EXCLUSIVE; PRAGMA journal_mode = WAL; CREATE TABLE t(a)",
  );
  walDatabase.close();
  const bytes = readSqliteJsFile(sqliteJs, "/wal.db");
  // Bytes 18 and 19, the file format versions, say WAL.
  assertEqual(bytes.subarray(18, 20), Uint8Array.of(2, 2));
  const t = await setupSahPool();
  writePoolFile(t, "/wal.db", bytes);

  assertErr(
    createSqliteDatabase(t)({
      type: "File",
      vfs: t.pool,
      path: SqliteVfsPath.orThrow("/wal.db"),
    }),
    {
      type: "SqliteError",
      operation: "open",
      extendedCode: SQLITE_NOTADB,
      message: "file is not a database",
      sqlOffset: null,
      cause: null,
    },
  );

  assertFalse(t.sqliteWasm.isBroken());
  using database = getOrThrow(
    createSqliteDatabase(t)({
      type: "File",
      vfs: t.pool,
      path: SqliteVfsPath.orThrow("/evolu1.db"),
    }),
  );
  assertOk(database.exec("CREATE TABLE t(a)"));
  assertEqual(t.reportDefect.getDefects(), []);
});

test("journal_mode = WAL keeps the delete journal, also in exclusive locking mode", async () => {
  const t = await setupSahPool();
  using database = getOrThrow(
    createSqliteDatabase(t)({
      type: "File",
      vfs: t.pool,
      path: SqliteVfsPath.orThrow("/wal.db"),
    }),
  );

  assertEqual(
    getOrThrow(database.run("PRAGMA locking_mode = EXCLUSIVE", [])).rows,
    [{ locking_mode: "exclusive" }],
  );
  assertEqual(getOrThrow(database.run("PRAGMA journal_mode = WAL", [])).rows, [
    { journal_mode: "delete" },
  ]);
});

/**
 * SQL that makes SQLite open temporary files and a -wal file when the build
 * lets it: with PRAGMA temp_store = FILE, a sort larger than the sorter's
 * memory, a temporary table larger than its cache and an index on it, a
 * statement journal larger than SQLite keeps in memory, which a statement that
 * can fail midway needs for pages the transaction changed before it, VACUUM,
 * and journal_mode = WAL in both locking modes.
 */
const temporaryFilesSql = `
  PRAGMA temp_store = FILE;
  PRAGMA cache_size = 10;
  CREATE TABLE t(a UNIQUE, b);
  WITH RECURSIVE c(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM c WHERE i < 30000)
    INSERT INTO t SELECT i, randomblob(100) FROM c;
  SELECT count(*) FROM (SELECT b FROM t ORDER BY b);
  CREATE TEMP TABLE temp_t(b);
  PRAGMA temp.cache_size = 10;
  INSERT INTO temp_t SELECT b FROM t;
  CREATE INDEX temp.temp_t_b ON temp_t(b);
  BEGIN;
  UPDATE t SET b = randomblob(100);
  UPDATE t SET a = a + 100000, b = randomblob(100);
  COMMIT;
  VACUUM;
  PRAGMA journal_mode = WAL;
  PRAGMA locking_mode = EXCLUSIVE;
  PRAGMA journal_mode = WAL;
  INSERT INTO t VALUES (-1, NULL);
`;

/**
 * Replaces the VFS's xOpen with one that records each file name, null for a
 * file without one, and the flags, and then calls the original.
 */
const recordOpens = (t: TestDatabase, vfs: SqliteVfsPtr) => {
  const opens: Array<{ readonly name: string | null; readonly flags: number }> =
    [];
  const { offset, signature } = sqlite3_vfs_layout.members.xOpen;
  const slot = (vfs + offset) as WasmPtr;
  const xOpen = t.sqliteWasm.functionTable.get(t.readPtr(slot)) as (
    ...args: ReadonlyArray<number>
  ) => number;
  const {
    pointers: [recording],
  } = installWasmFunctions(t)([
    {
      signature,
      fn: (
        pVfs: number,
        zName: number,
        pFile: number,
        flags: number,
        pOutFlags: number,
      ) => {
        opens.push({ name: t.text(zName as CStringPtr | 0), flags });
        return xOpen(pVfs, zName, pFile, flags, pOutFlags);
      },
    },
  ]);
  t.sqliteWasm.getHeapDataView().setUint32(slot, recording, true);
  return opens;
};

test("SQLite opens only the database and its rollback journal through the pool, never a DELETEONCLOSE, temporary or -wal file, also for an encrypted database", async () => {
  const key = EncryptionKey.orThrow(new Uint8Array(32).fill(7));
  for (const encrypted of [false, true]) {
    const t = await setupSahPool();
    const vfs = t.findVfs();
    assert(vfs !== 0, "The pool's VFS is not registered");
    const opens = recordOpens(t, vfs);
    const path = SqliteVfsPath.orThrow("/test.db");
    using database = getOrThrow(
      createSqliteDatabase(t)(
        encrypted
          ? { type: "EncryptedFile", vfs: t.pool, path, key }
          : { type: "File", vfs: t.pool, path },
      ),
    );

    assertOk(database.exec(temporaryFilesSql));

    assertEqual(
      opens.filter(({ flags }) => (flags & SQLITE_OPEN_DELETEONCLOSE) !== 0),
      [],
    );
    assertEqual(
      opens.filter(({ name }) => name !== path && name !== `${path}-journal`),
      [],
    );
    assertTrue(opens.some(({ name }) => name === `${path}-journal`));
  }
});

test("SQLite opens no file through the default VFS, so a Memory database keeps its temporary files in memory", async () => {
  const t = await setupDatabase();
  const vfs = sqlite3_vfs_find(t)(t.cString("evolu-memory"));
  assert(vfs !== 0, "evolu-memory is not registered");
  const opens = recordOpens(t, vfs);
  using database = getOrThrow(createSqliteDatabase(t)({ type: "Memory" }));

  assertOk(database.exec(temporaryFilesSql));

  assertEqual(opens, []);
});
