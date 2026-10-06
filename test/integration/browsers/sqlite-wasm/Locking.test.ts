/**
 * The lock table of `SahPool` on real OPFS, with several connections of one
 * worker on one database, in Chromium, Firefox and WebKit.
 *
 * The scenarios are those of
 * `test/integration/nodejs/sqlite-wasm/Locking.test.ts` behind the forum thread
 * b2fbb61642, and of wa-sqlite's `test/sql_0005.js` (MIT, Copyright (c) 2023
 * Roy T. Hashimoto), re-expressed and cited by test. The connections use the C
 * API, because statements left unfinished, read-only connections and result
 * codes are what they test.
 */

import { assertEqual, assertFalse, assertTrue } from "@evolu/common";
import { test } from "vitest";
import {
  SQLITE_BUSY,
  SQLITE_CONSTRAINT,
  SQLITE_OK,
  SQLITE_OPEN_READONLY,
  SQLITE_ROW,
} from "../../../../packages/sqlite-wasm/src/Constants.ts";
import type { SqliteDbPtr } from "../../../../packages/sqlite-wasm/src/Pointer.ts";
import {
  createConnections,
  okOrThrow,
  setupPoolDirectory,
  setupSqliteWorker,
  snapshotSql,
} from "./_harness.ts";

const createRowsSql =
  "CREATE TABLE t(id INTEGER PRIMARY KEY, v BLOB, w INTEGER NOT NULL DEFAULT 0); WITH RECURSIVE c(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM c WHERE i < 300) INSERT INTO t(v) SELECT zeroblob(3000) FROM c";

// Spills its page cache, so the transaction holds EXCLUSIVE and has written
// pages to the database with the journal synced.
const spillSql =
  "PRAGMA cache_size = 10; BEGIN; UPDATE t SET v = randomblob(3000)";

/** A worker with a pool in a directory of its own, and connection helpers. */
const setupConnections = async () => {
  const pool = setupPoolDirectory();
  const worker = await setupSqliteWorker();
  const { vfsName } = okOrThrow(await worker.run("openPool", pool.directory));
  return {
    ...createConnections(worker, pool.directory, vfsName),
    worker,
    directory: pool.directory,
    vfsName,
    [Symbol.asyncDispose]: async () => {
      worker.terminate();
      await pool[Symbol.asyncDispose]();
    },
  };
};

/**
 * Opens `/test.db` with table t of 300 rows whose v is `zeroblob(3000)`, as the
 * scenarios behind the forum thread did, on connection a.
 */
const setupRows = async () => {
  const t = await setupConnections();
  const a = await t.connect();
  assertEqual(await t.exec(createRowsSql, a), SQLITE_OK);
  return { ...t, a };
};

// tester1 13.2 'SAH: a second connection leaves a live journal alone', in the
// variant where SQLITE_BUSY is accepted.
test("connections that open a database whose transaction has spilled get SQLITE_BUSY and leave the live journal alone, so the transaction commits whole, as a new worker reads", async () => {
  await using t = await setupRows();
  const b = await t.connect();
  assertEqual(await t.snapshot(b), "300:300");
  assertEqual(await t.exec(spillSql, t.a), SQLITE_OK);
  assertTrue(await t.hasJournal());

  assertEqual(await t.exec(snapshotSql, b), SQLITE_BUSY);
  const c = await t.connect();
  assertEqual(await t.exec(snapshotSql, c), SQLITE_BUSY);
  await t.close(c);

  assertTrue(await t.hasJournal());
  assertEqual(await t.exec("COMMIT", t.a), SQLITE_OK);
  assertEqual(await t.snapshot(t.a), "300:0");
  assertEqual(await t.integrity(t.a), "ok");
  assertEqual(await t.snapshot(b), "300:0");
  await t.close(b);
  await t.close(t.a);
  await t.worker.run("disposePool", t.directory);
  using next = await setupSqliteWorker();
  const { vfsName } = okOrThrow(await next.run("openPool", t.directory));
  const n = createConnections(next, t.directory, vfsName);
  const db = await n.connect();
  assertEqual(await n.snapshot(db), "300:0");
  assertEqual(await n.integrity(db), "ok");
  assertEqual(await next.run("getPaths", t.directory), ["/test.db"]);
  await n.close(db);
});

test("connections that take turns without overlapping never get SQLITE_BUSY and each reads the other's commits", async () => {
  await using t = await setupRows();
  const b = await t.connect();

  assertEqual(await t.snapshot(b), "300:300");
  assertEqual(
    await t.exec("UPDATE t SET v = randomblob(3000) WHERE id <= 100", b),
    SQLITE_OK,
  );
  assertEqual(await t.snapshot(t.a), "300:200");
  assertEqual(
    await t.exec(
      "BEGIN; UPDATE t SET v = randomblob(3000) WHERE id > 200; COMMIT",
      t.a,
    ),
    SQLITE_OK,
  );

  assertEqual(await t.snapshot(b), "300:100");
  assertEqual(await t.integrity(b), "ok");
  await t.close(b);
  await t.close(t.a);
});

test("a connection reads the committed rows while another holds RESERVED without spilling, and reads its update once it commits", async () => {
  await using t = await setupRows();
  const b = await t.connect();
  assertEqual(
    await t.exec(
      "BEGIN; UPDATE t SET v = randomblob(3000) WHERE id <= 50",
      t.a,
    ),
    SQLITE_OK,
  );

  assertEqual(await t.snapshot(b), "300:300");

  assertEqual(await t.exec("COMMIT", t.a), SQLITE_OK);
  assertEqual(await t.snapshot(b), "300:250");
  await t.close(b);
  await t.close(t.a);
});

test("while a statement of one connection is unfinished, another's autocommit write and COMMIT get SQLITE_BUSY, the statement reads every row unchanged, and the COMMIT then succeeds", async () => {
  await using t = await setupRows();
  const b = await t.connect();
  const cursor = await t.prepare("SELECT v = zeroblob(3000) FROM t", t.a);
  let unchanged = await t.step(cursor, 10);

  assertEqual(
    await t.exec("UPDATE t SET v = randomblob(3000) WHERE id <= 50", b),
    SQLITE_BUSY,
  );
  assertEqual(
    await t.exec("BEGIN; UPDATE t SET v = randomblob(3000) WHERE id <= 50", b),
    SQLITE_OK,
  );
  assertEqual(await t.exec("COMMIT", b), SQLITE_BUSY);

  unchanged += await t.step(cursor);
  assertEqual(unchanged, 300);
  assertEqual(await t.finalize(cursor), SQLITE_OK);
  assertEqual(await t.exec("COMMIT", b), SQLITE_OK);
  assertEqual(await t.snapshot(b), "300:250");
  await t.close(b);
  await t.close(t.a);
});

test("while one connection has a read transaction open, another's write gets SQLITE_BUSY, and succeeds once the transaction ends", async () => {
  await using t = await setupRows();
  const b = await t.connect();
  const update = "UPDATE t SET v = randomblob(3000) WHERE id <= 50";
  assertEqual(await t.exec("BEGIN", t.a), SQLITE_OK);
  assertEqual(await t.snapshot(t.a), "300:300");

  assertEqual(await t.exec(update, b), SQLITE_BUSY);

  assertEqual(await t.snapshot(t.a), "300:300");
  assertEqual(await t.exec("COMMIT", t.a), SQLITE_OK);
  assertEqual(await t.exec(update, b), SQLITE_OK);
  assertEqual(await t.snapshot(t.a), "300:250");
  await t.close(b);
  await t.close(t.a);
});

test("a statement stepped once and left blocks another connection's writes with SQLITE_BUSY until it is finalized", async () => {
  await using t = await setupRows();
  const b = await t.connect();
  const cursor = await t.prepare("SELECT id FROM t", t.a);
  assertEqual(await t.worker.run("stepStatement", cursor), SQLITE_ROW);

  for (let attempt = 0; attempt < 3; attempt++)
    assertEqual(
      await t.exec("UPDATE t SET v = randomblob(3000) WHERE id <= 50", b),
      SQLITE_BUSY,
    );

  assertEqual(await t.finalize(cursor), SQLITE_OK);
  assertEqual(
    await t.exec("UPDATE t SET v = randomblob(3000) WHERE id <= 50", b),
    SQLITE_OK,
  );
  assertEqual(await t.snapshot(t.a), "300:250");
  await t.close(b);
  await t.close(t.a);
});

// Before the lock table, 50 of B's committed rows were reverted.
test("a second writer gets SQLITE_BUSY while the first holds RESERVED, commits after it, and no later write of the first reverts its rows", async () => {
  await using t = await setupRows();
  const b = await t.connect();
  assertEqual(
    await t.exec("BEGIN; UPDATE t SET w = 1 WHERE id <= 100", t.a),
    SQLITE_OK,
  );
  assertEqual(await t.exec("BEGIN", b), SQLITE_OK);

  assertEqual(
    await t.exec("UPDATE t SET w = 2 WHERE id > 200", b),
    SQLITE_BUSY,
  );

  assertEqual(await t.exec("COMMIT", t.a), SQLITE_OK);
  assertEqual(await t.exec("UPDATE t SET w = 2 WHERE id > 200", b), SQLITE_OK);
  assertEqual(await t.exec("COMMIT", b), SQLITE_OK);
  assertEqual(
    await t.exec("UPDATE t SET w = 3 WHERE id <= 10", t.a),
    SQLITE_OK,
  );
  for (const db of [t.a, b])
    assertEqual(
      await t.selectText(
        "SELECT group_concat(w || ':' || n) FROM (SELECT w, count(*) AS n FROM t GROUP BY w ORDER BY w)",
        db,
      ),
      "0:100,1:90,2:100,3:10",
    );
  assertEqual(await t.integrity(b), "ok");
  await t.close(b);
  await t.close(t.a);
});

// Before the lock table, A's 100 committed rows vanished.
test("two connections inserting in overlapping transactions, spilled or not, keep both sets of rows: the second gets SQLITE_BUSY and inserts after the first commits", async () => {
  for (const [rows, pragmas] of [
    [100, ""],
    [300, "PRAGMA cache_size = 10;"],
  ] as const) {
    await using t = await setupRows();
    const b = await t.connect();
    const insert = (w: number) =>
      `INSERT INTO t(v, w) SELECT randomblob(3000), ${w} FROM (WITH RECURSIVE c(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM c WHERE i < ${rows}) SELECT i FROM c)`;
    assertEqual(await t.exec(`${pragmas} BEGIN`, b), SQLITE_OK);
    assertEqual(await t.exec(`${pragmas} BEGIN; ${insert(1)}`, t.a), SQLITE_OK);

    assertEqual(await t.exec(insert(2), b), SQLITE_BUSY);

    assertEqual(await t.exec("COMMIT", t.a), SQLITE_OK);
    assertEqual(await t.exec(insert(2), b), SQLITE_OK);
    assertEqual(await t.exec("COMMIT", b), SQLITE_OK);
    assertEqual(
      await t.selectText(
        "SELECT sum(w = 1) || ':' || sum(w = 2) FROM t",
        await t.connect(),
      ),
      `${rows}:${rows}`,
    );
    assertEqual(await t.integrity(t.a), "ok");
  }
});

// wa-sqlite test/sql_0005.js 'should transact atomically', with a round-robin
// scheduler that runs one statement per turn in place of concurrent workers.
test("eight connections that each increment a counter 32 times in overlapping BEGIN IMMEDIATE transactions, retrying on SQLITE_BUSY, read 256 distinct values up to 256", async () => {
  await using t = await setupConnections();
  const connections: Array<SqliteDbPtr> = [];
  for (let index = 0; index < 8; index++)
    connections.push(await t.connect(undefined, "/demo.db"));
  assertEqual(
    await t.exec(
      "CREATE TABLE counter(n INTEGER); INSERT INTO counter VALUES (0); CREATE TABLE seen(n INTEGER)",
      connections[0],
    ),
    SQLITE_OK,
  );
  const steps = [
    "BEGIN IMMEDIATE",
    "UPDATE counter SET n = n + 1",
    "INSERT INTO seen SELECT n FROM counter",
    "COMMIT",
  ];
  const progress = connections.map((db) => ({ db, increments: 0, step: 0 }));
  let busy = 0;

  for (
    let turn = 0;
    progress.some(({ increments }) => increments < 32);
    turn++
  ) {
    // Without the lock table, two writers would wait on each other forever.
    assertTrue(turn < 10_000);
    for (const connection of progress) {
      if (connection.increments === 32) continue;
      const rc = await t.exec(steps[connection.step], connection.db);
      if (rc === SQLITE_BUSY) {
        busy++;
        continue;
      }
      assertEqual(rc, SQLITE_OK);
      connection.step = (connection.step + 1) % steps.length;
      if (connection.step === 0) connection.increments++;
    }
  }

  assertTrue(busy > 0);
  assertEqual(
    await t.selectText(
      "SELECT count(DISTINCT n) || ':' || max(n) || ':' || count(*) FROM seen",
      connections[0],
    ),
    "256:256:256",
  );
  for (const db of connections) await t.close(db);
});

test("a COMMIT that gets SQLITE_BUSY while another connection reads keeps PENDING, so a new reader gets SQLITE_BUSY, the reader finishes unchanged, and the retried COMMIT succeeds", async () => {
  await using t = await setupRows();
  const b = await t.connect();
  const cursor = await t.prepare("SELECT v = zeroblob(3000) FROM t", t.a);
  let unchanged = await t.step(cursor, 10);
  assertEqual(
    await t.exec("BEGIN; UPDATE t SET v = randomblob(3000)", b),
    SQLITE_OK,
  );

  assertEqual(await t.exec("COMMIT", b), SQLITE_BUSY);

  const c = await t.connect();
  assertEqual(await t.exec(snapshotSql, c), SQLITE_BUSY);
  unchanged += await t.step(cursor);
  assertEqual(unchanged, 300);
  assertEqual(await t.finalize(cursor), SQLITE_OK);
  assertEqual(await t.exec("COMMIT", b), SQLITE_OK);
  assertEqual(await t.snapshot(c), "300:0");
  for (const db of [c, b, t.a]) await t.close(db);
});

test("the PENDING a failed COMMIT keeps is released by its ROLLBACK, or by closing its connection, which discards the transaction", async () => {
  await using t = await setupRows();
  const c = await t.connect();
  const cursor = await t.prepare("SELECT v = zeroblob(3000) FROM t", t.a);
  await t.step(cursor, 10);

  for (const release of ["rollback", "close"] as const) {
    const b = await t.connect();
    assertEqual(
      await t.exec("BEGIN; UPDATE t SET v = randomblob(3000)", b),
      SQLITE_OK,
    );
    assertEqual(await t.exec("COMMIT", b), SQLITE_BUSY);
    assertEqual(await t.exec(snapshotSql, c), SQLITE_BUSY);

    if (release === "rollback")
      assertEqual(await t.exec("ROLLBACK", b), SQLITE_OK);
    await t.close(b);

    assertEqual(await t.snapshot(c), "300:300");
  }
  assertEqual(await t.finalize(cursor), SQLITE_OK);
  assertEqual(
    await t.exec(
      "BEGIN IMMEDIATE; UPDATE t SET v = randomblob(3000) WHERE id <= 10; COMMIT",
      c,
    ),
    SQLITE_OK,
  );
  assertEqual(await t.snapshot(t.a), "300:290");
  await t.close(c);
  await t.close(t.a);
});

test("a read-only connection opened while a transaction has spilled gets SQLITE_BUSY instead of reading its pages, and reads the commit", async () => {
  await using t = await setupRows();
  assertEqual(await t.exec(spillSql, t.a), SQLITE_OK);
  const readOnly = await t.connect(SQLITE_OPEN_READONLY);

  assertEqual(await t.exec(snapshotSql, readOnly), SQLITE_BUSY);

  assertEqual(await t.exec("COMMIT", t.a), SQLITE_OK);
  assertEqual(await t.snapshot(readOnly), "300:0");
  assertEqual(await t.integrity(readOnly), "ok");
  await t.close(readOnly);
  await t.close(t.a);
});

// Before the lock table, rolled-back pages became durable: 300:299.
test("a connection that gets SQLITE_BUSY while a spilled transaction is open reads the rows unchanged after its ROLLBACK, and its own update makes none of the rolled-back pages durable", async () => {
  await using t = await setupRows();
  assertEqual(await t.exec(spillSql, t.a), SQLITE_OK);
  const b = await t.connect();
  assertEqual(await t.exec(snapshotSql, b), SQLITE_BUSY);

  assertEqual(await t.exec("ROLLBACK", t.a), SQLITE_OK);

  assertEqual(await t.snapshot(b), "300:300");
  assertEqual(
    await t.exec("UPDATE t SET v = randomblob(3000) WHERE id = 1", b),
    SQLITE_OK,
  );
  await t.close(b);
  await t.close(t.a);
  const c = await t.connect();
  assertEqual(await t.snapshot(c), "300:299");
  assertEqual(await t.integrity(c), "ok");
  await t.close(c);
});

// Before the lock table, 138 rolled-back rows stayed.
test("a spilled transaction left open by a failed statement blocks other connections with SQLITE_BUSY until its ROLLBACK, after which none of its changes remain", async () => {
  await using t = await setupRows();
  const b = await t.connect();
  assertEqual(await t.exec(spillSql, t.a), SQLITE_OK);
  assertEqual(
    await t.exec("INSERT INTO t(id, v) VALUES (1, zeroblob(3000))", t.a),
    SQLITE_CONSTRAINT,
  );
  assertFalse(await t.worker.run("isAutocommit", t.a));

  assertEqual(await t.exec(snapshotSql, b), SQLITE_BUSY);
  assertEqual(await t.exec("UPDATE t SET w = 1 WHERE id = 1", b), SQLITE_BUSY);

  assertEqual(await t.exec("ROLLBACK", t.a), SQLITE_OK);
  assertEqual(await t.snapshot(b), "300:300");
  assertEqual(await t.exec("UPDATE t SET w = 1 WHERE id = 1", b), SQLITE_OK);
  assertEqual(await t.integrity(b), "ok");
  await t.close(b);
  await t.close(t.a);
});

// SQLite's no-op xSleep fix (cdbfe6a938): a busy timeout cannot resolve a
// conflict between connections of one thread, so it must not freeze it.
test("with a busy timeout of 3 or 10 seconds, BEGIN IMMEDIATE and an autocommit INSERT during another connection's RESERVED return SQLITE_BUSY at once", async () => {
  await using t = await setupRows();
  const b = await t.connect();

  for (const timeout of [3000, 10_000]) {
    assertEqual(await t.exec(`PRAGMA busy_timeout = ${timeout}`, b), SQLITE_OK);
    assertEqual(
      await t.exec("BEGIN; UPDATE t SET w = 1 WHERE id <= 10", t.a),
      SQLITE_OK,
    );
    const start = performance.now();

    assertEqual(await t.exec("BEGIN IMMEDIATE", b), SQLITE_BUSY);
    assertEqual(await t.exec("INSERT INTO t(v) VALUES (1)", b), SQLITE_BUSY);

    // The time includes two round trips to the worker, which a loaded runner
    // can delay, while a busy handler that sleeps takes the whole timeout.
    assertTrue(performance.now() - start < 1500);
    assertEqual(await t.exec("ROLLBACK", t.a), SQLITE_OK);
  }
  await t.close(b);
  await t.close(t.a);
});

test("while a connection in exclusive locking mode stays open after a write, another connection's read gets SQLITE_BUSY instead of stale rows, and reads the write once it closes", async () => {
  await using t = await setupRows();
  const b = await t.connect();
  assertEqual(await t.snapshot(b), "300:300");
  assertEqual(
    await t.exec(
      "PRAGMA locking_mode = EXCLUSIVE; UPDATE t SET v = randomblob(3000) WHERE id <= 10",
      t.a,
    ),
    SQLITE_OK,
  );

  assertEqual(await t.exec(snapshotSql, b), SQLITE_BUSY);

  await t.close(t.a);
  assertEqual(await t.snapshot(b), "300:290");
  await t.close(b);
});

test("a connection that attaches its own database and writes both schemas in one transaction gets SQLITE_BUSY, as native SQLite does, and rolls back intact", async () => {
  await using t = await setupRows();
  assertEqual(
    await t.exec(
      "ATTACH '/test.db' AS self; BEGIN; UPDATE main.t SET w = 1 WHERE id = 1",
      t.a,
    ),
    SQLITE_OK,
  );

  assertEqual(
    await t.exec("UPDATE self.t SET w = 2 WHERE id = 2", t.a),
    SQLITE_BUSY,
  );

  assertEqual(await t.exec("ROLLBACK", t.a), SQLITE_OK);
  assertEqual(await t.selectText("SELECT sum(w) FROM t", t.a), "0");
  assertEqual(await t.integrity(t.a), "ok");
  await t.close(t.a);
});

test("a connection closed with sqlite3_close_v2 while its statement is unfinished keeps SHARED, so another connection's write gets SQLITE_BUSY until the statement is finalized", async () => {
  await using t = await setupRows();
  const b = await t.connect();
  const cursor = await t.prepare("SELECT id FROM t", b);
  assertEqual(await t.worker.run("stepStatement", cursor), SQLITE_ROW);
  await t.close(b);

  assertEqual(await t.exec("UPDATE t SET w = 1", t.a), SQLITE_BUSY);

  assertEqual(await t.finalize(cursor), SQLITE_OK);
  assertEqual(await t.exec("UPDATE t SET w = 1", t.a), SQLITE_OK);
  await t.close(t.a);
});

test("each pool has its own lock table, so EXCLUSIVE on a path in one pool makes no write to the same path in another pool SQLITE_BUSY", async () => {
  // Removed after the worker that holds it ends.
  await using other = setupPoolDirectory();
  await using t = await setupConnections();
  const { vfsName } = okOrThrow(
    await t.worker.run("openPool", other.directory),
  );
  const o = createConnections(t.worker, other.directory, vfsName);
  const a1 = await t.connect(undefined, "/evolu1.db");
  const a2 = await t.connect(undefined, "/evolu1.db");
  const b1 = await o.connect(undefined, "/evolu1.db");
  assertEqual(await t.exec("CREATE TABLE t(a)", a1), SQLITE_OK);
  assertEqual(await t.exec("BEGIN EXCLUSIVE", a1), SQLITE_OK);
  assertEqual(await t.exec("SELECT * FROM t", a2), SQLITE_BUSY);

  assertEqual(
    await o.exec("CREATE TABLE t(a); INSERT INTO t VALUES (1)", b1),
    SQLITE_OK,
  );

  assertEqual(await o.selectText("SELECT count(*) FROM t", b1), "1");
  assertEqual(await t.exec("COMMIT", a1), SQLITE_OK);
  for (const db of [a1, a2, b1]) await t.close(db);
});
