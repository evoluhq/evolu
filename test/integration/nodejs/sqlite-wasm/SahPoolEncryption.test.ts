/**
 * Evolu's codec over `SahPool`, on the pinned binary over a fake OPFS, through
 * the C API: connections `evolu_codec_open` opens on the pool's name, as
 * EncryptedFile databases do with their key and File databases without one.
 *
 * `@evolu/sqlite-core` tests the codec's format and rules natively. These run
 * them in the wasm build, over the pool: the format against `node:crypto`, also
 * at other page sizes; the hot journals a dead worker leaves, whose first bytes
 * a crash can tear; the keyless journal check, whose read of the pool can
 * throw; a full storage during an encrypted journal write; a random source that
 * throws; and the file control SQLite sends when a write transaction starts.
 * `@evolu/sqlite-wasm` 2.2.4, whose SQLite3 Multiple Ciphers encrypted the
 * databases of `@evolu/web` 3, is the reference: keyed with the `sqlcipher`
 * scheme and the raw key, it opens what the codec writes, and the codec opens
 * what it writes.
 */

import {
  assert,
  assertEqual,
  assertEqualBytes,
  assertErr,
  assertFalse,
  assertOk,
  assertTrue,
  bytesToHex,
  EncryptionKey,
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
  SQLITE_FCNTL_PRAGMA,
  SQLITE_FCNTL_RESERVE_BYTES,
  SQLITE_FULL,
  SQLITE_IOERR_WRITE,
  SQLITE_NOTADB,
  SQLITE_OK,
  SQLITE_OPEN_CREATE,
  SQLITE_OPEN_MAIN_DB,
  SQLITE_OPEN_MAIN_JOURNAL,
  SQLITE_OPEN_READWRITE,
  sqlite3_io_methods_layout,
} from "../../../../packages/sqlite-wasm/src/Constants.ts";
import {
  createSqliteDatabase,
  SqliteVfsPath,
  type SqliteCodecError,
  type SqliteFailure,
} from "../../../../packages/sqlite-wasm/src/Database.ts";
import {
  evolu_codec_open,
  evolu_codec_take_failure,
} from "../../../../packages/sqlite-wasm/src/EvoluCApi.ts";
import { allocWasm } from "../../../../packages/sqlite-wasm/src/Memory.ts";
import type {
  CStringPtr,
  SqliteDbPtr,
  WasmPtr,
} from "../../../../packages/sqlite-wasm/src/Pointer.ts";
import { sahPoolHeaderSize } from "../../../../packages/sqlite-wasm/src/SahPool.ts";
import { installWasmFunctions } from "../../../../packages/sqlite-wasm/src/Wasm.ts";
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
 * Opens a path of the pool with `evolu_codec_open` on the pool's name, as an
 * EncryptedFile database does with its key, staged in wasm memory for the open
 * and then zeroed and freed, and a File database without one, both with
 * plaintext checksums. Returns the result code and the connection, which the
 * caller closes also when the open failed.
 */
const openCodec = (t: TestSahPool, path: string, key: EncryptionKey | null) => {
  const pKey = key == null ? 0 : getOrThrow(allocWasm(t)(32));
  if (key != null) t.sqliteWasm.getHeapU8().set(key, pKey);
  // 2 is EVOLU_CODEC_PLAINTEXT_CHECKSUMS.
  const rc = evolu_codec_open(t)(
    t.cString(path),
    t.scratch.out,
    t.cString(t.pool.vfsName),
    pKey,
    2,
  );
  const db = t.readPtr(t.scratch.out) as SqliteDbPtr;
  if (pKey !== 0) {
    t.sqliteWasm.getHeapU8().fill(0, pKey, pKey + 32);
    sqlite3_free(t)(pKey);
  }
  return { rc, db };
};

/** Opens a path of the pool with a key, as {@link openCodec} does. */
const openEncrypted = (
  t: TestSahPool,
  path = "/evolu1.db",
  key: EncryptionKey = testKey,
): SqliteDbPtr => {
  const { rc, db } = openCodec(t, path, key);
  assertEqual(rc, SQLITE_OK);
  return db;
};

/**
 * Takes the first failure the codec recorded for the main database of a
 * connection since the last take, as a SqliteError's cause carries it, or null
 * for none.
 */
const takeCodecFailure = (
  t: TestSahPool,
  db: SqliteDbPtr,
): SqliteCodecError | null => {
  const pFailure = getOrThrow(allocWasm(t)(8));
  assertEqual(evolu_codec_take_failure(t)(db, pFailure), SQLITE_OK);
  const view = t.sqliteWasm.getHeapDataView();
  const type = view.getInt32(pFailure, true);
  const pageNumber = view.getUint32(pFailure + 4, true);
  sqlite3_free(t)(pFailure);
  // The values of C's evolu_codec_failure_type.
  assert(type >= 0 && type <= 3, "An unknown codec failure type");
  return type === 0
    ? null
    : type === 1
      ? { type: "SqlitePageAuthenticationError", pageNumber }
      : type === 2
        ? { type: "SqliteEncryptionUnsupported" }
        : { type: "SqliteRandomSourceError" };
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
 * Authenticates and decrypts a page with `node:crypto`, as `evolu_page.h` of
 * `@evolu/sqlite-core` describes the format, returning it with SQLite's header
 * string restored on page 1, or null when its HMAC differs.
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

test("an encrypted database stores neither SQLite's header string nor a row anywhere in its file, and 2.2.4 opens it with the sqlcipher scheme and the raw key, reading every row", async () => {
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

test("a database 2.2.4 encrypted with the sqlcipher scheme and the raw key opens with the key, reads every row and takes new rows, which 2.2.4 reads", async () => {
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

test("every page the codec encrypts authenticates and decrypts with node:crypto to the page SQLite has: HMAC-SHA512 keyed by PBKDF2-HMAC-SHA512 of the key and the salt XOR 0x3a with 2 iterations, over the encrypted bytes, the IV and the little-endian page number, and AES-256-CBC from byte 24 of page 1, with CBC-CS3, and from byte 0 of other pages", async () => {
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

test("a database opened with another key fails to open with SQLITE_NOTADB, the codec records a SqlitePageAuthenticationError for page 1, and nothing is written", async () => {
  const t = await setupSahPool();
  const created = openEncrypted(t);
  assertEqual(t.exec(createRowsSql, created), SQLITE_OK);
  close(t, created);
  const start = t.fake.calls.length;

  const { rc, db } = openCodec(t, "/evolu1.db", otherKey);

  assertEqual(
    [rc, sqlite3_extended_errcode(t)(db)],
    [SQLITE_NOTADB, SQLITE_NOTADB],
  );
  assertEqual(takeCodecFailure(t, db), {
    type: "SqlitePageAuthenticationError",
    pageNumber: 1,
  });
  close(t, db);
  assertEqual(modifyingCalls(t.fake.calls.slice(start)), []);
  const again = openEncrypted(t);
  assertEqual(t.selectText(rowsSql, again), "200:200");
  close(t, again);
});

test("a page altered in its encrypted bytes, its IV or its HMAC fails to read with SQLITE_CORRUPT, or SQLITE_NOTADB for page 1, which fails the open, and the codec records a SqlitePageAuthenticationError for it", async () => {
  const t = await setupSahPool();
  const created = openEncrypted(t);
  assertEqual(t.exec(createRowsSql, created), SQLITE_OK);
  close(t, created);
  const ivOffset = pageSize - reservedSize;
  // The page, the offset of the flipped byte, and the codes of the open and of
  // a read of every page.
  const offsets = [
    [5, 4 * pageSize + 100, SQLITE_OK, SQLITE_CORRUPT],
    [5, 4 * pageSize + ivOffset + 3, SQLITE_OK, SQLITE_CORRUPT],
    [5, 4 * pageSize + ivOffset + 16 + 40, SQLITE_OK, SQLITE_CORRUPT],
    [1, 100, SQLITE_NOTADB, SQLITE_NOTADB],
    [1, ivOffset, SQLITE_NOTADB, SQLITE_NOTADB],
  ] as const;

  for (const [pageNumber, offset, openCode, code] of offsets) {
    flipByte(t, offset);
    const { rc, db } = openCodec(t, "/evolu1.db", testKey);

    assertEqual(rc, openCode);
    assertEqual(t.exec("SELECT count(*) FROM t", db), code);
    assertEqual(sqlite3_extended_errcode(t)(db), code);
    assertEqual(takeCodecFailure(t, db), {
      type: "SqlitePageAuthenticationError",
      pageNumber,
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
test("a page 1 whose reserved bytes are not 80, as 81 or 79, fails to read with SQLITE_NOTADB, which fails the open, the codec recording a SqlitePageAuthenticationError for page 1, rather than a blob that overflows pages being read as other bytes, and sqlite3_serialize, which exports, fails too", async () => {
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
    const { rc, db } = openCodec(t, "/evolu1.db", testKey);

    assertEqual(rc, SQLITE_NOTADB);
    assertEqual(
      [t.exec(blobSql, db), sqlite3_extended_errcode(t)(db)],
      [SQLITE_NOTADB, SQLITE_NOTADB],
    );
    assertEqual(takeCodecFailure(t, db), {
      type: "SqlitePageAuthenticationError",
      pageNumber: 1,
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

test("the hot journal of a transaction an encrypted database's dead worker left holds no row, its records' pages authenticate and decrypt with node:crypto as pages of the database to what SQLite's checksums cover, and the codec rolls it back", async () => {
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

test("every page the codec encrypts, in the database and in its journal's records, stores an IV of its own, and a page written again stores a new one", async () => {
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

test("2.2.4 rolls back the hot journal the codec wrote, and the codec rolls back the hot journal 2.2.4 wrote", async () => {
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

  const rolledByCodec = openEncrypted(other);

  assertEqual(other.selectText(rowsSql, rolledByCodec), "200:200");
  assertEqual(other.pool.getPaths(), ["/evolu1.db"]);
  assertEqual(other.selectText("PRAGMA integrity_check", rolledByCodec), "ok");
  close(other, rolledByCodec);
});

test("databases of 1024-, 4096- and 65536-byte pages, the last stored in page 1 as 1, authenticate and decrypt with node:crypto to the pages SQLite has, open again with the key, and 2.2.4 reads every row", async () => {
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
    const reopened = openEncrypted(t);
    assertEqual(t.selectText(rowsSql, reopened), "200:200");
    assertEqual(t.selectText("PRAGMA page_size", reopened), `${size}`);
    close(t, reopened);
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
      assertEqual(takeCodecFailure(next, reopened), null);
      assertEqual(next.pool.getPaths(), ["/evolu1.db"]);
      close(next, reopened);
    }
});

test("a hot journal without a page-1 record fails to roll back a database whose page 1's salt is zeros with SQLITE_CORRUPT, which fails the open, the codec recording a SqlitePageAuthenticationError for the first record, and keeps the journal", async () => {
  const t = await setupSahPool();
  const db = openEncrypted(t);
  assertEqual(t.exec(`${createRowsSql}; ${spillSql}`, db), SQLITE_OK);
  const next = await setupAfterCrash(t);
  const records = readJournalRecords(readFile(next, "/evolu1.db-journal"));
  assertTrue(records.length > 1);
  assertFalse(records.some(({ pageNumber }) => pageNumber === 1));
  zeroBytes(next, 0, 16);

  const reopened = openCodec(next, "/evolu1.db", testKey);

  assertEqual(reopened.rc, SQLITE_CORRUPT);
  assertEqual(takeCodecFailure(next, reopened.db), {
    type: "SqlitePageAuthenticationError",
    pageNumber: records[0].pageNumber,
  });
  close(next, reopened.db);
  assertEqual(next.pool.getPaths(), ["/evolu1.db", "/evolu1.db-journal"]);
});

// With synchronous = OFF, SQLite plays a journal back to its end and stops at
// the first record whose checksum differs. A journal that exclusive locking
// mode or journal_mode = PERSIST keeps still holds the previous transaction's
// records, so a worker that dies right after writing a record's page number
// leaves it before a stale page, encrypted as another page.
test("a journal record a dead worker left torn under synchronous = OFF, in a journal that exclusive locking mode or journal_mode = PERSIST kept, ends the rollback for the right key, which reads every row with no journal left, as plain SQLite does, while a wrong key fails to open with SQLITE_CORRUPT and keeps the journal", async () => {
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

    const wrongKey = openCodec(next, "/evolu1.db", otherKey);

    assertEqual(wrongKey.rc, SQLITE_CORRUPT);
    assertEqual(takeCodecFailure(next, wrongKey.db), {
      type: "SqlitePageAuthenticationError",
      pageNumber,
    });
    close(next, wrongKey.db);
    assertEqual(next.pool.getPaths(), ["/evolu1.db", "/evolu1.db-journal"]);
    next.pool.clearFailure();
    const reopened = openEncrypted(next);
    assertEqual(next.selectText(rowsSql, reopened), "200:200");
    assertEqual(next.selectText("PRAGMA integrity_check", reopened), "ok");
    assertEqual(next.pool.getFailure(), null);
    assertEqual(takeCodecFailure(next, reopened), null);
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
test("a journal record's page 1 that fails to authenticate, as the stale page after page 1's number in a journal that exclusive locking mode kept, whose write failed with SQLITE_IOERR_WRITE, or with SQLITE_FULL for a QuotaExceededError, which the pool records, changes no salt, so the next commit keeps every page readable", async () => {
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
    t.pool.clearFailure();

    assertFalse(t.exec("CREATE TABLE u(x)", db) === SQLITE_OK);
    assertEqual(sqlite3_extended_errcode(t)(db), code);
    assertEqual(t.pool.getFailure(), {
      type: "SqliteVfsFailure",
      method: "xWrite",
      path: "/evolu1.db-journal",
      error,
    });
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
    SQLITE_IOERR_WRITE,
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
  assertEqual(t.exec(spillSql, writer), SQLITE_IOERR_WRITE);
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
  assertEqual(t.exec(createRowsSql, creator), SQLITE_IOERR_WRITE);
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
  assertEqual(takeCodecFailure(t, reader), null);
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
test("an open without the key of an encrypted database with a leftover journal that is not hot, as PERSIST and TRUNCATE keep it and a crash before its first sync leaves it, fails with SQLITE_NOTADB from SQLite, recording nothing, as without a journal", async () => {
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
    t.pool.clearFailure();

    const keyless = openCodec(t, "/evolu1.db", null);

    assertEqual(keyless.rc, SQLITE_NOTADB);
    assertEqual(t.pool.getFailure(), null);
    assertEqual(takeCodecFailure(t, keyless.db), null);
    close(t, keyless.db);
  }
});

// Without the key, the journal's pages reach SQLite as stored, the first
// record's checksum differs, and SQLite would take that as the end of the
// journal and delete it, leaving the transaction half-applied. A journal SQLite
// cannot open counts as hot, and a rollback that cannot open it fails. Only an
// empty database has no first bytes, so zeros there, as a torn write can leave
// in place of the salt, do not prove the database is not encrypted. A pool
// read that throws during that check fails the codec's check without the codec
// recording anything, so the pool's failure is the cause.
test("a File database opened on an encrypted database whose dead worker left a hot journal fails with SQLITE_CANTOPEN, caused by the codec's SqliteEncryptionUnsupportedError, also when the database's salt is zeros, or by the pool's failure when reading the database's first 16 bytes or the journal's first bytes throws, changes neither file, and the right key then rolls the journal back wholly", async () => {
  const readError = new DOMException("Failed.", "InvalidStateError");
  // Creating a table journals page 1, whose salt the rollback restores, so the
  // key can roll the journal back although the database's salt is zeros.
  const spillPageOneSql =
    "PRAGMA cache_size = 10; BEGIN; CREATE TABLE u(x); UPDATE t SET a = 'changed' || randomblob(500)";
  const unsupported: SqliteFailure = {
    type: "SqliteCodecFailure",
    error: { type: "SqliteEncryptionUnsupported" },
  };
  // The read that throws, by the path and the length of a read at offset 0.
  for (const [fault, cause, zeroSalt] of [
    [null, unsupported, false],
    [null, unsupported, true],
    [
      { path: "/evolu1.db", length: 16 },
      {
        type: "SqliteVfsFailure",
        method: "xRead",
        path: "/evolu1.db",
        error: readError,
      },
      false,
    ],
    [
      { path: "/evolu1.db-journal", length: 20 },
      {
        type: "SqliteVfsFailure",
        method: "xRead",
        path: "/evolu1.db-journal",
        error: readError,
      },
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
    if (fault != null) {
      const slotPath = next.findSlotPath(fault.path);
      next.fake.inject((call) =>
        call.method === "read" &&
        call.path === slotPath &&
        call.at === sahPoolHeaderSize &&
        call.length === fault.length
          ? { type: "Throw", error: readError }
          : null,
      );
    }

    const keyless = createSqliteDatabase(next)({
      type: "File",
      vfs: next.pool,
      path: SqliteVfsPath.orThrow("/evolu1.db"),
    });

    next.fake.inject(null);
    assertErr(keyless);
    assertEqual(
      [keyless.error.extendedCode, keyless.error.cause],
      [SQLITE_CANTOPEN, cause],
    );
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

// A page 1 that reserves other than 80 bytes would fail every later read. The
// open asks for 80, and SQLite lowers no new database's reserved bytes below
// what was asked for, so only more can reach the codec.
test("a new encrypted database whose page 1 reserves more than 80 bytes, 81, fails to write it with SQLITE_IOERR_WRITE, the codec recording a SqliteEncryptionUnsupportedError", async () => {
  const t = await setupSahPool();
  const db = openEncrypted(t);
  const pReserve = getOrThrow(allocWasm(t)(4));
  t.sqliteWasm.getHeapDataView().setInt32(pReserve, 81, true);
  assertEqual(
    sqlite3_file_control(t)(
      db,
      t.cString("main"),
      SQLITE_FCNTL_RESERVE_BYTES,
      pReserve,
    ),
    SQLITE_OK,
  );
  sqlite3_free(t)(pReserve);

  assertEqual(t.exec("CREATE TABLE t(a)", db), SQLITE_IOERR_WRITE);

  assertEqual(takeCodecFailure(t, db), {
    type: "SqliteEncryptionUnsupported",
  });
  close(t, db);
});

// Plain SQLite's VACUUM writes page 1 with the new page size in its header but
// in pages of the old size, which every later read of page 1 would fail to
// authenticate. SQLite3 Multiple Ciphers patches VACUUM to keep the old size.
test("a VACUUM that would change an encrypted database's page size, also one run after the pragma, fails with SQLITE_IOERR_WRITE, the codec recording a SqliteEncryptionUnsupportedError, and leaves the database as it was, while a VACUUM that keeps the page size works", async () => {
  for (const [before, sql, rc] of [
    ["", "PRAGMA page_size = 4096; VACUUM", SQLITE_IOERR_WRITE],
    ["", "PRAGMA page_size = 16384; VACUUM", SQLITE_IOERR_WRITE],
    ["", "PRAGMA page_size = 65536; VACUUM", SQLITE_IOERR_WRITE],
    // The pragma alone leaves an existing database's page size, but the
    // connection keeps it for its next VACUUM.
    ["PRAGMA page_size = 4096", "VACUUM", SQLITE_IOERR_WRITE],
    ["", "PRAGMA page_size = 8192; VACUUM", SQLITE_OK],
    ["", "VACUUM", SQLITE_OK],
    ["", "PRAGMA auto_vacuum = FULL; VACUUM", SQLITE_OK],
  ] as const) {
    const t = await setupSahPool();
    const db = openEncrypted(t);
    assertEqual(t.exec(`${createRowsSql}; ${before}`, db), SQLITE_OK);
    assertEqual(takeCodecFailure(t, db), null);

    assertEqual(t.exec(sql, db), rc);

    assertEqual(
      takeCodecFailure(t, db),
      rc === SQLITE_OK ? null : { type: "SqliteEncryptionUnsupported" },
    );
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

test("an encrypted database whose file lost its last byte fails to read the blob whose end the last page holds with SQLITE_CORRUPT, the codec recording a SqlitePageAuthenticationError for that page, and its integrity check reports the page, instead of zeros passing as the blob's end", async () => {
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

  assertEqual(t.exec("SELECT hex(v) FROM b", db), SQLITE_CORRUPT);

  assertEqual(takeCodecFailure(t, db), {
    type: "SqlitePageAuthenticationError",
    pageNumber: lastPage,
  });
  assertFalse(t.selectText("PRAGMA integrity_check", db) === "ok");
  close(t, db);
});

test("a write whose encryption throws, as when random bytes cannot be created, fails with SQLITE_IOERR_WRITE, caused by the codec's SqliteRandomSourceError, reports what was thrown as one defect, and stores nothing", async () => {
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
  using database = getOrThrow(
    createSqliteDatabase(t)({
      type: "EncryptedFile",
      vfs: t.pool,
      path: SqliteVfsPath.orThrow("/evolu1.db"),
      key: testKey,
    }),
  );
  assertOk(database.exec(createRowsSql));
  const stored = readFile(t);
  failRandomBytes = true;

  const inserted = database.exec(insertRowsSql(201, 201));

  failRandomBytes = false;
  assertErr(inserted);
  assert(inserted.error.type === "SqliteError", inserted.error.type);
  assertEqual(
    [inserted.error.extendedCode, inserted.error.cause],
    [
      SQLITE_IOERR_WRITE,
      {
        type: "SqliteCodecFailure",
        error: { type: "SqliteRandomSourceError" },
      },
    ],
  );
  assertEqual(t.reportDefect.getDefects(), [randomBytesError]);
  assertEqualBytes(readFile(t), stored);
  assertEqual(t.pool.getPaths(), ["/evolu1.db"]);
  assertOk(database.exec(insertRowsSql(201, 201)));
});

// sqlite3-wasm.c defines SQLITE_EXPERIMENTAL_PRAGMA_20251114, so SQLite sends
// the pragma as a file control when a write transaction starts from none, with
// 1, or 2 for an exclusive one, and ignores what the VFS returns.
test("a write transaction that starts from none sends SQLite's experimental_pragma_20251114 file control, which the codec forwards to the pool, recording no failure, with the key and without", async () => {
  for (const key of [testKey, null]) {
    const t = await setupSahPool();
    const pragmas: Array<ReadonlyArray<string | null>> = [];
    // The I/O methods every file of the pool's raw VFS shares.
    const { pFile } = t.openFile(
      "/evolu1.db",
      SQLITE_OPEN_CREATE | SQLITE_OPEN_READWRITE | SQLITE_OPEN_MAIN_DB,
    );
    const ioMethods = t.readPtr(pFile);
    assertEqual(t.callIo(pFile, "xClose"), SQLITE_OK);
    const { offset, signature } =
      sqlite3_io_methods_layout.members.xFileControl;
    const slot = (ioMethods + offset) as WasmPtr;
    const xFileControl = t.sqliteWasm.functionTable.get(t.readPtr(slot)) as (
      file: number,
      op: number,
      arg: number,
    ) => number;
    const {
      pointers: [recording],
    } = installWasmFunctions(t)([
      {
        signature,
        fn: (file: number, op: number, arg: number) => {
          // The slot for the result, the pragma's name, and its value.
          if (op === SQLITE_FCNTL_PRAGMA)
            pragmas.push([
              t.text(t.readPtr((arg + 4) as WasmPtr) as CStringPtr),
              t.text(t.readPtr((arg + 8) as WasmPtr) as CStringPtr),
            ]);
          return xFileControl(file, op, arg);
        },
      },
    ]);
    t.sqliteWasm.getHeapDataView().setUint32(slot, recording, true);
    const { rc, db } = openCodec(t, "/evolu1.db", key);
    assertEqual(rc, SQLITE_OK);
    pragmas.length = 0;

    assertEqual(
      t.exec(
        "CREATE TABLE t(a); BEGIN EXCLUSIVE; INSERT INTO t VALUES (1); COMMIT",
        db,
      ),
      SQLITE_OK,
    );

    assertEqual(pragmas, [
      ["experimental_pragma_20251114", "1"],
      ["experimental_pragma_20251114", "2"],
    ]);
    assertEqual(takeCodecFailure(t, db), null);
    assertEqual(t.selectText("SELECT count(*) FROM t", db), "1");
    close(t, db);
  }
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

test("two connections of a database share its rows, a third with another key fails to open with SQLITE_NOTADB, and a connection whose rolled-back transaction left no database reads the one another connection then created with another salt", async () => {
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
  const third = openCodec(t, "/evolu1.db", otherKey);
  assertEqual(third.rc, SQLITE_NOTADB);
  for (const db of [first, second, third.db]) close(t, db);
});

// A connection learns the salt from page 1, which SQLite reads after it rolls a
// hot journal back, so one that opened the path while it was empty has no
// salt, and one whose rolled-back transaction left it empty has the salt of a
// database that no longer exists.
test("a connection that opened an encrypted path while it was empty, also one whose rolled-back transaction left it empty, rolls back the hot journal that another connection with the key left in the database it then created, and while reading the database's first 16 bytes throws, fails with SQLITE_CANTOPEN, the pool recording what was thrown, and keeps the journal", async () => {
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
      type: "SqliteVfsFailure",
      method: "xRead",
      path: "/evolu1.db",
      error,
    });
    assertEqual(takeCodecFailure(t, reader), null);
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
    assertEqual(takeCodecFailure(t, reader), null);
    assertEqual(t.pool.getPaths(), ["/evolu1.db"]);
    close(t, reader);
  }
});

// A connection that opens an empty file keeps SQLite's default page size, so
// it reads page 1 whole at 8192 bytes, learns the size page 1 stores, and reads
// it again at that size. The open read the empty schema, and SQLite ignores a
// failed read of the schema cookie when a statement names a table that schema
// lacks, which then fails to prepare with "no such table", so the wrong key
// reads sqlite_schema.
test("a connection that opened an encrypted path while it was empty reads the database another connection then created with another page size, smaller or larger, recording nothing, while one with another key fails with SQLITE_NOTADB, the codec recording a SqlitePageAuthenticationError for page 1", async () => {
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
    assertEqual(takeCodecFailure(t, reader), null);
    assertEqual(
      t.exec("SELECT count(*) FROM sqlite_schema", wrongKey),
      SQLITE_NOTADB,
    );
    assertEqual(takeCodecFailure(t, wrongKey), {
      type: "SqlitePageAuthenticationError",
      pageNumber: 1,
    });
    for (const db of [reader, wrongKey, creator]) close(t, db);
  }
});
