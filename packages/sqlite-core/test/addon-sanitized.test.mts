import { assertEqual } from "@evolu/common";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { it } from "node:test";
import { sanitizerPreload } from "../scripts/build-addon.mts";
import { setupAddonPath } from "./setup-addon.mts";

// The test files that drive the addon, which run again against its sanitized
// build. Listed by hand, since a list this file computed could include this
// file, which would then start itself without end.
const addonTestFiles = [
  "addon.test.mts",
  "codec.test.mts",
  "skiplist.test.mts",
  "sqlcipher.test.mts",
].map((name) => join(import.meta.dirname, name));

it("lists every test file that sets the addon up", () => {
  // Matched by the import itself, not by this pattern's text.
  const importsSetup = /from "\.\/setup-addon\.mts";$/mu;
  assertEqual(
    readdirSync(import.meta.dirname)
      .filter(
        (name) =>
          name.endsWith(".test.mts") &&
          name !== basename(import.meta.filename) &&
          importsSetup.test(
            readFileSync(join(import.meta.dirname, name), "utf8"),
          ),
      )
      .toSorted(),
    addonTestFiles.map((file) => basename(file)).toSorted(),
  );
});

it(
  "passes each addon test file's tests with AddressSanitizer and UndefinedBehaviorSanitizer",
  // The first sanitized build compiles SQLite again.
  { timeout: 2_400_000 },
  async (t) => {
    // First, so a host without the shared runtime fails before any compile.
    const preload = sanitizerPreload();
    // Built here, so the children find the sanitized addon's objects compiled
    // and only link it. Compiling SQLite with the sanitizers takes clang about
    // 1.1 GB, which with a child's sanitized Node.js processes overfilled a
    // 2 GiB Linux VM.
    await setupAddonPath({ sanitize: true });
    const directory = mkdtempSync(
      join(tmpdir(), "evolu-sqlite-core-sanitized-"),
    );
    t.after(() => {
      rmSync(directory, { recursive: true, force: true });
    });
    // Without the variable through which this test runner tells its child
    // processes apart, the child runs its own test runner.
    const { NODE_TEST_CONTEXT: _, ...env } = process.env;
    // One file at a time, each of which must run tests, so a file that runs
    // none can't hide behind the others' count.
    const results = addonTestFiles.map((file) => {
      // On a timeout, SIGTERM lets the runner end its file process, which
      // SIGKILL would leave running. The report goes to a file, because
      // spawnSync closes the pipes before the signal, and the runner's
      // handler, which reports the interrupted tests first, would die writing
      // to them.
      const report = join(directory, `${basename(file)}.tap`);
      const result = spawnSync(
        process.execPath,
        [
          // The repo's test options, as pnpm test:sqlite-core runs the file,
          // such as its timeout.
          `--experimental-config-file=${join(import.meta.dirname, "../../../node.config.json")}`,
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
      addonTestFiles.map((file) => ({
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
