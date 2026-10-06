/**
 * Recovery of `SahPool` databases from the hot journal a worker that died, or a
 * commit or rollback that failed, left behind, on the pinned binary over a fake
 * OPFS.
 *
 * A worker dies as a closed tab ends it: its instance is abandoned without
 * disposing anything, the fake OPFS releases its handles as the browser does,
 * and a new instance opens the pool on the same files. The scenarios come from
 * Evolu's reproduction for the forum thread b2fbb61642, from the opfs-sahpool
 * storage-failure tests Evolu wrote for SQLite's tester1 there, and from
 * wa-sqlite's `test/sql_0004.js` (MIT, Copyright (c) 2023 Roy T. Hashimoto),
 * re-expressed and cited by test.
 */

import {
  assert,
  assertEqual,
  assertOk,
  assertTrue,
  EncryptionKey,
  getOrThrow,
  type NonNegativeInt,
} from "@evolu/common";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import {
  sqlite3_close_v2,
  sqlite3_extended_errcode,
} from "../../../../packages/sqlite-wasm/src/CApi.ts";
import {
  SQLITE_CANTOPEN,
  SQLITE_FULL,
  SQLITE_IOERR,
  SQLITE_IOERR_DELETE,
  SQLITE_IOERR_DIR_FSYNC,
  SQLITE_IOERR_TRUNCATE,
  SQLITE_OK,
  SQLITE_OPEN_READONLY,
  SQLITE_READONLY,
  SQLITE_READONLY_ROLLBACK,
} from "../../../../packages/sqlite-wasm/src/Constants.ts";
import {
  createSqliteDatabase,
  SqliteVfsPath,
} from "../../../../packages/sqlite-wasm/src/Database.ts";
import type { SqliteDbPtr } from "../../../../packages/sqlite-wasm/src/Pointer.ts";
import { sahPoolHeaderSize } from "../../../../packages/sqlite-wasm/src/SahPool.ts";
import {
  crashAfterWrites,
  createQuotaExceededError,
  type FakeOpfsFault,
  type FakeOpfsFaultHook,
} from "./_fakeOpfs.ts";
import { setupSahPool, type TestSahPool } from "./_sahPool.ts";

/**
 * Abandons the pool's instance without disposing anything, as when its worker
 * dies, releases its handles, and opens the pool on a new instance.
 */
const setupAfterCrash = (t: TestSahPool): Promise<TestSahPool> => {
  t.fake.inject(null);
  t.fake.releaseHandles();
  return setupSahPool({ directory: t.directory, fake: t.fake });
};

/** Opens a database on the pool's VFS, failing the test unless it opens. */
const openOk = (t: TestSahPool, path: string, flags?: number): SqliteDbPtr => {
  const { rc, db } = t.openDatabase(path, flags == null ? {} : { flags });
  assertEqual(rc, SQLITE_OK);
  return db;
};

/** Closes a database, failing the test unless it closes fully. */
const close = (t: TestSahPool, db: SqliteDbPtr): void => {
  assertEqual(sqlite3_close_v2(t)(db), SQLITE_OK);
};

// Table t of 300 rows whose v is zeroblob(3000), as in repro/crash.html.
const createRowsSql =
  "CREATE TABLE t(id INTEGER PRIMARY KEY, v BLOB); WITH RECURSIVE c(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM c WHERE i < 300) INSERT INTO t(v) SELECT zeroblob(3000) FROM c;";

/** The rows of t and how many of them are unchanged, such as `300:300`. */
const rowsSql = "SELECT count(*) || ':' || sum(v = zeroblob(3000)) FROM t";

// Spills the page cache, so the transaction has written pages to the database
// with its journal synced.
const spillSql =
  "PRAGMA cache_size = 10; BEGIN; UPDATE t SET v = randomblob(3000);";

/**
 * Leaves the transaction of repro/crash.html spilled when its worker dies, in
 * the locking mode, and opens the pool on a new instance.
 */
const setupCrashedSpill = async (lockingMode = "NORMAL") => {
  const t = await setupSahPool();
  const db = openOk(t, "/test.db");
  assertEqual(
    t.exec(
      `${createRowsSql} PRAGMA locking_mode = ${lockingMode}; ${spillSql}`,
      db,
    ),
    SQLITE_OK,
  );
  const next = await setupAfterCrash(t);
  assertEqual(next.pool.getPaths(), ["/test.db", "/test.db-journal"]);
  return next;
};

// repro/crash.html, in normal and exclusive locking mode. Before SQLite's fix
// of 2026-09-30, the next worker read 300 rows, 16 unchanged, and left the
// journal.
test("a transaction that spilled when its worker died is rolled back by the next instance's first read, in normal and exclusive locking mode, with no journal left", async () => {
  for (const lockingMode of ["NORMAL", "EXCLUSIVE"]) {
    const t = await setupCrashedSpill(lockingMode);
    const db = openOk(t, "/test.db");

    assertEqual(t.selectText(rowsSql, db), "300:300");

    assertEqual(t.selectText("PRAGMA integrity_check", db), "ok");
    assertEqual(t.pool.getPaths(), ["/test.db"]);
    close(t, db);
  }
});

// A new database's first transaction that spills writes the pages after page
// 1, which stays cached, so the file starts with zeros, where an encrypted
// database's salt can be torn to zeros. Its journal stores an original size of
// 0 pages, so it journals no page and rolling it back only empties the file.
test("a new database whose first transaction spilled when its worker died rolls back to an empty database that takes new rows, as node:sqlite rolls back the same files, and fails with SQLITE_CANTOPEN, recording what was thrown and keeping the journal, while reading the journal's first header throws", async () => {
  const t = await setupSahPool();
  const db = openOk(t, "/test.db");
  assertEqual(
    t.exec(
      "PRAGMA cache_size = 10; BEGIN; CREATE TABLE t(v); WITH RECURSIVE c(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM c WHERE i < 300) INSERT INTO t SELECT randomblob(500) FROM c",
      db,
    ),
    SQLITE_OK,
  );
  const next = await setupAfterCrash(t);
  const readPoolFile = (path: string) =>
    getOrThrow(
      next.pool.read(path, 0 as NonNegativeInt, (1 << 22) as NonNegativeInt),
    );
  const database = readPoolFile("/test.db");
  const journal = readPoolFile("/test.db-journal");
  assertTrue(database.length > 0);
  assertEqual(database.subarray(0, 16), new Uint8Array(16));
  // The journal's first header stores the original size at 16, big-endian.
  assertEqual(journal.subarray(16, 20), new Uint8Array(4));
  const directory = await mkdtemp(join(tmpdir(), "evolu-sqlite-wasm-"));
  try {
    await writeFile(join(directory, "test.db"), database);
    await writeFile(join(directory, "test.db-journal"), journal);
    const native = new DatabaseSync(join(directory, "test.db"));
    try {
      assertEqual(
        Object.values(
          native.prepare("SELECT count(*) FROM sqlite_schema").get() ?? {},
        ),
        [0],
      );
    } finally {
      native.close();
    }
  } finally {
    await rm(directory, { recursive: true });
  }
  const reopened = openOk(next, "/test.db");
  const journalSlot = next.findSlotPath("/test.db-journal");
  const error = new DOMException("Failed.", "InvalidStateError");
  next.fake.inject((call) =>
    call.method === "read" &&
    call.path === journalSlot &&
    call.at === sahPoolHeaderSize
      ? { type: "Throw", error }
      : null,
  );
  next.pool.clearFailure();

  assertEqual(
    next.exec("SELECT count(*) FROM sqlite_schema", reopened),
    SQLITE_CANTOPEN,
  );
  assertEqual(next.pool.getFailure(), {
    method: "xOpen",
    path: "/test.db-journal",
    error,
  });
  assertEqual(next.pool.getPaths(), ["/test.db", "/test.db-journal"]);
  next.fake.inject(null);
  next.pool.clearFailure();

  assertEqual(
    next.selectText("SELECT count(*) FROM sqlite_schema", reopened),
    "0",
  );
  assertEqual(next.pool.getFailure(), null);
  assertEqual(next.selectText("PRAGMA integrity_check", reopened), "ok");
  assertEqual(next.pool.getPaths(), ["/test.db"]);
  assertEqual(
    next.exec("CREATE TABLE u(a); INSERT INTO u VALUES (1)", reopened),
    SQLITE_OK,
  );
  assertEqual(next.selectText("SELECT a FROM u", reopened), "1");
  close(next, reopened);
});

// repro/crash.html?readonly.
test("after a crash, a read-only connection gets SQLITE_READONLY_ROLLBACK instead of the half-written rows, until a read-write connection rolls the journal back", async () => {
  const t = await setupCrashedSpill();
  const readOnly = openOk(t, "/test.db", SQLITE_OPEN_READONLY);

  assertEqual(t.exec(rowsSql, readOnly), SQLITE_READONLY);
  assertEqual(sqlite3_extended_errcode(t)(readOnly), SQLITE_READONLY_ROLLBACK);

  assertEqual(t.pool.getPaths(), ["/test.db", "/test.db-journal"]);
  const readWrite = openOk(t, "/test.db");
  assertEqual(t.selectText(rowsSql, readWrite), "300:300");
  assertEqual(t.pool.getPaths(), ["/test.db"]);
  assertEqual(t.selectText(rowsSql, readOnly), "300:300");
  const laterReadOnly = openOk(t, "/test.db", SQLITE_OPEN_READONLY);
  assertEqual(t.selectText(rowsSql, laterReadOnly), "300:300");
  for (const db of [readOnly, readWrite, laterReadOnly]) close(t, db);
});

// The semantics review's S3n: with synchronous = OFF, SQLite writes the
// journal's header complete at once, so only xCheckReservedLock tells a reader
// that the journal is live.
test("a reader leaves the complete journal of a transaction with synchronous = OFF alone while it holds RESERVED, and the next instance rolls it back after the worker died with it spilled", async () => {
  const t = await setupSahPool();
  const a = openOk(t, "/test.db");
  const b = openOk(t, "/test.db");
  assertEqual(t.exec(createRowsSql, a), SQLITE_OK);
  assertEqual(
    t.exec(
      "PRAGMA synchronous = OFF; BEGIN; UPDATE t SET v = randomblob(3000) WHERE id <= 2",
      a,
    ),
    SQLITE_OK,
  );
  // The journal's magic number, which a hot journal starts with.
  assertEqual(
    getOrThrow(
      t.pool.read("/test.db-journal", 0 as NonNegativeInt, 1 as NonNegativeInt),
    ),
    Uint8Array.of(0xd9),
  );

  assertEqual(t.selectText(rowsSql, b), "300:300");

  assertEqual(t.pool.getPaths(), ["/test.db", "/test.db-journal"]);
  assertEqual(
    t.exec("PRAGMA cache_size = 10; UPDATE t SET v = randomblob(3000)", a),
    SQLITE_OK,
  );
  const next = await setupAfterCrash(t);
  const reopened = openOk(next, "/test.db");
  assertEqual(next.selectText(rowsSql, reopened), "300:300");
  assertEqual(next.selectText("PRAGMA integrity_check", reopened), "ok");
  assertEqual(next.pool.getPaths(), ["/test.db"]);
  close(next, reopened);
});

// wa-sqlite test/sql_0004.js 'should recover after crash'.
test("an uncommitted insert of 10,000 rows with cache_size = 0 is rolled back by the first read after its worker died, and the database takes new rows", async () => {
  const t = await setupSahPool();
  const db = openOk(t, "/demo.db");
  assertEqual(
    t.exec(
      "PRAGMA cache_size = 0; CREATE TABLE t(x); INSERT INTO t VALUES (1), (2), (3); BEGIN; WITH RECURSIVE c(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM c WHERE i < 10000) INSERT INTO t SELECT i FROM c",
      db,
    ),
    SQLITE_OK,
  );
  const next = await setupAfterCrash(t);
  // The pages that reached the database left a hot journal.
  assertEqual(next.pool.getPaths(), ["/demo.db", "/demo.db-journal"]);
  const reopened = openOk(next, "/demo.db");

  assertEqual(next.selectText("SELECT sum(x) FROM t", reopened), "6");

  assertEqual(next.pool.getPaths(), ["/demo.db"]);
  assertEqual(next.selectText("PRAGMA integrity_check", reopened), "ok");
  assertEqual(next.exec("INSERT INTO t VALUES (4), (5)", reopened), SQLITE_OK);
  assertEqual(next.selectText("SELECT sum(x) FROM t", reopened), "15");
  close(next, reopened);
});

// tester1-sahpool-failures.js: table t of 10 rows, each 1000 copies of a
// letter, and a transaction whose COMMIT overwrites its pages and appends new
// ones.
const lettersSql =
  "CREATE TABLE t(id INTEGER PRIMARY KEY, v TEXT); WITH RECURSIVE c(i) AS (SELECT 0 UNION ALL SELECT i + 1 FROM c WHERE i < 9) INSERT INTO t(v) SELECT replace(hex(zeroblob(500)), '0', char(65 + i)) FROM c;";
const lettersSnapshotSql =
  "SELECT count(*) || ':' || sum(length(v)) || ':' || group_concat(substr(v, 1, 1), '') FROM (SELECT v FROM t ORDER BY id)";
const lettersBefore = "10:10000:ABCDEFGHIJ";
const lettersAfter = "18:34000:abcdefghijxxxxxxxx";
const lettersTransactionSql =
  "BEGIN; UPDATE t SET v = lower(v); WITH RECURSIVE c(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM c WHERE i < 8) INSERT INTO t(v) SELECT replace(hex(zeroblob(1500)), '0', 'x') FROM c;";

// The build's default page size.
const pageSize = 8192;

/**
 * Fails a COMMIT as a full disk does in each browser, with tester1's sahFaults:
 * writes that grow a file pass while one page of growth, shared by all files,
 * lasts, and then fail, and so does every truncate, including the one that
 * would roll the database back to its size. Returns the pool with the
 * half-written database and its journal, the connection closed.
 */
const setupFailedRollback = async (
  writeFault: FakeOpfsFault,
  truncateError: unknown,
  commitCode: number,
) => {
  const t = await setupSahPool();
  const db = openOk(t, "/hotjournal.db");
  assertEqual(t.exec(lettersSql, db), SQLITE_OK);
  assertEqual(t.selectText(lettersSnapshotSql, db), lettersBefore);
  assertEqual(t.exec(lettersTransactionSql, db), SQLITE_OK);
  let budget = pageSize;
  let writeFailures = 0;
  let truncateFailures = 0;
  t.fake.inject((call) => {
    if (call.method === "truncate") {
      truncateFailures++;
      return { type: "Throw", error: truncateError };
    }
    if (call.method !== "write") return null;
    const size = t.fake.readFile(call.path)?.length ?? 0;
    const growth = Math.max(0, call.at + call.length - size);
    if (growth <= budget) {
      budget -= growth;
      return null;
    }
    writeFailures++;
    return writeFault;
  });

  assertEqual(t.exec("COMMIT", db), commitCode);

  t.fake.inject(null);
  assertTrue(writeFailures > 0 && truncateFailures > 0);
  assertEqual(t.pool.getPaths(), ["/hotjournal.db", "/hotjournal.db-journal"]);
  close(t, db);
  return t;
};

const failedRollbacks = [
  // Chromium, full APFS disk.
  [
    { type: "Throw", error: createQuotaExceededError() },
    "QuotaExceededError",
    SQLITE_FULL,
  ],
  // WebKit, full APFS disk.
  [
    {
      type: "Throw",
      error: new DOMException("No space.", "InvalidStateError"),
    },
    "InvalidStateError",
    SQLITE_IOERR,
  ],
  // Firefox, full APFS disk.
  [{ type: "Count", count: 0 }, "NS_ERROR_FAILURE", SQLITE_FULL],
] as const satisfies ReadonlyArray<readonly [FakeOpfsFault, string, number]>;

// tester1-sahpool-failures.js 'SAH: a journal left by a failed rollback is
// hot'.
test("a COMMIT that fails because the disk is full, and whose rollback cannot truncate the database, leaves a hot journal that the next connection rolls back", async () => {
  for (const [writeFault, truncateName, commitCode] of failedRollbacks) {
    const t = await setupFailedRollback(
      writeFault,
      new DOMException("No space.", truncateName),
      commitCode,
    );
    const db = openOk(t, "/hotjournal.db");

    assertEqual(t.selectText(lettersSnapshotSql, db), lettersBefore);

    assertEqual(t.selectText("PRAGMA integrity_check", db), "ok");
    assertEqual(t.pool.getPaths(), ["/hotjournal.db"]);
    close(t, db);
  }
});

// The experiment harness's replay.mjs: native SQLite replayed every exported
// database and journal pair.
test("the half-written database and hot journal a failed rollback leaves, read with SahPool.read, roll back in node:sqlite to the state before the transaction", async () => {
  for (const [writeFault, truncateName, commitCode] of failedRollbacks) {
    const t = await setupFailedRollback(
      writeFault,
      new DOMException("No space.", truncateName),
      commitCode,
    );
    const directory = await mkdtemp(join(tmpdir(), "evolu-sqlite-wasm-"));
    try {
      for (const name of ["hotjournal.db", "hotjournal.db-journal"])
        await writeFile(
          join(directory, name),
          getOrThrow(
            t.pool.read(
              `/${name}`,
              0 as NonNegativeInt,
              (1 << 20) as NonNegativeInt,
            ),
          ),
        );
      const native = new DatabaseSync(join(directory, "hotjournal.db"));
      try {
        assertEqual(
          Object.values(native.prepare(lettersSnapshotSql).get() ?? {}),
          [lettersBefore],
        );
        assertEqual(
          Object.values(native.prepare("PRAGMA integrity_check").get() ?? {}),
          ["ok"],
        );
      } finally {
        native.close();
      }
    } finally {
      await rm(directory, { recursive: true });
    }
  }
});

// wa-sqlite's sweep: a write sent to a worker that dies mid-transaction has an
// unknown outcome, but never a partial one.
test("a worker that dies after any write of a transaction, from none to all of them, leaves the database as it was before the transaction or after it, intact, with no journal once the next transaction commits", async () => {
  const setupLetters = (t: TestSahPool) => {
    const db = openOk(t, "/test.db");
    assertEqual(t.exec(lettersSql, db), SQLITE_OK);
    return db;
  };
  // Counts the transaction's writes.
  const counted = await setupSahPool();
  const countedDb = setupLetters(counted);
  const writesBefore = counted.fake.calls.length;
  assertEqual(
    counted.exec(`${lettersTransactionSql} COMMIT`, countedDb),
    SQLITE_OK,
  );
  const writes = counted.fake.calls
    .slice(writesBefore)
    .filter(({ method }) => method === "write").length;
  const outcomes = new Set<string>();

  for (let k = 0; k <= writes; k++) {
    const t = await setupSahPool();
    const db = setupLetters(t);
    t.fake.inject(crashAfterWrites(k));
    // Its result does not matter: the worker is dead after the k-th write.
    t.exec(`${lettersTransactionSql} COMMIT`, db);
    const next = await setupAfterCrash(t);
    const reopened = openOk(next, "/test.db");

    const snapshot = next.selectText(lettersSnapshotSql, reopened);

    assertTrue(snapshot === lettersBefore || snapshot === lettersAfter);
    outcomes.add(snapshot ?? "");
    assertEqual(next.selectText("PRAGMA integrity_check", reopened), "ok");
    // A journal the crash left cold stays until the next write transaction.
    assertEqual(
      next.exec("INSERT INTO t(v) VALUES ('y')", reopened),
      SQLITE_OK,
    );
    assertEqual(next.pool.getPaths(), ["/test.db"]);
    close(next, reopened);
  }
  assertEqual(
    [...outcomes].toSorted(),
    [lettersBefore, lettersAfter].toSorted(),
  );
});

// The inventory's sahpool-files/delete-failure-keeps-journal: deleting the
// journal is what commits, so a COMMIT that cannot delete it did not commit.
// Only a free header write that changed no byte fails the delete. A write that
// changed one, or whose flush failed, deletes the journal, as the next test
// shows.
test("after a COMMIT fails with SQLITE_IOERR_DELETE because the journal's free header cannot be written, the connection's next statement rolls the journal back, so the reported failure matches the data", async () => {
  const quota = createQuotaExceededError();
  const failures: ReadonlyArray<(journalSlot: string) => FakeOpfsFaultHook> = [
    // The free header's write throws.
    (journalSlot) => (call) =>
      call.method === "write" && call.path === journalSlot && call.at === 0
        ? { type: "Throw", error: quota }
        : null,
    // The free header's write is short before its first byte.
    (journalSlot) => (call) =>
      call.method === "write" && call.path === journalSlot && call.at === 0
        ? { type: "Count", count: 0 }
        : null,
  ];
  for (const failure of failures) {
    const t = await setupSahPool();
    const db = openOk(t, "/test.db");
    assertEqual(
      t.exec("CREATE TABLE t(a); INSERT INTO t VALUES (1)", db),
      SQLITE_OK,
    );
    assertEqual(t.exec("BEGIN; INSERT INTO t VALUES (2)", db), SQLITE_OK);
    t.fake.inject(failure(t.findSlotPath("/test.db-journal")));
    assertEqual(t.exec("COMMIT", db), SQLITE_IOERR);
    assertEqual(sqlite3_extended_errcode(t)(db), SQLITE_IOERR_DELETE);
    t.fake.inject(null);
    assertEqual(t.pool.getPaths(), ["/test.db", "/test.db-journal"]);

    assertEqual(t.selectText("SELECT group_concat(a) FROM t", db), "1");

    assertEqual(t.pool.getPaths(), ["/test.db"]);
    assertEqual(t.selectText("PRAGMA integrity_check", db), "ok");
    close(t, db);
  }
});

// A free header that the failed write or flush already changed names no path
// on disk. Failing the delete made SQLite roll back from a journal still
// mapped, which a worker dying during the rollback lost, so the reopened
// database was half rolled back, with PRAGMA integrity_check ok.
test("a COMMIT whose journal delete changed the free header before its write came up short or its flush failed commits, so a worker that dies during the next statement leaves every row committed", async () => {
  const failures: ReadonlyArray<(journalSlot: string) => FakeOpfsFaultHook> = [
    // The free header's write is short after its first byte.
    (journalSlot) => (call) =>
      call.method === "write" && call.path === journalSlot && call.at === 0
        ? { type: "Count", count: 1 }
        : null,
    // The flush after the free header's write throws.
    (journalSlot) => {
      let headerWritten = false;
      return (call) => {
        if (call.path !== journalSlot) return null;
        if (call.method === "write") headerWritten = call.at === 0;
        return call.method === "flush" && headerWritten
          ? { type: "Throw", error: createQuotaExceededError() }
          : null;
      };
    },
  ];
  for (const failure of failures) {
    const t = await setupSahPool();
    const db = openOk(t, "/test.db");
    assertEqual(t.exec(createRowsSql, db), SQLITE_OK);
    assertEqual(
      t.exec("BEGIN; UPDATE t SET v = randomblob(3000)", db),
      SQLITE_OK,
    );
    t.fake.inject(failure(t.findSlotPath("/test.db-journal")));

    const commit = t.exec("COMMIT", db);

    // The worker dies after the next statement's first write, which only a
    // rollback from the journal would make.
    t.fake.inject(crashAfterWrites(1));
    t.exec(rowsSql, db);
    const next = await setupAfterCrash(t);
    const reopened = openOk(next, "/test.db");
    assertEqual(next.selectText(rowsSql, reopened), "300:0");
    assertEqual(next.selectText("PRAGMA integrity_check", reopened), "ok");
    assertEqual(commit, SQLITE_OK);
    close(next, reopened);
  }
});

// synchronous = EXTRA asks for a durable journal delete, and unix reports a
// failed directory sync after the unlink the same way.
test("a COMMIT in synchronous = EXTRA whose journal's free header cannot be flushed fails with SQLITE_IOERR_DIR_FSYNC, although it committed", async () => {
  const t = await setupSahPool();
  const db = openOk(t, "/test.db");
  assertEqual(
    t.exec(
      "PRAGMA synchronous = EXTRA; CREATE TABLE t(a); INSERT INTO t VALUES (1)",
      db,
    ),
    SQLITE_OK,
  );
  assertEqual(t.exec("BEGIN; INSERT INTO t VALUES (2)", db), SQLITE_OK);
  const journalSlot = t.findSlotPath("/test.db-journal");
  const error = createQuotaExceededError();
  let headerWritten = false;
  t.fake.inject((call) => {
    if (call.path !== journalSlot) return null;
    if (call.method === "write") headerWritten = call.at === 0;
    return call.method === "flush" && headerWritten
      ? { type: "Throw", error }
      : null;
  });

  assertEqual(t.exec("COMMIT", db), SQLITE_IOERR);

  assertEqual(sqlite3_extended_errcode(t)(db), SQLITE_IOERR_DIR_FSYNC);
  assertEqual(t.pool.getFailure(), {
    method: "xDelete",
    path: "/test.db-journal",
    error,
  });
  t.fake.inject(null);
  assertEqual(t.pool.getPaths(), ["/test.db"]);
  assertEqual(t.selectText("SELECT group_concat(a) FROM t", db), "1,2");
  close(t, db);
});

// A power loss keeps each file as of its last flush plus any of the writes and
// truncates since. This one keeps only the header of a new journal, written to
// the slot of the journal the previous commit deleted, whose truncate it loses.
test("a power loss that keeps a new journal's header but not the truncate of the deleted journal whose slot it took does not roll back the committed transaction", async () => {
  const t = await setupSahPool();
  const db = openOk(t, "/test.db");
  assertEqual(t.exec(createRowsSql, db), SQLITE_OK);
  const databaseSlot = t.findSlotPath("/test.db");
  // Each slot's bytes as of its last flush.
  const flushed = new Map<string, Uint8Array<ArrayBuffer>>();
  let armed = false;
  let journalSlot: string | null = null;
  t.fake.inject((call) => {
    // The power is lost right after the new journal's header is written.
    if (journalSlot != null)
      return call.method === "write" || call.method === "truncate"
        ? { type: "Drop" }
        : null;
    if (call.method === "flush") {
      const bytes = t.fake.readFile(call.path);
      assert(bytes != null, "No file");
      flushed.set(call.path, bytes);
    } else if (
      armed &&
      call.method === "write" &&
      call.at === 0 &&
      call.path !== databaseSlot
    )
      journalSlot = call.path;
    return null;
  });
  assertEqual(
    t.exec("UPDATE t SET v = randomblob(3000) WHERE id <= 100", db),
    SQLITE_OK,
  );
  armed = true;
  // Its result does not matter: the power is lost during it.
  t.exec("INSERT INTO t(v) VALUES (zeroblob(10))", db);
  assert(journalSlot != null, "No journal was opened");
  t.fake.inject(null);
  t.fake.releaseHandles();
  const header = t.fake.readFile(journalSlot)?.subarray(0, sahPoolHeaderSize);
  assert(header != null, "No journal file");
  for (const [path, bytes] of flushed) t.fake.writeFile(path, bytes);
  const journal = flushed.get(journalSlot) ?? new Uint8Array(sahPoolHeaderSize);
  journal.set(header);
  t.fake.writeFile(journalSlot, journal);
  const next = await setupSahPool({ directory: t.directory, fake: t.fake });
  const reopened = openOk(next, "/test.db");

  assertEqual(next.selectText(rowsSql, reopened), "300:200");

  assertEqual(next.selectText("PRAGMA integrity_check", reopened), "ok");
  close(next, reopened);
});

/**
 * Rolls back a hot journal on a new instance, whose delete's flush fails, with
 * the journal in a slot listed after a free one, so the next journal takes
 * another slot. Returns the instance, the database, and each slot's bytes as of
 * its last flush, which the fake keeps tracking.
 */
const setupFailedJournalDeleteFlush = async () => {
  const t = await setupSahPool();
  const db = openOk(t, "/test.db");
  assertEqual(t.exec(createRowsSql, db), SQLITE_OK);
  // Takes the slot after the database's, so the journal takes the next one.
  const other = openOk(t, "/other.db");
  assertEqual(t.exec("CREATE TABLE o(a)", other), SQLITE_OK);
  close(t, other);
  assertEqual(
    t.exec(
      "PRAGMA cache_size = 10; BEGIN; UPDATE t SET v = randomblob(3000) WHERE id <= 150",
      db,
    ),
    SQLITE_OK,
  );
  const next = await setupAfterCrash(t);
  // Frees the first slot, listed before the hot journal's.
  assertOk(next.pool.unlink("/other.db"), true);
  const journalSlot = next.findSlotPath("/test.db-journal");
  const readFlushed = (path: string) => {
    const bytes = next.fake.readFile(path);
    assert(bytes != null, "No file");
    return bytes;
  };
  const flushed = new Map(
    next
      .slotNames()
      .map((fileName) => `${next.directoryPath}/.opaque/${fileName}`)
      .map((path) => [path, readFlushed(path)] as const),
  );
  let journalDeleted = false;
  let flushFailed = false;
  next.fake.inject((call) => {
    if (call.method === "write" && call.path === journalSlot && call.at === 0)
      journalDeleted = true;
    if (call.method !== "flush") return null;
    if (call.path === journalSlot && journalDeleted && !flushFailed) {
      flushFailed = true;
      return { type: "Throw", error: createQuotaExceededError() };
    }
    flushed.set(call.path, readFlushed(call.path));
    return null;
  });
  const reopened = openOk(next, "/test.db");
  // Rolls the hot journal back, and its delete's flush fails.
  assertEqual(next.selectText(rowsSql, reopened), "300:300");
  assertTrue(flushFailed);
  assertEqual(next.pool.getPaths(), ["/test.db"]);
  return { next, reopened, flushed };
};

/**
 * Keeps each slot as of its last flush, as a power loss does, and opens the
 * pool on a new instance.
 */
const setupAfterPowerLoss = (
  t: TestSahPool,
  flushed: ReadonlyMap<string, Uint8Array<ArrayBuffer>>,
): Promise<TestSahPool> => {
  t.fake.inject(null);
  t.fake.releaseHandles();
  for (const [path, bytes] of flushed) t.fake.writeFile(path, bytes);
  return setupSahPool({ directory: t.directory, fake: t.fake });
};

// A journal delete whose flush failed still succeeds. A later journal in
// another slot could then reach the disk before that delete, and a power loss
// would bring the deleted journal back, rolling back part of a transaction
// that committed after it, with PRAGMA integrity_check ok.
test("a power loss after a journal delete whose flush failed keeps the transaction that committed next, although its journal took another slot", async () => {
  const { next, reopened, flushed } = await setupFailedJournalDeleteFlush();

  assertEqual(
    next.exec("UPDATE t SET v = randomblob(3000)", reopened),
    SQLITE_OK,
  );

  assertEqual(next.selectText(rowsSql, reopened), "300:0");
  close(next, reopened);
  const restarted = await setupAfterPowerLoss(next, flushed);
  const afterPowerLoss = openOk(restarted, "/test.db");
  assertEqual(restarted.selectText(rowsSql, afterPowerLoss), "300:0");
  assertEqual(
    restarted.selectText("PRAGMA integrity_check", afterPowerLoss),
    "ok",
  );
  close(restarted, afterPowerLoss);
});

// Only the pool whose flush failed knows the delete is not durable. Its worker
// can die before that pool writes another header, which flushes the delete
// again, and the next instance cannot tell that free header from a flushed one.
test("a power loss after a journal delete whose flush failed keeps the transaction that a new instance committed next, although the failed flush's worker died first", async () => {
  const { next, flushed } = await setupFailedJournalDeleteFlush();
  // Dies without flushing again, while the fake keeps tracking flushes.
  next.fake.releaseHandles();
  const later = await setupSahPool({
    directory: next.directory,
    fake: next.fake,
  });
  const db = openOk(later, "/test.db");

  assertEqual(later.exec("UPDATE t SET v = randomblob(3000)", db), SQLITE_OK);

  assertEqual(later.selectText(rowsSql, db), "300:0");
  close(later, db);
  const restarted = await setupAfterPowerLoss(later, flushed);
  const afterPowerLoss = openOk(restarted, "/test.db");
  assertEqual(restarted.selectText(rowsSql, afterPowerLoss), "300:0");
  assertEqual(
    restarted.selectText("PRAGMA integrity_check", afterPowerLoss),
    "ok",
  );
  close(restarted, afterPowerLoss);
});

// SQLite truncates a database that shrank right after deleting its journal,
// which commits the transaction. A truncate that reached the disk before a
// delete whose flush failed let a power loss bring the journal back over the
// shorter file, whose cut pages the journal does not hold: the rollback broke
// the freelist, and an encrypted database's zeroed pages failed to
// authenticate.
test("a power loss after a VACUUM whose journal delete's flush failed leaves a plaintext or an encrypted database intact, because the truncate flushes the delete first or is refused", async () => {
  const key = EncryptionKey.orThrow(new Uint8Array(32).fill(3));
  const path = SqliteVfsPath.orThrow("/test.db");
  const cases = [
    // The truncate's flush of the delete succeeds.
    { failedFlushes: 1, vacuumCode: null, failures: 1 },
    // It fails too, so the truncate is refused after the commit.
    { failedFlushes: Infinity, vacuumCode: SQLITE_IOERR_TRUNCATE, failures: 2 },
  ];
  for (const encrypted of [false, true])
    for (const { failedFlushes, vacuumCode, failures } of cases) {
      const t = await setupSahPool();
      const open = (pool: TestSahPool) =>
        createSqliteDatabase(pool)(
          encrypted
            ? { type: "EncryptedFile", vfs: pool.pool, path, key }
            : { type: "File", vfs: pool.pool, path },
        );
      const db = getOrThrow(open(t));
      assertOk(db.exec(`${createRowsSql} DELETE FROM t WHERE id > 10;`));
      const databaseSlot = t.findSlotPath("/test.db");
      const readSlotFile = (slotPath: string) => {
        const bytes = t.fake.readFile(slotPath);
        assert(bytes != null, "No file");
        return bytes;
      };
      // Each slot's bytes as of its last flush.
      const flushed = new Map(
        t
          .slotNames()
          .map((fileName) => `${t.directoryPath}/.opaque/${fileName}`)
          .map((slotPath) => [slotPath, readSlotFile(slotPath)] as const),
      );
      let flushesToFail = failedFlushes;
      let failed = 0;
      t.fake.inject((call) => {
        if (call.method !== "flush") return null;
        const bytes = readSlotFile(call.path);
        // A free header whose slot's last flush still names a path.
        const freed =
          call.path !== databaseSlot &&
          bytes[0] === 0 &&
          (flushed.get(call.path)?.[0] ?? 0) !== 0;
        if (freed && flushesToFail > 0) {
          flushesToFail--;
          failed++;
          return { type: "Throw", error: createQuotaExceededError() };
        }
        flushed.set(call.path, bytes);
        return null;
      });

      const vacuumed = db.exec("VACUUM");

      // The delete's flush failed, and the truncate's was the next one.
      assertEqual(failed, failures);
      assertEqual(
        vacuumed.ok
          ? null
          : vacuumed.error.type === "SqliteError" && [
              vacuumed.error.extendedCode,
              vacuumed.error.cause?.method,
              vacuumed.error.cause?.path,
            ],
        vacuumCode == null ? null : [vacuumCode, "xTruncate", "/test.db"],
      );
      assertEqual(getOrThrow(db.run("SELECT count(*) AS n FROM t", [])).rows, [
        { n: 10 },
      ]);
      assertEqual(getOrThrow(db.run("PRAGMA integrity_check", [])).rows, [
        { integrity_check: "ok" },
      ]);
      // The power loss keeps the database as it is, truncate included.
      flushed.set(databaseSlot, readSlotFile(databaseSlot));
      const restarted = await setupAfterPowerLoss(t, flushed);
      const reopened = getOrThrow(open(restarted));
      assertEqual(
        getOrThrow(reopened.run("SELECT count(*) AS n FROM t", [])).rows,
        [{ n: 10 }],
      );
      assertEqual(getOrThrow(reopened.run("PRAGMA integrity_check", [])).rows, [
        { integrity_check: "ok" },
      ]);
      assertOk(reopened.export());
      reopened[Symbol.dispose]();
    }
});

// With SQLITE_IOCAP_UNDELETABLE_WHEN_OPEN, SQLite keeps a PERSIST or TRUNCATE
// journal open after it unlocks, so a connection in DELETE mode could delete
// the journal under it, freeing its slot.
test("a PERSIST or TRUNCATE connection's transaction that spilled when its worker died is rolled back although a DELETE-mode connection committed on the database before it", async () => {
  for (const journalMode of ["PERSIST", "TRUNCATE"]) {
    const t = await setupSahPool();
    const a = openOk(t, "/test.db");
    assertEqual(
      t.exec(`PRAGMA journal_mode = ${journalMode}; ${createRowsSql}`, a),
      SQLITE_OK,
    );
    const b = openOk(t, "/test.db");
    assertEqual(
      t.exec(
        "INSERT INTO t(v) VALUES (zeroblob(3000)); DELETE FROM t WHERE id = 301",
        b,
      ),
      SQLITE_OK,
    );
    assertEqual(t.exec(spillSql, a), SQLITE_OK);
    const next = await setupAfterCrash(t);
    const reopened = openOk(next, "/test.db");

    assertEqual(next.selectText(rowsSql, reopened), "300:300");

    assertEqual(next.selectText("PRAGMA integrity_check", reopened), "ok");
    close(next, reopened);
  }
});

test("after a DELETE-mode connection commits on a database, a PERSIST or TRUNCATE connection's next commit leaves a new database's file alone", async () => {
  for (const journalMode of ["PERSIST", "TRUNCATE"]) {
    const t = await setupSahPool();
    const a = openOk(t, "/test.db");
    assertEqual(
      t.exec(`PRAGMA journal_mode = ${journalMode}; ${createRowsSql}`, a),
      SQLITE_OK,
    );
    const b = openOk(t, "/test.db");
    assertEqual(t.exec("DELETE FROM t WHERE id = 300", b), SQLITE_OK);
    const other = openOk(t, "/other.db");
    assertEqual(
      t.exec("CREATE TABLE o(a); INSERT INTO o VALUES ('kept')", other),
      SQLITE_OK,
    );

    assertEqual(
      t.exec("UPDATE t SET v = randomblob(3000) WHERE id <= 100", a),
      SQLITE_OK,
    );

    assertEqual(t.selectText("SELECT a FROM o", other), "kept");
    assertEqual(t.selectText("PRAGMA integrity_check", other), "ok");
    for (const db of [a, b, other]) close(t, db);
  }
});
