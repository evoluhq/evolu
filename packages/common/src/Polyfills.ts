/**
 * Polyfills.
 *
 * @module
 */

import "disposablestack/auto";
import { lazyVoid } from "./Function.js";

/**
 * Installs polyfills required by `@evolu/common`.
 *
 * Installs resource-management polyfills (`Symbol.dispose`,
 * `Symbol.asyncDispose`, `DisposableStack`, `AsyncDisposableStack`, and
 * `SuppressedError`), which are not yet supported by Safari and React Native.
 *
 * Evolu currently does not require any additional polyfills. If that changes,
 * this is where they will be installed.
 *
 * `@evolu/react-native` has its own `Polyfills` module and its
 * `installPolyfills` calls this function first, then installs React Native
 * specific polyfills.
 *
 * Call this explicitly from the app entry point.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Resource_management
 * @see https://github.com/es-shims/DisposableStack
 */
export const installPolyfills = lazyVoid;
