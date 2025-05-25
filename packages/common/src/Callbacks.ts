import { NanoIdLibDep } from "./NanoId.js";
import { Brand } from "./Types.js";

/**
 * Manages one-time callback functions.
 *
 * Allows registering callbacks with a unique ID and executing them once with an
 * optional argument. Executed callbacks are automatically removed.
 *
 * This is useful for managing event-driven or asynchronous workflows where
 * callbacks need to be invoked only once.
 */
export interface Callbacks {
  /** Registers a callback function and returns a unique ID. */
  readonly register: (callback: (arg?: unknown) => void) => CallbackId;

  /** Executes and removes a callback associated with the given ID. */
  readonly execute: (id: CallbackId, arg?: unknown) => void;
}

export type CallbackId = string & Brand<"CallbackId">;

export const createCallbacks = (deps: NanoIdLibDep): Callbacks => {
  const callbackMap = new Map<CallbackId, (arg?: unknown) => void>();

  const callbacks: Callbacks = {
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

  return callbacks;
};
