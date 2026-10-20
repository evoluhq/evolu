/**
 * The C build against `@evolu/sqlite-wasm` 3.54.0-build2, the last build whose
 * pool encrypts in TypeScript, on real OPFS in Chromium, Firefox and WebKit, in
 * DELETE mode, Evolu's configuration, as tabs of two Evolu versions sharing a
 * pool: each build reads and extends the other's databases, keyed with the raw
 * key or as 2.2.4 keyed them, and rolls back the hot journals the other left
 * when its worker was terminated, as closing a tab does.
 *
 * `test/integration/nodejs/sqlite-wasm/CrossBuild.test.ts` covers the same over
 * a fake OPFS.
 */

import {
  assertEqual,
  assertEqualBytes,
  assertNotEqual,
  assertOk,
  EncryptionKey,
} from "@evolu/common";
import { test } from "vitest";
import type { OpfsName } from "../../../../packages/sqlite-wasm/src/SahPool.ts";
import {
  okOrThrow,
  setupPoolDirectory,
  setupSqliteJsWorker,
  setupSqliteWorker,
  type SqliteWorker,
} from "./_harness.ts";
import type { HarnessBuild } from "./_harness.worker.ts";

const testKey = EncryptionKey.orThrow(
  Uint8Array.from({ length: 32 }, (_, index) => index * 7 + 1),
);

const otherKey = EncryptionKey.orThrow(
  Uint8Array.from({ length: 32 }, (_, index) => 255 - index * 3),
);

const buildNames: Record<HarnessBuild, string> = {
  c: "the C build",
  "3.54.0-build2": "3.54.0-build2",
};

const directions: ReadonlyArray<{
  readonly writer: HarnessBuild;
  readonly reader: HarnessBuild;
}> = [
  { writer: "c", reader: "3.54.0-build2" },
  { writer: "3.54.0-build2", reader: "c" },
];

const createRowsSql =
  "CREATE TABLE t(id INTEGER PRIMARY KEY, v BLOB); WITH RECURSIVE c(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM c WHERE i < 300) INSERT INTO t(v) SELECT zeroblob(3000) FROM c;";

// Spills the page cache, so the transaction has written pages to the database
// with its journal synced.
const spillSql =
  "PRAGMA cache_size = 10; BEGIN; UPDATE t SET v = randomblob(3000);";

/**
 * Starts a worker of the build with the pool in the directory open, waiting for
 * the files a terminated worker still holds.
 */
const setupPoolWorker = async (
  build: HarnessBuild,
  directory: OpfsName,
): Promise<SqliteWorker> => {
  const worker = await setupSqliteWorker({ build });
  const opened = await worker.run("openPool", directory, { heldTimeout: "5s" });
  if (!opened.ok) worker.terminate();
  assertOk(opened);
  return worker;
};

/**
 * Opens a path of the worker's pool, `/evolu1.db` by default, as an
 * EncryptedFile database and returns its id.
 */
const openDatabase = async (
  worker: SqliteWorker,
  directory: OpfsName,
  key: EncryptionKey = testKey,
  path = "/evolu1.db",
): Promise<number> =>
  okOrThrow(await worker.run("openEncryptedDatabase", directory, path, key));

/**
 * Opens `/evolu1.db` of the worker's pool with `createEncryptedSqliteDatabase`,
 * which falls back to the key 2.2.4 derived.
 */
const openWithFallback = async (worker: SqliteWorker, directory: OpfsName) =>
  okOrThrow(
    await worker.run(
      "openEncryptedDatabaseWithFallback",
      directory,
      "/evolu1.db",
      testKey,
    ),
  );

/** Asserts the database has the rows of `createRowsSql` and is intact. */
const assertRowsUnchanged = async (
  worker: SqliteWorker,
  database: number,
): Promise<void> => {
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
};

/**
 * Creates `/evolu1.db` in the directory with 2.2.4 and the SQL `@evolu/web`
 * 3.0.0 to 3.4.1 keyed it with, then runs the SQL.
 */
const setupLegacyDatabase = async (
  directory: OpfsName,
  sql: string,
): Promise<void> => {
  using sqliteJs = await setupSqliteJsWorker();
  await sqliteJs.run("openEvoluWebDatabase", directory, testKey);
  await sqliteJs.run("exec", "evolu1.db", sql);
  await sqliteJs.run("close", "evolu1.db");
  await sqliteJs.run("pausePool");
};

test("a worker loads the build it is given: the C build refuses PRAGMA key, and 3.54.0-build2 lets SQLite ignore it", async () => {
  await using pool = setupPoolDirectory();
  for (const [build, ignoresKey] of [
    ["c", false],
    ["3.54.0-build2", true],
  ] as const) {
    using worker = await setupPoolWorker(build, pool.directory);
    const database = await openDatabase(worker, pool.directory);

    const keyed = await worker.run("exec", database, "PRAGMA key = 'k'");

    assertEqual([build, keyed.ok], [build, ignoresKey]);
    await worker.run("disposeDatabase", database);
    await worker.run("disposePool", pool.directory);
  }
});

for (const { writer, reader } of directions) {
  const writerName = buildNames[writer];
  const readerName = buildNames[reader];

  test(`${readerName} opens and extends an encrypted database ${writerName} created in the same pool, and ${writerName} then reads both builds' rows`, async () => {
    await using pool = setupPoolDirectory();
    for (const [build, sql] of [
      [writer, "CREATE TABLE t(a); INSERT INTO t VALUES ('writer')"],
      [reader, "INSERT INTO t VALUES ('reader')"],
    ] as const) {
      using worker = await setupPoolWorker(build, pool.directory);
      const database = await openDatabase(worker, pool.directory);
      assertOk(await worker.run("exec", database, sql));
      await worker.run("disposeDatabase", database);
      await worker.run("disposePool", pool.directory);
    }
    using worker = await setupPoolWorker(writer, pool.directory);
    const database = await openDatabase(worker, pool.directory);

    assertEqual(
      okOrThrow(
        await worker.run("run", database, "SELECT a FROM t ORDER BY rowid", []),
      ).rows,
      [{ a: "writer" }, { a: "reader" }],
    );
  });

  test(`${readerName} rolls back the encrypted hot journal ${writerName} left when its worker was terminated, keeping every row, with no journal left`, async () => {
    await using pool = setupPoolDirectory();
    {
      using crashed = await setupPoolWorker(writer, pool.directory);
      const database = await openDatabase(crashed, pool.directory);
      assertOk(
        await crashed.run("exec", database, `${createRowsSql} ${spillSql}`),
      );
      crashed.terminate();
    }
    using worker = await setupPoolWorker(reader, pool.directory);
    assertEqual((await worker.run("getPaths", pool.directory)).toSorted(), [
      "/evolu1.db",
      "/evolu1.db-journal",
    ]);

    const database = await openDatabase(worker, pool.directory);

    assertEqual(await worker.run("getPaths", pool.directory), ["/evolu1.db"]);
    await assertRowsUnchanged(worker, database);
  });

  // SQLite keeps page 1 in its cache for the whole transaction, so only later
  // pages spill, and the database's first 16 bytes, where page 1 stores its
  // salt, stay zero.
  test(`${readerName} rolls back to size 0 the first transaction of a new encrypted database ${writerName} left after spilling pages but not page 1 when its worker was terminated, creates the database anew with a salt of its own, not the zeros where page 1's salt would be, and ${writerName} then reads it`, async () => {
    await using pool = setupPoolDirectory();
    {
      using crashed = await setupPoolWorker(writer, pool.directory);
      const database = await openDatabase(crashed, pool.directory);
      assertOk(
        await crashed.run(
          "exec",
          database,
          `PRAGMA cache_size = 3; BEGIN; ${createRowsSql}`,
        ),
      );
      crashed.terminate();
    }
    {
      using worker = await setupPoolWorker(reader, pool.directory);
      assertEqual((await worker.run("getPaths", pool.directory)).toSorted(), [
        "/evolu1.db",
        "/evolu1.db-journal",
      ]);
      assertEqualBytes(
        okOrThrow(
          await worker.run("read", pool.directory, "/evolu1.db", 0, 16),
        ),
        new Uint8Array(16),
      );

      const database = await openDatabase(worker, pool.directory);

      assertEqual(
        okOrThrow(await worker.run("read", pool.directory, "/evolu1.db", 0, 16))
          .length,
        0,
      );
      assertOk(
        await worker.run(
          "exec",
          database,
          "CREATE TABLE t(a); INSERT INTO t VALUES ('new')",
        ),
      );
      assertEqual(await worker.run("getPaths", pool.directory), ["/evolu1.db"]);
      assertNotEqual(
        okOrThrow(
          await worker.run("read", pool.directory, "/evolu1.db", 0, 16),
        ),
        new Uint8Array(16),
      );
      await worker.run("disposeDatabase", database);
      await worker.run("disposePool", pool.directory);
    }
    using worker = await setupPoolWorker(writer, pool.directory);
    const database = await openDatabase(worker, pool.directory);

    assertEqual(
      okOrThrow(await worker.run("run", database, "SELECT a FROM t", [])).rows,
      [{ a: "new" }],
    );
  });

  test(`${readerName} rolls back, through createEncryptedSqliteDatabase's fallback, the hot journal ${writerName} left when its worker was terminated in a database 2.2.4 created with the SQL @evolu/web runs, keeping every row, with no journal left`, async () => {
    await using pool = setupPoolDirectory();
    await setupLegacyDatabase(pool.directory, createRowsSql);
    {
      using crashed = await setupPoolWorker(writer, pool.directory);
      const { database, keyDerivation } = await openWithFallback(
        crashed,
        pool.directory,
      );
      assertEqual(keyDerivation, "Legacy224");
      assertOk(await crashed.run("exec", database, spillSql));
      crashed.terminate();
    }
    using worker = await setupPoolWorker(reader, pool.directory);
    assertEqual((await worker.run("getPaths", pool.directory)).toSorted(), [
      "/evolu1.db",
      "/evolu1.db-journal",
    ]);

    const { database, keyDerivation } = await openWithFallback(
      worker,
      pool.directory,
    );

    assertEqual(keyDerivation, "Legacy224");
    assertEqual(await worker.run("getPaths", pool.directory), ["/evolu1.db"]);
    await assertRowsUnchanged(worker, database);
  });
}

test("the C build rolls back, in one worker and each with its own key, the hot journals 3.54.0-build2 left when its worker was terminated in two databases encrypted with different keys, keeping every row of both", async () => {
  await using pool = setupPoolDirectory();
  {
    using crashed = await setupPoolWorker("3.54.0-build2", pool.directory);
    for (const [path, key] of [
      ["/a.db", testKey],
      ["/b.db", otherKey],
    ] as const) {
      const database = await openDatabase(crashed, pool.directory, key, path);
      assertOk(
        await crashed.run("exec", database, `${createRowsSql} ${spillSql}`),
      );
    }
    crashed.terminate();
  }
  using worker = await setupPoolWorker("c", pool.directory);
  assertEqual((await worker.run("getPaths", pool.directory)).toSorted(), [
    "/a.db",
    "/a.db-journal",
    "/b.db",
    "/b.db-journal",
  ]);

  const a = await openDatabase(worker, pool.directory, testKey, "/a.db");
  const b = await openDatabase(worker, pool.directory, otherKey, "/b.db");

  assertEqual((await worker.run("getPaths", pool.directory)).toSorted(), [
    "/a.db",
    "/b.db",
  ]);
  await assertRowsUnchanged(worker, a);
  await assertRowsUnchanged(worker, b);
});

test("3.54.0-build2 and the C build each open as Legacy224, through createEncryptedSqliteDatabase's fallback, and extend a database 2.2.4 created with the SQL @evolu/web runs, and each reads the rows of the other", async () => {
  await using pool = setupPoolDirectory();
  await setupLegacyDatabase(
    pool.directory,
    "CREATE TABLE t(a); INSERT INTO t VALUES ('2.2.4')",
  );
  for (const [build, rows, row] of [
    ["3.54.0-build2", [{ a: "2.2.4" }], "ts"],
    ["c", [{ a: "2.2.4" }, { a: "ts" }], "c"],
  ] as const) {
    using worker = await setupPoolWorker(build, pool.directory);
    const { database, keyDerivation } = await openWithFallback(
      worker,
      pool.directory,
    );
    assertEqual([build, keyDerivation], [build, "Legacy224"]);
    assertEqual(
      [
        build,
        okOrThrow(
          await worker.run(
            "run",
            database,
            "SELECT a FROM t ORDER BY rowid",
            [],
          ),
        ).rows,
      ],
      [build, rows],
    );
    assertOk(
      await worker.run("exec", database, `INSERT INTO t VALUES ('${row}')`),
    );
    await worker.run("disposeDatabase", database);
    await worker.run("disposePool", pool.directory);
  }
  using worker = await setupPoolWorker("3.54.0-build2", pool.directory);
  const { database, keyDerivation } = await openWithFallback(
    worker,
    pool.directory,
  );

  assertEqual(keyDerivation, "Legacy224");
  assertEqual(
    okOrThrow(
      await worker.run("run", database, "SELECT a FROM t ORDER BY rowid", []),
    ).rows,
    [{ a: "2.2.4" }, { a: "ts" }, { a: "c" }],
  );
});
