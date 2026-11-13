/**
 * React Native-specific Task utilities.
 *
 * @module
 */

import {
  createRun as createCommonRun,
  defectToError,
  reportDefectAfterMicrotask,
  type DisposableRun,
  type Run,
  type RunCustomDeps,
} from "@evolu/common";

/** React Native's global error utilities, `ErrorUtils`. */
interface ErrorUtils {
  readonly reportError: (error: unknown) => void;
}

/**
 * Creates a root {@link Run} for React Native.
 *
 * Defects are reported with React Native's global `ErrorUtils.reportError` as
 * an `Error` from {@link defectToError}, because React Native shows any other
 * value only as unhelpful text. A custom `reportDefect` dependency overrides
 * the React Native default. The platform-independent microtask reporter is used
 * when `ErrorUtils` is absent.
 *
 * ### Example
 *
 * ```ts
 * import {
 *   assertSame,
 *   createConsole,
 *   createConsoleFormatter,
 *   ok,
 * } from "@evolu/common";
 * import { createRun } from "@evolu/react-native";
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
 * assertSame(await appPromise, "started");
 * ```
 */
export function createRun(): DisposableRun;

/** Creates a root {@link Run} for React Native with custom dependencies. */
export function createRun<D extends object>(
  deps: RunCustomDeps<D>,
): DisposableRun<D>;
export function createRun<D extends object>(
  deps?: RunCustomDeps<D>,
): DisposableRun | DisposableRun<D> {
  const reportDefect = (reported: unknown): void => {
    const error = defectToError(reported);
    // React Native's own types declare it as a constant without reportError,
    // which isn't a property of globalThis, so it's read with its runtime
    // shape. Through the global object even if a realm lexical binding
    // shadows it.
    const errorUtils = (globalThis as { readonly ErrorUtils?: ErrorUtils })
      .ErrorUtils;
    if (errorUtils) {
      errorUtils.reportError(error);
    } else {
      reportDefectAfterMicrotask(error);
    }
  };

  return deps === undefined
    ? createCommonRun({ reportDefect })
    : createCommonRun<D>({ reportDefect, ...deps });
}
