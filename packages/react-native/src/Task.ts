/**
 * React Native-specific Task utilities.
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
 * Creates a React Native {@link Runner} with global error handling.
 *
 * Registers `ErrorUtils.setGlobalHandler` for uncaught JavaScript errors. The
 * handler is restored to the previous one when the runner is disposed.
 *
 * ### Example
 *
 * ```ts
 * const console = createConsole({
 *   formatEntry: createConsoleEntryFormatter()({
 *     timestampFormat: "relative",
 *   }),
 * });
 *
 * await using run = createRunner({ console });
 * await using stack = run.stack();
 *
 * await stack.use(startApp());
 * ```
 *
 * @group React Native Runner
 */
export const createRunner: CreateRunner<RunnerDeps> = <D>(
  deps?: D,
): Runner<RunnerDeps & D> => {
  const run = createCommonRunner(deps);

  const console = run.deps.console.child("global");

  const previousHandler = globalThis.ErrorUtils?.getGlobalHandler();

  const handleError = (error: unknown, isFatal?: boolean) => {
    console.error(
      isFatal ? "fatalError" : "uncaughtError",
      createUnknownError(error),
    );

    // Call the previous handler if it exists
    previousHandler?.(error, isFatal);
  };

  globalThis.ErrorUtils?.setGlobalHandler(handleError);

  run.onAbort(() => {
    if (previousHandler) {
      globalThis.ErrorUtils?.setGlobalHandler(previousHandler);
    }
  });

  return run;
};
