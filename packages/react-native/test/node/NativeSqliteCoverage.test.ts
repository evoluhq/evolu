/**
 * The binding's tests against the core's N-API mirror built with node/binding.c
 * and node/module.c, which `@evolu/nodejs`'s addon ships, instrumented for
 * coverage, which must cover every line, function and branch of both, as the
 * core's tests cover its C.
 */
import { assertEqual } from "@evolu/common";
import { nodeDirectory } from "@evolu/sqlite-core/scripts/compile.mts";
import {
  formatCoverageGap,
  measureCoverage,
} from "@evolu/sqlite-core/scripts/coverage.mts";
import { setupAddonPath } from "@evolu/sqlite-core/test/setup-addon.mts";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { test } from "node:test";

// The test files that drive the binding, which run again against its
// instrumented build.
const bindingTestFiles = [
  "NativeSqliteBinding.test.ts",
  "NativeSqliteFaults.test.ts",
  "NativeSqliteModule.test.ts",
].map((name) => join(import.meta.dirname, name));

test(
  "the binding's tests cover every line, function and branch of node/binding.c and node/module.c",
  // The first instrumented build compiles SQLite again.
  { timeout: 1_200_000 },
  async (t) => {
    // Built here, so the children find the instrumented addon's objects
    // compiled and only link it.
    const addon = await setupAddonPath({ coverage: true });
    const directory = mkdtempSync(
      join(tmpdir(), "evolu-react-native-coverage-"),
    );
    t.after(() => {
      rmSync(directory, { recursive: true, force: true });
    });
    // Each process the files start writes a profile there.
    const profileDirectory = join(directory, "profiles");
    // Without the variable through which this test runner tells its child
    // processes apart, the child runs its own test runner.
    const { NODE_TEST_CONTEXT: _, ...env } = process.env;
    // One file at a time, each of which must run tests, so a file that runs
    // none can't hide behind the others' count.
    const results = bindingTestFiles.map((file) => {
      // On a timeout, SIGTERM lets the runner end its file process. The report
      // goes to a file, because spawnSync closes the pipes before the signal.
      const report = join(directory, `${basename(file)}.tap`);
      const result = spawnSync(
        process.execPath,
        [
          `--experimental-config-file=${join(import.meta.dirname, "../../../../node.config.json")}`,
          "--no-experimental-test-coverage",
          "--test",
          "--test-reporter=tap",
          `--test-reporter-destination=${report}`,
          file,
        ],
        {
          env: {
            ...env,
            SQLITE_CORE_COVERAGE: "1",
            LLVM_PROFILE_FILE: join(profileDirectory, "%p.profraw"),
          },
          encoding: "utf8",
          timeout: 600_000,
          killSignal: "SIGTERM",
        },
      );
      const output =
        (existsSync(report) ? readFileSync(report, "utf8") : "") +
        result.stdout +
        result.stderr;
      const count = (name: string): number | null => {
        const match = new RegExp(`^# ${name} (\\d+)$`, "mu").exec(output);
        return match == null ? null : Number(match[1]);
      };
      if (result.status !== 0) process.stdout.write(output);
      return {
        file: basename(file),
        status: result.status,
        ranTests: (count("pass") ?? 0) > 0,
        fail: count("fail"),
        cancelled: count("cancelled"),
        skipped: count("skipped"),
        todo: count("todo"),
      };
    });

    assertEqual(
      results,
      bindingTestFiles.map((file) => ({
        file: basename(file),
        status: 0,
        ranTests: true,
        fail: 0,
        cancelled: 0,
        skipped: 0,
        todo: 0,
      })),
    );
    const { files, lines, functions, branches, gaps } = measureCoverage({
      binary: addon,
      profileDirectory,
      sourceDirectories: [nodeDirectory],
    });
    // A file the build didn't instrument would be missing, not uncovered.
    assertEqual(
      files.filter((file) => file.endsWith(".c")).toSorted(),
      ["binding.c", "module.c"].map((name) => join(nodeDirectory, name)),
    );
    assertEqual(
      gaps.map((gap) => formatCoverageGap(gap, nodeDirectory)),
      [],
    );
    assertEqual(
      [lines, functions, branches].map(({ count, covered }) => count - covered),
      [0, 0, 0],
    );
  },
);
