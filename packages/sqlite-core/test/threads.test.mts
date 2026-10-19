import { assert, assertFalse, assertTrue } from "@evolu/common";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { it } from "node:test";
import {
  sourceDirectory,
  vendoredPublicIncludes,
} from "../scripts/compile.mts";
import {
  defaultBuildDirectory,
  defaultCacheDirectory,
} from "../scripts/paths.mts";
import { prepareSqlite, sqliteSource } from "../scripts/sqlite-source.mts";

/** The assembly clang compiles evolu_codec.c to, with extra flags. */
const codecAssembly = async (flags: ReadonlyArray<string>): Promise<string> => {
  const sqlite = await prepareSqlite({
    source: sqliteSource,
    cacheDirectory: defaultCacheDirectory(process.env),
    temporaryDirectory: defaultBuildDirectory(process.env),
  });
  const result = spawnSync(
    "clang",
    [
      "-std=c11",
      "-S",
      "-o",
      "-",
      `-I${sqlite.directory}`,
      `-I${sourceDirectory}`,
      ...vendoredPublicIncludes(),
      ...flags,
      join(sourceDirectory, "evolu_codec.c"),
    ],
    { encoding: "utf8" },
  );
  assert(result.status === 0, result.stderr);
  return result.stdout;
};

// The core's files include only sqlite3.h, so natively SQLITE_THREADSAFE,
// which sqlite_config.h sets for sqlite3.c alone, is undefined there.
it(
  "serializes codec registration with SQLite's mutex natively",
  { timeout: 600_000 },
  async () => {
    assertTrue((await codecAssembly([])).includes("sqlite3_mutex_enter"));
  },
);

// The wasm build has no mutex functions to link.
it(
  "calls no SQLite mutex function with SQLITE_THREADSAFE=0, as the wasm build compiles the core",
  { timeout: 600_000 },
  async () => {
    assertFalse(
      (await codecAssembly(["-DSQLITE_THREADSAFE=0"])).includes(
        "sqlite3_mutex_",
      ),
    );
  },
);
