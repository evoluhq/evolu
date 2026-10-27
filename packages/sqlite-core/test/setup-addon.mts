/**
 * Builds and loads the test-only addon for a test file. With
 * `SQLITE_CORE_SANITIZE=1`, it builds the addon with AddressSanitizer and
 * UndefinedBehaviorSanitizer, which addon-sanitized.test.mts sets for a Node.js
 * process it starts with the sanitizer runtime preloaded, after building that
 * addon itself. With `SQLITE_CORE_COVERAGE=1`, it builds the addon with
 * node/binding.c and node/module.c instrumented for coverage, which
 * `@evolu/react-native`'s NativeSqliteCoverage.test.ts sets for a Node.js
 * process it starts with `LLVM_PROFILE_FILE` set.
 *
 * @module
 */
import { buildAddon } from "../scripts/build-addon.mts";
import {
  defaultBuildDirectory,
  defaultCacheDirectory,
} from "../scripts/paths.mts";
import { prepareSqlite, sqliteSource } from "../scripts/sqlite-source.mts";
import {
  createNativeSqliteRowBuilder,
  loadAddon,
  type SqliteCoreAddon,
} from "./addon.mts";

export { createNativeSqliteRowBuilder, loadAddon };

/**
 * The timeout of a hook that sets up the addon: the first build compiles SQLite
 * and can generate its amalgamation.
 */
export const setupAddonTimeout = 600_000;

/**
 * Builds the addon for a test file and returns its path, sanitized with
 * `sanitize`, which is whether `SQLITE_CORE_SANITIZE=1` by default, and
 * instrumented for coverage with `coverage`, which is whether
 * `SQLITE_CORE_COVERAGE=1` by default.
 */
export const setupAddonPath = async ({
  sanitize = process.env.SQLITE_CORE_SANITIZE === "1",
  coverage = process.env.SQLITE_CORE_COVERAGE === "1",
}: {
  sanitize?: boolean;
  coverage?: boolean;
} = {}): Promise<string> => {
  const buildDirectory = defaultBuildDirectory(process.env);
  const sqlite = await prepareSqlite({
    source: sqliteSource,
    cacheDirectory: defaultCacheDirectory(process.env),
    temporaryDirectory: buildDirectory,
  });
  return buildAddon({
    sqlite,
    outputDirectory: buildDirectory,
    sanitize,
    coverage,
  });
};

export const setupAddon = async (): Promise<SqliteCoreAddon> =>
  loadAddon(await setupAddonPath());
