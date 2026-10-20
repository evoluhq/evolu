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

it("reports each uncovered line, function and branch outcome", (t) => {
  const { directory, sources, binary, profiles } = setupProgram(t);
  const result = spawnSync(binary, {
    env: { ...process.env, LLVM_PROFILE_FILE: join(profiles, "%p.profraw") },
  });
  assertEqual(result.status, 0);

  const report = measureCoverage({
    binary,
    profileDirectory: profiles,
    sourceDirectory: sources,
  });

  assertEqual(
    report.gaps.map((gap) => formatCoverageGap(gap, directory)),
    [
      "src/program.c:1: line never ran",
      "src/program.c:6: line never ran",
      "src/program.c:1: function twice never ran",
      "src/program.c:5:7: condition never true",
      "src/program.c:2:22: condition never false, expanded at src/program.c:7",
    ],
  );
  assertEqual(report.files, [join(sources, "program.c")]);
  assertEqual(
    [report.lines, report.functions, report.branches],
    [
      { count: 7, covered: 5 },
      { count: 2, covered: 1 },
      { count: 4, covered: 2 },
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
    sourceDirectory: sources,
  });

  assertEqual(
    report.gaps.map((gap) => formatCoverageGap(gap, directory)).toSorted(),
    [
      "src/positive.h:1:22: condition never false, expanded at src/a.c:2",
      "src/positive.h:1:22: condition never false, expanded at src/main.c:2",
    ],
  );
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
        sourceDirectory: sources,
      }),
    Error,
  );

  assertEqual(error.message, `${profiles} has no profile of ${binary}`);
});

/**
 * A program that runs without arguments, leaving a function, a line and two
 * outcomes.
 */
const programFiles: Readonly<Record<string, string>> = {
  "program.c": [
    "static int twice(int x) { return 2 * x; }",
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
