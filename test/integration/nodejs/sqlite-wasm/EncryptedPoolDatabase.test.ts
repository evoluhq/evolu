/**
 * `createSqliteDatabase` with EncryptedFile databases on a `SahPool`, on the
 * pinned binary over a fake OPFS.
 *
 * `PoolDatabase.test.ts` covers what a pool adds, and
 * `SahPoolEncryption.test.ts` the pool's encryption; these cover what an
 * EncryptedFile database adds: the key registered for the open and what happens
 * to its bytes, the reserved bytes as SQLite3 Multiple Ciphers had them,
 * secure_delete, which stays on, a wrong key, export, and recovery from an
 * encrypted hot journal, which an open without the key keeps.
 */

import {
  assert,
  assertEqual,
  assertEqualBytes,
  assertErr,
  assertFalse,
  assertInstanceOf,
  assertOk,
  assertThrows,
  assertTrue,
  EncryptionKey,
  getOrThrow,
  testCreateRun,
  type NonNegativeInt,
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
  SQLITE_NOMEM,
  SQLITE_NOTADB,
  sqlite3_vfs_layout,
} from "../../../../packages/sqlite-wasm/src/Constants.ts";
import {
  createEncryptedSqliteDatabase,
  createSqliteDatabase,
  SqliteVfsPath,
  type SqliteError,
} from "../../../../packages/sqlite-wasm/src/Database.ts";
import type {
  CStringPtr,
  WasmPtr,
} from "../../../../packages/sqlite-wasm/src/Pointer.ts";
import {
  OpfsName,
  openSahPool,
  sahPoolHeaderSize,
} from "../../../../packages/sqlite-wasm/src/SahPool.ts";
import type { SqliteWasm } from "../../../../packages/sqlite-wasm/src/Wasm.ts";
import { setupSahPool, type TestSahPool } from "./_sahPool.ts";
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
test("an EncryptedFile database refuses PRAGMA secure_delete set to anything but on, yes, true or 1, ignoring case, with SQLITE_ERROR and a message saying why, caused by the pool's SahPoolEncryptionUnsupportedError, keeping it on, while a File database turns it off", async () => {
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
        "Cannot turn secure_delete off for an encrypted database, because a freed page it does not write would fail to authenticate.",
      sqlOffset: null,
      cause: {
        method: "xFileControl",
        path: "/evolu1.db",
        error: { type: "SahPoolEncryptionUnsupported" },
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

test("an EncryptedFile database whose refusal of PRAGMA secure_delete = OFF gets no memory for its message fails with SQLITE_NOMEM", async () => {
  const t = await setupSahPool();
  let mallocFails = false;
  const { exports } = t.sqliteWasm;
  await using run = testCreateRun({
    ...t,
    opfsRoot: t.fake.opfsRoot,
    sqliteWasm: {
      ...t.sqliteWasm,
      exports: {
        ...exports,
        sqlite3_malloc: (byteLength: number) =>
          mallocFails ? 0 : exports.sqlite3_malloc(byteLength),
      },
    },
  });
  using pool = getOrThrow(
    await run(openSahPool({ directory: [OpfsName.orThrow(".other")] })),
  );
  using database = getOrThrow(
    createSqliteDatabase(t)({
      type: "EncryptedFile",
      vfs: pool,
      path: SqliteVfsPath.orThrow("/evolu1.db"),
      key: testKey,
    }),
  );
  mallocFails = true;

  const refused = database.exec("PRAGMA secure_delete = OFF");

  mallocFails = false;
  assertErr(refused, {
    type: "SqliteError",
    operation: "exec",
    extendedCode: SQLITE_NOMEM,
    message: "out of memory",
    sqlOffset: null,
    cause: null,
  });
  assertEqual(getOrThrow(database.run("PRAGMA secure_delete", [])).rows, [
    { secure_delete: 1 },
  ]);
});

test("an EncryptedFile database whose refusal of PRAGMA secure_delete = OFF grows memory for its message fails with the message, caused by the pool's SahPoolEncryptionUnsupportedError", async () => {
  const t = await setupSahPool();
  let mallocGrows = false;
  const { exports } = t.sqliteWasm;
  const heapByteLength = () => t.sqliteWasm.getHeapU8().buffer.byteLength;
  await using run = testCreateRun({
    ...t,
    opfsRoot: t.fake.opfsRoot,
    sqliteWasm: {
      ...t.sqliteWasm,
      exports: {
        ...exports,
        // As when the heap is full: allocating more than the whole heap makes
        // SQLite's allocator grow memory, which detaches every earlier view.
        sqlite3_malloc: (byteLength: number) => {
          if (mallocGrows)
            exports.sqlite3_free(exports.sqlite3_malloc(heapByteLength()));
          return exports.sqlite3_malloc(byteLength);
        },
      },
    },
  });
  using pool = getOrThrow(
    await run(openSahPool({ directory: [OpfsName.orThrow(".other")] })),
  );
  using database = getOrThrow(
    createSqliteDatabase(t)({
      type: "EncryptedFile",
      vfs: pool,
      path: SqliteVfsPath.orThrow("/evolu1.db"),
      key: testKey,
    }),
  );
  const before = heapByteLength();
  mallocGrows = true;

  const refused = database.exec("PRAGMA secure_delete = OFF");

  mallocGrows = false;
  assertTrue(heapByteLength() > before);
  assertErr(refused, {
    type: "SqliteError",
    operation: "exec",
    extendedCode: SQLITE_ERROR,
    message:
      "Cannot turn secure_delete off for an encrypted database, because a freed page it does not write would fail to authenticate.",
    sqlOffset: null,
    cause: {
      method: "xFileControl",
      path: "/evolu1.db",
      error: { type: "SahPoolEncryptionUnsupported" },
    },
  });
  assertEqual(t.reportDefect.getDefectsSnapshot(), []);
  assertEqual(getOrThrow(database.run("PRAGMA secure_delete", [])).rows, [
    { secure_delete: 1 },
  ]);
});

test("an EncryptedFile database with a wrong key fails to open with SQLITE_NOTADB, caused by the pool's SqlitePageAuthenticationError for page 1, whose error holds nothing of either key, and closes the file, so the pool can be disposed", async () => {
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
      method: "xRead",
      path: "/evolu1.db",
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
test("exporting an EncryptedFile database with a page that fails to authenticate fails with SQLITE_CORRUPT, caused by the pool's SqlitePageAuthenticationError, instead of zero-filling it, leaves no transaction open, also inside one the caller then rolls back, and once the page is restored exports what it did before", async () => {
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
      method: "xRead",
      path: "/evolu1.db",
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

/** Reads a file of the pool whole, as Latin-1 text. */
const readPoolFile = (t: TestSahPool, path: string): string =>
  latin1.decode(
    getOrThrow(
      t.pool.read(path, 0 as NonNegativeInt, (1 << 20) as NonNegativeInt),
    ),
  );

test("VACUUM INTO and ATTACH from an EncryptedFile database write an unencrypted file when no key is registered for its path, because SQLite ignores ATTACH's KEY clause and PRAGMA key, rekey and cipher, which change nothing", async () => {
  const t = await setupSahPool();
  using database = getOrThrow(openEncryptedDatabase(t));
  assertOk(
    database.exec(
      "CREATE TABLE t(a); INSERT INTO t VALUES ('plaintext marker')",
    ),
  );

  assertOk(database.exec("VACUUM INTO '/backup.db'"));
  assertOk(
    database.exec(
      "ATTACH '/attached.db' AS attached KEY 'secret'; CREATE TABLE attached.t(a); INSERT INTO attached.t VALUES ('attached marker'); DETACH attached",
    ),
  );
  assertOk(
    database.exec(
      "PRAGMA cipher = 'sqlcipher'; PRAGMA key = 'secret'; PRAGMA rekey = 'secret'",
    ),
  );

  const backup = readPoolFile(t, "/backup.db");
  assertTrue(backup.startsWith("SQLite format 3"));
  assertTrue(backup.includes("plaintext marker"));
  const attached = readPoolFile(t, "/attached.db");
  assertTrue(attached.startsWith("SQLite format 3"));
  assertTrue(attached.includes("attached marker"));
  using reopened = getOrThrow(openEncryptedDatabase(t));
  assertEqual(getOrThrow(reopened.run("SELECT a FROM t", [])).rows, [
    { a: "plaintext marker" },
  ]);
});

test("a key registered for a path while VACUUM INTO or ATTACH opens it encrypts the file, so VACUUM INTO writes an encrypted copy, which stays encrypted attached, while a file ATTACH creates fails its first write with SQLITE_IOERR_WRITE, because SQLite reserves no bytes in it", async () => {
  const t = await setupSahPool();
  using database = getOrThrow(openEncryptedDatabase(t));
  assertOk(
    database.exec(
      "CREATE TABLE t(a); INSERT INTO t VALUES ('plaintext marker')",
    ),
  );
  const backupPath = SqliteVfsPath.orThrow("/backup.db");

  {
    using _registration = t.pool.registerKey(backupPath, testKey);
    assertOk(database.exec("VACUUM INTO '/backup.db'"));
  }
  {
    using _registration = t.pool.registerKey(backupPath, testKey);
    assertOk(database.exec("ATTACH '/backup.db' AS backup"));
  }
  assertOk(
    database.exec(
      "INSERT INTO backup.t VALUES ('attached marker'); DETACH backup",
    ),
  );

  const backup = readPoolFile(t, backupPath);
  assertFalse(backup.includes("SQLite format 3"));
  assertFalse(backup.includes("marker"));
  using reopened = getOrThrow(openEncryptedDatabase(t, testKey, backupPath));
  assertEqual(getOrThrow(reopened.run("SELECT a FROM t", [])).rows, [
    { a: "plaintext marker" },
    { a: "attached marker" },
  ]);

  {
    using _registration = t.pool.registerKey(
      SqliteVfsPath.orThrow("/new.db"),
      testKey,
    );
    assertOk(database.exec("ATTACH '/new.db' AS new"));
  }
  assertErr(database.exec("CREATE TABLE new.t(a)"), {
    type: "SqliteError",
    operation: "exec",
    extendedCode: SQLITE_IOERR_WRITE,
    message: "disk I/O error",
    sqlOffset: null,
    cause: {
      method: "xWrite",
      path: "/new.db",
      error: { type: "SahPoolEncryptionUnsupported" },
    },
  });
  assertOk(database.exec("DETACH new"));
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

test("opening the encrypted database whose dead worker left a hot journal as a File database, without the key, fails with SQLITE_CANTOPEN, caused by the pool's SahPoolEncryptionUnsupportedError for the journal, which stays, so the EncryptedFile database then rolls it back wholly", async () => {
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
      method: "xOpen",
      path: "/evolu1.db-journal",
      error: { type: "SahPoolEncryptionUnsupported" },
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

// SQLite would strip the query, so the pool would open /secret.db without the
// key, which it registered for no path, and write it in plaintext.
test("an EncryptedFile database's path is a SqliteVfsPath, which rejects a SQLite URI such as file:secret.db?nolock=1, so no URI can open the database without its key in plaintext", async () => {
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

/**
 * A pool on a fresh instance, whose databases call the given exports in place
 * of the instance's, which can record calls or inject failures around them.
 */
const setupSahPoolWith = async (
  overrides: (sqliteWasm: SqliteWasm) => Partial<SqliteCExports>,
): Promise<TestSahPool> => {
  const t = await setupSahPool();
  const { sqliteWasm } = t;
  return {
    ...t,
    sqliteWasm: {
      ...sqliteWasm,
      exports: { ...sqliteWasm.exports, ...overrides(sqliteWasm) },
    },
  };
};

/** Whether the bytes occur anywhere in the instance's memory. */
const isInHeap = (t: TestSahPool, bytes: Uint8Array): boolean =>
  Buffer.from(t.sqliteWasm.getHeapU8().buffer).indexOf(bytes) !== -1;

test("the key never reaches SQLite's memory, also with a wrong key, the caller's key stays as it was, and the copies the pool takes of it are zeroed once the database is disposed", async () => {
  const copies: Array<Uint8Array> = [];
  class TrackedBytes extends Uint8Array {
    constructor(length: number) {
      super(length);
      copies.push(this);
    }
  }
  const tracked = new TrackedBytes(32);
  tracked.set(testKey);
  const key = EncryptionKey.orThrow(tracked);
  const t = await setupSahPool();

  const database = getOrThrow(openEncryptedDatabase(t, key));
  assertOk(database.exec("CREATE TABLE t(a)"));
  assertErr(openEncryptedDatabase(t, otherKey));

  assertEqual(isInHeap(t, testKey), false);
  assertEqual(isInHeap(t, otherKey), false);
  database[Symbol.dispose]();
  assertEqual(isInHeap(t, testKey), false);
  assertEqualBytes(key, testKey);
  assertTrue(copies.length >= 3);
  for (const copy of copies.slice(1))
    assertEqualBytes(copy, new Uint8Array(32));
});

test("an EncryptedFile database that fails to open leaves no key registered for its path, so the path opens unencrypted later", async () => {
  const t = await setupSahPool();
  const fillers = ["/1.db", "/2.db", "/3.db", "/4.db", "/5.db", "/6.db"].map(
    (path) =>
      getOrThrow(
        createSqliteDatabase(t)({
          type: "File",
          vfs: t.pool,
          path: SqliteVfsPath.orThrow(path),
        }),
      ),
  );

  assertErr(openEncryptedDatabase(t), {
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
  for (const filler of fillers) filler[Symbol.dispose]();
  // A database and its journal.
  assertOk(t.pool.unlink("/1.db"));
  assertOk(t.pool.unlink("/2.db"));
  const plain = getOrThrow(
    createSqliteDatabase(t)({
      type: "File",
      vfs: t.pool,
      path: SqliteVfsPath.orThrow("/evolu1.db"),
    }),
  );
  assertOk(plain.exec("CREATE TABLE t(a)"));
  plain[Symbol.dispose]();
  assertEqual(
    latin1.decode(
      getOrThrow(
        t.pool.read("/evolu1.db", 0 as NonNegativeInt, 15 as NonNegativeInt),
      ),
    ),
    "SQLite format 3",
  );
});

test("opening an EncryptedFile database while a key is registered for its path throws the pool's refusal before wasm is entered, so the instance keeps working and the path opens once the registration is disposed", async () => {
  const t = await setupSahPool();
  const other = getOrThrow(createSqliteDatabase(t)({ type: "Memory" }));

  {
    using _registration = t.pool.registerKey(
      SqliteVfsPath.orThrow("/evolu1.db"),
      testKey,
    );
    assertThrows(
      () => openEncryptedDatabase(t),
      (thrown) => {
        assertInstanceOf(thrown, Error);
        assertEqual(
          thrown.message,
          "A key is already registered for /evolu1.db.",
        );
      },
    );
  }

  assertFalse(t.sqliteWasm.isBroken());
  assertEqual(getOrThrow(other.run("SELECT 1 AS one", [])).rows, [{ one: 1 }]);
  other[Symbol.dispose]();
  using database = getOrThrow(openEncryptedDatabase(t));
  assertOk(database.exec("CREATE TABLE t(a)"));
});

test("an EncryptedFile database whose PRAGMA secure_delete fails, as when memory runs out, fails to open and closes the file", async () => {
  const t = await setupSahPoolWith((sqliteWasm) => ({
    sqlite3_prepare_v3: (db, zSql, nByte, prepFlags, ppStmt, pzTail) => {
      const sql = new TextDecoder().decode(
        sqliteWasm.getHeapU8().subarray(zSql, zSql + Math.max(0, nByte - 1)),
      );
      if (!sql.includes("secure_delete"))
        return sqliteWasm.exports.sqlite3_prepare_v3(
          db,
          zSql,
          nByte,
          prepFlags,
          ppStmt,
          pzTail,
        );
      // As SQLite records running out of memory.
      sqliteWasm.exports.sqlite3_set_errmsg(db, SQLITE_NOMEM, 0);
      return SQLITE_NOMEM;
    },
  }));

  const opened = openEncryptedDatabase(t);

  assertErr(opened);
  assertEqual(
    [opened.error.operation, opened.error.extendedCode],
    ["open", SQLITE_NOMEM],
  );
  t.pool[Symbol.dispose]();
});

test("an EncryptedFile database whose PRAGMA secure_delete fails to step, as when memory runs out, fails to open with the step's error and closes the file", async () => {
  let secureDelete = 0;
  const t = await setupSahPoolWith((sqliteWasm) => ({
    sqlite3_prepare_v3: (db, zSql, nByte, prepFlags, ppStmt, pzTail) => {
      const rc = sqliteWasm.exports.sqlite3_prepare_v3(
        db,
        zSql,
        nByte,
        prepFlags,
        ppStmt,
        pzTail,
      );
      const sql = new TextDecoder().decode(
        sqliteWasm.getHeapU8().subarray(zSql, zSql + Math.max(0, nByte - 1)),
      );
      if (sql.includes("secure_delete"))
        secureDelete = sqliteWasm.getHeapDataView().getInt32(ppStmt, true);
      return rc;
    },
    sqlite3_step: (pStmt) => {
      if (pStmt !== secureDelete) return sqliteWasm.exports.sqlite3_step(pStmt);
      // As SQLite records running out of memory.
      sqliteWasm.exports.sqlite3_set_errmsg(
        sqliteWasm.exports.sqlite3_db_handle(pStmt),
        SQLITE_NOMEM,
        0,
      );
      return SQLITE_NOMEM;
    },
  }));

  const opened = openEncryptedDatabase(t);

  assertErr(opened);
  assertEqual(
    [opened.error.operation, opened.error.extendedCode],
    ["open", SQLITE_NOMEM],
  );
  t.pool[Symbol.dispose]();
});
