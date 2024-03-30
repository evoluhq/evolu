import * as S from "@effect/schema/Schema";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Function from "effect/Function";
import { pipe } from "effect/Function";
import * as O from "effect/Option";
import * as GlobalValue from "effect/GlobalValue";
import * as Layer from "effect/Layer";
import * as Match from "effect/Match";
import * as Number from "effect/Number";
import * as ReadonlyArray from "effect/ReadonlyArray";
import * as Kysely from "kysely";
import { Config, ConfigLive } from "./Config.js";
import { Mnemonic, NanoIdGenerator, NanoIdGeneratorLive } from "./Crypto.js";
import {
  DatabaseSchema,
  Queries,
  Query,
  QueryResult,
  QueryResultsPromisesFromQueries,
  Row,
  RowsStore,
  RowsStoreLive,
  emptyRows,
  queryResultFromRows,
  schemaToTables,
  serializeQuery,
} from "./Db.js";
import { DbWorker, DbWorkerOutputOnQuery, Mutation } from "./DbWorker.js";
import { applyPatches } from "./Diff.js";
import { EvoluError, makeErrorStore } from "./ErrorStore.js";
import { SqliteBoolean, SqliteDate } from "./Model.js";
import { OnCompletes, OnCompletesLive } from "./OnCompletes.js";
import { Owner } from "./Owner.js";
import { AppState, FlushSync } from "./Platform.js";
import {
  Index,
  SqliteQuery,
  SqliteQueryOptions,
  isSqlMutation,
} from "./Sqlite.js";
import { Store, Unsubscribe, makeStore } from "./Store.js";
import { SyncState } from "./SyncWorker.js";

export interface Evolu<S extends DatabaseSchema = DatabaseSchema> {
  /**
   * Subscribe to {@link EvoluError} changes.
   *
   * @example
   *   const unsubscribe = evolu.subscribeError(() => {
   *     const error = evolu.getError();
   *     console.log(error);
   *   });
   */
  readonly subscribeError: Store<O.Option<EvoluError>>["subscribe"];

  /** Get {@link EvoluError}. */
  readonly getError: Store<O.Option<EvoluError>>["getState"];

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
  readonly createQuery: CreateQuery<S>;

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
  readonly loadQuery: LoadQuery;

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
  readonly subscribeQuery: SubscribedQueries["subscribeQuery"];

  /**
   * Get {@link Query} {@link QueryResult}.
   *
   * @example
   *   const unsubscribe = evolu.subscribeQuery(allTodos)(() => {
   *     const { rows } = evolu.getQuery(allTodos);
   *   });
   */
  readonly getQuery: SubscribedQueries["getQuery"];

  /**
   * Subscribe to {@link Owner} changes.
   *
   * @example
   *   const unsubscribe = evolu.subscribeOwner(() => {
   *     const owner = evolu.getOwner();
   *   });
   */
  readonly subscribeOwner: Store<O.Option<Owner>>["subscribe"];

  /**
   * Get {@link Owner}.
   *
   * @example
   *   const unsubscribe = evolu.subscribeOwner(() => {
   *     const owner = evolu.getOwner();
   *   });
   */
  readonly getOwner: Store<O.Option<Owner>>["getState"];

  /**
   * Subscribe to {@link SyncState} changes.
   *
   * @example
   *   const unsubscribe = evolu.subscribeSyncState(() => {
   *     const syncState = evolu.getSyncState();
   *   });
   */
  readonly subscribeSyncState: Store<SyncState>["subscribe"];

  /**
   * Get {@link SyncState}.
   *
   * @example
   *   const unsubscribe = evolu.subscribeSyncState(() => {
   *     const syncState = evolu.getSyncState();
   *   });
   */
  readonly getSyncState: Store<SyncState>["getState"];

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
  create: Create<S>;

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
  update: Update<S>;

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
  createOrUpdate: CreateOrUpdate<S>;

  /**
   * Delete {@link Owner} and all their data from the current device. After the
   * deletion, Evolu will purge the application state. For browsers, this will
   * reload all tabs using Evolu. For native apps, it will restart the app.
   */
  readonly resetOwner: () => void;

  /** Restore {@link Owner} with all their synced data. */
  readonly restoreOwner: (mnemonic: Mnemonic) => void;

  /**
   * Ensure tables and columns defined in {@link DatabaseSchema} exist in the
   * database.
   */
  readonly ensureSchema: <From, To extends S>(
    schema: S.Schema<To, From>,
    indexes?: ReadonlyArray<Index>,
  ) => void;

  /**
   * Force sync with Evolu Server.
   *
   * Evolu syncs on every mutation, tab focus, and network reconnect, so it's
   * generally not required to sync manually, but if you need it, you can do
   * it.
   */
  readonly sync: () => void;
}

export const Evolu = Context.GenericTag<Evolu>("@services/Evolu");

type CreateQuery<S extends DatabaseSchema> = <R extends Row>(
  queryCallback: QueryCallback<S, R>,
  options?: SqliteQueryOptions,
) => Query<R>;

type QueryCallback<S extends DatabaseSchema, R extends Row> = (
  db: Pick<
    Kysely.Kysely<QuerySchema<S>>,
    "selectFrom" | "fn" | "with" | "withRecursive"
  >,
) => Kysely.SelectQueryBuilder<any, any, R>;

type QuerySchema<S extends DatabaseSchema> = {
  readonly [Table in keyof S]: NullableExceptForIdAndAutomaticColumns<{
    readonly [Column in keyof S[Table]]: S[Table][Column];
  }>;
};

type NullableExceptForIdAndAutomaticColumns<T> = {
  readonly [K in keyof T]: K extends "id" | "createdAt" | "updatedAt"
    ? T[K]
    : T[K] | null;
};

// https://kysely.dev/docs/recipes/splitting-query-building-and-execution
const kysely = new Kysely.Kysely<QuerySchema<DatabaseSchema>>({
  dialect: {
    createAdapter: (): Kysely.DialectAdapter => new Kysely.SqliteAdapter(),
    createDriver: (): Kysely.Driver => new Kysely.DummyDriver(),
    createIntrospector(): Kysely.DatabaseIntrospector {
      throw "Not implemeneted";
    },
    createQueryCompiler: (): Kysely.QueryCompiler =>
      new Kysely.SqliteQueryCompiler(),
  },
});

export const createIndex = kysely.schema.createIndex.bind(kysely.schema);

export const makeCreateQuery =
  <S extends DatabaseSchema = DatabaseSchema>(): CreateQuery<S> =>
  <R extends Row>(
    queryCallback: QueryCallback<S, R>,
    options?: SqliteQueryOptions,
  ) =>
    pipe(
      queryCallback(kysely as Kysely.Kysely<QuerySchema<S>>).compile(),
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
      (query) => serializeQuery<R>(query),
    );

export interface LoadingPromises {
  readonly get: <R extends Row>(
    query: Query<R>,
  ) => {
    readonly promise: LoadingPromise<R>;
    readonly isNew: boolean;
  };

  readonly resolve: <R extends Row>(
    query: Query<R>,
    rows: ReadonlyArray<R>,
  ) => void;

  /**
   * Release all unsubscribed queries on mutation because only subscribed
   * queries are automatically updated.
   */
  readonly release: () => void;
}

export const LoadingPromises = Context.GenericTag<LoadingPromises>(
  "@services/LoadingPromises",
);

export type LoadingPromise<R extends Row> = Promise<QueryResult<R>> & {
  status?: "pending" | "fulfilled" | "rejected";
  value?: QueryResult<R>;
  reason?: unknown;
};

export const LoadingPromiseLive = Layer.effect(
  LoadingPromises,
  Effect.gen(function* (_) {
    interface LoadingPromiseWithResolve<R extends Row> {
      promise: LoadingPromise<R>;
      readonly resolve: Resolve<R>;
      releaseOnResolve: boolean;
    }
    type Resolve<R extends Row> = (rows: QueryResult<R>) => void;

    const subscribedQueries = yield* _(SubscribedQueries);
    const promises = new Map<Query, LoadingPromiseWithResolve<Row>>();

    return LoadingPromises.of({
      get<R extends Row>(query: Query<R>) {
        let isNew = false;
        let promiseWithResolve = promises.get(query);

        if (!promiseWithResolve) {
          isNew = true;
          let resolve: Resolve<Row> = Function.constVoid;
          const promise: LoadingPromise<Row> = new Promise((_resolve) => {
            resolve = _resolve;
          });
          promiseWithResolve = { promise, resolve, releaseOnResolve: false };
          promises.set(query, promiseWithResolve);
        }

        return {
          promise: promiseWithResolve.promise as LoadingPromise<R>,
          isNew,
        };
      },

      resolve(query, rows) {
        const promiseWithResolve = promises.get(query);
        if (!promiseWithResolve) return;
        const result = queryResultFromRows(rows);
        if (promiseWithResolve.promise.status !== "fulfilled")
          promiseWithResolve.resolve(result);
        else promiseWithResolve.promise = Promise.resolve(result);
        setPromiseAsResolved(promiseWithResolve.promise)(result);
        if (promiseWithResolve.releaseOnResolve) promises.delete(query);
      },

      release() {
        const keep = subscribedQueries.getSubscribedQueries();
        promises.forEach((promiseWithResolve, query) => {
          if (keep.includes(query)) return;
          if (promiseWithResolve.promise.status === "fulfilled")
            promises.delete(query);
          else promiseWithResolve.releaseOnResolve = true;
        });
      },
    });
  }),
);

// "For example, a data framework can set the status and value fields on a promise
// preemptively, before passing to React, so that React can unwrap it without waiting
// a microtask."
// https://github.com/acdlite/rfcs/blob/first-class-promises/text/0000-first-class-support-for-promises.md
const setPromiseAsResolved =
  <T>(promise: Promise<T>) =>
  (value: unknown): void => {
    Object.assign(promise, { status: "fulfilled", value });
  };

type LoadQuery = <R extends Row>(query: Query<R>) => Promise<QueryResult<R>>;

const LoadQuery = Context.GenericTag<LoadQuery>("@services/LoadQuery");

const LoadQueryLive = Layer.effect(
  LoadQuery,
  Effect.gen(function* (_) {
    const loadingPromises = yield* _(LoadingPromises);
    const dbWorker = yield* _(DbWorker);
    let queries: ReadonlyArray<Query> = [];

    return LoadQuery.of((query) => {
      const { promise, isNew } = loadingPromises.get(query);
      if (isNew) queries = [...queries, query];
      if (queries.length === 1) {
        queueMicrotask(() => {
          if (ReadonlyArray.isNonEmptyReadonlyArray(queries))
            dbWorker.postMessage({ _tag: "query", queries });
          queries = [];
        });
      }
      return promise;
    });
  }),
);

type OnQuery = (
  dbWorkerOutputOnQuery: DbWorkerOutputOnQuery,
) => Effect.Effect<void>;

const OnQuery = Context.GenericTag<OnQuery>("@services/OnQuery");

const OnQueryLive = Layer.effect(
  OnQuery,
  Effect.gen(function* (_) {
    const rowsStore = yield* _(RowsStore);
    const loadingPromises = yield* _(LoadingPromises);
    const flushSync = pipe(
      Effect.serviceOption(FlushSync),
      Effect.map(O.getOrElse((): FlushSync => (callback) => callback())),
      Effect.runSync,
    );
    const onCompletes = yield* _(OnCompletes);

    return OnQuery.of(({ queriesPatches, onCompleteIds }) =>
      Effect.gen(function* (_) {
        const currentState = rowsStore.getState();
        const nextState = pipe(
          queriesPatches,
          ReadonlyArray.map(
            ({ query, patches }) =>
              [
                query,
                applyPatches(patches)(currentState.get(query) || emptyRows()),
              ] as const,
          ),
          (map) => new Map([...currentState, ...map]),
        );

        queriesPatches.forEach(({ query }) => {
          loadingPromises.resolve(query, nextState.get(query) || emptyRows());
        });

        // No mutation is using onComplete, so we don't need flushSync.
        if (onCompleteIds.length === 0) {
          yield* _(rowsStore.setState(nextState));
          return;
        }

        flushSync(() => rowsStore.setState(nextState).pipe(Effect.runSync));

        yield* _(onCompletes.complete(onCompleteIds));
      }),
    );
  }),
);

export interface SubscribedQueries {
  readonly subscribeQuery: (query: Query) => Store<Row>["subscribe"];
  readonly getQuery: <R extends Row>(query: Query<R>) => QueryResult<R>;
  readonly getSubscribedQueries: () => Queries;
}

export const SubscribedQueries = Context.GenericTag<SubscribedQueries>(
  "@services/SubscribedQueries",
);

export const SubscribedQueriesLive = Layer.effect(
  SubscribedQueries,
  Effect.gen(function* (_) {
    const rowsStore = yield* _(RowsStore);
    const subscribedQueries = new Map<Query, number>();

    return SubscribedQueries.of({
      subscribeQuery:
        (query) =>
        (listener): Unsubscribe => {
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

      getSubscribedQueries: () =>
        ReadonlyArray.fromIterable(subscribedQueries.keys()),
    });
  }),
);

export type Create<S extends DatabaseSchema = DatabaseSchema> = Mutate<
  S,
  "create"
>;

export type Update<S extends DatabaseSchema = DatabaseSchema> = Mutate<
  S,
  "update"
>;

export type CreateOrUpdate<S extends DatabaseSchema = DatabaseSchema> = Mutate<
  S,
  "createOrUpdate"
>;

export type Mutate<
  S extends DatabaseSchema = DatabaseSchema,
  Mode extends "create" | "update" | "createOrUpdate" = "update",
> = <K extends keyof S>(
  table: K,
  values: Kysely.Simplify<
    Mode extends "create"
      ? PartialForNullable<
          Castable<Omit<S[K], "id" | "createdAt" | "updatedAt" | "isDeleted">>
        >
      : Mode extends "update"
        ? Partial<Castable<Omit<S[K], "id" | "createdAt" | "updatedAt">>> & {
            readonly id: S[K]["id"];
          }
        : PartialForNullable<
            Castable<Omit<S[K], "createdAt" | "updatedAt" | "isDeleted">>
          >
  >,
  onComplete?: () => void,
) => {
  readonly id: S[K]["id"];
};

export const Mutate = Context.GenericTag<Mutate>("@services/Mutate");

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
 *
 * For {@link SqliteBoolean}, you can use JavaScript boolean. For
 * {@link SqliteDate}, you can use JavaScript Date.
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

const MutateLive = Layer.effect(
  Mutate,
  Effect.gen(function* (_) {
    const { nanoid } = yield* _(NanoIdGenerator);
    const onCompletes = yield* _(OnCompletes);
    const subscribedQueries = yield* _(SubscribedQueries);
    const loadingPromises = yield* _(LoadingPromises);
    const dbWorker = yield* _(DbWorker);
    let mutations: ReadonlyArray<Mutation> = [];

    return Mutate.of((table, { id, ...values }, onComplete) => {
      const isInsert = id == null;
      if (isInsert) id = Effect.runSync(nanoid) as never;

      const onCompleteId = onComplete
        ? onCompletes.add(onComplete).pipe(Effect.runSync)
        : null;

      mutations = [
        ...mutations,
        {
          table: table.toString(),
          id,
          values,
          isInsert,
          onCompleteId,
        },
      ];

      if (mutations.length === 1)
        queueMicrotask(() => {
          if (ReadonlyArray.isNonEmptyReadonlyArray(mutations))
            dbWorker.postMessage({
              _tag: "mutate",
              mutations,
              queries: subscribedQueries.getSubscribedQueries(),
            });
          loadingPromises.release();
          mutations = [];
        });

      return { id };
    });
  }),
);

/** EvoluCommon is without side effects, so it's unit-testable. */
const EvoluCommon = Layer.effect(
  Evolu,
  Effect.gen(function* (_) {
    const dbWorker = yield* _(DbWorker);
    const errorStore = yield* _(makeErrorStore);
    const loadQuery = yield* _(LoadQuery);
    const onQuery = yield* _(OnQuery);
    const { subscribeQuery, getQuery, getSubscribedQueries } =
      yield* _(SubscribedQueries);
    const syncStateStore = yield* _(
      makeStore<SyncState>({ _tag: "SyncStateInitial" }),
    );
    const mutate = yield* _(Mutate);
    const ownerStore = yield* _(makeStore<O.Option<Owner>>(O.none()));
    const loadingPromises = yield* _(LoadingPromises);
    const appState = yield* _(AppState);

    dbWorker.onMessage = (output): void =>
      Match.value(output).pipe(
        Match.tagsExhaustive({
          onError: ({ error }) => errorStore.setState(O.some(error)),
          onQuery,
          onOwner: ({ owner }) => ownerStore.setState(O.some(owner)),
          onSyncState: ({ state }) => syncStateStore.setState(state),
          onReceive: () =>
            Effect.sync(() => {
              loadingPromises.release();
              const queries = getSubscribedQueries();
              if (ReadonlyArray.isNonEmptyReadonlyArray(queries))
                dbWorker.postMessage({ _tag: "query", queries });
            }),
          onResetOrRestore: () => appState.reset,
        }),
        Effect.runSync,
      );

    dbWorker.postMessage({
      _tag: "init",
      config: yield* _(Config),
    });

    const sync = (): void => {
      dbWorker.postMessage({ _tag: "sync", queries: getSubscribedQueries() });
    };

    appState.init({ onRequestSync: sync });
    sync();

    return Evolu.of({
      subscribeError: errorStore.subscribe,
      getError: errorStore.getState,

      createQuery: makeCreateQuery(),
      loadQuery,

      loadQueries: <R extends Row, Q extends Queries<R>>(queries: [...Q]) =>
        queries.map(loadQuery) as [...QueryResultsPromisesFromQueries<Q>],

      subscribeQuery,
      getQuery,

      subscribeOwner: ownerStore.subscribe,
      getOwner: ownerStore.getState,

      subscribeSyncState: syncStateStore.subscribe,
      getSyncState: syncStateStore.getState,

      create: mutate as Mutate<DatabaseSchema, "create">,
      update: mutate,
      createOrUpdate: mutate as Mutate<DatabaseSchema, "createOrUpdate">,

      resetOwner: () => dbWorker.postMessage({ _tag: "reset" }),

      restoreOwner: (mnemonic) =>
        dbWorker.postMessage({ _tag: "reset", mnemonic }),

      ensureSchema: (schema, indexes = []) =>
        dbWorker.postMessage({
          _tag: "ensureSchema",
          tables: schemaToTables(schema),
          indexes,
        }),

      sync,
    });
  }),
).pipe(
  Layer.provide(Layer.mergeAll(LoadQueryLive, OnQueryLive, MutateLive)),
  Layer.provide(LoadingPromiseLive),
  Layer.provide(SubscribedQueriesLive),
  Layer.provide(Layer.merge(RowsStoreLive, OnCompletesLive)),
);

export const EvoluCommonLive = EvoluCommon.pipe(
  Layer.provide(NanoIdGeneratorLive),
);

/**
 * The recipe for creating Evolu for a platform and UI library:
 *
 * 1. Export everything from "@evolu/common/public"
 * 2. Export platform-specific parseMnemonic. If the platform supports lazy import,
 *    use it because dictionaries have a few hundred KBs.
 * 3. Export `createEvolu` for a platform. The TS docs must be copy-pasted, and
 *    remember to update the import.
 * 4. Export UI library API code.
 */

export const makeCreateEvolu =
  (EvoluLive: Layer.Layer<Evolu, never, Config>) =>
  <From, To extends DatabaseSchema>(
    schema: S.Schema<To, From>,
    config?: Partial<Config>,
  ): Evolu<To> => {
    // For https://nextjs.org/docs/architecture/fast-refresh etc.
    const evolu = GlobalValue.globalValue("@evolu/common", () =>
      Evolu.pipe(
        Effect.provide(EvoluLive),
        Effect.provide(ConfigLive(config)),
        Effect.runSync,
      ),
    );

    const indexes = config?.indexes?.map(
      (index): Index => ({
        name: index.toOperationNode().name.name,
        sql: index.compile().sql,
      }),
    );

    evolu.ensureSchema(schema, indexes);
    return evolu as Evolu<To>;
  };
