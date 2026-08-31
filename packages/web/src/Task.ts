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
 * import {
 *   createConsole,
 *   createConsoleFormatter,
 *   ok,
 * } from "@evolu/common";
 * import { createRun } from "@evolu/web";
 *
 * const console = createConsole({
 *   formatter: createConsoleFormatter()({
 *     timestampFormat: "relative",
 *   }),
 * });
 *
 * await using run = createRun({ console });
 * const appPromise = run.ok(() => ok("started"));
 *
 * expect(await appPromise).toBe("started");
 * ```
 */
export function createRun(): DisposableRun;

/** Creates a root {@link Run} for the browser with custom dependencies. */
export function createRun<D extends object>(
  deps: RunCustomDeps<D>,
): DisposableRun<D>;
export function createRun<D extends object>(
  deps?: RunCustomDeps<D>,
): DisposableRun | DisposableRun<D> {
  const reportDefect = (reported: unknown): void => {
    reportError(reported);
  };

  return deps === undefined
    ? createCommonRun({ reportDefect })
    : createCommonRun<D>({ reportDefect, ...deps });
}
