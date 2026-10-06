/**
 * Encrypted databases that `@evolu/sqlite-wasm` 2.2.4 created as `@evolu/web`
 * 3.0.0 to 3.4.1 created them, opened by `createEncryptedSqliteDatabase` with
 * the same key on real OPFS in Chromium, Firefox and WebKit.
 *
 * Every encrypted database those versions created is such a database, so each
 * must open unchanged and without losing data, also with the hot journal a tab
 * closed mid-transaction left, and must stay readable by 2.2.4, which older
 * tabs and cached PWAs still run, also after the pool's worker was terminated
 * mid-transaction. `@evolu/web` keyed them with `PRAGMA key = "x'<hex>'"`,
 * which SQLite3 Multiple Ciphers 2.2.4 took as a passphrase, so they open with
 * the key derived from it, as
 * `test/integration/nodejs/sqlite-wasm/LegacyEncryptedDatabase.test.ts`
 * details.
 */

import {
  assertEqual,
  assertErr,
  assertFalse,
  assertOk,
  assertTrue,
  EncryptionKey,
} from "@evolu/common";
import { test } from "vitest";
import { SQLITE_CORRUPT } from "../../../../packages/sqlite-wasm/src/Constants.ts";
import { sahPoolHeaderSize } from "../../../../packages/sqlite-wasm/src/SahPool.ts";
import {
  findSlot,
  okOrThrow,
  readSlots,
  setupPoolDirectory,
  setupSqliteJsWorker,
  setupSqliteWorker,
  snapshotSql,
  waitForReleasedSlots,
} from "./_harness.ts";

const testKey = EncryptionKey.orThrow(
  Uint8Array.from({ length: 32 }, (_, index) => index * 7 + 1),
);

/**
 * Returns the rows of table t a writer inserted with {@link insertRowsSql}, with
 * the ids from `from` to `to`.
 */
const createRows = (writer: string, from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, index) => ({
    id: from + index,
    a: `${writer} row ${from + index} ${"00".repeat(50)}`,
  }));

/**
 * Inserts into table t a row of the writer for each id from `from` to `to`,
 * over 100 bytes each, so 300 rows span several pages.
 */
const insertRowsSql = (writer: string, from: number, to: number) =>
  `WITH RECURSIVE c(i) AS (SELECT ${from} UNION ALL SELECT i + 1 FROM c WHERE i < ${to}) INSERT INTO t(id, a) SELECT i, '${writer} row ' || i || ' ' || hex(zeroblob(50)) FROM c`;

test("a database 2.2.4 encrypted as @evolu/web does opens with the same key as Legacy224, reads every row, takes new rows and keeps its salt, and 2.2.4 then reads every row", async () => {
  await using pool = setupPoolDirectory();
  {
    using sqliteJs = await setupSqliteJsWorker();
    await sqliteJs.run("openEvoluWebDatabase", pool.directory, testKey);
    await sqliteJs.run(
      "exec",
      "evolu1.db",
      `CREATE TABLE t(id INTEGER PRIMARY KEY, a TEXT); ${insertRowsSql("2.2.4", 1, 300)}`,
    );
    await sqliteJs.run("close", "evolu1.db");
    await sqliteJs.run("pausePool");
  }
  const [, created] = findSlot(await readSlots(pool.directory), "/evolu1.db");
  assertFalse(
    new TextDecoder("latin1")
      .decode(created.subarray(sahPoolHeaderSize))
      .includes("SQLite format 3"),
  );
  using worker = await setupSqliteWorker();
  assertOk(await worker.run("openPool", pool.directory));

  const { database, keyDerivation } = okOrThrow(
    await worker.run(
      "openEncryptedDatabaseWithFallback",
      pool.directory,
      "/evolu1.db",
      testKey,
    ),
  );

  assertEqual(keyDerivation, "Legacy224");
  assertEqual(
    okOrThrow(
      await worker.run("run", database, "SELECT id, a FROM t ORDER BY id", []),
    ).rows,
    createRows("2.2.4", 1, 300),
  );
  assertOk(
    await worker.run("exec", database, insertRowsSql("SahPool", 301, 600)),
  );
  await worker.run("disposeDatabase", database);
  await worker.run("disposePool", pool.directory);
  const [, written] = findSlot(await readSlots(pool.directory), "/evolu1.db");
  assertEqual(
    written.subarray(sahPoolHeaderSize, sahPoolHeaderSize + 16),
    created.subarray(sahPoolHeaderSize, sahPoolHeaderSize + 16),
  );
  using sqliteJs = await setupSqliteJsWorker();
  await sqliteJs.run("openEvoluWebDatabase", pool.directory, testKey);
  assertEqual(
    await sqliteJs.run(
      "selectObjects",
      "evolu1.db",
      "SELECT id, a FROM t ORDER BY id",
    ),
    [...createRows("2.2.4", 1, 300), ...createRows("SahPool", 301, 600)],
  );
  assertEqual(
    await sqliteJs.run("selectValue", "evolu1.db", "PRAGMA integrity_check"),
    "ok",
  );
});

// Table t of 300 rows whose v is zeroblob(3000), as in repro/crash.html.
const createRowsSql =
  "CREATE TABLE t(id INTEGER PRIMARY KEY, v BLOB); WITH RECURSIVE c(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM c WHERE i < 300) INSERT INTO t(v) SELECT zeroblob(3000) FROM c;";

// Spills the page cache, so the transaction has written pages to the database
// with its journal synced.
const spillSql =
  "PRAGMA cache_size = 10; BEGIN; UPDATE t SET v = randomblob(3000);";

// Adds the rows 301 to 400 of table t, each v zeroblob(3000).
const insertZeroblobRowsSql =
  "WITH RECURSIVE c(i) AS (SELECT 301 UNION ALL SELECT i + 1 FROM c WHERE i < 400) INSERT INTO t(id, v) SELECT i, zeroblob(3000) FROM c";

// The rollback with the raw key stops at the journal's first page, which that
// key cannot decrypt.
test("a transaction 2.2.4 spilled into a database encrypted as @evolu/web does, when its worker was terminated, fails with the raw key with SQLITE_CORRUPT, caused by the pool's SqlitePageAuthenticationError for the journal's first page, without changing any file in OPFS, is rolled back with the legacy key, leaving no journal, takes new rows, and 2.2.4 then reads the rows as they were and the new ones", async () => {
  await using pool = setupPoolDirectory();
  {
    using sqliteJs = await setupSqliteJsWorker();
    await sqliteJs.run("openEvoluWebDatabase", pool.directory, testKey);
    await sqliteJs.run("exec", "evolu1.db", `${createRowsSql} ${spillSql}`);
    assertEqual((await sqliteJs.run("getFileNames")).toSorted(), [
      "/evolu1.db",
      "/evolu1.db-journal",
    ]);
    sqliteJs.terminate();
  }
  using worker = await setupSqliteWorker();
  assertOk(await worker.run("openPool", pool.directory, { heldTimeout: "5s" }));
  const before = await readSlots(pool.directory);

  const raw = await worker.run(
    "openEncryptedDatabase",
    pool.directory,
    "/evolu1.db",
    testKey,
  );

  assertErr(raw);
  assertEqual(raw.error.extendedCode, SQLITE_CORRUPT);
  // The first record's page number, after the header's sector.
  const [, journal] = findSlot(before, "/evolu1.db-journal");
  assertEqual(raw.error.cause, {
    method: "xRead",
    path: "/evolu1.db-journal",
    error: {
      type: "SqlitePageAuthenticationError",
      pageNumber: new DataView(journal.buffer).getUint32(
        sahPoolHeaderSize + 4096,
      ),
    },
  });
  assertEqual(await readSlots(pool.directory), before);
  const { database, keyDerivation } = okOrThrow(
    await worker.run(
      "openEncryptedDatabaseWithFallback",
      pool.directory,
      "/evolu1.db",
      testKey,
    ),
  );
  assertEqual(keyDerivation, "Legacy224");
  assertEqual(await worker.run("getPaths", pool.directory), ["/evolu1.db"]);
  assertEqual(
    okOrThrow(
      await worker.run(
        "run",
        database,
        "SELECT count(*) AS n, sum(v = zeroblob(3000)) AS unchanged FROM t",
        [],
      ),
    ).rows,
    [{ n: 300, unchanged: 300 }],
  );
  assertEqual(
    okOrThrow(await worker.run("run", database, "PRAGMA integrity_check", []))
      .rows,
    [{ integrity_check: "ok" }],
  );
  assertOk(await worker.run("exec", database, insertZeroblobRowsSql));
  await worker.run("disposeDatabase", database);
  await worker.run("disposePool", pool.directory);
  using sqliteJs = await setupSqliteJsWorker();
  await sqliteJs.run("openEvoluWebDatabase", pool.directory, testKey);
  assertEqual(
    await sqliteJs.run("selectValue", "evolu1.db", snapshotSql),
    "400:400",
  );
  assertEqual(
    await sqliteJs.run("selectValue", "evolu1.db", "PRAGMA integrity_check"),
    "ok",
  );
  assertEqual(await sqliteJs.run("getFileNames"), ["/evolu1.db"]);
});

// 2.2.4's xCheckReservedLock always reports a reserved lock, so it takes a hot
// journal for a live one, as Interop.test.ts shows for an unencrypted pool.
test("a 2.2.4 tab that opens the pool after a worker was terminated mid-transaction on a database 2.2.4 encrypted as @evolu/web does wipes no slot, reads with the SQL @evolu/web runs the rows the transaction half wrote, changes no file in OPFS, and the pool then rolls the journal back with the legacy key, so 2.2.4 reads the rows as they were", async () => {
  await using pool = setupPoolDirectory();
  {
    using sqliteJs = await setupSqliteJsWorker();
    await sqliteJs.run("openEvoluWebDatabase", pool.directory, testKey);
    await sqliteJs.run("exec", "evolu1.db", createRowsSql);
    await sqliteJs.run("close", "evolu1.db");
    await sqliteJs.run("pausePool");
  }
  {
    using crashed = await setupSqliteWorker();
    assertOk(await crashed.run("openPool", pool.directory));
    const { database, keyDerivation } = okOrThrow(
      await crashed.run(
        "openEncryptedDatabaseWithFallback",
        pool.directory,
        "/evolu1.db",
        testKey,
      ),
    );
    assertEqual(keyDerivation, "Legacy224");
    assertOk(await crashed.run("exec", database, spillSql));
    crashed.terminate();
  }
  await waitForReleasedSlots(pool.directory);
  const before = await readSlots(pool.directory);
  {
    using sqliteJs = await setupSqliteJsWorker();

    await sqliteJs.run("openEvoluWebDatabase", pool.directory, testKey);

    assertEqual((await sqliteJs.run("getFileNames")).toSorted(), [
      "/evolu1.db",
      "/evolu1.db-journal",
    ]);
    const halfWritten = await sqliteJs.run(
      "selectValue",
      "evolu1.db",
      snapshotSql,
    );
    assertTrue(halfWritten !== "300:300");
    await sqliteJs.run("close", "evolu1.db");
    await sqliteJs.run("pausePool");
  }
  assertEqual(await readSlots(pool.directory), before);
  {
    using worker = await setupSqliteWorker();
    assertOk(await worker.run("openPool", pool.directory));
    const { database, keyDerivation } = okOrThrow(
      await worker.run(
        "openEncryptedDatabaseWithFallback",
        pool.directory,
        "/evolu1.db",
        testKey,
      ),
    );
    assertEqual(keyDerivation, "Legacy224");
    assertEqual(await worker.run("getPaths", pool.directory), ["/evolu1.db"]);
    assertEqual(
      okOrThrow(await worker.run("run", database, "PRAGMA integrity_check", []))
        .rows,
      [{ integrity_check: "ok" }],
    );
    await worker.run("disposeDatabase", database);
    await worker.run("disposePool", pool.directory);
  }
  using sqliteJs = await setupSqliteJsWorker();
  await sqliteJs.run("openEvoluWebDatabase", pool.directory, testKey);
  assertEqual(
    await sqliteJs.run("selectValue", "evolu1.db", snapshotSql),
    "300:300",
  );
  assertEqual(await sqliteJs.run("getFileNames"), ["/evolu1.db"]);
});
