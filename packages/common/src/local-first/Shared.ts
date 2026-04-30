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
import type { EncryptionKey } from "../Crypto.js";
import { exhaustiveCheck } from "../Function.js";
import { acquireLeaderLock, type LockManagerDep } from "../LockManager.js";
import { structuralLookup, type StructuralLookupKey } from "../Lookup.js";
import { createRefCountByKey, type RefCountByKey } from "../RefCount.js";
import {
  createSharedResourceByKey,
  createSharedResourceByKeyWithClaims,
  type BorrowedResource,
  type SharedResourceByKeyWithClaims,
} from "../Resource.js";
import { ok, type Result } from "../Result.js";
import type { NonEmptyReadonlySet } from "../Set.js";
import type { SqliteSchema } from "../Sqlite.js";
import { createStore, type Store } from "../Store.js";
import { AbortError, createMutex, type Mutex, type Task } from "../Task.js";
import { type Id, type Name, type Typed } from "../Type.js";
import type { Callback, ExtractType } from "../Types.js";
import type { CreateWebSocketDep, WebSocket } from "../WebSocket.js";
import type {
  SharedWorker as CommonSharedWorker,
  CreateBroadcastChannelDep,
  CreateMessageChannelDep,
  MessagePort,
  NativeMessagePort,
  SharedWorkerSelf,
  WorkerDeps,
} from "../Worker.js";
import type { DbWorkerInit } from "./Db.js";
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

export type SharedWorker = CommonSharedWorker<
  SharedWorkerInput,
  SharedWorkerOutput
>;

export interface SharedWorkerDep {
  readonly sharedWorker: SharedWorker;
}

export type SharedWorkerInput =
  | {
      readonly type: "AnnounceTabLeader";
      readonly consoleLevel: ConsoleLevel;
    }
  | {
      readonly type: "CreateEvolu";
      readonly name: Name;
      readonly id: EvoluInstanceId;
      readonly consoleLevel: ConsoleLevel;
      readonly sqliteSchema: SqliteSchema;
      readonly encryptionKey: EncryptionKey;
      readonly memoryOnly: boolean;
      readonly evoluPort: NativeMessagePort<EvoluOutput, EvoluInput>;
    };

export type SharedWorkerOutput = DbWorkerInit;

export type ConsoleEntryOrError =
  | {
      readonly type: "ConsoleEntry";
      readonly entry: ConsoleEntry;
    }
  | {
      readonly type: "Error";
      readonly error: EvoluError;
    };

export const consoleEntryOrErrorBroadcastChannelName =
  "evolu:console-entry-or-error";

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

export type DbWorkerInput =
  | (Typed<"Request"> & {
      readonly callbackId: Id;
      readonly request: DbWorkerRequest;
    })
  | Typed<"Dispose">;

export type DbWorkerRequest =
  | {
      readonly type: "ForEvolu";
      readonly id: EvoluInstanceId;
      readonly message: ExtractType<EvoluInput, "Mutate" | "Query" | "Export">;
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

export type DbWorkerOutput =
  | {
      readonly type: "LeaderAcquired";
      readonly name: Name;
    }
  | {
      readonly type: "OnQueuedResponse";
      readonly callbackId: Id;
      readonly response: DbWorkerQueuedResponse;
    };

export type DbWorkerQueuedResponse =
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

export type SharedWorkerDeps = WorkerDeps &
  CreateBroadcastChannelDep &
  CreateMessageChannelDep &
  CreateWebSocketDep &
  LockManagerDep;

interface EvoluTenant extends AsyncDisposable {
  readonly addInstance: (
    message: ExtractType<SharedWorkerInput, "CreateEvolu">,
    onDisposed: () => void,
  ) => void;

  readonly requestCreateSyncMessages: (ownerIds: ReadonlySet<OwnerId>) => void;

  readonly requestApplySyncMessage: (
    ownerId: OwnerId,
    inputMessage: Uint8Array,
  ) => void;
}

type EvoluTenantDeps = SharedWorkerDeps &
  PostConsoleEntryOrErrorDep &
  TabLeaderPortStoreDep &
  TransportsDep;

interface PostConsoleEntryOrErrorDep {
  readonly postConsoleEntryOrError: Callback<ConsoleEntryOrError>;
}

interface TabLeaderPortStoreDep {
  readonly tabLeaderPortStore: Store<TabLeaderPort | null>;
}

type TabLeaderPort = Pick<MessagePort<DbWorkerInit>, "postMessage">;

interface TransportsDep {
  readonly transports: SharedResourceByKeyWithClaims<
    OwnerTransport,
    OwnerId,
    WebSocket,
    SharedWorkerDeps
  >;
}

export type EvoluInstanceId = Id & Brand<"EvoluInstance">;

export type SyncState = 123;

export const initSharedWorker =
  (
    self: SharedWorkerSelf<SharedWorkerInput, SharedWorkerOutput>,
  ): Task<AsyncDisposableStack, never, SharedWorkerDeps> =>
  async (run) => {
    const { deps } = run;
    const console = deps.console.child("SharedWorker");

    await using disposer = new AsyncDisposableStack();

    const tabLeaderPortStore = disposer.use(
      createStore<TabLeaderPort | null>(null),
    );
    const consoleEntryOrErrorBroadcastChannel = disposer.use(
      deps.createBroadcastChannel<ConsoleEntryOrError>(
        consoleEntryOrErrorBroadcastChannelName,
      ),
    );
    const postConsoleEntryOrError = (output: ConsoleEntryOrError): void => {
      consoleEntryOrErrorBroadcastChannel.postMessage(output);
    };

    const sharedWorkerReady = Promise.withResolvers<void>();

    // Register ASAP so the worker does not miss connections.
    self.onConnect = (port) => {
      void sharedWorkerReady.promise.then(() => {
        // The underlying port buffers messages until onMessage is assigned.
        port.onMessage = (message) => {
          switch (message.type) {
            case "AnnounceTabLeader": {
              console.setLevel(message.consoleLevel);
              tabLeaderPortStore.set(port);
              console.info("tabLeaderAnnounced");
              break;
            }

            case "CreateEvolu": {
              void sharedWorkerRun(async (run) => {
                const tenant = await run.orThrow(
                  tenantsByName.acquire(message),
                );
                tenant.addInstance(
                  message,
                  () => void sharedWorkerRun(tenantsByName.release(message)),
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

    disposer.defer(
      deps.consoleStoreOutputEntry.subscribe(() => {
        const entry = deps.consoleStoreOutputEntry.get();
        if (entry) postConsoleEntryOrError({ type: "ConsoleEntry", entry });
      }),
    );

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
      postConsoleEntryOrError,
      tabLeaderPortStore,
      transports,
    });

    const tenantsByName = disposer.use(
      await sharedWorkerRun.orThrow(
        createSharedResourceByKey(createEvoluTenant, {
          lookup: (message) => message.name,
        }),
      ),
    );

    sharedWorkerReady.resolve();

    const forEachTenant = (
      callback: Callback<BorrowedResource<EvoluTenant>>,
    ): void => {
      for (const tenant of tenantsByName.snapshot().resourcesByKey.values()) {
        callback(tenant);
      }
    };

    return ok(disposer.move());
  };

const createEvoluTenant =
  ({
    name,
    consoleLevel,
    sqliteSchema,
    encryptionKey,
    memoryOnly,
  }: ExtractType<SharedWorkerInput, "CreateEvolu">): Task<
    EvoluTenant,
    never,
    EvoluTenantDeps
  > =>
  async (run) => {
    await using disposer = new AsyncDisposableStack();
    const tenantRun = disposer.use(run.create());

    const { deps } = run;
    const console = deps.console.child(name).child("SharedWorker");

    interface EvoluInstance extends AsyncDisposable {
      readonly id: EvoluInstanceId;
      readonly onDisposed: () => void;
      readonly port: MessagePort<EvoluOutput, EvoluInput>;
      readonly useOwnerMutex: Mutex;
      readonly usedSyncOwners: RefCountByKey<SyncOwner>;
      rowsByQuery: Map<Query, ReadonlyArray<Row>>;
    }

    const instancesById = disposer.adopt(
      new Map<EvoluInstanceId, EvoluInstance>(),
      async (instancesById) => {
        await using disposer = new AsyncDisposableStack();
        for (const instance of [...instancesById.values()]) {
          disposer.use(instance);
        }
      },
    );

    let dbWorkerPort = null as MessagePort<
      DbWorkerInput,
      DbWorkerOutput
    > | null;
    const dbWorkerInited = Promise.withResolvers<void>();

    const initDbWorker = (): void => {
      const tabLeaderPort = deps.tabLeaderPortStore.get();
      assert(tabLeaderPort, "Expected tab leader port.");

      const dbWorkerChannel = deps.createMessageChannel<
        DbWorkerOutput,
        DbWorkerInput
      >();
      const currentDbWorkerPort = dbWorkerChannel.port2;

      currentDbWorkerPort.onMessage = (message) => {
        switch (message.type) {
          case "LeaderAcquired": {
            assert(
              dbWorkerPort !== currentDbWorkerPort,
              "Expected a new DbWorker port.",
            );
            dbWorkerPort?.[Symbol.dispose]();
            dbWorkerPort = currentDbWorkerPort;
            queueRequestInFlight = false;
            console.info("leaderAcquired");
            dbWorkerInited.resolve();
            runQueue();
            break;
          }
          case "OnQueuedResponse": {
            callbacks.execute(message.callbackId, message);
            break;
          }
          default:
            exhaustiveCheck(message);
        }
      };

      tabLeaderPort.postMessage(
        {
          type: "DbWorkerInit",
          name,
          consoleLevel,
          sqliteSchema,
          encryptionKey,
          memoryOnly,
          port: dbWorkerChannel.port1.native,
        },
        [dbWorkerChannel.port1.native],
      );
    };

    const queue: Array<DbWorkerRequest> = [];
    const callbacks = disposer.use(
      createCallbacks<ExtractType<DbWorkerOutput, "OnQueuedResponse">>(
        run.deps,
      ),
    );
    let queueRequestInFlight = false;

    const runQueue = (): void => {
      if (queueRequestInFlight || !isNonEmptyArray(queue) || !dbWorkerPort) {
        return;
      }

      const request = firstInArray(queue);

      const callbackId = callbacks.register(({ response }) => {
        switch (response.type) {
          case "ForEvolu": {
            handleResponseForEvolu(response, request);
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
        queueRequestInFlight = false;
        runQueue();
      });

      queueRequestInFlight = true;
      dbWorkerPort.postMessage({ type: "Request", callbackId, request });
    };

    disposer.defer(async () => {
      dbWorkerPort?.postMessage({ type: "Dispose" });
      dbWorkerPort = null;
      queueRequestInFlight = false;

      await using _ = await tenantRun.orThrow(acquireLeaderLock(name));
    });

    disposer.defer(deps.tabLeaderPortStore.subscribe(initDbWorker));

    initDbWorker();
    await dbWorkerInited.promise;
    const disposables = disposer.move();

    const handleResponseForEvolu = (
      response: ExtractType<DbWorkerQueuedResponse, "ForEvolu">,
      first: DbWorkerRequest,
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
      response: ExtractType<DbWorkerQueuedResponse, "ForSharedWorker">,
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
              deps.postConsoleEntryOrError({
                type: "Error",
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

    const toggleSyncOwner =
      (
        instance: EvoluInstance,
        syncOwner: SyncOwner,
        action: "add" | "remove",
      ): Task<void, never, EvoluTenantDeps> =>
      async (run) => {
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
      };

    return ok({
      addInstance: (message, onDisposed) => {
        assertNotDisposed(disposables);

        const instance: EvoluInstance = {
          id: message.id,
          port: deps.createMessagePort<EvoluOutput, EvoluInput>(
            message.evoluPort,
          ),
          onDisposed,
          rowsByQuery: new Map<Query, ReadonlyArray<Row>>(),
          useOwnerMutex: createMutex(),
          usedSyncOwners: createRefCountByKey<SyncOwner, OwnerId>({
            lookup: (syncOwner) => syncOwner.owner.id,
          }),
          [Symbol.asyncDispose]: () => disposer.disposeAsync(),
        };

        instancesById.set(instance.id, instance);

        const disposer = new AsyncDisposableStack();

        disposer.defer(instance.onDisposed);
        disposer.use(instance.usedSyncOwners);
        disposer.use(instance.useOwnerMutex);

        disposer.defer(async () => {
          await tenantRun(
            instance.useOwnerMutex.withLock(async (run) => {
              for (const syncOwner of instance.usedSyncOwners.keys()) {
                while (instance.usedSyncOwners.has(syncOwner)) {
                  await run(toggleSyncOwner(instance, syncOwner, "remove"));
                }
              }
              return ok();
            }),
          );
        });

        disposer.defer(() => {
          instancesById.delete(instance.id);
          console.info("evoluDispose", { name, id: instance.id });
        });
        disposer.use(instance.port);

        void tenantRun(acquireLeaderLock(message.id)).then((result) => {
          if (!result.ok) return;
          const lock = result.value;

          if (disposer.disposed) {
            return lock[Symbol.asyncDispose]();
          }

          disposer.use(lock);
          return disposer.disposeAsync();
        });

        instance.port.onMessage = (message) => {
          switch (message.type) {
            case "Query":
            case "Export": {
              queue.push({ type: "ForEvolu", id: instance.id, message });
              runQueue();
              break;
            }
            case "Mutate": {
              // TODO: Delegate do vsech evolu instances, co to pouzivaji
              queue.push({ type: "ForEvolu", id: instance.id, message });
              runQueue();
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

        runQueue();
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

        runQueue();
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

// TODO: Remaining SharedWorker lifetime issues.
// - Investigate heartbeat for ports and where liveness tracking is needed.
// - Sync state for monitoring.
// - Propagate invalid protocol messages to sync state.
// - Make DbWorker logically stateless by making all requests idempotent.
// - Investigate WebKit bug 301520 relevance to DbWorker disposal. (again)
//   https://bugs.webkit.org/show_bug.cgi?id=301520
