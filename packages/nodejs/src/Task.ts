/**
 * Node.js-specific Task utilities.
 *
 * @module
 */

import {
  callback,
  createRunner,
  type RunnerDeps,
  type Task,
} from "@evolu/common";

/**
 * Runs a main task with proper Node.js signal handling.
 *
 * Creates a root runner, executes the main task, waits for termination signals,
 * then disposes. Use the curried form to provide custom dependencies.
 *
 * ### Example
 *
 * ```ts
 * // Simple form — uses default runner deps
 * runMain(async (run) => {
 *   await using stack = run.stack();
 *   const server = await stack.use(startServer({ port: 4000 }));
 *   if (!server.ok) run.console.error(server.error);
 *   return ok(stack.move());
 * });
 *
 * // With custom dependencies — curried form
 * runMain({ console, createSqliteDriver })(async (run) => {
 *   // run.deps includes console, createSqliteDriver
 *   return ok();
 * });
 * ```
 *
 * The `stack.move()` pattern transfers ownership of resources from the main
 * function to `runMain`. Without it, resources would be disposed when main
 * returns — but we want them to stay alive until a signal arrives. By returning
 * `ok(stack.move())`, the stack is disposed after the signal, not before.
 */
export function runMain(main: MainTask<unknown>): void;
export function runMain<D extends object>(deps: D): (main: MainTask<D>) => void;
export function runMain<D extends object>(
  mainOrDeps: MainTask<unknown> | D,
): void | ((main: MainTask<D>) => void) {
  if (typeof mainOrDeps === "function") {
    runMainInternal(mainOrDeps);
  } else {
    return (main: MainTask<D>) => runMainInternal(main, mainOrDeps);
  }
}

/**
 * A task suitable for use with {@link runMain}.
 *
 * Returns `Disposable`, `AsyncDisposable`, or `void`. Returning a disposable
 * (typically via `stack.move()`) transfers resource ownership to `runMain`,
 * which disposes after a termination signal. The error type is `never` because
 * main tasks must handle all errors internally.
 */
export type MainTask<D> = Task<
  Disposable | AsyncDisposable | void,
  never,
  RunnerDeps & D
>;

const runMainInternal = <D>(main: MainTask<D>, deps?: D): void => {
  void (async () => {
    await using run = createRunner(deps);

    // TODO: Listen for global errors and route to run.console

    const result = await run(main);

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    await using _stack = result.ok ? (result.value ?? undefined) : undefined;

    await run(
      callback(({ ok }) => {
        // https://nodejs.org/api/process.html#signal-events
        process.on("SIGINT", ok); // Ctrl-C (all platforms)
        process.on("SIGTERM", ok); // OS/k8s/Docker termination (Unix)
        process.on("SIGHUP", ok); // Console close (Windows), terminal disconnect (Unix)

        run.onAbort(() => {
          process.off("SIGINT", ok);
          process.off("SIGTERM", ok);
          process.off("SIGHUP", ok);
        });
      }),
    );
  })();
};
