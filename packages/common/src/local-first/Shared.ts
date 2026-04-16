/**
 * Platform-agnostic Evolu SharedWorker.
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
import type { Brand } from "../Brand.js";
import { createCallbacks } from "../Callbacks.js";
import type { ConsoleEntry, ConsoleLevel } from "../Console.js";
import { exhaustiveCheck } from "../Function.js";
import { structuralLookup, type StructuralLookupKey } from "../Lookup.js";
import { createRefCountByKey, type RefCountByKey } from "../RefCount.js";
import {
  createSharedResourceByKey,
  createSharedResourceByKeyWithClaims,
  type BorrowedResource,
  type SharedResourceByKeyWithClaims,
} from "../Resource.js";
import { ok, type Result } from "../Result.js";
import { spaced } from "../Schedule.js";
import type { NonEmptyReadonlySet } from "../Set.js";
import {
  createMutex,
  repeat,
  unabortable,
  type AbortError,
  type Fiber,
  type Mutex,
  type Task,
} from "../Task.js";
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
import type { Owner, OwnerId, OwnerTransport, SyncOwner } from "./Owner.js";
import {
  createProtocolMessageForUnsubscribe,
  createProtocolMessageFromCrdtMessages,
  parseProtocolHeader,
  type ApplyProtocolMessageAsClientResult,
  type ProtocolError,
  type ProtocolMessage,
} from "./Protocol.js";
import {
  makePatches,
  type Patch,
  type Query,
  type Row,
  type RowsByQueryMap,
} from "./Query.js";
import type { MutationChange } from "./Schema.js";
import type { CrdtMessage } from "./Storage.js";

export type SharedWorker = CommonSharedWorker<SharedWorkerInput>;

export interface SharedWorkerDep {
  readonly sharedWorker: SharedWorker;
}

export type SharedWorkerInput =
  | {
      readonly type: "InitTab";
      readonly consoleLevel: ConsoleLevel;
      readonly port: NativeMessagePort<TabOutput>;
    }
  | {
      readonly type: "CreateEvolu";
      readonly name: Name;
      readonly evoluPort: NativeMessagePort<EvoluOutput, EvoluInput>;
      readonly dbWorkerPort: NativeMessagePort<DbWorkerInput, DbWorkerOutput>;
    };

export type TabOutput =
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

export interface DbWorkerInput {
  readonly callbackId: Id;
  readonly request:
    | {
        readonly type: "ForEvolu";
        readonly id: EvoluInstanceId;
        readonly message: ExtractType<
          EvoluInput,
          "Mutate" | "Query" | "Export"
        >;
      }
    | {
        readonly type: "ForSharedWorker";
        readonly message:
          | {
              readonly type: "CreateSyncMessages";
              readonly owners: NonEmptyReadonlyArray<Owner>;
            }
          | {
              readonly type: "ApplySyncMessage";
              readonly owner: Owner;
              readonly inputMessage: Uint8Array;
            };
      };
}

export type DbWorkerOutput =
  | TabOutput
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
            readonly id: EvoluInstanceId;
            readonly message:
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
            readonly message:
              | {
                  readonly type: "CreateSyncMessages";
                  readonly protocolMessagesByOwnerId: ReadonlyMap<
                    OwnerId,
                    ProtocolMessage
                  >;
                }
              | {
                  readonly type: "ApplySyncMessage";
                  readonly ownerId: OwnerId;
                  readonly didWriteMessages: boolean;
                  readonly result: Result<
                    ApplyProtocolMessageAsClientResult,
                    ProtocolError | AbortError
                  >;
                };
          };
    };

export type SharedWorkerDeps = WorkerDeps & CreateWebSocketDep;

interface EvoluTenant extends AsyncDisposable {
  readonly addInstance: (
    evoluPort: NativeMessagePort<EvoluOutput, EvoluInput>,
    dbWorkerPort: NativeMessagePort<DbWorkerInput, DbWorkerOutput>,
    onDisposed: () => void,
  ) => void;

  readonly requestCreateSyncMessages: (ownerIds: ReadonlySet<OwnerId>) => void;

  readonly requestApplySyncMessage: (
    ownerId: OwnerId,
    inputMessage: Uint8Array,
  ) => void;
}

type EvoluTenantDeps = SharedWorkerDeps & PostTabOutputDep & TransportsDep;

interface PostTabOutputDep {
  readonly postTabOutput: Callback<TabOutput>;
}

interface TransportsDep {
  readonly transports: SharedResourceByKeyWithClaims<
    OwnerTransport,
    OwnerId,
    WebSocket,
    SharedWorkerDeps
  >;
}

interface EvoluInstance {
  readonly id: EvoluInstanceId;
  readonly onDisposed: () => void;
  readonly port: MessagePort<EvoluOutput, EvoluInput>;
  readonly useOwnerMutex: Mutex;
  readonly usedSyncOwners: RefCountByKey<SyncOwner>;
  rowsByQuery: Map<Query, ReadonlyArray<Row>>;
}

export type EvoluInstanceId = Id & Brand<"EvoluInstance">;

// TODO:
export type SyncState = 123;

export const initSharedWorker =
  (
    self: SharedWorkerSelf<SharedWorkerInput>,
  ): Task<AsyncDisposableStack, never, SharedWorkerDeps> =>
  async (run) => {
    const { deps } = run;
    const console = deps.console.child("SharedWorker");

    // TODO: Use heartbeat to detect and prune dead ports.
    const tabPorts = new Set<MessagePort<TabOutput>>();

    const queuedTabOutputs: Array<TabOutput> = [];
    const postTabOutput = (output: TabOutput): void => {
      // Queue outputs until the first tab connects.
      if (tabPorts.size === 0) queuedTabOutputs.push(output);
      else for (const port of tabPorts) port.postMessage(output);
    };

    await using disposer = new AsyncDisposableStack();

    disposer.defer(
      deps.consoleStoreOutputEntry.subscribe(() => {
        const entry = deps.consoleStoreOutputEntry.get();
        if (entry) postTabOutput({ type: "OnConsoleEntry", entry });
      }),
    );

    const sharedWorkerReady = Promise.withResolvers<void>();

    // Register ASAP so the worker does not miss connections.
    self.onConnect = (port) => {
      void sharedWorkerReady.promise.then(() => {
        // The underlying port buffers messages until onMessage is assigned.
        port.onMessage = (message) => {
          switch (message.type) {
            case "InitTab": {
              // SharedWorker serves multiple tabs so the most recently
              // initialized tab's level wins.
              console.setLevel(message.consoleLevel);
              tabPorts.add(deps.createMessagePort<TabOutput>(message.port));
              if (queuedTabOutputs.length > 0) {
                queuedTabOutputs.forEach(postTabOutput);
                queuedTabOutputs.length = 0;
              }
              break;
            }

            case "CreateEvolu": {
              void sharedWorkerRun(async (run) => {
                const tenant = await run.orThrow(
                  tenantsByName.acquire(message.name),
                );
                tenant.addInstance(
                  message.evoluPort,
                  message.dbWorkerPort,
                  () =>
                    void sharedWorkerRun(tenantsByName.release(message.name)),
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

    const transports = disposer.use(
      await run.orThrow(
        createSharedResourceByKeyWithClaims<
          WebSocket,
          OwnerTransport,
          OwnerId,
          SharedWorkerDeps,
          StructuralLookupKey
        >(
          (transport) =>
            deps.createWebSocket(transport.url, {
              binaryType: "arraybuffer",

              onOpen: () => {
                const ownerIds = transports.getClaimsForResource(transport);
                console.debug("transportOpen", {
                  url: transport.url,
                  ownerIds: [...ownerIds],
                });

                forEachTenant((tenant) => {
                  tenant.requestCreateSyncMessages(ownerIds);
                });
              },

              onMessage(data) {
                if (!(data instanceof ArrayBuffer)) return;

                const message = new Uint8Array(data);
                const headerResult = parseProtocolHeader(message);

                if (!headerResult.ok) {
                  console.debug("transportInvalidProtocolMessage", {
                    url: transport.url,
                    byteLength: message.byteLength,
                  });

                  // TODO: Propagate invalid protocol messages to sync state.
                  return;
                }

                console.debug("transportProtocolMessage", {
                  url: transport.url,
                  ownerId: headerResult.value.ownerId,
                  byteLength: message.byteLength,
                });

                forEachTenant((tenant) => {
                  tenant.requestApplySyncMessage(
                    headerResult.value.ownerId,
                    message,
                  );
                });
              },
            }),
          {
            onFirstClaimAdded: (ownerId, webSocket) => {
              if (!webSocket.isOpen()) return;
              forEachTenant((tenant) => {
                tenant.requestCreateSyncMessages(new Set([ownerId]));
              });
            },

            onLastClaimRemoved: (ownerId, webSocket) => {
              webSocket.send(createProtocolMessageForUnsubscribe(ownerId));
            },
            // Keep sockets alive briefly across short owner churn.
            idleDisposeAfter: "3s",
            resourceLookup: structuralLookup,
          },
        ),
      ),
    );

    const sharedWorkerRun = run.create().addDeps({
      transports,
      postTabOutput,
    });

    const tenantsByName = disposer.use(
      await sharedWorkerRun.orThrow(
        createSharedResourceByKey(createEvoluTenant, {
          lookup: structuralLookup,
        }),
      ),
    );

    const forEachTenant = (
      callback: Callback<BorrowedResource<EvoluTenant>>,
    ): void => {
      for (const tenant of tenantsByName.snapshot().resourcesByKey.values()) {
        callback(tenant);
      }
    };

    sharedWorkerReady.resolve();
    console.info("initSharedWorker");

    return ok(disposer.move());
  };

const createEvoluTenant =
  (name: Name): Task<EvoluTenant, never, EvoluTenantDeps> =>
  async (run) => {
    await using disposer = new AsyncDisposableStack();
    const tenantRun = run.create();

    const { deps } = run;
    const console = deps.console.child(name).child("SharedWorker");

    const instancesById = new Map<EvoluInstanceId, EvoluInstance>();
    const dbWorkerPorts = new Set<MessagePort<DbWorkerInput, DbWorkerOutput>>();
    const queue: Array<DbWorkerInput["request"]> = [];
    const callbacks = disposer.use(
      createCallbacks<ExtractType<DbWorkerOutput, "OnQueuedResponse">>(
        run.deps,
      ),
    );

    let leaderDbWorkerPort = null as MessagePort<
      DbWorkerInput,
      DbWorkerOutput
    > | null;
    let queueProcessingFiber: Fiber<void, never, WorkerDeps> | null = null;

    disposer.defer(() => {
      using disposer = new DisposableStack();

      leaderDbWorkerPort = null;

      for (const instance of instancesById.values()) {
        instance.port.onMessage = null;
        disposer.use(instance.port);
      }
      instancesById.clear();

      for (const dbWorkerPort of dbWorkerPorts) {
        dbWorkerPort.onMessage = null;
        disposer.use(dbWorkerPort);
      }
      dbWorkerPorts.clear();
    });

    disposer.use(tenantRun);
    const disposables = disposer.move();

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
            handleResponseForEvolu(response, first);
            break;
          }

          case "ForSharedWorker":
            handleResponseForSharedWorker(response);
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
      queueProcessingFiber = tenantRun.daemon(
        repeat(() => {
          assert(leaderDbWorkerPort, "Expected a leader DbWorker");
          leaderDbWorkerPort.postMessage({ callbackId, request: first });
          return ok();
        }, spaced("5s")),
      );
    };

    const handleResponseForEvolu = (
      response: ExtractType<
        ExtractType<DbWorkerOutput, "OnQueuedResponse">["response"],
        "ForEvolu"
      >,
      first: DbWorkerInput["request"],
    ): void => {
      const instance = instancesById.get(response.id);
      if (!instance) return;

      switch (response.message.type) {
        case "Mutate":
        case "Query": {
          const nextRowsByQuery = new Map(instance.rowsByQuery);
          const patchesByQuery = new Map<Query, ReadonlyArray<Patch>>();

          for (const [query, rows] of response.message.rowsByQuery) {
            nextRowsByQuery.set(query, rows);
            patchesByQuery.set(
              query,
              makePatches(instance.rowsByQuery.get(query), rows),
            );
          }

          instance.rowsByQuery = nextRowsByQuery;

          instance.port.postMessage({
            type: "OnPatchesByQuery",
            patchesByQuery,
            onCompleteIds:
              first.message.type === "Mutate"
                ? first.message.onCompleteIds
                : emptyArray,
          });

          if (response.message.type === "Mutate") {
            for (const [instanceId, instance] of instancesById) {
              if (instanceId === response.id) continue;
              instance.port.postMessage({
                type: "RefreshQueries",
              });
            }

            const protocolMessagesByOwnerId = new Map<
              OwnerId,
              ProtocolMessage
            >();

            for (const syncOwner of instance.usedSyncOwners.keys()) {
              const { owner } = syncOwner;
              const messages = response.message.messagesByOwnerId.get(owner.id);

              // Skip owners this instance does not currently sync for
              // writing. Read-only owners cannot produce protocol
              // messages because they do not have a write key.
              if (!messages || !("writeKey" in owner)) continue;

              protocolMessagesByOwnerId.set(
                owner.id,
                createProtocolMessageFromCrdtMessages(run.deps)(
                  owner,
                  messages,
                ),
              );
            }

            sendProtocolMessagesByOwnerId(protocolMessagesByOwnerId);
          }
          break;
        }

        case "Export":
          instance.port.postMessage(
            { type: "OnExport", file: response.message.file },
            [response.message.file.buffer],
          );
          break;

        default:
          exhaustiveCheck(response.message);
      }
    };

    const handleResponseForSharedWorker = (
      response: ExtractType<
        ExtractType<DbWorkerOutput, "OnQueuedResponse">["response"],
        "ForSharedWorker"
      >,
    ): void => {
      switch (response.message.type) {
        case "CreateSyncMessages":
          sendProtocolMessagesByOwnerId(
            response.message.protocolMessagesByOwnerId,
          );
          break;

        case "ApplySyncMessage":
          if (response.message.didWriteMessages) {
            for (const instance of instancesById.values()) {
              instance.port.postMessage({ type: "RefreshQueries" });
            }
          }

          if (!response.message.result.ok) {
            if (response.message.result.error.type !== "AbortError") {
              deps.postTabOutput({
                type: "OnError",
                error: response.message.result.error,
              });
            }
          } else {
            switch (response.message.result.value.type) {
              case "Response":
                sendProtocolMessagesByOwnerId(
                  new Map([
                    [
                      response.message.ownerId,
                      response.message.result.value.message,
                    ],
                  ]),
                );
                break;

              case "Broadcast":
              case "NoResponse":
                break;

              default:
                exhaustiveCheck(response.message.result.value);
            }
          }
          break;

        default:
          exhaustiveCheck(response.message);
      }
    };

    const sendProtocolMessagesByOwnerId = (
      protocolMessagesByOwnerId: ReadonlyMap<OwnerId, ProtocolMessage>,
    ): void => {
      for (const [ownerId, protocolMessage] of protocolMessagesByOwnerId) {
        for (const transport of deps.transports.getResourceKeysForClaim(
          ownerId,
        )) {
          const webSocket = deps.transports.getResource(transport);
          if (!webSocket?.isOpen()) continue;

          console.debug("sendProtocolMessage", {
            ownerId,
            url: transport.url,
            byteLength: protocolMessage.byteLength,
          });

          webSocket.send(protocolMessage);
        }
      }
    };

    const getUsedOwnersById = (
      ownerIds: ReadonlySet<OwnerId>,
    ): ReadonlyMap<OwnerId, Owner> => {
      const ownersById = new Map<OwnerId, Owner>();
      for (const instance of instancesById.values()) {
        for (const { owner } of instance.usedSyncOwners.keys()) {
          if (!ownerIds.has(owner.id) || !("writeKey" in owner)) continue;
          ownersById.set(owner.id, owner);
        }
      }
      return ownersById;
    };

    const removeAllUsedSyncOwners = (
      instance: EvoluInstance,
    ): Task<void, never, EvoluTenantDeps> =>
      unabortable(async (run) => {
        for (const syncOwner of instance.usedSyncOwners.keys()) {
          while (instance.usedSyncOwners.has(syncOwner)) {
            await run(toggleSyncOwner(instance, syncOwner, "remove"));
          }
        }
        return ok();
      });

    const toggleSyncOwner = (
      instance: EvoluInstance,
      syncOwner: SyncOwner,
      action: "add" | "remove",
    ): Task<void, never, EvoluTenantDeps> =>
      unabortable(async (run) => {
        if (action === "add") {
          instance.usedSyncOwners.increment(syncOwner);
          return await run(
            deps.transports.addClaim(syncOwner.owner.id, syncOwner.transports),
          );
        } else {
          instance.usedSyncOwners.decrement(syncOwner);
          return await run(
            deps.transports.removeClaim(
              syncOwner.owner.id,
              syncOwner.transports,
            ),
          );
        }
      });

    return ok({
      addInstance: (
        nativeEvoluPort: NativeMessagePort<EvoluOutput, EvoluInput>,
        nativeDbWorkerPort: NativeMessagePort<DbWorkerInput, DbWorkerOutput>,
        onDisposed: () => void,
      ): void => {
        assertNotDisposed(disposables);

        const instance: EvoluInstance = {
          id: createId<"EvoluInstance">(deps),
          port: deps.createMessagePort<EvoluOutput, EvoluInput>(
            nativeEvoluPort,
          ),
          onDisposed,
          rowsByQuery: new Map<Query, ReadonlyArray<Row>>(),
          useOwnerMutex: createMutex(),
          usedSyncOwners: createRefCountByKey<SyncOwner, OwnerId>({
            lookup: (syncOwner) => syncOwner.owner.id,
          }),
        };

        instancesById.set(instance.id, instance);

        instance.port.onMessage = (message) => {
          switch (message.type) {
            case "Query":
            case "Export": {
              queue.push({ type: "ForEvolu", id: instance.id, message });
              ensureQueueProcessing();
              break;
            }
            case "Mutate": {
              // TODO: Delegate do vsech evolu instances, co to pouzivaji
              queue.push({ type: "ForEvolu", id: instance.id, message });
              ensureQueueProcessing();
              break;
            }
            case "UseOwner": {
              void tenantRun(
                instance.useOwnerMutex.withLock(async (run) => {
                  for (const { owner, action } of message.actions) {
                    console.debug("useOwner", {
                      id: instance.id,
                      action,
                      ownerId: owner.owner.id,
                      transportUrls: owner.transports.map(({ url }) => url),
                    });

                    await run(toggleSyncOwner(instance, owner, action));
                  }

                  return ok();
                }),
              );
              break;
            }
            case "Dispose": {
              using disposeStack = new DisposableStack();

              instancesById.delete(instance.id);
              instance.port.onMessage = null;
              disposeStack.use(instance.port);
              console.info("evoluDispose", { name, id: instance.id });

              // Potential plan: keep DbWorker ports in a SharedResource
              // abstraction instead of deleting them eagerly here. DbWorkers use
              // leader election because SQLite WASM needs a single active owner.
              // When the last Evolu instance is disposed, broadcast shutdown to
              // all DbWorkers so the current leader can dispose itself and the
              // followers can clean up consistently.
              void tenantRun(
                instance.useOwnerMutex.withLock(async (run) => {
                  using disposeStack = new DisposableStack();
                  disposeStack.use(instance.usedSyncOwners);
                  disposeStack.use(instance.useOwnerMutex);
                  disposeStack.defer(instance.onDisposed);

                  await run(removeAllUsedSyncOwners(instance));
                  return ok();
                }),
              );

              // TODO: Dispose EvoluTenant on the last port.

              // TODO: Decided what to do with DbWorker but probably dispose it, but
              // https://bugs.webkit.org/show_bug.cgi?id=301520
              break;
            }
            default:
              exhaustiveCheck(message);
          }
        };

        const dbWorkerPort = deps.createMessagePort<
          DbWorkerInput,
          DbWorkerOutput
        >(nativeDbWorkerPort);

        dbWorkerPorts.add(dbWorkerPort);

        dbWorkerPort.onMessage = (message) => {
          switch (message.type) {
            case "LeaderAcquired": {
              leaderDbWorkerPort = dbWorkerPort;
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
              deps.postTabOutput(message);
              break;
            }
            default:
              exhaustiveCheck(message);
          }
        };
      },

      requestCreateSyncMessages: (ownerIds): void => {
        const ownersToSync = [...getUsedOwnersById(ownerIds).values()];

        if (!isNonEmptyArray(ownersToSync)) return;

        console.debug("requestCreateSyncMessages", {
          ownerIds: ownersToSync.map(({ id }) => id),
        });

        queue.push({
          type: "ForSharedWorker",
          message: {
            type: "CreateSyncMessages",
            owners: ownersToSync,
          },
        });

        ensureQueueProcessing();
      },

      requestApplySyncMessage: (ownerId, inputMessage): void => {
        const owner = getUsedOwnersById(new Set([ownerId])).get(ownerId);

        if (!owner) return;

        console.debug("requestApplySyncMessage", {
          ownerId,
          byteLength: inputMessage.byteLength,
        });

        queue.push({
          type: "ForSharedWorker",
          message: {
            type: "ApplySyncMessage",
            owner,
            inputMessage,
          },
        });

        ensureQueueProcessing();
      },

      [Symbol.asyncDispose]: () => disposables.disposeAsync(),
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
