import { assertEqual, assertTrue } from "@evolu/common";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { after, before, it } from "node:test";
import { cSources, sourceDirectory } from "../scripts/compile.mts";
import {
  formatCoverageGap,
  isFullCoverageExpected,
  measureCoverage,
} from "../scripts/coverage.mts";
import { runCoreTests } from "../scripts/test.mts";

type Run = Awaited<ReturnType<typeof runCoreTests>>;

// Both runs write into one directory, so the coverage is theirs together.
const profileDirectory = mkdtempSync(join(tmpdir(), "evolu-sqlite-core-"));
let hardware: Run;
let software: Run;

before(
  async () => {
    const { EVOLU_TEST_SOFTWARE_CRYPTO: _, ...env } = process.env;
    hardware = await runCoreTests({ env, profileDirectory });
    software = await runCoreTests({
      env: { ...env, EVOLU_TEST_SOFTWARE_CRYPTO: "1" },
      profileDirectory,
    });
  },
  // The first run compiles SQLite and can generate its amalgamation.
  { timeout: 1_200_000 },
);

after(() => {
  rmSync(profileDirectory, { recursive: true, force: true });
});

it("passes the C test suite", () => {
  if (hardware.status !== 0) process.stdout.write(hardware.output);
  assertEqual(hardware.status, 0);
  assertTrue(hardware.output.includes("# crypto: hardware\n"));
  assertTrue(/^# cpu: \d+$/mu.test(hardware.output));
});

it("passes the C test suite on the software crypto path", () => {
  if (software.status !== 0) process.stdout.write(software.output);
  assertEqual(software.status, 0);
  assertTrue(software.output.includes("# crypto: software\n"));
});

it("covers every line, function and branch of the core's C", (t) => {
  const { files, lines, functions, branches, gaps } = measureCoverage({
    binary: hardware.runner,
    profileDirectory,
    sourceDirectory,
  });
  const uncovered = gaps.map((gap) => formatCoverageGap(gap, process.cwd()));
  // The CPU's features, which the hardware run prints.
  const cpu = /^# cpu: (\d+)$/mu.exec(hardware.output);
  // Each CI runner declares its CPU's, so one that loses a feature fails.
  if (process.env.CI !== undefined)
    assertEqual(cpu?.[1], process.env.EVOLU_TEST_EXPECTED_CPU);

  // A source the build didn't instrument would be missing, not uncovered.
  assertEqual(
    files.filter((file) => file.endsWith(".c")).toSorted(),
    cSources(sourceDirectory),
  );
  if (
    cpu != null &&
    !isFullCoverageExpected({ arch: process.arch, cpuFeatures: Number(cpu[1]) })
  ) {
    // Only the crypto layer's dispatch and hardware paths depend on the CPU.
    const cpuDependent = new Set([
      "evolu_crypto.c",
      "evolu_crypto.h",
      "evolu_crypto_hw.c",
    ]);
    assertEqual(
      gaps
        .filter(({ file }) => !cpuDependent.has(basename(file)))
        .map((gap) => formatCoverageGap(gap, process.cwd())),
      [],
    );
    for (const gap of uncovered) t.diagnostic(gap);
    t.skip(
      `this CPU, with features ${cpu[1]}, can't run every hardware path; ${uncovered.length} gaps listed`,
    );
    return;
  }
  assertEqual(uncovered, []);
  assertEqual(
    [lines, functions, branches].map(({ count, covered }) => count - covered),
    [0, 0, 0],
  );
});
