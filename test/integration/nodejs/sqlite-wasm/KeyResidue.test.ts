/**
 * What an encrypted database leaves of its keys in the instance's linear
 * memory, on the pinned binary over a fake OPFS.
 *
 * The open stages the key in wasm memory and zeroes it once `evolu_codec_open`
 * returns, and Evolu's codec keeps its own copy until the database is closed,
 * which wipes it. So once a database is closed, and once an open failed, no key
 * may be left anywhere in linear memory: not the raw key, not the key
 * `deriveLegacySqliteKey` derives, and not the HMAC key the codec derives from
 * either with a database's salt, as SQLCipher 4 does. The test scans all of
 * linear memory for each, by 8-byte quarters, so a copy partly overwritten
 * shows too, such as a freed block whose first bytes the allocator's
 * bookkeeping took.
 *
 * The codec also handles keys on the stack: the frame of `aes_ct64`'s key
 * schedule starts with the raw key on little-endian wasm, and the HMAC key
 * passes through the frames that derive it. They are wiped, the schedule's
 * frame by `evolu_wipe_stack`, but the calls that come later overwrite them
 * anyway, so a scan once the open returned would miss a frame left unwiped. So
 * the test also scans the stack at each read an open makes, and all of memory
 * at SQLite's read of the database's header, right after the codec took the
 * key, which must then be only in the staging block and the codec's block.
 *
 * The scans can't see residue that holds no key bytes verbatim, such as the
 * expanded key schedule or SHA-512's message schedule, and the test claims
 * nothing about it.
 *
 * `test/integration/browsers/sqlite-wasm/KeyResidue.test.ts` runs the scenario
 * in Chromium, Firefox and WebKit.
 */

import {
  assertEqual,
  assertErr,
  assertOk,
  bytesToHex,
  EncryptionKey,
  getOrThrow,
  testCreateRun,
  type NonNegativeInt,
} from "@evolu/common";
import { createHmac, pbkdf2Sync } from "node:crypto";
import { test } from "node:test";
import {
  createEncryptedSqliteDatabase,
  createSqliteDatabase,
  SqliteVfsPath,
} from "../../../../packages/sqlite-wasm/src/Database.ts";
import { sahPoolHeaderSize } from "../../../../packages/sqlite-wasm/src/SahPool.ts";
import { setupSahPool, type TestSahPool } from "./_sahPool.ts";
import {
  readSqliteJsFile,
  setupSqliteJs,
  sqliteJsRawKeySql,
  writePoolFile,
} from "./_sqliteJs.ts";

const testKey = EncryptionKey.orThrow(
  Uint8Array.from({ length: 32 }, (_, index) => index * 7 + 1),
);

const wrongKey = EncryptionKey.orThrow(
  Uint8Array.from({ length: 32 }, (_, index) => 255 - index * 3),
);

const legacySalt = Uint8Array.from({ length: 16 }, (_, index) => 200 - index);

/** The key 2.2.4 derived, as `deriveLegacySqliteKey` derives it. */
const deriveLegacyKey = (key: Uint8Array, salt: Uint8Array) =>
  new Uint8Array(
    pbkdf2Sync(`x'${bytesToHex(key)}'`, salt, 256_000, 32, "sha512"),
  );

/**
 * The HMAC key the codec derives from a key and a database's salt, as SQLCipher
 * 4 does: PBKDF2-HMAC-SHA512 with 2 iterations and 32 bytes, salted with the
 * salt XOR 0x3a.
 */
const deriveHmacKey = (key: Uint8Array, salt: Uint8Array) =>
  new Uint8Array(
    pbkdf2Sync(
      key,
      salt.map((byte) => byte ^ 0x3a),
      2,
      32,
      "sha512",
    ),
  );

// Table t of 300 rows whose v is zeroblob(3000).
const createRowsSql =
  "CREATE TABLE t(id INTEGER PRIMARY KEY, v BLOB); WITH RECURSIVE c(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM c WHERE i < 300) INSERT INTO t(v) SELECT zeroblob(3000) FROM c;";

// Spills the page cache, so the transaction has written pages to the database
// with its journal synced.
const spillSql =
  "PRAGMA cache_size = 10; BEGIN; UPDATE t SET v = randomblob(3000);";

/** Opens a path of the pool as an EncryptedFile database with the raw key. */
const openRaw = (t: TestSahPool, key: EncryptionKey, path: string) =>
  createSqliteDatabase(t)({
    type: "EncryptedFile",
    vfs: t.pool,
    path: SqliteVfsPath.orThrow(path),
    key,
  });

/**
 * Opens a path of the pool with createEncryptedSqliteDatabase, which falls back
 * to the legacy key.
 */
const openWithFallback = async (
  t: TestSahPool,
  key: EncryptionKey,
  path: string,
) => {
  await using run = testCreateRun({ ...t, subtleCrypto: crypto.subtle });
  return await run(
    createEncryptedSqliteDatabase({
      type: "EncryptedFile",
      vfs: t.pool,
      path: SqliteVfsPath.orThrow(path),
      key,
    }),
  );
};

/**
 * Returns the names of the keys whose bytes, or any 8-byte quarter of them, are
 * in the memory, once for each place.
 */
const findKeys = (
  memory: Uint8Array,
  keys: ReadonlyMap<string, Uint8Array>,
): ReadonlyArray<string> => {
  const bytes = Buffer.from(
    memory.buffer,
    memory.byteOffset,
    memory.byteLength,
  );
  const found: Array<string> = [];
  for (const [name, key] of keys) {
    const starts = new Set<number>();
    for (const offset of [0, 8, 16, 24]) {
      const quarter = key.subarray(offset, offset + 8);
      for (
        let at = bytes.indexOf(quarter);
        at !== -1;
        at = bytes.indexOf(quarter, at + 1)
      )
        starts.add(at - offset);
    }
    for (const _ of starts) found.push(name);
  }
  return found;
};

test("no key is left in linear memory once an encrypted database is closed or its open with a wrong key failed, raw or legacy, with or without a hot journal: not the raw key, the legacy key or an HMAC key the codec derives; the stack holds none at any read an open makes, the open's key is only in the staging block and the codec's block when SQLite reads the header, and an open database's only in the codec's; and the caller's keys stay as they were", async () => {
  const callerKeys = [testKey, wrongKey].map((key) => key.slice());
  const legacyKey = EncryptionKey.orThrow(deriveLegacyKey(testKey, legacySalt));
  // A worker creates two databases with the raw key and two as 2.2.4 keyed
  // them, and dies in a transaction on one of each, leaving hot journals.
  const t = await setupSahPool();
  const sqliteJs = await setupSqliteJs();
  const created = new sqliteJs.oo1.DB("/legacy.db", "c");
  created.exec(`${sqliteJsRawKeySql(legacyKey, legacySalt)} ${createRowsSql}`);
  created.close();
  const legacyFile = readSqliteJsFile(sqliteJs, "/legacy.db");
  writePoolFile(t, "/legacy.db", legacyFile);
  writePoolFile(t, "/legacy-hot.db", legacyFile);
  const legacyHot = getOrThrow(openRaw(t, legacyKey, "/legacy-hot.db"));
  assertOk(legacyHot.exec(spillSql));
  const raw = getOrThrow(openRaw(t, testKey, "/raw.db"));
  assertOk(raw.exec(createRowsSql));
  raw[Symbol.dispose]();
  const rawHot = getOrThrow(openRaw(t, testKey, "/raw-hot.db"));
  assertOk(rawHot.exec(`${createRowsSql} ${spillSql}`));
  t.fake.releaseHandles();
  const next = await setupSahPool({ fake: t.fake });
  const paths = [
    "/legacy-hot.db",
    "/legacy-hot.db-journal",
    "/legacy.db",
    "/raw-hot.db",
    "/raw-hot.db-journal",
    "/raw.db",
  ];
  assertEqual(next.pool.getPaths().toSorted(), paths);

  const read = (path: string, offset: number, byteLength: number) =>
    getOrThrow(
      next.pool.read(
        path,
        offset as NonNegativeInt,
        byteLength as NonNegativeInt,
      ),
    );
  const rawSalt = read("/raw.db", 0, 16);
  const keysByName = new Map<string, Uint8Array>([
    ["the key", testKey],
    ["the wrong key", wrongKey],
    ["the legacy key", legacyKey],
    ["the wrong key's legacy key", deriveLegacyKey(wrongKey, legacySalt)],
  ]);
  const saltsByName = new Map([
    ["/raw.db's salt", rawSalt],
    ["/raw-hot.db's salt", read("/raw-hot.db", 0, 16)],
    ["the legacy salt", legacySalt],
  ]);
  const needles = new Map(keysByName);
  for (const [keyName, key] of keysByName)
    for (const [saltName, salt] of saltsByName)
      needles.set(
        `the HMAC key of ${keyName} with ${saltName}`,
        deriveHmacKey(key, salt),
      );
  // The HMAC keys are the codec's: page 2 of /raw.db ends with the HMAC of
  // what precedes it, its encrypted bytes and IV, and its number, 4 bytes
  // little-endian. Page 1 stores the page size unencrypted at byte 16.
  const [high, low] = read("/raw.db", 16, 2);
  const pageSize = (high << 8) | low;
  const page2 = read("/raw.db", pageSize, pageSize);
  assertEqual(
    new Uint8Array(
      createHmac("sha512", deriveHmacKey(testKey, rawSalt))
        .update(page2.subarray(0, -64))
        .update(Uint8Array.of(2, 0, 0, 0))
        .digest(),
    ),
    page2.subarray(-64),
  );
  const { emscripten_stack_get_base, emscripten_stack_get_end } = next
    .sqliteWasm.exports as unknown as {
    readonly emscripten_stack_get_base: () => number;
    readonly emscripten_stack_get_end: () => number;
  };
  const scanMemory = () => findKeys(next.sqliteWasm.getHeapU8(), needles);
  // The stack grows down from its base to its end.
  const scanStack = () =>
    findKeys(
      next.sqliteWasm
        .getHeapU8()
        .subarray(emscripten_stack_get_end(), emscripten_stack_get_base()),
      needles,
    );
  assertEqual(scanMemory(), []);

  /**
   * Runs an open, scanning the stack at each read it makes, and all of memory
   * at each read of a database's header.
   */
  const scanOpen = async <T>(open: () => T | Promise<T>) => {
    const onStack: Array<string> = [];
    const atHeader: Array<ReadonlyArray<string>> = [];
    next.fake.inject((call) => {
      if (call.method !== "read") return null;
      onStack.push(...scanStack());
      if (call.at === sahPoolHeaderSize && call.length === 100)
        atHeader.push(scanMemory());
      return null;
    });
    try {
      return { result: await open(), scans: { onStack, atHeader } };
    } finally {
      next.fake.inject(null);
    }
  };
  // SQLite reads the header right after the codec took the key, which is then
  // in the block the open staged it in and in the codec's.
  const opening = (keyName: string) => [keyName, keyName];

  for (const path of ["/raw.db", "/raw-hot.db"]) {
    const { result, scans } = await scanOpen(() =>
      openRaw(next, wrongKey, path),
    );
    assertErr(result);
    assertEqual(scans, {
      onStack: [],
      atHeader: [opening("the wrong key")],
    });
    assertEqual(scanMemory(), []);
  }
  for (const path of ["/legacy.db", "/legacy-hot.db"]) {
    const { result, scans } = await scanOpen(() =>
      openWithFallback(next, wrongKey, path),
    );
    assertErr(result);
    assertEqual(scans, {
      onStack: [],
      atHeader: [
        opening("the wrong key"),
        opening("the wrong key's legacy key"),
      ],
    });
    assertEqual(scanMemory(), []);
  }
  assertEqual(next.pool.getPaths().toSorted(), paths);
  for (const [path, keyName] of [
    ["/raw.db", "the key"],
    ["/raw-hot.db", "the key"],
    ["/legacy.db", "the legacy key"],
    ["/legacy-hot.db", "the legacy key"],
  ] as const) {
    const { result, scans } = await scanOpen(() =>
      openWithFallback(next, testKey, path),
    );
    const { database } = getOrThrow(result);
    assertEqual(scans, {
      onStack: [],
      atHeader:
        keyName === "the key"
          ? [opening(keyName)]
          : [opening("the key"), opening(keyName)],
    });
    assertEqual(
      getOrThrow(database.run("SELECT sum(v = zeroblob(3000)) AS n FROM t", []))
        .rows,
      [{ n: 300 }],
    );
    assertEqual(scanMemory(), [keyName]);
    database[Symbol.dispose]();
    assertEqual(scanMemory(), []);
  }
  assertEqual(next.pool.getPaths().toSorted(), [
    "/legacy-hot.db",
    "/legacy.db",
    "/raw-hot.db",
    "/raw.db",
  ]);
  assertEqual([testKey, wrongKey], callerKeys);
});
