/**
 * Platform-agnostic Evolu Worker.
 *
 * @module
 */

import type { ConsoleEntry, ConsoleStoreOutputEntryDep } from "../Console.js";
import { exhaustiveCheck } from "../Function.js";
import { ok } from "../Result.js";
import type { Task } from "../Task.js";
import type { Typed } from "../Type.js";
import type {
  SharedWorker as CommonSharedWorker,
  CreateMessagePortDep,
  MessagePort,
  NativeMessagePort,
  SharedWorkerSelf,
} from "../Worker.js";

export type EvoluWorker = CommonSharedWorker<EvoluWorkerInput>;

export interface EvoluWorkerDep {
  readonly evoluWorker: EvoluWorker;
}

export type EvoluWorkerInput = InitConsoleMessage | InitEvoluMessage;

export interface InitConsoleMessage extends Typed<"InitConsole"> {
  readonly port: NativeMessagePort;
}

export interface InitEvoluMessage extends Typed<"InitEvolu"> {
  readonly port: NativeMessagePort;
}

export const initEvoluWorker =
  (
    self: SharedWorkerSelf<EvoluWorkerInput>,
  ): Task<void, never, ConsoleStoreOutputEntryDep & CreateMessagePortDep> =>
  (run) => {
    const { createMessagePort, consoleStoreOutputEntry } = run.deps;
    // TODO: Use heartbeat to detect and prune dead ports.
    const consolePorts = new Set<MessagePort<ConsoleEntry>>();

    run.onAbort(
      consoleStoreOutputEntry.subscribe(() => {
        const entry = consoleStoreOutputEntry.get();
        if (!entry) return;
        for (const port of consolePorts) port.postMessage(entry);
      }),
    );

    self.onConnect = (port) => {
      port.onMessage = (message) => {
        switch (message.type) {
          case "InitConsole": {
            const consolePort = createMessagePort<ConsoleEntry>(message.port);
            consolePorts.add(consolePort);
            break;
          }
          case "InitEvolu":
            // TODO:
            break;
          default:
            exhaustiveCheck(message);
        }
      };
    };

    return ok();
  };
