import { pack } from "msgpackr";
import { isNonEmptyArray, isNonEmptyReadonlyArray } from "../Array.js";
import { assert, assertNonEmptyArray } from "../Assert.js";
import { createCallbacks } from "../Callbacks.js";
import { ConsoleDep } from "../Console.js";
import { SymmetricCryptoDecryptError } from "../Crypto.js";
import { eqArrayNumber } from "../Eq.js";
import { TransferableError } from "../Error.js";
import { exhaustiveCheck } from "../Function.js";
import { NanoIdLibDep } from "../NanoId.js";
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
} from "../Type.js";
import { IntentionalNever } from "../Types.js";
import { Config, defaultConfig } from "./Config.js";
import { CreateDbWorkerDep } from "./Db.js";
import { applyPatches } from "./Diff.js";
import { AppOwner } from "./Owner.js";
import { CreateAppStateDep, FlushSyncDep } from "./Platform.js";
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
  ValidMutationSize,
  ValidMutationSizeError,
} from "./Schema.js";
import { DbChange } from "./Storage.js";
import { initialSyncState, SyncOwner, SyncState } from "./Sync.js";
import { TimestampError } from "./Timestamp.js";

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
   * For mutations, use {@link Evolu#insert} and {@link Evolu#update}.
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
   * A returned promise always resolves successfully because there is no reason
   * why loading should fail. All data are local, and the query is typed. A
   * serious unexpected Evolu error shall be handled with
   * {@link Evolu#subscribeError}.
   *
   * Loading is batched, and returned promises are cached, so there is no need
   * for an additional cache. Evolu's internal cache is invalidated on
   * mutation.
   *
   * The returned promise is enriched with special status and value properties
   * for the upcoming React `use` Hook, but other UI libraries can also leverage
   * them. Speaking of React, there are two essential React Suspense-related
   * patterns that every developer should be aware of—passing promises to
   * children and caching over mutations.
   *
   * With promises passed to children, we can load a query as soon as possible,
   * but we don't have to use the returned promise immediately. That's useful
   * for prefetching, which is generally not necessary for local-first apps but
   * can be if a query takes a long time to load.
   *
   * Caching over mutation is a pattern that every developer should know. As we
   * said, Evolu caches promise until a mutation happens. A query loaded after
   * that will return a new pending promise. That's okay for general usage but
   * not for UI with React Suspense because a mutation would suspend rerendered
   * queries on a page, and that's not a good UX.
   *
   * We call this pattern "caching over mutation" because it has no globally
   * accepted name yet. React RFC for React Cache does not exist yet.
   *
   * For better UX, a query must be subscribed for updates. This way, instead of
   * Suspense flashes, the user sees new data immediately because Evolu replaces
   * cached promises with fresh, already resolved new ones.
   *
   * If you are curious why Evolu does not do that for all queries by default,
   * the answer is simple: performance. Tracking changes is costly and
   * meaningful only for visible (hence subscribed) queries anyway. To subscribe
   * to a query, use {@link Evolu#subscribeQuery}.
   *
   * ### Example
   *
   * ```ts
   * const allTodos = evolu.createQuery((db) =>
   *   db.selectFrom("todo").selectAll(),
   * );
   * evolu.loadQuery(allTodos).then(({ rows }) => {
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
   * Subscribe to {@link AppOwner} changes.
   *
   * ### Example
   *
   * ```ts
   * const unsubscribe = evolu.subscribeAppOwner(() => {
   *   const owner = evolu.getAppOwner();
   * });
   * ```
   */
  readonly subscribeAppOwner: StoreSubscribe;

  /**
   * Get {@link AppOwner}.
   *
   * ### Example
   *
   * ```ts
   * const unsubscribe = evolu.subscribeAppOwner(() => {
   *   const owner = evolu.getAppOwner();
   * });
   * ```
   */
  readonly getAppOwner: () => AppOwner | null;

  /**
   * Subscribe to {@link SyncState} changes.
   *
   * ### Example
   *
   * ```ts
   * const unsubscribe = evolu.subscribeSyncState(() => {
   *   const syncState = evolu.getSyncState();
   * });
   * ```
   */
  readonly subscribeSyncState: StoreSubscribe;

  /**
   * Get {@link SyncState}.
   *
   * ### Example
   *
   * ```ts
   * const unsubscribe = evolu.subscribeSyncState(() => {
   *   const syncState = evolu.getSyncState();
   * });
   * ```
   */
  readonly getSyncState: () => SyncState;

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
  readonly exportDatabase: () => Promise<Uint8Array>;

  /**
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

/** Represent errors that can occur in Evolu. */
export type EvoluError =
  | ProtocolError
  | ProtocolUnsupportedVersionError
  | SqliteError
  | SymmetricCryptoDecryptError
  | TimestampError
  | TransferableError;

interface InternalEvoluInstance<S extends EvoluSchema = EvoluSchema>
  extends Evolu<S> {
  /**
   * Ensure tables and columns defined in {@link EvoluSchema} exist in the
   * database. This function is for hot reloading.
   */
  readonly ensureSchema: (schema: EvoluSchema) => void;
}

export type EvoluDeps = ConsoleDep &
  CreateAppStateDep &
  CreateDbWorkerDep &
  NanoIdLibDep &
  Partial<FlushSyncDep> &
  TimeDep;

export interface EvoluConfigWithFunctions extends Config {
  /**
   * Callback invoked when Evolu is successfully initialized.
   *
   * Useful for showing welcome messages and initial data seeding.
   *
   * ### Examples
   *
   * #### Welcome message
   *
   * ```ts
   * const evolu = createEvolu(evoluReactWebDeps)(Schema, {
   *   onInit: ({ isFirst }) => {
   *     // Show welcome message only once when DB is initialized on a device
   *     if (isFirst) {
   *       alert("Welcome to your new local-first app!");
   *     }
   *   },
   * });
   * ```
   *
   * #### Explicit initial data seeding
   *
   * When we know it's the first time the app is initialized (user clicked a
   * button), we can seed initial data on the device. When the user restores
   * their {@link AppOwner} on a different device (again, by clicking a button),
   * we should not use onInit at all to avoid data duplication.
   *
   * If we need to store device-specific information (whether an owner was
   * created, how many owners exist on the instance, etc.), we can use a
   * local-only Evolu instance.
   *
   * ```ts
   * // Local-only instance for device settings (no sync)
   * const deviceEvolu = createEvolu(evoluReactWebDeps)(DeviceSchema, {
   *   name: SimpleName.fromOrThrow("MyApp-Device"),
   *   transports: [], // No sync - stays local to device
   * });
   *
   * const createNewAppOwner = () => {
   *   const evolu = createEvolu(evoluReactWebDeps)(Schema, {
   *     onInit: () => {
   *       const todoCategoryId = getOrThrow(
   *         evolu.insert("todoCategory", {
   *           name: "Not Urgent",
   *         }),
   *       );
   *       evolu.insert("todo", {
   *         title: "Try React Suspense",
   *         categoryId: todoCategoryId.id,
   *       });
   *     },
   *   });
   * };
   *
   * const restoreAppOwner = () => {
   *   const evolu = createEvolu(evoluReactWebDeps)(Schema, {
   *     externalAppOwner: appOwner,
   *   });
   * };
   * ```
   *
   * #### Implicit initial data seeding
   *
   * If the {@link AppOwner} is always provided from an external source, and we
   * don't know whether we're creating or restoring it, and we still want
   * initial data, then we must upsert it with stable deterministic IDs derived
   * from the AppOwner.
   *
   * ```ts
   * const setupAppOwner = () => {
   *   const evolu = createEvolu(evoluReactWebDeps)(Schema, {
   *     externalAppOwner: appOwner,
   *     onInit: ({ appOwner }) => {
   *       // Derive deterministic ShardOwner for data
   *       // TODO:
   *     },
   *   });
   * };
   * ```
   */
  readonly onInit?: (params: {
    readonly appOwner: AppOwner;
    readonly isFirst: boolean;
  }) => void;
}

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
 * - Managing owner data with resetAppOwner and restoreAppOwner.
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
    partialConfig: Partial<EvoluConfigWithFunctions> = {},
  ): Evolu<S> => {
    const config = { ...defaultConfig, ...partialConfig };

    let evolu = evoluInstances.get(config.name);

    if (evolu == null) {
      evolu = createEvoluInstance(deps)(
        schema as EvoluSchema,
        config as IntentionalNever,
      );
      evoluInstances.set(config.name, evolu);
    } else {
      // Hot reloading. Note that indexes are intentionally omitted.
      evolu.ensureSchema(schema as EvoluSchema);
    }

    return evolu as IntentionalNever;
  };

const createEvoluInstance =
  (deps: EvoluDeps) =>
  (
    schema: EvoluSchema,
    evoluConfig: EvoluConfigWithFunctions,
  ): InternalEvoluInstance => {
    deps.console.enabled = evoluConfig.enableLogging ?? false;
    deps.console.log("[evolu]", "createEvoluInstance", {
      name: evoluConfig.name,
    });

    const { onInit, indexes, ...config } = evoluConfig;

    const errorStore = createStore<EvoluError | null>(null);
    const rowsStore = createStore<QueryRowsMap>(new Map());
    const appOwnerStore = createStore<AppOwner | null>(null);
    const syncStore = createStore<SyncState>(initialSyncState);

    const subscribedQueries = createSubscribedQueries(rowsStore);
    const loadingPromises = createLoadingPromises(subscribedQueries);
    const callbacks = createCallbacks(deps);

    const appState = deps.createAppState(config);
    const dbWorker = deps.createDbWorker(config.name);

    const getTabId = () => {
      tabId ??= createId(deps);
      return tabId;
    };

    dbWorker.onMessage((message) => {
      switch (message.type) {
        case "onInit": {
          appOwnerStore.set(message.appOwner);
          onInit?.({
            appOwner: message.appOwner,
            isFirst: message.isFirst,
          });
          break;
        }

        case "onError": {
          errorStore.set(message.error);
          break;
        }

        case "onChange": {
          if (message.tabId !== getTabId()) return;

          const state = rowsStore.get();
          const nextState = new Map([
            ...state,
            ...message.patches.map(
              ({ query, patches }): [Query, ReadonlyArray<Row>] => [
                query,
                applyPatches(patches, state.get(query) ?? emptyRows),
              ],
            ),
          ]);

          for (const { query } of message.patches) {
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
            callbacks.execute(id);
          }
          break;
        }

        case "onReceive": {
          if (message.tabId && message.tabId === getTabId()) return;

          loadingPromises.releaseUnsubscribed();
          const queries = subscribedQueries.get();
          if (isNonEmptyReadonlyArray(queries)) {
            dbWorker.postMessage({ type: "query", tabId: getTabId(), queries });
          }
          break;
        }

        case "onReset": {
          if (message.reload) {
            appState.reset();
          } else {
            callbacks.execute(message.onCompleteId);
          }
          break;
        }

        case "onExport": {
          callbacks.execute(message.onCompleteId, message.file);
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

    dbWorker.postMessage({
      type: "init",
      config,
      dbSchema,
    });

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
        const Type = getMutationType(table, kind);
        const result = Type.fromUnknown(props);

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

          if (mutateMicrotaskQueue.length === 1)
            queueMicrotask(() => {
              const changes: Array<MutationChange> = [];
              const onCompletes = [];

              for (const [change, onComplete] of mutateMicrotaskQueue) {
                if (change !== null) changes.push(change);
                if (onComplete) onCompletes.push(onComplete);
              }

              const queueLength = mutateMicrotaskQueue.length;
              mutateMicrotaskQueue.length = 0;

              // Don't execute any mutations if there was a validation error.
              // All mutations within a queue run as a single transaction.
              if (changes.length !== queueLength) {
                return;
              }

              const onCompleteIds = onCompletes.map((onComplete) =>
                callbacks.register(onComplete),
              );

              loadingPromises.releaseUnsubscribed();

              if (isNonEmptyArray(changes))
                dbWorker.postMessage({
                  type: "mutate",
                  tabId: getTabId(),
                  changes,
                  onCompleteIds,
                  subscribedQueries: subscribedQueries.get(),
                });
            });
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

    const evolu: InternalEvoluInstance = {
      subscribeError: errorStore.subscribe,
      getError: errorStore.get,

      createQuery: (queryCallback, options) => {
        const compiledQuery = queryCallback(
          kysely as IntentionalNever,
        ).compile();

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
      },

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

      subscribeAppOwner: appOwnerStore.subscribe,
      getAppOwner: appOwnerStore.get,

      subscribeSyncState: syncStore.subscribe,
      getSyncState: syncStore.get,

      insert: createMutation("insert"),
      update: createMutation("update"),
      upsert: createMutation("upsert"),

      resetAppOwner: (options) => {
        // Eslint bug, Promise<void> is correct by docs.
        // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
        const { promise, resolve } = Promise.withResolvers<void>();
        const onCompleteId = callbacks.register(() => {
          resolve();
        });
        dbWorker.postMessage({
          type: "reset",
          onCompleteId,
          reload: options?.reload ?? true,
        });
        return promise;
      },

      restoreAppOwner: (mnemonic, options) => {
        // Eslint bug, Promise<void> is correct by docs.
        // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
        const { promise, resolve } = Promise.withResolvers<void>();
        const onCompleteId = callbacks.register(() => {
          resolve();
        });

        dbWorker.postMessage({
          type: "reset",
          onCompleteId,
          reload: options?.reload ?? true,
          restore: { mnemonic, dbSchema },
        });
        return promise;
      },

      reloadApp: () => {
        appState.reset();
      },

      ensureSchema: (schema) => {
        mutationTypesCache.clear();
        const dbSchema = evoluSchemaToDbSchema(schema);
        dbWorker.postMessage({ type: "ensureDbSchema", dbSchema });
      },

      exportDatabase: () => {
        const { promise, resolve } = Promise.withResolvers<Uint8Array>();
        const onCompleteId = callbacks.register((arg) => {
          if (arg instanceof Uint8Array) resolve(arg);
        });
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

export const createNamespaceName =
  (config: Config) =>
  (name: string): string =>
    `evolu:${config.name}:${name}`;

interface LoadingPromises {
  get: <R extends Row>(
    query: Query<R>,
  ) => {
    readonly promise: Promise<QueryRows<R>>;
    readonly isNew: boolean;
  };

  resolve: (query: Query, rows: ReadonlyArray<Row>) => void;

  releaseUnsubscribed: () => void;
}

interface LoadingPromise {
  /** Promise with props for the upcoming React use hook. */
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

  const loadingPromises: LoadingPromises = {
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
        // A promise can't be fulfilled 2x, so we need a new one.
        loadingPromise.promise = Promise.resolve(rows);
      }

      /**
       * "For example, a data framework can set the status and value fields on a
       * promise preemptively, before passing to React, so that React can unwrap
       * it without waiting a microtask."
       * https://github.com/acdlite/rfcs/blob/first-class-promises/text/0000-first-class-support-for-promises.md
       */
      void Object.assign(loadingPromise.promise, {
        status: "fulfilled",
        value: rows,
      });

      if (loadingPromise.releaseOnResolve) {
        loadingPromiseMap.delete(query);
      }
    },

    /**
     * We can't delete loading promises in `resolveLoadingPromises` because they
     * must be cached, so repeated calls to `loadQuery` will always return the
     * same promise until the data changes, and we also can't cache them forever
     * because only subscribed queries are automatically updated (reactivity is
     * expensive) hence this function must be called manually on any mutation.
     */
    releaseUnsubscribed: () => {
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
  };

  return loadingPromises;
};
