/**
 * The loader of Evolu's SQLite addon, the Node-API module of Evolu's SQLite
 * core, whose binding `@evolu/common`'s {@link NativeSqlite} types.
 * `@evolu/nodejs` ships it prebuilt for each of {@link nativeSqliteTargets} as
 * `dist/native/<target>/evolu.node`, beside the compiled modules in `dist/src`.
 * In the repository, the sources load `native/<target>/evolu.node`, which
 * `scripts/build-native.mts` builds.
 *
 * It imports only Node.js's own modules and the row builder beside it at run
 * time, so CI checks each prebuilt addon with it in its target's environment,
 * where nothing else is installed.
 *
 * @module
 */
import type { NativeSqlite, NativeSqliteDatabase } from "@evolu/common";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import {
  createNativeSqliteRowBuilder,
  type NativeSqliteRowBuilder,
} from "./NativeSqliteRows.ts";

/**
 * The targets `@evolu/nodejs` ships Evolu's SQLite for, Node.js 24's own
 * floors: macOS 13.5 or later and Linux with glibc 2.28 or later or with musl,
 * each on arm64 and x64.
 */
export const nativeSqliteTargets = [
  "darwin-arm64",
  "darwin-x64",
  "linux-arm64-gnu",
  "linux-arm64-musl",
  "linux-x64-gnu",
  "linux-x64-musl",
] as const;

export type NativeSqliteTarget = (typeof nativeSqliteTargets)[number];

/** What {@link nativeSqliteTarget} reads of a platform. */
export interface NativeSqlitePlatform {
  readonly platform: NodeJS.Platform;
  readonly arch: NodeJS.Architecture;
  /** Whether the C library on Linux is musl, which it reads only on Linux. */
  readonly isMusl: () => boolean;
}

/**
 * Returns the target of a platform, or null for one `@evolu/nodejs` ships no
 * SQLite for, such as Windows.
 */
export const nativeSqliteTarget = ({
  platform,
  arch,
  isMusl,
}: NativeSqlitePlatform): NativeSqliteTarget | null => {
  if (arch !== "arm64" && arch !== "x64") return null;
  if (platform === "darwin") return `darwin-${arch}`;
  if (platform === "linux") return `linux-${arch}-${isMusl() ? "musl" : "gnu"}`;
  return null;
};

/** What {@link createIsMusl} reads. */
export interface IsMuslDeps {
  /** Returns the text of `/proc/self/maps`, and throws when it can't. */
  readonly readProcessMaps: () => string;
  /**
   * The diagnostic report of Node.js, `process.report`, whose `excludeNetwork`,
   * in Node.js since 22.13, `@types/node` 24 doesn't declare.
   */
  readonly report: {
    excludeNetwork: boolean;
    readonly getReport: () => object;
  };
}

/**
 * Creates a function that tells whether the process runs on musl, which it
 * reads at its first call. The process maps musl's dynamic linker,
 * `ld-musl-<arch>.so.1`, which is also its C library, so `/proc/self/maps`
 * names it. Where `/proc` can't be read, the diagnostic report tells, whose
 * header names the glibc a build against glibc runs on. A report waits for
 * every worker thread of the process, so it's only the fallback. It skips the
 * network, which it would otherwise list, and the setting is restored.
 */
export const createIsMusl = ({
  readProcessMaps,
  report,
}: IsMuslDeps): (() => boolean) => {
  let isMusl: boolean | null = null;

  const read = (): boolean => {
    let maps: string | null = null;
    try {
      maps = readProcessMaps();
    } catch {
      // Read the report instead.
    }
    if (maps !== null) return maps.includes("/ld-musl-");
    const { excludeNetwork } = report;
    report.excludeNetwork = true;
    try {
      const { header } = report.getReport() as {
        readonly header: { readonly glibcVersionRuntime?: string };
      };
      return header.glibcVersionRuntime === undefined;
    } finally {
      report.excludeNetwork = excludeNetwork;
    }
  };

  return () => (isMusl ??= read());
};

/** Whether the running process runs on musl, by {@link createIsMusl}. */
export const isMusl = /*#__PURE__*/ createIsMusl({
  readProcessMaps: () => readFileSync("/proc/self/maps", "utf8"),
  report: process.report as NodeJS.ProcessReport & { excludeNetwork: boolean },
});

/** The platform Node.js runs on. */
const runningPlatform: NativeSqlitePlatform = {
  platform: process.platform,
  arch: process.arch,
  isMusl,
};

/** The file of the addon for `target`. */
export const nativeSqliteUrl = (target: NativeSqliteTarget): URL =>
  new URL(`../native/${target}/evolu.node`, import.meta.url);

/** The {@link NativeSqlite.abiVersion} the loader checks. */
const nativeSqliteAbiVersion = 2;

/**
 * The pages a connection caches, in KiB, as SQLite's negative `cache_size`
 * counts them.
 */
const cacheSizeKibibytes = 16_000;

/**
 * Loads the addon for the platform, the running one unless given, with
 * `requireAddon`, Node.js's `require` unless given, and returns its binding,
 * configured by {@link configureNativeSqlite}, whose rows have rowPrototype:
 * `@evolu/nodejs` passes `@evolu/common`'s `emptyPrototype`, which this module
 * doesn't import, so it imports only Node.js's own modules and the row builder
 * beside it at run time. A Node.js environment keeps the row builder of its
 * first load, so a later load there, such as one of a test runner's fresh
 * module registry or vm context, builds its rows with the first load's
 * rowPrototype and keeps the first load's realm alive, which is safe, since
 * `isPlainObject` accepts another copy's `emptyPrototype` too. It throws for a
 * platform `@evolu/nodejs` ships no SQLite for, an addon it can't load, and an
 * addon of another version of the binding.
 */
export const loadNativeSqlite = ({
  rowPrototype,
  platform = runningPlatform,
  requireAddon = createRequire(import.meta.url),
}: {
  rowPrototype: object;
  platform?: NativeSqlitePlatform;
  requireAddon?: (path: string) => unknown;
}): NativeSqlite => {
  const target = nativeSqliteTarget(platform);
  if (target === null) {
    const name =
      platform.platform === "linux"
        ? `linux-${platform.arch}-${platform.isMusl() ? "musl" : "gnu"}`
        : `${platform.platform}-${platform.arch}`;
    throw new Error(
      `@evolu/nodejs has no SQLite for ${name}. It ships Evolu's SQLite for ${nativeSqliteTargets.join(", ")}.`,
    );
  }
  const path = fileURLToPath(nativeSqliteUrl(target));
  let addon: {
    readonly createBinding: (
      rowBuilder: NativeSqliteRowBuilder,
    ) => NativeSqlite;
  };
  try {
    addon = requireAddon(path) as typeof addon;
  } catch (cause) {
    throw new Error(
      `@evolu/nodejs can't load its SQLite for ${target}, ${path}. In the Evolu repository, build it with node packages/nodejs/scripts/build-native.mts.`,
      { cause },
    );
  }
  const binding = addon.createBinding(
    createNativeSqliteRowBuilder(rowPrototype),
  );
  if (binding.abiVersion !== nativeSqliteAbiVersion)
    throw new Error(
      `@evolu/nodejs's SQLite at ${path} implements version ${binding.abiVersion} of its binding, but this JavaScript needs version ${nativeSqliteAbiVersion}.`,
    );
  return configureNativeSqlite(binding);
};

/**
 * Returns the binding with what a file connection on Node.js needs, beyond the
 * 5 seconds the addon's connections wait for a lock another process holds: it
 * caches up to about 16 MB of pages. An open whose setting fails closes the
 * connection and throws.
 */
export const configureNativeSqlite = (binding: NativeSqlite): NativeSqlite => ({
  ...binding,
  openFile: (path) => configureFile(binding.openFile(path)),
  openEncryptedFile: (path, key) =>
    configureFile(binding.openEncryptedFile(path, key)),
});

const configureFile = (
  database: NativeSqliteDatabase,
): NativeSqliteDatabase => {
  try {
    database.run(`pragma cache_size = -${cacheSizeKibibytes}`, []);
  } catch (error) {
    database.close();
    throw error;
  }
  return database;
};
