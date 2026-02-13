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
  ): Task<
    AsyncDisposableStack,
    never,
    ConsoleStoreOutputEntryDep & CreateMessagePortDep
  > =>
  async (run) => {
    const { createMessagePort, consoleStoreOutputEntry } = run.deps;
    const console = run.deps.console.child("EvoluWorker");

    // TODO: Use heartbeat to detect and prune dead ports.
    const consolePorts = new Set<MessagePort<ConsoleEntry>>();
    const queuedConsoleEntries: Array<ConsoleEntry> = [];
    const broadcastConsoleEntry = (entry: ConsoleEntry): void => {
      for (const port of consolePorts) port.postMessage(entry);
    };

    await using stack = run.stack();

    stack.defer(
      consoleStoreOutputEntry.subscribe(() => {
        const entry = consoleStoreOutputEntry.get();
        if (!entry) return;

        if (consolePorts.size === 0) {
          queuedConsoleEntries.push(entry);
          return;
        }

        broadcastConsoleEntry(entry);
      }),
    );

    console.info("initEvoluWorker");

    self.onConnect = (port) => {
      console.info("onConnect");

      port.onMessage = (message) => {
        switch (message.type) {
          case "InitConsole": {
            const consolePort = createMessagePort<ConsoleEntry>(message.port);
            consolePorts.add(consolePort);

            if (queuedConsoleEntries.length > 0) {
              queuedConsoleEntries.forEach(broadcastConsoleEntry);
              queuedConsoleEntries.length = 0;
            }

            break;
          }
          case "InitEvolu": {
            // TODO: Wrap port, do async init (open DB, load owner),
            // then set onMessage to start processing requests.
            // Messages are queued until onMessage is assigned.
            const _evoluPort = createMessagePort(message.port);
            break;
          }
          default:
            exhaustiveCheck(message);
        }
      };
    };

    return ok(stack.move());
  };
