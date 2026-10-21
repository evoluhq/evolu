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
import { spawnSync } from "node:child_process";
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
 * `profileDirectory`.
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
  // A hung test fails the run, since spawnSync blocks the test runner's
  // timeout. Each process names its profile with its pid.
  const result = spawnSync(runner, filter == null ? [] : [filter], {
    encoding: "utf8",
    env: { ...env, LLVM_PROFILE_FILE: join(profileDirectory, "%p.profraw") },
    timeout: 600_000,
    killSignal: "SIGKILL",
  });
  if (result.error && result.signal == null) throw result.error;
  // The error tells a timeout (ETIMEDOUT) or too much output (ENOBUFS) from a
  // crash.
  const reason = result.error == null ? "" : `: ${result.error.message}`;
  return {
    runner,
    status: result.status,
    output:
      result.stdout +
      result.stderr +
      (result.signal == null ? "" : `\nKilled by ${result.signal}${reason}.\n`),
  };
};

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
