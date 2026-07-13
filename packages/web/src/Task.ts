/**
 * Web-specific Task utilities.
 *
 * @module
 */

import {
  createRun as createCommonRun,
  type DisposableRun,
  type Run,
  type RunCustomDeps,
} from "@evolu/common";

/**
 * Creates a root {@link Run} for the browser.
 *
 * Defects are reported with the browser's global `reportError`. A custom
 * `reportDefect` dependency overrides the browser default.
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
 * const run = createRun({ console });
 * const appPromise = run.ok(startApp());
 * ```
 */
export function createRun(): DisposableRun;
export function createRun<D extends object>(
  deps: RunCustomDeps<D>,
): DisposableRun<D>;
export function createRun<D extends object>(
  deps?: RunCustomDeps<D>,
): DisposableRun | DisposableRun<D> {
  const reportDefect = (reported: unknown): void => {
    globalThis.reportError(reported);
  };

  return deps === undefined
    ? createCommonRun({ reportDefect })
    : createCommonRun<D>({ reportDefect, ...deps });
}
