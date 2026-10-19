/**
 * Encrypted databases that `@evolu/sqlite-wasm` 2.2.4 created, on the pinned
 * binary over a fake OPFS: `deriveLegacySqliteKey` and the fallback of
 * `createEncryptedSqliteDatabase`, with Evolu's codec over the pool.
 *
 * `@evolu/web` keyed them with `PRAGMA cipher = 'sqlcipher'` and `PRAGMA key =
 * "x'<hex>'"`, which SQLite3 Multiple Ciphers 2.2.4, bundled in that release,
 * took as a passphrase. Deriving the key from it takes 256000 iterations, so
 * most tests create such databases with a fixed salt and the key `node:crypto`
 * derives: 2.2.4 writes page 1, keyed with `raw:` followed by the derived key
 * and the salt, and the codec continues the database with the derived key. A
 * test checks that 2.2.4 opens those databases with its passphrase, another
 * that a database 2.2.4 created with the passphrase opens with the derived key,
 * and another that 2.2.4 opens what the codec writes.
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
  ok,
  testCreateRun,
  type NonNegativeInt,
} from "@evolu/common";
import { pbkdf2Sync } from "node:crypto";
import { test } from "node:test";
import {
  sqlite3_close_v2,
  sqlite3_free,
} from "../../../../packages/sqlite-wasm/src/CApi.ts";
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
import { evolu_codec_open } from "../../../../packages/sqlite-wasm/src/EvoluCApi.ts";
import { allocWasm } from "../../../../packages/sqlite-wasm/src/Memory.ts";
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
  // The derived key, staged in wasm memory for the open as the binding stages
  // a key; 2 is EVOLU_CODEC_PLAINTEXT_CHECKSUMS.
  const pKey = getOrThrow(allocWasm(t)(32));
  t.sqliteWasm.getHeapU8().set(derivedKey, pKey);
  const rc = evolu_codec_open(t)(
    t.cString(path),
    t.scratch.out,
    t.cString(t.pool.vfsName),
    pKey,
    2,
  );
  t.sqliteWasm.getHeapU8().fill(0, pKey, pKey + 32);
  sqlite3_free(t)(pKey);
  assertEqual(rc, SQLITE_OK);
  return t.readPtr(t.scratch.out) as SqliteDbPtr;
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

test('2.2.4 opens what the codec writes: a database 2.2.4 created, after rows were added with the legacy key, with the SQL @evolu/web runs, and a new database the codec encrypted with the raw key, with that key as PRAGMA key = "raw:<hex>"', async () => {
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
      "INSERT INTO t VALUES ('written by the codec'); CREATE TABLE u(a); INSERT INTO u SELECT zeroblob(9000)",
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
      "written by 2.2.4,written by the codec",
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
    assertEqual(rawAttempt.error.cause, {
      type: "SqliteCodecFailure",
      error: {
        type: "SqlitePageAuthenticationError",
        pageNumber: rawCode === SQLITE_NOTADB ? 1 : rawPageNumber,
      },
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

/**
 * Leaves the hot journal of a transaction that a dead worker left on a database
 * 2.2.4 keyed, which journals page 1, on a pool a new instance opens, and
 * returns that pool.
 */
const setupLegacyHotJournal = async (): Promise<TestSahPool> => {
  const t = await setupSahPool();
  const db = await openLegacyKeyedDatabase(t, testKey, testSalt);
  assertEqual(
    t.exec(
      "CREATE TABLE t(id INTEGER PRIMARY KEY, v BLOB); WITH RECURSIVE c(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM c WHERE i < 300) INSERT INTO t(v) SELECT zeroblob(3000) FROM c;",
      db,
    ),
    SQLITE_OK,
  );
  assertEqual(
    t.exec(
      "PRAGMA cache_size = 10; BEGIN; CREATE TABLE u(a); UPDATE t SET v = randomblob(3000)",
      db,
    ),
    SQLITE_OK,
  );
  // The worker dies: its instance is abandoned and its handles released.
  t.fake.releaseHandles();
  const next = await setupSahPool({ fake: t.fake });
  assertEqual(next.pool.getPaths(), ["/evolu1.db", "/evolu1.db-journal"]);
  return next;
};

// The salt the journal's page-1 record stores unencrypted.
test("createEncryptedSqliteDatabase opens a database 2.2.4 keyed whose first 16 bytes a crash tore with the key derived from the salt of its hot journal's page-1 record, after the torn bytes' key failed, and the rollback restores them", async () => {
  const t = await setupLegacyHotJournal();
  tearSalt(t);
  const spy = spySubtleCrypto();

  const { database, keyDerivation } = getOrThrow(
    await openWithFallback(t, spy.subtleCrypto),
  );

  assertEqual(keyDerivation, "Legacy224");
  assertEqual(spy.getImports(), 2);
  assertEqual(t.pool.getPaths(), ["/evolu1.db"]);
  assertEqual(
    getOrThrow(
      database.run(
        "SELECT count(*) AS n, sum(v = zeroblob(3000)) AS unchanged FROM t",
        [],
      ),
    ).rows,
    [{ n: 300, unchanged: 300 }],
  );
  database[Symbol.dispose]();
  assertEqual(
    getOrThrow(
      t.pool.read("/evolu1.db", 0 as NonNegativeInt, 16 as NonNegativeInt),
    ),
    new Uint8Array(testSalt),
  );
});

// An empty salt would key the emptied database with a junk key, whose writes
// the next start could not open. A wrong key's rollback first restores the
// database to the size its journal records, so the read of its first 16 bytes
// comes back short only when the file is cut meanwhile.
test("createEncryptedSqliteDatabase returns the raw attempt's error, deriving no key, when fewer than 16 bytes of the database read, as for a database shorter than 16 bytes", async () => {
  const t = await setupLegacyHotJournal();
  const databaseSlot = t.findSlotPath("/evolu1.db");
  t.fake.inject((call) =>
    call.method === "read" &&
    call.path === databaseSlot &&
    call.at === sahPoolHeaderSize &&
    call.length === 16
      ? { type: "Count", count: 10 }
      : null,
  );
  const raw = openEncryptedDatabase(t, testKey);
  assertErr(raw);
  // A wrong key, which fails the journal's first record, page 1.
  assertEqual(raw.error.cause, {
    type: "SqliteCodecFailure",
    error: { type: "SqlitePageAuthenticationError", pageNumber: 1 },
  });
  const spy = spySubtleCrypto();

  const opened = await openWithFallback(t, spy.subtleCrypto);

  assertEqual(opened, err(raw.error));
  assertEqual(spy.getImports(), 0);
});

/**
 * Zeroes the database's first 16 bytes, as a crash that tore them would, so
 * only the salt of its hot journal's page-1 record opens it.
 */
const tearSalt = (t: TestSahPool): void => {
  const databaseSlot = t.findSlotPath("/evolu1.db");
  const file = t.fake.readFile(databaseSlot);
  assert(file != null, "The database's slot exists.");
  file.fill(0, sahPoolHeaderSize, sahPoolHeaderSize + 16);
  t.fake.writeFile(databaseSlot, file);
};

const journalSectorSize = 512;
const journalPageSize = 512;

/**
 * A rollback journal of 512-byte pages and sectors, or sectors of the given
 * size: for each segment, a header with its count and an original size of one
 * page, followed by records numbered as given, where page 1's stores testSalt.
 */
const buildJournal = (
  segments: ReadonlyArray<{
    readonly count: number;
    readonly pageNumbers: ReadonlyArray<number>;
  }>,
  sectorSize = journalSectorSize,
): Uint8Array<ArrayBuffer> => {
  const bytes = new Uint8Array(
    segments.length * 2 * sectorSize +
      segments.flatMap(({ pageNumbers }) => pageNumbers).length *
        (journalPageSize + 8),
  );
  const view = new DataView(bytes.buffer);
  let at = 0;
  for (const { count, pageNumbers } of segments) {
    at = Math.ceil(at / sectorSize) * sectorSize;
    bytes.set([0xd9, 0xd5, 0x05, 0xf9, 0x20, 0xa1, 0x63, 0xd7], at);
    view.setUint32(at + 8, count);
    view.setUint32(at + 16, 1);
    view.setUint32(at + 20, sectorSize);
    view.setUint32(at + 24, journalPageSize);
    at += sectorSize;
    for (const pageNumber of pageNumbers) {
      view.setUint32(at, pageNumber);
      if (pageNumber === 1) bytes.set(testSalt, at + 4);
      at += journalPageSize + 8;
    }
  }
  return bytes.slice(0, at);
};

/**
 * The pool with its reads of the database's journal served from the given
 * bytes, so only the fallback's walk reads them, while SQLite rolls back the
 * journal the pool has. They are views into a larger buffer, which
 * {@link SahPool.read} allows.
 */
const serveJournal = (
  t: TestSahPool,
  journal: Uint8Array<ArrayBuffer>,
): SahPool => {
  const buffer = new Uint8Array(8 + journal.length);
  buffer.set(journal, 8);
  const served = buffer.subarray(8);
  return {
    ...t.pool,
    read: (path, offset, byteLength) =>
      path === "/evolu1.db-journal"
        ? ok(served.subarray(offset, offset + byteLength))
        : t.pool.read(path, offset, byteLength),
  };
};

// SQLite's pager_playback walks the records segment by segment, and each
// segment's header counts its records.
test("createEncryptedSqliteDatabase takes the salt of page 1's record in a later segment of the hot journal, past a segment with no records and records of other pages, in a segment counting its records to the end of the file, and zeroes both derived keys", async () => {
  const t = await setupLegacyHotJournal();
  tearSalt(t);
  const spy = spySubtleCrypto();
  const journal = buildJournal([
    { count: 0, pageNumbers: [] },
    { count: 1, pageNumbers: [2] },
    { count: 0xffff_ffff, pageNumbers: [3, 1] },
  ]);

  const { database, keyDerivation } = getOrThrow(
    await openWithFallback(t, spy.subtleCrypto, testKey, {
      pool: serveJournal(t, journal),
    }),
  );

  assertEqual(keyDerivation, "Legacy224");
  assertEqual(spy.getImports(), 2);
  assertEqual(
    spy.derivedBits.map((bits) => new Uint8Array(bits)),
    [new Uint8Array(32), new Uint8Array(32)],
  );
  assertEqual(t.pool.getPaths(), ["/evolu1.db"]);
  database[Symbol.dispose]();
});

test("createEncryptedSqliteDatabase derives only the key of the database's torn first 16 bytes and returns the raw attempt's error when the hot journal's rollback reaches no page-1 record", async () => {
  const t = await setupLegacyHotJournal();
  tearSalt(t);
  const raw = openEncryptedDatabase(t, testKey);
  assertErr(raw);
  const valid = buildJournal([{ count: 1, pageNumbers: [1] }]);
  const withUint32 = (offset: number, value: number) => {
    const journal = valid.slice();
    new DataView(journal.buffer).setUint32(offset, value);
    return journal;
  };
  // The second segment's header starts at the sector after the first record.
  const otherMagic = buildJournal([
    { count: 1, pageNumbers: [2] },
    { count: 1, pageNumbers: [1] },
  ]);
  otherMagic[3 * journalSectorSize] = 0;
  const lockPage = 0x4000_0000 / journalPageSize + 1;
  const journals = {
    "shorter than its first header": valid.slice(0, 27),
    "with an original size of 0": withUint32(16, 0),
    "with a sector size below 32": withUint32(20, 16),
    // These two place their page-1 record at the sector size their header
    // states, so only the sector-size check stops the walk.
    "with a sector size above 65536": buildJournal(
      [{ count: 1, pageNumbers: [1] }],
      131_072,
    ),
    "with a sector size that is not a power of two": buildJournal(
      [{ count: 1, pageNumbers: [1] }],
      1000,
    ),
    "with a page size below 512": withUint32(24, 256),
    "whose first byte is 0": withUint32(0, 0),
    "with a later header whose magic differs": otherMagic,
    "that ends after a segment's records": buildJournal([
      { count: 1, pageNumbers: [2] },
    ]),
    "with a record numbered 0 first": buildJournal([
      { count: 2, pageNumbers: [0, 1] },
    ]),
    "with a record of the lock-byte page first": buildJournal([
      { count: 2, pageNumbers: [lockPage, 1] },
    ]),
    "cut inside its page-1 record": valid.slice(0, -1),
  };

  for (const [shape, journal] of Object.entries(journals)) {
    const spy = spySubtleCrypto();

    const opened = await openWithFallback(t, spy.subtleCrypto, testKey, {
      pool: serveJournal(t, journal),
    });

    assertEqual([shape, opened], [shape, err(raw.error)]);
    assertEqual([shape, spy.getImports()], [shape, 1]);
  }
  assertEqual(t.pool.getPaths(), ["/evolu1.db", "/evolu1.db-journal"]);
});

test("createEncryptedSqliteDatabase fails with the SqliteVfsIoError of reading the hot journal, at its first header, a segment's header or a record, and derives no legacy key", async () => {
  const t = await setupLegacyHotJournal();
  const cause = new DOMException("Failed.", "InvalidStateError");
  const journal = buildJournal([{ count: 1, pageNumbers: [1] }]);
  const byteLengths = {
    "first header": 28,
    "segment's header": journalSectorSize,
    record: journalPageSize + 8,
  };

  for (const [read, failingByteLength] of Object.entries(byteLengths)) {
    const served = serveJournal(t, journal);
    const pool: SahPool = {
      ...served,
      read: (path, offset, byteLength) =>
        path === "/evolu1.db-journal" && byteLength === failingByteLength
          ? err({ type: "SqliteVfsIoError", cause })
          : served.read(path, offset, byteLength),
    };
    const spy = spySubtleCrypto();

    const opened = await openWithFallback(t, spy.subtleCrypto, testKey, {
      pool,
    });

    assertEqual(
      [read, opened],
      [read, err({ type: "SqliteVfsIoError", cause })],
    );
    assertEqual([read, spy.getImports()], [read, 0]);
  }
});

test("createEncryptedSqliteDatabase returns a legacy attempt's I/O failure without trying the next salt", async () => {
  const t = await setupLegacyHotJournal();
  tearSalt(t);
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
  assert(opened.error.type === "SqliteError", opened.error.type);
  assertEqual(opened.error.cause, {
    type: "SqliteVfsFailure",
    method: "xRead",
    path: "/evolu1.db",
    error,
  });
  assertEqual(spy.getImports(), 1);
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
      cause: {
        type: "SqliteVfsFailure",
        method: "xRead",
        path: "/evolu1.db",
        error,
      },
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
  assert(opened.error.type === "SqliteError", opened.error.type);
  assertEqual(opened.error.cause, {
    type: "SqliteVfsFailure",
    method: "xRead",
    path: "/evolu1.db",
    error,
  });
});

test("a key that fits neither as raw nor as 2.2.4 derived it fails with the raw attempt's SQLITE_NOTADB, caused by the codec's SqlitePageAuthenticationError for page 1, which holds nothing of the key, after deriving the legacy key once, and neither attempt writes anything", async () => {
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
        type: "SqliteCodecFailure",
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
        type: "SqliteCodecFailure",
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
        type: "SqliteCodecFailure",
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
