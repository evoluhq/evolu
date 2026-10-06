/**
 * The lock table of `SahPool` on the pinned binary, over a fake OPFS.
 *
 * The first tests drive `xLock`, `xUnlock` and `xCheckReservedLock` directly on
 * files of one path, with the transitions of `unixLock` and `posixUnlock` in
 * SQLite's `os_unix.c` (public domain) and the scenarios of wa-sqlite's
 * `test/WebLocksMixin.test.js` (MIT, Copyright (c) 2023 Roy T. Hashimoto),
 * re-expressed and cited by test. The rest open several connections of one
 * worker on one database, as the scenarios behind the forum thread b2fbb61642
 * and wa-sqlite's `test/sql_0005.js` (same license) did.
 */

import {
  assertEqual,
  assertFalse,
  assertTrue,
  getOrThrow,
} from "@evolu/common";
import { test } from "node:test";
import {
  sqlite3_close_v2,
  sqlite3_column_int,
  sqlite3_extended_errcode,
  sqlite3_finalize,
  sqlite3_get_autocommit,
  sqlite3_step,
} from "../../../../packages/sqlite-wasm/src/CApi.ts";
import {
  SQLITE_BUSY,
  SQLITE_CONSTRAINT,
  SQLITE_DONE,
  SQLITE_FULL,
  SQLITE_IOERR,
  SQLITE_IOERR_LOCK,
  SQLITE_IOERR_UNLOCK,
  SQLITE_LOCK_EXCLUSIVE,
  SQLITE_LOCK_NONE,
  SQLITE_LOCK_RESERVED,
  SQLITE_LOCK_SHARED,
  SQLITE_OK,
  SQLITE_OPEN_CREATE,
  SQLITE_OPEN_MAIN_DB,
  SQLITE_OPEN_READONLY,
  SQLITE_OPEN_READWRITE,
  SQLITE_ROW,
} from "../../../../packages/sqlite-wasm/src/Constants.ts";
import { allocWasm } from "../../../../packages/sqlite-wasm/src/Memory.ts";
import type {
  SqliteDbPtr,
  SqliteFilePtr,
  SqliteStmtPtr,
} from "../../../../packages/sqlite-wasm/src/Pointer.ts";
import {
  OpfsName,
  sahPoolHeaderSize,
} from "../../../../packages/sqlite-wasm/src/SahPool.ts";
import { createQuotaExceededError } from "./_fakeOpfs.ts";
import { setupSahPool, type TestSahPool } from "./_sahPool.ts";

/**
 * Opens files on one path through `xOpen`, each as a connection of its own
 * would, with helpers that call their lock methods.
 */
const setupLockFiles = (t: TestSahPool, count: number, path = "/test.db") => {
  const pResOut = getOrThrow(allocWasm(t)(4));
  const files = Array.from({ length: count }, () => {
    const { rc, pFile } = t.openFile(
      path,
      SQLITE_OPEN_CREATE | SQLITE_OPEN_READWRITE | SQLITE_OPEN_MAIN_DB,
    );
    assertEqual(rc, SQLITE_OK);
    return pFile;
  });
  return {
    files,
    lock: (pFile: SqliteFilePtr, level: number) =>
      t.callIo(pFile, "xLock", level),
    unlock: (pFile: SqliteFilePtr, level: number) =>
      t.callIo(pFile, "xUnlock", level),
    /** What each file's `xCheckReservedLock` reports, which must succeed. */
    reserved: (pFiles: ReadonlyArray<SqliteFilePtr> = files) =>
      pFiles.map((pFile) => {
        assertEqual(t.callIo(pFile, "xCheckReservedLock", pResOut), SQLITE_OK);
        return t.readPtr(pResOut);
      }),
  };
};

// wa-sqlite test/WebLocksMixin.test.js 'should make normal lock transitions',
// 'should make recovery lock transitions' and 'should ignore repeated state
// requests', and unixCheckReservedLock in os_unix.c.
test("xLock takes SHARED, RESERVED and EXCLUSIVE, or EXCLUSIVE right after SHARED, a level at or below the file's does nothing, xUnlock goes down to SHARED and NONE, and xCheckReservedLock of every file on the path reports whether one holds more than SHARED", async () => {
  const t = await setupSahPool();
  const { files, lock, unlock, reserved } = setupLockFiles(t, 2);
  const [a] = files;

  for (const levels of [
    [SQLITE_LOCK_SHARED, SQLITE_LOCK_RESERVED, SQLITE_LOCK_EXCLUSIVE],
    // A hot journal's rollback skips RESERVED.
    [SQLITE_LOCK_SHARED, SQLITE_LOCK_EXCLUSIVE],
  ]) {
    assertEqual(reserved(), [0, 0]);
    for (const level of levels) {
      assertEqual(lock(a, level), SQLITE_OK);
      assertEqual(lock(a, level), SQLITE_OK);
      assertEqual(reserved(), level === SQLITE_LOCK_SHARED ? [0, 0] : [1, 1]);
    }
    // Lower levels change nothing.
    assertEqual(lock(a, SQLITE_LOCK_SHARED), SQLITE_OK);
    assertEqual(lock(a, SQLITE_LOCK_RESERVED), SQLITE_OK);
    assertEqual(reserved(), [1, 1]);

    for (const level of [SQLITE_LOCK_SHARED, SQLITE_LOCK_NONE]) {
      assertEqual(unlock(a, level), SQLITE_OK);
      assertEqual(unlock(a, level), SQLITE_OK);
      assertEqual(reserved(), [0, 0]);
    }
  }
});

// wa-sqlite test/WebLocksMixin.test.js 'should allow multiple SHARED
// connections', 'should allow SHARED and RESERVED connections', 'should return
// BUSY on RESERVED deadlock' and 'should block SHARED until EXCLUSIVE
// connection is released', with unixLock's SQLITE_BUSY in place of waiting.
test("files on one path share SHARED, and SHARED beside RESERVED, but a second RESERVED, SHARED beside EXCLUSIVE, and EXCLUSIVE beside another SHARED return SQLITE_BUSY, and a failed SHARED-to-EXCLUSIVE leaves no PENDING", async () => {
  const t = await setupSahPool();
  const {
    files: [a, b, c],
    lock,
    unlock,
    reserved,
  } = setupLockFiles(t, 3);

  assertEqual(lock(a, SQLITE_LOCK_SHARED), SQLITE_OK);
  assertEqual(lock(b, SQLITE_LOCK_SHARED), SQLITE_OK);
  assertEqual(lock(a, SQLITE_LOCK_RESERVED), SQLITE_OK);
  assertEqual(lock(b, SQLITE_LOCK_RESERVED), SQLITE_BUSY);
  assertEqual(lock(c, SQLITE_LOCK_SHARED), SQLITE_OK);
  assertEqual(reserved(), [1, 1, 1]);

  assertEqual(unlock(a, SQLITE_LOCK_SHARED), SQLITE_OK);
  assertEqual(unlock(c, SQLITE_LOCK_NONE), SQLITE_OK);
  // As a hot journal's rollback asks, which takes no PENDING.
  assertEqual(lock(a, SQLITE_LOCK_EXCLUSIVE), SQLITE_BUSY);
  assertEqual(reserved(), [0, 0, 0]);
  assertEqual(lock(c, SQLITE_LOCK_SHARED), SQLITE_OK);
  assertEqual(unlock(b, SQLITE_LOCK_NONE), SQLITE_OK);
  assertEqual(unlock(c, SQLITE_LOCK_NONE), SQLITE_OK);

  assertEqual(lock(a, SQLITE_LOCK_EXCLUSIVE), SQLITE_OK);
  assertEqual(lock(b, SQLITE_LOCK_SHARED), SQLITE_BUSY);
  assertEqual(lock(c, SQLITE_LOCK_SHARED), SQLITE_BUSY);
  assertEqual(reserved(), [1, 1, 1]);
  assertEqual(unlock(a, SQLITE_LOCK_NONE), SQLITE_OK);
  assertEqual(lock(b, SQLITE_LOCK_SHARED), SQLITE_OK);
  assertEqual(lock(b, SQLITE_LOCK_RESERVED), SQLITE_OK);
});

// wa-sqlite test/WebLocksMixin.test.js 'should block EXCLUSIVE until SHARED
// connections are released', with unixLock's PENDING lock.
test("a failed step from RESERVED to EXCLUSIVE leaves PENDING, which xCheckReservedLock reports and which admits no new SHARED lock, until the retry takes EXCLUSIVE once the other SHARED lock is gone, or xUnlock to SHARED releases it", async () => {
  const t = await setupSahPool();
  const {
    files: [a, b, c],
    lock,
    unlock,
    reserved,
  } = setupLockFiles(t, 3);
  assertEqual(lock(a, SQLITE_LOCK_SHARED), SQLITE_OK);
  assertEqual(lock(b, SQLITE_LOCK_SHARED), SQLITE_OK);
  assertEqual(lock(a, SQLITE_LOCK_RESERVED), SQLITE_OK);

  assertEqual(lock(a, SQLITE_LOCK_EXCLUSIVE), SQLITE_BUSY);

  assertEqual(reserved(), [1, 1, 1]);
  assertEqual(lock(c, SQLITE_LOCK_SHARED), SQLITE_BUSY);
  assertEqual(lock(b, SQLITE_LOCK_RESERVED), SQLITE_BUSY);
  assertEqual(lock(a, SQLITE_LOCK_EXCLUSIVE), SQLITE_BUSY);
  assertEqual(unlock(b, SQLITE_LOCK_NONE), SQLITE_OK);
  assertEqual(lock(c, SQLITE_LOCK_SHARED), SQLITE_BUSY);
  assertEqual(lock(a, SQLITE_LOCK_EXCLUSIVE), SQLITE_OK);
  assertEqual(lock(c, SQLITE_LOCK_SHARED), SQLITE_BUSY);
  assertEqual(unlock(a, SQLITE_LOCK_SHARED), SQLITE_OK);
  assertEqual(reserved(), [0, 0, 0]);
  assertEqual(lock(c, SQLITE_LOCK_SHARED), SQLITE_OK);

  // A rollback releases PENDING.
  assertEqual(lock(a, SQLITE_LOCK_RESERVED), SQLITE_OK);
  assertEqual(lock(a, SQLITE_LOCK_EXCLUSIVE), SQLITE_BUSY);
  assertEqual(lock(b, SQLITE_LOCK_SHARED), SQLITE_BUSY);
  assertEqual(unlock(a, SQLITE_LOCK_SHARED), SQLITE_OK);
  assertEqual(reserved(), [0, 0, 0]);
  assertEqual(lock(b, SQLITE_LOCK_SHARED), SQLITE_OK);
  assertEqual(lock(b, SQLITE_LOCK_RESERVED), SQLITE_OK);
});

// posixUnlock in os_unix.c returns at once when the file holds no more than the
// requested level; wa-sqlite's sweep: SQLite calls xUnlock without a prior
// xLock.
test("xUnlock of a file that holds no more than the requested level changes nothing, so another file's SHARED lock still makes EXCLUSIVE SQLITE_BUSY", async () => {
  const t = await setupSahPool();
  const {
    files: [a, b, c],
    lock,
    unlock,
  } = setupLockFiles(t, 3);
  assertEqual(lock(b, SQLITE_LOCK_SHARED), SQLITE_OK);
  assertEqual(lock(c, SQLITE_LOCK_SHARED), SQLITE_OK);

  assertEqual(unlock(a, SQLITE_LOCK_NONE), SQLITE_OK);
  assertEqual(unlock(b, SQLITE_LOCK_SHARED), SQLITE_OK);

  assertEqual(lock(c, SQLITE_LOCK_EXCLUSIVE), SQLITE_BUSY);
  assertEqual(unlock(b, SQLITE_LOCK_NONE), SQLITE_OK);
  assertEqual(unlock(b, SQLITE_LOCK_NONE), SQLITE_OK);
  assertEqual(lock(a, SQLITE_LOCK_SHARED), SQLITE_OK);
  assertEqual(lock(c, SQLITE_LOCK_EXCLUSIVE), SQLITE_BUSY);
  assertEqual(unlock(a, SQLITE_LOCK_NONE), SQLITE_OK);
  assertEqual(lock(c, SQLITE_LOCK_EXCLUSIVE), SQLITE_OK);
});

// unixClose in os_unix.c, and opfs-sahpool's xClose, unlock the file first.
test("xClose releases the file's lock, EXCLUSIVE or SHARED, so another file then takes SHARED and EXCLUSIVE", async () => {
  const t = await setupSahPool();
  const {
    files: [a, b, c],
    lock,
    reserved,
  } = setupLockFiles(t, 3);
  for (const level of [
    SQLITE_LOCK_SHARED,
    SQLITE_LOCK_RESERVED,
    SQLITE_LOCK_EXCLUSIVE,
  ])
    assertEqual(lock(a, level), SQLITE_OK);
  assertEqual(lock(c, SQLITE_LOCK_SHARED), SQLITE_BUSY);

  assertEqual(t.callIo(a, "xClose"), SQLITE_OK);

  assertEqual(reserved([b, c]), [0, 0]);
  assertEqual(lock(c, SQLITE_LOCK_SHARED), SQLITE_OK);
  assertEqual(lock(b, SQLITE_LOCK_SHARED), SQLITE_OK);
  assertEqual(t.callIo(c, "xClose"), SQLITE_OK);
  assertEqual(lock(b, SQLITE_LOCK_EXCLUSIVE), SQLITE_OK);
});

test("each pool has its own lock table, so EXCLUSIVE on a path in one pool makes no write to the same path in another pool SQLITE_BUSY", async () => {
  const t = await setupSahPool({ directory: [OpfsName.orThrow(".a")] });
  const b = getOrThrow(await t.openPool([OpfsName.orThrow(".b")]));
  const { db: a1 } = t.openDatabase("/evolu1.db");
  const { db: a2 } = t.openDatabase("/evolu1.db");
  const { db: b1 } = t.openDatabase("/evolu1.db", { vfsName: b.vfsName });
  assertEqual(t.exec("CREATE TABLE t(a)", a1), SQLITE_OK);
  assertEqual(t.exec("BEGIN EXCLUSIVE", a1), SQLITE_OK);
  assertEqual(t.exec("SELECT * FROM t", a2), SQLITE_BUSY);

  assertEqual(
    t.exec("CREATE TABLE t(a); INSERT INTO t VALUES (1)", b1),
    SQLITE_OK,
  );

  assertEqual(t.selectText("SELECT count(*) FROM t", b1), "1");
  assertEqual(t.exec("COMMIT", a1), SQLITE_OK);
  for (const db of [a1, a2, b1])
    assertEqual(sqlite3_close_v2(t)(db), SQLITE_OK);
});

/**
 * Opens `/test.db` with table t of 300 rows whose v is `zeroblob(3000)`, as the
 * scenarios behind the forum thread did, with helpers for more connections.
 */
const setupRows = async () => {
  const t = await setupSahPool();
  const connect = (flags?: number) => {
    const { rc, db } = t.openDatabase(
      "/test.db",
      flags == null ? {} : { flags },
    );
    assertEqual(rc, SQLITE_OK);
    return db;
  };
  const a = connect();
  assertEqual(
    t.exec(
      "CREATE TABLE t(id INTEGER PRIMARY KEY, v BLOB, w INTEGER NOT NULL DEFAULT 0); WITH RECURSIVE c(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM c WHERE i < 300) INSERT INTO t(v) SELECT zeroblob(3000) FROM c",
      a,
    ),
    SQLITE_OK,
  );
  return {
    ...t,
    a,
    connect,
    /** The rows and how many of them are unchanged, such as `300:300`. */
    snapshot: (db: SqliteDbPtr) => t.selectText(snapshotSql, db),
    integrity: (db: SqliteDbPtr) => t.selectText("PRAGMA integrity_check", db),
    hasJournal: () => t.pool.getPaths().includes("/test.db-journal"),
    close: (db: SqliteDbPtr) => {
      assertEqual(sqlite3_close_v2(t)(db), SQLITE_OK);
    },
    /**
     * Steps a statement up to the given number of rows, or to its end, and
     * returns how many of them have 1 in the first column.
     */
    step: (stmt: SqliteStmtPtr, rows = Infinity) => {
      let ones = 0;
      for (let row = 0; row < rows; row++) {
        const rc = sqlite3_step(t)(stmt);
        if (rc === SQLITE_DONE && rows === Infinity) break;
        assertEqual(rc, SQLITE_ROW);
        ones += sqlite3_column_int(t)(stmt, 0);
      }
      return ones;
    },
  };
};

const snapshotSql = "SELECT count(*) || ':' || sum(v = zeroblob(3000)) FROM t";

// Spills its page cache, so the transaction holds EXCLUSIVE and has written
// pages to the database with the journal synced.
const spillSql =
  "PRAGMA cache_size = 10; BEGIN; UPDATE t SET v = randomblob(3000)";

// tester1 13.2 'SAH: a second connection leaves a live journal alone', in the
// variant where SQLITE_BUSY is accepted.
test("connections that open a database whose transaction has spilled get SQLITE_BUSY and leave the live journal alone, so the transaction commits whole", async () => {
  const t = await setupRows();
  const b = t.connect();
  assertEqual(t.snapshot(b), "300:300");
  assertEqual(t.exec(spillSql, t.a), SQLITE_OK);
  assertTrue(t.hasJournal());

  assertEqual(t.exec(snapshotSql, b), SQLITE_BUSY);
  const c = t.connect();
  assertEqual(t.exec(snapshotSql, c), SQLITE_BUSY);
  t.close(c);

  assertTrue(t.hasJournal());
  assertEqual(t.exec("COMMIT", t.a), SQLITE_OK);
  assertEqual(t.snapshot(t.a), "300:0");
  assertEqual(t.integrity(t.a), "ok");
  assertEqual(t.snapshot(b), "300:0");
  t.close(b);
  t.close(t.a);
  t.pool[Symbol.dispose]();
  const next = await setupSahPool({ fake: t.fake });
  const { db } = next.openDatabase("/test.db");
  assertEqual(next.selectText(snapshotSql, db), "300:0");
  assertEqual(next.selectText("PRAGMA integrity_check", db), "ok");
  assertEqual(next.pool.getPaths(), ["/test.db"]);
  assertEqual(sqlite3_close_v2(next)(db), SQLITE_OK);
});

test("connections that take turns without overlapping never get SQLITE_BUSY and each reads the other's commits", async () => {
  const t = await setupRows();
  const b = t.connect();

  assertEqual(t.snapshot(b), "300:300");
  assertEqual(
    t.exec("UPDATE t SET v = randomblob(3000) WHERE id <= 100", b),
    SQLITE_OK,
  );
  assertEqual(t.snapshot(t.a), "300:200");
  assertEqual(
    t.exec(
      "BEGIN; UPDATE t SET v = randomblob(3000) WHERE id > 200; COMMIT",
      t.a,
    ),
    SQLITE_OK,
  );

  assertEqual(t.snapshot(b), "300:100");
  assertEqual(t.integrity(b), "ok");
  t.close(b);
  t.close(t.a);
});

test("a connection reads the committed rows while another holds RESERVED without spilling, and reads its update once it commits", async () => {
  const t = await setupRows();
  const b = t.connect();
  assertEqual(
    t.exec("BEGIN; UPDATE t SET v = randomblob(3000) WHERE id <= 50", t.a),
    SQLITE_OK,
  );

  assertEqual(t.snapshot(b), "300:300");

  assertEqual(t.exec("COMMIT", t.a), SQLITE_OK);
  assertEqual(t.snapshot(b), "300:250");
  t.close(b);
  t.close(t.a);
});

test("while a statement of one connection is unfinished, another's autocommit write and COMMIT get SQLITE_BUSY, the statement reads every row unchanged, and the COMMIT then succeeds", async () => {
  const t = await setupRows();
  const b = t.connect();
  const cursor = t.prepare("SELECT v = zeroblob(3000) FROM t", t.a);
  let unchanged = t.step(cursor, 10);

  assertEqual(
    t.exec("UPDATE t SET v = randomblob(3000) WHERE id <= 50", b),
    SQLITE_BUSY,
  );
  assertEqual(
    t.exec("BEGIN; UPDATE t SET v = randomblob(3000) WHERE id <= 50", b),
    SQLITE_OK,
  );
  assertEqual(t.exec("COMMIT", b), SQLITE_BUSY);

  unchanged += t.step(cursor);
  assertEqual(unchanged, 300);
  assertEqual(sqlite3_finalize(t)(cursor), SQLITE_OK);
  assertEqual(t.exec("COMMIT", b), SQLITE_OK);
  assertEqual(t.snapshot(b), "300:250");
  t.close(b);
  t.close(t.a);
});

test("while one connection has a read transaction open, another's write gets SQLITE_BUSY, and succeeds once the transaction ends", async () => {
  const t = await setupRows();
  const b = t.connect();
  const update = "UPDATE t SET v = randomblob(3000) WHERE id <= 50";
  assertEqual(t.exec("BEGIN", t.a), SQLITE_OK);
  assertEqual(t.snapshot(t.a), "300:300");

  assertEqual(t.exec(update, b), SQLITE_BUSY);

  assertEqual(t.snapshot(t.a), "300:300");
  assertEqual(t.exec("COMMIT", t.a), SQLITE_OK);
  assertEqual(t.exec(update, b), SQLITE_OK);
  assertEqual(t.snapshot(t.a), "300:250");
  t.close(b);
  t.close(t.a);
});

test("a statement stepped once and left blocks another connection's writes with SQLITE_BUSY until it is finalized", async () => {
  const t = await setupRows();
  const b = t.connect();
  const cursor = t.prepare("SELECT id FROM t", t.a);
  assertEqual(sqlite3_step(t)(cursor), SQLITE_ROW);

  for (let attempt = 0; attempt < 3; attempt++)
    assertEqual(
      t.exec("UPDATE t SET v = randomblob(3000) WHERE id <= 50", b),
      SQLITE_BUSY,
    );

  assertEqual(sqlite3_finalize(t)(cursor), SQLITE_OK);
  assertEqual(
    t.exec("UPDATE t SET v = randomblob(3000) WHERE id <= 50", b),
    SQLITE_OK,
  );
  assertEqual(t.snapshot(t.a), "300:250");
  t.close(b);
  t.close(t.a);
});

// Before the lock table, 50 of B's committed rows were reverted.
test("a second writer gets SQLITE_BUSY while the first holds RESERVED, commits after it, and no later write of the first reverts its rows", async () => {
  const t = await setupRows();
  const b = t.connect();
  assertEqual(
    t.exec("BEGIN; UPDATE t SET w = 1 WHERE id <= 100", t.a),
    SQLITE_OK,
  );
  assertEqual(t.exec("BEGIN", b), SQLITE_OK);

  assertEqual(t.exec("UPDATE t SET w = 2 WHERE id > 200", b), SQLITE_BUSY);

  assertEqual(t.exec("COMMIT", t.a), SQLITE_OK);
  assertEqual(t.exec("UPDATE t SET w = 2 WHERE id > 200", b), SQLITE_OK);
  assertEqual(t.exec("COMMIT", b), SQLITE_OK);
  assertEqual(t.exec("UPDATE t SET w = 3 WHERE id <= 10", t.a), SQLITE_OK);
  for (const db of [t.a, b])
    assertEqual(
      t.selectText(
        "SELECT group_concat(w || ':' || n) FROM (SELECT w, count(*) AS n FROM t GROUP BY w ORDER BY w)",
        db,
      ),
      "0:100,1:90,2:100,3:10",
    );
  assertEqual(t.integrity(b), "ok");
  t.close(b);
  t.close(t.a);
});

// Before the lock table, A's 100 committed rows vanished.
test("two connections inserting in overlapping transactions, spilled or not, keep both sets of rows: the second gets SQLITE_BUSY and inserts after the first commits", async () => {
  for (const [rows, pragmas] of [
    [100, ""],
    [300, "PRAGMA cache_size = 10;"],
  ] as const) {
    const t = await setupRows();
    const b = t.connect();
    const insert = (w: number) =>
      `INSERT INTO t(v, w) SELECT randomblob(3000), ${w} FROM (WITH RECURSIVE c(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM c WHERE i < ${rows}) SELECT i FROM c)`;
    assertEqual(t.exec(`${pragmas} BEGIN`, b), SQLITE_OK);
    assertEqual(t.exec(`${pragmas} BEGIN; ${insert(1)}`, t.a), SQLITE_OK);

    assertEqual(t.exec(insert(2), b), SQLITE_BUSY);

    assertEqual(t.exec("COMMIT", t.a), SQLITE_OK);
    assertEqual(t.exec(insert(2), b), SQLITE_OK);
    assertEqual(t.exec("COMMIT", b), SQLITE_OK);
    assertEqual(
      t.selectText(
        "SELECT sum(w = 1) || ':' || sum(w = 2) FROM t",
        t.connect(),
      ),
      `${rows}:${rows}`,
    );
    assertEqual(t.integrity(t.a), "ok");
  }
});

// wa-sqlite test/sql_0005.js 'should transact atomically', with a round-robin
// scheduler that runs one statement per turn in place of concurrent workers.
test("eight connections that each increment a counter 32 times in overlapping BEGIN IMMEDIATE transactions, retrying on SQLITE_BUSY, read 256 distinct values up to 256", async () => {
  const t = await setupSahPool();
  const connections = Array.from({ length: 8 }, () => {
    const { rc, db } = t.openDatabase("/demo.db");
    assertEqual(rc, SQLITE_OK);
    return db;
  });
  assertEqual(
    t.exec(
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
      const rc = t.exec(steps[connection.step], connection.db);
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
    t.selectText(
      "SELECT count(DISTINCT n) || ':' || max(n) || ':' || count(*) FROM seen",
      connections[0],
    ),
    "256:256:256",
  );
  for (const db of connections) assertEqual(sqlite3_close_v2(t)(db), SQLITE_OK);
});

test("a COMMIT that gets SQLITE_BUSY while another connection reads keeps PENDING, so a new reader gets SQLITE_BUSY, the reader finishes unchanged, and the retried COMMIT succeeds", async () => {
  const t = await setupRows();
  const b = t.connect();
  const cursor = t.prepare("SELECT v = zeroblob(3000) FROM t", t.a);
  let unchanged = t.step(cursor, 10);
  assertEqual(t.exec("BEGIN; UPDATE t SET v = randomblob(3000)", b), SQLITE_OK);

  assertEqual(t.exec("COMMIT", b), SQLITE_BUSY);

  const c = t.connect();
  assertEqual(t.exec(snapshotSql, c), SQLITE_BUSY);
  unchanged += t.step(cursor);
  assertEqual(unchanged, 300);
  assertEqual(sqlite3_finalize(t)(cursor), SQLITE_OK);
  assertEqual(t.exec("COMMIT", b), SQLITE_OK);
  assertEqual(t.snapshot(c), "300:0");
  for (const db of [c, b, t.a]) t.close(db);
});

test("the PENDING a failed COMMIT keeps is released by its ROLLBACK, or by closing its connection, which discards the transaction", async () => {
  const t = await setupRows();
  const c = t.connect();
  const cursor = t.prepare("SELECT v = zeroblob(3000) FROM t", t.a);
  t.step(cursor, 10);

  for (const release of ["rollback", "close"] as const) {
    const b = t.connect();
    assertEqual(
      t.exec("BEGIN; UPDATE t SET v = randomblob(3000)", b),
      SQLITE_OK,
    );
    assertEqual(t.exec("COMMIT", b), SQLITE_BUSY);
    assertEqual(t.exec(snapshotSql, c), SQLITE_BUSY);

    if (release === "rollback") {
      assertEqual(t.exec("ROLLBACK", b), SQLITE_OK);
      t.close(b);
    } else t.close(b);

    assertEqual(t.snapshot(c), "300:300");
  }
  assertEqual(sqlite3_finalize(t)(cursor), SQLITE_OK);
  assertEqual(
    t.exec(
      "BEGIN IMMEDIATE; UPDATE t SET v = randomblob(3000) WHERE id <= 10; COMMIT",
      c,
    ),
    SQLITE_OK,
  );
  assertEqual(t.snapshot(t.a), "300:290");
  t.close(c);
  t.close(t.a);
});

test("a read-only connection opened while a transaction has spilled gets SQLITE_BUSY instead of reading its pages, and reads the commit", async () => {
  const t = await setupRows();
  assertEqual(t.exec(spillSql, t.a), SQLITE_OK);
  const readOnly = t.connect(SQLITE_OPEN_READONLY);

  assertEqual(t.exec(snapshotSql, readOnly), SQLITE_BUSY);

  assertEqual(t.exec("COMMIT", t.a), SQLITE_OK);
  assertEqual(t.snapshot(readOnly), "300:0");
  assertEqual(t.integrity(readOnly), "ok");
  t.close(readOnly);
  t.close(t.a);
});

// Before the lock table, rolled-back pages became durable: 300:299.
test("a connection that gets SQLITE_BUSY while a spilled transaction is open reads the rows unchanged after its ROLLBACK, and its own update makes none of the rolled-back pages durable", async () => {
  const t = await setupRows();
  assertEqual(t.exec(spillSql, t.a), SQLITE_OK);
  const b = t.connect();
  assertEqual(t.exec(snapshotSql, b), SQLITE_BUSY);

  assertEqual(t.exec("ROLLBACK", t.a), SQLITE_OK);

  assertEqual(t.snapshot(b), "300:300");
  assertEqual(
    t.exec("UPDATE t SET v = randomblob(3000) WHERE id = 1", b),
    SQLITE_OK,
  );
  t.close(b);
  t.close(t.a);
  const c = t.connect();
  assertEqual(t.snapshot(c), "300:299");
  assertEqual(t.integrity(c), "ok");
  t.close(c);
});

// Before the lock table, 138 rolled-back rows stayed.
test("a spilled transaction left open by a failed statement blocks other connections with SQLITE_BUSY until its ROLLBACK, after which none of its changes remain", async () => {
  const t = await setupRows();
  const b = t.connect();
  assertEqual(t.exec(spillSql, t.a), SQLITE_OK);
  assertEqual(
    t.exec("INSERT INTO t(id, v) VALUES (1, zeroblob(3000))", t.a),
    SQLITE_CONSTRAINT,
  );
  assertEqual(sqlite3_get_autocommit(t)(t.a), 0);

  assertEqual(t.exec(snapshotSql, b), SQLITE_BUSY);
  assertEqual(t.exec("UPDATE t SET w = 1 WHERE id = 1", b), SQLITE_BUSY);

  assertEqual(t.exec("ROLLBACK", t.a), SQLITE_OK);
  assertEqual(t.snapshot(b), "300:300");
  assertEqual(t.exec("UPDATE t SET w = 1 WHERE id = 1", b), SQLITE_OK);
  assertEqual(t.integrity(b), "ok");
  t.close(b);
  t.close(t.a);
});

// SQLite's no-op xSleep fix (cdbfe6a938): a busy timeout cannot resolve a
// conflict between connections of one thread, so it must not freeze it.
test("with a busy timeout of 3 or 10 seconds, BEGIN IMMEDIATE and an autocommit INSERT during another connection's RESERVED return SQLITE_BUSY at once", async () => {
  const t = await setupRows();
  const b = t.connect();

  for (const timeout of [3000, 10_000]) {
    assertEqual(t.exec(`PRAGMA busy_timeout = ${timeout}`, b), SQLITE_OK);
    assertEqual(
      t.exec("BEGIN; UPDATE t SET w = 1 WHERE id <= 10", t.a),
      SQLITE_OK,
    );
    const start = performance.now();

    assertEqual(t.exec("BEGIN IMMEDIATE", b), SQLITE_BUSY);
    assertEqual(t.exec("INSERT INTO t(v) VALUES (1)", b), SQLITE_BUSY);

    assertTrue(performance.now() - start < 500);
    assertEqual(t.exec("ROLLBACK", t.a), SQLITE_OK);
  }
  t.close(b);
  t.close(t.a);
});

test("while a connection in exclusive locking mode stays open after a write, another connection's read gets SQLITE_BUSY instead of stale rows, and reads the write once it closes", async () => {
  const t = await setupRows();
  const b = t.connect();
  assertEqual(t.snapshot(b), "300:300");
  assertEqual(
    t.exec(
      "PRAGMA locking_mode = EXCLUSIVE; UPDATE t SET v = randomblob(3000) WHERE id <= 10",
      t.a,
    ),
    SQLITE_OK,
  );

  assertEqual(t.exec(snapshotSql, b), SQLITE_BUSY);

  t.close(t.a);
  assertEqual(t.snapshot(b), "300:290");
  t.close(b);
});

test("a connection that attaches its own database and writes both schemas in one transaction gets SQLITE_BUSY, as native SQLite does, and rolls back intact", async () => {
  const t = await setupRows();
  assertEqual(
    t.exec(
      "ATTACH '/test.db' AS self; BEGIN; UPDATE main.t SET w = 1 WHERE id = 1",
      t.a,
    ),
    SQLITE_OK,
  );

  assertEqual(t.exec("UPDATE self.t SET w = 2 WHERE id = 2", t.a), SQLITE_BUSY);

  assertEqual(t.exec("ROLLBACK", t.a), SQLITE_OK);
  assertEqual(t.selectText("SELECT sum(w) FROM t", t.a), "0");
  assertEqual(t.integrity(t.a), "ok");
  t.close(t.a);
});

test("a connection closed with sqlite3_close_v2 while its statement is unfinished keeps SHARED, so another connection's write gets SQLITE_BUSY until the statement is finalized", async () => {
  const t = await setupRows();
  const b = t.connect();
  const cursor = t.prepare("SELECT id FROM t", b);
  assertEqual(sqlite3_step(t)(cursor), SQLITE_ROW);
  t.close(b);

  assertEqual(t.exec("UPDATE t SET w = 1", t.a), SQLITE_BUSY);

  assertEqual(sqlite3_finalize(t)(cursor), SQLITE_OK);
  assertEqual(t.exec("UPDATE t SET w = 1", t.a), SQLITE_OK);
  t.close(t.a);
});

// wa-sqlite 8b97297: after an I/O error, SQLite goes from RESERVED straight to
// NONE.
test("commits, rollbacks, SQLITE_FULL and SQLITE_IOERR in a transaction, and a hot journal's rollback never make a lock method fail, return SQLITE_IOERR_LOCK or SQLITE_IOERR_UNLOCK, or report a defect", async () => {
  const t = await setupRows();
  const databaseSlot = t.findSlotPath("/test.db");
  const assertLocksWork = (db: SqliteDbPtr) => {
    assertFalse(
      ["xLock", "xUnlock", "xCheckReservedLock"].includes(
        t.pool.getFailure()?.method ?? "",
      ),
    );
    assertFalse(
      [SQLITE_IOERR_LOCK, SQLITE_IOERR_UNLOCK].includes(
        sqlite3_extended_errcode(t)(db),
      ),
    );
    assertEqual(t.reportDefect.getDefects(), []);
    t.fake.inject(null);
    t.pool.clearFailure();
    if (sqlite3_get_autocommit(t)(db) === 0)
      assertEqual(t.exec("ROLLBACK", db), SQLITE_OK);
  };

  assertEqual(t.exec("UPDATE t SET w = 1 WHERE id = 1", t.a), SQLITE_OK);
  assertLocksWork(t.a);
  assertEqual(t.exec("BEGIN; UPDATE t SET w = 2; ROLLBACK", t.a), SQLITE_OK);
  assertLocksWork(t.a);

  // The database's writes fail while the transaction spills.
  t.fake.inject((call) =>
    call.method === "write" &&
    call.path === databaseSlot &&
    call.at >= sahPoolHeaderSize
      ? { type: "Throw", error: createQuotaExceededError() }
      : null,
  );
  assertEqual(t.exec(spillSql, t.a), SQLITE_FULL);
  assertLocksWork(t.a);

  // The journal's writes fail, and SQLite goes from RESERVED to NONE.
  t.fake.inject((call) =>
    call.method === "write" &&
    call.path !== databaseSlot &&
    call.at >= sahPoolHeaderSize
      ? {
          type: "Throw",
          error: new DOMException("Failed.", "InvalidStateError"),
        }
      : null,
  );
  assertEqual(
    t.exec("UPDATE t SET v = randomblob(3000) WHERE id <= 10", t.a) & 0xff,
    SQLITE_IOERR,
  );
  assertLocksWork(t.a);

  // A COMMIT whose journal delete fails leaves a hot journal.
  assertEqual(t.exec("BEGIN; UPDATE t SET w = 3", t.a), SQLITE_OK);
  const journalSlot = t.findSlotPath("/test.db-journal");
  t.fake.inject((call) =>
    call.method === "write" && call.path === journalSlot && call.at === 0
      ? { type: "Throw", error: createQuotaExceededError() }
      : null,
  );
  assertEqual(t.exec("COMMIT", t.a), SQLITE_IOERR);
  assertLocksWork(t.a);
  t.close(t.a);
  assertTrue(t.hasJournal());
  const b = t.connect();
  assertEqual(t.selectText("SELECT sum(w) FROM t", b), "1");
  assertLocksWork(b);
  assertFalse(t.hasJournal());
  assertEqual(t.integrity(b), "ok");
  t.close(b);
});
