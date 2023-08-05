import {
  Context,
  Effect,
  Function,
  Layer,
  Number,
  Option,
  ReadonlyArray,
  pipe,
} from "effect";
import * as Kysely from "kysely";
import { flushSync } from "react-dom";
import {
  CommonColumns,
  Query,
  QueryObject,
  Row,
  Schema,
  queryObjectToQuery,
} from "./Db.js";
import { DbWorker, DbWorkerOutput } from "./DbWorker.js";
import { applyPatches } from "./Diff.js";
import { LoadingPromises } from "./LoadingPromises.js";
import { OnCompletes } from "./OnCompletes.js";
import { RowsCacheMap, RowsCacheStore } from "./RowsCache.js";
import { NullableExceptOfId } from "./Utils.js";
import { StoreListener, StoreUnsubscribe } from "./Store.js";

export type CreateQuery<S extends Schema = Schema> = (
  queryCallback: QueryCallback<S, Row>
) => Query;

export type QueryCallback<S extends Schema, QueryRow> = (
  db: KyselyWithoutMutation<SchemaForQuery<S>>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
) => Kysely.SelectQueryBuilder<any, any, QueryRow>;

type KyselyWithoutMutation<DB> = Pick<Kysely.Kysely<DB>, "selectFrom" | "fn">;

type SchemaForQuery<S extends Schema> = {
  readonly [Table in keyof S]: NullableExceptOfId<
    {
      readonly [Column in keyof S[Table]]: S[Table][Column];
    } & CommonColumns
  >;
};

const kysely: Kysely.Kysely<SchemaForQuery<Schema>> = new Kysely.Kysely({
  dialect: {
    createAdapter: () => new Kysely.SqliteAdapter(),
    createDriver: () => new Kysely.DummyDriver(),
    createIntrospector(): Kysely.DatabaseIntrospector {
      throw "Not implemeneted";
    },
    createQueryCompiler: () => new Kysely.SqliteQueryCompiler(),
  },
});

export const createQuery: CreateQuery = (queryCallback) =>
  queryObjectToQuery(queryCallback(kysely).compile() as QueryObject);

export type OnQuery = (
  output: Extract<DbWorkerOutput, { _tag: "onQuery" }>
) => void;

export const OnQuery = Context.Tag<OnQuery>("evolu/OnQuery");

export const OnQueryLive = Layer.effect(
  OnQuery,
  Effect.gen(function* (_) {
    const rowsCacheStore = yield* _(RowsCacheStore);
    const loadingPromises = yield* _(LoadingPromises);
    const onCompletes = yield* _(OnCompletes);

    return OnQuery.of(({ queriesPatches, onCompleteIds }) => {
      const state = rowsCacheStore.getState();

      const nextState = pipe(
        queriesPatches,
        ReadonlyArray.map(
          ({ query, patches }) =>
            [
              query,
              applyPatches(patches)(state.get(query) || ReadonlyArray.empty()),
            ] as const
        ),
        (a): RowsCacheMap => new Map([...state, ...a])
      );

      // Resolve all Promises belonging to queries.
      queriesPatches.forEach(({ query }) => {
        const rows = nextState.get(query) || ReadonlyArray.empty();
        loadingPromises.resolvePromise(query, rows);
      });

      // No mutation is using onComplete, so we don't need flushSync.
      if (onCompleteIds.length === 0) {
        rowsCacheStore.setState(nextState);
        return;
      }

      // Ensure DOM is updated before onComplete (for a focus or anything else).
      flushSync(() => rowsCacheStore.setState(nextState));

      ReadonlyArray.filterMap(onCompleteIds, (id) => {
        const onComplete = onCompletes.get(id);
        onCompletes.delete(id);
        return Option.fromNullable(onComplete);
      }).forEach((onComplete) => {
        onComplete();
      });
    });
  })
);

export type SubscribedQueries = Map<Query, number>;

export const SubscribedQueries = Context.Tag<SubscribedQueries>(
  "evolu/SubscribedQueries"
);

export const SubscribedQueriesLive = Layer.succeed(
  SubscribedQueries,
  SubscribedQueries.of(new Map())
);

export type SubscribeQuery = (
  query: Query | null
) => (listener: StoreListener) => StoreUnsubscribe;

export const SubscribeQuery = Context.Tag<SubscribeQuery>(
  "evolu/SubscribeQuery"
);

export const SubscribeQueryLive = Layer.effect(
  SubscribeQuery,
  Effect.gen(function* (_) {
    const subscribedQueries = yield* _(SubscribedQueries);
    const rowsCacheStore = yield* _(RowsCacheStore);

    return SubscribeQuery.of((query) => (listen): (() => void) => {
      if (query == null) return Function.constVoid;

      subscribedQueries.set(
        query,
        Number.increment(subscribedQueries.get(query) ?? 0)
      );

      const unsubscribe = rowsCacheStore.subscribe(listen);

      return () => {
        // `as number`, because React mount/unmount are symmetric.
        const count = subscribedQueries.get(query) as number;
        if (count > 1) subscribedQueries.set(query, Number.decrement(count));
        else subscribedQueries.delete(query);
        unsubscribe();
      };
    });
  })
);

export type GetQuery = (query: Query | null) => ReadonlyArray<Row> | null;

export const GetQuery = Context.Tag<GetQuery>("evolu/GetQuery");

export const GetQueryLive = Layer.effect(
  GetQuery,
  Effect.map(RowsCacheStore, (rowsCacheStore) =>
    GetQuery.of(
      (query) => (query && rowsCacheStore.getState().get(query)) || null
    )
  )
);

export type LoadQuery = (query: Query) => Promise<ReadonlyArray<Row>>;

export const LoadQuery = Context.Tag<LoadQuery>("evolu/LoadQuery");

export const LoadQueryLive = Layer.effect(
  LoadQuery,
  Effect.gen(function* (_) {
    const loadingPromises = yield* _(LoadingPromises);
    const dbWorker = yield* _(DbWorker);

    const queue = new Set<Query>();

    return LoadQuery.of((query) => {
      const { promise, isNew } = loadingPromises.getPromise(query);
      if (isNew) queue.add(query);
      if (queue.size === 1) {
        queueMicrotask(() => {
          const queries = [...queue];
          queue.clear();
          if (ReadonlyArray.isNonEmptyReadonlyArray(queries))
            dbWorker.postMessage({ _tag: "query", queries });
        });
      }
      return promise;
    });
  })
);
