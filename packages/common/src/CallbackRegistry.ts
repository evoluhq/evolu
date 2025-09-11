import { Brand } from "./Brand.js";
import { NanoIdLibDep } from "./NanoId.js";
import { Result } from "./Result.js";

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
 */
export interface CallbackRegistry {
  /** Registers a callback function and returns a unique ID. */
  readonly register: (callback: (arg?: unknown) => void) => CallbackId;

  /** Executes and removes a callback associated with the given ID. */
  readonly execute: (id: CallbackId, arg?: unknown) => void;
}

export type CallbackId = string & Brand<"CallbackId">;

export const createCallbackRegistry = (
  deps: NanoIdLibDep,
): CallbackRegistry => {
  const callbackMap = new Map<CallbackId, (arg?: unknown) => void>();

  return {
    register: (callback) => {
      const id = deps.nanoIdLib.nanoid() as CallbackId;
      callbackMap.set(id, callback);
      return id;
    },

    execute: (id, arg) => {
      const callback = callbackMap.get(id);
      if (callback) {
        callbackMap.delete(id);
        callback(arg);
      }
    },
  };
};
