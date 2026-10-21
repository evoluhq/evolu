/**
 * Writes `native/`, the C that `@evolu/react-native` ships for apps to compile:
 * the pinned SQLite's amalgamation and Evolu's SQLite core with the vendored
 * BearSSL and Monocypher, from `@evolu/sqlite-core`, renamed so that every
 * global starts with `evolu_`. `native/` is generated and gitignored. The
 * committed `native.json` lists each of its files with its origin and SHA-256,
 * the SQLite pin and the flags the shipped build files compile with.
 *
 * The tree is flat:
 *
 * - `c/`: every C source and private header: SQLite's `sqlite3.c` and
 *   `sqlite3.h`, the core's and the binding layer's, and BearSSL's and
 *   Monocypher's. Each include among them names a file beside its includer, or
 *   an `evolu_` header in `include/`. A quote include is found beside its
 *   includer before any search path, such as Xcode's header map of every pod's
 *   headers, which would answer a generic name like `sqlite3.h` with another
 *   pod's.
 * - `include/`: the one search path, holding only `evolu_` headers: the binding
 *   layer's and XChaCha's public ones, `evolu_sqlite3.h`, which includes
 *   `../c/sqlite3.h`, and `evolu_names.h`, which renames every `SQLITE_API`
 *   name of `sqlite3.h` and every BearSSL and Monocypher global.
 * - `units/`: what builds compile, a wrapper per source that includes
 *   `evolu_names.h` and then the source, so the renaming depends on no compiler
 *   flag.
 *
 * Usage:
 *
 * - `node packages/react-native/scripts/vendor-native.mts` writes `native/`, in
 *   place: it rewrites only the files whose bytes changed, so builds recompile
 *   only those, and removes those it no longer lists. Then, when the tree
 *   matches `native.json`, it writes `native/native.json.sha256`, the SHA-256
 *   of `native.json`, which the podspec and `cpp/CMakeLists.txt` require.
 * - `--check` fails unless the tree it would write matches `native.json`, and
 *   writes nothing.
 * - `--update` writes `native/` and `native.json`, after a change to what it
 *   vendors.
 * - `--cross-compile=android --ndk=<the NDK's directory>` and
 *   `--cross-compile=ios` compile `native/units` with the shipped flags, for
 *   Android's four ABIs at API 24 or for the iOS device and both simulators,
 *   the core and the binding layer with warnings as errors, and fail on a
 *   defined global that isn't `evolu_` or is a test hook, and on a `sqlite3`,
 *   `br_` or `crypto_` name without `evolu_`, defined or referenced.
 *   `--jobs=<n>` runs n compiles at once, by default one per CPU.
 *
 * Writing `native/` needs what `@evolu/sqlite-core`'s tests need: a macOS or
 * Linux host (WSL on Windows), clang with llvm-nm, make and unzip, and network
 * access the first time. `SQLITE_CORE_CACHE` and `SQLITE_CORE_BUILD` choose its
 * cache and build directories.
 *
 * @module
 */
import {
  compileCached,
  type CompileUnit,
  compileUnits,
  nativeBindingUnits,
  run,
  sourceDirectory,
} from "@evolu/sqlite-core/scripts/compile.mts";
import {
  defaultBuildDirectory,
  defaultCacheDirectory,
} from "@evolu/sqlite-core/scripts/paths.mts";
import {
  type PinnedSqliteSource,
  type PreparedSqlite,
  prepareSqlite,
  sqliteSource,
} from "@evolu/sqlite-core/scripts/sqlite-source.mts";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { availableParallelism, tmpdir } from "node:os";
import { basename, join, relative } from "node:path";
import { parseArgs } from "node:util";

/** What `native.json` records. */
export interface NativeManifest {
  readonly sqlite: NativeSqlitePin;
  readonly flags: ShippedFlags;
  /** Each file of `native/`, by its path there. */
  readonly files: Readonly<Record<string, NativeFile>>;
}

/** The SQLite source zip the amalgamation is generated from. */
export interface NativeSqlitePin {
  readonly version: string;
  readonly url: string;
  /** The zip's SHA3-256. */
  readonly hash: string;
  /** The check-in of the zip's tree. */
  readonly checkIn: string;
}

/** Where a file of `native/` comes from, and its SHA-256. */
export interface NativeFile {
  /**
   * Its path in `@evolu/sqlite-core`, the SQLite zip `make sqlite3.c` generated
   * it from, or `vendor-native.mts`, which writes it.
   */
  readonly origin: string;
  readonly sha256: string;
}

/**
 * The flags the shipped build files, the podspec and `cpp/CMakeLists.txt`,
 * compile `native/units` with: the defines, the header search path, and C-only
 * flags, `-O2` even in Debug builds, whose `-O0` would make SQLite and BearSSL
 * several times slower.
 */
export interface ShippedFlags {
  /** Preprocessor definitions, without `-D`. */
  readonly defines: ReadonlyArray<string>;
  /** The one header search path, relative to the package. */
  readonly headerSearchPath: string;
  /** The C-only flags of every platform. */
  readonly c: ReadonlyArray<string>;
  /** The C-only flags of iOS, after those. */
  readonly ios: { readonly c: ReadonlyArray<string> };
  /** The C-only flags of Android, after those. */
  readonly android: { readonly c: ReadonlyArray<string> };
}

export const shippedFlags: ShippedFlags = {
  defines: ["EVOLU_NATIVE_PACKAGE", "SQLITE_CUSTOM_INCLUDE=sqlite_config.h"],
  headerSearchPath: "native/include",
  c: ["-O2"],
  // Xcode compiles with Clang modules, under which -std=c11 hides the memset_s
  // that evolu_crypto.c asks for with __STDC_WANT_LIB_EXT1__.
  ios: { c: ["-std=gnu11"] },
  // The core's symbols stay inside the app's libappmodules.so.
  android: { c: ["-std=c11", "-fvisibility=hidden"] },
};

/** A platform that {@link crossCompile} compiles `native/units` for. */
export type CrossCompilePlatform =
  { readonly name: "android"; readonly ndk: string } | { readonly name: "ios" };

/** What {@link crossCompile} compiled for a target and the globals it found. */
export interface CrossCompileResult {
  readonly target: string;
  readonly objects: number;
  /** The defined globals of its objects, each `evolu_`. */
  readonly definedGlobals: number;
}

/**
 * Runs the command line the module documentation describes for the package in
 * `packageDirectory`, which holds `native.json` and `native/`.
 */
export const runVendorNativeCli = async (
  args: ReadonlyArray<string>,
  {
    packageDirectory,
    env,
  }: { packageDirectory: string; env: NodeJS.ProcessEnv },
): Promise<void> => {
  const { values } = parseArgs({
    args: [...args],
    options: {
      check: { type: "boolean", default: false },
      update: { type: "boolean", default: false },
      "cross-compile": { type: "string" },
      ndk: { type: "string" },
      jobs: { type: "string" },
    },
  });
  const crossCompileName = values["cross-compile"];
  if (
    [values.check, values.update, crossCompileName != null].filter(Boolean)
      .length > 1
  )
    throw new Error(
      "Pass at most one of --check, --update and --cross-compile.",
    );

  if (crossCompileName != null) {
    let platform: CrossCompilePlatform;
    if (crossCompileName === "ios") platform = { name: "ios" };
    else if (crossCompileName !== "android")
      throw new Error("--cross-compile takes android or ios.");
    else if (values.ndk == null)
      throw new Error(
        "--cross-compile=android needs --ndk=<the NDK's directory>.",
      );
    else platform = { name: "android", ndk: values.ndk };
    const jobs =
      values.jobs == null ? availableParallelism() : Number(values.jobs);
    if (!Number.isSafeInteger(jobs) || jobs < 1)
      throw new Error("--jobs takes a positive integer.");
    const outputDirectory = mkdtempSync(
      join(tmpdir(), "evolu-native-objects-"),
    );
    try {
      const results = await crossCompile({
        packageDirectory,
        platform,
        outputDirectory,
        jobs,
        env,
      });
      for (const { target, objects, definedGlobals } of results)
        log(
          `${target}: ${objects} objects, ${definedGlobals} defined globals, each evolu_.`,
        );
    } finally {
      rmSync(outputDirectory, { recursive: true, force: true });
    }
    return;
  }

  const sqlite = await prepareSqlite({
    source: sqliteSource,
    cacheDirectory: defaultCacheDirectory(env),
    temporaryDirectory: defaultBuildDirectory(env),
  });
  const sqliteFlags = [`-I${sqlite.directory}`];
  const generate = (directory: string): NativeManifest =>
    generateNative({
      sqlite,
      source: sqliteSource,
      units: [...compileUnits(sqliteFlags), ...nativeBindingUnits(sqliteFlags)],
      coreDirectory: join(sourceDirectory, ".."),
      cc: "clang",
      objectsDirectory: join(defaultBuildDirectory(env), "vendor-native"),
      directory,
    });
  const manifestPath = join(packageDirectory, "native.json");
  const native = join(packageDirectory, "native");

  if (values.update) {
    const text = serializeManifest(generate(native));
    writeFileSync(manifestPath, text);
    writeFileSync(join(native, digestFile), `${sha256(text)}\n`);
    log("Wrote native/ and native.json.");
    return;
  }

  const text = readFileSync(manifestPath, "utf8");
  const requireMatch = (manifest: NativeManifest): void => {
    const differences = compareManifests(text, manifest);
    if (differences.length > 0)
      throw new Error(
        [
          "The generated tree differs from native.json in:",
          ...differences.map((difference) => `  ${difference}`),
          "After changing what it vendors, run node packages/react-native/scripts/vendor-native.mts --update.",
        ].join("\n"),
      );
  };
  if (values.check) {
    const directory = mkdtempSync(join(tmpdir(), "evolu-native-"));
    try {
      requireMatch(generate(directory));
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
    log("The tree vendor-native.mts writes matches native.json.");
    return;
  }
  // The digest goes last, so builds refuse a tree that differs or that an
  // interrupted run left.
  requireMatch(generate(native));
  writeFileSync(join(native, digestFile), `${sha256(text)}\n`);
  log("Wrote native/, which matches native.json.");
};

/** The file in `native/` that holds the SHA-256 of `native.json`. */
const digestFile = "native.json.sha256";

/**
 * Writes the tree the module documentation describes into `directory` from the
 * pinned amalgamation and the compile units of the core, the binding layer and
 * the vendored libraries, and returns its manifest. Over an earlier tree, it
 * removes the digest first, writes only the files whose bytes differ and
 * removes the files of `c/`, `include/` and `units/` it doesn't list. Each
 * unit's source and the headers in its include directories go to `c/`, except
 * the public headers, which go to `include/`. It reads the vendored libraries'
 * globals from the objects `cc` compiles of their units on the host, and fails
 * when one starts with neither `br_` nor `crypto_`, when a rename would collide
 * with a global of the core or the binding layer, or when two files share a
 * basename.
 */
export const generateNative = ({
  sqlite,
  source,
  units,
  coreDirectory,
  cc,
  objectsDirectory,
  directory,
}: {
  sqlite: PreparedSqlite;
  source: PinnedSqliteSource;
  units: ReadonlyArray<CompileUnit>;
  /** The root of `@evolu/sqlite-core`, which origins are relative to. */
  coreDirectory: string;
  /** The host's clang, whose objects of the units give their globals. */
  cc: string;
  /** Where those objects are cached. */
  objectsDirectory: string;
  directory: string;
}): NativeManifest => {
  const originOf = (path: string): string =>
    `@evolu/sqlite-core/${relative(coreDirectory, path)}`;
  const amalgamation = `${source.file}, make sqlite3.c`;

  // Each file of c/ and include/ by its basename.
  const placed = new Map<
    string,
    { readonly path: string; readonly from: string; readonly origin: string }
  >();
  const place = (from: string, origin: string): void => {
    const name = basename(from);
    const path = `${publicHeaders.has(name) ? "include" : "c"}/${name}`;
    const prior = placed.get(name);
    if (prior)
      throw new Error(`${path} would be both ${prior.origin} and ${origin}.`);
    placed.set(name, { path, from, origin });
  };
  place(sqlite.sqlite3c, amalgamation);
  place(sqlite.sqlite3h, amalgamation);
  for (const unit of units) place(unit.source, originOf(unit.source));
  const includeDirectories = new Set(
    units.flatMap(({ flags }) =>
      flags
        .filter(
          (flag) => flag.startsWith("-I") && flag !== `-I${sqlite.directory}`,
        )
        .map((flag) => flag.slice("-I".length)),
    ),
  );
  for (const includeDirectory of includeDirectories)
    for (const name of readdirSync(includeDirectory).toSorted())
      // The host builds' evolu_sqlite3.h, which finds "sqlite3.h" through
      // their search path, gives way to the one written below.
      if (name.endsWith(".h") && name !== "evolu_sqlite3.h")
        place(
          join(includeDirectory, name),
          originOf(join(includeDirectory, name)),
        );

  // The names the SQLITE_API declarations of sqlite3.h declare, which include
  // the session extension's sqlite3session_, sqlite3changeset_,
  // sqlite3changegroup_ and sqlite3rebaser_ ones besides sqlite3_ ones.
  const sqliteNames: Array<string> = [];
  const lines = readFileSync(sqlite.sqlite3h, "utf8").split("\n");
  for (let index = 0; index < lines.length; index++) {
    if (!lines[index].startsWith("SQLITE_API")) continue;
    let declaration = lines[index];
    while (!declaration.includes(";"))
      declaration += ` ${lines[++index].trim()}`;
    const name = /\b(sqlite3\w*)\s*[([;]/u.exec(declaration);
    if (!name)
      throw new Error(
        `sqlite3.h declares ${declaration} with no name the rename can take.`,
      );
    sqliteNames.push(name[1]);
  }
  const nm = run(cc, ["-print-prog-name=llvm-nm"]).trim();
  const prefix = labelPrefix(run(cc, ["-dM", "-E", "-x", "c", "/dev/null"]));
  const globals = units.map((unit) => ({
    origin: originOf(unit.source),
    names: run(nm, [
      "-g",
      "-P",
      "--defined-only",
      compileCached({
        cc,
        flags: unit.flags,
        source: unit.source,
        extraKey: unit.headers,
        objectsDirectory,
      }),
    ])
      .split("\n")
      .filter((line) => line !== "")
      .map((line) => line.split(" ")[0].slice(prefix.length)),
  }));
  const isVendored = (origin: string): boolean =>
    origin.startsWith("@evolu/sqlite-core/vendor/");
  const vendoredNames = globals
    .filter(({ origin }) => isVendored(origin))
    .flatMap(({ origin, names }) =>
      names.map((name) => {
        if (!/^(br|crypto)_/u.test(name))
          throw new Error(
            `${origin} defines ${name}, which the rename covers only with the prefix br_ or crypto_.`,
          );
        return name;
      }),
    );
  const names = [...new Set([...sqliteNames, ...vendoredNames])].toSorted();
  const renamed = new Set(names.map((name) => `evolu_${name}`));
  for (const { origin, names: defined } of globals.filter(
    ({ origin }) => !isVendored(origin),
  ))
    for (const name of defined)
      if (renamed.has(name))
        throw new Error(
          `The rename of ${name.slice("evolu_".length)} collides with ${name}, which ${origin} defines.`,
        );

  // Builds refuse the tree until the caller writes the digest again. A file
  // keeps its bytes, and with them its modification time, which Xcode and
  // Ninja compare with their objects', unless they change.
  rmSync(join(directory, digestFile), { force: true });
  const subdirectories = ["c", "include", "units"];
  for (const subdirectory of subdirectories)
    mkdirSync(join(directory, subdirectory), { recursive: true });
  const written: Array<readonly [path: string, origin: string]> = [];
  const write = (path: string, bytes: Buffer, origin: string): void => {
    const file = join(directory, path);
    if (!existsSync(file) || !readFileSync(file).equals(bytes))
      writeFileSync(file, bytes);
    written.push([path, origin]);
  };
  for (const { path, from, origin } of placed.values())
    write(path, readFileSync(from), origin);
  write(
    "include/evolu_names.h",
    Buffer.from(
      [
        "/*",
        " * Generated by vendor-native.mts. Every global of SQLite, BearSSL and",
        " * Monocypher gets the prefix evolu_, so none binds to another library's copy",
        " * in an app. Every C unit and adapter includes this header first.",
        " */",
        "#ifndef EVOLU_NAMES_H",
        "#define EVOLU_NAMES_H",
        "",
        ...names.map((name) => `#define ${name} evolu_${name}`),
        "",
        "#endif",
        "",
      ].join("\n"),
    ),
    generatedOrigin,
  );
  write(
    "include/evolu_sqlite3.h",
    Buffer.from(
      [
        "/*",
        " * Generated by vendor-native.mts. The pinned SQLite's API under a name no",
        " * other library's header has, so Xcode's header map of every pod's headers",
        " * can't answer it with another pod's sqlite3.h.",
        " */",
        "#ifndef EVOLU_SQLITE3_H",
        "#define EVOLU_SQLITE3_H",
        "",
        '#include "../c/sqlite3.h"',
        "",
        "#endif",
        "",
      ].join("\n"),
    ),
    generatedOrigin,
  );
  for (const { path } of placed.values())
    if (path.endsWith(".c"))
      write(
        `units/${basename(path)}`,
        Buffer.from(
          [
            `/* Generated by vendor-native.mts: ../${path} with Evolu's names. */`,
            '#include "evolu_names.h"',
            `#include "../${path}"`,
            "",
          ].join("\n"),
        ),
        generatedOrigin,
      );
  // What an earlier tree held that this one doesn't.
  const paths = new Set(written.map(([path]) => path));
  for (const subdirectory of subdirectories)
    for (const name of readdirSync(join(directory, subdirectory)))
      if (!paths.has(`${subdirectory}/${name}`))
        rmSync(join(directory, subdirectory, name), {
          recursive: true,
          force: true,
        });

  return {
    sqlite: {
      version: source.version,
      url: source.url,
      hash: source.hash,
      checkIn: source.checkIn,
    },
    flags: shippedFlags,
    files: Object.fromEntries(
      written
        .toSorted(([a], [b]) => (a < b ? -1 : 1))
        .map(([path, origin]) => [
          path,
          { origin, sha256: sha256(readFileSync(join(directory, path))) },
        ]),
    ),
  };
};

/** The core's headers that go to `include/`, where the adapters find them. */
const publicHeaders: ReadonlySet<string> = new Set([
  "evolu_database.h",
  "evolu_xchacha.h",
]);

/** The origin of the files the script writes. */
const generatedOrigin = "vendor-native.mts";

/**
 * Lists how a tree's manifest differs from the text of `native.json`: in the
 * SQLite pin, the flags, each file changed, extra or missing, or else only in
 * how the text is written.
 */
export const compareManifests = (
  text: string,
  manifest: NativeManifest,
): ReadonlyArray<string> => {
  if (text === serializeManifest(manifest)) return [];
  const recorded = JSON.parse(text) as NativeManifest;
  const differences = [
    ...(JSON.stringify(recorded.sqlite) === JSON.stringify(manifest.sqlite)
      ? []
      : ["the SQLite pin"]),
    ...(JSON.stringify(recorded.flags) === JSON.stringify(manifest.flags)
      ? []
      : ["the shipped flags"]),
    ...[
      ...new Set([
        ...Object.keys(recorded.files),
        ...Object.keys(manifest.files),
      ]),
    ]
      .toSorted()
      .flatMap((path) => {
        if (!Object.hasOwn(recorded.files, path)) return [`extra: ${path}`];
        if (!Object.hasOwn(manifest.files, path)) return [`missing: ${path}`];
        const before = recorded.files[path];
        const after = manifest.files[path];
        return before.sha256 === after.sha256 && before.origin === after.origin
          ? []
          : [`changed: ${path}`];
      }),
  ];
  return differences.length > 0 ? differences : ["the formatting"];
};

const serializeManifest = (manifest: NativeManifest): string =>
  `${JSON.stringify(manifest, null, 2)}\n`;

/**
 * Compiles every unit of the package's `native/`, which must be written for its
 * `native.json`, for each target of `platform` into `outputDirectory`, at most
 * `jobs` at once, with the shipped flags. The core's and the binding layer's
 * units also get warnings as errors, and SQLite's a rename macro it redefines
 * as an error, since SQLite isn't Evolu's to change. It then fails on a defined
 * global that isn't `evolu_` or is a test hook, and on a `sqlite3`, `br_` or
 * `crypto_` name without `evolu_`, defined or referenced.
 */
export const crossCompile = async ({
  packageDirectory,
  platform,
  outputDirectory,
  jobs,
  env,
}: {
  packageDirectory: string;
  platform: CrossCompilePlatform;
  outputDirectory: string;
  jobs: number;
  /** The environment of the tools, whose PATH finds xcrun. */
  env: NodeJS.ProcessEnv;
}): Promise<ReadonlyArray<CrossCompileResult>> => {
  const text = readFileSync(join(packageDirectory, "native.json"), "utf8");
  const digest = join(packageDirectory, "native", digestFile);
  if (
    !existsSync(digest) ||
    readFileSync(digest, "utf8") !== `${sha256(text)}\n`
  )
    throw new Error(
      "native/ is missing or was written for another native.json. Run node packages/react-native/scripts/vendor-native.mts first.",
    );
  const { flags, files } = JSON.parse(text) as NativeManifest;
  let targets: ReadonlyArray<CrossCompileTarget>;
  if (platform.name === "android") {
    const prebuilt = join(platform.ndk, "toolchains/llvm/prebuilt");
    const hosts = readdirSync(prebuilt).toSorted();
    if (hosts.length !== 1)
      throw new Error(
        `${prebuilt} holds ${hosts.join(", ")}, not one host's toolchain.`,
      );
    const clang = join(prebuilt, hosts[0], "bin/clang");
    // React Native's minSdk, so a libc function newer than it fails.
    targets = [
      ["arm64-v8a", "aarch64-linux-android24"],
      ["armeabi-v7a", "armv7a-linux-androideabi24"],
      ["x86", "i686-linux-android24"],
      ["x86_64", "x86_64-linux-android24"],
    ].map(([abi, triple]) => ({
      name: `android-${abi}`,
      compiler: [clang, `--target=${triple}`],
      flags: [],
    }));
  } else {
    // As Xcode compiles, with Clang modules, at React Native's minimum iOS.
    const flags = [
      "-fmodules",
      `-fmodules-cache-path=${join(outputDirectory, "modules")}`,
    ];
    targets = [
      ["ios-arm64", "iphoneos", "arm64-apple-ios15.1"],
      [
        "ios-simulator-arm64",
        "iphonesimulator",
        "arm64-apple-ios15.1-simulator",
      ],
      [
        "ios-simulator-x86_64",
        "iphonesimulator",
        "x86_64-apple-ios15.1-simulator",
      ],
    ].map(([name, sdk, triple]) => ({
      name,
      compiler: ["xcrun", "--sdk", sdk, "clang", "-target", triple],
      flags,
    }));
  }
  const units = Object.keys(files)
    .filter((path) => path.startsWith("units/"))
    .map((path) => basename(path, ".c"));
  const shipped = [
    ...flags.c,
    ...flags[platform.name].c,
    ...flags.defines.map((define) => `-D${define}`),
    `-I${join(packageDirectory, flags.headerSearchPath)}`,
  ];
  const object = (target: CrossCompileTarget, unit: string): string =>
    join(outputDirectory, target.name, `${unit}.o`);

  const compiles = targets.flatMap((target) =>
    units.map((unit) => ({ target, unit })),
  );
  for (const target of targets)
    mkdirSync(join(outputDirectory, target.name), { recursive: true });
  // At most `jobs` compiles at once, each status and output, both streams, at
  // its compile's index.
  const results: Array<{
    readonly status: number | null;
    readonly output: string;
  }> = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: jobs }, async () => {
      while (next < compiles.length) {
        const index = next++;
        const { target, unit } = compiles[index];
        results[index] = await new Promise((resolve, reject) => {
          const child = spawn(
            target.compiler[0],
            [
              ...target.compiler.slice(1),
              ...shipped,
              // The core's and the binding layer's own C gets warnings as
              // errors, and SQLite only a rename macro it redefines as one.
              ...(unit === "sqlite3"
                ? ["-Werror=macro-redefined"]
                : /^@evolu\/sqlite-core\/(src|binding)\//u.test(
                      files[`c/${unit}.c`].origin,
                    )
                  ? ["-Wall", "-Wextra", "-Werror"]
                  : []),
              ...target.flags,
              "-c",
              join(packageDirectory, "native/units", `${unit}.c`),
              "-o",
              object(target, unit),
            ],
            { env },
          );
          let output = "";
          const append = (chunk: Buffer): void => {
            output += chunk.toString();
          };
          child.stdout.on("data", append);
          child.stderr.on("data", append);
          child.on("error", reject);
          child.on("close", (status) => {
            resolve({ status, output });
          });
        });
      }
    }),
  );
  const failures = compiles.flatMap(({ target, unit }, index) =>
    results[index].status === 0
      ? []
      : [
          `${target.name} units/${unit}.c failed to compile:\n${results[index].output.trimEnd()}`,
        ],
  );
  if (failures.length > 0) throw new Error(failures.join("\n"));

  const problems: Array<string> = [];
  const checked = targets.map((target) => {
    const tool = (args: ReadonlyArray<string>): string =>
      run(
        target.compiler[0],
        [...target.compiler.slice(1), ...args],
        undefined,
        env,
      );
    const nm = tool(["-print-prog-name=llvm-nm"]).trim();
    const prefix = labelPrefix(tool(["-dM", "-E", "-x", "c", "/dev/null"]));
    let definedGlobals = 0;
    for (const unit of units) {
      const where = `${target.name} units/${unit}.c`;
      for (const line of run(
        nm,
        ["-g", "-P", object(target, unit)],
        undefined,
        env,
      )
        .split("\n")
        .filter((line) => line !== "")) {
        const [symbol, type] = line.split(" ");
        const name = symbol.slice(prefix.length);
        if (undefinedTypes.has(type)) {
          if (/^(sqlite3|br_|crypto_)/u.test(name))
            problems.push(`${where} references ${name} without evolu_.`);
        } else if (name.startsWith("evolu_test_"))
          problems.push(`${where} defines ${name}, a test hook.`);
        else if (!name.startsWith("evolu_"))
          problems.push(`${where} defines ${name}, which isn't evolu_.`);
        else definedGlobals++;
      }
    }
    return { target: target.name, objects: units.length, definedGlobals };
  });
  if (problems.length > 0) throw new Error(problems.join("\n"));
  return checked;
};

/** A target {@link crossCompile} compiles for. */
interface CrossCompileTarget {
  readonly name: string;
  /** The compiler command, with the arguments that select the target. */
  readonly compiler: ReadonlyArray<string>;
  /** The flags it adds after the shipped ones. */
  readonly flags: ReadonlyArray<string>;
}

/** The llvm-nm -P types of undefined symbols, weak ones included. */
const undefinedTypes: ReadonlySet<string> = new Set(["U", "w", "v"]);

/**
 * The prefix of C names in symbols, from what `-dM -E` prints: `_` on Apple
 * targets, none on ELF ones.
 */
const labelPrefix = (macros: string): string =>
  macros.split("#define __USER_LABEL_PREFIX__ ")[1].split("\n")[0];

const sha256 = (bytes: string | Uint8Array): string =>
  createHash("sha256").update(bytes).digest("hex");

const log = (message: string): void => {
  // oxlint-disable-next-line eslint/no-console -- Report CLI results.
  console.log(message);
};

if (import.meta.main)
  await runVendorNativeCli(process.argv.slice(2), {
    packageDirectory: join(import.meta.dirname, ".."),
    env: process.env,
  });
