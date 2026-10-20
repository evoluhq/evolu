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
  });

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
