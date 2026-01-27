/**
 * Polyfills.
 *
 * @module
 */

import "disposablestack/auto";
import { lazyVoid } from "./Function.js";

/**
 * Installs polyfills for resource management.
 *
 * Polyfills `Symbol.dispose`, `Symbol.asyncDispose`, `DisposableStack`,
 * `AsyncDisposableStack`, and `SuppressedError`.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Resource_management
 * @see https://github.com/es-shims/DisposableStack
 */
export const installPolyfills = lazyVoid;
