/**
 * Evolu's native package compiles every C source through a wrapper that
 * includes evolu_names.h first, which defines EVOLU_NAMES_H, and its builds
 * define EVOLU_NATIVE_PACKAGE. Under it, SQLite, every core unit, every binding
 * unit and the binding's header stop at a guard unless the rename came first.
 */
import { assert, assertEqual, assertThrows } from "@evolu/common";
import { readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { before, it } from "node:test";
import {
  bindingDirectory,
  compileUnits,
  nativeBindingUnits,
  run,
  sourceDirectory,
} from "../scripts/compile.mts";
import {
  defaultBuildDirectory,
  defaultCacheDirectory,
} from "../scripts/paths.mts";
import {
  type PreparedSqlite,
  prepareSqlite,
  sqliteSource,
} from "../scripts/sqlite-source.mts";

let sqlite: PreparedSqlite;

before(
  async () => {
    sqlite = await prepareSqlite({
      source: sqliteSource,
      cacheDirectory: defaultCacheDirectory(process.env),
      temporaryDirectory: defaultBuildDirectory(process.env),
    });
  },
  // On a cold cache, it fetches the source and generates the amalgamation.
  { timeout: 600_000 },
);

/** The sources a native package compiles and the flags of each. */
const units = () => {
  const sqliteFlags = [
    `-I${sqlite.directory}`,
    `-I${sourceDirectory}`,
    "-DSQLITE_CUSTOM_INCLUDE=sqlite_config.h",
  ];
  const bindingUnits = nativeBindingUnits(sqliteFlags);
  return [
    { source: sqlite.sqlite3c, flags: sqliteFlags },
    ...[...compileUnits(sqliteFlags), ...bindingUnits]
      .filter(({ flags }) => flags.includes(`-I${sourceDirectory}`))
      .map(({ source, flags }) => ({ source, flags })),
    // Alone, as the adapters include it, since the binding's unit also
    // includes evolu_crypto.h, which has the same guard.
    {
      source: join(bindingDirectory, "evolu_database.h"),
      flags: [...bindingUnits[0].flags, "-x", "c-header"],
    },
  ];
};

const check = (source: string, flags: ReadonlyArray<string>) =>
  run("clang", ["-fsyntax-only", ...flags, "-DEVOLU_NATIVE_PACKAGE", source]);

it("stops SQLite, every core unit, every binding unit and the binding's header compiled without the rename", () => {
  const checked = units();
  assertEqual(
    checked
      .filter(({ source }) => source.startsWith(bindingDirectory))
      .map(({ source }) => basename(source)),
    ["evolu_database.c", "evolu_database.h"],
  );
  for (const { source, flags } of checked)
    assertThrows(
      () => check(source, flags),
      (error) => {
        assert(
          (error as Error).message.includes(
            "Compile Evolu's native C through its units, which include evolu_names.h first.",
          ),
          `${source} compiled without the rename.`,
        );
      },
    );
});

it("includes by quote only evolu_ headers in the headers that ship in include/, where another library's sqlite3.h could answer", () => {
  for (const header of [
    join(bindingDirectory, "evolu_database.h"),
    join(sourceDirectory, "evolu_xchacha.h"),
  ]) {
    const includes = [
      ...readFileSync(header, "utf8").matchAll(/^#include "([^"]+)"/gmu),
    ].map(([, name]) => name);
    assertEqual(
      includes.filter((name) => !name.startsWith("evolu_")),
      [],
    );
  }
});

it("compiles them once the rename came first", () => {
  for (const { source, flags } of units())
    check(source, [...flags, "-DEVOLU_NAMES_H"]);
});
