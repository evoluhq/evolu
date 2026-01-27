/**
 * Polyfills.
 *
 * @module
 */

import "disposablestack/auto";
import AggregateError from "es-aggregate-error";

/**
 * Installs polyfills for resource management.
 *
 * Polyfills `Symbol.dispose`, `Symbol.asyncDispose`, `DisposableStack`,
 * `AsyncDisposableStack`, `SuppressedError`, and `AggregateError`.
 *
 * Required for WebKit and React Native.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Resource_management
 * @see https://github.com/es-shims/DisposableStack
 * @see https://github.com/es-shims/AggregateError
 */
export const installPolyfills = (): void => {
  AggregateError.shim();
};
