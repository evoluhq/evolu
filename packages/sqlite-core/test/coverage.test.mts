import { assertEqual, assertThrowsInstanceOf } from "@evolu/common";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it, type TestContext } from "node:test";
import { run } from "../scripts/compile.mts";
import {
  coverageFlags,
  formatCoverageGap,
  isFullCoverageExpected,
  measureCoverage,
} from "../scripts/coverage.mts";
import { setupFakeBuild } from "./fake-build.mts";

it("reports each uncovered line, function and branch outcome", (t) => {
  const { directory, sources, binary, profiles } = setupProgram(t);
  const result = spawnSync(binary, {
    env: { ...process.env, LLVM_PROFILE_FILE: join(profiles, "%p.profraw") },
  });
  assertEqual(result.status, 0);

  const report = measureCoverage({
    binary,
    profileDirectory: profiles,
    sourceDirectories: [sources],
  });

  assertEqual(
    report.gaps.map((gap) => formatCoverageGap(gap, directory)),
    [
      "src/program.c:1: line never ran",
      "src/program.c:6: line never ran",
      "src/program.c:1: function twice never ran",
      "src/program.c:5:7: condition never true",
      "src/program.c:1:34: condition never evaluated",
      "src/program.c:2:22: condition never false, expanded at src/program.c:7",
    ],
  );
  assertEqual(report.files, [join(sources, "program.c")]);
  assertEqual(
    [report.lines, report.functions, report.branches],
    [
      { count: 7, covered: 5 },
      { count: 2, covered: 1 },
      { count: 6, covered: 2 },
    ],
  );
});

it("lists a macro's outcome once for each file that expands it", (t) => {
  const { directory, sources, binary, profiles } = setupProgram(t, {
    "positive.h": "#define POSITIVE(x) ((x) > 0 ? 1 : 0)\n",
    // Both expand it at line 2.
    "a.c": '#include "positive.h"\nint a(int x) { return POSITIVE(x); }\n',
    "main.c": [
      '#include "positive.h"',
      "int main(int argc, char **argv) { int a(int); (void)argv; return POSITIVE(argc) + a(argc) - 2; }",
      "",
    ].join("\n"),
  });
  const result = spawnSync(binary, {
    env: { ...process.env, LLVM_PROFILE_FILE: join(profiles, "%p.profraw") },
  });
  assertEqual(result.status, 0);

  const report = measureCoverage({
    binary,
    profileDirectory: profiles,
    sourceDirectories: [sources],
  });

  assertEqual(
    report.gaps.map((gap) => formatCoverageGap(gap, directory)).toSorted(),
    [
      "src/positive.h:1:22: condition never false, expanded at src/a.c:2",
      "src/positive.h:1:22: condition never false, expanded at src/main.c:2",
    ],
  );
});

it("reports the sources under each directory it's given and no others", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "evolu-sqlite-core-coverage-"));
  t.after(() => {
    rmSync(directory, { recursive: true, force: true });
  });
  const sources = join(directory, "src");
  const other = join(directory, "other");
  const profiles = join(directory, "profiles");
  for (const path of [sources, other, profiles]) mkdirSync(path);
  writeFileSync(
    join(sources, "main.c"),
    "int other(int x);\nint main(int argc, char **argv) { (void)argv; return other(argc) - 1; }\n",
  );
  writeFileSync(
    join(other, "other.c"),
    "int other(int x) {\n  return x > 5 ? 2 : 1;\n}\n",
  );
  const binary = join(directory, "program");
  run("clang", [
    ...coverageFlags,
    join(sources, "main.c"),
    join(other, "other.c"),
    "-o",
    binary,
  ]);
  const result = spawnSync(binary, {
    env: { ...process.env, LLVM_PROFILE_FILE: join(profiles, "%p.profraw") },
  });
  assertEqual(result.status, 0);

  const measure = (sourceDirectories: ReadonlyArray<string>) =>
    measureCoverage({ binary, profileDirectory: profiles, sourceDirectories });

  const both = measure([sources, other]);
  assertEqual(both.files.toSorted(), [
    join(other, "other.c"),
    join(sources, "main.c"),
  ]);
  assertEqual(
    both.gaps.map((gap) => formatCoverageGap(gap, directory)),
    ["other/other.c:2:10: condition never true"],
  );
  assertEqual(measure([sources]).gaps, []);
});

it("counts every run of code that threads run at once", (t) => {
  const { binary, profiles } = setupProgram(t, {
    "threads.c": [
      "#include <pthread.h>",
      "#include <stdatomic.h>",
      "static atomic_int started;",
      "static void counted(void) {}",
      "static void *call(void *unused) {",
      "  (void)unused;",
      "  atomic_fetch_add(&started, 1);",
      "  while (atomic_load(&started) < 4) {}",
      "  for (int i = 0; i < 100000; i++) counted();",
      "  return 0;",
      "}",
      "int main(void) {",
      "  pthread_t threads[4];",
      "  for (int i = 0; i < 4; i++) pthread_create(&threads[i], 0, call, 0);",
      "  for (int i = 0; i < 4; i++) pthread_join(threads[i], 0);",
      "  return 0;",
      "}",
      "",
    ].join("\n"),
  });
  const result = spawnSync(binary, {
    env: { ...process.env, LLVM_PROFILE_FILE: join(profiles, "run.profraw") },
  });
  assertEqual(result.status, 0);

  const profdata = run("clang", ["-print-prog-name=llvm-profdata"]).trim();
  const shown = run(profdata, [
    "show",
    "--function=counted",
    join(profiles, "run.profraw"),
  ]);

  assertEqual(/Function count: (\d+)/u.exec(shown)?.[1], "400000");
});

it("expects full coverage where the CPU has every feature its architecture's hardware paths use", () => {
  assertEqual(
    [
      { arch: "arm64", cpuFeatures: 7 },
      { arch: "arm64", cpuFeatures: 3 },
      { arch: "arm64", cpuFeatures: 1 },
      { arch: "x64", cpuFeatures: 1 },
      { arch: "x64", cpuFeatures: 0 },
      { arch: "arm", cpuFeatures: 0 },
    ].map(isFullCoverageExpected),
    [true, false, false, true, false, true],
  );
});

it("throws when no run wrote a profile", (t) => {
  const { sources, binary, profiles } = setupProgram(t);

  const error = assertThrowsInstanceOf(
    () =>
      measureCoverage({
        binary,
        profileDirectory: profiles,
        sourceDirectories: [sources],
      }),
    Error,
  );

  assertEqual(error.message, `${profiles} has no profile of ${binary}`);
});

it("throws when clang has no llvm-profdata and when llvm-profdata fails", (t) => {
  const { cc, directory } = setupFakeBuild(t);
  const profiles = join(directory, "profiles");
  mkdirSync(profiles);
  writeFileSync(join(profiles, "1.profraw"), "");
  const profdata = join(directory, "llvm-profdata");
  const measure = () =>
    measureCoverage({
      binary: join(directory, "program"),
      profileDirectory: profiles,
      sourceDirectories: [directory],
      cc,
    });

  assertEqual(
    assertThrowsInstanceOf(measure, Error).message,
    `${cc} has no llvm-profdata: spawnSync ${profdata} ENOENT`,
  );
  writeFileSync(profdata, "#!/bin/sh\necho 'malformed profile' >&2\nexit 1\n", {
    mode: 0o755,
  });
  assertEqual(
    assertThrowsInstanceOf(measure, Error).message,
    `${profdata} exited with 1\nmalformed profile\n`,
  );
});

/**
 * A program whose run without arguments leaves a function, a line, the
 * condition in that function and an outcome of each of its other two conditions
 * uncovered.
 */
const programFiles: Readonly<Record<string, string>> = {
  "program.c": [
    "static int twice(int x) { return x > 0 ? 2 * x : 0; }",
    "#define POSITIVE(x) ((x) > 0 ? 1 : 0)",
    "int main(int argc, char **argv) {",
    "  (void)argv;",
    "  if (argc > 5)",
    "    return twice(argc);",
    "  return POSITIVE(argc) - 1;",
    "}",
    "",
  ].join("\n"),
};

/**
 * A program compiled with coverage from files in its src directory,
 * {@link programFiles} by default.
 */
const setupProgram = (t: TestContext, files = programFiles) => {
  const directory = mkdtempSync(join(tmpdir(), "evolu-sqlite-core-coverage-"));
  t.after(() => {
    rmSync(directory, { recursive: true, force: true });
  });
  const sources = join(directory, "src");
  const profiles = join(directory, "profiles");
  mkdirSync(sources);
  mkdirSync(profiles);
  for (const [name, text] of Object.entries(files))
    writeFileSync(join(sources, name), text);
  const binary = join(directory, "program");
  run("clang", [
    ...coverageFlags,
    ...Object.keys(files)
      .filter((name) => name.endsWith(".c"))
      .map((name) => join(sources, name)),
    "-o",
    binary,
  ]);
  return { directory, sources, binary, profiles };
};
