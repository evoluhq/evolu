/**
 * The tree the vendor script writes from the pinned SQLite and the core, with
 * the host's clang: it equals native.json, its includes resolve where no search
 * path, such as Xcode's header map of every pod's headers, can answer them, its
 * rename header covers every global, and a host library built from it with the
 * shipped flags defines only Evolu's names.
 */
import {
  assert,
  assertEqual,
  assertFalse,
  assertRejects,
  assertTrue,
} from "@evolu/common";
import { compileCached, run } from "@evolu/sqlite-core/scripts/compile.mts";
import { defaultBuildDirectory } from "@evolu/sqlite-core/scripts/paths.mts";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { after, before, describe, it, type TestContext } from "node:test";
import {
  type NativeManifest,
  runVendorNativeCli,
} from "../../scripts/vendor-native.mts";

const packageDirectory = join(import.meta.dirname, "../..");
const script = join(packageDirectory, "scripts/vendor-native.mts");
const manifestText = readFileSync(
  join(packageDirectory, "native.json"),
  "utf8",
);
const manifest = JSON.parse(manifestText) as NativeManifest;

// A package directory with a copy of native.json, kept between runs, so the
// host library's objects stay cached while native/ stays the same.
const buildDirectory = join(
  defaultBuildDirectory(process.env),
  "vendor-native-test",
);
const vendored = join(buildDirectory, "package");
const native = join(vendored, "native");

before(
  async () => {
    rmSync(vendored, { recursive: true, force: true });
    mkdirSync(vendored, { recursive: true });
    writeFileSync(join(vendored, "native.json"), manifestText);
    await runVendorNativeCli([], {
      packageDirectory: vendored,
      env: process.env,
    });
  },
  // On a cold cache, it fetches the source and generates the amalgamation.
  { timeout: 600_000 },
);

describe("the tree", () => {
  it("equals native.json, file by file", () => {
    assertEqual(
      listFiles(native)
        .filter((path) => path !== "native.json.sha256")
        .map((path) => [path, sha256(readFileSync(join(native, path)))]),
      Object.entries(manifest.files).map(([path, { sha256: hash }]) => [
        path,
        hash,
      ]),
    );
  });

  it("holds native.json's digest, for the podspec's and CMake's check", () => {
    assertEqual(
      readFileSync(join(native, "native.json.sha256"), "utf8"),
      `${sha256(manifestText)}\n`,
    );
  });

  it("passes --check, which writes nothing", () => {
    const result = spawnSync(process.execPath, [script, "--check"], {
      encoding: "utf8",
    });

    assertEqual([result.status, result.stderr], [0, ""]);
    assertTrue(
      result.stdout.includes(
        "The tree vendor-native.mts writes matches native.json.",
      ),
    );
  });

  it("fails --check on a changed or extra file, writing nothing", async (t) => {
    const changed = setupPackage(t, (files) => ({
      ...files,
      "c/evolu_codec.c": {
        ...files["c/evolu_codec.c"],
        sha256: "0".repeat(64),
      },
    }));
    const extra = setupPackage(t, (files) =>
      Object.fromEntries(
        Object.entries(files).filter(([path]) => path !== "c/monocypher.c"),
      ),
    );

    for (const [directory, difference] of [
      [changed, "changed: c/evolu_codec.c"],
      [extra, "extra: c/monocypher.c"],
    ] as const) {
      await assertRejects(
        runVendorNativeCli(["--check"], {
          packageDirectory: directory,
          env: process.env,
        }),
        (error) => {
          assertTrue((error as Error).message.includes(`\n  ${difference}\n`));
          assertTrue((error as Error).message.includes("--update"));
        },
      );
      assertFalse(existsSync(join(directory, "native")));
    }
  });

  it("writes native/ for another native.json without its digest, so builds refuse it, removing an earlier tree's digest and files", async (t) => {
    const directory = setupPackage(t, (files) =>
      Object.fromEntries(
        Object.entries(files).filter(([path]) => path !== "c/monocypher.c"),
      ),
    );
    // An earlier tree, with a digest builds would accept for this native.json.
    const digest = join(directory, "native/native.json.sha256");
    const stale = join(directory, "native/units/stale.c");
    mkdirSync(dirname(stale), { recursive: true });
    writeFileSync(
      digest,
      `${sha256(readFileSync(join(directory, "native.json")))}\n`,
    );
    writeFileSync(stale, "");

    await assertRejects(
      runVendorNativeCli([], { packageDirectory: directory, env: process.env }),
      (error) => {
        assertTrue(
          (error as Error).message.includes("\n  extra: c/monocypher.c\n"),
        );
      },
    );
    assertTrue(existsSync(join(directory, "native/c/monocypher.c")));
    assertFalse(existsSync(digest));
    assertFalse(existsSync(stale));
  });

  it("rewrites over an earlier tree only the files whose bytes differ, so builds recompile only those", async (t) => {
    const directory = setupPackage(t, (files) => files);
    const vendor = () =>
      runVendorNativeCli([], { packageDirectory: directory, env: process.env });
    await vendor();
    const unchanged = join(directory, "native/c/sqlite3.c");
    const changed = join(directory, "native/c/evolu_codec.c");
    const earlier = new Date("2001-02-03T04:05:06Z");
    utimesSync(unchanged, earlier, earlier);
    writeFileSync(changed, "/* Edited. */\n");

    await vendor();

    assertEqual(statSync(unchanged).mtimeMs, earlier.getTime());
    assertEqual(
      sha256(readFileSync(changed)),
      manifest.files["c/evolu_codec.c"].sha256,
    );
    assertEqual(
      readFileSync(join(directory, "native/native.json.sha256"), "utf8"),
      `${sha256(manifestText)}\n`,
    );
  });

  it("rewrites native.json to match with --update", async (t) => {
    const directory = setupPackage(t, (files) => ({
      ...Object.fromEntries(
        Object.entries(files).filter(([path]) => path !== "c/monocypher.c"),
      ),
      "c/evolu_codec.c": {
        ...files["c/evolu_codec.c"],
        sha256: "0".repeat(64),
      },
      "c/removed.c": { origin: "@evolu/sqlite-core/src/removed.c", sha256: "" },
    }));

    await runVendorNativeCli(["--update"], {
      packageDirectory: directory,
      env: process.env,
    });

    assertEqual(
      readFileSync(join(directory, "native.json"), "utf8"),
      manifestText,
    );
    assertEqual(
      readFileSync(join(directory, "native/native.json.sha256"), "utf8"),
      `${sha256(manifestText)}\n`,
    );
  });
});

describe("includes", () => {
  it("holds only evolu_ headers in include/, and no two basenames in c/ and include/ collide", () => {
    const included = readdirSync(join(native, "include"));
    const names = [...readdirSync(join(native, "c")), ...included];

    assertEqual(
      included.filter((name) => !name.startsWith("evolu_")),
      [],
    );
    assertEqual(names.length, new Set(names).size);
  });

  it("resolves every include that a unit compiles next to its includer or in include/, keeps include/'s headers to include/, and names no header of native/ in angle brackets", () => {
    const include = join(native, "include");
    // A vendored header named in angle brackets would come from a search
    // path, such as an SDK's sqlite3.h.
    const headers = new Set([
      ...readdirSync(join(native, "c")),
      ...readdirSync(include),
    ]);
    const output = join(mkdtemp(), "unit.i");
    let checked = 0;
    for (const unit of readdirSync(join(native, "units"))) {
      // -dI prints each include directive the preprocessor reaches, as
      // written once macros expand, after the line marker of its includer.
      run("clang", [
        "-E",
        "-dI",
        ...hostFlags(),
        join(native, "units", unit),
        "-o",
        output,
      ]);
      let includer = "";
      for (const line of readFileSync(output, "utf8").split("\n")) {
        const marker = /^# \d+ "(.*)"/u.exec(line);
        if (marker) includer = resolve(marker[1]);
        const directive =
          /^#include ([<"])(.+)[>"] \/\* clang -E -dI \*\/$/u.exec(line);
        if (!directive || !includer.startsWith(`${native}/`)) continue;
        const [, delimiter, name] = directive;
        if (delimiter === "<") {
          assert(!headers.has(name), `${includer}: <${name}>`);
          continue;
        }
        const nextToIncluder = resolve(dirname(includer), name);
        const found = existsSync(nextToIncluder)
          ? nextToIncluder
          : join(include, name);
        assert(existsSync(found), `${includer}: "${name}"`);
        if (dirname(includer) === include)
          assert(
            dirname(found) === include ||
              (basename(includer) === "evolu_sqlite3.h" &&
                name === "../c/sqlite3.h"),
            `${includer}: "${name}" is outside include/`,
          );
        checked++;
      }
    }
    // Every unit includes evolu_names.h and its source, and those include
    // more.
    assertTrue(checked > 2 * readdirSync(join(native, "units")).length);
  });
});

describe("the rename header", () => {
  const renames = () =>
    [
      ...readFileSync(join(native, "include/evolu_names.h"), "utf8").matchAll(
        /^#define (\w+) (\w+)$/gmu,
      ),
    ].map(([, name, renamed]) => ({ name, renamed }));

  it("prefixes each name with evolu_, once", () => {
    const names = renames().map(({ name }) => name);

    assertEqual(
      renames().filter(({ name, renamed }) => renamed !== `evolu_${name}`),
      [],
    );
    assertEqual(names.length, new Set(names).size);
  });

  it("covers every SQLITE_API name of the pinned sqlite3.h, the session extension's included", () => {
    const declared = [
      ...readFileSync(join(native, "c/sqlite3.h"), "utf8").matchAll(
        /^SQLITE_API\b[^;]*?\b(sqlite3\w*)\s*[([;]/gmu,
      ),
    ].map(([, name]) => name);

    assertEqual(
      renames()
        .map(({ name }) => name)
        .filter((name) => name.startsWith("sqlite3")),
      [...new Set(declared)].toSorted(),
    );
    assertTrue(declared.includes("sqlite3session_create"));
  });

  it("covers every BearSSL and Monocypher global, and renames none onto a global of the core or the binding", () => {
    const names = new Set(renames().map(({ name }) => name));
    const vendoredGlobals = definedGlobals(
      sourcesFrom(/^@evolu\/sqlite-core\/vendor\//u),
    );
    const coreGlobals = definedGlobals(
      sourcesFrom(/^@evolu\/sqlite-core\/(src|binding)\//u),
    );

    assertEqual(
      vendoredGlobals.filter((name) => !names.has(name)),
      [],
    );
    assertTrue(vendoredGlobals.some((name) => name.startsWith("br_")));
    assertTrue(vendoredGlobals.some((name) => name.startsWith("crypto_")));
    assertEqual(
      coreGlobals.filter((name) => names.has(name.slice("evolu_".length))),
      [],
    );
    assertTrue(coreGlobals.length > 0);
  });
});

it(
  "builds into a host library that defines only evolu_ names and needs only libc, libm and pthread",
  // SQLite compiles at -O2 unless its object is cached.
  { timeout: 600_000 },
  () => {
    const objects = readdirSync(join(native, "units")).map((unit) =>
      compileCached({
        cc: "clang",
        flags: hostFlags(),
        source: join(native, "units", unit),
        extraKey: () => manifestText,
        objectsDirectory: join(buildDirectory, "objects"),
      }),
    );
    const library = join(mkdtemp(), "libevolu.a");
    run("ar", ["rcs", library, ...objects]);

    const defined = symbols(["--defined-only", library]);
    assertTrue(defined.length > 400);
    assertEqual(
      defined.filter(
        (name) => !name.startsWith("evolu_") || name.startsWith("evolu_test_"),
      ),
      [],
    );

    // An executable that links every object fails on any symbol that libc,
    // libm and pthread don't define, or on macOS libSystem.
    const directory = mkdtemp();
    const main = join(directory, "main.c");
    writeFileSync(main, "int main(void) { return 0; }\n");
    run("clang", [
      main,
      ...(process.platform === "darwin"
        ? [`-Wl,-force_load,${library}`]
        : [
            "-Wl,--whole-archive",
            library,
            "-Wl,--no-whole-archive",
            "-lm",
            "-lpthread",
          ]),
      "-o",
      join(directory, "program"),
    ]);
  },
);

const temporaryDirectories: Array<string> = [];

after(() => {
  for (const directory of temporaryDirectories)
    rmSync(directory, { recursive: true, force: true });
});

const mkdtemp = (): string => {
  const directory = mkdtempSync(join(tmpdir(), "evolu-vendor-native-"));
  temporaryDirectories.push(directory);
  return directory;
};

/** A package directory whose native.json lists `edit`'s files. */
const setupPackage = (
  t: TestContext,
  edit: (files: NativeManifest["files"]) => NativeManifest["files"],
): string => {
  const directory = mkdtempSync(join(tmpdir(), "evolu-vendor-native-"));
  t.after(() => {
    rmSync(directory, { recursive: true, force: true });
  });
  writeFileSync(
    join(directory, "native.json"),
    `${JSON.stringify({ ...manifest, files: edit(manifest.files) }, null, 2)}\n`,
  );
  return directory;
};

/** The shipped flags, with Android's, the host's nearest platform. */
const hostFlags = (): ReadonlyArray<string> => [
  ...manifest.flags.c,
  ...manifest.flags.android.c,
  ...manifest.flags.defines.map((define) => `-D${define}`),
  `-I${join(vendored, manifest.flags.headerSearchPath)}`,
];

/** The sources in c/ whose origin matches. */
const sourcesFrom = (origin: RegExp): ReadonlyArray<string> =>
  Object.entries(manifest.files)
    .filter(
      ([path, file]) =>
        path.startsWith("c/") &&
        path.endsWith(".c") &&
        origin.test(file.origin),
    )
    .map(([path]) => join(native, path));

/**
 * The globals that sources compiled on their own, without the rename, define.
 * The core's sources find their public headers in include/.
 */
const definedGlobals = (
  sources: ReadonlyArray<string>,
): ReadonlyArray<string> => {
  assert(sources.length > 0, "No sources.");
  const directory = mkdtemp();
  return sources.flatMap((source) => {
    const object = join(directory, `${basename(source, ".c")}.o`);
    run("clang", [
      "-std=c11",
      `-I${join(native, "include")}`,
      "-c",
      source,
      "-o",
      object,
    ]);
    return symbols(["--defined-only", object]);
  });
};

/** The external symbols llvm-nm lists, without the C label prefix. */
const symbols = (args: ReadonlyArray<string>): ReadonlyArray<string> => {
  const prefix =
    /^#define __USER_LABEL_PREFIX__ ?(\S*)$/mu.exec(
      run("clang", ["-dM", "-E", "-x", "c", "/dev/null"]),
    )?.[1] ?? "";
  return run(llvmTool("llvm-nm"), ["-g", "-P", ...args])
    .split("\n")
    .filter((line) => line !== "" && !line.endsWith(":"))
    .map((line) => line.split(" ")[0].slice(prefix.length));
};

const llvmTool = (name: string): string =>
  run("clang", [`-print-prog-name=${name}`]).trim();

/** Every file under a directory, relative to it, sorted. */
const listFiles = (directory: string): ReadonlyArray<string> =>
  readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) =>
      join(entry.parentPath, entry.name).slice(directory.length + 1),
    )
    .toSorted();

const sha256 = (bytes: string | Uint8Array): string =>
  createHash("sha256").update(bytes).digest("hex");
