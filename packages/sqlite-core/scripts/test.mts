/**
 * Builds the C core's test runner and runs it. As a script, it runs the tests
 * whose name starts with its argument, or all of them, and exits with the
 * runner's status:
 *
 *     node packages/sqlite-core/scripts/test.mts [filter]
 *
 * `SQLITE_CORE_BUILD` and `SQLITE_CORE_CACHE` choose the build and cache
 * directories (see paths.mts).
 *
 * @module
 */
import { spawnSync } from "node:child_process";
import { buildTestRunner } from "./build.mts";
import { defaultBuildDirectory, defaultCacheDirectory } from "./paths.mts";
import { prepareSqlite, sqliteSource } from "./sqlite-source.mts";

/** Builds and runs the C tests, returning the runner's status and output. */
export const runCoreTests = async ({
  env,
  filter,
}: {
  env: NodeJS.ProcessEnv;
  filter?: string;
}): Promise<{ readonly status: number | null; readonly output: string }> => {
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
  // timeout.
  const result = spawnSync(runner, filter == null ? [] : [filter], {
    encoding: "utf8",
    env,
    timeout: 600_000,
    killSignal: "SIGKILL",
  });
  if (result.error && result.signal == null) throw result.error;
  // The error tells a timeout (ETIMEDOUT) or too much output (ENOBUFS) from a
  // crash.
  const reason = result.error == null ? "" : `: ${result.error.message}`;
  return {
    status: result.status,
    output:
      result.stdout +
      result.stderr +
      (result.signal == null ? "" : `\nKilled by ${result.signal}${reason}.\n`),
  };
};

if (import.meta.main) {
  const result = await runCoreTests({
    env: process.env,
    filter: process.argv[2],
  });
  process.stdout.write(result.output);
  process.exitCode = result.status ?? 1;
}
