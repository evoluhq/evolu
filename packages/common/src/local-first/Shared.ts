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
 * write's timestamps and then is skipped as already stored. Each worker stamps
 * with its own session NodeId, but an earlier release stamps with the NodeId
 * stored in the clock, which can be another worker's.
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
 * its tabs. Every build broadcasts console entries and errors on
 * {@link consoleEntryOrErrorBroadcastChannelName}, so a waiting tab also prints
 * the running build's output, reports each {@link UnknownError} it sends as its
 * own `evoluError`, and only logs any other error, such as an older build's
 * sync error.
 *
 * The tabs of one worker elect the host of its DbWorkers among themselves, with
 * a lock scoped to the worker, so a tab of another worker never hosts them.
 * Builds that differ only in DbWorker code share one SharedWorker, and a tab of
 * either can host its DbWorkers.
 *
 * Safari suspends, rather than ends, a worker whose tabs are all in its
 * back-forward cache, and the suspended worker keeps the lock. There, a waiting
 * build also waits until Safari drops those pages, or until the user goes back
 * to one of them, which reloads it on the web.
 *
 * ## Storage
 *
 * The tab decides whether a database is kept in memory, because of
 * {@link EvoluConfig.memoryOnly} or because the platform offers no persistent
 * storage, which a browser tells by failing to open the origin private file
 * system, as Safari's Private Browsing and Firefox's private windows do. A
 * database kept in memory has a name of its own, so all instances of a tenant
 * ask for the same mode, and every DbWorker the tenant starts, replacements
 * included, keeps it.
 *
 * Each DbWorker keeps its own memory, so when the tab hosting a database kept
 * in memory closes, or on the web navigates away, data that exists only locally
 * or has not synced yet is lost, even though its replacement starts in memory
 * too.
 *
 * ## Synchronization routing
 *
 * WebSocket transports are shared resources keyed by their configuration and
 * claimed by owner ID, so every tenant (one named local database) using an
 * owner shares that owner's sockets, whichever tenant claimed them. An incoming
 * frame is offered to every tenant with a writable registration for its owner.
 * Each stores the frame's messages, which is idempotent, but only the tenant
 * whose request a Response answers reconciles it, as Synchronization completion
 * describes.
 *
 * Traffic goes only where it is needed. A continuation returns to the transport
 * that produced the response, a round started by a socket opening or by a
 * transport's first claim for an owner goes through that transport, and a
 * tenant's first writable registration of an owner starts one through each
 * transport already claimed for it. Explicit synchronization requests and
 * mutation uploads go to every open transport claimed for the owner. A write
 * uploads through the database's writable registrations for its owner,
 * whichever instance made it, even one disposed before the database worker
 * answered. When a relay frame stores new messages, the tenant requests a round
 * through each other transport claimed for the owner, so data learned from one
 * relay reaches the others, except through a route that skipped a message it
 * received or could not send, as described below. A closed transport reconciles
 * when it opens, and a replacement leader reconciles every transport again,
 * because a response reporting stored messages may have been lost.
 *
 * Relays omit the sending socket when broadcasting an upload, so the uploader
 * also delivers it as local Broadcast frames to every other tenant with
 * writable access to the owner, even while sockets are closed. A copy keeps the
 * uploader's target, and a recipient that stores new continuation messages
 * reconciles them through the transports outside that target, except through a
 * route that skipped a message. Local delivery forwards uploads, including
 * historical messages sent during reconciliation, but does not reconcile local
 * database histories with each other. That waits until replication scopes and
 * retention semantics are defined.
 *
 * ## Sync state
 *
 * The shared worker publishes one plain snapshot, {@link SyncState}, of every
 * transport it manages and every database it holds, with the owners its
 * instances registered and, for each writable owner, one route per transport
 * claimed for the owner by any database, as specified below. Each part is a
 * union of the states the worker keeps for it: a transport's connection, a
 * database that is active or refused, a writable or readonly owner, and a
 * pending, settled, or complete route. A transport's events drive its
 * connection, so publishing never reads a socket.
 *
 * Apps show users an owner's {@link OwnerSyncStatus}, which
 * {@link syncStateToOwnerSyncStatus} derives. A view of each relay pairs each
 * route with its transport by {@link syncStateToRelaySyncStates} and tells the
 * relay's status by {@link relaySyncStateToStatus}. Snapshots store neither, so
 * a status never disagrees with the routes it comes from.
 *
 * Each worker broadcasts snapshots on its own channel, whose name a connecting
 * tab receives through its port, so a tab never hears another worker, such as
 * one of a different app version, and
 * {@link SyncStateDep.syncState | deps.syncState} keeps the last snapshot. The
 * worker publishes after every change it observes. The snapshot lives in worker
 * memory only, so a new worker starts empty.
 *
 * ## Synchronization completion
 *
 * A protocol frame carries the owner ID and the message type but nothing that
 * correlates it with a request, and a relay answers a converged round, an
 * upload that fits one frame, and an Unsubscribe alike with a header-only
 * Response. So the shared worker keeps the outstanding requests of an owner on
 * a socket from one sender at a time: a tenant, or the worker itself for an
 * Unsubscribe. A Request waits while another sender's requests are outstanding
 * or other requests wait. Once the outstanding requests are answered, the
 * sender of the oldest waiting request sends all its waiting requests, except
 * that the worker's Unsubscribe and tenants' requests never pass each other, so
 * a round that claims the owner again never goes before an earlier Unsubscribe.
 * Every Response, including a relay's version-mismatch reply, which has no
 * message type, answers the sender whose requests are outstanding, in whatever
 * order the relay answers them. An opening socket drops the outstanding and
 * waiting requests, because requests on the previous connection are never
 * answered and its rounds start again.
 *
 * Every tenant with a writable registration applies every frame for its owner,
 * so each database stores the messages any reply carries. Only the sender of
 * the requests a Response answers reconciles its ranges and may continue; the
 * others only store its messages and record any relay error it carries. If
 * every tenant continued every Response, the requests would multiply with each
 * round of a catch-up. Tenants using one owner through one socket therefore
 * take turns: a waiting request is delayed, but no request is added.
 *
 * Completion is counted: a route, one tenant's use of one owner through one
 * transport, is complete when:
 *
 * - The tenant is not refused and the socket is open.
 * - No request for the owner is outstanding or waiting on the socket.
 * - The tenant has no apply for the owner queued for that transport or for every
 *   transport, because a frame is applied asynchronously, so between a reply
 *   and its continuation the owner can have no request outstanding or waiting.
 * - The tenant has no replicated write for the owner queued, because its upload
 *   is sent only after the database worker answers it.
 * - The tenant has sent a round through the transport since the last event that
 *   requires one: the route's creation, the socket opening, an explicit
 *   request, a replacement leader, or storing messages from another transport,
 *   unless the route skipped a message. No failed result has arrived on the
 *   route since.
 * - No result that skipped a received message or a stored change too large to
 *   send has arrived on the route since a round was last requested through it,
 *   and since that request, no messages have been stored from another
 *   transport, directly or through a sibling copy uploaded outside this
 *   transport, and no sibling copy has failed to apply or skipped a message.
 *
 * A route is settled when every condition except the last holds, so a complete
 * route is settled too. A settled route that is incomplete has ended its
 * reconciliation, but its relay may offer a message the database skipped, the
 * database may store a change too large to send, or messages stored elsewhere
 * may not have reached it; it is published as {@link SettledSyncRoute}.
 *
 * A reconciliation chain, a request and the continuations its sender makes for
 * the replies, ends only with a converged result, a failure, a refusal of the
 * database, a dropped frame, a reopen, which drops its outstanding and waiting
 * requests, or a continuation that finds the socket closed, and relay errors
 * reach every applying tenant, so these conditions mean every chain this tenant
 * started through the transport since the last event that requires a round
 * converged. Another tenant's continuation can make the route pending again. A
 * local Broadcast from a sibling tenant holds every route of its owner until it
 * is applied, because it arrives without a request of its own; one that fails
 * to apply or skips a message requires a round through every transport whose
 * route has not skipped one.
 *
 * A failed result on a route requests one round through it. Any further failure
 * before the route settles requests no round of its own and waits for the next
 * round another event requests, such as an explicit request or a reopen, so a
 * persistent failure cannot loop; a converged reply in between does not end the
 * wait, because it may answer a request sent before the failure. An exception
 * while the database worker creates a round is logged there and fails the
 * round's routes with `SyncFailed` without a retry. A mutation that throws is
 * rolled back and reported as an {@link UnknownError} to the tab that made it,
 * or to every tab when its Evolu instance was disposed first. A received batch
 * SQLite fails to store, for example on a full disk, is rolled back and fails
 * its route with an `UnknownError`. An exception while the database worker
 * reconciles a received frame's ranges is logged there and fails that route
 * with `SyncFailed`. A query or an export SQLite fails is answered to the
 * instance that requested it with an {@link UnknownError}, and the instance
 * keeps the query's previous rows. Any other exception in the database worker,
 * such as a response it cannot post, refuses the database with an
 * {@link UnknownError}. A frame the relay silently drops, such as invalid data,
 * leaves its request outstanding, and the requests of other databases for its
 * owner on that socket, uploads included, waiting, until the liveness rule
 * below replaces the socket and the reopen's rounds reconcile them.
 *
 * A result that skipped a message records the error on the route as its
 * `skippedError`, without ending its chain, so it requests no round. A message
 * is skipped in two cases:
 *
 * - The relay offers a message the database could not decrypt, verify, or decode.
 *   The relay offers it again in every round through the route until the
 *   database stores a message with that timestamp.
 * - The database stores a change it cannot send, a
 *   {@link ProtocolChangeTooLargeError}: one saved before `maxMutationSize`
 *   existed, or a crafted one received from a relay. Every route through a
 *   relay that lacks it skips it on every sync, so each such route stays
 *   settled.
 *
 * The messages received elsewhere that the last condition names request no
 * round through such a route, even while a requested round checks it again,
 * because each round would download every skipped message again, or skip again
 * a change too large to send. The next round that an explicit request, a
 * reopen, a replacement leader, or a failure sends through the route reconciles
 * them. So while the database stores a change too large to send, messages from
 * other relays reach a route only through such a round, for example after a
 * reconnect or {@link Evolu.requestSync}.
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
 * database that is not refused has an unsettled route through it, including one
 * waiting after a failure, and ends with the transport. A settled route that is
 * incomplete does not count, because its reconciliation has ended. A reply's
 * speed proves nothing, because a recovery on a slow link starts with small
 * replies that arrive quickly. The reopen drops the outstanding and waiting
 * requests and starts the open rounds, so a dropped frame delays a route
 * instead of stranding it.
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
import {
  createXChaCha20Poly1305,
  type DecryptWithXChaCha20Poly1305Error,
  type EncryptionKey,
  type XChaCha20Poly1305Dep,
} from "../Crypto.ts";
import { createUnknownError, type UnknownError } from "../Error.ts";
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
import { ok, trySync, type Result } from "../Result.ts";
import type { NonEmptyReadonlySet } from "../Set.ts";
import type { SqliteSchema } from "../Sqlite.ts";
import { createStore, type Store } from "../Store.ts";
import { safelyStringifyUnknownValue } from "../String.ts";
import { createMutex, unabortable, type Task } from "../Task.ts";
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
} from "../WebSocket.ts";
import type {
  BroadcastChannel,
  SharedWorker as CommonSharedWorker,
  CreateBroadcastChannelDep,
  CreateMessageChannelDep,
  CreateMessagePortDep,
  MessagePort,
  NativeMessagePort,
  SharedWorkerSelf,
  WorkerDeps,
} from "../Worker.ts";
import type {
  DatabaseHeldError,
  DbWorkerInit,
  UnsupportedDbVersionError,
} from "./Db.ts";
import type { Evolu, EvoluConfig, SyncStateDep } from "./Evolu.ts";
import type {
  Owner,
  OwnerId,
  OwnerTransport,
  RelayUrl,
  SyncOwner,
} from "./Owner.ts";
import {
  createProtocolBroadcastMessagesFromCrdtMessages,
  createProtocolMessageForUnsubscribe,
  createProtocolMessageFromCrdtMessages,
  MessageType,
  parseProtocolHeader,
  type ApplyProtocolMessageAsClientResult,
  type ProtocolChangeTooLargeError,
  type ProtocolError,
  type ProtocolInvalidDataError,
  type ProtocolMessage,
  type ProtocolQuotaError,
  type ProtocolTimestampMismatchError,
} from "./Protocol.ts";
import { makePatches, type Patch, type Query, type Row } from "./Query.ts";
import { isLocalOnlyTable, type MutationChange } from "./Schema.ts";
import type { CrdtMessage, StorageWriteMessagesError } from "./Storage.ts";
import {
  createInitialTimestamp,
  orderTimestamp,
  type Timestamp,
} from "./Timestamp.ts";

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

export type EvoluInstanceId = Id & Brand<"EvoluInstance">;

export type SharedWorkerOutput =
  | DbWorkerInit
  | {
      /**
       * Sent to one tab only: its database is refused, a mutation it made could
       * not be stored, or another build keeps this worker waiting.
       */
      readonly type: "Error";
      readonly error:
        | DatabaseHeldError
        | OtherBuildRunningError
        | UnknownError
        | UnsupportedDbVersionError;
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
      readonly error: UnknownError;
    };

export const consoleEntryOrErrorBroadcastChannelName =
  "evolu:console-entry-or-error";

/**
 * Posts a {@link ConsoleEntry} to tabs on a channel named
 * {@link consoleEntryOrErrorBroadcastChannelName}.
 *
 * An argument that cannot be structured-cloned is replaced: an `Error` by the
 * plain object {@link createUnknownError} makes of it, and any other value, such
 * as an object holding a function, by a string. Logging such a value in a
 * worker therefore does not throw.
 */
export const postConsoleEntry = (
  channel: BroadcastChannel<ConsoleEntryOrError>,
  entry: ConsoleEntry,
): void => {
  // A native BroadcastChannel throws a DataCloneError synchronously, into
  // whatever called the console.
  const posted = trySync(() =>
    channel.postMessage({ type: "ConsoleEntry", entry }),
  );
  if (posted.ok) return;
  channel.postMessage({
    type: "ConsoleEntry",
    entry: {
      ...entry,
      args: entry.args.map((arg) => {
        if (trySync(() => structuredClone(arg)).ok) return arg;
        return arg instanceof Error
          ? createUnknownError(arg).error
          : safelyStringifyUnknownValue(arg);
      }),
    },
  });
};

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
 * A snapshot of the transports and databases the shared worker manages. Each
 * part is a union of the states the worker keeps for it, so each part holds
 * only the fields valid for its state. Apps derive what to show with
 * {@link syncStateToOwnerSyncStatus}; see Sync state in this module's
 * documentation.
 */
export interface SyncState {
  readonly transports: ReadonlyArray<SyncTransport>;
  readonly tenants: ReadonlyArray<SyncTenant>;
}

/**
 * One transport, shared by every owner and database claiming it. Its `type` is
 * the kind of transport, and its {@link SyncConnection} tells whether it is
 * connected.
 */
export type SyncTransport = WebSocketSyncTransport;

/** A WebSocket {@link SyncTransport}. */
export interface WebSocketSyncTransport extends Typed<"WebSocket"> {
  /** Opaque and stable for the transport's lifetime, across reconnects. */
  readonly id: SyncTransportId;
  /** The relay URL without the owner-specific query. */
  readonly label: RelayUrl;
  readonly connection: SyncConnection;
}

export type SyncTransportId = Id & Brand<"SyncTransport">;

export interface SyncTransportError {
  readonly type: WebSocketError["type"];
  readonly at: Millis;
}

/**
 * The connection of a {@link SyncTransport}: `Connecting` until its first
 * connection opens or fails, `Open` while a connection is open, and
 * `Disconnected` from a close, a failure, or an unanswered request that
 * replaced the connection, until a connection opens again. It never returns to
 * `Connecting`. The transport's events drive these states.
 */
export type SyncConnection =
  ConnectingSyncConnection | OpenSyncConnection | DisconnectedSyncConnection;

/**
 * A first connection, which has neither opened nor failed. A connection to a
 * host that drops packets stays here until the operating system or browser
 * gives up on it, which can take a minute or more.
 */
export interface ConnectingSyncConnection extends Typed<"Connecting"> {}

/** An open connection. */
export interface OpenSyncConnection extends Typed<"Open"> {
  /** When this connection opened. */
  readonly openedAt: Millis;
  /** The last error of an earlier connection or attempt, or null. */
  readonly error: SyncTransportError | null;
}

/**
 * No connection: a connection closed or failed, or the relay did not answer a
 * request in time. The transport reconnects by itself.
 */
export interface DisconnectedSyncConnection extends Typed<"Disconnected"> {
  /** When it disconnected. Failed reconnect attempts leave it unchanged. */
  readonly disconnectedAt: Millis;
  /** When the last connection opened, or null when none has. */
  readonly openedAt: Millis | null;
  /**
   * The last error, or null. A close or an unanswered request records none, so
   * it can come from an earlier connection. Errors while reconnecting are
   * routine.
   */
  readonly error: SyncTransportError | null;
}

/**
 * One named local database: `Active`, or `Refused` when it refused startup or
 * its worker failed.
 */
export type SyncTenant = ActiveSyncTenant | RefusedSyncTenant;

/**
 * A database that is not refused, including one still starting, with the owners
 * its instances registered.
 */
export interface ActiveSyncTenant extends Typed<"Active"> {
  readonly name: Name;
  readonly owners: ReadonlyArray<SyncTenantOwner>;
}

/**
 * A database that refused startup or whose worker failed, so nothing it holds
 * syncs. Its tabs also receive the error through `evoluError`. A failed worker
 * refuses its database with an {@link UnknownError}.
 */
export interface RefusedSyncTenant extends Typed<"Refused"> {
  readonly name: Name;
  readonly error: DatabaseHeldError | UnknownError | UnsupportedDbVersionError;
}

/**
 * An owner registered by any instance of an {@link ActiveSyncTenant}: `Writable`
 * when any registration holds its write key, otherwise `Readonly`.
 */
export type SyncTenantOwner = WritableSyncTenantOwner | ReadonlySyncTenantOwner;

/**
 * An owner the database syncs, with one route per transport claimed for it by
 * this or any other database. Routes are briefly empty while the owner's
 * transports are being claimed.
 */
export interface WritableSyncTenantOwner extends Typed<"Writable"> {
  readonly ownerId: OwnerId;
  readonly routes: ReadonlyArray<SyncRoute>;
}

/**
 * An owner registered only without its write key. Its registrations hold
 * transports, which other databases' routes for the owner use, but this
 * database does not sync it.
 */
export interface ReadonlySyncTenantOwner extends Typed<"Readonly"> {
  readonly ownerId: OwnerId;
  /** Every transport claimed for the owner, by any database. */
  readonly transportIds: ReadonlyArray<SyncTransportId>;
}

/**
 * One database's use of one owner through one transport: `Pending` until its
 * reconciliation ends, then `Complete`, or `Settled` while it skips a change:
 * one its relay offers that the database could not store, or one the database
 * stores but cannot send. See Synchronization completion in this module's
 * documentation.
 */
export type SyncRoute = PendingSyncRoute | SettledSyncRoute | CompleteSyncRoute;

/**
 * A route whose reconciliation has not ended: its transport is not open, a
 * request or a received frame is outstanding, a replicated write is queued, or
 * a round must still be sent through it.
 */
export interface PendingSyncRoute extends Typed<"Pending"> {
  readonly transportId: SyncTransportId;
  /**
   * The failure since the route last settled, or null. The first failure in a
   * reply requests one round through the route; a later one, or a failure to
   * create a round, waits for the next round another event requests, such as
   * {@link Evolu.requestSync} or a reopen.
   */
  readonly failure: SyncRouteError | null;
  /**
   * The first change skipped in the latest reply that skipped one, or null. A
   * change the relay offers is offered again in every round through the route
   * until this database stores a change with that timestamp. A
   * {@link ProtocolChangeTooLargeError} is a change this database stores but
   * cannot send, which every route through a relay that lacks it skips on every
   * sync.
   */
  readonly skippedError: SyncRouteError | null;
  /** When the route last became complete, or null. */
  readonly completeAt: Millis | null;
  /** When this database last sent a request through the route, or null. */
  readonly lastSentAt: Millis | null;
  /**
   * When processing a frame from the route last finished, successfully or with
   * a failure, or null.
   */
  readonly lastReceivedAt: Millis | null;
}

/**
 * A route whose reconciliation ended with a skipped change, so it is
 * incomplete: its relay offers a change the database could not store, or the
 * database stores a change it cannot send, a
 * {@link ProtocolChangeTooLargeError}. Changes stored from other relays request
 * no round through it; the next round requested through it, such as by
 * {@link Evolu.requestSync} or a reopen, checks it again. Every route through a
 * relay that lacks a change too large to send skips it on every sync, so those
 * routes stay settled, and messages from other relays reach them only through
 * such rounds.
 */
export interface SettledSyncRoute extends Typed<"Settled"> {
  readonly transportId: SyncTransportId;
  /** The first change skipped in the latest reply that skipped one. */
  readonly skippedError: SyncRouteError;
  /** When the route last became complete, or null. */
  readonly completeAt: Millis | null;
  /** When this database last sent a request through the route. */
  readonly lastSentAt: Millis;
  /**
   * When processing a frame from the route last finished. Never null, because
   * the reply that skipped the change set it.
   */
  readonly lastReceivedAt: Millis;
}

/** A route on which the database is reconciled with the relay for the owner. */
export interface CompleteSyncRoute extends Typed<"Complete"> {
  readonly transportId: SyncTransportId;
  /** When the route became complete. */
  readonly completeAt: Millis;
  /** When this database last sent a request through the route. */
  readonly lastSentAt: Millis;
  /** When processing a frame from the route last finished, or null. */
  readonly lastReceivedAt: Millis | null;
}

/**
 * A failure or a skipped change of a {@link SyncRoute}, with the time it
 * arrived.
 *
 * It is the error itself, so it carries its details, such as the expected and
 * actual timestamps of a {@link ProtocolTimestampMismatchError}. A skipped
 * message adds {@link DecryptWithXChaCha20Poly1305Error} and
 * {@link ProtocolChangeTooLargeError}. An {@link UnknownError} means SQLite
 * failed to store received messages, for example on a full disk. `WriteFailed`
 * means a `writeMessages` call that threw, logged by the protocol, and
 * `SyncFailed` means a logged failure while creating a round or reconciling
 * ranges.
 */
export type SyncRouteError = (
  | Exclude<ProtocolError, ProtocolInvalidDataError>
  | (Omit<ProtocolInvalidDataError, "error"> & {
      readonly error: UnknownError;
    })
  | StorageWriteMessagesError
  | (Omit<DecryptWithXChaCha20Poly1305Error, "error"> & {
      readonly error: UnknownError;
    })
  | ProtocolChangeTooLargeError
  | Typed<"WriteFailed">
  | Typed<"SyncFailed">
) & { readonly at: Millis };

/**
 * One relay of an owner in one database: a transport and the database's route
 * through it, from {@link syncStateToRelaySyncStates}. Its status comes from
 * {@link relaySyncStateToStatus} and is not stored beside them.
 */
export interface RelaySyncState {
  readonly transport: SyncTransport;
  readonly route: SyncRoute;
}

/**
 * What an app shows users about syncing one owner of one database, from
 * {@link syncStateToOwnerSyncStatus} or the React and Vue `useOwnerSyncStatus`.
 *
 * Its variants:
 *
 * - `NoRelays`: nothing syncs the owner here. There is no snapshot yet, the
 *   owner's transports are still being set up, the app uses no relays for it,
 *   it is registered only as readonly, or the database is refused, which
 *   `evoluError` reports.
 * - `Syncing`: a relay connects for the first time or reconciles. A first
 *   connection to a host that drops packets stays `Syncing` until the platform
 *   gives up on it, which can take a minute.
 * - `Synced`: a relay is up to date, and none syncs.
 * - `Offline`: every relay is disconnected. Evolu keeps reconnecting, up to 30
 *   seconds apart, so `Offline` can briefly outlast the outage.
 * - `Error`: a relay failed, a relay offers a change this database skipped, or
 *   this database stores a change too large to send. `error` is the newest
 *   failure, or without one, the newest skipped change: a failure stops syncing
 *   through its relay, while a skipped change leaves out only that change.
 *
 * Evolu stores changes in the local database before they sync, so sync needs no
 * UI while it works: show nothing for `NoRelays`, `Syncing`, and `Synced`. An
 * indicator that changes with every edit distracts, and screen readers announce
 * each change.
 *
 * For `Offline` and `Error`, show one quiet line that lasts as long as the
 * status, not a dialog, which interrupts, or a toast, which disappears while
 * the problem lasts. Do not say that changes are saved on this device unless
 * {@link Evolu.devicePersistence} is `Persisted`: a browser may keep them only
 * for a private session or delete them later. Evolu reports `Offline` at once;
 * an app may wait a few seconds before showing it, because brief
 * disconnections, such as waking from sleep, reconnect quickly. For `Error`,
 * write actionable text for the error types the app can act on, such as a
 * {@link ProtocolQuotaError}: the relay stores no more data for the owner, so
 * offer more quota, such as a plan upgrade, then call {@link Evolu.requestSync}
 * with the owner's ID. For any other error, show generic text that names the
 * error type, which helps when the user reports it.
 *
 * Render the line inside one element with `role="status"` that stays mounted:
 * screen readers announce changes only in a live region that already exists,
 * and a polite announcement fits a status that loses nothing. Do not use
 * `role="alert"`.
 *
 * Show the app owner's status once for the whole app, such as below the header,
 * and another owner's status where the app shows that owner's data. Each Evolu
 * instance finds its own status by {@link Evolu.name}, so an app with several
 * databases shows the status of the one the user works in.
 *
 * ### Example
 *
 * ```ts
 * import { assertEqual, Millis } from "@evolu/common";
 * import {
 *   testAppOwner,
 *   type OwnerSyncStatus,
 * } from "@evolu/common/local-first";
 *
 * // What to tell the user, or null while sync works or is not used.
 * const syncStatusToMessage = (status: OwnerSyncStatus): string | null => {
 *   switch (status.type) {
 *     case "NoRelays":
 *     case "Syncing":
 *     case "Synced":
 *       return null;
 *     case "Offline":
 *       return "Offline. Changes will sync when you're back online.";
 *     case "Error":
 *       return status.error.type === "ProtocolQuotaError"
 *         ? "Sync is paused because the sync server is full."
 *         : `Sync error: ${status.error.type}.`;
 *   }
 * };
 *
 * assertEqual(syncStatusToMessage({ type: "Synced" }), null);
 * assertEqual(
 *   syncStatusToMessage({ type: "Offline" }),
 *   "Offline. Changes will sync when you're back online.",
 * );
 * assertEqual(
 *   syncStatusToMessage({
 *     type: "Error",
 *     error: {
 *       type: "ProtocolQuotaError",
 *       ownerId: testAppOwner.id,
 *       at: Millis.orThrow(1000),
 *     },
 *   }),
 *   "Sync is paused because the sync server is full.",
 * );
 * assertEqual(
 *   syncStatusToMessage({
 *     type: "Error",
 *     error: { type: "SyncFailed", at: Millis.orThrow(1000) },
 *   }),
 *   "Sync error: SyncFailed.",
 * );
 * ```
 */
export type OwnerSyncStatus = NoRelaysSyncStatus | RelaySyncStatus;

/**
 * The status of a {@link RelaySyncState}, from {@link relaySyncStateToStatus}:
 * `Error` when its route has a failure or a skipped change, the failure first;
 * otherwise `Synced` when the route is complete, `Syncing` while the
 * transport's connection is `Connecting` or `Open`, and `Offline` while it is
 * `Disconnected`.
 */
export type RelaySyncStatus =
  SyncingSyncStatus | SyncedSyncStatus | OfflineSyncStatus | ErrorSyncStatus;

/** Evolu reports no relay syncing the owner in the database. */
export interface NoRelaysSyncStatus extends Typed<"NoRelays"> {}

/** A relay makes its first connection or reconciles. */
export interface SyncingSyncStatus extends Typed<"Syncing"> {}

/** A relay is reconciled with the database for the owner. */
export interface SyncedSyncStatus extends Typed<"Synced"> {}

/** Relays are disconnected and reconnecting, so changes wait on this device. */
export interface OfflineSyncStatus extends Typed<"Offline"> {}

/** A route failed or holds a change the database skipped. */
export interface ErrorSyncStatus extends Typed<"Error"> {
  /**
   * The failure, or without one, the skipped change. For an owner, the newest
   * failure of any relay, or without one, the newest skipped change.
   */
  readonly error: SyncRouteError;
}

/**
 * Tells what an app shows about syncing an owner in a database: `Error` when a
 * relay has one, holding the newest failure of any relay or, without one, the
 * newest skipped change; otherwise the first of `Syncing`, `Synced`, and
 * `Offline` that a relay has, or `NoRelays`. Accepts null, the store's value
 * before the first snapshot. See {@link OwnerSyncStatus} for what to show.
 *
 * The same status is the same object: statuses other than `Error` are shared
 * constants, and an `Error` status is the same object for the same error
 * object, which {@link SyncStateDep.syncState} keeps between snapshots while it
 * is unchanged. So compare statuses with `===`.
 *
 * ### Example
 *
 * ```ts
 * import {
 *   assertEqual,
 *   assertSame,
 *   createId,
 *   createUnknownError,
 *   Millis,
 *   testCreateDeps,
 *   testName,
 * } from "@evolu/common";
 * import {
 *   RelayUrl,
 *   syncStateToOwnerSyncStatus,
 *   testAppOwner,
 *   type PendingSyncRoute,
 *   type SyncConnection,
 *   type SyncRoute,
 *   type SyncState,
 *   type SyncTransportId,
 * } from "@evolu/common/local-first";
 *
 * const deps = testCreateDeps();
 * const primaryId = createId<"SyncTransport">(deps);
 * const backupId = createId<"SyncTransport">(deps);
 *
 * const stateOf = (
 *   connections: ReadonlyArray<SyncConnection>,
 *   routes: ReadonlyArray<SyncRoute>,
 * ): SyncState => ({
 *   transports: connections.map((connection, index) => ({
 *     type: "WebSocket",
 *     id: index === 0 ? primaryId : backupId,
 *     label: RelayUrl.orThrow("wss://relay.example/"),
 *     connection,
 *   })),
 *   tenants: [
 *     {
 *       type: "Active",
 *       name: testName,
 *       owners: [{ type: "Writable", ownerId: testAppOwner.id, routes }],
 *     },
 *   ],
 * });
 * const pending = (transportId: SyncTransportId): PendingSyncRoute => ({
 *   type: "Pending",
 *   transportId,
 *   failure: null,
 *   skippedError: null,
 *   completeAt: null,
 *   lastSentAt: null,
 *   lastReceivedAt: null,
 * });
 * const statusOf = (state: SyncState | null) =>
 *   syncStateToOwnerSyncStatus(state, testName, testAppOwner.id);
 *
 * // Before the first snapshot, nothing syncs the owner.
 * assertEqual(statusOf(null), { type: "NoRelays" });
 *
 * // A first connection is syncing; a lost one is offline.
 * const connecting: SyncConnection = { type: "Connecting" };
 * assertEqual(statusOf(stateOf([connecting], [pending(primaryId)])), {
 *   type: "Syncing",
 * });
 * const disconnected: SyncConnection = {
 *   type: "Disconnected",
 *   disconnectedAt: Millis.orThrow(2000),
 *   openedAt: Millis.orThrow(1000),
 *   error: null,
 * };
 * assertEqual(statusOf(stateOf([disconnected], [pending(primaryId)])), {
 *   type: "Offline",
 * });
 *
 * // A quota failure on one relay shows before a newer skipped change on
 * // another, because the app can act on it.
 * const quotaError = {
 *   type: "ProtocolQuotaError",
 *   ownerId: testAppOwner.id,
 *   at: Millis.orThrow(3000),
 * } as const;
 * const open: SyncConnection = {
 *   type: "Open",
 *   openedAt: Millis.orThrow(3400),
 *   error: null,
 * };
 * assertEqual(
 *   statusOf(
 *     stateOf(
 *       [disconnected, open],
 *       [
 *         { ...pending(primaryId), failure: quotaError },
 *         {
 *           type: "Settled",
 *           transportId: backupId,
 *           skippedError: {
 *             type: "DecryptWithXChaCha20Poly1305Error",
 *             error: createUnknownError(new Error("invalid tag")),
 *             at: Millis.orThrow(4000),
 *           },
 *           completeAt: null,
 *           lastSentAt: Millis.orThrow(3500),
 *           lastReceivedAt: Millis.orThrow(4000),
 *         },
 *       ],
 *     ),
 *   ),
 *   { type: "Error", error: quotaError },
 * );
 *
 * // The same error gives the same status object.
 * const quotaState = stateOf(
 *   [disconnected],
 *   [{ ...pending(primaryId), failure: quotaError }],
 * );
 * assertSame(statusOf(quotaState), statusOf(quotaState));
 * ```
 */
export const syncStateToOwnerSyncStatus = (
  state: SyncState | null,
  name: Name,
  ownerId: OwnerId,
): OwnerSyncStatus => {
  let failure: SyncRouteError | null = null;
  let skippedError: SyncRouteError | null = null;
  let isSyncing = false;
  let isSynced = false;
  let isOffline = false;
  for (const relay of syncStateToRelaySyncStates(state, name, ownerId)) {
    const { route } = relay;
    // A failure stops syncing through its relay, and a skipped change is
    // stamped again by every reply that skips it, so a newer skipped change
    // must not hide an older failure the app can act on.
    if (
      route.type === "Pending" &&
      route.failure &&
      (!failure || route.failure.at > failure.at)
    )
      failure = route.failure;
    if (
      route.type !== "Complete" &&
      route.skippedError &&
      (!skippedError || route.skippedError.at > skippedError.at)
    )
      skippedError = route.skippedError;
    const status = relaySyncStateToStatus(relay);
    switch (status.type) {
      case "Error":
        break;
      case "Syncing":
        isSyncing = true;
        break;
      case "Synced":
        isSynced = true;
        break;
      case "Offline":
        isOffline = true;
        break;
      default:
        exhaustiveCheck(status);
    }
  }
  const error = failure ?? skippedError;
  return error
    ? syncRouteErrorToSyncStatus(error)
    : isSyncing
      ? syncingSyncStatus
      : isSynced
        ? syncedSyncStatus
        : isOffline
          ? offlineSyncStatus
          : noRelaysSyncStatus;
};

/**
 * Pairs each route of an owner in a database with its transport, in route
 * order. Returns none for a null snapshot, a missing or refused database, and a
 * missing or readonly owner.
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
 *   relaySyncStateToStatus,
 *   RelayUrl,
 *   syncStateToRelaySyncStates,
 *   testAppOwner,
 *   type SyncRoute,
 *   type SyncState,
 *   type SyncTransport,
 * } from "@evolu/common/local-first";
 *
 * const deps = testCreateDeps();
 * const transport: SyncTransport = {
 *   type: "WebSocket",
 *   id: createId<"SyncTransport">(deps),
 *   label: RelayUrl.orThrow("wss://relay.example/"),
 *   connection: {
 *     type: "Open",
 *     openedAt: Millis.orThrow(800),
 *     error: null,
 *   },
 * };
 * const route: SyncRoute = {
 *   type: "Complete",
 *   transportId: transport.id,
 *   completeAt: Millis.orThrow(1000),
 *   lastSentAt: Millis.orThrow(900),
 *   lastReceivedAt: Millis.orThrow(1000),
 * };
 * const state: SyncState = {
 *   transports: [transport],
 *   tenants: [
 *     {
 *       type: "Active",
 *       name: testName,
 *       owners: [
 *         { type: "Writable", ownerId: testAppOwner.id, routes: [route] },
 *       ],
 *     },
 *   ],
 * };
 *
 * const relays = syncStateToRelaySyncStates(
 *   state,
 *   testName,
 *   testAppOwner.id,
 * );
 * assertEqual(relays, [{ transport, route }]);
 * assertEqual(relays.map(relaySyncStateToStatus), [{ type: "Synced" }]);
 * assertEqual(
 *   syncStateToRelaySyncStates(null, testName, testAppOwner.id),
 *   [],
 * );
 * ```
 */
export const syncStateToRelaySyncStates = (
  state: SyncState | null,
  name: Name,
  ownerId: OwnerId,
): ReadonlyArray<RelaySyncState> => {
  const tenant = state?.tenants.find((tenant) => tenant.name === name);
  if (!state || tenant?.type !== "Active") return emptyArray;
  const owner = tenant.owners.find((owner) => owner.ownerId === ownerId);
  if (owner?.type !== "Writable") return emptyArray;
  return owner.routes.map((route) => {
    // A snapshot lists the transport of every route.
    const transport = state.transports.find(
      ({ id }) => id === route.transportId,
    );
    assertNonNullable(transport);
    return { transport, route };
  });
};

/** Tells the status of one relay; a failure shows before a skipped change. */
export const relaySyncStateToStatus = ({
  transport,
  route,
}: RelaySyncState): RelaySyncStatus => {
  switch (route.type) {
    case "Complete":
      return syncedSyncStatus;
    case "Settled":
      return syncRouteErrorToSyncStatus(route.skippedError);
    case "Pending": {
      const error = route.failure ?? route.skippedError;
      if (error) return syncRouteErrorToSyncStatus(error);
      return transport.connection.type === "Disconnected"
        ? offlineSyncStatus
        : syncingSyncStatus;
    }
  }
};

// Every status keeps its reference while it is unchanged, so bindings compare
// statuses with `===`. The store shares an unchanged error object between
// snapshots, and an error gives the same Error status object.
const noRelaysSyncStatus: NoRelaysSyncStatus = { type: "NoRelays" };
const syncingSyncStatus: SyncingSyncStatus = { type: "Syncing" };
const syncedSyncStatus: SyncedSyncStatus = { type: "Synced" };
const offlineSyncStatus: OfflineSyncStatus = { type: "Offline" };
const errorSyncStatusByError = /*#__PURE__*/ new WeakMap<
  SyncRouteError,
  ErrorSyncStatus
>();

const syncRouteErrorToSyncStatus = (error: SyncRouteError): ErrorSyncStatus => {
  let status = errorSyncStatusByError.get(error);
  if (!status) {
    status = { type: "Error", error };
    errorSyncStatusByError.set(error, status);
  }
  return status;
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
      /**
       * Each query with patches of its rows, or SQLite's failure, which keeps
       * the query's previous rows.
       */
      readonly patchesByQuery: ReadonlyMap<
        Query,
        Result<ReadonlyArray<Patch>, UnknownError>
      >;
      readonly onCompleteIds: ReadonlyArray<Id>;
    }
  | {
      readonly type: "RefreshQueries";
    }
  | {
      readonly type: "OnExport";
      readonly file: Uint8Array<ArrayBuffer>;
    }
  | {
      readonly type: "OnExportFailed";
      readonly error: UnknownError;
    }
  | {
      /** The mutation with these onComplete callbacks could not be stored. */
      readonly type: "OnMutateFailed";
      readonly onCompleteIds: ReadonlyArray<Id>;
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
        /**
         * Whether the database may answer the frame with a continuation. A
         * relay's Response to another database's request continues that
         * database's reconciliation, so this one only stores its messages and
         * reports any relay error.
         */
        readonly continues: boolean;
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
      readonly clock: Timestamp;
    }
  | {
      /**
       * The worker refused startup or failed and is releasing its resources. It
       * is the worker's last message on its port and can follow
       * `LeaderAcquired`. On the web, the tab that hosts a worker whose script
       * failed to load posts it in the worker's place, as the port's only
       * message.
       */
      readonly type: "LeaderRefused";
      readonly error:
        DatabaseHeldError | UnknownError | UnsupportedDbVersionError;
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
            /** The subscribed queries, each with its rows or SQLite's failure. */
            readonly rowsByQuery: ReadonlyMap<
              Query,
              Result<ReadonlyArray<Row>, UnknownError>
            >;
          }
        | {
            /** The mutation threw, so it rolled back and nothing was stored. */
            readonly type: "MutateFailed";
            readonly error: UnknownError;
          }
        | {
            readonly type: "Query";
            /** Each query with its rows or SQLite's failure. */
            readonly rowsByQuery: ReadonlyMap<
              Query,
              Result<ReadonlyArray<Row>, UnknownError>
            >;
          }
        | {
            readonly type: "Export";
            readonly file: Uint8Array<ArrayBuffer>;
          }
        | {
            /** SQLite failed the export; nothing changed. */
            readonly type: "ExportFailed";
            readonly error: UnknownError;
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
            /**
             * The first error of a message the DbWorker skipped, or null: a
             * received one it did not store while storing the rest, or a stored
             * change too large to send. It does not end the round.
             */
            readonly skippedError:
              | DecryptWithXChaCha20Poly1305Error
              | ProtocolInvalidDataError
              | ProtocolTimestampMismatchError
              | ProtocolChangeTooLargeError
              | null;
            readonly result: Result<
              ApplyProtocolMessageAsClientResult,
              ProtocolError | StorageWriteMessagesError
            >;
          };
    };

export type SharedWorkerDeps = WorkerDeps &
  CreateBroadcastChannelDep &
  CreateMessageChannelDep &
  CreateWebSocketDep &
  LockManagerDep &
  Partial<XChaCha20Poly1305Dep>;

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

  readonly getSyncTenant: () => SyncTenant;

  /**
   * Whether this tenant applies sync messages for the owner: an instance has a
   * writable registration for it, and the database was not refused.
   */
  readonly isApplyingOwner: (ownerId: OwnerId) => boolean;

  readonly refreshSyncRoutes: () => void;

  readonly requestCreateSyncMessages: (
    ownerIds: ReadonlySet<OwnerId>,
    target: SyncTarget,
  ) => void;

  readonly requestApplySyncMessage: (
    ownerId: OwnerId,
    inputMessage: Uint8Array,
    source: ApplySyncMessageSource,
    continues: boolean,
  ) => void;
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

const connectingSyncConnection: ConnectingSyncConnection = {
  type: "Connecting",
};

/**
 * A connection already disconnected keeps when it disconnected, so failed
 * reconnect attempts only record their error.
 */
const disconnectSyncConnection = (
  connection: SyncConnection,
  at: Millis,
  error: SyncTransportError | null,
): DisconnectedSyncConnection => {
  switch (connection.type) {
    case "Connecting":
      return {
        type: "Disconnected",
        disconnectedAt: at,
        openedAt: null,
        error,
      };
    case "Open":
      return {
        type: "Disconnected",
        disconnectedAt: at,
        openedAt: connection.openedAt,
        error: error ?? connection.error,
      };
    case "Disconnected":
      return error ? { ...connection, error } : connection;
  }
};

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

/**
 * A tenant's progress toward completing a route, per the Synchronization
 * completion rules. Events move the route to `Pending`, which keeps what the
 * route must remember until it settles, except that messages stored elsewhere
 * leave a `Settled` route settled. Refreshing the routes settles a `Pending`
 * route once the tenant's reconciliation conditions hold, and returns a settled
 * or complete route to `Pending` when they no longer hold.
 */
type RouteProgress = PendingRoute | SettledRoute | CompleteRoute;

/**
 * A route whose reconciliation has not ended, or has not been evaluated since
 * an event.
 */
interface PendingRoute extends Typed<"Pending"> {
  /** A round must be sent through the route before it can settle. */
  readonly roundRequired: boolean;
  /**
   * The failure since the route settled, or null. A further failure requests no
   * round until the route settles.
   */
  readonly failure: SyncRouteError | null;
  /** The route's skipped message, or null. */
  readonly skip: RouteSkip | null;
  /** When the route last became complete, or null. */
  readonly completeAt: Millis | null;
}

/**
 * A message a route skipped: one its relay offers that the database could not
 * store, which the relay offers again in every round, or one the database
 * stores but cannot send, which every round skips again. So messages received
 * elsewhere request no round through the route.
 */
interface RouteSkip {
  readonly error: SyncRouteError;
  /**
   * A round was requested through the route since the skip, and no messages
   * received elsewhere have been stored since that request, so the route
   * completes if it settles first.
   */
  readonly isRechecking: boolean;
}

/**
 * A route whose reconciliation has ended, but which is incomplete: its relay
 * may offer a skipped message, the database may store a change too large to
 * send, or the relay may lack messages stored elsewhere.
 */
interface SettledRoute extends Typed<"Settled"> {
  readonly skippedError: SyncRouteError;
  readonly completeAt: Millis | null;
}

interface CompleteRoute extends Typed<"Complete"> {
  readonly completeAt: Millis;
}

const routeToPending = (progress: RouteProgress): PendingRoute => {
  switch (progress.type) {
    case "Pending":
      return progress;
    case "Settled":
    case "Complete":
      return {
        type: "Pending",
        roundRequired: false,
        failure: null,
        skip:
          progress.type === "Settled"
            ? { error: progress.skippedError, isRechecking: false }
            : null,
        completeAt: progress.completeAt,
      };
  }
};

/**
 * Converts an error to a {@link SyncRouteError}: a caught value becomes an
 * {@link UnknownError}.
 */
const errorToSyncRouteError = (
  error:
    | ProtocolError
    | StorageWriteMessagesError
    | DecryptWithXChaCha20Poly1305Error
    | ProtocolChangeTooLargeError
    | Typed<"WriteFailed">
    | Typed<"SyncFailed">,
  at: Millis,
): SyncRouteError => {
  if (
    error.type === "ProtocolInvalidDataError" ||
    error.type === "DecryptWithXChaCha20Poly1305Error"
  )
    return { ...error, error: createUnknownError(error.error), at };
  return { ...error, at };
};

const failRoute = (
  progress: RouteProgress,
  failure: SyncRouteError,
): PendingRoute => ({
  ...routeToPending(progress),
  roundRequired: true,
  failure,
});

type EvoluTenantDeps = CreateMessageChannelDep &
  CreateMessagePortDep &
  GetSyncTransportIdDep &
  LockManagerDep &
  PostConsoleEntryOrErrorDep &
  PublishSyncStateDep &
  RefreshAllSyncRoutesDep &
  SyncRequestsDep &
  TabLeaderPortStoreDep &
  TransportsDep &
  XChaCha20Poly1305Dep;

interface GetSyncTransportIdDep {
  /** Returns the ID of a claimed transport, which always exists. */
  readonly getSyncTransportId: (key: StructuralLookupKey) => SyncTransportId;
}

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
   * Sends a Request on an open socket for its sender: a tenant, or null for the
   * worker's own Unsubscribe. While another sender's requests for the owner are
   * outstanding on the socket, or other requests wait, it waits for its
   * sender's turn. The caller refreshes every tenant's routes once after its
   * sends.
   */
  readonly send: (
    ownerId: OwnerId,
    key: StructuralLookupKey,
    message: ProtocolMessage,
    sender: Name | null,
  ) => void;
  /**
   * Whether a request of the owner is outstanding on the socket. Requests wait
   * only while one is.
   */
  readonly hasOutstanding: (
    ownerId: OwnerId,
    key: StructuralLookupKey,
  ) => boolean;
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
              deps.console.setLevel(message.consoleLevel);
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

    // Held while this worker runs. Its DbWorkers stop once they can take it,
    // because a Dispose posted right before this worker closes can be lost, as
    // in Firefox (https://bugzilla.mozilla.org/show_bug.cgi?id=2077609). Taken
    // before the build lock, so nothing delays the end of starting once that
    // lock is held.
    disposer.use(await run.ok(acquireLeaderLock(workerId)));

    // Released after every tenant is disposed and has told its DbWorker to
    // stop. Earlier releases take the same lock in their leader tab; see
    // Builds.
    disposer.use(await run.ok(acquireLeaderLock("tab")));
    starting.dispose();

    disposer.defer(
      deps.consoleStoreOutputEntry.subscribe(() => {
        const entry = deps.consoleStoreOutputEntry.get();
        if (entry) postConsoleEntry(consoleEntryOrErrorBroadcastChannel, entry);
      }),
    );

    const currentTenantsByName = new Map<Name, BorrowedResource<EvoluTenant>>();

    interface SyncTransportEntry {
      readonly id: SyncTransportId;
      readonly label: RelayUrl;
      /**
       * Outstanding requests per owner, all from one sender: a tenant, or null
       * for the worker's own Unsubscribe. A request waits while another
       * sender's requests are outstanding or other requests wait, until its
       * sender's turn. `silentSince` is when the first outstanding request was
       * sent or a Response for the owner last arrived. It is monotonic, so a
       * system clock adjustment cannot make a request look timed out or keep
       * one from timing out.
       */
      readonly outstandingByOwnerId: Map<
        OwnerId,
        {
          sender: Name | null;
          count: number;
          silentSince: PerformanceTime;
          readonly waiting: Array<{
            readonly sender: Name | null;
            readonly message: ProtocolMessage;
          }>;
        }
      >;
      /**
       * The timeout of every request on the socket: frames arrive one after
       * another, so a reply can wait behind another owner's large frame. It
       * doubles after each timeout and survives reconnects until nothing is
       * outstanding and every route through the transport of a database that is
       * not refused has settled.
       */
      timeout: PositiveMillis;
      socket: WebSocket | null;
      /** Socket events drive it, so publishing never reads the socket. */
      connection: SyncConnection;
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
          ({ id, label, connection }): SyncTransport => ({
            type: "WebSocket",
            id,
            label,
            connection,
          }),
        );
        const tenants = [...currentTenantsByName.values()].map((tenant) =>
          tenant.getSyncTenant(),
        );
        // A grown timeout lasts while a request is outstanding on the socket
        // or a database that is not refused has an unsettled route
        // through it. Every change to either publishes, including a route that
        // goes away without settling.
        const unsettledTransportIds = new Set<SyncTransportId>();
        for (const tenant of tenants) {
          if (tenant.type !== "Active") continue;
          for (const owner of tenant.owners) {
            if (owner.type !== "Writable") continue;
            for (const route of owner.routes)
              if (route.type === "Pending")
                unsettledTransportIds.add(route.transportId);
          }
        }
        for (const entry of transportsByKey.values())
          if (
            entry.outstandingByOwnerId.size === 0 &&
            !unsettledTransportIds.has(entry.id)
          )
            entry.timeout = syncRequestTimeout;
        syncStateBroadcastChannel.postMessage({ transports, tenants });
      });
    };

    // Outstanding requests and owner claims are shared by all tenants. Refresh
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
          // Emptying outstandingByOwnerId clears this timer, so an owner is
          // still outstanding.
          assertNonNullable(shortestRemaining);
          // Timer delays use integer milliseconds; round up to wait at least
          // the remaining fractional duration, which is positive and at most
          // entry.timeout.
          armSyncRequestTimeout(
            entry,
            Math.ceil(shortestRemaining) as PositiveMillis,
          );
          return;
        }
        // A request went unanswered for the whole timeout: it was lost, the
        // connection is dead, or the link is too slow for the frames ahead of
        // its reply. A frame that never arrives whole saves nothing, so on a
        // slow link the same reply would time out forever. Doubling the
        // timeout lets it arrive after a reconnect that opens fine.
        entry.timeout = Math.min(
          entry.timeout * 2,
          maxSyncRequestTimeout,
        ) as PositiveMillis;
        // Reconnecting abandons the connection and starts a fresh retry
        // schedule. The socket reports no close for it, so the transport
        // disconnects here.
        entry.socket?.reconnect();
        // `now` is monotonic; the reported time is wall clock.
        entry.connection = disconnectSyncConnection(
          entry.connection,
          deps.time.now(),
          null,
        );
        refreshAllSyncRoutes();
        publishSyncState();
      }, delay);
    };

    const syncRequests: SyncRequests = {
      send: (ownerId, key, message, sender) => {
        const entry = transportsByKey.get(key);
        assertNonNullable(entry);
        assertNonNullable(entry.socket);
        const outstanding = entry.outstandingByOwnerId.get(ownerId);
        if (!outstanding) {
          entry.socket.send(message);
          entry.outstandingByOwnerId.set(ownerId, {
            sender,
            count: 1,
            silentSince: deps.time.performance.now(),
            waiting: [],
          });
        } else if (
          outstanding.sender === sender &&
          outstanding.waiting.length === 0
        ) {
          entry.socket.send(message);
          outstanding.count++;
        } else {
          outstanding.waiting.push({ sender, message });
        }
        if (entry.timeoutId === null)
          armSyncRequestTimeout(entry, entry.timeout);
        publishSyncState();
      },
      hasOutstanding: (ownerId, key) =>
        transportsByKey.get(key)?.outstandingByOwnerId.has(ownerId) ?? false,
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
            const target: SyncTarget = { type: "Transport", key };
            // The label omits the query, which carries the owner ID. A
            // WebSocketUrl without its query is a RelayUrl.
            const queryIndex = transport.url.indexOf("?");
            const entry: SyncTransportEntry = {
              id: createId<"SyncTransport">(run.deps),
              label: (queryIndex === -1
                ? transport.url
                : transport.url.slice(0, queryIndex)) as RelayUrl,
              outstandingByOwnerId: new Map(),
              timeout: syncRequestTimeout,
              socket: null,
              connection: connectingSyncConnection,
              timeoutId: null,
            };
            await using disposer = new AsyncDisposableStack();
            // Registered before the socket, so an aborted creation also
            // forgets the transport. No claim exists while a transport is
            // created or torn down, so neither changes a route.
            disposer.defer(() => {
              transportsByKey.delete(key);
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
                  // A connection that opens keeps the last error of an earlier
                  // one.
                  entry.connection = {
                    type: "Open",
                    openedAt: run.deps.time.now(),
                    error:
                      entry.connection.type === "Connecting"
                        ? null
                        : entry.connection.error,
                  };
                  publishSyncState();
                  const ownerIds = transports.getClaimsForResource(transport);
                  console.debug("transportOpen", {
                    url: transport.url,
                    ownerIds: [...ownerIds],
                  });

                  for (const tenant of currentTenantsByName.values())
                    tenant.requestCreateSyncMessages(ownerIds, target);
                  refreshAllSyncRoutes();
                },

                onClose: (event) => {
                  console.debug("transportClose", {
                    url: transport.url,
                    code: event.code,
                    wasClean: event.wasClean,
                  });
                  entry.connection = disconnectSyncConnection(
                    entry.connection,
                    run.deps.time.now(),
                    null,
                  );
                  clearSyncRequestTimeout(entry);
                  refreshAllSyncRoutes();
                  publishSyncState();
                },

                onError: (error) => {
                  console.debug("transportError", {
                    url: transport.url,
                    type: error.type,
                  });
                  // Every error disconnects. A browser reports a failed
                  // attempt only as an error, because the socket stops
                  // listening before its close arrives. A connection error
                  // arrives once the socket is closed, before its close, and
                  // exhausted retries end reconnecting.
                  const now = run.deps.time.now();
                  entry.connection = disconnectSyncConnection(
                    entry.connection,
                    now,
                    { type: error.type, at: now },
                  );
                  refreshAllSyncRoutes();
                  publishSyncState();
                },

                onMessage: (data) => {
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
                  // type, answers an outstanding request of the owner, which
                  // all come from one sender, so only that sender may continue.
                  // Other frames answer none.
                  const { ownerId, messageType } = headerResult.value;
                  const isAnswer =
                    messageType === MessageType.Response ||
                    messageType === undefined;
                  let sender: Name | null = null;
                  if (isAnswer) {
                    const outstanding = entry.outstandingByOwnerId.get(ownerId);
                    if (outstanding) {
                      sender = outstanding.sender;
                      outstanding.silentSince = run.deps.time.performance.now();
                      outstanding.count--;
                      if (outstanding.count === 0) {
                        const { waiting } = outstanding;
                        const next = waiting.at(0);
                        if (next) {
                          // The next sender's waiting requests go out
                          // together, so senders that take turns wait for the
                          // other senders' turns, not one round trip per
                          // request. The worker's Unsubscribe and tenants'
                          // requests do not pass each other, so a round that
                          // claims the owner again never goes before it. Other
                          // senders' requests keep waiting in send order. A
                          // transport being disposed has dropped its socket and
                          // drops them.
                          const barrier = waiting.findIndex(
                            (request) =>
                              (request.sender === null) !==
                              (next.sender === null),
                          );
                          const end = barrier === -1 ? waiting.length : barrier;
                          const requests: typeof waiting = [];
                          let kept = 0;
                          // Compacted in place, because spreading a long queue
                          // into a call would exceed the argument limit.
                          for (const request of waiting.slice(0, end))
                            if (request.sender === next.sender)
                              requests.push(request);
                            else waiting[kept++] = request;
                          waiting.splice(kept, end - kept);
                          for (const request of requests)
                            entry.socket?.send(request.message);
                          outstanding.sender = next.sender;
                          outstanding.count = requests.length;
                        } else entry.outstandingByOwnerId.delete(ownerId);
                      }
                    }
                    if (entry.outstandingByOwnerId.size === 0)
                      clearSyncRequestTimeout(entry);
                    publishSyncState();
                  }

                  for (const [tenantName, tenant] of currentTenantsByName)
                    tenant.requestApplySyncMessage(
                      ownerId,
                      message,
                      target,
                      !isAnswer || tenantName === sender,
                    );
                  // Do not complete a sibling after answering a shared
                  // outstanding request but before its apply has been queued.
                  refreshAllSyncRoutes();
                },
              }),
            );
            disposer.use(socket);
            // LIFO: the transport drops its timer and its socket reference
            // before the socket is disposed. `disposable` guards every method
            // of the socket lent to claims, and disposing the socket awaits its
            // retry, so this entry stays registered meanwhile. It keeps its
            // last connection and holds no socket to reconnect.
            disposer.defer(() => {
              clearSyncRequestTimeout(entry);
              entry.socket = null;
            });
            const disposables = disposer.move();
            entry.socket = socket;
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
                for (const tenant of currentTenantsByName.values())
                  tenant.requestCreateSyncMessages(new Set([ownerId]), target);
              }
              refreshAllSyncRoutes();
            },

            onLastClaimRemoved: (ownerId, webSocket, transport) => {
              if (webSocket.isOpen()) {
                syncRequests.send(
                  ownerId,
                  structuralLookup(transport),
                  createProtocolMessageForUnsubscribe(ownerId),
                  null,
                );
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
        getSyncTransportId: (key: StructuralLookupKey) => {
          const entry = transportsByKey.get(key);
          assertNonNullable(entry);
          return entry.id;
        },
        postConsoleEntryOrError,
        publishSyncState,
        refreshAllSyncRoutes,
        syncRequests,
        tabLeaderPortStore,
        transports,
        xChaCha20Poly1305: deps.xChaCha20Poly1305 ?? createXChaCha20Poly1305(),
      }),
    );

    const tenantsByName = disposer.use(
      await sharedWorkerRun.ok(
        createSharedResourceByKey(
          (message: ExtractTyped<SharedWorkerInput, "CreateEvolu">) =>
            createEvoluTenant(message, currentTenantsByName, workerId),
          {
            idleDisposeAfter: "3s",
            lookup: (message) => message.name,
          },
        ),
      ),
    );

    sharedWorkerReady.resolve();

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
    workerId: SharedWorkerId,
  ): Task<EvoluTenant, never, EvoluTenantDeps> =>
  async (run) => {
    await using disposer = new AsyncDisposableStack();
    const tenantRun = disposer.use(run.create());

    const { deps } = run;
    const console = deps.console.child(name).child("SharedWorker");
    console.setLevel(consoleLevel);

    // Every clock adopted from a DbWorker gets the session's NodeId, never the
    // stored one, so a copy of the database, such as a backup restored on
    // another device, stamps under its own NodeId from its first write. See
    // docs/adr/node-id-is-random-per-session.md.
    const nodeId = createInitialTimestamp(deps).nodeId;

    interface EvoluInstance extends AsyncDisposable {
      readonly id: EvoluInstanceId;
      /** A null lease reserves a registration while its transports are acquired. */
      readonly ownerRegistrations: LookupMap<
        SyncOwner,
        Array<ClaimLease | null>
      >;
      readonly port: MessagePort<EvoluOutput, EvoluInput>;
      readonly tabPort: TabPort;
      readonly rowsByQuery: Map<Query, ReadonlyArray<Row>>;
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

    const dbWorkerInited = Promise.withResolvers<void>();

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
          capturedInputs?: CapturedWriteInputs;
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
          capturedInputs?: CapturedWriteInputs;
        };
    interface CapturedWriteInputs {
      readonly clock: Timestamp;
      readonly now: Millis;
    }

    /**
     * The tenant's database worker: `Starting` until one leads, then `Leading`,
     * which a replacement leader replaces. `Refused` is final, and `Disposed`
     * changes only to `Refused`, when a worker requested earlier refuses
     * startup or the leader fails before it handles the dispose message.
     */
    type DbWorkerState =
      Typed<"Starting"> | LeadingDbWorker | RefusedDbWorker | Typed<"Disposed">;

    interface LeadingDbWorker extends Typed<"Leading"> {
      readonly port: MessagePort<DbWorkerInput, DbWorkerOutput>;
      /**
       * The greatest clock the tenant's leading database workers reported, with
       * the session's NodeId.
       */
      clock: Timestamp;
      /** The dispatched queue head, which stays queued until it is answered. */
      activeDispatch: {
        readonly entry: QueueEntry;
        readonly attemptId: Id;
      } | null;
    }

    interface RefusedDbWorker extends Typed<"Refused"> {
      readonly error:
        DatabaseHeldError | UnknownError | UnsupportedDbVersionError;
    }

    let dbWorker: DbWorkerState = { type: "Starting" };
    const queue: Array<QueueEntry> = [];
    const pendingWriteCountByOwnerId = new Map<OwnerId, number>();
    const pendingApplyCountForAllRoutesByOwnerId = new Map<OwnerId, number>();
    // Queued applies of relay frames, counted per owner and source transport.
    const ownerTransportApplyRelation = createRefCountedRelation<
      OwnerId,
      StructuralLookupKey
    >();

    // Each tab is told once during this tenant's lifetime, through its own
    // connection. Recreating the tenant after idle disposal retries startup
    // and may report the refusal again.
    const refusedTabPorts = new WeakSet<TabPort>();

    interface RouteState {
      progress: RouteProgress;
      lastSentAt: Millis | null;
      lastReceivedAt: Millis | null;
    }
    const routesByOwnerIdByKey = new Map<
      StructuralLookupKey,
      Map<OwnerId, RouteState>
    >();

    // Disposal does not wait for the DbWorker. It holds the database lock
    // until Dispose arrives, its tab closes, or this worker ends, and the next
    // DbWorker for this database, of this worker or another build, waits for
    // that lock before it reads the clock. A requested DbWorker that reports
    // in later gets Dispose, and a refused tenant stays refused, so it keeps
    // dropping requests.
    disposer.defer(() => {
      if (dbWorker.type === "Leading")
        dbWorker.port.postMessage({ type: "Dispose" });
      if (dbWorker.type !== "Refused") dbWorker = { type: "Disposed" };
    });

    const initDbWorker = (): void => {
      // Without a tab leader yet, the store subscription starts the DbWorker
      // once a tab announces itself.
      const tabLeaderPort = deps.tabLeaderPortStore.get();
      if (dbWorker.type === "Refused" || !tabLeaderPort) return;

      const dbWorkerChannel = deps.createMessageChannel<
        DbWorkerOutput,
        DbWorkerInput
      >();
      const currentDbWorkerPort = dbWorkerChannel.port2;

      currentDbWorkerPort.onMessage = (message) => {
        switch (message.type) {
          case "LeaderAcquired": {
            const previous = dbWorker;
            if (previous.type === "Leading")
              assertNotSame(previous.port, currentDbWorkerPort);
            if (previous.type === "Refused" || previous.type === "Disposed") {
              // This worker was requested before the refusal or before
              // disposal started. The tenant will not use it, so let it
              // release the database lock.
              currentDbWorkerPort.postMessage({ type: "Dispose" });
              currentDbWorkerPort[Symbol.dispose]();
              break;
            }
            if (previous.type === "Leading") previous.port[Symbol.dispose]();
            dbWorker = {
              type: "Leading",
              port: currentDbWorkerPort,
              // A replacement may advance the clock by releasing quarantine,
              // or start behind it with an empty memoryOnly database. Keep the
              // greater clock; pending writes retain their captured inputs.
              clock: adoptClock(
                previous.type === "Leading" ? previous.clock : null,
                message.clock,
              ),
              activeDispatch: null,
            };
            // A replacement leader may have committed writes whose responses
            // were lost, and may have released quarantine at startup. A lost
            // response may also have reported stored owner messages, so the
            // owners reconcile through every transport again.
            if (previous.type === "Leading") {
              refreshQueries();
              requestCreateSyncMessages(
                new Set(getSyncOwners().map(({ ownerId }) => ownerId)),
                allTransports,
              );
            }
            console.info("leaderAcquired");
            dbWorkerInited.resolve();
            runQueue();
            break;
          }
          case "LeaderRefused": {
            console.info("leaderRefused", message.error);
            // A refused tenant keeps its first error, which its tabs already
            // received, so a later refusal only releases its port.
            if (dbWorker.type === "Refused") {
              currentDbWorkerPort[Symbol.dispose]();
              break;
            }
            // The worker refused startup or failed and is releasing its
            // resources. Requests stay unanswered until their instances are
            // disposed. Keep the tenant unavailable, tell each connected tab
            // once, and tell tabs that connect later without starting another
            // worker.
            if (
              dbWorker.type === "Leading" &&
              dbWorker.port !== currentDbWorkerPort
            ) {
              // The leader may still hold the database lock: browsers deliver
              // a refusal before a worker requested later can lead, but the
              // tenant does not rely on that order. Tell it to dispose, so it
              // releases the lock.
              dbWorker.port.postMessage({ type: "Dispose" });
              dbWorker.port[Symbol.dispose]();
            }
            currentDbWorkerPort[Symbol.dispose]();
            queue.length = 0;
            pendingWriteCountByOwnerId.clear();
            pendingApplyCountForAllRoutesByOwnerId.clear();
            ownerTransportApplyRelation.clear();
            dbWorker = { type: "Refused", error: message.error };
            deps.publishSyncState();
            for (const instance of instancesById.values()) {
              reportRefusal(instance.tabPort, message.error);
            }
            dbWorkerInited.resolve();
            break;
          }
          case "OnQueuedResponse": {
            const leading = dbWorker;
            if (
              leading.type !== "Leading" ||
              leading.activeDispatch?.attemptId !== message.attemptId
            )
              return;
            const { entry } = leading.activeDispatch;
            const { response } = message;
            // Replays report their computed clock, which a replacement leader
            // may have passed at startup. Keep the greater clock.
            if (
              response.message.type === "Mutate" ||
              response.message.type === "ApplySyncMessage"
            )
              leading.clock = adoptClock(leading.clock, response.message.clock);
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
            leading.activeDispatch = null;
            // Follow-up uploads and retries are already queued or sent. Only
            // now can removing the completed head establish convergence.
            refreshSyncRoutes();
            if (entry.type === "Write" && entry.replicatedOwnerIds.size > 0)
              deps.publishSyncState();
            runQueue();
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
          sharedWorkerId: workerId,
          port: dbWorkerChannel.port1.native,
        },
        [dbWorkerChannel.port1.native],
      );
    };

    // The current clock already has the session's NodeId, so this compares
    // only millis and counter.
    const adoptClock = (
      current: Timestamp | null,
      reported: Timestamp,
    ): Timestamp => {
      const clock = { ...reported, nodeId };
      return current && orderTimestamp(clock, current) <= 0 ? current : clock;
    };

    const refreshQueries = (exceptInstanceId?: EvoluInstanceId): void => {
      for (const [id, instance] of instancesById) {
        if (id === exceptInstanceId) continue;
        instance.port.postMessage({ type: "RefreshQueries" });
      }
    };

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

    const reportRefusal = (
      tabPort: TabPort,
      error: DatabaseHeldError | UnknownError | UnsupportedDbVersionError,
    ): void => {
      if (refusedTabPorts.has(tabPort)) return;
      refusedTabPorts.add(tabPort);
      tabPort.postMessage({ type: "Error", error });
    };
    const runQueue = (): void => {
      if (
        dbWorker.type !== "Leading" ||
        dbWorker.activeDispatch ||
        !isNonEmptyArray(queue)
      )
        return;
      const entry = firstInArray(queue);
      const attemptId = createId(run.deps);
      dbWorker.activeDispatch = { entry, attemptId };
      if (entry.type === "Write" || entry.type === "ApplySyncMessage") {
        // A write captures its inputs on first dispatch, so a retry after
        // leader replacement reproduces the same timestamps.
        entry.capturedInputs ??= {
          clock: dbWorker.clock,
          now: run.deps.time.now(),
        };
        dbWorker.port.postMessage({
          type: "Request",
          attemptId,
          request: entry.request,
          ...entry.capturedInputs,
        });
      } else {
        dbWorker.port.postMessage({
          type: "Request",
          attemptId,
          request: entry.request,
        });
      }
    };

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
            const patchesByQuery = new Map<
              Query,
              Result<ReadonlyArray<Patch>, UnknownError>
            >();

            for (const [query, rows] of response.message.rowsByQuery) {
              // A failed query keeps its rows in the tab, so they stay the
              // base for its next patches.
              if (!rows.ok) {
                patchesByQuery.set(query, rows);
                continue;
              }
              patchesByQuery.set(
                query,
                ok(makePatches(instance.rowsByQuery.get(query), rows.value)),
              );
              instance.rowsByQuery.set(query, rows.value);
            }

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

              // The round a transport starts when it opens reads the write
              // from the database, so an upload is encrypted only while one is
              // open.
              if (isAnyTransportOpen(ownerId, allTransports))
                protocolMessagesByOwnerId.set(
                  ownerId,
                  createProtocolMessageFromCrdtMessages(run.deps)(
                    owner,
                    messages,
                  ),
                );
              // Other tenants drop a copy unless they apply sync messages for
              // the owner, so encrypt one only when one of them does.
              if (
                [...currentTenantsByName].some(
                  ([tenantName, tenant]) =>
                    tenantName !== name && tenant.isApplyingOwner(ownerId),
                )
              ) {
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

        case "MutateFailed": {
          // The tab shows it, and the instance releases the mutation's
          // onComplete callbacks without running them. A write outlives its
          // instance, so without one, every tab is told.
          //
          // A replay after leader replacement can fail although the earlier
          // leader committed the write and only its answer was lost. The tab
          // then shows an error for a stored write, and its onComplete
          // callbacks never run. Nothing is lost or reused: the replacement
          // adopted the stored clock, refreshed every instance's queries, and
          // reconciles every used owner.
          const { error } = response.message;
          if (instance) {
            assertSame(first.message.type, "Mutate");
            instance.tabPort.postMessage({ type: "Error", error });
            instance.port.postMessage({
              type: "OnMutateFailed",
              onCompleteIds: first.message.onCompleteIds,
            });
          } else {
            deps.postConsoleEntryOrError({ type: "Error", error });
          }
          break;
        }

        case "Export":
          instance?.port.postMessage(
            { type: "OnExport", file: response.message.file },
            [response.message.file.buffer],
          );
          break;

        case "ExportFailed":
          instance?.port.postMessage({
            type: "OnExportFailed",
            error: response.message.error,
          });
          break;

        default:
          exhaustiveCheck(response.message);
      }
    };

    const getRoute = (ownerId: OwnerId, key: StructuralLookupKey): RouteState =>
      routesByOwnerIdByKey
        .getOrInsertComputed(key, () => new Map())
        .getOrInsertComputed(ownerId, () => ({
          progress: {
            type: "Pending",
            roundRequired: true,
            failure: null,
            skip: null,
            completeAt: null,
          },
          lastSentAt: null,
          lastReceivedAt: null,
        }));

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
          const isOpen = isAnyTransportOpen(ownerId, {
            type: "Transport",
            key,
          });
          // A received frame is applied asynchronously, so between a reply and
          // its continuation the owner can have no request outstanding or
          // waiting. A dispatched entry stays queued until it is answered. A
          // sibling's local Broadcast contains messages that are unstored until
          // it is applied, so it leaves every route of the owner incomplete.
          const hasQueuedApply =
            pendingApplyCountForAllRoutesByOwnerId.has(ownerId) ||
            ownerTransportApplyRelation.getCount(ownerId, key) > 0;
          // A replicated write's upload is sent only after the database
          // worker answers it. Local-only changes create no synchronization
          // work.
          const hasQueuedWrite = pendingWriteCountByOwnerId.has(ownerId);
          const isReconciled =
            isOpen &&
            !deps.syncRequests.hasOutstanding(ownerId, key) &&
            !hasQueuedApply &&
            !hasQueuedWrite;
          // Settling drops the failure, so the next one requests a round
          // again. A route with a skip it is not rechecking settles without
          // completing, because its relay may offer the skipped message, the
          // database may store a change too large to send, or the relay may
          // lack messages stored elsewhere.
          const pending = routeToPending(route.progress);
          route.progress =
            !isReconciled || pending.roundRequired
              ? pending
              : pending.skip && !pending.skip.isRechecking
                ? {
                    type: "Settled",
                    skippedError: pending.skip.error,
                    completeAt: pending.completeAt,
                  }
                : route.progress.type === "Complete"
                  ? route.progress
                  : { type: "Complete", completeAt: deps.time.now() };
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
          // A retry would likely fail the same way, so the routes wait for the
          // next round another event requests, such as an explicit request or
          // a reopen.
          const now = deps.time.now();
          for (const ownerId of failedOwnerIds) {
            deps.transports.forEachResourceForClaim(ownerId, (_, transport) => {
              if (!isTargetTransport(entry.target, transport)) return;
              const route = routesByOwnerIdByKey
                .get(structuralLookup(transport))
                ?.get(ownerId);
              if (!route) return;
              route.progress = failRoute(route.progress, {
                type: "SyncFailed",
                at: now,
              });
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
          const { skippedError } = response.message;
          let failure:
            | ProtocolError
            | StorageWriteMessagesError
            | Typed<"WriteFailed">
            | Typed<"SyncFailed">
            | null = null;
          if (error !== null) {
            // A relay's error shows on its route, not as an EvoluError,
            // because it belongs to one relay and often repeats in every
            // round. A sibling copy's error is reported below.
            failure = error;
          } else if (result.ok && result.value.type === "Failed") {
            failure = {
              type:
                result.value.cause === "Write" ? "WriteFailed" : "SyncFailed",
            };
          }
          if (source.type === "Transport") {
            // A registration or claim may have been removed while this apply
            // was queued.
            const route = routesByOwnerIdByKey.get(source.key)?.get(ownerId);
            if (route) {
              const now = deps.time.now();
              route.lastReceivedAt = now;
              // A skipped message is recorded as the route's skip, not a
              // failure, and does not end the round, whose response below is
              // still sent, so it requests no round. The relay offers a message
              // the database could not store again in every later round, and
              // every round skips a stored change too large to send again, so
              // the route stays incomplete until a round requested through it
              // settles without skipping a message and without messages stored
              // elsewhere since that request.
              if (skippedError !== null)
                route.progress = {
                  ...routeToPending(route.progress),
                  skip: {
                    error: errorToSyncRouteError(skippedError, now),
                    isRechecking: false,
                  },
                };
              if (failure !== null) {
                // The first failure since the route settled requests one
                // round. Further failures wait for the next round another event
                // requests, such as an explicit request or a reopen, even after
                // a converged reply, which may answer another request.
                const requestsRetry =
                  route.progress.type !== "Pending" ||
                  route.progress.failure === null;
                route.progress = failRoute(
                  route.progress,
                  errorToSyncRouteError(failure, now),
                );
                if (requestsRetry)
                  requestCreateSyncMessages(new Set([ownerId]), source);
              }
            }
          } else if (failure !== null || skippedError !== null) {
            // A sibling's copy comes from this worker, not from a relay, so no
            // route shows its failure. SQLite can fail to store it, for example
            // on a full disk, which returns an UnknownError. It is a Broadcast,
            // which carries no relay error, so any other error or a skip means
            // a bug, such as databases holding different keys for the owner.
            // Each is reported as an unexpected failure. A Failed result was
            // logged, which reports it already. An error is the failure.
            const unexpected = error !== null ? failure : skippedError;
            if (unexpected !== null)
              deps.postConsoleEntryOrError({
                type: "Error",
                error: createUnknownError(
                  errorToSyncRouteError(unexpected, deps.time.now()),
                ),
              });
            // Some of a sibling's messages were not stored; rounds fetch them
            // from the relays, whose routes then record a skip for any message
            // this database skips.
            requestRoundsForReceivedMessages(ownerId, {
              except: null,
              afterQueuedWrites: true,
            });
          }

          if (response.message.didWriteMessages) {
            refreshQueries();
            // Reconcile newly stored messages through each other transport.
            requestRoundsForReceivedMessages(ownerId, {
              except: target,
              afterQueuedWrites: false,
            });
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
          tenant.requestApplySyncMessage(
            ownerId,
            message,
            { type: "Local", uploadTarget: target },
            true,
          );
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

            const key = structuralLookup(transport);
            deps.syncRequests.send(ownerId, key, protocolMessage, name);
            const route = getRoute(ownerId, key);
            route.lastSentAt = deps.time.now();
            if (isRound)
              route.progress = {
                ...routeToPending(route.progress),
                roundRequired: false,
              };
          },
        );
      }
      // Sends add outstanding or waiting requests that every tenant's routes
      // count; one refresh covers them.
      if (protocolMessagesByOwnerId.size > 0) deps.refreshAllSyncRoutes();
    };

    /**
     * Requests a round through each transport claimed for the owner outside
     * `except`, after messages from elsewhere were stored or a sibling copy was
     * not fully stored. Rounds toward the same transport coalesce whatever
     * their source. A route that skipped a message gets none, because its relay
     * would offer that message again or the round would skip a stored change
     * too large to send again. A route rechecking one stops rechecking, because
     * its round may have read the database before this event. A later requested
     * round through such a route reconciles it.
     */
    const requestRoundsForReceivedMessages = (
      ownerId: OwnerId,
      {
        except,
        afterQueuedWrites,
      }: { except: SyncTarget | null; afterQueuedWrites: boolean },
    ): void => {
      const keys: Array<StructuralLookupKey> = [];
      deps.transports.forEachResourceForClaim(ownerId, (_, transport) => {
        if (except && isTargetTransport(except, transport)) return;
        const key = structuralLookup(transport);
        const route = routesByOwnerIdByKey.get(key)?.get(ownerId);
        if (route?.progress.type === "Settled") return;
        if (route?.progress.type === "Pending" && route.progress.skip) {
          // A round already requested may have read the database before these
          // messages were stored, so it can no longer complete the route.
          route.progress = {
            ...route.progress,
            skip: { ...route.progress.skip, isRechecking: false },
          };
          return;
        }
        keys.push(key);
      });
      for (const key of keys) {
        requestCreateSyncMessages(
          new Set([ownerId]),
          { type: "Transport", key },
          { afterQueuedWrites },
        );
      }
    };

    /** The keys of every transport claimed for the owner, by any database. */
    const getClaimedKeys = (
      ownerId: OwnerId,
    ): ReadonlyArray<StructuralLookupKey> =>
      [...deps.transports.getResourceKeysForClaim(ownerId)].map(
        structuralLookup,
      );

    /** Whether a transport claimed for the owner within `target` is open. */
    const isAnyTransportOpen = (
      ownerId: OwnerId,
      target: SyncTarget,
    ): boolean => {
      let isOpen = false;
      deps.transports.forEachResourceForClaim(
        ownerId,
        (webSocket, transport) => {
          if (isTargetTransport(target, transport) && webSocket.isOpen())
            isOpen = true;
        },
      );
      return isOpen;
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

    // Applying a sync message requires the write key, and a refused database
    // applies none.
    const getApplyingOwner = (ownerId: OwnerId): Owner | undefined =>
      dbWorker.type === "Refused"
        ? undefined
        : getUsedOwnersById(new Set([ownerId])).get(ownerId);

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
      if (dbWorker.type === "Refused") return;
      const usedOwnersById = getUsedOwnersById(ownerIds);
      // Opening, storing messages from another transport, a failure, and an
      // explicit request each require a new round before completion. The
      // round also checks again whether the relay holds a skipped message.
      for (const ownerId of usedOwnersById.keys()) {
        deps.transports.forEachResourceForClaim(ownerId, (_, transport) => {
          if (!isTargetTransport(target, transport)) return;
          const route = getRoute(ownerId, structuralLookup(transport));
          const pending = routeToPending(route.progress);
          route.progress = {
            ...pending,
            roundRequired: true,
            skip: pending.skip && { ...pending.skip, isRechecking: true },
          };
        });
      }
      refreshSyncRoutes();
      deps.publishSyncState();
      const ownersToSync = [...usedOwnersById.values()].filter(({ id }) =>
        isAnyTransportOpen(id, target),
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
      const dispatchedEntry =
        dbWorker.type === "Leading"
          ? dbWorker.activeDispatch?.entry
          : undefined;
      const isQueued = queue.some(
        (entry, index) =>
          index > lastWriteIndex &&
          entry !== dispatchedEntry &&
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
          // round through onFirstClaimAdded. A tenant's first writable
          // registration reconciles its existing history through the
          // transports already claimed for the owner. Later writes upload
          // through every claimed transport, whichever instance made them, so
          // later registrations need no round.
          const claimedKeys = getClaimedKeys(ownerId);
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
          if (isFirstWritableUse)
            for (const key of claimedKeys)
              requestCreateSyncMessages(new Set([ownerId]), {
                type: "Transport",
                key,
              });
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
        getSyncTenant: () =>
          dbWorker.type === "Refused"
            ? { type: "Refused", name, error: dbWorker.error }
            : {
                type: "Active",
                name,
                owners: getSyncOwners().map(
                  ({ ownerId, writable, transportKeys }): SyncTenantOwner =>
                    writable
                      ? {
                          type: "Writable",
                          ownerId,
                          routes: transportKeys.map((key): SyncRoute => {
                            const route = routesByOwnerIdByKey
                              .get(key)
                              ?.get(ownerId);
                            // Registration and claim changes refresh routes
                            // before yielding. Snapshot reads must not create
                            // missing routes.
                            assertNotUndefined(route);
                            const transportId = deps.getSyncTransportId(key);
                            const { progress, lastSentAt, lastReceivedAt } =
                              route;
                            if (progress.type === "Pending")
                              return {
                                type: "Pending",
                                transportId,
                                failure: progress.failure,
                                skippedError: progress.skip?.error ?? null,
                                completeAt: progress.completeAt,
                                lastSentAt,
                                lastReceivedAt,
                              };
                            // Only a sent round settles a route or completes
                            // it.
                            assertNonNullable(lastSentAt);
                            if (progress.type === "Complete")
                              return {
                                type: "Complete",
                                transportId,
                                completeAt: progress.completeAt,
                                lastSentAt,
                                lastReceivedAt,
                              };
                            // Only a received reply records a skip.
                            assertNonNullable(lastReceivedAt);
                            return {
                              type: "Settled",
                              transportId,
                              skippedError: progress.skippedError,
                              completeAt: progress.completeAt,
                              lastSentAt,
                              lastReceivedAt,
                            };
                          }),
                        }
                      : {
                          type: "Readonly",
                          ownerId,
                          transportIds: transportKeys.map(
                            deps.getSyncTransportId,
                          ),
                        },
                ),
              },

        isApplyingOwner: (ownerId) => getApplyingOwner(ownerId) !== undefined,

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
            rowsByQuery: new Map<Query, ReadonlyArray<Row>>(),
            [Symbol.asyncDispose]: () => disposer.disposeAsync(),
          };

          instancesById.set(instance.id, instance);

          disposer.defer(onDisposed);

          disposer.defer(() => {
            for (const leases of instance.ownerRegistrations.values()) {
              for (const lease of leases) lease?.release();
            }
            instance.ownerRegistrations.clear();
            deps.refreshAllSyncRoutes();
            deps.publishSyncState();
          });
          // Cleanup starts no Task, because a root abort may dispose every Run
          // first. Disposed before the claims above are released, this Run
          // aborts queued UseOwner batches and waits for the running one, whose
          // transport claim cannot be aborted, so the release sees every lease.
          const instanceRun = disposer.use(tenantRun.create());
          const useOwnerMutex = createMutex();

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
          void instanceRun
            .abortable(acquireLeaderLock(message.id))
            .then((lock) => {
              if (!lock.ok) return;

              disposer.use(lock.value);
              return instance[Symbol.asyncDispose]();
            });

          instance.port.onMessage = (message) => {
            if (dbWorker.type === "Refused") return;
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
                void instanceRun(
                  useOwnerMutex.withLock(async (run) => {
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
              default:
                exhaustiveCheck(message);
            }
          };

          if (dbWorker.type === "Refused")
            reportRefusal(instance.tabPort, dbWorker.error);
        },

        requestCreateSyncMessages,

        requestApplySyncMessage: (
          ownerId,
          inputMessage,
          source,
          continues,
        ): void => {
          const owner = getApplyingOwner(ownerId);
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
              message: {
                type: "ApplySyncMessage",
                owner,
                inputMessage,
                continues,
              },
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

// TODO: SharedWorker follow-ups.
// - Detect a DbWorker that ends without refusing its database, such as one the
//   platform kills, so its queue does not stop silently. A DbWorker that throws
//   refuses its database. Defer restarting a failed worker until failure
//   detection and recovery are defined, accounting for SQLite WASM's detection
//   limits.
// - Split worker protocol types and the EvoluTenant implementation into focused
//   modules.
// - Bound sync state publishing during a bulk catch-up: every sent and applied
//   frame changes a route timestamp, so each frame broadcasts a full snapshot
//   to every tab. Throttling needs a wall-clock policy and a deterministic way
//   to test it.
// - Measure sync traffic before bounding it: tenants using one owner through
//   one socket each download a catch-up, because a waiting request was
//   created before another tenant's reply stored the same messages (two
//   databases receive 12 frames for a 6-frame catch-up), and a bulk catch-up
//   from one relay starts up to one round to each other relay per frame that
//   stores new messages, depending on queued round coalescing. Forwarding the
//   stored messages the way mutation uploads do would replace those rounds.
