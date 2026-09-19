/**
 * Platform-agnostic Evolu SharedWorker.
 *
 * ## Synchronization routing
 *
 * WebSocket transports are shared resources keyed by their configuration and
 * claimed by owner ID, so every tenant (one named local database) using an
 * owner shares that owner's sockets, whichever tenant claimed them. An incoming
 * frame is offered to every tenant with a writable registration for its owner,
 * and each tenant reconciles independently: the protocol exchange is stateless
 * per message and message writes are idempotent, so a response that answered
 * another tenant's request is still a valid reconciliation step.
 *
 * Every queued sync request carries a `SyncTarget`. A continuation returns only
 * to the transport that produced the response. A round started by a socket
 * opening, by a transport's first claim for an owner, or by a tenant's first
 * use of a transport other tenants already claimed targets that transport. A
 * tenant's first writable owner registration also reconciles its existing
 * history through every transport already claimed for that owner. Explicit
 * synchronization requests and mutation uploads go to every open transport
 * claimed for the owner.
 *
 * Relays omit the sending socket when broadcasting uploads. Mutation uploads
 * and continuation uploads therefore also deliver local Broadcast frames to
 * every other tenant with writable access to the owner, even while sockets are
 * closed. Large mutation batches use as many frames as needed. These copies
 * target AllTransports so their recipients refresh queries without scheduling
 * relay propagation; the uploading tenant already owns that work.
 *
 * Local delivery forwards uploads—including historical messages sent during
 * reconciliation—to other tenants with writable access to the owner. It does
 * not initiate reconciliation between local database histories. Automatic
 * sibling catch-up is deferred until replication scopes and retention semantics
 * are defined.
 *
 * When a relay frame stores new owner messages, the tenant requests a full
 * round through each other transport claimed for the owner, by any tenant, so
 * data learned from one relay reaches the others. Duplicate receipts store
 * nothing and request nothing. A replacement leader may have stored messages
 * whose response was lost, so it reconciles every transport again. A later
 * request is absorbed by a queued round with the same owners, a covering
 * target, and a position after all writes already queued. Propagation requests
 * can reuse a queued round with the same owners and a covering target
 * regardless of later queued writes because their messages are already stored.
 * A closed transport reconciles when it opens.
 *
 * @module
 */

import {
  emptyArray,
  firstInArray,
  isNonEmptyArray,
  type NonEmptyReadonlyArray,
} from "../Array.ts";
import {
  assertNonNullable,
  assertNotSame,
  assertNotUndefined,
  assertSame,
} from "../Assert.ts";
import type { Brand } from "../Brand.ts";
import type { ConsoleEntry, ConsoleLevel } from "../Console.ts";
import type { EncryptionKey } from "../Crypto.ts";
import { disposable, exhaustiveCheck } from "../Function.ts";
import { acquireLeaderLock, type LockManagerDep } from "../LockManager.ts";
import {
  createLookupMap,
  structuralLookup,
  type LookupMap,
  type StructuralLookupKey,
} from "../Lookup.ts";
import {
  createSharedResourceByKey,
  createSharedResourceByKeyWithClaims,
  type BorrowedResource,
  type ClaimLease,
  type SharedResourceByKeyWithClaims,
} from "../Resource.ts";
import { ok, type Result } from "../Result.ts";
import type { NonEmptyReadonlySet } from "../Set.ts";
import type { SqliteSchema } from "../Sqlite.ts";
import { createStore, type Store } from "../Store.ts";
import {
  AbortError,
  createMutex,
  unabortable,
  type Mutex,
  type Task,
} from "../Task.ts";
import type { Millis } from "../Time.ts";
import {
  createId,
  type ExtractTyped,
  type Id,
  type Name,
  type Typed,
} from "../Type.ts";
import type { Callback } from "../Types.ts";
import type { CreateWebSocketDep, WebSocket } from "../WebSocket.ts";
import type {
  SharedWorker as CommonSharedWorker,
  CreateBroadcastChannelDep,
  CreateMessageChannelDep,
  MessagePort,
  NativeMessagePort,
  SharedWorkerSelf,
  WorkerDeps,
} from "../Worker.ts";
import type { DbWorkerInit, UnsupportedDbVersionError } from "./Db.ts";
import type { EvoluError } from "./Evolu.ts";
import type { Owner, OwnerId, OwnerTransport, SyncOwner } from "./Owner.ts";
import {
  createProtocolBroadcastMessagesFromCrdtMessages,
  createProtocolMessageForUnsubscribe,
  createProtocolMessageFromCrdtMessages,
  parseProtocolHeader,
  type ApplyProtocolMessageAsClientResult,
  type ProtocolError,
  type ProtocolMessage,
} from "./Protocol.ts";
import {
  makePatches,
  type Patch,
  type Query,
  type Row,
  type RowsByQueryMap,
} from "./Query.ts";
import type { MutationChange } from "./Schema.ts";
import type { CrdtMessage } from "./Storage.ts";
import { orderTimestamp, type Timestamp } from "./Timestamp.ts";

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

export type SharedWorkerOutput =
  | DbWorkerInit
  | {
      /** Sent to one tab only: its database refused startup. */
      readonly type: "Error";
      readonly error: UnsupportedDbVersionError;
    };

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
      readonly actions: ReadonlyArray<
        | {
            readonly owner: SyncOwner;
            readonly action: "add" | "remove";
          }
        | {
            readonly ownerId: OwnerId;
            readonly action: "sync";
          }
      >;
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
  | (Typed<"Request"> & { readonly attemptId: Id } & (
        | {
            readonly request: DbWorkerWriteRequest;
            readonly clock: Timestamp;
            readonly now: Millis;
          }
        | { readonly request: DbWorkerReadRequest }
      ))
  | Typed<"Dispose">;

export type DbWorkerRequest = DbWorkerWriteRequest | DbWorkerReadRequest;

export type DbWorkerWriteRequest =
  | {
      readonly type: "ForEvolu";
      readonly id: EvoluInstanceId;
      readonly message: ExtractTyped<EvoluInput, "Mutate">;
    }
  | {
      readonly type: "ForSharedWorker";
      readonly message: {
        readonly type: "ApplySyncMessage";
        readonly owner: Owner;
        readonly inputMessage: Uint8Array;
      };
    };

export type DbWorkerReadRequest =
  | {
      readonly type: "ForEvolu";
      readonly id: EvoluInstanceId;
      readonly message: ExtractTyped<EvoluInput, "Query" | "Export">;
    }
  | {
      readonly type: "ForSharedWorker";
      readonly message: {
        readonly type: "CreateSyncMessages";
        readonly owners: NonEmptyReadonlyArray<Owner>;
      };
    };

export type DbWorkerOutput =
  | {
      readonly type: "LeaderAcquired";
      readonly name: Name;
      readonly clock: Timestamp;
    }
  | {
      /** Startup was refused; the worker is releasing its resources. */
      readonly type: "LeaderRefused";
      readonly name: Name;
      readonly error: UnsupportedDbVersionError;
    }
  | {
      readonly type: "OnQueuedResponse";
      readonly attemptId: Id;
      readonly response: DbWorkerQueuedResponse;
    };

export type DbWorkerQueuedResponse =
  | {
      readonly type: "ForEvolu";
      readonly id: EvoluInstanceId;
      readonly message:
        | {
            readonly type: "Mutate";
            readonly clock: Timestamp;
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
            readonly clock: Timestamp;
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

/**
 * Coordinates all instances of one named local database within a SharedWorker.
 * Manages their DbWorker request queue and owner registrations.
 */
interface EvoluTenant extends AsyncDisposable {
  readonly addInstance: (
    message: ExtractTyped<SharedWorkerInput, "CreateEvolu">,
    tabPort: TabPort,
    onDisposed: () => void,
  ) => void;

  readonly requestCreateSyncMessages: (
    ownerIds: ReadonlySet<OwnerId>,
    target: SyncTarget,
  ) => void;

  readonly requestApplySyncMessage: (
    ownerId: OwnerId,
    inputMessage: Uint8Array,
    target: SyncTarget,
  ) => void;
}

/** Where the protocol messages produced by a queued sync request are sent. */
type SyncTarget =
  | { readonly type: "AllTransports" }
  | {
      /** One transport, identified by its structural lookup key. */
      readonly type: "Transport";
      readonly key: StructuralLookupKey;
    };

const allTransports: SyncTarget = { type: "AllTransports" };

const isTargetTransport = (
  target: SyncTarget,
  transport: OwnerTransport,
): boolean =>
  target.type === "AllTransports" || target.key === structuralLookup(transport);

type EvoluTenantDeps = SharedWorkerDeps &
  PostConsoleEntryOrErrorDep &
  TabLeaderPortStoreDep &
  TransportsDep;

interface PostConsoleEntryOrErrorDep {
  readonly postConsoleEntryOrError: Callback<ConsoleEntryOrError>;
}

interface TabLeaderPortStoreDep {
  readonly tabLeaderPortStore: Store<TabPort | null>;
}

/** A tab's SharedWorker connection, as seen from the SharedWorker. */
type TabPort = Pick<MessagePort<SharedWorkerOutput>, "postMessage">;

interface TransportsDep {
  readonly transports: SharedResourceByKeyWithClaims<
    OwnerTransport,
    OwnerId,
    WebSocket
  >;
}

export type EvoluInstanceId = Id & Brand<"EvoluInstance">;

export type SyncState = 123;

/** Initializes the platform-agnostic Evolu SharedWorker. */
export const initSharedWorker =
  (
    self: SharedWorkerSelf<SharedWorkerInput, SharedWorkerOutput>,
  ): Task<AsyncDisposableStack, never, SharedWorkerDeps> =>
  async (run) => {
    const { deps } = run;
    const console = deps.console.child("SharedWorker");

    await using disposer = new AsyncDisposableStack();

    const tabLeaderPortStore = disposer.use(createStore<TabPort | null>(null));
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
                const tenantLease = await run.ok(
                  unabortable(tenantsByName.acquire(message)),
                );
                tenantLease.resource.addInstance(message, port, () => {
                  tenantLease.release();
                });
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

    const currentTenantsByName = new Map<Name, BorrowedResource<EvoluTenant>>();
    const transports = disposer.use(
      await run.ok(
        createSharedResourceByKeyWithClaims<
          OwnerTransport,
          OwnerId,
          WebSocket,
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

                const target: SyncTarget = {
                  type: "Transport",
                  key: structuralLookup(transport),
                };
                forEachTenant((tenant) => {
                  tenant.requestCreateSyncMessages(ownerIds, target);
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
                    { type: "Transport", key: structuralLookup(transport) },
                  );
                });
              },
            }),
          {
            onFirstClaimAdded: (ownerId, webSocket, transport) => {
              if (!webSocket.isOpen()) return;
              const target: SyncTarget = {
                type: "Transport",
                key: structuralLookup(transport),
              };
              forEachTenant((tenant) => {
                tenant.requestCreateSyncMessages(new Set([ownerId]), target);
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

    const sharedWorkerRun = run.create({
      ...deps,
      postConsoleEntryOrError,
      tabLeaderPortStore,
      transports,
    });

    const tenantsByName = disposer.use(
      await sharedWorkerRun.ok(
        createSharedResourceByKey(
          (message: ExtractTyped<SharedWorkerInput, "CreateEvolu">) =>
            createEvoluTenant(message, currentTenantsByName),
          {
            idleDisposeAfter: "3s",
            lookup: (message) => message.name,
          },
        ),
      ),
    );

    sharedWorkerReady.resolve();

    const forEachTenant = (
      callback: Callback<BorrowedResource<EvoluTenant>>,
    ): void => {
      for (const tenant of currentTenantsByName.values()) callback(tenant);
    };

    return ok(disposer.move());
  };

const createEvoluTenant =
  (
    {
      name,
      consoleLevel,
      sqliteSchema,
      encryptionKey,
      memoryOnly,
    }: ExtractTyped<SharedWorkerInput, "CreateEvolu">,
    currentTenantsByName: Map<Name, BorrowedResource<EvoluTenant>>,
  ): Task<EvoluTenant, never, EvoluTenantDeps> =>
  async (run) => {
    await using disposer = new AsyncDisposableStack();
    const tenantRun = disposer.use(run.create());

    const { deps } = run;
    const console = deps.console.child(name).child("SharedWorker");

    interface EvoluInstance extends AsyncDisposable {
      readonly id: EvoluInstanceId;
      /** A null lease reserves a registration while its transports are acquired. */
      readonly ownerRegistrations: LookupMap<
        SyncOwner,
        Array<ClaimLease | null>
      >;
      readonly onDisposed: () => void;
      readonly port: MessagePort<EvoluOutput, EvoluInput>;
      readonly tabPort: TabPort;
      readonly useOwnerMutex: Mutex;
      rowsByQuery: Map<Query, ReadonlyArray<Row>>;
    }

    const instancesById = disposer.adopt(
      new Map<EvoluInstanceId, EvoluInstance>(),
      async (instancesById) => {
        await using disposer = new AsyncDisposableStack();
        for (const instance of instancesById.values()) {
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
      if (startupError) return;
      const tabLeaderPort = deps.tabLeaderPortStore.get();
      assertNonNullable(tabLeaderPort);

      const dbWorkerChannel = deps.createMessageChannel<
        DbWorkerOutput,
        DbWorkerInput
      >();
      const currentDbWorkerPort = dbWorkerChannel.port2;

      currentDbWorkerPort.onMessage = (message) => {
        switch (message.type) {
          case "LeaderAcquired": {
            assertNotSame(dbWorkerPort, currentDbWorkerPort);
            if (startupError) {
              // This worker was requested before the refusal. The tenant
              // stays unavailable, so let it release the database lock.
              currentDbWorkerPort.postMessage({ type: "Dispose" });
              currentDbWorkerPort[Symbol.dispose]();
              break;
            }
            const replacesLeader = dbWorkerPort !== null;
            dbWorkerPort?.[Symbol.dispose]();
            dbWorkerPort = currentDbWorkerPort;
            activeDispatch = null;
            // A replacement may advance the clock by releasing quarantine, or
            // start behind it with an empty memoryOnly database. Keep the
            // greater clock; pending writes retain their captured inputs.
            if (
              sessionClock === null ||
              orderTimestamp(sessionClock, message.clock) === -1
            ) {
              sessionClock = message.clock;
            }
            // A replacement leader may have committed writes whose responses
            // were lost, and may have released quarantine at startup. A lost
            // response may also have reported stored owner messages, so the
            // owners reconcile through every transport again.
            if (replacesLeader) {
              refreshQueries();
              const usedOwnerIds = new Set<OwnerId>();
              for (const instance of instancesById.values()) {
                for (const { owner } of instance.ownerRegistrations.keys()) {
                  usedOwnerIds.add(owner.id);
                }
              }
              requestCreateSyncMessages(usedOwnerIds, allTransports);
            }
            console.info("leaderAcquired");
            dbWorkerInited.resolve();
            runQueue();
            break;
          }
          case "LeaderRefused": {
            assertNotSame(dbWorkerPort, currentDbWorkerPort);
            // The worker refused startup and is releasing its resources.
            // Requests stay unanswered until their instances are disposed.
            // Keep the tenant unavailable, tell each connected tab once, and
            // tell tabs that connect later without starting another worker.
            dbWorkerPort?.[Symbol.dispose]();
            dbWorkerPort = null;
            currentDbWorkerPort[Symbol.dispose]();
            activeDispatch = null;
            queue.length = 0;
            startupError = message.error;
            console.info("leaderRefused", message.error);
            for (const instance of instancesById.values()) {
              reportRefusal(instance.tabPort, message.error);
            }
            dbWorkerInited.resolve();
            break;
          }
          case "OnQueuedResponse": {
            if (activeDispatch?.attemptId !== message.attemptId) return;
            const { entry } = activeDispatch;
            const { response } = message;
            if (
              response.message.type === "Mutate" ||
              response.message.type === "ApplySyncMessage"
            ) {
              // Replays report their computed clock, which a replacement
              // leader may have passed at startup. Keep the greater clock.
              assertNonNullable(sessionClock);
              if (orderTimestamp(sessionClock, response.message.clock) === -1) {
                sessionClock = response.message.clock;
              }
            }
            switch (entry.type) {
              case "Read":
              case "Write":
                assertSame(response.type, "ForEvolu");
                handleResponseForEvolu(response, entry.request);
                break;
              case "CreateSyncMessages":
              case "ApplySyncMessage":
                assertSame(response.type, "ForSharedWorker");
                handleResponseForSharedWorker(response, entry.target);
                break;
              default:
                exhaustiveCheck(entry);
            }
            queue.shift();
            activeDispatch = null;
            runQueue();
            break;
          }
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

    const refreshQueries = (exceptInstanceId?: EvoluInstanceId): void => {
      for (const [id, instance] of instancesById) {
        if (id === exceptInstanceId) continue;
        instance.port.postMessage({ type: "RefreshQueries" });
      }
    };

    // A ForSharedWorker request keeps its target on the entry: the DbWorker
    // does not need it, and a replacement leader replays the same entry.
    type QueueEntry =
      | {
          readonly type: "Read";
          readonly request: ExtractTyped<DbWorkerReadRequest, "ForEvolu">;
        }
      | {
          readonly type: "Write";
          readonly request: ExtractTyped<DbWorkerWriteRequest, "ForEvolu">;
          now?: Millis;
          clock?: Timestamp;
        }
      | {
          readonly type: "CreateSyncMessages";
          readonly request: ExtractTyped<
            DbWorkerReadRequest,
            "ForSharedWorker"
          >;
          readonly target: SyncTarget;
        }
      | {
          readonly type: "ApplySyncMessage";
          readonly request: ExtractTyped<
            DbWorkerWriteRequest,
            "ForSharedWorker"
          >;
          readonly target: SyncTarget;
          now?: Millis;
          clock?: Timestamp;
        };
    const queue: Array<QueueEntry> = [];
    let sessionClock: Timestamp | null = null;
    let startupError: UnsupportedDbVersionError | null = null;
    // Each tab is told once during this tenant's lifetime, through its own
    // connection. Recreating the tenant after idle disposal retries startup
    // and may report the refusal again.
    const refusedTabPorts = new WeakSet<TabPort>();
    const reportRefusal = (
      tabPort: TabPort,
      error: UnsupportedDbVersionError,
    ): void => {
      if (refusedTabPorts.has(tabPort)) return;
      refusedTabPorts.add(tabPort);
      tabPort.postMessage({ type: "Error", error });
    };
    let activeDispatch: {
      readonly entry: QueueEntry;
      readonly attemptId: Id;
    } | null = null;

    const runQueue = (): void => {
      if (activeDispatch || !isNonEmptyArray(queue) || !dbWorkerPort) return;
      assertNonNullable(sessionClock);
      const entry = firstInArray(queue);
      const attemptId = createId(run.deps);
      activeDispatch = { entry, attemptId };
      if (entry.type === "Write" || entry.type === "ApplySyncMessage") {
        // A write captures its inputs on first dispatch, so a retry after
        // leader replacement reproduces the same timestamps.
        entry.now ??= run.deps.time.now();
        entry.clock ??= sessionClock;
        dbWorkerPort.postMessage({
          type: "Request",
          attemptId,
          request: entry.request,
          clock: entry.clock,
          now: entry.now,
        });
      } else {
        dbWorkerPort.postMessage({
          type: "Request",
          attemptId,
          request: entry.request,
        });
      }
    };

    disposer.defer(async () => {
      dbWorkerPort?.postMessage({ type: "Dispose" });
      dbWorkerPort = null;
      activeDispatch = null;

      // The DbWorker holds this tenant leader lock while it is alive. Tenant
      // disposal sends Dispose, then acquires the same lock to wait until the
      // DbWorker releases it: either because Dispose was delivered or because
      // the hosting tab closed. The wait is unabortable because tenant disposal
      // must finish even after tenantRun receives an abort request.
      await using _ = await tenantRun.ok(acquireLeaderLock(name));
    });

    disposer.defer(deps.tabLeaderPortStore.subscribe(initDbWorker));

    initDbWorker();
    await dbWorkerInited.promise;

    const handleResponseForEvolu = (
      response: ExtractTyped<DbWorkerQueuedResponse, "ForEvolu">,
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
            refreshQueries(response.id);

            const protocolMessagesByOwnerId = new Map<
              OwnerId,
              ProtocolMessage
            >();

            for (const syncOwner of instance.ownerRegistrations.keys()) {
              const { owner } = syncOwner;
              const messages = response.message.messagesByOwnerId.get(owner.id);

              // Skip owners this instance does not currently sync for
              // writing. Read-only owners cannot produce protocol
              // messages because they do not have a write key.
              if (
                !messages ||
                !("writeKey" in owner) ||
                protocolMessagesByOwnerId.has(owner.id)
              )
                continue;

              protocolMessagesByOwnerId.set(
                owner.id,
                createProtocolMessageFromCrdtMessages(run.deps)(
                  owner,
                  messages,
                ),
              );
              if (currentTenantsByName.size > 1) {
                broadcastProtocolMessages(
                  owner.id,
                  createProtocolBroadcastMessagesFromCrdtMessages(run.deps)(
                    owner,
                    messages,
                  ),
                );
              }
            }

            sendProtocolMessagesByOwnerId(
              protocolMessagesByOwnerId,
              allTransports,
            );
          }
          break;
        }

        case "Export":
          instance.port.postMessage(
            { type: "OnExport", file: response.message.file },
            [response.message.file.buffer],
          );
          break;
      }
    };

    const handleResponseForSharedWorker = (
      response: ExtractTyped<DbWorkerQueuedResponse, "ForSharedWorker">,
      target: SyncTarget,
    ): void => {
      switch (response.message.type) {
        case "CreateSyncMessages":
          sendProtocolMessagesByOwnerId(
            response.message.protocolMessagesByOwnerId,
            target,
          );
          break;

        case "ApplySyncMessage":
          if (response.message.didWriteMessages) {
            refreshQueries();
            // Reconcile newly stored messages through each other transport.
            // Rounds toward the same transport coalesce whatever their source.
            const { ownerId } = response.message;
            const keys: Array<StructuralLookupKey> = [];
            deps.transports.forEachResourceForClaim(ownerId, (_, transport) => {
              if (isTargetTransport(target, transport)) return;
              keys.push(structuralLookup(transport));
            });
            for (const key of keys) {
              requestCreateSyncMessages(
                new Set([ownerId]),
                { type: "Transport", key },
                { afterQueuedWrites: false },
              );
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
                if (response.message.result.value.broadcast) {
                  broadcastProtocolMessages(response.message.ownerId, [
                    response.message.result.value.broadcast,
                  ]);
                }
                sendProtocolMessagesByOwnerId(
                  new Map([
                    [
                      response.message.ownerId,
                      response.message.result.value.message,
                    ],
                  ]),
                  target,
                );
                break;

              case "Broadcast":
              case "NoResponse":
                break;
            }
          }
          break;
      }
    };

    const broadcastProtocolMessages = (
      ownerId: OwnerId,
      messages: ReadonlyArray<ProtocolMessage>,
    ): void => {
      for (const [tenantName, tenant] of currentTenantsByName) {
        if (tenantName === name) continue;
        for (const message of messages)
          tenant.requestApplySyncMessage(ownerId, message, allTransports);
      }
    };

    const sendProtocolMessagesByOwnerId = (
      protocolMessagesByOwnerId: ReadonlyMap<OwnerId, ProtocolMessage>,
      target: SyncTarget,
    ): void => {
      for (const [ownerId, protocolMessage] of protocolMessagesByOwnerId) {
        deps.transports.forEachResourceForClaim(
          ownerId,
          (webSocket, transport) => {
            if (!isTargetTransport(target, transport) || !webSocket.isOpen())
              return;

            console.debug("sendProtocolMessage", {
              ownerId,
              url: transport.url,
              byteLength: protocolMessage.byteLength,
            });

            webSocket.send(protocolMessage);
          },
        );
      }
    };

    const getUsedOwnersById = (
      ownerIds: ReadonlySet<OwnerId>,
    ): ReadonlyMap<OwnerId, Owner> => {
      const ownersById = new Map<OwnerId, Owner>();
      for (const instance of instancesById.values()) {
        for (const { owner } of instance.ownerRegistrations.keys()) {
          if (!ownerIds.has(owner.id) || !("writeKey" in owner)) continue;
          ownersById.set(owner.id, owner);
        }
      }
      return ownersById;
    };

    const requestCreateSyncMessages = (
      ownerIds: ReadonlySet<OwnerId>,
      target: SyncTarget,
      {
        afterQueuedWrites = true,
      }: {
        /** Whether the round must read the writes queued when it is requested. */
        afterQueuedWrites?: boolean;
      } = {},
    ): void => {
      if (startupError) return;
      const ownersToSync = [...getUsedOwnersById(ownerIds).values()].filter(
        ({ id }) => {
          let hasOpenTransport = false;
          deps.transports.forEachResourceForClaim(
            id,
            (webSocket, transport) => {
              if (isTargetTransport(target, transport) && webSocket.isOpen())
                hasOpenTransport = true;
            },
          );
          return hasOpenTransport;
        },
      );

      if (!isNonEmptyArray(ownersToSync)) return;

      // A queued round reads the database when it is dispatched, so it covers
      // this request unless the request must also read writes queued behind
      // that round. A dispatched round covers neither.
      const ownerIdsToSync = new Set(ownersToSync.map(({ id }) => id));
      const lastWriteIndex = afterQueuedWrites
        ? queue.findLastIndex(
            ({ type }) => type === "Write" || type === "ApplySyncMessage",
          )
        : -1;
      const isQueued = queue.some(
        (entry, index) =>
          index > lastWriteIndex &&
          entry !== activeDispatch?.entry &&
          entry.type === "CreateSyncMessages" &&
          (entry.target.type === "AllTransports" ||
            (target.type === "Transport" && entry.target.key === target.key)) &&
          entry.request.message.owners.length === ownerIdsToSync.size &&
          entry.request.message.owners.every(({ id }) =>
            ownerIdsToSync.has(id),
          ),
      );

      console.debug("requestCreateSyncMessages", {
        ownerIds: [...ownerIdsToSync],
        target,
        isQueued,
      });

      if (isQueued) return;

      queue.push({
        type: "CreateSyncMessages",
        request: {
          type: "ForSharedWorker",
          message: { type: "CreateSyncMessages", owners: ownersToSync },
        },
        target,
      });

      runQueue();
    };

    const toggleSyncOwner =
      (
        instance: EvoluInstance,
        syncOwner: SyncOwner,
        action: "add" | "remove",
      ): Task<void, never, EvoluTenantDeps> =>
      async (run) => {
        if (action === "add") {
          const ownerId = syncOwner.owner.id;
          const isFirstWritableUse =
            "writeKey" in syncOwner.owner &&
            !getUsedOwnersById(new Set([ownerId])).has(ownerId);
          // A transport first claimed for the owner starts every tenant's
          // round through onFirstClaimAdded. A joining tenant also reconciles
          // its existing history through the owner's already claimed transports.
          // Later registrations reconcile only transports newly used here:
          // earlier rounds may predate writes from an unregistered instance.
          const claimedKeys = new Set(
            [...deps.transports.getResourceKeysForClaim(ownerId)].map(
              structuralLookup,
            ),
          );
          const usedKeys = new Set<StructuralLookupKey>();
          for (const { ownerRegistrations } of instancesById.values()) {
            for (const [usedSyncOwner, leases] of ownerRegistrations) {
              if (usedSyncOwner.owner.id !== ownerId) continue;
              if (!leases.some((lease) => lease !== null)) continue;
              for (const transport of usedSyncOwner.transports) {
                usedKeys.add(structuralLookup(transport));
              }
            }
          }
          const leases = instance.ownerRegistrations.getOrInsertComputed(
            syncOwner,
            () => [],
          );
          // First-claim callbacks must see the owner before acquisition finishes.
          const index = leases.push(null) - 1;
          try {
            leases[index] = await run.ok(
              deps.transports.claim(ownerId, syncOwner.transports),
            );
          } finally {
            if (leases[index] === null) {
              leases.splice(index, 1);
              if (leases.length === 0)
                instance.ownerRegistrations.delete(syncOwner);
            }
          }
          const keysToSync = isFirstWritableUse
            ? claimedKeys
            : syncOwner.transports
                .map(structuralLookup)
                .filter((key) => claimedKeys.has(key) && !usedKeys.has(key));
          for (const key of keysToSync) {
            requestCreateSyncMessages(new Set([ownerId]), {
              type: "Transport",
              key,
            });
          }
        } else {
          const claimLeases = instance.ownerRegistrations.get(syncOwner);
          assertNotUndefined(claimLeases);
          const claimLease = claimLeases.pop();
          assertNonNullable(claimLease);
          claimLease.release();
          if (claimLeases.length === 0) {
            instance.ownerRegistrations.delete(syncOwner);
          }
        }
        return ok();
      };

    disposer.defer(() => {
      currentTenantsByName.delete(name);
    });
    const tenant = disposable<EvoluTenant>(
      {
        addInstance: (message, tabPort, onDisposed) => {
          const disposer = new AsyncDisposableStack();
          const instance: EvoluInstance = {
            id: message.id,
            ownerRegistrations: createLookupMap({
              lookup: (syncOwner: SyncOwner) =>
                structuralLookup<{
                  readonly owner: SyncOwner["owner"];
                  readonly transports: ReadonlyArray<StructuralLookupKey>;
                }>({
                  owner: syncOwner.owner,
                  transports: syncOwner.transports
                    .map(structuralLookup)
                    .toSorted(),
                }),
            }),
            port: deps.createMessagePort<EvoluOutput, EvoluInput>(
              message.evoluPort,
            ),
            tabPort,
            onDisposed,
            rowsByQuery: new Map<Query, ReadonlyArray<Row>>(),
            useOwnerMutex: createMutex(),
            [Symbol.asyncDispose]: () => disposer.disposeAsync(),
          };

          instancesById.set(instance.id, instance);

          disposer.defer(instance.onDisposed);

          disposer.defer(async () => {
            await tenantRun(
              instance.useOwnerMutex.withLock(() => {
                for (const leases of instance.ownerRegistrations.values()) {
                  for (const lease of leases) lease?.release();
                }
                instance.ownerRegistrations.clear();
                return ok();
              }),
            );
          });

          disposer.defer(() => {
            instancesById.delete(instance.id);
            console.info("evoluDispose", { name, id: instance.id });
          });
          disposer.use(instance.port);
          disposer.defer(() => {
            instance.port.onMessage = null;
          });

          // The main-thread Evolu instance holds this per-instance leader lock
          // while it is alive. Acquiring the same lock here means the main
          // thread instance was disposed or its tab closed, so the tenant-side
          // instance must dispose itself.
          void tenantRun
            .abortable(acquireLeaderLock(message.id))
            .then((lock) => {
              if (!lock.ok) return;

              disposer.use(lock.value);
              return instance[Symbol.asyncDispose]();
            });

          instance.port.onMessage = (message) => {
            if (startupError) return;
            switch (message.type) {
              case "Query":
              case "Export": {
                queue.push({
                  type: "Read",
                  request: { type: "ForEvolu", id: instance.id, message },
                });
                runQueue();
                break;
              }
              case "Mutate": {
                queue.push({
                  type: "Write",
                  request: { type: "ForEvolu", id: instance.id, message },
                });
                runQueue();
                break;
              }
              case "UseOwner": {
                void tenantRun(
                  instance.useOwnerMutex.withLock(async (run) => {
                    for (const action of message.actions) {
                      switch (action.action) {
                        case "sync":
                          console.debug("requestSync", {
                            id: instance.id,
                            ownerId: action.ownerId,
                          });
                          requestCreateSyncMessages(
                            new Set([action.ownerId]),
                            allTransports,
                          );
                          break;
                        case "add":
                        case "remove":
                          console.debug("useOwner", {
                            id: instance.id,
                            action: action.action,
                            ownerId: action.owner.owner.id,
                            transportUrls: action.owner.transports.map(
                              ({ url }) => url,
                            ),
                          });
                          await run(
                            toggleSyncOwner(
                              instance,
                              action.owner,
                              action.action,
                            ),
                          );
                          break;
                        default:
                          exhaustiveCheck(action);
                      }
                    }

                    return ok();
                  }),
                );
                break;
              }
            }
          };

          if (startupError) reportRefusal(instance.tabPort, startupError);
        },

        requestCreateSyncMessages,

        requestApplySyncMessage: (ownerId, inputMessage, target): void => {
          if (startupError) return;
          const owner = getUsedOwnersById(new Set([ownerId])).get(ownerId);
          if (!owner) return;

          console.debug("requestApplySyncMessage", {
            ownerId,
            target,
            byteLength: inputMessage.byteLength,
          });

          queue.push({
            type: "ApplySyncMessage",
            request: {
              type: "ForSharedWorker",
              message: { type: "ApplySyncMessage", owner, inputMessage },
            },
            target,
          });

          runQueue();
        },
      },
      disposer,
    );
    currentTenantsByName.set(name, tenant);
    return ok(tenant);
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

// TODO: SharedWorker follow-ups.
// - Complete the queue head when a DbWorker mutation returns an error.
// - Rotate the node ID when a copied database is detected; see the Duplicate
//   node IDs section in the Timestamp module.
// - Detect DbWorker and port liveness so a worker-only crash resumes the queue.
// - Split worker protocol types and the EvoluTenant implementation into focused
//   modules.
// - Remove the obsolete commented protocol block above.
// - Replace the SyncState placeholder with actual sync monitoring state.
// - Propagate invalid protocol messages to sync state.
// - Measure sync traffic before bounding it: several tenants using one owner
//   multiply rounds, and a bulk catch-up from one relay starts up to one round
//   to each other relay per frame that stores new messages, depending on queued
//   round coalescing. Forwarding the stored messages the way mutation uploads
//   do would replace those rounds.
