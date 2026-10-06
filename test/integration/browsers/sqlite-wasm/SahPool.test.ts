/**
 * `SahPool` on real OPFS in module workers of Chromium, Firefox and WebKit.
 *
 * The Node.js tests in `test/integration/nodejs/sqlite-wasm/SahPool.test.ts`
 * cover the pool over a fake OPFS; these run the scenarios that depend on the
 * browser's OPFS, reading the slots back through OPFS on the page. They follow
 * the opfs-sahpool tests of SQLite's `ext/wasm/tester1.c-pp.js` (public
 * domain), cited by group and test.
 */

import {
  assertEqual,
  assertErr,
  assertFalse,
  assertInstanceOf,
  assertOk,
  assertRejects,
  assertTrue,
} from "@evolu/common";
import { test } from "vitest";
import { server } from "vitest/browser";
import {
  SQLITE_CANTOPEN,
  SQLITE_OK,
  SQLITE_OPEN_CREATE,
  SQLITE_OPEN_MAIN_DB,
  SQLITE_OPEN_READWRITE,
} from "../../../../packages/sqlite-wasm/src/Constants.ts";
import { SqliteVfsPath } from "../../../../packages/sqlite-wasm/src/Database.ts";
import {
  sahPoolDigestV2Flag,
  sahPoolHeaderSize,
} from "../../../../packages/sqlite-wasm/src/SahPool.ts";
import {
  createSlotHeader,
  okOrThrow,
  readSlots,
  setupPoolDirectory,
  setupSqliteWorker,
  slotPath,
} from "./_harness.ts";

// tester1 OPFS SyncAccessHandle Pool VFS / SAH sanity checks.
test("openSahPool on an empty OPFS creates the directory with .opaque and 6 free slots, each exactly 4096 zero bytes, and registers its VFS", async () => {
  await using pool = setupPoolDirectory();
  using worker = await setupSqliteWorker();

  const opened = await worker.run("openPool", pool.directory);

  assertOk(opened);
  assertEqual(opened.value.vfsName, `opfs-sahpool:${pool.directory}`);
  assertTrue(await worker.run("findVfs", opened.value.vfsName));
  const slots = await readSlots(pool.directory);
  assertEqual(slots.size, 6);
  for (const bytes of slots.values()) assertEqual(bytes, new Uint8Array(4096));
});

// tester1 OPFS SyncAccessHandle Pool VFS / SAH sanity checks: a database on
// the pool, with one file, because the journal is deleted at each commit.
test("a File database's slot holds the header opfs-sahpool writes, byte for byte, followed by the database, and the committed journal's slot is free again, read back through OPFS", async () => {
  await using pool = setupPoolDirectory();
  using worker = await setupSqliteWorker();
  assertOk(await worker.run("openPool", pool.directory));
  const database = okOrThrow(
    await worker.run("openDatabase", pool.directory, "/test.db"),
  );
  assertOk(
    await worker.run(
      "exec",
      database,
      "CREATE TABLE t(a); INSERT INTO t VALUES ('x')",
    ),
  );

  const [{ pageSize, pageCount }] = okOrThrow(
    await worker.run(
      "run",
      database,
      "SELECT page_size AS pageSize, page_count AS pageCount FROM pragma_page_size, pragma_page_count",
      [],
    ),
  ).rows;

  const slots = [...(await readSlots(pool.directory)).values()];

  const mapped = slots.filter((bytes) => bytes[0] !== 0);
  assertEqual(mapped.length, 1);
  assertEqual(
    mapped[0].subarray(0, sahPoolHeaderSize),
    createSlotHeader(
      "/test.db",
      SQLITE_OPEN_READWRITE |
        SQLITE_OPEN_CREATE |
        SQLITE_OPEN_MAIN_DB |
        sahPoolDigestV2Flag,
    ),
  );
  // The schema and table t.
  assertEqual(pageCount, 2);
  assertEqual(
    mapped[0].length,
    sahPoolHeaderSize + Number(pageSize) * Number(pageCount),
  );
  assertEqual(
    new TextDecoder().decode(
      mapped[0].subarray(sahPoolHeaderSize, sahPoolHeaderSize + 16),
    ),
    "SQLite format 3\0",
  );
  for (const bytes of slots.filter((slot) => slot[0] === 0))
    assertEqual(bytes, new Uint8Array(sahPoolHeaderSize));
});

test("a File database keeps its rows after it and its pool are disposed, for a new worker that opens the pool", async () => {
  await using pool = setupPoolDirectory();
  {
    using first = await setupSqliteWorker();
    assertOk(await first.run("openPool", pool.directory));
    const database = okOrThrow(
      await first.run("openDatabase", pool.directory, "/evolu1.db"),
    );
    assertOk(
      await first.run(
        "exec",
        database,
        "CREATE TABLE t(a); INSERT INTO t VALUES ('kept')",
      ),
    );
    assertEqual(
      okOrThrow(await first.run("run", database, "SELECT a FROM t", [])).rows,
      [{ a: "kept" }],
    );
    await first.run("disposeDatabase", database);
    await first.run("disposePool", pool.directory);
  }
  using second = await setupSqliteWorker();

  assertOk(await second.run("openPool", pool.directory));
  const reopened = okOrThrow(
    await second.run("openDatabase", pool.directory, "/evolu1.db"),
  );

  assertEqual(
    okOrThrow(await second.run("run", reopened, "SELECT a FROM t", [])).rows,
    [{ a: "kept" }],
  );
});

test("evolu1.db, as SQLite's opfs-sahpool opens it, and /evolu1.db open one file, /evolu1.db, whose journal is /evolu1.db-journal", async () => {
  await using pool = setupPoolDirectory();
  using worker = await setupSqliteWorker();
  const { vfsName } = okOrThrow(await worker.run("openPool", pool.directory));

  // A SqliteVfsPath is canonical, so only the C API opens another spelling.
  const { rc, db } = await worker.run("connect", vfsName, "evolu1.db");
  assertEqual(rc, SQLITE_OK);
  assertEqual(
    await worker.run(
      "execSql",
      db,
      "CREATE TABLE t(a); INSERT INTO t VALUES ('evolu1.db')",
    ),
    SQLITE_OK,
  );
  assertEqual(await worker.run("close", db), SQLITE_OK);

  assertEqual(await worker.run("getPaths", pool.directory), ["/evolu1.db"]);
  const database = okOrThrow(
    await worker.run("openDatabase", pool.directory, "/evolu1.db"),
  );
  assertOk(
    await worker.run("exec", database, "INSERT INTO t VALUES ('/evolu1.db')"),
  );
  assertOk(
    await worker.run("exec", database, "BEGIN; INSERT INTO t VALUES (1)"),
  );
  assertEqual((await worker.run("getPaths", pool.directory)).toSorted(), [
    "/evolu1.db",
    "/evolu1.db-journal",
  ]);
  assertOk(await worker.run("exec", database, "COMMIT"));
  assertEqual(
    okOrThrow(
      await worker.run("run", database, "SELECT count(*) AS n FROM t", []),
    ).rows,
    [{ n: 3 }],
  );
});

// A query, a fragment or a host would swallow the suffix SQLite appends, so a
// database and its journal would be one file.
test("SqliteVfsPath rejects a name that would put the journal's suffix in a query, a fragment or a host, and the pool fails to open it with SQLITE_CANTOPEN and keeps no file", async () => {
  await using pool = setupPoolDirectory();
  using worker = await setupSqliteWorker();
  const { vfsName } = okOrThrow(await worker.run("openPool", pool.directory));

  for (const name of ["/a?b.db", "/a#b.db", "/x.db?", "//evolu.db"]) {
    assertErr(SqliteVfsPath.from.parent(name), {
      type: "SqliteVfsPath",
      value: name,
    });
    const { rc, db } = await worker.run("connect", vfsName, name);
    assertEqual(rc, SQLITE_CANTOPEN);
    assertEqual(await worker.run("close", db), SQLITE_OK);
  }
  assertEqual(await worker.run("getPaths", pool.directory), []);
});

test("a journal written past a megabyte is freed at COMMIT: its slot is again exactly 4096 zero bytes in OPFS, and the pool lists only the database", async () => {
  await using pool = setupPoolDirectory();
  using worker = await setupSqliteWorker();
  assertOk(await worker.run("openPool", pool.directory));
  const database = okOrThrow(
    await worker.run("openDatabase", pool.directory, "/test.db"),
  );
  assertOk(
    await worker.run(
      "exec",
      database,
      "CREATE TABLE t(id INTEGER PRIMARY KEY, v BLOB); WITH RECURSIVE c(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM c WHERE i < 300) INSERT INTO t(v) SELECT zeroblob(3000) FROM c",
    ),
  );
  // Spills the page cache, so the journal is synced and the page reads it.
  assertOk(
    await worker.run(
      "exec",
      database,
      "PRAGMA cache_size = 10; BEGIN; UPDATE t SET v = randomblob(3000)",
    ),
  );
  const journals = [...(await readSlots(pool.directory))].filter(
    ([, bytes]) => slotPath(bytes) === "/test.db-journal",
  );
  assertEqual(journals.length, 1);
  const [[journalFile, journal]] = journals;
  assertTrue(journal.length > sahPoolHeaderSize + 1_000_000);

  assertOk(await worker.run("exec", database, "COMMIT"));

  assertEqual(await worker.run("getPaths", pool.directory), ["/test.db"]);
  const slots = await readSlots(pool.directory);
  assertEqual(slots.get(journalFile), new Uint8Array(sahPoolHeaderSize));
  assertEqual(
    [...slots.values()].filter((bytes) => bytes[0] !== 0).map(slotPath),
    ["/test.db"],
  );
});

// tester1 OPFS SyncAccessHandle Pool VFS / SAH sanity checks: unlink.
test("SahPool.unlink deletes a database and returns true, then false, its slot is again 4096 zero bytes in OPFS, and opening the path creates an empty database", async () => {
  await using pool = setupPoolDirectory();
  using worker = await setupSqliteWorker();
  assertOk(await worker.run("openPool", pool.directory));
  const database = okOrThrow(
    await worker.run("openDatabase", pool.directory, "/evolu1.db"),
  );
  assertOk(
    await worker.run(
      "exec",
      database,
      "CREATE TABLE t(a); INSERT INTO t VALUES (1)",
    ),
  );
  await worker.run("disposeDatabase", database);

  assertOk(await worker.run("unlink", pool.directory, "/evolu1.db"), true);

  assertEqual(await worker.run("getPaths", pool.directory), []);
  for (const bytes of (await readSlots(pool.directory)).values())
    assertEqual(bytes, new Uint8Array(sahPoolHeaderSize));
  assertOk(await worker.run("unlink", pool.directory, "/evolu1.db"), false);
  const reopened = okOrThrow(
    await worker.run("openDatabase", pool.directory, "/evolu1.db"),
  );
  assertEqual(
    okOrThrow(
      await worker.run(
        "run",
        reopened,
        "SELECT count(*) AS n FROM sqlite_schema",
        [],
      ),
    ).rows,
    [{ n: 0 }],
  );
});

// tester1 OPFS SyncAccessHandle Pool VFS / SAH sanity checks: read.
test("SahPool.read returns a file's bytes after the header, which OPFS and export agree on, and fewer at the end of the file", async () => {
  await using pool = setupPoolDirectory();
  using worker = await setupSqliteWorker();
  assertOk(await worker.run("openPool", pool.directory));
  const database = okOrThrow(
    await worker.run("openDatabase", pool.directory, "/evolu1.db"),
  );
  assertOk(
    await worker.run(
      "exec",
      database,
      "CREATE TABLE t(a); INSERT INTO t VALUES (randomblob(10000))",
    ),
  );
  const exported = okOrThrow(await worker.run("export", database));

  const read = okOrThrow(
    await worker.run(
      "read",
      pool.directory,
      "/evolu1.db",
      0,
      exported.length + 100,
    ),
  );

  assertEqual(read, exported);
  const slot = [...(await readSlots(pool.directory)).values()].find(
    (bytes) => slotPath(bytes) === "/evolu1.db",
  );
  assertEqual(slot?.subarray(sahPoolHeaderSize), exported);
  assertEqual(
    okOrThrow(await worker.run("read", pool.directory, "/evolu1.db", 100, 16)),
    exported.subarray(100, 116),
  );
});

// tester1 OPFS SyncAccessHandle Pool VFS / SAH sanity checks: pausing.
test("disposing a pool with an open database throws and the database keeps working, and once the database is disposed, the pool closes every handle, so OPFS removes its directory while the worker lives", async () => {
  await using pool = setupPoolDirectory();
  using worker = await setupSqliteWorker();
  assertOk(await worker.run("openPool", pool.directory));
  const database = okOrThrow(
    await worker.run("openDatabase", pool.directory, "/evolu1.db"),
  );
  assertOk(
    await worker.run(
      "exec",
      database,
      "CREATE TABLE t(a); INSERT INTO t VALUES (1)",
    ),
  );
  const root = await navigator.storage.getDirectory();

  await assertRejects(worker.run("disposePool", pool.directory), (error) => {
    assertInstanceOf(error, Error);
    assertEqual(
      error.message,
      "Cannot dispose a SahPool with an open file, because closing its handle would corrupt SQLite's state.",
    );
  });
  assertEqual(
    okOrThrow(await worker.run("run", database, "SELECT a FROM t", [])).rows,
    [{ a: 1 }],
  );
  // Every engine refuses to remove a file a sync access handle holds.
  await assertRejects(
    root.removeEntry(pool.directory, { recursive: true }),
    (error) => {
      assertInstanceOf(error, DOMException);
      assertEqual(error.name, "NoModificationAllowedError");
    },
  );

  await worker.run("disposeDatabase", database);
  await worker.run("disposePool", pool.directory);

  await root.removeEntry(pool.directory, { recursive: true });
});

// tester1 OPFS SyncAccessHandle Pool VFS / SAH sanity checks: pausing.
test("a disposed pool's VFS stays registered and fails to open a database with SQLITE_CANTOPEN, and opening the directory again in the worker unpauses it with its files", async () => {
  await using pool = setupPoolDirectory();
  using worker = await setupSqliteWorker();
  const { vfsName } = okOrThrow(await worker.run("openPool", pool.directory));
  const database = okOrThrow(
    await worker.run("openDatabase", pool.directory, "/evolu1.db"),
  );
  assertOk(
    await worker.run(
      "exec",
      database,
      "CREATE TABLE t(a); INSERT INTO t VALUES (1)",
    ),
  );
  await worker.run("disposeDatabase", database);
  await worker.run("disposePool", pool.directory);

  assertTrue(await worker.run("findVfs", vfsName));
  const { rc, db } = await worker.run("connect", vfsName, "/evolu1.db");
  assertEqual(rc, SQLITE_CANTOPEN);
  assertEqual(await worker.run("close", db), SQLITE_OK);

  assertOk(await worker.run("openPool", pool.directory), { vfsName });
  const reopened = okOrThrow(
    await worker.run("openDatabase", pool.directory, "/evolu1.db"),
  );
  assertEqual(
    okOrThrow(await worker.run("run", reopened, "SELECT a FROM t", [])).rows,
    [{ a: 1 }],
  );
});

// tester1 OPFS SyncAccessHandle Pool VFS / SAH sanity checks: two pools.
test("pools in two directories coexist in one worker, each with its own VFS and files", async () => {
  await using first = setupPoolDirectory();
  await using second = setupPoolDirectory();
  using worker = await setupSqliteWorker();

  for (const { directory } of [first, second]) {
    assertOk(await worker.run("openPool", directory), {
      vfsName: `opfs-sahpool:${directory}`,
    });
    const database = okOrThrow(
      await worker.run("openDatabase", directory, "/evolu1.db"),
    );
    assertOk(
      await worker.run(
        "exec",
        database,
        `CREATE TABLE t(a); INSERT INTO t VALUES ('${directory}')`,
      ),
    );
  }

  for (const { directory } of [first, second]) {
    const database = okOrThrow(
      await worker.run("openDatabase", directory, "/evolu1.db"),
    );
    assertEqual(
      okOrThrow(await worker.run("run", database, "SELECT a FROM t", [])).rows,
      [{ a: directory }],
    );
    assertEqual(await worker.run("getPaths", directory), ["/evolu1.db"]);
    const slots = [...(await readSlots(directory)).values()];
    assertEqual(slots.length, 6);
    assertEqual(slots.filter((bytes) => bytes[0] !== 0).map(slotPath), [
      "/evolu1.db",
    ]);
  }
});

// wa-sqlite test/vfs_handle_recovery.js (MIT, Copyright (c) 2023 Roy T.
// Hashimoto), re-expressed: another context holds a slot.
test("openSahPool fails with SahPoolHeldError naming the slot another worker holds, with the engine's error, having written nothing, and with heldTimeout waits until that worker releases it", async () => {
  await using pool = setupPoolDirectory();
  {
    using writer = await setupSqliteWorker();
    assertOk(await writer.run("openPool", pool.directory));
    const database = okOrThrow(
      await writer.run("openDatabase", pool.directory, "/evolu1.db"),
    );
    assertOk(
      await writer.run(
        "exec",
        database,
        "CREATE TABLE t(a); INSERT INTO t VALUES ('kept')",
      ),
    );
    await writer.run("disposeDatabase", database);
    await writer.run("disposePool", pool.directory);
  }
  const before = await readSlots(pool.directory);
  const [heldFile] = [...before].find(
    ([, bytes]) => slotPath(bytes) === "/evolu1.db",
  ) ?? [""];
  using holder = await setupSqliteWorker();
  await holder.run("holdSlot", pool.directory, heldFile);
  using worker = await setupSqliteWorker();

  const held = await worker.run("openPool", pool.directory);

  assertErr(held);
  assertEqual(held.error, {
    type: "SahPoolHeldError",
    fileName: heldFile,
    cause: {
      // WebKit rejects a second handle with InvalidStateError instead of the
      // spec's NoModificationAllowedError
      // (https://bugs.webkit.org/show_bug.cgi?id=326135).
      name:
        server.browser === "webkit"
          ? "InvalidStateError"
          : "NoModificationAllowedError",
      message: (held.error as { cause: { message: string } }).cause.message,
    },
  });
  assertEqual(await readSlots(pool.directory), before);
  let settled = false;
  const waiting = worker
    .run("openPool", pool.directory, { heldTimeout: "5s" })
    .finally(() => {
      settled = true;
    });
  // Far longer than an attempt takes, so the open is waiting for the slot.
  await new Promise((resolve) => {
    setTimeout(resolve, 300);
  });
  assertFalse(settled);
  await holder.run("releaseSlot");
  assertOk(await waiting);
  const database = okOrThrow(
    await worker.run("openDatabase", pool.directory, "/evolu1.db"),
  );
  assertEqual(
    okOrThrow(await worker.run("run", database, "SELECT a FROM t", [])).rows,
    [{ a: "kept" }],
  );
});

// The spec exposes createSyncAccessHandle only to dedicated workers
// (https://fs.spec.whatwg.org/#api-filesystemfilehandle), as Chromium and
// Firefox do, so calling it in a SharedWorker throws a TypeError. WebKit
// exposes sync access handles to SharedWorkers too.
test("openSahPool in a SharedWorker fails with SahPoolSetupError caused by a TypeError, for an existing pool, which it leaves as it was, and for a new directory, except in WebKit, which opens the pool and reads it", async () => {
  await using existing = setupPoolDirectory();
  await using created = setupPoolDirectory();
  {
    using writer = await setupSqliteWorker();
    assertOk(await writer.run("openPool", existing.directory));
    const database = okOrThrow(
      await writer.run("openDatabase", existing.directory, "/evolu1.db"),
    );
    assertOk(
      await writer.run(
        "exec",
        database,
        "CREATE TABLE t(a); INSERT INTO t VALUES ('kept')",
      ),
    );
    await writer.run("disposeDatabase", database);
    await writer.run("disposePool", existing.directory);
  }
  const before = await readSlots(existing.directory);
  using shared = await setupSqliteWorker({ shared: true });

  if (server.browser === "webkit") {
    assertOk(await shared.run("openPool", existing.directory));
    const database = okOrThrow(
      await shared.run("openDatabase", existing.directory, "/evolu1.db"),
    );
    assertEqual(
      okOrThrow(await shared.run("run", database, "SELECT a FROM t", [])).rows,
      [{ a: "kept" }],
    );
    return;
  }
  for (const { directory } of [existing, created]) {
    const opened = await shared.run("openPool", directory);

    assertErr(opened);
    assertEqual(opened.error.type, "SahPoolSetupError");
    assertEqual(
      (opened.error as { cause: { name: string } }).cause.name,
      "TypeError",
    );
  }
  assertEqual(await readSlots(existing.directory), before);
});
