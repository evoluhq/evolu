/**
 * Platform-agnostic Evolu Worker.
 *
 * @module
 */

import type { NonEmptyReadonlyArray } from "../Array.js";
import type { CallbackId } from "../Callbacks.js";
import { createCallbacks } from "../Callbacks.js";
import type { ConsoleEntry, ConsoleLevel } from "../Console.js";
import { exhaustiveCheck } from "../Function.js";
import { ok } from "../Result.js";
import { exponential, jitter, maxDelay } from "../Schedule.js";
import { sleep, timeout, type Task } from "../Task.js";
import type { Name } from "../Type.js";
import type {
  SharedWorker as CommonSharedWorker,
  MessagePort,
  NativeMessagePort,
  SharedWorkerSelf,
  WorkerDeps,
} from "../Worker.js";
import type { DbWorkerLeaderInput, DbWorkerLeaderOutput } from "./Db.js";
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
  readonly type: "Mutate";
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
      readonly port2: NativeMessagePort<
        DbWorkerLeaderInput,
        DbWorkerLeaderOutput
      >;
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
      MessagePort<DbWorkerLeaderInput, DbWorkerLeaderOutput>
    >();
    const mutationQueues = new Map<Name, Array<QueuedMutation>>();
    const queueProcessors = new Set<Name>();
    const onMutateCallbacks = createCallbacks(run.deps);

    const retrySchedule = jitter(0.5)(maxDelay("5s")(exponential("250ms")));

    const postTabOutput = (output: EvoluTabOutput): void => {
      if (tabPorts.size === 0) queuedTabOutputs.push(output);
      else for (const port of tabPorts) port.postMessage(output);
    };

    const waitForAck =
      (ackPromise: Promise<void>): Task<void> =>
      async () => {
        await ackPromise;
        return ok();
      };

    const ensureMutationQueue = (name: Name): Array<QueuedMutation> => {
      let queue = mutationQueues.get(name);
      if (!queue) {
        queue = [];
        mutationQueues.set(name, queue);
      }
      return queue;
    };

    const processMutationQueue = (name: Name): void => {
      if ((mutationQueues.get(name)?.length ?? 0) === 0) return;
      if (queueProcessors.has(name)) return;
      queueProcessors.add(name);

      void run.daemon(async (run) => {
        const retryStep = retrySchedule(run.deps);

        while ((mutationQueues.get(name)?.length ?? 0) > 0) {
          const queue = mutationQueues.get(name);
          if (!queue) break;

          const message = queue[0];
          const leaderPort = leaderPorts.get(name);

          if (!leaderPort) {
            const retry = retryStep(undefined);
            if (!retry.ok) break;
            const r = await run(sleep(retry.value[1]));
            if (!r.ok) break;
            continue;
          }

          if (!message.requestId) {
            const { promise, resolve } = Promise.withResolvers<void>();
            message.requestId = onMutateCallbacks.register(resolve);
            message.ackPromise = promise;
          }

          leaderPort.postMessage({
            type: "Mutate",
            requestId: message.requestId,
            changes: message.changes,
            onCompleteIds: message.onCompleteIds,
            subscribedQueries: message.subscribedQueries,
          });

          const ack = await run(timeout(waitForAck(message.ackPromise!), "3s"));

          if (ack.ok) {
            queue.shift();
            continue;
          }

          const retry = retryStep(undefined);
          if (!retry.ok) break;
          const r = await run(sleep(retry.value[1]));
          if (!r.ok) break;
        }

        queueProcessors.delete(name);
        processMutationQueue(name);
        return ok();
      });
    };

    await using stack = run.stack();

    stack.defer(
      consoleStoreOutputEntry.subscribe(() => {
        const entry = consoleStoreOutputEntry.get();
        if (entry) postTabOutput({ type: "ConsoleEntry", entry });
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
            const evoluName = message.name;
            const evoluPort = createMessagePort<never, EvoluInput>(
              message.port1,
            );
            const leaderPort = createMessagePort<
              DbWorkerLeaderInput,
              DbWorkerLeaderOutput
            >(message.port2);

            leaderPorts.set(evoluName, leaderPort);

            leaderPort.onMessage = (message) => {
              switch (message.type) {
                case "LeaderAcquired": {
                  leaderPorts.set(message.name, leaderPort);
                  console.info("leaderAcquired", { name: message.name });
                  processMutationQueue(message.name);
                  break;
                }
                case "OnMutate": {
                  onMutateCallbacks.execute(message.requestId);
                  break;
                }
                case "ConsoleEntry":
                case "EvoluError": {
                  postTabOutput(message);
                  break;
                }
                default:
                  exhaustiveCheck(message);
              }
            };

            evoluPort.onMessage = (message) => {
              const queue = ensureMutationQueue(evoluName);
              queue.push({
                changes: message.changes,
                onCompleteIds: message.onCompleteIds,
                subscribedQueries: message.subscribedQueries,
              });
              processMutationQueue(evoluName);
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

interface QueuedMutation {
  readonly changes: NonEmptyReadonlyArray<MutationChange>;
  readonly onCompleteIds: ReadonlyArray<CallbackId>;
  readonly subscribedQueries: ReadonlyArray<Query>;
  requestId?: CallbackId;
  ackPromise?: Promise<void>;
}
