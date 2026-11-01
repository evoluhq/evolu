/**
 * Local-first platform.
 *
 * @module
 */

import {
  emptyArray,
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
import type { DecryptWithXChaCha20Poly1305Error } from "../Crypto.ts";
import type { UnknownError } from "../Error.ts";
import { createUnknownError } from "../Error.ts";
import { constVoid, disposable, exhaustiveCheck, todo } from "../Function.ts";
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
import { err, ok, type Result } from "../Result.ts";
import { createSet, isNonEmptySet } from "../Set.ts";
import {
  SqliteBoolean,
  sqliteBooleanToBoolean,
  type SqliteValue,
} from "../Sqlite.ts";
import type { Listener, ReadonlyStore, Unsubscribe } from "../Store.ts";
import { createStore } from "../Store.ts";
import type { Task } from "../Task.ts";
import {
  brand,
  createId,
  createIdFromString,
  type ExtractTyped,
  Id,
  type Name,
  PositiveInt,
  type TypeError,
  UrlSafeString,
} from "../Type.ts";
import type { WebSocketUrl } from "../WebSocket.ts";
import type {
  BroadcastChannel,
  CreateBroadcastChannelDep,
  CreateMessageChannelDep,
} from "../Worker.ts";
import type {
  CreateDbWorkerDep,
  DatabaseHeldError,
  UnsupportedDbVersionError,
} from "./Db.ts";
import type {
  AppOwner,
  Owner,
  OwnerId,
  OwnerTransport,
  ReadonlyOwner,
  RelayUrlFromString,
  SyncOwner,
} from "./Owner.ts";
import { createOwnerWebSocketTransport } from "./Owner.ts";
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
  Queries,
  QueriesToQueryRowsPromises,
  Query,
  QueryRows,
  Row,
  RowsByQueryMap,
} from "./Query.ts";
import { applyPatches } from "./Query.ts";
import type {
  EvoluSchema,
  IndexesConfig,
  Mutation,
  MutationChange,
  MutationOptions,
  MutationValues,
  SystemColumns,
  ValidateSchema,
} from "./Schema.ts";
import { evoluSchemaToSqliteSchema, isLocalOnlyTable } from "./Schema.ts";
import type {
  ConsoleEntryOrError,
  EvoluInput,
  EvoluOutput,
  OtherBuildRunningError,
  OwnerSyncStatus,
  PendingSyncRoute,
  SharedWorkerDep,
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
   * Instances that share an `appName` and AppOwner, and keep their database the
   * same way, stored or in memory (see {@link EvoluConfig.memoryOnly}), open the
   * same database and must use the same schema. Evolu applies the schema of the
   * first instance and later instances join it.
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
   * Recommended usage:
   *
   * - Create and persist an `appOwner` for first run, then guide the user to back
   *   it up after user activity.
   * - Pass `appOwner` restored from secure storage (for example, Expo
   *   SecureStore, WebAuthn-backed storage, or app-managed account recovery
   *   flow).
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
   * {@link AppOwner}. Instances of one `appName` and `appOwner` kept in memory
   * share one memory database, as stored instances share one stored database.
   * Both still sync the owner, like any two databases of it, so while a stored
   * instance of the owner syncs on this device, the changes made in memory are
   * stored on the device too. To keep nothing on the device, dispose the stored
   * instances of the owner first.
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
   * Called when this instance's local database is deleted.
   *
   * Apps can use this to update UI immediately because the corresponding
   * {@link Evolu} instance becomes unusable after local database deletion.
   */
  readonly onDatabaseDeleted?: () => void;

  /**
   * Called when local data for an {@link Owner} is deleted.
   *
   * Apps can use this to update UI immediately because that owner stops being
   * used across tabs and instances.
   */
  readonly onOwnerDeleted?: (owner: Owner) => void;

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
   * owners, for example for paid tiers, but anyone who knows an OwnerId can
   * name it, so a private relay needs access control beyond the OwnerId, as
   * [Privacy](https://www.evolu.dev/docs/privacy#relay-blindness-by-design)
   * describes.
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
 * Evolu uses AppName as the base prefix for {@link Evolu.name}. The final
 * instance name is derived per {@link AppOwner} as
 * `${appName}-${createIdFromString(appOwner.id)}`, or for a database kept in
 * memory as `${appName}-${createIdFromString("MemoryDatabase", appOwner.id)}`;
 * see {@link EvoluConfig.memoryOnly}.
 *
 * Uses the same safe alphabet as {@link UrlSafeString} (letters, digits, `-`,
 * `_`) and must be between 1 and 41 characters.
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
 * synchronizes other data. Use them for device-local data such as application
 * settings or an app-owner registry.
 *
 * @group Core
 */
export interface Evolu<
  S extends EvoluSchema = EvoluSchema,
> extends AsyncDisposable {
  /**
   * Evolu instance name is derived from {@link EvoluConfig.appName},
   * {@link AppOwner}'s hash, and whether the database is kept in memory; see
   * {@link AppName}.
   */
  readonly name: Name;

  /** {@link AppOwner}. */
  readonly appOwner: AppOwner;

  /**
   * Whether this device keeps the database, which {@link createEvolu} decides
   * before it creates the instance.
   *
   * Apps tell the user when it is `NotPersisted`, because then data that has
   * not synced is lost when the database closes. Apps must not tell the user
   * that data is saved on the device when it is `Unknown`.
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
   * Pass `onComplete` when follow-up work must wait until the mutation is
   * stored and subscribed queries reflect it. It never runs when the database
   * is unavailable; see {@link Evolu.loadQuery}. It also never runs when the
   * mutation could not be stored, which {@link EvoluErrorDep.evoluError}
   * reports. A stored change is not always visible; see
   * {@link MutationOptions.onComplete}.
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
   *   onComplete: () => void,
   * ) =>
   *   evolu.insert(
   *     "todo",
   *     { title: NonEmptyTrimmedString100.orThrow("Another todo") },
   *     { onComplete },
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
   * refused startup or its worker failed, unanswered loads stay pending until
   * disposal resolves them with empty rows. Observe
   * {@link EvoluErrorDep.evoluError} to display the refusal independently of
   * query loading.
   *
   * Loading is batched. Returned promises are cached while pending and can be
   * reused after they settle, which prevents redundant database queries and
   * supports React Suspense (stable references while pending). A mutation or
   * incoming sync invalidates the cache of an unsubscribed query, so its next
   * load reads again. A subscribed query keeps its cached result and the
   * subscription refreshes it, so a load can return rows that a pending refresh
   * is about to replace. When SQLite fails a refresh, the query keeps its rows,
   * its loads reject until a refresh succeeds, and its subscribers are
   * notified, so React's `useQuery` throws the error then.
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
   *
   * assertType<
   *   ReturnType<typeof loadTodos>,
   *   Promise<QueryRows<typeof allTodos.Row>>
   * >();
   * ```
   */
  readonly loadQuery: <R extends Row>(
    query: Query<S, R>,
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
   * The pending promise rejects if this {@link Evolu} instance is disposed
   * before export completion, and with an {@link UnknownError} when SQLite fails
   * the export, after which the next call exports again. If the database is
   * refused, export stays pending until disposal; see {@link Evolu.loadQuery}.
   */
  readonly exportDatabase: () => Promise<Uint8Array<ArrayBuffer>>;

  // TODO: Add exportHistory.

  /**
   * Delete the local SQLite database for this {@link Evolu} instance on the
   * current device.
   *
   * **Warning**: This first drops all tables. “The dropped table is completely
   * removed from the database schema and the disk file. The table can not be
   * recovered. All indices and triggers associated with the table are also
   * deleted.” https://sqlite.org/lang_droptable.html
   *
   * After that, it deletes the SQLite file identified by {@link Evolu.name},
   * permanently forgetting all local data for that instance on this device.
   *
   * All instances identified by {@link Evolu.name} will be self-disposed. Use
   * {@link EvoluConfig.onDatabaseDeleted} to update app UI when that happens.
   *
   * Currently not implemented.
   */
  readonly deleteDatabase: () => void;

  /**
   * Delete all local data for a specific {@link Owner}.
   *
   * This deletes all rows whose `ownerId` matches the provided owner and
   * deletes that owner's local history as well.
   *
   * It also stops using that owner across all tabs and instances. Use
   * {@link EvoluConfig.onOwnerDeleted} to update app UI when that happens.
   *
   * Currently not implemented.
   */
  readonly deleteOwner: (owner: Owner) => void;

  /**
   * Use an Owner for sync. Returns a {@link UnuseOwner}.
   *
   * Using an Owner means syncing it with the provided transports, or with the
   * default transports defined in {@link EvoluConfig} when transports are
   * omitted.
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
   * which otherwise wait for its next sync, such as after a reconnect. Existing
   * connections and {@link Evolu.useOwner} registrations are retained, including
   * registrations shared by multiple instances or tabs.
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
 * Function returned by {@link Evolu.useOwner} to stop using an Owner for sync.
 *
 * @group Core
 */
export type UnuseOwner = () => void;

/**
 * Whether this device keeps an {@link Evolu} database, stating only what Evolu
 * knows for sure.
 *
 * - `Persisted`: the platform stores it in the app's own file, as React Native
 *   does.
 * - `NotPersisted`: it is kept in memory, under a name of its own, because
 *   {@link EvoluConfig.memoryOnly} asks for that or the platform offers no
 *   persistent storage, as a browser does in Safari's Private Browsing or a
 *   Firefox private window. Data that has not synced is lost when the database
 *   closes.
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
   * SharedWorker sends the refusal to each tab once, including tabs that
   * connect later, and starts no replacement database workers. After all
   * instances release that tenant and it is disposed when idle, creating
   * another instance retries startup and may send the refusal again. On the
   * web, a tab refused with {@link UnsupportedDbVersionError} first reloads once
   * instead. Show that blocking message outside any query-loading boundary, so
   * pending queries do not hide it.
   *
   * An {@link UnknownError} leaves Evolu in an unknown state, so the app can
   * only ask the user to close all its tabs. A failed shared worker closes
   * itself, and a database whose worker failed stays refused while any tab uses
   * it, so the app opened again starts over. Some errors reach every tab, such
   * as an unexpected failure of the shared worker. An app that forwards this
   * store to an error tracker from each tab then reports such an error once per
   * tab. A failed worker that a tab hosts, except a web worker whose script
   * failed to load, is also reported by that tab's error reporter, its error
   * handlers on the web or `ErrorUtils` in React Native, so an app that sends
   * both to one error tracker sees that failure twice. A tab hosts each
   * database's worker, and also the shared worker in React Native or in a
   * browser without SharedWorker.
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
   * {@link ReadonlyStore} of the latest {@link SyncState} shared by all
   * {@link Evolu} instances, or null before the shared worker sends its first
   * snapshot. It lists every database the shared worker serves, including other
   * tabs', so an app finds its own by {@link Evolu.name}. Apps show users an
   * owner's {@link OwnerSyncStatus}, from {@link syncStateToOwnerSyncStatus} or a
   * framework binding's `useOwnerSyncStatus`; views of each relay use
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
   * const openRelayLabels = (deps: SyncStateDep): ReadonlyArray<string> =>
   *   (deps.syncState.get()?.transports ?? [])
   *     .filter(({ connection }) => connection.type === "Open")
   *     .map(({ label }) => label);
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
 * {@link createEvolu} asks it for each instance without
 * {@link EvoluConfig.memoryOnly}. `NotPersisted` means the platform offers no
 * persistent storage now, as a browser does in Safari's Private Browsing or a
 * Firefox private window, so the instance keeps its database in memory, under
 * the name `memoryOnly` gives it. A platform that cannot tell a private session
 * from a storage failure answers `NotPersisted` for both: memory loses nothing
 * that refusing to start would have kept, and the stored database stays
 * untouched.
 *
 * @group Construction
 */
export interface DevicePersistenceDep {
  readonly getDevicePersistence: () => Promise<DevicePersistence>;
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
  SyncStateDep &
  Disposable;

/**
 * Platform-specific dependencies required to create {@link EvoluDeps}.
 *
 * Provides worker and channel adapters plus optional platform integrations for
 * logging, synchronous UI flush, and persistent storage requests.
 *
 * @group Construction
 */
export type EvoluPlatformDeps = CreateDbWorkerDep &
  CreateBroadcastChannelDep &
  CreateMessageChannelDep &
  DevicePersistenceDep &
  LockManagerDep &
  ReloadAppDep &
  SharedWorkerDep &
  Partial<ConsoleDep> &
  Partial<FlushSyncDep> &
  Partial<RequestPersistentStorageDep>;

/**
 * Creates shared dependencies used by all {@link createEvolu} instances on a
 * platform.
 *
 * Call this once per platform and reuse the returned deps when creating
 * multiple Evolu instances. The returned deps object owns long-lived resources
 * such as worker channels and the shared {@link EvoluErrorDep.evoluError} and
 * {@link SyncStateDep.syncState} stores.
 *
 * Dispose it only during app shutdown.
 *
 * @group Construction
 */
export const createEvoluDeps = (deps: EvoluPlatformDeps): EvoluDeps => {
  const { createBroadcastChannel, sharedWorker } = deps;
  const console = deps.console ?? createConsole();
  // Opened when the worker connects.
  let syncStateBroadcastChannel: BroadcastChannel<SyncState> | null = null;
  let tabLeaderElection: Disposable | null = null;

  using disposer = new DisposableStack();
  disposer.use(sharedWorker);
  const evoluError = disposer.use(createStore<EvoluError | null>(null));
  const syncState = disposer.use(createStore<SyncState | null>(null));
  disposer.defer(() => {
    syncStateBroadcastChannel?.[Symbol.dispose]();
  });

  const consoleEntryOrErrorBroadcastChannel = disposer.use(
    createBroadcastChannel<ConsoleEntryOrError>(
      consoleEntryOrErrorBroadcastChannelName,
    ),
  );
  const setEvoluError = (error: EvoluError): void => {
    if (evoluError.get()?.type === "UnsupportedDbVersionError") return;
    evoluError.set(error);
  };

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
        // Every build shares this channel, so another build's worker can post
        // an error type this build does not post, such as an older build's
        // sync error. That build's own tabs show it, so this tab only logs it.
        if (message.error.type === "UnknownError") setEvoluError(message.error);
        // Keep typed errors visible in logs as operational failures.
        console.error(message.error);
        break;
      }

      default:
        exhaustiveCheck(message);
    }
  };

  sharedWorker.port.onMessage = (message) => {
    switch (message.type) {
      case "DbWorkerInit":
        deps.createDbWorker().postMessage(message, [message.port]);
        break;

      case "Error":
        // Sent to this tab only: its database is refused, a mutation it made
        // could not be stored, or its worker still waits for another build.
        setEvoluError(message.error);
        console.error(message.error);
        break;

      case "Waiting":
        // Platform adapters act on it; see Builds in the Shared module.
        break;

      case "Connected": {
        assert(!syncStateBroadcastChannel, "The shared worker connects once.");
        // The wait the error reported is over.
        if (evoluError.get()?.type === "OtherBuildRunningError") {
          evoluError.set(null);
        }
        // The worker is the channel's only sender, and one sender's messages
        // arrive in order, so the last one is current.
        syncStateBroadcastChannel = createBroadcastChannel<SyncState>(
          message.syncStateChannelName,
        );
        syncStateBroadcastChannel.onMessage = (state) => {
          // Every snapshot arrives as a new structured clone, so its unchanged
          // parts get the previous snapshot's objects back, and an unchanged
          // snapshot leaves the store as it is.
          const previous = syncState.get();
          syncState.set(
            previous
              ? shareStructure(previous, state, syncStateItemToKey)
              : state,
          );
        };
        // Asking only after listening misses no snapshot.
        sharedWorker.port.postMessage({ type: "RequestSyncState" });
        // Only this worker's tabs compete, so a tab of another worker never
        // hosts its DbWorkers.
        tabLeaderElection = acquireLeaderLockCallback(deps)(
          `tab-${message.workerId}`,
          () => {
            sharedWorker.port.postMessage({
              type: "AnnounceTabLeader",
              consoleLevel: console.getLevel(),
            });
          },
        );
        break;
      }

      default:
        exhaustiveCheck(message);
    }
  };

  disposer.defer(() => {
    tabLeaderElection?.[Symbol.dispose]();
  });

  return disposable<EvoluDeps>(
    {
      ...deps,
      console,
      evoluError,
      syncState,
    },
    disposer,
  );
};

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
  ): Task<Evolu<S>, never, EvoluPlatformDeps> =>
  async (run) => {
    const {
      appName,
      appOwner,
      transports = [
        { type: "WebSocket", url: "wss://free.evoluhq.com/" as WebSocketUrl },
      ],
    } = config;

    const devicePersistence: DevicePersistence = config.memoryOnly
      ? "NotPersisted"
      : await run.deps.getDevicePersistence();
    const memoryOnly = devicePersistence === "NotPersisted";
    // A database kept in memory gets a name of its own, so it never shares a
    // tenant, a lock, or files with the stored database of its owner. Its
    // hash input, the owner ID's bytes and a suffix, is longer than an owner
    // ID, so it never equals a stored name's input. An AppName has at most 41
    // characters and an Id 22, so this is a Name.
    const name = `${appName}-${
      memoryOnly
        ? createIdFromString("MemoryDatabase", appOwner.id)
        : createIdFromString(appOwner.id)
    }` as Name;
    const console = run.deps.console.child(name).child("Evolu");
    console.info("createEvolu");

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
     * `use` thenables do not hang forever during teardown.
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

    const onMutateCompleteCallbacks = disposer.use(createCallbacks(run.deps));

    let exportDatabasePending = null as PromiseWithResolvers<
      Uint8Array<ArrayBuffer>
    > | null;

    disposer.defer(() => {
      exportDatabasePending?.reject({ type: "EvoluDisposedError" });
      exportDatabasePending = null;
    });

    let isPersistentStorageRequested = false;

    let postMessage: (input: EvoluInput) => void;

    // Scope worker/channel wiring and keep only postMessage outside.
    {
      const id = createId<"EvoluInstance">(run.deps);
      const { createMessageChannel, sharedWorker } = run.deps;
      disposer.use(await run.ok(acquireLeaderLock(id)));

      const evoluChannel = disposer.use(
        createMessageChannel<EvoluInput, EvoluOutput>(),
      );

      evoluChannel.port1.onMessage = (message) => {
        switch (message.type) {
          case "OnPatchesByQuery": {
            console.debug("onPatchesByQuery", {
              queryCount: message.patchesByQuery.size,
              onCompleteCount: message.onCompleteIds.length,
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

            for (const [query, patches] of message.patchesByQuery) {
              const loadingPromise = loadingPromisesByQuery.get(query);
              if (!loadingPromise) continue;

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

            if (run.deps.flushSync && message.onCompleteIds.length > 0) {
              run.deps.flushSync(() => {
                rowsByQueryMapStore.set(nextRowsByQueryMap);
              });
            } else {
              rowsByQueryMapStore.set(nextRowsByQueryMap);
            }

            for (const onCompleteId of message.onCompleteIds) {
              onMutateCompleteCallbacks.execute(onCompleteId);
            }
            break;
          }

          case "RefreshQueries": {
            releaseUnsubscribedLoadingPromises();

            const queries = new Set<Query>(subscribedQueriesRefCount.keys());

            if (isNonEmptySet(queries)) postMessage({ type: "Query", queries });
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

          case "OnMutateFailed": {
            // The tab reports the failure, and these callbacks never run.
            for (const onCompleteId of message.onCompleteIds) {
              onMutateCompleteCallbacks.unregister(onCompleteId);
            }
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
          id,
          consoleLevel: console.getLevel(),
          sqliteSchema: evoluSchemaToSqliteSchema(schema, config.indexes),
          encryptionKey: appOwner.encryptionKey,
          memoryOnly,
          evoluPort: evoluChannel.port2.native,
        },
        [evoluChannel.port2.native],
      );

      postMessage = evoluChannel.port1.postMessage;
    }

    const mutateBatch = disposer.use(
      createMicrotaskBatch<{
        readonly change: MutationChange;
        readonly onComplete: (() => void) | undefined;
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
          onCompleteIds: items.flatMap((item) =>
            item.onComplete
              ? [onMutateCompleteCallbacks.register(item.onComplete)]
              : [],
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
        postMessage({ type: "Query", queries: dedupedQueries });
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

        // Only unsynced local changes exist nowhere else, so the first one is
        // when asking the platform to keep them starts to matter. Asking on
        // load would show Firefox's permission prompt to every visitor.
        if (!isPersistentStorageRequested) {
          isPersistentStorageRequested = true;
          if (devicePersistence === "Unknown") {
            run.deps.requestPersistentStorage?.();
          }
        }

        // Released now, not only when the batch is sent, so a load right after
        // the mutation does not return rows cached before it.
        releaseUnsubscribedLoadingPromises();

        mutateBatch.push({
          change: { ...dbChange, ownerId: options?.owner?.id ?? appOwner.id },
          onComplete: options?.onComplete,
        });

        return { id };
      };

    const loadQuery = <R extends Row>(
      query: Query<S, R>,
    ): Promise<QueryRows<R>> => {
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
      // The shared worker claims each transport once and treats a duplicate as
      // a defect that stops it for every tab, so the caller's mistake fails
      // here, in its own tab.
      assert(
        new Set(
          effectiveTransports.map((transport) => structuralLookup(transport)),
        ).size === effectiveTransports.length,
        "useOwner requires distinct transports.",
      );

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

      useOwnerBatch.push({
        owner: syncOwner,
        action: "add",
      });

      let isUsed = true;

      return () => {
        if (disposed) return;
        assert(isUsed, "UnuseOwner can be called only once.");
        isUsed = false;
        useOwnerBatch.push({
          owner: syncOwner,
          action: "remove",
        });
      };
    };

    let disposed = false;
    disposer.defer(() => {
      disposed = true;
      console.info("disposeEvolu");
    });

    // oxlint-disable-next-line react/rules-of-hooks -- useOwner manages sync ownership and is not a React Hook.
    if (isNonEmptyArray(transports)) useOwner(appOwner);

    run.signal.throwIfAborted();

    return ok(
      disposable<Evolu<S>>(
        {
          name,
          appOwner,
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
            subscribedQueriesRefCount.increment(query);
            let isSubscribed = true;

            let previousRows: unknown = null;

            const unsubscribe = rowsByQueryMapStore.subscribe(() => {
              const rows = getQueryRows(query);
              if (previousRows === rows) return;
              previousRows = rows;
              listener();
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
            todo();
          },

          deleteOwner: (owner) => {
            void owner;
            todo();
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
      ),
    );
  };

//     case "onReset": {
//       if (message.reload) {
//         deps.reloadApp(reloadUrl);
//       } else {
//         onCompleteCallbacks.execute(message.onCompleteId);
//       }
//       break;
//     }

// resetAppOwner: (_options) => {
//   const { promise, resolve } = Promise.withResolvers<undefined>();
//   const _onCompleteId = onCompleteCallbacks.register(resolve);
//   // dbWorker.postMessage({
//   //   type: "reset",
//   //   onCompleteId,
//   //   reload: options?.reload ?? true,
//   // });
//   return promise;
// },

// restoreAppOwner: (_mnemonic, _options) => {
//   const { promise, resolve } = Promise.withResolvers<undefined>();
//   const _onCompleteId = onCompleteCallbacks.register(resolve);
//   // dbWorker.postMessage({
//   //   type: "reset",
//   //   onCompleteId,
//   //   reload: options?.reload ?? true,
//   //   restore: { mnemonic, sqliteSchema },
//   // });
//   return promise;
// },

// reloadApp: () => {
//   // TODO:
//   // deps.reloadApp(reloadUrl);
// },

// ensureSchema: (schema) => {
//   mutationTypesCache.clear();
//   const sqliteSchema = evoluSchemaToSqliteSchema(schema);
//   dbWorker.postMessage({ type: "ensureSqliteSchema", sqliteSchema });
// },

// /**
//  * Delete {@link AppOwner} and all their data from the current device. After
//  * the deletion, Evolu will purge the application state. For browsers, this
//  * will reload all tabs using Evolu. For native apps, it will restart the
//  * app.
//  *
//  * Reloading can be turned off via options if you want to provide a different
//  * UX.
//  */
// readonly resetAppOwner: (options?: {
//   readonly reload?: boolean;
// }) => Promise<void>;

// /**
//  * Restore {@link AppOwner} with all their synced data. It uses
//  * {@link Evolu.resetAppOwner}, so be careful.
//  */
// readonly restoreAppOwner: (
//   mnemonic: Mnemonic,
//   options?: {
//     readonly reload?: boolean;
//   },
// ) => Promise<void>;
