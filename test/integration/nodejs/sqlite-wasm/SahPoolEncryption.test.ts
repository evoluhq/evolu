/**
 * The encryption of `SahPool`, on the pinned binary over a fake OPFS, through
 * its VFS: connections the C API opens while a key is registered for their
 * path.
 *
 * `@evolu/sqlite-wasm` 2.2.4, whose SQLite3 Multiple Ciphers encrypted the
 * databases of `@evolu/web` 3, is the reference. Keyed with the `sqlcipher`
 * scheme and the raw key, it opens what the pool writes, and the pool opens
 * what it writes. `node:crypto` checks the format independently.
 */

import { cbc as wasmCbc, sha512 as wasmSha512 } from "@awasm/noble";
import { hmac } from "@awasm/noble/hmac.js";
import { cbc as nobleCbc, sha512 as nobleSha512 } from "@awasm/noble/noble.js";
import { cbc, sha512 } from "@awasm/noble/stub.js";
import {
  assert,
  assertEqual,
  assertEqualBytes,
  assertFalse,
  assertInstanceOf,
  assertThrows,
  assertTrue,
  bytesToHex,
  EncryptionKey,
  eqUint8Array,
  getOrThrow,
  testCreateDeps,
  type NonNegativeInt,
  type RandomBytes,
} from "@evolu/common";
import { createDecipheriv, createHmac, pbkdf2Sync } from "node:crypto";
import { test } from "node:test";
import {
  sqlite3_close_v2,
  sqlite3_extended_errcode,
  sqlite3_file_control,
  sqlite3_free,
  sqlite3_serialize,
} from "../../../../packages/sqlite-wasm/src/CApi.ts";
import {
  SQLITE_CANTOPEN,
  SQLITE_CORRUPT,
  SQLITE_FCNTL_RESERVE_BYTES,
  SQLITE_FULL,
  SQLITE_IOERR,
  SQLITE_IOERR_READ,
  SQLITE_IOERR_SHORT_READ,
  SQLITE_IOERR_WRITE,
  SQLITE_NOTADB,
  SQLITE_OK,
  SQLITE_OPEN_CREATE,
  SQLITE_OPEN_MAIN_DB,
  SQLITE_OPEN_MAIN_JOURNAL,
  SQLITE_OPEN_READWRITE,
  sqlite3_vfs_layout,
} from "../../../../packages/sqlite-wasm/src/Constants.ts";
import { SqliteVfsPath } from "../../../../packages/sqlite-wasm/src/Database.ts";
import { allocWasm } from "../../../../packages/sqlite-wasm/src/Memory.ts";
import type {
  SqliteDbPtr,
  SqliteFilePtr,
  WasmPtr,
} from "../../../../packages/sqlite-wasm/src/Pointer.ts";
import { sahPoolHeaderSize } from "../../../../packages/sqlite-wasm/src/SahPool.ts";
import {
  crashAfterWrites,
  createQuotaExceededError,
  type FakeOpfsCall,
} from "./_fakeOpfs.ts";
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

const otherKey = EncryptionKey.orThrow(
  Uint8Array.from({ length: 32 }, (_, index) => 255 - index * 3),
);

// The build's default page size, and 2.2.4's.
const pageSize = 8192;

// The reserved bytes at the end of each page: the IV and the HMAC.
const reservedSize = 80;

const latin1 = new TextDecoder("latin1");

/**
 * Opens a path of the pool on its VFS with the key registered for the open, and
 * asks for the bytes the pool reserves, as an EncryptedFile database does.
 */
const openEncrypted = (
  t: TestSahPool,
  path = "/evolu1.db",
  key: EncryptionKey = testKey,
): SqliteDbPtr => {
  const opened = (() => {
    using _registration = t.pool.registerKey(SqliteVfsPath.orThrow(path), key);
    return t.openDatabase(path);
  })();
  assertEqual(opened.rc, SQLITE_OK);
  reserveBytes(t, opened.db);
  return opened.db;
};

/**
 * Asks for the bytes the pool reserves at the end of each page, or for another
 * number of them.
 */
const reserveBytes = (
  t: TestSahPool,
  db: SqliteDbPtr,
  reserved = reservedSize,
): void => {
  const pReserve = getOrThrow(allocWasm(t)(4));
  t.sqliteWasm.getHeapDataView().setInt32(pReserve, reserved, true);
  assertEqual(
    sqlite3_file_control(t)(
      db,
      t.cString("main"),
      SQLITE_FCNTL_RESERVE_BYTES,
      pReserve,
    ),
    SQLITE_OK,
  );
};

/**
 * Copies a database of the pool, with its journal when there is one, into a new
 * instance of 2.2.4 and opens it there with the `sqlcipher` scheme and the raw
 * key, which rolls a hot journal back. The caller closes the connection.
 */
const openWithSqliteJs = async (
  t: TestSahPool,
  path = "/evolu1.db",
  key: EncryptionKey = testKey,
) => {
  const sqliteJs = await setupSqliteJs();
  for (const file of [path, `${path}-journal`])
    if (t.pool.getPaths().includes(file))
      writeSqliteJsFile(sqliteJs, file, readFile(t, file));
  const db = new sqliteJs.oo1.DB(path, "w");
  db.exec(sqliteJsRawKeySql(key));
  return db;
};

/**
 * Creates a database in a new instance of 2.2.4 with the `sqlcipher` scheme and
 * the raw key, runs the SQL there, and copies the database into the pool as
 * stored, with its journal when the SQL left a transaction open. 2.2.4 is then
 * abandoned, as when its worker dies.
 */
const writeWithSqliteJs = async (
  t: TestSahPool,
  sql: string,
  path = "/evolu1.db",
  key: EncryptionKey = testKey,
): Promise<void> => {
  const sqliteJs = await setupSqliteJs();
  new sqliteJs.oo1.DB(path, "c").exec(`${sqliteJsRawKeySql(key)} ${sql}`);
  writePoolFile(t, path, readSqliteJsFile(sqliteJs, path));
  const journal = readSqliteJsFile(sqliteJs, `${path}-journal`);
  if (journal.length > 0)
    writePoolFile(t, `${path}-journal`, journal, SQLITE_OPEN_MAIN_JOURNAL);
};

const close = (t: TestSahPool, db: SqliteDbPtr): void => {
  assertEqual(sqlite3_close_v2(t)(db), SQLITE_OK);
};

/** Inserts rows into table t, whose a is `marker` with the row number. */
const insertRowsSql = (from: number, to: number) =>
  `WITH RECURSIVE c(i) AS (SELECT ${from} UNION ALL SELECT i + 1 FROM c WHERE i < ${to}) INSERT INTO t SELECT 'marker' || i || zeroblob(500) FROM c`;

// Table t of 200 rows, about 13 pages.
const createRowsSql = `CREATE TABLE t(a); ${insertRowsSql(1, 200)}`;

/** The rows of t and how many hold what insertRowsSql inserted. */
const rowsSql =
  "SELECT count(*) || ':' || sum(a = 'marker' || rowid || zeroblob(500)) FROM t";

/** Returns the bytes of a file of the pool as stored. */
const readFile = (t: TestSahPool, path = "/evolu1.db") =>
  getOrThrow(
    t.pool.read(path, 0 as NonNegativeInt, (1 << 22) as NonNegativeInt),
  );

/** Whether a file holds SQLite's header string or a row anywhere. */
const hasPlaintext = (file: Uint8Array): boolean => {
  const text = latin1.decode(file);
  return text.includes("SQLite format 3") || text.includes("marker");
};

/** Returns the main database of a connection as SQLite has it, page by page. */
const serialize = (t: TestSahPool, db: SqliteDbPtr): Uint8Array => {
  const pSize = getOrThrow(allocWasm(t)(8));
  const pages = sqlite3_serialize(t)(db, t.cString("main"), pSize, 0);
  const size = Number(t.sqliteWasm.getHeapDataView().getBigInt64(pSize, true));
  const bytes = t.sqliteWasm.getHeapU8().slice(pages, pages + size);
  sqlite3_free(t)(pages);
  return bytes;
};

/**
 * Decrypts AES-256-CBC with `node:crypto`, stealing ciphertext for a last
 * partial block as CBC-CS3 does: the last whole block holds the encryption of
 * the block before it XOR the zero-padded partial block, and the partial block
 * holds the start of that block.
 */
const decryptCbcCs3 = (
  key: Uint8Array,
  iv: Uint8Array,
  ciphertext: Uint8Array,
): Uint8Array => {
  const decrypt = (blockIv: Uint8Array, blocks: Uint8Array) => {
    const decipher = createDecipheriv("aes-256-cbc", key, blockIv);
    decipher.setAutoPadding(false);
    return Buffer.concat([decipher.update(blocks), decipher.final()]);
  };
  const tail = ciphertext.length % 16;
  if (tail === 0) return decrypt(iv, ciphertext);
  const whole = ciphertext.length - tail;
  const stolen = decrypt(
    new Uint8Array(16),
    ciphertext.subarray(whole - 16, whole),
  );
  const previous = Buffer.from(stolen);
  previous.set(ciphertext.subarray(whole), 0);
  const partial = stolen
    .subarray(0, tail)
    .map((byte, index) => byte ^ (ciphertext[whole + index] ?? 0));
  return Buffer.concat([
    decrypt(iv, Buffer.concat([ciphertext.subarray(0, whole - 16), previous])),
    partial,
  ]);
};

/**
 * Authenticates and decrypts a page with `node:crypto`, as the module
 * documentation of `SahPool.ts` describes the format, returning it with
 * SQLite's header string restored on page 1, or null when its HMAC differs.
 */
const decryptPageWithNodeCrypto = (
  stored: Uint8Array,
  pageNumber: number,
  key: Uint8Array,
  salt: Uint8Array,
): Uint8Array | null => {
  const hmacKey = pbkdf2Sync(
    key,
    salt.map((byte) => byte ^ 0x3a),
    2,
    32,
    "sha512",
  );
  const page = Buffer.from(stored);
  const start = pageNumber === 1 ? 24 : 0;
  const end = stored.length - reservedSize;
  const pageNumberLe = Buffer.alloc(4);
  pageNumberLe.writeUInt32LE(pageNumber);
  const hmac = createHmac("sha512", hmacKey)
    .update(page.subarray(start, end + 16))
    .update(pageNumberLe)
    .digest();
  if (!hmac.equals(page.subarray(end + 16))) return null;
  page.set(
    decryptCbcCs3(key, page.subarray(end, end + 16), page.subarray(start, end)),
    start,
  );
  if (pageNumber === 1) page.write("SQLite format 3\0", 0, "latin1");
  return page;
};

/**
 * Decrypts every page of a database file of pages of a size with
 * {@link decryptPageWithNodeCrypto}, returning the number of a page whose HMAC
 * differs in its place.
 */
const decryptWithNodeCrypto = (
  file: Uint8Array,
  key: Uint8Array,
  size = pageSize,
): ReadonlyArray<Uint8Array | number> => {
  const pages: Array<Uint8Array | number> = [];
  for (let offset = 0; offset < file.length; offset += size) {
    const pageNumber = offset / size + 1;
    pages.push(
      decryptPageWithNodeCrypto(
        file.subarray(offset, offset + size),
        pageNumber,
        key,
        file.subarray(0, 16),
      ) ?? pageNumber,
    );
  }
  return pages;
};

test("a database opened while a key is registered for its path stores neither SQLite's header string nor a row anywhere in its file, and 2.2.4 opens it with the sqlcipher scheme and the raw key, reading every row", async () => {
  const t = await setupSahPool();
  const db = openEncrypted(t);
  assertEqual(t.exec(createRowsSql, db), SQLITE_OK);
  assertEqual(t.selectText(rowsSql, db), "200:200");
  close(t, db);

  const file = readFile(t);
  assertTrue(file.length > 10 * pageSize);
  assertEqual(hasPlaintext(file), false);
  const reference = await openWithSqliteJs(t);
  assertEqual(reference.selectValue(rowsSql), "200:200");
  assertEqual(reference.selectValue("PRAGMA integrity_check"), "ok");
  reference.close();
});

test("a database 2.2.4 encrypted with the sqlcipher scheme and the raw key opens with the key registered, reads every row and takes new rows, which 2.2.4 reads", async () => {
  const t = await setupSahPool();
  await writeWithSqliteJs(t, createRowsSql);
  assertEqual(hasPlaintext(readFile(t)), false);

  const db = openEncrypted(t);
  assertEqual(t.selectText(rowsSql, db), "200:200");
  assertEqual(t.selectText("PRAGMA integrity_check", db), "ok");
  assertEqual(t.exec(insertRowsSql(201, 400), db), SQLITE_OK);
  close(t, db);

  assertEqual(hasPlaintext(readFile(t)), false);
  const again = await openWithSqliteJs(t);
  assertEqual(again.selectValue(rowsSql), "400:400");
  assertEqual(again.selectValue("PRAGMA integrity_check"), "ok");
  again.close();
});

test("every page the pool encrypts authenticates and decrypts with node:crypto to the page SQLite has: HMAC-SHA512 keyed by PBKDF2-HMAC-SHA512 of the key and the salt XOR 0x3a with 2 iterations, over the encrypted bytes, the IV and the little-endian page number, and AES-256-CBC from byte 24 of page 1, with CBC-CS3, and from byte 0 of other pages", async () => {
  const t = await setupSahPool();
  const db = openEncrypted(t);
  assertEqual(t.exec(createRowsSql, db), SQLITE_OK);
  const plaintext = serialize(t, db);
  close(t, db);
  const file = readFile(t);

  const pages = decryptWithNodeCrypto(file, testKey);

  assertEqual(file.length, plaintext.length);
  assertEqual(
    pages.filter((page) => typeof page === "number"),
    [],
  );
  for (const [index, page] of pages.entries()) {
    assertTrue(typeof page !== "number");
    const offset = index * pageSize;
    assertEqualBytes(
      page.subarray(0, pageSize - reservedSize),
      plaintext.subarray(offset, offset + pageSize - reservedSize),
    );
  }
  // The page size and the reserved bytes stay readable before decryption.
  assertEqual([file[16], file[17], file[20]], [pageSize >> 8, 0, reservedSize]);
});

/** The calls that change files, a write or a truncate. */
const modifyingCalls = (calls: ReadonlyArray<FakeOpfsCall>) =>
  calls.filter((call) => call.method === "write" || call.method === "truncate");

/** Flips a byte of a file of the pool as stored, at an offset in its data. */
const flipByte = (t: TestSahPool, offset: number, path = "/evolu1.db") => {
  const slotPath = t.findSlotPath(path);
  const bytes = t.fake.readFile(slotPath);
  assertTrue(bytes != null);
  bytes[sahPoolHeaderSize + offset] =
    (bytes[sahPoolHeaderSize + offset] ?? 0) ^ 0xff;
  t.fake.writeFile(slotPath, bytes);
};

test("a database opened with another key registered fails to read page 1 with SQLITE_NOTADB, the pool records a SqlitePageAuthenticationError for page 1, and nothing is written", async () => {
  const t = await setupSahPool();
  const created = openEncrypted(t);
  assertEqual(t.exec(createRowsSql, created), SQLITE_OK);
  close(t, created);
  const start = t.fake.calls.length;

  const db = openEncrypted(t, "/evolu1.db", otherKey);
  t.pool.clearFailure();
  const rc = t.exec("SELECT count(*) FROM t", db);

  assertEqual(
    [rc, sqlite3_extended_errcode(t)(db)],
    [SQLITE_NOTADB, SQLITE_NOTADB],
  );
  assertEqual(t.pool.getFailure(), {
    method: "xRead",
    path: "/evolu1.db",
    error: { type: "SqlitePageAuthenticationError", pageNumber: 1 },
  });
  close(t, db);
  assertEqual(modifyingCalls(t.fake.calls.slice(start)), []);
  const again = openEncrypted(t);
  assertEqual(t.selectText(rowsSql, again), "200:200");
  close(t, again);
});

test("a page altered in its encrypted bytes, its IV or its HMAC fails to read with SQLITE_CORRUPT, or SQLITE_NOTADB for page 1, and the pool records a SqlitePageAuthenticationError for it", async () => {
  const t = await setupSahPool();
  const created = openEncrypted(t);
  assertEqual(t.exec(createRowsSql, created), SQLITE_OK);
  close(t, created);
  const ivOffset = pageSize - reservedSize;
  const offsets = [
    [5, 4 * pageSize + 100, SQLITE_CORRUPT],
    [5, 4 * pageSize + ivOffset + 3, SQLITE_CORRUPT],
    [5, 4 * pageSize + ivOffset + 16 + 40, SQLITE_CORRUPT],
    [1, 100, SQLITE_NOTADB],
    [1, ivOffset, SQLITE_NOTADB],
  ] as const;

  for (const [pageNumber, offset, code] of offsets) {
    flipByte(t, offset);
    const db = openEncrypted(t);
    t.pool.clearFailure();
    const rc = t.exec("SELECT count(*) FROM t", db);

    assertEqual([rc, sqlite3_extended_errcode(t)(db)], [code, code]);
    assertEqual(t.pool.getFailure(), {
      method: "xRead",
      path: "/evolu1.db",
      error: { type: "SqlitePageAuthenticationError", pageNumber },
    });
    close(t, db);
    flipByte(t, offset);
  }

  const restored = openEncrypted(t);
  assertEqual(t.selectText(rowsSql, restored), "200:200");
  close(t, restored);
});

// Byte 20 of page 1, which is neither encrypted nor authenticated, tells SQLite
// how many bytes each page reserves, so another value would make it read
// overflow pages at another usable size and return other bytes as data.
test("a page 1 whose reserved bytes are not 80, as 81 or 79, fails to read with SQLITE_NOTADB, recording a SqlitePageAuthenticationError for page 1, rather than a blob that overflows pages being read as other bytes, and sqlite3_serialize, which exports, fails too", async () => {
  const t = await setupSahPool();
  const created = openEncrypted(t);
  const blobSql = "SELECT hex(b) FROM big WHERE id = 1";
  assertEqual(
    t.exec(
      "CREATE TABLE big(id INTEGER PRIMARY KEY, b BLOB); INSERT INTO big VALUES (1, randomblob(16596))",
      created,
    ),
    SQLITE_OK,
  );
  const blob = t.selectText(blobSql, created);
  close(t, created);
  const slotPath = t.findSlotPath("/evolu1.db");
  const setReservedBytes = (reserved: number) => {
    const bytes = t.fake.readFile(slotPath);
    assert(bytes != null, "No database file");
    bytes[sahPoolHeaderSize + 20] = reserved;
    t.fake.writeFile(slotPath, bytes);
  };

  for (const reserved of [81, 79]) {
    setReservedBytes(reserved);
    const db = openEncrypted(t);
    t.pool.clearFailure();

    assertEqual(
      [t.exec(blobSql, db), sqlite3_extended_errcode(t)(db)],
      [SQLITE_NOTADB, SQLITE_NOTADB],
    );
    assertEqual(t.pool.getFailure(), {
      method: "xRead",
      path: "/evolu1.db",
      error: { type: "SqlitePageAuthenticationError", pageNumber: 1 },
    });
    const pSize = getOrThrow(allocWasm(t)(8));
    assertEqual(sqlite3_serialize(t)(db, t.cString("main"), pSize, 0), 0);
    close(t, db);
  }

  setReservedBytes(reservedSize);
  const restored = openEncrypted(t);
  assertEqual(t.selectText(blobSql, restored), blob);
  close(t, restored);
});

/**
 * Abandons the pool's instance without disposing anything, as when its worker
 * dies, releases its handles, and opens the pool on a new instance.
 */
const setupAfterCrash = (t: TestSahPool): Promise<TestSahPool> => {
  t.fake.inject(null);
  t.fake.releaseHandles();
  return setupSahPool({ directory: t.directory, fake: t.fake });
};

// Spills the page cache, so the transaction has written pages to the database
// with its journal synced, and changes every row.
const spillSql =
  "PRAGMA cache_size = 10; BEGIN; UPDATE t SET a = 'changed' || randomblob(500)";

/**
 * Reads the records of a rollback journal as stored: segments that start with a
 * header at a multiple of the sector size, each with the number of records that
 * follow it, where 0xFFFFFFFF, as synchronous = OFF writes, counts those up to
 * the end of the journal, and records of a big-endian page number, the page and
 * a checksum.
 */
const readJournalRecords = (journal: Uint8Array) => {
  const view = new DataView(journal.buffer, journal.byteOffset);
  const magic = "d9d505f920a163d7";
  const sectorSize = view.getUint32(20);
  const records: Array<{
    readonly pageNumber: number;
    readonly page: Uint8Array;
    readonly checksum: number;
    readonly nonce: number;
  }> = [];
  for (let header = 0; header + 28 <= journal.length;) {
    if (bytesToHex(journal.subarray(header, header + 8)) !== magic) break;
    const stored = view.getUint32(header + 8);
    const nonce = view.getUint32(header + 12);
    let offset = header + sectorSize;
    const count =
      stored === 0xffffffff
        ? Math.floor((journal.length - offset) / (pageSize + 8))
        : stored;
    for (let index = 0; index < count; index++) {
      records.push({
        pageNumber: view.getUint32(offset),
        page: journal.subarray(offset + 4, offset + 4 + pageSize),
        checksum: view.getUint32(offset + 4 + pageSize),
        nonce,
      });
      offset += pageSize + 8;
    }
    header = Math.ceil(offset / sectorSize) * sectorSize;
  }
  return records;
};

/** SQLite's journal checksum of a page: the nonce plus every 200th byte. */
const journalChecksum = (nonce: number, page: Uint8Array): number => {
  let checksum = nonce;
  for (let index = page.length - 200; index > 0; index -= 200)
    checksum = (checksum + (page[index] ?? 0)) >>> 0;
  return checksum;
};

test("the hot journal of a transaction an encrypted database's dead worker left holds no row, its records' pages authenticate and decrypt with node:crypto as pages of the database to what SQLite's checksums cover, and the pool rolls it back", async () => {
  const t = await setupSahPool();
  const db = openEncrypted(t);
  assertEqual(t.exec(`${createRowsSql}; ${spillSql}`, db), SQLITE_OK);

  const next = await setupAfterCrash(t);

  assertEqual(next.pool.getPaths(), ["/evolu1.db", "/evolu1.db-journal"]);
  const journal = readFile(next, "/evolu1.db-journal");
  assertEqual(hasPlaintext(journal), false);
  const records = readJournalRecords(journal);
  assertTrue(records.length > 5);
  const salt = readFile(next).subarray(0, 16);
  for (const { pageNumber, page, checksum, nonce } of records) {
    const decrypted = decryptPageWithNodeCrypto(
      page,
      pageNumber,
      testKey,
      salt,
    );
    assertTrue(decrypted != null);
    assertEqual(journalChecksum(nonce, decrypted), checksum);
  }
  const reopened = openEncrypted(next);
  assertEqual(next.selectText(rowsSql, reopened), "200:200");
  assertEqual(next.pool.getPaths(), ["/evolu1.db"]);
  assertEqual(next.selectText("PRAGMA integrity_check", reopened), "ok");
  close(next, reopened);
});

/** Returns the IV a page stores, as hex. */
const pageIv = (page: Uint8Array): string =>
  bytesToHex(
    page.subarray(pageSize - reservedSize, pageSize - reservedSize + 16),
  );

/** Returns the IV each page of a database file stores, as hex. */
const pageIvs = (file: Uint8Array): ReadonlyArray<string> =>
  Array.from({ length: file.length / pageSize }, (_, index) =>
    pageIv(file.subarray(index * pageSize, (index + 1) * pageSize)),
  );

test("every page the pool encrypts, in the database and in its journal's records, stores an IV of its own, and a page written again stores a new one", async () => {
  const t = await setupSahPool();
  const db = openEncrypted(t);
  assertEqual(t.exec(createRowsSql, db), SQLITE_OK);
  const before = readFile(t);
  assertEqual(t.exec(spillSql, db), SQLITE_OK);

  const next = await setupAfterCrash(t);

  const after = readFile(next);
  const records = readJournalRecords(readFile(next, "/evolu1.db-journal"));
  assertTrue(records.length > 5);
  const ivs = [...pageIvs(after), ...records.map(({ page }) => pageIv(page))];
  assertEqual(new Set(ivs).size, ivs.length);
  const afterIvs = pageIvs(after);
  const rewritten = pageIvs(before).filter((_, index) => {
    const range = [index * pageSize, (index + 1) * pageSize] as const;
    return (
      bytesToHex(before.subarray(...range)) !==
      bytesToHex(after.subarray(...range))
    );
  });
  assertTrue(rewritten.length > 5);
  for (const iv of rewritten) assertFalse(afterIvs.includes(iv));
});

test("two new databases with the same key get salts of their own, neither all zeros", async () => {
  const t = await setupSahPool();
  const paths = ["/a.db", "/b.db"];
  for (const path of paths) {
    const db = openEncrypted(t, path);
    assertEqual(t.exec("CREATE TABLE t(a)", db), SQLITE_OK);
    close(t, db);
  }

  const salts = paths.map((path) =>
    bytesToHex(readFile(t, path).subarray(0, 16)),
  );
  assertEqual(new Set([...salts, "00".repeat(16)]).size, 3);
});

test("2.2.4 rolls back the hot journal the pool wrote, and the pool rolls back the hot journal 2.2.4 wrote", async () => {
  const t = await setupSahPool();
  const db = openEncrypted(t);
  assertEqual(t.exec(`${createRowsSql}; ${spillSql}`, db), SQLITE_OK);
  const next = await setupAfterCrash(t);
  assertEqual(next.pool.getPaths(), ["/evolu1.db", "/evolu1.db-journal"]);
  assertEqual(hasPlaintext(readFile(next, "/evolu1.db-journal")), false);

  const rolledBySqliteJs = await openWithSqliteJs(next);

  assertEqual(rolledBySqliteJs.selectValue(rowsSql), "200:200");
  assertEqual(rolledBySqliteJs.selectValue("PRAGMA integrity_check"), "ok");
  rolledBySqliteJs.close();
  const other = await setupSahPool();
  await writeWithSqliteJs(other, `${createRowsSql}; ${spillSql}`);
  assertEqual(other.pool.getPaths(), ["/evolu1.db", "/evolu1.db-journal"]);
  assertEqual(hasPlaintext(readFile(other, "/evolu1.db-journal")), false);

  const rolledByPool = openEncrypted(other);

  assertEqual(other.selectText(rowsSql, rolledByPool), "200:200");
  assertEqual(other.pool.getPaths(), ["/evolu1.db"]);
  assertEqual(other.selectText("PRAGMA integrity_check", rolledByPool), "ok");
  close(other, rolledByPool);
});

/**
 * Opens a database and its journal through the pool's VFS as SQLite's pager
 * does, with the journal's name after the database's in one block that starts
 * with four NUL bytes, and the key registered while the database opens.
 */
const openPagerFiles = (t: TestSahPool, key: EncryptionKey = testKey) => {
  const names = new TextEncoder().encode(
    "\0\0\0\0/evolu1.db\0\0/evolu1.db-journal\0",
  );
  const pNames = getOrThrow(allocWasm(t)(names.length));
  t.sqliteWasm.getHeapU8().set(names, pNames);
  const vfs = t.findVfs();
  const szOsFile = t.readPtr(
    (vfs + sqlite3_vfs_layout.members.szOsFile.offset) as WasmPtr,
  );
  const openRc = (offset: number, flags: number) => {
    const pFile = getOrThrow(
      allocWasm(t)(szOsFile),
    ) as WasmPtr as SqliteFilePtr;
    const rc = t.callVfs(
      "xOpen",
      pNames + offset,
      pFile,
      flags | SQLITE_OPEN_CREATE | SQLITE_OPEN_READWRITE,
      0,
    );
    return { rc, pFile };
  };
  const open = (offset: number, flags: number): SqliteFilePtr => {
    const { rc, pFile } = openRc(offset, flags);
    assertEqual(rc, SQLITE_OK);
    return pFile;
  };
  const database = (() => {
    using _registration = t.pool.registerKey(
      SqliteVfsPath.orThrow("/evolu1.db"),
      key,
    );
    return open(4, SQLITE_OPEN_MAIN_DB);
  })();
  const journal = open(4 + "/evolu1.db\0\0".length, SQLITE_OPEN_MAIN_JOURNAL);

  const writeRc = (pFile: SqliteFilePtr, bytes: Uint8Array, at: number) => {
    const pBuffer = getOrThrow(allocWasm(t)(bytes.length));
    t.sqliteWasm.getHeapU8().set(bytes, pBuffer);
    return t.callIo(pFile, "xWrite", pBuffer, bytes.length, BigInt(at));
  };
  const write = (pFile: SqliteFilePtr, bytes: Uint8Array, at: number) => {
    assertEqual(writeRc(pFile, bytes, at), SQLITE_OK);
  };
  const read = (pFile: SqliteFilePtr, byteLength: number, at: number) => {
    const pBuffer = getOrThrow(allocWasm(t)(byteLength));
    const rc = t.callIo(pFile, "xRead", pBuffer, byteLength, BigInt(at));
    return {
      rc,
      bytes: t.sqliteWasm.getHeapU8().slice(pBuffer, pBuffer + byteLength),
    };
  };
  return { database, journal, write, writeRc, read };
};

/** A page of SQLite's, its bytes from a seed, with page 1's header. */
const createPage = (seed: number, isPage1 = false): Uint8Array => {
  const page = Uint8Array.from(
    { length: pageSize },
    (_, index) => (index * seed) & 0xff,
  );
  page.fill(0, pageSize - reservedSize);
  if (isPage1) {
    page.set(new TextEncoder().encode("SQLite format 3\0"));
    page.set([pageSize >> 8, 0, 1, 1, reservedSize, 64, 32, 32], 16);
  }
  return page;
};

const uint32Be = (value: number): Uint8Array => {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value);
  return bytes;
};

test("in a journal, the pool encrypts and decrypts as that page of its database the page-sized write or read at P + 4 right after a 4-byte one at P, which numbers it, and stores as they are the record's number and checksum, a header written right after the checksum, and a page-sized write elsewhere after 4 bytes", async () => {
  const t = await setupSahPool();
  const { database, journal, write, read } = openPagerFiles(t);
  write(database, createPage(3, true), 0);
  const header = Uint8Array.from({ length: 4096 }, (_, index) => index & 0xff);
  const page = createPage(7);
  const checksum = uint32Be(0x01020304);
  // A record of page 2 at 4096, then a header right after its checksum.
  const records = 4096 + 4 + pageSize + 4;

  write(journal, header, 0);
  write(journal, uint32Be(2), 4096);
  write(journal, page, 4096 + 4);
  write(journal, checksum, 4096 + 4 + pageSize);
  write(journal, header, records);
  write(journal, uint32Be(3), records + 4096);
  write(journal, page, records + 4096 + 8);

  const stored = readFile(t, "/evolu1.db-journal");
  const salt = readFile(t).subarray(0, 16);
  assertEqualBytes(stored.subarray(0, 4096), header);
  assertEqualBytes(stored.subarray(4096, 4100), uint32Be(2));
  const decrypted = decryptPageWithNodeCrypto(
    stored.subarray(4100, 4100 + pageSize),
    2,
    testKey,
    salt,
  );
  assertTrue(decrypted != null);
  // The reserved bytes hold the IV and the HMAC, as stored.
  const end = pageSize - reservedSize;
  assertEqualBytes(decrypted.subarray(0, end), page.subarray(0, end));
  assertEqualBytes(stored.subarray(records - 4, records), checksum);
  assertEqualBytes(stored.subarray(records, records + 4096), header);
  assertEqualBytes(
    stored.subarray(records + 4096 + 8, records + 4096 + 8 + pageSize),
    page,
  );

  assertEqual(read(journal, 4096, 0), { rc: SQLITE_OK, bytes: header });
  assertEqual(read(journal, 4, 4096).rc, SQLITE_OK);
  const readPage = read(journal, pageSize, 4100);
  assertEqual(readPage.rc, SQLITE_OK);
  assertEqualBytes(readPage.bytes.subarray(0, end), page.subarray(0, end));
  assertEqual(read(journal, 4, records - 4), {
    rc: SQLITE_OK,
    bytes: checksum,
  });
  assertEqual(read(journal, 4096, records), { rc: SQLITE_OK, bytes: header });
  assertEqual(t.callIo(journal, "xClose"), SQLITE_OK);
  assertEqual(t.callIo(database, "xClose"), SQLITE_OK);
});

test("reads of part of page 1, the first 100 bytes and the change counter at 24, return page 1 decrypted when it authenticates and as stored when it does not, recording nothing", async () => {
  const t = await setupSahPool();
  const created = openPagerFiles(t);
  const page1 = createPage(3, true);
  created.write(created.database, page1, 0);
  assertEqual(t.callIo(created.journal, "xClose"), SQLITE_OK);
  assertEqual(t.callIo(created.database, "xClose"), SQLITE_OK);
  const stored = readFile(t);

  for (const [key, expected] of [
    [testKey, page1],
    [otherKey, stored],
  ] as const) {
    const { database, journal, read } = openPagerFiles(t, key);
    t.pool.clearFailure();

    assertEqual(read(database, 100, 0), {
      rc: SQLITE_OK,
      bytes: expected.slice(0, 100),
    });
    assertEqual(read(database, 16, 24), {
      rc: SQLITE_OK,
      bytes: expected.slice(24, 40),
    });
    assertEqual(t.pool.getFailure(), null);
    assertEqual(t.callIo(journal, "xClose"), SQLITE_OK);
    assertEqual(t.callIo(database, "xClose"), SQLITE_OK);
  }
});

test("a read of part of page 1 whose stored page size is no page size, such as 0, returns page 1 as stored, recording nothing", async () => {
  const t = await setupSahPool();
  const { database, journal, write, read } = openPagerFiles(t);
  write(database, createPage(3, true), 0);
  const slotPath = t.findSlotPath("/evolu1.db");
  const slot = t.fake.readFile(slotPath);
  assertTrue(slot != null);
  // Bytes 16 and 17 hold the page size.
  slot.fill(0, sahPoolHeaderSize + 16, sahPoolHeaderSize + 18);
  t.fake.writeFile(slotPath, slot);
  const stored = readFile(t);
  t.pool.clearFailure();

  assertEqual(read(database, 100, 0), {
    rc: SQLITE_OK,
    bytes: stored.slice(0, 100),
  });
  assertEqual(t.pool.getFailure(), null);
  assertEqual(t.callIo(journal, "xClose"), SQLITE_OK);
  assertEqual(t.callIo(database, "xClose"), SQLITE_OK);
});

test("databases of 1024-, 4096- and 65536-byte pages, the last stored in page 1 as 1, authenticate and decrypt with node:crypto to the pages SQLite has, return page 1's first 100 bytes decrypted, and 2.2.4 reads every row", async () => {
  for (const size of [1024, 4096, 65536]) {
    const t = await setupSahPool();
    const db = openEncrypted(t);
    assertEqual(
      t.exec(`PRAGMA page_size = ${size}; ${createRowsSql}`, db),
      SQLITE_OK,
    );
    const plaintext = serialize(t, db);
    close(t, db);
    const file = readFile(t);

    // The page size, big-endian, with 65536 as 1.
    assertEqual([file[16], file[17]], [(size >> 8) & 0xff, size >> 16]);
    assertEqual(file.length, plaintext.length);
    for (const [index, page] of decryptWithNodeCrypto(
      file,
      testKey,
      size,
    ).entries()) {
      assertTrue(typeof page !== "number");
      const offset = index * size;
      assertEqualBytes(
        page.subarray(0, size - reservedSize),
        plaintext.subarray(offset, offset + size - reservedSize),
      );
    }
    const { database, journal, read } = openPagerFiles(t);
    assertEqual(read(database, 100, 0), {
      rc: SQLITE_OK,
      bytes: plaintext.slice(0, 100),
    });
    assertEqual(t.callIo(journal, "xClose"), SQLITE_OK);
    assertEqual(t.callIo(database, "xClose"), SQLITE_OK);
    const reference = await openWithSqliteJs(t);
    assertEqual(reference.selectValue(rowsSql), "200:200");
    assertEqual(reference.selectValue("PRAGMA integrity_check"), "ok");
    reference.close();
  }
});

test("a hot journal rolls back a page 1 its transaction's crash left torn in the database, which does not authenticate until then", async () => {
  const t = await setupSahPool();
  const db = openEncrypted(t);
  assertEqual(
    t.exec(
      `${createRowsSql}; PRAGMA cache_size = 10; BEGIN; CREATE TABLE u(a); UPDATE t SET a = 'changed' || randomblob(500)`,
      db,
    ),
    SQLITE_OK,
  );
  const next = await setupAfterCrash(t);
  const journal = readFile(next, "/evolu1.db-journal");
  assertTrue(
    readJournalRecords(journal).some(({ pageNumber }) => pageNumber === 1),
  );
  flipByte(next, 100);

  const reopened = openEncrypted(next);

  assertEqual(next.selectText(rowsSql, reopened), "200:200");
  assertEqual(
    next.selectText("SELECT count(*) FROM sqlite_schema", reopened),
    "1",
  );
  assertEqual(next.selectText("PRAGMA integrity_check", reopened), "ok");
  assertEqual(next.pool.getPaths(), ["/evolu1.db"]);
  close(next, reopened);
});

/** Zeroes a range of a file of the pool as stored, by offsets in its data. */
const zeroBytes = (
  t: TestSahPool,
  from: number,
  to: number,
  path = "/evolu1.db",
) => {
  const slotPath = t.findSlotPath(path);
  const bytes = t.fake.readFile(slotPath);
  assert(bytes != null, "No file");
  bytes.fill(0, sahPoolHeaderSize + from, sahPoolHeaderSize + to);
  t.fake.writeFile(slotPath, bytes);
};

// A plain UPDATE journals page 1 last, when its commit changes the change
// counter, and the commit writes page 1 first. Before page 1 authenticates,
// the records are authenticated with the salt of the database's page 1, whose
// first bytes a crash can leave as zeros, so the journal's own page 1 gives
// the salt and proves the key.
test("a hot journal whose page-1 record is not its first rolls back a database whose page 1 the crash left with zeros in its first bytes, its salt included or not, or wholly, also when synchronous = OFF left the journal's record count unset, or page 1 is in a later segment", async () => {
  const updateSql =
    "UPDATE t SET a = 'MARKER' || rowid || zeroblob(500) WHERE rowid % 50 = 0";
  for (const [beforeSql, crashingSql] of [
    ["SELECT 1", updateSql],
    // The journal's header counts 0xFFFFFFFF records.
    ["PRAGMA synchronous = OFF", updateSql],
    // The spills sync the journal, so the commit journals page 1 in a
    // segment after the first.
    [
      "PRAGMA cache_size = 10; BEGIN; UPDATE t SET a = 'MARKER' || rowid || zeroblob(500)",
      "COMMIT",
    ],
  ])
    for (const [from, to] of [
      [0, 16],
      [0, 4096],
      [0, pageSize],
      [16, 4096],
    ]) {
      const t = await setupSahPool();
      const db = openEncrypted(t);
      assertEqual(t.exec(`${createRowsSql}; ${beforeSql}`, db), SQLITE_OK);
      // The first database write, page 1, lands, and every later write or
      // truncate, the journal's delete included, does not.
      const databaseSlot = t.findSlotPath("/evolu1.db");
      let databaseWrites = 0;
      t.fake.inject((call) => {
        if (call.method !== "write" && call.method !== "truncate") return null;
        if (databaseWrites > 0) return { type: "Drop" };
        if (call.method === "write" && call.path === databaseSlot)
          databaseWrites++;
        return null;
      });
      assertEqual(t.exec(crashingSql, db), SQLITE_OK);
      const next = await setupAfterCrash(t);
      const pageNumbers = readJournalRecords(
        readFile(next, "/evolu1.db-journal"),
      ).map(({ pageNumber }) => pageNumber);
      assertTrue(pageNumbers.length > 1 && pageNumbers.at(-1) === 1);
      zeroBytes(next, from, to);
      next.pool.clearFailure();

      const reopened = openEncrypted(next);

      assertEqual(next.selectText(rowsSql, reopened), "200:200");
      assertEqual(next.selectText("PRAGMA integrity_check", reopened), "ok");
      assertEqual(next.pool.getFailure(), null);
      assertEqual(next.pool.getPaths(), ["/evolu1.db"]);
      close(next, reopened);
    }
});

test("a hot journal without a page-1 record fails to roll back a database whose page 1's salt is zeros with SQLITE_CORRUPT, recording a SqlitePageAuthenticationError for the first record, and keeps the journal", async () => {
  const t = await setupSahPool();
  const db = openEncrypted(t);
  assertEqual(t.exec(`${createRowsSql}; ${spillSql}`, db), SQLITE_OK);
  const next = await setupAfterCrash(t);
  const records = readJournalRecords(readFile(next, "/evolu1.db-journal"));
  assertTrue(records.length > 1);
  assertFalse(records.some(({ pageNumber }) => pageNumber === 1));
  zeroBytes(next, 0, 16);
  const reopened = openEncrypted(next);
  next.pool.clearFailure();

  assertEqual(next.exec(rowsSql, reopened), SQLITE_CORRUPT);

  assertEqual(next.pool.getFailure(), {
    method: "xRead",
    path: "/evolu1.db-journal",
    error: {
      type: "SqlitePageAuthenticationError",
      pageNumber: records[0].pageNumber,
    },
  });
  close(next, reopened);
  assertEqual(next.pool.getPaths(), ["/evolu1.db", "/evolu1.db-journal"]);
});

// With synchronous = OFF, SQLite plays a journal back to its end and stops at
// the first record whose checksum differs. A journal that exclusive locking
// mode or journal_mode = PERSIST keeps still holds the previous transaction's
// records, so a worker that dies right after writing a record's page number
// leaves it before a stale page, encrypted as another page.
test("a journal record a dead worker left torn under synchronous = OFF, in a journal that exclusive locking mode or journal_mode = PERSIST kept, ends the rollback for the right key, which reads every row with no journal left, as plain SQLite does, while a wrong key fails with SQLITE_CORRUPT and keeps the journal", async () => {
  for (const journalPragma of [
    "PRAGMA locking_mode = EXCLUSIVE",
    "PRAGMA journal_mode = PERSIST",
  ]) {
    const t = await setupSahPool();
    const db = openEncrypted(t);
    assertEqual(
      t.exec(
        `${journalPragma}; PRAGMA synchronous = OFF; ${createRowsSql}`,
        db,
      ),
      SQLITE_OK,
    );
    // The journal's header, then the first record's page number.
    t.fake.inject(crashAfterWrites(2));
    t.exec("UPDATE t SET a = 'changed' WHERE rowid > 100", db);
    const next = await setupAfterCrash(t);
    assertEqual(next.pool.getPaths(), ["/evolu1.db", "/evolu1.db-journal"]);
    const journal = readFile(next, "/evolu1.db-journal");
    // After the header, which is as long as the sector size, 4096.
    const pageNumber = new DataView(
      journal.buffer,
      journal.byteOffset,
    ).getUint32(4096);

    const wrongKey = openEncrypted(next, "/evolu1.db", otherKey);
    next.pool.clearFailure();

    assertEqual(next.exec(rowsSql, wrongKey), SQLITE_CORRUPT);
    assertEqual(next.pool.getFailure(), {
      method: "xRead",
      path: "/evolu1.db-journal",
      error: { type: "SqlitePageAuthenticationError", pageNumber },
    });
    close(next, wrongKey);
    assertEqual(next.pool.getPaths(), ["/evolu1.db", "/evolu1.db-journal"]);
    const reopened = openEncrypted(next);
    next.pool.clearFailure();
    assertEqual(next.selectText(rowsSql, reopened), "200:200");
    assertEqual(next.selectText("PRAGMA integrity_check", reopened), "ok");
    assertEqual(next.pool.getFailure(), null);
    assertEqual(next.pool.getPaths(), ["/evolu1.db"]);
    close(next, reopened);
  }
});

// Exclusive locking mode keeps the journal, so when writing page 1's record
// fails after its page number, SQLite's rollback in the session reads page 1
// from a stale page encrypted as another page, whose first bytes would be taken
// as the salt. With no page 1 read before the next commit, which exclusive
// locking mode skips, that commit would write every page with that salt. A
// page 1 that does not reserve 80 bytes fails before its salt is looked at, so
// the stale page gets 80 in byte 20, as one stale page in 256 has.
test("a journal record's page 1 that fails to authenticate, as the stale page after page 1's number in a journal that exclusive locking mode kept, whose write failed, changes no salt, so the next commit keeps every page readable", async () => {
  for (const [error, code] of [
    [new DOMException("Failed.", "InvalidStateError"), SQLITE_IOERR_WRITE],
    [createQuotaExceededError(), SQLITE_FULL],
  ] as const) {
    const t = await setupSahPool();
    const db = openEncrypted(t);
    assertEqual(
      t.exec(`PRAGMA locking_mode = EXCLUSIVE; ${createRowsSql}`, db),
      SQLITE_OK,
    );
    // Leaves records in the journal.
    assertEqual(
      t.exec("UPDATE t SET a = 'marker' || rowid || zeroblob(500)", db),
      SQLITE_OK,
    );
    const salt = readFile(t).slice(0, 16);
    const journalSlot = t.findSlotPath("/evolu1.db-journal");
    const journal = t.fake.readFile(journalSlot);
    assert(journal != null, "No journal");
    journal[sahPoolHeaderSize + 4100 + 20] = reservedSize;
    t.fake.writeFile(journalSlot, journal);
    let failed = false;
    // Page 1's record page, right after its page number at 4096.
    t.fake.inject((call) => {
      if (
        failed ||
        call.method !== "write" ||
        call.path !== journalSlot ||
        call.at !== sahPoolHeaderSize + 4100
      )
        return null;
      failed = true;
      return { type: "Throw", error };
    });

    assertFalse(t.exec("CREATE TABLE u(x)", db) === SQLITE_OK);
    assertEqual(sqlite3_extended_errcode(t)(db), code);
    t.fake.inject(null);
    assertTrue(failed);
    assertEqual(t.exec(insertRowsSql(201, 210), db), SQLITE_OK);
    close(t, db);

    const reopened = openEncrypted(t);
    assertEqual(t.selectText(rowsSql, reopened), "210:210");
    assertEqual(t.selectText("PRAGMA integrity_check", reopened), "ok");
    close(t, reopened);
    assertEqualBytes(readFile(t).subarray(0, 16), salt);
  }
});

const encryptionUnsupported = (
  method: "xOpen" | "xRead" | "xWrite",
  path: string | null,
) => ({ method, path, error: { type: "SahPoolEncryptionUnsupported" } });

// Torn first bytes of page 1 must not give the salt when a connection opens its
// own hot journal, or the rollback stops at the first record and deletes the
// journal. A plain UPDATE journals page 1, whose record gives the salt.
test("a connection whose key is proven rolls its own hot journal back wholly although the database's salt is then torn, because the journal's page-1 record gives the salt", async () => {
  const t = await setupSahPool();
  const db = openEncrypted(t);
  assertEqual(t.exec(createRowsSql, db), SQLITE_OK);
  assertEqual(t.selectText(rowsSql, db), "200:200");
  const databaseSlot = t.findSlotPath("/evolu1.db");
  let databaseWrites = 0;
  t.fake.inject((call) => {
    if (call.path !== databaseSlot) return null;
    if (call.method === "write" && databaseWrites++ === 0) return null;
    return call.method === "write" || call.method === "truncate"
      ? {
          type: "Throw",
          error: new DOMException("Failed.", "InvalidStateError"),
        }
      : null;
  });
  assertEqual(
    t.exec("UPDATE t SET a = 'changed' WHERE rowid % 40 = 0", db),
    SQLITE_IOERR,
  );
  t.fake.inject(null);
  assertEqual(t.pool.getPaths(), ["/evolu1.db", "/evolu1.db-journal"]);
  const stored = t.fake.readFile(databaseSlot);
  assert(stored != null, "No database file");
  stored.fill(0, sahPoolHeaderSize, sahPoolHeaderSize + 16);
  t.fake.writeFile(databaseSlot, stored);

  assertEqual(t.selectText(rowsSql, db), "200:200");

  assertEqual(t.selectText("PRAGMA integrity_check", db), "ok");
  assertEqual(t.pool.getPaths(), ["/evolu1.db"]);
  close(t, db);
});

// A transaction that spilled before its commit has journaled no page 1, and a
// torn page 1 does not authenticate, so neither gives a salt. A connection whose
// key a page 1 proved keeps the salt that page 1 stored, which a database keeps
// while it has pages.
test("a connection whose key is proven rolls back another connection's hot journal without a page-1 record wholly although the database's salt is torn, because it keeps the proven salt", async () => {
  const t = await setupSahPool();
  const reader = openEncrypted(t);
  assertEqual(t.exec(createRowsSql, reader), SQLITE_OK);
  assertEqual(t.selectText(rowsSql, reader), "200:200");
  const writer = openEncrypted(t);
  const databaseSlot = t.findSlotPath("/evolu1.db");
  let databaseWrites = 0;
  t.fake.inject((call) => {
    if (call.path !== databaseSlot) return null;
    if (call.method === "write" && databaseWrites++ < 3) return null;
    return call.method === "write" || call.method === "truncate"
      ? {
          type: "Throw",
          error: new DOMException("Failed.", "InvalidStateError"),
        }
      : null;
  });
  assertEqual(t.exec(spillSql, writer), SQLITE_IOERR);
  close(t, writer);
  t.fake.inject(null);
  assertEqual(t.pool.getPaths(), ["/evolu1.db", "/evolu1.db-journal"]);
  const stored = t.fake.readFile(databaseSlot);
  assert(stored != null, "No database file");
  const salt = stored.slice(sahPoolHeaderSize, sahPoolHeaderSize + 16);
  zeroBytes(t, 0, 16);

  // The rollback completes, and page 1, which it does not restore, then fails.
  assertEqual(t.exec(rowsSql, reader), SQLITE_NOTADB);

  assertEqual(t.pool.getPaths(), ["/evolu1.db"]);
  const torn = t.fake.readFile(databaseSlot);
  assert(torn != null, "No database file");
  torn.set(salt, sahPoolHeaderSize);
  t.fake.writeFile(databaseSlot, torn);
  assertEqual(t.selectText(rowsSql, reader), "200:200");
  assertEqual(t.selectText("PRAGMA integrity_check", reader), "ok");
  close(t, reader);
});

// Opening a database reads the first 100 bytes of page 1 with no lock, so a
// connection can prove its key with the page 1 of a new database's first
// transaction, which then rolls back. Its proven salt is stale once another
// connection creates the database again, and a hot journal without a page-1
// record must then be authenticated with the salt of the database's page 1.
test("a connection whose key the uncommitted page 1 of a new database proved rolls back wholly the hot journal another connection left in the database it then created with another salt", async () => {
  const t = await setupSahPool();
  const creator = openEncrypted(t);
  const databaseSlot = t.findSlotPath("/evolu1.db");
  const error = new DOMException("Failed.", "InvalidStateError");
  // The commit writes page 1, then fails, and so does its rollback.
  let databaseWrites = 0;
  t.fake.inject((call) => {
    if (call.path !== databaseSlot) return null;
    if (call.method === "write" && databaseWrites++ === 0) return null;
    return call.method === "write" || call.method === "truncate"
      ? { type: "Throw", error }
      : null;
  });
  assertEqual(t.exec(createRowsSql, creator), SQLITE_IOERR);
  t.fake.inject(null);
  close(t, creator);
  assertEqual(t.pool.getPaths(), ["/evolu1.db", "/evolu1.db-journal"]);
  const reader = openEncrypted(t);
  assertEqual(t.selectText("SELECT count(*) FROM sqlite_schema", reader), "0");
  assertEqual(readFile(t).length, 0);
  const writer = openEncrypted(t);
  assertEqual(t.exec(`${createRowsSql}; ${spillSql}`, writer), SQLITE_OK);
  // The writer's rollback cannot write the database, so its journal stays.
  t.fake.inject((call) =>
    call.path === databaseSlot &&
    (call.method === "write" || call.method === "truncate")
      ? { type: "Throw", error }
      : null,
  );
  close(t, writer);
  t.fake.inject(null);
  const records = readJournalRecords(readFile(t, "/evolu1.db-journal"));
  assertTrue(records.length > 1);
  assertFalse(records.some(({ pageNumber }) => pageNumber === 1));
  t.pool.clearFailure();

  assertEqual(t.selectText(rowsSql, reader), "200:200");

  assertEqual(t.selectText("PRAGMA integrity_check", reader), "ok");
  assertEqual(t.pool.getFailure(), null);
  assertEqual(t.pool.getPaths(), ["/evolu1.db"]);
  close(t, reader);
});

// A journal whose first header stores an original size of 0 pages journals no
// page, so the first bytes of its database are a hole a spill left before page
// 1 was written, not a salt.
test("a database that a connection with the key creates after rolling back a new database's spilled first transaction gets a random salt, not the zeros the spill left", async () => {
  const t = await setupSahPool();
  const created = openEncrypted(t);
  assertEqual(
    t.exec(
      `PRAGMA cache_size = 10; BEGIN; CREATE TABLE t(a); ${insertRowsSql(1, 200)}`,
      created,
    ),
    SQLITE_OK,
  );
  const next = await setupAfterCrash(t);
  assertTrue(
    readFile(next)
      .subarray(0, 16)
      .every((byte) => byte === 0),
  );
  const db = openEncrypted(next);
  assertEqual(next.selectText("SELECT count(*) FROM sqlite_schema", db), "0");

  assertEqual(next.exec(createRowsSql, db), SQLITE_OK);

  assertFalse(
    readFile(next)
      .subarray(0, 16)
      .every((byte) => byte === 0),
  );
  assertEqual(next.selectText(rowsSql, db), "200:200");
  close(next, db);
});

// Opening a database reads the first 100 bytes of page 1, which a power loss
// during a new database's first commit can leave torn. Its journal stores an
// original size of 0 pages, so rolling it back empties the database.
test("a database that a connection with the key creates after rolling back a new database's first commit, which left page 1 torn in its salt, gets a random salt, not the zeros of the tear", async () => {
  const t = await setupSahPool();
  const created = openEncrypted(t);
  // The first database write, page 1, lands, and every later write or
  // truncate, the journal's delete included, does not.
  const databaseSlot = t.findSlotPath("/evolu1.db");
  let databaseWrites = 0;
  t.fake.inject((call) => {
    if (call.method !== "write" && call.method !== "truncate") return null;
    if (databaseWrites > 0) return { type: "Drop" };
    if (call.method === "write" && call.path === databaseSlot) databaseWrites++;
    return null;
  });
  assertEqual(t.exec(`BEGIN; ${createRowsSql}; COMMIT`, created), SQLITE_OK);
  const next = await setupAfterCrash(t);
  assertEqual(next.pool.getPaths(), ["/evolu1.db", "/evolu1.db-journal"]);
  zeroBytes(next, 0, 16);
  const db = openEncrypted(next);
  assertEqual(next.selectText("SELECT count(*) FROM sqlite_schema", db), "0");

  assertEqual(next.exec(createRowsSql, db), SQLITE_OK);

  assertFalse(
    readFile(next)
      .subarray(0, 16)
      .every((byte) => byte === 0),
  );
  assertEqual(next.selectText(rowsSql, db), "200:200");
  close(next, db);
});

// PERSIST zeroes a journal's header, which then stores an original size of 0,
// TRUNCATE leaves it empty, and a crash before a journal's first sync leaves
// zeros in place of its magic, which SQLite's hot test reads, except with
// synchronous = OFF, which writes the magic with the header. So such a
// leftover journal opens, and SQLite then fails to read page 1 without the key,
// as without a journal.
test("a connection without the key to an encrypted database with a leftover journal that is not hot, as PERSIST and TRUNCATE keep it and a crash before its first sync leaves it, fails with SQLITE_NOTADB from SQLite, recording nothing, as without a journal", async () => {
  for (const journalMode of ["PERSIST", "TRUNCATE", "DELETE"]) {
    const created = await setupSahPool();
    const db = openEncrypted(created);
    assertEqual(
      created.exec(
        `PRAGMA journal_mode = ${journalMode}; ${createRowsSql}`,
        db,
      ),
      SQLITE_OK,
    );
    // Only the journal's slot header and its first header land. The first
    // header stores the original size, and zeros for the magic until the
    // first sync.
    if (journalMode === "DELETE") {
      created.fake.inject(crashAfterWrites(2));
      assertEqual(created.exec("UPDATE t SET a = 'changed'", db), SQLITE_OK);
    } else close(created, db);
    const t =
      journalMode === "DELETE" ? await setupAfterCrash(created) : created;
    assertEqual(t.pool.getPaths(), ["/evolu1.db", "/evolu1.db-journal"]);
    if (journalMode === "DELETE") {
      const journal = readFile(t, "/evolu1.db-journal");
      assertEqual(journal[0], 0);
      assertTrue(journal.subarray(16, 20).some((byte) => byte !== 0));
    }
    const keyless = t.openDatabase("/evolu1.db");
    assertEqual(keyless.rc, SQLITE_OK);
    t.pool.clearFailure();

    assertEqual(t.exec(rowsSql, keyless.db), SQLITE_NOTADB);

    assertEqual(t.pool.getFailure(), null);
    close(t, keyless.db);
  }
});

// Without the key, the journal's pages reach SQLite as stored, the first
// record's checksum differs, and SQLite would take that as the end of the
// journal and delete it, leaving the transaction half-applied. A journal SQLite
// cannot open counts as hot, and a rollback that cannot open it fails. Only an
// empty database has no first bytes, so zeros there, as a torn write can leave
// in place of the salt, do not prove the database is not encrypted.
test("a connection without the key to an encrypted database whose dead worker left a hot journal fails with SQLITE_CANTOPEN, recording a SahPoolEncryptionUnsupportedError for the journal, also when the database's salt is zeros, or what reading the database's first 16 bytes threw, changes neither file, and the right key then rolls the journal back wholly", async () => {
  const readError = new DOMException("Failed.", "InvalidStateError");
  // Creating a table journals page 1, whose salt the rollback restores, so the
  // key can roll the journal back although the database's salt is zeros.
  const spillPageOneSql =
    "PRAGMA cache_size = 10; BEGIN; CREATE TABLE u(x); UPDATE t SET a = 'changed' || randomblob(500)";
  for (const [fault, failure, zeroSalt] of [
    [null, encryptionUnsupported("xOpen", "/evolu1.db-journal"), false],
    [null, encryptionUnsupported("xOpen", "/evolu1.db-journal"), true],
    [
      { type: "Throw", error: readError },
      { method: "xOpen", path: "/evolu1.db-journal", error: readError },
      false,
    ],
  ] as const) {
    const t = await setupSahPool();
    const db = openEncrypted(t);
    assertEqual(
      t.exec(`${createRowsSql}; ${zeroSalt ? spillPageOneSql : spillSql}`, db),
      SQLITE_OK,
    );
    if (zeroSalt) {
      const databaseSlot = t.findSlotPath("/evolu1.db");
      const bytes = t.fake.readFile(databaseSlot);
      assert(bytes != null, "No database file");
      bytes.fill(0, sahPoolHeaderSize, sahPoolHeaderSize + 16);
      t.fake.writeFile(databaseSlot, bytes);
    }
    const next = await setupAfterCrash(t);
    const database = readFile(next);
    const journal = readFile(next, "/evolu1.db-journal");
    const keyless = next.openDatabase("/evolu1.db");
    assertEqual(keyless.rc, SQLITE_OK);
    next.fake.inject((call) =>
      call.method === "read" &&
      call.at === sahPoolHeaderSize &&
      call.length === 16
        ? fault
        : null,
    );
    next.pool.clearFailure();

    assertEqual(next.exec(rowsSql, keyless.db), SQLITE_CANTOPEN);
    assertEqual(next.pool.getFailure(), failure);
    next.fake.inject(null);
    close(next, keyless.db);
    assertEqual(next.pool.getPaths(), ["/evolu1.db", "/evolu1.db-journal"]);
    assertEqualBytes(readFile(next), database);
    assertEqualBytes(readFile(next, "/evolu1.db-journal"), journal);
    const reopened = openEncrypted(next);
    assertEqual(next.selectText(rowsSql, reopened), "200:200");
    assertEqual(next.selectText("PRAGMA integrity_check", reopened), "ok");
    assertEqual(next.pool.getPaths(), ["/evolu1.db"]);
    close(next, reopened);
  }
});

// A page 1 that reserves other than 80 bytes would fail every later read.
test("a new encrypted database whose page 1 reserves other than 80 bytes, none or 81, fails to write it with SQLITE_IOERR_WRITE, recording a SahPoolEncryptionUnsupportedError", async () => {
  for (const reserved of [null, 81]) {
    const t = await setupSahPool();
    const db = (() => {
      using _registration = t.pool.registerKey(
        SqliteVfsPath.orThrow("/evolu1.db"),
        testKey,
      );
      return t.openDatabase("/evolu1.db").db;
    })();
    if (reserved != null) reserveBytes(t, db, reserved);
    t.pool.clearFailure();

    assertEqual(t.exec("CREATE TABLE t(a)", db), SQLITE_IOERR);
    assertEqual(sqlite3_extended_errcode(t)(db), SQLITE_IOERR_WRITE);
    assertEqual(
      t.pool.getFailure(),
      encryptionUnsupported("xWrite", "/evolu1.db"),
    );
    close(t, db);
  }
});

// Plain SQLite's VACUUM writes page 1 with the new page size in its header but
// in pages of the old size, which every later read of page 1 would fail to
// authenticate. SQLite3 Multiple Ciphers patches VACUUM to keep the old size.
test("a VACUUM that would change an encrypted database's page size, also one run after the pragma, fails with SQLITE_IOERR_WRITE, recording a SahPoolEncryptionUnsupportedError, and leaves the database as it was, while a VACUUM that keeps the page size works", async () => {
  for (const [before, sql, rc] of [
    ["", "PRAGMA page_size = 4096; VACUUM", SQLITE_IOERR],
    ["", "PRAGMA page_size = 16384; VACUUM", SQLITE_IOERR],
    ["", "PRAGMA page_size = 65536; VACUUM", SQLITE_IOERR],
    // The pragma alone leaves an existing database's page size, but the
    // connection keeps it for its next VACUUM.
    ["PRAGMA page_size = 4096", "VACUUM", SQLITE_IOERR],
    ["", "PRAGMA page_size = 8192; VACUUM", SQLITE_OK],
    ["", "VACUUM", SQLITE_OK],
    ["", "PRAGMA auto_vacuum = FULL; VACUUM", SQLITE_OK],
  ] as const) {
    const t = await setupSahPool();
    const db = openEncrypted(t);
    assertEqual(t.exec(`${createRowsSql}; ${before}`, db), SQLITE_OK);
    t.pool.clearFailure();

    assertEqual(t.exec(sql, db), rc);

    if (rc === SQLITE_IOERR) {
      assertEqual(sqlite3_extended_errcode(t)(db), SQLITE_IOERR_WRITE);
      assertEqual(
        t.pool.getFailure(),
        encryptionUnsupported("xWrite", "/evolu1.db"),
      );
    } else assertEqual(t.pool.getFailure(), null);
    assertEqual(t.selectText(rowsSql, db), "200:200");
    assertEqual(t.selectText("PRAGMA page_size", db), `${pageSize}`);
    assertEqual(t.selectText("PRAGMA integrity_check", db), "ok");
    assertEqual(t.exec(insertRowsSql(201, 201), db), SQLITE_OK);
    close(t, db);
    const reopened = openEncrypted(t);
    assertEqual(t.selectText(rowsSql, reopened), "201:201");
    assertEqual(t.selectText("PRAGMA page_size", reopened), `${pageSize}`);
    assertEqual(t.selectText("PRAGMA integrity_check", reopened), "ok");
    assertEqual(t.pool.getPaths(), ["/evolu1.db"]);
    close(t, reopened);
  }
});

test("an encrypted database's read that is not a whole page and lies past page 1, which is zero-filled, or write that is not a whole page, fails with SQLITE_IOERR_READ or SQLITE_IOERR_WRITE, recording a SahPoolEncryptionUnsupportedError", async () => {
  const t = await setupSahPool();
  const { database, journal, write, writeRc, read } = openPagerFiles(t);
  write(database, createPage(3, true), 0);
  write(database, createPage(5), pageSize);
  const stored = readFile(t);
  t.pool.clearFailure();

  assertEqual(read(database, 100, pageSize + 10), {
    rc: SQLITE_IOERR_READ,
    bytes: new Uint8Array(100),
  });
  assertEqual(
    t.pool.getFailure(),
    encryptionUnsupported("xRead", "/evolu1.db"),
  );
  t.pool.clearFailure();
  for (const [byteLength, at] of [
    [100, 0],
    [pageSize, 100],
    [pageSize * 2, 0],
  ] as const) {
    assertEqual(
      writeRc(database, new Uint8Array(byteLength).fill(1), at),
      SQLITE_IOERR_WRITE,
    );
    assertEqual(
      t.pool.getFailure(),
      encryptionUnsupported("xWrite", "/evolu1.db"),
    );
    t.pool.clearFailure();
  }
  assertEqualBytes(readFile(t), stored);
  assertEqual(t.callIo(journal, "xClose"), SQLITE_OK);
  assertEqual(t.callIo(database, "xClose"), SQLITE_OK);
});

test("a whole-page read of a page whose HMAC differs returns SQLITE_CORRUPT with the page zero-filled", async () => {
  const t = await setupSahPool();
  const { database, journal, write, read } = openPagerFiles(t);
  write(database, createPage(3, true), 0);
  write(database, createPage(5), pageSize);
  // The last byte of page 2's HMAC.
  flipByte(t, 2 * pageSize - 1);

  assertEqual(read(database, pageSize, pageSize), {
    rc: SQLITE_CORRUPT,
    bytes: new Uint8Array(pageSize),
  });
  assertEqual(t.callIo(journal, "xClose"), SQLITE_OK);
  assertEqual(t.callIo(database, "xClose"), SQLITE_OK);
});

test("a whole-page read of page 1 at another size than page 1 stores returns page 1 decrypted at its stored size, the read's first bytes of it and zeros past it, recording nothing, and with page 1 shorter than its stored size fails with SQLITE_NOTADB with the read zero-filled, recording a SqlitePageAuthenticationError", async () => {
  const t = await setupSahPool();
  const { database, journal, write, read } = openPagerFiles(t);
  write(database, createPage(3, true), 0);
  write(database, createPage(5), pageSize);
  const slotPath = t.findSlotPath("/evolu1.db");
  const stored = t.fake.readFile(slotPath);
  assertTrue(stored != null);
  // With its IV and HMAC in the reserved bytes, as SQLite reads it.
  const page1 = read(database, pageSize, 0);
  assertEqual(page1.rc, SQLITE_OK);
  const page1AndZeros = new Uint8Array(2 * pageSize);
  page1AndZeros.set(page1.bytes);
  t.pool.clearFailure();

  assertEqual(read(database, pageSize / 2, 0), {
    rc: SQLITE_OK,
    bytes: page1.bytes.slice(0, pageSize / 2),
  });
  assertEqual(read(database, 2 * pageSize, 0), {
    rc: SQLITE_OK,
    bytes: page1AndZeros,
  });
  t.fake.writeFile(slotPath, stored.slice(0, sahPoolHeaderSize + pageSize));
  assertEqual(read(database, 2 * pageSize, 0), {
    rc: SQLITE_IOERR_SHORT_READ,
    bytes: page1AndZeros,
  });
  assertEqual(t.pool.getFailure(), null);
  t.fake.writeFile(slotPath, stored.slice(0, sahPoolHeaderSize + 100));
  assertEqual(read(database, pageSize / 2, 0), {
    rc: SQLITE_NOTADB,
    bytes: new Uint8Array(pageSize / 2),
  });
  assertEqual(t.pool.getFailure(), {
    method: "xRead",
    path: "/evolu1.db",
    error: { type: "SqlitePageAuthenticationError", pageNumber: 1 },
  });
  assertEqual(t.callIo(journal, "xClose"), SQLITE_OK);
  assertEqual(t.callIo(database, "xClose"), SQLITE_OK);
});

// SQLite reads a page only within the file, so a page that ends early was cut
// off or torn, and zeros in its place would pass as its data, which no
// integrity check notices in an overflow page. A page past the end, as page 1
// of an empty file, reads nothing and stays a short read.
test("a whole-page read of an encrypted database that ends mid-page fails with SQLITE_CORRUPT with the whole page zero-filled, recording a SqlitePageAuthenticationError, so neither ciphertext nor zeros reach SQLite as the page, while a read past the end returns SQLITE_IOERR_SHORT_READ, recording nothing", async () => {
  const t = await setupSahPool();
  const { database, journal, write, read } = openPagerFiles(t);
  write(database, createPage(3, true), 0);
  write(database, createPage(5), pageSize);
  const slotPath = t.findSlotPath("/evolu1.db");
  const stored = t.fake.readFile(slotPath);
  assertTrue(stored != null);
  t.fake.writeFile(
    slotPath,
    stored.slice(0, sahPoolHeaderSize + pageSize + 100),
  );
  t.pool.clearFailure();

  assertEqual(read(database, pageSize, 2 * pageSize), {
    rc: SQLITE_IOERR_SHORT_READ,
    bytes: new Uint8Array(pageSize),
  });
  assertEqual(t.pool.getFailure(), null);
  assertEqual(read(database, pageSize, pageSize), {
    rc: SQLITE_CORRUPT,
    bytes: new Uint8Array(pageSize),
  });
  assertEqual(t.pool.getFailure(), {
    method: "xRead",
    path: "/evolu1.db",
    error: { type: "SqlitePageAuthenticationError", pageNumber: 2 },
  });
  assertEqual(t.callIo(journal, "xClose"), SQLITE_OK);
  assertEqual(t.callIo(database, "xClose"), SQLITE_OK);
});

test("an encrypted database whose file lost its last byte fails to read the blob whose end the last page holds with SQLITE_CORRUPT, recording a SqlitePageAuthenticationError for that page, and its integrity check reports the page, instead of zeros passing as the blob's end", async () => {
  const t = await setupSahPool();
  const created = openEncrypted(t);
  assertEqual(
    t.exec(
      "CREATE TABLE b(v); INSERT INTO b VALUES (randomblob(50000))",
      created,
    ),
    SQLITE_OK,
  );
  close(t, created);
  const slotPath = t.findSlotPath("/evolu1.db");
  const stored = t.fake.readFile(slotPath);
  assertTrue(stored != null);
  const lastPage = (stored.length - sahPoolHeaderSize) / pageSize;
  t.fake.writeFile(slotPath, stored.slice(0, stored.length - 1));
  const db = openEncrypted(t);
  t.pool.clearFailure();

  assertEqual(t.exec("SELECT hex(v) FROM b", db), SQLITE_CORRUPT);

  assertEqual(t.pool.getFailure(), {
    method: "xRead",
    path: "/evolu1.db",
    error: { type: "SqlitePageAuthenticationError", pageNumber: lastPage },
  });
  assertFalse(t.selectText("PRAGMA integrity_check", db) === "ok");
  close(t, db);
});

// SQLite rolls a hot journal back before it reads the database's page 1.
test("a hot journal's record page read before its database's page 1, whose salt its HMAC key needs, decrypts with the salt that opening the journal read from the database's first 16 bytes when no page 1 authenticates, also when page 1 stores no page size and the journal's first header no sizes, and with the database empty returns SQLITE_CORRUPT with the page zero-filled, recording a SqlitePageAuthenticationError", async () => {
  const page = createPage(7);
  // The reserved bytes hold the IV and the HMAC, as stored.
  const end = pageSize - reservedSize;
  // SQLite's magic, 1 record, the original size of 2 pages, and the sector
  // and page sizes, so SQLite would roll the journal back.
  const header = new Uint8Array(4096);
  header.set([0xd9, 0xd5, 0x05, 0xf9, 0x20, 0xa1, 0x63, 0xd7]);
  for (const [at, value] of [
    [8, 1],
    [16, 2],
    [20, 4096],
    [24, pageSize],
  ])
    new DataView(header.buffer).setUint32(at, value);
  const headerWithoutSizes = header.slice();
  headerWithoutSizes.fill(0, 20, 28);
  // Page 1's byte that a case flips, so page 1 keeps its salt but fails to
  // authenticate, or null for an empty database.
  for (const [flippedByte, journalHeader] of [
    [100, header],
    // The page size.
    [16, headerWithoutSizes],
    [null, header],
  ] as const) {
    const t = await setupSahPool();
    const created = openPagerFiles(t);
    if (flippedByte != null)
      created.write(created.database, createPage(3, true), 0);
    created.write(created.journal, journalHeader, 0);
    created.write(created.journal, uint32Be(2), 4096);
    created.write(created.journal, page, 4100);
    assertEqual(t.callIo(created.journal, "xClose"), SQLITE_OK);
    assertEqual(t.callIo(created.database, "xClose"), SQLITE_OK);
    if (flippedByte != null) flipByte(t, flippedByte);
    const { database, journal, read } = openPagerFiles(t);
    t.pool.clearFailure();

    assertEqual(read(journal, 4, 4096), {
      rc: SQLITE_OK,
      bytes: uint32Be(2),
    });
    const record = read(journal, pageSize, 4100);

    if (flippedByte == null) {
      assertEqual(record, {
        rc: SQLITE_CORRUPT,
        bytes: new Uint8Array(pageSize),
      });
      assertEqual(t.pool.getFailure(), {
        method: "xRead",
        path: "/evolu1.db-journal",
        error: { type: "SqlitePageAuthenticationError", pageNumber: 2 },
      });
    } else {
      assertEqual(record.rc, SQLITE_OK);
      assertEqualBytes(record.bytes.subarray(0, end), page.subarray(0, end));
      assertEqual(t.pool.getFailure(), null);
    }
    assertEqual(t.callIo(journal, "xClose"), SQLITE_OK);
    assertEqual(t.callIo(database, "xClose"), SQLITE_OK);
  }
});

test("a write whose encryption throws, as when random bytes cannot be created, fails with SQLITE_IOERR_WRITE, recording what was thrown, and stores nothing", async () => {
  const deps = testCreateDeps();
  const randomBytesError = new Error("No entropy");
  let failRandomBytes = false;
  const randomBytes: RandomBytes = {
    create: ((bytesLength: number) => {
      if (failRandomBytes) throw randomBytesError;
      return deps.randomBytes.create(bytesLength);
    }) as RandomBytes["create"],
  };
  const t = await setupSahPool({ deps: { ...deps, randomBytes } });
  const { database, journal, write, writeRc } = openPagerFiles(t);
  write(database, createPage(3, true), 0);
  const stored = readFile(t);
  t.pool.clearFailure();
  failRandomBytes = true;

  assertEqual(writeRc(database, createPage(5), pageSize), SQLITE_IOERR_WRITE);
  assertEqual(t.pool.getFailure(), {
    method: "xWrite",
    path: "/evolu1.db",
    error: randomBytesError,
  });
  assertEqualBytes(readFile(t), stored);
  failRandomBytes = false;
  write(database, createPage(5), pageSize);
  assertEqual(t.callIo(journal, "xClose"), SQLITE_OK);
  assertEqual(t.callIo(database, "xClose"), SQLITE_OK);
});

test("a key registered for a path encrypts only that path's database and only when it opens as a main database, a registration that is disposed encrypts nothing more, and registering the path again before then throws", async () => {
  const t = await setupSahPool();
  const openPlain = (path: string) => {
    const { rc, db } = t.openDatabase(path);
    assertEqual(rc, SQLITE_OK);
    assertEqual(t.exec("CREATE TABLE t(a)", db), SQLITE_OK);
    close(t, db);
  };
  {
    const path = SqliteVfsPath.orThrow("/evolu1.db");
    using _registration = t.pool.registerKey(path, testKey);
    assertThrows(
      () => t.pool.registerKey(path, otherKey),
      (thrown) => {
        assertInstanceOf(thrown, Error);
        assertEqual(
          thrown.message,
          "A key is already registered for /evolu1.db.",
        );
      },
    );
    using _disposed = t.pool.registerKey(
      SqliteVfsPath.orThrow("/after.db"),
      testKey,
    );
    using _journal = t.pool.registerKey(
      SqliteVfsPath.orThrow("/journal.db"),
      testKey,
    );
    const { db } = t.openDatabase("/evolu1.db");
    reserveBytes(t, db);
    assertEqual(t.exec(createRowsSql, db), SQLITE_OK);
    close(t, db);
    openPlain("/other.db");
    const journal = t.openFile(
      "/journal.db",
      SQLITE_OPEN_CREATE | SQLITE_OPEN_READWRITE | SQLITE_OPEN_MAIN_JOURNAL,
    );
    assertEqual(journal.rc, SQLITE_OK);
    const pPage = getOrThrow(allocWasm(t)(pageSize));
    t.sqliteWasm.getHeapU8().set(createPage(3, true), pPage);
    assertEqual(
      t.callIo(journal.pFile, "xWrite", pPage, pageSize, 0n),
      SQLITE_OK,
    );
    assertEqual(t.callIo(journal.pFile, "xClose"), SQLITE_OK);
  }
  openPlain("/after.db");

  assertEqual(hasPlaintext(readFile(t)), false);
  for (const path of ["/other.db", "/after.db", "/journal.db"])
    assertEqual(
      latin1.decode(readFile(t, path).subarray(0, 15)),
      "SQLite format 3",
    );
  const unkeyed = t.openDatabase("/evolu1.db").db;
  assertEqual(t.exec("SELECT count(*) FROM t", unkeyed), SQLITE_NOTADB);
  close(t, unkeyed);
});

test("the key never reaches SQLite's memory, the caller's key stays as it was, and the copies the pool takes of it are zeroed once the registration is disposed and the database closed", async () => {
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
  const isInHeap = () =>
    Buffer.from(t.sqliteWasm.getHeapU8().buffer).indexOf(testKey) !== -1;

  const db = openEncrypted(t, "/evolu1.db", key);
  assertEqual(t.exec(createRowsSql, db), SQLITE_OK);
  assertEqual(isInHeap(), false);
  close(t, db);

  assertEqual(isInHeap(), false);
  assertEqualBytes(key, testKey);
  assertTrue(copies.length >= 3);
  for (const copy of copies.slice(1))
    assertEqualBytes(copy, new Uint8Array(32));
});

test("the pool zeroes each HMAC key it derives once page 1 stores another salt and once the file closes, and the copy of page 1 it decrypts for a read of part of it", async (context) => {
  // Every key handed to HMAC, the pool's HMAC keys and, through PBKDF2, its
  // copies of the key, and every buffer HMAC reads.
  const keys: Array<Uint8Array> = [];
  const authenticated: Array<Uint8Array> = [];
  const create = hmac.create.bind(hmac);
  context.mock.method(
    hmac,
    "create",
    (...[hash, key]: Parameters<typeof hmac.create>) => {
      keys.push(key);
      const stream = create(hash, key);
      const update = stream.update.bind(stream);
      stream.update = (message) => {
        authenticated.push(message);
        return update(message);
      };
      return stream;
    },
  );
  const t = await setupSahPool();
  const isZeros = (bytes: Uint8Array) => bytes.every((byte) => byte === 0);
  const hmacKeys = () =>
    keys.filter((key) => key.length === 32 && !eqUint8Array(key, testKey));

  const first = openEncrypted(t);
  assertEqual(
    t.exec(
      `PRAGMA cache_size = 10; BEGIN; ${createRowsSql}; ROLLBACK; PRAGMA cache_size = -16384`,
      first,
    ),
    SQLITE_OK,
  );
  const [firstHmacKey] = hmacKeys();
  assertTrue(firstHmacKey != null && !isZeros(firstHmacKey));
  const second = openEncrypted(t);
  assertEqual(t.exec(createRowsSql, second), SQLITE_OK);
  // The first connection reads page 1 with the salt the second wrote.
  assertEqual(t.selectText(rowsSql, first), "200:200");
  assertTrue(isZeros(firstHmacKey));
  const third = openEncrypted(t);
  assertEqual(t.selectText(rowsSql, third), "200:200");
  for (const db of [first, second, third]) close(t, db);

  assertTrue(hmacKeys().length >= 3);
  for (const key of keys) assertEqualBytes(key, new Uint8Array(key.length));
  const heap = t.sqliteWasm.getHeapU8().buffer;
  const pages = [
    ...new Set(
      authenticated
        .map(({ buffer }) => buffer)
        .filter((buffer) => buffer !== heap && buffer.byteLength === pageSize),
    ),
  ].map((buffer) => new Uint8Array(buffer));
  assertTrue(pages.some(isZeros));
  for (const page of pages)
    assertEqual(latin1.decode(page).includes("SQLite format 3"), false);
});

test("the pool zeroes the copy of the database's page 1 it decrypts when a hot journal without a page-1 record opens, and the HMAC key of a torn page 1 that fails to authenticate", async (context) => {
  const keys: Array<Uint8Array> = [];
  const authenticated: Array<Uint8Array> = [];
  const create = hmac.create.bind(hmac);
  context.mock.method(
    hmac,
    "create",
    (...[hash, key]: Parameters<typeof hmac.create>) => {
      keys.push(key);
      const stream = create(hash, key);
      const update = stream.update.bind(stream);
      stream.update = (message) => {
        authenticated.push(message);
        return update(message);
      };
      return stream;
    },
  );
  const t = await setupSahPool();
  const db = openEncrypted(t);
  // The UPDATE spills before its commit, so the journal has no page-1 record.
  assertEqual(t.exec(`${createRowsSql}; ${spillSql}`, db), SQLITE_OK);
  const next = await setupAfterCrash(t);
  // The dead worker's instance never zeroed anything.
  const firstKey = keys.length;
  const firstPage = authenticated.length;

  const reopened = openEncrypted(next);
  assertEqual(next.selectText(rowsSql, reopened), "200:200");
  close(next, reopened);
  zeroBytes(next, 0, 16);
  const torn = openEncrypted(next);
  assertEqual(next.exec(rowsSql, torn), SQLITE_NOTADB);
  close(next, torn);

  const isZeros = (bytes: Uint8Array) => bytes.every((byte) => byte === 0);
  const newKeys = keys.slice(firstKey);
  assertTrue(newKeys.length >= 2);
  for (const key of newKeys) assertTrue(isZeros(key));
  const heap = next.sqliteWasm.getHeapU8().buffer;
  const pages = [
    ...new Set(
      authenticated
        .slice(firstPage)
        .map(({ buffer }) => buffer)
        .filter((buffer) => buffer !== heap && buffer.byteLength === pageSize),
    ),
  ].map((buffer) => new Uint8Array(buffer));
  assertTrue(pages.length > 0);
  for (const page of pages)
    assertEqual(latin1.decode(page).includes("SQLite format 3"), false);
});

test("databases of two paths with different keys, both with a hot journal when their worker died, each roll back with their own key", async () => {
  const t = await setupSahPool();
  const a = openEncrypted(t, "/a.db", testKey);
  const b = openEncrypted(t, "/b.db", otherKey);
  for (const db of [a, b])
    assertEqual(t.exec(`${createRowsSql}; ${spillSql}`, db), SQLITE_OK);

  const next = await setupAfterCrash(t);

  assertEqual(next.pool.getPaths().length, 4);
  for (const [path, key] of [
    ["/b.db", otherKey],
    ["/a.db", testKey],
  ] as const) {
    const reopened = openEncrypted(next, path, key);
    assertEqual(next.selectText(rowsSql, reopened), "200:200");
    assertEqual(next.selectText("PRAGMA integrity_check", reopened), "ok");
    close(next, reopened);
  }
  assertEqual(next.pool.getPaths(), ["/a.db", "/b.db"]);
});

test("two connections of a database share its rows, a third with another key fails with SQLITE_NOTADB, and a connection whose rolled-back transaction left no database reads the one another connection then created with another salt", async () => {
  const t = await setupSahPool();
  const first = openEncrypted(t);
  assertEqual(
    t.exec(
      `PRAGMA cache_size = 10; BEGIN; ${createRowsSql}; ROLLBACK; PRAGMA cache_size = -16384`,
      first,
    ),
    SQLITE_OK,
  );
  assertEqual(readFile(t).length, 0);
  const second = openEncrypted(t);
  assertEqual(t.exec(createRowsSql, second), SQLITE_OK);

  assertEqual(t.selectText(rowsSql, first), "200:200");
  assertEqual(t.exec(insertRowsSql(201, 300), first), SQLITE_OK);
  assertEqual(t.selectText(rowsSql, second), "300:300");
  const third = openEncrypted(t, "/evolu1.db", otherKey);
  assertEqual(t.exec("SELECT count(*) FROM t", third), SQLITE_NOTADB);
  for (const db of [first, second, third]) close(t, db);
});

// A connection learns the salt from page 1, which SQLite reads after it rolls a
// hot journal back, so one that opened the path while it was empty has no
// salt, and one whose rolled-back transaction left it empty has the salt of a
// database that no longer exists.
test("a connection that opened an encrypted path while it was empty, also one whose rolled-back transaction left it empty, rolls back the hot journal that another connection with the key left in the database it then created, and while reading the database's first 16 bytes throws, fails with SQLITE_CANTOPEN, recording what was thrown, and keeps the journal", async () => {
  for (const before of [
    "SELECT 1 FROM sqlite_schema",
    `PRAGMA cache_size = 10; BEGIN; ${createRowsSql}; ROLLBACK; PRAGMA cache_size = -16384`,
  ]) {
    const t = await setupSahPool();
    const reader = openEncrypted(t);
    assertEqual(t.exec(before, reader), SQLITE_OK);
    assertEqual(readFile(t).length, 0);
    const writer = openEncrypted(t);
    assertEqual(t.exec(`${createRowsSql}; ${spillSql}`, writer), SQLITE_OK);
    // The writer's rollback cannot write the database, so its journal stays.
    const databaseSlot = t.findSlotPath("/evolu1.db");
    const error = new DOMException("Failed.", "InvalidStateError");
    t.fake.inject((call) =>
      call.path === databaseSlot &&
      (call.method === "write" || call.method === "truncate")
        ? { type: "Throw", error }
        : null,
    );
    close(t, writer);
    assertEqual(t.pool.getPaths(), ["/evolu1.db", "/evolu1.db-journal"]);
    // Reading the database's first 16 bytes fails, and so does the open.
    t.fake.inject((call) =>
      call.method === "read" &&
      call.path === databaseSlot &&
      call.at === sahPoolHeaderSize &&
      call.length === 16
        ? { type: "Throw", error }
        : null,
    );
    t.pool.clearFailure();
    assertEqual(
      t.exec("SELECT count(*) FROM sqlite_schema", reader),
      SQLITE_CANTOPEN,
    );
    assertEqual(t.pool.getFailure(), {
      method: "xOpen",
      path: "/evolu1.db-journal",
      error,
    });
    t.fake.inject(null);
    assertEqual(t.pool.getPaths(), ["/evolu1.db", "/evolu1.db-journal"]);
    t.pool.clearFailure();

    // Its schema is that of the empty file until a statement reads.
    assertEqual(
      t.selectText("SELECT count(*) FROM sqlite_schema", reader),
      "1",
    );
    assertEqual(t.selectText(rowsSql, reader), "200:200");
    assertEqual(t.selectText("PRAGMA integrity_check", reader), "ok");
    assertEqual(t.pool.getFailure(), null);
    assertEqual(t.pool.getPaths(), ["/evolu1.db"]);
    close(t, reader);
  }
});

// A connection that opens an empty file keeps SQLite's default page size, so
// it reads page 1 whole at 8192 bytes, learns the size page 1 stores, and reads
// it again at that size.
test("a connection that opened an encrypted path while it was empty reads the database another connection then created with another page size, smaller or larger, recording nothing, while one with another key fails with SQLITE_NOTADB, recording a SqlitePageAuthenticationError for page 1", async () => {
  for (const size of [1024, 4096, 16384, 65536]) {
    const t = await setupSahPool();
    const reader = openEncrypted(t);
    const wrongKey = openEncrypted(t, "/evolu1.db", otherKey);
    const creator = openEncrypted(t);
    assertEqual(
      t.exec(`PRAGMA page_size = ${size}; ${createRowsSql}`, creator),
      SQLITE_OK,
    );
    t.pool.clearFailure();

    assertEqual(t.selectText(rowsSql, reader), "200:200");
    assertEqual(t.selectText("PRAGMA page_size", reader), `${size}`);
    assertEqual(t.pool.getFailure(), null);
    assertEqual(t.exec(rowsSql, wrongKey), SQLITE_NOTADB);
    assertEqual(t.pool.getFailure(), {
      method: "xRead",
      path: "/evolu1.db",
      error: { type: "SqlitePageAuthenticationError", pageNumber: 1 },
    });
    for (const db of [reader, wrongKey, creator]) close(t, db);
  }
});

test("an app's @awasm/noble backend installed in the stubs before a pool opens stays, and the noble backend, which wraps @noble/ciphers and @noble/hashes, writes what 2.2.4 and node:crypto read", async () => {
  cbc.install(nobleCbc);
  sha512.install(nobleSha512);
  try {
    const t = await setupSahPool();
    assertEqual([cbc.getPlatform(), sha512.getPlatform()], ["noble", "noble"]);

    const db = openEncrypted(t);
    assertEqual(t.exec(createRowsSql, db), SQLITE_OK);
    const plaintext = serialize(t, db);
    close(t, db);

    const pages = decryptWithNodeCrypto(readFile(t), testKey);
    for (const [index, page] of pages.entries()) {
      assertTrue(typeof page !== "number");
      const offset = index * pageSize;
      assertEqualBytes(
        page.subarray(0, pageSize - reservedSize),
        plaintext.subarray(offset, offset + pageSize - reservedSize),
      );
    }
    const reference = await openWithSqliteJs(t);
    assertEqual(reference.selectValue(rowsSql), "200:200");
    reference.close();
  } finally {
    cbc.install(wasmCbc);
    sha512.install(wasmSha512);
  }
});
