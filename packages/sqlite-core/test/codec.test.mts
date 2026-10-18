/**
 * The codec's format against two references that share no code with it:
 * node:crypto, decrypting and encrypting pages as src/evolu_page.h describes
 * them, with CBC-CS3 written from NIST SP 800-38A's addendum, and
 * `@evolu/sqlite-wasm` 2.2.4, which encrypted the databases of `@evolu/web` 3,
 * reading and writing databases and rolling back each other's hot journals.
 * src/evolu_codec.h documents the behavior; test/codec_test.c tests the rest.
 */
import {
  assertEqual,
  assertInstanceOf,
  assertThrows,
  assertTrue,
} from "@evolu/common";
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  pbkdf2Sync,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import {
  CODEC_PLAINTEXT_CHECKSUMS,
  CODEC_SQLCIPHER_FILES,
  type SqliteCoreAddon,
  type SqliteCoreCodecError,
  type SqliteCoreDatabase,
} from "./addon.mts";
import { setupAddon, setupAddonTimeout } from "./setup-addon.mts";
import {
  readSqliteJsFile,
  setupSqliteJs,
  sqliteJsKeySql,
  writeSqliteJsFile,
  type SqliteJs,
} from "./sqlite-wasm-224.mts";

const key = Uint8Array.from({ length: 32 }, (_, i) => i * 7 + 1);

// 200 rows of a secret, each filling most of a page of 4096 bytes.
const createRowsSql =
  "create table t (id integer primary key, v text);" +
  "with recursive n(i) as (select 1 union all select i + 1 from n where i < 200)" +
  " insert into t select i, 'evolu-secret-row' || i || printf('%.3000c', 'x') from n";
const originalRowsSql =
  "select count(*) from t where v like 'evolu-secret-row%'";
const updateRowsSql = "update t set v = 'updated' || id";

describe("codec format", () => {
  let addon: SqliteCoreAddon;
  let sqliteJs: SqliteJs;
  let directory: string;

  before(
    async () => {
      addon = await setupAddon();
      sqliteJs = await setupSqliteJs();
      directory = mkdtempSync(join(tmpdir(), "evolu-sqlite-core-codec-"));
    },
    { timeout: setupAddonTimeout },
  );

  after(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  const selectInt = (db: SqliteCoreDatabase, sql: string): unknown => {
    const statement = addon.prepare(db, sql);
    try {
      assertTrue(addon.step(statement));
      return addon.column(statement, 0);
    } finally {
      addon.finalize(statement);
    }
  };

  it("writes pages that node:crypto authenticates and decrypts into a database plain SQLite reads", () => {
    const path = join(directory, "oracle.db");
    const db = addon.openCodec(path, key);
    addon.exec(db, createRowsSql);
    addon.close(db);

    const plaintext = decryptDatabase(readFileSync(path), key);
    const plainPath = join(directory, "oracle-plain.db");
    writeFileSync(plainPath, plaintext);
    const plain = addon.open(plainPath);
    assertEqual(selectInt(plain, originalRowsSql), 200);
    assertEqual(selectInt(plain, "pragma integrity_check"), "ok");
    addon.close(plain);
  });

  it("reads a database node:crypto encrypted", () => {
    const path = join(directory, "node-crypto.db");
    const db = addon.openCodec(path, key);
    addon.exec(db, createRowsSql);
    addon.close(db);
    // Encrypted again with another salt and new IVs.
    const encrypted = encryptDatabase(
      decryptDatabase(readFileSync(path), key),
      key,
    );
    writeFileSync(path, encrypted);

    const reopened = addon.openCodec(path, key);
    assertEqual(selectInt(reopened, originalRowsSql), 200);
    assertEqual(selectInt(reopened, "pragma integrity_check"), "ok");
    addon.close(reopened);
  });

  it("reads and extends a database 2.2.4 encrypted, which 2.2.4 then reads", () => {
    const sqliteJsPath = "/interop.db";
    const created = new sqliteJs.oo1.DB(sqliteJsPath, "c");
    created.exec(sqliteJsKeySql(key) + createRowsSql);
    created.close();
    const path = join(directory, "interop.db");
    writeFileSync(path, readSqliteJsFile(sqliteJs, sqliteJsPath));

    const db = addon.openCodec(path, key, CODEC_PLAINTEXT_CHECKSUMS);
    assertEqual(selectInt(db, originalRowsSql), 200);
    addon.exec(
      db,
      "insert into t select id + 200, 'evolu-secret-row' || id from t",
    );
    addon.close(db);

    writeSqliteJsFile(sqliteJs, sqliteJsPath, readFileSync(path));
    const reopened = new sqliteJs.oo1.DB(sqliteJsPath, "w");
    reopened.exec(sqliteJsKeySql(key));
    assertEqual(reopened.selectValue(originalRowsSql), 400);
    assertEqual(reopened.selectValue("pragma integrity_check"), "ok");
    reopened.close();
  });

  it("writes a hot journal 2.2.4 rolls back, with the web's checksums", () => {
    const path = join(directory, "journal-to-2.2.4.db");
    const db = addon.openCodec(path, key, CODEC_PLAINTEXT_CHECKSUMS);
    addon.exec(db, createRowsSql);
    // A small cache spills updated pages into the database before the commit,
    // and the user version journals page 1.
    addon.exec(
      db,
      `pragma cache_size = 10; begin; pragma user_version = 7; ${updateRowsSql}`,
    );
    const sqliteJsPath = "/journal-from-core.db";
    writeSqliteJsFile(
      sqliteJs,
      sqliteJsPath,
      withAlteredPage1(readFileSync(path)),
    );
    writeSqliteJsFile(
      sqliteJs,
      `${sqliteJsPath}-journal`,
      readFileSync(`${path}-journal`),
    );
    addon.close(db);

    const crashed = new sqliteJs.oo1.DB(sqliteJsPath, "w");
    crashed.exec(sqliteJsKeySql(key));
    assertEqual(crashed.selectValue(originalRowsSql), 200);
    assertEqual(crashed.selectValue("pragma user_version"), 0);
    assertEqual(crashed.selectValue("pragma integrity_check"), "ok");
    crashed.close();
  });

  it("opens with a 32-byte Uint8Array key or null only", () => {
    const path = join(directory, "key-types.db");
    const { openCodec } = addon;
    for (const wrongType of [undefined, "key", [...key], new Uint16Array(16)])
      assertThrows(
        () => openCodec(path, wrongType as never),
        (error) => {
          assertInstanceOf(error, TypeError);
          assertEqual(error.message, "expected a Uint8Array key or null");
        },
      );
    for (const length of [0, 31, 33])
      assertThrows(
        () => openCodec(path, new Uint8Array(length)),
        (error) => {
          assertInstanceOf(error, RangeError);
          assertEqual(error.message, "expected a key of 32 bytes");
        },
      );
    assertTrue(!existsSync(path));
  });

  it("throws a failed open's error with the codec's failure and returns later failures", () => {
    const path = join(directory, "failures.db");
    const db = addon.openCodec(path, key);
    assertEqual(addon.takeCodecFailure(db), null);
    addon.exec(db, createRowsSql);
    addon.close(db);

    assertThrows(
      () => addon.openCodec(path, new Uint8Array(32)),
      (error) => {
        assertEqual(
          { ...(error as SqliteCoreCodecError) },
          {
            resultCode: 26,
            extendedCode: 26,
            codecFailure: { type: "PageAuthentication", pageNumber: 1 },
          },
        );
      },
    );

    const reopened = addon.openCodec(path, key);
    assertThrows(
      () => addon.exec(reopened, "pragma secure_delete = off"),
      (error) => {
        assertEqual((error as { resultCode: number }).resultCode, 1);
      },
    );
    assertEqual(addon.takeCodecFailure(reopened), {
      type: "EncryptionUnsupported",
      pageNumber: 0,
    });
    assertEqual(addon.takeCodecFailure(reopened), null);
    addon.close(reopened);

    // A key without a database file to take it.
    assertThrows(
      () => addon.openCodec(":memory:", key),
      (error) => {
        assertInstanceOf(error, Error);
        assertEqual(error.message, "bad parameter or other API misuse");
        assertEqual(
          { ...(error as SqliteCoreCodecError) },
          { resultCode: 21, extendedCode: 21 },
        );
      },
    );

    // Flags that misuse the codec, which then opens no connection.
    assertThrows(
      () =>
        addon.openCodec(
          join(directory, "misused.db"),
          key,
          CODEC_SQLCIPHER_FILES | CODEC_PLAINTEXT_CHECKSUMS,
        ),
      (error) => {
        assertInstanceOf(error, Error);
        assertEqual(error.message, "bad parameter or other API misuse");
        assertEqual(
          { ...(error as SqliteCoreCodecError) },
          { resultCode: 21, extendedCode: 21 },
        );
      },
    );
    assertTrue(!existsSync(join(directory, "misused.db")));

    // A database the codec doesn't hold has no failures.
    const plain = addon.open(join(directory, "failures-plain.db"));
    assertEqual(addon.takeCodecFailure(plain), null);
    addon.close(plain);
  });

  it("rolls back a hot journal 2.2.4 wrote", () => {
    const sqliteJsPath = "/journal-from-2.2.4.db";
    const crashing = new sqliteJs.oo1.DB(sqliteJsPath, "c");
    crashing.exec(sqliteJsKeySql(key) + createRowsSql);
    crashing.exec(
      `pragma cache_size = 10; begin; pragma user_version = 7; ${updateRowsSql}`,
    );
    const path = join(directory, "journal-from-2.2.4.db");
    writeFileSync(
      path,
      withAlteredPage1(readSqliteJsFile(sqliteJs, sqliteJsPath)),
    );
    writeFileSync(
      `${path}-journal`,
      readSqliteJsFile(sqliteJs, `${sqliteJsPath}-journal`),
    );
    crashing.close();

    const db = addon.openCodec(path, key, CODEC_PLAINTEXT_CHECKSUMS);
    assertTrue(!existsSync(`${path}-journal`));
    assertEqual(selectInt(db, originalRowsSql), 200);
    assertEqual(selectInt(db, "pragma user_version"), 0);
    assertEqual(selectInt(db, "pragma integrity_check"), "ok");
    addon.close(db);
  });

  it("stores journal checksums over the stored pages, and with the web's flag over the plaintext", () => {
    for (const flags of [0, CODEC_PLAINTEXT_CHECKSUMS]) {
      const path = join(directory, `checksums-${flags}.db`);
      const db = addon.openCodec(path, key, flags);
      addon.exec(db, createRowsSql);
      addon.exec(db, `pragma cache_size = 10; begin; ${updateRowsSql}`);
      const salt = readFileSync(path).subarray(0, 16);
      const journal = readFileSync(`${path}-journal`);
      addon.close(db);

      // The first header: its record count, which the spill synced, checksum
      // initializer, sector and page sizes.
      const view = new DataView(journal.buffer, journal.byteOffset);
      const recordCount = view.getUint32(8);
      const checksumInit = view.getUint32(12);
      const sectorSize = view.getUint32(20);
      const pageSize = view.getUint32(24);
      assertTrue(recordCount > 1);
      let isAnySumDifferent = false;
      for (let i = 0; i < recordCount; i++) {
        // A record: its page number, page and checksum.
        const at = sectorSize + i * (4 + pageSize + 4);
        const stored = journal.subarray(at + 4, at + 4 + pageSize);
        const checksum = view.getUint32(at + 4 + pageSize);
        const plaintext = decryptPage(stored, view.getUint32(at), key, salt);
        assertEqual(
          (checksum - checksumInit) >>> 0,
          sampledSum(flags === 0 ? stored : plaintext),
        );
        if (sampledSum(stored) !== sampledSum(plaintext))
          isAnySumDifferent = true;
      }
      // A page's sums are equal by chance, rarely for one, never for all.
      assertTrue(isAnySumDifferent);
    }
  });
});

const reservedSize = 80;
const hmacSize = 64;
const ivSize = 16;
const blockSize = 16;
const sqliteHeaderString = new TextEncoder().encode("SQLite format 3\0");

/**
 * Returns a copy of a database file with a bit of page 1's ciphertext flipped,
 * so page 1 authenticates only once its journal record restores it.
 */
const withAlteredPage1 = (file: Uint8Array): Uint8Array => {
  const altered = Uint8Array.from(file);
  altered[200] ^= 1;
  return altered;
};

/** The page size page 1 stores unencrypted in bytes 16 and 17, 1 for 65536. */
const storedPageSize = (file: Uint8Array): number => {
  const size = (file[16] << 8) | file[17];
  return size === 1 ? 65536 : size;
};

const hmacKeyOf = (key: Uint8Array, salt: Uint8Array): Buffer =>
  pbkdf2Sync(
    key,
    salt.map((byte) => byte ^ 0x3a),
    2,
    32,
    "sha512",
  );

/** HMAC-SHA512 of a page's encrypted bytes, its IV and its LE page number. */
const pageHmac = (
  hmacKey: Uint8Array,
  page: Uint8Array,
  pageNumber: number,
): Buffer => {
  const pageNumberLe = Buffer.alloc(4);
  pageNumberLe.writeUInt32LE(pageNumber);
  return createHmac("sha512", hmacKey)
    .update(page.subarray(pageNumber === 1 ? 24 : 0, page.length - hmacSize))
    .update(pageNumberLe)
    .digest();
};

const aesBlocks = (
  mode: "encrypt" | "decrypt",
  algorithm: "aes-256-cbc" | "aes-256-ecb",
  key: Uint8Array,
  iv: Uint8Array | null,
  data: Uint8Array,
): Buffer => {
  const cipher =
    mode === "encrypt"
      ? createCipheriv(algorithm, key, iv)
      : createDecipheriv(algorithm, key, iv);
  cipher.setAutoPadding(false);
  return Buffer.concat([cipher.update(data), cipher.final()]);
};

/**
 * Decrypts AES-256-CBC with ciphertext stealing as CBC-CS3 defines it: the last
 * two blocks are swapped, the partial one last. Z = D(Cn) is C(n-1) XOR the
 * zero-padded partial block, so C(n-1) is the stored partial block followed by
 * the rest of Z.
 */
const decryptCbcCs3 = (
  key: Uint8Array,
  iv: Uint8Array,
  data: Uint8Array,
): Uint8Array => {
  const tail = data.length % blockSize;
  if (tail === 0) return aesBlocks("decrypt", "aes-256-cbc", key, iv, data);
  const whole = data.length - tail;
  const z = aesBlocks(
    "decrypt",
    "aes-256-ecb",
    key,
    null,
    data.subarray(whole - blockSize, whole),
  );
  const previous = Buffer.concat([
    data.subarray(whole),
    z.subarray(tail, blockSize),
  ]);
  const blocks = Buffer.concat([data.subarray(0, whole - blockSize), previous]);
  const partial = z.subarray(0, tail).map((byte, i) => byte ^ previous[i]);
  return Buffer.concat([
    aesBlocks("decrypt", "aes-256-cbc", key, iv, blocks),
    partial,
  ]);
};

/**
 * The sum of every 200th byte of a page from its end, which a journal record's
 * checksum adds to its initializer.
 */
const sampledSum = (page: Uint8Array): number => {
  let sum = 0;
  for (let i = page.length - 200; i > 0; i -= 200) sum += page[i];
  return sum >>> 0;
};

/** Authenticates and decrypts a page, asserting its HMAC, into a copy. */
const decryptPage = (
  page: Uint8Array,
  pageNumber: number,
  key: Uint8Array,
  salt: Uint8Array,
): Uint8Array => {
  const end = page.length - reservedSize;
  const start = pageNumber === 1 ? 24 : 0;
  assertTrue(
    timingSafeEqual(
      pageHmac(hmacKeyOf(key, salt), page, pageNumber),
      page.subarray(end + ivSize),
    ),
  );
  const plaintext = Uint8Array.from(page);
  plaintext.set(
    decryptCbcCs3(
      key,
      page.subarray(end, end + ivSize),
      page.subarray(start, end),
    ),
    start,
  );
  return plaintext;
};

/**
 * Authenticates and decrypts every page of an encrypted database file,
 * asserting each HMAC, into the plaintext file SQLite would have, with the
 * reserved bytes as stored.
 */
const decryptDatabase = (file: Uint8Array, key: Uint8Array): Uint8Array => {
  const pageSize = storedPageSize(file);
  assertEqual(file[20], reservedSize);
  assertEqual(file.length % pageSize, 0);
  const salt = file.subarray(0, 16);
  const plaintext = new Uint8Array(file.length);
  for (let at = 0; at < file.length; at += pageSize)
    plaintext.set(
      decryptPage(
        file.subarray(at, at + pageSize),
        at / pageSize + 1,
        key,
        salt,
      ),
      at,
    );
  plaintext.set(sqliteHeaderString, 0);
  return plaintext;
};

/** Encrypts a plaintext database file with a new salt and new IVs. */
const encryptDatabase = (file: Uint8Array, key: Uint8Array): Uint8Array => {
  const pageSize = storedPageSize(file);
  const salt = randomBytes(16);
  const hmacKey = hmacKeyOf(key, salt);
  const encrypted = Uint8Array.from(file);
  encrypted.set(salt, 0);
  for (let at = 0; at < file.length; at += pageSize) {
    const pageNumber = at / pageSize + 1;
    const page = encrypted.subarray(at, at + pageSize);
    const end = pageSize - reservedSize;
    const start = pageNumber === 1 ? 24 : 0;
    const iv = randomBytes(ivSize);
    // AES-256-CBC with ciphertext stealing, as decryptCbcCs3 decrypts it: the
    // partial last block of page 1 is padded with zeros, and the last two
    // blocks are swapped, the partial one last.
    const data = file.subarray(at + start, at + end);
    const tail = data.length % blockSize;
    const whole = data.length - tail;
    const blocks = aesBlocks(
      "encrypt",
      "aes-256-cbc",
      key,
      iv,
      data.subarray(0, whole),
    );
    if (tail === 0) page.set(blocks, start);
    else {
      const previous = blocks.subarray(whole - blockSize);
      const padded = Buffer.alloc(blockSize);
      padded.set(data.subarray(whole));
      page.set(
        Buffer.concat([
          blocks.subarray(0, whole - blockSize),
          aesBlocks("encrypt", "aes-256-cbc", key, previous, padded),
          previous.subarray(0, tail),
        ]),
        start,
      );
    }
    page.set(iv, end);
    page.set(pageHmac(hmacKey, page, pageNumber), end + ivSize);
  }
  return encrypted;
};
