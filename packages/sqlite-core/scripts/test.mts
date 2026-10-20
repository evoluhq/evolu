/**
 * Builds the C core's test runner and runs it. As a script, it runs the tests
 * whose name starts with its argument, or all of them, and exits with the
 * runner's status:
 *
 *     node packages/sqlite-core/scripts/test.mts [filter]
 *
 * With `--coverage`, the script also lists what the run left uncovered in the
 * core's src/, which a filtered run leaves more of.
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
import { sourceDirectory } from "./compile.mts";
import { formatCoverageGap, measureCoverage } from "./coverage.mts";
import { defaultBuildDirectory, defaultCacheDirectory } from "./paths.mts";
import { prepareSqlite, sqliteSource } from "./sqlite-source.mts";

/**
 * Builds and runs the C tests, returning the runner's path, status and output.
 * The run writes its coverage profile into `profileDirectory`.
 */
export const runCoreTests = async ({
  env,
  filter,
  profileDirectory,
}: {
  env: NodeJS.ProcessEnv;
  filter?: string;
  profileDirectory: string;
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
    options: { coverage: { type: "boolean", default: false } },
  });
  const profileDirectory = mkdtempSync(
    join(tmpdir(), "evolu-sqlite-core-profile-"),
  );
  try {
    const result = await runCoreTests({
      env: process.env,
      filter: positionals[0],
      profileDirectory,
    });
    process.stdout.write(result.output);
    if (values.coverage) {
      const { gaps } = measureCoverage({
        binary: result.runner,
        profileDirectory,
        sourceDirectory,
      });
      for (const gap of gaps)
        process.stdout.write(`${formatCoverageGap(gap, process.cwd())}\n`);
    }
    process.exitCode = result.status ?? 1;
  } finally {
    rmSync(profileDirectory, { recursive: true, force: true });
  }
}
