import { pack } from "msgpackr";
import { isNonEmptyArray, isNonEmptyReadonlyArray } from "../Array.js";
import { assert, assertNonEmptyArray } from "../Assert.js";
import { createCallbackRegistry } from "../CallbackRegistry.js";
import { ConsoleDep } from "../Console.js";
import { RandomBytesDep, SymmetricCryptoDecryptError } from "../Crypto.js";
import { eqArrayNumber } from "../Eq.js";
import { TransferableError } from "../Error.js";
import { exhaustiveCheck } from "../Function.js";
import { err, ok, Result } from "../Result.js";
import { isSqlMutation, SafeSql, SqliteError, SqliteQuery } from "../Sqlite.js";
import { createStore, StoreSubscribe } from "../Store.js";
import { TimeDep } from "../Time.js";
import {
  createId,
  Id,
  InferErrors,
  InferInput,
  InferType,
  Mnemonic,
  ObjectType,
  ValidMutationSize,
  ValidMutationSizeError,
} from "../Type.js";
import { IntentionalNever } from "../Types.js";
import { CreateDbWorkerDep, DbConfig, defaultDbConfig } from "./Db.js";
import { applyPatches } from "./Diff.js";
import { LocalAuthDep } from "./LocalAuth.js";
import { AppOwner } from "./Owner.js";
import { FlushSyncDep, ReloadAppDep } from "./Platform.js";
import { ProtocolError, ProtocolUnsupportedVersionError } from "./Protocol.js";
import {
  createSubscribedQueries,
  emptyRows,
  Queries,
  QueriesToQueryRowsPromises,
  Query,
  QueryRows,
  QueryRowsMap,
  Row,
  serializeQuery,
  SubscribedQueries,
} from "./Query.js";
import {
  CreateQuery,
  DefaultColumns,
  EvoluSchema,
  evoluSchemaToDbSchema,
  IndexesConfig,
  insertable,
  kysely,
  Mutation,
  MutationChange,
  MutationKind,
  MutationMapping,
  MutationOptions,
  updateable,
  upsertable,
  ValidateSchema,
} from "./Schema.js";
import { DbChange } from "./Storage.js";
import { initialSyncState, SyncOwner, SyncState } from "./Sync.js";
import { TimestampError } from "./Timestamp.js";

export interface EvoluConfig extends Partial<DbConfig> {
  /**
   * Use the `indexes` option to define SQLite indexes.
   *
   * Table and column names are not typed because Kysely doesn't support it.
   *
   * https://medium.com/@JasonWyatt/squeezing-performance-from-sqlite-indexes-indexes-c4e175f3c346
   *
   * ### Example
   *
   * ```ts
   * const evolu = createEvolu(evoluReactDeps)(Schema, {
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
   * URL to reload browser tabs after reset or restore.
   *
   * The default value is `/`.
   */
  readonly reloadUrl?: string;
}

// /**
//  * Validated database change with schema-typed values.
//  *
//  * This is a tagged union where the tag is the table name and the values are
//  * updateable (validated against the schema). This represents the content of a
//  * {@link CrdtMessage} without the timestamp, which is sufficient for business
//  * logic validation in {@link EvoluConfig.onMessage}.
//  */
// export type ValidatedDbChange<S extends EvoluSchema> = {
//   [Table in keyof S]: {
//     readonly table: Table;
//     readonly id: Id;
//     readonly values: Updateable<S[Table]> & { readonly createdAt?: DateIso };
//   };
// }[keyof S];

// /**
//  * Local-only mutation interface for use within {@link EvoluConfig.onMessage}
//  * callback.
//  *
//  * Provides type-safe mutation methods that only accept tables with names
//  * starting with underscore (local-only tables). All methods require fully
//  * validated branded values. No validation is performed as TypeScript ensures
//  * type correctness.
//  */
// export interface LocalOnly<S extends EvoluSchema> {
//   readonly insert: <T extends keyof S & `_${string}`>(
//     table: T,
//     values: InferType<ObjectType<InsertableProps<S[T]>>>,
//   ) => InferType<S[T]["id"]>;

//   readonly update: <T extends keyof S & `_${string}`>(
//     table: T,
//     values: InferType<ObjectType<UpdateableProps<S[T]>>>,
//   ) => void;

//   readonly upsert: <T extends keyof S & `_${string}`>(
//     table: T,
//     values: InferType<ObjectType<UpsertableProps<S[T]>>>,
//   ) => void;
// }

export interface Evolu<S extends EvoluSchema = EvoluSchema> {
  /**
   * Subscribe to {@link EvoluError} changes.
   *
   * ### Example
   *
   * ```ts
   * const unsubscribe = evolu.subscribeError(() => {
   *   const error = evolu.getError();
   *   console.log(error);
   * });
   * ```
   */
  readonly subscribeError: StoreSubscribe;

  /** Get {@link EvoluError}. */
  readonly getError: () => EvoluError | null;

  /**
   * Create type-safe SQL {@link Query}.
   *
   * Evolu uses Kysely - the type-safe SQL query builder for TypeScript. See
   * https://kysely.dev.
   *
   * All this function does is compile the Kysely query and serialize it into a
   * unique string. Both operations are fast and cheap.
   *
   * For mutations, use {@link Evolu#insert}, {@link Evolu#update}, or
   * {@link Evolu#upsert}.
   *
   * ### Example
   *
   * ```ts
   * const allTodos = evolu.createQuery((db) =>
   *   db.selectFrom("todo").selectAll(),
   * );
   *
   * const todoById = (id: TodoId) =>
   *   evolu.createQuery((db) =>
   *     db.selectFrom("todo").selectAll().where("id", "=", id),
   *   );
   * ```
   */
  readonly createQuery: CreateQuery<S>;

  /**
   * Load {@link Query} and return a promise with {@link QueryRows}.
   *
   * The returned promise always resolves successfully because there is no
   * reason why loading should fail. All data are local, and the query is typed.
   * Unexpected errors are handled with {@link Evolu#subscribeError}.
   *
   * Loading is batched, and returned promises are cached, so there is no need
   * for an additional cache. Evolu's internal cache is invalidated on mutation.
   * Unsubscribed queries are removed from the cache, so loading them again will
   * return a new pending promise. Subscribed queries remain in the cache to
   * prevent unnecessary Suspense boundaries from activating. Their promises are
   * replaced with `Promise.resolve(rows)`, allowing React to synchronously
   * unwrap the updated data without suspending.
   *
   * To subscribe a query for automatic updates, use
   * {@link Evolu#subscribeQuery}.
   *
   * ### Example
   *
   * ```ts
   * const allTodos = evolu.createQuery((db) =>
   *   db.selectFrom("todo").selectAll(),
   * );
   * evolu.loadQuery(allTodos).then((rows) => {
   *   console.log(rows);
   * });
   * ```
   */
  readonly loadQuery: <R extends Row>(query: Query<R>) => Promise<QueryRows<R>>;

  /**
   * Load an array of {@link Query} queries and return an array of
   * {@link QueryRows} promises. It's like `queries.map(loadQuery)` but with
   * proper types for returned promises.
   *
   * ### Example
   *
   * ```ts
   * evolu.loadQueries([allTodos, todoById(1)]);
   * ```
   */
  readonly loadQueries: <R extends Row, Q extends Queries<R>>(
    queries: [...Q],
  ) => [...QueriesToQueryRowsPromises<Q>];

  /**
   * Subscribe to {@link Query} {@link QueryRows} changes.
   *
   * ### Example
   *
   * ```ts
   * const unsubscribe = evolu.subscribeQuery(allTodos)(() => {
   *   const rows = evolu.getQueryRows(allTodos);
   * });
   * ```
   */
  readonly subscribeQuery: (query: Query) => StoreSubscribe;

  /**
   * Get {@link QueryRows}.
   *
   * ### Example
   *
   * ```ts
   * const unsubscribe = evolu.subscribeQuery(allTodos)(() => {
   *   const rows = evolu.getQueryRows(allTodos);
   * });
   * ```
   */
  readonly getQueryRows: <R extends Row>(query: Query<R>) => QueryRows<R>;

  /**
   * Promise that resolves to {@link AppOwner} when available.
   *
   * ### Example
   *
   * ```ts
   * const owner = await evolu.appOwner;
   * ```
   */
  readonly appOwner: Promise<AppOwner>;

  // TODO: Update it for the owners
  // /**
  //  * Subscribe to {@link SyncState} changes.
  //  *
  //  * ### Example
  //  *
  //  * ```ts
  //  * const unsubscribe = evolu.subscribeSyncState(() => {
  //  *   const syncState = evolu.getSyncState();
  //  * });
  //  * ```
  //  */
  // readonly subscribeSyncState: StoreSubscribe;

  // /**
  //  * Get {@link SyncState}.
  //  *
  //  * ### Example
  //  *
  //  * ```ts
  //  * const unsubscribe = evolu.subscribeSyncState(() => {
  //  *   const syncState = evolu.getSyncState();
  //  * });
  //  * ```
  //  */
  // readonly getSyncState: () => SyncState;

  /**
   * Inserts a row into the database and returns a {@link Result} with the new
   * {@link Id}.
   *
   * The first argument is the table name, and the second is an object
   * containing the row data. An optional third argument provides mutation
   * options including an `onComplete` callback and `onlyValidate` flag.
   *
   * Returns a Result type - use `.ok` to check if the insertion succeeded, and
   * `.value.id` to access the generated ID on success, or `.error` to handle
   * validation errors.
   *
   * Evolu does not use SQL for mutations to ensure data can be safely and
   * predictably merged without conflicts. Explicit mutations also allow Evolu
   * to automatically add and update {@link DefaultColumns}.
   *
   * ### Example
   *
   * ```ts
   * const result = evolu.insert("todo", {
   *   title: "Learn Evolu",
   *   isCompleted: false,
   * });
   *
   * if (result.ok) {
   *   console.log("Todo created with ID:", result.value.id);
   * } else {
   *   console.error("Validation error:", result.error);
   * }
   *
   * // With onComplete callback
   * evolu.insert(
   *   "todo",
   *   { title: "Another todo" },
   *   {
   *     onComplete: () => {
   *       console.log("Insert completed");
   *     },
   *   },
   * );
   * ```
   */
  insert: Mutation<S, "insert">;

  /**
   * Updates a row in the database and returns a {@link Result} with the existing
   * {@link Id}.
   *
   * The first argument is the table name, and the second is an object
   * containing the row data including the required `id` field. An optional
   * third argument provides mutation options including an `onComplete` callback
   * and `onlyValidate` flag.
   *
   * Returns a Result type - use `.ok` to check if the update succeeded, and
   * `.value.id` to access the ID on success, or `.error` to handle validation
   * errors.
   *
   * Evolu does not use SQL for mutations to ensure data can be safely and
   * predictably merged without conflicts. Explicit mutations also allow Evolu
   * to automatically add and update {@link DefaultColumns}.
   *
   * ### Example
   *
   * ```ts
   * const result = evolu.update("todo", {
   *   id: todoId,
   *   title: "Updated title",
   *   isCompleted: true,
   * });
   *
   * if (result.ok) {
   *   console.log("Todo updated with ID:", result.value.id);
   * } else {
   *   console.error("Validation error:", result.error);
   * }
   *
   * // To delete a row, set isDeleted to true
   * evolu.update("todo", { id: todoId, isDeleted: true });
   *
   * // With onComplete callback
   * evolu.update(
   *   "todo",
   *   { id: todoId, title: "New title" },
   *   {
   *     onComplete: () => {
   *       console.log("Update completed");
   *     },
   *   },
   * );
   * ```
   */
  update: Mutation<S, "update">;

  /**
   * Upserts a row in the database and returns a {@link Result} with the existing
   * {@link Id}.
   *
   * The first argument is the table name, and the second is an object
   * containing the row data including the required `id` field. An optional
   * third argument provides mutation options including an `onComplete` callback
   * and `onlyValidate` flag.
   *
   * This function allows you to use custom IDs and optionally set `createdAt`,
   * which is useful for external systems, data migrations, or when the same row
   * may already be created on a different device.
   *
   * Returns a Result type - use `.ok` to check if the upsert succeeded, and
   * `.value.id` to access the ID on success, or `.error` to handle validation
   * errors.
   *
   * Evolu does not use SQL for mutations to ensure data can be safely and
   * predictably merged without conflicts. Explicit mutations also allow Evolu
   * to automatically add and update {@link DefaultColumns}.
   *
   * ### Example
   *
   * ```ts
   * // Use deterministic ID for stable upserts across devices
   * const stableId = createIdFromString("my-todo-1");
   *
   * const result = evolu.upsert("todo", {
   *   id: stableId,
   *   title: "Learn Evolu",
   *   isCompleted: false,
   * });
   *
   * if (result.ok) {
   *   console.log("Todo upserted with ID:", result.value.id);
   * } else {
   *   console.error("Validation error:", result.error);
   * }
   *
   * // Data migration with custom createdAt
   * evolu.upsert("todo", {
   *   id: externalId,
   *   title: "Migrated todo",
   *   createdAt: new Date("2023-01-01"), // Preserve original timestamp
   * });
   *
   * // With onComplete callback
   * evolu.upsert(
   *   "todo",
   *   { id: stableId, title: "Updated title" },
   *   {
   *     onComplete: () => {
   *       console.log("Upsert completed");
   *     },
   *   },
   * );
   * ```
   */
  upsert: Mutation<S, "upsert">;

  /**
   * Delete {@link AppOwner} and all their data from the current device. After
   * the deletion, Evolu will purge the application state. For browsers, this
   * will reload all tabs using Evolu. For native apps, it will restart the
   * app.
   *
   * Reloading can be turned off via options if you want to provide a different
   * UX.
   */
  readonly resetAppOwner: (options?: {
    readonly reload?: boolean;
  }) => Promise<void>;

  /**
   * Restore {@link AppOwner} with all their synced data. It uses
   * {@link Evolu#resetAppOwner}, so be careful.
   */
  readonly restoreAppOwner: (
    mnemonic: Mnemonic,
    options?: {
      readonly reload?: boolean;
    },
  ) => Promise<void>;

  /**
   * Reload the app in a platform-specific way. For browsers, this will reload
   * all tabs using Evolu. For native apps, it will restart the app.
   */
  readonly reloadApp: () => void;

  /** Export SQLite database file as Uint8Array. */
  readonly exportDatabase: () => Promise<Uint8Array<ArrayBuffer>>;

  /**
   * **⚠️ This API is not finished yet and is subject to change.**
   *
   * Use an owner. Using an owner means syncing it and subscribing to
   * broadcasted changes. Returns a function to stop using the owner.
   *
   * Transport connections are automatically deduplicated and reference-counted,
   * so multiple owners using the same transport will share a single
   * connection.
   *
   * ### Example
   *
   * ```ts
   * // Use an owner (starts syncing and subscribing to changes).
   * const unuse = evolu.useOwner(shardOwner);
   *
   * // Later, stop using the owner.
   * unuse();
   *
   * // Bulk operations.
   * const unuses = owners.map((owner) => evolu.useOwner(owner));
   * // Later: unuses.forEach(unuse => unuse());
   * ```
   */
  readonly useOwner: (owner: SyncOwner) => () => void;
}

/** Represents errors that can occur in Evolu. */
export type EvoluError =
  | ProtocolError
  | ProtocolUnsupportedVersionError
  | SqliteError
  | SymmetricCryptoDecryptError
  | TimestampError
  | TransferableError;

// /**
//  * Error reported when a message is invalid or rejected during processing.
//  *
//  * This error should never happen because a properly written app should ensure
//  * data correctness, but it can occur for two reasons:
//  *
//  * 1. An attack from someone who modified app code
//  * 2. A bug by the developer
//  *
//  * Both cases are useful to report for debugging and security monitoring.
//  */
// export interface OnMessageError {
//   readonly type: "OnMessageError";
//   readonly invalidChanges: ReadonlyArray<DbChange>;
//   readonly rejectedChanges: ReadonlyArray<DbChange>;
// }

interface InternalEvoluInstance<S extends EvoluSchema = EvoluSchema>
  extends Evolu<S> {
  /**
   * Ensure tables and columns defined in {@link EvoluSchema} exist in the
   * database. This function is for hot reloading.
   */
  readonly ensureSchema: (schema: EvoluSchema) => void;
}

export type EvoluDeps = ConsoleDep &
  CreateDbWorkerDep &
  LocalAuthDep &
  Partial<FlushSyncDep> &
  RandomBytesDep &
  ReloadAppDep &
  TimeDep;

// For hot reloading and Evolu multitenancy.
const evoluInstances = new Map<string, InternalEvoluInstance>();

let tabId: Id | null = null;

/**
 * Creates an {@link Evolu} instance configured with the specified
 * {@link EvoluSchema} and optional configuration.
 *
 * This function returns a configured Evolu instance, providing a typed
 * interface for querying, mutating, and syncing your application's data. The
 * returned instance includes:
 *
 * - Subscription methods for receiving updates on queries, the owner, errors, and
 *   sync state.
 * - Methods for creating, updating, or deleting rows in a type-safe manner.
 * - Methods for querying data using Evolu's typed SQL queries, leveraging Kysely
 *   under the hood.
 * - Built-in support for local-first and offline-first data with automatic sync
 *   and merging.
 * - Automatic schema evolution that updates the underlying database with new
 *   columns or tables.
 * - Managing owner data with {@link Evolu#resetAppOwner} and
 *   {@link Evolu#restoreAppOwner}.
 *
 * ### Example
 *
 * ```ts
 * const TodoId = id("Todo");
 * type TodoId = InferType<typeof TodoId>;
 *
 * const TodoCategoryId = id("TodoCategory");
 * type TodoCategoryId = InferType<typeof TodoCategoryId>;
 *
 * const NonEmptyString50 = maxLength(50, NonEmptyString);
 * type NonEmptyString50 = InferType<typeof NonEmptyString50>;
 *
 * const Schema = {
 *   todo: {
 *     id: TodoId,
 *     title: NonEmptyString1000,
 *     isCompleted: nullOr(SqliteBoolean),
 *     categoryId: nullOr(TodoCategoryId),
 *   },
 *   todoCategory: {
 *     id: TodoCategoryId,
 *     name: NonEmptyString50,
 *   },
 * };
 *
 * const evolu = createEvolu(evoluReactDeps)(Schema);
 * ```
 */
export const createEvolu =
  (deps: EvoluDeps) =>
  <S extends EvoluSchema>(
    schema: ValidateSchema<S> extends never ? S : ValidateSchema<S>,
    config?: EvoluConfig,
  ): Evolu<S> => {
    const name = config?.name ?? defaultDbConfig.name;
    let evolu = evoluInstances.get(name);

    if (evolu == null) {
      evolu = createEvoluInstance(deps)(schema as EvoluSchema, config);
      evoluInstances.set(name, evolu);
    } else {
      // Hot reloading. Note that indexes are intentionally omitted.
      evolu.ensureSchema(schema as EvoluSchema);
    }

    return evolu as Evolu<S>;
  };

const createEvoluInstance =
  (deps: EvoluDeps) =>
  (schema: EvoluSchema, config?: EvoluConfig): InternalEvoluInstance => {
    deps.console.enabled = config?.enableLogging ?? false;

    const { indexes, reloadUrl = "/", ...partialDbConfig } = config ?? {};

    const dbConfig: DbConfig = { ...defaultDbConfig, ...partialDbConfig };

    deps.console.log("[evolu]", "createEvoluInstance", {
      name: dbConfig.name,
    });

    const errorStore = createStore<EvoluError | null>(null);
    const rowsStore = createStore<QueryRowsMap>(new Map());

    const { promise: appOwner, resolve: resolveAppOwner } =
      Promise.withResolvers<AppOwner>();

    if (config?.externalAppOwner) {
      resolveAppOwner(config.externalAppOwner);
    }

    // TODO: Update it for the owner-api
    const _syncStore = createStore<SyncState>(initialSyncState);

    const subscribedQueries = createSubscribedQueries(rowsStore);
    const loadingPromises = createLoadingPromises(subscribedQueries);
    const onCompleteRegistry = createCallbackRegistry(deps);
    const exportRegistry =
      createCallbackRegistry<Uint8Array<ArrayBuffer>>(deps);

    const dbWorker = deps.createDbWorker(dbConfig.name);

    const getTabId = () => {
      tabId ??= createId(deps);
      return tabId;
    };

    // const createLocalOnly = (
    //   localMutations: Array<MutationChange>,
    //   defaultOwnerId: OwnerId | undefined,
    // ): LocalOnly<EvoluSchema> => ({
    //   insert: (table, values) => {
    //     const id = createId(deps);
    //     localMutations.push({
    //       table,
    //       id,
    //       values,
    //       ownerId: defaultOwnerId,
    //     });
    //     return id;
    //   },
    //   update: (table, values) => {
    //     const { id, ...rest } = values;
    //     localMutations.push({
    //       table,
    //       id: id as Id,
    //       values: rest,
    //       ownerId: defaultOwnerId,
    //     });
    //   },
    //   upsert: (table, values) => {
    //     const { id, ...rest } = values as Record<string, unknown> & { id: Id };
    //     localMutations.push({
    //       table,
    //       id: id,
    //       values: rest as MutationChange["values"],
    //       ownerId: defaultOwnerId,
    //     });
    //   },
    // });

    // Worker responses are delivered to all tabs. Each case must handle this
    // properly (e.g., AppOwner promise resolves only once, tabId filtering).
    dbWorker.onMessage((message) => {
      switch (message.type) {
        case "onError": {
          errorStore.set(message.error);
          break;
        }

        case "onGetAppOwner": {
          resolveAppOwner(message.appOwner);
          break;
        }

        case "onQueryPatches": {
          if (message.tabId !== getTabId()) return;

          const state = rowsStore.get();
          const nextState = new Map([
            ...state,
            ...message.queryPatches.map(
              ({ query, patches }): [Query, ReadonlyArray<Row>] => [
                query,
                applyPatches(patches, state.get(query) ?? emptyRows),
              ],
            ),
          ]);

          for (const { query } of message.queryPatches) {
            loadingPromises.resolve(query, nextState.get(query) ?? emptyRows);
          }

          if (deps.flushSync && message.onCompleteIds.length > 0) {
            deps.flushSync(() => {
              rowsStore.set(nextState);
            });
          } else {
            rowsStore.set(nextState);
          }

          for (const id of message.onCompleteIds) {
            onCompleteRegistry.execute(id);
          }
          break;
        }

        case "refreshQueries": {
          if (message.tabId && message.tabId === getTabId()) return;

          const loadingPromisesQueries = loadingPromises.getQueries();
          loadingPromises.releaseUnsubscribedOnMutation();

          const queries = [
            // Dedupe
            ...new Set([...loadingPromisesQueries, ...subscribedQueries.get()]),
          ];

          if (isNonEmptyReadonlyArray(queries)) {
            dbWorker.postMessage({ type: "query", tabId: getTabId(), queries });
          }

          break;
        }

        case "onReset": {
          if (message.reload) {
            deps.reloadApp(reloadUrl);
          } else {
            onCompleteRegistry.execute(message.onCompleteId);
          }
          break;
        }

        // case "processNewMessages": {
        //   void requestIdleTask(
        //     toTask(async () => {
        //       const approved: Array<Timestamp> = [];
        //       const invalidChanges: Array<DbChange> = [];
        //       const rejectedChanges: Array<DbChange> = [];
        //       const localMutations: Array<MutationChange> = [];

        //       for (const crdtMessage of message.messages) {
        //         let isApproved = true;
        //         let isValid = true;

        //         const table = crdtMessage.change.table;
        //         if (table in schema) {
        //           const { createdAt, ...values } = crdtMessage.change.values;
        //           isValid =
        //             (createdAt ? DateIso.is(createdAt) : true) &&
        //             getMutationType(table, "update").is({
        //               id: crdtMessage.change.id,
        //               ...values,
        //             });
        //         } else {
        //           isValid = false;
        //         }

        //         if (!isValid) {
        //           isApproved = false;
        //           invalidChanges.push(crdtMessage.change);
        //         } else if (onMessage) {
        //           // At this point, we've validated that the message conforms to the
        //           // schema, so the typed callback can safely process it.
        //           isApproved = await onMessage(crdtMessage.change, {
        //             ownerId: message.ownerId,
        //             localOnly: createLocalOnly(localMutations, message.ownerId),
        //           });
        //           if (!isApproved) {
        //             rejectedChanges.push(crdtMessage.change);
        //           }
        //         }

        //         if (isApproved) {
        //           approved.push(crdtMessage.timestamp);
        //         }
        //       }

        //       // Report OnMessageError if there were any invalid or rejected changes
        //       if (invalidChanges.length > 0 || rejectedChanges.length > 0) {
        //         const onMessageError: OnMessageError = {
        //           type: "OnMessageError",
        //           invalidChanges,
        //           rejectedChanges,
        //         };
        //         errorStore.set(onMessageError);
        //       }

        //       dbWorker.postMessage({
        //         type: "onProcessNewMessages",
        //         onCompleteId: message.onCompleteId,
        //         approved,
        //         localMutations,
        //       });

        //       return ok();
        //     }),
        //   )();
        //   break;
        // }

        case "onExport": {
          exportRegistry.execute(
            message.onCompleteId,
            message.file as Uint8Array<ArrayBuffer>,
          );
          break;
        }

        default:
          exhaustiveCheck(message);
      }
    });

    const dbSchema = evoluSchemaToDbSchema(schema, indexes);

    const mutationTypesCache = new Map<
      MutationKind,
      Map<string, ValidMutationSize<any>>
    >();

    // Lazy create mutation Types like this: `insertable(Schema.todo)`
    const getMutationType = (table: string, kind: MutationKind) => {
      let types = mutationTypesCache.get(kind);
      if (!types) {
        types = new Map();
        mutationTypesCache.set(kind, types);
      }
      let type = types.get(table);
      if (!type) {
        type = { insert: insertable, update: updateable, upsert: upsertable }[
          kind
        ](schema[table]);
        types.set(table, type);
      }
      return type;
    };

    dbWorker.postMessage({ type: "init", config: dbConfig, dbSchema });

    // We can't use `init` to get AppOwner because `init` runs only once per n tabs.
    dbWorker.postMessage({ type: "getAppOwner" });

    const loadQueryMicrotaskQueue: Array<Query> = [];

    const mutateMicrotaskQueue: Array<
      [MutationChange | null, MutationOptions["onComplete"] | undefined]
    > = [];

    const useOwnerMicrotaskQueue: Array<[SyncOwner, boolean, Uint8Array]> = [];

    const createMutation =
      <Kind extends MutationKind>(kind: Kind) =>
      <TableName extends keyof typeof schema>(
        table: TableName,
        props: InferInput<
          ObjectType<MutationMapping<(typeof schema)[TableName], Kind>>
        >,
        options?: MutationOptions,
      ): Result<
        { readonly id: InferType<(typeof schema)[TableName]["id"]> },
        | ValidMutationSizeError
        | InferErrors<
            ObjectType<MutationMapping<(typeof schema)[TableName], Kind>>
          >
      > => {
        const result = getMutationType(table, kind).fromUnknown(props);

        const id =
          kind === "insert"
            ? createId(deps)
            : (props as unknown as { id: Id }).id;

        if (options?.onlyValidate !== true) {
          if (!result.ok) {
            // Mark the transaction as invalid by pushing null
            mutateMicrotaskQueue.push([null, undefined]);
          } else {
            const values = { ...result.value };
            delete values.id;

            if (kind === "insert" || kind === "upsert") {
              // Only set createdAt if not provided by user
              if (!("createdAt" in values)) {
                values.createdAt = new Date(deps.time.now()).toISOString();
              }
            }

            const dbChange = { table, id, values };
            assert(
              DbChange.is(dbChange),
              `Failed to create DbChange for table "${dbChange.table}"`,
            );

            const mutationChange = { ...dbChange, ownerId: options?.ownerId };
            mutateMicrotaskQueue.push([mutationChange, options?.onComplete]);
          }

          if (mutateMicrotaskQueue.length === 1) {
            queueMicrotask(processMutationQueue);
          }
        }

        if (result.ok) return ok({ id });

        return err(
          result.error as
            | ValidMutationSizeError
            | InferErrors<
                ObjectType<MutationMapping<(typeof schema)[TableName], Kind>>
              >,
        );
      };

    const processMutationQueue = () => {
      const changes: Array<MutationChange> = [];
      const onCompleteCallbacks = [];

      for (const [change, onComplete] of mutateMicrotaskQueue) {
        if (change !== null) changes.push(change);
        if (onComplete) onCompleteCallbacks.push(onComplete);
      }

      const queueLength = mutateMicrotaskQueue.length;
      mutateMicrotaskQueue.length = 0;

      // Don't process any mutations if there was a validation error.
      // All mutations within a queue run as a single transaction.
      if (changes.length !== queueLength) {
        return;
      }

      const onCompleteIds = onCompleteCallbacks.map(
        onCompleteRegistry.register,
      );

      loadingPromises.releaseUnsubscribedOnMutation();

      if (!isNonEmptyArray(changes)) return;

      // if (onMessage) {
      //   const rejectedChanges: Array<DbChange> = [];
      //   const localMutations: Array<MutationChange> = [];

      //   for (const change of changes) {
      //     const localOnly = createLocalOnly(localMutations, change.ownerId);

      //     const isApproved = await onMessage(change, {
      //       ownerId: change.ownerId,
      //       localOnly,
      //     });
      //     if (!isApproved) {
      //       rejectedChanges.push(change);
      //     }
      //   }

      //   if (rejectedChanges.length > 0) {
      //     errorStore.set({
      //       type: "OnMessageError",
      //       invalidChanges: [],
      //       rejectedChanges,
      //     });
      //     return;
      //   }

      //   changes.push(...localMutations);
      // }

      dbWorker.postMessage({
        type: "mutate",
        tabId: getTabId(),
        changes,
        onCompleteIds,
        subscribedQueries: subscribedQueries.get(),
      });
    };

    const evolu: InternalEvoluInstance = {
      subscribeError: errorStore.subscribe,
      getError: errorStore.get,

      createQuery,

      loadQuery: <R extends Row>(query: Query<R>): Promise<QueryRows<R>> => {
        const { promise, isNew } = loadingPromises.get(query);

        if (isNew) {
          loadQueryMicrotaskQueue.push(query);
          if (loadQueryMicrotaskQueue.length === 1) {
            queueMicrotask(() => {
              // Dedupe
              const queries = [...new Set(loadQueryMicrotaskQueue)];
              loadQueryMicrotaskQueue.length = 0;
              assertNonEmptyArray(queries);
              deps.console.log("[evolu]", "loadQuery", { queries });
              dbWorker.postMessage({
                type: "query",
                tabId: getTabId(),
                queries,
              });
            });
          }
        }

        return promise;
      },

      loadQueries: <R extends Row, Q extends Queries<R>>(
        queries: [...Q],
      ): [...QueriesToQueryRowsPromises<Q>] =>
        queries.map(evolu.loadQuery) as [...QueriesToQueryRowsPromises<Q>],

      subscribeQuery: (query) => (listener) => {
        // Call the listener only if the result has been changed.
        let previousResult: unknown = null;
        const unsubscribe = subscribedQueries.subscribe(query)(() => {
          const result = evolu.getQueryRows(query);
          if (previousResult === result) return;
          previousResult = result;
          listener();
        });
        return () => {
          previousResult = null;
          unsubscribe();
        };
      },

      getQueryRows: <R extends Row>(query: Query<R>): QueryRows<R> =>
        (rowsStore.get().get(query) ?? emptyRows) as QueryRows<R>,

      appOwner,

      // TODO: Update it for the owner-api
      // subscribeSyncState: syncStore.subscribe,
      // getSyncState: syncStore.get,

      insert: createMutation("insert"),
      update: createMutation("update"),
      upsert: createMutation("upsert"),

      resetAppOwner: (options) => {
        const { promise, resolve } = Promise.withResolvers<undefined>();
        const onCompleteId = onCompleteRegistry.register(resolve);
        dbWorker.postMessage({
          type: "reset",
          onCompleteId,
          reload: options?.reload ?? true,
        });
        return promise;
      },

      restoreAppOwner: (mnemonic, options) => {
        const { promise, resolve } = Promise.withResolvers<undefined>();
        const onCompleteId = onCompleteRegistry.register(resolve);
        dbWorker.postMessage({
          type: "reset",
          onCompleteId,
          reload: options?.reload ?? true,
          restore: { mnemonic, dbSchema },
        });
        return promise;
      },

      reloadApp: () => {
        deps.reloadApp(reloadUrl);
      },

      ensureSchema: (schema) => {
        mutationTypesCache.clear();
        const dbSchema = evoluSchemaToDbSchema(schema);
        dbWorker.postMessage({ type: "ensureDbSchema", dbSchema });
      },

      exportDatabase: () => {
        const { promise, resolve } =
          Promise.withResolvers<Uint8Array<ArrayBuffer>>();
        const onCompleteId = exportRegistry.register(resolve);
        dbWorker.postMessage({ type: "export", onCompleteId });
        return promise;
      },

      useOwner: (owner) => {
        const scheduleOwnerQueueProcessing = () => {
          if (useOwnerMicrotaskQueue.length !== 1) return;
          queueMicrotask(() => {
            const queue = [...useOwnerMicrotaskQueue];
            useOwnerMicrotaskQueue.length = 0;

            const result: Array<[SyncOwner, boolean, Uint8Array]> = [];
            const skipIndices = new Set<number>();

            for (let i = 0; i < queue.length; i++) {
              if (skipIndices.has(i)) continue;

              const [currentOwner, currentUse, currentOwnerSerialized] =
                queue[i];

              // Look for opposite action with same owner
              for (let j = i + 1; j < queue.length; j++) {
                if (skipIndices.has(j)) continue;

                const [, otherUse, otherOwnerSerialized] = queue[j];

                if (
                  currentUse !== otherUse &&
                  eqArrayNumber(currentOwnerSerialized, otherOwnerSerialized)
                ) {
                  // Found cancel-out pair, skip both
                  skipIndices.add(i).add(j);
                  break;
                }
              }

              if (!skipIndices.has(i)) {
                result.push([currentOwner, currentUse, currentOwnerSerialized]);
              }
            }

            for (const [owner, use] of result) {
              dbWorker.postMessage({ type: "useOwner", owner, use });
            }
          });
        };

        useOwnerMicrotaskQueue.push([owner, true, pack(owner)]);
        scheduleOwnerQueueProcessing();

        const unuse = () => {
          useOwnerMicrotaskQueue.push([owner, false, pack(owner)]);
          scheduleOwnerQueueProcessing();
        };

        return unuse;
      },
    };

    return evolu;
  };

export const createQuery = <R extends Row>(
  queryCallback: Parameters<CreateQuery<EvoluSchema>>[0],
  options?: Parameters<CreateQuery<EvoluSchema>>[1],
): Query<R> => {
  const compiledQuery = queryCallback(kysely as IntentionalNever).compile();

  if (isSqlMutation(compiledQuery.sql))
    throw new Error(
      "SQL mutation (INSERT, UPDATE, DELETE, etc.) isn't allowed in the Evolu `createQuery` function. Kysely suggests it because there is no read-only Kysely yet, and removing such an API is not possible. For mutations, use Evolu Mutation API.",
    );

  return serializeQuery({
    sql: compiledQuery.sql as SafeSql,
    parameters: compiledQuery.parameters as NonNullable<
      SqliteQuery["parameters"]
    >,
    ...(options && { options }),
  });
};

interface LoadingPromises {
  get: <R extends Row>(
    query: Query<R>,
  ) => {
    readonly promise: Promise<QueryRows<R>>;
    readonly isNew: boolean;
  };

  /**
   * Resolve a cached promise with updated rows.
   *
   * If the promise is not yet fulfilled, it will be resolved normally. If
   * already fulfilled (subscribed query updated after mutation), the promise
   * property is replaced with a new `Promise.resolve(rows)` while keeping the
   * same cached object reference. The promise is not removed from the cache
   * because React Suspense requires repeated calls to return the same promise.
   */
  resolve: (query: Query, rows: ReadonlyArray<Row>) => void;

  /**
   * Release unsubscribed queries from the cache.
   *
   * Loading promises can't be released in `resolve` because they must be cached
   * for React Suspense, but they also can't be cached forever because only
   * subscribed queries are automatically updated (reactivity is expensive
   * because it's implemented via refetching subscribed queries).
   */
  releaseUnsubscribedOnMutation: () => void;

  getQueries: () => ReadonlyArray<Query>;
}

interface LoadingPromise {
  /** Promise with props for the React use hook. */
  promise: Promise<QueryRows> & {
    status?: "pending" | "fulfilled" | "rejected";
    value?: QueryRows;
    reason?: unknown;
  };
  resolve: (rows: QueryRows) => void;
  releaseOnResolve: boolean;
}

const createLoadingPromises = (
  subscribedQueries: SubscribedQueries,
): LoadingPromises => {
  const loadingPromiseMap = new Map<Query, LoadingPromise>();

  return {
    get: <R extends Row>(
      query: Query<R>,
    ): {
      readonly promise: Promise<QueryRows<R>>;
      readonly isNew: boolean;
    } => {
      let loadingPromise = loadingPromiseMap.get(query);
      const isNew = !loadingPromise;
      if (!loadingPromise) {
        const { promise, resolve } = Promise.withResolvers<QueryRows>();
        loadingPromise = { resolve, promise, releaseOnResolve: false };
        loadingPromiseMap.set(query, loadingPromise);
      }
      return {
        promise: loadingPromise.promise as Promise<QueryRows<R>>,
        isNew,
      };
    },

    resolve: (query, rows) => {
      const loadingPromise = loadingPromiseMap.get(query);
      if (!loadingPromise) return;

      if (loadingPromise.promise.status !== "fulfilled") {
        loadingPromise.resolve(rows);
      } else {
        loadingPromise.promise = Promise.resolve(rows);
      }

      // Set status and value fields for React's `use` Hook to unwrap synchronously.
      // While undocumented in React docs, React still uses these properties internally,
      // and Evolu's own promise caching logic depends on checking `promise.status`.
      // https://github.com/acdlite/rfcs/blob/first-class-promises/text/0000-first-class-support-for-promises.md
      void Object.assign(loadingPromise.promise, {
        status: "fulfilled",
        value: rows,
      });

      if (loadingPromise.releaseOnResolve) {
        loadingPromiseMap.delete(query);
      }
    },

    releaseUnsubscribedOnMutation: () => {
      [...loadingPromiseMap.entries()]
        .filter(([query]) => !subscribedQueries.has(query))
        .forEach(([query, loadingPromise]) => {
          if (loadingPromise.promise.status === "fulfilled") {
            loadingPromiseMap.delete(query);
          } else {
            loadingPromise.releaseOnResolve = true;
          }
        });
    },

    getQueries: () => Array.from(loadingPromiseMap.keys()),
  };
};
