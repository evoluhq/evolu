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
import { Query, Row } from "./Db.js";
import { DbWorker, DbWorkerOutput } from "./DbWorker.js";
import { applyPatches } from "./Diff.js";
import { LoadingPromises } from "./LoadingPromises.js";
import { OnCompletes } from "./OnCompletes.js";
import { FlushSync } from "./Platform.js";
import { RowsCacheMap, RowsCacheStore } from "./RowsCache.js";
import { StoreListener, StoreUnsubscribe } from "./Store.js";
import { SubscribedQueries } from "./SubscribedQueries.js";

export interface QueryStore {
  readonly subscribe: (
    query: Query | null
  ) => (listener: StoreListener) => StoreUnsubscribe;

  readonly getState: (query: Query | null) => ReadonlyArray<Row> | null;

  readonly loadQuery: (query: Query) => Promise<ReadonlyArray<Row>>;

  readonly onQuery: (
    output: Extract<DbWorkerOutput, { _tag: "onQuery" }>
  ) => void;
}

export const QueryStore = Context.Tag<QueryStore>("evolu/QueryStore");

export const QueryStoreLive = Layer.effect(
  QueryStore,
  Effect.gen(function* (_) {
    const subscribedQueries = yield* _(SubscribedQueries);
    const rowsCacheStore = yield* _(RowsCacheStore);

    const subscribe: QueryStore["subscribe"] = (query) => (listen) => {
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
    };

    const getState: QueryStore["getState"] = (query) =>
      (query && rowsCacheStore.getState().get(query)) || null;

    const loadingPromises = yield* _(LoadingPromises);
    const dbWorker = yield* _(DbWorker);
    const queue = new Set<Query>();

    const loadQuery: QueryStore["loadQuery"] = (query) => {
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
    };

    const flushSync = yield* _(FlushSync);
    const onCompletes = yield* _(OnCompletes);

    const onQuery: QueryStore["onQuery"] = ({
      queriesPatches,
      onCompleteIds,
    }) => {
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

      flushSync(() => rowsCacheStore.setState(nextState));

      ReadonlyArray.filterMap(onCompleteIds, (id) => {
        const onComplete = onCompletes.get(id);
        onCompletes.delete(id);
        return Option.fromNullable(onComplete);
      }).forEach((onComplete) => onComplete());
    };

    return QueryStore.of({ subscribe, getState, loadQuery, onQuery });
  })
);
