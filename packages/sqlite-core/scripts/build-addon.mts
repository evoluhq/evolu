/**
 * Builds the test-only Node-API addon of the C core (node/addon.c), so Evolu's
 * TypeScript tests can drive it.
 *
 * It needs no node-gyp and no npm package: clang compiles against the headers
 * an official Node.js build installs in `include/node` next to its `bin`
 * directory, and the addon declares Node-API version 10. Node.js resolves the
 * addon's Node-API symbols when it loads it, so macOS links a bundle with
 * `-undefined dynamic_lookup`. SQLite, the vendored libraries and the core's
 * src/*.c are compiled at -O2, each object kept under a name derived from its
 * inputs, so only what changed compiles again. Every symbol except the module's
 * entry points is hidden, so another SQLite in the process, such as
 * node:sqlite's, never binds to the addon's calls.
 *
 * With `sanitize`, everything is compiled with AddressSanitizer and
 * UndefinedBehaviorSanitizer into `evolu-sanitized.node`, which a stock Node.js
 * loads only with the sanitizer runtime preloaded, as {@link sanitizerPreload}
 * names it, since the runtime must be in the process before anything
 * allocates.
 *
 * @module
 */
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  compileCached,
  compileUnits,
  coreFlags,
  coreHeaders,
  run,
  sourceDirectory,
  writeAtomically,
} from "./compile.mts";
import type { PreparedSqlite } from "./sqlite-source.mts";

const addonSource = /*#__PURE__*/ fileURLToPath(
  /*#__PURE__*/ new URL("../node/addon.c", import.meta.url),
);

/** The Node-API version the addon declares; Node.js 24 supports it. */
const napiVersion = 10;

/**
 * Builds the addon into `outputDirectory` and returns its path. `cc` is the C
 * compiler, `nodeExecutable` the Node.js whose headers are used, and `platform`
 * the one the addon is linked for.
 */
export const buildAddon = ({
  sqlite,
  outputDirectory,
  cc = "clang",
  nodeExecutable = process.execPath,
  sanitize = false,
  platform = process.platform,
}: {
  sqlite: PreparedSqlite;
  outputDirectory: string;
  cc?: string;
  nodeExecutable?: string;
  sanitize?: boolean;
  platform?: NodeJS.Platform;
}): string => {
  const nodeIncludeDirectory = join(
    dirname(dirname(nodeExecutable)),
    "include",
    "node",
  );
  if (!existsSync(join(nodeIncludeDirectory, "node_api.h")))
    throw new Error(
      `${nodeIncludeDirectory} has no node_api.h: the addon needs the Node.js headers that official Node.js builds install next to bin/node`,
    );

  const optimized = [
    "-std=c11",
    "-fPIC",
    "-fvisibility=hidden",
    ...(sanitize
      ? [
          "-g",
          "-O1",
          "-fno-omit-frame-pointer",
          "-fsanitize=address,undefined",
          "-fno-sanitize-recover=all",
        ]
      : ["-O2"]),
  ];
  const sqliteFlags = [
    `-I${sqlite.directory}`,
    `-I${sourceDirectory}`,
    "-DSQLITE_CUSTOM_INCLUDE=sqlite_config.h",
    // So a test can make SQLite's allocations fail with PRAGMA hard_heap_limit.
    "-DSQLITE_DEFAULT_MEMSTATUS=1",
  ];
  const objectsDirectory = join(outputDirectory, "objects-addon");
  mkdirSync(objectsDirectory, { recursive: true });

  const sqliteObject = compileCached({
    cc,
    flags: [...optimized, ...sqliteFlags],
    source: sqlite.sqlite3c,
    extraKey: () =>
      readFileSync(join(sourceDirectory, "sqlite_config.h"), "utf8"),
    objectsDirectory,
  });
  const unitObjects = compileUnits(sqliteFlags).map(
    ({ source, flags, headers }) =>
      compileCached({
        cc,
        flags: [...optimized, ...flags],
        source,
        extraKey: headers,
        objectsDirectory,
      }),
  );

  const addonObject = compileCached({
    cc,
    flags: [
      ...optimized,
      ...sqliteFlags,
      ...coreFlags(),
      `-isystem${nodeIncludeDirectory}`,
      `-DNAPI_VERSION=${napiVersion}`,
    ],
    source: addonSource,
    // The Node-API headers it includes, which vary by Node.js version.
    extraKey: () =>
      [
        coreHeaders(),
        ...[
          "js_native_api.h",
          "js_native_api_types.h",
          "node_api.h",
          "node_api_types.h",
        ].map((name) => readFileSync(join(nodeIncludeDirectory, name), "utf8")),
      ].join("\n"),
    objectsDirectory,
  });

  const addon = join(
    outputDirectory,
    sanitize ? "evolu-sanitized.node" : "evolu.node",
  );
  writeAtomically(addon, (output) => {
    run(cc, [
      ...optimized,
      // A loadable bundle on macOS, as node-gyp links addons, which has no
      // install name to record the temporary output path in.
      ...(platform === "darwin"
        ? ["-bundle", "-undefined", "dynamic_lookup"]
        : ["-shared"]),
      // Against the runtime's shared library, which the process preloads.
      ...(sanitize && platform !== "darwin" ? ["-shared-libasan"] : []),
      addonObject,
      sqliteObject,
      ...unitObjects,
      "-o",
      output,
    ]);
  });
  return addon;
};

/**
 * The environment variable and the path of the sanitizer runtime that a Node.js
 * process must preload to load the sanitized addon: clang's shared
 * AddressSanitizer runtime for `platform` and `arch`, through
 * DYLD_INSERT_LIBRARIES on macOS and LD_PRELOAD elsewhere.
 */
export const sanitizerPreload = ({
  cc = "clang",
  platform = process.platform,
  arch = process.arch,
}: {
  cc?: string;
  platform?: NodeJS.Platform;
  arch?: NodeJS.Architecture;
} = {}): { readonly variable: string; readonly path: string } => {
  const isMac = platform === "darwin";
  const runtimeArch = arch === "arm64" ? "aarch64" : "x86_64";
  // clang prints a name it can't find as given, not as an absolute path.
  const names = isMac
    ? ["libclang_rt.asan_osx_dynamic.dylib"]
    : [`libclang_rt.asan-${runtimeArch}.so`, "libclang_rt.asan.so"];
  for (const name of names) {
    const path = run(cc, [`-print-file-name=${name}`]).trim();
    if (path !== name && existsSync(path))
      return { variable: isMac ? "DYLD_INSERT_LIBRARIES" : "LD_PRELOAD", path };
  }
  throw new Error(
    `${cc} has no shared AddressSanitizer runtime: ${names.join(", ")}`,
  );
};
