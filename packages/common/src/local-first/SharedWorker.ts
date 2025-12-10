import { UnknownError } from "../Error.js";
import {
  SharedWorker as CommonSharedWorker,
  MessagePort,
  SharedWorkerGlobalScope,
} from "../Worker.js";

export type SharedWorker = CommonSharedWorker<SharedWorkerInput>;

export interface SharedWorkerDep {
  readonly sharedWorker: SharedWorker;
}

export type SharedWorkerInput =
  | {
      readonly type: "initErrorStore";
      readonly port: MessagePort<UnknownError>;
    }
  | {
      readonly type: "TODO";
    };

/**
 * Initializes the SharedWorker message handling.
 *
 * Call this once from the platform-specific worker entry point, passing the
 * global scope wrapped via the platform's helper (e.g.,
 * `createWorkerGlobalScope`).
 */
export const initSharedWorker = (
  self: SharedWorkerGlobalScope<SharedWorkerInput>,
): void => {
  const errorPorts = new Set<MessagePort<UnknownError>>();

  self.onConnect = (port) => {
    port.onMessage = (message) => {
      switch (message.type) {
        case "initErrorStore":
          errorPorts.add(message.port);
          break;
        case "TODO":
          // Handle other message types here
          break;
      }
    };
  };
};
