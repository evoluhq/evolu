/**
 * The C build against `@evolu/sqlite-wasm` 3.54.0-build2, the last build whose
 * pool encrypts in TypeScript, on one fake OPFS in DELETE mode, Evolu's
 * configuration, as tabs of two Evolu versions sharing a pool: each build reads
 * and extends the other's databases, keyed with the raw key or as 2.2.4 keyed
 * them, and rolls back the hot journals the other's dead worker left. A journal
 * PERSIST kept, which `@evolu/sqlite-wasm` doesn't support across the builds,
 * can make 3.54.0-build2 keep a half-applied transaction the C build rolls
 * back.
 *
 * A worker dies as in `CrashRecovery.test.ts`: its instance is abandoned and
 * the fake's handles released.
 */

import {
  assert,
  assertEqual,
  assertEqualBytes,
  assertFalse,
  assertNotEqual,
  assertOk,
  assertTrue,
  bytesToHex,
  EncryptionKey,
  eqArrayNumber,
  getOrThrow,
  NonNegativeInt,
  testCreateDeps,
  testCreateRun,
  type Result,
  type SqliteRow,
  type SqliteValue,
} from "@evolu/common";
import {
  createEncryptedSqliteDatabase as tsBuildCreateEncryptedSqliteDatabase,
  createSqliteDatabase as tsBuildCreateSqliteDatabase,
} from "@evolu/sqlite-wasm-3.54.0-build2";
import { test } from "node:test";
import { SQLITE_OK } from "../../../../packages/sqlite-wasm/src/Constants.ts";
import {
  createEncryptedSqliteDatabase,
  createSqliteDatabase,
  SqliteVfsPath,
  type SqliteKeyDerivation,
} from "../../../../packages/sqlite-wasm/src/Database.ts";
import { crashAfterWrites, setupFakeOpfs, type FakeOpfs } from "./_fakeOpfs.ts";
import { setupSahPool } from "./_sahPool.ts";
import { readSqliteJsFile, setupSqliteJs, writePoolFile } from "./_sqliteJs.ts";
import { setupTsBuildPool } from "./_tsBuild.ts";

const testKey = EncryptionKey.orThrow(
  Uint8Array.from({ length: 32 }, (_, index) => index * 7 + 1),
);

const otherKey = EncryptionKey.orThrow(
  Uint8Array.from({ length: 32 }, (_, index) => 255 - index * 3),
);

/** What the tests use of an encrypted database, which both builds have. */
interface BuildDatabase extends Disposable {
  readonly exec: (sql: string) => Result<void, unknown>;
  readonly run: (
    sql: string,
    parameters: ReadonlyArray<SqliteValue>,
  ) => Result<{ readonly rows: ReadonlyArray<SqliteRow> }, unknown>;
}

/** A build's pool on a fake OPFS, on a fresh instance. */
interface BuildPool extends Disposable {
  readonly getPaths: () => ReadonlyArray<string>;

  /** Reads at most the byte length of a file, from its start. */
  readonly read: (path: string, byteLength: number) => Uint8Array;

  /** Opens an EncryptedFile database with the key, `/evolu1.db` by default. */
  readonly open: (
    key: EncryptionKey,
    path?: string,
  ) => Result<BuildDatabase, unknown>;

  /**
   * Opens `/evolu1.db` with `createEncryptedSqliteDatabase`, which falls back
   * to the key 2.2.4 derived.
   */
  readonly openWithFallback: (key: EncryptionKey) => Promise<
    Result<
      {
        readonly database: BuildDatabase;
        readonly keyDerivation: SqliteKeyDerivation;
      },
      unknown
    >
  >;
}

interface Build {
  readonly name: string;

  /**
   * Opens the build's pool on a fresh instance whose test dependencies are
   * seeded with the build's name, so the builds never draw the same random
   * bytes, and a salt one build kept can't pass for one the other made.
   */
  readonly setupPool: (fake: FakeOpfs) => Promise<BuildPool>;
}

const cBuild: Build = {
  name: "the C build",
  setupPool: async (fake) => {
    const t = await setupSahPool({
      fake,
      deps: testCreateDeps({ seed: cBuild.name }),
    });
    const options = (key: EncryptionKey, path: string) =>
      ({
        type: "EncryptedFile",
        vfs: t.pool,
        path: SqliteVfsPath.orThrow(path),
        key,
      }) as const;
    return {
      getPaths: () => t.pool.getPaths(),
      read: (path, byteLength) =>
        getOrThrow(
          t.pool.read(
            path,
            NonNegativeInt.orThrow(0),
            NonNegativeInt.orThrow(byteLength),
          ),
        ),
      open: (key, path = "/evolu1.db") =>
        createSqliteDatabase(t)(options(key, path)),
      openWithFallback: async (key) => {
        await using run = testCreateRun({ ...t, subtleCrypto: crypto.subtle });
        return await run(
          createEncryptedSqliteDatabase(options(key, "/evolu1.db")),
        );
      },
      [Symbol.dispose]: () => {
        t.pool[Symbol.dispose]();
      },
    };
  },
};

const tsBuild: Build = {
  name: "3.54.0-build2",
  setupPool: async (fake) => {
    const ts = await setupTsBuildPool({
      fake,
      deps: testCreateDeps({ seed: tsBuild.name }),
    });
    const options = (key: EncryptionKey, path: string) =>
      ({
        type: "EncryptedFile",
        vfs: ts.pool,
        path: SqliteVfsPath.orThrow(path),
        key,
      }) as const;
    return {
      getPaths: () => ts.pool.getPaths(),
      read: (path, byteLength) =>
        getOrThrow(
          ts.pool.read(
            path,
            NonNegativeInt.orThrow(0),
            NonNegativeInt.orThrow(byteLength),
          ),
        ),
      open: (key, path = "/evolu1.db") =>
        tsBuildCreateSqliteDatabase(ts)(options(key, path)),
      openWithFallback: async (key) => {
        await using run = testCreateRun({
          ...ts,
          subtleCrypto: crypto.subtle,
        });
        return await run(
          tsBuildCreateEncryptedSqliteDatabase(options(key, "/evolu1.db")),
        );
      },
      [Symbol.dispose]: () => {
        ts.pool[Symbol.dispose]();
      },
    };
  },
};

const directions = [
  { writer: cBuild, reader: tsBuild },
  { writer: tsBuild, reader: cBuild },
];

const createRowsSql =
  "CREATE TABLE t(a); WITH RECURSIVE c(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM c WHERE i < 300) INSERT INTO t SELECT 'marker' || zeroblob(3000) FROM c;";

// It spills pages to the database before the commit, so a worker that dies
// leaves a hot journal.
const spillSql =
  "PRAGMA cache_size = 10; BEGIN; UPDATE t SET a = 'changed' || randomblob(3000)";

/** Asserts the database has the rows of `createRowsSql` and is intact. */
const assertRowsUnchanged = (database: BuildDatabase): void => {
  assertEqual(
    getOrThrow(
      database.run(
        "SELECT count(*) AS n, sum(a = 'marker' || zeroblob(3000)) AS unchanged FROM t",
        [],
      ),
    ).rows,
    [{ n: 300, unchanged: 300 }],
  );
  assertEqual(getOrThrow(database.run("PRAGMA integrity_check", [])).rows, [
    { integrity_check: "ok" },
  ]);
};

/**
 * Returns a fake OPFS whose pool holds `/evolu1.db` as 2.2.4 created it with
 * the SQL `@evolu/web` 3.0.0 to 3.4.1 keyed it with, then ran the SQL.
 */
const setupLegacyDatabase = async (sql: string): Promise<FakeOpfs> => {
  const sqliteJs = await setupSqliteJs();
  const created = new sqliteJs.oo1.DB("/legacy.db", "c");
  created.exec(
    `PRAGMA cipher = 'sqlcipher'; PRAGMA key = "x'${bytesToHex(testKey)}'";`,
  );
  created.exec(sql);
  created.close();
  const t = await setupSahPool();
  writePoolFile(t, "/evolu1.db", readSqliteJsFile(sqliteJs, "/legacy.db"));
  t.pool[Symbol.dispose]();
  return t.fake;
};

test("each build is the one it names: the C build refuses PRAGMA key, and 3.54.0-build2 lets SQLite ignore it", async () => {
  for (const [build, ignoresKey] of [
    [cBuild, false],
    [tsBuild, true],
  ] as const) {
    using pool = await build.setupPool(setupFakeOpfs());
    using database = getOrThrow(pool.open(testKey));

    const keyed = database.exec("PRAGMA key = 'k'");

    assertEqual([build.name, keyed.ok], [build.name, ignoresKey]);
  }
});

for (const { writer, reader } of directions) {
  test(`${reader.name} opens and extends an encrypted database ${writer.name} created in the same pool, and ${writer.name} then reads both builds' rows`, async () => {
    const fake = setupFakeOpfs();
    {
      using pool = await writer.setupPool(fake);
      using created = getOrThrow(pool.open(testKey));
      assertOk(
        created.exec("CREATE TABLE t(a); INSERT INTO t VALUES ('writer')"),
      );
    }
    {
      using pool = await reader.setupPool(fake);
      using extended = getOrThrow(pool.open(testKey));
      assertOk(extended.exec("INSERT INTO t VALUES ('reader')"));
    }
    using pool = await writer.setupPool(fake);
    using database = getOrThrow(pool.open(testKey));

    assertEqual(
      getOrThrow(database.run("SELECT a FROM t ORDER BY rowid", [])).rows,
      [{ a: "writer" }, { a: "reader" }],
    );
  });

  test(`${reader.name} rolls back the encrypted hot journal ${writer.name}'s dead worker left, keeping every row, with no journal left`, async () => {
    const fake = setupFakeOpfs();
    const crashed = await writer.setupPool(fake);
    assertOk(
      getOrThrow(crashed.open(testKey)).exec(`${createRowsSql} ${spillSql}`),
    );
    fake.releaseHandles();
    using pool = await reader.setupPool(fake);
    assertEqual(pool.getPaths(), ["/evolu1.db", "/evolu1.db-journal"]);

    using database = getOrThrow(pool.open(testKey));

    assertEqual(pool.getPaths(), ["/evolu1.db"]);
    assertRowsUnchanged(database);
  });

  // SQLite keeps page 1 in its cache for the whole transaction, so only later
  // pages spill, and the database's first 16 bytes, where page 1 stores its
  // salt, stay zero.
  test(`${reader.name} rolls back to size 0 the first transaction of a new encrypted database ${writer.name}'s dead worker left after spilling pages but not page 1, creates the database anew with a salt of its own, not the zeros where page 1's salt would be, and ${writer.name} then reads it`, async () => {
    const fake = setupFakeOpfs();
    const crashed = await writer.setupPool(fake);
    assertOk(
      getOrThrow(crashed.open(testKey)).exec(
        `PRAGMA cache_size = 3; BEGIN; ${createRowsSql}`,
      ),
    );
    fake.releaseHandles();
    {
      using pool = await reader.setupPool(fake);
      assertEqual(pool.getPaths(), ["/evolu1.db", "/evolu1.db-journal"]);
      assertEqualBytes(pool.read("/evolu1.db", 16), new Uint8Array(16));

      using created = getOrThrow(pool.open(testKey));

      assertEqual(pool.read("/evolu1.db", 16).length, 0);
      assertOk(created.exec("CREATE TABLE t(a); INSERT INTO t VALUES ('new')"));
      assertEqual(pool.getPaths(), ["/evolu1.db"]);
      assertNotEqual(pool.read("/evolu1.db", 16), new Uint8Array(16));
    }
    using pool = await writer.setupPool(fake);
    using database = getOrThrow(pool.open(testKey));

    assertEqual(getOrThrow(database.run("SELECT a FROM t", [])).rows, [
      { a: "new" },
    ]);
  });

  // The commit writes page 1 first, so the first crash point that leaves the
  // database's first 16 bytes nonzero leaves page 1, with the interrupted
  // creation's salt, beside the hot journal. The connection whose open rolls
  // the journal back took that salt from page 1, which authenticated with its
  // key, and keeps it for the database it creates again, while a new
  // connection makes a fresh one. Keeping it is harmless: every page encrypted
  // with that salt was in the database the rollback truncated, and the journal
  // of a transaction that began at size 0 holds no records.
  test(`${reader.name} rolls back to size 0 the first transaction of a new encrypted database whose commit ${writer.name}'s dead worker left after writing page 1, and creates the database anew with that page 1's salt on the connection that rolled back, but with a fresh salt on a new connection`, async () => {
    for (const [connection, keepsSalt] of [
      ["the connection that rolled back", true],
      ["a new connection", false],
    ] as const)
      for (let writes = 0; ; writes++) {
        assert(
          writes < 100,
          "No crash point left page 1 beside a hot journal.",
        );
        const fake = setupFakeOpfs();
        const crashed = await writer.setupPool(fake);
        const database = getOrThrow(crashed.open(testKey));
        fake.inject(crashAfterWrites(writes));
        // Its result does not matter: the worker is dead after the writes.
        database.exec(
          "CREATE TABLE t(a); INSERT INTO t VALUES ('interrupted')",
        );
        fake.inject(null);
        fake.releaseHandles();
        using pool = await reader.setupPool(fake);
        const staleSalt = pool.getPaths().includes("/evolu1.db")
          ? pool.read("/evolu1.db", 16)
          : new Uint8Array(0);
        if (!staleSalt.some((byte) => byte !== 0)) continue;
        assertEqual(pool.getPaths(), ["/evolu1.db", "/evolu1.db-journal"]);
        const rolledBack = getOrThrow(pool.open(testKey));
        assertEqual(pool.read("/evolu1.db", 16).length, 0);
        if (!keepsSalt) rolledBack[Symbol.dispose]();

        using created = keepsSalt ? rolledBack : getOrThrow(pool.open(testKey));
        assertOk(
          created.exec("CREATE TABLE t(a); INSERT INTO t VALUES ('new')"),
        );

        assertEqual(
          [connection, eqArrayNumber(pool.read("/evolu1.db", 16), staleSalt)],
          [connection, keepsSalt],
        );
        break;
      }
  });

  test(`${reader.name} rolls back, through createEncryptedSqliteDatabase's fallback, the hot journal ${writer.name}'s dead worker left in a database 2.2.4 created with the SQL @evolu/web runs, keeping every row, with no journal left`, async () => {
    const fake = await setupLegacyDatabase(createRowsSql);
    const crashed = await writer.setupPool(fake);
    const legacy = getOrThrow(await crashed.openWithFallback(testKey));
    assertEqual(legacy.keyDerivation, "Legacy224");
    assertOk(legacy.database.exec(spillSql));
    fake.releaseHandles();
    using pool = await reader.setupPool(fake);
    assertEqual(pool.getPaths(), ["/evolu1.db", "/evolu1.db-journal"]);

    const reopened = getOrThrow(await pool.openWithFallback(testKey));
    using database = reopened.database;

    assertEqual(reopened.keyDerivation, "Legacy224");
    assertEqual(pool.getPaths(), ["/evolu1.db"]);
    assertRowsUnchanged(database);
  });
}

test("the C build rolls back, in one instance and each with its own key, the hot journals 3.54.0-build2's dead worker left in two databases encrypted with different keys, keeping every row of both", async () => {
  const fake = setupFakeOpfs();
  const crashed = await tsBuild.setupPool(fake);
  for (const [path, key] of [
    ["/a.db", testKey],
    ["/b.db", otherKey],
  ] as const)
    assertOk(
      getOrThrow(crashed.open(key, path)).exec(`${createRowsSql} ${spillSql}`),
    );
  fake.releaseHandles();
  using pool = await cBuild.setupPool(fake);
  assertEqual(pool.getPaths().toSorted(), [
    "/a.db",
    "/a.db-journal",
    "/b.db",
    "/b.db-journal",
  ]);

  using a = getOrThrow(pool.open(testKey, "/a.db"));
  using b = getOrThrow(pool.open(otherKey, "/b.db"));

  assertEqual(pool.getPaths().toSorted(), ["/a.db", "/b.db"]);
  assertRowsUnchanged(a);
  assertRowsUnchanged(b);
});

test("3.54.0-build2 and the C build each open as Legacy224, through createEncryptedSqliteDatabase's fallback, and extend a database 2.2.4 created with the SQL @evolu/web runs, and each reads the rows of the other", async () => {
  const fake = await setupLegacyDatabase(
    "CREATE TABLE t(a); INSERT INTO t VALUES ('2.2.4')",
  );
  for (const [build, rows, row] of [
    [tsBuild, [{ a: "2.2.4" }], "ts"],
    [cBuild, [{ a: "2.2.4" }, { a: "ts" }], "c"],
  ] as const) {
    using pool = await build.setupPool(fake);
    const opened = getOrThrow(await pool.openWithFallback(testKey));
    using database = opened.database;
    assertEqual([build.name, opened.keyDerivation], [build.name, "Legacy224"]);
    assertEqual(
      [
        build.name,
        getOrThrow(database.run("SELECT a FROM t ORDER BY rowid", [])).rows,
      ],
      [build.name, rows],
    );
    assertOk(database.exec(`INSERT INTO t VALUES ('${row}')`));
  }
  using pool = await tsBuild.setupPool(fake);
  const opened = getOrThrow(await pool.openWithFallback(testKey));
  using database = opened.database;

  assertEqual(opened.keyDerivation, "Legacy224");
  assertEqual(
    getOrThrow(database.run("SELECT a FROM t ORDER BY rowid", [])).rows,
    [{ a: "2.2.4" }, { a: "ts" }, { a: "c" }],
  );
});

// The installed builds of the TypeScript codec take a hot journal's salt from
// its first page-1 record, before the database's page 1, so a stale one of
// another salt stops their rollback at the transaction's first record. With
// synchronous OFF, the journal's count reaches the end of the file, and with
// it the stale record. The C codec takes the salt of the database's page 1,
// which authenticates.
test("a hot journal PERSIST kept, past whose records lies the page 1 of an earlier database at the same path with the same key and another salt, loses its rollback with synchronous OFF in 3.54.0-build2, which keeps the half-applied transaction and passes integrity_check, but not in the C build, which restores every row, nor with synchronous FULL, whose count stops before the stale record", async () => {
  const countUnchangedRows = async (
    build: Build,
    synchronous: "OFF" | "FULL",
  ) => {
    // A database replaces the file of an earlier one with the same key and
    // another salt, whose journal PERSIST kept, and a dead worker leaves the
    // hot journal of a transaction that journals no page 1. Past its records,
    // the journal holds the earlier database's, the last of them its page 1.
    const t = await setupSahPool();
    const open = (path: string) =>
      getOrThrow(
        createSqliteDatabase(t)({
          type: "EncryptedFile",
          vfs: t.pool,
          path: SqliteVfsPath.orThrow(path),
          key: testKey,
        }),
      );
    const read = (path: string, byteLength: number) =>
      getOrThrow(
        t.pool.read(
          path,
          NonNegativeInt.orThrow(0),
          NonNegativeInt.orThrow(byteLength),
        ),
      );
    {
      using earlier = open("/evolu1.db");
      // A plain update journals page 1 last, at the commit.
      assertOk(
        earlier.exec(
          `PRAGMA journal_mode = PERSIST; ${createRowsSql} UPDATE t SET a = 'earlier' || zeroblob(3000);`,
        ),
      );
    }
    {
      using replacement = open("/replacement.db");
      assertOk(replacement.exec(createRowsSql));
    }
    const staleSalt = read("/evolu1.db", 16);
    const salt = read("/replacement.db", 16);
    // SQLite would delete the journal of an empty database, so the file is
    // replaced as an import replaces it, through the pool's VFS.
    assertEqual(t.callVfs("xDelete", t.cString("/evolu1.db"), 0), SQLITE_OK);
    writePoolFile(t, "/evolu1.db", read("/replacement.db", 1 << 22));
    assertOk(t.pool.unlink("/replacement.db"));
    const database = open("/evolu1.db");
    assertOk(
      database.exec(
        `PRAGMA journal_mode = PERSIST; PRAGMA synchronous = ${synchronous}; PRAGMA cache_size = 10; BEGIN; UPDATE t SET a = 'changed' || randomblob(3000) WHERE rowid <= 100`,
      ),
    );
    t.fake.releaseHandles();

    using pool = await build.setupPool(t.fake);
    const journal = bytesToHex(pool.read("/evolu1.db-journal", 1 << 22));
    // A page-1 record: its page number, then the page, which stores its salt
    // unencrypted.
    assertTrue(journal.includes(`00000001${bytesToHex(staleSalt)}`));
    assertFalse(journal.includes(`00000001${bytesToHex(salt)}`));
    using recovered = getOrThrow(pool.open(testKey));
    assertEqual(getOrThrow(recovered.run("PRAGMA integrity_check", [])).rows, [
      { integrity_check: "ok" },
    ]);
    const [row] = getOrThrow(
      recovered.run(
        "SELECT sum(a = 'marker' || zeroblob(3000)) AS unchanged FROM t",
        [],
      ),
    ).rows;
    return row?.unchanged;
  };

  const tsUnchanged = await countUnchangedRows(tsBuild, "OFF");
  assertTrue(typeof tsUnchanged === "number" && tsUnchanged < 300);
  assertEqual(await countUnchangedRows(cBuild, "OFF"), 300);
  assertEqual(await countUnchangedRows(tsBuild, "FULL"), 300);
});
