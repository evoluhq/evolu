import { Context, Effect, Function, Layer, pipe } from "effect";
import { Row, SerializedSqliteQuery } from "./Sqlite.js";
import { FilterMap, filterMapRows } from "./FilterMap.js";
import { Query } from "./Query.js";
import { QueryResult, queryResultFromRows } from "./QueryResult.js";

export interface LoadingPromises {
  readonly get: <R extends Row>(
    query: Query<R>,
  ) => {
    readonly promise: LoadingPromise<R>;
    readonly isNew: boolean;
  };

  readonly resolve: (
    query: SerializedSqliteQuery,
    rows: ReadonlyArray<Row>,
  ) => void;

  readonly release: () => void;
}

export const LoadingPromises = Context.Tag<LoadingPromises>(
  "evolu/LoadingPromises",
);

interface LoadingPromiseWithResolve<R extends Row> {
  readonly promise: LoadingPromise<R>;
  readonly resolve: LoadingPromiseResolve<R>;
  releaseOnResolve: boolean;
}

type LoadingPromise<R extends Row> = Promise<QueryResult<R>>;

type LoadingPromiseResolve<R extends Row> = (rows: QueryResult<R>) => void;

export const LoadingPromisesLive = Layer.effect(
  LoadingPromises,
  Effect.sync(() => {
    const promises = new Map<
      SerializedSqliteQuery,
      Map<FilterMap<Row, Row>, LoadingPromiseWithResolve<Row>>
    >();

    return LoadingPromises.of({
      get<R extends Row>({ query, filterMap }: Query<R>) {
        let isNew = false;

        let map = promises.get(query);
        if (!map) {
          map = new Map();
          promises.set(query, map);
        }

        let promiseWithResolve = map.get(filterMap as FilterMap<Row, R>);
        if (!promiseWithResolve) {
          isNew = true;
          let resolve: LoadingPromiseResolve<Row> = Function.constVoid;
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
          map.set(filterMap as FilterMap<Row, R>, promiseWithResolve);
        }

        return {
          promise: promiseWithResolve.promise as LoadingPromise<R>,
          isNew,
        };
      },

      resolve(query, rows) {
        const filterMapPromises = promises.get(query);
        if (!filterMapPromises) return;
        filterMapPromises.forEach((promiseWithResolve, filterMap) => {
          if (promiseWithResolve.releaseOnResolve)
            filterMapPromises.delete(filterMap);
          pipe(
            rows,
            filterMapRows(filterMap),
            queryResultFromRows,
            promiseWithResolve.resolve,
          );
        });
      },

      /**
       * LoadingPromises caches promises until they are released.
       * Release must be called on any mutation.
       */
      release() {
        promises.forEach((filterMapPromises, query) => {
          filterMapPromises.forEach((promiseWithResolve, filterMap) => {
            const isResolved =
              getLoadingPromiseProp(promiseWithResolve.promise) != null;
            if (isResolved) filterMapPromises.delete(filterMap);
            else promiseWithResolve.releaseOnResolve = true;
          });
          if (filterMapPromises.size === 0) promises.delete(query);
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
