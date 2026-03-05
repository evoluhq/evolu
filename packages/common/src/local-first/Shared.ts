/**
 * Platform-agnostic Evolu Worker.
 *
 * @module
 */

import {
  emptyArray,
  firstInArray,
  isNonEmptyArray,
  shiftFromArray,
  type NonEmptyReadonlyArray,
} from "../Array.js";
import { assert } from "../Assert.js";
import { createCallbacks } from "../Callbacks.js";
import type { Console, ConsoleEntry, ConsoleLevel } from "../Console.js";
import { createResources, type Resources } from "../Resources.js";
import { ok } from "../Result.js";
import { spaced } from "../Schedule.js";
import type { NonEmptyReadonlySet } from "../Set.js";
import { createTaskInstances, repeat, type Fiber, type Task } from "../Task.js";
import { createId, type Id, type Name } from "../Type.js";
import type { Callback, ExtractType } from "../Types.js";
import type { CreateWebSocketDep, WebSocket } from "../WebSocket.js";
import type {
  SharedWorker as CommonSharedWorker,
  MessagePort,
  NativeMessagePort,
  SharedWorkerSelf,
  WorkerDeps,
} from "../Worker.js";
import type { EvoluError } from "./Error.js";
import type { OwnerId, OwnerTransport, SyncOwner } from "./Owner.js";
import {
  makePatches,
  type Patch,
  type Query,
  type RowsByQueryMap,
} from "./Query.js";
import type { MutationChange } from "./Schema.js";
import type { CrdtMessage } from "./Storage.js";

export type SharedWorker = CommonSharedWorker<SharedWorkerInput>;

export interface SharedWorkerDep {
  readonly sharedWorker: SharedWorker;
}

interface TransportsDep {
  readonly transports: SharedTransportResources;
}

export type SharedWorkerDeps = WorkerDeps & CreateWebSocketDep;

export type SharedWorkerInput =
  | {
      readonly type: "InitTab";
      readonly consoleLevel: ConsoleLevel;
      readonly port: NativeMessagePort<EvoluTabOutput>;
    }
  | {
      readonly type: "CreateEvolu";
      readonly name: Name;
      readonly appOwner: SyncOwner;
      readonly evoluPort: NativeMessagePort<EvoluOutput, EvoluInput>;
      readonly dbWorkerPort: NativeMessagePort<DbWorkerInput, DbWorkerOutput>;
    };

export type EvoluTabOutput =
  | {
      readonly type: "OnConsoleEntry";
      readonly entry: ConsoleEntry;
    }
  | {
      readonly type: "OnError";
      readonly error: EvoluError;
    };

export type EvoluInput =
  | {
      readonly type: "Mutate";
      readonly changes: NonEmptyReadonlyArray<MutationChange>;
      readonly onCompleteIds: ReadonlyArray<Id>;
      readonly subscribedQueries: ReadonlySet<Query>;
    }
  | {
      readonly type: "Query";
      readonly queries: NonEmptyReadonlySet<Query>;
    }
  | {
      readonly type: "Export";
    }
  | {
      readonly type: "Dispose";
    };

export type EvoluOutput =
  | {
      readonly type: "OnPatchesByQuery";
      readonly patchesByQuery: ReadonlyMap<Query, ReadonlyArray<Patch>>;
      readonly onCompleteIds: ReadonlyArray<Id>;
    }
  | {
      readonly type: "RefreshQueries";
    }
  | {
      readonly type: "OnExport";
      readonly file: Uint8Array<ArrayBuffer>;
    };

export const initSharedWorker =
  (
    self: SharedWorkerSelf<SharedWorkerInput>,
  ): Task<AsyncDisposableStack, never, SharedWorkerDeps> =>
  async (run) => {
    const { createMessagePort, consoleStoreOutputEntry, createWebSocket } =
      run.deps;
    const console = run.deps.console.child("SharedWorker");

    // TODO: Use heartbeat to detect and prune dead ports.
    const tabPorts = new Set<MessagePort<EvoluTabOutput>>();

    const queuedTabOutputs: Array<EvoluTabOutput> = [];
    const postTabOutput = (output: EvoluTabOutput): void => {
      if (tabPorts.size === 0) queuedTabOutputs.push(output);
      else for (const port of tabPorts) port.postMessage(output);
    };

    const createTransportId = (transport: OwnerTransport): string =>
      `${transport.type}:${transport.url}`;

    await using stack = run.stack();

    const transports = stack.use(
      createResources<WebSocket, string, OwnerTransport, SyncOwner, OwnerId>({
        createResource: async (transport) => {
          const transportId = createTransportId(transport);
          console.info("createTransportResource", { transportId });
          return await run.daemon.orThrow(
            createWebSocket(transport.url, {
              binaryType: "arraybuffer",
              onOpen: () => {
                console.debug("transportOpen", { transportId });
              },
              onClose: () => {
                console.debug("transportClose", { transportId });
              },
            }),
          );
        },
        getResourceId: createTransportId,
        getConsumerId: (owner) => owner.id,
      }),
    );

    const runWithSharedEvoluDeps = run.addDeps({ transports });

    // TODO: Use heartbeat to detect and prune dead instances.
    const sharedEvolus = stack.use(
      createTaskInstances<
        Name,
        SharedEvolu,
        SharedWorkerDeps & TransportsDep
      >(),
    );

    self.onConnect = (port) => {
      console.debug("onConnect");

      port.onMessage = (message) => {
        switch (message.type) {
          case "InitTab": {
            // One SharedWorker serves multiple tabs, so console level is global
            // here. The most recently initialized tab's level wins.
            console.setLevel(message.consoleLevel);

            const tabPort = createMessagePort<EvoluTabOutput>(message.port);
            tabPorts.add(tabPort);
            if (queuedTabOutputs.length > 0) {
              queuedTabOutputs.forEach(postTabOutput);
              queuedTabOutputs.length = 0;
            }
            break;
          }

          case "CreateEvolu": {
            void runWithSharedEvoluDeps
              .daemon(
                sharedEvolus.ensure(
                  message.name,
                  createSharedEvolu({
                    console,
                    name: message.name,
                    appOwner: message.appOwner,
                    postTabOutput,
                    onDispose: () => {
                      void runWithSharedEvoluDeps.daemon(
                        sharedEvolus.delete(message.name),
                      );
                    },
                  }),
                ),
              )
              .then((result) => {
                if (!result.ok) return;
                result.value.addPorts(message.evoluPort, message.dbWorkerPort);
              });
            break;
          }
          default:
            console.error("Unknown shared worker input", message);
        }
      };
    };

    stack.defer(
      consoleStoreOutputEntry.subscribe(() => {
        const entry = consoleStoreOutputEntry.get();
        if (entry) postTabOutput({ type: "OnConsoleEntry", entry });
      }),
    );

    console.info("initSharedWorker");

    return ok(stack.move());
  };

interface SharedEvolu extends AsyncDisposable {
  readonly addPorts: (
    evoluPort: NativeMessagePort<EvoluOutput, EvoluInput>,
    dbWorkerPort: NativeMessagePort<DbWorkerInput, DbWorkerOutput>,
  ) => void;
}

export interface DbWorkerQueueItem {
  readonly evoluPortId: Id;
  readonly request: ExtractType<EvoluInput, "Mutate" | "Query" | "Export">;
}

export interface DbWorkerInput extends DbWorkerQueueItem {
  readonly callbackId: Id;
}

export type DbWorkerOutput =
  | {
      readonly type: "LeaderAcquired";
      readonly name: Name;
    }
  | {
      readonly type: "OnQueuedResponse";
      readonly callbackId: Id;
      readonly evoluPortId: Id;
      readonly response: QueuedResponse;
    }
  | EvoluTabOutput;

export type QueuedResponse =
  | {
      readonly type: "Mutate";
      readonly messagesByOwnerId: ReadonlyMap<
        OwnerId,
        NonEmptyReadonlyArray<CrdtMessage>
      >;
      readonly rowsByQuery: RowsByQueryMap;
    }
  | {
      readonly type: "Query";
      readonly rowsByQuery: RowsByQueryMap;
    }
  | {
      readonly type: "Export";
      readonly file: Uint8Array<ArrayBuffer>;
    }
  | {
      readonly type: "CreateSyncMessages";
    };

export interface QueuedResult {
  readonly evoluPortId: Id;
  readonly response: QueuedResponse;
}

type SharedTransportResources = Resources<
  WebSocket,
  string,
  OwnerTransport,
  SyncOwner,
  OwnerId
>;

export type SyncState = 123;

const createSharedEvolu =
  ({
    console,
    name,
    appOwner,
    postTabOutput,
    onDispose,
  }: {
    console: Console;
    name: Name;
    appOwner: SyncOwner;
    postTabOutput: Callback<EvoluTabOutput>;
    onDispose: () => void;
  }): Task<SharedEvolu, never, SharedWorkerDeps & TransportsDep> =>
  async (run) => {
    const { createMessagePort, transports } = run.deps;

    const evoluPorts = new Map<Id, MessagePort<EvoluOutput, EvoluInput>>();
    const dbWorkerPorts = new Set<MessagePort<DbWorkerInput, DbWorkerOutput>>();
    const rowsByQueryByEvoluPortId = new Map<Id, RowsByQueryMap>();
    const queue: Array<DbWorkerQueueItem> = [];
    const callbacks = createCallbacks<QueuedResult>(run.deps);

    let activeDbWorkerPort = null as MessagePort<
      DbWorkerInput,
      DbWorkerOutput
    > | null;

    let queueProcessingFiber: Fiber<void, never, WorkerDeps> | null = null;

    const ownerTransports = appOwner.transports ?? emptyArray;

    await run(transports.addConsumer(appOwner, ownerTransports));

    const ensureQueueProcessing = (): void => {
      if (
        queueProcessingFiber ||
        !isNonEmptyArray(queue) ||
        !activeDbWorkerPort
      ) {
        return;
      }

      const first = firstInArray(queue);

      const callbackId = callbacks.register(({ evoluPortId, response }) => {
        queueProcessingFiber?.abort();
        queueProcessingFiber = null;

        const evoluPort = evoluPorts.get(evoluPortId);

        switch (response.type) {
          case "Mutate":
          case "Query": {
            if (evoluPort)
              evoluPort.postMessage({
                type: "OnPatchesByQuery",
                patchesByQuery: createPatchesByQuery(
                  evoluPortId,
                  response.rowsByQuery,
                ),
                onCompleteIds:
                  first.request.type === "Mutate"
                    ? first.request.onCompleteIds
                    : emptyArray,
              });

            if (response.type === "Mutate") {
              for (const [otherEvoluPortId, otherEvoluPort] of evoluPorts) {
                if (otherEvoluPortId === evoluPortId) continue;
                otherEvoluPort.postMessage({ type: "RefreshQueries" });
              }
            }
            break;
          }
          case "Export":
            if (evoluPort)
              evoluPort.postMessage(
                {
                  type: "OnExport",
                  file: response.file,
                },
                [response.file.buffer],
              );

            break;
          case "CreateSyncMessages":
            break;
          default:
            console.error("Unknown queued response", response);
        }

        // Complete the current queue item and continue with the next one.
        shiftFromArray(queue);
        ensureQueueProcessing();
      });

      queueProcessingFiber = run.daemon(
        repeat(() => {
          assert(activeDbWorkerPort, "Expected an active DbWorker");
          activeDbWorkerPort.postMessage({ callbackId, ...first });
          return ok();
        }, spaced("5s")), // 5s seems to be a good balance
      );
    };

    const createPatchesByQuery = (
      evoluPortId: Id,
      rowsByQuery: RowsByQueryMap,
    ): ReadonlyMap<Query, ReadonlyArray<Patch>> => {
      const previousRowsByQuery = rowsByQueryByEvoluPortId.get(evoluPortId);
      const nextRowsByQuery = new Map(previousRowsByQuery ?? emptyArray);
      const patchesByQuery = new Map<Query, ReadonlyArray<Patch>>();

      for (const [query, rows] of rowsByQuery) {
        nextRowsByQuery.set(query, rows);
        patchesByQuery.set(
          query,
          makePatches(previousRowsByQuery?.get(query), rows),
        );
      }

      rowsByQueryByEvoluPortId.set(evoluPortId, nextRowsByQuery);
      return patchesByQuery;
    };

    return ok({
      addPorts: (nativeEvoluPort, nativeDbWorkerPort) => {
        const evoluPort = createMessagePort<EvoluOutput, EvoluInput>(
          nativeEvoluPort,
        );
        const dbWorkerPort = createMessagePort<DbWorkerInput, DbWorkerOutput>(
          nativeDbWorkerPort,
        );

        const evoluPortId = createId(run.deps);

        evoluPorts.set(evoluPortId, evoluPort);
        dbWorkerPorts.add(dbWorkerPort);

        dbWorkerPort.onMessage = (message) => {
          switch (message.type) {
            case "LeaderAcquired": {
              activeDbWorkerPort = dbWorkerPort;
              console.info("leaderAcquired");
              ensureQueueProcessing();
              break;
            }
            case "OnQueuedResponse": {
              callbacks.execute(message.callbackId, {
                evoluPortId: message.evoluPortId,
                response: message.response,
              });
              break;
            }
            case "OnConsoleEntry":
            case "OnError": {
              postTabOutput(message);
              break;
            }
            default:
              console.error("Unknown db worker output", message);
          }
        };

        evoluPort.onMessage = (evoluMessage) => {
          switch (evoluMessage.type) {
            case "Dispose": {
              console.info("evoluDispose", {
                name,
                evoluPortId,
                hadLastPort: evoluPorts.size === 1,
              });
              evoluPorts.delete(evoluPortId);
              rowsByQueryByEvoluPortId.delete(evoluPortId);
              if (evoluPorts.size === 0) onDispose();

              // TODO: Decided what to do with DbWorker but probably dispose it, but
              // https://bugs.webkit.org/show_bug.cgi?id=301520
              break;
            }

            case "Mutate":
            case "Query":
            case "Export": {
              queue.push({ evoluPortId, request: evoluMessage });
              ensureQueueProcessing();
              break;
            }
            default:
              console.error("Unknown evolu input", evoluMessage);
          }
        };
      },

      [Symbol.asyncDispose]: async () => {
        await run(transports.removeConsumer(appOwner, ownerTransports));

        queueProcessingFiber?.abort();
        queueProcessingFiber = null;
        callbacks[Symbol.dispose]();
        activeDbWorkerPort = null;
        queue.length = 0;
        evoluPorts.clear();
        rowsByQueryByEvoluPortId.clear();
        dbWorkerPorts.clear();
      },
    });
  };

//   | (Typed<"reset"> & {
//       readonly onCompleteId: CallbackId;
//       readonly reload: boolean;
//       readonly restore?: {
//         readonly sqliteSchema: SqliteSchema;
//         readonly mnemonic: Mnemonic;
//       };
//     })
//   | (Typed<"ensureSqliteSchema"> & {
//       readonly sqliteSchema: SqliteSchema;
//     })
//   | (Typed<"export"> & {
//       readonly onCompleteId: CallbackId;
//     })
//   | (Typed<"useOwner"> & {
//       readonly use: boolean;
//       readonly owner: SyncOwner;
//     });
//   | (Typed<"onReset"> & {
//       readonly onCompleteId: CallbackId;
//       readonly reload: boolean;
//     })
