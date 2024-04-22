import * as AST from "@effect/schema/AST";
import * as S from "@effect/schema/Schema";
import { make } from "@effect/schema/Schema";
import * as Arr from "effect/Array";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import { constVoid, flow, pipe } from "effect/Function";
import * as Layer from "effect/Layer";
import * as ManagedRuntime from "effect/ManagedRuntime";
import * as Number from "effect/Number";
import * as Option from "effect/Option";
import * as Predicate from "effect/Predicate";
import * as Record from "effect/Record";
import * as Scope from "effect/Scope";
import * as Kysely from "kysely";
import { Config, createRuntime, defaultConfig } from "./Config.js";
import { TimestampError } from "./Crdt.js";
import { Mnemonic, NanoIdGenerator } from "./Crypto.js";
import {
  DbFactory,
  DbSchema,
  Index,
  Mutation,
  Queries,
  Query,
  QueryResult,
  QueryResultsPromisesFromQueries,
  Row,
  RowsStoreState,
  Table,
  deserializeQuery,
  emptyRows,
  makeRowsStore,
  queryResultFromRows,
  serializeQuery,
} from "./Db.js";
import { QueryPatches, applyPatches } from "./Diff.js";
import { Id, SqliteBoolean, SqliteDate } from "./Model.js";
import { Owner } from "./Owner.js";
import { AppState, FlushSync } from "./Platform.js";
import {
  SqliteQuery,
  SqliteQueryOptions,
  Value,
  isSqlMutation,
} from "./Sqlite.js";
import { Listener, Unsubscribe, makeStore } from "./Store.js";
import { SyncState } from "./Sync.js";

/**
 * The Evolu interface provides a type-safe SQL query building and state
 * management defined by a database schema. It leverages Kysely for creating SQL
 * queries in TypeScript, enabling operations such as data querying, loading,
 * subscription to data changes, and mutations (create, update, createOrUpdate).
 * It also includes functionalities for error handling, syncing state
 * management, and owner data manipulation. Specifically, Evolu allows:
 *
 * - Subscribing to and getting errors via subscribeError and getError.
 * - Creating type-safe SQL queries with createQuery, leveraging Kysely's
 *   capabilities.
 * - Loading queries and subscribing to query result changes using loadQuery,
 *   loadQueries, subscribeQuery, and getQuery.
 * - Subscribing to and getting the owner's information and sync state changes.
 * - Performing mutations on the database with create, update, and createOrUpdate
 *   methods, which include automatic management of common columns like
 *   createdAt, updatedAt, and isDeleted.
 * - Managing owner data with resetOwner and restoreOwner.
 * - Ensuring the database schema's integrity with ensureSchema.
 */
export interface Evolu<T extends EvoluSchema = EvoluSchema> {
  /**
   * Subscribe to {@link EvoluError} changes.
   *
   * @example
   *   const unsubscribe = evolu.subscribeError(() => {
   *     const error = evolu.getError();
   *     console.log(error);
   *   });
   */
  readonly subscribeError: (listener: Listener) => Unsubscribe;

  /** Get {@link EvoluError}. */
  readonly getError: () => EvoluError | null;

  /**
   * Create type-safe SQL {@link Query}.
   *
   * Evolu uses Kysely - the type-safe SQL query builder for TypeScript. See
   * https://kysely.dev.
   *
   * For mutations, use {@link create} and {@link update}.
   *
   * @example
   *   const allTodos = evolu.createQuery((db) =>
   *     db.selectFrom("todo").selectAll(),
   *   );
   *
   *   const todoById = (id: TodoId) =>
   *     evolu.createQuery((db) =>
   *       db.selectFrom("todo").selectAll().where("id", "=", id),
   *     );
   */
  readonly createQuery: <R extends Row>(
    queryCallback: (
      db: Pick<
        Kysely.Kysely<{
          [Table in keyof T]: NullableExceptIdCreatedAtUpdatedAt<{
            [Column in keyof T[Table]]: T[Table][Column];
          }>;
        }>,
        "selectFrom" | "fn" | "with" | "withRecursive"
      >,
    ) => Kysely.SelectQueryBuilder<any, any, R>,
    options?: SqliteQueryOptions,
  ) => Query<R>;

  /**
   * Load {@link Query} and return a promise with {@link QueryResult}.
   *
   * A returned promise always resolves successfully because there is no reason
   * why loading should fail. All data are local, and the query is typed. A
   * serious unexpected Evolu error shall be handled with
   * {@link subscribeError}.
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
   * to a query, use {@link subscribeQuery}.
   *
   * @example
   *   const allTodos = evolu.createQuery((db) =>
   *     db.selectFrom("todo").selectAll(),
   *   );
   *   evolu.loadQuery(allTodos).then(({ rows }) => {
   *     console.log(rows);
   *   });
   */
  readonly loadQuery: <R extends Row>(
    query: Query<R>,
  ) => Promise<QueryResult<R>>;

  /**
   * Load an array of {@link Query} queries and return an array of
   * {@link QueryResult} promises. It's like `queries.map(loadQuery)` but with
   * proper types for returned promises.
   *
   * @example
   *   evolu.loadQueries([allTodos, todoById(1)]);
   */
  readonly loadQueries: <R extends Row, Q extends Queries<R>>(
    queries: [...Q],
  ) => [...QueryResultsPromisesFromQueries<Q>];

  /**
   * Subscribe to {@link Query} {@link QueryResult} changes.
   *
   * @example
   *   const unsubscribe = evolu.subscribeQuery(allTodos)(() => {
   *     const { rows } = evolu.getQuery(allTodos);
   *   });
   */
  readonly subscribeQuery: (
    query: Query,
  ) => (listener: Listener) => Unsubscribe;

  /**
   * Get {@link Query} {@link QueryResult}.
   *
   * @example
   *   const unsubscribe = evolu.subscribeQuery(allTodos)(() => {
   *     const { rows } = evolu.getQuery(allTodos);
   *   });
   */
  readonly getQuery: <R extends Row>(query: Query<R>) => QueryResult<R>;

  /**
   * Subscribe to {@link Owner} changes.
   *
   * @example
   *   const unsubscribe = evolu.subscribeOwner(() => {
   *     const owner = evolu.getOwner();
   *   });
   */
  readonly subscribeOwner: (listener: Listener) => Unsubscribe;

  /**
   * Get {@link Owner}.
   *
   * @example
   *   const unsubscribe = evolu.subscribeOwner(() => {
   *     const owner = evolu.getOwner();
   *   });
   */
  readonly getOwner: () => Owner | null;

  /**
   * Subscribe to {@link SyncState} changes.
   *
   * @example
   *   const unsubscribe = evolu.subscribeSyncState(() => {
   *     const syncState = evolu.getSyncState();
   *   });
   */
  readonly subscribeSyncState: (listener: Listener) => Unsubscribe;

  /**
   * Get {@link SyncState}.
   *
   * @example
   *   const unsubscribe = evolu.subscribeSyncState(() => {
   *     const syncState = evolu.getSyncState();
   *   });
   */
  readonly getSyncState: () => SyncState;

  /**
   * Create a row in the database and returns a new ID. The first argument is
   * the table name, and the second is an object.
   *
   * The third optional argument, the onComplete callback, is generally
   * unnecessary because creating a row cannot fail. Still, UI libraries can use
   * it to ensure the DOM is updated if we want to manipulate it, for example,
   * to focus an element.
   *
   * Evolu does not use SQL for mutations to ensure data can be safely and
   * predictably merged without conflicts.
   *
   * Explicit mutations also allow Evolu to automatically add and update a few
   * useful columns common to all tables. Those columns are: `createdAt`,
   * `updatedAt`, and `isDeleted`.
   *
   * @example
   *   import * as S from "@effect/schema/Schema";
   *
   *   // Evolu uses the Schema to enforce domain model.
   *   const title = S.decodeSync(Evolu.NonEmptyString1000)("A title");
   *
   *   const { id } = evolu.create("todo", { title }, () => {
   *     // onComplete callback
   *   });
   */
  create: Mutate<T, "create">;

  /**
   * Update a row in the database and return the existing ID. The first argument
   * is the table name, and the second is an object.
   *
   * The third optional argument, the onComplete callback, is generally
   * unnecessary because updating a row cannot fail. Still, UI libraries can use
   * it to ensure the DOM is updated if we want to manipulate it, for example,
   * to focus an element.
   *
   * Evolu does not use SQL for mutations to ensure data can be safely and
   * predictably merged without conflicts.
   *
   * Explicit mutations also allow Evolu to automatically add and update a few
   * useful columns common to all tables. Those columns are: `createdAt`,
   * `updatedAt`, and `isDeleted`.
   *
   * @example
   *   import * as S from "@effect/schema/Schema";
   *
   *   // Evolu uses the Schema to enforce domain model.
   *   const title = S.decodeSync(Evolu.NonEmptyString1000)("A title");
   *   evolu.update("todo", { id, title });
   *
   *   // To delete a row, set `isDeleted` to true.
   *   evolu.update("todo", { id, isDeleted: true });
   */
  update: Mutate<T, "update">;

  /**
   * Create or update a row in the database and return the existing ID. The
   * first argument is the table name, and the second is an object.
   *
   * This function is useful when we already have an `id` and want to create a
   * new row or update an existing one.
   *
   * The third optional argument, the onComplete callback, is generally
   * unnecessary because updating a row cannot fail. Still, UI libraries can use
   * it to ensure the DOM is updated if we want to manipulate it, for example,
   * to focus an element.
   *
   * Evolu does not use SQL for mutations to ensure data can be safely and
   * predictably merged without conflicts.
   *
   * Explicit mutations also allow Evolu to automatically add and update a few
   * useful columns common to all tables. Those columns are: `createdAt`,
   * `updatedAt`, and `isDeleted`.
   *
   * @example
   *   import * as S from "@effect/schema/Schema";
   *   import { Id } from "@evolu/react";
   *
   *   // Id can be stable.
   *   // 2024-02-0800000000000
   *   const id = S.decodeSync(Id)(date.toString().padEnd(21, "0")) as TodoId;
   *
   *   evolu.createOrUpdate("todo", { id, title });
   */
  createOrUpdate: Mutate<T, "createOrUpdate">;

  /**
   * Delete {@link Owner} and all their data from the current device. After the
   * deletion, Evolu will purge the application state. For browsers, this will
   * reload all tabs using Evolu. For native apps, it will restart the app.
   */
  readonly resetOwner: () => void;

  /** Restore {@link Owner} with all their synced data. */
  readonly restoreOwner: (mnemonic: Mnemonic) => void;

  /**
   * Ensure tables and columns defined in {@link EvoluSchema} exist in the
   * database.
   *
   * This function is for hot/live reloading.
   */
  readonly ensureSchema: (schema: DbSchema) => void;

  // TODO:
  // readonly exportSqliteFile: () => Promise<Uint8Array>

  readonly dispose: () => Promise<void>;
}

/** A type to define tables, columns, and column types. */
export type EvoluSchema = Record.ReadonlyRecord<
  string,
  Record.ReadonlyRecord<string, Value> & {
    readonly id: Id;
  }
>;

/** The EvoluError type is used to represent errors that can occur in Evolu. */
export type EvoluError = TimestampError | UnexpectedError;

/**
 * UnexpectedError represents errors that can occur unexpectedly anywhere, even
 * in third-party libraries, because Evolu uses Effect to track all errors.
 */
export interface UnexpectedError {
  readonly _tag: "UnexpectedError";
  readonly error: unknown;
}

type NullableExceptIdCreatedAtUpdatedAt<T> = {
  readonly [K in keyof T]: K extends "id" | "createdAt" | "updatedAt"
    ? T[K]
    : T[K] | null;
};

type Mutate<
  T extends EvoluSchema = EvoluSchema,
  Mode extends "create" | "update" | "createOrUpdate" = "update",
> = <K extends keyof T>(
  table: K,
  values: Kysely.Simplify<
    Mode extends "create"
      ? PartialForNullable<
          Castable<Omit<T[K], "id" | "createdAt" | "updatedAt" | "isDeleted">>
        >
      : Mode extends "update"
        ? Partial<Castable<Omit<T[K], "id" | "createdAt" | "updatedAt">>> & {
            readonly id: T[K]["id"];
          }
        : PartialForNullable<
            Castable<Omit<T[K], "createdAt" | "updatedAt" | "isDeleted">>
          >
  >,
  onComplete?: MutateOnComplete,
) => {
  readonly id: T[K]["id"];
};

type MutateOnComplete = () => void;

// https://stackoverflow.com/a/54713648/233902
type PartialForNullable<
  T,
  NK extends keyof T = {
    [K in keyof T]: null extends T[K] ? K : never;
  }[keyof T],
  NP = Pick<T, Exclude<keyof T, NK>> & Partial<Pick<T, NK>>,
> = { [K in keyof NP]: NP[K] };

/**
 * SQLite doesn't support Date nor Boolean types, so Evolu emulates them with
 * {@link SqliteBoolean} and {@link SqliteDate}.
 */
type Castable<T> = {
  readonly [K in keyof T]: T[K] extends SqliteBoolean
    ? boolean | SqliteBoolean
    : T[K] extends null | SqliteBoolean
      ? null | boolean | SqliteBoolean
      : T[K] extends SqliteDate
        ? Date | SqliteDate
        : T[K] extends null | SqliteDate
          ? null | Date | SqliteDate
          : T[K];
};

export class EvoluFactory extends Context.Tag("EvoluFactory")<
  EvoluFactory,
  {
    /**
     * Create Evolu from the database schema.
     *
     * Tables with a name prefixed with `_` are local-only, which means they are
     * never synced. It's useful for device-specific or temporal data.
     *
     * @example
     *   import * as S from "@effect/schema/Schema";
     *   import * as E from "@evolu/react";
     *   // The same API for different platforms
     *   // import * as E from "@evolu/react-native";
     *   // import * as E from "@evolu/common-web";
     *
     *   const TodoId = E.id("Todo");
     *   type TodoId = S.Schema.Type<typeof TodoId>;
     *
     *   const TodoTable = E.table({
     *     id: TodoId,
     *     title: E.NonEmptyString1000,
     *   });
     *   type TodoTable = S.Schema.Type<typeof TodoTable>;
     *
     *   const Database = E.database({
     *     todo: TodoTable,
     *
     *     // Prefix `_` makes the table local-only (it will not sync)
     *     _todo: TodoTable,
     *   });
     *   type Database = S.Schema.Type<typeof Database>;
     *
     *   const evolu = E.createEvolu(Database);
     */
    readonly createEvolu: <T extends EvoluSchema, I>(
      schema: S.Schema<T, I>,
      config?: Partial<EvoluConfig<T>>,
    ) => Evolu<T>;
  }
>() {
  static Common = Layer.effect(
    EvoluFactory,
    Effect.gen(function* (_) {
      const flushSync = yield* _(
        Effect.serviceOption(FlushSync),
        Effect.map(Option.getOrElse<FlushSync>(() => (callback) => callback())),
      );

      const context = Context.empty().pipe(
        Context.add(DbFactory, yield* _(DbFactory)),
        Context.add(NanoIdGenerator, yield* _(NanoIdGenerator)),
        Context.add(FlushSync, flushSync),
        Context.add(AppState, yield* _(AppState)),
      );

      // For hot/live reloading and future Evolu dynamic import.
      const instances = new Map<string, Evolu>();

      return EvoluFactory.of({
        createEvolu: <T extends EvoluSchema, I>(
          schema: S.Schema<T, I>,
          { indexes, initialData, ...config }: Partial<EvoluConfig<T>> = {},
        ): Evolu<T> => {
          const runtime = createRuntime(config);
          const name = config?.name || defaultConfig.name;
          const dbSchema: DbSchema = {
            tables: schemaToTables(schema),
            indexes: indexes || [],
          };
          let evolu = instances.get(name);
          if (evolu == null) {
            evolu = createEvolu(
              dbSchema,
              runtime,
              initialData as EvoluConfig["initialData"],
            ).pipe(Effect.provide(context), runtime.runSync);
            instances.set(name, evolu);
          } else {
            evolu.ensureSchema(dbSchema);
          }
          return evolu as Evolu<T>;
        },
      });
    }),
  );
}

const schemaToTables = (schema: S.Schema<any>) =>
  pipe(
    getPropertySignatures(schema),
    Record.toEntries,
    Arr.map(
      ([name, schema]): Table => ({
        name,
        columns: Object.keys(getPropertySignatures(schema)),
      }),
    ),
  );

// TODO: Simplify.
// https://discord.com/channels/795981131316985866/1218626687546294386/1218796529725476935
const getPropertySignatures = <I extends { [K in keyof A]: any }, A>(
  schema: S.Schema<A, I>,
): { [K in keyof A]: S.Schema<A[K], I[K]> } => {
  const out: Record<PropertyKey, S.Schema<any>> = {};
  const propertySignatures = AST.getPropertySignatures(schema.ast);
  for (let i = 0; i < propertySignatures.length; i++) {
    const propertySignature = propertySignatures[i];
    out[propertySignature.name] = make(propertySignature.type);
  }
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return out as any;
};

export interface EvoluConfig<T extends EvoluSchema = EvoluSchema>
  extends Config {
  /**
   * Use the `indexes` property to define SQLite indexes.
   *
   * Table and column names are not typed because Kysely doesn't support it.
   *
   * https://medium.com/@JasonWyatt/squeezing-performance-from-sqlite-indexes-indexes-c4e175f3c346
   *
   * @example
   *   const indexes = [
   *     createIndex("indexTodoCreatedAt").on("todo").column("createdAt"),
   *
   *     createIndex("indexTodoCategoryCreatedAt")
   *       .on("todoCategory")
   *       .column("createdAt"),
   *   ];
   */
  indexes: ReadonlyArray<Index>;

  /** Use this option to create initial data (fixtures). */
  initialData: (evolu: EvoluForInitialData<T>) => void;
}

interface EvoluForInitialData<T extends EvoluSchema = EvoluSchema> {
  create: Mutate<T, "create">;
  createOrUpdate: Mutate<T, "createOrUpdate">;
}

const createEvolu = (
  schema: DbSchema,
  runtime: ManagedRuntime.ManagedRuntime<Config, never>,
  initialData?: EvoluConfig["initialData"],
) =>
  Effect.gen(function* (_) {
    yield* _(Effect.logTrace("EvoluFactory createEvolu"));

    const config = yield* _(Config);
    const scope = yield* _(Scope.make());
    const errorStore = yield* _(makeStore<EvoluError | null>(null));
    const ownerStore = yield* _(makeStore<Owner | null>(null));
    const rowsStore = yield* _(makeRowsStore);
    const loadingPromises = new Map<Query, LoadingPromise>();
    const subscribedQueries = new Map<Query, number>();
    const nanoIdGenerator = yield* _(NanoIdGenerator);
    const flushSync = yield* _(FlushSync);
    const appState = yield* _(AppState);
    const syncStateStore = yield* _(
      makeStore<SyncState>({ _tag: "SyncStateInitial" }),
    );

    const handleAllErrors = <T>(effect: Effect.Effect<T, EvoluError, Config>) =>
      effect.pipe(
        Effect.catchAllDefect((error) =>
          Effect.fail<EvoluError>({ _tag: "UnexpectedError", error }),
        ),
        Effect.tapError(Effect.logError),
        Effect.tapError(errorStore.setState),
      );

    // TODO: Ask the Effect team for review.
    const runFork = flow(handleAllErrors, runtime.runFork);
    const runSync = flow(handleAllErrors, runtime.runSync);
    const runPromise = flow(handleAllErrors, runtime.runPromise);

    const db = yield* _(
      DbFactory,
      Effect.flatMap(({ createDb }) => createDb),
    );
    Scope.addFinalizer(scope, db.dispose());

    const initialDataAsMutations = initialData
      ? yield* _(
          initialDataToMutations(initialData),
          Effect.provideService(NanoIdGenerator, nanoIdGenerator),
        )
      : [];

    const onSyncStateChange = (state: SyncState) => {
      syncStateStore.setState(state).pipe(runFork);
    };

    db.init(schema, initialDataAsMutations, onSyncStateChange).pipe(
      Effect.flatMap(ownerStore.setState),
      Effect.catchTag("NotSupportedPlatformError", () => Effect.void), // no-op
      runFork,
    );

    const appStateReset = yield* _(
      appState.init({
        onRequestSync: () => {
          db.sync([...subscribedQueries.keys()]).pipe(
            Effect.flatMap(handlePatches({ flushSync: false })),
            runFork,
          );
        },
        reloadUrl: config.reloadUrl,
      }),
    );

    const handlePatches =
      (options: { readonly flushSync: boolean }) =>
      (patches: ReadonlyArray<QueryPatches>) =>
        Effect.logDebug(["Evolu handlePatches", { patches }]).pipe(
          Effect.zipRight(rowsStoreStateFromPatches(patches)),
          Effect.tap((nextState) =>
            Effect.forEach(patches, ({ query }) =>
              resolveLoadingPromises(
                query,
                nextState.get(query) || emptyRows(),
              ),
            ),
          ),
          Effect.tap((nextState) => {
            if (options.flushSync) {
              flushSync(() => {
                rowsStore.setState(nextState).pipe(runSync);
              });
            } else {
              rowsStore.setState(nextState).pipe(runSync);
            }
          }),
        );

    const rowsStoreStateFromPatches = (patches: ReadonlyArray<QueryPatches>) =>
      Effect.sync((): RowsStoreState => {
        const rowsStoreState = rowsStore.getState();
        if (patches.length === 0) return rowsStoreState;
        const queriesRows = Arr.map(
          patches,
          ({ query, patches }): [Query, ReadonlyArray<Row>] => [
            query,
            applyPatches(patches, rowsStoreState.get(query) || emptyRows()),
          ],
        );
        return new Map([...rowsStoreState, ...queriesRows]);
      });

    const resolveLoadingPromises = (query: Query, rows: ReadonlyArray<Row>) =>
      Effect.sync(() => {
        const loadingPromise = loadingPromises.get(query);
        if (!loadingPromise) return;
        const result = queryResultFromRows(rows);
        if (loadingPromise.promise.status !== "fulfilled") {
          loadingPromise.resolve(result);
        } else {
          // A promise can't be fulfilled 2x, so we need a new one.
          loadingPromise.promise = Promise.resolve(result);
        }
        /**
         * "For example, a data framework can set the status and value fields on
         * a promise preemptively, before passing to React, so that React can
         * unwrap it without waiting a microtask."
         * https://github.com/acdlite/rfcs/blob/first-class-promises/text/0000-first-class-support-for-promises.md
         */
        Object.assign(loadingPromise, { status: "fulfilled", value: result });
        if (loadingPromise.releaseOnResolve) {
          loadingPromises.delete(query);
        }
      });

    /**
     * We can't delete loading promises in `resolveLoadingPromises` because they
     * must be cached, so repeated calls to `loadQuery` will always return the
     * same promise until the data changes, and we also can't cache them forever
     * because only subscribed queries are automatically updated (reactivity is
     * expensive) hence this function must be called manually on any mutation.
     */
    const releaseUnsubscribedLoadingPromises = () => {
      [...loadingPromises.entries()]
        .filter(([query]) => !subscribedQueries.has(query))
        .forEach(([query, loadingPromise]) => {
          if (loadingPromise.promise.status === "fulfilled") {
            loadingPromises.delete(query);
          } else {
            loadingPromise.releaseOnResolve = true;
          }
        });
    };

    const mutate = ((): Mutate => {
      let queue: ReadonlyArray<[Mutation, MutateOnComplete | undefined]> = [];
      return (table, { id, ...values }, onComplete) => {
        Effect.logDebug(["Evolu mutate", { table, id, values }]).pipe(runSync);
        const isInsert = id == null;
        if (isInsert) id = nanoIdGenerator.rowId.pipe(runSync);
        queue = [...queue, [{ table, id, values, isInsert }, onComplete]];
        if (queue.length === 1)
          queueMicrotask(() => {
            const [mutations, onCompletes] = Arr.unzip(queue);
            queue = [];
            const onCompletesDef = onCompletes.filter(Predicate.isNotUndefined);
            releaseUnsubscribedLoadingPromises();
            db.mutate(mutations, [...subscribedQueries.keys()]).pipe(
              Effect.flatMap(
                /**
                 * The flushSync is for onComplete handlers only. For example,
                 * with React, when we want to focus on a node created by a
                 * mutation, we must ensure all DOM changes are flushed
                 * synchronously.
                 */
                handlePatches({ flushSync: onCompletesDef.length > 0 }),
              ),
              Effect.tap(() => {
                onCompletesDef.forEach((onComplete) => {
                  onComplete();
                });
              }),
              runFork,
            );
          });
        return { id };
      };
    })();

    const evolu: Evolu = {
      subscribeError: errorStore.subscribe,
      getError: errorStore.getState,

      createQuery: (queryCallback, options) =>
        pipe(
          queryCallback(kysely).compile(),
          (compiledQuery): SqliteQuery => {
            if (isSqlMutation(compiledQuery.sql))
              throw new Error(
                "SQL mutation (INSERT, UPDATE, DELETE, etc.) isn't allowed in the Evolu `createQuery` function. Kysely suggests it because there is no read-only Kysely yet, and removing such an API is not possible. For mutations, use Evolu mutation API.",
              );
            const parameters = compiledQuery.parameters as NonNullable<
              SqliteQuery["parameters"]
            >;
            return {
              sql: compiledQuery.sql,
              parameters,
              ...(options && { options }),
            };
          },
          (query) => serializeQuery(query),
        ),

      loadQuery: (() => {
        let queue: ReadonlyArray<Query> = [];

        return <R extends Row>(query: Query<R>): Promise<QueryResult<R>> => {
          Effect.logDebug([
            "Evolu loadQuery",
            { query: deserializeQuery(query) },
          ]).pipe(runSync);
          let isNew = false;
          let loadingPromise = loadingPromises.get(query);
          if (!loadingPromise) {
            isNew = true;
            let resolve: LoadingPromise["resolve"] = constVoid;
            const promise: LoadingPromise["promise"] = new Promise(
              (_resolve) => {
                resolve = _resolve;
              },
            );
            loadingPromise = { resolve, promise, releaseOnResolve: false };
            loadingPromises.set(query, loadingPromise);
          }
          if (isNew) queue = [...queue, query];
          if (queue.length === 1) {
            queueMicrotask(() => {
              db.loadQueries(queue).pipe(
                Effect.flatMap(handlePatches({ flushSync: false })),
                runFork,
              );
              queue = [];
            });
          }
          return loadingPromise.promise as Promise<QueryResult<R>>;
        };
      })(),

      loadQueries: <R extends Row, Q extends Queries<R>>(
        queries: [...Q],
      ): [...QueryResultsPromisesFromQueries<Q>] =>
        queries.map(evolu.loadQuery) as [...QueryResultsPromisesFromQueries<Q>],

      subscribeQuery: (query) => (listener) => {
        subscribedQueries.set(
          query,
          Number.increment(subscribedQueries.get(query) ?? 0),
        );
        const unsubscribe = rowsStore.subscribe(listener);

        return () => {
          const count = subscribedQueries.get(query);
          if (count != null && count > 1)
            subscribedQueries.set(query, Number.decrement(count));
          else subscribedQueries.delete(query);
          unsubscribe();
        };
      },

      getQuery: <R extends Row>(query: Query<R>): QueryResult<R> =>
        queryResultFromRows(
          rowsStore.getState().get(query) || emptyRows(),
        ) as QueryResult<R>,

      subscribeOwner: ownerStore.subscribe,
      getOwner: ownerStore.getState,

      subscribeSyncState: syncStateStore.subscribe,
      getSyncState: syncStateStore.getState,

      create: mutate as Mutate<EvoluSchema, "create">,
      update: mutate,
      createOrUpdate: mutate as Mutate<EvoluSchema, "createOrUpdate">,

      resetOwner: () => {
        db.resetOwner().pipe(Effect.zipRight(appStateReset.reset), runFork);
      },

      restoreOwner: (mnemonic) => {
        db.restoreOwner(schema, mnemonic).pipe(
          Effect.zipRight(appStateReset.reset),
          runFork,
        );
      },

      ensureSchema: (schema) => {
        db.ensureSchema(schema).pipe(runFork);
      },

      dispose: () =>
        Effect.logTrace("dispose Evolu").pipe(
          Effect.zipRight(Scope.close(scope, Exit.succeed("Evolu disposed"))),
          runPromise,
        ),
    };

    return evolu;
  });

const initialDataToMutations = (initialData: EvoluConfig["initialData"]) =>
  Effect.map(NanoIdGenerator, (nanoIdGenerator) => {
    const mutations: Mutation[] = [];
    const mutate: Mutate = (table, { id, ...values }) => {
      if (id == null) id = nanoIdGenerator.rowId.pipe(Effect.runSync) as never;
      mutations.push({ isInsert: true, id, table: table as string, values });
      return { id };
    };
    const evolu: EvoluForInitialData = {
      create: mutate as Mutate<EvoluSchema, "create">,
      createOrUpdate: mutate as Mutate<EvoluSchema, "createOrUpdate">,
    };
    initialData(evolu);
    return mutations;
  });

interface LoadingPromise {
  /** Promise with props for the upcoming React use hook. */
  promise: Promise<QueryResult> & {
    status?: "pending" | "fulfilled" | "rejected";
    value?: QueryResult;
    reason?: unknown;
  };
  resolve: (rows: QueryResult) => void;
  releaseOnResolve: boolean;
}

// https://kysely.dev/docs/recipes/splitting-query-building-and-execution
const kysely = new Kysely.Kysely({
  dialect: {
    createAdapter: () => new Kysely.SqliteAdapter(),
    createDriver: () => new Kysely.DummyDriver(),
    createIntrospector() {
      throw "Not implemeneted";
    },
    createQueryCompiler: () => new Kysely.SqliteQueryCompiler(),
  },
});

const createIndex = kysely.schema.createIndex.bind(kysely.schema);
type CreateIndex = typeof createIndex;

/**
 * Create SQLite indexes.
 *
 * See https://www.evolu.dev/docs/indexes
 *
 * ### Example
 *
 * ```ts
 * const indexes = createIndexes((create) => [
 *   create("indexTodoCreatedAt").on("todo").column("createdAt"),
 *   create("indexTodoCategoryCreatedAt")
 *     .on("todoCategory")
 *     .column("createdAt"),
 * ]);
 * ```
 */
export const createIndexes = (
  callback: (
    create: CreateIndex,
  ) => ReadonlyArray<Kysely.CreateIndexBuilder<any>>,
): ReadonlyArray<Index> =>
  callback(createIndex).map(
    (index): Index => ({
      name: index.toOperationNode().name.name,
      sql: index.compile().sql,
    }),
  );

/** Create a namespaced lock name. */
export const lockName = (name: string): Effect.Effect<string, never, Config> =>
  Effect.map(Config, (config) => `evolu:${config.name}:${name}`);
