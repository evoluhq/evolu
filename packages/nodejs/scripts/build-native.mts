/**
 * Builds Evolu's SQLite addon for Node.js, which `src/NativeSqlite.ts` loads,
 * into `native/<target>/evolu.node`: `@evolu/sqlite-core`'s SQLite from the
 * pinned source, its C and native binding layer, `node/binding.c`, the Node-API
 * binding, and `node/module.c`, the module's entry.
 *
 * - Clang compiles at -O2 for the target's baseline CPU, since the core picks its
 *   hardware crypto at run time, against the Node-API headers an official
 *   Node.js build installs in `include/node` next to its `bin` directory, and
 *   the addon declares Node-API version 10. Every symbol but the module's entry
 *   points is hidden, so another SQLite in the process, such as node:sqlite's,
 *   never binds to the addon's calls, and the linker drops the symbol table.
 * - A target builds where it runs: a Linux target on a Linux of its C library,
 *   whose glibc then is the oldest the addon runs on, and a macOS one on a Mac
 *   of either CPU, for macOS 13.5 or later.
 * - Objects are kept under a name derived from their inputs, in the core's build
 *   directory, so only what changed compiles again.
 * - A build embeds no path, so the same sources and toolchain build the same
 *   bytes wherever the repository and the build directory are.
 * - It fails when an object defines a test hook, which only the core's tests
 *   compile in, with `nm`, which Xcode and binutils install.
 *
 * It imports the core's scripts by their paths and only Node.js's own modules,
 * so CI builds the addons it ships without installing any package.
 *
 * Usage: `node packages/nodejs/scripts/build-native.mts [--target=<target>]`
 * builds the running platform's target, or `<target>`, and prints the addon's
 * path.
 *
 * @module
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import {
  bindingDirectory,
  compileCached,
  compileUnits,
  coreFlags,
  coreHeaders,
  headerContents,
  napiVersion,
  nativeBindingUnits,
  run,
  sourceDirectory,
} from "../../sqlite-core/scripts/compile.mts";
import {
  defaultBuildDirectory,
  defaultCacheDirectory,
} from "../../sqlite-core/scripts/paths.mts";
import {
  prepareSqlite,
  sqliteSource,
} from "../../sqlite-core/scripts/sqlite-source.mts";
import {
  isMusl,
  nativeSqliteTarget,
  nativeSqliteTargets,
  nativeSqliteUrl,
  type NativeSqliteTarget,
} from "../src/NativeSqlite.ts";

/** The oldest macOS the addon runs on, Node.js 24's. */
const macosVersionMin = "13.5";

/**
 * Builds the addon for `target`, the running platform's by default, and returns
 * its path. `cc` is the C compiler, `nodeExecutable` the Node.js whose headers
 * are used, and `env` where the core's build and cache directories are.
 */
export const buildNativeSqlite = async ({
  target = hostTarget(),
  cc = "clang",
  nodeExecutable = process.execPath,
  env = process.env,
}: {
  target?: NativeSqliteTarget;
  cc?: string;
  nodeExecutable?: string;
  env?: NodeJS.ProcessEnv;
} = {}): Promise<string> => {
  const host = hostTarget();
  const isDarwin = target.startsWith("darwin-");
  if (target !== host && !(isDarwin && host.startsWith("darwin-")))
    throw new Error(
      `${target} builds on its own platform, and this is ${host}; only a Mac builds either macOS target.`,
    );
  const nodeIncludeDirectory = join(
    dirname(dirname(nodeExecutable)),
    "include",
    "node",
  );
  if (!existsSync(join(nodeIncludeDirectory, "node_api.h")))
    throw new Error(
      `${nodeIncludeDirectory} has no node_api.h: the addon needs the Node.js headers that official Node.js builds install next to bin/node`,
    );

  const buildDirectory = defaultBuildDirectory(env);
  const sqlite = await prepareSqlite({
    source: sqliteSource,
    cacheDirectory: defaultCacheDirectory(env),
    temporaryDirectory: buildDirectory,
  });

  const optimized = [
    "-std=c11",
    "-fPIC",
    "-fvisibility=hidden",
    "-O2",
    ...(isDarwin
      ? [
          "-arch",
          target === "darwin-arm64" ? "arm64" : "x86_64",
          `-mmacosx-version-min=${macosVersionMin}`,
        ]
      : []),
  ];
  const sqliteFlags = [
    `-I${sqlite.directory}`,
    `-I${sourceDirectory}`,
    "-DSQLITE_CUSTOM_INCLUDE=sqlite_config.h",
  ];
  const objectsDirectory = join(buildDirectory, `objects-nodejs-${target}`);
  mkdirSync(objectsDirectory, { recursive: true });

  const sqliteObject = compileCached({
    cc,
    flags: [...optimized, ...sqliteFlags],
    source: sqlite.sqlite3c,
    extraKey: () =>
      readFileSync(join(sourceDirectory, "sqlite_config.h"), "utf8"),
    objectsDirectory,
  });
  const unitObjects = [
    ...compileUnits(sqliteFlags),
    ...nativeBindingUnits(sqliteFlags),
  ].map(({ source, flags, headers }) =>
    compileCached({
      cc,
      flags: [...optimized, ...flags],
      source,
      extraKey: headers,
      objectsDirectory,
    }),
  );

  // The Node-API headers the module's units include, which vary by Node.js
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
  const nodeDirectory = join(dirname(sourceDirectory), "node");
  const moduleObjects = ["binding.c", "module.c"].map((name) =>
    compileCached({
      cc,
      flags: [
        ...optimized,
        ...sqliteFlags,
        ...coreFlags(),
        `-I${bindingDirectory}`,
        `-isystem${nodeIncludeDirectory}`,
        `-DNAPI_VERSION=${napiVersion}`,
      ],
      source: join(nodeDirectory, name),
      extraKey: () =>
        [
          coreHeaders(),
          headerContents(bindingDirectory),
          nodeApiHeaders(),
        ].join("\n"),
      objectsDirectory,
    }),
  );

  const objects = [...moduleObjects, sqliteObject, ...unitObjects];
  // The test hooks, such as evolu_test_plain_vfs, exist only in builds that
  // define EVOLU_TEST_HOOKS, the core's C tests and React Native's Hermes
  // tests, which no shipped addon may contain.
  const hooks = run("nm", objects)
    .split("\n")
    .filter((line) => /\b_?evolu_test_\w*$/u.test(line));
  if (hooks.length > 0)
    throw new Error(
      `The addon's objects define test hooks:\n${hooks.join("\n")}`,
    );

  const addon = fileURLToPath(nativeSqliteUrl(target));
  mkdirSync(dirname(addon), { recursive: true });
  // Linked under its own name in a directory of its own, then renamed over the
  // addon, so a loaded addon is never changed in place, and macOS's ad-hoc
  // signature, which names the output, is the same in every build.
  const linking = mkdtempSync(join(dirname(addon), ".link-"));
  try {
    const output = join(linking, "evolu.node");
    run(cc, [
      ...optimized,
      // A loadable bundle on macOS, as node-gyp links addons, which has no
      // install name to record the temporary output path in. Node.js
      // resolves the Node-API symbols when it loads it.
      ...(isDarwin
        ? ["-bundle", "-undefined", "dynamic_lookup", "-Wl,-x"]
        : ["-shared", "-Wl,-s", "-pthread", "-lm"]),
      ...objects,
      "-o",
      output,
    ]);
    renameSync(output, addon);
  } finally {
    rmSync(linking, { recursive: true, force: true });
  }
  return addon;
};

/** The running platform's target, which it throws for when there's none. */
const hostTarget = (): NativeSqliteTarget => {
  const target = nativeSqliteTarget({
    platform: process.platform,
    arch: process.arch,
    isMusl,
  });
  if (target === null)
    throw new Error(
      `${process.platform}-${process.arch} is none of ${nativeSqliteTargets.join(", ")}.`,
    );
  return target;
};

if (import.meta.main) {
  const { values } = parseArgs({ options: { target: { type: "string" } } });
  const { target } = values;
  if (
    target !== undefined &&
    !nativeSqliteTargets.includes(target as NativeSqliteTarget)
  )
    throw new Error(
      `--target must be one of ${nativeSqliteTargets.join(", ")}, not ${target}.`,
    );
  // oxlint-disable-next-line eslint/no-console -- The CLI prints the addon's path.
  console.log(
    await buildNativeSqlite(
      target === undefined ? {} : { target: target as NativeSqliteTarget },
    ),
  );
}
