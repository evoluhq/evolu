/**
 * Encrypted databases that `@evolu/sqlite-wasm` 2.2.4 created, on the pinned
 * binary over a fake OPFS: `deriveLegacySqliteKey` and the fallback of
 * `createEncryptedSqliteDatabase`, with the pool's own encryption.
 *
 * `@evolu/web` keyed them with `PRAGMA cipher = 'sqlcipher'` and `PRAGMA key =
 * "x'<hex>'"`, which SQLite3 Multiple Ciphers 2.2.4, bundled in that release,
 * took as a passphrase. Deriving the key from it takes 256000 iterations, so
 * most tests create such databases with a fixed salt and the key `node:crypto`
 * derives: 2.2.4 writes page 1, keyed with `raw:` followed by the derived key
 * and the salt, and the pool continues the database with the derived key. A
 * test checks that 2.2.4 opens those databases with its passphrase, another
 * that a database 2.2.4 created with the passphrase opens with the derived key,
 * and another that 2.2.4 opens what the pool writes.
 */

import {
  assert,
  assertEqual,
  assertErr,
  assertTrue,
  bytesToHex,
  EncryptionKey,
  err,
  getOrThrow,
  hexToBytes,
  testCreateRun,
  type NonNegativeInt,
} from "@evolu/common";
import { pbkdf2Sync } from "node:crypto";
import { test } from "node:test";
import { sqlite3_close_v2 } from "../../../../packages/sqlite-wasm/src/CApi.ts";
import {
  SQLITE_CORRUPT,
  SQLITE_IOERR_READ,
  SQLITE_NOTADB,
  SQLITE_OK,
} from "../../../../packages/sqlite-wasm/src/Constants.ts";
import {
  createEncryptedSqliteDatabase,
  createSqliteDatabase,
  deriveLegacySqliteKey,
  SqliteVfsPath,
} from "../../../../packages/sqlite-wasm/src/Database.ts";
import type { SqliteDbPtr } from "../../../../packages/sqlite-wasm/src/Pointer.ts";
import {
  sahPoolHeaderSize,
  type SahPool,
} from "../../../../packages/sqlite-wasm/src/SahPool.ts";
import type { FakeOpfsCall } from "./_fakeOpfs.ts";
import { setupSahPool, type TestSahPool } from "./_sahPool.ts";
import {
  readSqliteJsFile,
  setupSqliteJs,
  sqliteJsRawKeySql,
  writePoolFile,
  writeSqliteJsFile,
} from "./_sqliteJs.ts";

const testKey = EncryptionKey.orThrow(
  Uint8Array.from({ length: 32 }, (_, index) => index * 7 + 1),
);

const testSalt = Uint8Array.from({ length: 16 }, (_, index) => 200 - index);

/** The key 2.2.4 derived, as `node:crypto` computes it. */
const deriveWithNodeCrypto = (key: Uint8Array, salt: Uint8Array) =>
  new Uint8Array(
    pbkdf2Sync(`x'${bytesToHex(key)}'`, salt, 256_000, 32, "sha512"),
  );

/**
 * Opens a path of the pool, `/evolu1.db` by default, as an EncryptedFile
 * database.
 */
const openEncryptedDatabase = (
  t: TestSahPool,
  key: EncryptionKey,
  path = "/evolu1.db",
) =>
  createSqliteDatabase(t)({
    type: "EncryptedFile",
    vfs: t.pool,
    path: SqliteVfsPath.orThrow(path),
    key,
  });

/**
 * Creates a database of the pool keyed as 2.2.4 keyed it, with the sqlcipher
 * scheme and the key derived from the key's `x'<hex>'` and the salt, and opens
 * it with the derived key. 2.2.4 writes its page 1, keyed with `raw:` followed
 * by the derived key and the salt. Returns the connection, which the caller
 * closes.
 */
const openLegacyKeyedDatabase = async (
  t: TestSahPool,
  key: EncryptionKey,
  salt: Uint8Array,
  path = "/evolu1.db",
): Promise<SqliteDbPtr> => {
  const derivedKey = EncryptionKey.orThrow(deriveWithNodeCrypto(key, salt));
  const sqliteJs = await setupSqliteJs();
  const created = new sqliteJs.oo1.DB("/legacy.db", "c");
  created.exec(
    `${sqliteJsRawKeySql(derivedKey, salt)} PRAGMA user_version = 0;`,
  );
  created.close();
  writePoolFile(t, path, readSqliteJsFile(sqliteJs, "/legacy.db"));
  const { rc, db } = (() => {
    using _registration = t.pool.registerKey(
      SqliteVfsPath.orThrow(path),
      derivedKey,
    );
    return t.openDatabase(path);
  })();
  assertEqual(rc, SQLITE_OK);
  return db;
};

/** The SQL `@evolu/web` 3.0.0 to 3.4.1 keyed an encrypted database with. */
const evoluWebKeySql = (key: Uint8Array) =>
  `PRAGMA cipher = 'sqlcipher'; PRAGMA key = "x'${bytesToHex(key)}'";`;

const subtleCrypto = crypto.subtle;

test("deriveLegacySqliteKey returns PBKDF2-HMAC-SHA512 with 256000 iterations and 32 bytes of x' followed by the key in lowercase hex and ', salted with the salt, as node:crypto computes it", async () => {
  await using run = testCreateRun({ subtleCrypto });
  const vectors = [
    [testKey, testSalt],
    [EncryptionKey.orThrow(new Uint8Array(32)), new Uint8Array(16)],
    [
      EncryptionKey.orThrow(new Uint8Array(32).fill(0xab)),
      new Uint8Array(16).fill(0xff),
    ],
  ] as const;

  for (const [key, salt] of vectors)
    assertEqual(
      await run.ok(deriveLegacySqliteKey(key, salt)),
      deriveWithNodeCrypto(key, salt),
    );

  // 2.2.4 created a database keyed with the key 0, 1, ..., 31, whose first
  // 16 bytes were this salt, and opened it again with this key passed raw.
  assertEqual(
    bytesToHex(
      await run.ok(
        deriveLegacySqliteKey(
          EncryptionKey.orThrow(Uint8Array.from({ length: 32 }, (_, i) => i)),
          hexToBytes("7a0d16c31a5ac7aab570a1f7fb7c5af5"),
        ),
      ),
    ),
    "62b1637fc61cbd38f0791158ebde53b53db8a8c12715f105597780b615303c95",
  );
});

test("deriveLegacySqliteKey zeroes the passphrase bytes it imports, and leaves the key and the salt as they were", async () => {
  const imported: Array<{ readonly data: Uint8Array; readonly copy: string }> =
    [];
  const spied = {
    importKey: (
      format: "raw",
      keyData: Uint8Array<ArrayBuffer>,
      algorithm: AlgorithmIdentifier,
      extractable: boolean,
      keyUsages: ReadonlyArray<KeyUsage>,
    ) => {
      imported.push({
        data: keyData,
        copy: new TextDecoder().decode(keyData),
      });
      return subtleCrypto.importKey(
        format,
        keyData,
        algorithm,
        extractable,
        keyUsages,
      );
    },
    deriveBits: subtleCrypto.deriveBits.bind(subtleCrypto),
  } as unknown as SubtleCrypto;
  await using run = testCreateRun({ subtleCrypto: spied });
  const key = EncryptionKey.orThrow(new Uint8Array(testKey));
  const salt = new Uint8Array(testSalt);

  await run.ok(deriveLegacySqliteKey(key, salt));

  assertEqual(
    imported.map(({ copy }) => copy),
    [`x'${bytesToHex(testKey)}'`],
  );
  assertEqual(
    imported.map(({ data }) => data),
    [new Uint8Array(67)],
  );
  assertEqual([key, salt], [testKey, testSalt]);
});

// The premise of these tests' legacy databases.
test("a database keyed as openLegacyKeyedDatabase keys it opens in @evolu/sqlite-wasm 2.2.4 with the SQL @evolu/web runs", async () => {
  const t = await setupSahPool();
  const db = await openLegacyKeyedDatabase(t, testKey, testSalt);
  assertEqual(
    t.exec("CREATE TABLE t(a); INSERT INTO t VALUES ('legacy row')", db),
    SQLITE_OK,
  );
  assertEqual(sqlite3_close_v2(t)(db), SQLITE_OK);
  const file = getOrThrow(
    t.pool.read("/evolu1.db", 0 as NonNegativeInt, (1 << 20) as NonNegativeInt),
  );
  assertEqual(file.subarray(0, 16), testSalt);
  const sqliteJs = await setupSqliteJs();
  writeSqliteJsFile(sqliteJs, "/legacy.db", file);

  const database = new sqliteJs.oo1.DB("/legacy.db", "w");
  database.exec(evoluWebKeySql(testKey));

  assertEqual(database.selectValue("SELECT a FROM t"), "legacy row");
  database.close();
});

test("a database @evolu/sqlite-wasm 2.2.4 created with the SQL @evolu/web runs opens with the key deriveLegacySqliteKey derives from the key and the file's first 16 bytes, passed raw, and not with the key itself", async () => {
  const sqliteJs = await setupSqliteJs();
  const created = new sqliteJs.oo1.DB("/legacy.db", "c");
  created.exec(evoluWebKeySql(testKey));
  created.exec("CREATE TABLE t(a); INSERT INTO t VALUES ('written by 2.2.4')");
  created.close();
  const file = readSqliteJsFile(sqliteJs, "/legacy.db");
  const t = await setupSahPool();
  writePoolFile(t, "/evolu1.db", file);
  await using run = testCreateRun({ ...t, subtleCrypto });

  const legacyKey = await run.ok(
    deriveLegacySqliteKey(testKey, file.subarray(0, 16)),
  );

  const raw = openEncryptedDatabase(t, testKey);
  assertErr(raw);
  assertEqual(raw.error.extendedCode, SQLITE_NOTADB);
  const database = getOrThrow(openEncryptedDatabase(t, legacyKey));
  assertEqual(getOrThrow(database.run("SELECT a FROM t", [])).rows, [
    { a: "written by 2.2.4" },
  ]);
  database[Symbol.dispose]();
  const opened = await run(
    createEncryptedSqliteDatabase({
      type: "EncryptedFile",
      vfs: t.pool,
      path: SqliteVfsPath.orThrow("/evolu1.db"),
      key: testKey,
    }),
  );
  const { database: fallback, keyDerivation } = getOrThrow(opened);
  assertEqual(keyDerivation, "Legacy224");
  assertEqual(getOrThrow(fallback.run("SELECT a FROM t", [])).rows, [
    { a: "written by 2.2.4" },
  ]);
  fallback[Symbol.dispose]();
});

/**
 * WebCrypto that records the passphrases it imports, calling `onImport` first,
 * and the bits it derives, which back the legacy key.
 */
const spySubtleCrypto = (onImport: () => void = () => undefined) => {
  const derivedBits: Array<ArrayBuffer> = [];
  let imports = 0;
  const spied = {
    importKey: (...args: Parameters<SubtleCrypto["importKey"]>) => {
      imports++;
      onImport();
      return subtleCrypto.importKey(...args);
    },
    deriveBits: async (...args: Parameters<SubtleCrypto["deriveBits"]>) => {
      const bits = await subtleCrypto.deriveBits(...args);
      derivedBits.push(bits);
      return bits;
    },
  } as unknown as SubtleCrypto;
  return { subtleCrypto: spied, getImports: () => imports, derivedBits };
};

/** Opens the database with createEncryptedSqliteDatabase. */
const openWithFallback = async (
  t: TestSahPool,
  subtle: SubtleCrypto,
  key: EncryptionKey = testKey,
  { pool = t.pool }: { pool?: SahPool } = {},
) => {
  await using run = testCreateRun({ ...t, subtleCrypto: subtle });
  return await run(
    createEncryptedSqliteDatabase({
      type: "EncryptedFile",
      vfs: pool,
      path: SqliteVfsPath.orThrow("/evolu1.db"),
      key,
    }),
  );
};

/** The calls that change files, a write or a truncate. */
const modifyingCalls = (calls: ReadonlyArray<FakeOpfsCall>) =>
  calls.filter((call) => call.method === "write" || call.method === "truncate");

test('2.2.4 opens what the pool writes: a database 2.2.4 created, after the pool added rows with the legacy key, with the SQL @evolu/web runs, and a new database the pool encrypted with the raw key, with that key as PRAGMA key = "raw:<hex>"', async () => {
  const sqliteJs = await setupSqliteJs();
  const created = new sqliteJs.oo1.DB("/legacy.db", "c");
  created.exec(evoluWebKeySql(testKey));
  created.exec("CREATE TABLE t(a); INSERT INTO t VALUES ('written by 2.2.4')");
  created.close();
  const file = readSqliteJsFile(sqliteJs, "/legacy.db");
  const t = await setupSahPool();
  writePoolFile(t, "/evolu1.db", file);
  const spy = spySubtleCrypto();
  const { database, keyDerivation } = getOrThrow(
    await openWithFallback(t, spy.subtleCrypto),
  );
  assertEqual(keyDerivation, "Legacy224");
  getOrThrow(
    database.exec(
      "INSERT INTO t VALUES ('written by the pool'); CREATE TABLE u(a); INSERT INTO u SELECT zeroblob(9000)",
    ),
  );
  database[Symbol.dispose]();
  const raw = getOrThrow(openEncryptedDatabase(t, testKey, "/raw.db"));
  getOrThrow(raw.exec("CREATE TABLE t(a); INSERT INTO t VALUES ('raw')"));
  raw[Symbol.dispose]();

  for (const [path, name, keySql, rows] of [
    [
      "/evolu1.db",
      "/legacy.db",
      evoluWebKeySql(testKey),
      "written by 2.2.4,written by the pool",
    ],
    ["/raw.db", "/raw.db", sqliteJsRawKeySql(testKey), "raw"],
  ] as const) {
    writeSqliteJsFile(
      sqliteJs,
      name,
      getOrThrow(
        t.pool.read(path, 0 as NonNegativeInt, (1 << 20) as NonNegativeInt),
      ),
    );
    const opened = new sqliteJs.oo1.DB(name, "w");
    opened.exec(keySql);
    assertEqual(opened.selectValue("SELECT group_concat(a, ',') FROM t"), rows);
    assertEqual(opened.selectValue("PRAGMA integrity_check"), "ok");
    opened.close();
  }
});

test("createEncryptedSqliteDatabase opens a new database with the raw key, reporting Raw, without deriving a legacy key, so the file opens with the raw key", async () => {
  const t = await setupSahPool();
  const spy = spySubtleCrypto();

  const { database, keyDerivation } = getOrThrow(
    await openWithFallback(t, spy.subtleCrypto),
  );

  assertEqual(keyDerivation, "Raw");
  assertEqual(spy.getImports(), 0);
  getOrThrow(database.exec("CREATE TABLE t(a); INSERT INTO t VALUES ('raw')"));
  database[Symbol.dispose]();
  const reopened = getOrThrow(openEncryptedDatabase(t, testKey));
  assertEqual(getOrThrow(reopened.run("SELECT a FROM t", [])).rows, [
    { a: "raw" },
  ]);
  reopened[Symbol.dispose]();
  const again = getOrThrow(await openWithFallback(t, spy.subtleCrypto));
  assertEqual(again.keyDerivation, "Raw");
  assertEqual(spy.getImports(), 0);
  again.database[Symbol.dispose]();
});

test("createEncryptedSqliteDatabase opens a database 2.2.4 keyed, whose raw key fails with SQLITE_NOTADB having written nothing, with the key derived from its first 16 bytes, reporting Legacy224, zeroes that key, leaves no copy of the raw key in the heap, and never rekeys it", async () => {
  const t = await setupSahPool();
  const db = await openLegacyKeyedDatabase(t, testKey, testSalt);
  assertEqual(
    t.exec("CREATE TABLE t(a); INSERT INTO t VALUES ('legacy row')", db),
    SQLITE_OK,
  );
  assertEqual(sqlite3_close_v2(t)(db), SQLITE_OK);
  const start = t.fake.calls.length;
  let rawCalls: ReadonlyArray<FakeOpfsCall> = [];
  const spy = spySubtleCrypto(() => {
    rawCalls = t.fake.calls.slice(start);
  });

  const { database, keyDerivation } = getOrThrow(
    await openWithFallback(t, spy.subtleCrypto),
  );

  assertEqual(keyDerivation, "Legacy224");
  assertEqual(spy.getImports(), 1);
  assertTrue(rawCalls.some((call) => call.method === "read"));
  assertEqual(modifyingCalls(rawCalls), []);
  assertEqual(
    spy.derivedBits.map((bits) => new Uint8Array(bits)),
    [new Uint8Array(32)],
  );
  assertEqual(
    Buffer.from(t.sqliteWasm.getHeapU8().buffer).indexOf(testKey),
    -1,
  );
  assertEqual(getOrThrow(database.run("SELECT a FROM t", [])).rows, [
    { a: "legacy row" },
  ]);
  getOrThrow(database.exec("INSERT INTO t VALUES ('written after')"));
  database[Symbol.dispose]();
  assertEqual(t.pool.getPaths(), ["/evolu1.db"]);
  assertEqual(
    getOrThrow(
      t.pool.read("/evolu1.db", 0 as NonNegativeInt, 16 as NonNegativeInt),
    ),
    new Uint8Array(testSalt),
  );
  const raw = openEncryptedDatabase(t, testKey);
  assertErr(raw);
  assertEqual(raw.error.extendedCode, SQLITE_NOTADB);
  const legacy = getOrThrow(
    openEncryptedDatabase(
      t,
      EncryptionKey.orThrow(deriveWithNodeCrypto(testKey, testSalt)),
    ),
  );
  assertEqual(getOrThrow(legacy.run("SELECT count(*) AS n FROM t", [])).rows, [
    { n: 2 },
  ]);
  legacy[Symbol.dispose]();
  const again = getOrThrow(await openWithFallback(t, spy.subtleCrypto));
  assertEqual(again.keyDerivation, "Legacy224");
  again.database[Symbol.dispose]();
});

// SQLite starts rolling a hot journal back by truncating the database to the
// size the journal's header records, then fails at the first page, which does
// not authenticate with a wrong key: SQLITE_NOTADB for page 1, SQLITE_CORRUPT
// for any other. The journal is kept for a key that fits.
test("a raw attempt on a database 2.2.4 keyed, with the hot journal of a transaction a dead worker left, fails with SQLITE_CORRUPT or SQLITE_NOTADB, writes no page and keeps the journal as it was, truncating only what the transaction added, and createEncryptedSqliteDatabase rolls the journal back with the legacy key", async () => {
  const createRowsSql =
    "CREATE TABLE t(id INTEGER PRIMARY KEY, v BLOB); WITH RECURSIVE c(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM c WHERE i < 300) INSERT INTO t(v) SELECT zeroblob(3000) FROM c;";
  for (const [transactionSql, rawCode, isTruncated] of [
    ["UPDATE t SET v = randomblob(3000)", SQLITE_CORRUPT, false],
    [
      "WITH RECURSIVE c(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM c WHERE i < 300) INSERT INTO t(v) SELECT randomblob(3000) FROM c",
      SQLITE_CORRUPT,
      true,
    ],
    [
      "CREATE TABLE u(a); UPDATE t SET v = randomblob(3000)",
      SQLITE_NOTADB,
      true,
    ],
  ] as const) {
    const t = await setupSahPool();
    const db = await openLegacyKeyedDatabase(t, testKey, testSalt);
    assertEqual(t.exec(createRowsSql, db), SQLITE_OK);
    const databaseSlot = t.findSlotPath("/evolu1.db");
    const originalSize = t.fake.readFile(databaseSlot)?.length;
    assertEqual(
      t.exec(`PRAGMA cache_size = 10; BEGIN; ${transactionSql}`, db),
      SQLITE_OK,
    );
    // The worker dies: its instance is abandoned and its handles released.
    t.fake.releaseHandles();
    const next = await setupSahPool({ fake: t.fake });
    assertEqual(next.pool.getPaths(), ["/evolu1.db", "/evolu1.db-journal"]);
    const journalSlot = next.findSlotPath("/evolu1.db-journal");
    const journal = next.fake.readFile(journalSlot);
    assert(journal != null, "The journal's slot exists.");
    // The first record's page number, after the header's sector.
    const rawPageNumber = new DataView(journal.buffer).getUint32(
      sahPoolHeaderSize + 4096,
    );
    const rawStart = next.fake.calls.length;

    const rawAttempt = openEncryptedDatabase(next, testKey);

    assertErr(rawAttempt);
    assertEqual(rawAttempt.error.extendedCode, rawCode);
    assertEqual(rawAttempt.error.cause?.error, {
      type: "SqlitePageAuthenticationError",
      pageNumber: rawCode === SQLITE_NOTADB ? 1 : rawPageNumber,
    });
    assertEqual(
      modifyingCalls(next.fake.calls.slice(rawStart)),
      isTruncated
        ? [{ method: "truncate", path: databaseSlot, size: originalSize }]
        : [],
    );
    assertEqual(next.fake.readFile(journalSlot), journal);
    const fallbackStart = next.fake.calls.length;
    let fallbackRawCalls: ReadonlyArray<FakeOpfsCall> = [];
    const spy = spySubtleCrypto(() => {
      fallbackRawCalls = next.fake.calls.slice(fallbackStart);
    });

    const { database, keyDerivation } = getOrThrow(
      await openWithFallback(next, spy.subtleCrypto),
    );

    assertEqual(keyDerivation, "Legacy224");
    assertEqual(spy.getImports(), 1);
    assertEqual(modifyingCalls(fallbackRawCalls), []);
    assertEqual(next.pool.getPaths(), ["/evolu1.db"]);
    assertEqual(
      getOrThrow(
        database.run(
          "SELECT count(*) AS n, sum(v = zeroblob(3000)) AS unchanged FROM t",
          [],
        ),
      ).rows,
      [{ n: 300, unchanged: 300 }],
    );
    assertEqual(getOrThrow(database.run("PRAGMA integrity_check", [])).rows, [
      { integrity_check: "ok" },
    ]);
    database[Symbol.dispose]();
  }
});

test("an I/O failure of the raw attempt fails with SQLITE_IOERR_READ and the pool's record as its cause, and no legacy key is derived", async () => {
  const t = await setupSahPool();
  const db = await openLegacyKeyedDatabase(t, testKey, testSalt);
  assertEqual(t.exec("CREATE TABLE t(a)", db), SQLITE_OK);
  assertEqual(sqlite3_close_v2(t)(db), SQLITE_OK);
  const databaseSlot = t.findSlotPath("/evolu1.db");
  const error = new DOMException("Failed.", "InvalidStateError");
  t.fake.inject((call) =>
    call.method === "read" &&
    call.path === databaseSlot &&
    call.at >= sahPoolHeaderSize
      ? { type: "Throw", error }
      : null,
  );
  const spy = spySubtleCrypto();

  const opened = await openWithFallback(t, spy.subtleCrypto);

  assertEqual(
    opened,
    err({
      type: "SqliteError",
      operation: "open",
      extendedCode: SQLITE_IOERR_READ,
      message: "disk I/O error",
      sqlOffset: null,
      cause: { method: "xRead", path: "/evolu1.db", error },
    }),
  );
  assertEqual(spy.getImports(), 0);
});

test("an I/O failure of the legacy attempt is reported with the pool's record as its cause", async () => {
  const t = await setupSahPool();
  const db = await openLegacyKeyedDatabase(t, testKey, testSalt);
  assertEqual(t.exec("CREATE TABLE t(a)", db), SQLITE_OK);
  assertEqual(sqlite3_close_v2(t)(db), SQLITE_OK);
  const databaseSlot = t.findSlotPath("/evolu1.db");
  const error = new DOMException("Failed.", "InvalidStateError");
  const spy = spySubtleCrypto(() => {
    t.fake.inject((call) =>
      call.method === "read" &&
      call.path === databaseSlot &&
      call.at >= sahPoolHeaderSize
        ? { type: "Throw", error }
        : null,
    );
  });

  const opened = await openWithFallback(t, spy.subtleCrypto);

  assertErr(opened);
  assertEqual(opened.error.type, "SqliteError");
  assertTrue(
    opened.error.type === "SqliteError" &&
      opened.error.cause?.method === "xRead" &&
      opened.error.cause.error === error,
  );
});

test("a key that fits neither as raw nor as 2.2.4 derived it fails with the raw attempt's SQLITE_NOTADB, caused by the pool's SqlitePageAuthenticationError for page 1, which holds nothing of the key, after deriving the legacy key once, and neither attempt writes anything", async () => {
  const t = await setupSahPool();
  const db = await openLegacyKeyedDatabase(t, testKey, testSalt);
  assertEqual(t.exec("CREATE TABLE t(a)", db), SQLITE_OK);
  assertEqual(sqlite3_close_v2(t)(db), SQLITE_OK);
  const otherKey = EncryptionKey.orThrow(new Uint8Array(32).fill(9));
  const spy = spySubtleCrypto();
  const start = t.fake.calls.length;

  const opened = await openWithFallback(t, spy.subtleCrypto, otherKey);

  assertEqual(modifyingCalls(t.fake.calls.slice(start)), []);
  assertEqual(
    opened,
    err({
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
    }),
  );
  assertEqual(spy.getImports(), 1);
  t.pool[Symbol.dispose]();
});

test("createEncryptedSqliteDatabase fails with the SqliteVfsIoError of reading the salt, and derives no legacy key", async () => {
  const t = await setupSahPool();
  const db = await openLegacyKeyedDatabase(t, testKey, testSalt);
  assertEqual(t.exec("CREATE TABLE t(a)", db), SQLITE_OK);
  assertEqual(sqlite3_close_v2(t)(db), SQLITE_OK);
  const cause = new DOMException("Failed.", "InvalidStateError");
  const pool: SahPool = {
    ...t.pool,
    read: () => err({ type: "SqliteVfsIoError", cause }),
  };
  const spy = spySubtleCrypto();

  const opened = await openWithFallback(t, spy.subtleCrypto, testKey, {
    pool,
  });

  assertEqual(opened, err({ type: "SqliteVfsIoError", cause }));
  assertEqual(spy.getImports(), 0);
});

/**
 * Flips a byte in each of the given pages of the database `/evolu1.db`, whose
 * schema the caller made overflow page 1, so those pages fail to authenticate.
 */
const damagePages = (t: TestSahPool, pageNumbers: ReadonlyArray<number>) => {
  const databaseSlot = t.findSlotPath("/evolu1.db");
  const file = t.fake.readFile(databaseSlot);
  assert(file != null, "The database's slot exists.");
  const pageSize = 8192;
  assertTrue(file.length >= sahPoolHeaderSize + 3 * pageSize);
  for (const pageNumber of pageNumbers) {
    const offset = sahPoolHeaderSize + (pageNumber - 1) * pageSize + 100;
    file[offset] = (file[offset] ?? 0) ^ 0xff;
  }
  t.fake.writeFile(databaseSlot, file);
};

/** A table whose schema overflows page 1. */
const createOverflowingSchemaSql = `CREATE TABLE t(a CHECK (a <> '${"x".repeat(20_000)}'))`;

test("a database whose raw key fits but whose schema page after page 1 fails to authenticate fails with the raw attempt's SQLITE_CORRUPT, caused by that page, and derives no legacy key, because page 1 proved the key", async () => {
  const t = await setupSahPool();
  const database = getOrThrow(openEncryptedDatabase(t, testKey));
  getOrThrow(database.exec(createOverflowingSchemaSql));
  database[Symbol.dispose]();
  damagePages(t, [3]);
  const spy = spySubtleCrypto();

  const opened = await openWithFallback(t, spy.subtleCrypto);

  assertEqual(
    opened,
    err({
      type: "SqliteError",
      operation: "open",
      extendedCode: SQLITE_CORRUPT,
      message: "database disk image is malformed",
      sqlOffset: null,
      cause: {
        method: "xRead",
        path: "/evolu1.db",
        error: { type: "SqlitePageAuthenticationError", pageNumber: 3 },
      },
    }),
  );
  assertEqual(spy.getImports(), 0);
});

test("a database 2.2.4 keyed whose schema page after page 1 fails to authenticate fails with the legacy attempt's SQLITE_CORRUPT, caused by that page, not with the raw attempt's SQLITE_NOTADB of a wrong key", async () => {
  const t = await setupSahPool();
  const db = await openLegacyKeyedDatabase(t, testKey, testSalt);
  assertEqual(t.exec(createOverflowingSchemaSql, db), SQLITE_OK);
  assertEqual(sqlite3_close_v2(t)(db), SQLITE_OK);
  damagePages(t, [3]);
  const spy = spySubtleCrypto();

  const opened = await openWithFallback(t, spy.subtleCrypto);

  assertEqual(
    opened,
    err({
      type: "SqliteError",
      operation: "open",
      extendedCode: SQLITE_CORRUPT,
      message: "database disk image is malformed",
      sqlOffset: null,
      cause: {
        method: "xRead",
        path: "/evolu1.db",
        error: { type: "SqlitePageAuthenticationError", pageNumber: 3 },
      },
    }),
  );
  assertEqual(spy.getImports(), 1);
});

test("a database whose pages authenticate with the raw key but whose schema is malformed fails with the raw attempt's SQLITE_CORRUPT, without a cause, and derives no legacy key", async () => {
  const t = await setupSahPool();
  const database = getOrThrow(openEncryptedDatabase(t, testKey));
  getOrThrow(
    database.exec(
      "CREATE TABLE t(a); PRAGMA writable_schema = ON; UPDATE sqlite_schema SET sql = 'CREATE TABLE t(' WHERE name = 't'; PRAGMA writable_schema = OFF",
    ),
  );
  database[Symbol.dispose]();
  const spy = spySubtleCrypto();

  const opened = await openWithFallback(t, spy.subtleCrypto);

  assertErr(opened);
  assertEqual(
    opened.error.type === "SqliteError" && [
      opened.error.extendedCode,
      opened.error.cause,
    ],
    [SQLITE_CORRUPT, null],
  );
  assertEqual(spy.getImports(), 0);
});

// SahPool.ts documents what reading this format needs.
test.todo(
  "opens a database @evolu/web 1.0.1-preview.6 to 2.4.0 encrypted with PRAGMA legacy = 4, SQLCipher 4's own format with 4096-byte pages and page 1 encrypted from byte 16, to migrate it",
);
