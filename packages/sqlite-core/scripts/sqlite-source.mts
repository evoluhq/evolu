/**
 * The one SQLite input of Evolu's SQLite core: the source zip sqlite.org
 * publishes, pinned by the SHA3-256 on its download page and by the check-in of
 * its tree. Native builds compile the amalgamation `make sqlite3.c` generates
 * from that tree, so every target compiles the same SQLite.
 *
 * @module
 */
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
import { join } from "node:path";
import { run, writeAtomically } from "./compile.mts";

/** A source archive pinned by its URL, cache file name and SHA3-256. */
export interface PinnedArchive {
  readonly url: string;
  readonly file: string;
  readonly hash: string;
}

/** The SQLite source zip, pinned also by its tree's check-in and version. */
export interface PinnedSqliteSource extends PinnedArchive {
  readonly directory: string;
  readonly checkIn: string;
  readonly version: string;
}

export const sqliteSource: PinnedSqliteSource = {
  url: "https://sqlite.org/2026/sqlite-src-3540100.zip",
  file: "sqlite-src-3540100.zip",
  hash: "877c6f4996ce7adb368686bce21638de9e3d91534832ad3d9d119037d1bc22ad",
  directory: "sqlite-src-3540100",
  checkIn: "555e07ef33f69a0957d24d8e555b702464a131d6f1607f4c3c1e4551e8e6ca76",
  version: "3.54.1",
};

/** Returns the path of a pinned archive in the cache, downloading it first. */
export const fetchPinned = async (
  archive: PinnedArchive,
  cacheDirectory: string,
): Promise<string> => {
  const path = join(cacheDirectory, archive.file);
  if (existsSync(path)) {
    checkHash(path, readFileSync(path), archive.hash);
    return path;
  }
  const response = await fetch(archive.url);
  if (!response.ok) throw new Error(`${archive.url}: HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  checkHash(archive.url, bytes, archive.hash);
  mkdirSync(cacheDirectory, { recursive: true });
  writeAtomically(path, (output) => {
    writeFileSync(output, bytes);
  });
  return path;
};

/** Checks that an unpacked SQLite tree is the pinned check-in. */
export const checkManifestUuid = (tree: string, checkIn: string): void => {
  const path = join(tree, "manifest.uuid");
  const actual = readFileSync(path, "utf8").trim();
  if (actual !== checkIn)
    throw new Error(`${path}: check-in ${actual}, pinned ${checkIn}`);
};

/** The amalgamation generated from a pinned SQLite source. */
export interface PreparedSqlite {
  readonly directory: string;
  readonly sqlite3c: string;
  readonly sqlite3h: string;
}

// The arguments of ./configure and make that generate the amalgamation.
const configureArgs: ReadonlyArray<string> = [];
const makeArgs: ReadonlyArray<string> = ["sqlite3.c"];

// The variables configure and make read, which would change the amalgamation
// without changing its stamp, so they never reach them.
const amalgamationVariables: ReadonlySet<string> = new Set([
  "CFLAGS",
  "CPPFLAGS",
  "OPTS",
  "OPTIONS",
  "EXTRA_SRC",
  "AMALGAMATION_GEN_FLAGS",
  "MAKEFLAGS",
  "GNUMAKEFLAGS",
]);

/**
 * The stamp of an amalgamation generated from `source`. How it's generated is
 * part of it, so a change to that generates the amalgamation again in every
 * cache.
 */
export const amalgamationStamp = (source: PinnedSqliteSource): string =>
  JSON.stringify({
    hash: source.hash,
    checkIn: source.checkIn,
    configure: configureArgs,
    make: makeArgs,
  });

/**
 * Returns the amalgamation of `source` from the cache, generating it first: it
 * fetches and verifies the zip, unpacks it in a new work directory under
 * `temporaryDirectory`, checks the check-in, runs `./configure` and `make
 * sqlite3.c`, and copies `sqlite3.c` and `sqlite3.h` into the cache. A stamp
 * written last names the source, so an interrupted run generates the
 * amalgamation again.
 */
export const prepareSqlite = async ({
  source,
  cacheDirectory,
  temporaryDirectory,
}: {
  source: PinnedSqliteSource;
  cacheDirectory: string;
  temporaryDirectory: string;
}): Promise<PreparedSqlite> => {
  const directory = join(cacheDirectory, source.directory);
  const prepared: PreparedSqlite = {
    directory,
    sqlite3c: join(directory, "sqlite3.c"),
    sqlite3h: join(directory, "sqlite3.h"),
  };
  const stampPath = join(directory, "source.json");
  const stamp = amalgamationStamp(source);
  if (
    existsSync(prepared.sqlite3c) &&
    existsSync(prepared.sqlite3h) &&
    existsSync(stampPath) &&
    readFileSync(stampPath, "utf8") === stamp
  )
    return prepared;

  const zip = await fetchPinned(source, cacheDirectory);
  mkdirSync(temporaryDirectory, { recursive: true });
  const work = mkdtempSync(join(temporaryDirectory, "sqlite-src-"));
  try {
    run("unzip", ["-q", zip], work);
    const tree = join(work, source.directory);
    checkManifestUuid(tree, source.checkIn);
    const env = Object.fromEntries(
      Object.entries(process.env).filter(
        ([name]) => !amalgamationVariables.has(name),
      ),
    );
    run("./configure", configureArgs, tree, env);
    run("make", makeArgs, tree, env);
    mkdirSync(directory, { recursive: true });
    // Test files run in parallel processes, which may generate the cache at the
    // same time, so every file is written atomically and the stamp last.
    for (const name of ["sqlite3.c", "sqlite3.h"])
      writeAtomically(join(directory, name), (output) => {
        copyFileSync(join(tree, name), output);
      });
    writeAtomically(stampPath, (output) => {
      writeFileSync(output, stamp);
    });
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
  return prepared;
};

/** Throws when the bytes from `source` do not have the pinned SHA3-256. */
const checkHash = (source: string, bytes: Uint8Array, hash: string): void => {
  const actual = createHash("sha3-256").update(bytes).digest("hex");
  if (actual !== hash)
    throw new Error(`${source}: sha3-256 ${actual}, pinned ${hash}`);
};
