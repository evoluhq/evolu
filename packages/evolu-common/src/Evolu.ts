import * as S from "@effect/schema/Schema";
import {
  Context,
  Effect,
  Function,
  Layer,
  Match,
  Number,
  ReadonlyArray,
  pipe,
} from "effect";
import * as Kysely from "kysely";
import { Config } from "./Config.js";
import { Time, TimeLive } from "./Crdt.js";
import { Bip39, Mnemonic, NanoId, NanoIdLive } from "./Crypto.js";
import {
  Query,
  QueryResult,
  Row,
  RowsStore,
  RowsStoreLive,
  Schema,
  Tables,
  emptyRows,
  queryResultFromRows,
  schemaToTables,
  serializeQuery,
} from "./Db.js";
import { DbWorker, DbWorkerOutputOnQuery, Mutation } from "./DbWorker.js";
import { applyPatches } from "./Diff.js";
import { ErrorStore, ErrorStoreLive } from "./ErrorStore.js";
import { Id, SqliteBoolean, SqliteDate, cast } from "./Model.js";
import { OnCompletes, OnCompletesLive } from "./OnCompletes.js";
import { Owner } from "./Owner.js";
import { FlushSync } from "./Platform.js";
import { SqliteQuery } from "./Sqlite.js";
import { Store, Unsubscribe, makeStore } from "./Store.js";
import { SyncState } from "./SyncWorker.js";

export interface Evolu<S extends Schema> {
  readonly subscribeError: ErrorStore["subscribe"];
  readonly getError: ErrorStore["getState"];

  readonly createQuery: CreateQuery<S>;
  readonly loadQuery: LoadQuery;

  readonly subscribeQuery: SubscribedQueries["subscribeQuery"];
  readonly getQuery: SubscribedQueries["getQuery"];

  readonly subscribeOwner: Store<Owner | null>["subscribe"];
  readonly getOwner: Store<Owner | null>["getState"];

  readonly subscribeSyncState: Store<SyncState>["subscribe"];
  readonly getSyncState: Store<SyncState>["getState"];

  create: Mutate<S, "create">;
  update: Mutate<S, "update">;

  /**
   * Delete all local data from the current device.
   * After the deletion, Evolu reloads all browser tabs that use Evolu.
   */
  readonly resetOwner: () => void;

  readonly parseMnemonic: Bip39["parse"];

  /**
   * Restore `Owner` with synced data from different devices.
   */
  readonly restoreOwner: (mnemonic: Mnemonic) => void;

  /** Ensure schema ad-hoc for hot reloading. */
  readonly ensureSchema: (tables: Tables) => void;
}

export const Evolu = <S extends Schema>(): Context.Tag<Evolu<S>, Evolu<S>> =>
  Context.Tag<Evolu<S>>("evolu/Evolu");

type CreateQuery<S extends Schema> = <R extends Row>(
  queryCallback: QueryCallback<S, R>,
) => Query<R>;

type QueryCallback<S extends Schema, QueryRow> = (
  db: Pick<Kysely.Kysely<QuerySchema<S>>, "selectFrom" | "fn">,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
) => Kysely.SelectQueryBuilder<S, any, QueryRow>;

type QuerySchema<S extends Schema> = {
  readonly [Table in keyof S]: NullableExceptId<
    {
      readonly [Column in keyof S[Table]]: S[Table][Column];
    } & CommonColumns
  >;
};

type NullableExceptId<T> = {
  readonly [K in keyof T]: K extends "id" ? T[K] : T[K] | null;
};

export interface CommonColumns {
  readonly createdAt: SqliteDate;
  readonly updatedAt: SqliteDate;
  readonly isDeleted: SqliteBoolean;
}

const kysely = new Kysely.Kysely<QuerySchema<Schema>>({
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

export const makeCreateQuery =
  <S extends Schema>(): CreateQuery<S> =>
  <R extends Row>(queryCallback: QueryCallback<S, R>) =>
    pipe(
      queryCallback(kysely as Kysely.Kysely<QuerySchema<S>>).compile(),
      ({ sql, parameters }): SqliteQuery => ({
        sql,
        parameters: parameters as SqliteQuery["parameters"],
      }),
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

  readonly release: () => void;
}

export const LoadingPromises = Context.Tag<LoadingPromises>(
  "evolu/LoadingPromises",
);

type LoadingPromise<R extends Row> = Promise<QueryResult<R>>;

export const LoadingPromisesLive = Layer.effect(
  LoadingPromises,
  Effect.sync(() => {
    interface LoadingPromiseWithResolve<R extends Row> {
      readonly promise: LoadingPromise<R>;
      readonly resolve: Resolve<R>;
      releaseOnResolve: boolean;
    }
    type Resolve<R extends Row> = (rows: QueryResult<R>) => void;

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
          promiseWithResolve = {
            promise,
            resolve: (rows): void => {
              setLoadingPromiseProp(promise, rows);
              resolve(rows);
            },
            releaseOnResolve: false,
          };
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
        if (promiseWithResolve.releaseOnResolve) promises.delete(query);
        promiseWithResolve.resolve(queryResultFromRows(rows));
      },

      /**
       * LoadingPromises caches promises until they are released.
       * Release must be called on any mutation.
       */
      release() {
        promises.forEach((promiseWithResolve, query) => {
          const isResolved =
            getLoadingPromiseProp(promiseWithResolve.promise) != null;
          if (isResolved) promises.delete(query);
          else promiseWithResolve.releaseOnResolve = true;
        });
      },
    });
  }),
);

// For React < 19. React 'use' Hook pattern.
const loadingPromiseProp = "evolu_QueryResult";

const setLoadingPromiseProp = <R extends Row>(
  promise: LoadingPromise<R>,
  result: QueryResult<R>,
): void => {
  void Object.assign(promise, { [loadingPromiseProp]: result });
};

export const getLoadingPromiseProp = <R extends Row>(
  promise: LoadingPromise<R>,
  // @ts-expect-error Promise has no such prop.
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
): QueryResult<R> | null => promise[loadingPromiseProp] || null;

type LoadQuery = <R extends Row>(query: Query<R>) => Promise<QueryResult<R>>;

const LoadQuery = Context.Tag<LoadQuery>("evolu/LoadQuery");

const LoadQueryLive = Layer.effect(
  LoadQuery,
  Effect.gen(function* (_) {
    const loadingPromises = yield* _(LoadingPromises);
    const dbWorker = yield* _(DbWorker);
    const queries: Query[] = [];

    return LoadQuery.of((query) => {
      const { promise, isNew } = loadingPromises.get(query);
      if (isNew) queries.push(query);
      if (queries.length === 1) {
        queueMicrotask(() => {
          if (ReadonlyArray.isNonEmptyReadonlyArray(queries))
            dbWorker.postMessage({ _tag: "query", queries });
          queries.length = 0;
        });
      }
      return promise;
    });
  }),
);

type OnQuery = (
  output: DbWorkerOutputOnQuery,
) => Effect.Effect<never, never, void>;

const OnQuery = Context.Tag<OnQuery>("evolu/OnQuery");

const OnQueryLive = Layer.effect(
  OnQuery,
  Effect.gen(function* (_) {
    const rowsStore = yield* _(RowsStore);
    const loadingPromises = yield* _(LoadingPromises);
    const flushSync = yield* _(FlushSync);
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
                applyPatches(patches)(currentState.get(query) || emptyRows),
              ] as const,
          ),
          (map) => new Map([...currentState, ...map]),
        );

        queriesPatches.forEach(({ query }) => {
          loadingPromises.resolve(query, nextState.get(query) || emptyRows);
        });

        // No mutation is using onComplete, so we don't need flushSync.
        if (onCompleteIds.length === 0) {
          yield* _(rowsStore.setState(nextState));
          return;
        }

        // TODO: yield* _(flushSync(rowsStore.setState(nextState)))
        flushSync(() => rowsStore.setState(nextState).pipe(Effect.runSync));
        yield* _(onCompletes.execute(onCompleteIds));
      }),
    );
  }),
);

interface SubscribedQueries {
  readonly subscribeQuery: (query: Query) => Store<Row>["subscribe"];

  readonly getQuery: <R extends Row>(query: Query<R>) => QueryResult<R>;

  readonly getSubscribedQueries: () => ReadonlyArray<Query>;
}

const SubscribedQueries = Context.Tag<SubscribedQueries>(
  "evolu/SubscribedQueries",
);

const SubscribedQueriesLive = Layer.effect(
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
          rowsStore.getState().get(query) || emptyRows,
        ) as QueryResult<R>,

      getSubscribedQueries: () =>
        ReadonlyArray.fromIterable(subscribedQueries.keys()),
    });
  }),
);

type Mutate<S extends Schema, Mode extends "create" | "update" = "update"> = <
  K extends keyof S,
>(
  table: K,
  values: Kysely.Simplify<
    Mode extends "create"
      ? PartialForNullable<Castable<Omit<S[K], "id">>>
      : Partial<
          Castable<Omit<S[K], "id"> & Pick<CommonColumns, "isDeleted">>
        > & { readonly id: S[K]["id"] }
  >,
  onComplete?: () => void,
) => {
  readonly id: S[K]["id"];
};

const Mutate = <S extends Schema>(): Context.Tag<Mutate<S>, Mutate<S>> =>
  Context.Tag<Mutate<S>>("evolu/Mutate");

// https://stackoverflow.com/a/54713648/233902
type PartialForNullable<
  T,
  NK extends keyof T = {
    [K in keyof T]: null extends T[K] ? K : never;
  }[keyof T],
  NP = Pick<T, Exclude<keyof T, NK>> & Partial<Pick<T, NK>>,
> = { [K in keyof NP]: NP[K] };

/**
 * SQLite doesn't support Date nor Boolean types, so Evolu emulates them
 * with {@link SqliteBoolean} and {@link SqliteDate}.
 *
 * For {@link SqliteBoolean}, you can use JavaScript boolean.
 * For {@link SqliteDate}, you can use JavaScript Date.
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

const MutateLive = <S extends Schema>(): Layer.Layer<
  NanoId | OnCompletes | Time | SubscribedQueries | LoadingPromises | DbWorker,
  never,
  Mutate<S>
> =>
  Layer.effect(
    Mutate<S>(),
    Effect.gen(function* (_) {
      const nanoid = yield* _(NanoId);
      const onCompletes = yield* _(OnCompletes);
      const time = yield* _(Time);
      const subscribedQueries = yield* _(SubscribedQueries);
      const loadingPromises = yield* _(LoadingPromises);
      const dbWorker = yield* _(DbWorker);
      const mutations: Array<Mutation> = [];

      return Mutate<S>().of((table, { id, ...values }, onComplete) => {
        const isInsert = id == null;
        if (isInsert) id = Effect.runSync(nanoid.nanoid) as never;

        const onCompleteId = onComplete
          ? onCompletes.add(onComplete).pipe(Effect.runSync)
          : null;

        mutations.push({
          table: table.toString(),
          id: id as Id,
          values,
          isInsert,
          now: cast(new Date(Effect.runSync(time.now))),
          onCompleteId,
        });

        if (mutations.length === 1)
          queueMicrotask(() => {
            const queries = subscribedQueries.getSubscribedQueries();
            if (ReadonlyArray.isNonEmptyReadonlyArray(mutations))
              dbWorker.postMessage({ _tag: "mutate", mutations, queries });
            mutations.length = 0;
            loadingPromises.release();
          });

        return { id: id as never };
      });
    }),
  );

export const EvoluLive = <From, To extends Schema>(
  schema: S.Schema<From, To>,
): Layer.Layer<
  DbWorker | FlushSync | Bip39 | Config, // | AppState,
  never,
  Evolu<To>
> =>
  Layer.effect(
    Evolu<To>(),
    Effect.gen(function* (_) {
      const dbWorker = yield* _(DbWorker);
      const errorStore = yield* _(ErrorStore);
      const loadQuery = yield* _(LoadQuery);
      const onQuery = yield* _(OnQuery);
      const subscribedQueries = yield* _(SubscribedQueries);
      const ownerStore = yield* _(makeStore<Owner | null>(null));
      const syncStateStore = yield* _(
        makeStore<SyncState>({ _tag: "SyncStateInitial" }),
      );
      const mutate = yield* _(Mutate<To>());
      const bip39 = yield* _(Bip39);
      const config = yield* _(Config);

      dbWorker.onMessage = (output): void =>
        Match.value(output).pipe(
          Match.tagsExhaustive({
            onError: ({ error }) => errorStore.setState(error),
            onQuery,
            onOwner: ({ owner }) => ownerStore.setState(owner),
            onSyncState: ({ state }) => syncStateStore.setState(state),
            onReceive: () => {
              const queries = subscribedQueries.getSubscribedQueries();
              if (ReadonlyArray.isNonEmptyReadonlyArray(queries))
                dbWorker.postMessage({ _tag: "query", queries });
              return Effect.succeed(void 0);
            },
            // TODO: appState.reset
            onResetOrRestore: () => Effect.succeed(void 0),
          }),
          Effect.runSync,
        );

      dbWorker.postMessage({
        _tag: "init",
        config,
        tables: schemaToTables(schema),
      });

      // appState.onFocus(() => {
      //   // `queries` to refresh subscribed queries when a tab is changed.
      //   dbWorker.postMessage({ _tag: "sync", queries: getSubscribedQueries() });
      // });

      // const sync = (): void =>
      //   dbWorker.postMessage({ _tag: "sync", queries: [] });
      // appState.onReconnect(sync);
      // sync();

      return Evolu<To>().of({
        subscribeError: errorStore.subscribe,
        getError: errorStore.getState,

        createQuery: makeCreateQuery<To>(),
        loadQuery,

        subscribeQuery: subscribedQueries.subscribeQuery,
        getQuery: subscribedQueries.getQuery,

        subscribeOwner: ownerStore.subscribe,
        getOwner: ownerStore.getState,

        subscribeSyncState: syncStateStore.subscribe,
        getSyncState: syncStateStore.getState,

        create: mutate as Mutate<To, "create">,
        update: mutate,

        resetOwner() {
          dbWorker.postMessage({ _tag: "reset" });
        },

        parseMnemonic: bip39.parse,

        restoreOwner(mnemonic) {
          dbWorker.postMessage({ _tag: "reset", mnemonic });
        },

        ensureSchema(tables) {
          dbWorker.postMessage({ _tag: "ensureSchema", tables });
        },
      });
    }),
  ).pipe(
    Layer.use(Layer.mergeAll(LoadQueryLive, OnQueryLive, MutateLive<To>())),
    Layer.use(
      Layer.mergeAll(
        ErrorStoreLive,
        LoadingPromisesLive,
        OnCompletesLive,
        SubscribedQueriesLive,
        TimeLive,
      ),
    ),
    Layer.use(Layer.mergeAll(NanoIdLive, RowsStoreLive)),
  );
