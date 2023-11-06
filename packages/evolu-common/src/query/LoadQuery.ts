import { Context, Effect, Layer, ReadonlyArray } from "effect";
import { DbWorker } from "../DbWorker.js";
import { Row, SerializedSqliteQuery } from "../Sqlite.js";
import { LoadingPromises } from "./LoadingPromises.js";
import { Query } from "./Query.js";
import { QueryResult } from "./QueryResult.js";

export type LoadQuery = <R extends Row>(
  query: Query<R>,
) => Promise<QueryResult<R>>;

export const LoadQuery = Context.Tag<LoadQuery>("evolu/LoadQuery");

export const LoadQueryLive = Layer.effect(
  LoadQuery,
  Effect.gen(function* (_) {
    const loadingPromises = yield* _(LoadingPromises);
    const dbWorker = yield* _(DbWorker);
    const queue = new Set<SerializedSqliteQuery>();

    return LoadQuery.of((query) => {
      const { promise, isNew } = loadingPromises.get(query);
      if (isNew) queue.add(query.query);
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
  }),
);
