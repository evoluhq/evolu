import { Brand } from "./Brand.js";
import { RandomBytesDep } from "./Crypto.js";
import { Result } from "./Result.js";
import { createId, Id } from "./Type.js";

/**
 * A registry for one-time callback functions.
 *
 * Stores callbacks with unique IDs and executes them once with an optional
 * argument. Executed callbacks are automatically removed from the registry.
 *
 * This is useful for correlating asynchronous operations across boundaries
 * where callback functions cannot be passed directly (e.g., web workers).
 *
 * The `execute` method intentionally does not use try-catch or {@link Result}
 * because it's the callback's responsibility to handle its own errors. The
 * registry is just a correlation mechanism and should not interfere with error
 * handling or debugging by masking the original error location.
 *
 * ### Example
 *
 * ```ts
 * // No-argument callbacks
 * const registry = createCallbackRegistry(deps);
 * const id = registry.register(() => console.log("called"));
 * registry.execute(id);
 *
 * // With argument callbacks
 * const stringRegistry = createCallbackRegistry<string>(deps);
 * const id = stringRegistry.register((value) => {
 *   console.log(value);
 * });
 * stringRegistry.execute(id, "hello");
 *
 * // Promise.withResolvers pattern
 * const promiseRegistry = createCallbackRegistry<string>(deps);
 * const { promise, resolve } = Promise.withResolvers<string>();
 * const id = promiseRegistry.register(resolve);
 * promiseRegistry.execute(id, "resolved value");
 * await promise; // "resolved value"
 * ```
 *
 * @template T - The type of argument passed to callbacks (defaults to undefined
 *   for no-argument callbacks)
 */
export interface CallbackRegistry<T = undefined> {
  /** Registers a callback function and returns a unique ID. */
  readonly register: (callback: (arg: T) => void) => CallbackId;

  /** Executes and removes a callback associated with the given ID. */
  readonly execute: T extends undefined
    ? (id: CallbackId) => undefined
    : (id: CallbackId, arg: T) => undefined;
}

export type CallbackId = Id & Brand<"Callback">;

/** Creates a new {@link CallbackRegistry} for one-time callback functions. */
export const createCallbackRegistry = <T = undefined>(
  deps: RandomBytesDep,
): CallbackRegistry<T> => {
  const callbackMap = new Map<CallbackId, (arg: T) => void>();

  return {
    register: (callback) => {
      const id = createId<"Callback">(deps);
      callbackMap.set(id, callback);
      return id;
    },

    execute: (id: CallbackId, ...args: T extends undefined ? [] : [T]) => {
      const callback = callbackMap.get(id);
      if (callback) {
        callbackMap.delete(id);
        if (args.length === 0) {
          // Called without argument (undefined case)
          (callback as () => void)();
        } else {
          callback(args[0]);
        }
      }
    },
  } as CallbackRegistry<T>;
};
