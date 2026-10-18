/**
 * The SQLCipher that expo-sqlite vendors, built on the host as
 * test/sqlcipher/fixture.c, so the codec's tests read and write the databases
 * and hot journals that Evolu's expo-sqlite driver left on devices. Each
 * expo-sqlite release is fetched from npm, pinned by the SHA3-256 of its
 * tarball, whose SHA-512 was checked against the integrity npm publishes.
 * SQLCipher is compiled with the flags of expo-sqlite's iOS pod that shape its
 * files, with CommonCrypto on macOS, as on iOS, and OpenSSL elsewhere, as on
 * Android.
 *
 * @module
 */
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { compileCached, run, writeAtomically } from "../scripts/compile.mts";
import { fetchPinned, type PinnedArchive } from "../scripts/sqlite-source.mts";

/** An expo-sqlite release whose vendored SQLCipher the tests build. */
export interface ExpoSqlite extends PinnedArchive {
  readonly version: string;
  /** The SQLCipher version it vendors. */
  readonly sqlcipher: string;
}

export const expoSqliteReleases: ReadonlyArray<ExpoSqlite> = [
  {
    version: "57.0.4",
    sqlcipher: "4.7.0",
    url: "https://registry.npmjs.org/expo-sqlite/-/expo-sqlite-57.0.4.tgz",
    file: "expo-sqlite-57.0.4.tgz",
    // npm's integrity: sha512-3N/bnDx4+kWEC9GABxKPLe/6RHTZJR/7DNT5tz/cYi8f7emign3ooavXnJn0+JPBA0JhHmsdDPrmC+CtT86Jzg==
    hash: "18a4cb64cdd5b33cab801ecc1c96083a715488280b407a2d57efc2a9c5ef3b8e",
  },
  {
    version: "58.0.13",
    sqlcipher: "4.17.0",
    url: "https://registry.npmjs.org/expo-sqlite/-/expo-sqlite-58.0.13.tgz",
    file: "expo-sqlite-58.0.13.tgz",
    // npm's integrity: sha512-EqYQTJUJ2Ub+Q/PwM8UTQBeg1/+piuhG8KQTO8HOhZfYu8e34bB3sOkGsM0HQ7KNesvWLlN8UmbrajRQRyE3gg==
    hash: "988bd1313cbbd04ff5575f555d68254a8f15fcddb5be609091d568a23e128c2e",
  },
];

const fixtureSource = /*#__PURE__*/ fileURLToPath(
  /*#__PURE__*/ new URL("sqlcipher/fixture.c", import.meta.url),
);

/**
 * Builds the fixture against a release's SQLCipher and returns its path. The
 * extracted amalgamation and the objects compiled from it and the fixture are
 * cached.
 */
export const buildSqlcipherFixture = async ({
  expoSqlite,
  cacheDirectory,
  buildDirectory,
  cc = "clang",
}: {
  expoSqlite: ExpoSqlite;
  cacheDirectory: string;
  buildDirectory: string;
  cc?: string;
}): Promise<string> => {
  const directory = join(cacheDirectory, `expo-sqlite-${expoSqlite.version}`);
  const sqlite3c = join(directory, "sqlite3.c");
  if (!existsSync(sqlite3c)) {
    const tarball = await fetchPinned(expoSqlite, cacheDirectory);
    mkdirSync(buildDirectory, { recursive: true });
    const work = mkdtempSync(join(buildDirectory, "expo-sqlite-"));
    try {
      const vendor = "package/vendor/sqlcipher";
      run("tar", [
        "-xzf",
        tarball,
        "-C",
        work,
        `${vendor}/sqlite3.c`,
        `${vendor}/sqlite3.h`,
      ]);
      mkdirSync(directory, { recursive: true });
      // The header first, so sqlite3.c's presence means both are there.
      for (const name of ["sqlite3.h", "sqlite3.c"])
        writeAtomically(join(directory, name), (output) => {
          run("cp", [join(work, vendor, name), output]);
        });
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  }

  const isMac = process.platform === "darwin";
  // The flags of ExpoSQLite.podspec that shape SQLCipher's files, with the
  // crypto provider of each platform. Its feature flags, such as FTS, the
  // session extension or API armor, change no page or journal format.
  const flags = [
    "-O1",
    `-I${directory}`,
    "-DHAVE_USLEEP=1",
    "-DSQLITE_ENABLE_LOCKING_STYLE=0",
    "-DSQLITE_TEMP_STORE=2",
    "-DSQLITE_HAS_CODEC=1",
    isMac ? "-DSQLCIPHER_CRYPTO_CC" : "-DSQLCIPHER_CRYPTO_OPENSSL",
    "-DSQLITE_EXTRA_INIT=sqlcipher_extra_init",
    "-DSQLITE_EXTRA_SHUTDOWN=sqlcipher_extra_shutdown",
    "-DNDEBUG",
  ];
  const outputDirectory = join(
    buildDirectory,
    `sqlcipher-${expoSqlite.version}`,
  );
  const sqlcipherObject = compileCached({
    cc,
    // SQLCipher 4.7.0 uses uint64_t, which SQLite 3.49.1 declares only with
    // HAVE_STDINT_H, as SQLCipher's configure defines it. Apple's and Android's
    // headers include stdint.h anyway; glibc's don't. Including stdint.h before
    // the source instead would hide mremap, as glibc would then set its
    // features before SQLite defines _GNU_SOURCE.
    flags: [...flags, "-DHAVE_STDINT_H=1", "-w"],
    source: sqlite3c,
    objectsDirectory: outputDirectory,
  });
  // The fixture is Evolu's own C, which compiles as the rest of it does.
  const fixtureObject = compileCached({
    cc,
    flags: [...flags, "-Wall", "-Wextra", "-Werror"],
    source: fixtureSource,
    extraKey: () => readFileSync(join(directory, "sqlite3.h"), "utf8"),
    objectsDirectory: outputDirectory,
  });
  const fixture = join(outputDirectory, "fixture");
  writeAtomically(fixture, (output) => {
    run(cc, [
      fixtureObject,
      sqlcipherObject,
      ...(isMac
        ? ["-framework", "Security", "-framework", "CoreFoundation"]
        : ["-lcrypto", "-lpthread", "-ldl", "-lm"]),
      "-o",
      output,
    ]);
  });
  return fixture;
};

/** The result of running the fixture. */
export interface SqlcipherFixtureResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

export const runSqlcipherFixture = (
  fixture: string,
  args: ReadonlyArray<string>,
): SqlcipherFixtureResult => {
  const result = spawnSync(fixture, args, {
    encoding: "utf8",
    timeout: 60_000,
    killSignal: "SIGKILL",
  });
  if (result.error) throw result.error;
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
};
