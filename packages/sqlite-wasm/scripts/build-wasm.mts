/**
 * Builds `wasm/sqlite3.wasm`: SQLite from sqlite.org's source zip, which
 * `@evolu/sqlite-core` pins, with Evolu's C core linked in, compiled to
 * WebAssembly by Emscripten 6.0.3 with SQLite's own makefile, unpatched. The
 * build fails unless its bytes equal the pinned ones.
 *
 * Only the wasm is built, because Evolu replaces SQLite's JavaScript with its
 * own.
 *
 * Every input is pinned, and the build fails closed when anything differs:
 *
 * 1. The SQLite source zip by the SHA3-256 sqlite.org publishes on its download
 *    page, and the tree by the check-in its `manifest.uuid` names, both pinned
 *    in `@evolu/sqlite-core`'s `scripts/sqlite-source.mts`, so the wasm and the
 *    native builds compile the same SQLite. The core's sources are in this
 *    repository.
 * 2. Emscripten by its version, and wasm-strip by the version of the npm package
 *    wabt, whose bytes the lockfile pins.
 * 3. The output by its sha256. emsdk verifies no checksum of what it downloads,
 *    and host tools such as make and the host C compiler are not pinned, so
 *    this pin is what covers them. It can, because the build is reproducible:
 *    two builds in fresh work directories on macOS arm64 gave the same bytes.
 *    CI builds it on Linux x86_64 in the Emscripten image against the same
 *    pin.
 *
 * The steps, in a fresh temporary directory:
 *
 * 1. Unpack the archive and check `manifest.uuid`.
 * 2. `./configure --with-emsdk=$EMSDK`, so configure finds the SDK without relying
 *    on PATH. It writes `ext/wasm/config.make`, which must name emcc, wasm-opt
 *    and the wasm-strip of wabt. Without wasm-strip, the `-Oz -g3` build keeps
 *    its debug info; without wasm-opt, it is not optimized.
 * 3. `make sqlite3.c`, the amalgamation the wasm compiles, which `ext/wasm`
 *    requires to exist, and its `sqlite3.h`, which the core includes.
 * 4. `emcc -c -O2` of the core's compile units, which `@evolu/sqlite-core`'s
 *    `scripts/compile.mts` lists with their flags, into `ext/wasm/evolu-core`,
 *    one call for each set of units that share their flags. The core gets
 *    `-DSQLITE_THREADSAFE=0`, the value `sqlite3-wasm.c` gives SQLite, and the
 *    tree's `sqlite3.h`, and no other SQLite option.
 * 5. `make "emcc_opt=-Oz -sSTACK_OVERFLOW_CHECK=2" barebones=1 SQLITE_OPT=...
 *    emcc.flags.vanilla=... jswasm/sqlite3.wasm` in `ext/wasm`, at the
 *    optimization level `make dist` and `make npm` use, without the JavaScript
 *    deliverables they also build. `-sSTACK_OVERFLOW_CHECK=2` makes each
 *    function compare the stack pointer it sets with the C stack's limits and
 *    call `__handle_stack_overflow` instead of leaving the stack, which the
 *    loader turns into a trap. The makefile's `-sGLOBAL_BASE` puts the 512 KiB
 *    stack directly above the static data and rules out Emscripten's
 *    `--stack-first`, so without the check, SQL nested deeply enough would
 *    overwrite that data silently, as it does in SQLite's own release build.
 *    `barebones=1` selects SQLite's bare-bones export list, and `SQLITE_OPT`
 *    replaces the makefile's compile options, so no optional feature, such as
 *    FTS5, R*Tree or the session extension, and none of SQLite's C test helpers
 *    is compiled. The options are the omissions of SQLite's bare-bones build
 *    except `SQLITE_OMIT_JSON`, since Evolu queries JSON, and
 *    `SQLITE_OMIT_GET_TABLE`, which only makes the wasm larger, plus
 *    `SQLITE_ENABLE_MATH_FUNCTIONS`, which apps can call through Evolu's query
 *    builder, and `SQLITE_TEMP_STORE=3`, which keeps temporary files in memory.
 *    `sqlite3-wasm.c` hard-codes the rest, such as no threads, UTF-16 or
 *    extension loading. `emcc.flags.vanilla`, which the vanilla build's link
 *    references and nothing defines for it, names the core's objects, relative
 *    to `ext/wasm`, and `-Wl,--export=` for each of the core's functions the
 *    bindings call, which wasm-ld then keeps. The variable is undocumented, so
 *    an upstream refactor breaks this step, which the pins catch. The make log
 *    must not say that wasm-opt failed, which the makefile otherwise ignores.
 * 6. Check the sha256 of the wasm, and check it against the pins of
 *    `scripts/generate.mts` as `generate.mts --verify-build` does. That also
 *    compiles and instantiates it in Node.js.
 * 7. Write `wasm/sqlite3.wasm` and `wasm/build-info.json`, which records the
 *    inputs, with the sha256 of each of the core's sources and of the headers
 *    it may depend on, the tool versions and the output's sha256, and remove
 *    the temporary directory. A failed build keeps it for inspection.
 *
 * Usage: `EMSDK=/path/to/emsdk node scripts/build-wasm.mts`
 *
 * - `EMSDK`: an emsdk root with Emscripten 6.0.3 installed and activated. The
 *   script sources its `emsdk_env.sh`, which also selects emsdk's Python for
 *   emcc, and SQLite's configure finds the SDK through it. The
 *   `emscripten/emsdk` Docker image sets it.
 * - `SQLITE_WASM_CACHE`: where the downloaded archive is kept, `wasm-cache` when
 *   unset or empty. A cached archive is verified like a downloaded one.
 * - `TMPDIR`: where the temporary build directory is created.
 *
 * Only EMSDK, HOME, PATH and TMPDIR of the host reach the build's commands.
 *
 * On macOS, a GNU-style `sed` shim from `scripts/gnu-sed` comes first in PATH,
 * because the makefile runs `sed -i` without a suffix.
 *
 * To upgrade an input, change its pin and build. A change to the core's sources
 * is such an input too. The build then fails with the new output's sha256 and
 * keeps the wasm in the temporary directory; review it, pin it with `node
 * scripts/generate.mts --pin-build <wasm>`, regenerate, and pin its sha256 in
 * `wasmSha256` of `scripts/check-wasm.mts`. An Emscripten upgrade also changes
 * the image tag and the digest of its multi-arch index in
 * `.github/workflows/checks.yaml` and in the README's Docker command, which a
 * Node.js upgrade changes too, and a wabt upgrade the exact version of the
 * `wabt` devDependency, and with it the lockfile. After a release publishes the
 * new wasm, set its version and sha256 in `publishedWasm` of
 * `scripts/download-wasm.mts`.
 */

import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  closeSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { arch, release, tmpdir, type } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  compileUnits,
  sourceDirectory,
} from "@evolu/sqlite-core/scripts/compile.mts";
import {
  checkManifestUuid,
  fetchPinned,
  type PinnedSqliteSource,
  sqliteSource,
} from "@evolu/sqlite-core/scripts/sqlite-source.mts";
import { wasmSha256 } from "./check-wasm.mts";
import { verifyWasmBuild } from "./generate.mts";

/** The `--version` lines of the tools whose versions the build pins. */
export interface Toolchain {
  readonly emcc: string;
  readonly wasmStrip: string;
}

/** The pins, directories and host environment of {@link buildWasm}. */
export interface BuildWasmOptions {
  readonly sqliteSource: PinnedSqliteSource;
  readonly wasmSha256: string;
  readonly outputDirectory: string;
  /** Where the archive is kept unless `env` sets `SQLITE_WASM_CACHE`. */
  readonly defaultCacheDirectory: string;
  /** Where the work directory is created. */
  readonly temporaryDirectory: string;
  readonly env: NodeJS.ProcessEnv;
  readonly platform: NodeJS.Platform;
}

const emscriptenVersion = "6.0.3";
const wasmStripVersion = "1.0.39";

const makeOptions = [
  "emcc_opt=-Oz -sSTACK_OVERFLOW_CHECK=2",
  "barebones=1",
  `SQLITE_OPT=${[
    "-DSQLITE_TEMP_STORE=3",
    "-DSQLITE_OMIT_AUTHORIZATION",
    "-DSQLITE_OMIT_INCRBLOB",
    "-DSQLITE_OMIT_INTROSPECTION_PRAGMAS",
    "-DSQLITE_OMIT_PROGRESS_CALLBACK",
    "-DSQLITE_OMIT_WAL",
    "-DSQLITE_ENABLE_MATH_FUNCTIONS",
  ].join(" ")}`,
];

/** The core's functions the wasm exports, which its bindings call. */
const coreExports = [
  "evolu_codec_register",
  "evolu_codec_open",
  "evolu_codec_take_failure",
  "evolu_skiplist_register",
];

/** Where in ext/wasm the core's objects are compiled. */
const coreObjectsDirectory = "evolu-core";

/** The root of `@evolu/sqlite-core`, which build-info.json's paths are under. */
const sqliteCoreDirectory = join(sourceDirectory, "..");

const outputDirectory = fileURLToPath(new URL("../wasm/", import.meta.url));
const defaultCacheDirectory = fileURLToPath(
  new URL("../wasm-cache/", import.meta.url),
);
const gnuSedDirectory = fileURLToPath(new URL("gnu-sed", import.meta.url));
const wasmStripDirectory = dirname(
  fileURLToPath(import.meta.resolve("wabt/bin/wasm-strip")),
);

/**
 * Builds the wasm in a new work directory and writes it with `build-info.json`
 * to `outputDirectory` only when it matches its pins. It removes the work
 * directory after a successful build and keeps it after a failed one.
 */
export const buildWasm = async ({
  sqliteSource,
  wasmSha256,
  outputDirectory,
  defaultCacheDirectory,
  temporaryDirectory,
  env: hostEnv,
  platform,
}: BuildWasmOptions): Promise<void> => {
  const started = performance.now();
  const env = createBuildEnvironment(hostEnv, platform);
  const toolchain = checkToolchain(env);
  const { SQLITE_WASM_CACHE: cache } = hostEnv;
  // An empty value counts as unset; resolve("") would be the working directory.
  const cacheDirectory = resolve(
    cache == null || cache === "" ? defaultCacheDirectory : cache,
  );
  const sqliteZip = await fetchPinned(sqliteSource, cacheDirectory);

  const work = mkdtempSync(join(temporaryDirectory, "evolu-sqlite-wasm-"));
  const tree = join(work, sqliteSource.directory);
  const extWasm = join(tree, "ext/wasm");
  const logs = join(work, "logs");
  mkdirSync(logs);
  log(`Building in ${work}`);

  /** Runs a command with its output in `logs/<step>.log` and returns it. */
  const run = (
    step: string,
    command: string,
    args: ReadonlyArray<string>,
    cwd: string,
  ): string => {
    const stepStarted = performance.now();
    const logPath = join(logs, `${step}.log`);
    const logFile = openSync(logPath, "w");
    const result = spawnSync(command, args, {
      cwd,
      env,
      stdio: ["ignore", logFile, logFile],
    });
    closeSync(logFile);
    const output = readFileSync(logPath, "utf8");
    if (result.status !== 0)
      throw new Error(
        [
          `${command} ${args.join(" ")} failed (${result.error?.message ?? result.status ?? result.signal}); see ${logPath}:`,
          ...output.split("\n").slice(-40),
        ].join("\n"),
      );
    log(`${step}: ${seconds(performance.now() - stepStarted)}`);
    return output;
  };

  run("unpack", "unzip", ["-q", sqliteZip], work);
  checkManifestUuid(tree, sqliteSource.checkIn);

  run("configure", "./configure", [`--with-emsdk=${env.EMSDK}`], tree);
  checkConfigMake(
    readFileSync(join(extWasm, "config.make"), "utf8"),
    join(wasmStripDirectory, "wasm-strip"),
  );

  run("make-sqlite3.c", "make", ["sqlite3.c"], tree);

  // The core, compiled as SQLite's wasm is, without threads, against the
  // sqlite3.h that make generated, with one emcc call for each set of units
  // that share their flags. The vendored libraries' units get neither.
  const units = compileUnits(["-DSQLITE_THREADSAFE=0", `-I${tree}`]);
  const compileFlags = ["-c", "-O2"];
  const objects = join(extWasm, coreObjectsDirectory);
  mkdirSync(objects);
  [...Map.groupBy(units, ({ flags }) => flags.join(" ")).values()].forEach(
    (group, index) => {
      run(
        `compile-core-${index + 1}`,
        "emcc",
        [
          ...compileFlags,
          ...group[0].flags,
          ...group.map(({ source }) => source),
        ],
        objects,
      );
    },
  );
  // The vanilla build links what emcc.flags.vanilla names, which nothing else
  // sets. The objects are relative to ext/wasm, where make runs, so
  // build-info.json records no path of the work directory.
  const makeArguments = [
    ...makeOptions,
    `emcc.flags.vanilla=${[
      ...units.map(
        ({ source }) => `${coreObjectsDirectory}/${basename(source, ".c")}.o`,
      ),
      ...coreExports.map((name) => `-Wl,--export=${name}`),
    ].join(" ")}`,
    "jswasm/sqlite3.wasm",
  ];
  checkMakeLog(run("make-wasm", "make", makeArguments, extWasm));
  const wasmPath = join(extWasm, "jswasm/sqlite3.wasm");
  const wasm = readFileSync(wasmPath);
  const problems = await verifyWasm(wasm, wasmSha256);
  if (problems.length > 0)
    throw new Error(
      [`${wasmPath} differs from the pins:`, ...problems].join("\n"),
    );

  const buildInfo = {
    inputs: {
      sqliteSource,
      emscripten: emscriptenVersion,
      wasmStrip: wasmStripVersion,
      make: ["make", ...makeArguments],
      // Each include directory as <tree> or relative to sqlite-core, so the
      // file holds no path of the work directory or this machine.
      core: units.map(({ source, flags, headers }) => ({
        source: relative(sqliteCoreDirectory, source),
        flags: [...compileFlags, ...flags].map((flag) =>
          !flag.startsWith("-I")
            ? flag
            : flag === `-I${tree}`
              ? "-I<tree>"
              : `-I${relative(sqliteCoreDirectory, flag.slice(2))}`,
        ),
        sha256: createHash("sha256").update(readFileSync(source)).digest("hex"),
        headersSha256: createHash("sha256").update(headers()).digest("hex"),
      })),
    },
    toolchain: {
      ...toolchain,
      clang: toolVersion(env, `${env.EMSDK}/upstream/bin/clang`),
      wasmOpt: toolVersion(env, `${env.EMSDK}/upstream/bin/wasm-opt`),
      make: toolVersion(env, "make"),
      hostCc: toolVersion(env, "cc"),
      bash: toolVersion(env, "bash"),
      node: process.version,
      host: `${type()} ${release()} ${arch()}`,
    },
    outputs: {
      "sqlite3.wasm": { bytes: wasm.length, sha256: wasmSha256 },
    },
  };
  mkdirSync(outputDirectory, { recursive: true });
  writeFileSync(join(outputDirectory, "sqlite3.wasm"), wasm);
  writeFileSync(
    join(outputDirectory, "build-info.json"),
    `${JSON.stringify(buildInfo, null, 2)}\n`,
  );
  rmSync(work, { recursive: true, force: true });
  log(
    `Built ${join(outputDirectory, "sqlite3.wasm")}, sha256 ${wasmSha256}, in ${seconds(performance.now() - started)}.`,
  );
};

/**
 * Returns the environment the build runs its commands in: the host's EMSDK,
 * HOME, PATH and TMPDIR after sourcing `$EMSDK/emsdk_env.sh` in a bash that
 * reads no startup files, with the wasm-strip of wabt first in PATH, after a
 * GNU-style sed on macOS. No other host variable reaches the build, because the
 * toolchain honors many, such as EMCC_CFLAGS, CC, CFLAGS, MAKEFLAGS, BASH_ENV
 * and UNZIP.
 */
export const createBuildEnvironment = (
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
): NodeJS.ProcessEnv => {
  if (env.EMSDK == null || env.EMSDK === "")
    throw new Error(
      `Set EMSDK to the root of an emsdk with Emscripten ${emscriptenVersion} installed and activated.`,
    );
  // Without --norc, `bash -c` runs ~/.bashrc when SHLVL is unset and stdin is
  // a socket, which is how Node.js connects it.
  const sourced = execFileSync(
    "bash",
    [
      "--norc",
      "-c",
      'EMSDK_QUIET=1 source "$1/emsdk_env.sh" > /dev/null 2>&1 && env -0',
      "_",
      env.EMSDK,
    ],
    {
      env: {
        EMSDK: env.EMSDK,
        HOME: env.HOME,
        PATH: env.PATH,
        TMPDIR: env.TMPDIR,
      },
      encoding: "utf8",
    },
  );
  const sourcedEnv = Object.fromEntries(
    sourced
      .split("\0")
      .filter((entry) => entry !== "")
      .map((entry) => {
        const separator = entry.indexOf("=");
        return [entry.slice(0, separator), entry.slice(separator + 1)];
      }),
  );
  return {
    ...sourcedEnv,
    PATH: [
      ...(platform === "darwin" ? [gnuSedDirectory] : []),
      wasmStripDirectory,
      sourcedEnv.PATH,
    ].join(":"),
    LC_ALL: "C",
    TZ: "UTC",
  };
};

/**
 * Returns the versions of emcc and wasm-strip in the PATH of `env`, after
 * checking that they are the pinned ones.
 */
export const checkToolchain = (env: NodeJS.ProcessEnv): Toolchain => {
  const emcc = toolVersion(env, "emcc");
  if (!emcc.includes(` ${emscriptenVersion} `))
    throw new Error(
      `Expected Emscripten ${emscriptenVersion}, emcc --version printed: ${emcc}`,
    );
  const wasmStrip = toolVersion(env, "wasm-strip");
  if (wasmStrip !== wasmStripVersion)
    throw new Error(
      `Expected wasm-strip ${wasmStripVersion}, wasm-strip --version printed: ${wasmStrip}`,
    );
  return { emcc, wasmStrip };
};

/**
 * Checks the tools configure found for ext/wasm: emcc, wasm-opt, and the
 * wasm-strip at `wasmStrip`.
 */
export const checkConfigMake = (
  configMake: string,
  wasmStrip: string,
): void => {
  const values = new Map(
    [...configMake.matchAll(/^(\S+) = (.*)$/gmu)].map(([, name, value]) => [
      name,
      value?.trim(),
    ]),
  );
  for (const tool of ["bin.emcc", "bin.wasm-opt"])
    if (!values.get(tool))
      throw new Error(`ext/wasm/config.make has no ${tool}`);
  const configuredWasmStrip = values.get("bin.wasm-strip");
  if (configuredWasmStrip !== wasmStrip)
    throw new Error(
      `ext/wasm/config.make has bin.wasm-strip ${configuredWasmStrip}, expected ${wasmStrip}`,
    );
};

/** Checks that `make` did not report a wasm-opt failure. */
export const checkMakeLog = (log: string): void => {
  const failure = log
    .split("\n")
    .find((line) => line.includes("ignoring wasm-opt failure"));
  if (failure != null) throw new Error(`make reported "${failure}"`);
};

/**
 * Lists how a built wasm differs from the pinned sha256 and from the pins of
 * `scripts/generate.mts`, which `generate.mts --verify-build` checks.
 */
export const verifyWasm = async (
  bytes: Uint8Array,
  sha256: string,
): Promise<ReadonlyArray<string>> => {
  const actual = createHash("sha256").update(bytes).digest("hex");
  return [
    ...(actual === sha256 ? [] : [`sha256 ${actual}, pinned ${sha256}`]),
    ...(await verifyWasmBuild(bytes)),
  ];
};

/** Returns the first line a command prints for `--version`. */
const toolVersion = (env: NodeJS.ProcessEnv, command: string): string => {
  const result = spawnSync(command, ["--version"], { env, encoding: "utf8" });
  if (result.error) throw result.error;
  return `${result.stdout}${result.stderr}`.trim().split("\n")[0];
};

const seconds = (milliseconds: number): string =>
  `${(milliseconds / 1000).toFixed(1)} s`;

const log = (message: string): void => {
  // oxlint-disable-next-line eslint/no-console -- Report build progress.
  console.log(message);
};

if (import.meta.main)
  await buildWasm({
    sqliteSource,
    wasmSha256,
    outputDirectory,
    defaultCacheDirectory,
    temporaryDirectory: tmpdir(),
    env: process.env,
    platform: process.platform,
  });
