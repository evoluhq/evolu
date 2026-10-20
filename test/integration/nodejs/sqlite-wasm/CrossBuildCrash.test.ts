/**
 * Crashes of the C build and of `@evolu/sqlite-wasm` 3.54.0-build2, the last
 * build whose pool encrypts in TypeScript, recovered by the other build on one
 * fake OPFS, as when a tab of one Evolu version dies mid-transaction and a tab
 * of the other opens the pool next.
 *
 * A worker dies as in `CrashRecovery.test.ts`: its instance is abandoned after
 * a given write, the fake OPFS drops every later write and truncate and
 * releases its handles, and the other build opens the pool on a new instance.
 * The sweeps run the crash matrix of `@evolu/sqlite-core`'s `codec_test.c`
 * across the builds, for an encrypted database of 8192-byte pages in DELETE
 * mode. Databases 2.2.4 keyed run only the hot journals of
 * `LegacyEncryptedDatabase.test.ts`, because each of their recoveries derives a
 * key with 256,000 iterations.
 */

import {
  assert,
  assertEqual,
  assertTrue,
  bytesToHex,
  EncryptionKey,
  getOrThrow,
  testCreateRun,
  type Result,
} from "@evolu/common";
import {
  createEncryptedSqliteDatabase as tsBuildCreateEncryptedSqliteDatabase,
  createSqliteDatabase as tsBuildCreateSqliteDatabase,
} from "@evolu/sqlite-wasm-3.54.0-build2";
import { pbkdf2Sync } from "node:crypto";
import { test } from "node:test";
import {
  sqlite3_close_v2,
  sqlite3_free,
} from "../../../../packages/sqlite-wasm/src/CApi.ts";
import { SQLITE_OK } from "../../../../packages/sqlite-wasm/src/Constants.ts";
import {
  createEncryptedSqliteDatabase,
  SqliteVfsPath,
} from "../../../../packages/sqlite-wasm/src/Database.ts";
import {
  evolu_codec_open,
  evolu_codec_take_failure,
} from "../../../../packages/sqlite-wasm/src/EvoluCApi.ts";
import { allocWasm } from "../../../../packages/sqlite-wasm/src/Memory.ts";
import type { SqliteDbPtr } from "../../../../packages/sqlite-wasm/src/Pointer.ts";
import {
  sahPoolHeaderSize,
  sahPoolOpaqueDirectoryName,
} from "../../../../packages/sqlite-wasm/src/SahPool.ts";
import {
  crashAfterWrites,
  setupFakeOpfs,
  type FakeOpfs,
  type FakeOpfsFaultHook,
} from "./_fakeOpfs.ts";
import { setupSahPool } from "./_sahPool.ts";
import {
  readSqliteJsFile,
  setupSqliteJs,
  sqliteJsRawKeySql,
  writePoolFile,
} from "./_sqliteJs.ts";
import { setupTsBuildPool } from "./_tsBuild.ts";

const key = EncryptionKey.orThrow(
  Uint8Array.from({ length: 32 }, (_, index) => index * 7 + 1),
);

const path = SqliteVfsPath.orThrow("/evolu1.db");

/** `/evolu1.db` opened by one of the builds, on a pool of a fresh instance. */
interface BuildDatabase {
  /** How many writes the open made, as when it rolled back a hot journal. */
  readonly openWrites: number;

  /** Runs SQL, returning whether it succeeded. */
  readonly exec: (sql: string) => boolean;

  /** Returns the first column of a query's first row, as text. */
  readonly selectText: (sql: string) => string | null;

  /**
   * Returns the first failure the build's pool or codec recorded since the
   * open, or null.
   */
  readonly getFailure: () => unknown;

  readonly getPaths: () => ReadonlyArray<string>;

  /** Closes the database and disposes its pool. */
  readonly close: () => void;
}

/** One of the builds, which opens `/evolu1.db` on a fake OPFS. */
interface Build {
  readonly name: string;

  /**
   * Opens a pool of the build on the fake OPFS, on a fresh instance, and then
   * `/evolu1.db` with the key, which rolls back a hot journal, with the hook
   * injected for the database's open. Returns null when the database's open
   * fails.
   */
  readonly open: (
    fake: FakeOpfs,
    options?: { key?: EncryptionKey; hook?: FakeOpfsFaultHook },
  ) => Promise<BuildDatabase | null>;

  /**
   * Opens a pool of the build on the fake OPFS, on a fresh instance, and then
   * `/evolu1.db` with `createEncryptedSqliteDatabase`, which falls back to the
   * key 2.2.4 derived.
   */
  readonly openEncrypted: (fake: FakeOpfs) => Promise<{
    readonly keyDerivation: string;
    readonly database: Pick<BuildDatabase, "selectText" | "getPaths" | "close">;
  }>;
}

/**
 * The C build. Its open calls `evolu_codec_open` as the binding does, so the
 * codec's failure record can be taken, which the binding takes only for an
 * error.
 */
const cBuild: Build = {
  name: "C",
  open: async (fake, { key: openKey = key, hook } = {}) => {
    const t = await setupSahPool({ fake });
    if (hook != null) fake.inject(hook);
    const writesBefore = countWrites(fake);
    const pKey = getOrThrow(allocWasm(t)(32));
    t.sqliteWasm.getHeapU8().set(openKey, pKey);
    // 2 is EVOLU_CODEC_PLAINTEXT_CHECKSUMS, which the binding always passes.
    const rc = evolu_codec_open(t)(
      t.cString(path),
      t.scratch.out,
      t.cString(t.pool.vfsName),
      pKey,
      2,
    );
    t.sqliteWasm.getHeapU8().fill(0, pKey, pKey + 32);
    sqlite3_free(t)(pKey);
    if (rc !== SQLITE_OK) return null;
    const openWrites = countWrites(fake) - writesBefore;
    const db = t.readPtr(t.scratch.out) as SqliteDbPtr;
    return {
      openWrites,
      exec: (sql) => t.exec(sql, db) === SQLITE_OK,
      selectText: (sql) => t.selectText(sql, db),
      getFailure: () => {
        const poolFailure = t.pool.getFailure();
        if (poolFailure != null) return poolFailure;
        const pFailure = getOrThrow(allocWasm(t)(8));
        assertEqual(evolu_codec_take_failure(t)(db, pFailure), SQLITE_OK);
        const view = t.sqliteWasm.getHeapDataView();
        const type = view.getInt32(pFailure, true);
        const pageNumber = view.getUint32(pFailure + 4, true);
        sqlite3_free(t)(pFailure);
        // The values of C's evolu_codec_failure_type, 0 for none.
        return type === 0 ? null : { codecFailureType: type, pageNumber };
      },
      getPaths: () => t.pool.getPaths(),
      close: () => {
        assertEqual(sqlite3_close_v2(t)(db), SQLITE_OK);
        t.pool[Symbol.dispose]();
      },
    };
  },
  openEncrypted: async (fake) => {
    const t = await setupSahPool({ fake });
    await using run = testCreateRun({ ...t, subtleCrypto: crypto.subtle });
    const { database, keyDerivation } = getOrThrow(
      await run(
        createEncryptedSqliteDatabase({
          type: "EncryptedFile",
          vfs: t.pool,
          path,
          key,
        }),
      ),
    );
    return {
      keyDerivation,
      database: {
        selectText: (sql) => selectFirstText(database, sql),
        getPaths: () => t.pool.getPaths(),
        close: () => {
          database[Symbol.dispose]();
          t.pool[Symbol.dispose]();
        },
      },
    };
  },
};

/**
 * The TypeScript-codec build. Its database clears the pool's failure record
 * before each operation, so the record is read after each.
 */
const tsBuild: Build = {
  name: "TypeScript-codec",
  open: async (fake, { key: openKey = key, hook } = {}) => {
    const ts = await setupTsBuildPool({ fake });
    if (hook != null) fake.inject(hook);
    const writesBefore = countWrites(fake);
    const opened = tsBuildCreateSqliteDatabase(ts)({
      type: "EncryptedFile",
      vfs: ts.pool,
      path,
      key: openKey,
    });
    if (!opened.ok) return null;
    const openWrites = countWrites(fake) - writesBefore;
    const database = opened.value;
    let failure: unknown = ts.pool.getFailure();
    return {
      openWrites,
      exec: (sql) => {
        const result = database.exec(sql);
        failure ??= ts.pool.getFailure();
        return result.ok;
      },
      selectText: (sql) => {
        const value = selectFirstText(database, sql);
        failure ??= ts.pool.getFailure();
        return value;
      },
      getFailure: () => failure,
      getPaths: () => ts.pool.getPaths(),
      close: () => {
        database[Symbol.dispose]();
        ts.pool[Symbol.dispose]();
      },
    };
  },
  openEncrypted: async (fake) => {
    const ts = await setupTsBuildPool({ fake });
    await using run = testCreateRun({ ...ts, subtleCrypto: crypto.subtle });
    const { database, keyDerivation } = getOrThrow(
      await run(
        tsBuildCreateEncryptedSqliteDatabase({
          type: "EncryptedFile",
          vfs: ts.pool,
          path,
          key,
        }),
      ),
    );
    return {
      keyDerivation,
      database: {
        selectText: (sql) => selectFirstText(database, sql),
        getPaths: () => ts.pool.getPaths(),
        close: () => {
          database[Symbol.dispose]();
          ts.pool[Symbol.dispose]();
        },
      },
    };
  },
};

/** The writing build and the build that recovers its crashes. */
const directions = [
  [cBuild, tsBuild],
  [tsBuild, cBuild],
] as const;

/** Returns the first column of a query's first row, which must be text. */
const selectFirstText = (
  database: {
    readonly run: (
      sql: string,
      parameters: [],
    ) => Result<
      { readonly rows: ReadonlyArray<Readonly<Record<string, unknown>>> },
      unknown
    >;
  },
  sql: string,
): string | null => {
  const value = Object.values(
    getOrThrow(database.run(sql, [])).rows[0] ?? {},
  )[0];
  assert(value === null || typeof value === "string", "The value is text.");
  return value;
};

const countWrites = (fake: FakeOpfs): number =>
  fake.calls.filter(({ method }) => method === "write").length;

/** Abandons the instance that holds the fake's handles, as a dead worker. */
const releaseAfterCrash = (fake: FakeOpfs): void => {
  fake.inject(null);
  fake.releaseHandles();
};

const opaquePath = `.evolu/${sahPoolOpaqueDirectoryName}`;

/** Copies the pool's files into a new fake OPFS, in creation order. */
const copyFakeOpfs = (fake: FakeOpfs): FakeOpfs => {
  const copy = setupFakeOpfs();
  for (const name of fake.listFiles(opaquePath)) {
    const bytes = fake.readFile(`${opaquePath}/${name}`);
    assert(bytes != null, "The slot exists.");
    copy.writeFile(`${opaquePath}/${name}`, bytes);
  }
  return copy;
};

/**
 * Returns the fake OPFS path of the slot whose header maps the path, as the
 * fake's calls name it.
 */
const findSlotPath = (fake: FakeOpfs, filePath: string): string => {
  for (const name of fake.listFiles(opaquePath)) {
    const bytes = fake.readFile(`${opaquePath}/${name}`);
    assert(bytes != null, "The slot exists.");
    const headerPath = new TextDecoder().decode(
      bytes.subarray(0, bytes.indexOf(0)),
    );
    if (headerPath === filePath) return `${opaquePath}/${name}`;
  }
  throw new Error(`No slot maps ${filePath}`);
};

const rowCount = 12;

// codec_test.c's matrix: rows of about 3000 bytes, here two to a page.
const createRowsSql = `PRAGMA page_size = 8192; CREATE TABLE t(id INTEGER PRIMARY KEY, v TEXT); WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < ${rowCount}) INSERT INTO t SELECT i, 'row' || i || printf('%.3000c', 'x') FROM n`;

/**
 * The user version and whether each row holds its original value, its updated
 * one or another, such as `0:1=row,2=row`.
 */
const snapshotSql =
  "SELECT (SELECT user_version FROM pragma_user_version) || ':' || group_concat(id || '=' || CASE v WHEN 'row' || id || printf('%.3000c', 'x') THEN 'row' WHEN 'updated' || id THEN 'updated' ELSE 'other' END, ',' ORDER BY id) FROM t";

const snapshotOf = (userVersion: number, value: string) =>
  `${userVersion}:${Array.from({ length: rowCount }, (_, index) => `${index + 1}=${value}`).join(",")}`;

const before = snapshotOf(0, "row");

/** Codec_test.c's transaction shapes, each in synchronous FULL and OFF. */
const transactions = (["FULL", "OFF"] as const).flatMap((synchronous) => [
  {
    // codec_test.c's transaction_sql.
    name: `journals page 1 first, then spills and changes page 1 again, in synchronous ${synchronous}`,
    synchronous,
    pageOne: "first",
    sql: `PRAGMA synchronous = ${synchronous}; PRAGMA cache_size = 3; BEGIN; PRAGMA user_version = 7; UPDATE t SET v = 'updated' || id WHERE id <= ${rowCount / 2}; PRAGMA user_version = 8; UPDATE t SET v = 'updated' || id; COMMIT`,
    after: snapshotOf(8, "updated"),
  },
  {
    // codec_test.c's crashes_roll_back_over_large_sectors, which journals page
    // 1 at its commit, with the user version changed just before, so page 1
    // differs before and after and a rollback that misses it shows.
    name: `spills and journals page 1 last, just before its commit, in synchronous ${synchronous}`,
    synchronous,
    pageOne: "last",
    sql: `PRAGMA synchronous = ${synchronous}; PRAGMA cache_size = 3; BEGIN; UPDATE t SET v = 'updated' || id; PRAGMA user_version = 9; COMMIT`,
    after: snapshotOf(9, "updated"),
  },
]);

type Transaction = (typeof transactions)[number];

/** A fake OPFS with `/evolu1.db` of the rows, created by the build. */
const setupRows = async (build: Build): Promise<FakeOpfs> => {
  const fake = setupFakeOpfs();
  const database = await build.open(fake);
  assert(database != null, "The database opens.");
  assertTrue(database.exec(createRowsSql));
  assertEqual(database.selectText(snapshotSql), before);
  database.close();
  return fake;
};

/**
 * Runs the transaction on a copy of the rows, with the writer's worker dying
 * after the given number of writes, and returns the fake OPFS it left.
 */
const setupCrashedWriter = async (
  writer: Build,
  rows: FakeOpfs,
  sql: string,
  writes: number,
): Promise<FakeOpfs> => {
  const fake = copyFakeOpfs(rows);
  const database = await writer.open(fake);
  assert(database != null, "The writer's database opens.");
  fake.inject(crashAfterWrites(writes));
  // Its result does not matter: the worker is dead after the given write.
  database.exec(sql);
  releaseAfterCrash(fake);
  return fake;
};

/** Counts the transaction's writes, checking that it commits. */
const countTransactionWrites = async (
  writer: Build,
  rows: FakeOpfs,
  { sql, after }: Transaction,
): Promise<number> => {
  const fake = copyFakeOpfs(rows);
  const database = await writer.open(fake);
  assert(database != null, "The writer's database opens.");
  const writesBefore = countWrites(fake);
  assertTrue(database.exec(sql));
  const writes = countWrites(fake) - writesBefore;
  assertEqual(database.selectText(snapshotSql), after);
  database.close();
  return writes;
};

/**
 * Opens the database, which must hold the expected snapshot, pass the integrity
 * check and commit a write transaction, after which no journal is left and no
 * failure was recorded.
 */
const assertRecovered = async (
  build: Build,
  fake: FakeOpfs,
  expected: (snapshot: string | null) => string,
  context: string,
): Promise<string> => {
  const database = await build.open(fake);
  assert(database != null, `${context}: the database opens.`);
  const snapshot = database.selectText(snapshotSql);
  assertEqual([context, snapshot], [context, expected(snapshot)]);
  assertEqual(
    [context, database.selectText("PRAGMA integrity_check")],
    [context, "ok"],
  );
  // A journal the crash left cold stays until the next write transaction.
  assertEqual(
    [context, database.exec("INSERT INTO t(v) VALUES ('next')")],
    [context, true],
  );
  assertEqual(
    [context, database.getPaths(), database.getFailure()],
    [context, ["/evolu1.db"], null],
  );
  database.close();
  return expected(snapshot);
};

for (const [writer, recoverer] of directions)
  for (const transaction of transactions)
    test(`a ${writer.name} build that dies after any write of a transaction that ${transaction.name}, from none to all of them, leaves an encrypted database that the ${recoverer.name} build opens as it was before or after the transaction, intact, with no failure recorded and no journal once the next transaction commits`, async () => {
      const rows = await setupRows(writer);
      const writes = await countTransactionWrites(writer, rows, transaction);

      // The journal the commit deletes with its last write.
      const crashed = await setupCrashedWriter(
        writer,
        rows,
        transaction.sql,
        writes - 1,
      );
      const journalSlot = findSlotPath(crashed, "/evolu1.db-journal");
      const journal = crashed
        .readFile(journalSlot)
        ?.subarray(sahPoolHeaderSize);
      assert(journal != null, "The journal's slot exists.");
      // The page numbers of its records, by segment, as SQLite's playback walks
      // them: each segment starts with a header at a multiple of the sector
      // size, whose count of records 0xFFFFFFFF extends to the end.
      const view = new DataView(
        journal.buffer,
        journal.byteOffset,
        journal.byteLength,
      );
      const sectorSize = view.getUint32(20);
      const recordSize = view.getUint32(24) + 8;
      const segments: Array<ReadonlyArray<number>> = [];
      for (let at = 0; at < journal.length;) {
        const count = view.getUint32(at + 8);
        at += sectorSize;
        const pageNumbers: Array<number> = [];
        for (
          let index = 0;
          count === 0xffff_ffff
            ? at + recordSize <= journal.length
            : index < count;
          index++, at += recordSize
        )
          pageNumbers.push(view.getUint32(at));
        segments.push(pageNumbers);
        at = Math.ceil(at / sectorSize) * sectorSize;
      }
      const pageNumbers = segments.flat();
      assertEqual(pageNumbers.filter((number) => number === 1).length, 1);
      assertEqual(
        transaction.pageOne === "first" ? pageNumbers[0] : pageNumbers.at(-1),
        1,
      );
      // A spill syncs the journal, which in FULL begins a new segment.
      assertEqual(segments.length > 1, transaction.synchronous === "FULL");
      // A spill writes a database page before the journal's last write, in
      // FULL and OFF alike; without one, the commit writes every page after.
      const contentWrites = (slot: string) =>
        crashed.calls.flatMap((call, index) =>
          call.method === "write" &&
          call.path === slot &&
          call.at >= sahPoolHeaderSize
            ? [index]
            : [],
        );
      assertTrue(
        Math.min(...contentWrites(findSlotPath(crashed, "/evolu1.db"))) <
          Math.max(...contentWrites(journalSlot)),
      );

      const outcomes = new Set<string>();
      for (let k = 0; k <= writes; k++) {
        const fake = await setupCrashedWriter(writer, rows, transaction.sql, k);
        outcomes.add(
          await assertRecovered(
            recoverer,
            fake,
            (snapshot) =>
              snapshot === transaction.after ? transaction.after : before,
            `write ${k}`,
          ),
        );
      }
      assertEqual(
        [...outcomes].toSorted(),
        [before, transaction.after].toSorted(),
      );
    });

// The writer dies just before the commit's last write, which deletes the
// journal, so the hot journal holds every record, and its rollback writes the
// most.
for (const [writer, recoverer] of directions)
  for (const transaction of transactions)
    test(`a ${recoverer.name} build that dies after any write of its rollback of the hot journal a ${writer.name} build left, dying just before the last write of a transaction that ${transaction.name}, leaves an encrypted database whose rollback the ${writer.name} build finishes, as it was before the transaction, intact, with no failure recorded and no journal once the next transaction commits`, async () => {
      const rows = await setupRows(writer);
      const writes = await countTransactionWrites(writer, rows, transaction);
      const crashed = await setupCrashedWriter(
        writer,
        rows,
        transaction.sql,
        writes - 1,
      );
      const rollback = await recoverer.open(copyFakeOpfs(crashed));
      assert(rollback != null, "The rollback's database opens.");
      rollback.close();
      assertTrue(rollback.openWrites > 0);

      for (let j = 0; j < rollback.openWrites; j++) {
        const fake = copyFakeOpfs(crashed);
        // Its result does not matter: the worker is dead after the j-th write.
        await recoverer.open(fake, { hook: crashAfterWrites(j) });
        releaseAfterCrash(fake);
        await assertRecovered(
          writer,
          fake,
          () => before,
          `rollback write ${j}`,
        );
      }
    });

// LegacyEncryptedDatabase.test.ts: a transaction that journals another page
// first, one that also grows the database, and one that journals page 1 first.
const legacyTransactions = [
  "UPDATE t SET v = randomblob(3000)",
  "WITH RECURSIVE c(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM c WHERE i < 300) INSERT INTO t(v) SELECT randomblob(3000) FROM c",
  "CREATE TABLE u(a); UPDATE t SET v = randomblob(3000)",
];

const legacySalt = Uint8Array.from({ length: 16 }, (_, index) => 200 - index);

for (const [writer, recoverer] of directions)
  test(`the ${recoverer.name} build's createEncryptedSqliteDatabase rolls back, with the key 2.2.4 derived, the hot journal a ${writer.name} build left on a database 2.2.4 keyed, for a transaction that journals page 1 first or another page first, also when it grew the database`, async () => {
    // 2.2.4 derived the key from the key's x'<hex>' and the salt.
    const legacyKey = EncryptionKey.orThrow(
      new Uint8Array(
        pbkdf2Sync(`x'${bytesToHex(key)}'`, legacySalt, 256_000, 32, "sha512"),
      ),
    );
    // 2.2.4 writes page 1, keyed with `raw:` followed by its key and the salt.
    const sqliteJs = await setupSqliteJs();
    const created = new sqliteJs.oo1.DB("/legacy.db", "c");
    created.exec(
      `${sqliteJsRawKeySql(legacyKey, legacySalt)} PRAGMA user_version = 0;`,
    );
    created.close();
    const legacyFile = readSqliteJsFile(sqliteJs, "/legacy.db");

    for (const transactionSql of legacyTransactions) {
      const fake = setupFakeOpfs();
      const t = await setupSahPool({ fake });
      writePoolFile(t, path, legacyFile);
      t.pool[Symbol.dispose]();
      const database = await writer.open(fake, { key: legacyKey });
      assert(database != null, "The writer's database opens.");
      assertTrue(
        database.exec(
          "CREATE TABLE t(id INTEGER PRIMARY KEY, v BLOB); WITH RECURSIVE c(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM c WHERE i < 300) INSERT INTO t(v) SELECT zeroblob(3000) FROM c;",
        ),
      );
      assertTrue(
        database.exec(`PRAGMA cache_size = 10; BEGIN; ${transactionSql}`),
      );
      assertEqual(database.getPaths(), ["/evolu1.db", "/evolu1.db-journal"]);
      releaseAfterCrash(fake);

      const recovered = await recoverer.openEncrypted(fake);

      assertEqual(
        [transactionSql, recovered.keyDerivation],
        [transactionSql, "Legacy224"],
      );
      assertEqual(
        [
          transactionSql,
          recovered.database.selectText(
            "SELECT count(*) || ':' || sum(v = zeroblob(3000)) FROM t",
          ),
          recovered.database.selectText("PRAGMA integrity_check"),
          recovered.database.getPaths(),
        ],
        [transactionSql, "300:300", "ok", ["/evolu1.db"]],
      );
      recovered.database.close();
    }
  });
