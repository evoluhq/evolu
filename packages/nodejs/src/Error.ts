import { GlobalErrorScope, handleGlobalError } from "@evolu/common";

/**
 * Creates a {@link GlobalErrorScope} for a Node.js process.
 *
 * Hooks into Node.js process error events (`uncaughtException`,
 * `unhandledRejection`) to forward uncaught errors and unhandled promise
 * rejections to the scope's `onError` callback.
 *
 * ## Example
 *
 * ```ts
 * const scope = createGlobalErrorScope(process);
 * scope.onError = (error) => {
 *   console.error("Global error:", error);
 * };
 * ```
 */
export const createGlobalErrorScope = (
  nativeProcess: NodeJS.Process,
): GlobalErrorScope => {
  const scope: GlobalErrorScope = {
    onError: null,
    [Symbol.dispose]: () => {
      nativeProcess.off("uncaughtException", handleError);
      nativeProcess.off("unhandledRejection", handleError);
    },
  };

  const handleError = (error: unknown): void => {
    handleGlobalError(scope, error);
  };

  nativeProcess.on("uncaughtException", handleError);
  nativeProcess.on("unhandledRejection", handleError);

  return scope;
};
