import { Context, Effect, Function, Layer } from "effect";
import { Row, SerializedSqliteQuery } from "../Sqlite.js";
import { Query } from "./Query.js";

export interface LoadingPromises {
  readonly get: <R extends Row>(
    query: Query<R>,
  ) => {
    readonly promise: Promise<ReadonlyArray<R>>;
    readonly isNew: boolean;
  };

  readonly resolve: (
    query: SerializedSqliteQuery,
    rows: ReadonlyArray<Row>,
  ) => void;

  readonly release: (
    ignoredQueries: ReadonlyArray<SerializedSqliteQuery>,
  ) => void;
}

export const LoadingPromises = Context.Tag<LoadingPromises>(
  "evolu/LoadingPromises",
);

export const loadingPromisesPromiseProp = "rows";

export const LoadingPromisesLive = Layer.effect(
  LoadingPromises,
  Effect.sync(() => {
    interface Value<R extends Row> {
      readonly promise: Promise<ReadonlyArray<R>>;
      readonly resolve: (rows: ReadonlyArray<R>) => void;
      //   readonly filterMap: FilterMap<Row, R>;
    }

    const promises = new Map<SerializedSqliteQuery, Value<Row>>();

    return LoadingPromises.of({
      get<R extends Row>({ query /*, filterMap*/ }: Query<R>) {
        const item = promises.get(query) as Value<R> | undefined;
        if (item) return { promise: item.promise, isNew: false };
        let resolve: (rows: ReadonlyArray<R>) => void = Function.constVoid;
        const promise = new Promise<ReadonlyArray<R>>((_resolve) => {
          resolve = _resolve;
        });
        promises.set(query, {
          promise,
          resolve: resolve as Value<Row>["resolve"],
          //   filterMap: filterMap as FilterMap<Row, R>,
        });
        return { promise, isNew: true };
      },

      resolve(query, rows) {
        const item = promises.get(query);
        if (!item) return;
        // filterMapCache(filterMap)(rows)

        // It's similar to what React will do.
        void Object.assign(item.promise, {
          [loadingPromisesPromiseProp]: rows,
        });
        item.resolve(rows);
      },

      release(ignoredQueries) {
        [...promises.keys()].forEach((query) => {
          if (!ignoredQueries.includes(query)) promises.delete(query);
        });
      },
    });
  }),
);
