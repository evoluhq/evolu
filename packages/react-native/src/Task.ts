/**
 * React Native-specific Task utilities.
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
 * Creates a React Native {@link Run} with global error handling.
 *
 * Registers `ErrorUtils.setGlobalHandler` for uncaught JavaScript errors. The
 * handler is restored to the previous one when the Run is disposed.
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
 * await using run = createRun({ console });
 * await using stack = run.stack();
 *
 * await stack.use(startApp());
 * ```
 *
 * @group React Native Run
 */
export const createRun: CreateRun<RunDeps> = <D>(
  deps?: D,
): Run<RunDeps & D> => {
  const run = createCommonRun(deps);

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
