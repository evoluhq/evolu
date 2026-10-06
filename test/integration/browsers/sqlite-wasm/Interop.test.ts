/**
 * `SahPool` and SQLite's own opfs-sahpool on the same pools, on real OPFS in
 * Chromium, Firefox and WebKit.
 *
 * Existing pools, and older tabs and cached PWAs, run SQLite's JavaScript as
 * `@evolu/sqlite-wasm` 2.2.4 ships it, which wipes any slot whose header it
 * does not accept. So each writes pools the other reads, after a commit and
 * after a worker was terminated mid-transaction, and both read the legacy `[0,
 * 0]`-digest headers of opfs-sahpool before SQLite 3.50. They follow the pool
 * digest test of SQLite's `ext/wasm/tests/opfs/sahpool/digest.html` with
 * `digest-worker.js` (SQLite 3.53.4, public domain).
 * `LegacyEncryptedDatabase.test.ts` covers the encrypted databases of 2.2.4.
 */

import { assertEqual, assertOk, assertTrue } from "@evolu/common";
import { test } from "vitest";
import {
  SQLITE_OK,
  SQLITE_OPEN_CREATE,
  SQLITE_OPEN_MAIN_DB,
  SQLITE_OPEN_READWRITE,
} from "../../../../packages/sqlite-wasm/src/Constants.ts";
import {
  sahPoolDigestV2Flag,
  sahPoolHeaderDigestOffset,
  sahPoolHeaderFlagsOffset,
  sahPoolHeaderSize,
} from "../../../../packages/sqlite-wasm/src/SahPool.ts";
import {
  createConnections,
  createSlotHeader,
  findSlot,
  okOrThrow,
  readPoolEntries,
  readSlots,
  setupPoolDirectory,
  setupSqliteJsWorker,
  setupSqliteWorker,
  snapshotSql,
  waitForReleasedSlots,
} from "./_harness.ts";

test("the worker runs SQLite's JavaScript of @evolu/sqlite-wasm 2.2.4, which is SQLite 3.50.4", async () => {
  using sqliteJs = await setupSqliteJsWorker();

  assertEqual(await sqliteJs.run("libversion"), "3.50.4");
});

// digest-worker.js runTests: a database written, closed and reopened, on a
// pool another implementation reads.
test("a pool and database 2.2.4 wrote, with headers whose digest computeSahPoolDigest computes, open with every row and unchanged slots, and 2.2.4 then reads the row SahPool committed", async () => {
  await using pool = setupPoolDirectory();
  using sqliteJs = await setupSqliteJsWorker();
  assertEqual(await sqliteJs.run("openPool", pool.directory), []);
  await sqliteJs.run(
    "exec",
    "file:evolu1.db",
    "CREATE TABLE t(a); INSERT INTO t VALUES ('2.2.4')",
  );
  await sqliteJs.run("close", "file:evolu1.db");
  await sqliteJs.run("pausePool");
  const before = await readSlots(pool.directory);
  assertEqual(before.size, 6);
  const [, header] = findSlot(before, "/evolu1.db");
  const flags = new DataView(header.buffer).getUint32(sahPoolHeaderFlagsOffset);
  assertTrue((flags & sahPoolDigestV2Flag) !== 0);
  assertEqual(
    header.subarray(0, sahPoolHeaderSize),
    createSlotHeader("/evolu1.db", flags),
  );
  using worker = await setupSqliteWorker();

  assertOk(await worker.run("openPool", pool.directory));
  assertEqual(await worker.run("getPaths", pool.directory), ["/evolu1.db"]);
  const database = okOrThrow(
    await worker.run("openDatabase", pool.directory, "/evolu1.db"),
  );
  assertEqual(
    okOrThrow(await worker.run("run", database, "SELECT a FROM t", [])).rows,
    [{ a: "2.2.4" }],
  );

  assertEqual(await readSlots(pool.directory), before);
  assertOk(
    await worker.run("exec", database, "INSERT INTO t VALUES ('SahPool')"),
  );
  await worker.run("disposeDatabase", database);
  await worker.run("disposePool", pool.directory);
  assertEqual(await sqliteJs.run("openPool", pool.directory), ["/evolu1.db"]);
  assertEqual(
    await sqliteJs.run("selectObjects", "file:evolu1.db", "SELECT a FROM t"),
    [{ a: "2.2.4" }, { a: "SahPool" }],
  );
});

test("2.2.4 opens a pool and database SahPool wrote, in a directory that holds only .opaque, without wiping or rewriting any slot, reads every row, and SahPool then reads the row 2.2.4 committed", async () => {
  await using pool = setupPoolDirectory();
  {
    using worker = await setupSqliteWorker();
    assertOk(await worker.run("openPool", pool.directory));
    const database = okOrThrow(
      await worker.run("openDatabase", pool.directory, "/evolu1.db"),
    );
    assertOk(
      await worker.run(
        "exec",
        database,
        "CREATE TABLE t(a); INSERT INTO t VALUES ('SahPool')",
      ),
    );
    await worker.run("disposeDatabase", database);
    await worker.run("disposePool", pool.directory);
  }
  const before = await readSlots(pool.directory);
  assertEqual(await readPoolEntries(pool.directory), [".opaque"]);
  using sqliteJs = await setupSqliteJsWorker();

  assertEqual(await sqliteJs.run("openPool", pool.directory), ["/evolu1.db"]);
  assertEqual(
    await sqliteJs.run("selectObjects", "file:evolu1.db", "SELECT a FROM t"),
    [{ a: "SahPool" }],
  );
  await sqliteJs.run("close", "file:evolu1.db");
  assertEqual(await readSlots(pool.directory), before);

  await sqliteJs.run(
    "exec",
    "file:evolu1.db",
    "INSERT INTO t VALUES ('2.2.4')",
  );
  await sqliteJs.run("close", "file:evolu1.db");
  await sqliteJs.run("pausePool");
  using worker = await setupSqliteWorker();
  assertOk(await worker.run("openPool", pool.directory));
  const database = okOrThrow(
    await worker.run("openDatabase", pool.directory, "/evolu1.db"),
  );
  assertEqual(
    okOrThrow(await worker.run("run", database, "SELECT a FROM t", [])).rows,
    [{ a: "SahPool" }, { a: "2.2.4" }],
  );
});

// Table t of 300 rows whose v is zeroblob(3000), as in repro/crash.html.
const createRowsSql =
  "CREATE TABLE t(id INTEGER PRIMARY KEY, v BLOB); WITH RECURSIVE c(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM c WHERE i < 300) INSERT INTO t(v) SELECT zeroblob(3000) FROM c;";

// Spills the page cache, so the transaction has written pages to the database
// with its journal synced.
const spillSql =
  "PRAGMA cache_size = 10; BEGIN; UPDATE t SET v = randomblob(3000);";

test("a transaction 2.2.4 spilled when its worker was terminated is rolled back by SahPool's first read, with no journal left", async () => {
  await using pool = setupPoolDirectory();
  {
    using sqliteJs = await setupSqliteJsWorker();
    await sqliteJs.run("openPool", pool.directory);
    await sqliteJs.run("exec", "/test.db", `${createRowsSql} ${spillSql}`);
    assertEqual((await sqliteJs.run("getFileNames")).toSorted(), [
      "/test.db",
      "/test.db-journal",
    ]);
    sqliteJs.terminate();
  }
  using worker = await setupSqliteWorker();
  const { vfsName } = okOrThrow(
    await worker.run("openPool", pool.directory, { heldTimeout: "5s" }),
  );
  const t = createConnections(worker, pool.directory, vfsName);
  assertEqual(await t.getPaths(), ["/test.db", "/test.db-journal"]);
  const db = await t.connect();

  assertEqual(await t.snapshot(db), "300:300");

  assertEqual(await t.integrity(db), "ok");
  assertEqual(await t.getPaths(), ["/test.db"]);
  await t.close(db);
});

// 2.2.4's xCheckReservedLock always reports a reserved lock, which SQLite
// fixed on 2026-09-30, so it takes a hot journal for a live one.
test("2.2.4 opens a pool SahPool left with a hot journal when its worker was terminated, wiping no slot, reads the half-written rows and leaves the journal, which SahPool then rolls back", async () => {
  await using pool = setupPoolDirectory();
  {
    using crashed = await setupSqliteWorker();
    const { vfsName } = okOrThrow(
      await crashed.run("openPool", pool.directory),
    );
    const t = createConnections(crashed, pool.directory, vfsName);
    const db = await t.connect();
    assertEqual(await t.exec(`${createRowsSql} ${spillSql}`, db), SQLITE_OK);
    crashed.terminate();
  }
  await waitForReleasedSlots(pool.directory);
  const before = await readSlots(pool.directory);
  using sqliteJs = await setupSqliteJsWorker();

  assertEqual((await sqliteJs.run("openPool", pool.directory)).toSorted(), [
    "/test.db",
    "/test.db-journal",
  ]);
  assertEqual(await readSlots(pool.directory), before);
  const halfWritten = await sqliteJs.run(
    "selectValue",
    "/test.db",
    snapshotSql,
  );
  assertTrue(halfWritten !== "300:300");
  await sqliteJs.run("close", "/test.db");
  assertEqual((await sqliteJs.run("getFileNames")).toSorted(), [
    "/test.db",
    "/test.db-journal",
  ]);
  await sqliteJs.run("pausePool");

  using worker = await setupSqliteWorker();
  const { vfsName } = okOrThrow(await worker.run("openPool", pool.directory));
  const t = createConnections(worker, pool.directory, vfsName);
  const db = await t.connect();
  assertEqual(await t.snapshot(db), "300:300");
  assertEqual(await t.integrity(db), "ok");
  assertEqual(await t.getPaths(), ["/test.db"]);
  await t.close(db);
});

// digest.html: opfs-sahpool before SQLite 3.50 computed every digest as
// [0, 0], and the fix kept such headers valid.
test("a database whose slot has the legacy [0, 0] digest opens in SahPool, which commits to it leaving the header legacy, and in 2.2.4", async () => {
  await using pool = setupPoolDirectory();
  using worker = await setupSqliteWorker();
  assertOk(await worker.run("openPool", pool.directory));
  const created = okOrThrow(
    await worker.run("openDatabase", pool.directory, "/evolu1.db"),
  );
  assertOk(
    await worker.run(
      "exec",
      created,
      "CREATE TABLE t(a); INSERT INTO t VALUES ('legacy')",
    ),
  );
  await worker.run("disposeDatabase", created);
  await worker.run("disposePool", pool.directory);
  const [fileName] = findSlot(await readSlots(pool.directory), "/evolu1.db");
  const legacyHeader = createSlotHeader(
    "/evolu1.db",
    SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE | SQLITE_OPEN_MAIN_DB,
  );
  assertEqual(
    legacyHeader.subarray(
      sahPoolHeaderDigestOffset,
      sahPoolHeaderDigestOffset + 8,
    ),
    new Uint8Array(8),
  );
  await worker.run("writeSlot", pool.directory, fileName, legacyHeader);

  assertOk(await worker.run("openPool", pool.directory));
  const database = okOrThrow(
    await worker.run("openDatabase", pool.directory, "/evolu1.db"),
  );
  assertOk(
    await worker.run("exec", database, "INSERT INTO t VALUES ('SahPool')"),
  );
  assertEqual(
    okOrThrow(await worker.run("run", database, "SELECT a FROM t", [])).rows,
    [{ a: "legacy" }, { a: "SahPool" }],
  );
  await worker.run("disposeDatabase", database);
  await worker.run("disposePool", pool.directory);

  assertEqual(
    (await readSlots(pool.directory))
      .get(fileName)
      ?.subarray(0, sahPoolHeaderSize),
    legacyHeader,
  );
  using sqliteJs = await setupSqliteJsWorker();
  assertEqual(await sqliteJs.run("openPool", pool.directory), ["/evolu1.db"]);
  assertEqual(
    await sqliteJs.run("selectObjects", "/evolu1.db", "SELECT a FROM t"),
    [{ a: "legacy" }, { a: "SahPool" }],
  );
});
