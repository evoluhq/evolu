/**
 * SharedWorker integration for Evolu.
 *
 * @module
 */

import { exhaustiveCheck } from "../Function.js";
import type {
  SharedWorker as CommonSharedWorker,
  CreateMessagePortDep,
  SharedWorkerScope as EvoluWorkerScope,
  MessagePort,
  NativeMessagePort,
} from "../Worker.js";
import type { EvoluError } from "./Error.js";

export type EvoluWorker = CommonSharedWorker<EvoluWorkerInput>;

export interface EvoluWorkerDep {
  readonly evoluWorker: EvoluWorker;
}

export type EvoluWorkerInput =
  | {
      readonly type: "initErrorStore";
      readonly port: NativeMessagePort;
    }
  | {
      readonly type: "initEvolu";
      readonly port: NativeMessagePort;
    };

export const runEvoluWorkerScope =
  (deps: CreateMessagePortDep) =>
  (self: EvoluWorkerScope<EvoluWorkerInput>): void => {
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
