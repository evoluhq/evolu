/**
 * React Native-specific Task utilities.
 *
 * @module
 */

import {
  createRun as createCommonRun,
  reportDefectAfterMicrotask,
  type DisposableRun,
  type Run,
  type RunCustomDeps,
} from "@evolu/common";

/**
 * Creates a root {@link Run} for React Native.
 *
 * Defects are reported with React Native's global `ErrorUtils.reportError`. A
 * custom `reportDefect` dependency overrides the React Native default. The
 * platform-independent microtask reporter is used when `ErrorUtils` is absent.
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
    if (globalThis.ErrorUtils) globalThis.ErrorUtils.reportError(reported);
    else reportDefectAfterMicrotask(reported);
  };

  return deps === undefined
    ? createCommonRun({ reportDefect })
    : createCommonRun<D>({ reportDefect, ...deps });
}
