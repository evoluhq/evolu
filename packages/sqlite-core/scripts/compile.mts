/**
 * What the host test build (build.mts) and the Node-API addon build
 * (build-addon.mts) share: the C sources of the core and its vendored
 * libraries, a compile cache keyed by inputs, which test processes running in
 * parallel share, compiling each object once, and atomic writes, so they never
 * see a partial file. Every source is compiled into a cached object and
 * binaries link only objects, so their debug information stays in those
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
import { basename, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

export const sourceDirectory = /*#__PURE__*/ fileURLToPath(
  /*#__PURE__*/ new URL("../src/", import.meta.url),
);
export const testDirectory = /*#__PURE__*/ fileURLToPath(
  /*#__PURE__*/ new URL("../test/", import.meta.url),
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

/** The `-I` flags the core's own code compiles with for vendored headers. */
export const vendoredPublicIncludes = (): ReadonlyArray<string> =>
  presentLibraries().flatMap(({ name, publicIncludes }) =>
    publicIncludes.map(
      (include) => `-I${join(vendorDirectory, name, include)}`,
    ),
  );

/**
 * The contents of every header in the vendored libraries' public include
 * directories, sorted by path, which the core's objects may depend on.
 */
export const vendoredPublicHeaders = (): string =>
  presentLibraries()
    .flatMap(({ name, publicIncludes }) =>
      publicIncludes.flatMap((include) =>
        listFiles(join(vendorDirectory, name, include)).filter((file) =>
          file.endsWith(".h"),
        ),
      ),
    )
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");

/**
 * Compiles every vendored library with `flags` plus its private includes and
 * returns the object files, cached in `objectsDirectory`. A file's cache key
 * includes every header of its library, which its object may depend on.
 */
export const compileVendoredLibraries = ({
  cc,
  flags,
  objectsDirectory,
}: {
  cc: string;
  flags: ReadonlyArray<string>;
  objectsDirectory: string;
}): ReadonlyArray<string> =>
  presentLibraries().flatMap(({ name, privateIncludes }) => {
    const directory = join(vendorDirectory, name);
    const files = listFiles(directory);
    const headers = (): string =>
      files
        .filter((file) => file.endsWith(".h"))
        .map((file) => readFileSync(file, "utf8"))
        .join("\n");
    const libraryFlags = [
      ...flags,
      ...privateIncludes.map((include) => `-I${join(directory, include)}`),
    ];
    return files
      .filter((file) => file.endsWith(".c"))
      .map((file) =>
        compileCached({
          cc,
          flags: libraryFlags,
          source: file,
          extraKey: headers,
          objectsDirectory,
        }),
      );
  });

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
 * output, or throws with its output on failure.
 */
export const run = (
  command: string,
  args: ReadonlyArray<string>,
  cwd?: string,
  env?: NodeJS.ProcessEnv,
): string => {
  const result = spawnSync(command, args, { cwd, env, encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(
      `${command} exited with ${result.status}\n${result.stdout}${result.stderr}`,
    );
  return result.stdout;
};

/** Returns every file under a directory, sorted by relative path. */
const listFiles = (directory: string): ReadonlyArray<string> =>
  readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name))
    .toSorted((a, b) =>
      relative(directory, a).localeCompare(relative(directory, b)),
    );
