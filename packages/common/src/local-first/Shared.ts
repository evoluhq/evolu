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
import type { ConsoleEntry, ConsoleLevel } from "../Console.js";
import { exhaustiveCheck } from "../Function.js";
import {
  createSharedResourceByKey,
  createSharedResourceByKeyWithClaims,
  type SharedResourceByKeyWithClaims,
} from "../Resource.js";
import { ok } from "../Result.js";
import { spaced } from "../Schedule.js";
import type { NonEmptyReadonlySet } from "../Set.js";
import { repeat, unabortable, type Fiber, type Task } from "../Task.js";
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
import type {
  Owner,
  OwnerId,
  OwnerTransport,
  OwnerWriteKey,
  ReadonlyOwner,
  SyncOwner,
} from "./Owner.js";
import type { ProtocolMessage } from "./Protocol.js";
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
      readonly type: "UseOwner";
      readonly actions: ReadonlyArray<{
        readonly owner: SyncOwner;
        readonly action: "add" | "remove";
      }>;
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
    await using stack = new AsyncDisposableStack();
    const sharedWorkerReady = Promise.withResolvers<void>();

    // TODO: Use heartbeat to detect and prune dead ports.
    const tabPorts = new Set<MessagePort<EvoluTabOutput>>();

    // Buffer console/error outputs until the first tab connects its port.
    const queuedTabOutputs: Array<EvoluTabOutput> = [];
    const postTabOutput = (output: EvoluTabOutput): void => {
      if (tabPorts.size === 0) queuedTabOutputs.push(output);
      else for (const port of tabPorts) port.postMessage(output);
    };
    stack.defer(
      consoleStoreOutputEntry.subscribe(() => {
        const entry = consoleStoreOutputEntry.get();
        if (entry) postTabOutput({ type: "OnConsoleEntry", entry });
      }),
    );

    // Register ASAP so the worker does not miss connections.
    self.onConnect = (port) => {
      console.debug("onConnect");

      // The underlying port buffers messages until onMessage is assigned.
      void sharedWorkerReady.promise.then(() => {
        port.onMessage = (message) => {
          switch (message.type) {
            case "InitTab": {
              /**
               * One SharedWorker serves multiple tabs. The most recently
               * initialized tab's level wins.
               */
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
              void sharedWorkerRunWithSharedEvoluDeps(async (run) => {
                const { name, appOwner } = message;
                const sharedEvoluResult = await run(
                  sharedEvolusByName.acquire({ name, appOwner }),
                );
                if (!sharedEvoluResult.ok) return sharedEvoluResult;
                sharedEvoluResult.value.addPorts(
                  message.evoluPort,
                  message.dbWorkerPort,
                  () =>
                    void sharedWorkerRunWithSharedEvoluDeps(
                      sharedEvolusByName.release({ name, appOwner }),
                    ),
                );
                return ok();
              });
              break;
            }
            default:
              console.error("Unknown shared worker input", message);
          }
        };
      });
    };

    const initSharedWorkerRun = run.create();

    const transports = stack.use(
      await initSharedWorkerRun.orThrow(
        createSharedResourceByKeyWithClaims<
          WebSocket,
          OwnerTransport,
          OwnerId,
          SharedWorkerDeps
        >(
          (transport): Task<WebSocket, never, SharedWorkerDeps> =>
            createWebSocket(transport.url, {
              binaryType: "arraybuffer",
              // onOpen:
            }),
        ),
      ),
    );

    const sharedWorkerRunWithSharedEvoluDeps = initSharedWorkerRun.addDeps({
      transports,
      postTabOutput,
    });

    const sharedEvolusByName = stack.use(
      await sharedWorkerRunWithSharedEvoluDeps.orThrow(
        createSharedResourceByKey(createSharedEvolu),
      ),
    );

    sharedWorkerReady.resolve();
    console.info("initSharedWorker");

    return ok(stack.move());
  };

type SharedEvoluDeps = SharedWorkerDeps & TransportsDep & PostTabOutputDep;

interface PostTabOutputDep {
  readonly postTabOutput: Callback<EvoluTabOutput>;
}

interface TransportsDep {
  readonly transports: SharedTransportResources;
}

type SharedTransportResources = SharedResourceByKeyWithClaims<
  OwnerTransport,
  OwnerId,
  WebSocket,
  SharedWorkerDeps
>;

interface SharedEvolu extends AsyncDisposable {
  readonly addPorts: (
    evoluPort: NativeMessagePort<EvoluOutput, EvoluInput>,
    dbWorkerPort: NativeMessagePort<DbWorkerInput, DbWorkerOutput>,
    releaseSharedEvolu: () => void,
  ) => void;
}

export interface DbWorkerQueueItem {
  readonly evoluPortId: Id;
  readonly request: DbWorkerRequest;
}

export type DbWorkerRequest =
  | (ExtractType<EvoluInput, "Mutate"> & {
      readonly syncOwners: ReadonlyArray<Owner>;
    })
  | ExtractType<EvoluInput, "Query" | "Export">;

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
      readonly protocolMessagesByOwnerId: ReadonlyMap<OwnerId, ProtocolMessage>;
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

export type SyncState = 123;

interface EvoluInstanceState {
  readonly evoluPort: MessagePort<EvoluOutput, EvoluInput>;
  readonly dbWorkerPort: MessagePort<DbWorkerInput, DbWorkerOutput>;
  readonly releaseSharedEvolu: () => void;
  rowsByQuery: RowsByQueryMap;
  readonly usedSyncOwnersById: Map<
    OwnerId,
    {
      owner: SyncOwner;
      count: number;
    }
  >;
}

const createSharedEvolu =
  ({
    name,
    appOwner,
  }: {
    name: Name;
    appOwner: SyncOwner;
  }): Task<SharedEvolu, never, SharedEvoluDeps> =>
  async (run) => {
    const stack = new AsyncDisposableStack();
    const sharedEvoluRun = run.create();
    stack.use(sharedEvoluRun);

    const console = run.deps.console.child(name).child("SharedWorker");
    const { createMessagePort, postTabOutput, transports } = run.deps;

    const evoluInstancesById = new Map<Id, EvoluInstanceState>();
    const queue: Array<DbWorkerQueueItem> = [];
    const callbacks = createCallbacks<QueuedResult>(run.deps);

    let leaderDbWorkerPort = null as MessagePort<
      DbWorkerInput,
      DbWorkerOutput
    > | null;

    let queueProcessingFiber: Fiber<void, never, WorkerDeps> | null = null;
    let isDisposed = false;

    const toOwnerWithWriteKey = (
      owner: SyncOwner,
    ): (ReadonlyOwner & { readonly writeKey: OwnerWriteKey }) | null =>
      owner.writeKey
        ? {
            id: owner.id,
            encryptionKey: owner.encryptionKey,
            writeKey: owner.writeKey,
          }
        : null;

    const toggleUsedOwnerForEvoluInstance = (
      evoluInstance: EvoluInstanceState,
      owner: SyncOwner,
      action: "add" | "remove",
    ): Task<void, never, SharedEvoluDeps> =>
      unabortable(async (run) => {
        const current = evoluInstance.usedSyncOwnersById.get(owner.id);

        if (action === "add") {
          if (current) {
            current.count += 1;
            current.owner = owner;
          } else {
            evoluInstance.usedSyncOwnersById.set(owner.id, { owner, count: 1 });
          }
        } else {
          if (!current) return ok();

          current.count -= 1;
          if (current.count === 0) {
            evoluInstance.usedSyncOwnersById.delete(owner.id);
          }
        }

        const ownerTransports = owner.transports ?? emptyArray;
        if (ownerTransports.length === 0) return ok();

        await run(
          action === "add"
            ? transports.addClaim(owner.id, ownerTransports)
            : transports.removeClaim(owner.id, ownerTransports),
        );

        return ok();
      });

    const removeAllUsedOwnersForEvoluInstance = (
      evoluInstance: EvoluInstanceState,
    ): Task<void, never, SharedEvoluDeps> =>
      unabortable(async (run) => {
        const usedSyncOwners = [...evoluInstance.usedSyncOwnersById.values()];

        for (const { owner, count } of usedSyncOwners) {
          for (let index = 0; index < count; index += 1) {
            await run(
              toggleUsedOwnerForEvoluInstance(evoluInstance, owner, "remove"),
            );
          }
        }

        return ok();
      });

    const getSyncOwnerById = (ownerId: OwnerId): SyncOwner | null => {
      if (ownerId === appOwner.id) return appOwner;

      for (const evoluInstance of evoluInstancesById.values()) {
        const owner = evoluInstance.usedSyncOwnersById.get(ownerId)?.owner;
        if (owner) return owner;
      }

      return null;
    };

    const getSyncOwnersForMutate = (
      changes: NonEmptyReadonlyArray<MutationChange>,
    ): ReadonlyArray<Owner> => {
      const syncOwnersById = new Map<OwnerId, Owner>();

      for (const { ownerId } of changes) {
        const owner = getSyncOwnerById(ownerId);
        if (!owner) continue;

        const ownerWithWriteKey = toOwnerWithWriteKey(owner);
        if (!ownerWithWriteKey) continue;
        syncOwnersById.set(ownerId, ownerWithWriteKey);
      }

      return [...syncOwnersById.values()];
    };

    const sendProtocolMessageToOwnerTransports = (
      ownerId: OwnerId,
      protocolMessage: ProtocolMessage,
    ): void => {
      for (const transport of transports.getResourceKeysForClaim(ownerId)) {
        const webSocket = transports.getResource(transport);
        if (!webSocket?.isOpen()) continue;

        const sendResult = webSocket.send(protocolMessage);
        if (!sendResult.ok) {
          console.debug("syncSendSkipped", {
            ownerId,
            transport,
            error: sendResult.error,
          });
        }
      }
    };

    const appOwnerTransports = appOwner.transports ?? emptyArray;
    if (appOwnerTransports.length > 0) {
      await sharedEvoluRun.orThrow(
        transports.addClaim(appOwner.id, appOwnerTransports),
      );
    }

    const ensureQueueProcessing = (): void => {
      if (
        queueProcessingFiber ||
        !isNonEmptyArray(queue) ||
        !leaderDbWorkerPort
      ) {
        return;
      }

      const first = firstInArray(queue);

      const callbackId = callbacks.register(({ evoluPortId, response }) => {
        queueProcessingFiber?.abort();
        queueProcessingFiber = null;

        const evoluInstance = evoluInstancesById.get(evoluPortId);
        const evoluPort = evoluInstance?.evoluPort;

        switch (response.type) {
          case "Mutate":
          case "Query": {
            if (evoluInstance)
              evoluInstance.evoluPort.postMessage({
                type: "OnPatchesByQuery",
                patchesByQuery: createPatchesByQuery(
                  evoluInstance,
                  response.rowsByQuery,
                ),
                onCompleteIds:
                  first.request.type === "Mutate"
                    ? first.request.onCompleteIds
                    : emptyArray,
              });

            if (response.type === "Mutate") {
              for (const [
                otherEvoluPortId,
                otherEvoluInstance,
              ] of evoluInstancesById) {
                if (otherEvoluPortId === evoluPortId) continue;
                otherEvoluInstance.evoluPort.postMessage({
                  type: "RefreshQueries",
                });
              }

              for (const [
                ownerId,
                protocolMessage,
              ] of response.protocolMessagesByOwnerId) {
                sendProtocolMessageToOwnerTransports(ownerId, protocolMessage);
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

      queueProcessingFiber = sharedEvoluRun.daemon(
        repeat(() => {
          assert(leaderDbWorkerPort, "Expected a leader DbWorker");
          leaderDbWorkerPort.postMessage({ callbackId, ...first });
          return ok();
        }, spaced("5s")), // 5s seems to be a good balance
      );
    };

    const createPatchesByQuery = (
      evoluInstance: EvoluInstanceState,
      rowsByQuery: RowsByQueryMap,
    ): ReadonlyMap<Query, ReadonlyArray<Patch>> => {
      const previousRowsByQuery = evoluInstance.rowsByQuery;
      const nextRowsByQuery = new Map(previousRowsByQuery);
      const patchesByQuery = new Map<Query, ReadonlyArray<Patch>>();

      for (const [query, rows] of rowsByQuery) {
        nextRowsByQuery.set(query, rows);
        patchesByQuery.set(
          query,
          makePatches(previousRowsByQuery.get(query), rows),
        );
      }

      evoluInstance.rowsByQuery = nextRowsByQuery;
      return patchesByQuery;
    };

    const moved = stack.move();

    return ok({
      addPorts: (
        nativeEvoluPort: NativeMessagePort<EvoluOutput, EvoluInput>,
        nativeDbWorkerPort: NativeMessagePort<DbWorkerInput, DbWorkerOutput>,
        releaseSharedEvolu: () => void,
      ): void => {
        if (isDisposed) return;

        const evoluPort = createMessagePort<EvoluOutput, EvoluInput>(
          nativeEvoluPort,
        );
        const dbWorkerPort = createMessagePort<DbWorkerInput, DbWorkerOutput>(
          nativeDbWorkerPort,
        );

        const evoluPortId = createId(run.deps);
        const evoluInstance: EvoluInstanceState = {
          evoluPort,
          dbWorkerPort,
          releaseSharedEvolu,
          rowsByQuery: new Map(),
          usedSyncOwnersById: new Map(),
        };

        evoluInstancesById.set(evoluPortId, evoluInstance);

        dbWorkerPort.onMessage = (message) => {
          switch (message.type) {
            case "LeaderAcquired": {
              leaderDbWorkerPort = evoluInstance.dbWorkerPort;
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
              exhaustiveCheck(message);
          }
        };

        evoluPort.onMessage = (evoluMessage) => {
          switch (evoluMessage.type) {
            case "Dispose": {
              const evoluInstance = evoluInstancesById.get(evoluPortId);
              if (!evoluInstance) break;

              console.info("evoluDispose", {
                name,
                evoluPortId,
                hadLastPort: evoluInstancesById.size === 1,
              });
              evoluInstancesById.delete(evoluPortId);
              // Potential plan: keep DbWorker ports in a SharedResource
              // abstraction instead of deleting them eagerly here. DbWorkers use
              // leader election because SQLite WASM needs a single active owner.
              // When the last Evolu instance is disposed, broadcast shutdown to
              // all DbWorkers so the current leader can dispose itself and the
              // followers can clean up consistently.
              void sharedEvoluRun(
                removeAllUsedOwnersForEvoluInstance(evoluInstance),
              );
              evoluInstance.releaseSharedEvolu();

              // TODO: Decided what to do with DbWorker but probably dispose it, but
              // https://bugs.webkit.org/show_bug.cgi?id=301520
              break;
            }

            case "Mutate":
            case "Query":
            case "Export": {
              queue.push({
                evoluPortId,
                request:
                  evoluMessage.type === "Mutate"
                    ? {
                        ...evoluMessage,
                        syncOwners: getSyncOwnersForMutate(
                          evoluMessage.changes,
                        ),
                      }
                    : evoluMessage,
              });
              ensureQueueProcessing();
              break;
            }
            case "UseOwner": {
              const evoluInstance = evoluInstancesById.get(evoluPortId);
              if (!evoluInstance) break;

              for (const { owner, action } of evoluMessage.actions) {
                void sharedEvoluRun(
                  toggleUsedOwnerForEvoluInstance(evoluInstance, owner, action),
                );
              }
              break;
            }
            default:
              exhaustiveCheck(evoluMessage);
          }
        };
      },

      [Symbol.asyncDispose]: async () => {
        isDisposed = true;

        for (const evoluInstance of evoluInstancesById.values()) {
          await sharedEvoluRun.orThrow(
            removeAllUsedOwnersForEvoluInstance(evoluInstance),
          );
        }
        if (appOwnerTransports.length > 0) {
          await sharedEvoluRun.orThrow(
            transports.removeClaim(appOwner.id, appOwnerTransports),
          );
        }

        queueProcessingFiber?.abort();
        queueProcessingFiber = null;
        callbacks[Symbol.dispose]();
        leaderDbWorkerPort = null;
        queue.length = 0;
        evoluInstancesById.clear();
        await moved.disposeAsync();
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
