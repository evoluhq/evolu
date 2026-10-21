/**
 * What the host test build (build.mts), the Node-API addon build
 * (build-addon.mts) and `@evolu/sqlite-wasm`'s wasm build share: the C sources
 * of the core and its vendored libraries with the flags each compiles with,
 * those of the native binding layer, which only the native builds compile, and
 * for the host builds, a compile cache keyed by inputs, which test processes
 * running in parallel share, compiling each object once, and atomic writes, so
 * they never see a partial file. Every source is compiled into a cached object
 * and binaries link only objects, so their debug information stays in those
 * content-addressed objects, where debuggers and sanitizers find it, and
 * macOS's linker writes no .dSYM beside them.
 *
 * @module
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  linkSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

export const sourceDirectory = /*#__PURE__*/ fileURLToPath(
  /*#__PURE__*/ new URL("../src/", import.meta.url),
);
export const testDirectory = /*#__PURE__*/ fileURLToPath(
  /*#__PURE__*/ new URL("../test/", import.meta.url),
);
export const bindingDirectory = /*#__PURE__*/ fileURLToPath(
  /*#__PURE__*/ new URL("../binding/", import.meta.url),
);
const vendorDirectory = /*#__PURE__*/ fileURLToPath(
  /*#__PURE__*/ new URL("../vendor/", import.meta.url),
);

/**
 * A vendored library under vendor/<name>, compiled from every `.c` file under
 * its directory with `privateIncludes`. The core's own code sees only
 * `publicIncludes`, so a library's internal headers, such as BearSSL's
 * generically named config.h and inner.h, stay out of everything else.
 */
interface VendoredLibrary {
  readonly name: string;
  readonly privateIncludes: ReadonlyArray<string>;
  readonly publicIncludes: ReadonlyArray<string>;
}

const vendoredLibraries: ReadonlyArray<VendoredLibrary> = [
  { name: "bearssl", privateIncludes: ["inc", "src"], publicIncludes: ["inc"] },
  { name: "monocypher", privateIncludes: ["."], publicIncludes: ["."] },
];

/** The vendored libraries whose directories exist. */
const presentLibraries = (): ReadonlyArray<VendoredLibrary> =>
  vendoredLibraries.filter(({ name }) =>
    existsSync(join(vendorDirectory, name)),
  );

/**
 * A C source and the flags it compiles with, to which a build adds its own,
 * such as its optimization and sanitizers.
 */
export interface CompileUnit {
  readonly source: string;
  readonly flags: ReadonlyArray<string>;
  /** Reads the headers its object may depend on, each time it's called. */
  readonly headers: () => string;
}

/**
 * The flags the core's own C compiles with: C11, warnings as errors, and the
 * core's and the vendored libraries' public include directories. A source that
 * includes the core's headers, such as a test or the addon, takes them too.
 */
export const coreFlags = (): ReadonlyArray<string> => [
  "-std=c11",
  "-Wall",
  "-Wextra",
  "-Werror",
  `-I${sourceDirectory}`,
  ...presentLibraries().flatMap(({ name, publicIncludes }) =>
    publicIncludes.map(
      (include) => `-I${join(vendorDirectory, name, include)}`,
    ),
  ),
];

/**
 * The contents of the core's headers and of the vendored libraries' public
 * ones, which an object compiled with {@link coreFlags} may depend on.
 */
export const coreHeaders = (): string =>
  [
    headerContents(sourceDirectory),
    ...presentLibraries()
      .flatMap(({ name, publicIncludes }) =>
        publicIncludes.flatMap((include) =>
          listFiles(join(vendorDirectory, name, include)).filter((file) =>
            file.endsWith(".h"),
          ),
        ),
      )
      .map((file) => readFileSync(file, "utf8")),
  ].join("\n");

/**
 * The core's compile units, which the host builds and the wasm build compile
 * alike: the core's own sources with the build's `sqliteFlags`, such as where
 * SQLite's `sqlite3.h` is and the options SQLite compiles with, then
 * {@link coreFlags}, and every vendored library's sources, in subdirectories
 * too, with only that library's private includes and no warning flags, since
 * that code isn't the core's to change. A vendored source's object may depend
 * on every header of its library.
 */
export const compileUnits = (
  sqliteFlags: ReadonlyArray<string>,
): ReadonlyArray<CompileUnit> => [
  ...cSources(sourceDirectory).map((source) => ({
    source,
    flags: [...sqliteFlags, ...coreFlags()],
    headers: coreHeaders,
  })),
  ...presentLibraries().flatMap(({ name, privateIncludes }) => {
    const directory = join(vendorDirectory, name);
    const files = listFiles(directory);
    const flags = [
      "-std=c11",
      ...privateIncludes.map((include) => `-I${join(directory, include)}`),
    ];
    const headers = (): string =>
      files
        .filter((file) => file.endsWith(".h"))
        .map((file) => readFileSync(file, "utf8"))
        .join("\n");
    return files
      .filter((file) => file.endsWith(".c"))
      .map((source) => ({ source, flags, headers }));
  }),
];

/**
 * The native binding layer's compile units, binding/, which the host test build
 * and the addon compile and the wasm never does, since the layer calls POSIX
 * file functions: its sources with the build's `sqliteFlags`, then
 * {@link coreFlags} and its own include directory. Its objects may depend on the
 * core's headers and its own.
 */
export const nativeBindingUnits = (
  sqliteFlags: ReadonlyArray<string>,
): ReadonlyArray<CompileUnit> =>
  cSources(bindingDirectory).map((source) => ({
    source,
    flags: [...sqliteFlags, ...coreFlags(), `-I${bindingDirectory}`],
    headers: () => [coreHeaders(), headerContents(bindingDirectory)].join("\n"),
  }));

/** What {@link compileCached} compiles and where it keeps the object. */
export interface CompileCachedOptions {
  readonly cc: string;
  readonly flags: ReadonlyArray<string>;
  readonly source: string;
  /** Reads the other inputs, such as headers, each time it's called. */
  readonly extraKey?: () => string;
  readonly objectsDirectory: string;
}

/**
 * Compiles `source` with `flags` into `objectsDirectory` unless an object
 * compiled from the same source, `extraKey` and flags by the same compiler
 * version is already there, and returns the object's path. Processes that need
 * the same object at once compile it once. An input that changes while it
 * compiles fails the compile, which caches nothing.
 */
export const compileCached = ({
  cc,
  flags,
  source,
  extraKey = () => "",
  objectsDirectory,
}: CompileCachedOptions): string => {
  const inputsKey = (): string =>
    createHash("sha256")
      .update(readFileSync(source))
      .update(extraKey())
      .update(JSON.stringify([cc, compilerVersion(cc), flags]))
      .digest("hex")
      .slice(0, 16);
  const key = inputsKey();
  const object = join(objectsDirectory, `${basename(source, ".c")}-${key}.o`);
  if (existsSync(object)) return object;
  mkdirSync(objectsDirectory, { recursive: true });
  // The process that links the lock, a file naming its pid, compiles; the
  // others wait for its object. A lock whose holder exited without it, as when
  // killed, or held longer than a compile takes, as when its pid was reused, is
  // taken over, possibly by several waiters at once, which then compile it more
  // than once; writeAtomically keeps each object whole.
  const lock = `${object}.lock`;
  const claim = `${lock}.${process.pid}`;
  writeFileSync(claim, String(process.pid));
  try {
    for (;;) {
      try {
        // The lock's time is when it was taken, which its age counts from.
        const now = new Date();
        utimesSync(claim, now, now);
        linkSync(claim, lock);
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      }
      if (existsSync(object)) return object;
      // ENOENT: the lock was just released. Any other code, as ESRCH for a
      // holder that exited, or EPERM for a pid another user's process reused,
      // makes the lock stale.
      let code: string | undefined;
      try {
        const pid = Number(readFileSync(lock, "utf8"));
        // This process holds no lock between calls, so a lock naming it was
        // left by an earlier process that had its pid.
        if (pid === process.pid) code = "ESRCH";
        else {
          process.kill(pid, 0);
          if (Date.now() - statSync(lock).mtimeMs > lockTimeout)
            code = "ETIMEDOUT";
        }
      } catch (error) {
        code = (error as NodeJS.ErrnoException).code;
      }
      if (code === undefined) Atomics.wait(lockWaiter, 0, 0, 100);
      else if (code !== "ENOENT") rmSync(lock, { force: true });
    }
  } finally {
    rmSync(claim, { force: true });
  }
  try {
    // The holder before may have compiled it.
    if (!existsSync(object))
      writeAtomically(object, (output) => {
        run(cc, [...flags, "-c", source, "-o", output]);
        // An input edited after the key was taken, while this process waited
        // for the lock or compiled, would cache an object of other inputs
        // under this key.
        if (inputsKey() !== key)
          throw new Error(
            `${source} or its other inputs changed while it compiled`,
          );
      });
  } finally {
    rmSync(lock, { force: true });
  }
  return object;
};

/** Longer than any compile, after which a lock's holder is taken as gone. */
const lockTimeout = 600_000;

/** What waiting for a lock sleeps on, synchronously. */
const lockWaiter = new Int32Array(new SharedArrayBuffer(4));

const compilerVersions = new Map<string, string>();

/** What a compiler's `--version` prints, read once per process. */
const compilerVersion = (cc: string): string => {
  let version = compilerVersions.get(cc);
  if (version == null) {
    version = run(cc, ["--version"]);
    compilerVersions.set(cc, version);
  }
  return version;
};

/**
 * Writes `path` through `write` into a temporary file renamed over it, so an
 * interrupted or concurrent build never leaves or reads a partial file, and a
 * loaded addon is never changed in place. A write that throws leaves the
 * earlier file and removes its own.
 */
export const writeAtomically = (
  path: string,
  write: (output: string) => void,
): void => {
  const partial = `${path}.${process.pid}.partial`;
  try {
    write(partial);
  } catch (error) {
    rmSync(partial, { force: true });
    throw error;
  }
  renameSync(partial, path);
};

/** The contents of the `.h` files directly in a directory, sorted by name. */
export const headerContents = (directory: string): string =>
  readdirSync(directory)
    .filter((file) => file.endsWith(".h"))
    .toSorted()
    .map((file) => readFileSync(join(directory, file), "utf8"))
    .join("\n");

/** Returns the `.c` files directly in a directory, sorted. */
export const cSources = (directory: string): ReadonlyArray<string> =>
  readdirSync(directory)
    .filter((file) => file.endsWith(".c"))
    .toSorted()
    .map((file) => join(directory, file));

/**
 * Runs a command, in `cwd` and with `env` when given, and returns its standard
 * output, or throws with its output on failure. The command runs without
 * LD_PRELOAD and DYLD_INSERT_LIBRARIES, so a library preloaded into a test
 * process, such as the sanitizer runtime, stays out of the compiler.
 */
export const run = (
  command: string,
  args: ReadonlyArray<string>,
  cwd?: string,
  env: NodeJS.ProcessEnv = process.env,
): string => {
  // On Linux, clang with the AddressSanitizer runtime that
  // addon-sanitized.test.mts preloads passed 1.7 GB compiling SQLite, against
  // 1.1 GB without it. macOS drops DYLD_INSERT_LIBRARIES only for protected
  // binaries, such as /usr/bin/clang.
  const { LD_PRELOAD: _, DYLD_INSERT_LIBRARIES: __, ...commandEnv } = env;
  const result = spawnSync(command, args, {
    cwd,
    env: commandEnv,
    encoding: "utf8",
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(
      `${command} exited with ${result.status}\n${result.stdout}${result.stderr}`,
    );
  return result.stdout;
};

/**
 * Returns every file under a directory, sorted in UTF-16 code unit order, which
 * sorts them by relative path, since they share the directory's prefix. Not
 * `localeCompare`, whose order depends on the host's locale, because the order
 * is the wasm's link order.
 */
const listFiles = (directory: string): ReadonlyArray<string> =>
  readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name))
    .toSorted();
