/**
 * What runCoreTests reports of a C test runner that didn't complete, with a
 * fake clang that links a shell script as the runner, and the test.mts script,
 * which builds and runs the real one.
 */
import {
  assertEqual,
  assertFalse,
  assertRejects,
  assertTrue,
} from "@evolu/common";
import { spawnSync } from "node:child_process";
import { symlinkSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { describe, it, type TestContext } from "node:test";
import { setImmediate as nextMacrotask } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { defaultSanitizerFlags } from "../scripts/build.mts";
import {
  bindingDirectory,
  cSources,
  sourceDirectory,
} from "../scripts/compile.mts";
import { runCoreTests } from "../scripts/test.mts";
import { setupFakeBuild } from "./fake-build.mts";

describe("runCoreTests", () => {
  it("reports a runner that a signal killed with its output and why", async (t) => {
    const runner = setupRunner(t, {
      script: [
        "#!/bin/sh",
        'if [ "$1" = crash ]; then echo "ok 1 - crash"; kill -KILL $$; fi',
        'if [ "$1" = hang ]; then exec sleep 60; fi',
        "yes",
      ].join("\n"),
      mode: 0o755,
    });

    const crashed = await runner.run("crash");
    // More output than a run may print.
    const flooded = await runner.run("flood");
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const hanging = runner.run("hang");
    // The fake build ends within microtasks, so by the next macrotask the
    // runner and its timeout have started.
    await nextMacrotask();
    t.mock.timers.tick(600_000);
    const hung = await hanging;

    assertEqual(
      [crashed.status, crashed.output],
      [null, "ok 1 - crash\n\nKilled by SIGKILL.\n"],
    );
    assertEqual(flooded.status, null);
    assertTrue(
      flooded.output.endsWith(
        "\nKilled by SIGKILL: more than 1048576 characters of output.\n",
      ),
    );
    assertEqual(
      [hung.status, hung.output],
      [null, "\nKilled by SIGKILL: timed out after 600 s.\n"],
    );
  });

  it("throws when the runner can't start", async (t) => {
    const runner = setupRunner(t, { script: "", mode: 0o644 });

    await assertRejects(runner.run("crash"), (error) => {
      assertEqual((error as NodeJS.ErrnoException).code, "EACCES");
    });
  });

  it("compiles the core's and the binding's sources with coverage and links them into the runner", async (t) => {
    const build = setupFakeBuild(t);
    writeFileSync(join(build.directory, "program"), "#!/bin/sh\n", {
      mode: 0o755,
    });

    await runCoreTests({
      env: { ...process.env, ...build.env },
      profileDirectory: build.directory,
      cc: build.cc,
    });

    const commands = build.commands();
    const link = commands.at(-1) ?? [];
    for (const source of [
      ...cSources(sourceDirectory),
      ...cSources(bindingDirectory),
    ]) {
      const compile = commands.find((args) => args.includes(source));
      assertTrue(compile?.includes("-fprofile-instr-generate"));
      assertTrue(
        link.some((arg) =>
          basename(arg).startsWith(`${basename(source, ".c")}-`),
        ),
      );
    }
  });

  it("compiles and links with the default sanitizer flags, or with a flag set that replaces them, into a runner of its own", async (t) => {
    const build = setupFakeBuild(t);
    writeFileSync(join(build.directory, "program"), "#!/bin/sh\n", {
      mode: 0o755,
    });
    const runWith = async (sanitizerFlags?: ReadonlyArray<string>) => {
      const before = build.commands().length;
      const { runner } = await runCoreTests({
        env: { ...process.env, ...build.env },
        profileDirectory: build.directory,
        cc: build.cc,
        ...(sanitizerFlags && { sanitizerFlags }),
      });
      return { runner, commands: build.commands().slice(before) };
    };

    const defaults = await runWith();
    const m32 = await runWith([...defaultSanitizerFlags, "-m32"]);
    const thread = await runWith(["-fsanitize=thread"]);

    assertEqual(defaultSanitizerFlags, [
      "-fsanitize=address,undefined",
      "-fno-sanitize-recover=all",
    ]);
    // SQLite, the core, the vendored libraries, the tests, the suites and the
    // link.
    for (const { commands } of [defaults, m32, thread])
      assertTrue(commands.length > 10);
    const sets = (commands: ReadonlyArray<ReadonlyArray<string>>) =>
      new Set(
        commands.map((args) =>
          JSON.stringify(
            args.filter(
              (arg) => /^-f(no-)?sanitize/u.test(arg) || arg === "-m32",
            ),
          ),
        ),
      );
    assertEqual(
      sets(defaults.commands),
      new Set([JSON.stringify(defaultSanitizerFlags)]),
    );
    assertEqual(
      sets(m32.commands),
      new Set([JSON.stringify([...defaultSanitizerFlags, "-m32"])]),
    );
    assertEqual(sets(thread.commands), new Set(['["-fsanitize=thread"]']));
    assertEqual(new Set([defaults.runner, m32.runner, thread.runner]).size, 3);
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

  it("builds the runner with ThreadSanitizer in place of the default sanitizers with --thread-sanitizer", (t) => {
    const build = setupFakeBuild(t);
    // The script compiles with the clang on the PATH.
    symlinkSync(build.cc, join(build.directory, "clang"));
    writeFileSync(
      join(build.directory, "program"),
      '#!/bin/sh\necho "ok 1 - $1"\n',
      { mode: 0o755 },
    );

    const result = runTestScript(["binding_threads_", "--thread-sanitizer"], {
      ...build.env,
      PATH: `${build.directory}:${process.env.PATH}`,
    });

    assertEqual(result, { status: 0, output: "ok 1 - binding_threads_\n" });
    const commands = build.commands();
    assertTrue(commands.length > 10);
    for (const args of commands) {
      assertTrue(args.includes("-fsanitize=thread"));
      assertFalse(args.includes("-fsanitize=address,undefined"));
    }
  });

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

/** Runs scripts/test.mts in the package's directory, with `env` added. */
const runTestScript = (
  args: ReadonlyArray<string>,
  env: NodeJS.ProcessEnv = {},
) => {
  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL("../scripts/test.mts", import.meta.url)), ...args],
    {
      cwd: fileURLToPath(new URL("..", import.meta.url)),
      env: { ...process.env, ...env },
      encoding: "utf8",
    },
  );
  return { status: result.status, output: result.stdout + result.stderr };
};
