/**
 * Runtime platform detection utilities.
 *
 * @module
 */

/** Detects if the code is running in React Native environment. */
export const isReactNative =
  typeof navigator !== "undefined" &&
  "product" in navigator &&
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  (navigator as any).product === "ReactNative";

/**
 * Detects if Node.js Buffer is available and should be used.
 *
 * React Native apps often polyfill Node.js APIs like Buffer, but we want to use
 * native methods when available for better performance.
 *
 * Returns false in React Native even if Buffer is polyfilled, as we prefer
 * native methods in that environment.
 *
 * @see https://github.com/craftzdog/react-native-quick-base64#installation
 */
export const hasNodeBuffer =
  !isReactNative && typeof globalThis.Buffer !== "undefined";

/**
 * FlushSync is for libraries like React to flush updates synchronously inside
 * the provided callback to ensure the DOM is updated immediately.
 *
 * For example, with React, when we want to focus on an element rendered as a
 * result of a mutation, Evolu ensures all DOM changes are flushed synchronously
 * if an onComplete callback is used.
 *
 * https://react.dev/reference/react-dom/flushSync
 */
export type FlushSync = (callback: () => void) => void;

export interface FlushSyncDep {
  readonly flushSync: FlushSync;
}

/**
 * Reload the app in a platform-specific way.
 *
 * Use this after purging persistent storage to clear in-memory state and ensure
 * the app starts fresh. It does not purge storage itself.
 *
 * - **Web**: Redirects to the specified URL (defaults to `/`)
 * - **React Native**: Restarts the app (URL ignored)
 */
export type ReloadApp = (url?: string) => void;

export interface ReloadAppDep {
  readonly reloadApp: ReloadApp;
}
