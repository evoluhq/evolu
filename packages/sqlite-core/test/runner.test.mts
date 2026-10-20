/**
 * What runCoreTests reports of a C test runner that didn't complete, with a
 * fake clang that links a shell script as the runner, and the test.mts script,
 * which builds and runs the real one.
 */
import { assertEqual, assertRejects, assertTrue } from "@evolu/common";
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { runCoreTests } from "../scripts/test.mts";
import { setupFakeBuild } from "./fake-build.mts";

describe("runCoreTests", () => {
  it("reports a runner that a signal killed with its output and why", async (t) => {
    const runner = setupRunner(t, {
      script: [
        "#!/bin/sh",
        'if [ "$1" = crash ]; then echo "ok 1 - crash"; kill -KILL $$; fi',
        "yes",
      ].join("\n"),
      mode: 0o755,
    });

    const crashed = await runner.run("crash");
    // More output than spawnSync takes.
    const flooded = await runner.run("flood");

    assertEqual(
      [crashed.status, crashed.output],
      [null, "ok 1 - crash\n\nKilled by SIGKILL.\n"],
    );
    assertEqual(flooded.status, null);
    assertTrue(
      flooded.output.endsWith(
        `\nKilled by SIGKILL: spawnSync ${flooded.runner} ENOBUFS.\n`,
      ),
    );
  });

  it("throws when the runner can't start", async (t) => {
    const runner = setupRunner(t, { script: "", mode: 0o644 });

    await assertRejects(runner.run("crash"), (error) => {
      assertEqual((error as NodeJS.ErrnoException).code, "EACCES");
    });
  });
});

describe("test.mts", () => {
  it(
    "runs the C tests whose names start with its argument and lists what they left uncovered",
    // On a cold cache, the build compiles SQLite and can generate its
    // amalgamation.
    { timeout: 1_200_000 },
    () => {
      const result = runTestScript(["crypto_wipe_", "--coverage"]);

      if (result.status !== 0) process.stdout.write(result.output);
      assertEqual(result.status, 0);
      assertTrue(
        result.output.includes(
          "\nok 1 - crypto_wipe_zeroes_only_the_given_bytes\n1..1\n# 0 failed\n",
        ),
      );
      // Paths are relative to the working directory.
      assertTrue(
        /^src\/evolu_codec\.c:\d+: line never ran$/mu.test(result.output),
      );
    },
  );

  it(
    "fails when no C test's name starts with its argument",
    { timeout: 1_200_000 },
    () => {
      const result = runTestScript(["evolu_no_such_test"]);

      assertEqual(result.status, 1);
      assertTrue(result.output.endsWith("\n1..0\n# 0 failed\n"));
    },
  );
});

/**
 * Sets up a fake build whose runner is `script` with the file mode `mode`, and
 * runs it with a filter.
 */
const setupRunner = (
  t: TestContext,
  { script, mode }: { script: string; mode: number },
) => {
  const build = setupFakeBuild(t);
  writeFileSync(join(build.directory, "program"), script, { mode });
  return {
    run: (filter: string) =>
      runCoreTests({
        env: { ...process.env, ...build.env },
        filter,
        profileDirectory: build.directory,
        cc: build.cc,
      }),
  };
};

/** Runs scripts/test.mts in the package's directory. */
const runTestScript = (args: ReadonlyArray<string>) => {
  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL("../scripts/test.mts", import.meta.url)), ...args],
    { cwd: fileURLToPath(new URL("..", import.meta.url)), encoding: "utf8" },
  );
  return { status: result.status, output: result.stdout + result.stderr };
};
