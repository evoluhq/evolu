/**
 * Request-response correlation for callbacks across boundaries.
 *
 * @module
 */

import type { RandomBytesDep } from "./Crypto.ts";
import type { Result } from "./Result.ts";
import { createId, Id } from "./Type.ts";
import type { Callback } from "./Types.ts";

/**
 * Request-response correlation for callbacks across boundaries.
 *
 * Stores callbacks with unique IDs and executes them once with an optional
 * argument. Executed callbacks are automatically removed.
 *
 * This is useful for correlating asynchronous request-response operations
 * across boundaries where callback functions cannot be passed directly (e.g.,
 * web workers, message queues).
 *
 * The `execute` method intentionally does not use try-catch or {@link Result}
 * because it's the callback's responsibility to handle its own errors.
 *
 * ### Correlating callback responses
 *
 * ```ts
 * import {
 *   assertEqual,
 *   createCallbacks,
 *   testCreateDeps,
 * } from "@evolu/common";
 *
 * const deps = testCreateDeps();
 *
 * // No-argument callback
 * using callbacks = createCallbacks(deps);
 * let noArgumentCalls = 0;
 * const noArgumentId = callbacks.register(() => {
 *   noArgumentCalls++;
 * });
 * callbacks.execute(noArgumentId);
 * callbacks.execute(noArgumentId);
 * assertEqual(noArgumentCalls, 1);
 *
 * // Typed callback
 * using stringCallbacks = createCallbacks<string>(deps);
 * let received = "";
 * const stringCallbackId = stringCallbacks.register((value) => {
 *   received = value;
 * });
 * stringCallbacks.execute(stringCallbackId, "hello");
 * assertEqual(received, "hello");
 *
 * // Promise.withResolvers
 * using promiseCallbacks = createCallbacks<string>(deps);
 * const { promise, resolve } = Promise.withResolvers<string>();
 * const promiseCallbackId = promiseCallbacks.register(resolve);
 * promiseCallbacks.execute(promiseCallbackId, "resolved value");
 * assertEqual(await promise, "resolved value");
 * ```
 *
 * @template T - The type of argument passed to callbacks (defaults to undefined
 *   for no-argument callbacks)
 */
export interface Callbacks<T = undefined> extends Disposable {
  /** Registers a callback function and returns a unique ID. */
  readonly register: (callback: Callback<T>) => Id;

  /** Executes and removes a callback associated with the given ID. */
  readonly execute: T extends undefined
    ? (id: Id) => undefined
    : (id: Id, arg: T) => undefined;
}

/** Creates a {@link Callbacks} registry for managing callbacks. */
export const createCallbacks = <T = undefined>(
  deps: RandomBytesDep,
): Callbacks<T> => {
  const callbackMap = new Map<Id, Callback<T>>();

  const execute: Callbacks<T>["execute"] = ((id: Id, ...args: Array<T>) => {
    const callback = callbackMap.get(id);
    if (!callback) return undefined;
    callbackMap.delete(id);
    if (args.length === 0) {
      // Called without argument (undefined case)
      (callback as () => void)();
    } else {
      callback(args[0]);
    }
    return undefined;
  }) as Callbacks<T>["execute"];

  return {
    register: (callback) => {
      const id = createId(deps);
      callbackMap.set(id, callback);
      return id;
    },

    execute,

    [Symbol.dispose]: () => {
      callbackMap.clear();
    },
  };
};
