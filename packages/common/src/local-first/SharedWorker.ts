/**
 * SharedWorker integration for Evolu.
 *
 * @module
 */
import { exhaustiveCheck } from "../Function.js";
import type {
  SharedWorker as CommonSharedWorker,
  CreateMessagePortDep,
  MessagePort,
  NativeMessagePort,
  SharedWorkerScope,
} from "../Worker.js";
import type { EvoluError } from "./Error.js";

export type SharedWorker = CommonSharedWorker<SharedWorkerInput>;

export interface SharedWorkerDep {
  readonly sharedWorker: SharedWorker;
}

export type SharedWorkerInput =
  | {
      readonly type: "initErrorStore";
      readonly port: NativeMessagePort;
    }
  | {
      readonly type: "initEvolu";
      readonly port: NativeMessagePort;
    };

export const runSharedWorkerScope =
  (deps: CreateMessagePortDep) =>
  (self: SharedWorkerScope<SharedWorkerInput>): void => {
    const errorStorePorts = new Set<MessagePort<EvoluError>>();

    self.onError = (error) => {
      for (const port of errorStorePorts) port.postMessage(error);
    };

    self.onConnect = (port) => {
      port.onMessage = (message) => {
        switch (message.type) {
          case "initErrorStore": {
            errorStorePorts.add(
              deps.createMessagePort<EvoluError>(message.port),
            );
            break;
          }
          case "initEvolu":
            // TODO:
            break;
          default:
            exhaustiveCheck(message);
        }
      };
    };
  };
