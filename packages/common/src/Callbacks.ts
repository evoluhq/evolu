import { Brand } from "./Brand.js";
import { RandomBytesDep } from "./Crypto.js";
import { Result } from "./Result.js";
import { createId, Id } from "./Type.js";

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
 * ## Example
 *
 * ```ts
 * // No-argument callbacks
 * const callbacks = createCallbacks(deps);
 * const id = callbacks.register(() => console.log("called"));
 * callbacks.execute(id);
 *
 * // With argument callbacks
 * const stringCallbacks = createCallbacks<string>(deps);
 * const id = stringCallbacks.register((value) => {
 *   console.log(value);
 * });
 * stringCallbacks.execute(id, "hello");
 *
 * // Promise.withResolvers pattern
 * const promiseCallbacks = createCallbacks<string>(deps);
 * const { promise, resolve } = Promise.withResolvers<string>();
 * const id = promiseCallbacks.register(resolve);
 * promiseCallbacks.execute(id, "resolved value");
 * await promise; // "resolved value"
 * ```
 *
 * @template T - The type of argument passed to callbacks (defaults to undefined
 *   for no-argument callbacks)
 */
export interface Callbacks<T = undefined> {
  /** Registers a callback function and returns a unique ID. */
  readonly register: (callback: (arg: T) => void) => CallbackId;

  /** Executes and removes a callback associated with the given ID. */
  readonly execute: T extends undefined
    ? (id: CallbackId) => undefined
    : (id: CallbackId, arg: T) => undefined;
}

/** Unique identifier for a callback in {@link Callbacks}. */
export type CallbackId = Id & Brand<"Callback">;

/** Creates a {@link Callbacks} registry for managing callbacks. */
export const createCallbacks = <T = undefined>(
  deps: RandomBytesDep,
): Callbacks<T> => {
  const callbackMap = new Map<CallbackId, (arg: T) => void>();

  return {
    register: (callback) => {
      const id = createId<"Callback">(deps);
      callbackMap.set(id, callback);
      return id;
    },

    execute: (id: CallbackId, ...args: T extends undefined ? [] : [T]) => {
      const callback = callbackMap.get(id);
      if (!callback) return;
      callbackMap.delete(id);
      if (args.length === 0) {
        // Called without argument (undefined case)
        (callback as () => void)();
      } else {
        callback(args[0]);
      }
    },
  } as Callbacks<T>;
};
