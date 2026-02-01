/**
 * Runtime platform detection utilities.
 *
 * @module
 */

/** Returns true if running in React Native with Hermes engine. */
export const isHermes = "HermesInternal" in globalThis;

/** Returns true if running in a server environment (no DOM). */
export const isServer = typeof document === "undefined";

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
  !isHermes && typeof globalThis.Buffer !== "undefined";

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
