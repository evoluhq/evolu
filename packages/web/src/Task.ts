/**
 * Browser-specific Task utilities.
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
 * Creates {@link Run} for the browser with global error handling.
 *
 * Registers `error` and `unhandledrejection` handlers that log errors to the
 * console. Handlers are removed when the Run is disposed.
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
 * @group Browser Run
 */
export const createRun: CreateRun<RunDeps> = <D>(
  deps?: D,
): Run<RunDeps & D> => {
  const run = createCommonRun(deps);

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
