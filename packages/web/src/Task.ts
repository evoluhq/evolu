/**
 * Web platform-specific Task utilities.
 *
 * @module
 */

import {
  createRun as createCommonRun,
  createUnknownError,
  type CreateRun,
  type Run,
  type RunDefaultDeps,
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
 *   formatter: createConsoleFormatter()({
 *     timestampFormat: "relative",
 *   }),
 * });
 *
 * await using run = createRun({ console });
 * await using disposer = new AsyncDisposableStack();
 *
 * disposer.use(await run.orThrow(startApp()));
 * ```
 */
export const createRun: CreateRun<RunDefaultDeps> = <D>(
  deps?: D,
): Run<RunDefaultDeps & D> => {
  const run = createCommonRun(deps);
  const console = run.deps.console.child("global");

  globalThis.addEventListener(
    "error",
    (event) => {
      console.error("error", createUnknownError(event.error));
    },
    { signal: run.signal },
  );

  globalThis.addEventListener(
    "unhandledrejection",
    (event) => {
      console.error("unhandledrejection", createUnknownError(event.reason));
    },
    { signal: run.signal },
  );

  return run;
};
