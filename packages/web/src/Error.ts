import { type GlobalErrorScope, handleGlobalError } from "@evolu/common";

/**
 * Creates a {@link GlobalErrorScope} for a browser window.
 *
 * Hooks into the native `error` and `unhandledrejection` events to forward
 * uncaught errors and unhandled promise rejections to the scope's `onError`
 * callback.
 *
 * ### Example
 *
 * ```ts
 * const scope = createGlobalErrorScope(window);
 * scope.onError = (error) => {
 *   console.error("Global error:", error);
 * };
 * ```
 */
export const createGlobalErrorScope = (
  nativeGlobal: Window,
): GlobalErrorScope => {
  const scope: GlobalErrorScope = {
    onError: null,
    [Symbol.dispose]: () => {
      nativeGlobal.removeEventListener("error", errorHandler);
      nativeGlobal.removeEventListener("unhandledrejection", rejectionHandler);
    },
  };

  const errorHandler = (event: ErrorEvent) => {
    handleGlobalError(scope, event.error);
  };

  const rejectionHandler = (event: PromiseRejectionEvent) => {
    handleGlobalError(scope, event.reason);
  };

  nativeGlobal.addEventListener("error", errorHandler);
  nativeGlobal.addEventListener("unhandledrejection", rejectionHandler);

  return scope;
};
