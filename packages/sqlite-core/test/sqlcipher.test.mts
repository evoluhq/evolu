/**
 * The codec against the databases and hot journals of the SQLCipher that
 * expo-sqlite vendored, which Evolu's expo-sqlite driver keyed with the raw
 * key: SQLCipher 4's own layout, which the codec opens only when allowed, and
 * journals whose record checksums cover the encrypted pages. Every release in
 * test/sqlcipher.mts is built on the host and crashed at every write.
 */
import {
  assert,
  assertEqual,
  assertFalse,
  assertThrows,
  assertTrue,
  bytesToHex,
} from "@evolu/common";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { run } from "../scripts/compile.mts";
import {
  defaultBuildDirectory,
  defaultCacheDirectory,
} from "../scripts/paths.mts";
import {
  CODEC_SQLCIPHER_FILES,
  type SqliteCoreAddon,
  type SqliteCoreCodecError,
  type SqliteCoreDatabase,
} from "./addon.mts";
import { setupFakeBuild } from "./fake-build.mts";
import { setupAddon, setupAddonTimeout } from "./setup-addon.mts";
import {
  buildSqlcipherFixture,
  expoSqliteReleases,
  runSqlcipherFixture,
} from "./sqlcipher.mts";

const key = Uint8Array.from({ length: 32 }, (_, i) => i * 5 + 3);
const hexKey = bytesToHex(key);
const rows = 30;

for (const expoSqlite of expoSqliteReleases)
  describe(`expo-sqlite ${expoSqlite.version} (SQLCipher ${expoSqlite.sqlcipher})`, () => {
    let addon: SqliteCoreAddon;
    let fixture: string;
    let directory: string;

    before(
      async () => {
        addon = await setupAddon();
        fixture = await buildSqlcipherFixture({
          expoSqlite,
          cacheDirectory: defaultCacheDirectory(process.env),
          buildDirectory: defaultBuildDirectory(process.env),
        });
        directory = mkdtempSync(join(tmpdir(), "evolu-sqlite-core-sqlcipher-"));
      },
      { timeout: setupAddonTimeout },
    );

    after(() => {
      rmSync(directory, { recursive: true, force: true });
    });

    /** Runs the fixture, asserting it succeeded, and returns its output. */
    const sqlcipher = (...args: ReadonlyArray<string>): string => {
      const result = runSqlcipherFixture(fixture, args);
      assertEqual(
        { status: result.status, stderr: result.stderr },
        {
          status: 0,
          stderr: "",
        },
      );
      return result.stdout.trim();
    };

    /** Creates a database of `rows` rows with SQLCipher at a new path. */
    const createDatabase = (name: string): string => {
      const path = join(directory, name);
      sqlcipher("create", path, hexKey, String(rows));
      return path;
    };

    /**
     * The original and updated rows and integrity_check, as the fixture prints
     * them.
     */
    const countRows = (db: SqliteCoreDatabase): string => {
      const statement = addon.prepare(
        db,
        "select (select count(*) from t where v like 'evolu-secret-row%')," +
          " (select count(*) from t where v like 'updated%')," +
          " (select integrity_check from pragma_integrity_check limit 1)",
      );
      try {
        addon.step(statement);
        return [0, 1, 2].map((i) => addon.column(statement, i)).join(" ");
      } finally {
        addon.finalize(statement);
      }
    };

    it("opens a database SQLCipher wrote only with SQLCipher files allowed, and SQLCipher reads what it adds", () => {
      const path = createDatabase("read-write.db");

      assertThrows(
        () => addon.openCodec(path, key),
        (error) => {
          assertEqual((error as { codecFailure: unknown }).codecFailure, {
            type: "PageAuthentication",
            pageNumber: 1,
          });
        },
      );

      const db = addon.openCodec(path, key, CODEC_SQLCIPHER_FILES);
      assertEqual(countRows(db), `${rows} 0 ok`);
      addon.exec(
        db,
        "insert into t select id + 1000, 'evolu-secret-row' || id from t",
      );
      addon.close(db);

      assertEqual(sqlcipher("count", path, hexKey), `${2 * rows} 0 ok`);
      // Page 1 keeps SQLCipher's layout, with bytes 16 to 23 encrypted: not
      // 4096-byte pages, file format 1 and 80 reserved bytes.
      assertEqual(
        bytesToHex(readFileSync(path).subarray(16, 21)) === "1000010150",
        false,
      );
    });

    it("rolls back the hot journal of a transaction SQLCipher crashed at every write", () => {
      const base = createDatabase("crash-base.db");
      const work = join(directory, "crash-work.db");
      const crashed = join(directory, "crash.db");
      let crashes = 0;
      for (let write = 1; ; write++) {
        copyFileSync(base, work);
        rmSync(`${work}-journal`, { force: true });
        const result = runSqlcipherFixture(fixture, [
          "crash",
          work,
          hexKey,
          String(write),
          crashed,
        ]);
        // Fewer writes than that: the transaction committed.
        if (result.status === 0) break;
        assertEqual(
          { status: result.status, stderr: result.stderr },
          {
            status: 3,
            stderr: "",
          },
        );

        const db = addon.openCodec(crashed, key, CODEC_SQLCIPHER_FILES);
        const counted = countRows(db);
        addon.close(db);
        // The transaction commits when SQLite deletes the journal, after its
        // last write, so every crash rolls it back wholly.
        assert(counted === `${rows} 0 ok`, `Write ${write} left ${counted}.`);
        // A journal is left only when it isn't hot: empty, or with zeros in
        // place of its magic, as a crash before SQLite first synced it
        // leaves it.
        const journal = existsSync(`${crashed}-journal`)
          ? readFileSync(`${crashed}-journal`)
          : null;
        assert(
          journal == null || journal.length === 0 || journal[0] === 0,
          `Write ${write} left a hot journal.`,
        );
        assertEqual(sqlcipher("count", crashed, hexKey), counted);
        crashes++;
      }
      // The journal's records, the database's pages and their syncs.
      assert(crashes > 100, `Only ${crashes} writes.`);
    });

    it("writes a hot journal SQLCipher rolls back", () => {
      const path = createDatabase("journal.db");
      const crashed = join(directory, "journal-crash.db");
      const db = addon.openCodec(path, key, CODEC_SQLCIPHER_FILES);
      // A small cache spills updated pages into the database before the commit,
      // and the user version journals page 1.
      addon.exec(
        db,
        "pragma cache_size = 5; begin; pragma user_version = 7; update t set v = 'updated' || id",
      );
      // With a bit of page 1's ciphertext flipped, which only page 1's record
      // restores.
      const altered = readFileSync(path);
      altered[200] ^= 1;
      writeFileSync(crashed, altered);
      copyFileSync(`${path}-journal`, `${crashed}-journal`);
      addon.close(db);

      assertEqual(sqlcipher("count", crashed, hexKey), `${rows} 0 ok`);
      assertEqual(existsSync(`${crashed}-journal`), false);
      const rolledBack = addon.openCodec(crashed, key, CODEC_SQLCIPHER_FILES);
      const version = addon.prepare(rolledBack, "pragma user_version");
      addon.step(version);
      assertEqual(addon.column(version, 0), 0);
      addon.finalize(version);
      addon.close(rolledBack);
    });

    it("without SQLCipher files allowed, keeps a hot journal SQLCipher left for an open that allows them", () => {
      const base = createDatabase("flagless-base.db");
      const work = join(directory, "flagless-work.db");
      const crashed = join(directory, "flagless.db");
      const crash = (write: number) => {
        copyFileSync(base, work);
        rmSync(`${work}-journal`, { force: true });
        return runSqlcipherFixture(fixture, [
          "crash",
          work,
          hexKey,
          String(write),
          crashed,
        ]);
      };
      // A crash after the first page written into the database, whose journal
      // has no page-1 record, and one at its last write, after page 1's record.
      const total = Number(crash(100_000).stdout.trim());
      const { openCodec } = addon;
      for (const write of [12, total]) {
        assertEqual(crash(write).status, 3);
        assertFalse(readFileSync(crashed).equals(readFileSync(base)));

        assertThrows(
          () => openCodec(crashed, key),
          (error) => {
            assertEqual((error as { resultCode: number }).resultCode, 26);
          },
        );
        // The records of other pages rolled back; page 1's record keeps the
        // journal.
        assertEqual(existsSync(`${crashed}-journal`), write === total);
        const db = addon.openCodec(crashed, key, CODEC_SQLCIPHER_FILES);
        assertEqual(countRows(db), `${rows} 0 ok`);
        addon.close(db);
        assertEqual(existsSync(`${crashed}-journal`), false);
      }
    });

    // Contract tests, which passed on their first run: React Native's binding
    // opens every file with SQLCipher files allowed, keyed or not.
    describe("characterization: what React Native's binding relies on", () => {
      /**
       * Crashes SQLCipher's update of a copy of `base` before its `write`th
       * write, leaving the files at `crashed`, and returns them, or null once
       * the transaction has fewer writes and commits.
       */
      const crashUpdate = (base: string, write: number, crashed: string) => {
        const work = `${crashed}-work`;
        copyFileSync(base, work);
        rmSync(`${work}-journal`, { force: true });
        const result = runSqlcipherFixture(fixture, [
          "crash",
          work,
          hexKey,
          String(write),
          crashed,
        ]);
        if (result.status === 0) return null;
        assertEqual(
          { status: result.status, stderr: result.stderr },
          { status: 3, stderr: "" },
        );
        return {
          database: readFileSync(crashed),
          journal: readJournal(crashed),
        };
      };

      it("fails a wrong key with the failing page's authentication and keeps SQLCipher's hot journal for the right key", () => {
        const base = createDatabase("wrong-key-base.db");
        const crashed = join(directory, "wrong-key.db");
        const wrongKey = key.map((byte) => byte ^ 0xff);
        const failure = (path: string) => {
          let caught: unknown;
          assertThrows(
            () => addon.openCodec(path, wrongKey, CODEC_SQLCIPHER_FILES),
            (error) => {
              caught = error;
            },
          );
          const { resultCode, codecFailure } = caught as SqliteCoreCodecError;
          return { resultCode, codecFailure };
        };
        const restores = (path: string) => {
          const db = addon.openCodec(path, key, CODEC_SQLCIPHER_FILES);
          assertEqual(countRows(db), `${rows} 0 ok`);
          addon.close(db);
        };

        copyFileSync(base, crashed);
        assertEqual(failure(crashed), {
          resultCode: 26,
          codecFailure: { type: "PageAuthentication", pageNumber: 1 },
        });
        assertTrue(readFileSync(crashed).equals(readFileSync(base)));
        restores(crashed);

        let hot = 0;
        for (let write = 1; ; write++) {
          const files = crashUpdate(base, write, crashed);
          if (files == null) break;
          const { journal } = files;
          if (!isHot(journal)) continue;
          // The rollback fails at the journal's first record, which follows
          // its header, padded to the sector size the header stores at byte
          // 20, and which page 1's failure makes NOTADB and any other page's
          // CORRUPT.
          const page = journal.readUInt32BE(journal.readUInt32BE(20));
          assertEqual(failure(crashed), {
            resultCode: page === 1 ? 26 : 11,
            codecFailure: { type: "PageAuthentication", pageNumber: page },
          });
          assertTrue(readFileSync(`${crashed}-journal`).equals(journal));
          restores(crashed);
          assertFalse(existsSync(`${crashed}-journal`));
          hot++;
        }
        assert(hot > 50, `Only ${hot} hot journals.`);
      });

      it("refuses a keyless open of a SQLCipher file that has a hot journal, keeping both files", () => {
        const base = createDatabase("keyless-base.db");
        const crashed = join(directory, "keyless.db");
        const { openCodec } = addon;
        let hot = 0;
        for (let write = 1; ; write++) {
          const files = crashUpdate(base, write, crashed);
          if (files == null) break;
          const { database, journal } = files;
          if (!isHot(journal)) continue;

          assertThrows(
            () => openCodec(crashed, null, CODEC_SQLCIPHER_FILES),
            (error) => {
              const { resultCode, codecFailure } =
                error as SqliteCoreCodecError;
              assertEqual(
                { resultCode, codecFailure },
                {
                  resultCode: 14,
                  codecFailure: {
                    type: "EncryptionUnsupported",
                    pageNumber: 0,
                  },
                },
              );
            },
          );
          assertTrue(readFileSync(crashed).equals(database));
          assertTrue(readFileSync(`${crashed}-journal`).equals(journal));
          hot++;
        }
        assert(hot > 50, `Only ${hot} hot journals.`);
      });

      it("rolls back the core's hot journals of both page-1 layouts at every write, then fails a file in the default layout as not a database", () => {
        const coreBase = join(directory, "core-crash-default-base.db");
        const created = addon.openCodec(coreBase, key, CODEC_SQLCIPHER_FILES);
        addon.exec(created, createSql);
        addon.close(created);
        // A new file gets the default layout, whose page 1 stores the page size,
        // file format 1 and 80 reserved bytes in plaintext.
        assertEqual(
          bytesToHex(readFileSync(coreBase).subarray(16, 21)),
          "1000010150",
        );

        for (const [layout, base] of [
          ["SQLCipher", createDatabase("core-crash-sqlcipher-base.db")],
          ["default", coreBase],
        ] as const) {
          const work = join(directory, "core-crash-work.db");
          const crashed = join(directory, "core-crash.db");
          let crashes = 0;
          for (let write = 1; ; write++) {
            copyFileSync(base, work);
            rmSync(`${work}-journal`, { force: true });
            rmSync(crashed, { force: true });
            rmSync(`${crashed}-journal`, { force: true });
            const db = addon.openCodec(work, key, CODEC_SQLCIPHER_FILES, {
              write,
              copy: crashed,
            });
            addon.exec(db, updateSql);
            addon.close(db);
            // Fewer writes than that: the transaction committed uncopied.
            if (!existsSync(crashed)) break;
            const wasHot = isHot(readJournal(crashed));

            const result = runSqlcipherFixture(fixture, [
              "count",
              crashed,
              hexKey,
            ]);
            assertEqual(
              result,
              layout === "SQLCipher"
                ? { status: 0, stdout: `${rows} 0 ok\n`, stderr: "" }
                : {
                    status: 1,
                    stdout: "",
                    stderr: "count: file is not a database\n",
                  },
            );
            // SQLCipher's rollback deletes a hot journal, and leaves one that
            // wasn't hot as it was.
            assert(
              wasHot
                ? !existsSync(`${crashed}-journal`)
                : !isHot(readJournal(crashed)),
              `Write ${write} of the ${layout} layout left a journal.`,
            );
            const rolledBack = addon.openCodec(
              crashed,
              key,
              CODEC_SQLCIPHER_FILES,
            );
            const counted = countRows(rolledBack);
            addon.close(rolledBack);
            assert(
              counted === `${rows} 0 ok`,
              `Write ${write} of the ${layout} layout left ${counted}.`,
            );
            crashes++;
          }
          assert(crashes > 100, `Only ${crashes} writes.`);
        }
      });

      it("rolls back a database's first transaction that SQLCipher crashed at every write", () => {
        const work = join(directory, "first-crash-work.db");
        const crashed = join(directory, "first-crash.db");
        let crashes = 0;
        for (let write = 1; ; write++) {
          rmSync(work, { force: true });
          rmSync(`${work}-journal`, { force: true });
          const result = runSqlcipherFixture(fixture, [
            "crash-create",
            work,
            hexKey,
            String(rows),
            String(write),
            crashed,
          ]);
          if (result.status === 0) break;
          assertEqual(
            { status: result.status, stderr: result.stderr },
            { status: 3, stderr: "" },
          );

          const db = addon.openCodec(crashed, key, CODEC_SQLCIPHER_FILES);
          const statement = addon.prepare(
            db,
            "select count(*) from sqlite_schema",
          );
          addon.step(statement);
          const tables = addon.column(statement, 0);
          addon.finalize(statement);
          addon.close(db);
          assert(tables === 0, `Write ${write} left ${String(tables)} tables.`);
          assert(
            !isHot(readJournal(crashed)),
            `Write ${write} left a hot journal.`,
          );
          assertEqual(readFileSync(crashed).length, 0);
          crashes++;
        }
        assert(crashes > 20, `Only ${crashes} writes.`);
      });
    });
  });

/** The fixture's create SQL, which the core runs to create the same table. */
const createSql =
  "create table t (id integer primary key, v text);" +
  "with recursive n(i) as (select 1 union all select i + 1 from n " +
  `where i < ${rows}) insert into t select i, 'evolu-secret-row' || i ` +
  "|| printf('%.3000c', 'x') from n";

/** The fixture's update transaction, which spills pages before it commits. */
const updateSql =
  "pragma cache_size = 5; begin; update t set v = 'updated' || id; commit";

/** The journal next to a database, or null. */
const readJournal = (database: string): Buffer | null =>
  existsSync(`${database}-journal`)
    ? readFileSync(`${database}-journal`)
    : null;

/**
 * Whether a journal is hot: not empty and without zeros in place of its magic,
 * as a crash before SQLite first synced it leaves it.
 */
const isHot = (journal: Buffer | null): journal is Buffer =>
  journal != null && journal.length > 0 && journal[0] !== 0;

describe("buildSqlcipherFixture", () => {
  it("extracts a release's amalgamation from its tarball and builds with each platform's crypto provider", async (t) => {
    const build = setupFakeBuild(t);
    const cacheDirectory = build.env.SQLITE_CORE_CACHE;
    const staged = join(build.directory, "staged");
    mkdirSync(join(staged, "package/vendor/sqlcipher"), { recursive: true });
    for (const name of ["sqlite3.c", "sqlite3.h"])
      writeFileSync(join(staged, "package/vendor/sqlcipher", name), name);
    const file = "expo-sqlite-0.0.0.tgz";
    run("tar", ["-czf", join(cacheDirectory, file), "-C", staged, "package"]);
    const expoSqlite = {
      version: "0.0.0",
      sqlcipher: "0.0.0",
      url: `https://registry.npmjs.org/expo-sqlite/-/${file}`,
      file,
      hash: createHash("sha3-256")
        .update(readFileSync(join(cacheDirectory, file)))
        .digest("hex"),
    };

    for (const platform of ["darwin", "linux"] as const)
      await buildSqlcipherFixture({
        expoSqlite,
        cacheDirectory,
        buildDirectory: build.env.SQLITE_CORE_BUILD,
        cc: build.cc,
        platform,
      });

    for (const name of ["sqlite3.c", "sqlite3.h"])
      assertEqual(
        readFileSync(join(cacheDirectory, "expo-sqlite-0.0.0", name), "utf8"),
        name,
      );
    // SQLCipher's and the fixture's compiles, then the link, for each.
    const platformArgs = new Set([
      "-DSQLCIPHER_CRYPTO_CC",
      "-DSQLCIPHER_CRYPTO_OPENSSL",
      "-framework",
      "Security",
      "CoreFoundation",
      "-lcrypto",
      "-lpthread",
      "-ldl",
      "-lm",
    ]);
    assertEqual(
      build
        .commands()
        .map((args) => args.filter((arg) => platformArgs.has(arg))),
      [
        ["-DSQLCIPHER_CRYPTO_CC"],
        ["-DSQLCIPHER_CRYPTO_CC"],
        ["-framework", "Security", "-framework", "CoreFoundation"],
        ["-DSQLCIPHER_CRYPTO_OPENSSL"],
        ["-DSQLCIPHER_CRYPTO_OPENSSL"],
        ["-lcrypto", "-lpthread", "-ldl", "-lm"],
      ],
    );
  });
});

describe("runSqlcipherFixture", () => {
  it("throws when the fixture can't run", (t) => {
    const { directory } = setupFakeBuild(t);

    assertThrows(
      () => runSqlcipherFixture(join(directory, "fixture"), []),
      (error) => {
        assertEqual((error as NodeJS.ErrnoException).code, "ENOENT");
      },
    );
  });
});
