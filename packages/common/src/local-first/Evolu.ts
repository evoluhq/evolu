/**
 * Local-first platform.
 *
 * @module
 */

import { mapArray } from "../Array.js";
import { assert } from "../Assert.js";
import { createCallbacks } from "../Callbacks.js";
import type { ConsoleDep } from "../Console.js";
import { createConsole } from "../Console.js";
import { createUnknownError } from "../Error.js";
import { exhaustiveCheck, todo } from "../Function.js";
import type { Listener, Unsubscribe } from "../Listeners.js";
import { createMicrotaskBatch } from "../Microtask.js";
import type { FlushSyncDep, ReloadAppDep } from "../Platform.js";
import { createRefCount } from "../RefCount.js";
import { err, ok } from "../Result.js";
import { SqliteBoolean, sqliteBooleanToBoolean } from "../Sqlite.js";
import type { ReadonlyStore } from "../Store.js";
import { createStore } from "../Store.js";
import type { Task } from "../Task.js";
import type { Id, TypeError } from "../Type.js";
import {
  brand,
  createId,
  createIdFromString,
  Name,
  UrlSafeString,
} from "../Type.js";
import type { CreateMessageChannelDep } from "../Worker.js";
import type { CreateDbWorkerDep } from "./Db.js";
import type { EvoluError } from "./Error.js";
import type { AppOwner, OwnerTransport } from "./Owner.js";
import {
  createAppOwner,
  createOwnerSecret,
  createOwnerWebSocketTransport,
  OwnerId,
} from "./Owner.js";
import type {
  Queries,
  QueriesToQueryRowsPromises,
  Query,
  QueryRows,
  QueryRowsMap,
  Row,
} from "./Query.js";
import type {
  EvoluSchema,
  IndexesConfig,
  Mutation,
  MutationChange,
  ValidateSchema,
} from "./Schema.js";
import type { EvoluInput, EvoluTabOutput, SharedWorkerDep } from "./Shared.js";
import { DbChange } from "./Storage.js";
import type { SyncOwner } from "./Sync.js";
import type { Timestamp } from "./Timestamp.js";

export interface EvoluConfig {
  /**
   * The app name. Evolu is multitenant - it can run multiple instances
   * concurrently. The same app can have multiple instances for different
   * accounts.
   *
   * Evolu derives the final instance name from `appName` and `appOwner`. The
   * derived instance name is used as the SQLite database filename and as the
   * log prefix. This ensures that each owner gets a separate local database
   * while preserving a readable app prefix.
   *
   * ### Example
   *
   * ```ts
   * // appName: AppName.orThrow("MyApp")
   * ```
   */
  readonly appName: AppName;

  /**
   * External AppOwner to use when creating Evolu instance. Use this when you
   * want to manage AppOwner creation and persistence externally (e.g., with
   * your own authentication system). If omitted, Evolu will automatically
   * create and persist an AppOwner locally.
   *
   * For device-specific settings and account management state, we can use a
   * separate local-only Evolu instance via `transports: []`.
   *
   * ### Example
   *
   * Use `appOwner` when restoring or switching owners managed by your app.
   */
  readonly appOwner?: AppOwner;

  /**
   * Transport configuration for data sync and backup. Supports single transport
   * or multiple transports simultaneously for redundancy.
   *
   * **Redundancy:** The ideal setup uses at least two completely independent
   * relays - for example, a home relay and a geographically separate relay.
   * Data is sent to both relays simultaneously, providing true redundancy
   * similar to using two independent clouds. This eliminates vendor lock-in and
   * ensures your app continues working regardless of circumstances - whether
   * home relay hardware is stolen or a remote relay provider shuts down.
   *
   * Currently supports:
   *
   * - WebSocket: Real-time bidirectional communication with relay servers
   *
   * Empty transports create local-only instances. Transports can be dynamically
   * added and removed for any owner (including {@link AppOwner}) via
   * {@link Evolu.useOwner}.
   *
   * Use {@link createOwnerWebSocketTransport} to create WebSocket transport
   * configurations with proper URL formatting and {@link OwnerId} inclusion. The
   * {@link OwnerId} in the URL enables relay authentication, allowing relay
   * servers to control access (e.g., for paid tiers or private instances).
   *
   * The default value is:
   *
   * `{ type: "WebSocket", url: "wss://free.evoluhq.com" }`.
   *
   * ### Example
   *
   * ```ts
   * // Single WebSocket relay
   * transports: [{ type: "WebSocket", url: "wss://relay1.example.com" }];
   *
   * // Multiple WebSocket relays for redundancy
   * transports: [
   *   { type: "WebSocket", url: "wss://relay1.example.com" },
   *   { type: "WebSocket", url: "wss://relay2.example.com" },
   *   { type: "WebSocket", url: "wss://relay3.example.com" },
   * ];
   *
   * // Local-only instance (no sync) - useful for device settings or when relay
   * // URL will be provided later (e.g., after authentication), allowing users
   * // to work offline before the app connects
   * transports: [];
   *
   * // Using createOwnerWebSocketTransport helper for relay authentication
   * transports: [
   *   createOwnerWebSocketTransport({
   *     url: "ws://localhost:4000",
   *     ownerId,
   *   }),
   * ];
   * ```
   */
  readonly transports?: ReadonlyArray<OwnerTransport>;

  /**
   * Use in-memory SQLite database instead of persistent storage. Useful for
   * testing or temporary data that doesn't need persistence.
   *
   * In-memory databases exist only in RAM and are completely destroyed when the
   * process ends, making them forensically safe for sensitive data.
   *
   * The default value is: `false`.
   */
  readonly inMemory?: boolean;

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

  // /**
  //  * URL to reload browser tabs after reset or restore.
  //  *
  //  * The default value is `/`.
  //  */
  // readonly reloadAppUrl?: string;
}

/**
 * Application name.
 *
 * Evolu uses AppName as the base prefix for {@link Evolu.name}. The final
 * instance name is derived per {@link AppOwner} as
 * `${appName}-${createIdFromString(appOwner.id)}`.
 *
 * Uses the same safe alphabet as {@link UrlSafeString} (letters, digits, `-`,
 * `_`) and must be between 1 and 41 characters.
 */
export const AppName = /*#__PURE__*/ brand("AppName", UrlSafeString, (value) =>
  value.length >= 1 && value.length <= 41
    ? ok(value)
    : err<AppNameError>({ type: "AppName", value }),
);
export type AppName = typeof AppName.Type;
export interface AppNameError extends TypeError<"AppName"> {}

/**
 * Local-first SQL database with typed queries, mutations, and sync.
 *
 * TODO: Better docs.
 */
export interface Evolu<
  S extends EvoluSchema = EvoluSchema,
> extends AsyncDisposable {
  /**
   * Resolved instance name derived from {@link EvoluConfig.appName} and app
   * owner hash.
   */
  readonly name: Name;

  /** {@link AppOwner}. */
  readonly appOwner: AppOwner;

  /**
   * Load {@link Query} and return a promise with {@link QueryRows}.
   *
   * The returned promise always resolves successfully because there is no
   * reason why loading should fail. All data are local, and the query is
   * typed.
   *
   * Loading is batched, and returned promises are cached until resolved to
   * prevent redundant database queries and to support React Suspense (which
   * requires stable promise references while pending).
   *
   * To subscribe a query for automatic updates, use
   * {@link Evolu.subscribeQuery}.
   *
   * ### Example
   *
   * ```ts
   * const createQuery = createQueryBuilder(Schema);
   * const allTodos = createQuery((db) =>
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
  readonly subscribeQuery: (
    query: Query,
  ) => (listener: Listener) => Unsubscribe;

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
   * Inserts a row and returns the generated {@link Id}.
   *
   * All non-nullable columns are required, nullable columns are optional, and
   * `id` is omitted because Evolu generates it automatically. This ensures
   * every row has a globally unique, conflict-free identifier without
   * coordination.
   *
   * ### Example
   *
   * ```ts
   * const { id } = evolu.insert("todo", {
   *   title: NonEmptyString100.orThrow("Learn Evolu"),
   * });
   *
   * // With onComplete callback
   * evolu.insert(
   *   "todo",
   *   { title: NonEmptyString100.orThrow("Another todo") },
   *   { onComplete: () => console.log("Insert completed") },
   * );
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
   * const { id } = evolu.update("todo", {
   *   id: todoId,
   *   title: NonEmptyString100.orThrow("Updated title"),
   * });
   *
   * // Soft delete
   * evolu.update("todo", { id: todoId, isDeleted: sqliteTrue });
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
   * `createdAt` and `updatedAt` cannot be set manually. Evolu derives both from
   * the CRDT {@link Timestamp} — they share the same value, encoded once to
   * avoid redundancy. Timestamps are always generated by Evolu to preserve CRDT
   * consistency guarantees.
   *
   * ### Example
   *
   * ```ts
   * const stableId = createIdFromString("my-todo-1");
   * const { id } = evolu.upsert("todo", {
   *   id: stableId,
   *   title: NonEmptyString100.orThrow("Learn Evolu"),
   * });
   * ```
   *
   * @see {@link Mutation}
   */
  readonly upsert: Mutation<S, "upsert">;

  /**
   * // TODO: Ten naming je furt divnej, syncOwner? subscribeOwner? // hmm, use
   * je ale ok, cleanup vracet teda? uvidime.
   *
   * Use a {@link SyncOwner}. Returns a {@link UnuseOwner}.
   *
   * Using an owner means syncing it with its transports, or the transports
   * defined in Evolu config if the owner has no transports defined.
   *
   * Transport are automatically deduplicated and reference-counted, so multiple
   * owners using the same transport will share a single connection.
   *
   * ### Example
   *
   * ```ts
   * // Use an owner (starts syncing).
   * const unuseOwner = evolu.useOwner(shardOwner);
   *
   * // Later, stop using the owner.
   * unuseOwner();
   *
   * // Bulk operations.
   * const unuseOwners = owners.map(evolu.useOwner);
   * // Later: for (const unuse of unuseOwners) unuse();
   * ```
   */
  readonly useOwner: (owner: SyncOwner) => UnuseOwner;
}

/** Function returned by {@link Evolu.useOwner} to stop using an {@link SyncOwner}. */
export type UnuseOwner = () => void;

export interface EvoluErrorDep {
  readonly evoluError: ReadonlyStore<EvoluError | null>;
}

export type EvoluDeps = EvoluPlatformDeps & EvoluErrorDep & Disposable;

export type EvoluPlatformDeps = CreateDbWorkerDep &
  CreateMessageChannelDep &
  ReloadAppDep &
  SharedWorkerDep &
  Partial<ConsoleDep> &
  Partial<FlushSyncDep>;

/**
 * Creates shared dependencies used by all {@link createEvolu} instances on a
 * platform.
 *
 * Call this once per platform and reuse the returned deps when creating
 * multiple Evolu instances. The returned deps object owns long-lived resources
 * such as worker channels and the shared {@link EvoluErrorDep.evoluError}
 * store.
 *
 * Dispose it only during app shutdown.
 */
export const createEvoluDeps = (deps: EvoluPlatformDeps): EvoluDeps => {
  const { createMessageChannel, sharedWorker } = deps;
  const console = deps.console ?? createConsole();

  const stack = new DisposableStack();
  stack.use(sharedWorker);
  const evoluError = stack.use(createStore<EvoluError | null>(null));

  const tabChannel = stack.use(createMessageChannel<EvoluTabOutput>());
  tabChannel.port2.onMessage = (output) => {
    switch (output.type) {
      case "ConsoleEntry":
        console.write(output.entry);
        // Fallback channel for unexpected errors without EvoluError typing.
        if (output.entry.method === "error") {
          evoluError.set(createUnknownError(output.entry.args));
        }
        break;
      case "EvoluError":
        evoluError.set(output.error);
        // Keep typed errors visible in logs as operational failures.
        console.error(output.error);
        break;
      default:
        exhaustiveCheck(output);
    }
  };

  sharedWorker.port.postMessage(
    { type: "InitTab", port: tabChannel.port1.native },
    [tabChannel.port1.native],
  );

  const moved = stack.move();

  return {
    ...deps,
    evoluError,
    [Symbol.dispose]: () => moved.dispose(),
  };
};

/**
 * Creates an {@link Evolu} instance from {@link EvoluSchema} and
 * {@link EvoluConfig}.
 */
export const createEvolu =
  <S extends EvoluSchema>(
    _schema: ValidateSchema<S> extends never ? S : ValidateSchema<S>,
    config: EvoluConfig,
  ): Task<Evolu<S>, never, EvoluPlatformDeps> =>
  async (run) => {
    const { createDbWorker, createMessageChannel, sharedWorker } = run.deps;

    const { appName, appOwner = createAppOwner(createOwnerSecret(run.deps)) } =
      config;
    const name = Name.orThrow(`${appName}-${createIdFromString(appOwner.id)}`);
    const console = run.deps.console.child(name).child("Evolu");
    console.info("createEvolu", { config });

    const _rowsStore = createStore<QueryRowsMap>(new Map());
    const subscribedQueriesRefCount = createRefCount<Query>();
    const onCompleteCallbacks = createCallbacks(run.deps);

    await using stack = run.stack();

    const dbWorker = stack.use(createDbWorker());
    dbWorker.postMessage({ type: "init", name });

    const {
      port1: { postMessage },
      port2,
    } = stack.use(createMessageChannel<EvoluInput>());

    sharedWorker.port.postMessage({ type: "InitEvolu", port: port2.native }, [
      port2.native,
    ]);

    const mutateBatch = createMicrotaskBatch<{
      readonly change: MutationChange;
      readonly onComplete: (() => void) | undefined;
    }>((items) => {
      postMessage({
        type: "mutate",
        changes: mapArray(items, (item) => item.change),
        onCompleteIds: items.flatMap((item) =>
          item.onComplete
            ? [onCompleteCallbacks.register(item.onComplete)]
            : [],
        ),
        subscribedQueries: [...subscribedQueriesRefCount.keys()],
      });
    });

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
          isInsert: kind === "insert" || kind === "upsert",
          isDelete: SqliteBoolean.is(isDeleted)
            ? sqliteBooleanToBoolean(isDeleted)
            : null,
        };

        assert(
          DbChange.is(dbChange),
          `Invalid DbChange for table '${String(table)}'.`,
        );

        mutateBatch.push({
          change: { ...dbChange, ownerId: options?.ownerId },
          onComplete: options?.onComplete,
        });

        return { id };
      };

    const moved = stack.move();

    return ok({
      name,
      appOwner,

      loadQuery: todo,
      loadQueries: todo,
      subscribeQuery: todo,
      getQueryRows: todo,
      insert: createMutation("insert"),
      update: createMutation("update"),
      upsert: createMutation("upsert"),
      useOwner: todo,

      [Symbol.asyncDispose]: () => moved.disposeAsync(),
    } as Evolu<S>);
  };

// export interface ErrorStoreDep {
//   /**
//    * Shared error store for all Evolu instances. Subscribe once to handle errors
//    * globally across all instances.
//    *
//    * ### Example
//    *
//    * ```ts
//    * deps.evoluError.subscribe(() => {
//    *   const error = deps.evoluError.get();
//    *   if (!error) return;
//    *   console.error(error);
//    * });
//    * ```
//    */
//   readonly evoluError: ReadonlyStore<EvoluError | null>;
// }

// const createErrorStore = (
//   deps: CreateMessageChannelDep & SharedWorkerDep & DisposableStackDep,
// ): Store<EvoluError | null> => {
//   const errorChannel = deps.disposableStack.use(
//     deps.createMessageChannel<EvoluError>(),
//   );
//   const evoluError = deps.disposableStack.use(
//     createStore<EvoluError | null>(null),
//   );

//   deps.sharedWorker.port.postMessage(
//     { type: "InitErrorStore", port: errorChannel.port1.native },
//     [errorChannel.port1.native],
//   );

//   errorChannel.port2.onMessage = (error) => {
//     evoluError.set(error);
//   };

//   return evoluError;
// };

// /**
//  * Creates an {@link Evolu} instance for a platform configured with the specified
//  * {@link EvoluSchema} and optional {@link EvoluConfig} providing a typed
//  * interface for querying, mutating, and syncing data.
//  *
//  * ### Example
//  *
//  * ```ts
//  * const TodoId = id("Todo");
//  * type TodoId = InferType<typeof TodoId>;
//  *
//  * const TodoCategoryId = id("TodoCategory");
//  * type TodoCategoryId = InferType<typeof TodoCategoryId>;
//  *
//  * const NonEmptyString50 = maxLength(50, NonEmptyString);
//  * type NonEmptyString50 = InferType<typeof NonEmptyString50>;
//  *
//  * const Schema = {
//  *   todo: {
//  *     id: TodoId,
//  *     title: NonEmptyString1000,
//  *     isCompleted: nullOr(SqliteBoolean),
//  *     categoryId: nullOr(TodoCategoryId),
//  *   },
//  *   todoCategory: {
//  *     id: TodoCategoryId,
//  *     name: NonEmptyString50,
//  *   },
//  * };
//  *
//  * const evolu = createEvolu(evoluReactDeps)(Schema);
//  * ```
//  */
// export const createEvolu =
//   (deps: EvoluDeps) =>
//   <S extends EvoluSchema>(
//     schema: ValidateSchema<S> extends never ? S : ValidateSchema<S>,
//     {
//       name,
//       // TODO:
//       transports: _transports = [
//         { type: "WebSocket", url: "wss://free.evoluhq.com" },
//       ],
//       externalAppOwner,
//       inMemory: _inMemory,
//       indexes: _indexes,
//     }: EvoluConfig,
//   ): Evolu<S> => {
//     // Cast schema to S since ValidateSchema ensures type safety at compile time.
//     // At runtime, schema is always valid because invalid schemas are compile errors.
//     const validSchema = schema as S;

//     const errorStore = createStore<EvoluError | null>(null);
//     const rowsStore = createStore<QueryRowsMap>(new Map());
//     const subscribedQueries = createSubscribedQueries(rowsStore);
//     const loadingPromises = createLoadingPromises(subscribedQueries);
//     const onCompleteCallbacks = createCallbacks(deps);
//     const exportCallbacks = createCallbacks<Uint8Array<ArrayBuffer>>(deps);

//     const loadQueryMicrotaskQueue: Array<Query> = [];
//     const useOwnerMicrotaskQueue: Array<[SyncOwner, boolean, Uint8Array]> = [];

//     const { promise: appOwner, resolve: resolveAppOwner } =
//       Promise.withResolvers<AppOwner>();
//     if (externalAppOwner) resolveAppOwner(externalAppOwner);

//     // deps.sharedWorker.

//     // const schema = _schema as EvoluSchema;

//     // const { indexes, reloadUrl = "/", ...partialDbConfig } = config ?? {};

//     // const dbConfig: DbConfig = { ...defaultDbConfig, ...partialDbConfig };

//     // deps.console.log("[evolu]", "createEvoluInstance", {
//     //   name: dbConfig.name,
//     // });

//     // // TODO: Update it for the owner-api
//     // const _syncStore = createStore<SyncState>(initialSyncState);

//     // const dbWorker = deps.createDbWorker(dbConfig.name);

//     // const getTabId = () => {
//     //   tabId ??= createId(deps);
//     //   return tabId;
//     // };

//     // // Worker responses are delivered to all tabs. Each case must handle this
//     // // properly (e.g., AppOwner promise resolves only once, tabId filtering).
//     // dbWorker.onMessage((message) => {
//     //   switch (message.type) {
//     //     case "onError": {
//     //       errorStore.set(message.error);
//     //       break;
//     //     }

//     //     case "onGetAppOwner": {
//     //       resolveAppOwner(message.appOwner);
//     //       break;
//     //     }

//     //     case "onQueryPatches": {
//     //       if (message.tabId !== getTabId()) return;

//     //       const state = rowsStore.get();
//     //       const nextState = new Map([
//     //         ...state,
//     //         ...message.queryPatches.map(
//     //           ({ query, patches }): [Query, ReadonlyArray<Row>] => [
//     //             query,
//     //             applyPatches(patches, state.get(query) ?? emptyRows),
//     //           ],
//     //         ),
//     //       ]);

//     //       for (const { query } of message.queryPatches) {
//     //         loadingPromises.resolve(query, nextState.get(query) ?? emptyRows);
//     //       }

//     //       if (deps.flushSync && message.onCompleteIds.length > 0) {
//     //         deps.flushSync(() => {
//     //           rowsStore.set(nextState);
//     //         });
//     //       } else {
//     //         rowsStore.set(nextState);
//     //       }

//     //       for (const id of message.onCompleteIds) {
//     //         onCompleteCallbacks.execute(id);
//     //       }
//     //       break;
//     //     }

//     //     case "refreshQueries": {
//     //       if (message.tabId && message.tabId === getTabId()) return;

//     //       const loadingPromisesQueries = loadingPromises.getQueries();
//     //       loadingPromises.releaseUnsubscribedOnMutation();

//     //       const queries = dedupeArray([
//     //         ...loadingPromisesQueries,
//     //         ...subscribedQueries.get(),
//     //       ]);

//     //       if (isNonEmptyArray(queries)) {
//     //         dbWorker.postMessage({ type: "query", tabId: getTabId(), queries });
//     //       }

//     //       break;
//     //     }

//     //     case "onReset": {
//     //       if (message.reload) {
//     //         deps.reloadApp(reloadUrl);
//     //       } else {
//     //         onCompleteCallbacks.execute(message.onCompleteId);
//     //       }
//     //       break;
//     //     }

//     //     case "onExport": {
//     //       exportCallbacks.execute(
//     //         message.onCompleteId,
//     //         message.file as Uint8Array<ArrayBuffer>,
//     //       );
//     //       break;
//     //     }

//     //     default:
//     //       exhaustiveCheck(message);
//     //   }
//     // });

//     // const dbSchema = evoluSchemaToDbSchema(schema, indexes);

//     const mutationTypesCache = new Map<
//       MutationKind,
//       Map<string, ObjectType<Record<string, AnyType>>>
//     >();

//     // Lazy create mutation Types like this: `insertable(Schema.todo)`
//     const getMutationType = (table: string, kind: MutationKind) => {
//       let types = mutationTypesCache.get(kind);
//       if (!types) {
//         types = new Map();
//         mutationTypesCache.set(kind, types);
//       }
//       let type = types.get(table);
//       if (!type) {
//         type = { insert: insertable, update: updateable, upsert: upsertable }[
//           kind
//         ](validSchema[table]);
//         types.set(table, type);
//       }
//       return type;
//     };

//     // dbWorker.postMessage({ type: "init", config: dbConfig, dbSchema });

//     // // We can't use `init` to get AppOwner because `init` runs only once per n tabs.
//     // dbWorker.postMessage({ type: "getAppOwner" });

//     const mutateMicrotaskQueue: Array<
//       [MutationChange | null, MutationOptions["onComplete"] | undefined]
//     > = [];

//     const createMutation =
//       <Kind extends MutationKind>(kind: Kind): Mutation<S, Kind> =>
//       <TableName extends keyof S>(
//         table: TableName,
//         props: InferInput<ObjectType<MutationMapping<S[TableName], Kind>>>,
//         options?: MutationOptions,
//       ): Result<
//         { readonly id: S[TableName]["id"]["Type"] },
//         InferErrors<ObjectType<MutationMapping<S[TableName], Kind>>>
//       > => {
//         const result = getMutationType(table as string, kind).fromUnknown(
//           props,
//         );

//         const id =
//           kind === "insert"
//             ? createId(deps)
//             : (props as unknown as { id: Id }).id;

//         if (options?.onlyValidate !== true) {
//           if (!result.ok) {
//             // Mark the transaction as invalid by pushing null
//             mutateMicrotaskQueue.push([null, undefined]);
//           } else {
//             const { id: _, isDeleted, ...values } = result.value;

//             const dbChange = {
//               table: table as string,
//               id,
//               values,
//               isInsert: kind === "insert" || kind === "upsert",
//               isDelete: SqliteBoolean.is(isDeleted)
//                 ? sqliteBooleanToBoolean(isDeleted)
//                 : null,
//             };

//             assert(
//               DbChange.is(dbChange),
//               `Invalid DbChange for table '${String(table)}': Please check schema type errors.`,
//             );

//             mutateMicrotaskQueue.push([
//               { ...dbChange, ownerId: options?.ownerId },
//               options?.onComplete,
//             ]);
//           }

//           if (mutateMicrotaskQueue.length === 1) {
//             queueMicrotask(processMutationQueue);
//           }
//         }

//         if (result.ok)
//           return ok({ id } as { readonly id: S[TableName]["id"]["Type"] });

//         return err(
//           result.error as InferErrors<
//             ObjectType<MutationMapping<S[TableName], Kind>>
//           >,
//         );
//       };

//     const processMutationQueue = () => {
//       const changes: Array<MutationChange> = [];
//       const onCompletes = [];

//       for (const [change, onComplete] of mutateMicrotaskQueue) {
//         if (change !== null) changes.push(change);
//         if (onComplete) onCompletes.push(onComplete);
//       }

//       const queueLength = mutateMicrotaskQueue.length;
//       mutateMicrotaskQueue.length = 0;

//       // Don't process any mutations if there was a validation error.
//       // All mutations within a queue run as a single transaction.
//       if (changes.length !== queueLength) {
//         return;
//       }

//       const _onCompleteIds = onCompletes.map(onCompleteCallbacks.register);
//       loadingPromises.releaseUnsubscribedOnMutation();

//       if (!isNonEmptyArray(changes)) return;

//       // TODO:
//       // dbWorker.postMessage({
//       //   type: "mutate",
//       //   tabId: getTabId(),
//       //   changes,
//       //   onCompleteIds,
//       //   subscribedQueries: subscribedQueries.get(),
//       // });
//     };

//     const evolu: Evolu<S> = {
//       name,

//       subscribeError: errorStore.subscribe,
//       getError: errorStore.get,

//       loadQuery: <R extends Row>(query: Query<R>): Promise<QueryRows<R>> => {
//         const { promise, isNew } = loadingPromises.get(query);

//         if (isNew) {
//           loadQueryMicrotaskQueue.push(query);
//           if (loadQueryMicrotaskQueue.length === 1) {
//             queueMicrotask(() => {
//               const queries = dedupeArray(loadQueryMicrotaskQueue);
//               loadQueryMicrotaskQueue.length = 0;
//               assertNonEmptyReadonlyArray(queries);
//               deps.console.log("[evolu]", "loadQuery", { queries });
//               // dbWorker.postMessage({
//               //   type: "query",
//               //   tabId: getTabId(),
//               //   queries,
//               // });
//             });
//           }
//         }

//         return promise;
//       },

//       loadQueries: <R extends Row, Q extends Queries<R>>(
//         queries: [...Q],
//       ): [...QueriesToQueryRowsPromises<Q>] =>
//         queries.map(evolu.loadQuery) as [...QueriesToQueryRowsPromises<Q>],

//       subscribeQuery: (query) => (listener) => {
//         // Call the listener only if the result has been changed.
//         let previousRows: unknown = null;
//         const unsubscribe = subscribedQueries.subscribe(query)(() => {
//           const rows = evolu.getQueryRows(query);
//           if (previousRows === rows) return;
//           previousRows = rows;
//           listener();
//         });
//         return () => {
//           previousRows = null;
//           unsubscribe();
//         };
//       },

//       getQueryRows: <R extends Row>(query: Query<R>): QueryRows<R> =>
//         (rowsStore.get().get(query) ?? emptyRows) as QueryRows<R>,

//       appOwner,

//       // TODO: Update it for the owner-api
//       // subscribeSyncState: syncStore.subscribe,
//       // getSyncState: syncStore.get,

//       insert: createMutation("insert"),
//       update: createMutation("update"),
//       upsert: createMutation("upsert"),

//       // resetAppOwner: (_options) => {
//       //   const { promise, resolve } = Promise.withResolvers<undefined>();
//       //   const _onCompleteId = onCompleteCallbacks.register(resolve);
//       //   // dbWorker.postMessage({
//       //   //   type: "reset",
//       //   //   onCompleteId,
//       //   //   reload: options?.reload ?? true,
//       //   // });
//       //   return promise;
//       // },

//       // restoreAppOwner: (_mnemonic, _options) => {
//       //   const { promise, resolve } = Promise.withResolvers<undefined>();
//       //   const _onCompleteId = onCompleteCallbacks.register(resolve);
//       //   // dbWorker.postMessage({
//       //   //   type: "reset",
//       //   //   onCompleteId,
//       //   //   reload: options?.reload ?? true,
//       //   //   restore: { mnemonic, dbSchema },
//       //   // });
//       //   return promise;
//       // },

//       // reloadApp: () => {
//       //   // TODO:
//       //   // deps.reloadApp(reloadUrl);
//       // },

//       // ensureSchema: (schema) => {
//       //   mutationTypesCache.clear();
//       //   const dbSchema = evoluSchemaToDbSchema(schema);
//       //   dbWorker.postMessage({ type: "ensureDbSchema", dbSchema });
//       // },

//       exportDatabase: () => {
//         const { promise, resolve } =
//           Promise.withResolvers<Uint8Array<ArrayBuffer>>();
//         const _onCompleteId = exportCallbacks.register(resolve);
//         // dbWorker.postMessage({ type: "export", onCompleteId });
//         return promise;
//       },

//       useOwner: (owner) => {
//         const scheduleOwnerQueueProcessing = () => {
//           if (useOwnerMicrotaskQueue.length !== 1) return;
//           queueMicrotask(() => {
//             const queue = [...useOwnerMicrotaskQueue];
//             useOwnerMicrotaskQueue.length = 0;

//             const result: Array<[SyncOwner, boolean, Uint8Array]> = [];
//             const skipIndices = new Set<number>();

//             for (let i = 0; i < queue.length; i++) {
//               if (skipIndices.has(i)) continue;

//               const [currentOwner, currentUse, currentOwnerSerialized] =
//                 queue[i];

//               // Look for opposite action with same owner
//               for (let j = i + 1; j < queue.length; j++) {
//                 if (skipIndices.has(j)) continue;

//                 const [, otherUse, otherOwnerSerialized] = queue[j];

//                 if (
//                   currentUse !== otherUse &&
//                   eqArrayNumber(currentOwnerSerialized, otherOwnerSerialized)
//                 ) {
//                   // Found cancel-out pair, skip both
//                   skipIndices.add(i).add(j);
//                   break;
//                 }
//               }

//               if (!skipIndices.has(i)) {
//                 result.push([currentOwner, currentUse, currentOwnerSerialized]);
//               }
//             }

//             for (const [_owner, _use] of result) {
//               // dbWorker.postMessage({ type: "useOwner", owner, use });
//             }
//           });
//         };

//         useOwnerMicrotaskQueue.push([owner, true, pack(owner)]);
//         scheduleOwnerQueueProcessing();

//         const unuse = () => {
//           useOwnerMicrotaskQueue.push([owner, false, pack(owner)]);
//           scheduleOwnerQueueProcessing();
//         };

//         return unuse;
//       },

//       /** Disposal is not implemented yet. */
//       [Symbol.dispose]: () => {
//         throw new Error("Evolu instance disposal is not yet implemented");
//       },
//     };

//     return evolu;
//   };

// interface LoadingPromises {
//   get: <R extends Row>(
//     query: Query<R>,
//   ) => {
//     readonly promise: Promise<QueryRows<R>>;
//     readonly isNew: boolean;
//   };

//   resolve: (query: Query, rows: ReadonlyArray<Row>) => void;

//   releaseUnsubscribedOnMutation: () => void;

//   getQueries: () => ReadonlyArray<Query>;
// }

// interface LoadingPromise {
//   /** Promise with props for the React use hook. */
//   promise: Promise<QueryRows> & {
//     status?: "pending" | "fulfilled" | "rejected";
//     value?: QueryRows;
//     reason?: unknown;
//   };
//   resolve: (rows: QueryRows) => void;
//   releaseOnResolve: boolean;
// }

// const createLoadingPromises = (
//   subscribedQueries: SubscribedQueries,
// ): LoadingPromises => {
//   const loadingPromiseMap = new Map<Query, LoadingPromise>();

//   return {
//     get: <R extends Row>(
//       query: Query<R>,
//     ): {
//       readonly promise: Promise<QueryRows<R>>;
//       readonly isNew: boolean;
//     } => {
//       let loadingPromise = loadingPromiseMap.get(query);
//       const isNew = !loadingPromise;
//       if (!loadingPromise) {
//         const { promise, resolve } = Promise.withResolvers<QueryRows>();
//         loadingPromise = { resolve, promise, releaseOnResolve: false };
//         loadingPromiseMap.set(query, loadingPromise);
//       }
//       return {
//         promise: loadingPromise.promise as Promise<QueryRows<R>>,
//         isNew,
//       };
//     },

//     resolve: (query, rows) => {
//       const loadingPromise = loadingPromiseMap.get(query);
//       if (!loadingPromise) return;

//       if (loadingPromise.promise.status !== "fulfilled") {
//         loadingPromise.resolve(rows);
//       } else {
//         loadingPromise.promise = Promise.resolve(rows);
//       }

//       // Set status and value fields for React's `use` Hook to unwrap synchronously.
//       // While undocumented in React docs, React still uses these properties internally,
//       // and Evolu's own promise caching logic depends on checking `promise.status`.
//       // https://github.com/acdlite/rfcs/blob/first-class-promises/text/0000-first-class-support-for-promises.md
//       void Object.assign(loadingPromise.promise, {
//         status: "fulfilled",
//         value: rows,
//       });

//       if (loadingPromise.releaseOnResolve) {
//         loadingPromiseMap.delete(query);
//       }
//     },

//     releaseUnsubscribedOnMutation: () => {
//       [...loadingPromiseMap.entries()]
//         .filter(([query]) => !subscribedQueries.has(query))
//         .forEach(([query, loadingPromise]) => {
//           if (loadingPromise.promise.status === "fulfilled") {
//             loadingPromiseMap.delete(query);
//           } else {
//             loadingPromise.releaseOnResolve = true;
//           }
//         });
//     },

//     getQueries: () => Array.from(loadingPromiseMap.keys()),
//   };
// };
// // /**
// //  * Delete {@link AppOwner} and all their data from the current device. After
// //  * the deletion, Evolu will purge the application state. For browsers, this
// //  * will reload all tabs using Evolu. For native apps, it will restart the
// //  * app.
// //  *
// //  * Reloading can be turned off via options if you want to provide a different
// //  * UX.
// //  */
// // readonly resetAppOwner: (options?: {
// //   readonly reload?: boolean;
// // }) => Promise<void>;

// // /**
// //  * Restore {@link AppOwner} with all their synced data. It uses
// //  * {@link Evolu.resetAppOwner}, so be careful.
// //  */
// // readonly restoreAppOwner: (
// //   mnemonic: Mnemonic,
// //   options?: {
// //     readonly reload?: boolean;
// //   },
// // ) => Promise<void>;

// // /**
// //  * Reload the app in a platform-specific way. For browsers, this will reload
// //  * all tabs using Evolu. For native apps, it will restart the app.
// //  */
// // readonly reloadApp: () => void;

// /**
//  * Export SQLite database file as Uint8Array.
//  *
//  * In the future, it will be possible to import a database and export/import
//  * history for 1:1 migrations across owners.
//  */
// readonly exportDatabase: () => Promise<Uint8Array<ArrayBuffer>>;
