/**
 * `SqliteVfs` and `SqliteEncryptingVfs`, what a database and a driver need from
 * a VFS, on the pinned binary over a fake OPFS.
 *
 * A `SahPool` is both, and File and EncryptedFile databases open through any
 * object that implements them, here one with only their members, each
 * delegating to a pool, so the database layer uses nothing else of the pool.
 */

import {
  assert,
  assertEqual,
  assertErr,
  assertFalse,
  assertOk,
  assertType,
  EncryptionKey,
  getOrThrow,
  type InferErr,
  type NonNegativeInt,
} from "@evolu/common";
import { test } from "node:test";
import {
  SQLITE_CORRUPT,
  SQLITE_NOTADB,
} from "../../../../packages/sqlite-wasm/src/Constants.ts";
import {
  createEncryptedSqliteDatabase,
  createSqliteDatabase,
  SqliteVfsPath,
  type SqliteEncryptingVfs,
  type SqlitePageAuthenticationError,
  type SqliteVfs,
  type SqliteVfsIoError,
} from "../../../../packages/sqlite-wasm/src/Database.ts";
import {
  sahPoolHeaderSize,
  type SahPool,
} from "../../../../packages/sqlite-wasm/src/SahPool.ts";
import { setupSahPool } from "./_sahPool.ts";

const testKey = EncryptionKey.orThrow(new Uint8Array(32).fill(7));

const otherKey = EncryptionKey.orThrow(new Uint8Array(32).fill(8));

/**
 * A VFS with only the members of {@link SqliteEncryptingVfs}, each delegating to
 * the pool.
 */
const delegateToPool = (pool: SahPool): SqliteEncryptingVfs => ({
  vfsName: pool.vfsName,
  getFailure: () => pool.getFailure(),
  clearFailure: () => {
    pool.clearFailure();
  },
  getPaths: () => pool.getPaths(),
  unlink: (path) => pool.unlink(path),
  registerKey: (path, key) => pool.registerKey(path, key),
});

test("a SahPool is a SqliteEncryptingVfs, which is a SqliteVfs, whose unlink fails with the VFS-neutral SqliteVfsIoError, and createEncryptedSqliteDatabase takes only a SahPool", () => {
  assertType<SahPool extends SqliteEncryptingVfs ? true : false, true>();
  assertType<SqliteEncryptingVfs extends SqliteVfs ? true : false, true>();
  assertType<InferErr<ReturnType<SqliteVfs["unlink"]>>, SqliteVfsIoError>();

  void ((vfs: SqliteEncryptingVfs) =>
    createEncryptedSqliteDatabase({
      type: "EncryptedFile",
      // @ts-expect-error createEncryptedSqliteDatabase takes only a SahPool, because 2.2.4 wrote only pool files and the fallback to its key reads the salt with SahPool.read.
      vfs,
      path: SqliteVfsPath.orThrow("/evolu1.db"),
      key: testKey,
    }));
});

test("registerKey takes the path as a SqliteVfsPath, the one spelling of the file a VFS opens, so a VFS registers it as it is", () => {
  assertType<
    Parameters<SqliteEncryptingVfs["registerKey"]>[0],
    SqliteVfsPath
  >();

  void ((vfs: SqliteEncryptingVfs) =>
    vfs.registerKey(
      // @ts-expect-error registerKey takes a SqliteVfsPath, not a string, which a VFS would have to normalize or ignore.
      "/evolu1.db",
      testKey,
    ));
});

test("a File and an EncryptedFile database open, read and write through a VFS with only the members of SqliteEncryptingVfs, which reports a wrong key's failure, and tells which files exist and deletes them", async () => {
  const t = await setupSahPool();
  const vfs = delegateToPool(t.pool);
  const fileVfs: SqliteVfs = vfs;

  const file = getOrThrow(
    createSqliteDatabase(t)({
      type: "File",
      vfs: fileVfs,
      path: SqliteVfsPath.orThrow("/file.db"),
    }),
  );
  assertOk(file.exec("CREATE TABLE t(a); INSERT INTO t VALUES ('file')"));
  assertEqual(getOrThrow(file.run("SELECT a FROM t", [])).rows, [
    { a: "file" },
  ]);
  assertEqual(
    new TextDecoder().decode(getOrThrow(file.export()).subarray(0, 15)),
    "SQLite format 3",
  );
  file[Symbol.dispose]();

  const encrypted = getOrThrow(
    createSqliteDatabase(t)({
      type: "EncryptedFile",
      vfs,
      path: SqliteVfsPath.orThrow("/encrypted.db"),
      key: testKey,
    }),
  );
  assertOk(
    encrypted.exec("CREATE TABLE t(a); INSERT INTO t VALUES ('encrypted')"),
  );
  assertEqual(getOrThrow(encrypted.run("SELECT a FROM t", [])).rows, [
    { a: "encrypted" },
  ]);
  encrypted[Symbol.dispose]();
  // The pool encrypted the file, so it does not start with SQLite's header.
  assertFalse(
    new TextDecoder("latin1").decode(
      getOrThrow(
        t.pool.read("/encrypted.db", 0 as NonNegativeInt, 15 as NonNegativeInt),
      ),
    ) === "SQLite format 3",
  );

  const wrongKey = createSqliteDatabase(t)({
    type: "EncryptedFile",
    vfs,
    path: SqliteVfsPath.orThrow("/encrypted.db"),
    key: otherKey,
  });
  assertErr(wrongKey);
  assertEqual(
    [wrongKey.error.extendedCode, wrongKey.error.cause],
    [
      SQLITE_NOTADB,
      {
        method: "xRead",
        path: "/encrypted.db",
        error: { type: "SqlitePageAuthenticationError", pageNumber: 1 },
      },
    ],
  );

  assertEqual(vfs.getPaths(), ["/file.db", "/encrypted.db"]);
  assertOk(vfs.unlink("/file.db"), true);
  assertOk(vfs.unlink("/file.db"), false);
  assertEqual(vfs.getPaths(), ["/encrypted.db"]);
  t.pool[Symbol.dispose]();
});

// sqlite3_serialize zero-fills a page that fails to read and reports success.
test("exporting an EncryptedFile database through a SqliteEncryptingVfs that records a SqlitePageAuthenticationError for a page fails with SQLITE_CORRUPT, so a database tells such a page from other failures by that VFS-neutral error alone", async () => {
  const t = await setupSahPool();
  const pageAuthenticationError: SqlitePageAuthenticationError = {
    type: "SqlitePageAuthenticationError",
    pageNumber: 5,
  };
  // Reports any failure of the pool as the VFS-neutral error, so nothing else
  // of what the pool records reaches the database.
  const vfs: SqliteEncryptingVfs = {
    ...delegateToPool(t.pool),
    getFailure: () => {
      const failure = t.pool.getFailure();
      return failure == null
        ? null
        : { ...failure, error: pageAuthenticationError };
    },
  };
  const open = () =>
    getOrThrow(
      createSqliteDatabase(t)({
        type: "EncryptedFile",
        vfs,
        path: SqliteVfsPath.orThrow("/evolu1.db"),
        key: testKey,
      }),
    );
  const database = open();
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
  // The open reads only page 1.
  const reopened = open();

  // assertErr reports an unexpected Ok without printing its bytes.
  assertErr(reopened.export(), {
    type: "SqliteError",
    operation: "export",
    extendedCode: SQLITE_CORRUPT,
    message: "database disk image is malformed",
    sqlOffset: null,
    cause: {
      method: "xRead",
      path: "/evolu1.db",
      error: pageAuthenticationError,
    },
  });
  reopened[Symbol.dispose]();
  t.pool[Symbol.dispose]();
});
