/**
 * Node.js-specific Task utilities.
 *
 * @module
 */

import {
  callback,
  createRunner,
  createUnknownError,
  type MainTask,
} from "@evolu/common";

/**
 * Runs a main task with proper Node.js signal handling.
 *
 * Creates a root runner, executes the main task, waits for termination signals,
 * then disposes. Global errors (uncaught exceptions and unhandled rejections)
 * are logged and trigger graceful shutdown.
 *
 * ### Example
 *
 * ```ts
 * const deps = {
 *   console: createConsole(),
 *   ...createNodeJsRelayBetterSqliteDeps(),
 * };
 *
 * runMain(deps)(async (run) => {
 *   await using stack = run.stack();
 *
 *   const server = await stack.use(startServer({ port: 4000 }));
 *   if (!server.ok) {
 *     run.console.error(server.error);
 *     return ok();
 *   }
 *
 *   return ok(stack.move());
 * });
 * ```
 *
 * The `stack.move()` pattern transfers ownership of resources from the main
 * function to `runMain`. Without it, resources would be disposed when main
 * returns — but we want them to stay alive until a signal arrives. By returning
 * `ok(stack.move())`, the stack is disposed after the signal, not before.
 */
export const runMain =
  <D>(deps: D) =>
  (main: MainTask<D>): void => {
    void (async () => {
      await using run = createRunner(deps);

      /**
       * "The correct use of 'uncaughtException' is to perform synchronous
       * cleanup of allocated resources (e.g. file descriptors, handles, etc)
       * before shutting down the process."
       *
       * https://nodejs.org/api/process.html#event-uncaughtexception
       * https://nodejs.org/api/process.html#event-unhandledrejection
       *
       * We log and initiate graceful shutdown.
       */
      const handleError = (error: unknown): void => {
        run.console.error(createUnknownError(error));
        // https://nodejs.org/api/process.html#processexitcode
        process.exitCode = 1;
        void run[Symbol.asyncDispose]();
      };

      process.on("uncaughtException", handleError);
      process.on("unhandledRejection", handleError);

      const _ = await run(main);
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      await using _stack = _.ok ? (_.value ?? undefined) : undefined;

      await run(
        callback(({ ok }) => {
          // https://nodejs.org/api/process.html#signal-events
          process.on("SIGINT", ok); // Ctrl-C (all platforms)
          process.on("SIGTERM", ok); // OS/k8s/Docker termination (Unix)
          process.on("SIGHUP", ok); // Console close (Windows), terminal disconnect (Unix)

          // TODO: Explain why it's important to use run.onAbort and not
          // unregister sooner (cli shows gracefull shutdown was terminated.)
          run.onAbort(() => {
            process.off("SIGINT", ok);
            process.off("SIGTERM", ok);
            process.off("SIGHUP", ok);
          });
        }),
      );

      process.off("uncaughtException", handleError);
      process.off("unhandledRejection", handleError);
    })();
  };
