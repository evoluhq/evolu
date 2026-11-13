/**
 * Local-first platform.
 *
 * @module
 */

import {
  emptyArray,
  firstInArray,
  isNonEmptyArray,
  mapArray,
  type NonEmptyReadonlyArray,
} from "../Array.ts";
import {
  assert,
  assertNonEmptyReadonlyArray,
  assertNotUndefined,
} from "../Assert.ts";
import { createBuffer } from "../Bytes.ts";
import { createCallbacks } from "../Callbacks.ts";
import type { ConsoleDep } from "../Console.ts";
import { createConsole } from "../Console.ts";
import {
  createSlip21,
  type DecryptWithXChaCha20Poly1305Error,
  type Entropy32,
} from "../Crypto.ts";
import type { UnknownError } from "../Error.ts";
import {
  createEqArrayLike,
  createEqObject,
  eqSameValue,
  eqUint8Array,
} from "../Eq.ts";
import { createUnknownError } from "../Error.ts";
import { constVoid, disposable, exhaustiveCheck } from "../Function.ts";
import {
  acquireLeaderLock,
  acquireLeaderLockCallback,
  type LockManagerDep,
} from "../LockManager.ts";
import { structuralLookup } from "../Lookup.ts";
import { createMicrotaskBatch } from "../Microtask.ts";
import {
  createMutableRecord,
  isPlainObject,
  objectToEntries,
  shareStructure,
  type ReadonlyRecord,
} from "../Object.ts";
import type { FlushSyncDep, ReloadAppDep } from "../Platform.ts";
import { createRefCountByKey } from "../RefCount.ts";
import { err, ok, trySync, type Result } from "../Result.ts";
import { createSet, isNonEmptySet } from "../Set.ts";
import {
  SqliteBoolean,
  sqliteBooleanToBoolean,
  type SqliteValue,
} from "../Sqlite.ts";
import type { StandardSchemaV1 } from "../StandardSchema.ts";
import type { Listener, ReadonlyStore, Unsubscribe } from "../Store.ts";
import { createStore } from "../Store.ts";
import { AbortError, callback, promiseToTask, type Task } from "../Task.ts";
import type { Callback } from "../Types.ts";
import { millisToDateIso, type Millis } from "../Time.ts";
import {
  brand,
  createId,
  createIdFromString,
  type DateIso,
  type ExtractTyped,
  Id,
  type Name,
  type NonEmptyTrimmedString100,
  PositiveInt,
  type Typed,
  type TypeError,
  UrlSafeString,
} from "../Type.ts";
import type { WebSocketUrl } from "../WebSocket.ts";
import type {
  BroadcastChannel,
  CreateBroadcastChannelDep,
  CreateMessageChannelDep,
} from "../Worker.ts";
import {
  appOwnerTable,
  createDeviceSecret,
  DeviceSecret,
  deviceEvoluSchema,
  unwrapDeviceSecret,
  wrapDeviceSecret,
  wrappedDeviceSecretEvoluSchema,
  wrappedDeviceSecretTable,
  type DeviceSecretAuth,
  type DeviceSecretKeyError,
  type DeviceSecretKeyId,
  type DeviceSecretKeyProvider,
  type DeviceSecretUnwrapError,
  type EvoluAppAuth,
  type WrappedDeviceSecret,
  type WrappedDeviceSecretNotPersistedError,
  type WrappedDeviceSecretStoredError,
} from "./Auth.ts";
import type {
  CreateDbWorkerDep,
  DatabaseHeldError,
  OpenDbWorkerInit,
  UnsupportedDbVersionError,
} from "./Db.ts";
import type {
  AppOwner,
  Owner,
  OwnerEncryptionKey,
  OwnerId,
  OwnerIdBytes,
  OwnerSecret,
  OwnerTransport,
  ReadonlyOwner,
  RelayUrlFromString,
  ShardOwner,
  SharedOwner,
  SharedReadonlyOwner,
  SyncOwner,
} from "./Owner.ts";
import {
  createAppOwner,
  createOwnerWebSocketTransport,
  ownerIdBytesToOwnerId,
  ownerSecretToOwnerId,
} from "./Owner.ts";
import {
  encodeDbChange,
  type ProtocolChangeTooLargeError,
  type ProtocolError,
  type ProtocolInvalidDataError,
  type ProtocolQuotaError,
  type ProtocolTimestampMismatchError,
  type ProtocolVersionError,
} from "./Protocol.ts";
import type {
  InferRow,
  KyselyNotNull,
  Queries,
  QueriesToQueryRowsPromises,
  Query,
  QueryRows,
  Row,
  RowsByQueryMap,
} from "./Query.ts";
import { applyPatches } from "./Query.ts";
import type {
  ConditionalMutationChange,
  EvoluSchema,
  IndexesConfig,
  Mutation,
  MutationChange,
  MutationChangeCondition,
  MutationKind,
  MutationOptions,
  MutationValues,
  SystemColumns,
  ValidateSchema,
} from "./Schema.ts";
import {
  createQueryBuilder,
  evoluSchemaToSqliteSchema,
  isLocalOnlyTable,
} from "./Schema.ts";
import type {
  ConsoleEntryOrError,
  CreateMemoryInstanceWorkerDep,
  CreateStoredWorkerDep,
  EvoluInput,
  EvoluOutput,
  OtherBuildRunningError,
  OwnerSyncStatus,
  PendingSyncRoute,
  SharedWorker,
  SharedWorkerInput,
  SharedWorkerOutput,
  SyncState,
  syncStateToOwnerSyncStatus,
  syncStateToRelaySyncStates,
} from "./Shared.ts";
import { consoleEntryOrErrorBroadcastChannelName } from "./Shared.ts";
import { DbChange } from "./Storage.ts";
import { createTimestamp } from "./Timestamp.ts";

/**
 * Configuration for {@link createEvolu}.
 *
 * @group Configuration
 */
export interface EvoluConfig {
  /**
   * An application name used in logs and local database names.
   *
   * Evolu combines `appName` with the {@link AppOwner} identity to identify the
   * local database. Changing either opens a different database. Keep `appName`
   * stable across ordinary application updates.
   *
   * Stored instances that share an `appName` and AppOwner open the same
   * database and must use the same schema. Evolu applies the schema of the
   * first instance and later instances join it. Each memory instance has its
   * own database; see {@link EvoluConfig.memoryOnly}.
   *
   * A different app name lets you create a separate local replica for the same
   * AppOwner—for example, to test a different SQLite implementation or index
   * configuration, or rebuild a replica for debugging while preserving the
   * existing database.
   *
   * Evolu supports running these databases concurrently. Their local separation
   * does not isolate synchronization: replicas synchronizing the same owners
   * through the same relay can still exchange changes. Changing `appName`
   * neither migrates existing local data nor isolates incompatible schemas.
   *
   * ### Example
   *
   * ```ts
   * import { AppName, assertEqual } from "@evolu/common";
   *
   * const appName = AppName.orThrow("MyApp");
   * assertEqual(appName, "MyApp");
   * ```
   */
  readonly appName: AppName;

  /**
   * {@link AppOwner} used to create this {@link Evolu} instance.
   *
   * Exposed as {@link Evolu.appOwner}. Create an AppOwner before the first run,
   * or restore one from secure storage before creating Evolu.
   *
   * AppOwner controls access to the encrypted local SQLite database. If its
   * secret material (Owner secret / Mnemonic) is not stored safely, data
   * written by that instance is permanently inaccessible.
   *
   * Best onboarding UX is accountless first use: create an AppOwner, let users
   * try a ready-to-use app, then prompt backup of `evolu.appOwner`.
   *
   * An app whose AppOwners Evolu keeps uses {@link createEvoluApp}, which
   * creates, stores, and opens them. `createEvolu` with an `appOwner` is for an
   * app with AppOwners of its own, such as from a hardware wallet.
   */
  readonly appOwner: AppOwner;

  /**
   * Keep the database in memory instead of persisting it on this device.
   *
   * This option controls device persistence independently of synchronization.
   * When synchronization is enabled, data can still be synchronized and
   * persisted remotely.
   *
   * A database kept in memory, with this option or where the platform offers no
   * persistent storage, has a name of its own, so it never shares a local
   * database, lock, or files with the stored database of the same
   * {@link AppOwner}. Each memory instance gets a random name and its own
   * database for its lifetime.
   *
   * On the web, a memory instance exchanges changes with every other instance,
   * stored instances of the same owner included, only through relays, so not
   * offline. Its own tab hosts its workers. Closing or reloading its tab, or
   * entering the back-forward cache, ends the instance and loses its data.
   *
   * Web dependencies check storage once when they are created. If storage is
   * available, they start the stored worker even when every instance uses this
   * option, and Evolu may then reload the whole page: when another tab loads a
   * new version of the app, when Safari relaunches the stored worker, or, in a
   * page that also stores databases, when one was written by a newer version.
   * The reload ends every instance in the page, memory instances too, losing
   * their unsynced changes. When the browser refuses storage, the stored worker
   * never starts and Evolu never reloads the page for these reasons. Returning
   * from the back-forward cache and the default reload after
   * {@link Evolu.deleteDatabase} still apply.
   *
   * On in-process platforms such as React Native, the shared worker forwards
   * each change one running database uploads to the others that synchronize the
   * owner, even offline. A database started later gets earlier changes only
   * from a relay.
   *
   * Memory and stored instances can still synchronize the same owner, so
   * changes made in memory can reach a stored database too. To keep nothing on
   * the device, dispose the stored instances of the owner first.
   *
   * Useful for testing or temporary sessions. Data that exists only in this
   * database is lost when the database closes.
   *
   * The default value is: `false`.
   */
  readonly memoryOnly?: boolean;

  /**
   * Use the `indexes` option to define SQLite indexes.
   *
   * Unique indexes are rejected with an assertion because concurrent offline
   * writes can violate uniqueness during synchronization. See
   * [Uniqueness](https://www.evolu.dev/docs/schema#uniqueness).
   *
   * Table and column names are not typed because Kysely doesn't support it.
   *
   * https://medium.com/@JasonWyatt/squeezing-performance-from-sqlite-indexes-indexes-c4e175f3c346
   *
   * ### Example
   *
   * ```ts
   * import {
   *   createEvolu,
   *   id,
   *   testAppName,
   *   testAppOwner,
   * } from "@evolu/common";
   *
   * const Schema = {
   *   todo: { id: id("Todo") },
   *   todoCategory: { id: id("TodoCategory") },
   * };
   *
   * const _createTodoEvolu = createEvolu(Schema, {
   *   appName: testAppName,
   *   appOwner: testAppOwner,
   *   transports: [],
   *   indexes: (create) => [
   *     create("todoCreatedAt").on("todo").column("createdAt"),
   *     create("todoCategoryCreatedAt")
   *       .on("todoCategory")
   *       .column("createdAt"),
   *   ],
   * });
   * ```
   */
  readonly indexes?: IndexesConfig;

  /**
   * Called when {@link Evolu.deleteDatabase} deletes this instance's local
   * database, whether this or another instance in any tab asked, right before
   * this instance disposes itself.
   *
   * Without it, the app reloads, because rendering a disposed instance throws.
   * An app that can replace the instance, such as by remounting the part of its
   * UI that uses it, can do that instead.
   */
  readonly onDatabaseDeleted?: () => void;

  /**
   * Called when {@link Evolu.deleteOwner} deletes an owner's rows from this
   * instance's local database, whether this or another instance in any tab
   * asked.
   *
   * The owner no longer syncs in any instance of the database, so the app stops
   * showing it here, such as by leaving a screen of its data, whichever tab
   * deleted it. It runs once per deletion, so an owner deleted twice, such as
   * from two tabs at once, gets two calls.
   */
  readonly onOwnerDeleted?: (ownerId: OwnerId) => void;

  /**
   * Transport configuration for sync and backup.
   *
   * If not specified, Evolu uses the default Evolu relay. Pass one or more
   * transports to override it with your own relays. They must be distinct, as
   * {@link Evolu.useOwner} requires. Pass an empty array to disable sync, which
   * is useful when sync should be configured later.
   *
   * Empty transports start the instance without sync. In that case,
   * {@link Evolu.useOwner} must be called with explicit non-empty transports to
   * enable sync for any Owner, including the AppOwner.
   *
   * **Redundancy:** The ideal setup uses at least two completely independent
   * relays - for example, a home relay and a geographically separate relay.
   * Data is sent to both relays simultaneously, providing true redundancy
   * similar to using two independent clouds. This eliminates vendor lock-in and
   * ensures your app continues working regardless of circumstances - whether
   * home relay hardware fails or disappears, or a remote relay provider shuts
   * down.
   *
   * Currently supports:
   *
   * - WebSocket: Real-time bidirectional communication with relay servers
   *
   * Use {@link createOwnerWebSocketTransport} to create WebSocket transport
   * configurations with proper URL formatting and {@link OwnerId} inclusion. The
   * {@link OwnerId} in the URL lets a relay's `isOwnerAllowed` admit or reject
   * the connection, but an admitted connection can sync any owner, and anyone
   * who knows an OwnerId can name it, so a private relay needs access control
   * beyond the OwnerId, as
   * [Relay](https://www.evolu.dev/docs/relay#access-control) describes.
   *
   * The default value is:
   *
   * `[{ type: "WebSocket", url: "wss://free.evoluhq.com/" }]`.
   *
   * It's a testing relay that admits anyone and may delete data, so set your
   * own relays before release, as
   * [Relay](https://www.evolu.dev/docs/relay#hosting-evolu-relay) describes.
   *
   * ### Example
   *
   * ```ts
   * import {
   *   assertEqual,
   *   createOwnerWebSocketTransport,
   *   RelayUrl,
   *   testAppOwner,
   *   WebSocketUrl,
   *   type OwnerTransport,
   * } from "@evolu/common";
   *
   * // Use one relay.
   * const _singleRelay = [
   *   {
   *     type: "WebSocket",
   *     url: WebSocketUrl.orThrow("wss://relay1.example.com/"),
   *   },
   * ] satisfies ReadonlyArray<OwnerTransport>;
   *
   * // Use independent relays for redundancy.
   * const _redundantRelays = [
   *   {
   *     type: "WebSocket",
   *     url: WebSocketUrl.orThrow("wss://relay1.example.com/"),
   *   },
   *   {
   *     type: "WebSocket",
   *     url: WebSocketUrl.orThrow("wss://relay2.example.com/"),
   *   },
   * ] satisfies ReadonlyArray<OwnerTransport>;
   *
   * // Start local-only before authentication. After authentication, pass an
   * // owner-scoped transport to evolu.useOwner.
   * const _localOnlyBeforeAuthentication =
   *   [] satisfies ReadonlyArray<OwnerTransport>;
   *
   * // Include the OwnerId when the relay admits owners by it.
   * const authenticatedRelay = [
   *   createOwnerWebSocketTransport({
   *     url: RelayUrl.orThrow("wss://relay.example.com/"),
   *     ownerId: testAppOwner.id,
   *   }),
   * ];
   *
   * assertEqual(
   *   authenticatedRelay[0]?.url,
   *   `wss://relay.example.com/?ownerId=${testAppOwner.id}`,
   * );
   * ```
   */
  readonly transports?: ReadonlyArray<OwnerTransport>;
}

/**
 * Application name.
 *
 * Evolu uses AppName as the base prefix for {@link Evolu.name}. The final stored
 * database name is derived per {@link AppOwner} as
 * `${appName}-${createIdFromString(appOwner.id)}`. A memory instance uses the
 * same prefix with a hash of its owner, a memory marker, and a random instance
 * ID, so every instance gets its own name; see {@link EvoluConfig.memoryOnly}.
 *
 * Uses the same safe alphabet as {@link UrlSafeString} (letters, digits, `-`,
 * `_`) and must be between 1 and 41 characters.
 *
 * Names that differ only in letter case, such as `acme` and `Acme`, name the
 * same AppOwner databases where storage ignores case, as macOS's file system,
 * WebKit's OPFS, and Windows do, so two such apps that use the same AppOwner
 * share its data. Pick names that differ in more than case.
 *
 * TODO(next major): Make AppName case-insensitive, such as by allowing only
 * lowercase letters, so two names never differ only in case.
 *
 * @group Configuration
 */
export const AppName = /*#__PURE__*/ brand(
  "AppName",
  UrlSafeString,
  (value) =>
    value.length <= 41 ? ok() : err<AppNameError>({ type: "AppName", value }),
  (error) =>
    `The value ${JSON.stringify(error.value)} is not between 1 and 41 characters.`,
);
export type AppName = typeof AppName.Output;

/**
 * Error produced when a value is not a valid {@link AppName}.
 *
 * @group Configuration
 */
export interface AppNameError extends TypeError<"AppName"> {
  readonly value: UrlSafeString;
}

/**
 * Stable valid {@link AppName} for tests and examples.
 *
 * @group Testing
 */
export const testAppName = /*#__PURE__*/ AppName.orThrow("AppName");

/**
 * A local-first SQL database.
 *
 * Stores application data in SQLite on the device, so reads and writes work
 * offline. Provides typed queries, mutations, and reactive subscriptions, with
 * synchronization between devices. Persistent SQLite is encrypted with the
 * {@link AppOwner} key, and synchronized data is end-to-end encrypted.
 *
 * Tables whose names start with `_` stay local, even when the instance
 * synchronizes other data. Use them for data that stays on the device, such as
 * drafts. {@link createEvoluApp} keeps the app's AppOwners on the device itself,
 * and its {@link EvoluApp.device} instance holds settings that belong to the
 * device rather than to an AppOwner.
 *
 * @group Core
 */
export interface Evolu<
  S extends EvoluSchema = EvoluSchema,
> extends AsyncDisposable {
  /**
   * Evolu instance name is derived from {@link EvoluConfig.appName},
   * {@link AppOwner}'s hash, and, for a memory database, a random instance ID;
   * see {@link AppName}.
   */
  readonly name: Name;

  /**
   * The instance's {@link AppOwner}: the one {@link createEvoluApp} opened, or
   * the one passed to {@link createEvolu}, available synchronously. Its
   * `mnemonic` is what the user backs up, such as in a recovery UI.
   */
  readonly appOwner: AppOwner;

  /**
   * Whether this device keeps the database, which {@link createEvolu} decides
   * before it creates the instance.
   *
   * Apps tell the user when it is `NotPersisted`, because then data that has
   * not synced is lost when the instance ends. On the web this includes its tab
   * entering the back-forward cache. Apps must not tell the user that data is
   * saved on the device when it is `Unknown`.
   *
   * ### Example
   *
   * ```ts
   * import { assertEqual } from "@evolu/common";
   * import type { DevicePersistence } from "@evolu/common/local-first";
   *
   * // The notice for `await evolu.devicePersistence`, or null for none.
   * const persistenceNotice = (
   *   devicePersistence: DevicePersistence,
   * ): string | null =>
   *   devicePersistence === "NotPersisted"
   *     ? "Your data isn't kept on this device. Changes that haven't synced are lost when you close this tab."
   *     : null;
   *
   * assertEqual(persistenceNotice("Unknown"), null);
   * assertEqual(
   *   persistenceNotice("NotPersisted"),
   *   "Your data isn't kept on this device. Changes that haven't synced are lost when you close this tab.",
   * );
   * ```
   */
  readonly devicePersistence: Promise<DevicePersistence>;

  /**
   * Inserts a row and returns the generated {@link Id}.
   *
   * All non-nullable columns are required, nullable columns are optional, and
   * `id` is omitted because Evolu generates it automatically. This ensures
   * every row has a globally unique, conflict-free identifier without
   * coordination.
   *
   * Pass `onSuccess` when follow-up work must wait until the mutation is stored
   * and subscribed queries reflect it. It never runs when the database is
   * unavailable; see {@link Evolu.loadQuery}. When the mutation could not be
   * stored, {@link MutationOptions.onError} runs instead, and
   * {@link EvoluErrorDep.evoluError} reports the error. A stored change is not
   * always visible; see {@link MutationOptions.onSuccess}.
   *
   * ### Example
   *
   * ```ts
   * import {
   *   assertType,
   *   type TestEvoluSchema,
   *   NonEmptyTrimmedString100,
   *   type Evolu,
   *   type TestTodoId,
   * } from "@evolu/common";
   *
   * const insertTodo = (evolu: Evolu<TestEvoluSchema>) =>
   *   evolu.insert("todo", {
   *     title: NonEmptyTrimmedString100.orThrow("Learn Evolu"),
   *   }).id;
   *
   * const insertTodoAndNotify = (
   *   evolu: Evolu<TestEvoluSchema>,
   *   onSuccess: () => void,
   * ) =>
   *   evolu.insert(
   *     "todo",
   *     { title: NonEmptyTrimmedString100.orThrow("Another todo") },
   *     { onSuccess },
   *   ).id;
   *
   * assertType<
   *   [
   *     ReturnType<typeof insertTodo>,
   *     ReturnType<typeof insertTodoAndNotify>,
   *   ],
   *   [TestTodoId, TestTodoId]
   * >();
   * ```
   *
   * @see {@link Mutation}
   */
  readonly insert: Mutation<S, "insert">;

  /**
   * Updates a row and returns the {@link Id}.
   *
   * Only `id` is required, all other columns are optional.
   *
   * In a {@link isLocalOnlyTable | local-only} table, whose deletes remove rows,
   * it changes only an existing row, so it doesn't bring back a deleted one;
   * {@link Evolu.upsert} creates a row. There, an update of a missing row
   * changes nothing and isn't an error, so {@link MutationOptions.onSuccess}
   * runs, as after a SQL `UPDATE` that matches no row.
   *
   * ### Example
   *
   * ```ts
   * import {
   *   assertType,
   *   type TestEvoluSchema,
   *   NonEmptyTrimmedString100,
   *   sqliteTrue,
   *   type Evolu,
   *   type TestTodoId,
   * } from "@evolu/common";
   *
   * const renameTodo = (
   *   evolu: Evolu<TestEvoluSchema>,
   *   todoId: TestTodoId,
   * ) =>
   *   evolu.update("todo", {
   *     id: todoId,
   *     title: NonEmptyTrimmedString100.orThrow("Updated title"),
   *   }).id;
   *
   * const softDeleteTodo = (
   *   evolu: Evolu<TestEvoluSchema>,
   *   todoId: TestTodoId,
   * ) => evolu.update("todo", { id: todoId, isDeleted: sqliteTrue }).id;
   *
   * assertType<
   *   [ReturnType<typeof renameTodo>, ReturnType<typeof softDeleteTodo>],
   *   [TestTodoId, TestTodoId]
   * >();
   * ```
   *
   * @see {@link Mutation}
   */
  readonly update: Mutation<S, "update">;

  /**
   * Upserts a row and returns the {@link Id}.
   *
   * Like insert, but requires an `id`. Useful for rows with external ID via
   * {@link createIdFromString}. All other non-nullable columns are required,
   * nullable columns are optional.
   *
   * Upserting a row that already exists on this device sets its `updatedAt` and
   * does not change its `createdAt`. An upsert made on another device before it
   * synchronized the row can move `createdAt` earlier when it arrives. See
   * {@link SystemColumns}.
   *
   * ### Example
   *
   * ```ts
   * import {
   *   assertType,
   *   createIdFromString,
   *   type TestEvoluSchema,
   *   NonEmptyTrimmedString100,
   *   type Evolu,
   *   TestTodoId,
   * } from "@evolu/common";
   *
   * const stableId = TestTodoId.orThrow(createIdFromString("my-todo-1"));
   * const upsertTodo = (evolu: Evolu<TestEvoluSchema>) =>
   *   evolu.upsert("todo", {
   *     id: stableId,
   *     title: NonEmptyTrimmedString100.orThrow("Learn Evolu"),
   *   }).id;
   *
   * assertType<ReturnType<typeof upsertTodo>, TestTodoId>();
   * ```
   *
   * @see {@link Mutation}
   */
  readonly upsert: Mutation<S, "upsert">;

  /**
   * Returns the size of a mutation of `table` with `values`, measured as
   * {@link maxMutationSize} describes.
   *
   * Use it to check values that column Types do not bound before mutating, or
   * to show how much of the limit a mutation uses. It accepts any of the
   * table's columns, so the values of an insert, update, or upsert fit, and it
   * ignores `id` and `isDeleted`, which are not columns. Mutations of
   * local-only tables are measured too, although they are exempt from the
   * limit.
   *
   * ### Example
   *
   * ```ts
   * import {
   *   assertType,
   *   type Evolu,
   *   maxMutationSize,
   *   type NonEmptyTrimmedString100,
   *   type TestEvoluSchema,
   * } from "@evolu/common";
   *
   * const fitsTodo = (
   *   evolu: Evolu<TestEvoluSchema>,
   *   title: NonEmptyTrimmedString100,
   * ) => evolu.getMutationSize("todo", { title }) <= maxMutationSize;
   *
   * assertType<ReturnType<typeof fitsTodo>, boolean>();
   * ```
   */
  readonly getMutationSize: <TableName extends keyof S>(
    table: TableName,
    values: Partial<MutationValues<S[TableName], "update">>,
  ) => PositiveInt;

  /**
   * Load {@link Query} and return a promise with {@link QueryRows}.
   *
   * The returned promise rejects with an {@link UnknownError} when SQLite fails
   * the query, for example on a syntax error in a raw SQL fragment or on data
   * its SQL functions cannot read, such as `json_extract` on text that is not
   * JSON. Only that query fails: other queries load, mutations are stored, and
   * {@link EvoluErrorDep.evoluError} is not set. React's `useQuery` throws the
   * error to the nearest error boundary. If the database is refused, because it
   * refused startup or its worker failed, an uncached load rejects with an
   * {@link UnknownError}, the refusal itself or one wrapping it, and cached
   * loads stay pending until disposal resolves them with empty rows, so a
   * suspended component stays suspended. Cached loads that a deletion of the
   * database dropped stay pending, because the app replaces the instance; see
   * {@link Evolu.deleteDatabase}. An uncached load never stays pending past
   * disposal, also the disposal a deletion of the database causes: it resolves
   * with empty rows, which then say nothing about the database, and the
   * instance's methods throw. Observe {@link EvoluErrorDep.evoluError} to
   * display the refusal independently of query loading.
   *
   * Cached loading is batched. Returned promises are cached while pending and
   * can be reused after they settle, which prevents redundant database queries
   * and supports React Suspense (stable references while pending). A mutation
   * or incoming sync invalidates the cache of an unsubscribed query, so its
   * next load reads again. A subscribed query keeps its cached result and the
   * subscription refreshes it, so a load can return rows that a pending refresh
   * is about to replace. When SQLite fails a refresh, the query keeps its rows,
   * its loads reject until a refresh succeeds, and its subscribers are
   * notified, so React's `useQuery` throws the error then. To skip the cache,
   * pass `cache: false`; see {@link LoadQueryOptions.cache}.
   *
   * To subscribe a query for automatic updates, use
   * {@link Evolu.subscribeQuery}.
   *
   * ### Example
   *
   * ```ts
   * import {
   *   assertType,
   *   createQueryBuilder,
   *   testEvoluSchema,
   *   type TestEvoluSchema,
   *   type Evolu,
   *   type QueryRows,
   * } from "@evolu/common";
   *
   * const createQuery = createQueryBuilder(testEvoluSchema);
   * const allTodos = createQuery((db) =>
   *   db.selectFrom("todo").selectAll(),
   * );
   * const loadTodos = async (evolu: Evolu<TestEvoluSchema>) => {
   *   const rows = await evolu.loadQuery(allTodos);
   *   return rows;
   * };
   * const loadUncachedTodos = (evolu: Evolu<TestEvoluSchema>) =>
   *   evolu.loadQuery(allTodos, { cache: false });
   *
   * assertType<
   *   ReturnType<typeof loadTodos>,
   *   Promise<QueryRows<typeof allTodos.Row>>
   * >();
   * assertType<
   *   ReturnType<typeof loadUncachedTodos>,
   *   Promise<QueryRows<typeof allTodos.Row>>
   * >();
   * ```
   */
  readonly loadQuery: <R extends Row>(
    query: Query<S, R>,
    options?: LoadQueryOptions,
  ) => Promise<QueryRows<R>>;

  /**
   * Load an array of {@link Query} values and return an array of
   * {@link QueryRows} promises. It's like `queries.map(loadQuery)` but with
   * proper types for returned promises.
   *
   * ### Example
   *
   * ```ts
   * import {
   *   assertType,
   *   createQueryBuilder,
   *   testEvoluSchema,
   *   type TestEvoluSchema,
   *   testTodoId,
   *   type Evolu,
   *   type QueryRows,
   * } from "@evolu/common";
   *
   * const createQuery = createQueryBuilder(testEvoluSchema);
   * const allTodos = createQuery((db) =>
   *   db.selectFrom("todo").select(["id", "title"]),
   * );
   * const firstTodo = createQuery((db) =>
   *   db.selectFrom("todo").select("title").where("id", "=", testTodoId),
   * );
   * const loadTodoQueries = (evolu: Evolu<TestEvoluSchema>) =>
   *   evolu.loadQueries([allTodos, firstTodo]);
   *
   * assertType<
   *   ReturnType<typeof loadTodoQueries>,
   *   [
   *     Promise<QueryRows<typeof allTodos.Row>>,
   *     Promise<QueryRows<typeof firstTodo.Row>>,
   *   ]
   * >();
   * ```
   */
  readonly loadQueries: <Q extends Queries<S>>(
    queries: [...Q],
  ) => [...QueriesToQueryRowsPromises<Q>];

  /**
   * Subscribe to {@link Query} {@link QueryRows} changes.
   *
   * Cached rows invalidated before subscription are refreshed. Subscribing
   * alone does not load a query that has no cached rows.
   *
   * ### Example
   *
   * ```ts
   * import {
   *   assertType,
   *   createQueryBuilder,
   *   testEvoluSchema,
   *   type TestEvoluSchema,
   *   type Evolu,
   *   type QueryRows,
   *   type Unsubscribe,
   * } from "@evolu/common";
   *
   * const createQuery = createQueryBuilder(testEvoluSchema);
   * const allTodos = createQuery((db) =>
   *   db.selectFrom("todo").select("title"),
   * );
   * const subscribeToTodos = (
   *   evolu: Evolu<TestEvoluSchema>,
   *   onRows: (rows: QueryRows<typeof allTodos.Row>) => void,
   * ) =>
   *   evolu.subscribeQuery(allTodos)(() => {
   *     onRows(evolu.getQueryRows(allTodos));
   *   });
   *
   * assertType<ReturnType<typeof subscribeToTodos>, Unsubscribe>();
   * ```
   */
  readonly subscribeQuery: (
    query: Query<S>,
  ) => (listener: Listener) => Unsubscribe;

  /**
   * Get {@link QueryRows}.
   *
   * ### Example
   *
   * ```ts
   * import {
   *   assertType,
   *   createQueryBuilder,
   *   testEvoluSchema,
   *   type TestEvoluSchema,
   *   type Evolu,
   *   type QueryRows,
   * } from "@evolu/common";
   *
   * const createQuery = createQueryBuilder(testEvoluSchema);
   * const allTodos = createQuery((db) =>
   *   db.selectFrom("todo").select("title"),
   * );
   * const getTodos = (evolu: Evolu<TestEvoluSchema>) =>
   *   evolu.getQueryRows(allTodos);
   *
   * assertType<
   *   ReturnType<typeof getTodos>,
   *   QueryRows<typeof allTodos.Row>
   * >();
   * ```
   */
  readonly getQueryRows: <R extends Row>(query: Query<S, R>) => QueryRows<R>;

  /**
   * Exports the SQLite database file.
   *
   * The exported file is not encrypted, even when the local database is. Any
   * SQLite tool can read all local data from it, so treat it as plaintext.
   *
   * Exports are sequential: concurrent calls share one pending export instead
   * of starting parallel exports.
   *
   * The pending promise rejects with an {@link EvoluDisposedError} if this
   * {@link Evolu} instance is disposed before export completion, and with an
   * {@link UnknownError} when SQLite fails the export, after which the next call
   * exports again. If the database is refused, export stays pending until
   * disposal; see {@link Evolu.loadQuery}.
   */
  readonly exportDatabase: () => Promise<Uint8Array<ArrayBuffer>>;

  // TODO: Add exportHistory.

  /**
   * Deletes the local database of this {@link Evolu} instance on this device,
   * and resolves once its files are gone.
   *
   * The deletion runs after the mutations and requests made before it. Then
   * every instance of the database, identified by {@link Evolu.name}, disposes
   * itself in every tab, and the requests they made after the deletion are
   * dropped, so their cached loads stay pending and a suspended component stays
   * suspended until the app replaces the instance, and their uncached loads
   * resolve with empty rows. Before it disposes itself, each instance, this one
   * included, calls {@link EvoluConfig.onDatabaseDeleted}, or reloads the app
   * without it. An AppOwner's instance of {@link createEvoluApp} does neither: a
   * tab that has the AppOwner open opens its database again, empty, with a new
   * instance; see {@link EvoluApp.current}.
   *
   * It deletes only this device's copy. Changes not yet synced are lost. An
   * instance created later with the same {@link EvoluConfig.appOwner} opens a
   * new, empty database, which its transports fill again from relays, so forget
   * the owner first if the data must not come back. Encrypted copies in device
   * backups and in freed storage remain. A deletion is as durable as a commit:
   * a power loss right after it can undo it.
   *
   * A database kept in memory, as with {@link EvoluConfig.memoryOnly}, has a
   * name of its own and no files, so deleting it leaves a stored database of
   * the same owner alone.
   *
   * It deletes the files by name, so it also deletes a database that doesn't
   * open, such as a corrupt one or one of a newer version. Concurrent calls, of
   * any instance of the database in any tab, share one deletion. It deletes no
   * file another context holds, because that context could still write to it,
   * and fails with {@link DatabaseHeldError} when such a file stays held, or
   * when the deletion doesn't finish in time, such as while the tab that starts
   * it shows a modal dialog. Evolu's instances release the files before the
   * deletion, so only a context outside Evolu's coordination can hold them,
   * such as a React Native runtime that a reload replaced. Its next DbWorker
   * then waits for the files, as every startup does, and the database is
   * refused with that error when they stay held. It fails with an
   * {@link UnknownError} when the platform fails to delete them. After a
   * failure, the database may be partly or wholly deleted, its instances keep
   * working, and the next call deletes again. It fails with
   * {@link EvoluDisposedError} when this instance is disposed before the
   * deletion ends, which may or may not then run, so await it before
   * disposing.
   *
   * ### Example
   *
   * ```ts
   * import {
   *   assertType,
   *   type DeleteDatabaseError,
   *   type Evolu,
   *   type Result,
   * } from "@evolu/common";
   *
   * const deleteLocalData = (evolu: Evolu) => evolu.deleteDatabase();
   *
   * assertType<
   *   Awaited<ReturnType<typeof deleteLocalData>>,
   *   Result<void, DeleteDatabaseError>
   * >();
   * ```
   */
  readonly deleteDatabase: () => Promise<Result<void, DeleteDatabaseError>>;

  /**
   * Deletes the rows of a {@link ShardOwner}, {@link SharedOwner}, or
   * {@link SharedReadonlyOwner} from the local database of this {@link Evolu}
   * instance on this device, stops syncing the owner, and resolves once the
   * rows are gone.
   *
   * The deletion runs after the mutations and requests made before it. It
   * deletes the owner's rows of every table, local-only tables included, and
   * its history in one transaction. Then it ends every {@link Evolu.useOwner}
   * registration of the owner in every instance of the database, identified by
   * {@link Evolu.name}, in every tab, so relays don't bring the rows back, and
   * calling the {@link UnuseOwner} of such a registration does nothing. Then
   * each instance calls {@link EvoluConfig.onOwnerDeleted}, this one before code
   * awaiting this call continues, and loads its subscribed queries again, which
   * return the owner's rows until they load.
   *
   * It deletes only this device's copy. Changes not yet synced are lost. Relays
   * keep the owner's data, and so do other local databases that use the owner.
   * A later `useOwner` syncs the data back, and a mutation with the owner
   * stores its rows again, so stop using the owner first, such as by removing
   * it from where the app lists it. Encrypted copies in device backups and in
   * freed storage remain.
   *
   * It takes no {@link AppOwner}, whose ID names the database;
   * {@link Evolu.deleteDatabase} deletes the whole database instead. An owner
   * created from the AppOwner's secret has the same ID, so this method throws
   * for it.
   *
   * Each call deletes on its own, in call order. It fails with an
   * {@link UnknownError} when SQLite fails the deletion, which then deletes
   * nothing, and the owner keeps syncing. When the database is refused, it
   * fails with the refusal's error, as {@link EvoluError} describes. It fails
   * with {@link EvoluDisposedError} when this instance is disposed before the
   * deletion ends, which may or may not then run.
   *
   * ### Example
   *
   * ```ts
   * import {
   *   assertType,
   *   type DeleteOwnerError,
   *   type Evolu,
   *   type Result,
   *   type ShardOwner,
   * } from "@evolu/common";
   *
   * const deleteWallet = (evolu: Evolu, walletOwner: ShardOwner) =>
   *   evolu.deleteOwner(walletOwner);
   *
   * assertType<
   *   Awaited<ReturnType<typeof deleteWallet>>,
   *   Result<void, DeleteOwnerError>
   * >();
   *
   * const _deleteAppOwner = (evolu: Evolu) =>
   *   // @ts-expect-error deleteOwner takes no AppOwner, which names the database.
   *   evolu.deleteOwner(evolu.appOwner);
   * ```
   */
  readonly deleteOwner: (
    owner: ShardOwner | SharedOwner | SharedReadonlyOwner,
  ) => Promise<Result<void, DeleteOwnerError>>;

  /**
   * Use an Owner for sync. Returns a {@link UnuseOwner}.
   *
   * Using an Owner means syncing it with the provided transports, or with the
   * default transports defined in {@link EvoluConfig} when transports are
   * omitted. An AppOwner's data lives only in its own database, which its
   * deletion deletes, so an instance syncs its own AppOwner but throws for
   * another one. An instance of {@link createEvoluApp} recognizes another
   * AppOwner by the IDs the app lists; one of {@link createEvolu} only by its
   * type, so it misses an owner with another AppOwner's ID but another type,
   * such as one created from that AppOwner's secret.
   *
   * If {@link EvoluConfig.transports} is an empty array, this method must be
   * called with explicit non-empty transports.
   *
   * Owners that use equal transports share one reference-counted connection.
   * The transports in one array must be distinct, so this method throws for
   * equal ones, such as two spellings that {@link RelayUrlFromString} converts
   * to one URL.
   *
   * ### Example
   *
   * ```ts
   * import {
   *   assertEqual,
   *   createOwnerWebSocketTransport,
   *   deriveShardOwner,
   *   RelayUrl,
   *   testAppOwner,
   *   type Evolu,
   *   type ReadonlyOwner,
   *   type UnuseOwner,
   * } from "@evolu/common";
   *
   * const relayUrl = RelayUrl.orThrow("wss://relay.example.com/");
   * const shardOwner = deriveShardOwner(testAppOwner, ["todos", 1]);
   * const shardTransport = createOwnerWebSocketTransport({
   *   url: relayUrl,
   *   ownerId: shardOwner.id,
   * });
   * const _useShardOwner = (evolu: Evolu): UnuseOwner =>
   *   evolu.useOwner(shardOwner, [shardTransport]);
   *
   * const _useOwners = (
   *   evolu: Evolu,
   *   owners: ReadonlyArray<ReadonlyOwner>,
   * ): UnuseOwner => {
   *   const unuseOwners = owners.map((owner) =>
   *     evolu.useOwner(owner, [
   *       createOwnerWebSocketTransport({
   *         url: relayUrl,
   *         ownerId: owner.id,
   *       }),
   *     ]),
   *   );
   *   return () => {
   *     for (const unuse of unuseOwners) unuse();
   *   };
   * };
   *
   * // Call each returned UnuseOwner once to stop syncing.
   * assertEqual(shardTransport, {
   *   type: "WebSocket",
   *   url: `wss://relay.example.com/?ownerId=${shardOwner.id}`,
   * });
   * ```
   */
  readonly useOwner: (
    owner: ReadonlyOwner | Owner,
    transports?: NonEmptyReadonlyArray<OwnerTransport>,
  ) => UnuseOwner;

  /**
   * Requests a new synchronization round for an active {@link OwnerId}.
   *
   * Reconciles locally stored changes, including writes previously rejected
   * with {@link ProtocolQuotaError}, through the owner's active transports. Call
   * this after the relay provider confirms additional quota is available. It
   * also checks again the changes this database skipped from the owner's
   * relays, and sends such a relay the changes received from other relays,
   * which otherwise wait for its next sync, such as after a reconnect. On a
   * relay that sends no heartbeats, a request is also how the shared worker
   * notices a connection that died without closing: an unanswered request
   * replaces it after the request timeout, ninety seconds unless it has grown,
   * as Liveness in the Shared module describes. Existing connections and
   * {@link Evolu.useOwner} registrations are retained, including registrations
   * shared by multiple instances or tabs.
   *
   * The owner must have an active writable registration in this database.
   * Unregistered or read-only owners are ignored. Requests are skipped while
   * all of the owner's transports are closed; they synchronize when they
   * reopen. Disposal drops locally buffered requests. Calling a disposed
   * instance throws, like other Evolu operations.
   *
   * Returns immediately, without waiting for synchronization to complete. The
   * owner's routes in sync state show a failure, such as a quota rejection, as
   * `failure`, and a skipped change as `skippedError`.
   *
   * ### Example
   *
   * ```ts
   * import { assertType, type Evolu, type OwnerId } from "@evolu/common";
   *
   * // Call after successfully increasing the affected owner's relay quota.
   * const onQuotaIncreased = (evolu: Evolu, ownerId: OwnerId) => {
   *   evolu.requestSync(ownerId);
   * };
   *
   * assertType<
   *   typeof onQuotaIncreased,
   *   (evolu: Evolu, ownerId: OwnerId) => void
   * >();
   * ```
   */
  readonly requestSync: (ownerId: OwnerId) => void;
}

/**
 * Options of {@link Evolu.loadQuery}.
 *
 * @group Core
 */
export interface LoadQueryOptions {
  /**
   * With `false`, the load skips the query's cached and pending loads and reads
   * the rows SQLite holds now: after the mutations this instance made before it
   * and the changes other tabs stored before it, so code holding a lock, such
   * as {@link acquireLeaderLock}, can check rows another tab wrote under the
   * same lock. It first sends the pending mutations as their own batch. Its
   * answer updates the cached rows and settled loads like any load's, and
   * pending loads keep their promises, which React Suspense relies on. On a
   * refused database it rejects with an {@link UnknownError}, the refusal itself
   * or one wrapping it, while cached loads stay pending. When the instance is
   * disposed before the answer, also by a deletion or removal of its database
   * in any tab, the load resolves with empty rows; code that decides on the
   * rows then checks {@link isDatabaseDeleted}, or its next call on the instance
   * throws.
   */
  readonly cache?: boolean;
}

/**
 * Function returned by {@link Evolu.useOwner} to stop using an Owner for sync.
 *
 * @group Core
 */
export type UnuseOwner = () => void;

/**
 * The {@link Evolu} instance was disposed before an operation it started ended.
 *
 * @group Core
 */
export interface EvoluDisposedError extends Typed<"EvoluDisposedError"> {}

/**
 * An error of {@link Evolu.deleteDatabase}.
 *
 * @group Core
 */
export type DeleteDatabaseError =
  DatabaseHeldError | EvoluDisposedError | UnknownError;

/**
 * An error of {@link Evolu.deleteOwner}.
 *
 * @group Core
 */
export type DeleteOwnerError =
  | DatabaseHeldError
  | EvoluDisposedError
  | UnknownError
  | UnsupportedDbVersionError;

/**
 * Whether this device keeps an {@link Evolu} database, stating only what Evolu
 * knows for sure.
 *
 * - `Persisted`: the platform stores it in the app's own file, as React Native
 *   does.
 * - `NotPersisted`: it is kept in memory, under a random per-instance name,
 *   because {@link EvoluConfig.memoryOnly} asks for that or the platform offers
 *   no persistent storage, as a browser does in Safari's Private Browsing or a
 *   Firefox private window. Data that has not synced is lost when the instance
 *   ends, including when its tab enters the back-forward cache on the web.
 * - `Unknown`: it is stored, but the platform may delete it. A browser can keep
 *   storage only for a private session, as Chrome's incognito does without
 *   telling the app, delete it after a while or when disk space runs low, and
 *   let the user clear it.
 *
 * See [Will my data stay on the
 * device?](https://www.evolu.dev/docs/faq#will-my-data-stay-on-the-device).
 *
 * @group Core
 */
export type DevicePersistence = "Persisted" | "NotPersisted" | "Unknown";

/**
 * Represents app-level errors that can occur in {@link Evolu}.
 *
 * Apps show them from {@link EvoluErrorDep.evoluError}. Problems a relay causes
 * while syncing an owner are not EvoluErrors; see below. An unexpected failure
 * while syncing is an {@link UnknownError}.
 *
 * An error that leaves the app unusable deserves a modal dialog, which moves
 * focus into itself and restores it when closed. Any other error is a status
 * message: show it in a region with `role="alert"`, which screen readers
 * announce without moving focus, so the user keeps working and a background tab
 * shows it when the user returns. Avoid `alert()`, which blocks the page, once
 * in every open tab.
 *
 * - {@link UnsupportedDbVersionError} blocks the app: the local data needs a newer
 *   version of it. Ask the user to update the app or close all its tabs.
 * - {@link DatabaseHeldError} blocks the app: another context keeps holding the
 *   local data, as a browser can until it restarts. Ask the user to close the
 *   app's other tabs or to restart the browser, then to reload the app, or on
 *   React Native to restart the app.
 * - {@link OtherBuildRunningError} blocks the app while it lasts: another version
 *   of the app holds the local data. Ask the user to close the app's other
 *   tabs. It clears when the wait ends.
 * - {@link UnknownError} blocks the app: Evolu is in an unknown state after an
 *   unexpected failure, such as a mutation that could not be stored or a
 *   database whose worker failed. Ask the user to close all its tabs, or on
 *   React Native to restart the app.
 *
 * A problem syncing an owner through a relay belongs to that relay and often
 * repeats in every round, so sync state shows it on the relay's route, as its
 * {@link PendingSyncRoute.failure} with its details, and apps show it as the
 * owner's `Error` {@link OwnerSyncStatus}. When the relay rejected or failed a
 * request, or sent a frame that could not be decoded, the route shows a
 * {@link ProtocolError}. A {@link ProtocolQuotaError} needs more relay quota,
 * then {@link Evolu.requestSync}, and a {@link ProtocolVersionError} needs an app
 * or relay update. A route shows an {@link UnknownError} failure when this
 * device could not store received changes, for example on a full disk.
 *
 * A received change that was not created with the owner's encryption key, was
 * altered afterwards, or cannot be decoded by this app version is skipped,
 * while everything else still syncs. The relay offers it again in every round,
 * so the route shows it as its `skippedError`: the
 * {@link DecryptWithXChaCha20Poly1305Error},
 * {@link ProtocolTimestampMismatchError}, or {@link ProtocolInvalidDataError} of
 * the first change skipped in a reply, with its details. The owner's status is
 * `Error` with it too, unless a relay has a failure. Once this database stores
 * a valid change with that timestamp, for example from another relay, the relay
 * no longer offers its copy, and the route completes with its next sync, such
 * as after a reconnect or {@link Evolu.requestSync}, during which no changes
 * arrive from other relays. If you don't trust that relay, stop using it for
 * the owner. For owners that use the default transports, such as
 * {@link Evolu.appOwner} when {@link EvoluConfig.transports} is not empty,
 * replace the relay there; an empty list stops syncing the app owner and makes
 * {@link Evolu.useOwner} require explicit transports. For an owner you passed
 * explicit transports to {@link Evolu.useOwner}, call its {@link UnuseOwner} and
 * use it again without that relay. Do this wherever the owner is used, such as
 * in every tab, because the owner syncs through every transport any of its uses
 * claims. If every route of the owner shows
 * {@link DecryptWithXChaCha20Poly1305Error} and your code creates or shares the
 * owner, check the owner's keys.
 *
 * A {@link ProtocolChangeTooLargeError} skip is a change no protocol message can
 * hold: one this device saved before {@link maxMutationSize} existed, or a
 * crafted one received from a relay. Every route through a relay that lacks it
 * shows it after each sync, and everything else still syncs, but changes
 * received from one relay reach the others only after a reconnect or
 * {@link Evolu.requestSync}. The change is not recovered, and replacing relays
 * does not help.
 *
 * @group Core
 */
export type EvoluError =
  | DatabaseHeldError
  | OtherBuildRunningError
  | UnknownError
  | UnsupportedDbVersionError;

/**
 * The largest {@link Mutation}, in bytes.
 *
 * A mutation's size is its change as encoded for sync: the table name, the ID,
 * and every column name and value, with a few bytes of overhead. A string takes
 * at most three bytes per UTF-16 code unit. Every mutation within the limit
 * fits one protocol message, so it can always sync. A larger mutation throws
 * and is not saved. Mutations of local-only tables are exempt, because they
 * never sync. Measure a mutation in advance with {@link Evolu.getMutationSize}.
 *
 * @group Core
 */
export const maxMutationSize: PositiveInt =
  /*#__PURE__*/ PositiveInt.orThrow(640_000);

/** Measures a mutation as {@link maxMutationSize} describes. */
const measureMutation = (change: DbChange): PositiveInt => {
  // Measuring with the protocol's encoding keeps the limit and the message size
  // from disagreeing. A separate formula would save the tab about 3 KB
  // compressed, but it would be a second encoding to keep in sync, and it
  // would have to overcount.
  const buffer = createBuffer();
  // Every timestamp takes 16 bytes.
  encodeDbChange(buffer, { timestamp: createTimestamp(), change });
  return buffer.getLength() as PositiveInt;
};

const mutationSizeId = /*#__PURE__*/ Id.orThrow("A".repeat(22));

/**
 * Dependency wrapper for the shared {@link EvoluError} store.
 *
 * @group Construction
 */
export interface EvoluErrorDep {
  /**
   * {@link ReadonlyStore} of {@link EvoluError} shared by all {@link Evolu}
   * instances created from the same {@link createEvoluDeps} result.
   *
   * Starts at `null` and otherwise holds the latest reported error until the
   * first {@link UnsupportedDbVersionError}. That refusal remains for the
   * lifetime of these dependencies, even if a tenant is disposed and recreated.
   * Later errors are still logged but do not replace it or notify this store's
   * subscribers. Fresh dependencies start with a fresh error store. An
   * {@link OtherBuildRunningError} reports a wait, so the store returns to
   * `null` when the wait ends, unless another error replaced it.
   *
   * Subscribe once to show user-facing error messages across all instances. A
   * database whose worker throws while it starts or handles a request, or whose
   * worker script fails to load on the web, is refused with an
   * {@link UnknownError}. While a refused database's tenant remains alive, the
   * SharedWorker sends the refusal once to each tab with an instance of the
   * database, and again to the tab of each instance created afterwards, also in
   * a tab that connects later, and starts no replacement database workers.
   * After all instances release that tenant and it is disposed when idle,
   * creating another instance retries startup and may send the refusal again.
   * On the web, a tab refused with {@link UnsupportedDbVersionError} first
   * reloads once instead. Show that blocking message outside any query-loading
   * boundary, so pending queries do not hide it.
   *
   * An {@link UnknownError} leaves Evolu in an unknown state, so the app can
   * only ask the user to close all its tabs. A failed shared worker closes
   * itself, and a database whose worker failed stays refused while any tab uses
   * it, so the app opened again starts over. Some errors reach every tab
   * connected to the stored worker, such as an unexpected failure of that
   * worker. An app that forwards this store to an error tracker from each tab
   * then reports such an error once per tab. On the web, dependencies start the
   * stored worker as soon as their initial storage check succeeds, even before
   * an instance exists. When the browser refuses storage, these dependencies
   * start no stored worker and listen to none, so this store includes only
   * errors from the workers of memory instances these dependencies created. A
   * memory instance worker's failure reaches only its own tab. A failed worker
   * that a tab hosts, except a web worker whose script failed to load, is also
   * reported by that tab's error reporter, its error handlers on the web or
   * `ErrorUtils` in React Native, so an app that sends both to one error
   * tracker sees that failure twice. A tab hosts each database's worker, on the
   * web each of its memory instances' workers, and also the shared worker in
   * React Native or in a browser without SharedWorker.
   *
   * ### Example
   *
   * ```ts
   * import {
   *   assertEqual,
   *   createStore,
   *   type EvoluError,
   * } from "@evolu/common";
   * import type { EvoluErrorDep } from "@evolu/common/local-first";
   *
   * // The message for the current error, or null for none.
   * const errorMessage = (error: EvoluError | null): string | null => {
   *   if (!error) return null;
   *   switch (error.type) {
   *     case "UnsupportedDbVersionError":
   *       return "Your data requires a newer version of this app. Please update it.";
   *     case "DatabaseHeldError":
   *       return "Your data is still in use elsewhere. Close this app's other tabs or restart the browser, then reload this page.";
   *     case "OtherBuildRunningError":
   *       return "This app is open in another tab with a different version. Close that tab to continue.";
   *     case "UnknownError":
   *       return "Something went wrong. Please close all tabs of this app and open it again.";
   *   }
   * };
   *
   * // Stand-in for run.deps.evoluError from createEvoluDeps.
   * using evoluError = createStore<EvoluError | null>(null);
   * const deps = { evoluError } satisfies EvoluErrorDep;
   * // What the app showed over time; null hides the message.
   * const shown: Array<string | null> = [];
   *
   * deps.evoluError.subscribe(() => {
   *   shown.push(errorMessage(deps.evoluError.get()));
   * });
   *
   * // Another version keeps this tab waiting, then the wait ends.
   * deps.evoluError.set({ type: "OtherBuildRunningError" });
   * deps.evoluError.set(null);
   *
   * assertEqual(shown, [
   *   "This app is open in another tab with a different version. Close that tab to continue.",
   *   null,
   * ]);
   * ```
   */
  readonly evoluError: ReadonlyStore<EvoluError | null>;
}

/**
 * Dependency wrapper for the shared {@link SyncState} store.
 *
 * @group Construction
 */
export interface SyncStateDep {
  /**
   * {@link ReadonlyStore} of the latest {@link SyncState} from these
   * dependencies' workers, or null before any of them sends a snapshot. It
   * lists every database the shared worker serves, other tabs' included. On the
   * web, memory databases run in workers of their own, so it also lists the
   * memory databases of instances these dependencies created. On the web,
   * dependencies start the stored worker as soon as their initial storage check
   * succeeds, even before an instance exists; when the browser refuses storage,
   * the store includes only the memory databases of instances these
   * dependencies created. Each worker reports its own transports, so one relay
   * can appear once per worker. An app finds its own database by
   * {@link Evolu.name}. Apps show users an owner's {@link OwnerSyncStatus}, from
   * {@link syncStateToOwnerSyncStatus} or a framework binding's
   * `useOwnerSyncStatus`; views of each relay use
   * {@link syncStateToRelaySyncStates}.
   *
   * Each snapshot keeps the previous snapshot's object for every part that did
   * not change, and a snapshot equal to the previous one leaves the store
   * unchanged, so parts and derived statuses can be compared with `===`.
   *
   * ### Example
   *
   * ```ts
   * import {
   *   assertEqual,
   *   createId,
   *   createStore,
   *   Millis,
   *   testCreateDeps,
   * } from "@evolu/common";
   * import {
   *   RelayUrl,
   *   type SyncState,
   *   type SyncStateDep,
   * } from "@evolu/common/local-first";
   *
   * const openRelayLabels = (
   *   deps: SyncStateDep,
   * ): ReadonlyArray<string> => [
   *   ...new Set(
   *     (deps.syncState.get()?.transports ?? [])
   *       .filter(({ connection }) => connection.type === "Open")
   *       .map(({ label }) => label),
   *   ),
   * ];
   *
   * using syncState = createStore<SyncState | null>(null);
   * assertEqual(openRelayLabels({ syncState }), []);
   *
   * const deps = testCreateDeps();
   * syncState.set({
   *   transports: [
   *     {
   *       type: "WebSocket",
   *       id: createId<"SyncTransport">(deps),
   *       label: RelayUrl.orThrow("wss://relay.example/"),
   *       connection: {
   *         type: "Open",
   *         openedAt: Millis.orThrow(1000),
   *         error: null,
   *       },
   *     },
   *     {
   *       type: "WebSocket",
   *       id: createId<"SyncTransport">(deps),
   *       label: RelayUrl.orThrow("wss://relay.example/"),
   *       connection: {
   *         type: "Open",
   *         openedAt: Millis.orThrow(1000),
   *         error: null,
   *       },
   *     },
   *   ],
   *   tenants: [],
   * });
   * assertEqual(openRelayLabels({ syncState }), ["wss://relay.example/"]);
   * ```
   */
  readonly syncState: ReadonlyStore<SyncState | null>;
}

/**
 * Asks the platform to keep stored databases until the user deletes them.
 *
 * Only unsynced local changes exist nowhere else, so each {@link Evolu} instance
 * calls it after its first local mutation, when its
 * {@link Evolu.devicePersistence} is `Unknown`. A platform provides it when its
 * storage can be deleted without the user, as a browser's can.
 *
 * @group Construction
 */
export interface RequestPersistentStorageDep {
  readonly requestPersistentStorage: () => void;
}

/**
 * Tells what the platform can promise about the databases it stores.
 *
 * {@link createEvoluDeps} asks it once and gives every instance without
 * {@link EvoluConfig.memoryOnly} the same answer. `NotPersisted` means the
 * platform offers no persistent storage now, as a browser does in Safari's
 * Private Browsing or a Firefox private window, so the instance keeps its
 * database in memory, under the random per-instance name `memoryOnly` gives it.
 * A platform that cannot tell a private session from a storage failure answers
 * `NotPersisted` for both: memory loses nothing that refusing to start would
 * have kept, and the stored database stays untouched.
 *
 * A later storage failure is reported through the normal error path; it never
 * silently changes an instance from stored to memory. Its answer stays the same
 * for the deps' lifetime, as {@link createEvoluDeps}' does, which asks the
 * platform once, so code that asks it again, such as an unlock after a start
 * that asked, gets the answer it started with.
 *
 * @group Construction
 */
export interface DevicePersistenceDep {
  readonly getDevicePersistence: () => Promise<DevicePersistence>;
}

/**
 * The worker {@link CreateStoredWorkerDep} started, once the platform's storage
 * check answers.
 *
 * Where that worker did not start, because storage is refused on a platform
 * whose memory instances have workers of their own or because the deps were
 * disposed first, or where it failed to start, it resolves to a worker that
 * drops every message.
 *
 * @group Construction
 */
export interface StoredWorkerDep {
  readonly storedWorker: Promise<SharedWorker>;
}

/**
 * Shared platform dependencies for creating {@link Evolu} instances.
 *
 * Includes platform adapters, the shared {@link EvoluErrorDep.evoluError} store,
 * and disposal for owned resources.
 *
 * @group Construction
 */
export type EvoluDeps = EvoluPlatformDeps &
  ConsoleDep &
  EvoluErrorDep &
  StoredWorkerDep &
  SyncStateDep &
  Disposable;

/**
 * Platform-specific dependencies {@link createEvoluDeps} passes to every
 * {@link createEvolu} instance.
 *
 * Provides worker and channel adapters plus optional platform integrations for
 * logging, synchronous UI flush, persistent storage requests, and
 * {@link CreateMemoryInstanceWorkerDep} for workers owned by memory instances.
 * {@link createEvoluDeps} also takes {@link CreateStoredWorkerDep}.
 *
 * @group Construction
 */
export type EvoluPlatformDeps = CreateDbWorkerDep &
  CreateBroadcastChannelDep &
  CreateMessageChannelDep &
  DevicePersistenceDep &
  LockManagerDep &
  ReloadAppDep &
  Partial<ConsoleDep> &
  Partial<CreateMemoryInstanceWorkerDep> &
  Partial<FlushSyncDep> &
  Partial<RequestPersistentStorageDep>;

/**
 * Creates shared dependencies used by all {@link createEvolu} instances on a
 * platform.
 *
 * Call this once per platform and reuse the returned deps when creating
 * multiple Evolu instances. The returned deps object owns long-lived resources
 * such as worker channels and the shared {@link EvoluErrorDep.evoluError} and
 * {@link SyncStateDep.syncState} stores. The sync state includes the stored
 * worker and every private memory worker created through these deps. Where the
 * platform provides {@link CreateMemoryInstanceWorkerDep}, as the web does, a
 * memory instance owns and disposes its private worker; its errors and console
 * entries reach only these deps.
 *
 * It checks storage once and starts the stored worker as soon as the check
 * answers, without waiting for an instance. Where storage is refused and memory
 * instances have workers of their own, it never starts it, so such a browser
 * tab takes no part in stored workers' build coordination.
 *
 * Dispose it only during app shutdown.
 *
 * @group Construction
 */
export const createEvoluDeps = (
  deps: EvoluPlatformDeps & CreateStoredWorkerDep,
): EvoluDeps => {
  const { createBroadcastChannel, createMemoryInstanceWorker } = deps;
  const console = deps.console ?? createConsole();
  // Each worker owns its sockets and tenants. Include private workers in this
  // deps' snapshot, and remove their entries when their instance ends.
  const statesByWorker = new Map<SharedWorker, SyncState>();
  const workers = new Set<Disposable>();
  let isDisposed = false;

  using disposer = new DisposableStack();
  const evoluError = disposer.use(createStore<EvoluError | null>(null));
  const syncState = disposer.use(createStore<SyncState | null>(null));
  disposer.defer(() => {
    isDisposed = true;
    // Whole-deps shutdown keeps the last snapshot and notifies no subscribers,
    // whose errors could otherwise interrupt disposal of the remaining workers.
    statesByWorker.clear();
    for (const worker of workers) worker[Symbol.dispose]();
  });

  const setEvoluError = (error: EvoluError): void => {
    if (evoluError.get()?.type === "UnsupportedDbVersionError") return;
    evoluError.set(error);
  };

  const publishSyncState = (): void => {
    const states = [...statesByWorker.values()];
    const state: SyncState = {
      transports: states.flatMap((state) => state.transports),
      tenants: states.flatMap((state) => state.tenants),
    };
    // Structured clones get their unchanged parts back, including when another
    // worker supplied the snapshot, so unrelated instances keep their identity.
    // An unchanged merged snapshot keeps the store's previous value.
    const previous = syncState.get();
    syncState.set(
      previous ? shareStructure(previous, state, syncStateItemToKey) : state,
    );
  };

  const connectWorker = (
    sharedWorker: SharedWorker,
    mode: "stored" | "memory-instance",
  ): SharedWorker => {
    let syncStateBroadcastChannel: BroadcastChannel<SyncState> | null = null;
    let tabLeaderElection: Disposable | null = null;

    using workerDisposer = new DisposableStack();
    workerDisposer.use(sharedWorker);
    workerDisposer.defer(() => {
      tabLeaderElection?.[Symbol.dispose]();
      syncStateBroadcastChannel?.[Symbol.dispose]();
      if (statesByWorker.delete(sharedWorker)) publishSyncState();
    });
    const connectedResources = workerDisposer.use(new DisposableStack());
    const listenForConsoleEntries = (channelName: string): void => {
      const consoleEntryOrErrorBroadcastChannel = connectedResources.use(
        createBroadcastChannel<ConsoleEntryOrError>(channelName),
      );
      consoleEntryOrErrorBroadcastChannel.onMessage = (message) => {
        switch (message.type) {
          case "ConsoleEntry":
            console.write(message.entry);
            // Fallback channel for unexpected errors without EvoluError typing.
            if (message.entry.method === "error") {
              setEvoluError(createUnknownError(message.entry.args));
            }
            break;

          case "Error": {
            // Keep typed errors visible in logs as operational failures,
            // logged first, so an evoluError listener that throws doesn't hide
            // them.
            console.error(message.error);
            // Stored workers of every build share their channel, so another
            // build can post an error type this build does not post, such as
            // an older build's sync error. That build's own tabs show it, so
            // this tab only logs it. A memory worker's channel reaches only
            // its owning deps.
            if (message.error.type === "UnknownError")
              setEvoluError(message.error);
            break;
          }

          default:
            exhaustiveCheck(message);
        }
      };
    };
    if (mode === "stored")
      listenForConsoleEntries(consoleEntryOrErrorBroadcastChannelName);
    const { port } = sharedWorker;
    port.onMessage = (message) => {
      switch (message.type) {
        case "DbWorkerInit": {
          const dbWorker = deps.createDbWorker();
          // A memory instance owns every DbWorker its private worker requests.
          if (mode === "memory-instance") connectedResources.use(dbWorker);
          dbWorker.postMessage(message, [message.port]);
          break;
        }

        case "Error":
          // Sent to this tab only: its database is refused, a mutation it made
          // could not be stored, its stored worker still waits for another
          // build, or its memory worker failed to load or reported an uncaught
          // error.
          // Logged first, so an evoluError listener that throws doesn't hide it.
          console.error(message.error);
          setEvoluError(message.error);
          break;

        case "Waiting":
          // Platform adapters act on it; see Builds in the Shared module.
          break;

        case "Connected": {
          assert(
            !syncStateBroadcastChannel,
            "The shared worker connects once.",
          );
          // The stored worker's channel is open since it started.
          if (mode === "memory-instance") {
            listenForConsoleEntries(message.consoleEntryOrErrorChannelName);
          }
          // This worker is its channel's only sender, and one sender's
          // messages arrive in order, so its last snapshot is current.
          syncStateBroadcastChannel = createBroadcastChannel<SyncState>(
            message.syncStateChannelName,
          );
          syncStateBroadcastChannel.onMessage = (state) => {
            statesByWorker.set(sharedWorker, state);
            publishSyncState();
          };
          // Asking only after listening misses no snapshot.
          port.postMessage({ type: "RequestSyncState" });
          const announceTabLeader = (): void => {
            port.postMessage({
              type: "AnnounceTabLeader",
              consoleLevel: console.getLevel(),
            });
          };
          if (mode === "stored") {
            // Only this stored worker's tabs compete to host its DbWorkers.
            tabLeaderElection = acquireLeaderLockCallback(deps)(
              `tab-${message.workerId}`,
              announceTabLeader,
            );
          } else {
            // The instance's own tab is its only host, for its whole lifetime.
            announceTabLeader();
          }
          // Only the stored worker's connection ends the wait it reported.
          // Last, so an app's listener that throws stops none of the above.
          if (
            mode === "stored" &&
            evoluError.get()?.type === "OtherBuildRunningError"
          ) {
            evoluError.set(null);
          }
          break;
        }

        default:
          exhaustiveCheck(message);
      }
    };

    const disposables = workerDisposer.move();
    const connectedWorker: SharedWorker = {
      port,
      [Symbol.dispose]: () => {
        workers.delete(connectedWorker);
        disposables.dispose();
      },
    };
    workers.add(connectedWorker);
    return connectedWorker;
  };

  const createClosedWorker = (): SharedWorker => {
    // A disposed port drops what instances post to it.
    using channel = deps.createMessageChannel<
      SharedWorkerInput,
      SharedWorkerOutput
    >();
    return { port: channel.port1, [Symbol.dispose]: constVoid };
  };

  const startWorker = (
    create: () => SharedWorker,
    mode: "stored" | "memory-instance",
  ): SharedWorker => {
    const worker = trySync(create);
    if (worker.ok) return connectWorker(worker.value, mode);
    const error = createUnknownError(worker.error);
    // Reported after the caller, so an evoluError subscriber that throws
    // cannot reject the stored worker or end the Run creating an instance. A
    // console output that throws does not keep it from evoluError either.
    queueMicrotask(() => {
      try {
        console.error(error);
      } finally {
        setEvoluError(error);
      }
    });
    return createClosedWorker();
  };

  const devicePersistence = deps.getDevicePersistence();
  const storedWorker = devicePersistence.then((persistence) =>
    !isDisposed &&
    (persistence !== "NotPersisted" || !createMemoryInstanceWorker)
      ? startWorker(deps.createStoredWorker, "stored")
      : createClosedWorker(),
  );

  return disposable<EvoluDeps>(
    {
      ...deps,
      console,
      evoluError,
      getDevicePersistence: () => devicePersistence,
      storedWorker,
      syncState,
      ...(createMemoryInstanceWorker && {
        createMemoryInstanceWorker: () =>
          startWorker(createMemoryInstanceWorker, "memory-instance"),
      }),
    },
    disposer,
  );
};

// An uncached load rejects with the error of the query SQLite failed, which a
// Task returns, rather than treating it as a defect.
const loadUncached = <S extends EvoluSchema, R extends Row>(
  evolu: Pick<EvoluInstance<S>, "loadQuery">,
  query: Query<S, R>,
): Task<QueryRows<R>, UnknownError> =>
  promiseToTask(
    () => evolu.loadQuery(query, { cache: false }),
    (error) => error as UnknownError,
  );

// Transports, tenants, owners, and routes come and go, so each is compared
// with its previous self by its ID: a transport's id, a tenant's name, an
// owner's ownerId, or a route's transportId. A wrong key only loses sharing.
const syncStateItemToKey = (item: unknown): unknown =>
  isPlainObject(item)
    ? (item.id ?? item.name ?? item.ownerId ?? item.transportId)
    : undefined;

/**
 * Creates an {@link Evolu} instance from {@link EvoluSchema} and
 * {@link EvoluConfig}.
 *
 * @group Construction
 */
export const createEvolu =
  <S extends EvoluSchema>(
    schema: ValidateSchema<S> extends never ? S : ValidateSchema<S>,
    config: EvoluConfig,
  ): Task<Evolu<S>, never, EvoluPlatformDeps & StoredWorkerDep> =>
  async (run) => {
    const { appOwner, onDatabaseDeleted } = config;
    const { evolu } = await run.ok(
      createEvoluInstance<S>(
        schema,
        {
          ...config,
          // Called without the argument the app's callback doesn't expect.
          ...(onDatabaseDeleted && {
            onDatabaseDeleted: () => {
              onDatabaseDeleted();
            },
          }),
        },
        appOwner,
        { type: "Standalone" },
      ),
    );
    // The instance is still under construction: nothing outside holds it yet.
    return ok(Object.assign(evolu, { appOwner }));
  };

/**
 * Configuration for {@link createEvoluApp}. The other options apply to every
 * AppOwner's instance.
 *
 * @group Construction
 */
export interface EvoluAppConfig<
  D extends EvoluSchema = EmptyEvoluSchema,
> extends Omit<EvoluConfig, "appOwner" | "memoryOnly" | "onDatabaseDeleted"> {
  readonly auth: EvoluAppAuth;
  /**
   * Whether the startup that creates the device database also creates the first
   * AppOwner, so the app starts with one. It never creates one in an existing
   * device database, even when the app deleted every AppOwner. An app that
   * starts with a choice, such as to create or restore an AppOwner, sets it to
   * `false`. To start over, add a new AppOwner first, then remove the old one
   * with {@link EvoluApp.remove}, so a crash between the two leaves two
   * AppOwners rather than none.
   */
  readonly createFirstAppOwner: boolean;

  /**
   * The AppOwner this tab starts with:
   *
   * | Value   | Start                                            |
   * | ------- | ------------------------------------------------ |
   * | omitted | the AppOwner opened most recently on this device |
   * | an ID   | that AppOwner if listed, otherwise none open     |
   * | `null`  | none open                                        |
   *
   * Evolu reloads tabs on its own, such as when another build of the app
   * starts, so a tab that showed one AppOwner can come back with one another
   * tab opened since. Omitted, the tab starts with that one, while the ID of
   * the AppOwner it showed starts it where it was. With `null`, the tab opens
   * none, such as to let the user choose without opening and syncing an
   * AppOwner they didn't pick. An ID that isn't listed, such as of an AppOwner
   * another tab removed, opens none either, not the one opened most recently.
   * The start records no open time, so a later start without this option still
   * opens the one opened most recently.
   *
   * Where the ID comes from is the app's business, such as a URL fragment,
   * which no server sees. Don't put the {@link OwnerId} itself in a URL, not
   * even in its fragment: URLs land in browser history, which browsers sync,
   * and in shared links and screenshots, while an OwnerId is secret to everyone
   * but the owner's relays and those it's shared with. Keep a non-secret alias
   * instead, such as in a device table, and map it to the OwnerId.
   */
  readonly startAppOwnerId?: OwnerId | null;

  /** The app's own tables in the device database; see {@link DeviceEvolu}. */
  readonly device?: EvoluAppDeviceConfig<D>;
}

declare const emptyEvoluSchemaSymbol: unique symbol;

/**
 * An {@link EvoluSchema} without tables, the device schema of an app without
 * device tables. It has no table to write, so `app.device.insert("todo", {})`
 * doesn't compile, and it matches no other schema, so neither does a query of
 * the app's own tables, such as `app.device.loadQuery(allTodos)`.
 *
 * @group Construction
 */
// Its only key is optional and type-only, so a schema with tables shares none
// of its properties, which TypeScript rejects; an empty object type would
// accept every schema, and a string index every table name. A type alias, not
// an interface, so it keeps the implicit index signature EvoluSchema needs.
export type EmptyEvoluSchema = { readonly [emptyEvoluSchemaSymbol]?: never };

/**
 * The app's own tables in the device database and their indexes. The schema
 * can't define Evolu's table, `_evolu_appOwner`.
 *
 * @group Construction
 */
export interface EvoluAppDeviceConfig<D extends EvoluSchema> {
  readonly schema: (ValidateSchema<D> extends never ? D : ValidateSchema<D>) & {
    readonly _evolu_appOwner?: never;
  };
  readonly indexes?: IndexesConfig;
}

/**
 * The instance of an app's device database, for the app's data that belongs to
 * this device rather than to an AppOwner, such as settings. Its own owner is
 * the device owner, which never syncs, so it has no {@link Evolu.appOwner}:
 * local-only tables keep their rows on this device, and a mutation of a synced
 * table must pass, as its `owner`, an owner the app syncs with
 * {@link Evolu.useOwner}, such as one for settings shared by every AppOwner. An
 * AppOwner's data lives only in its own database, which {@link EvoluApp.remove}
 * deletes, so neither takes an AppOwner. The app's
 * {@link EvoluConfig.onOwnerDeleted} also runs for an owner deleted in it, in
 * any tab.
 *
 * It has no {@link Evolu.exportDatabase} or {@link Evolu.deleteDatabase}, because
 * the device database also holds the secret of every AppOwner on this device,
 * which its type hides. An export would write them all in plaintext, even with
 * encrypted local data, and a deletion would lose them all, leaving their
 * databases with nothing to open them. {@link EvoluApp.remove} deletes one
 * AppOwner's data. The app disposes it, so it can't be disposed alone. Its SQL
 * isn't traced, because tracing logs values, and those include the secrets.
 *
 * @group Construction
 */
export interface DeviceEvolu<D extends EvoluSchema> extends Omit<
  Evolu<D>,
  | "appOwner"
  | "exportDatabase"
  | "deleteDatabase"
  | "useOwner"
  | "insert"
  | "update"
  | "upsert"
  | typeof Symbol.asyncDispose
> {
  /**
   * {@link Evolu.useOwner}, for an owner that isn't an AppOwner. The device
   * instance has no default transports, so it takes them.
   */
  readonly useOwner: (
    owner: ShardOwner | SharedOwner | SharedReadonlyOwner,
    transports: NonEmptyReadonlyArray<OwnerTransport>,
  ) => UnuseOwner;
  /** {@link Evolu.insert}, as a {@link DeviceMutation}. */
  readonly insert: DeviceMutation<D, "insert">;
  /** {@link Evolu.update}, as a {@link DeviceMutation}. */
  readonly update: DeviceMutation<D, "update">;
  /** {@link Evolu.upsert}, as a {@link DeviceMutation}. */
  readonly upsert: DeviceMutation<D, "upsert">;
}

/**
 * A {@link Mutation} of a {@link DeviceEvolu}. The device owner never syncs, so a
 * mutation of a synced table, one whose name doesn't start with `_`, takes
 * options with the `owner` the app syncs that table's rows with, which isn't an
 * AppOwner. A local-only table's rows stay on this device, so its mutations
 * need no owner.
 *
 * @group Construction
 */
export type DeviceMutation<D extends EvoluSchema, Kind extends MutationKind> = <
  TableName extends keyof D & string,
>(
  table: TableName,
  values: MutationValues<D[TableName], Kind>,
  // Not distributed, so a union of table names takes an owner unless every
  // one is local-only.
  ...options: [TableName] extends [`_${string}`]
    ? [options?: MutationOptions<ShardOwner | SharedOwner>]
    : [
        options: MutationOptions<ShardOwner | SharedOwner> & {
          readonly owner: ShardOwner | SharedOwner;
        },
      ]
) => { readonly id: StandardSchemaV1.InferOutput<D[TableName]["id"]> };

/**
 * An AppOwner the app can open on this device, without its secret.
 *
 * @group Construction
 */
export interface AppOwnerEntry {
  readonly id: OwnerId;
  readonly name: NonEmptyTrimmedString100 | null;
  readonly lastOpenedAt: DateIso | null;
}

/**
 * The AppOwner this tab has open and its instance. `evolu` is the same promise
 * until this tab opens another AppOwner, or the AppOwner again after a removal
 * or a deletion of its database, so React's `use` can read it.
 *
 * @group Construction
 */
export interface CurrentAppOwner<S extends EvoluSchema> {
  readonly appOwner: AppOwner;
  readonly evolu: Promise<AppOwnerEvolu<S>>;
}

/**
 * An {@link Evolu} instance without disposal, for code that uses an instance it
 * doesn't own, such as one {@link createEvoluApp} opened, which the app
 * disposes.
 *
 * @group Construction
 */
export interface AppOwnerEvolu<S extends EvoluSchema> extends Omit<
  Evolu<S>,
  typeof Symbol.asyncDispose
> {}

/**
 * The AppOwner a tab has open, as {@link subscribeAppOwnerState} follows it:
 * none open, its instance opening, or open with its instance.
 *
 * @group Construction
 */
export type AppOwnerState<S extends EvoluSchema> =
  NoAppOwnerState | OpeningAppOwnerState<S> | OpenAppOwnerState<S>;

/**
 * No AppOwner is open in this tab, such as on a device without one or after the
 * open one's removal.
 *
 * @group Construction
 */
export interface NoAppOwnerState extends Typed<"None"> {}

/**
 * The tab has an AppOwner open, whose instance opens.
 *
 * @group Construction
 */
export interface OpeningAppOwnerState<
  S extends EvoluSchema,
> extends Typed<"Opening"> {
  readonly current: CurrentAppOwner<S>;
}

/**
 * The tab has an AppOwner open, with its instance.
 *
 * @group Construction
 */
export interface OpenAppOwnerState<
  S extends EvoluSchema,
> extends Typed<"Open"> {
  readonly current: CurrentAppOwner<S>;
  readonly evolu: AppOwnerEvolu<S>;
}

/**
 * Follows `current`, such as {@link EvoluApp.current}, as an
 * {@link AppOwnerState}, and calls `onChange` with the state at once and
 * whenever it changes. Another instance, as when the tab opens another
 * AppOwner, or the AppOwner again after a removal and restore or its database's
 * deletion, is `Opening` until its promise resolves, and then `Open`, so a UI
 * keyed by the instance remounts. Another {@link CurrentAppOwner} with the same
 * instance keeps the state's type and instance, with the new `current`. An
 * instance that opens after the tab moved on changes nothing, and one that
 * never opens, as an aborted open's, leaves the state `Opening`. Once
 * unsubscribed, an instance that opens changes nothing.
 *
 * The UI bindings follow the app with it, and so can an app without one.
 *
 * ### Example
 *
 * ```ts
 * import {
 *   assertType,
 *   subscribeAppOwnerState,
 *   type EvoluApp,
 *   type Name,
 *   type TestEvoluSchema,
 *   type Unsubscribe,
 * } from "@evolu/common";
 *
 * // Renders the open AppOwner's database name, or what shows meanwhile.
 * const renderApp = (
 *   app: EvoluApp<TestEvoluSchema>,
 *   render: (text: Name | "Opening" | "None") => void,
 * ): Unsubscribe =>
 *   subscribeAppOwnerState(app.current, (state) => {
 *     render(state.type === "Open" ? state.evolu.name : state.type);
 *   });
 *
 * assertType<ReturnType<typeof renderApp>, Unsubscribe>();
 * ```
 *
 * @group Construction
 */
export const subscribeAppOwnerState = <S extends EvoluSchema>(
  current: ReadonlyStore<CurrentAppOwner<S> | null>,
  onChange: (state: AppOwnerState<S>) => void,
): Unsubscribe => {
  let state: AppOwnerState<S> = noAppOwnerState;

  const set = (next: AppOwnerState<S>): void => {
    state = next;
    onChange(next);
  };

  const follow = (): void => {
    const next = current.get();
    if (!next) {
      set(noAppOwnerState);
      return;
    }
    if (state.type !== "None" && state.current.evolu === next.evolu) {
      if (state.current !== next) set({ ...state, current: next });
      return;
    }
    set({ type: "Opening", current: next });
    void next.evolu.then((evolu) => {
      if (state.type === "Opening" && state.current.evolu === next.evolu)
        set({ type: "Open", current: state.current, evolu });
    });
  };

  follow();
  const unsubscribe = current.subscribe(follow);

  return () => {
    unsubscribe();
    // An instance that opens later then changes nothing.
    state = noAppOwnerState;
  };
};

const noAppOwnerState: NoAppOwnerState = { type: "None" };

/**
 * An error of {@link EvoluApp.remove}: a {@link DeleteDatabaseError} of the
 * AppOwner's database, or the refusal of the device database, which can also be
 * an {@link UnsupportedDbVersionError}.
 *
 * @group Construction
 */
export type RemoveAppOwnerError =
  DeleteDatabaseError | UnsupportedDbVersionError;

/**
 * An app whose AppOwners Evolu creates and keeps on this device. Each tab opens
 * one AppOwner, starting with the one opened most recently. An AppOwner's
 * instance stays open until the app is disposed.
 *
 * @group Construction
 */
export interface EvoluApp<
  S extends EvoluSchema,
  D extends EvoluSchema = EmptyEvoluSchema,
> extends AsyncDisposable {
  /**
   * The AppOwners the app can open on this device, the one opened most recently
   * first, then the oldest.
   */
  readonly appOwners: ReadonlyStore<ReadonlyArray<AppOwnerEntry>>;

  /**
   * The AppOwner this tab has open, or `null` while it has none. It starts with
   * the one opened most recently, or as {@link EvoluAppConfig.startAppOwnerId}
   * says. A removal of the open AppOwner, in any tab, leaves the tab with none,
   * as does its disappearing from {@link EvoluApp.appOwners}, until the app
   * opens one. The tab never opens another AppOwner on its own, and a deletion
   * of the open one's database, with {@link Evolu.deleteDatabase}, opens it
   * again, empty, with a new promise.
   */
  readonly current: ReadonlyStore<CurrentAppOwner<S> | null>;

  /**
   * Opens an AppOwner in this tab and records when, so the next start opens it
   * too. Other tabs keep theirs. An AppOwner that isn't listed, such as one
   * another tab just removed, opens nothing, and one this tab still lists after
   * another tab removed it leaves this tab with none open.
   */
  readonly open: (id: OwnerId) => void;

  /**
   * Adds an AppOwner, a new one or one restored from its secret, and opens it
   * once the device database stores it, unless this tab opened or added another
   * meanwhile. Adding a secret that is already there updates its entry. An add
   * made while a removal runs waits for it, so an AppOwner added after its
   * removal opens an empty database on this device. It fails when the write, or
   * the read of the AppOwners after it, fails, when the device database is
   * refused, or when the app is disposed; a failed add can still have taken
   * effect, and adding again is safe.
   */
  readonly add: (
    secret: OwnerSecret,
    name?: NonEmptyTrimmedString100,
  ) => Promise<Result<OwnerId, UnknownError | EvoluDisposedError>>;

  /** Names an AppOwner on this device, or removes its name with `null`. */
  readonly rename: (id: OwnerId, name: NonEmptyTrimmedString100 | null) => void;

  /**
   * Deletes an AppOwner's data from this device and removes it from this
   * device's list, so its changes not yet synced are lost for good, while its
   * data on relays stays. Adding the AppOwner again syncs that data back. An
   * AppOwner that isn't listed removes nothing. It works also when the
   * AppOwner's database doesn't open, such as a corrupt one. The tabs that had
   * the AppOwner open have none open afterwards. When deleting fails, such as
   * when another context holds the database's files, the AppOwner stays with
   * the data its database stored, and the tabs that had it open can be left
   * with none open. After a `DatabaseHeldError`, its data may already be gone,
   * and removing it again finishes the removal. When the app's last tab closes
   * during the removal, the AppOwner can stay listed without its local data,
   * which syncs again when it's opened, and removing it again finishes the
   * removal. It fails with the refusal when the device database is refused. The
   * app's disposal ends the call with `EvoluDisposedError`, and the removal
   * still finishes.
   *
   * To start over with a new AppOwner, add it first, then remove the old one,
   * so a crash between the two leaves two AppOwners rather than none.
   *
   * ### Example
   *
   * ```ts
   * import {
   *   AppName,
   *   assertEqual,
   *   assertOk,
   *   createEvoluApp,
   *   createOwnerSecret,
   *   id,
   *   NonEmptyTrimmedString100,
   * } from "@evolu/common";
   * import { createEvoluDeps, createRun } from "@evolu/web";
   *
   * const Schema = {
   *   todo: { id: id("Todo"), title: NonEmptyTrimmedString100 },
   * };
   * const run = createRun(createEvoluDeps());
   *
   * await using app = await run.orThrow(
   *   createEvoluApp(Schema, {
   *     appName: AppName.orThrow("StartOver"),
   *     auth: { type: "InstantStart" },
   *     createFirstAppOwner: true,
   *     transports: [],
   *   }),
   * );
   * const [old] = app.appOwners.get();
   *
   * // Start over: add the new AppOwner first, which opens it, then remove the
   * // old one.
   * const added = await app.add(createOwnerSecret(run.deps));
   * assertOk(added);
   * assertOk(await app.remove(old.id));
   * assertEqual(
   *   app.appOwners.get().map(({ id }) => id),
   *   [added.value],
   * );
   * assertEqual(app.current.get()?.appOwner.id, added.value);
   * ```
   */
  readonly remove: (id: OwnerId) => Promise<Result<void, RemoveAppOwnerError>>;

  /** The device database's instance with the app's own device tables. */
  readonly device: DeviceEvolu<D>;
}

/**
 * Creates an {@link EvoluApp}: Evolu creates and keeps the app's AppOwners in a
 * device database that {@link EvoluAppConfig.auth} unlocks, and opens an
 * instance of each AppOwner a tab opens. An app that brings its own AppOwners,
 * such as one deriving them from a hardware wallet, calls {@link createEvolu}
 * instead. It fails with {@link UnknownError} when SQLite fails to read the
 * AppOwners or the device database is refused, as
 * {@link EvoluErrorDep.evoluError} reports too.
 *
 * It stays pending while another build of the app keeps it waiting, and when
 * the shared worker fails to load on the web, which
 * {@link EvoluErrorDep.evoluError} reports.
 *
 * The Run that creates the app must outlive it, as a module-scope Run does:
 * after that Run ends, such as after a panic, the app's methods throw.
 *
 * See docs/adr/evolu-creates-and-stores-app-owners.md.
 *
 * @group Construction
 */
export const createEvoluApp = <
  S extends EvoluSchema,
  D extends EvoluSchema = EmptyEvoluSchema,
>(
  schema: ValidateSchema<S> extends never ? S : ValidateSchema<S>,
  config: EvoluAppConfig<D>,
): Task<EvoluApp<S, D>, UnknownError, EvoluPlatformDeps & StoredWorkerDep> => {
  const { auth, createFirstAppOwner, device, startAppOwnerId, ...appConfig } =
    config;
  const { appName } = appConfig;
  // Its type validated it.
  const deviceSchema = (device?.schema ?? {}) as EvoluSchema;
  // SQLite folds the case of ASCII names, so any spelling is the same table.
  assert(
    !Object.keys(deviceSchema).some(
      (table) => table.toLowerCase() === appOwnerTable.toLowerCase(),
    ),
    `The device schema can't define ${appOwnerTable}, Evolu's table, in any letter case.`,
  );
  // Checked at the call, so a mistake throws to the caller. An instance checks
  // them only when it's created, in the returned Task or in an open, where a
  // mistake would abort the app's Run, and an open would leave `current`
  // pending.
  evoluSchemaToSqliteSchema(schema, appConfig.indexes);
  // Typed with Evolu's tables here and with the app's tables in `device`.
  const deviceDatabaseSchema = { ...deviceSchema, ...deviceEvoluSchema };
  evoluSchemaToSqliteSchema<typeof deviceEvoluSchema>(
    deviceDatabaseSchema,
    device?.indexes,
  );
  if (appConfig.transports) assertDistinctTransports(appConfig.transports);
  // A copy, checked at once, because the caller can change its bytes, even
  // from another thread through a SharedArrayBuffer. The Type rejects a cast
  // value too, which would silently open instant start's public device
  // database or derive another device owner. Not orThrow, whose error for a
  // wrong length would carry the bytes.
  const deviceSecret =
    auth.type === "DeviceSecret" ? new Uint8Array(auth.secret) : null;
  assert(
    !deviceSecret || DeviceSecret.is(deviceSecret),
    "A DeviceSecret has 32 bytes, not all zero, which are instant start's public secret. Create one with createDeviceSecret.",
  );
  const deviceOwner = deviceSecret
    ? createDatabaseOwner(deviceSecret, "Device")
    : instantStartDeviceOwner;

  return async (run) => {
    await using disposer = new AsyncDisposableStack();

    // Every app's device database can have instant start's owner, and macOS's
    // file system and WebKit's OPFS fold the case of names, so its name hashes
    // the exact appName.
    const deviceNameInput = `AppName-${appName}`;
    // The AppOwners' rows, empty until they load below.
    let rows: QueryRows<typeof appOwnersQuery.Row> = emptyArray;
    // Called only once the app is returned, after the rows loaded.
    const isAppOwnerId = (ownerId: OwnerId): boolean =>
      rows.some(({ id }) => id === ownerId);
    const deviceInstance = await run.ok(
      createEvoluInstance<typeof deviceEvoluSchema>(
        deviceDatabaseSchema,
        {
          appName,
          transports: [],
          ...(device?.indexes && { indexes: device.indexes }),
          // One callback for an owner deleted in any instance of the app, so
          // a tab that syncs an owner of the device database here stops using
          // it when another tab deletes it.
          ...(appConfig.onOwnerDeleted && {
            onOwnerDeleted: appConfig.onOwnerDeleted,
          }),
        },
        deviceOwner,
        {
          type: "Device",
          nameInput: deviceNameInput,
          createFirstAppOwner,
          isAppOwnerId,
        },
      ),
    );
    const deviceEvolu = disposer.use(deviceInstance.evolu);
    // Where the platform keeps no storage, every database is kept in memory,
    // the AppOwners' too.
    const memoryOnly =
      (await run.ok(promiseToTask(() => deviceEvolu.devicePersistence))) ===
      "NotPersisted";

    const current = disposer.use(createStore<CurrentAppOwner<S> | null>(null));

    // What `current` holds for each AppOwner, while it opens and once it
    // opened: its CurrentAppOwner, the creation time of the row it was opened
    // for, and its instance once open. The promise never rejects, so React reads no
    // error. An open the app's disposal aborts never settles, and one the rows
    // stopped listing the AppOwner during resolves with its instance, disposed
    // and marked as deleted, as the removal marks one that opened, so a binding
    // that still awaits it settles on a deleted database. A restored row is
    // new, so a tab that missed the removal opens a new instance, not the
    // ended one.
    //
    // A tab takes a restored row for the removed one only when two things
    // happen at once. The system clock was set back to the exact millisecond
    // the removed row was created in, and the tab sees the restored row before
    // the old instance's OnDatabaseDeleted. The SharedWorker sends that message
    // at the start of the removal, while the restored row comes only after the
    // files are deleted and a new add, hundreds of milliseconds later, so it
    // can overtake the message only because they travel on different ports,
    // typically in a tab that was frozen and drains its queued messages. Such
    // a tab keeps the ended instance until the message arrives. A write to it
    // meanwhile is dropped, as is any write of a tab that doesn't know of the
    // removal yet; see closeForRemoval. After the message, `current` is null
    // until the app opens the AppOwner again. That isn't guarded: it would
    // need a generation in the row again, such as a databaseId, for a case
    // that needs both conditions.
    const evolusByOwnerId = new Map<
      OwnerId,
      {
        readonly createdAt: DateIso;
        readonly current: CurrentAppOwner<S>;
        /** Null while it opens. */
        readonly instance: Evolu<S> | null;
      }
    >();

    // Takes an AppOwner's instance out of the cache, so its next open opens a
    // new one.
    const takeInstance = (id: OwnerId): Evolu<S> | null => {
      const instance = evolusByOwnerId.get(id)?.instance ?? null;
      evolusByOwnerId.delete(id);
      return instance;
    };

    // Disposes the instances whose row a removal deleted: the removal ended a
    // stored database, and one kept in memory ends with them. They are marked as
    // OnDatabaseDeleted marks them, because that message and the device
    // database's rows arrive on different ports, and once the rows dispose an
    // instance, its closed port drops the message. A disposal that throws stops
    // no other, nor a removal. Each runs in openRun, so the app's disposal waits
    // for it.
    const disposeInstances =
      (instances: ReadonlyArray<Evolu<S>>): Task<void> =>
      async (run) => {
        await Promise.all(
          instances.map(async (instance) => {
            instancesWithDeletedDatabase.add(instance);
            try {
              await instance[Symbol.asyncDispose]();
            } catch (error) {
              run.deps.reportDefect(error);
            }
          }),
        );
        return ok();
      };

    const openRun = run.create();
    disposer.defer(async () => {
      // Taken over first, so a deletion meanwhile reopens nothing. An open the
      // disposal aborts creates no instance. Each one is disposed, also when
      // the disposal of another fails.
      await using instances = new AsyncDisposableStack();
      for (const { instance } of evolusByOwnerId.values())
        if (instance) instances.use(instance);
      evolusByOwnerId.clear();
      await openRun[Symbol.asyncDispose]();
    });

    const appOwnerChange = (
      kind: "upsert" | "update" | "delete",
      id: OwnerId,
      values: ReadonlyRecord<string, SqliteValue>,
    ): MutationChange & { readonly id: OwnerId } => ({
      ...DbChange.orThrow({
        table: appOwnerTable,
        id,
        values,
        isInsert: kind === "upsert",
        isDelete: kind === "delete" ? true : null,
      }),
      id,
      ownerId: deviceOwner.id,
    });

    const loaded = await run(loadUncached(deviceEvolu, appOwnersQuery));
    if (!loaded.ok) return loaded;
    rows = loaded.value;
    const rowsToEntries = (
      appOwnerRows: typeof rows,
    ): ReadonlyArray<AppOwnerEntry> =>
      appOwnerRows.map(({ id, name, lastOpenedAt }) => ({
        id,
        name,
        lastOpenedAt,
      }));

    const appOwners = disposer.use(createStore(rowsToEntries(rows)));

    // Opens an AppOwner, or nothing when it isn't listed.
    const select = (id: OwnerId | null): void => {
      const row = rows.find((row) => row.id === id);
      let next: CurrentAppOwner<S> | null = null;
      let stale: Evolu<S> | null = null;
      if (row) {
        const cached = evolusByOwnerId.get(row.id);
        if (cached?.createdAt === row.createdAt) {
          // `current` already holds this row's instance.
          if (current.get()?.evolu === cached.current.evolu) return;
          next = cached.current;
        } else {
          const appOwner = createAppOwner(row.secret);
          if (cached) stale = takeInstance(row.id);
          // The app's AppOwner instances never reload it: a removal in any tab
          // deletes a database, and the tabs that had it open move on.
          const { promise: evolu, resolve } = Promise.withResolvers<Evolu<S>>();
          const opening: CurrentAppOwner<S> = { appOwner, evolu };
          // Without its instance until the app owns it, so a deletion before
          // that changes nothing.
          evolusByOwnerId.set(appOwner.id, {
            createdAt: row.createdAt,
            current: opening,
            instance: null,
          });
          void openRun.abortable(async (run) => {
            const created = await run.ok(
              createEvoluInstance<S>(
                schema,
                {
                  ...appConfig,
                  onDatabaseDeleted: (removed) => {
                    // A late deletion of an instance the app no longer owns, as
                    // each open has a promise of its own.
                    const opened = evolusByOwnerId.get(appOwner.id);
                    if (opened?.current.evolu !== evolu || !opened.instance)
                      return;
                    evolusByOwnerId.delete(appOwner.id);
                    if (current.get()?.evolu !== evolu) return;
                    // After a removal, the tab has none open until the app
                    // opens one. The app's own deletion opens the database
                    // again, empty, while the rows subscription lives, which
                    // ends when openRun, where opens run, aborts.
                    select(
                      removed || rowsSubscription.disposed ? null : appOwner.id,
                    );
                  },
                },
                appOwner,
                {
                  type: "AppOwner",
                  deviceName: storedDatabaseName(
                    appName,
                    deviceOwner.id,
                    deviceNameInput,
                  ),
                  isAppOwnerId,
                },
              ),
            );
            // Aborted by the app's disposal, which took the instances over.
            if (run.signal.aborted) {
              await created.evolu[Symbol.asyncDispose]();
              return ok();
            }
            const instance = Object.assign(created.evolu, { appOwner });
            // The rows stopped listing the AppOwner meanwhile, so a removal
            // deleted its database.
            if (evolusByOwnerId.get(appOwner.id)?.current.evolu !== evolu)
              await run(disposeInstances([instance]));
            else
              evolusByOwnerId.set(appOwner.id, {
                createdAt: row.createdAt,
                current: opening,
                instance,
              });
            resolve(instance);
            return ok();
          });
          next = opening;
        }
      }
      // An app's listener that throws stops neither the tab nor a Task that
      // opens an AppOwner.
      try {
        current.set(next);
      } catch (error) {
        run.deps.reportDefect(error);
      }
      if (stale) void openRun(disposeInstances([stale]));
    };

    // Adds and removals run here. Disposed before the opens, instances, and
    // stores they use, it ends them first, as disposed, and an add that ends
    // meanwhile starts an open that is aborted next.
    const operationsRun = disposer.use(run.create());

    // The tab keeps its AppOwner while the rows list it, and opens none in
    // its place. Only a removal deletes a row, and it ended the AppOwner's
    // instances, so the tab disposes its own once the rows stop listing it:
    // an add of the AppOwner then opens a new instance, which a late deletion
    // of the old one leaves open. It resolves once the instances it took are
    // disposed; another call, such as the subscription's after the same
    // write, may have taken them first. Nothing depends on when a disposal
    // ends, so no call waits for another's, which would need state of its own.
    const setRows = async (appOwnerRows: typeof rows): Promise<void> => {
      rows = appOwnerRows;
      const listedIds = new Set(rows.map(({ id }) => id));
      const unlisted = [...evolusByOwnerId.keys()]
        .filter((id) => !listedIds.has(id))
        .map(takeInstance)
        .filter((instance) => instance !== null);
      const open = current.get();
      if (open && !listedIds.has(open.appOwner.id)) select(null);
      // The same AppOwners can come twice: a removal sets them itself and
      // through the rows' refresh, and the subscription first delivers the
      // rows the start loaded. A repeat keeps the array, which a store's
      // equality wouldn't, so listeners and snapshots see no change. An app's
      // listener that throws stops no other, nor a removal.
      const entries = rowsToEntries(rows);
      try {
        if (!eqAppOwnerEntries(appOwners.get(), entries))
          appOwners.set(entries);
      } catch (error) {
        run.deps.reportDefect(error);
      }
      if (isNonEmptyArray(unlisted)) await openRun(disposeInstances(unlisted));
    };

    // Ends with the app, or when openRun, where the rows' evictions and opens
    // run, aborts, as the end or a panic of the root Run aborts it while the
    // app lives on, so nothing starts in openRun while its disposal ends.
    const rowsSubscription = disposer.use(new DisposableStack());
    rowsSubscription.defer(
      deviceEvolu.subscribeQuery(appOwnersQuery)(() => {
        void setRows(deviceEvolu.getQueryRows(appOwnersQuery));
      }),
    );
    openRun.onAbort(() => {
      rowsSubscription.dispose();
    });

    // Later than this tab's last stamp and every stamp its rows hold, so the
    // AppOwner opened last is first at the next start, also when a tab opened
    // two in one millisecond, after the clock went back, and after another
    // tab, whose rows this tab received, stamped ahead of the clock. Opens in
    // two tabs before either received the other's rows have no order, and
    // can't have one.
    let lastOpenedAtMillis = 0;
    const nextOpenedAt = (): Millis => {
      lastOpenedAtMillis = Math.max(
        run.deps.time.now(),
        lastOpenedAtMillis + 1,
        ...rows.map(({ lastOpenedAt }) =>
          lastOpenedAt ? Date.parse(lastOpenedAt) + 1 : 0,
        ),
      );
      return lastOpenedAtMillis as Millis;
    };

    // The app's disposal aborts what it runs, which ends as disposed.
    const runInApp = async <T, E>(
      task: Task<T, E, EvoluPlatformDeps & StoredWorkerDep>,
    ): Promise<Result<T, E | EvoluDisposedError>> => {
      const result = await operationsRun.abortable(task);
      return result.ok || !AbortError.is(result.error)
        ? (result as Result<T, E>)
        : err({ type: "EvoluDisposedError" });
    };

    // Null opens none, as does an ID that isn't listed, while undefined, not
    // given, opens the AppOwner opened last.
    select(
      startAppOwnerId !== undefined
        ? startAppOwnerId
        : isNonEmptyArray(rows)
          ? firstInArray(rows).id
          : null,
    );

    // Without them at runtime too, so no code that finds them exports or
    // deletes every AppOwner's secret, or disposes what the app uses.
    const {
      exportDatabase: _exportDatabase,
      deleteDatabase: _deleteDatabase,
      [Symbol.asyncDispose]: _dispose,
      ...appDevice
    } = deviceEvolu;

    return ok(
      disposable<EvoluApp<S, D>>(
        {
          appOwners,
          current,
          device: appDevice as unknown as DeviceEvolu<D>,

          open: (id) => {
            if (!rows.some((row) => row.id === id)) return;
            // Before `select`, whose listeners can open other AppOwners, so
            // the writes follow the calls and the one opened last stays last.
            // An update changes only an existing row, so a tab whose rows
            // predate a removal creates no row without a secret.
            deviceInstance.mutate(
              appOwnerChange("update", id, {
                lastOpenedAt: millisToDateIso(nextOpenedAt()),
              }),
            );
            select(id);
          },

          add: (callerSecret, name) => {
            // A copy, because the caller can change its bytes before the
            // write reads them.
            const secret = new Uint8Array(callerSecret) as OwnerSecret;
            const id = ownerSecretToOwnerId(secret);
            // At the call, as in `open`, so the stamps follow the calls.
            const addedAt = nextOpenedAt();
            const lastOpenedAt = millisToDateIso(addedAt);
            return runInApp<OwnerId, UnknownError | EvoluDisposedError>(
              async (run) => {
                // The secret exists nowhere else on this device.
                deviceInstance.requestPersistentStorage();
                const stored = await run(
                  storeChange(
                    deviceInstance.mutate,
                    appOwnerChange("upsert", id, {
                      secret,
                      lastOpenedAt,
                      ...(name && { name }),
                    }),
                  ),
                );
                if (!stored.ok) return stored;
                // A read of its own, because SQLite can fail the query the
                // write refreshes and still store the write. Its answer updates
                // the rows before it resolves.
                const read = await run(
                  loadUncached(deviceEvolu, appOwnersQuery),
                );
                if (!read.ok) return read;
                // The read is newer than the tab's rows, which differ when a
                // removal in memory, stored in one batch with this add, deleted
                // the AppOwner from them, as for a refresh SQLite failed. The
                // batch's answer then brought no change, so no refresh did.
                if (read.value !== rows) await setRows(read.value);
                // A later open or add of this tab took a later stamp and wins,
                // so the tab shows the AppOwner it stamped last, as the stored
                // stamps do. Not listed: another tab removed it meanwhile.
                if (
                  lastOpenedAtMillis === addedAt &&
                  rows.some((row) => row.id === id)
                )
                  select(id);
                return ok(id);
              },
            );
          },

          rename: (id, name) => {
            // An update changes only an existing row, as in `open`.
            deviceInstance.mutate(appOwnerChange("update", id, { name }));
          },

          remove: (id) =>
            runInApp<void, RemoveAppOwnerError>(async (run) => {
              // The row's deletion has no condition, so the last of a removal
              // and an add of the AppOwner wins.
              const removal = appOwnerChange("delete", id, {});
              // Each tab keeps its device database and its AppOwners'
              // databases in memory, so such a removal is this tab's alone.
              // With the row gone first, nothing opens the AppOwner again,
              // and its database ends with its instance.
              const removed = memoryOnly
                ? await run(storeChange(deviceInstance.mutate, removal))
                : await run(
                    deviceInstance.removeAppOwner(
                      storedDatabaseName(appName, id, null),
                      removal,
                    ),
                  );
              if (!removed.ok) return removed;
              // The rows can still list the AppOwner, as when SQLite failed to
              // refresh them, so the tab removes its row itself, which disposes
              // its instance unless the refresh or, for a stored database, its
              // OnDatabaseDeleted took it first, and a database kept in memory
              // ends with it.
              // In memory, a later refresh that fails again lists the AppOwner
              // once more from the rows the device instance cached before the
              // removal, and opening it then creates a memory database without
              // a row. That isn't guarded: SQLite fails in memory only through
              // injected failures, and such a database ends with its tab.
              await setRows(rows.filter((row) => row.id !== id));
              return ok();
            }),
        },
        disposer,
      ),
    );
  };
};

/**
 * Whether the app has a stored {@link WrappedDeviceSecret}, without a prompt,
 * such as to label a button "Create account" or "Unlock". A setup that stopped
 * before storing it doesn't count, and where the platform keeps nothing, it's
 * false. It fails with {@link UnknownError} when SQLite fails to read it or its
 * database is refused. Like {@link createEvoluApp}, it stays pending while
 * another build of the app keeps it waiting or the shared worker fails to load.
 * See {@link unlockWrappedDeviceSecret}.
 *
 * It reads without waiting for a setup running in another tab, which can store
 * a secret right after, so don't use it to skip the warning before starting
 * over; {@link forgetWrappedDeviceSecret} with `onlyPending` checks under the
 * setup's lock.
 *
 * @group Auth
 */
export const hasWrappedDeviceSecret =
  (
    appName: AppName,
  ): Task<boolean, UnknownError, EvoluPlatformDeps & StoredWorkerDep> =>
  async (run) => {
    const devicePersistence = await run.ok(
      promiseToTask(() => run.deps.getDevicePersistence()),
    );
    if (devicePersistence === "NotPersisted") return ok(false);
    await using disposer = new AsyncDisposableStack();
    const { evolu } = await run.ok(openWrappedDeviceSecretEvolu(appName));
    disposer.use(evolu);
    const row = await run(readWrappedDeviceSecretRow(evolu));
    if (!row.ok) return row;
    return ok(!!row.value && row.value.wrappedSecret !== null);
  };

/**
 * Unlocks the app's {@link DeviceSecret} with a key from the
 * {@link DeviceSecretKeyProvider}, and on the first use creates them: a key, a
 * DeviceSecret, and its {@link WrappedDeviceSecret}, which Evolu stores in a
 * database of its own whose key is public. Pass the DeviceSecret to
 * {@link createEvoluApp} as {@link DeviceSecretAuth}.
 *
 * On the first use, it runs under a lock per app, so a second tab waits and
 * then unlocks what the first one created. Once a wrapped secret is stored, it
 * only unlocks, without the lock, so no tab waits for another tab's prompt, and
 * an error, such as a dismissed prompt, never starts another setup, which would
 * orphan the device database. A setup that stopped after creating its key
 * resumes with that key, also after the provider refused it, so the user gets
 * no second passkey; only when the provider can't provide it does the next
 * setup create another one. When its database is refused, as `evoluError`
 * reports, it fails with an {@link UnknownError}, the refusal itself or one
 * wrapping it. Like `createEvoluApp`, it stays pending while another build of
 * the app keeps it waiting or the shared worker fails to load. Some browsers
 * allow a prompt only in a user gesture, so call it from one, such as a button
 * click, and use {@link hasWrappedDeviceSecret} to tell which button to show.
 * After an error, keep the app usable and let the user try again, rather than
 * blocking it on the prompt.
 *
 * WebAuthn reports a deleted passkey like a dismissed prompt, and a stored
 * secret whose key is gone for good fails every unlock, so after any refusal an
 * app can offer to start over with {@link forgetWrappedDeviceSecret}. Its
 * `onlyPending` mode forgets a setup's pending key, which loses nothing and
 * needs no warning, and fails when it finds a stored secret, whose loss the
 * user confirms first. When unlocking still fails right after a start over, the
 * provider likely refuses its PRF output, so stop offering to forget a stored
 * secret, but keep offering `onlyPending`, which forgets only the pending key,
 * loses nothing, and lets the user try another provider. Where the platform
 * keeps nothing, it fails with {@link WrappedDeviceSecretNotPersistedError}
 * before anything else.
 *
 * @group Auth
 */
export const unlockWrappedDeviceSecret =
  ({
    appName,
    keyProvider,
  }: {
    appName: AppName;
    keyProvider: DeviceSecretKeyProvider;
  }): Task<
    DeviceSecret,
    | DeviceSecretKeyError
    | DeviceSecretUnwrapError
    | WrappedDeviceSecretNotPersistedError,
    EvoluPlatformDeps & StoredWorkerDep
  > =>
  async (run) => {
    // Nothing persists there, not even a stored wrapped secret, so every start
    // would create another key.
    const devicePersistence = await run.ok(
      promiseToTask(() => run.deps.getDevicePersistence()),
    );
    if (devicePersistence === "NotPersisted")
      return err({ type: "WrappedDeviceSecretNotPersisted" });

    await using disposer = new AsyncDisposableStack();
    const { evolu, mutate, requestPersistentStorage } = await run.ok(
      openWrappedDeviceSecretEvolu(appName),
    );
    disposer.use(evolu);

    // A lock orders setups, so a second tab waits and then unlocks what the
    // first one created, with one prompt. A tab takes it only after its first
    // read of the row was answered and found no wrapped secret, so a tab whose
    // worker never answers, such as of a build waiting for the running one,
    // keeps no other tab from unlocking. A stored row needs no lock: one read
    // returns its key and wrapped secret together, and nothing overwrites a
    // stored wrapped secret. Each instance has its own port, so an aborted
    // setup's write can still reach the database after the next setup's; each
    // write therefore applies only to the row it expects, which its
    // transaction checks. Both wait through the Run, so an abort ends them,
    // and the disposer releases the lock.
    const readRow = () => run(readWrappedDeviceSecretRow(evolu));
    const unwrapStored = async (
      keyId: DeviceSecretKeyId,
      wrappedSecret: WrappedDeviceSecret,
    ) => {
      const key = await run(keyProvider.getKey(keyId));
      return key.ok ? unwrapDeviceSecret(wrappedSecret, key.value) : key;
    };

    const existing = await readRow();
    if (!existing.ok) return existing;
    if (existing.value?.wrappedSecret)
      return await unwrapStored(
        existing.value.keyId,
        existing.value.wrappedSecret,
      );

    disposer.use(
      await run.ok(acquireLeaderLock(wrappedDeviceSecretName(appName))),
    );
    const read = await readRow();
    if (!read.ok) return read;
    let row = read.value;
    if (!row) {
      const created = await run(keyProvider.createKey);
      if (!created.ok) return created;
      // The key's ID exists nowhere else on this device, as add's secret.
      requestPersistentStorage();
      const stored = await run(
        storeChange(
          mutate,
          wrappedDeviceSecretChange(
            { keyId: created.value, wrappedSecret: null },
            // Stored only where no other setup stored its row first.
            { type: "RowAbsent" },
          ),
        ),
      );
      if (!stored.ok) return stored;
      const reread = await readRow();
      if (!reread.ok) return reread;
      row = reread.value;
      if (!row)
        return err(createUnknownError("The pending key wasn't stored."));
    }
    if (row.wrappedSecret)
      return await unwrapStored(row.keyId, row.wrappedSecret);

    const { keyId } = row;
    const pending = {
      type: "RowMatches",
      values: { keyId, wrappedSecret: null },
    } as const;
    // A key created a moment ago is got too, with a second prompt, rather than
    // taken from its creation, where a passkey can provide it as well. A
    // provider can support PRF at creation and not when getting a key, or the
    // other way around (https://www.corbado.com/blog/passkeys-prf-webauthn),
    // so a secret wrapped with a key from creation could be stored where no
    // later unlock gets that key, and the user would lose the data created
    // meanwhile. Getting it proves that unlocking works before anything is
    // stored.
    const key = await run(keyProvider.getKey(keyId));
    if (!key.ok) {
      // A key the provider can't provide is useless to resume with, so the
      // next setup creates another; a pending key wrapped no secret, so
      // removing it loses nothing. A refused one is kept, as is one after any
      // other failure: a dismissed prompt, such as one Safari allows only in a
      // user gesture, and a deleted passkey look the same, so the next attempt
      // prompts for the same passkey instead of registering another one under
      // the same label, which is what leads a user to delete the real one as a
      // duplicate. Only forgetWrappedDeviceSecret removes a refused one.
      if (key.error.type === "DeviceSecretKeyUnavailable") {
        const removed = await run(
          storeChange(mutate, wrappedDeviceSecretChange(null, pending)),
        );
        if (!removed.ok) return removed;
      }
      return key;
    }

    const secret = createDeviceSecret(run.deps);
    const wrappedSecret = wrapDeviceSecret(run.deps)(secret, key.value);
    const stored = await run(
      storeChange(
        mutate,
        wrappedDeviceSecretChange(
          { wrappedSecret },
          // A stored wrapped secret is never replaced.
          pending,
        ),
      ),
    );
    if (!stored.ok) return stored;
    // Returned only once stored, or it would encrypt a device database that
    // nothing can unlock.
    const storedRead = await readRow();
    if (!storedRead.ok) return storedRead;
    const storedRow = storedRead.value;
    if (
      !storedRow?.wrappedSecret ||
      !eqUint8Array(storedRow.keyId, keyId) ||
      !eqUint8Array(storedRow.wrappedSecret, wrappedSecret)
    )
      return err(createUnknownError("The wrapped DeviceSecret wasn't stored."));
    return ok(secret);
  };

/**
 * Forgets the app's stored {@link WrappedDeviceSecret}, or a setup's pending
 * key, so the next {@link unlockWrappedDeviceSecret} is a first use, with
 * another key and another {@link DeviceSecret}. It's how an app starts over when
 * the key is gone for good, such as a deleted passkey, which the provider
 * reports like a dismissed prompt, or after a {@link DeviceSecretUnwrapError}.
 * Evolu never calls it on its own.
 *
 * A pending key wrapped no secret, so forgetting it loses nothing, and with
 * `onlyPending`, it forgets only that: when it finds a stored secret, it
 * forgets nothing and fails with {@link WrappedDeviceSecretStoredError}. It
 * checks under the lock setups take, so a setup in another tab can't store a
 * secret between the check and the forget, as it can after
 * {@link hasWrappedDeviceSecret}. An app that offers to start over calls it with
 * `onlyPending` first, without a warning, and on that error asks the user to
 * confirm before calling it without `onlyPending`. Forgetting a stored secret
 * loses its device database: nothing opens it again, so its AppOwners return
 * only from their backups, and its device tables and the AppOwners' names are
 * gone. An AppOwner restored from its backup reopens its own database with its
 * local data, unsynced changes included. With
 * {@link EvoluAppConfig.createFirstAppOwner}, the new device database creates a
 * new, empty AppOwner, so a user who restores one from a backup has two; after
 * the restore, remove the empty one with {@link EvoluApp.remove}.
 *
 * A tab that is already unlocked stays on the old device database until it
 * reloads. AppOwners added there are lost at the next start, and it's the last
 * place where the user can still back up the old ones.
 *
 * When it finds a pending key or a stored secret, it waits for a setup running
 * in another tab, but not for an unlock of a stored secret, whose prompt can
 * stay open. Where the platform keeps nothing, there's nothing to forget. When
 * its database is refused, as `evoluError` reports, it fails with an
 * {@link UnknownError}, the refusal itself or one wrapping it. Like
 * {@link createEvoluApp}, it stays pending while another build of the app keeps
 * it waiting or the shared worker fails to load.
 *
 * ### Example
 *
 * ```ts
 * import {
 *   AppName,
 *   assertEqual,
 *   forgetWrappedDeviceSecret,
 *   ok,
 * } from "@evolu/common";
 * import { createEvoluDeps, createRun } from "@evolu/web";
 *
 * const run = createRun(createEvoluDeps());
 * const appName = AppName.orThrow("StartOver");
 *
 * // After an unlock failed, without a warning.
 * const forgotten = await run(
 *   forgetWrappedDeviceSecret(appName, { onlyPending: true }),
 * );
 * if (
 *   !forgotten.ok &&
 *   forgotten.error.type === "WrappedDeviceSecretStoredError"
 * ) {
 *   // Once the user confirms losing the device database.
 *   await run.orThrow(forgetWrappedDeviceSecret(appName));
 * }
 * // Nothing was stored, so there was nothing to forget.
 * assertEqual(forgotten, ok());
 * ```
 *
 * After a stored secret was forgotten:
 *
 * ```ts
 * import {
 *   AppName,
 *   assertEqual,
 *   assertOk,
 *   createDeviceSecret,
 *   createEvoluApp,
 *   createRandomBytes,
 *   id,
 *   mnemonicToOwnerSecret,
 *   NonEmptyTrimmedString100,
 *   testAppOwner,
 * } from "@evolu/common";
 * import { createEvoluDeps, createRun } from "@evolu/web";
 *
 * const Schema = {
 *   todo: { id: id("Todo"), title: NonEmptyTrimmedString100 },
 * };
 * const run = createRun(createEvoluDeps());
 * // The DeviceSecret of the first unlock after forgetWrappedDeviceSecret.
 * const secret = createDeviceSecret({ randomBytes: createRandomBytes() });
 *
 * await using app = await run.orThrow(
 *   createEvoluApp(Schema, {
 *     appName: AppName.orThrow("ForgetWrappedDeviceSecret"),
 *     auth: { type: "DeviceSecret", secret },
 *     createFirstAppOwner: true,
 *     transports: [],
 *   }),
 * );
 * // The new device database created an empty AppOwner.
 * const [empty] = app.appOwners.get();
 *
 * // Restore the user's AppOwner from its backup, then remove the empty one.
 * assertOk(await app.add(mnemonicToOwnerSecret(testAppOwner.mnemonic)));
 * assertOk(await app.remove(empty.id));
 * assertEqual(
 *   app.appOwners.get().map(({ id }) => id),
 *   [testAppOwner.id],
 * );
 * ```
 *
 * @group Auth
 */
export const forgetWrappedDeviceSecret =
  <OnlyPending extends boolean = false>(
    appName: AppName,
    { onlyPending }: { onlyPending?: OnlyPending } = {},
  ): Task<
    void,
    | UnknownError
    | (OnlyPending extends true ? WrappedDeviceSecretStoredError : never),
    EvoluPlatformDeps & StoredWorkerDep
  > =>
  async (run) => {
    const devicePersistence = await run.ok(
      promiseToTask(() => run.deps.getDevicePersistence()),
    );
    if (devicePersistence === "NotPersisted") return ok();

    // The old device database stays. Its name derives from the device owner,
    // which derives from the lost secret, so nothing can find it, and another
    // key starts clean on purpose, as on a new phone, whose device backup
    // restores the files but not the key bound to the device. Rejected:
    // storing the database's name in the row, which would be cosmetic, would
    // add a step that can fail with DatabaseHeldError to a destructive call,
    // and can be added later without a migration; and naming the device
    // database by app and auth mode, which would make a new phone see a
    // refused database.
    await using disposer = new AsyncDisposableStack();
    const { evolu, mutate } = await run.ok(
      openWrappedDeviceSecretEvolu(appName),
    );
    disposer.use(evolu);

    // Ordered with setups, as unlockWrappedDeviceSecret describes: it takes the
    // lock only once its first read was answered and found a row, so a tab
    // whose worker never answers keeps no other tab from setting up or
    // forgetting, and reads again under the lock, where a setup may have
    // stored a secret meanwhile.
    const existing = await run(readWrappedDeviceSecretRow(evolu));
    if (!existing.ok) return existing;
    if (!existing.value) return ok();
    disposer.use(
      await run.ok(acquireLeaderLock(wrappedDeviceSecretName(appName))),
    );
    const read = await run(readWrappedDeviceSecretRow(evolu));
    if (!read.ok) return read;
    const row = read.value;
    if (!row) return ok();
    if (onlyPending === true && row.wrappedSecret !== null)
      // TypeScript can't narrow OnlyPending by the value it was inferred from.
      return err({
        type: "WrappedDeviceSecretStoredError",
      } as OnlyPending extends true ? WrappedDeviceSecretStoredError : never);
    // Like a setup's writes, it applies only to the row it read, so one that
    // arrives late, after an abort, never removes a later setup's.
    return await run(
      storeChange(
        mutate,
        wrappedDeviceSecretChange(null, {
          type: "RowMatches",
          values: { keyId: row.keyId, wrappedSecret: row.wrappedSecret },
        }),
      ),
    );
  };

// Stores a change with the `mutate` that createEvoluInstance returns.
const storeChange = (
  mutate: (
    change: ConditionalMutationChange,
    options?: MutationOptions,
  ) => void,
  change: ConditionalMutationChange,
): Task<void, UnknownError> =>
  callback(({ resolve }) => {
    mutate(change, {
      onSuccess: () => resolve(ok()),
      onError: (error) => resolve(err(error)),
    });
  });

// The owner of a database of Evolu's own, which names and encrypts it, has no
// write key, and never syncs. Derived from `seed` on paths no OwnerSecret
// reaches, under labels of its own, so no AppOwner's ID or keys name or open
// it. A DeviceSecret stays secret only while no AppOwner uses its bytes,
// because an AppOwner's mnemonic exports them; an intermediate OwnerSecret
// would be one, and instant start's is public. Permanent once shipped: other
// labels open a new, empty database.
const createDatabaseOwner = (
  seed: Entropy32,
  label: "Device" | "WrappedDeviceSecret",
): ReadonlyOwner => ({
  id: ownerIdBytesToOwnerId(
    createSlip21(seed, ["Evolu", `${label}OwnerIdBytes`]).slice(
      0,
      16,
    ) as OwnerIdBytes,
  ),
  encryptionKey: createSlip21(seed, [
    "Evolu",
    `${label}OwnerEncryptionKey`,
  ]) as OwnerEncryptionKey,
});

// Its key is public, because the database opens before the DeviceSecret
// exists, and it holds nothing secret: only the provider's key unwraps the
// secret.
const wrappedDeviceSecretOwner = /*#__PURE__*/ createDatabaseOwner(
  new Uint8Array(32) as Entropy32,
  "WrappedDeviceSecret",
);

// Every app's has the same owner, so its name hashes the exact appName, which
// file systems that fold case would otherwise share between apps.
const openWrappedDeviceSecretEvolu = (appName: AppName) =>
  createEvoluInstance<typeof wrappedDeviceSecretEvoluSchema>(
    wrappedDeviceSecretEvoluSchema,
    { appName, transports: [] },
    wrappedDeviceSecretOwner,
    {
      type: "WrappedDeviceSecret",
      nameInput: wrappedDeviceSecretName(appName),
    },
  );

// The name input of the wrapped DeviceSecret's database and the name of the
// lock under which unlockWrappedDeviceSecret and forgetWrappedDeviceSecret
// exclude each other, as they must across builds. Permanent once shipped.
const wrappedDeviceSecretName = (appName: AppName): string =>
  `WrappedDeviceSecret-${appName}`;

// One row per app, so a second setup finds the first one's.
const wrappedDeviceSecretRowId = /*#__PURE__*/ createIdFromString(
  "WrappedDeviceSecret",
);

// Null values delete the row. Every write applies only to the row it expects;
// see unlockWrappedDeviceSecret.
const wrappedDeviceSecretChange = (
  values: ReadonlyRecord<string, SqliteValue> | null,
  onlyIf: MutationChangeCondition,
): ConditionalMutationChange => ({
  ...DbChange.orThrow({
    table: wrappedDeviceSecretTable,
    id: wrappedDeviceSecretRowId,
    values: values ?? {},
    isInsert: values !== null,
    isDelete: values === null ? true : null,
  }),
  ownerId: wrappedDeviceSecretOwner.id,
  onlyIf,
});

const wrappedDeviceSecretQuery = /*#__PURE__*/ createQueryBuilder(
  wrappedDeviceSecretEvoluSchema,
)((db) =>
  db
    .selectFrom(wrappedDeviceSecretTable)
    .select(["keyId", "wrappedSecret"])
    .where("keyId", "is not", null)
    .$narrowType<{ keyId: KyselyNotNull }>(),
);

// A setup's pending key has a row whose wrappedSecret is null.
const readWrappedDeviceSecretRow =
  (
    evolu: Pick<
      EvoluInstance<typeof wrappedDeviceSecretEvoluSchema>,
      "loadQuery"
    >,
  ): Task<
    InferRow<typeof wrappedDeviceSecretQuery> | undefined,
    UnknownError
  > =>
  async (run) => {
    const rows = await run(loadUncached(evolu, wrappedDeviceSecretQuery));
    return rows.ok ? ok(rows.value.at(0)) : rows;
  };

// Instant start's secret is public by design, so it is 32 zero bytes: anyone
// reading this sees it hides nothing, where a random constant would look like
// a secret. One device owner for every app is fine: the device database's name
// hashes the exact appName, and Evolu never syncs a device owner. Permanent once
// shipped: another value opens a new, empty device database. See
// docs/adr/evolu-creates-and-stores-app-owners.md.
const instantStartDeviceOwner = /*#__PURE__*/ createDatabaseOwner(
  new Uint8Array(32) as Entropy32,
  "Device",
);

// The AppOwners the app can open, the one opened most recently first, then the
// oldest, which is the one the device database's startup created. SQLite puts
// nulls last in a descending order.
const appOwnersQuery = /*#__PURE__*/ createQueryBuilder(deviceEvoluSchema)(
  (db) =>
    db
      .selectFrom(appOwnerTable)
      .select(["id", "secret", "name", "lastOpenedAt", "createdAt"])
      .where("secret", "is not", null)
      .$narrowType<{ secret: KyselyNotNull }>()
      .orderBy("lastOpenedAt", "desc")
      .orderBy("createdAt")
      .orderBy("id"),
);

const eqAppOwnerEntries = /*#__PURE__*/ createEqArrayLike(
  /*#__PURE__*/ createEqObject<AppOwnerEntry>({
    id: eqSameValue,
    name: eqSameValue,
    lastOpenedAt: eqSameValue,
  }),
);

/**
 * An {@link Evolu} instance without its {@link Evolu.appOwner}, because its own
 * owner, such as a device database's, may not be an AppOwner.
 */
type EvoluInstance<S extends EvoluSchema> = Omit<Evolu<S>, "appOwner">;

/**
 * What an instance of {@link createEvoluInstance} is: `Standalone` for
 * {@link createEvolu}, `Device` and `AppOwner` for {@link createEvoluApp}, or
 * `WrappedDeviceSecret`. A database of Evolu's own, `Device` or
 * `WrappedDeviceSecret`, has a `nameInput` its name hashes with the owner's ID,
 * where the others hash the ID alone.
 */
type EvoluInstanceKind =
  | Typed<"Standalone">
  | DeviceInstanceKind
  | AppOwnerInstanceKind
  | WrappedDeviceSecretInstanceKind;

/**
 * The device database of {@link createEvoluApp}. With `createFirstAppOwner`, the
 * DbWorker that creates the database inserts the first AppOwner (see
 * {@link OpenDbWorkerInit.createFirstAppOwner}). Its mutations of synced tables
 * must name their owner, because the device owner never syncs.
 */
interface DeviceInstanceKind extends Typed<"Device">, AppDatabaseInstanceKind {
  readonly nameInput: string;
  readonly createFirstAppOwner: boolean;
}

/**
 * An AppOwner's database of {@link createEvoluApp}. Stored, it opens only while
 * the device database `deviceName` stores the AppOwner's row; see
 * {@link SharedWorkerInput}.
 */
interface AppOwnerInstanceKind
  extends Typed<"AppOwner">, AppDatabaseInstanceKind {
  readonly deviceName: Name;
}

/** What a database of {@link createEvoluApp} knows of the app. */
interface AppDatabaseInstanceKind {
  /** Whether the ID is an AppOwner's that {@link createEvoluApp} lists. */
  readonly isAppOwnerId: (ownerId: OwnerId) => boolean;
}

/** The database of an app's {@link WrappedDeviceSecret}. */
interface WrappedDeviceSecretInstanceKind extends Typed<"WrappedDeviceSecret"> {
  readonly nameInput: string;
}

/**
 * Creates an Evolu instance of `instanceKind` owned by `instanceOwner`, which
 * names and encrypts its database and owns the rows its mutations write without
 * an owner. Its `onDatabaseDeleted` learns whether a removal of its AppOwner
 * ended it, also when deleting the files then fails. Besides the instance, it
 * returns what the device database's instance uses: `mutate`, which stores a
 * change no {@link Mutation} makes, such as a {@link ConditionalMutationChange};
 * `requestPersistentStorage`, which asks for persistent storage as its first
 * {@link Mutation} does, once, for a change such a `mutate` stores; and
 * `removeAppOwner`, which removes an AppOwner of the app; see
 * {@link EvoluInput}.
 */
const createEvoluInstance =
  <S extends EvoluSchema>(
    schema: ValidateSchema<S> extends never ? S : ValidateSchema<S>,
    config: Omit<EvoluConfig, "appOwner" | "onDatabaseDeleted"> & {
      readonly onDatabaseDeleted?: (removed: boolean) => void;
    },
    instanceOwner: ReadonlyOwner | Owner,
    instanceKind: EvoluInstanceKind,
  ): Task<
    {
      readonly evolu: EvoluInstance<S>;
      readonly mutate: (
        change: ConditionalMutationChange,
        options?: MutationOptions,
      ) => void;
      readonly removeAppOwner: (
        name: Name,
        removal: MutationChange & { readonly id: OwnerId },
      ) => Task<
        void,
        DatabaseHeldError | UnknownError | UnsupportedDbVersionError
      >;
      readonly requestPersistentStorage: () => void;
    },
    never,
    EvoluPlatformDeps & StoredWorkerDep
  > =>
  async (run) => {
    const {
      appName,
      transports = [
        { type: "WebSocket", url: "wss://free.evoluhq.com/" as WebSocketUrl },
      ],
    } = config;

    const devicePersistence: DevicePersistence = config.memoryOnly
      ? "NotPersisted"
      : await run.ok(promiseToTask(() => run.deps.getDevicePersistence()));
    const memoryOnly = devicePersistence === "NotPersisted";
    const instanceId = createId<"EvoluInstance">(run.deps);
    // Each memory instance has its own tenant, locks, and DbWorker everywhere;
    // see docs/adr/evolu-creates-and-stores-app-owners.md.
    // Its hash input, the owner ID's bytes followed by a memory marker and a
    // random instance ID, is longer than an owner ID, so it never equals a
    // stored name's input.
    // A database of Evolu's own hashes its name input too, which starts with
    // a marker other than the memory marker, so it never equals another kind's
    // input.
    // An AppName has at most 41 characters and an Id 22, so this is a Name.
    const name = memoryOnly
      ? (`${appName}-${createIdFromString(`MemoryDatabase-${instanceId}`, instanceOwner.id)}` as Name)
      : storedDatabaseName(
          appName,
          instanceOwner.id,
          instanceKind.type === "Device" ||
            instanceKind.type === "WrappedDeviceSecret"
            ? instanceKind.nameInput
            : null,
        );
    const console = run.deps.console.child(name).child("Evolu");
    console.debug("createEvolu");

    await using disposer = new AsyncDisposableStack();

    const rowsByQueryMapStore = disposer.use(
      createStore<RowsByQueryMap>(new Map()),
    );
    const subscribedQueriesRefCount = disposer.use(
      createRefCountByKey<Query>(),
    );

    interface LoadingPromise {
      /**
       * React tracks `status`/`value`/`reason` on thenables passed to `use`.
       * Evolu mirrors that shape so cached promises can be unwrapped
       * synchronously and to keep promise-cache behavior stable.
       *
       * React source:
       * https://github.com/facebook/react/blob/main/packages/react-reconciler/src/ReactFiberThenable.js
       */
      promise: Promise<QueryRows> & {
        status?: "pending" | "fulfilled" | "rejected";
        value?: QueryRows;
        reason?: unknown;
      };
      readonly resolve: (rows: QueryRows) => void;
      readonly reject: (error: UnknownError) => void;
      releaseOnSettle: boolean;
    }

    /**
     * Settle pending query loads during disposal so awaiting callers and React
     * `use` thenables do not hang forever during teardown. A deletion of the
     * database drops them first, so they stay pending.
     */
    const loadingPromisesByQuery = disposer.adopt(
      new Map<Query, LoadingPromise>(),
      (loadingPromisesByQuery) => {
        for (const loadingPromise of loadingPromisesByQuery.values()) {
          if (loadingPromise.promise.status !== "pending") continue;
          settleLoadingPromise(loadingPromise, ok(emptyArray));
        }
        loadingPromisesByQuery.clear();
      },
    );

    /**
     * Uncached loads by the ID their Query carries. Disposal resolves them with
     * no rows, also the disposal after a deletion of the database, because code
     * awaits them, not React.
     */
    const uncachedLoadsById = disposer.adopt(
      new Map<
        Id,
        {
          readonly query: Query;
          readonly resolve: (rows: QueryRows) => void;
          readonly reject: (error: UnknownError) => void;
        }
      >(),
      (uncachedLoadsById) => {
        for (const uncachedLoad of uncachedLoadsById.values())
          uncachedLoad.resolve(emptyArray);
        uncachedLoadsById.clear();
      },
    );

    const settleLoadingPromise = (
      loadingPromise: LoadingPromise,
      result: Result<QueryRows, UnknownError>,
    ): void => {
      /**
       * Pending promises must be settled in place to preserve identity for
       * current awaiters. Settled promises are replaced with a new settled
       * promise so future loads see the latest result.
       */
      if (loadingPromise.promise.status === "pending") {
        if (result.ok) loadingPromise.resolve(result.value);
        else loadingPromise.reject(result.error);
      } else if (result.ok) {
        loadingPromise.promise = Promise.resolve(result.value);
      } else {
        // oxlint-disable-next-line typescript/prefer-promise-reject-errors -- Loads reject with a plain-object UnknownError, as Evolu errors are plain objects.
        loadingPromise.promise = Promise.reject(result.error);
        // No caller holds the replacement yet; the next load returns it.
        void loadingPromise.promise.catch(constVoid);
      }

      /** See {@link LoadingPromise.promise}. */
      void Object.assign(
        loadingPromise.promise,
        result.ok
          ? { status: "fulfilled", value: result.value }
          : { status: "rejected", reason: result.error },
      );
    };

    /**
     * Mutations and refreshes invalidate query snapshots. Keep loading promises
     * only for actively subscribed queries and release unsubscribed ones.
     *
     * Settled promises can be dropped immediately because no awaiter is waiting
     * on them. Pending promises must stay alive until they settle so current
     * awaiters keep the same promise identity.
     */
    const releaseUnsubscribedLoadingPromises = (): void => {
      for (const [query, loadingPromise] of loadingPromisesByQuery) {
        if (subscribedQueriesRefCount.has(query)) continue;

        if (loadingPromise.promise.status !== "pending") {
          loadingPromisesByQuery.delete(query);
        } else {
          loadingPromise.releaseOnSettle = true;
        }
      }
    };

    const mutationCallbacks = disposer.use(
      createCallbacks<Result<void, UnknownError>>(run.deps),
    );

    // The removals of AppOwners this device instance asked for, which their
    // row's deletion or OnRemoveAppOwnerFailed answers. Callback IDs are
    // unique across both registries, so an answer executes in the one that
    // has it and changes nothing in the other.
    const removalCallbacks = disposer.use(
      createCallbacks<
        Result<
          void,
          DatabaseHeldError | UnknownError | UnsupportedDbVersionError
        >
      >(run.deps),
    );

    let exportDatabasePending = null as PromiseWithResolvers<
      Uint8Array<ArrayBuffer>
    > | null;

    disposer.defer(() => {
      exportDatabasePending?.reject({ type: "EvoluDisposedError" });
      exportDatabasePending = null;
    });

    // What every concurrent deleteDatabase returns.
    let deleteDatabasePending = null as PromiseWithResolvers<
      Result<void, DeleteDatabaseError>
    > | null;

    disposer.defer(() => {
      deleteDatabasePending?.resolve(err({ type: "EvoluDisposedError" }));
      deleteDatabasePending = null;
    });

    // In call order, which is the order the tenant answers them in.
    const deleteOwnerPending: Array<
      PromiseWithResolvers<Result<void, DeleteOwnerError>>
    > = [];

    disposer.defer(() => {
      for (const pending of deleteOwnerPending)
        pending.resolve(err({ type: "EvoluDisposedError" }));
      deleteOwnerPending.length = 0;
    });

    let isPersistentStorageRequested = false;

    let postMessage: (input: EvoluInput) => void;

    // Scope worker/channel wiring and keep only postMessage outside.
    {
      const { createMessageChannel } = run.deps;
      const sharedWorker =
        memoryOnly && run.deps.createMemoryInstanceWorker
          ? disposer.use(run.deps.createMemoryInstanceWorker())
          : await run.ok(promiseToTask(() => run.deps.storedWorker));
      disposer.use(await run.ok(acquireLeaderLock(instanceId)));

      const evoluChannel = disposer.use(
        createMessageChannel<EvoluInput, EvoluOutput>(),
      );

      evoluChannel.port1.onMessage = (message) => {
        switch (message.type) {
          case "OnPatchesByQuery": {
            console.debug("onPatchesByQuery", {
              queryCount: message.patchesByQuery.size,
              callbackCount: message.callbackIds.length,
            });
            const state = rowsByQueryMapStore.get();
            const nextRowsByQueryMap = new Map(state);

            for (const [query, patches] of message.patchesByQuery) {
              if (!patches.ok) {
                // A query SQLite failed keeps its rows. A subscribed one gets
                // an equal copy, so its subscribers render now and read the
                // rejected load.
                if (subscribedQueriesRefCount.has(query))
                  nextRowsByQueryMap.set(query, [
                    ...(state.get(query) ?? emptyArray),
                  ]);
                continue;
              }
              nextRowsByQueryMap.set(
                query,
                applyPatches(patches.value, state.get(query) ?? emptyArray),
              );
            }

            // An uncached load's answer can be older than a cached load of its
            // query made after it, which that load's own answer settles. A
            // settled load is older, because answers arrive in order, so it
            // takes the answer, as the rows do.
            const answersUncachedLoad = message.callbackIds.some((id) =>
              uncachedLoadsById.has(id),
            );
            for (const [query, patches] of message.patchesByQuery) {
              const loadingPromise = loadingPromisesByQuery.get(query);
              if (
                !loadingPromise ||
                (answersUncachedLoad &&
                  loadingPromise.promise.status === "pending")
              )
                continue;

              if (patches.ok) {
                const rows = nextRowsByQueryMap.get(query);
                assertNotUndefined(rows);
                settleLoadingPromise(loadingPromise, ok(rows));
              } else {
                // Like rows, the failure stays cached until invalidated, so
                // React's retry after an error boundary does not load again,
                // unless a mutation or sync invalidated it while pending.
                settleLoadingPromise(loadingPromise, patches);
              }

              /**
               * Release promises flagged during mutation when they settle. This
               * keeps in-flight promise identity stable and prevents stale
               * cache entries after completion.
               */
              if (loadingPromise.releaseOnSettle) {
                loadingPromisesByQuery.delete(query);
              }
            }

            // Any callback flushes, also an onError-only mutation's, which
            // costs a synchronous render but no tracking of which callbacks
            // have onSuccess.
            if (run.deps.flushSync && message.callbackIds.length > 0) {
              run.deps.flushSync(() => {
                rowsByQueryMapStore.set(nextRowsByQueryMap);
              });
            } else {
              rowsByQueryMapStore.set(nextRowsByQueryMap);
            }

            for (const callbackId of message.callbackIds) {
              const uncachedLoad = uncachedLoadsById.get(callbackId);
              if (!uncachedLoad) {
                removalCallbacks.execute(callbackId, ok());
                mutationCallbacks.execute(callbackId, ok());
                continue;
              }
              uncachedLoadsById.delete(callbackId);
              const patches = message.patchesByQuery.get(uncachedLoad.query);
              if (patches && !patches.ok) uncachedLoad.reject(patches.error);
              else
                uncachedLoad.resolve(
                  nextRowsByQueryMap.get(uncachedLoad.query) ?? emptyArray,
                );
            }
            break;
          }

          case "RefreshQueries": {
            releaseUnsubscribedLoadingPromises();

            const queries = new Set<Query>(subscribedQueriesRefCount.keys());

            if (isNonEmptySet(queries))
              postMessage({ type: "Query", queries, callbackIds: emptyArray });
            break;
          }

          case "OnExport": {
            assert(
              exportDatabasePending,
              "OnExport received without pending export.",
            );
            exportDatabasePending.resolve(message.file);
            exportDatabasePending = null;
            break;
          }

          case "OnExportFailed": {
            assert(
              exportDatabasePending,
              "OnExportFailed received without pending export.",
            );
            exportDatabasePending.reject(message.error);
            exportDatabasePending = null;
            break;
          }

          case "OnRequestFailed": {
            // The tab reports the failure, or already reported the refusal.
            for (const callbackId of message.callbackIds) {
              // Only an uncached load rejects. A cached load of the same query
              // stays pending, as React Suspense relies on.
              const uncachedLoad = uncachedLoadsById.get(callbackId);
              if (uncachedLoad) {
                uncachedLoadsById.delete(callbackId);
                uncachedLoad.reject(message.error);
                continue;
              }
              removalCallbacks.execute(callbackId, err(message.error));
              mutationCallbacks.execute(callbackId, err(message.error));
            }
            break;
          }

          case "OnRemoveAppOwnerFailed": {
            removalCallbacks.execute(message.callbackId, err(message.error));
            break;
          }

          case "OnDatabaseDeleted": {
            // The tenant disposed its side of the instance, so this side
            // disposes itself, even when the callback throws.
            instancesWithDeletedDatabase.add(evolu);
            // The deletion dropped the loads still pending. The app replaces
            // this instance, and settling the cached ones would make React
            // render a suspended component again with it disposed, which
            // throws. The disposal below resolves the uncached ones.
            loadingPromisesByQuery.clear();
            try {
              // Wakes every subscription while the instance still answers
              // getQueryRows, so React renders again and suspends, and other
              // bindings show no rows of the deleted database.
              rowsByQueryMapStore.set(new Map());
              // A removal disposes the instance before the files are gone, as a
              // disposal before the deletion ends would.
              deleteDatabasePending?.resolve(
                message.removed ? err({ type: "EvoluDisposedError" }) : ok(),
              );
              deleteDatabasePending = null;
              if (config.onDatabaseDeleted)
                config.onDatabaseDeleted(message.removed);
              else run.deps.reloadApp();
            } finally {
              void evolu[Symbol.asyncDispose]();
            }
            break;
          }

          case "OnDeleteDatabaseFailed": {
            assert(
              deleteDatabasePending,
              "OnDeleteDatabaseFailed received without pending deletion.",
            );
            deleteDatabasePending.resolve(err(message.error));
            deleteDatabasePending = null;
            break;
          }

          case "OnOwnerDeleted": {
            // Resolved first, so a throwing callback leaves no call pending.
            if (message.isAnswer) {
              const pending = deleteOwnerPending.shift();
              assert(
                pending,
                "OnOwnerDeleted answered no pending owner deletion.",
              );
              pending.resolve(ok());
            }
            config.onOwnerDeleted?.(message.ownerId);
            break;
          }

          case "OnDeleteOwnerFailed": {
            const pending = deleteOwnerPending.shift();
            assert(
              pending,
              "OnDeleteOwnerFailed received without pending owner deletion.",
            );
            pending.resolve(err(message.error));
            break;
          }

          default:
            exhaustiveCheck(message);
        }
      };

      sharedWorker.port.postMessage(
        {
          type: "CreateEvolu",
          name,
          id: instanceId,
          // The device database holds every AppOwner's secret, which SQL
          // tracing logs as bound values and result rows.
          consoleLevel:
            instanceKind.type === "Device" && console.getLevel() === "trace"
              ? "debug"
              : console.getLevel(),
          sqliteSchema: evoluSchemaToSqliteSchema(schema, config.indexes),
          encryptionKey: instanceOwner.encryptionKey,
          memoryOnly,
          instanceKind:
            instanceKind.type === "Device"
              ? {
                  type: "Device",
                  createFirstAppOwner: instanceKind.createFirstAppOwner
                    ? { deviceOwnerId: instanceOwner.id }
                    : null,
                }
              : instanceKind.type === "AppOwner"
                ? {
                    type: "AppOwner",
                    deviceName: instanceKind.deviceName,
                    ownerId: instanceOwner.id,
                  }
                : { type: "Standalone" },
          evoluPort: evoluChannel.port2.native,
        },
        [evoluChannel.port2.native],
      );

      postMessage = evoluChannel.port1.postMessage;
    }

    const mutateBatch = disposer.use(
      createMicrotaskBatch<{
        readonly change: ConditionalMutationChange;
        readonly callback: Callback<Result<void, UnknownError>> | null;
      }>((items) => {
        if (disposed) return;
        console.debug("mutateBatch", { changeCount: items.length });
        // Each mutation also releases them when it is made. This catches a
        // load made after a mutation but queued with an earlier load in the
        // same tick, which was sent before this batch.
        releaseUnsubscribedLoadingPromises();

        postMessage({
          type: "Mutate",
          changes: mapArray(items, (item) => item.change),
          callbackIds: items.flatMap(({ callback }) =>
            callback ? [mutationCallbacks.register(callback)] : [],
          ),
          subscribedQueries: subscribedQueriesRefCount.keys(),
        });
      }),
    );

    const queryBatch = disposer.use(
      createMicrotaskBatch<Query>((queries) => {
        if (disposed) return;
        const dedupedQueries = createSet(queries);
        console.debug("queryBatch", { queryCount: dedupedQueries.size });
        postMessage({
          type: "Query",
          queries: dedupedQueries,
          callbackIds: emptyArray,
        });
      }),
    );

    const useOwnerBatch = disposer.use(
      createMicrotaskBatch<
        ExtractTyped<EvoluInput, "UseOwner">["actions"][number]
      >((actions) => {
        if (disposed) return;
        postMessage({ type: "UseOwner", actions });
      }),
    );

    const mutate = (
      change: ConditionalMutationChange,
      { onSuccess, onError }: MutationOptions = {},
    ): void => {
      assert(
        !change.onlyIf || isLocalOnlyTable(change.table),
        "Only a change of a local-only table can have onlyIf.",
      );
      // Released now, not only when the batch is sent, so a load right after
      // the mutation does not return rows cached before it.
      releaseUnsubscribedLoadingPromises();
      mutateBatch.push({
        change,
        callback:
          onSuccess || onError
            ? (result) => {
                // A throw must not skip the batch's later callbacks, such as
                // one that settles a promise.
                try {
                  if (result.ok) onSuccess?.();
                  else onError?.(result.error);
                } catch (error) {
                  run.deps.reportDefect(error);
                }
              }
            : null,
      });
    };

    // Only unsynced local changes exist nowhere else, so the first one is when
    // asking the platform to keep them starts to matter. Asking on load would
    // show Firefox's permission prompt to every visitor.
    const requestPersistentStorage = (): void => {
      if (isPersistentStorageRequested) return;
      isPersistentStorageRequested = true;
      if (devicePersistence === "Unknown")
        run.deps.requestPersistentStorage?.();
    };

    // An AppOwner's data lives only in its own database, which its deletion
    // deletes, so this instance, the device database's included, neither
    // syncs nor writes another AppOwner. A type can't tell this instance's
    // own AppOwner from another; DeviceEvolu's types exclude them all.
    // createEvoluApp's instances also check the IDs of the AppOwners it
    // lists, so an owner with another AppOwner's ID but another type, such as
    // one created from its secret, is caught too; createEvolu can't know them.
    const assertNoOtherAppOwner = (owner: ReadonlyOwner | Owner): void => {
      assert(
        owner.id === instanceOwner.id ||
          (!("type" in owner && owner.type === "AppOwner") &&
            !(
              (instanceKind.type === "Device" ||
                instanceKind.type === "AppOwner") &&
              instanceKind.isAppOwnerId(owner.id)
            )),
        "An AppOwner's data lives only in its own database, so an instance can't sync or write another AppOwner.",
      );
    };

    const createMutation =
      <Kind extends "insert" | "update" | "upsert">(
        kind: Kind,
      ): Mutation<S, Kind> =>
      (table, values, options) => {
        const {
          id = createId(run.deps),
          isDeleted,
          ...changeValues
        } = values as { id?: Id; isDeleted?: unknown; [key: string]: unknown };

        const dbChange = {
          table,
          id,
          values: changeValues,
          // The times of a row's changes alone set createdAt and updatedAt;
          // isInsert only names the stored time row. Earlier releases set createdAt for an insert
          // and updatedAt otherwise, so an upsert, which can create the row,
          // stays an insert for them.
          isInsert: kind === "insert" || kind === "upsert",
          isDelete: SqliteBoolean.is(isDeleted)
            ? sqliteBooleanToBoolean(isDeleted)
            : null,
        };

        if (!DbChange.is(dbChange)) {
          // TypeScript allows an undefined optional column unless
          // exactOptionalPropertyTypes is enabled, so name it.
          const undefinedColumn = Object.keys(changeValues).find(
            (column) => changeValues[column] === undefined,
          );
          throw new Error(
            undefinedColumn === undefined
              ? `Invalid DbChange for table '${String(table)}'.`
              : `Column '${undefinedColumn}' of table '${String(table)}' is undefined. Omit it instead. TypeScript reports this only with exactOptionalPropertyTypes, which Evolu requires.`,
          );
        }

        // Copy binary values, so what is saved is what was passed: the caller
        // can change a Uint8Array before the batch is sent, a view of a
        // resizable buffer can grow, and a view of a shared buffer cannot be
        // sent to a SharedWorker at all. Node's Buffer passes validation and
        // its slice shares memory, so only the constructor copies reliably.
        for (const [column, value] of objectToEntries(dbChange.values)) {
          if (typeof value === "object" && value !== null) {
            changeValues[column] = new Uint8Array(value);
          }
        }

        // A change over maxMutationSize could never sync, and a shared worker
        // hosting two databases would stop all work of that database. Correct
        // apps bound column Types, so it is a programmer error and throws like
        // the DbChange check above, before batching: it gets no timestamp, the
        // database worker never sees it, and the code after the call does not
        // run, so a form keeps its input and no row refers to the missing one.
        //
        // Rejected: reporting it through evoluError, which lets that code run
        // as if the mutation was saved; checking in the database worker, which
        // gets it already batched and cannot reach the call site; quarantine,
        // which holds changes stored for sync; and skipping it in sync, which
        // keeps range fingerprints disagreeing. Received changes are not
        // checked. Changes saved before this limit can be too large for any
        // protocol message, as can crafted changes on a relay. Their
        // fingerprints disagree either way, so sync skips them, which ends
        // every round instead of retrying forever. A client reports such a
        // change as its route's skippedError, and a relay logs it. They are not
        // recovered, which needs a history-aware design.
        //
        // Local-only tables never sync, so they have no limit.
        if (!isLocalOnlyTable(dbChange.table)) {
          const size = measureMutation(dbChange);
          assert(
            size <= maxMutationSize,
            `The mutation of table '${dbChange.table}' is ${size} bytes, over maxMutationSize (${maxMutationSize}). Bound the Types of its columns or check it with evolu.getMutationSize.`,
          );
        }

        requestPersistentStorage();

        if (options?.owner) assertNoOtherAppOwner(options.owner);
        // Rows of a synced table that the device owner owned would never
        // sync, silently.
        assert(
          instanceKind.type !== "Device" ||
            isLocalOnlyTable(dbChange.table) ||
            options?.owner,
          `A device database's mutation of synced table '${dbChange.table}' must pass the owner it syncs under.`,
        );

        mutate(
          { ...dbChange, ownerId: options?.owner?.id ?? instanceOwner.id },
          options,
        );

        return { id };
      };

    const loadQuery = <R extends Row>(
      query: Query<S, R>,
      options?: LoadQueryOptions,
    ): Promise<QueryRows<R>> => {
      if (options?.cache === false) {
        const { promise, resolve, reject } = Promise.withResolvers<QueryRows>();
        const id = createId(run.deps);
        uncachedLoadsById.set(id, { query, resolve, reject });
        // Sent now, after the owner actions and changes made before it, so it
        // reads exactly those changes, and before any made after it or a
        // later deletion.
        useOwnerBatch.flushNow();
        mutateBatch.flushNow();
        if (!disposed)
          postMessage({
            type: "Query",
            queries: createSet([query]),
            callbackIds: [id],
          });
        return promise as Promise<QueryRows<R>>;
      }

      const loadingPromise = loadingPromisesByQuery.get(query);
      if (loadingPromise) {
        return loadingPromise.promise as Promise<QueryRows<R>>;
      }

      const { promise, resolve, reject } = Promise.withResolvers<QueryRows>();
      const typedPromise = promise as LoadingPromise["promise"];
      typedPromise.status = "pending";

      loadingPromisesByQuery.set(query, {
        promise: typedPromise,
        resolve,
        reject,
        releaseOnSettle: false,
      });

      queryBatch.push(query);

      return typedPromise as Promise<QueryRows<R>>;
    };

    const getQueryRows = <R extends Row>(query: Query<S, R>): QueryRows<R> =>
      (rowsByQueryMapStore.get().get(query) ?? emptyArray) as QueryRows<R>;

    const useOwner = (
      owner: ReadonlyOwner | Owner,
      ownerTransports?: NonEmptyReadonlyArray<OwnerTransport>,
    ): UnuseOwner => {
      const effectiveTransports = ownerTransports ?? transports;
      assertNonEmptyReadonlyArray(
        effectiveTransports,
        "useOwner requires explicit non-empty transports when config.transports is empty.",
      );
      // Its keys are public, so anyone could read and write what it syncs.
      assert(
        owner.id !== instantStartDeviceOwner.id,
        "useOwner can't sync instant start's public device owner.",
      );
      assertNoOtherAppOwner(owner);
      assertDistinctTransports(effectiveTransports);

      // Post only what workers use. Forwarding the caller's object would copy
      // an AppOwner's mnemonic into every worker.
      const { id, encryptionKey } = owner;
      const syncOwner: SyncOwner = {
        owner:
          "writeKey" in owner
            ? { id, encryptionKey, writeKey: owner.writeKey }
            : { id, encryptionKey },
        transports: effectiveTransports,
      };

      const registrationId = createId<"OwnerRegistration">(run.deps);
      useOwnerBatch.push({
        action: "add",
        id: registrationId,
        owner: syncOwner,
      });

      let isUsed = true;

      return () => {
        if (disposed) return;
        assert(isUsed, "UnuseOwner can be called only once.");
        isUsed = false;
        useOwnerBatch.push({ action: "remove", id: registrationId });
      };
    };

    let disposed = false;
    disposer.defer(() => {
      disposed = true;
      console.debug("disposeEvolu");
    });

    const removeAppOwner = (
      name: Name,
      removal: MutationChange & { readonly id: OwnerId },
    ): Task<
      void,
      DatabaseHeldError | UnknownError | UnsupportedDbVersionError
    > =>
      callback(({ resolve }) => {
        const callbackId = removalCallbacks.register(resolve);
        releaseUnsubscribedLoadingPromises();
        // After the owner actions and changes made before it, such as an add
        // of the same AppOwner.
        useOwnerBatch.flushNow();
        mutateBatch.flushNow();
        if (!disposed)
          postMessage({
            type: "RemoveAppOwner",
            name,
            change: removal,
            callbackId,
            subscribedQueries: subscribedQueriesRefCount.keys(),
          });
        return () => {
          removalCallbacks.unregister(callbackId);
        };
      });

    // oxlint-disable-next-line react/rules-of-hooks -- useOwner manages sync ownership and is not a React Hook.
    if (isNonEmptyArray(transports)) useOwner(instanceOwner);

    run.signal.throwIfAborted();

    // Bound before any message from the tenant, which can dispose it.
    const evolu = disposable<EvoluInstance<S>>(
      {
        name,
        devicePersistence: Promise.resolve(devicePersistence),

        insert: createMutation("insert"),
        update: createMutation("update"),
        upsert: createMutation("upsert"),

        getMutationSize: (table, values) => {
          const columns = createMutableRecord<string, SqliteValue>();
          for (const [column, value] of objectToEntries(
            values as ReadonlyRecord<string, SqliteValue | undefined>,
          )) {
            if (
              value !== undefined &&
              column !== "id" &&
              column !== "isDeleted"
            ) {
              columns[column] = value;
            }
          }
          return measureMutation(
            DbChange.orThrow({
              table: String(table),
              // Every ID takes 16 bytes, and the flags always take one.
              id: mutationSizeId,
              values: columns,
              isInsert: true,
              isDelete: null,
            }),
          );
        },

        loadQuery,
        loadQueries: <Q extends Queries<S>>(
          queries: [...Q],
        ): [...QueriesToQueryRowsPromises<Q>] =>
          queries.map((query) => loadQuery(query)) as [
            ...QueriesToQueryRowsPromises<Q>,
          ],

        subscribeQuery: (query) => (listener) => {
          // A framework can subscribe after disposal with a function it took
          // before, as React does in an effect after a deletion, so it does
          // nothing, as an unsubscribe after disposal does.
          if (disposed) return constVoid;
          subscribedQueriesRefCount.increment(query);
          let isSubscribed = true;

          let previousRows: unknown = null;

          const unsubscribe = rowsByQueryMapStore.subscribe(() => {
            const rows = getQueryRows(query);
            if (previousRows === rows) return;
            previousRows = rows;
            // A throw must not skip later listeners or the mutation callbacks
            // of the same answer, which settle promises.
            try {
              listener();
            } catch (error) {
              run.deps.reportDefect(error);
            }
          });

          // Invalidation can happen after loading but before a framework
          // subscribes. Register first so subsequent invalidations also
          // refresh this query.
          const loadingPromise = loadingPromisesByQuery.get(query);
          if (loadingPromise?.releaseOnSettle) {
            // Retain the pending promise for its awaiters, but queue a read
            // after the mutation or sync that invalidated its result.
            loadingPromise.releaseOnSettle = false;
            queryBatch.push(query);
          } else if (!loadingPromise) {
            const rows = rowsByQueryMapStore.get().get(query);
            if (rows) {
              // Queue a read, but keep cached rows available to React use()
              // so a render before the worker responds does not suspend.
              void loadQuery(query);
              const entry = loadingPromisesByQuery.get(query);
              assertNotUndefined(entry);
              settleLoadingPromise(entry, ok(rows));
            }
          }

          return () => {
            assert(
              isSubscribed,
              "subscribeQuery unsubscribe can be called only once.",
            );
            isSubscribed = false;

            previousRows = null;

            if (disposed) return;

            unsubscribe();
            subscribedQueriesRefCount.decrement(query);
          };
        },
        getQueryRows,

        exportDatabase: () => {
          if (!exportDatabasePending) {
            exportDatabasePending =
              Promise.withResolvers<Uint8Array<ArrayBuffer>>();
            postMessage({ type: "Export" });
          }
          return exportDatabasePending.promise;
        },

        deleteDatabase: () => {
          if (!deleteDatabasePending) {
            deleteDatabasePending =
              Promise.withResolvers<Result<void, DeleteDatabaseError>>();
            // Queue the changes and queries made before it, so the changes are
            // deleted rather than dropped and the queries are answered.
            useOwnerBatch.flushNow();
            mutateBatch.flushNow();
            queryBatch.flushNow();
            postMessage({ type: "DeleteDatabase" });
          }
          return deleteDatabasePending.promise;
        },

        deleteOwner: (owner) => {
          assert(
            owner.id !== instanceOwner.id,
            "deleteOwner cannot delete an owner with the AppOwner's ID, which names the database. Use deleteDatabase.",
          );
          const pending =
            Promise.withResolvers<Result<void, DeleteOwnerError>>();
          deleteOwnerPending.push(pending);
          // Queue the owner actions, changes, and queries made before it, so
          // the deletion ends the registrations made before it, even those
          // still waiting for their turn, deletes the changes, and comes after
          // the queries, which read the rows.
          useOwnerBatch.flushNow();
          mutateBatch.flushNow();
          queryBatch.flushNow();
          // Only the ID, so the owner's keys reach no other tab.
          postMessage({ type: "DeleteOwner", ownerId: owner.id });
          return pending.promise;
        },

        useOwner,
        requestSync: (ownerId) => {
          // Do not let the forced mutation flush overtake pending owner actions.
          useOwnerBatch.flushNow();
          // Queue preceding mutations before the reconciliation request.
          mutateBatch.flushNow();
          useOwnerBatch.push({ action: "sync", ownerId });
        },
      },
      disposer,
    );
    return ok({ evolu, mutate, removeAppOwner, requestPersistentStorage });
  };

// The shared worker claims each transport once and treats a duplicate as a
// defect that stops it for every tab, so the caller's mistake fails in its own
// tab.
const assertDistinctTransports = (
  transports: ReadonlyArray<OwnerTransport>,
): void => {
  assert(
    new Set(transports.map((transport) => structuralLookup(transport))).size ===
      transports.length,
    "Transports must be distinct.",
  );
};

// A stored database's name, which hashes the owner's ID, with the name input
// of a database of Evolu's own; see EvoluInstanceKind.
const storedDatabaseName = (
  appName: AppName,
  ownerId: OwnerId,
  nameInput: string | null,
): Name =>
  `${appName}-${
    nameInput == null
      ? createIdFromString(ownerId)
      : createIdFromString(nameInput, ownerId)
  }` as Name;

const instancesWithDeletedDatabase = new WeakSet<object>();

/**
 * Whether the deletion of the database of the {@link Evolu} instance disposed
 * it; see {@link Evolu.deleteDatabase}. It's also true for an AppOwner's
 * instance that {@link createEvoluApp} disposed after a removal of the AppOwner;
 * see {@link EvoluApp.remove}. A framework binding checks it before it uses the
 * instance, so a component the app has not replaced yet doesn't throw: React's
 * suspends, and Vue's and Svelte's show no rows.
 *
 * @group Core
 */
export const isDatabaseDeleted = <S extends EvoluSchema>(
  // Every instance passes, the device database's included.
  evolu: DeviceEvolu<S>,
): boolean => instancesWithDeletedDatabase.has(evolu);
