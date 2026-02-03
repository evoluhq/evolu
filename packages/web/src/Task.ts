/**
 * Browser-specific Task utilities.
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
 * Creates a browser {@link Runner} with global error handling.
 *
 * Registers `error` and `unhandledrejection` handlers that log errors to the
 * console. Handlers are removed when the runner is disposed.
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
 * @group Browser Runner
 */
export const createRunner: CreateRunner<RunnerDeps> = <D>(
  deps?: D,
): Runner<RunnerDeps & D> => {
  const run = createCommonRunner(deps);

  const console = run.deps.console.child("global");

  const handleError = (source: string) => (event: Event) => {
    const error: unknown =
      event instanceof ErrorEvent
        ? event.error
        : (event as PromiseRejectionEvent).reason;
    console.error(source, createUnknownError(error));
  };

  const handleWindowError = handleError("error");
  const handleUnhandledRejection = handleError("unhandledrejection");

  globalThis.addEventListener("error", handleWindowError);
  globalThis.addEventListener("unhandledrejection", handleUnhandledRejection);

  run.onAbort(() => {
    globalThis.removeEventListener("error", handleWindowError);
    globalThis.removeEventListener(
      "unhandledrejection",
      handleUnhandledRejection,
    );
  });

  return run;
};
