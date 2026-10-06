/**
 * EncryptedFile databases on a pool on real OPFS in Chromium, Firefox and
 * WebKit: rows that a new worker and `@evolu/sqlite-wasm` 2.2.4 read, files
 * that hold no plaintext, a missing or wrong key, and recovery from the
 * encrypted hot journal of a worker ended by `Worker.terminate()`, as closing a
 * tab does, also after a 2.2.4 tab opened the pool.
 *
 * `test/integration/nodejs/sqlite-wasm/EncryptedPoolDatabase.test.ts` and
 * `SahPoolEncryption.test.ts` cover the pool's encryption over a fake OPFS;
 * these cover what a browser adds. `LegacyEncryptedDatabase.test.ts` covers the
 * databases 2.2.4 created.
 */

import {
  assertEqual,
  assertErr,
  assertFalse,
  assertOk,
  assertTrue,
  bytesToHex,
  EncryptionKey,
  err,
  ok,
} from "@evolu/common";
import { test } from "vitest";
import { SQLITE_NOTADB } from "../../../../packages/sqlite-wasm/src/Constants.ts";
import { sahPoolHeaderSize } from "../../../../packages/sqlite-wasm/src/SahPool.ts";
import {
  catchRejection,
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

const otherKey = EncryptionKey.orThrow(
  Uint8Array.from({ length: 32 }, (_, index) => 255 - index * 3),
);

const latin1 = new TextDecoder("latin1");

/** Decodes the content of a slot, after its header, as Latin-1. */
const decodeSlotContent = (slot: Uint8Array): string =>
  latin1.decode(slot.subarray(sahPoolHeaderSize));

/** How 2.2.4 reports a page 1 that fails to authenticate. */
const notADatabaseMessage =
  "SQLITE_NOTADB: sqlite3 result code 26: file is not a database";

// 2.2.4 takes "raw:" followed by hex as the raw key. @evolu/web runs
// x'<hex>', which 2.2.4 takes as a passphrase, so an old tab cannot open a
// database the pool created.
test('an EncryptedFile database keeps its rows for a new worker, which opens it with createEncryptedSqliteDatabase as Raw, and for 2.2.4 with the sqlcipher scheme and PRAGMA key = "raw:<hex>", but not with the SQL @evolu/web runs, while no file of the pool in OPFS holds the SQLite header or the rows', async () => {
  await using pool = setupPoolDirectory();
  {
    using worker = await setupSqliteWorker();
    assertOk(await worker.run("openPool", pool.directory));
    const database = okOrThrow(
      await worker.run(
        "openEncryptedDatabase",
        pool.directory,
        "/evolu1.db",
        testKey,
      ),
    );
    assertOk(
      await worker.run(
        "exec",
        database,
        "CREATE TABLE t(a); INSERT INTO t VALUES ('plaintext marker')",
      ),
    );
    assertEqual(
      okOrThrow(await worker.run("run", database, "SELECT a FROM t", [])).rows,
      [{ a: "plaintext marker" }],
    );
    await worker.run("disposeDatabase", database);
    await worker.run("disposePool", pool.directory);
  }
  const slots = await readSlots(pool.directory);
  assertTrue(decodeSlotContent(findSlot(slots, "/evolu1.db")[1]).length > 0);
  for (const slot of slots.values()) {
    const content = decodeSlotContent(slot);
    assertFalse(content.includes("SQLite format 3"));
    assertFalse(content.includes("plaintext marker"));
  }
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

    assertEqual(keyDerivation, "Raw");
    assertEqual(
      okOrThrow(await worker.run("run", database, "SELECT a FROM t", [])).rows,
      [{ a: "plaintext marker" }],
    );
    await worker.run("disposeDatabase", database);
    await worker.run("disposePool", pool.directory);
  }
  using sqliteJs = await setupSqliteJsWorker();
  await sqliteJs.run(
    "openKeyedDatabase",
    pool.directory,
    "evolu1.db",
    `PRAGMA cipher = 'sqlcipher'; PRAGMA key = "raw:${bytesToHex(testKey)}";`,
  );
  assertEqual(
    await sqliteJs.run("selectValue", "evolu1.db", "SELECT a FROM t"),
    "plaintext marker",
  );
  assertEqual(
    await sqliteJs.run("selectValue", "evolu1.db", "PRAGMA integrity_check"),
    "ok",
  );
  await sqliteJs.run("close", "evolu1.db");
  const before = await readSlots(pool.directory);
  await sqliteJs.run("openEvoluWebDatabase", pool.directory, testKey);
  assertEqual(
    await catchRejection(
      sqliteJs.run("selectValue", "evolu1.db", "SELECT a FROM t"),
    ),
    notADatabaseMessage,
  );
  await sqliteJs.run("close", "evolu1.db");
  assertEqual(await readSlots(pool.directory), before);
});

test("an encrypted database opened with another key fails with SQLITE_NOTADB, caused by the pool's SqlitePageAuthenticationError for page 1, whose error holds nothing of either key, also after createEncryptedSqliteDatabase derived the legacy key, leaves its files in OPFS unchanged, and opens again with its key", async () => {
  await using pool = setupPoolDirectory();
  using worker = await setupSqliteWorker();
  assertOk(await worker.run("openPool", pool.directory));
  const created = okOrThrow(
    await worker.run(
      "openEncryptedDatabase",
      pool.directory,
      "/evolu1.db",
      testKey,
    ),
  );
  assertOk(
    await worker.run(
      "exec",
      created,
      "CREATE TABLE t(a); INSERT INTO t VALUES ('row')",
    ),
  );
  await worker.run("disposeDatabase", created);
  const before = await readSlots(pool.directory);
  const notADatabase = err({
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

  assertEqual(
    await worker.run(
      "openEncryptedDatabase",
      pool.directory,
      "/evolu1.db",
      otherKey,
    ),
    notADatabase,
  );
  assertEqual(
    await worker.run(
      "openEncryptedDatabaseWithFallback",
      pool.directory,
      "/evolu1.db",
      otherKey,
    ),
    notADatabase,
  );

  assertEqual(await readSlots(pool.directory), before);
  const database = okOrThrow(
    await worker.run(
      "openEncryptedDatabase",
      pool.directory,
      "/evolu1.db",
      testKey,
    ),
  );
  assertEqual(
    okOrThrow(await worker.run("run", database, "SELECT a FROM t", [])).rows,
    [{ a: "row" }],
  );
  await worker.run("disposeDatabase", database);
});

// tester1.c-pp.js T.seeBaseCheck (SQLite 3.53.4, public domain) on
// OpfsSAHPoolDb, with the raw key in place of SEE's textkey, key and hexkey.
test("an EncryptedFile database with table t fails to open as a File database, without its key, with SQLITE_NOTADB, and with its key takes the rows 1 and 2 twice, summing 3 and then 6, until it is unlinked", async () => {
  await using pool = setupPoolDirectory();
  using worker = await setupSqliteWorker();
  assertOk(await worker.run("openPool", pool.directory));
  const path = "/sqlite3-see.edb";
  const created = okOrThrow(
    await worker.run("openEncryptedDatabase", pool.directory, path, testKey),
  );
  assertOk(
    await worker.run(
      "exec",
      created,
      "drop table if exists t; create table t(a);",
    ),
  );
  await worker.run("disposeDatabase", created);

  const unkeyed = await worker.run("openDatabase", pool.directory, path);

  assertErr(unkeyed);
  assertEqual(unkeyed.error.extendedCode, SQLITE_NOTADB);
  for (const sum of [3, 6]) {
    const database = okOrThrow(
      await worker.run("openEncryptedDatabase", pool.directory, path, testKey),
    );
    assertOk(
      await worker.run("exec", database, "insert into t(a) values (1),(2)"),
    );
    assertEqual(
      okOrThrow(
        await worker.run("run", database, "select sum(a) as sum from t", []),
      ).rows,
      [{ sum }],
    );
    await worker.run("disposeDatabase", database);
  }
  assertEqual(await worker.run("unlink", pool.directory, path), ok(true));
  assertEqual(await worker.run("getPaths", pool.directory), []);
});

// Table t of 300 rows whose v is zeroblob(3000), as in repro/crash.html, and
// whose m is text to look for in the files.
const createRowsSql =
  "CREATE TABLE t(id INTEGER PRIMARY KEY, v BLOB, m TEXT); WITH RECURSIVE c(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM c WHERE i < 300) INSERT INTO t(v, m) SELECT zeroblob(3000), 'plaintext marker' FROM c;";

// Spills the page cache, so the transaction has written pages to the database
// with its journal synced.
const spillSql =
  "PRAGMA cache_size = 10; BEGIN; UPDATE t SET v = randomblob(3000);";

// The scenario of CrashRecovery.test.ts with the pages and the journal
// encrypted.
test("opening an EncryptedFile database rolls back the hot journal of a transaction that spilled when its worker was terminated, which OPFS holds encrypted like the database, with no journal left", async () => {
  await using pool = setupPoolDirectory();
  {
    using crashed = await setupSqliteWorker();
    assertOk(await crashed.run("openPool", pool.directory));
    const database = okOrThrow(
      await crashed.run(
        "openEncryptedDatabase",
        pool.directory,
        "/evolu1.db",
        testKey,
      ),
    );
    assertOk(
      await crashed.run("exec", database, `${createRowsSql} ${spillSql}`),
    );
    crashed.terminate();
  }
  using worker = await setupSqliteWorker();
  assertOk(await worker.run("openPool", pool.directory, { heldTimeout: "5s" }));
  assertEqual((await worker.run("getPaths", pool.directory)).toSorted(), [
    "/evolu1.db",
    "/evolu1.db-journal",
  ]);
  const slots = await readSlots(pool.directory);
  const journal = decodeSlotContent(findSlot(slots, "/evolu1.db-journal")[1]);
  // The journal holds pages, not just its header.
  assertTrue(journal.length > 8192);
  assertFalse(journal.includes("plaintext marker"));
  assertFalse(
    decodeSlotContent(findSlot(slots, "/evolu1.db")[1]).includes(
      "plaintext marker",
    ),
  );

  const database = okOrThrow(
    await worker.run(
      "openEncryptedDatabase",
      pool.directory,
      "/evolu1.db",
      testKey,
    ),
  );

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
  await worker.run("disposeDatabase", database);
});

// A tab of @evolu/web with 2.2.4 keys with x'<hex>', which does not fit a
// database the pool created with the raw key, and takes no journal for hot.
test("a 2.2.4 tab that opens the pool after a worker was terminated mid-transaction on an EncryptedFile database fails with SQLITE_NOTADB with the SQL @evolu/web runs, changing no file in OPFS, and the pool then rolls the journal back", async () => {
  await using pool = setupPoolDirectory();
  {
    using crashed = await setupSqliteWorker();
    assertOk(await crashed.run("openPool", pool.directory));
    const database = okOrThrow(
      await crashed.run(
        "openEncryptedDatabase",
        pool.directory,
        "/evolu1.db",
        testKey,
      ),
    );
    assertOk(
      await crashed.run("exec", database, `${createRowsSql} ${spillSql}`),
    );
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
    assertEqual(
      await catchRejection(
        sqliteJs.run("selectValue", "evolu1.db", snapshotSql),
      ),
      notADatabaseMessage,
    );
    await sqliteJs.run("close", "evolu1.db");
    await sqliteJs.run("pausePool");
  }
  assertEqual(await readSlots(pool.directory), before);
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
  assertEqual(keyDerivation, "Raw");
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
  await worker.run("disposeDatabase", database);
});
