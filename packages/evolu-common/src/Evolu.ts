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
  emptyRows,
  queryResultFromRows,
  schemaToTables,
  serializeQuery,
} from "./Db.js";
import { DbWorker, DbWorkerOutputOnQuery, Mutation } from "./DbWorker.js";
import { applyPatches } from "./Diff.js";
import { ErrorStore, makeErrorStore } from "./ErrorStore.js";
import { SqliteBoolean, SqliteDate, cast } from "./Model.js";
import { OnCompletes, OnCompletesLive } from "./OnCompletes.js";
import { Owner } from "./Owner.js";
import { AppState, FlushSync } from "./Platform.js";
import { SqliteQuery } from "./Sqlite.js";
import { Store, Unsubscribe, makeStore } from "./Store.js";
import { SyncState } from "./SyncWorker.js";

export interface Evolu<T extends Schema = Schema> {
  /** TODO: Docs */
  readonly subscribeError: ErrorStore["subscribe"];

  /** TODO: Docs */
  readonly getError: ErrorStore["getState"];

  /** TODO: Docs */
  readonly createQuery: CreateQuery<T>;

  /** TODO: Docs */
  readonly loadQuery: LoadQuery;

  /** TODO: Docs */

  readonly subscribeQuery: SubscribedQueries["subscribeQuery"];

  /** TODO: Docs */
  readonly getQuery: SubscribedQueries["getQuery"];

  /** TODO: Docs */
  readonly subscribeOwner: Store<Owner | null>["subscribe"];

  /** TODO: Docs */
  readonly getOwner: Store<Owner | null>["getState"];

  /** TODO: Docs */
  readonly subscribeSyncState: Store<SyncState>["subscribe"];

  /** TODO: Docs */
  readonly getSyncState: Store<SyncState>["getState"];

  /** TODO: Docs */
  create: Mutate<T, "create">;

  /** TODO: Docs */
  update: Mutate<T, "update">;

  /**
   * Delete all local data from the current device.
   * After the deletion, Evolu reloads all browser tabs that use Evolu.
   */
  readonly resetOwner: () => void;

  /**
   * TODO:
   */
  readonly parseMnemonic: Bip39["parse"];

  /**
   * Restore `Owner` with synced data from different devices.
   */
  readonly restoreOwner: (mnemonic: Mnemonic) => void;

  /**
   * Ensure database tables and columns exist.
   */
  readonly ensureSchema: <From, To extends T>(
    schema: S.Schema<From, To>,
  ) => void;
}

export const Evolu = Context.Tag<Evolu>();

type CreateQuery<S extends Schema> = <R extends Row>(
  queryCallback: QueryCallback<S, R>,
) => Query<R>;

type QueryCallback<S extends Schema, R extends Row> = (
  db: Pick<Kysely.Kysely<QuerySchema<S>>, "selectFrom" | "fn">,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
) => Kysely.SelectQueryBuilder<any, any, R>;

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

  /**
   * Release all unsubscribed queries on mutation because only subscribed queries
   * are automatically updated.
   */
  readonly release: () => void;
}

export const LoadingPromises = Context.Tag<LoadingPromises>();

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
        // "For example, a data framework can set the status and value fields
        // on a promise preemptively, before passing to React, so that React can
        // unwrap it without waiting a microtask."
        // https://github.com/acdlite/rfcs/blob/first-class-promises/text/0000-first-class-support-for-promises.md
        promiseWithResolve.promise.status = "fulfilled";
        promiseWithResolve.promise.value = result;
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

type LoadQuery = <R extends Row>(query: Query<R>) => Promise<QueryResult<R>>;

const LoadQuery = Context.Tag<LoadQuery>();

const LoadQueryLive = Layer.effect(
  LoadQuery,
  Effect.gen(function* (_) {
    const loadingPromises = yield* _(LoadingPromises);
    const dbWorker = yield* _(DbWorker);
    const queries: Query[] = [];

    return LoadQuery.of((query) => {
      const { promise, isNew } = loadingPromises.get(query);
      if (isNew) queries.push(query);
      if (
        ReadonlyArray.isNonEmptyReadonlyArray(queries) &&
        queries.length === 1
      ) {
        queueMicrotask(() => {
          dbWorker.postMessage({ _tag: "query", queries });
          queries.length = 0;
        });
      }
      return promise;
    });
  }),
);

type OnQuery = (
  dbWorkerOutputOnQuery: DbWorkerOutputOnQuery,
) => Effect.Effect<never, never, void>;

const OnQuery = Context.Tag<OnQuery>();

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

        // TODO: yield* _(flushSync(rowsStore.setState(nextState)))
        flushSync(() => rowsStore.setState(nextState).pipe(Effect.runSync));
        yield* _(onCompletes.complete(onCompleteIds));
      }),
    );
  }),
);

export interface SubscribedQueries {
  readonly subscribeQuery: (query: Query) => Store<Row>["subscribe"];
  readonly getQuery: <R extends Row>(query: Query<R>) => QueryResult<R>;
  readonly getSubscribedQueries: () => ReadonlyArray<Query>;
}

export const SubscribedQueries = Context.Tag<SubscribedQueries>();

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

type Mutate<
  S extends Schema = Schema,
  Mode extends "create" | "update" = "update",
> = <K extends keyof S>(
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

const Mutate = Context.Tag<Mutate>();

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

const MutateLive = Layer.effect(
  Mutate,
  Effect.gen(function* (_) {
    const nanoid = yield* _(NanoId);
    const onCompletes = yield* _(OnCompletes);
    const time = yield* _(Time);
    const subscribedQueries = yield* _(SubscribedQueries);
    const loadingPromises = yield* _(LoadingPromises);
    const dbWorker = yield* _(DbWorker);
    const mutations: Array<Mutation> = [];

    return Mutate.of((table, { id, ...values }, onComplete) => {
      const isInsert = id == null;
      if (isInsert) id = Effect.runSync(nanoid.nanoid) as never;

      const onCompleteId = onComplete
        ? onCompletes.add(onComplete).pipe(Effect.runSync)
        : null;

      mutations.push({
        table: table.toString(),
        id,
        values,
        isInsert,
        now: cast(new Date(Effect.runSync(time.now))),
        onCompleteId,
      });

      if (
        ReadonlyArray.isNonEmptyReadonlyArray(mutations) &&
        mutations.length === 1
      )
        queueMicrotask(() => {
          dbWorker.postMessage({
            _tag: "mutate",
            mutations,
            queries: subscribedQueries.getSubscribedQueries(),
          });
          loadingPromises.release();
          mutations.length = 0;
        });

      return { id };
    });
  }),
);

// EvoluCommonTest is pure (without side effects), so it's testable.
export const EvoluCommonTest = Layer.effect(
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
    const ownerStore = yield* _(makeStore<Owner | null>(null));
    const loadingPromises = yield* _(LoadingPromises);
    const appState = yield* _(AppState);

    dbWorker.onMessage = (output): void =>
      Match.value(output).pipe(
        Match.tagsExhaustive({
          onError: ({ error }) => errorStore.setState(error),
          onQuery,
          onOwner: ({ owner }) => ownerStore.setState(owner),
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

    appState.init({
      onFocus: () => {
        dbWorker.postMessage({ _tag: "sync", queries: getSubscribedQueries() });
      },
      onReconnect: () => {
        dbWorker.postMessage({ _tag: "sync", queries: [] });
      },
    });

    return Evolu.of({
      subscribeError: errorStore.subscribe,
      getError: errorStore.getState,

      createQuery: makeCreateQuery<Schema>(),
      loadQuery,

      subscribeQuery,
      getQuery,

      subscribeOwner: ownerStore.subscribe,
      getOwner: ownerStore.getState,

      subscribeSyncState: syncStateStore.subscribe,
      getSyncState: syncStateStore.getState,

      create: mutate as Mutate<Schema, "create">,
      update: mutate,

      resetOwner: () => dbWorker.postMessage({ _tag: "reset" }),

      parseMnemonic: (yield* _(Bip39)).parse,

      restoreOwner: (mnemonic) =>
        dbWorker.postMessage({ _tag: "reset", mnemonic }),

      ensureSchema: (schema) =>
        dbWorker.postMessage({
          _tag: "ensureSchema",
          tables: schemaToTables(schema),
        }),
    });
  }),
).pipe(
  Layer.use(Layer.mergeAll(LoadQueryLive, OnQueryLive, MutateLive)),
  Layer.use(LoadingPromiseLive),
  Layer.use(SubscribedQueriesLive),
  Layer.use(Layer.merge(RowsStoreLive, OnCompletesLive)),
);

// EvoluCommonLive (with common side effects) is for apps.
export const EvoluCommonLive = EvoluCommonTest.pipe(
  Layer.use(Layer.merge(TimeLive, NanoIdLive)),
);
