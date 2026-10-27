/**
 * Builds the test-only Node-API addon of the C core (node/addon.c), so Evolu's
 * TypeScript tests can drive it, with the N-API mirror of React Native's
 * binding (node/binding.c) in it, and node/module.c, the entry of
 * `@evolu/nodejs`'s addon, under other names, since addon.c is the entry.
 * node/test_hooks.h's hooks are included before both, and the core is compiled
 * with its test hooks, so a test can make their calls, the core's random source
 * and the build check fail.
 *
 * It needs no node-gyp and no npm package: clang compiles against the headers
 * an official Node.js build installs in `include/node` next to its `bin`
 * directory, and the addon declares Node-API version 10. Node.js resolves the
 * addon's Node-API symbols when it loads it, so macOS links a bundle with
 * `-undefined dynamic_lookup`. SQLite, the vendored libraries, the core's
 * `src/*.c` and the native binding layer's `binding/*.c` are compiled at -O2,
 * each object kept under a name derived from its inputs, so only what changed
 * compiles again. Every symbol except the module's entry points is hidden, so
 * another SQLite in the process, such as node:sqlite's, never binds to the
 * addon's calls.
 *
 * With `sanitize`, everything is compiled with AddressSanitizer and
 * UndefinedBehaviorSanitizer into `evolu-sanitized.node`, which a stock Node.js
 * loads only with the sanitizer runtime preloaded, as {@link sanitizerPreload}
 * names it, since the runtime must be in the process before anything allocates.
 * With `coverage`, node/binding.c and node/module.c are instrumented for
 * source-based coverage into `evolu-coverage.node`, whose runs write profiles
 * where `LLVM_PROFILE_FILE` names.
 *
 * @module
 */
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  bindingDirectory,
  compileCached,
  compileUnits,
  coreFlags,
  coreHeaders,
  headerContents,
  napiVersion,
  nativeBindingUnits,
  nodeDirectory,
  run,
  sourceDirectory,
  writeAtomically,
} from "./compile.mts";
import { coverageFlags } from "./coverage.mts";
import type { PreparedSqlite } from "./sqlite-source.mts";

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
  coverage = false,
  platform = process.platform,
}: {
  sqlite: PreparedSqlite;
  outputDirectory: string;
  cc?: string;
  nodeExecutable?: string;
  sanitize?: boolean;
  coverage?: boolean;
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
  // The core's test hooks, so a test can make its random source or the build
  // check fail.
  const unitFlags = [...sqliteFlags, "-DEVOLU_TEST_HOOKS"];
  const unitObjects = [
    ...compileUnits(unitFlags),
    ...nativeBindingUnits(unitFlags),
  ].map(({ source, flags, headers }) =>
    compileCached({
      cc,
      flags: [...optimized, ...flags],
      source,
      extraKey: headers,
      objectsDirectory,
    }),
  );

  // The Node-API headers the addon's units include, which vary by Node.js
  // version.
  const nodeApiHeaders = (): string =>
    [
      "js_native_api.h",
      "js_native_api_types.h",
      "node_api.h",
      "node_api_types.h",
    ]
      .map((name) => readFileSync(join(nodeIncludeDirectory, name), "utf8"))
      .join("\n");
  const nodeApiFlags = [
    `-isystem${nodeIncludeDirectory}`,
    `-DNAPI_VERSION=${napiVersion}`,
  ];
  const nodeFlags = [
    ...optimized,
    ...unitFlags,
    ...coreFlags(),
    `-I${bindingDirectory}`,
    ...nodeApiFlags,
  ];
  const nodeHeaders = (): string =>
    [
      coreHeaders(),
      headerContents(bindingDirectory),
      headerContents(nodeDirectory),
      nodeApiHeaders(),
    ].join("\n");
  const addonObject = compileCached({
    cc,
    flags: nodeFlags,
    source: join(nodeDirectory, "addon.c"),
    extraKey: nodeHeaders,
    objectsDirectory,
  });
  // The files @evolu/nodejs's addon compiles, with node/test_hooks.h's hooks
  // included before each and module.c's entry points renamed, since addon.c's
  // are the module's.
  const nodeObjects = ["binding.c", "module.c"].map((name) =>
    compileCached({
      cc,
      flags: [
        ...nodeFlags,
        `-include${join(nodeDirectory, "test_hooks.h")}`,
        "-Dnapi_register_module_v1=evolu_test_node_module_initialize",
        "-Dnode_api_module_get_api_version_v1=evolu_test_node_module_napi_version",
        // So a test retires a handle's slot after a few collections.
        "-DEVOLU_NODE_LAST_GENERATION=3",
        ...(coverage ? coverageFlags : []),
      ],
      source: join(nodeDirectory, name),
      extraKey: nodeHeaders,
      objectsDirectory,
    }),
  );

  const addon = join(
    outputDirectory,
    `evolu${sanitize ? "-sanitized" : ""}${coverage ? "-coverage" : ""}.node`,
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
      ...(coverage ? coverageFlags : []),
      addonObject,
      ...nodeObjects,
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
