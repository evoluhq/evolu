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
import { assert, assertNotDisposed } from "../Assert.js";
import { createCallbacks } from "../Callbacks.js";
import type { ConsoleEntry, ConsoleLevel } from "../Console.js";
import { exhaustiveCheck } from "../Function.js";
import { structuralLookup, type StructuralLookupKey } from "../Lookup.js";
import { createRefCountByKey, type RefCountByKey } from "../RefCount.js";
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
import type { OwnerId, OwnerTransport, SyncOwner } from "./Owner.js";
import {
  createProtocolMessageFromCrdtMessages,
  type ProtocolMessage,
} from "./Protocol.js";
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
                const sharedEvoluResult = await run(
                  sharedEvolusByName.acquire(message.name),
                );
                if (!sharedEvoluResult.ok) return sharedEvoluResult;
                sharedEvoluResult.value.addPorts(
                  message.evoluPort,
                  message.dbWorkerPort,
                  () =>
                    void sharedWorkerRunWithSharedEvoluDeps(
                      sharedEvolusByName.release(message.name),
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
          SharedWorkerDeps,
          StructuralLookupKey
        >(
          (transport): Task<WebSocket, never, SharedWorkerDeps> =>
            createWebSocket(transport.url, {
              binaryType: "arraybuffer",
              onOpen: () => {
                const ownerIds = transports.getClaimsForResource(transport);
                for (const sharedEvolu of sharedEvolusByName
                  .snapshot()
                  .resourcesByKey.values()) {
                  sharedEvolu.requestCreateSyncMessages(ownerIds);
                }
              },
              // onMessage(_data) {
              //   //
              // },
            }),
          {
            // "onFirstClaimAdded": todo()
            resourceLookup: structuralLookup,
          },
        ),
      ),
    );

    const sharedWorkerRunWithSharedEvoluDeps = initSharedWorkerRun.addDeps({
      transports,
      postTabOutput,
    });

    const sharedEvolusByName = stack.use(
      await sharedWorkerRunWithSharedEvoluDeps.orThrow(
        createSharedResourceByKey(createSharedEvolu, {
          lookup: structuralLookup,
        }),
      ),
    );

    sharedWorkerReady.resolve();
    console.info("initSharedWorker");

    return ok(stack.move());
  };

interface SharedEvolu extends AsyncDisposable {
  readonly addPorts: (
    evoluPort: NativeMessagePort<EvoluOutput, EvoluInput>,
    dbWorkerPort: NativeMessagePort<DbWorkerInput, DbWorkerOutput>,
    releaseSharedEvolu: () => void,
  ) => void;

  readonly requestCreateSyncMessages: (ownerIds: ReadonlySet<OwnerId>) => void;
}

type SharedEvoluDeps = SharedWorkerDeps & PostTabOutputDep & TransportsDep;

interface PostTabOutputDep {
  readonly postTabOutput: Callback<EvoluTabOutput>;
}

interface TransportsDep {
  readonly transports: SharedResourceByKeyWithClaims<
    OwnerTransport,
    OwnerId,
    WebSocket,
    SharedWorkerDeps
  >;
}

export interface DbWorkerInput {
  readonly callbackId: Id;
  readonly request:
    | {
        readonly type: "ForEvolu";
        readonly evoluPortId: Id;
        readonly message: ExtractType<
          EvoluInput,
          "Mutate" | "Query" | "Export"
        >;
      }
    | {
        readonly type: "ForSharedWorker";
        readonly message: {
          readonly type: "CreateSyncMessages";
          readonly ownerIds: NonEmptyReadonlyArray<OwnerId>;
        };
      };
}

export type DbWorkerOutput =
  | EvoluTabOutput
  | {
      readonly type: "LeaderAcquired";
      readonly name: Name;
    }
  | {
      readonly type: "OnQueuedResponse";
      readonly callbackId: Id;
      readonly response:
        | {
            readonly type: "ForEvolu";
            readonly evoluPortId: Id;
            readonly response:
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
                };
          }
        | {
            readonly type: "ForSharedWorker";
            readonly response: {
              readonly type: "CreateSyncMessages";
              readonly protocolMessagesByOwnerId: ReadonlyMap<
                OwnerId,
                ProtocolMessage
              >;
            };
          };
    };

export type SyncState = 123;

const createSharedEvolu =
  (name: Name): Task<SharedEvolu, never, SharedEvoluDeps> =>
  (run) => {
    const stack = new AsyncDisposableStack();
    const sharedEvoluRun = run.create();

    const console = run.deps.console.child(name).child("SharedWorker");
    const { createMessagePort, postTabOutput, transports } = run.deps;

    interface EvoluInstanceState {
      readonly evoluPort: MessagePort<EvoluOutput, EvoluInput>;
      readonly dbWorkerPort: MessagePort<DbWorkerInput, DbWorkerOutput>;
      readonly releaseSharedEvolu: () => void;
      rowsByQuery: RowsByQueryMap;
      readonly usedSyncOwners: RefCountByKey<SyncOwner>;
    }

    const evoluInstancesByPortId = new Map<Id, EvoluInstanceState>();
    const queue: Array<DbWorkerInput["request"]> = [];
    const callbacks = stack.use(
      createCallbacks<ExtractType<DbWorkerOutput, "OnQueuedResponse">>(
        run.deps,
      ),
    );

    let leaderDbWorkerPort = null as MessagePort<
      DbWorkerInput,
      DbWorkerOutput
    > | null;
    let queueProcessingFiber: Fiber<void, never, WorkerDeps> | null = null;

    stack.use(sharedEvoluRun);
    const moved = stack.move();

    const sendProtocolMessagesByOwnerId = (
      protocolMessagesByOwnerId: ReadonlyMap<OwnerId, ProtocolMessage>,
    ): void => {
      for (const [ownerId, protocolMessage] of protocolMessagesByOwnerId) {
        for (const transport of transports.getResourceKeysForClaim(ownerId)) {
          const webSocket = transports.getResource(transport);
          if (webSocket?.isOpen()) webSocket.send(protocolMessage);
        }
      }
    };

    const ensureQueueProcessing = (): void => {
      if (
        queueProcessingFiber ||
        !isNonEmptyArray(queue) ||
        !leaderDbWorkerPort
      ) {
        return;
      }

      const first = firstInArray(queue);

      const callbackId = callbacks.register(({ response }) => {
        queueProcessingFiber?.abort();
        queueProcessingFiber = null;

        switch (response.type) {
          case "ForEvolu": {
            const instance = evoluInstancesByPortId.get(response.evoluPortId);
            const port = instance?.evoluPort;

            if (!port) break;

            switch (response.response.type) {
              case "Mutate":
              case "Query": {
                const previousRowsByQuery = instance.rowsByQuery;
                const nextRowsByQuery = new Map(previousRowsByQuery);
                const patchesByQuery = new Map<Query, ReadonlyArray<Patch>>();

                for (const [query, rows] of response.response.rowsByQuery) {
                  nextRowsByQuery.set(query, rows);
                  patchesByQuery.set(
                    query,
                    makePatches(previousRowsByQuery.get(query), rows),
                  );
                }

                instance.rowsByQuery = nextRowsByQuery;

                instance.evoluPort.postMessage({
                  type: "OnPatchesByQuery",
                  patchesByQuery,
                  onCompleteIds:
                    first.message.type === "Mutate"
                      ? first.message.onCompleteIds
                      : emptyArray,
                });

                if (response.response.type === "Mutate") {
                  const mutateResponse = response.response;

                  for (const [
                    otherEvoluPortId,
                    otherEvoluInstance,
                  ] of evoluInstancesByPortId) {
                    if (otherEvoluPortId === response.evoluPortId) continue;
                    otherEvoluInstance.evoluPort.postMessage({
                      type: "RefreshQueries",
                    });
                  }

                  void sharedEvoluRun((run) => {
                    const createProtocolMessage =
                      createProtocolMessageFromCrdtMessages(run.deps);
                    const protocolMessagesByOwnerId = new Map<
                      OwnerId,
                      ProtocolMessage
                    >();

                    for (const syncOwner of instance.usedSyncOwners.keys()) {
                      const { owner } = syncOwner;
                      const messages = mutateResponse.messagesByOwnerId.get(
                        owner.id,
                      );

                      // Skip owners this instance does not currently sync for
                      // writing. Read-only owners cannot produce protocol
                      // messages because they do not have a write key.
                      if (!messages || !("writeKey" in owner)) continue;

                      protocolMessagesByOwnerId.set(
                        owner.id,
                        createProtocolMessage(owner, messages),
                      );
                    }

                    sendProtocolMessagesByOwnerId(protocolMessagesByOwnerId);

                    return ok();
                  });
                }
                break;
              }

              case "Export":
                port.postMessage(
                  { type: "OnExport", file: response.response.file },
                  [response.response.file.buffer],
                );
                break;

              default:
                exhaustiveCheck(response.response);
            }
            break;
          }

          case "ForSharedWorker":
            sendProtocolMessagesByOwnerId(
              response.response.protocolMessagesByOwnerId,
            );
            break;

          default:
            exhaustiveCheck(response);
        }

        // Complete the current queue item and continue with the next one.
        shiftFromArray(queue);
        ensureQueueProcessing();
      });

      /**
       * The leader DbWorker can disappear at any time when its tab closes, so
       * keep resending the current request until some leader answers. The
       * response handler aborts this retry loop and advances the queue.
       */
      queueProcessingFiber = sharedEvoluRun.daemon(
        repeat(() => {
          assert(leaderDbWorkerPort, "Expected a leader DbWorker");
          leaderDbWorkerPort.postMessage({ callbackId, request: first });
          return ok();
        }, spaced("5s")),
      );
    };

    const toggleUsedSyncOwner = (
      evoluInstance: EvoluInstanceState,
      syncOwner: SyncOwner,
      action: "add" | "remove",
    ): Task<void, never, SharedEvoluDeps> =>
      unabortable(async (run) => {
        if (action === "add") {
          evoluInstance.usedSyncOwners.increment(syncOwner);
          await run(
            transports.addClaim(syncOwner.owner.id, syncOwner.transports),
          );
        } else {
          evoluInstance.usedSyncOwners.decrement(syncOwner);
          await run(
            transports.removeClaim(syncOwner.owner.id, syncOwner.transports),
          );
        }
        return ok();
      });

    const removeAllUsedSyncOwners = (
      evoluInstance: EvoluInstanceState,
    ): Task<void, never, SharedEvoluDeps> =>
      unabortable(async (run) => {
        for (const syncOwner of evoluInstance.usedSyncOwners.keys()) {
          while (evoluInstance.usedSyncOwners.has(syncOwner)) {
            await run(toggleUsedSyncOwner(evoluInstance, syncOwner, "remove"));
          }
        }
        return ok();
      });

    return ok({
      requestCreateSyncMessages: (ownerIds): void => {
        const usedOwnerIds = new Set<OwnerId>();
        for (const evoluInstance of evoluInstancesByPortId.values()) {
          for (const { owner } of evoluInstance.usedSyncOwners.keys()) {
            usedOwnerIds.add(owner.id);
          }
        }

        const ownerIdsToSync = [
          ...new Set(ownerIds).intersection(usedOwnerIds),
        ];

        if (!isNonEmptyArray(ownerIdsToSync)) return;

        queue.push({
          type: "ForSharedWorker",
          message: {
            type: "CreateSyncMessages",
            ownerIds: ownerIdsToSync,
          },
        });

        ensureQueueProcessing();
      },

      addPorts: (
        nativeEvoluPort: NativeMessagePort<EvoluOutput, EvoluInput>,
        nativeDbWorkerPort: NativeMessagePort<DbWorkerInput, DbWorkerOutput>,
        releaseSharedEvolu: () => void,
      ): void => {
        assertNotDisposed(moved);

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
          usedSyncOwners: createRefCountByKey<SyncOwner, OwnerId>({
            lookup: ({ owner: { id } }) => id,
          }),
        };

        evoluInstancesByPortId.set(evoluPortId, evoluInstance);

        dbWorkerPort.onMessage = (message) => {
          switch (message.type) {
            case "LeaderAcquired": {
              leaderDbWorkerPort = evoluInstance.dbWorkerPort;
              console.info("leaderAcquired");
              ensureQueueProcessing();
              break;
            }

            case "OnQueuedResponse": {
              callbacks.execute(message.callbackId, message);
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
            case "Query":
            case "Export": {
              queue.push({
                type: "ForEvolu",
                evoluPortId,
                message: evoluMessage,
              });
              ensureQueueProcessing();
              break;
            }

            case "Mutate": {
              // TODO: Delegate do vsech evolu instances, co to pouzivaji
              queue.push({
                type: "ForEvolu",
                evoluPortId,
                message: evoluMessage,
              });
              ensureQueueProcessing();
              break;
            }

            case "UseOwner": {
              const evoluInstance = evoluInstancesByPortId.get(evoluPortId);
              if (!evoluInstance) break;

              for (const { owner, action } of evoluMessage.actions) {
                void sharedEvoluRun(
                  toggleUsedSyncOwner(evoluInstance, owner, action),
                );
              }
              break;
            }

            case "Dispose": {
              const evoluInstance = evoluInstancesByPortId.get(evoluPortId);
              if (!evoluInstance) break;

              console.info("evoluDispose", {
                name,
                evoluPortId,
                hadLastPort: evoluInstancesByPortId.size === 1,
              });
              evoluInstancesByPortId.delete(evoluPortId);

              // Potential plan: keep DbWorker ports in a SharedResource
              // abstraction instead of deleting them eagerly here. DbWorkers use
              // leader election because SQLite WASM needs a single active owner.
              // When the last Evolu instance is disposed, broadcast shutdown to
              // all DbWorkers so the current leader can dispose itself and the
              // followers can clean up consistently.
              void sharedEvoluRun(async (run) => {
                await run(removeAllUsedSyncOwners(evoluInstance));
                evoluInstance.usedSyncOwners[Symbol.dispose]();
                evoluInstance.releaseSharedEvolu();
                return ok();
              });

              // TODO: Dispose SharedEvolu on the last port.

              // TODO: Decided what to do with DbWorker but probably dispose it, but
              // https://bugs.webkit.org/show_bug.cgi?id=301520
              break;
            }

            default:
              exhaustiveCheck(evoluMessage);
          }
        };
      },

      [Symbol.asyncDispose]: () => moved.disposeAsync(),
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
