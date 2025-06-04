import { isNonEmptyArray, isNonEmptyReadonlyArray } from "../Array.js";
import { assertNonEmptyArray } from "../Assert.js";
import { createCallbacks } from "../Callbacks.js";
import { ConsoleDep } from "../Console.js";
import { SymmetricCryptoDecryptError } from "../Crypto.js";
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
import { kysely } from "./Kysely.js";
import { AppOwner } from "./Owner.js";
import { CreateAppStateDep, FlushSyncDep } from "./Platform.js";
import {
  DbChange,
  ProtocolError,
  ProtocolUnsupportedVersionError,
} from "./Protocol.js";
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
  assertValidEvoluSchema,
  CreateQuery,
  EvoluSchema,
  insertable,
  Mutation,
  MutationKind,
  MutationMapping,
  MutationOptions,
  updateable,
  upsertable,
  validEvoluSchemaToDbSchema,
  ValidMutationSize,
  ValidMutationSizeError,
} from "./Schema.js";
import { initialSyncState, SyncState } from "./Sync.js";
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
   * For mutations, use {@link Evolu.insert} and {@link Evolu.update}.
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
   * {@link Evolu.subscribeError}.
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
   * to a query, use {@link Evolu.subscribeQuery}.
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
   * Inserts a row.
   *
   * ### Example
   *
   * ```ts
   * // TODO:
   * ```
   */
  insert: Mutation<S, "insert">;

  /**
   * Updates a row.
   *
   * ### Example
   *
   * ```ts
   * // TODO:
   * ```
   */
  update: Mutation<S, "update">;

  /**
   * Upserts a row.
   *
   * ### Example
   *
   * ```ts
   * // TODO:
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
   * {@link Evolu.resetAppOwner}, so be careful.
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
}

/** Represent errors that can occur in Evolu. */
export type EvoluError =
  | TimestampError
  | ProtocolError
  | TransferableError
  | SymmetricCryptoDecryptError
  | ProtocolUnsupportedVersionError
  | SqliteError;

interface InternalEvoluInstance<S extends EvoluSchema = EvoluSchema>
  extends Evolu<S> {
  /**
   * Ensure tables and columns defined in {@link EvoluSchema} exist in the
   * database. This function is for hot reloading.
   */
  readonly ensureSchema: (schema: EvoluSchema) => void;
}

export type EvoluDeps = CreateDbWorkerDep &
  TimeDep &
  NanoIdLibDep &
  Partial<FlushSyncDep> &
  ConsoleDep &
  CreateAppStateDep;

export interface EvoluConfigWithInitialData<S extends EvoluSchema = EvoluSchema>
  extends Config {
  /**
   * Use this option to create initial data (fixtures).
   *
   * ### Example
   *
   * ```ts
   * const evolu = createEvolu(evoluReactWebDeps)(Schema, {
   *   initialData: (evolu) => {
   *     const todoCategory = evolu.insert("todoCategory", {
   *       name: "Not Urgent",
   *     });
   *
   *     // This is a developer error, which should be fixed immediately.
   *     assert(todoCategory.ok, "invalid initial data");
   *
   *     evolu.insert("todo", {
   *       title: "Try React Suspense",
   *       categoryId: todoCategory.value.id,
   *     });
   *   },
   * });
   * ```
   */
  initialData?: (evolu: EvoluForInitialData<S>) => void;
}

export interface EvoluForInitialData<S extends EvoluSchema = EvoluSchema> {
  insert: Mutation<S, "insert">;
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
    // TODO: Validate missing Id, unsupported types, used default types via TS types
    // with type errors messages as we had it in the old Evolu.
    schema: S,
    partialConfig: Partial<EvoluConfigWithInitialData<S>> = {},
  ): Evolu<S> => {
    const config = { ...defaultConfig, ...partialConfig };

    let evolu = evoluInstances.get(config.name);

    if (evolu == null) {
      evolu = createEvoluInstance(deps)(schema, config as IntentionalNever);
      evoluInstances.set(config.name, evolu);
    } else {
      // Hot reloading. Note that indexes are intentionally omitted.
      evolu.ensureSchema(schema);
    }

    return evolu as IntentionalNever;
  };

const createEvoluInstance =
  (deps: EvoluDeps) =>
  (
    schema: EvoluSchema,
    evoluConfig: EvoluConfigWithInitialData,
  ): InternalEvoluInstance => {
    deps.console.enabled = evoluConfig.enableLogging ?? false;

    deps.console.log("[evolu]", "createEvoluInstance");

    const { initialData, indexes, ...config } = evoluConfig;

    const errorStore = createStore<EvoluError | null>(null);
    const rowsStore = createStore<QueryRowsMap>(new Map());
    const ownerStore = createStore<AppOwner | null>(null);
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
          ownerStore.set(message.owner);
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

    const dbSchema = validEvoluSchemaToDbSchema(
      assertValidEvoluSchema(schema),
      indexes,
    );

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

    const initialDataDbChanges: Array<DbChange> = [];

    /**
     * Note that the initial data function is called even if it is unnecessary
     * (initial data are already in the DB) because we don't want to wait for
     * SQLite's response. Initial data should be small (because they are inlined
     * in the code), so it's ok.
     */
    if (initialData)
      initialData({
        insert: (table, props) => {
          const Type = getMutationType(table, "insert");
          const id = createId(deps);

          const result = Type.fromUnknown(props);

          if (result.ok) {
            initialDataDbChanges.push({
              id,
              table,
              values: result.value,
            } as unknown as DbChange);
            return ok({ id });
          }

          return result;
        },
      });

    dbWorker.postMessage({
      type: "init",
      config,
      dbSchema,
      initialData: initialDataDbChanges,
    });

    const loadQueryMicrotaskQueue: Array<Query> = [];

    const mutateMicrotaskQueue: Array<
      [DbChange | undefined, MutationOptions["onComplete"] | undefined]
    > = [];

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
            // One error must invalidate the whole queue.
            // We insert `undefined` to detect such a situation.
            mutateMicrotaskQueue.push([undefined, undefined]);
          } else {
            // Remove `id` from values.
            const { id: _id, ...values } = result.value;
            // EvoluSchema Types ensure valid types.
            const change = { table, id, values } as unknown as DbChange;
            mutateMicrotaskQueue.push([change, options?.onComplete]);
          }

          if (mutateMicrotaskQueue.length === 1)
            queueMicrotask(() => {
              const changes = [];
              const onCompletes = [];

              for (const [change, onComplete] of mutateMicrotaskQueue) {
                if (change) changes.push(change);
                if (onComplete) onCompletes.push(onComplete);
              }

              const mutateMicrotaskQueueLength = mutateMicrotaskQueue.length;
              mutateMicrotaskQueue.length = 0;

              // Don't mutate anything if there was a validation error.
              // All mutations within a queue are considered to be a transaction.
              if (changes.length !== mutateMicrotaskQueueLength) {
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

      subscribeAppOwner: ownerStore.subscribe,
      getAppOwner: ownerStore.get,

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
        const validSchema = assertValidEvoluSchema(schema);
        dbWorker.postMessage({
          type: "ensureDbSchema",
          dbSchema: validEvoluSchemaToDbSchema(validSchema),
        });
      },

      exportDatabase: () => {
        const { promise, resolve } = Promise.withResolvers<Uint8Array>();
        const onCompleteId = callbacks.register((arg) => {
          if (arg instanceof Uint8Array) resolve(arg);
        });
        dbWorker.postMessage({ type: "export", onCompleteId });
        return promise;
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
