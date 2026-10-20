/**
 * What an encrypted database leaves of its keys in the instance's linear
 * memory, on real OPFS in Chromium, Firefox and WebKit, as
 * `test/integration/nodejs/sqlite-wasm/KeyResidue.test.ts` details.
 *
 * Once a database is closed, and once an open with a wrong key failed, the test
 * finds no raw key, no key `deriveLegacySqliteKey` derives and no HMAC key the
 * codec derives from either, computed with WebCrypto, anywhere in linear
 * memory. The Node.js test also scans the stack during an open, through its
 * fake OPFS; the stack is the wasm's own memory, laid out alike in every
 * engine.
 */

import {
  assert,
  assertEqual,
  assertErr,
  assertOk,
  bytesToHex,
  EncryptionKey,
  type Result,
} from "@evolu/common";
import { test } from "vitest";
import {
  SQLITE_CORRUPT,
  SQLITE_NOTADB,
} from "../../../../packages/sqlite-wasm/src/Constants.ts";
import type {
  SqliteError,
  SqliteVfsIoError,
} from "../../../../packages/sqlite-wasm/src/Database.ts";
import {
  okOrThrow,
  setupPoolDirectory,
  setupSqliteJsWorker,
  setupSqliteWorker,
  waitForReleasedSlots,
} from "./_harness.ts";

const testKey = EncryptionKey.orThrow(
  Uint8Array.from({ length: 32 }, (_, index) => index * 7 + 1),
);

const wrongKey = EncryptionKey.orThrow(
  Uint8Array.from({ length: 32 }, (_, index) => 255 - index * 3),
);

const legacySalt = Uint8Array.from({ length: 16 }, (_, index) => 200 - index);

/** PBKDF2-HMAC-SHA512 of 32 bytes, with WebCrypto. */
const pbkdf2Sha512 = async (
  password: Uint8Array,
  salt: Uint8Array,
  iterations: number,
) =>
  new Uint8Array(
    await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        hash: "SHA-512",
        salt: new Uint8Array(salt),
        iterations,
      },
      await crypto.subtle.importKey(
        "raw",
        new Uint8Array(password),
        "PBKDF2",
        false,
        ["deriveBits"],
      ),
      256,
    ),
  );

/** The key 2.2.4 derived, as `deriveLegacySqliteKey` derives it. */
const deriveLegacyKey = (key: Uint8Array, salt: Uint8Array) =>
  pbkdf2Sha512(
    new TextEncoder().encode(`x'${bytesToHex(key)}'`),
    salt,
    256_000,
  );

/**
 * The HMAC key the codec derives from a key and a database's salt, as SQLCipher
 * 4 does: PBKDF2-HMAC-SHA512 with 2 iterations, salted with the salt XOR 0x3a.
 */
const deriveHmacKey = (key: Uint8Array, salt: Uint8Array) =>
  pbkdf2Sha512(
    key,
    salt.map((byte) => byte ^ 0x3a),
    2,
  );

// Table t of 300 rows whose v is zeroblob(3000).
const createRowsSql =
  "CREATE TABLE t(id INTEGER PRIMARY KEY, v BLOB); WITH RECURSIVE c(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM c WHERE i < 300) INSERT INTO t(v) SELECT zeroblob(3000) FROM c;";

// Spills the page cache, so the transaction has written pages to the database
// with its journal synced.
const spillSql =
  "PRAGMA cache_size = 10; BEGIN; UPDATE t SET v = randomblob(3000);";

// Its opens of the legacy databases derive the key 2.2.4 used, PBKDF2-HMAC-SHA512
// with 256,000 iterations, in wasm. With the scans of linear memory, that takes
// about 6 seconds in Chromium on an Apple M5 and 9 to 12 seconds in Firefox and
// WebKit on a CI runner, too close to the default 15-second browser timeout.
test("no key is left in linear memory once an encrypted database is closed or its open with a wrong key failed, raw or legacy, with or without a hot journal: not the raw key, the legacy key or an HMAC key the codec derives, while an open database's key is there once", async () => {
  await using pool = setupPoolDirectory();
  const legacyKey = EncryptionKey.orThrow(
    await deriveLegacyKey(testKey, legacySalt),
  );
  // 2.2.4 creates two databases keyed with the legacy key and a worker two
  // with the raw key, and each dies in a transaction on one, leaving hot
  // journals. 2.2.4 takes "raw:" followed by hex as the raw key and the salt.
  {
    using sqliteJs = await setupSqliteJsWorker();
    for (const [fileName, sql] of [
      ["legacy.db", createRowsSql],
      ["legacy-hot.db", `${createRowsSql} ${spillSql}`],
    ] as const) {
      await sqliteJs.run(
        "openKeyedDatabase",
        pool.directory,
        fileName,
        `PRAGMA cipher = 'sqlcipher'; PRAGMA key = "raw:${bytesToHex(legacyKey)}${bytesToHex(legacySalt)}";`,
      );
      await sqliteJs.run("exec", fileName, sql);
    }
    await sqliteJs.run("close", "legacy.db");
    sqliteJs.terminate();
  }
  {
    using crashed = await setupSqliteWorker();
    assertOk(
      await crashed.run("openPool", pool.directory, { heldTimeout: "5s" }),
    );
    const raw = okOrThrow(
      await crashed.run(
        "openEncryptedDatabase",
        pool.directory,
        "/raw.db",
        testKey,
      ),
    );
    assertOk(await crashed.run("exec", raw, createRowsSql));
    await crashed.run("disposeDatabase", raw);
    const rawHot = okOrThrow(
      await crashed.run(
        "openEncryptedDatabase",
        pool.directory,
        "/raw-hot.db",
        testKey,
      ),
    );
    assertOk(await crashed.run("exec", rawHot, `${createRowsSql} ${spillSql}`));
    crashed.terminate();
  }
  await waitForReleasedSlots(pool.directory);
  using worker = await setupSqliteWorker();
  assertOk(await worker.run("openPool", pool.directory));
  const paths = [
    "/legacy-hot.db",
    "/legacy-hot.db-journal",
    "/legacy.db",
    "/raw-hot.db",
    "/raw-hot.db-journal",
    "/raw.db",
  ];
  assertEqual((await worker.run("getPaths", pool.directory)).toSorted(), paths);

  const read = async (path: string, offset: number, byteLength: number) =>
    new Uint8Array(
      okOrThrow(
        await worker.run("read", pool.directory, path, offset, byteLength),
      ),
    );
  const rawSalt = await read("/raw.db", 0, 16);
  const keysByName = new Map<string, Uint8Array>([
    ["the key", testKey],
    ["the wrong key", wrongKey],
    ["the legacy key", legacyKey],
    ["the wrong key's legacy key", await deriveLegacyKey(wrongKey, legacySalt)],
  ]);
  const saltsByName = new Map([
    ["/raw.db's salt", rawSalt],
    ["/raw-hot.db's salt", await read("/raw-hot.db", 0, 16)],
    ["the legacy salt", legacySalt],
  ]);
  const needles: Array<readonly [string, Uint8Array]> = [...keysByName];
  for (const [keyName, key] of keysByName)
    for (const [saltName, salt] of saltsByName)
      needles.push([
        `the HMAC key of ${keyName} with ${saltName}`,
        await deriveHmacKey(key, salt),
      ]);
  // The HMAC keys are the codec's: page 2 of /raw.db ends with the HMAC of
  // what precedes it, its encrypted bytes and IV, and its number, 4 bytes
  // little-endian. Page 1 stores the page size unencrypted at byte 16.
  const [high, low] = await read("/raw.db", 16, 2);
  const pageSize = (high << 8) | low;
  const page2 = await read("/raw.db", pageSize, pageSize);
  const authenticated = new Uint8Array(pageSize - 60);
  authenticated.set(page2.subarray(0, -64));
  authenticated.set([2, 0, 0, 0], pageSize - 64);
  assertEqual(
    new Uint8Array(
      await crypto.subtle.sign(
        "HMAC",
        await crypto.subtle.importKey(
          "raw",
          await deriveHmacKey(testKey, rawSalt),
          { name: "HMAC", hash: "SHA-512" },
          false,
          ["sign"],
        ),
        authenticated,
      ),
    ),
    page2.subarray(-64),
  );
  const findKeys = () => worker.run("findKeys", needles);
  assertEqual(await findKeys(), []);
  // The code of an open the wrong key failed and what its cause says, so the
  // key reached the codec: a page 1, or a journal's first record, that does
  // not authenticate.
  const describeFailure = (
    opened: Result<unknown, SqliteError | SqliteVfsIoError>,
  ) => {
    assertErr(opened);
    assert(opened.error.type === "SqliteError", "The open fails in SQLite.");
    const { extendedCode, cause } = opened.error;
    return [
      extendedCode,
      cause?.type === "SqliteCodecFailure" ? cause.error.type : cause,
    ];
  };

  for (const [path, extendedCode] of [
    ["/raw.db", SQLITE_NOTADB],
    ["/raw-hot.db", SQLITE_CORRUPT],
  ] as const) {
    assertEqual(
      [
        path,
        describeFailure(
          await worker.run(
            "openEncryptedDatabase",
            pool.directory,
            path,
            wrongKey,
          ),
        ),
      ],
      [path, [extendedCode, "SqlitePageAuthenticationError"]],
    );
    assertEqual(await findKeys(), []);
  }
  for (const [path, extendedCode] of [
    ["/legacy.db", SQLITE_NOTADB],
    ["/legacy-hot.db", SQLITE_CORRUPT],
  ] as const) {
    assertEqual(
      [
        path,
        describeFailure(
          await worker.run(
            "openEncryptedDatabaseWithFallback",
            pool.directory,
            path,
            wrongKey,
          ),
        ),
      ],
      [path, [extendedCode, "SqlitePageAuthenticationError"]],
    );
    assertEqual(await findKeys(), []);
  }
  assertEqual((await worker.run("getPaths", pool.directory)).toSorted(), paths);
  for (const [path, keyName] of [
    ["/raw.db", "the key"],
    ["/raw-hot.db", "the key"],
    ["/legacy.db", "the legacy key"],
    ["/legacy-hot.db", "the legacy key"],
  ] as const) {
    const { database } = okOrThrow(
      await worker.run(
        "openEncryptedDatabaseWithFallback",
        pool.directory,
        path,
        testKey,
      ),
    );
    assertEqual(
      okOrThrow(
        await worker.run(
          "run",
          database,
          "SELECT sum(v = zeroblob(3000)) AS n FROM t",
          [],
        ),
      ).rows,
      [{ n: 300 }],
    );
    assertEqual(await findKeys(), [keyName]);
    await worker.run("disposeDatabase", database);
    assertEqual(await findKeys(), []);
  }
  assertEqual((await worker.run("getPaths", pool.directory)).toSorted(), [
    "/legacy-hot.db",
    "/legacy.db",
    "/raw-hot.db",
    "/raw.db",
  ]);
}, 60_000);
