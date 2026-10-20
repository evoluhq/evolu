/**
 * A fake clang for the tests of the build scripts, so a build compiles nothing
 * and a test sees each command.
 *
 * @module
 */
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TestContext } from "node:test";
import {
  amalgamationStamp,
  type PreparedSqlite,
  sqliteSource,
} from "../scripts/sqlite-source.mts";

/** A fake clang and the directories of a build with it. */
export interface FakeBuild {
  /** The directory of the fake clang. */
  readonly directory: string;
  readonly cc: string;
  /** Points the scripts at the build and cache directories. */
  readonly env: {
    readonly SQLITE_CORE_BUILD: string;
    readonly SQLITE_CORE_CACHE: string;
  };
  /** The stand-in amalgamation in the cache. */
  readonly sqlite: PreparedSqlite;
  /** The arguments of each compile and link, in order. */
  readonly commands: () => ReadonlyArray<ReadonlyArray<string>>;
}

/**
 * Sets up a fake clang in a new directory, with a build directory and a cache
 * holding a stand-in for the pinned SQLite's amalgamation, stamped as
 * prepareSqlite stamps it, so nothing is downloaded or generated.
 *
 * The fake clang writes an empty file for each compile and link, or for a link
 * a copy of the `program` file in its directory when there is one, and records
 * the arguments of each. Asked for a file with -print-file-name, it prints the
 * file's path in its directory when the file is there and otherwise the name,
 * as clang does; asked for a program with -print-prog-name, the program's path
 * in its directory.
 */
export const setupFakeBuild = (t: TestContext): FakeBuild => {
  const directory = mkdtempSync(join(tmpdir(), "evolu-sqlite-core-fake-"));
  t.after(() => {
    rmSync(directory, { recursive: true, force: true });
  });
  const cc = join(directory, "cc");
  writeFileSync(
    cc,
    [
      "#!/bin/sh",
      'directory=$(dirname "$0")',
      'case "$1" in',
      "  --version) echo 'fake clang'; exit ;;",
      "  -print-file-name=*)",
      "    name=${1#-print-file-name=}",
      '    if [ -e "$directory/$name" ]; then echo "$directory/$name"; else echo "$name"; fi',
      "    exit ;;",
      '  -print-prog-name=*) echo "$directory/${1#-print-prog-name=}"; exit ;;',
      "esac",
      'printf \'%s\\n\' "$@" "" >> "$directory/commands"',
      "compile=false",
      'while [ $# -gt 0 ]; do case "$1" in -c) compile=true ;; -o) output=$2 ;; esac; shift; done',
      'if [ "$compile" = false ] && [ -e "$directory/program" ]; then cp "$directory/program" "$output"; else : > "$output"; fi',
      "",
    ].join("\n"),
    { mode: 0o755 },
  );
  const commandsFile = join(directory, "commands");
  writeFileSync(commandsFile, "");

  const env = {
    SQLITE_CORE_BUILD: join(directory, "build"),
    SQLITE_CORE_CACHE: join(directory, "cache"),
  };
  const sqliteDirectory = join(env.SQLITE_CORE_CACHE, sqliteSource.directory);
  const sqlite: PreparedSqlite = {
    directory: sqliteDirectory,
    sqlite3c: join(sqliteDirectory, "sqlite3.c"),
    sqlite3h: join(sqliteDirectory, "sqlite3.h"),
  };
  mkdirSync(sqliteDirectory, { recursive: true });
  writeFileSync(sqlite.sqlite3c, "");
  writeFileSync(sqlite.sqlite3h, "");
  writeFileSync(
    join(sqliteDirectory, "source.json"),
    amalgamationStamp(sqliteSource),
  );

  return {
    directory,
    cc,
    env,
    sqlite,
    commands: () =>
      readFileSync(commandsFile, "utf8")
        .split("\n\n")
        // Each command ends with an empty line.
        .slice(0, -1)
        .map((command) => command.split("\n")),
  };
};
