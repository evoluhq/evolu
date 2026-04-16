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
} from "../Array.js";
import {
  assert,
  assertNonEmptyReadonlyArray,
  assertNotDisposed,
} from "../Assert.js";
import { createCallbacks } from "../Callbacks.js";
import type { ConsoleDep } from "../Console.js";
import { createConsole } from "../Console.js";
import { createUnknownError } from "../Error.js";
import { exhaustiveCheck, todo } from "../Function.js";
import { createMicrotaskBatch } from "../Microtask.js";
import type { FlushSyncDep, ReloadAppDep } from "../Platform.js";
import { createRefCountByKey } from "../RefCount.js";
import { err, ok } from "../Result.js";
import { isNonEmptySet } from "../Set.js";
import { SqliteBoolean, sqliteBooleanToBoolean } from "../Sqlite.js";
import type { Listener, ReadonlyStore, Unsubscribe } from "../Store.js";
import { createStore } from "../Store.js";
import { type createRun, type Task } from "../Task.js";
import type { Id, TypeError } from "../Type.js";
import {
  brand,
  createId,
  createIdFromString,
  Name,
  UrlSafeString,
} from "../Type.js";
import type { ExtractType } from "../Types.js";
import type { CreateMessageChannelDep } from "../Worker.js";
import type { CreateDbWorkerDep } from "./Db.js";
import type { EvoluError } from "./Error.js";
import type {
  AppOwner,
  Owner,
  OwnerId,
  OwnerTransport,
  ReadonlyOwner,
  SyncOwner,
} from "./Owner.js";
import { createOwnerWebSocketTransport } from "./Owner.js";
import type {
  Queries,
  QueriesToQueryRowsPromises,
  Query,
  QueryRows,
  Row,
  RowsByQueryMap,
} from "./Query.js";
import { applyPatches } from "./Query.js";
import type {
  EvoluSchema,
  IndexesConfig,
  Mutation,
  MutationChange,
  ValidateSchema,
} from "./Schema.js";
import { evoluSchemaToSqliteSchema } from "./Schema.js";
import type {
  DbWorkerInput,
  DbWorkerOutput,
  EvoluInput,
  EvoluOutput,
  TabOutput,
  SharedWorkerDep,
} from "./Shared.js";
import { DbChange } from "./Storage.js";
import type { Timestamp } from "./Timestamp.js";

export interface EvoluConfig {
  /**
   * The app name. Evolu is multitenant - it can run multiple instances
   * concurrently. The same app can have multiple instances for different
   * accounts.
   *
   * Evolu derives the final instance name from `appName` and `appOwner` in
   * {@link EvoluConfig}. The derived instance name is used as the SQLite
   * database filename and as the log prefix. This ensures that each
   * {@link Owner} gets a separate local database while preserving a readable app
   * prefix.
   *
   * ### Example
   *
   * ```ts
   * // appName: AppName.orThrow("MyApp")
   * ```
   */
  readonly appName: AppName;

  /**
   * {@link AppOwner} used to create this {@link Evolu} instance.
   *
   * Exposed as {@link Evolu.appOwner}. If `appOwner` is not passed, Evolu
   * creates one.
   *
   * AppOwner controls access to the encrypted local SQLite database. If its
   * secret material (Owner secret / Mnemonic) is not stored safely, data
   * written by that instance is permanently inaccessible.
   *
   * Best onboarding UX is accountless first use: let users try a ready-to-use
   * app, then prompt backup of `evolu.appOwner`.
   *
   * Recommended usage:
   *
   * - Omit `appOwner` for first run, then persist `evolu.appOwner` after user
   *   activity and guide the user to back it up.
   * - Pass `appOwner` restored from secure storage (for example, Expo
   *   SecureStore, WebAuthn-backed storage, or app-managed account recovery
   *   flow).
   */
  readonly appOwner: AppOwner;

  /**
   * Transport configuration for sync and backup.
   *
   * If not specified, Evolu uses the default Evolu relay. Pass one or more
   * transports to override it with your own relays. Pass an empty array to
   * disable sync, which is useful when sync should be configured later.
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
   * Keep local data only in memory instead of persisting it on this device.
   * Useful for testing, temporary data, or sensitive data that should not be
   * recoverable from local storage after the process ends.
   *
   * Local data stored in memory is completely destroyed when the process ends.
   * Sync can still persist data remotely when transports are enabled.
   *
   * The default value is: `false`.
   */
  readonly memoryOnly?: boolean;

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

export const testAppName = /*#__PURE__*/ AppName.orThrow("AppName");

/**
 * Local-first SQL database with typed queries, mutations, and sync.
 *
 * TODO: Better docs.
 */
export interface Evolu<
  S extends EvoluSchema = EvoluSchema,
> extends AsyncDisposable {
  /**
   * Evolu instance name is derived from {@link EvoluConfig.appName} and
   * {@link AppOwner}'s hash.
   */
  readonly name: Name;

  /** {@link AppOwner}. */
  readonly appOwner: AppOwner;

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
   * Load {@link Query} and return a promise with {@link QueryRows}.
   *
   * The returned promise always resolves successfully because there is no
   * reason why loading should fail. All data are local, and the query is
   * typed.
   *
   * Loading is batched. Returned promises are cached while pending and can be
   * reused after fulfillment until mutation-driven invalidation, which prevents
   * redundant database queries and supports React Suspense (stable references
   * while pending).
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
  readonly loadQuery: <R extends Row>(
    query: Query<S, R>,
  ) => Promise<QueryRows<R>>;

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
  readonly loadQueries: <Q extends Queries<S>>(
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
    query: Query<S>,
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
  readonly getQueryRows: <R extends Row>(query: Query<S, R>) => QueryRows<R>;

  /**
   * Exports the SQLite database file.
   *
   * Exports are sequential: concurrent calls share one pending export instead
   * of starting parallel exports.
   *
   * The pending promise rejects if this {@link Evolu} instance is disposed
   * before export completion.
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
   * Transports are automatically deduplicated and reference-counted, so
   * multiple Owners using the same transport will share a single connection.
   *
   * ### Example
   *
   * ```ts
   * // Use an Owner (starts syncing).
   * const unuseOwner = evolu.useOwner(shardOwner, [
   *   createOwnerWebSocketTransport({
   *     url: "ws://localhost:4000",
   *     ownerId: shardOwner.id,
   *   }),
   * ]);
   *
   * // Later, stop using the Owner.
   * unuseOwner();
   *
   * // Bulk operations.
   * const unuseOwners = owners.map(evolu.useOwner);
   * // Later: for (const unuse of unuseOwners) unuse();
   * ```
   */
  readonly useOwner: (
    owner: ReadonlyOwner | Owner,
    transports?: NonEmptyReadonlyArray<OwnerTransport>,
  ) => UnuseOwner;
}

/** Function returned by {@link Evolu.useOwner} to stop using an Owner for sync. */
export type UnuseOwner = () => void;

export interface EvoluErrorDep {
  /**
   * {@link ReadonlyStore} of {@link EvoluError} shared by all {@link Evolu}
   * instances created from the same {@link createEvoluDeps} result.
   *
   * Subscribe once to show user-facing messages across all instances. Logging
   * is handled by platform {@link createRun} global error handlers.
   *
   * ### Example
   *
   * ```ts
   * deps.evoluError.subscribe(() => {
   *   const error = deps.evoluError.get();
   *   if (!error) return;
   *
   *   switch (error.type) {
   *     case "InvalidComputerClock":
   *       // Show guidance specific to the detected error.
   *       showMessage(
   *         "Your system clock appears incorrect. Please fix it.",
   *       );
   *       break;
   *     default:
   *       // Show a generic user message for other operational errors.
   *       showMessage("Something went wrong. Please try again.");
   *   }
   * });
   * ```
   */
  readonly evoluError: ReadonlyStore<EvoluError | null>;
}

/**
 * Shared platform dependencies for creating {@link Evolu} instances.
 *
 * Includes platform adapters, the shared {@link EvoluErrorDep.evoluError} store,
 * and disposal for owned resources.
 */
export type EvoluDeps = EvoluPlatformDeps & EvoluErrorDep & Disposable;

/**
 * Platform-specific dependencies required to create {@link EvoluDeps}.
 *
 * Provides worker and channel adapters plus optional platform integrations for
 * logging and synchronous UI flush.
 */
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

  using disposer = new DisposableStack();
  disposer.use(sharedWorker);
  const evoluError = disposer.use(createStore<EvoluError | null>(null));

  const tabChannel = disposer.use(createMessageChannel<TabOutput>());
  tabChannel.port2.onMessage = (message) => {
    switch (message.type) {
      case "OnConsoleEntry":
        console.write(message.entry);
        // Fallback channel for unexpected errors without EvoluError typing.
        if (message.entry.method === "error") {
          evoluError.set(createUnknownError(message.entry.args));
        }
        break;

      case "OnError":
        evoluError.set(message.error);
        // Keep typed errors visible in logs as operational failures.
        console.error(message.error);
        break;

      default:
        exhaustiveCheck(message);
    }
  };

  sharedWorker.port.postMessage(
    {
      type: "InitTab",
      consoleLevel: console.getLevel(),
      port: tabChannel.port1.native,
    },
    [tabChannel.port1.native],
  );

  const disposables = disposer.move();

  return {
    ...deps,
    evoluError,
    [Symbol.dispose]: () => disposables.dispose(),
  };
};

/**
 * Creates an {@link Evolu} instance from {@link EvoluSchema} and
 * {@link EvoluConfig}.
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
      memoryOnly = false,
      transports = [{ type: "WebSocket", url: "wss://free.evoluhq.com" }],
    } = config;

    const name = Name.orThrow(`${appName}-${createIdFromString(appOwner.id)}`);
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
      resolve: (rows: QueryRows) => void;
      releaseOnResolve: boolean;
    }

    /**
     * Settle pending query loads during disposal so awaiting callers and React
     * `use` thenables do not hang forever during teardown.
     */
    const loadingPromisesByQuery = disposer.adopt(
      new Map<Query, LoadingPromise>(),
      (loadingPromisesByQuery) => {
        for (const loadingPromise of loadingPromisesByQuery.values()) {
          if (loadingPromise.promise.status === "fulfilled") continue;
          fulfillLoadingPromise(loadingPromise, emptyArray);
        }
        loadingPromisesByQuery.clear();
      },
    );

    const fulfillLoadingPromise = (
      loadingPromise: LoadingPromise,
      rows: QueryRows,
    ): void => {
      /**
       * Pending promises must be resolved in place to preserve identity for
       * current awaiters. Fulfilled promises are replaced with a new resolved
       * promise so future loads see the latest rows.
       */
      if (loadingPromise.promise.status !== "fulfilled") {
        loadingPromise.resolve(rows);
      } else {
        loadingPromise.promise = Promise.resolve(rows);
      }

      /** See {@link LoadingPromise.promise}. */
      void Object.assign(loadingPromise.promise, {
        status: "fulfilled",
        value: rows,
      });
    };

    /**
     * Mutations and refreshes invalidate query snapshots. Keep loading promises
     * only for actively subscribed queries and release unsubscribed ones.
     *
     * Fulfilled promises can be dropped immediately because no awaiter is
     * waiting on them. Pending promises must stay alive until they resolve so
     * current awaiters keep the same promise identity.
     */
    const releaseUnsubscribedLoadingPromises = (): void => {
      for (const [query, loadingPromise] of loadingPromisesByQuery) {
        if (subscribedQueriesRefCount.has(query)) continue;

        if (loadingPromise.promise.status === "fulfilled") {
          loadingPromisesByQuery.delete(query);
        } else {
          loadingPromise.releaseOnResolve = true;
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

    const mutateBatch = disposer.use(
      createMicrotaskBatch<{
        readonly change: MutationChange;
        readonly onComplete: (() => void) | undefined;
      }>((items) => {
        console.debug("mutateBatch", { changeCount: items.length });
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
        const dedupedQueries = new Set(queries);
        assert(
          isNonEmptySet(dedupedQueries),
          "Expected non-empty query batch.",
        );
        console.debug("queryBatch", { queryCount: dedupedQueries.size });
        postMessage({ type: "Query", queries: dedupedQueries });
      }),
    );

    const useOwnerBatch = disposer.use(
      createMicrotaskBatch<
        ExtractType<EvoluInput, "UseOwner">["actions"][number]
      >((actions) => postMessage({ type: "UseOwner", actions })),
    );

    let postMessage: (input: EvoluInput) => void;

    // Scope worker/channel wiring and keep only postMessage outside.
    {
      const { createDbWorker, createMessageChannel, sharedWorker } = run.deps;
      const dbWorkerChannel = disposer.use(
        createMessageChannel<DbWorkerOutput, DbWorkerInput>(),
      );
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
              nextRowsByQueryMap.set(
                query,
                applyPatches(patches, state.get(query) ?? emptyArray),
              );
            }

            for (const query of message.patchesByQuery.keys()) {
              const loadingPromise = loadingPromisesByQuery.get(query);
              if (!loadingPromise) continue;

              const rows = nextRowsByQueryMap.get(query);
              assert(rows, "Expected patched query rows to exist.");

              fulfillLoadingPromise(loadingPromise, rows);

              /**
               * Release promises flagged during mutation when they finish
               * resolving. This keeps in-flight promise identity stable and
               * prevents stale cache entries after completion.
               */
              if (loadingPromise.releaseOnResolve) {
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

            const queries = new Set<Query>([
              ...loadingPromisesByQuery.keys(),
              ...subscribedQueriesRefCount.keys(),
            ]);

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

          default:
            exhaustiveCheck(message);
        }
      };

      sharedWorker.port.postMessage(
        {
          type: "CreateEvolu",
          name,
          evoluPort: evoluChannel.port2.native,
          dbWorkerPort: dbWorkerChannel.port2.native,
        },
        [evoluChannel.port2.native, dbWorkerChannel.port2.native],
      );

      /**
       * No stack.use because Evolu instances don't dispose DbWorker because
       * it's SharedWorder responsibility. DbWorker can be used by another tab.
       * That's required because SQLite WASM needs a single web worker.
       */
      createDbWorker().postMessage(
        {
          type: "Init",
          name,
          consoleLevel: console.getLevel(),
          sqliteSchema: evoluSchemaToSqliteSchema(schema, config.indexes),
          encryptionKey: appOwner.encryptionKey,
          memoryOnly,
          port: dbWorkerChannel.port1.native,
        },
        [dbWorkerChannel.port1.native],
      );

      postMessage = evoluChannel.port1.postMessage;

      disposer.defer(() => {
        postMessage({ type: "Dispose" });
      });
    }

    const createMutation =
      <Kind extends "insert" | "update" | "upsert">(
        kind: Kind,
      ): Mutation<S, Kind> =>
      (table, values, options) => {
        assertNotDisposed(disposables);

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
          change: { ...dbChange, ownerId: options?.ownerId ?? appOwner.id },
          onComplete: options?.onComplete,
        });

        return { id };
      };

    const loadQuery = <R extends Row>(
      query: Query<S, R>,
    ): Promise<QueryRows<R>> => {
      assertNotDisposed(disposables);

      const loadingPromise = loadingPromisesByQuery.get(query);
      if (loadingPromise) {
        return loadingPromise.promise as Promise<QueryRows<R>>;
      }

      const { promise, resolve } = Promise.withResolvers<QueryRows>();
      const typedPromise = promise as LoadingPromise["promise"];
      typedPromise.status = "pending";

      loadingPromisesByQuery.set(query, {
        promise: typedPromise,
        resolve,
        releaseOnResolve: false,
      });

      queryBatch.push(query);

      return typedPromise as Promise<QueryRows<R>>;
    };

    const getQueryRows = <R extends Row>(query: Query<S, R>): QueryRows<R> => {
      assertNotDisposed(disposables);

      return (rowsByQueryMapStore.get().get(query) ??
        emptyArray) as QueryRows<R>;
    };

    const useOwner = (
      owner: ReadonlyOwner | Owner,
      ownerTransports?: NonEmptyReadonlyArray<OwnerTransport>,
    ): UnuseOwner => {
      assertNotDisposed(disposables);

      const effectiveTransports = ownerTransports ?? transports;
      assertNonEmptyReadonlyArray(
        effectiveTransports,
        "useOwner requires explicit non-empty transports when config.transports is empty.",
      );

      const syncOwner: SyncOwner = {
        owner,
        transports: effectiveTransports,
      };

      useOwnerBatch.push({
        owner: syncOwner,
        action: "add",
      });

      let isUsed = true;

      return () => {
        if (disposables.disposed) return;
        assert(isUsed, "UnuseOwner can be called only once.");
        isUsed = false;
        useOwnerBatch.push({
          owner: syncOwner,
          action: "remove",
        });
      };
    };

    const disposables = disposer.move();

    if (isNonEmptyArray(transports)) useOwner(appOwner);

    return ok({
      name,
      appOwner,

      insert: createMutation("insert"),
      update: createMutation("update"),
      upsert: createMutation("upsert"),

      loadQuery,
      loadQueries: <Q extends Queries<S>>(
        queries: [...Q],
      ): [...QueriesToQueryRowsPromises<Q>] =>
        queries.map((query) => loadQuery(query)) as [
          ...QueriesToQueryRowsPromises<Q>,
        ],

      subscribeQuery: (query) => (listener) => {
        assertNotDisposed(disposables);

        subscribedQueriesRefCount.increment(query);
        let isSubscribed = true;

        let previousRows: unknown = null;

        const unsubscribe = rowsByQueryMapStore.subscribe(() => {
          const rows = getQueryRows(query);
          if (previousRows === rows) return;
          previousRows = rows;
          listener();
        });

        return () => {
          assert(
            isSubscribed,
            "subscribeQuery unsubscribe can be called only once.",
          );
          isSubscribed = false;

          previousRows = null;
          unsubscribe();

          if (disposables.disposed) return;

          subscribedQueriesRefCount.decrement(query);
        };
      },
      getQueryRows,

      exportDatabase: () => {
        assertNotDisposed(disposables);

        if (!exportDatabasePending) {
          exportDatabasePending =
            Promise.withResolvers<Uint8Array<ArrayBuffer>>();
          postMessage({ type: "Export" });
        }
        return exportDatabasePending.promise;
      },

      deleteDatabase: () => {
        assertNotDisposed(disposables);
        todo();
      },

      deleteOwner: (owner) => {
        assertNotDisposed(disposables);
        void owner;
        todo();
      },

      useOwner,

      [Symbol.asyncDispose]: () => {
        console.info("dispose");
        return disposables.disposeAsync();
      },
    } as Evolu<S>);
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
