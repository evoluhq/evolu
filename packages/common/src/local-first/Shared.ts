/**
 * Platform-agnostic Evolu SharedWorker.
 *
 * ## Builds
 *
 * Tabs of different app builds can be open at once, for example an old tab
 * during a deploy. Bundlers derive the worker script's URL from its content, so
 * every build whose worker code differs gets its own SharedWorker, and all of
 * them open the same databases. Only one may use them at a time: a request
 * retried after another worker wrote from the same stored clock can reuse that
 * write's timestamps and then is skipped as already stored.
 *
 * The worker therefore takes an origin-wide lock before it answers any tab and
 * holds it for its lifetime. A worker of another build waits, with its tabs'
 * messages buffered, until every tab of the first one is closed or reloaded and
 * the browser ends it. The lock is the one that earlier releases take in their
 * leader tab, so they are excluded too. An earlier release's worker can outlive
 * its leader tab and resume once the lock is free; it computes new timestamps
 * when it retries, so it cannot reuse another worker's. A tab of an earlier
 * release that opens while a worker of this release runs gets no response to
 * its database requests until it reloads, and until then it also blocks workers
 * that start after this one ends.
 *
 * On the web, the wait is usually short, because tabs of the running build
 * reload to load the build the server now serves:
 *
 * 1. A worker tells the tabs that connect before it holds the lock that they wait,
 *    and such a tab announces the worker with {@link BuildWaiting}. It announces
 *    again when a tab that connects asks with {@link BuildWaitingRequest}, so a
 *    tab that started or connected after the first announcement learns of it
 *    too.
 * 2. A tab connected to another worker reloads with {@link ReloadApp}: at once if
 *    the user is not in it, otherwise once they leave it, so a tab never
 *    reloads while the user works in it. Focus can leave a page from a frame
 *    without a window event, so such a tab checks once a second whether it
 *    still has focus. A tab that still waits itself keeps the announcements it
 *    receives and handles them once it connects, because the lock can pass to
 *    its worker first.
 * 3. A page that such a reload loaded never announces, and a tab reloads at most
 *    once for each waiting worker, so two builds cannot keep reloading each
 *    other, even when a reload loads the running build again. A tab without
 *    session storage cannot record its reloads, so it does not reload.
 *
 * Only the web platform does this, because only there do builds coexist. A
 * reload loses UI state the app did not persist, so apps keep drafts in
 * local-only tables. A write a background tab has in flight can be lost, as
 * when a tab crashes.
 *
 * The wait lasts while a tab of the running build does not reload: a tab of an
 * earlier release, a tab Safari has frozen, a tab without session storage, or a
 * tab whose reload loads the running build again, for example because another
 * Evolu app shares the origin or a cache still serves the old build. A worker
 * still waiting after three seconds reports {@link OtherBuildRunningError} to
 * its tabs.
 *
 * The tabs of one worker elect the host of its DbWorkers among themselves, with
 * a lock scoped to the worker, so a tab of another worker never hosts them.
 * Builds that differ only in DbWorker code share one SharedWorker, and a tab of
 * either can host its DbWorkers.
 *
 * Safari suspends, rather than ends, a worker whose tabs are all in its
 * back-forward cache, and the suspended worker keeps the lock. There, a waiting
 * build also waits until Safari drops those pages.
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
 * Traffic goes only where it is needed. A continuation returns to the transport
 * that produced the response, and a round started by a socket opening or by a
 * tenant's first use of a transport for an owner goes through that transport.
 * Explicit synchronization requests and mutation uploads go to every open
 * transport claimed for the owner. A write uploads through the database's
 * writable registrations for its owner, whichever instance made it, even one
 * disposed before the database worker answered. When a relay frame stores new
 * messages, the tenant requests a round through each other transport claimed
 * for the owner, so data learned from one relay reaches the others. A closed
 * transport reconciles when it opens, and a replacement leader reconciles every
 * transport again, because a response reporting stored messages may have been
 * lost.
 *
 * Relays omit the sending socket when broadcasting an upload, so the uploader
 * also delivers it as local Broadcast frames to every other tenant with
 * writable access to the owner, even while sockets are closed. A copy keeps the
 * uploader's target, and a recipient that stores new continuation messages
 * reconciles them through the transports outside that target. Local delivery
 * forwards uploads, including historical messages sent during reconciliation,
 * but does not reconcile local database histories with each other. That waits
 * until replication scopes and retention semantics are defined.
 *
 * ## Sync state
 *
 * The shared worker publishes one plain snapshot, {@link SyncState}, of every
 * transport it manages and every database and owner registration it holds, with
 * one route per writable registration and transport, as specified below.
 * {@link syncStateToOwnerSyncStates} derives one state per database and owner.
 *
 * Each worker broadcasts snapshots on its own channel, whose name a connecting
 * tab receives through its port, so a tab never hears another worker, such as
 * one of a different app version, and
 * {@link SyncStateDep.syncState | deps.syncState} keeps the last snapshot. The
 * worker publishes after every change it observes; a transition without an
 * event, such as a closed socket starting to reconnect, appears with the next
 * snapshot. The snapshot lives in worker memory only, so a new worker starts
 * empty.
 *
 * ## Synchronization completion
 *
 * A protocol frame carries the owner ID and the message type but nothing that
 * correlates it with a request, and a relay answers a converged round, an
 * upload that fits one frame, and an Unsubscribe alike with a header-only
 * Response. Every tenant with a writable registration applies every frame for
 * its owner, so a tenant cannot tell which response answered its own request.
 *
 * Completion is therefore counted, not attributed. The shared worker counts
 * outstanding requests per owner and socket: every Request sent on an open
 * socket, including an Unsubscribe, increments the count; every Response,
 * including a relay's version-mismatch reply, which has no message type,
 * decrements it; and an opening socket resets it, because requests on the
 * previous connection are never answered. A route, one tenant's use of one
 * owner through one transport, is complete when:
 *
 * - The tenant has not refused startup and the socket is open.
 * - The count is zero.
 * - The tenant has no apply for the owner queued for that transport or for every
 *   transport, because a frame is applied asynchronously, so the count reads
 *   zero in the middle of a chain.
 * - The tenant has no replicated write for the owner queued, because its upload
 *   is sent only after the database worker answers it.
 * - The tenant has sent a round through the transport since the last event that
 *   requires one: its first use of the transport for the owner, the socket
 *   opening, an explicit request, a replacement leader, or storing messages
 *   from another transport. No failed or aborted result has arrived on the
 *   route since.
 *
 * A reconciliation chain ends only with a converged result, a failure, an
 * abort, a dropped frame, or a continuation that finds the socket closed, and
 * relay errors reach every applying tenant, so these conditions mean every
 * chain, including this tenant's, converged. A local Broadcast from a sibling
 * tenant holds every route of its owner until it is applied, because it arrives
 * without a request of its own; one that fails to apply requires a round
 * through every transport.
 *
 * A failed result on a route requests one round through it. Any further failure
 * before the route completes waits for an explicit request or a reopen, so a
 * persistent failure cannot loop; a converged reply in between does not end the
 * wait, because it may answer another tenant's round on the shared socket. An
 * aborted apply leaves its routes incomplete without a retry. An exception
 * while the database worker creates a round is logged there and fails the
 * round's routes with `SyncFailed` without a retry; other unexpected SQLite
 * exceptions remain unsupported and can panic the database worker. A frame the
 * relay silently drops, such as invalid data, leaves the count above zero until
 * the liveness rule below replaces the socket.
 *
 * ### Liveness
 *
 * An open socket can be dead without a close event, when a NAT drops an idle
 * mapping or the path fails while nothing is sent. The relay pings every
 * connection and terminates one from which nothing has arrived since the
 * previous ping, which also keeps NAT mappings alive. The shared worker
 * reconnects a socket when a request for an owner has been outstanding for
 * ninety seconds, enough for a 1 MB frame at about 90 kbit/s, with no Response
 * for that owner since. Frames for other owners do not count: they prove the
 * socket alive, not that the request was received.
 *
 * A slow link looks like a dead one, because the browser reports no transfer
 * progress and a large frame saves nothing until it arrives whole. Each timeout
 * therefore doubles the transport's timeout, up to twenty-four minutes: a
 * connection that reopens but times out again is more likely slow than dead.
 * The timeout belongs to the transport, not to an owner, because a small reply
 * for one owner can wait behind another owner's large frame on the socket. A
 * grown timeout lasts while a request is outstanding on the socket or a
 * database that has not refused startup has an incomplete route through it,
 * including one waiting after a failure, and ends with the transport. A reply's
 * speed proves nothing, because a recovery on a slow link starts with small
 * replies that arrive quickly. The reopen resets the counts and starts the open
 * rounds, so a dropped frame delays a route instead of stranding it.
 *
 * The shared worker sends nothing while idle, so a path that dies then may go
 * unnoticed until its next request; until then, changes from other devices stop
 * arriving while routes still read complete. A periodic empty request would
 * notice it without waiting for the app to send. That is deferred, because
 * relay pings already keep NAT mappings alive, the common cause.
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
  assert,
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
import type { ReloadApp } from "../Platform.ts";
import { createRefCountedRelation } from "../Relation.ts";
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
import {
  performanceDurationBetween,
  PositiveMillis,
  type Millis,
  type PerformanceTime,
  type PositiveDuration,
  type TimeoutId,
} from "../Time.ts";
import {
  createId,
  id,
  literal,
  object,
  type ExtractTyped,
  type Id,
  type InferType,
  type LiteralType,
  type Name,
  type ObjectType,
  type Typed,
} from "../Type.ts";
import type { Callback } from "../Types.ts";
import type {
  CreateWebSocketDep,
  WebSocket,
  WebSocketError,
  WebSocketReadyState,
} from "../WebSocket.ts";
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
import type { EvoluError, SyncStateDep } from "./Evolu.ts";
import type { Owner, OwnerId, OwnerTransport, SyncOwner } from "./Owner.ts";
import {
  createProtocolBroadcastMessagesFromCrdtMessages,
  createProtocolMessageForUnsubscribe,
  createProtocolMessageFromCrdtMessages,
  MessageType,
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
import { isLocalOnlyTable, type MutationChange } from "./Schema.ts";
import type { CrdtMessage, StorageWriteMessagesError } from "./Storage.ts";
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
      /**
       * Asks the worker to broadcast a {@link SyncState} on its channel, which
       * the tab opened after receiving its name.
       */
      readonly type: "RequestSyncState";
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
      /**
       * Sent to one tab only: its database refused startup, or another build
       * keeps this worker waiting.
       */
      readonly type: "Error";
      readonly error: UnsupportedDbVersionError | OtherBuildRunningError;
    }
  | {
      /**
       * Sent to a tab that connects while the worker waits for the build lock;
       * see Builds. `Connected` follows once the worker holds it.
       */
      readonly type: "Waiting";
      readonly workerId: SharedWorkerId;
    }
  | {
      /**
       * Sent to a connecting tab once the worker holds the build lock; see
       * Builds in this module's documentation. The tab elects the host of the
       * worker's DbWorkers among the worker's tabs, scoped by `workerId`, and
       * listens for {@link SyncState} on `syncStateChannelName`.
       */
      readonly type: "Connected";
      readonly workerId: SharedWorkerId;
      readonly syncStateChannelName: string;
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

/** Identifies one running SharedWorker instance. */
export const SharedWorkerId = /*#__PURE__*/ id("SharedWorker");
export type SharedWorkerId = typeof SharedWorkerId.Output;

/**
 * The channel on which a tab announces its waiting worker with
 * {@link BuildWaiting}; see Builds. Builds of different releases share it, so
 * its name and messages never change.
 */
export const buildsBroadcastChannelName = "evolu:builds";

/**
 * Posted on {@link buildsBroadcastChannelName} by a tab whose worker waits for
 * the build lock, unless an automatic reload loaded the page, when it starts
 * waiting and for each {@link BuildWaitingRequest}. A tab connected to another
 * worker reloads for it; see Builds.
 */
export const BuildWaiting: ObjectType<{
  readonly type: LiteralType<"BuildWaiting">;
  readonly workerId: typeof SharedWorkerId;
}> = /*#__PURE__*/ object({
  type: /*#__PURE__*/ literal("BuildWaiting"),
  workerId: SharedWorkerId,
});
export interface BuildWaiting extends InferType<typeof BuildWaiting> {}

/**
 * Posted on {@link buildsBroadcastChannelName} by a tab once it connects, asking
 * tabs whose worker waits to post {@link BuildWaiting} again; see Builds.
 */
export const BuildWaitingRequest: ObjectType<{
  readonly type: LiteralType<"BuildWaitingRequest">;
}> = /*#__PURE__*/ object({
  type: /*#__PURE__*/ literal("BuildWaitingRequest"),
});
export interface BuildWaitingRequest extends InferType<
  typeof BuildWaitingRequest
> {}

/**
 * Another build of the app holds the local databases, and this tab waits until
 * every tab of that build is closed or reloaded; see Builds.
 *
 * Tabs of the other build usually reload by themselves, so this is reported
 * only when the wait lasts, for example because the user is still in a tab of
 * the other build, or that tab runs an earlier release or is frozen by Safari.
 * Apps can ask the user to close the app's other tabs. It is cleared once the
 * wait ends.
 */
export interface OtherBuildRunningError extends Typed<"OtherBuildRunningError"> {}

/**
 * A snapshot of the transports and databases the shared worker manages.
 *
 * See the Sync state section of this module's documentation.
 */
export interface SyncState {
  readonly transports: ReadonlyArray<SyncTransport>;
  readonly tenants: ReadonlyArray<SyncTenant>;
}

/** One WebSocket, shared by every owner and database claiming it. */
export interface SyncTransport {
  /** Opaque and stable for the transport's lifetime, across socket replacements. */
  readonly id: SyncTransportId;
  /** The URL without its query, which carries the owner ID. */
  readonly label: string;
  readonly readyState: WebSocketReadyState;
  /** When the connection last opened, or null before its first open. */
  readonly openedAt: Millis | null;
  /** When the connection last closed, or null before its first close. */
  readonly closedAt: Millis | null;
  /**
   * The last error, retained after a successful reconnect; null if none. Errors
   * while reconnecting are routine.
   */
  readonly error: SyncTransportError | null;
}

export type SyncTransportId = Id & Brand<"SyncTransport">;

export interface SyncTransportError {
  readonly type: WebSocketError["type"];
  readonly at: Millis;
}

/** One named local database and the owners it registered. */
export interface SyncTenant {
  readonly name: Name;
  /** The database refused startup, so nothing it holds synchronizes. */
  readonly refused: boolean;
  readonly owners: ReadonlyArray<SyncTenantOwner>;
}

export interface SyncTenantOwner {
  readonly ownerId: OwnerId;
  /** A readonly registration holds transports but never synchronizes. */
  readonly writable: boolean;
  /** Every transport claimed for the owner, by any database. */
  readonly transportIds: ReadonlyArray<SyncTransportId>;
  /** One route per transport for a writable owner; none for a readonly one. */
  readonly routes: ReadonlyArray<SyncRoute>;
}

/**
 * One database's use of one owner through one transport. See the
 * Synchronization completion section of this module's documentation.
 */
export interface SyncRoute {
  readonly transportId: SyncTransportId;
  /** Whether the database is reconciled with the relay for the owner. */
  readonly complete: boolean;
  /** When the route last became complete, or null. */
  readonly completeAt: Millis | null;
  /** When this database last sent a request through the route, or null. */
  readonly lastSentAt: Millis | null;
  /**
   * When processing a frame from the route last finished, successfully or with
   * a failure, or null. Aborted processing does not update this timestamp.
   */
  readonly lastReceivedAt: Millis | null;
  /** The last failed result on the route; cleared when the route completes. */
  readonly error: SyncRouteError | null;
}

export interface SyncRouteError {
  readonly type: SyncRouteErrorType;
  readonly at: Millis;
}

/**
 * A {@link ProtocolError} or the original {@link StorageWriteMessagesError} type
 * for a rejected write. `WriteFailed` means a `writeMessages` call that threw,
 * logged by the protocol, and `SyncFailed` means a logged failure while
 * creating a round or reconciling ranges.
 */
export type SyncRouteErrorType =
  | ProtocolError["type"]
  | StorageWriteMessagesError["type"]
  | "WriteFailed"
  | "SyncFailed";

/**
 * One owner's standing with its relays in one database, derived from
 * {@link SyncState} by {@link syncStateToOwnerSyncStates}.
 */
export interface OwnerSyncState {
  readonly name: Name;
  readonly ownerId: OwnerId;
  readonly status: OwnerSyncStatus;
  /** When a route of the owner last became complete, or null. */
  readonly syncedAt: Millis | null;
  /** The newest route error of the owner, or null. */
  readonly error: SyncRouteError | null;
  /** Each relay of the owner, in the order of its routes. */
  readonly relays: ReadonlyArray<RelaySyncState>;
}

/**
 * The status of an {@link OwnerSyncState}: the first of `error`, `syncing`,
 * `synced`, and `offline` that one of its relays has, or `initial` before the
 * owner has a relay. Work in progress on an open transport shows before a relay
 * that is already up to date.
 */
export type OwnerSyncStatus = "initial" | RelaySyncStatus;

/**
 * One relay of an {@link OwnerSyncState}: a transport and the database's route
 * through it.
 */
export interface RelaySyncState {
  readonly transport: SyncTransport;
  readonly route: SyncRoute;
  readonly status: RelaySyncStatus;
}

/**
 * The status of a {@link RelaySyncState}: `error` when its route failed and has
 * not completed since, `synced` when the route is complete, `syncing` while the
 * transport is open, and `offline` otherwise.
 */
export type RelaySyncStatus = "syncing" | "synced" | "offline" | "error";

/**
 * Folds the routes of every writable owner registration of every running
 * database in a {@link SyncState} into one {@link OwnerSyncState} per database
 * and owner, which pairs each route with its transport as a
 * {@link RelaySyncState}. A database that refused startup and a readonly
 * registration synchronize nothing, so they are left out.
 *
 * ### Example
 *
 * ```ts
 * import {
 *   assertEqual,
 *   createId,
 *   Millis,
 *   testCreateDeps,
 *   testName,
 * } from "@evolu/common";
 * import {
 *   syncStateToOwnerSyncStates,
 *   testAppOwner,
 *   type SyncRoute,
 *   type SyncState,
 *   type SyncTransport,
 * } from "@evolu/common/local-first";
 *
 * const deps = testCreateDeps();
 * const transport: SyncTransport = {
 *   id: createId<"SyncTransport">(deps),
 *   label: "wss://relay.example",
 *   readyState: "open",
 *   openedAt: null,
 *   closedAt: null,
 *   error: null,
 * };
 * const route: SyncRoute = {
 *   transportId: transport.id,
 *   complete: true,
 *   completeAt: Millis.orThrow(1000),
 *   lastSentAt: Millis.orThrow(900),
 *   lastReceivedAt: Millis.orThrow(1000),
 *   error: null,
 * };
 * const state: SyncState = {
 *   transports: [transport],
 *   tenants: [
 *     {
 *       name: testName,
 *       refused: false,
 *       owners: [
 *         {
 *           ownerId: testAppOwner.id,
 *           writable: true,
 *           transportIds: [transport.id],
 *           routes: [route],
 *         },
 *       ],
 *     },
 *   ],
 * };
 *
 * assertEqual(syncStateToOwnerSyncStates(state), [
 *   {
 *     name: testName,
 *     ownerId: testAppOwner.id,
 *     status: "synced",
 *     syncedAt: Millis.orThrow(1000),
 *     error: null,
 *     relays: [{ transport, route, status: "synced" }],
 *   },
 * ]);
 * ```
 */
export const syncStateToOwnerSyncStates = (
  state: SyncState,
): ReadonlyArray<OwnerSyncState> => {
  const transportById = new Map(
    state.transports.map((transport) => [transport.id, transport]),
  );
  return state.tenants.flatMap(({ name, refused, owners }) =>
    refused
      ? []
      : owners.flatMap(({ ownerId, writable, routes }) => {
          if (!writable) return [];
          let syncedAt: Millis | null = null;
          let error: SyncRouteError | null = null;
          const relays: Array<RelaySyncState> = [];
          for (const route of routes) {
            if (
              route.completeAt !== null &&
              (syncedAt === null || route.completeAt > syncedAt)
            )
              syncedAt = route.completeAt;
            if (
              route.error !== null &&
              (error === null || route.error.at > error.at)
            )
              error = route.error;
            // A snapshot lists the transport of every route.
            const transport = transportById.get(route.transportId);
            assertNonNullable(transport);
            relays.push({
              transport,
              route,
              status:
                route.error !== null
                  ? "error"
                  : route.complete
                    ? "synced"
                    : transport.readyState === "open"
                      ? "syncing"
                      : "offline",
            });
          }
          const status: OwnerSyncStatus =
            (["error", "syncing", "synced", "offline"] as const).find(
              (candidate) => relays.some((relay) => relay.status === candidate),
            ) ?? "initial";
          return [{ name, ownerId, status, syncedAt, error, relays }];
        }),
  );
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
            /** Owners whose message creation threw; the DbWorker logged it. */
            readonly failedOwnerIds: ReadonlySet<OwnerId>;
          }
        | {
            readonly type: "ApplySyncMessage";
            readonly clock: Timestamp;
            readonly ownerId: OwnerId;
            readonly didWriteMessages: boolean;
            readonly result: Result<
              ApplyProtocolMessageAsClientResult,
              ProtocolError | StorageWriteMessagesError | AbortError
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

  readonly getSyncTenant: () => TenantSyncState;

  readonly refreshSyncRoutes: () => void;

  readonly requestCreateSyncMessages: (
    ownerIds: ReadonlySet<OwnerId>,
    target: SyncTarget,
  ) => void;

  readonly requestApplySyncMessage: (
    ownerId: OwnerId,
    inputMessage: Uint8Array,
    source: ApplySyncMessageSource,
  ) => void;
}

/** A tenant's part of {@link SyncState}, with its transports still keyed. */
interface TenantSyncState {
  readonly name: Name;
  readonly refused: boolean;
  readonly owners: ReadonlyArray<{
    readonly ownerId: OwnerId;
    readonly writable: boolean;
    readonly transportKeys: ReadonlyArray<StructuralLookupKey>;
    readonly routes: ReadonlyArray<TenantSyncRoute>;
  }>;
}

interface TenantSyncRoute extends Omit<SyncRoute, "transportId"> {
  readonly transportKey: StructuralLookupKey;
}

/**
 * How long an unanswered request keeps a socket before it is replaced.
 *
 * A reply cannot arrive before the whole request has been received, and a reply
 * can itself be a large frame. The browser reports no transfer progress, so the
 * timeout must cover a 1 MB frame on a slow link: 90 seconds allows about 90
 * kbit/s.
 */
const syncRequestTimeout = PositiveMillis.orThrow(90_000);

/**
 * The longest a transport's timeout grows after repeated timeouts: 16 times
 * {@link syncRequestTimeout}, which covers a 1 MB frame at about 6 kbit/s.
 */
const maxSyncRequestTimeout = PositiveMillis.orThrow(16 * syncRequestTimeout);

/** Where the protocol messages produced by a queued sync request are sent. */
type SyncTarget =
  | { readonly type: "AllTransports" }
  | {
      /** One transport, identified by its structural lookup key. */
      readonly type: "Transport";
      readonly key: StructuralLookupKey;
    };

/** A received frame's transport, or a sibling copy retaining its upload target. */
type ApplySyncMessageSource =
  | { readonly type: "Transport"; readonly key: StructuralLookupKey }
  | {
      /** A local copy holds every route, whichever target its upload uses. */
      readonly type: "Local";
      readonly uploadTarget: SyncTarget;
    };

const allTransports: SyncTarget = { type: "AllTransports" };

const isTargetTransport = (
  target: SyncTarget,
  transport: OwnerTransport,
): boolean =>
  target.type === "AllTransports" || target.key === structuralLookup(transport);

type EvoluTenantDeps = SharedWorkerDeps &
  PostConsoleEntryOrErrorDep &
  PublishSyncStateDep &
  RefreshAllSyncRoutesDep &
  SyncRequestsDep &
  TabLeaderPortStoreDep &
  TransportsDep;

interface PostConsoleEntryOrErrorDep {
  readonly postConsoleEntryOrError: Callback<ConsoleEntryOrError>;
}

interface PublishSyncStateDep {
  readonly publishSyncState: () => void;
}

interface RefreshAllSyncRoutesDep {
  readonly refreshAllSyncRoutes: () => void;
}

/** Outstanding requests per owner and socket, shared by every tenant. */
interface SyncRequests {
  /**
   * Counts a Request sent on an open socket. The caller refreshes every
   * tenant's routes once after its sends.
   */
  readonly noteSent: (ownerId: OwnerId, key: StructuralLookupKey) => void;
  readonly getOutstanding: (
    ownerId: OwnerId,
    key: StructuralLookupKey,
  ) => number;
}

interface SyncRequestsDep {
  readonly syncRequests: SyncRequests;
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

// Long enough for another build's tabs to reload and its worker to end.
const otherBuildRunningReportDelay: PositiveDuration = "3s";

/**
 * Initializes the platform-agnostic Evolu SharedWorker.
 *
 * The worker holds the build lock until it is disposed, so a platform connects
 * every `createEvoluDeps` call in a JS runtime to one worker, as React Native
 * does; see Builds.
 */
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
    const workerId = createId<"SharedWorker">(deps);
    // Each worker broadcasts on its own channel, so a tab hears only the
    // worker its port connects to.
    const syncStateChannelName = `evolu:sync-state:${workerId}`;
    const syncStateBroadcastChannel = disposer.use(
      deps.createBroadcastChannel<SyncState>(syncStateChannelName),
    );

    const sharedWorkerReady = Promise.withResolvers<void>();

    // Until this worker holds the build lock, it tells connecting tabs that they
    // wait, and reports a lasting wait to them; see Builds.
    const starting = disposer.use(new DisposableStack());
    const waitingTabPorts: Array<TabPort> = [];
    let isOtherBuildRunning = false;
    const reportOtherBuildRunning = (port: TabPort): void => {
      port.postMessage({
        type: "Error",
        error: { type: "OtherBuildRunningError" },
      });
    };
    const otherBuildRunningTimeoutId = deps.time.setTimeout(() => {
      isOtherBuildRunning = true;
      for (const port of waitingTabPorts) reportOtherBuildRunning(port);
    }, otherBuildRunningReportDelay);
    starting.defer(() => {
      deps.time.clearTimeout(otherBuildRunningTimeoutId);
    });

    // Register ASAP so the worker does not miss connections.
    self.onConnect = (port) => {
      if (!starting.disposed) {
        port.postMessage({ type: "Waiting", workerId });
        waitingTabPorts.push(port);
        if (isOtherBuildRunning) reportOtherBuildRunning(port);
      }
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

            case "RequestSyncState": {
              publishSyncState();
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
        port.postMessage({
          type: "Connected",
          workerId,
          syncStateChannelName,
        });
      });
    };

    // Released after every tenant and DbWorker is disposed. Earlier releases
    // take the same lock in their leader tab; see Builds.
    disposer.use(await run.ok(acquireLeaderLock("tab")));
    starting.dispose();

    disposer.defer(
      deps.consoleStoreOutputEntry.subscribe(() => {
        const entry = deps.consoleStoreOutputEntry.get();
        if (entry) postConsoleEntryOrError({ type: "ConsoleEntry", entry });
      }),
    );

    const currentTenantsByName = new Map<Name, BorrowedResource<EvoluTenant>>();

    interface SyncTransportEntry {
      readonly id: SyncTransportId;
      readonly label: string;
      /**
       * Outstanding requests per owner; `silentSince` is when the first of them
       * was sent or a Response for the owner last arrived. It is monotonic, so
       * a system clock adjustment cannot make a request look timed out or keep
       * one from timing out.
       */
      readonly outstandingByOwnerId: Map<
        OwnerId,
        { count: number; silentSince: PerformanceTime }
      >;
      /**
       * The timeout of every request on the socket: frames arrive one after
       * another, so a reply can wait behind another owner's large frame. It
       * doubles after each timeout and survives reconnects until nothing is
       * outstanding and every route through the transport of a database that
       * has not refused startup is complete.
       */
      timeout: PositiveMillis;
      socket: WebSocket | null;
      openedAt: Millis | null;
      closedAt: Millis | null;
      error: SyncTransportError | null;
      /** Armed while a request is outstanding on an open socket. */
      timeoutId: TimeoutId | null;
    }
    const transportsByKey = new Map<StructuralLookupKey, SyncTransportEntry>();
    let isDisposed = false;
    disposer.defer(() => {
      isDisposed = true;
    });

    // Changes within one task publish once.
    let isPublishScheduled = false;
    const publishSyncState = (): void => {
      if (isDisposed || isPublishScheduled) return;
      isPublishScheduled = true;
      queueMicrotask(() => {
        isPublishScheduled = false;
        if (isDisposed) return;
        const transports = [...transportsByKey.values()].map(
          ({
            id,
            label,
            socket,
            openedAt,
            closedAt,
            error,
          }): SyncTransport => ({
            id,
            label,
            // The transport drops its socket before disposal, so this never
            // reads a disposed one.
            readyState: socket?.getReadyState() ?? "connecting",
            openedAt,
            closedAt,
            error,
          }),
        );
        const tenants = [...currentTenantsByName.values()].map(
          (tenant): SyncTenant => {
            const { name, refused, owners } = tenant.getSyncTenant();
            return {
              name,
              refused,
              owners: owners.map(
                ({ ownerId, writable, transportKeys, routes }) => ({
                  ownerId,
                  writable,
                  transportIds: transportKeys.flatMap((key) => {
                    const entry = transportsByKey.get(key);
                    return entry ? [entry.id] : [];
                  }),
                  routes: routes.flatMap(({ transportKey, ...route }) => {
                    const entry = transportsByKey.get(transportKey);
                    return entry ? [{ transportId: entry.id, ...route }] : [];
                  }),
                }),
              ),
            };
          },
        );
        // A grown timeout lasts while a request is outstanding on the socket
        // or a database that has not refused startup has an incomplete route
        // through it. Every change to either publishes, including a route that
        // goes away without completing.
        const incompleteTransportIds = new Set<SyncTransportId>();
        for (const { refused, owners } of tenants) {
          if (refused) continue;
          for (const { routes } of owners)
            for (const { transportId, complete } of routes)
              if (!complete) incompleteTransportIds.add(transportId);
        }
        for (const entry of transportsByKey.values())
          if (
            entry.outstandingByOwnerId.size === 0 &&
            !incompleteTransportIds.has(entry.id)
          )
            entry.timeout = syncRequestTimeout;
        syncStateBroadcastChannel.postMessage({ transports, tenants });
      });
    };

    // Socket counters and owner claims are shared by all tenants. Refresh
    // after their complete event, independently of snapshot publication.
    const refreshAllSyncRoutes = (): void => {
      for (const tenant of currentTenantsByName.values())
        tenant.refreshSyncRoutes();
    };

    const clearSyncRequestTimeout = (entry: SyncTransportEntry): void => {
      if (entry.timeoutId === null) return;
      deps.time.clearTimeout(entry.timeoutId);
      entry.timeoutId = null;
    };

    const armSyncRequestTimeout = (
      entry: SyncTransportEntry,
      delay: PositiveMillis,
    ): void => {
      entry.timeoutId = deps.time.setTimeout(() => {
        entry.timeoutId = null;
        // Frames for other owners prove the socket alive, not that this
        // owner's request was received, so each owner's silence is measured
        // separately.
        const now = deps.time.performance.now();
        let shortestRemaining: number | null = null;
        let isTimedOut = false;
        for (const { silentSince } of entry.outstandingByOwnerId.values()) {
          const remaining =
            entry.timeout - performanceDurationBetween(silentSince, now);
          if (remaining <= 0) isTimedOut = true;
          else if (shortestRemaining === null || remaining < shortestRemaining)
            shortestRemaining = remaining;
        }
        if (!isTimedOut) {
          if (shortestRemaining === null) return;
          // Timer delays use integer milliseconds; round up to wait at least
          // the remaining fractional duration.
          armSyncRequestTimeout(
            entry,
            PositiveMillis.orThrow(Math.ceil(shortestRemaining)),
          );
          return;
        }
        // A request went unanswered for the whole timeout: it was lost, the
        // connection is dead, or the link is too slow for the frames ahead of
        // its reply. A frame that never arrives whole saves nothing, so on a
        // slow link the same reply would time out forever. Doubling the
        // timeout lets it arrive after a reconnect that opens fine.
        entry.timeout = PositiveMillis.orThrow(
          Math.min(entry.timeout * 2, maxSyncRequestTimeout),
        );
        // Reconnecting abandons the connection and starts a fresh retry
        // schedule. The socket reports no close for it, so the transport
        // records the moment here.
        entry.socket?.reconnect();
        // `now` is monotonic; the reported close time is wall clock.
        entry.closedAt = deps.time.now();
        refreshAllSyncRoutes();
        publishSyncState();
      }, delay);
    };

    const syncRequests: SyncRequests = {
      noteSent: (ownerId, key) => {
        const entry = transportsByKey.get(key);
        if (!entry) return;
        const outstanding = entry.outstandingByOwnerId.get(ownerId);
        if (outstanding) outstanding.count++;
        else
          entry.outstandingByOwnerId.set(ownerId, {
            count: 1,
            silentSince: deps.time.performance.now(),
          });
        if (entry.timeoutId === null)
          armSyncRequestTimeout(entry, entry.timeout);
        publishSyncState();
      },
      getOutstanding: (ownerId, key) =>
        transportsByKey.get(key)?.outstandingByOwnerId.get(ownerId)?.count ?? 0,
    };

    const transports = disposer.use(
      await run.ok(
        createSharedResourceByKeyWithClaims<
          OwnerTransport,
          OwnerId,
          WebSocket,
          SharedWorkerDeps,
          StructuralLookupKey
        >(
          (transport) => async (run) => {
            const key = structuralLookup(transport);
            // The query carries the owner ID; WebSocket accepts URLs that
            // URL() rejects, so the label is derived without parsing.
            const queryIndex = transport.url.indexOf("?");
            const entry: SyncTransportEntry = {
              id: createId<"SyncTransport">(run.deps),
              label:
                queryIndex === -1
                  ? transport.url
                  : transport.url.slice(0, queryIndex),
              outstandingByOwnerId: new Map(),
              timeout: syncRequestTimeout,
              socket: null,
              openedAt: null,
              closedAt: null,
              error: null,
              timeoutId: null,
            };
            await using disposer = new AsyncDisposableStack();
            // Registered before the socket, so an aborted creation also
            // forgets the transport.
            disposer.defer(() => {
              transportsByKey.delete(key);
              refreshAllSyncRoutes();
              publishSyncState();
            });
            transportsByKey.set(key, entry);
            publishSyncState();

            const socket = await run.ok(
              deps.createWebSocket(transport.url, {
                binaryType: "arraybuffer",

                onOpen: () => {
                  // Requests in flight on the previous connection are never
                  // answered.
                  entry.outstandingByOwnerId.clear();
                  clearSyncRequestTimeout(entry);
                  entry.openedAt = run.deps.time.now();
                  publishSyncState();
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
                  refreshAllSyncRoutes();
                },

                onClose: (event) => {
                  console.debug("transportClose", {
                    url: transport.url,
                    code: event.code,
                    wasClean: event.wasClean,
                  });
                  entry.closedAt = run.deps.time.now();
                  clearSyncRequestTimeout(entry);
                  refreshAllSyncRoutes();
                  publishSyncState();
                },

                onError: (error) => {
                  console.debug("transportError", {
                    url: transport.url,
                    type: error.type,
                  });
                  entry.error = {
                    type: error.type,
                    at: run.deps.time.now(),
                  };
                  refreshAllSyncRoutes();
                  publishSyncState();
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

                  // A Response, or a version-mismatch reply without a message
                  // type, answers a request.
                  const { messageType } = headerResult.value;
                  if (
                    messageType === MessageType.Response ||
                    messageType === undefined
                  ) {
                    const { ownerId } = headerResult.value;
                    const outstanding = entry.outstandingByOwnerId.get(ownerId);
                    if (outstanding) {
                      outstanding.count--;
                      outstanding.silentSince = run.deps.time.performance.now();
                      if (outstanding.count === 0)
                        entry.outstandingByOwnerId.delete(ownerId);
                    }
                    if (entry.outstandingByOwnerId.size === 0)
                      clearSyncRequestTimeout(entry);
                    publishSyncState();
                  }

                  forEachTenant((tenant) => {
                    tenant.requestApplySyncMessage(
                      headerResult.value.ownerId,
                      message,
                      {
                        type: "Transport",
                        key: structuralLookup(transport),
                      },
                    );
                  });
                  // Do not complete a sibling after decrementing the shared
                  // counter but before its apply has been queued.
                  refreshAllSyncRoutes();
                },
              }),
            );
            disposer.use(socket);
            // LIFO: the transport drops its timer and its socket reference
            // before the socket is disposed. `disposable` guards every method
            // of the socket the claims lease, and disposing the socket awaits
            // its retry, so a `publishSyncState` microtask can run while this
            // entry is still registered. It must find no socket rather than
            // read a disposed one.
            disposer.defer(() => {
              clearSyncRequestTimeout(entry);
              entry.socket = null;
              refreshAllSyncRoutes();
            });
            const disposables = disposer.move();
            entry.socket = socket;
            refreshAllSyncRoutes();
            publishSyncState();
            // `disposable` replaces the socket's disposal method in place, but
            // `disposer.use` above already captured the original, so disposing
            // `disposables` disposes the socket rather than recursing.
            return ok(disposable<WebSocket>(socket, disposables));
          },
          {
            onFirstClaimAdded: (ownerId, webSocket, transport) => {
              if (webSocket.isOpen()) {
                const target: SyncTarget = {
                  type: "Transport",
                  key: structuralLookup(transport),
                };
                forEachTenant((tenant) => {
                  tenant.requestCreateSyncMessages(new Set([ownerId]), target);
                });
              }
              refreshAllSyncRoutes();
            },

            onLastClaimRemoved: (ownerId, webSocket, transport) => {
              if (webSocket.isOpen()) {
                webSocket.send(createProtocolMessageForUnsubscribe(ownerId));
                syncRequests.noteSent(ownerId, structuralLookup(transport));
              }
              refreshAllSyncRoutes();
            },
            // Keep sockets alive briefly across short owner churn.
            idleDisposeAfter: "3s",
            resourceLookup: structuralLookup,
          },
        ),
      ),
    );

    const sharedWorkerRun = disposer.use(
      run.create({
        ...deps,
        postConsoleEntryOrError,
        publishSyncState,
        refreshAllSyncRoutes,
        syncRequests,
        tabLeaderPortStore,
        transports,
      }),
    );

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
      // Without a tab leader yet, the store subscription starts the DbWorker
      // once a tab announces itself.
      const tabLeaderPort = deps.tabLeaderPortStore.get();
      if (startupError || !tabLeaderPort) return;

      const dbWorkerChannel = deps.createMessageChannel<
        DbWorkerOutput,
        DbWorkerInput
      >();
      const currentDbWorkerPort = dbWorkerChannel.port2;

      currentDbWorkerPort.onMessage = (message) => {
        switch (message.type) {
          case "LeaderAcquired": {
            assertNotSame(dbWorkerPort, currentDbWorkerPort);
            if (startupError || isDisposing) {
              // This worker was requested before the refusal or before
              // disposal started. The tenant will not use it, so let it
              // release the database lock.
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
            pendingWriteCountByOwnerId.clear();
            pendingApplyCountForAllRoutesByOwnerId.clear();
            ownerTransportApplyRelation.clear();
            startupError = message.error;
            refreshSyncRoutes();
            deps.publishSyncState();
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
                handleResponseForSharedWorker(response, entry);
                break;
              default:
                exhaustiveCheck(entry);
            }
            const head = queue.shift();
            assertNonNullable(head);
            updatePendingWork(head, -1);
            activeDispatch = null;
            // Follow-up uploads and retries are already queued or sent. Only
            // now can removing the completed head establish convergence.
            refreshSyncRoutes();
            if (entry.type === "Write" && entry.replicatedOwnerIds.size > 0)
              deps.publishSyncState();
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

    // Sync requests keep their target or source on the entry: the DbWorker
    // does not need it, and a replacement leader replays the same entry.
    type QueueEntry =
      | {
          readonly type: "Read";
          readonly request: ExtractTyped<DbWorkerReadRequest, "ForEvolu">;
        }
      | {
          readonly type: "Write";
          readonly request: ExtractTyped<DbWorkerWriteRequest, "ForEvolu">;
          /** Owners of its changes to replicated tables. */
          readonly replicatedOwnerIds: ReadonlySet<OwnerId>;
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
          readonly source: ApplySyncMessageSource;
          now?: Millis;
          clock?: Timestamp;
        };
    const queue: Array<QueueEntry> = [];
    const pendingWriteCountByOwnerId = new Map<OwnerId, number>();
    const pendingApplyCountForAllRoutesByOwnerId = new Map<OwnerId, number>();
    // Queued applies of relay frames, counted per owner and source transport.
    const ownerTransportApplyRelation = createRefCountedRelation<
      OwnerId,
      StructuralLookupKey
    >();

    const updatePendingCount = <K>(
      counts: Map<K, number>,
      key: K,
      delta: 1 | -1,
    ): void => {
      const count = (counts.get(key) ?? 0) + delta;
      assert(count >= 0, "Pending queue count must not become negative");
      if (count === 0) counts.delete(key);
      else counts.set(key, count);
    };

    // Count each queued entry once, including the dispatched head. Dispatch
    // and leader replacement leave it queued, so neither changes the counts.
    const updatePendingWork = (entry: QueueEntry, delta: 1 | -1): void => {
      switch (entry.type) {
        case "Read":
        case "CreateSyncMessages":
          break;

        case "Write":
          for (const ownerId of entry.replicatedOwnerIds)
            updatePendingCount(pendingWriteCountByOwnerId, ownerId, delta);
          break;

        case "ApplySyncMessage": {
          const ownerId = entry.request.message.owner.id;
          // A sibling's local copy holds every route, even when its upload
          // target was a single transport.
          if (entry.source.type === "Local") {
            updatePendingCount(
              pendingApplyCountForAllRoutesByOwnerId,
              ownerId,
              delta,
            );
          } else if (delta === 1) {
            ownerTransportApplyRelation.increment(ownerId, entry.source.key);
          } else {
            ownerTransportApplyRelation.decrement(ownerId, entry.source.key);
          }
          break;
        }

        default:
          exhaustiveCheck(entry);
      }
    };

    // Every queue mutation updates the pending-work counts with it.
    const enqueueRequest = (entry: QueueEntry): void => {
      updatePendingWork(entry, 1);
      queue.push(entry);
    };

    let sessionClock: Timestamp | null = null;
    let startupError: UnsupportedDbVersionError | null = null;
    let isDisposing = false;
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
      isDisposing = true;
      dbWorkerPort?.postMessage({ type: "Dispose" });
      dbWorkerPort = null;
      activeDispatch = null;

      // The DbWorker holds this tenant leader lock while it is alive. Tenant
      // disposal sends Dispose, then acquires the same lock to wait until the
      // DbWorker releases it: either because Dispose was delivered or because
      // the hosting tab closed. A worker requested from a later tab leader may
      // be queued for the lock first; it is told to stop when it reports in.
      // The wait is unabortable because tenant disposal must finish even after
      // tenantRun receives an abort request.
      await using _ = await tenantRun.ok(acquireLeaderLock(name));
    });

    const handleResponseForEvolu = (
      response: ExtractTyped<DbWorkerQueuedResponse, "ForEvolu">,
      first: DbWorkerRequest,
    ): void => {
      // A disposed instance gets no patches, but its committed write still
      // synchronizes.
      const instance = instancesById.get(response.id);

      switch (response.message.type) {
        case "Mutate":
        case "Query": {
          if (instance) {
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
          }

          if (response.message.type === "Mutate") {
            refreshQueries(response.id);

            const protocolMessagesByOwnerId = new Map<
              OwnerId,
              ProtocolMessage
            >();

            // The database's writable registrations upload the write,
            // whichever instance made it and whether it is still alive.
            const writersById = getUsedOwnersById(
              new Set(response.message.messagesByOwnerId.keys()),
            );

            for (const [ownerId, messages] of response.message
              .messagesByOwnerId) {
              // Uploading requires the write key. A write for an owner without
              // a writable registration waits for the round that its first
              // writable registration starts.
              const owner = writersById.get(ownerId);
              if (!owner) continue;

              protocolMessagesByOwnerId.set(
                ownerId,
                createProtocolMessageFromCrdtMessages(run.deps)(
                  owner,
                  messages,
                ),
              );
              if (currentTenantsByName.size > 1) {
                broadcastProtocolMessages(
                  ownerId,
                  createProtocolBroadcastMessagesFromCrdtMessages(run.deps)(
                    owner,
                    messages,
                  ),
                  allTransports,
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
          instance?.port.postMessage(
            { type: "OnExport", file: response.message.file },
            [response.message.file.buffer],
          );
          break;
      }
    };

    interface RouteState {
      /** A round must be sent through the route before it can be complete. */
      roundRequired: boolean;
      complete: boolean;
      completeAt: Millis | null;
      lastSentAt: Millis | null;
      lastReceivedAt: Millis | null;
      error: SyncRouteError | null;
    }
    const routesByOwnerIdByKey = new Map<
      StructuralLookupKey,
      Map<OwnerId, RouteState>
    >();

    const getRoute = (
      ownerId: OwnerId,
      key: StructuralLookupKey,
    ): RouteState => {
      let routesByOwnerId = routesByOwnerIdByKey.get(key);
      if (!routesByOwnerId) {
        routesByOwnerId = new Map();
        routesByOwnerIdByKey.set(key, routesByOwnerId);
      }
      let route = routesByOwnerId.get(ownerId);
      if (!route) {
        route = {
          roundRequired: true,
          complete: false,
          completeAt: null,
          lastSentAt: null,
          lastReceivedAt: null,
          error: null,
        };
        routesByOwnerId.set(ownerId, route);
      }
      return route;
    };

    const getSyncOwners = () => {
      const ownersById = new Map<OwnerId, { writable: boolean }>();
      for (const instance of instancesById.values()) {
        for (const { owner } of instance.ownerRegistrations.keys()) {
          const entry = ownersById.get(owner.id) ?? { writable: false };
          entry.writable ||= "writeKey" in owner;
          ownersById.set(owner.id, entry);
        }
      }
      return [...ownersById].map(([ownerId, { writable }]) => ({
        ownerId,
        writable,
        transportKeys: getClaimedKeys(ownerId),
      }));
    };

    // State-changing handlers own route transitions and claim cleanup.
    // Reading or delaying a snapshot must not affect protocol retries.
    // TODO: If profiling warrants it, remove quadratic transport scans per owner:
    // traverse resources once and use a Set for cleanup membership.
    const refreshSyncRoutes = (): void => {
      const owners = getSyncOwners();
      const ownerById = new Map(owners.map((owner) => [owner.ownerId, owner]));
      for (const [key, routesByOwnerId] of routesByOwnerIdByKey) {
        for (const ownerId of routesByOwnerId.keys()) {
          const owner = ownerById.get(ownerId);
          if (!owner?.writable || !owner.transportKeys.includes(key))
            routesByOwnerId.delete(ownerId);
        }
        if (routesByOwnerId.size === 0) routesByOwnerIdByKey.delete(key);
      }
      // Evaluate each route per the Synchronization completion rules.
      for (const { ownerId, writable, transportKeys } of owners) {
        if (!writable) continue;
        for (const key of transportKeys) {
          const route = getRoute(ownerId, key);
          let isOpen = false;
          deps.transports.forEachResourceForClaim(
            ownerId,
            (webSocket, transport) => {
              if (structuralLookup(transport) === key && webSocket.isOpen())
                isOpen = true;
            },
          );
          // A received frame is applied asynchronously, so the counter alone
          // reads zero in the middle of a chain. A dispatched entry stays
          // queued until it is answered. A sibling's local Broadcast contains
          // messages that are unstored until it is applied, so it leaves every
          // route of the owner incomplete.
          const hasQueuedApply =
            pendingApplyCountForAllRoutesByOwnerId.has(ownerId) ||
            ownerTransportApplyRelation.getCount(ownerId, key) > 0;
          // A replicated write's upload is sent only after the database
          // worker answers it. Local-only changes create no synchronization
          // work.
          const hasQueuedWrite = pendingWriteCountByOwnerId.has(ownerId);
          // A refused database synchronizes nothing, and refusal discards its
          // queued writes without uploading them.
          const complete =
            startupError === null &&
            isOpen &&
            deps.syncRequests.getOutstanding(ownerId, key) === 0 &&
            !hasQueuedApply &&
            !hasQueuedWrite &&
            !route.roundRequired;
          if (complete && !route.complete) {
            route.completeAt = deps.time.now();
            route.error = null;
          }
          route.complete = complete;
        }
      }
    };

    const handleResponseForSharedWorker = (
      response: ExtractTyped<DbWorkerQueuedResponse, "ForSharedWorker">,
      entry: ExtractTyped<
        QueueEntry,
        "CreateSyncMessages" | "ApplySyncMessage"
      >,
    ): void => {
      switch (entry.type) {
        case "CreateSyncMessages": {
          assertSame(response.message.type, "CreateSyncMessages");
          sendProtocolMessagesByOwnerId(
            response.message.protocolMessagesByOwnerId,
            entry.target,
            { isRound: true },
          );
          const { failedOwnerIds } = response.message;
          if (failedOwnerIds.size === 0) break;
          // A retry would likely fail the same way, so the routes wait for an
          // explicit request or a reopen.
          const now = deps.time.now();
          for (const ownerId of failedOwnerIds) {
            deps.transports.forEachResourceForClaim(ownerId, (_, transport) => {
              if (!isTargetTransport(entry.target, transport)) return;
              const route = routesByOwnerIdByKey
                .get(structuralLookup(transport))
                ?.get(ownerId);
              if (!route) return;
              route.roundRequired = true;
              route.error = { type: "SyncFailed", at: now };
            });
          }
          deps.publishSyncState();
          break;
        }

        case "ApplySyncMessage": {
          assertSame(response.message.type, "ApplySyncMessage");
          const { source } = entry;
          const target = source.type === "Local" ? source.uploadTarget : source;
          const { ownerId, result } = response.message;
          const error = result.ok ? null : result.error;
          const isAborted = error?.type === "AbortError";
          let failure: SyncRouteErrorType | null = null;
          if (isAborted) {
            // An abort proves no convergence. A local sibling copy affects
            // every route; a relay frame affects only its source route.
            // Recovery of a panicked DbWorker remains deferred.
            deps.transports.forEachResourceForClaim(ownerId, (_, transport) => {
              const key = structuralLookup(transport);
              if (source.type === "Transport" && source.key !== key) return;
              const route = routesByOwnerIdByKey.get(key)?.get(ownerId);
              if (route) route.roundRequired = true;
            });
          } else if (error !== null) {
            failure = error.type;
            deps.postConsoleEntryOrError({
              type: "Error",
              error,
            });
          } else if (result.ok && result.value.type === "Failed") {
            failure =
              result.value.cause === "Write" ? "WriteFailed" : "SyncFailed";
          }
          if (source.type === "Transport") {
            // A registration or claim may have been removed while this apply
            // was queued.
            const route = routesByOwnerIdByKey.get(source.key)?.get(ownerId);
            if (route) {
              const now = deps.time.now();
              // An aborted apply applied nothing.
              if (!isAborted) route.lastReceivedAt = now;
              if (failure !== null) {
                // The first failure since the route completed requests one
                // round. Further failures wait for an explicit request or a
                // reopen, even after a converged reply, which may answer
                // another request.
                if (route.error === null)
                  requestCreateSyncMessages(new Set([ownerId]), source);
                route.roundRequired = true;
                route.error = { type: failure, at: now };
              }
            }
          } else if (failure !== null) {
            // A sibling's messages were not stored; rounds fetch them from
            // the relays.
            requestCreateSyncMessages(new Set([ownerId]), allTransports);
          }

          if (response.message.didWriteMessages) {
            refreshQueries();
            // Reconcile newly stored messages through each other transport.
            // Rounds toward the same transport coalesce whatever their source.
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

          if (result.ok) {
            switch (result.value.type) {
              case "Response":
                if (result.value.broadcast) {
                  broadcastProtocolMessages(
                    ownerId,
                    [result.value.broadcast],
                    target,
                  );
                }
                sendProtocolMessagesByOwnerId(
                  new Map([[ownerId, result.value.message]]),
                  target,
                );
                break;

              case "Broadcast":
              case "Converged":
              case "Readonly":
              case "Failed":
                break;
              default:
                exhaustiveCheck(result.value);
            }
          }
          deps.publishSyncState();
          break;
        }
        default:
          exhaustiveCheck(entry);
      }
    };

    const broadcastProtocolMessages = (
      ownerId: OwnerId,
      messages: ReadonlyArray<ProtocolMessage>,
      target: SyncTarget,
    ): void => {
      for (const [tenantName, tenant] of currentTenantsByName) {
        if (tenantName === name) continue;
        for (const message of messages)
          tenant.requestApplySyncMessage(ownerId, message, {
            type: "Local",
            uploadTarget: target,
          });
      }
    };

    const sendProtocolMessagesByOwnerId = (
      protocolMessagesByOwnerId: ReadonlyMap<OwnerId, ProtocolMessage>,
      target: SyncTarget,
      {
        isRound = false,
      }: {
        /** Whether the messages start a full round, not an upload. */
        isRound?: boolean;
      } = {},
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
            const key = structuralLookup(transport);
            deps.syncRequests.noteSent(ownerId, key);
            const route = getRoute(ownerId, key);
            route.lastSentAt = deps.time.now();
            if (isRound) route.roundRequired = false;
          },
        );
      }
      // Sends raise counters shared by every tenant; one refresh covers them.
      if (protocolMessagesByOwnerId.size > 0) deps.refreshAllSyncRoutes();
    };

    /** The keys of every transport claimed for the owner, by any database. */
    const getClaimedKeys = (
      ownerId: OwnerId,
    ): ReadonlyArray<StructuralLookupKey> =>
      [...deps.transports.getResourceKeysForClaim(ownerId)].map(
        structuralLookup,
      );

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
      const usedOwnersById = getUsedOwnersById(ownerIds);
      // Opening, storing messages from another transport, a failure, and an
      // explicit request each require a new round before completion.
      for (const ownerId of usedOwnersById.keys()) {
        deps.transports.forEachResourceForClaim(ownerId, (_, transport) => {
          if (!isTargetTransport(target, transport)) return;
          getRoute(ownerId, structuralLookup(transport)).roundRequired = true;
        });
      }
      refreshSyncRoutes();
      deps.publishSyncState();
      const ownersToSync = [...usedOwnersById.values()].filter(({ id }) => {
        let hasOpenTransport = false;
        deps.transports.forEachResourceForClaim(id, (webSocket, transport) => {
          if (isTargetTransport(target, transport) && webSocket.isOpen())
            hasOpenTransport = true;
        });
        return hasOpenTransport;
      });

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

      enqueueRequest({
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
          const claimedKeys = new Set(getClaimedKeys(ownerId));
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
          refreshSyncRoutes();
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
            deps.refreshAllSyncRoutes();
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
        deps.refreshAllSyncRoutes();
        deps.publishSyncState();
        return ok();
      };

    // Response handlers can refresh routes as soon as the worker answers.
    // Initialize their state and helpers before starting it.
    disposer.defer(deps.tabLeaderPortStore.subscribe(initDbWorker));
    initDbWorker();
    // Without a tab leader, requests queue until one announces itself and its
    // DbWorker reports in. Waiting for that here would stall the registry's
    // disposal, which cannot abort a resource still being created.
    if (deps.tabLeaderPortStore.get()) await dbWorkerInited.promise;

    // Remove the tenant before any asynchronous disposal step can yield to a
    // snapshot or another tenant's route refresh.
    disposer.defer(() => {
      currentTenantsByName.delete(name);
      deps.publishSyncState();
    });
    const tenant = disposable<EvoluTenant>(
      {
        getSyncTenant: () => ({
          name,
          refused: startupError !== null,
          owners: getSyncOwners().map(
            ({ ownerId, writable, transportKeys }) => ({
              ownerId,
              writable,
              transportKeys,
              routes: writable
                ? transportKeys.map((key): TenantSyncRoute => {
                    const route = routesByOwnerIdByKey.get(key)?.get(ownerId);
                    // Registration and claim changes refresh routes before yielding.
                    // Snapshot reads must not create missing routes.
                    assertNotUndefined(route);
                    return {
                      transportKey: key,
                      complete: route.complete,
                      completeAt: route.completeAt,
                      lastSentAt: route.lastSentAt,
                      lastReceivedAt: route.lastReceivedAt,
                      error: route.error,
                    };
                  })
                : [],
            }),
          ),
        }),

        refreshSyncRoutes,

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
                deps.refreshAllSyncRoutes();
                deps.publishSyncState();
                return ok();
              }),
            );
          });

          disposer.defer(() => {
            instancesById.delete(instance.id);
            refreshSyncRoutes();
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
                enqueueRequest({
                  type: "Read",
                  request: { type: "ForEvolu", id: instance.id, message },
                });
                runQueue();
                break;
              }
              case "Mutate": {
                const replicatedOwnerIds = new Set<OwnerId>();
                for (const change of message.changes) {
                  if (!isLocalOnlyTable(change.table))
                    replicatedOwnerIds.add(change.ownerId);
                }
                enqueueRequest({
                  type: "Write",
                  request: { type: "ForEvolu", id: instance.id, message },
                  replicatedOwnerIds,
                });
                // Local-only changes create no synchronization work.
                if (replicatedOwnerIds.size > 0) {
                  refreshSyncRoutes();
                  deps.publishSyncState();
                }
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

        requestApplySyncMessage: (ownerId, inputMessage, source): void => {
          if (startupError) return;
          const owner = getUsedOwnersById(new Set([ownerId])).get(ownerId);
          if (!owner) return;

          console.debug("requestApplySyncMessage", {
            ownerId,
            source,
            byteLength: inputMessage.byteLength,
          });

          const entry: QueueEntry = {
            type: "ApplySyncMessage",
            request: {
              type: "ForSharedWorker",
              message: { type: "ApplySyncMessage", owner, inputMessage },
            },
            source,
          };
          enqueueRequest(entry);
          refreshSyncRoutes();
          deps.publishSyncState();

          runQueue();
        },
      },
      disposer,
    );
    currentTenantsByName.set(name, tenant);
    deps.publishSyncState();
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
//   Defer panicked-worker restart until failure detection and recovery are
//   defined, accounting for SQLite WASM's detection limits. Normal SQLite
//   operations are expected not to throw; user-defined UNIQUE indexes, which
//   can make replicated writes fail, are planned to be forbidden.
// - Split worker protocol types and the EvoluTenant implementation into focused
//   modules.
// - Remove the obsolete commented protocol block above.
// - Propagate invalid protocol messages to sync state.
// - Bound sync state publishing during a bulk catch-up: every sent and applied
//   frame changes a route timestamp, so each frame broadcasts a full snapshot
//   to every tab. Throttling needs a wall-clock policy and a deterministic way
//   to test it.
// - Measure sync traffic before bounding it: several tenants using one owner
//   multiply rounds, and a bulk catch-up from one relay starts up to one round
//   to each other relay per frame that stores new messages, depending on queued
//   round coalescing. Forwarding the stored messages the way mutation uploads
//   do would replace those rounds.
