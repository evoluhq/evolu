/**
 * Platform-agnostic Evolu Worker.
 *
 * @module
 */

import type { ConsoleEntry, ConsoleStoreOutputEntryDep } from "../Console.js";
import { exhaustiveCheck } from "../Function.js";
import { ok } from "../Result.js";
import type { Task } from "../Task.js";
import type {
  CreateMessagePortDep,
  MessagePort,
  NativeMessagePort,
  SharedWorker,
  SharedWorkerSelf,
} from "../Worker.js";
import type { EvoluError } from "./Error.js";

export type EvoluWorker = SharedWorker<EvoluWorkerInput>;

export interface EvoluWorkerDep {
  readonly evoluWorker: EvoluWorker;
}

export type EvoluWorkerInput =
  | {
      readonly type: "InitTab";
      readonly port: NativeMessagePort;
    }
  | {
      readonly type: "InitEvolu";
      readonly port: NativeMessagePort;
    };

export type EvoluTabOutput =
  | {
      readonly type: "ConsoleEntry";
      readonly entry: ConsoleEntry;
    }
  | {
      readonly type: "EvoluError";
      readonly error: EvoluError;
    };

export const initEvoluWorker =
  (
    self: SharedWorkerSelf<EvoluWorkerInput>,
  ): Task<
    AsyncDisposableStack,
    never,
    ConsoleStoreOutputEntryDep & CreateMessagePortDep
  > =>
  async (run) => {
    const { createMessagePort, consoleStoreOutputEntry } = run.deps;
    const console = run.deps.console.child("EvoluWorker");

    // TODO: Use heartbeat to detect and prune dead ports.
    const tabPorts = new Set<MessagePort<EvoluTabOutput>>();
    const queuedTabOutputs: Array<EvoluTabOutput> = [];

    const postTabOutput = (output: EvoluTabOutput): void => {
      for (const port of tabPorts) port.postMessage(output);
    };

    const postOrQueueTabOutput = (output: EvoluTabOutput): void => {
      if (tabPorts.size === 0) queuedTabOutputs.push(output);
      else postTabOutput(output);
    };

    await using stack = run.stack();

    stack.defer(
      consoleStoreOutputEntry.subscribe(() => {
        const entry = consoleStoreOutputEntry.get();
        if (entry) postOrQueueTabOutput({ type: "ConsoleEntry", entry });
      }),
    );

    console.info("initEvoluWorker");

    self.onConnect = (port) => {
      console.info("onConnect");

      port.onMessage = (message) => {
        switch (message.type) {
          case "InitTab": {
            const tabPort = createMessagePort<EvoluTabOutput>(message.port);
            tabPorts.add(tabPort);

            if (queuedTabOutputs.length > 0) {
              queuedTabOutputs.forEach(postTabOutput);
              queuedTabOutputs.length = 0;
            }

            break;
          }
          case "InitEvolu": {
            // TODO: Wrap port, do async init (open DB, load owner),
            // then set onMessage to start processing requests.
            // Messages are queued until onMessage is assigned.
            const _evoluPort = createMessagePort(message.port);
            // _evoluPort.onMessage()
            break;
          }
          default:
            exhaustiveCheck(message);
        }
      };
    };

    return ok(stack.move());
  };
