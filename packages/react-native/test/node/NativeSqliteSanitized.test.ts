/**
 * The binding's and driver's tests against the core's N-API mirror built with
 * AddressSanitizer and UndefinedBehaviorSanitizer, since a binding that uses
 * memory it freed or reads past an array can pass them unsanitized.
 */
import { assertEqual } from "@evolu/common";
import { sanitizerPreload } from "@evolu/sqlite-core/scripts/build-addon.mts";
import { setupAddonPath } from "@evolu/sqlite-core/test/setup-addon.mts";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { test } from "node:test";

// The test files that drive the binding, which run again against its sanitized
// build.
const bindingTestFiles = [
  "NativeSqliteBinding.test.ts",
  "NativeSqliteDriver.test.ts",
].map((name) => join(import.meta.dirname, name));

test(
  "the binding's and driver's tests pass with AddressSanitizer and UndefinedBehaviorSanitizer",
  // The first sanitized build compiles SQLite again.
  { timeout: 2_400_000 },
  async (t) => {
    // First, so a host without the shared runtime fails before any compile.
    const preload = sanitizerPreload();
    // Built here, so the children find the sanitized addon's objects compiled
    // and only link it.
    await setupAddonPath({ sanitize: true });
    const directory = mkdtempSync(
      join(tmpdir(), "evolu-react-native-sanitized-"),
    );
    t.after(() => {
      rmSync(directory, { recursive: true, force: true });
    });
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
          // The repo's test options, with a longer timeout, since
          // AddressSanitizer slows each test several times over, most the ones
          // that start many workers at once.
          `--experimental-config-file=${join(import.meta.dirname, "../../../../node.config.json")}`,
          "--test-timeout=120000",
          "--no-experimental-test-coverage",
          "--test",
          "--test-reporter=tap",
          `--test-reporter-destination=${report}`,
          file,
        ],
        {
          env: {
            ...env,
            SQLITE_CORE_SANITIZE: "1",
            [preload.variable]: preload.path,
            // Node.js's test runner starts a process per file, which keeps the
            // preload only with strip_env=0. V8 handles its own segmentation
            // faults, and Node.js doesn't free everything at exit.
            ASAN_OPTIONS: "detect_leaks=0:strip_env=0:handle_segv=0",
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
  },
);
