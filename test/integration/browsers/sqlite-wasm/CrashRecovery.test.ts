/**
 * Recovery of `SahPool` databases on real OPFS from the hot journal a worker
 * ended by `Worker.terminate()` left, as closing a tab does, in Chromium,
 * Firefox and WebKit.
 *
 * The scenarios are those of
 * `test/integration/nodejs/sqlite-wasm/CrashRecovery.test.ts`, from Evolu's
 * reproduction for the forum thread b2fbb61642 and wa-sqlite's
 * `test/sql_0004.js` (MIT, Copyright (c) 2023 Roy T. Hashimoto), re-expressed
 * and cited by test. The next worker opens the pool retrying while the ended
 * one still holds its files, because Chromium lets a worker that
 * `Worker.terminate()` ended finish the task it runs, holding its handles, for
 * up to two seconds.
 */

import { assertEqual, assertTrue } from "@evolu/common";
import { test } from "vitest";
import {
  SQLITE_OK,
  SQLITE_OPEN_READONLY,
  SQLITE_READONLY,
  SQLITE_READONLY_ROLLBACK,
} from "../../../../packages/sqlite-wasm/src/Constants.ts";
import type { OpfsName } from "../../../../packages/sqlite-wasm/src/SahPool.ts";
import {
  createConnections,
  okOrThrow,
  setupPoolDirectory,
  setupSqliteWorker,
  snapshotSql,
} from "./_harness.ts";

// Table t of 300 rows whose v is zeroblob(3000), as in repro/crash.html.
const createRowsSql =
  "CREATE TABLE t(id INTEGER PRIMARY KEY, v BLOB); WITH RECURSIVE c(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM c WHERE i < 300) INSERT INTO t(v) SELECT zeroblob(3000) FROM c;";

// Spills the page cache, so the transaction has written pages to the database
// with its journal synced.
const spillSql =
  "PRAGMA cache_size = 10; BEGIN; UPDATE t SET v = randomblob(3000);";

/** Starts a worker that opens the pool, and helpers for its connections. */
const setupPoolWorker = async (directory: OpfsName) => {
  const worker = await setupSqliteWorker();
  const { vfsName } = okOrThrow(
    await worker.run("openPool", directory, { heldTimeout: "5s" }),
  );
  return { ...createConnections(worker, directory, vfsName), worker };
};

/**
 * Runs SQL on a connection to the path in a new worker and terminates the
 * worker without closing anything, as closing its tab does, then starts the
 * next worker on the pool.
 */
const setupAfterCrash = async (
  directory: OpfsName,
  path: string,
  sql: string,
) => {
  const crashed = await setupPoolWorker(directory);
  const db = await crashed.connect(undefined, path);
  assertEqual(await crashed.exec(sql, db), SQLITE_OK);
  crashed.worker.terminate();
  return setupPoolWorker(directory);
};

// repro/crash.html, in normal and exclusive locking mode. Before SQLite's fix
// of 2026-09-30, the next worker read 300 rows, 16 unchanged, and left the
// journal.
test("a transaction that spilled when its worker was terminated is rolled back by the next worker's first read, in normal and exclusive locking mode, with no journal left", async () => {
  for (const lockingMode of ["NORMAL", "EXCLUSIVE"]) {
    await using pool = setupPoolDirectory();
    const t = await setupAfterCrash(
      pool.directory,
      "/test.db",
      `${createRowsSql} PRAGMA locking_mode = ${lockingMode}; ${spillSql}`,
    );
    using _worker = t.worker;
    assertEqual(await t.getPaths(), ["/test.db", "/test.db-journal"]);
    const db = await t.connect();

    assertEqual(await t.snapshot(db), "300:300");

    assertEqual(await t.integrity(db), "ok");
    assertEqual(await t.getPaths(), ["/test.db"]);
    await t.close(db);
  }
});

// repro/crash.html?readonly.
test("after a terminated worker, a read-only connection gets SQLITE_READONLY_ROLLBACK instead of the half-written rows, until a read-write connection rolls the journal back", async () => {
  await using pool = setupPoolDirectory();
  const t = await setupAfterCrash(
    pool.directory,
    "/test.db",
    `${createRowsSql} ${spillSql}`,
  );
  using _worker = t.worker;
  const readOnly = await t.connect(SQLITE_OPEN_READONLY);

  assertEqual(await t.exec(snapshotSql, readOnly), SQLITE_READONLY);
  assertEqual(
    await t.worker.run("extendedErrcode", readOnly),
    SQLITE_READONLY_ROLLBACK,
  );

  assertEqual(await t.getPaths(), ["/test.db", "/test.db-journal"]);
  const readWrite = await t.connect();
  assertEqual(await t.snapshot(readWrite), "300:300");
  assertEqual(await t.getPaths(), ["/test.db"]);
  assertEqual(await t.snapshot(readOnly), "300:300");
  for (const db of [readOnly, readWrite]) await t.close(db);
});

// The semantics review's S3n: with synchronous = OFF, SQLite writes the
// journal's header complete at once, so only xCheckReservedLock tells a reader
// that the journal is live.
test("a reader leaves the complete journal of a transaction with synchronous = OFF alone while it holds RESERVED, and the next worker rolls it back after the first was terminated with it spilled", async () => {
  await using pool = setupPoolDirectory();
  const crashed = await setupPoolWorker(pool.directory);
  const a = await crashed.connect();
  const b = await crashed.connect();
  assertEqual(await crashed.exec(createRowsSql, a), SQLITE_OK);
  assertEqual(
    await crashed.exec(
      "PRAGMA synchronous = OFF; BEGIN; UPDATE t SET v = randomblob(3000) WHERE id <= 2",
      a,
    ),
    SQLITE_OK,
  );
  // The journal's magic number, which a hot journal starts with.
  assertEqual(
    okOrThrow(
      await crashed.worker.run(
        "read",
        pool.directory,
        "/test.db-journal",
        0,
        1,
      ),
    ),
    Uint8Array.of(0xd9),
  );

  assertEqual(await crashed.snapshot(b), "300:300");

  assertEqual(await crashed.getPaths(), ["/test.db", "/test.db-journal"]);
  assertEqual(
    await crashed.exec(
      "PRAGMA cache_size = 10; UPDATE t SET v = randomblob(3000)",
      a,
    ),
    SQLITE_OK,
  );
  crashed.worker.terminate();
  const t = await setupPoolWorker(pool.directory);
  using _worker = t.worker;
  const db = await t.connect();
  assertEqual(await t.snapshot(db), "300:300");
  assertEqual(await t.integrity(db), "ok");
  assertEqual(await t.getPaths(), ["/test.db"]);
  await t.close(db);
});

// wa-sqlite test/sql_0004.js 'should recover after crash'.
test("an uncommitted insert of 10,000 rows with cache_size = 0 is rolled back by the first read after its worker was terminated, and the database takes new rows", async () => {
  await using pool = setupPoolDirectory();
  const t = await setupAfterCrash(
    pool.directory,
    "/demo.db",
    "PRAGMA cache_size = 0; CREATE TABLE t(x); INSERT INTO t VALUES (1), (2), (3); BEGIN; WITH RECURSIVE c(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM c WHERE i < 10000) INSERT INTO t SELECT i FROM c",
  );
  using _worker = t.worker;
  // The pages that reached the database left a hot journal.
  assertEqual(await t.getPaths(), ["/demo.db", "/demo.db-journal"]);
  const db = await t.connect(undefined, "/demo.db");

  assertEqual(await t.selectText("SELECT sum(x) FROM t", db), "6");

  assertEqual(await t.getPaths(), ["/demo.db"]);
  assertEqual(await t.integrity(db), "ok");
  assertEqual(await t.exec("INSERT INTO t VALUES (4), (5)", db), SQLITE_OK);
  assertEqual(await t.selectText("SELECT sum(x) FROM t", db), "15");
  await t.close(db);
});

// Rewrites every row in one transaction that spills, so the rows of a whole
// transaction share their n.
const transactionSql =
  "PRAGMA cache_size = 10; BEGIN; UPDATE t SET v = randomblob(3000), n = n + 1; COMMIT";

// Chromium terminates a worker only once the task it runs ends, or after a
// grace of two seconds (kForcibleTerminationDelay in Blink's worker_thread.cc),
// so the worker commits transactions for longer than that. Each of the five
// crashes therefore takes over two seconds in Chromium, which leaves too little
// of the default 15-second browser timeout on a loaded CI runner.
test(
  "a worker terminated at a random moment while it commits transaction after transaction leaves each transaction whole, the database intact, and no journal once the next worker's transaction commits",
  { timeout: 60_000 },
  async () => {
    await using pool = setupPoolDirectory();
    {
      const setup = await setupPoolWorker(pool.directory);
      using _worker = setup.worker;
      const db = await setup.connect();
      assertEqual(
        await setup.exec(
          "CREATE TABLE t(id INTEGER PRIMARY KEY, v BLOB, n INTEGER NOT NULL DEFAULT 0); WITH RECURSIVE c(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM c WHERE i < 300) INSERT INTO t(v) SELECT zeroblob(3000) FROM c",
          db,
        ),
        SQLITE_OK,
      );
      await setup.close(db);
      await setup.worker.run("disposePool", pool.directory);
    }
    let hotJournals = 0;

    for (let crash = 0; crash < 5; crash++) {
      const writer = await setupPoolWorker(pool.directory);
      const db = await writer.connect();
      const running = writer.worker.run(
        "execSqlFor",
        db,
        transactionSql,
        10_000,
      );
      await new Promise((resolve) => {
        setTimeout(resolve, 50 + Math.random() * 200);
      });
      writer.worker.terminate();
      await running.catch(() => undefined);

      const t = await setupPoolWorker(pool.directory);
      using _worker = t.worker;
      // A hot journal starts with its magic number.
      const journal = await t.worker.run(
        "read",
        pool.directory,
        "/test.db-journal",
        0,
        1,
      );
      if (journal.ok && journal.value[0] === 0xd9) hotJournals++;
      const reader = await t.connect();
      assertEqual(
        await t.selectText(
          "SELECT count(*) || ':' || count(DISTINCT n) FROM t",
          reader,
        ),
        "300:1",
      );
      assertEqual(await t.integrity(reader), "ok");
      // SQLite writes a journal's magic number only when it first syncs the
      // journal, before it writes the database, so a worker terminated before
      // that leaves a journal that is not hot. The read leaves it, and the next
      // commit deletes it.
      assertEqual(
        await t.exec("UPDATE t SET v = randomblob(3000) WHERE id = 1", reader),
        SQLITE_OK,
      );
      assertEqual(await t.getPaths(), ["/test.db"]);
      await t.close(reader);
      await t.worker.run("disposePool", pool.directory);
    }

    assertTrue(hotJournals > 0);
  },
);
