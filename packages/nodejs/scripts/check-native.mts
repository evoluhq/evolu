/**
 * Checks Evolu's SQLite addons for Node.js, which `build-native.mts` builds.
 *
 * - {@link checkNativeSqlite} reads an addon's header: a macOS addon must be a
 *   64-bit Mach-O bundle for its CPU whose oldest macOS is 13.5, and a Linux
 *   addon a 64-bit ELF for its CPU that needs its C library and no other, and
 *   for glibc, no symbol newer than glibc 2.28.
 * - {@link checkLoadedNativeSqlite} loads the running platform's addon as
 *   `@evolu/nodejs` loads it and opens an encrypted, a plaintext and a memory
 *   database with it.
 *
 * It imports only Node.js's own modules at run time, as `build-native.mts`
 * does, so CI checks each addon in its target's environment before installing
 * anything.
 *
 * - {@link checkReproducedNativeSqlite} builds the addon again from a copy of its
 *   sources at another path, into another build directory, and fails unless the
 *   bytes are the same.
 *
 * Usage: `node packages/nodejs/scripts/check-native.mts --target=<target>`
 * checks `native/<target>/evolu.node`, with `--load` also loads it, which only
 * the target's platform can, and with `--reproduce` also builds it again, which
 * only a platform that builds the target can. `--pack`, which the package's
 * prepack runs, checks every target's addon and copies them into
 * `dist/native`.
 *
 * @module
 */
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { defaultCacheDirectory } from "../../sqlite-core/scripts/paths.mts";
import {
  loadNativeSqlite,
  nativeSqliteTargets,
  nativeSqliteUrl,
  type NativeSqliteTarget,
} from "../src/NativeSqlite.ts";

/** The newest glibc an addon for glibc may need, Node.js 24's oldest. */
const glibcVersionMax = [2, 28] as const;

/** The oldest macOS a macOS addon must run on, as `major.minor`. */
const macosVersionMin = "13.5";

/** Throws when `bytes` aren't an addon for `target`, naming what differs. */
export const checkNativeSqlite = (
  target: NativeSqliteTarget,
  bytes: Uint8Array,
): void => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const fail = (problem: string): never => {
    throw new Error(`The addon for ${target} ${problem}.`);
  };
  if (target.startsWith("darwin-")) {
    if (bytes.length < 32 || view.getUint32(0, true) !== 0xfeedfacf)
      fail("isn't a 64-bit Mach-O file");
    const cpuType = target === "darwin-arm64" ? 0x0100000c : 0x01000007;
    if (view.getUint32(4, true) !== cpuType) fail("is for another CPU");
    // MH_BUNDLE, as Node.js loads addons.
    if (view.getUint32(12, true) !== 8) fail("isn't a bundle");
    const commands = view.getUint32(16, true);
    let minos: string | null = null;
    for (let index = 0, offset = 32; index < commands; index++) {
      const command = view.getUint32(offset, true);
      // LC_BUILD_VERSION, whose minos is X.Y.Z as xxxx.yy.zz in nibbles.
      if (command === 0x32) {
        const version = view.getUint32(offset + 12, true);
        minos = `${version >>> 16}.${(version >>> 8) & 0xff}`;
      }
      offset += view.getUint32(offset + 4, true);
    }
    if (minos === null) fail("has no build version");
    if (minos !== macosVersionMin)
      fail(`runs on macOS ${minos}, not ${macosVersionMin}`);
    return;
  }
  if (
    bytes.length < 64 ||
    view.getUint32(0, false) !== 0x7f454c46 ||
    bytes[4] !== 2
  )
    fail("isn't a 64-bit ELF file");
  const machine = target.startsWith("linux-arm64-") ? 183 : 62;
  if (view.getUint16(18, true) !== machine) fail("is for another CPU");
  // The names of the libraries it needs and the symbol versions it requires
  // are strings in its dynamic string table, which its tail holds.
  const text = new TextDecoder("latin1").decode(bytes);
  const needsGlibc = text.includes("\0libc.so.6\0");
  const needsMusl = /\0libc\.musl-(?:x86_64|aarch64)\.so\.1\0/u.test(text);
  if (target.endsWith("-gnu")) {
    if (!needsGlibc || needsMusl) fail("doesn't need glibc alone");
    for (const [, major, minor] of text.matchAll(
      /\0GLIBC_(\d+)\.(\d+)(?:\.\d+)?\0/gu,
    ))
      if (
        Number(major) > glibcVersionMax[0] ||
        (Number(major) === glibcVersionMax[0] &&
          Number(minor) > glibcVersionMax[1])
      )
        fail(
          `needs glibc ${major}.${minor}, newer than ${glibcVersionMax.join(".")}`,
        );
  } else if (!needsMusl || needsGlibc) fail("doesn't need musl alone");
};

/**
 * Loads the running platform's addon as `@evolu/nodejs` does, throwing unless
 * it's `target`'s, and checks that it opens databases: an encrypted one that
 * stores no plaintext and reopens with its key, which fails another key and an
 * encrypted open of a plaintext file with SQLITE_NOTADB, a plaintext one, and a
 * memory one.
 */
export const checkLoadedNativeSqlite = (target: NativeSqliteTarget): void => {
  const nativeSqlite = loadNativeSqlite();
  // Node.js keeps the addons it loaded in the cache of required modules.
  const { cache } = createRequire(import.meta.url);
  if (cache[fileURLToPath(nativeSqliteUrl(target))] === undefined)
    throw new Error(`The loader didn't load the addon for ${target}.`);
  const directory = mkdtempSync(join(tmpdir(), "evolu-check-native-"));
  try {
    const query = (
      database: ReturnType<typeof nativeSqlite.openMemory>,
      sql: string,
    ) => {
      const statement = database.prepare(sql);
      try {
        return statement.run([]).rows;
      } finally {
        statement.finalize();
      }
    };
    const key = new Uint8Array(32).fill(7);
    const encrypted = join(directory, "encrypted.db");
    const plain = join(directory, "plain.db");

    const writing = nativeSqlite.openEncryptedFile(encrypted, key);
    query(writing, "create table t (a text)");
    query(writing, "insert into t values ('evolu-secret')");
    writing.close();
    const file = readFileSync(encrypted);
    if (file.includes("evolu-secret") || file.includes("SQLite format 3"))
      throw new Error("An encrypted database stored plaintext.");
    const reading = nativeSqlite.openEncryptedFile(encrypted, key);
    const rows = JSON.stringify(query(reading, "select a from t"));
    reading.close();
    if (rows !== '[{"a":"evolu-secret"}]')
      throw new Error(`An encrypted database read ${rows}.`);

    const writingPlain = nativeSqlite.openFile(plain);
    query(writingPlain, "create table t (a)");
    writingPlain.close();
    if (
      !readFileSync(plain)
        .subarray(0, 16)
        .equals(Buffer.from("SQLite format 3\0"))
    )
      throw new Error("A plaintext database isn't an SQLite file.");

    for (const [path, openKey] of [
      [encrypted, new Uint8Array(32).fill(9)],
      [plain, key],
    ] as const) {
      let code: unknown = null;
      try {
        nativeSqlite.openEncryptedFile(path, openKey).close();
      } catch (error) {
        code = ((error as Error).cause as { readonly extendedCode?: unknown })
          .extendedCode;
      }
      if (code !== 26)
        throw new Error(
          `An encrypted open of ${path} failed with ${String(code)}, not SQLITE_NOTADB.`,
        );
    }

    const memory = nativeSqlite.openMemory();
    const version = JSON.stringify(
      query(memory, "select sqlite_version() as v"),
    );
    memory.close();
    if (!/^\[\{"v":"3\.\d+\.\d+"\}\]$/u.test(version))
      throw new Error(`A memory database read ${version}.`);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};

/**
 * Builds `target`'s addon again from a copy of the sources it compiles,
 * `@evolu/sqlite-core`'s and this package's scripts and src, at another path,
 * into another build directory, with the SQLite source the first build cached,
 * and throws unless the bytes equal `native/<target>/evolu.node`'s.
 */
export const checkReproducedNativeSqlite = (
  target: NativeSqliteTarget,
): void => {
  const repository = fileURLToPath(new URL("../../../", import.meta.url));
  const copy = mkdtempSync(join(tmpdir(), "evolu-reproduce-native-"));
  try {
    for (const path of [
      "packages/sqlite-core/binding",
      "packages/sqlite-core/node",
      "packages/sqlite-core/scripts",
      "packages/sqlite-core/src",
      "packages/sqlite-core/vendor",
      "packages/nodejs/package.json",
      "packages/nodejs/scripts",
      "packages/nodejs/src",
    ])
      cpSync(join(repository, path), join(copy, "repository", path), {
        recursive: true,
      });
    const built = spawnSync(
      process.execPath,
      [
        join(copy, "repository/packages/nodejs/scripts/build-native.mts"),
        `--target=${target}`,
      ],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          SQLITE_CORE_BUILD: join(copy, "build"),
          SQLITE_CORE_CACHE: defaultCacheDirectory(process.env),
        },
      },
    );
    if (built.status !== 0)
      throw new Error(`The second build of ${target} failed: ${built.stderr}`);
    const first = readFileSync(nativeSqliteUrl(target));
    const second = readFileSync(
      join(copy, `repository/packages/nodejs/native/${target}/evolu.node`),
    );
    if (!first.equals(second))
      throw new Error(
        `The addon for ${target} built from another path into another build directory differs from the first build.`,
      );
  } finally {
    rmSync(copy, { recursive: true, force: true });
  }
};

/**
 * Checks every target's addon in `native`, as `<target>/evolu.node`, and copies
 * them into `dist`, which it replaces only once every addon passes.
 */
export const packNativeSqlite = ({
  native,
  dist,
}: {
  native: string;
  dist: string;
}): void => {
  const addon = (target: NativeSqliteTarget) =>
    join(native, target, "evolu.node");
  const missing = nativeSqliteTargets.filter(
    (target) => !existsSync(addon(target)),
  );
  if (missing.length > 0)
    throw new Error(
      `native/ lacks the addons for ${missing.join(", ")}, which CI builds, so the package can't be packed.`,
    );
  for (const target of nativeSqliteTargets)
    checkNativeSqlite(target, readFileSync(addon(target)));
  rmSync(dist, { recursive: true, force: true });
  for (const target of nativeSqliteTargets)
    cpSync(addon(target), join(dist, target, "evolu.node"));
};

if (import.meta.main) {
  const { values } = parseArgs({
    options: {
      target: { type: "string" },
      load: { type: "boolean", default: false },
      reproduce: { type: "boolean", default: false },
      pack: { type: "boolean", default: false },
    },
  });
  if (values.pack)
    packNativeSqlite({
      native: fileURLToPath(new URL("../native/", import.meta.url)),
      dist: fileURLToPath(new URL("../dist/native/", import.meta.url)),
    });
  else {
    const target = values.target as NativeSqliteTarget | undefined;
    if (target === undefined || !nativeSqliteTargets.includes(target))
      throw new Error(
        `--target must be one of ${nativeSqliteTargets.join(", ")}.`,
      );
    checkNativeSqlite(target, readFileSync(nativeSqliteUrl(target)));
    if (values.load) checkLoadedNativeSqlite(target);
    if (values.reproduce) checkReproducedNativeSqlite(target);
  }
}
