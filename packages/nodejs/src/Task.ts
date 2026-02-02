/**
 * Node.js-specific Task utilities.
 *
 * @module
 */

import {
  createRunner as createCommonRunner,
  createUnknownError,
  type CreateRunner,
  type Runner,
  type RunnerDeps,
} from "@evolu/common";

/**
 * A promise that resolves when a termination signal is received.
 *
 * Resolves on `SIGINT` (Ctrl-C), `SIGTERM` (OS/k8s/Docker termination),
 * `SIGHUP` (console close/terminal disconnect), or `SIGBREAK` (Windows
 * Ctrl-Break).
 *
 * @group Node.js Runner
 */
export type Shutdown = Promise<void>;

export interface ShutdownDep {
  readonly shutdown: Shutdown;
}

/**
 * Creates a Node.js {@link Runner} with process signal and error handling.
 *
 * - Global error handlers (`uncaughtException`, `unhandledRejection`) that log
 *   errors and initiate graceful shutdown
 * - A `shutdown` promise in deps that resolves on termination signals (`SIGINT`,
 *   `SIGTERM`, `SIGHUP`)
 *
 * ### Example
 *
 * ```ts
 * const deps = createRelayDeps();
 * await using run = createRunner(deps);
 * await using stack = run.stack();
 * await stack.use(startRelay({ port: 4000 }));
 *
 * await run.deps.shutdown;
 * ```
 *
 * @group Node.js Runner
 */
export const createRunner: CreateRunner<RunnerDeps & ShutdownDep> = <D>(
  deps?: D,
): Runner<RunnerDeps & ShutdownDep & D> => {
  const { promise: shutdown, resolve: resolveShutdown } =
    Promise.withResolvers<void>();

  const run = createCommonRunner({ ...deps, shutdown } as D & ShutdownDep);

  const console = run.deps.console.child("global");

  const handleError = (source: string) => (error: unknown) => {
    console.error(source, createUnknownError(error));
    process.exitCode = 1;

    // Resolve shutdown so `await run.deps.shutdown` unblocks
    // and allows the stack to be disposed.
    resolveShutdown();
  };

  const handleUncaughtException = handleError("uncaughtException");
  const handleUnhandledRejection = handleError("unhandledRejection");

  process.on("uncaughtException", handleUncaughtException);
  process.on("unhandledRejection", handleUnhandledRejection);
  process.on("SIGINT", resolveShutdown); // Ctrl-C (all platforms)
  process.on("SIGTERM", resolveShutdown); // OS/k8s/Docker termination (Unix)
  process.on("SIGHUP", resolveShutdown); // Console close (Windows), terminal disconnect (Unix)
  process.on("SIGBREAK", resolveShutdown); // Ctrl-Break (Windows)

  run.onAbort(() => {
    process.off("uncaughtException", handleUncaughtException);
    process.off("unhandledRejection", handleUnhandledRejection);
    process.off("SIGINT", resolveShutdown);
    process.off("SIGTERM", resolveShutdown);
    process.off("SIGHUP", resolveShutdown);
    process.off("SIGBREAK", resolveShutdown);
  });

  return run;
};
