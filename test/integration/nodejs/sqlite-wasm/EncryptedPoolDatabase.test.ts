/**
 * `createSqliteDatabase` with EncryptedFile databases on a `SahPool`, on the
 * pinned binary over a fake OPFS.
 *
 * `PoolDatabase.test.ts` covers what a pool adds, and
 * `SahPoolEncryption.test.ts` Evolu's codec over the pool; these cover what an
 * EncryptedFile database adds: the open through `evolu_codec_open`, the key
 * staged for it and what happens to its bytes, the reserved bytes as SQLite3
 * Multiple Ciphers had them, secure_delete, which stays on, the keying pragmas,
 * ATTACH and VACUUM INTO, which the codec does not key, a wrong key, export,
 * the codec's failures, and recovery from an encrypted hot journal, which an
 * open without the key keeps.
 */

import {
  assert,
  assertEqual,
  assertEqualBytes,
  assertErr,
  assertFalse,
  assertOk,
  assertTrue,
  EncryptionKey,
  getOrThrow,
  testCreateDeps,
  type NonNegativeInt,
  type RandomBytes,
} from "@evolu/common";
import { test } from "node:test";
import {
  sqlite3_vfs_find,
  type SqliteCExports,
} from "../../../../packages/sqlite-wasm/src/CApi.ts";
import {
  SQLITE_CANTOPEN,
  SQLITE_CORRUPT,
  SQLITE_ERROR,
  SQLITE_IOERR_WRITE,
  SQLITE_MISUSE,
  SQLITE_NOMEM,
  SQLITE_NOTADB,
  SQLITE_READONLY,
  sqlite3_vfs_layout,
} from "../../../../packages/sqlite-wasm/src/Constants.ts";
import {
  createEncryptedSqliteDatabase,
  createSqliteDatabase,
  SqliteVfsPath,
  type SqliteError,
} from "../../../../packages/sqlite-wasm/src/Database.ts";
import type { EvoluCExports } from "../../../../packages/sqlite-wasm/src/EvoluCApi.ts";
import { copyWasmBytes } from "../../../../packages/sqlite-wasm/src/Memory.ts";
import type {
  CStringPtr,
  WasmPtr,
} from "../../../../packages/sqlite-wasm/src/Pointer.ts";
import { sahPoolHeaderSize } from "../../../../packages/sqlite-wasm/src/SahPool.ts";
import type { SqliteWasm } from "../../../../packages/sqlite-wasm/src/Wasm.ts";
import { setupSahPool, type TestSahPool } from "./_sahPool.ts";
import { setupMemoryUsed } from "./_sqliteWasm.ts";
import {
  setupSqliteJs,
  sqliteJsRawKeySql,
  writeSqliteJsFile,
} from "./_sqliteJs.ts";

const testKey = EncryptionKey.orThrow(
  Uint8Array.from({ length: 32 }, (_, index) => index * 7 + 1),
);

const otherKey = EncryptionKey.orThrow(
  Uint8Array.from({ length: 32 }, (_, index) => 255 - index * 3),
);

/**
 * Opens a path of the pool, `/evolu1.db` by default, as an EncryptedFile
 * database.
 */
const openEncryptedDatabase = (
  t: TestSahPool,
  key: EncryptionKey = testKey,
  path = "/evolu1.db",
) =>
  createSqliteDatabase(t)({
    type: "EncryptedFile",
    vfs: t.pool,
    path: SqliteVfsPath.orThrow(path),
    key,
  });

const latin1 = new TextDecoder("latin1");

test("an EncryptedFile database opens its path in the pool, exec, prepare and run work, and the file holds neither SQLite's header string nor the rows anywhere", async () => {
  const t = await setupSahPool();

  const database = getOrThrow(openEncryptedDatabase(t));

  assertOk(
    database.exec(
      "CREATE TABLE t(a); INSERT INTO t VALUES ('plaintext marker')",
    ),
  );
  const select = getOrThrow(database.prepare("SELECT a FROM t"));
  assertEqual(getOrThrow(select.run([])).rows, [{ a: "plaintext marker" }]);
  assertEqual(
    getOrThrow(database.run("INSERT INTO t VALUES (?)", ["second"])).changes,
    1,
  );
  assertEqual(t.pool.getPaths(), ["/evolu1.db"]);
  const file = getOrThrow(
    t.pool.read("/evolu1.db", 0 as NonNegativeInt, (1 << 20) as NonNegativeInt),
  );
  assertTrue(file.length > 0);
  assertEqual(latin1.decode(file).includes("SQLite format 3"), false);
  assertEqual(latin1.decode(file).includes("plaintext marker"), false);
  database[Symbol.dispose]();
});

test("an EncryptedFile database keeps its rows after it and its pool are disposed, for the pool a new instance opens on the same files with the same key", async () => {
  const t = await setupSahPool();
  const database = getOrThrow(openEncryptedDatabase(t));
  assertOk(database.exec("CREATE TABLE t(a); INSERT INTO t VALUES ('kept')"));
  database[Symbol.dispose]();
  t.pool[Symbol.dispose]();

  const next = await setupSahPool({ fake: t.fake });
  const reopened = getOrThrow(openEncryptedDatabase(next));

  assertEqual(getOrThrow(reopened.run("SELECT a FROM t", [])).rows, [
    { a: "kept" },
  ]);
  reopened[Symbol.dispose]();
});

/** Returns the names of the registered VFSes, the default first. */
const listVfsNames = (t: TestSahPool): ReadonlyArray<string> => {
  const names: Array<string> = [];
  for (
    let vfs = sqlite3_vfs_find(t)(0) as number;
    vfs !== 0;
    vfs = t.readPtr((vfs + sqlite3_vfs_layout.members.pNext.offset) as WasmPtr)
  )
    names.push(
      t.text(
        t.readPtr(
          (vfs + sqlite3_vfs_layout.members.zName.offset) as WasmPtr,
        ) as CStringPtr,
      ) ?? "",
    );
  return names;
};

test("an EncryptedFile database opens on the pool's own VFS, registering no other VFS, and 2.2.4 opens its file with the sqlcipher scheme and the raw key", async () => {
  const t = await setupSahPool();
  const vfsNames = listVfsNames(t);
  const database = getOrThrow(openEncryptedDatabase(t));
  assertOk(database.exec("CREATE TABLE t(a); INSERT INTO t VALUES ('row')"));
  database[Symbol.dispose]();

  assertEqual(listVfsNames(t), vfsNames);
  const sqliteJs = await setupSqliteJs();
  writeSqliteJsFile(
    sqliteJs,
    "/evolu1.db",
    getOrThrow(
      t.pool.read(
        "/evolu1.db",
        0 as NonNegativeInt,
        (1 << 20) as NonNegativeInt,
      ),
    ),
  );
  const reference = new sqliteJs.oo1.DB("/evolu1.db", "w");
  reference.exec(sqliteJsRawKeySql(testKey));
  assertEqual(reference.selectValue("SELECT a FROM t"), "row");
  reference.close();
});

// SQLite3 Multiple Ciphers turned secure_delete on for an encrypted
// connection and reserved the IV and the HMAC at the end of each page.
test("an EncryptedFile database turns secure_delete on, and a new one reserves 80 bytes at the end of each page, which page 1 stores unencrypted with the page size, 8192", async () => {
  const t = await setupSahPool();
  const database = getOrThrow(openEncryptedDatabase(t));
  assertOk(database.exec("CREATE TABLE t(a)"));

  assertEqual(getOrThrow(database.run("PRAGMA secure_delete", [])).rows, [
    { secure_delete: 1 },
  ]);
  database[Symbol.dispose]();
  const header = getOrThrow(
    t.pool.read("/evolu1.db", 16 as NonNegativeInt, 5 as NonNegativeInt),
  );
  assertEqual([...header], [0x20, 0, 1, 1, 80]);
  const reopened = getOrThrow(openEncryptedDatabase(t));
  assertEqual(getOrThrow(reopened.run("PRAGMA secure_delete", [])).rows, [
    { secure_delete: 1 },
  ]);
  reopened[Symbol.dispose]();
});

// With secure_delete off or FAST, SQLite does not write a page a transaction
// added and then freed, so the file keeps zeros there, which fail to
// authenticate when an export reads every page.
test("an EncryptedFile database refuses PRAGMA secure_delete set to anything but on, yes, true or 1, ignoring case, with SQLITE_ERROR and the codec's message saying why, caused by the codec's SqliteEncryptionUnsupportedError, keeping it on, while a File database turns it off", async () => {
  const t = await setupSahPool();
  const database = getOrThrow(openEncryptedDatabase(t));

  for (const sql of [
    "PRAGMA secure_delete = OFF",
    "PRAGMA secure_delete = FAST",
    "PRAGMA secure_delete = 0",
    "PRAGMA secure_delete = no",
    "PRAGMA secure_delete = false",
    "PRAGMA secure_delete = 2",
    "PRAGMA main.\"Secure_Delete\" = 'Off'",
  ])
    assertErr(database.exec(sql), {
      type: "SqliteError",
      operation: "exec",
      extendedCode: SQLITE_ERROR,
      message:
        "Cannot turn secure_delete off for an encrypted database, because a freed page it doesn't write would fail to authenticate.",
      sqlOffset: null,
      cause: {
        type: "SqliteCodecFailure",
        error: { type: "SqliteEncryptionUnsupported" },
      },
    });
  for (const value of ["ON", "on", "Yes", "TRUE", "1"])
    assertOk(database.exec(`PRAGMA secure_delete = ${value}`));
  assertEqual(getOrThrow(database.run("PRAGMA secure_delete", [])).rows, [
    { secure_delete: 1 },
  ]);
  database[Symbol.dispose]();
  const plain = getOrThrow(
    createSqliteDatabase(t)({
      type: "File",
      vfs: t.pool,
      path: SqliteVfsPath.orThrow("/plain.db"),
    }),
  );
  assertOk(plain.exec("PRAGMA secure_delete = OFF"));
  assertEqual(getOrThrow(plain.run("PRAGMA secure_delete", [])).rows, [
    { secure_delete: 0 },
  ]);
  plain[Symbol.dispose]();
});

test("an EncryptedFile database with a wrong key fails to open with SQLITE_NOTADB, caused by the codec's SqlitePageAuthenticationError for page 1, whose error holds nothing of either key, and closes the file, so the pool can be disposed", async () => {
  const t = await setupSahPool();
  const database = getOrThrow(openEncryptedDatabase(t));
  assertOk(database.exec("CREATE TABLE t(a); INSERT INTO t VALUES (1)"));
  database[Symbol.dispose]();

  const opened = openEncryptedDatabase(t, otherKey);

  assertErr(opened);
  assertEqual(opened.error, {
    type: "SqliteError",
    operation: "open",
    extendedCode: SQLITE_NOTADB,
    message: "file is not a database",
    sqlOffset: null,
    cause: {
      type: "SqliteCodecFailure",
      error: { type: "SqlitePageAuthenticationError", pageNumber: 1 },
    },
  });
  t.pool[Symbol.dispose]();
});

test("an EncryptedFile database opens through evolu_codec_open on the pool's codec, with its key staged in wasm memory and plaintext checksums, and zeroes the staging block before it frees it", async () => {
  const t = await setupSahPool();
  const exports = t.sqliteWasm.exports as SqliteCExports & EvoluCExports;
  const opens: Array<unknown> = [];
  const freedKeys: Array<Uint8Array> = [];
  let pKey = 0;
  const sqliteWasm: SqliteWasm = {
    ...t.sqliteWasm,
    exports: {
      ...exports,
      evolu_codec_open: (filename, ppDb, zVfs, key, flags) => {
        pKey = key;
        opens.push([
          t.text(filename),
          t.text(zVfs),
          key === 0 ? null : copyWasmBytes(t)(key, 32),
          flags,
        ]);
        return exports.evolu_codec_open(filename, ppDb, zVfs, key, flags);
      },
      sqlite3_free: (ptr) => {
        if (ptr !== 0 && ptr === pKey)
          freedKeys.push(copyWasmBytes(t)(ptr, 32));
        exports.sqlite3_free(ptr);
      },
    } satisfies SqliteCExports & EvoluCExports as SqliteCExports,
  };

  const database = getOrThrow(
    createSqliteDatabase({ ...t, sqliteWasm })({
      type: "EncryptedFile",
      vfs: t.pool,
      path: SqliteVfsPath.orThrow("/evolu1.db"),
      key: testKey,
    }),
  );

  // 2 is EVOLU_CODEC_PLAINTEXT_CHECKSUMS.
  assertEqual(opens, [
    ["/evolu1.db", t.pool.vfsName, Uint8Array.from(testKey), 2],
  ]);
  assertEqual(freedKeys, [new Uint8Array(32)]);
  database[Symbol.dispose]();
});

test("an EncryptedFile database whose key's staging block cannot be allocated fails to open with SQLITE_NOMEM before evolu_codec_open, freeing what the open allocated, and a later open succeeds", async () => {
  const t = await setupSahPool();
  const exports = t.sqliteWasm.exports as SqliteCExports & EvoluCExports;
  let isStagingFailing = false;
  let codecOpens = 0;
  const sqliteWasm: SqliteWasm = {
    ...t.sqliteWasm,
    exports: {
      ...exports,
      // The open allocates its scratch memory and the path with the pool's
      // name before the 32 bytes of the key.
      sqlite3_malloc: (byteLength) =>
        isStagingFailing && byteLength === testKey.length
          ? 0
          : exports.sqlite3_malloc(byteLength),
      evolu_codec_open: (filename, ppDb, zVfs, key, flags) => {
        codecOpens++;
        return exports.evolu_codec_open(filename, ppDb, zVfs, key, flags);
      },
    } satisfies SqliteCExports & EvoluCExports as SqliteCExports,
  };
  const deps = { ...t, sqliteWasm };
  const options = {
    type: "EncryptedFile",
    vfs: t.pool,
    path: SqliteVfsPath.orThrow("/evolu1.db"),
    key: testKey,
  } as const;
  // A first open allocates what SQLite keeps for the instance.
  getOrThrow(createSqliteDatabase(deps)(options))[Symbol.dispose]();
  const memoryUsed = setupMemoryUsed(t);
  const before = memoryUsed();
  codecOpens = 0;
  isStagingFailing = true;

  const opened = createSqliteDatabase(deps)(options);

  assertErr(opened, {
    type: "SqliteError",
    operation: "open",
    extendedCode: SQLITE_NOMEM,
    message: "out of memory",
    sqlOffset: null,
    cause: null,
  });
  assertEqual(codecOpens, 0);
  assertEqual(memoryUsed(), before);
  isStagingFailing = false;
  getOrThrow(createSqliteDatabase(deps)(options))[Symbol.dispose]();
});

// evolu_codec_open returns SQLITE_MISUSE while the connection reports
// SQLITE_OK for a keyed open that opened no file through a codec VFS, which a
// SqliteVfsPath never reaches, so the replaced open returns it for a wrong
// key. Closing the connection frees the codec's record.
test("an EncryptedFile database whose open returns another code than the connection reports fails with the returned code's description, caused by what the codec recorded during the open, taken before the close", async () => {
  const t = await setupSahPool();
  const created = getOrThrow(openEncryptedDatabase(t));
  assertOk(created.exec("CREATE TABLE t(a)"));
  created[Symbol.dispose]();
  const exports = t.sqliteWasm.exports as SqliteCExports & EvoluCExports;
  const sqliteWasm: SqliteWasm = {
    ...t.sqliteWasm,
    exports: {
      ...exports,
      evolu_codec_open: (filename, ppDb, zVfs, key, flags) => {
        assertEqual(
          exports.evolu_codec_open(filename, ppDb, zVfs, key, flags),
          SQLITE_NOTADB,
        );
        return SQLITE_MISUSE;
      },
    } satisfies SqliteCExports & EvoluCExports as SqliteCExports,
  };

  const opened = createSqliteDatabase({ ...t, sqliteWasm })({
    type: "EncryptedFile",
    vfs: t.pool,
    path: SqliteVfsPath.orThrow("/evolu1.db"),
    key: otherKey,
  });

  assertErr(opened, {
    type: "SqliteError",
    operation: "open",
    extendedCode: SQLITE_MISUSE,
    message: "bad parameter or other API misuse",
    sqlOffset: null,
    cause: {
      type: "SqliteCodecFailure",
      error: { type: "SqlitePageAuthenticationError", pageNumber: 1 },
    },
  });
  t.pool[Symbol.dispose]();
});

test("an EncryptedFile database exports its pages as plaintext, because they come through the pager", async () => {
  const t = await setupSahPool();
  const database = getOrThrow(openEncryptedDatabase(t));
  assertOk(
    database.exec(
      "CREATE TABLE t(a); INSERT INTO t VALUES ('plaintext marker')",
    ),
  );

  const bytes = getOrThrow(database.export());

  assertEqual(
    new TextDecoder().decode(bytes.subarray(0, 15)),
    "SQLite format 3",
  );
  assertTrue(latin1.decode(bytes).includes("plaintext marker"));
  const file = getOrThrow(
    t.pool.read("/evolu1.db", 0 as NonNegativeInt, (1 << 20) as NonNegativeInt),
  );
  assertEqual(bytes.length, file.length);
  database[Symbol.dispose]();
});

// sqlite3_serialize zero-fills a page that fails to read and reports success.
test("exporting an EncryptedFile database with a page that fails to authenticate fails with SQLITE_CORRUPT, caused by the codec's SqlitePageAuthenticationError, instead of zero-filling it, leaves no transaction open, also inside one the caller then rolls back, and once the page is restored exports what it did before", async () => {
  const t = await setupSahPool();
  const database = getOrThrow(openEncryptedDatabase(t));
  assertOk(
    database.exec(
      "CREATE TABLE t(a); WITH RECURSIVE c(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM c WHERE i < 300) INSERT INTO t SELECT 'marker' || i || zeroblob(1000) FROM c",
    ),
  );
  database[Symbol.dispose]();
  // The writer's cached pages differ in the bytes the cipher reserves.
  const exporter = getOrThrow(openEncryptedDatabase(t));
  const before = getOrThrow(exporter.export());
  exporter[Symbol.dispose]();
  const pageSize = 8192;
  assertTrue(before.length > 10 * pageSize);
  const databaseSlot = t.findSlotPath("/evolu1.db");
  const file = t.fake.readFile(databaseSlot);
  assert(file != null, "The database's slot exists.");
  const offset = sahPoolHeaderSize + 4 * pageSize + 200;
  file[offset] = (file[offset] ?? 0) ^ 0xff;
  t.fake.writeFile(databaseSlot, file);
  // The open reads only page 1.
  const reopened = getOrThrow(openEncryptedDatabase(t));
  const corrupt: SqliteError = {
    type: "SqliteError",
    operation: "export",
    extendedCode: SQLITE_CORRUPT,
    message: "database disk image is malformed",
    sqlOffset: null,
    cause: {
      type: "SqliteCodecFailure",
      error: { type: "SqlitePageAuthenticationError", pageNumber: 5 },
    },
  };

  // assertErr reports an unexpected Ok without printing its bytes.
  assertErr(reopened.export(), corrupt);
  assertTrue(reopened.isAutocommit());
  assertOk(reopened.exec("BEGIN"));
  assertErr(reopened.export(), corrupt);
  assertFalse(reopened.isAutocommit());
  assertOk(reopened.exec("ROLLBACK"));
  assertTrue(reopened.isAutocommit());

  file[offset] = (file[offset] ?? 0) ^ 0xff;
  t.fake.writeFile(databaseSlot, file);
  assertTrue(Buffer.from(getOrThrow(reopened.export())).equals(before));
  reopened[Symbol.dispose]();
});

test("a SqliteError's cause is never a codec failure an earlier operation that failed recorded, because each top-level operation drains the codec's records first", async () => {
  const t = await setupSahPool();
  const database = getOrThrow(openEncryptedDatabase(t));
  assertOk(
    database.exec(
      "CREATE TABLE t(a); WITH RECURSIVE c(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM c WHERE i < 300) INSERT INTO t SELECT 'marker' || i || zeroblob(1000) FROM c",
    ),
  );
  database[Symbol.dispose]();
  const databaseSlot = t.findSlotPath("/evolu1.db");
  const file = t.fake.readFile(databaseSlot);
  assert(file != null, "The database's slot exists.");
  const offset = sahPoolHeaderSize + 4 * 8192 + 200;
  file[offset] = (file[offset] ?? 0) ^ 0xff;
  t.fake.writeFile(databaseSlot, file);
  using reopened = getOrThrow(openEncryptedDatabase(t));
  const corrupt = reopened.run("SELECT count(*) FROM t WHERE a LIKE 'x%'", []);
  assertErr(corrupt);
  assert(corrupt.error.type === "SqliteError", corrupt.error.type);
  assertEqual(corrupt.error.cause, {
    type: "SqliteCodecFailure",
    error: { type: "SqlitePageAuthenticationError", pageNumber: 5 },
  });

  const later = reopened.run("SELECT * FROM missing", []);

  assertErr(later);
  assert(later.error.type === "SqliteError", later.error.type);
  assertEqual(later.error.cause, null);
});

/**
 * Leaves an EncryptedFile database whose first freelist trunk page fails to
 * authenticate, which `PRAGMA integrity_check` reads and reports in its rows
 * while it succeeds, so the codec records a failure that no error takes.
 */
const setupDamagedFreelist = (t: TestSahPool): void => {
  const database = getOrThrow(openEncryptedDatabase(t));
  assertOk(
    database.exec(
      "CREATE TABLE t(a); WITH RECURSIVE c(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM c WHERE i < 300) INSERT INTO t SELECT 'marker' || i || zeroblob(1000) FROM c; DELETE FROM t WHERE rowid > 100",
    ),
  );
  // Page 1's header stores the first freelist trunk page at byte 32.
  const exported = getOrThrow(database.export());
  const trunk = new DataView(exported.buffer, exported.byteOffset).getUint32(
    32,
  );
  assertTrue(trunk > 1);
  database[Symbol.dispose]();
  const databaseSlot = t.findSlotPath("/evolu1.db");
  const file = t.fake.readFile(databaseSlot);
  assert(file != null, "The database's slot exists.");
  const offset = sahPoolHeaderSize + (trunk - 1) * 8192 + 200;
  file[offset] = (file[offset] ?? 0) ^ 0xff;
  t.fake.writeFile(databaseSlot, file);
};

// The drain moves the codec's record out of C, which only an error would
// otherwise take.
test("a SqliteError's cause is never a codec failure an earlier operation that succeeded recorded, as PRAGMA integrity_check does for a page that fails to authenticate", async () => {
  const t = await setupSahPool();
  setupDamagedFreelist(t);
  using database = getOrThrow(openEncryptedDatabase(t));
  const check = getOrThrow(database.run("PRAGMA integrity_check", []));
  assertFalse(
    check.rows.some(({ integrity_check }) => integrity_check === "ok"),
  );

  const later = database.run("SELECT * FROM missing", []);

  assertErr(later);
  assert(later.error.type === "SqliteError", later.error.type);
  assertEqual(later.error.cause, null);
});

test("an iteration's later step error is never caused by a codec failure an operation onRow ran recorded, because the iteration drains the codec's records after onRow", async () => {
  const t = await setupSahPool();
  setupDamagedFreelist(t);
  using database = getOrThrow(openEncryptedDatabase(t));
  let rows = 0;

  // The second row overflows, which SQLite cannot compute before it steps.
  const iterated = database.iterate(
    "SELECT CASE WHEN column1 = 2 THEN abs(column1 - 9223372036854775807 - 3) ELSE column1 END AS v FROM (VALUES (1), (2))",
    [],
    () => {
      rows++;
      getOrThrow(database.run("PRAGMA integrity_check", []));
      return true;
    },
  );

  assertEqual(rows, 1);
  assertErr(iterated);
  assert(iterated.error.type === "SqliteError", iterated.error.type);
  assertEqual(
    [iterated.error.message, iterated.error.cause],
    ["integer overflow", null],
  );
});

test("a disposed EncryptedFile database leaves the pool's drains, so no later operation on the pool takes the codec's record of its closed connection", async () => {
  const t = await setupSahPool();
  const exports = t.sqliteWasm.exports as SqliteCExports & EvoluCExports;
  const takes: Array<number> = [];
  const sqliteWasm: SqliteWasm = {
    ...t.sqliteWasm,
    exports: {
      ...exports,
      evolu_codec_take_failure: (db, pFailure) => {
        takes.push(db);
        return exports.evolu_codec_take_failure(db, pFailure);
      },
    } satisfies SqliteCExports & EvoluCExports as SqliteCExports,
  };
  const open = (path: string) =>
    getOrThrow(
      createSqliteDatabase({ ...t, sqliteWasm })({
        type: "EncryptedFile",
        vfs: t.pool,
        path: SqliteVfsPath.orThrow(path),
        key: testKey,
      }),
    );
  const first = open("/a.db");
  takes.length = 0;
  assertOk(first.exec("CREATE TABLE a(x)"));
  const [disposed] = new Set(takes);
  assert(disposed != null, "The operation drained the database.");
  using second = open("/b.db");
  first[Symbol.dispose]();
  takes.length = 0;

  assertOk(second.exec("CREATE TABLE b(x)"));

  assertTrue(takes.length > 0);
  assertFalse(takes.includes(disposed));
});

test("an EncryptedFile database whose random source throws while it writes fails with SQLITE_IOERR_WRITE, caused by the codec's SqliteRandomSourceError, and reports what it threw as one defect", async () => {
  const deps = testCreateDeps();
  const error = new Error("no randomness");
  let isRandomFailing = false;
  const randomBytes = {
    create: (length: number) => {
      if (isRandomFailing) throw error;
      return deps.randomBytes.create(length);
    },
  } as RandomBytes;
  const t = await setupSahPool({ deps: { ...deps, randomBytes } });
  using database = getOrThrow(openEncryptedDatabase(t));
  assertOk(database.exec("CREATE TABLE t(a)"));

  isRandomFailing = true;
  const inserted = database.run("INSERT INTO t VALUES (1)", []);
  isRandomFailing = false;

  assertErr(inserted);
  assert(inserted.error.type === "SqliteError", inserted.error.type);
  assertEqual(inserted.error.extendedCode, SQLITE_IOERR_WRITE);
  assertEqual(inserted.error.cause, {
    type: "SqliteCodecFailure",
    error: { type: "SqliteRandomSourceError" },
  });
  assertEqual(t.reportDefect.getDefects(), [error]);
  assertEqual(
    getOrThrow(database.run("SELECT count(*) AS n FROM t", [])).rows,
    [{ n: 0 }],
  );
});

/** Reads a file of the pool whole, as Latin-1 text. */
const readPoolFile = (t: TestSahPool, path: string): string =>
  latin1.decode(
    getOrThrow(
      t.pool.read(path, 0 as NonNegativeInt, (1 << 20) as NonNegativeInt),
    ),
  );

// The codec keys only the main database, and SQLite ignores ATTACH's KEY
// clause, so the connection attaches other databases read-only and creates no
// file, while VACUUM INTO still writes.
test("VACUUM INTO from an EncryptedFile database writes a plaintext file, which ATTACH, ignoring its KEY clause, attaches read-only, while ATTACH of a missing file fails with SQLITE_CANTOPEN and creates no file", async () => {
  const t = await setupSahPool();
  using database = getOrThrow(openEncryptedDatabase(t));
  assertOk(
    database.exec(
      "CREATE TABLE t(a); INSERT INTO t VALUES ('plaintext marker')",
    ),
  );

  assertOk(database.exec("VACUUM INTO '/backup.db'"));
  assertOk(database.exec("ATTACH '/backup.db' AS backup KEY 'secret'"));
  assertEqual(getOrThrow(database.run("SELECT a FROM backup.t", [])).rows, [
    { a: "plaintext marker" },
  ]);
  assertErr(database.exec("INSERT INTO backup.t VALUES ('attached marker')"), {
    type: "SqliteError",
    operation: "exec",
    extendedCode: SQLITE_READONLY,
    message: "attempt to write a readonly database",
    sqlOffset: null,
    cause: null,
  });
  assertOk(database.exec("DETACH backup"));
  assertErr(database.exec("ATTACH '/attached.db' AS attached KEY 'secret'"), {
    type: "SqliteError",
    operation: "exec",
    extendedCode: SQLITE_CANTOPEN,
    message: "unable to open database: /attached.db",
    sqlOffset: null,
    cause: null,
  });

  const backup = readPoolFile(t, "/backup.db");
  assertTrue(backup.startsWith("SQLite format 3"));
  assertTrue(backup.includes("plaintext marker"));
  assertFalse(backup.includes("attached marker"));
  assertEqual(t.pool.getPaths(), ["/evolu1.db", "/backup.db"]);
});

// SQLite would ignore them, so a database keyed through SQL would be stored in
// plaintext, with the key in the SQL.
test("an EncryptedFile database refuses PRAGMA key, rekey, cipher and their variants with SQLITE_ERROR and the codec's message, caused by the codec's SqliteEncryptionUnsupportedError, and keeps its key", async () => {
  const t = await setupSahPool();
  const database = getOrThrow(openEncryptedDatabase(t));
  assertOk(database.exec("CREATE TABLE t(a); INSERT INTO t VALUES ('row')"));

  for (const sql of [
    "PRAGMA key = 'secret'",
    "PRAGMA hexkey = '00'",
    "PRAGMA textkey = 'secret'",
    "PRAGMA rekey = 'secret'",
    "PRAGMA hexrekey = '00'",
    "PRAGMA textrekey = 'secret'",
    "PRAGMA cipher = 'sqlcipher'",
    "PRAGMA main.Cipher_Compatibility = 4",
  ])
    assertErr(database.exec(sql), {
      type: "SqliteError",
      operation: "exec",
      extendedCode: SQLITE_ERROR,
      message:
        "Databases are keyed only through evolu_codec_open, never through SQL.",
      sqlOffset: null,
      cause: {
        type: "SqliteCodecFailure",
        error: { type: "SqliteEncryptionUnsupported" },
      },
    });

  database[Symbol.dispose]();
  using reopened = getOrThrow(openEncryptedDatabase(t));
  assertEqual(getOrThrow(reopened.run("SELECT a FROM t", [])).rows, [
    { a: "row" },
  ]);
});

// The scenario of CrashRecovery.test.ts with the transaction's pages and its
// journal encrypted.
test("opening an EncryptedFile database rolls back the encrypted hot journal its dead worker left, with no journal left", async () => {
  const t = await setupSahPool();
  const database = getOrThrow(openEncryptedDatabase(t));
  assertOk(
    database.exec(
      "CREATE TABLE t(a); WITH RECURSIVE c(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM c WHERE i < 300) INSERT INTO t SELECT 'marker' || zeroblob(3000) FROM c; PRAGMA cache_size = 10; BEGIN; UPDATE t SET a = 'changed' || randomblob(3000)",
    ),
  );
  // The worker dies: its instance is abandoned and its handles released.
  t.fake.releaseHandles();
  const next = await setupSahPool({ fake: t.fake });
  assertEqual(next.pool.getPaths(), ["/evolu1.db", "/evolu1.db-journal"]);
  const journal = getOrThrow(
    next.pool.read(
      "/evolu1.db-journal",
      0 as NonNegativeInt,
      (1 << 22) as NonNegativeInt,
    ),
  );
  assertTrue(journal.length > 8192);
  assertEqual(latin1.decode(journal).includes("marker"), false);

  const reopened = getOrThrow(openEncryptedDatabase(next));

  assertEqual(next.pool.getPaths(), ["/evolu1.db"]);
  assertEqual(
    getOrThrow(
      reopened.run(
        "SELECT count(*) AS n, sum(a = 'marker' || zeroblob(3000)) AS unchanged FROM t",
        [],
      ),
    ).rows,
    [{ n: 300, unchanged: 300 }],
  );
  assertEqual(getOrThrow(reopened.run("PRAGMA integrity_check", [])).rows, [
    { integrity_check: "ok" },
  ]);
  reopened[Symbol.dispose]();
});

// EvoluCApi.test.ts pins the C struct; this pins the binding's read of it.
test("opening with a wrong key the encrypted database whose hot journal's first record is numbered above 2^31 fails with SQLITE_CORRUPT, caused by the codec's SqlitePageAuthenticationError for that page number, read unsigned", async () => {
  const t = await setupSahPool();
  const database = getOrThrow(openEncryptedDatabase(t));
  assertOk(
    database.exec(
      "CREATE TABLE t(a); WITH RECURSIVE c(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM c WHERE i < 300) INSERT INTO t SELECT zeroblob(3000) FROM c; PRAGMA cache_size = 10; BEGIN; UPDATE t SET a = randomblob(3000)",
    ),
  );
  t.fake.releaseHandles();
  const next = await setupSahPool({ fake: t.fake });
  // The first record, past the header's sector.
  const journalSlot = next.findSlotPath("/evolu1.db-journal");
  const journal = next.fake.readFile(journalSlot);
  assert(journal != null, "The journal's slot exists.");
  const view = new DataView(
    journal.buffer,
    journal.byteOffset + sahPoolHeaderSize,
  );
  view.setUint32(view.getUint32(20), 0x89abcdef);
  next.fake.writeFile(journalSlot, journal);

  const opened = openEncryptedDatabase(next, otherKey);

  assertErr(opened);
  assert(opened.error.type === "SqliteError", opened.error.type);
  assertEqual(
    [opened.error.extendedCode, opened.error.cause],
    [
      SQLITE_CORRUPT,
      {
        type: "SqliteCodecFailure",
        error: {
          type: "SqlitePageAuthenticationError",
          pageNumber: 0x89abcdef,
        },
      },
    ],
  );
});

test("opening the encrypted database whose dead worker left a hot journal as a File database, without the key, fails with SQLITE_CANTOPEN, caused by the codec's SqliteEncryptionUnsupportedError, and the journal stays, so the EncryptedFile database then rolls it back wholly", async () => {
  const t = await setupSahPool();
  const database = getOrThrow(openEncryptedDatabase(t));
  assertOk(
    database.exec(
      "CREATE TABLE t(a); WITH RECURSIVE c(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM c WHERE i < 300) INSERT INTO t SELECT 'marker' || zeroblob(3000) FROM c; PRAGMA cache_size = 10; BEGIN; UPDATE t SET a = 'changed' || randomblob(3000)",
    ),
  );
  t.fake.releaseHandles();
  const next = await setupSahPool({ fake: t.fake });

  const plain = createSqliteDatabase(next)({
    type: "File",
    vfs: next.pool,
    path: SqliteVfsPath.orThrow("/evolu1.db"),
  });

  assertErr(plain, {
    type: "SqliteError",
    operation: "open",
    extendedCode: SQLITE_CANTOPEN,
    message: "unable to open database file",
    sqlOffset: null,
    cause: {
      type: "SqliteCodecFailure",
      error: { type: "SqliteEncryptionUnsupported" },
    },
  });
  assertEqual(next.pool.getPaths(), ["/evolu1.db", "/evolu1.db-journal"]);
  const reopened = getOrThrow(openEncryptedDatabase(next));
  assertEqual(next.pool.getPaths(), ["/evolu1.db"]);
  assertEqual(
    getOrThrow(
      reopened.run(
        "SELECT count(*) AS n, sum(a = 'marker' || zeroblob(3000)) AS unchanged FROM t",
        [],
      ),
    ).rows,
    [{ n: 300, unchanged: 300 }],
  );
  assertEqual(getOrThrow(reopened.run("PRAGMA integrity_check", [])).rows, [
    { integrity_check: "ok" },
  ]);
  reopened[Symbol.dispose]();
});

// SQLite would strip the query, so the pool would get another name than the
// database opened, and a vfs parameter could name a VFS other than the codec.
test("an EncryptedFile database's path is a SqliteVfsPath, which rejects a SQLite URI such as file:secret.db?nolock=1, so no URI can open the database by another name or on another VFS", async () => {
  const t = await setupSahPool();
  const value = "file:secret.db?nolock=1";

  assertErr(SqliteVfsPath.from.parent(value), {
    type: "SqliteVfsPath",
    value,
  });
  void (() =>
    createSqliteDatabase(t)({
      type: "EncryptedFile",
      vfs: t.pool,
      // @ts-expect-error An EncryptedFile database's path is a SqliteVfsPath, not a string.
      path: value,
      key: testKey,
    }));
  void (() =>
    createEncryptedSqliteDatabase({
      type: "EncryptedFile",
      vfs: t.pool,
      // @ts-expect-error An EncryptedFile database's path is a SqliteVfsPath, not a string.
      path: value,
      key: testKey,
    }));

  assertEqual(t.pool.getPaths(), []);
});

/** Whether the bytes occur anywhere in the instance's memory. */
const isInHeap = (t: TestSahPool, bytes: Uint8Array): boolean =>
  Buffer.from(t.sqliteWasm.getHeapU8().buffer).indexOf(bytes) !== -1;

// The codec keeps its copy of the key in wasm memory while the database is
// open, and the open zeroes the block it staged the key in.
test("the key is in wasm memory only while the database is open, so it is gone once the database is disposed, a wrong key is gone once its open failed, and the caller's key stays as it was", async () => {
  const key = EncryptionKey.orThrow(new Uint8Array(testKey));
  const t = await setupSahPool();

  const database = getOrThrow(openEncryptedDatabase(t, key));
  assertOk(database.exec("CREATE TABLE t(a)"));
  assertErr(openEncryptedDatabase(t, otherKey));

  assertTrue(isInHeap(t, testKey));
  assertFalse(isInHeap(t, otherKey));
  database[Symbol.dispose]();
  assertFalse(isInHeap(t, testKey));
  assertEqualBytes(key, testKey);
});
