/**
 * Builds the C core's test runner and runs it. As a script, it runs the tests
 * whose name starts with its argument, or all of them, and fails unless the
 * runner passed:
 *
 *     node packages/sqlite-core/scripts/test.mts [filter]
 *
 * With `--coverage`, the script also lists what the run left uncovered in the
 * core's src/ and the binding's binding/, which a filtered run leaves more of.
 * With `--thread-sanitizer`, it builds the runner with ThreadSanitizer in place
 * of AddressSanitizer and UndefinedBehaviorSanitizer, for the thread tests:
 *
 *     node packages/sqlite-core/scripts/test.mts binding_threads_ --thread-sanitizer
 *
 * `SQLITE_CORE_BUILD` and `SQLITE_CORE_CACHE` choose the build and cache
 * directories (see paths.mts).
 *
 * @module
 */
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { buildTestRunner } from "./build.mts";
import { bindingDirectory, sourceDirectory } from "./compile.mts";
import { formatCoverageGap, measureCoverage } from "./coverage.mts";
import { defaultBuildDirectory, defaultCacheDirectory } from "./paths.mts";
import { prepareSqlite, sqliteSource } from "./sqlite-source.mts";

/**
 * Builds the C tests with the C compiler `cc` and the runner's sanitizer flags,
 * or `sanitizerFlags` in their place (build.mts), and runs them, returning the
 * runner's path, status and output. The run writes its coverage profile into
 * `profileDirectory`. Several calls can run at once, as core.test.mts runs both
 * crypto paths.
 */
export const runCoreTests = async ({
  env,
  filter,
  profileDirectory,
  cc = "clang",
  sanitizerFlags,
}: {
  env: NodeJS.ProcessEnv;
  filter?: string;
  profileDirectory: string;
  cc?: string;
  sanitizerFlags?: ReadonlyArray<string>;
}): Promise<{
  readonly runner: string;
  readonly status: number | null;
  readonly output: string;
}> => {
  const buildDirectory = defaultBuildDirectory(env);
  const sqlite = await prepareSqlite({
    source: sqliteSource,
    cacheDirectory: defaultCacheDirectory(env),
    temporaryDirectory: buildDirectory,
  });
  const runner = buildTestRunner({
    sqlite,
    source: sqliteSource,
    outputDirectory: buildDirectory,
    cc,
    ...(sanitizerFlags && { sanitizerFlags }),
  });
  // Each process names its profile with its pid.
  const child = spawn(runner, filter == null ? [] : [filter], {
    env: { ...env, LLVM_PROFILE_FILE: join(profileDirectory, "%p.profraw") },
  });
  // A hung test or one that never stops printing fails the run. The reason
  // tells such a kill from a crash. Closing the pipes ends the run even when a
  // process the runner started still holds them.
  let reason = "";
  const kill = (why: string) => {
    reason = `: ${why}`;
    child.kill("SIGKILL");
    child.stdout.destroy();
    child.stderr.destroy();
  };
  const timeout = setTimeout(() => {
    kill("timed out after 600 s");
  }, 600_000);
  const output = { stdout: "", stderr: "" };
  for (const name of ["stdout", "stderr"] as const)
    child[name].setEncoding("utf8").on("data", (chunk: string) => {
      output[name] += chunk;
      if (output.stdout.length + output.stderr.length > outputLimit)
        kill(`more than ${outputLimit} characters of output`);
    });
  try {
    const [status, signal] = (await once(child, "close")) as [
      number | null,
      NodeJS.Signals | null,
    ];
    return {
      runner,
      status,
      output:
        output.stdout +
        output.stderr +
        (signal == null ? "" : `\nKilled by ${signal}${reason}.\n`),
    };
  } finally {
    clearTimeout(timeout);
  }
};

/** The most characters a run may print, far more than the C tests print. */
const outputLimit = 1024 * 1024;

if (import.meta.main) {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      coverage: { type: "boolean", default: false },
      "thread-sanitizer": { type: "boolean", default: false },
    },
  });
  const profileDirectory = mkdtempSync(
    join(tmpdir(), "evolu-sqlite-core-profile-"),
  );
  try {
    const result = await runCoreTests({
      env: process.env,
      filter: positionals[0],
      profileDirectory,
      ...(values["thread-sanitizer"] && {
        sanitizerFlags: ["-fsanitize=thread"],
      }),
    });
    process.stdout.write(result.output);
    if (values.coverage) {
      const { gaps } = measureCoverage({
        binary: result.runner,
        profileDirectory,
        sourceDirectories: [sourceDirectory, bindingDirectory],
      });
      for (const gap of gaps)
        process.stdout.write(`${formatCoverageGap(gap, process.cwd())}\n`);
    }
    process.exitCode = result.status === 0 ? 0 : 1;
  } finally {
    rmSync(profileDirectory, { recursive: true, force: true });
  }
}
