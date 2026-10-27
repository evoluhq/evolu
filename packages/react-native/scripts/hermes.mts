/**
 * Runs `@evolu/react-native`'s JSI adapter, `cpp/EvoluSqliteBinding.cpp`, under
 * the Hermes that React Native pins, on macOS: the binding's conformance suite
 * and the Hermes tests of `test/hermes/`, in a host program that links the
 * macOS framework of the pinned Hermes tarball, the C that `native/` ships, the
 * adapter and `test/hermes/host.cpp`.
 *
 * - It takes the tarball from the cache, or fetches it there, and checks its
 *   SHA3-256 against the pin before it uses it. Then it unpacks only the
 *   framework and the headers, once per pin, into a directory of their own.
 *   Nothing else from the tarball runs.
 * - Hermes evaluates scripts, not modules, so esbuild compiles
 *   `test/hermes/suite.ts` to one script that defines `EvoluHermesSuite`.
 * - It builds the host twice: with AddressSanitizer and
 *   UndefinedBehaviorSanitizer, and with ThreadSanitizer, which can't combine
 *   with them. Each build compiles `native/units` with the shipped defines and
 *   the core's test hooks, and the adapter and the host with warnings as
 *   errors. Only the first instruments the adapter for coverage. LeakSanitizer
 *   doesn't run on Apple's arm64, so the host counts SQLite's allocations
 *   itself and fails when one outlives the tests.
 * - It runs each host with the script, a directory that holds only the database
 *   of the conformance suite's ill-formed names, and the filter, and when both
 *   pass, reports the first's coverage of `cpp/`.
 *
 * Usage: `node packages/react-native/scripts/hermes.mts [filter]` runs the
 * tests whose names include the filter, or all of them, prints both runs and
 * the coverage, and fails unless both passed and, without a filter, they ran
 * every line, function and branch of `cpp/EvoluSqliteBinding.cpp`. A filtered
 * run lists what it left uncovered without failing.
 *
 * It needs `native/`, which `vendor-native.mts` writes, macOS with Xcode's
 * clang, llvm-profdata and llvm-cov, and network access the first time.
 * `SQLITE_CORE_CACHE` and `SQLITE_CORE_BUILD` choose its cache and build
 * directories, as for `@evolu/sqlite-core`.
 *
 * @module
 */
import {
  compileCached,
  run,
  writeAtomically,
} from "@evolu/sqlite-core/scripts/compile.mts";
import {
  coverageFlags,
  formatCoverageGap,
  measureCoverage,
} from "@evolu/sqlite-core/scripts/coverage.mts";
import {
  defaultBuildDirectory,
  defaultCacheDirectory,
} from "@evolu/sqlite-core/scripts/paths.mts";
import {
  fetchPinned,
  type PinnedArchive,
} from "@evolu/sqlite-core/scripts/sqlite-source.mts";
import { build } from "esbuild";
import { type SpawnSyncReturns, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";
import { writeIllFormedNamesDatabase } from "../test/illFormedNames.ts";
import type { NativeManifest } from "./vendor-native.mts";

/**
 * The Hermes of React Native 0.88, which its
 * `sdks/hermes-engine/version.properties` names: the debug tarball on Maven
 * Central that `hermes-engine.podspec` takes as its source, whose macOS
 * framework the podspec vendors.
 */
export const hermesTarball: PinnedArchive = {
  url: "https://repo1.maven.org/maven2/com/facebook/hermes/hermes-ios/260318099.0.4/hermes-ios-260318099.0.4-hermes-ios-debug.tar.gz",
  file: "hermes-ios-260318099.0.4-hermes-ios-debug.tar.gz",
  hash: "192e839ffc4d9edd45f26a88cd72c7d6b1d5fe683b5fab539fea8b5a7ebbea56",
};

/**
 * Builds and runs the hosts of the package in `packageDirectory`, which holds
 * `native.json` and `native/`, as the module documentation describes, with the
 * C compiler `cc`, the C++ compiler `cxx` and `tar`, and returns whether they
 * passed, with what they printed and their coverage.
 */
export const runHermesTests = async ({
  packageDirectory,
  env,
  filter,
  cc = "clang",
  cxx = "clang++",
  tar = "tar",
  tarball = hermesTarball,
}: {
  packageDirectory: string;
  env: NodeJS.ProcessEnv;
  filter?: string | undefined;
  cc?: string;
  cxx?: string;
  tar?: string;
  tarball?: PinnedArchive;
}): Promise<{ readonly passed: boolean; readonly output: string }> => {
  const buildDirectory = defaultBuildDirectory(env);
  const archive = await fetchPinned(tarball, defaultCacheDirectory(env));
  const manifest = readFileSync(join(packageDirectory, "native.json"), "utf8");
  const digest = join(packageDirectory, "native/native.json.sha256");
  if (
    !existsSync(digest) ||
    readFileSync(digest, "utf8") !==
      `${createHash("sha256").update(manifest).digest("hex")}\n`
  )
    throw new Error(
      "native/ is missing or was written for another native.json. Run node packages/react-native/scripts/vendor-native.mts first.",
    );

  const hermes = join(buildDirectory, "hermes", tarball.hash);
  if (!existsSync(hermes)) {
    mkdirSync(dirname(hermes), { recursive: true });
    const work = mkdtempSync(`${hermes}.`);
    try {
      run(tar, [
        "-xzf",
        archive,
        "-C",
        work,
        "./destroot/include",
        "./destroot/Library/Frameworks/macosx",
      ]);
      try {
        renameSync(work, hermes);
      } catch (error) {
        // Another run unpacked it first.
        if (!existsSync(hermes)) throw error;
      }
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  }

  const [suite] = (
    await build({
      entryPoints: [join(packageDirectory, "test/hermes/suite.ts")],
      bundle: true,
      format: "iife",
      globalName: "EvoluHermesSuite",
      write: false,
      outfile: "suite.js",
      logLevel: "silent",
    })
  ).outputFiles;
  const suitePath = join(buildDirectory, "hermes-suite", "suite.js");
  mkdirSync(dirname(suitePath), { recursive: true });
  writeAtomically(suitePath, (output) => {
    writeFileSync(output, suite.contents);
  });

  const { flags, files } = JSON.parse(manifest) as NativeManifest;
  const cppDirectory = join(packageDirectory, "cpp");
  const adapter = join(cppDirectory, "EvoluSqliteBinding.cpp");
  const shipped = [
    "-g",
    "-O1",
    "-fno-omit-frame-pointer",
    ...flags.defines.map((define) => `-D${define}`),
    // The hooks a test needs to fail the build check or the random source, or
    // to see the adapter's copy of a key.
    "-DEVOLU_TEST_HOOKS",
    `-I${join(packageDirectory, flags.headerSearchPath)}`,
  ];
  const cxxFlags = [
    "-std=c++20",
    "-Wall",
    "-Wextra",
    "-Werror",
    `-isystem${join(hermes, "destroot/include")}`,
  ];
  // A C++ object depends on native/, which native.json pins, the Hermes
  // headers, which the tarball's pin does, and the adapter's headers.
  const cxxHeaders = (): string =>
    [
      manifest,
      tarball.hash,
      ...readdirSync(cppDirectory)
        .filter((file) => file.endsWith(".h"))
        .toSorted()
        .map((file) => readFileSync(join(cppDirectory, file), "utf8")),
    ].join("\n");
  const framework = join(hermes, "destroot/Library/Frameworks/macosx");
  const objectsDirectory = join(buildDirectory, "objects");
  const profileDirectory = mkdtempSync(join(tmpdir(), "evolu-hermes-profile-"));
  try {
    const runs = [
      {
        name: "address",
        title: "AddressSanitizer and UndefinedBehaviorSanitizer",
        sanitizer: [
          "-fsanitize=address,undefined",
          "-fno-sanitize-recover=all",
        ],
        coverage: coverageFlags,
      },
      {
        name: "thread",
        title: "ThreadSanitizer",
        sanitizer: ["-fsanitize=thread"],
        coverage: [],
      },
    ].map(({ name, title, sanitizer, coverage }) => {
      const objects = [
        ...Object.keys(files)
          .filter((path) => path.startsWith("units/"))
          .map((path) =>
            compileCached({
              cc,
              flags: ["-std=c11", ...shipped, ...sanitizer],
              source: join(packageDirectory, "native", path),
              extraKey: () => manifest,
              objectsDirectory,
            }),
          ),
        compileCached({
          cc: cxx,
          flags: [...cxxFlags, ...shipped, ...sanitizer, ...coverage],
          source: adapter,
          extraKey: cxxHeaders,
          objectsDirectory,
        }),
        compileCached({
          cc: cxx,
          flags: [...cxxFlags, ...shipped, ...sanitizer, `-I${cppDirectory}`],
          source: join(packageDirectory, "test/hermes/host.cpp"),
          extraKey: cxxHeaders,
          objectsDirectory,
        }),
      ];
      const host = join(buildDirectory, `hermes-host-${name}`);
      writeAtomically(host, (output) => {
        run(cxx, [
          ...sanitizer,
          // Links the profile runtime, which writes the profile at exit.
          ...coverage,
          ...objects,
          `-F${framework}`,
          "-framework",
          "hermesvm",
          `-Wl,-rpath,${framework}`,
          "-o",
          output,
        ]);
      });
      // Each run gets an empty directory for the suite's files, and the
      // database of the conformance suite's ill-formed names.
      const directory = mkdtempSync(join(tmpdir(), "evolu-hermes-"));
      writeIllFormedNamesDatabase(join(directory, "ill-formed-names.db"));
      let result: SpawnSyncReturns<string>;
      try {
        // A hung test fails the run, since spawnSync blocks until the timeout.
        result = spawnSync(
          host,
          [suitePath, directory, ...(filter == null ? [] : [filter])],
          {
            encoding: "utf8",
            env: {
              ...env,
              ...(coverage.length > 0 && {
                LLVM_PROFILE_FILE: join(profileDirectory, "%p.profraw"),
              }),
            },
            timeout: 600_000,
            killSignal: "SIGKILL",
          },
        );
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
      if (result.error && result.signal == null) throw result.error;
      // The error tells a timeout (ETIMEDOUT) or too much output (ENOBUFS)
      // from a crash.
      const reason = result.error == null ? "" : `: ${result.error.message}`;
      return {
        host,
        status: result.status,
        output: `## ${title}\n${result.stdout}${result.stderr}${result.signal == null ? "" : `\nKilled by ${result.signal}${reason}.\n`}`,
      };
    });

    let output = runs.map((run) => run.output).join("");
    if (runs.some(({ status }) => status !== 0))
      return { passed: false, output };
    const {
      files: covered,
      lines,
      functions,
      branches,
      gaps,
    } = measureCoverage({
      binary: runs[0].host,
      profileDirectory,
      sourceDirectories: [cppDirectory],
      cc,
    });
    const uncovered = [
      ...(covered.includes(adapter)
        ? []
        : [
            "cpp/EvoluSqliteBinding.cpp isn't in the report, so the build didn't instrument it.",
          ]),
      ...gaps.map((gap) => formatCoverageGap(gap, packageDirectory)),
    ];
    output += `## Coverage of cpp/EvoluSqliteBinding.cpp: ${lines.covered} of ${lines.count} lines, ${functions.covered} of ${functions.count} functions, ${branches.covered} of ${branches.count} branches\n`;
    for (const line of uncovered) output += `${line}\n`;
    if (filter == null) return { passed: uncovered.length === 0, output };
    if (uncovered.length > 0)
      output += "A filtered run leaves gaps, which fail only a full one.\n";
    return { passed: true, output };
  } finally {
    rmSync(profileDirectory, { recursive: true, force: true });
  }
};

/**
 * Runs the command line the module documentation describes and returns its exit
 * code.
 */
export const runHermesCli = async (
  args: ReadonlyArray<string>,
  options: {
    packageDirectory: string;
    env: NodeJS.ProcessEnv;
    cc?: string;
    cxx?: string;
    tarball?: PinnedArchive;
  },
): Promise<number> => {
  const { positionals } = parseArgs({
    args: [...args],
    allowPositionals: true,
  });
  const { passed, output } = await runHermesTests({
    ...options,
    filter: positionals[0],
  });
  // oxlint-disable-next-line eslint/no-console -- Report CLI results.
  console.log(output.trimEnd());
  return passed ? 0 : 1;
};

if (import.meta.main)
  process.exitCode = await runHermesCli(process.argv.slice(2), {
    packageDirectory: join(import.meta.dirname, ".."),
    env: process.env,
  });
