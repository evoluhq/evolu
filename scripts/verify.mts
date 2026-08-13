import {
  all,
  ok,
  type Task,
} from "@evolu/common";
import {
  availableParallelism,
  runMain,
} from "@evolu/nodejs";
import type { AvailableParallelismDep } from "../packages/nodejs/src/Platform.ts";
import {
  spawn,
  type SpawnError,
} from "../packages/nodejs/src/Cli.ts";

export type VerifyCommand =
  | "biome"
  | "build"
  | "build:docs"
  | "check:packages"
  | "lint"
  | "lint-monorepo"
  | "test:coverage"
  | "typecheck";

export const verify: Task<
  void,
  SpawnError,
  AvailableParallelismDep
> = async (run) => {
  const sourceChecks = await run(
    all(
      [
        async (run) => {
          const typecheck = await run(verifyCommand("typecheck"));
          if (!typecheck.ok) return typecheck;

          return run(verifyCommand("build"));
        },
        verifyCommand("biome"),
        verifyCommand("lint-monorepo"),
      ],
      { concurrency: run.deps.availableParallelism() },
    ),
  );
  if (!sourceChecks.ok) return sourceChecks;

  const builtArtifactChecks = await run(
    all(
      [
        verifyCommand("check:packages"),
        verifyCommand("build:docs"),
        verifyCommand("lint"),
      ],
      { concurrency: run.deps.availableParallelism() },
    ),
  );
  if (!builtArtifactChecks.ok) return builtArtifactChecks;

  return run(verifyCommand("test:coverage"));
};

const verifyCommand = (
  command: VerifyCommand,
): Task<void, SpawnError> =>
  (run) =>
    run(
      spawn("pnpm", [command], {
        cwd: new URL("../", import.meta.url),
      }),
    );

if (import.meta.main) {
  await runMain(
    { availableParallelism },
    { mode: "command" },
  )(async (run) => {
    const result = await run(verify);
    if (!result.ok) {
      run.deps.console.error(result.error.message);
      process.exitCode = 1;
    }
    return ok();
  });
}
