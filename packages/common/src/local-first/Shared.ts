/**
 * Platform-agnostic Evolu Worker.
 *
 * @module
 */

import type { NonEmptyReadonlyArray } from "../Array.js";
import type { CallbackId } from "../Callbacks.js";
import type { ConsoleEntry, ConsoleLevel } from "../Console.js";
import { exhaustiveCheck } from "../Function.js";
import { ok } from "../Result.js";
import type { Task } from "../Task.js";
import type { Name } from "../Type.js";
import type {
  SharedWorker as CommonSharedWorker,
  MessagePort,
  NativeMessagePort,
  SharedWorkerSelf,
  WorkerDeps,
} from "../Worker.js";
import type { DbWorkerLeaderOutput } from "./Db.js";
import type { EvoluError } from "./Error.js";
import type { Query } from "./Query.js";
import type { MutationChange } from "./Schema.js";

export type SharedWorker = CommonSharedWorker<SharedWorkerInput>;

export interface SharedWorkerDep {
  readonly sharedWorker: SharedWorker;
}

/**
 * Messages sent from an Evolu instance to the worker-side Evolu port.
 *
 * Redesign status: currently only mutation dispatch is defined. Additional
 * request variants will be added as query and owner flows are implemented.
 */
export interface EvoluInput {
  readonly type: "mutate";
  readonly changes: NonEmptyReadonlyArray<MutationChange>;
  readonly onCompleteIds: ReadonlyArray<CallbackId>;
  readonly subscribedQueries: ReadonlyArray<Query>;
}

export type SharedWorkerInput =
  | {
      /** Tab-level channel for broadcast outputs (console/error). */
      readonly type: "InitTab";
      readonly consoleLevel: ConsoleLevel;
      readonly port: NativeMessagePort<EvoluTabOutput>;
    }
  | {
      /** Per-Evolu instance request channel. */
      readonly type: "InitEvolu";
      readonly name: Name;
      readonly port1: NativeMessagePort<never, EvoluInput>;
      readonly port2: NativeMessagePort<never, DbWorkerLeaderOutput>;
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

export const initSharedWorker =
  (
    self: SharedWorkerSelf<SharedWorkerInput>,
  ): Task<AsyncDisposableStack, never, WorkerDeps> =>
  async (run) => {
    const { createMessagePort, consoleStoreOutputEntry } = run.deps;
    const console = run.deps.console.child("SharedWorker");

    // TODO: Use heartbeat to detect and prune dead ports.
    const tabPorts = new Set<MessagePort<EvoluTabOutput>>();
    const queuedTabOutputs: Array<EvoluTabOutput> = [];
    const leaderPorts = new Map<
      Name,
      MessagePort<never, DbWorkerLeaderOutput>
    >();

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

    console.info("initSharedWorker");

    self.onConnect = (port) => {
      console.debug("onConnect");

      port.onMessage = (message) => {
        switch (message.type) {
          case "InitTab": {
            console.setLevel(message.consoleLevel);
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
            const evoluPort = createMessagePort<never, EvoluInput>(
              message.port1,
            );
            const leaderPort = createMessagePort<never, DbWorkerLeaderOutput>(
              message.port2,
            );

            leaderPorts.set(message.name, leaderPort);

            leaderPort.onMessage = (leaderEvent) => {
              switch (leaderEvent.type) {
                case "LeaderAcquired": {
                  leaderPorts.set(leaderEvent.name, leaderPort);
                  console.info("leaderAcquired", { name: leaderEvent.name });
                  break;
                }
                case "ConsoleEntry": {
                  postOrQueueTabOutput({
                    type: "ConsoleEntry",
                    entry: leaderEvent.entry,
                  });
                  break;
                }
                case "EvoluError": {
                  postOrQueueTabOutput({
                    type: "EvoluError",
                    error: leaderEvent.error,
                  });
                  break;
                }
                default:
                  exhaustiveCheck(leaderEvent);
              }
            };

            evoluPort.onMessage = (message) => {
              console.log(message);
            };
            break;
          }
          default:
            exhaustiveCheck(message);
        }
      };
    };

    return ok(stack.move());
  };
