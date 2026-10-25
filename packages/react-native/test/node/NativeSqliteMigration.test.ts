/**
 * The databases Evolu's expo-sqlite driver left on devices, which React
 * Native's driver opens in place: the files the SQLCipher of each expo-sqlite
 * release that Evolu supported wrote, keyed with the raw key, and their hot
 * journals after a crash at every write, built on the host as
 * `@evolu/sqlite-core`'s test/sqlcipher.mts builds them. A new database gets
 * the default layout instead.
 */
import {
  assert,
  assertEqual,
  assertFalse,
  bytesToHex,
  EncryptionKey,
  Name,
  sql,
  testCreateRun,
  type NativeSqlite,
} from "@evolu/common";
import {
  defaultBuildDirectory,
  defaultCacheDirectory,
} from "@evolu/sqlite-core/scripts/paths.mts";
import { setupAddon } from "@evolu/sqlite-core/test/setup-addon.mts";
import {
  buildSqlcipherFixture,
  expoSqliteReleases,
  runSqlcipherFixture,
} from "@evolu/sqlite-core/test/sqlcipher.mts";
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { createReactNativeSqliteDriver } from "../../src/sqlite/Driver.ts";

const binding = (await setupAddon()).createBinding() as NativeSqlite;

const testName = Name.orThrow("Test");
const testKey = EncryptionKey.orThrow(
  Uint8Array.from({ length: 32 }, (_, index) => index * 5 + 3),
);
const hexKey = bytesToHex(testKey);
const rows = 30;

const directory = mkdtempSync(join(tmpdir(), "evolu-react-native-migration-"));
after(() => {
  rmSync(directory, { recursive: true, force: true });
});

/**
 * Opens the test database in `databaseDirectory` with the test key, on a test
 * Run of its own that the caller disposes.
 */
const openDatabase = (databaseDirectory: string) => {
  const run = testCreateRun();
  return {
    run,
    driver: run.ok(
      createReactNativeSqliteDriver({
        nativeSqlite: binding,
        databaseDirectory,
      })(testName, { mode: "encrypted", encryptionKey: testKey }),
    ),
  };
};

/** The original and updated rows of the fixture's table and its integrity. */
const countQuery = sql`
  select
    (select count(*) from t where v like 'evolu-secret-row%') as original,
    (select count(*) from t where v like 'updated%') as updated,
    (select integrity_check from pragma_integrity_check limit 1) as integrity;
`;

// Page 1's bytes 16 to 20, which the default layout keeps in plaintext: a
// page size of 4096, file format 1 for writing and reading, and 80 reserved
// bytes.
const defaultLayoutBytes = "1000010150";

for (const expoSqlite of expoSqliteReleases)
  describe(`expo-sqlite ${expoSqlite.version} (SQLCipher ${expoSqlite.sqlcipher})`, () => {
    let fixture: string;
    let releaseDirectory: string;
    let base: string;

    before(
      async () => {
        fixture = await buildSqlcipherFixture({
          expoSqlite,
          cacheDirectory: defaultCacheDirectory(process.env),
          buildDirectory: defaultBuildDirectory(process.env),
        });
        releaseDirectory = mkdtempSync(join(directory, "release-"));
        base = join(releaseDirectory, "base.db");
        const created = runSqlcipherFixture(fixture, [
          "create",
          base,
          hexKey,
          String(rows),
        ]);
        assertEqual([created.status, created.stderr], [0, ""]);
      },
      { timeout: 600_000 },
    );

    it("opens a database the fixture created with every row, keeping SQLCipher's page-1 layout", async () => {
      const databaseDirectory = mkdtempSync(join(releaseDirectory, "open-"));
      const path = join(databaseDirectory, `evolu1-${testName}.db`);
      copyFileSync(base, path);
      {
        const { run, driver: opening } = openDatabase(databaseDirectory);
        await using _run = run;
        using driver = await opening;

        assertEqual(driver.exec(countQuery).rows, [
          { original: rows, updated: 0, integrity: "ok" },
        ]);
        driver.exec(sql`update t set v = 'updated' || id where id = 1;`);
      }

      assertFalse(
        bytesToHex(readFileSync(path).subarray(16, 21)) === defaultLayoutBytes,
      );
    });

    it("opens the copy of every write of a crashed transaction with every row before or after it, and leaves no hot journal", async () => {
      const work = join(releaseDirectory, "work.db");
      let crashes = 0;
      for (let write = 1; ; write++) {
        const databaseDirectory = mkdtempSync(join(releaseDirectory, "crash-"));
        const path = join(databaseDirectory, `evolu1-${testName}.db`);
        copyFileSync(base, work);
        rmSync(`${work}-journal`, { force: true });
        const crashed = runSqlcipherFixture(fixture, [
          "crash",
          work,
          hexKey,
          String(write),
          path,
        ]);
        // Fewer writes than that: the transaction committed.
        if (crashed.status === 0) break;
        assertEqual([crashed.status, crashed.stderr], [3, ""]);

        const { run, driver: opening } = openDatabase(databaseDirectory);
        await using _run = run;
        using driver = await opening;
        const [counted] = driver.exec(countQuery).rows;

        assert(
          [
            { original: rows, updated: 0, integrity: "ok" },
            { original: 0, updated: rows, integrity: "ok" },
          ].some(
            (expected) => JSON.stringify(expected) === JSON.stringify(counted),
          ),
          `Write ${write} left ${JSON.stringify(counted)}.`,
        );
        const journal = `${path}-journal`;
        const journalBytes = existsSync(journal) ? readFileSync(journal) : null;
        assert(
          journalBytes == null ||
            journalBytes.length === 0 ||
            journalBytes[0] === 0,
          `Write ${write} left a hot journal.`,
        );
        crashes++;
      }
      // The journal's records, the database's pages and their syncs.
      assert(crashes > 100, `Only ${crashes} writes.`);
    });
  });

it("gives a new database page 1 of the default layout, with its page size, file format and reserved bytes in plaintext (G6)", async () => {
  const databaseDirectory = mkdtempSync(join(directory, "new-"));
  {
    const { run, driver: opening } = openDatabase(databaseDirectory);
    await using _run = run;
    using driver = await opening;
    driver.exec(sql`create table t (a);`);
  }

  assertEqual(
    bytesToHex(
      readFileSync(join(databaseDirectory, `evolu1-${testName}.db`)).subarray(
        16,
        21,
      ),
    ),
    defaultLayoutBytes,
  );
});
