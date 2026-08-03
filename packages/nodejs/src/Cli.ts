/**
 * Abort-aware CLI process utilities.
 *
 * @module
 */

import { callback, err, ok, type Task, type Typed } from "@evolu/common";
import { spawn as nodeSpawn } from "node:child_process";

/** Runs a command with inherited stdio. */
export type Spawn = (
  file: string,
  args: ReadonlyArray<string>,
  options?: {
    readonly cwd?: string | URL;
  },
) => Task<void, SpawnError>;

/** Failure to start a command or an unsuccessful command exit. */
export interface SpawnError extends Typed<"SpawnError"> {
  readonly command: string;
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly message: string;
}

/** Dependency wrapper for {@link spawn}. */
export interface SpawnDep {
  readonly spawn: Spawn;
}

/**
 * Runs a command with inherited stdio and aborts it with the current Run.
 *
 * A zero exit code succeeds. A start failure, non-zero exit code, or signal
 * exit returns {@link SpawnError}.
 */
export const spawn: Spawn = (file, args, { cwd } = {}) => {
  const command = [file, ...args].join(" ");

  return callback(({ run, resolve }) => {
    const child = nodeSpawn(file, args, {
      cwd,
      signal: run.signal,
      stdio: "inherit",
    });

    child.once("error", (error) => {
      if (run.signal.aborted) return;
      resolve(
        err({
          type: "SpawnError",
          command,
          exitCode: null,
          signal: null,
          message: `Failed to start ${command}: ${error.message}`,
        }),
      );
    });
    child.once("close", (exitCode, signal) => {
      if (run.signal.aborted) return;
      resolve(
        exitCode === 0
          ? ok()
          : err({
              type: "SpawnError",
              command,
              exitCode,
              signal,
              message:
                signal == null
                  ? `${command} exited with code ${exitCode}.`
                  : `${command} exited from ${signal}.`,
            }),
      );
    });
  });
};
