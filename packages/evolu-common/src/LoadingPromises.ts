import { Context, Effect, Function, Layer } from "effect";
import { Query, QueryResult, Row, queryResultFromRows } from "./Db.js";

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
    const promises = new Map<Query, LoadingPromiseWithResolve<Row>>();

    return LoadingPromises.of({
      get<R extends Row>(query: Query<R>) {
        let isNew = false;
        let promiseWithResolve = promises.get(query);

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
