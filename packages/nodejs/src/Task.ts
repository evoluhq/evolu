/**
 * Node.js-specific Task utilities.
 *
 * @module
 */

import {
  createRun as createCommonRun,
  createUnknownError,
  type CreateRun,
  type Run,
  type RunDeps,
} from "@evolu/common";

/**
 * A promise that resolves when a termination signal is received.
 *
 * Resolves on `SIGINT` (Ctrl-C), `SIGTERM` (OS/k8s/Docker termination),
 * `SIGHUP` (console close/terminal disconnect), or `SIGBREAK` (Windows
 * Ctrl-Break).
 *
 * @group Node.js Run
 */
export type Shutdown = Promise<void>;

export interface ShutdownDep {
  readonly shutdown: Shutdown;
}

/**
 * Creates {@link Run} for Node.js with global error handling and graceful
 * shutdown.
 *
 * Registers `uncaughtException` and `unhandledRejection` handlers that log
 * errors and initiate graceful shutdown. Adds a `shutdown` promise to deps that
 * resolves on termination signals (`SIGINT`, `SIGTERM`, `SIGHUP`). Handlers are
 * removed when the Run is disposed.
 *
 * ### Example
 *
 * ```ts
 * const deps = { ...createRelayDeps(), console };
 *
 * await using run = createRun(deps);
 * await using stack = new AsyncDisposableStack();
 *
 * stack.use(await run.orThrow(startRelay({ port: 4000 })));
 *
 * await run.deps.shutdown;
 * ```
 *
 * @group Node.js Run
 */
export const createRun: CreateRun<RunDeps & ShutdownDep> = <D>(
  deps?: D,
): Run<RunDeps & ShutdownDep & D> => {
  const { promise: shutdown, resolve: resolveShutdown } =
    Promise.withResolvers<void>();

  const run = createCommonRun({ ...deps, shutdown } as D & ShutdownDep);

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
