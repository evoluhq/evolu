import { Context, Function, Layer } from "effect";
import { Query, Row } from "./Sqlite.js";

// For React Suspense.

export interface LoadingPromises {
  readonly getPromise: (query: Query) => {
    readonly promise: Promise<ReadonlyArray<Row>>;
    readonly isNew: boolean;
  };

  readonly resolvePromise: (query: Query, rows: ReadonlyArray<Row>) => void;

  readonly releasePromises: (ignoreQueries: ReadonlyArray<Query>) => void;
}

export const LoadingPromises = Context.Tag<LoadingPromises>(
  "evolu/LoadingPromises",
);

const promises = new Map<
  Query,
  {
    readonly promise: Promise<ReadonlyArray<Row>>;
    readonly resolve: (rows: ReadonlyArray<Row>) => void;
  }
>();

const getPromise: LoadingPromises["getPromise"] = (query) => {
  const item = promises.get(query);
  if (item) return { promise: item.promise, isNew: false };
  let resolve: (rows: ReadonlyArray<Row>) => void = Function.constVoid;
  const promise = new Promise<ReadonlyArray<Row>>((_resolve) => {
    resolve = _resolve;
  });
  promises.set(query, { promise, resolve });
  return { promise, isNew: true };
};

const resolvePromise: LoadingPromises["resolvePromise"] = (query, rows) => {
  const item = promises.get(query);
  if (!item) return;
  // It's similar to what React will do.
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  Object.assign(item.promise, { rows });
  item.resolve(rows);
};

const releasePromises: LoadingPromises["releasePromises"] = (ignoreQueries) => {
  [...promises.keys()].forEach((query) => {
    if (!ignoreQueries.includes(query)) promises.delete(query);
  });
};

export const LoadingPromisesLive = Layer.succeed(
  LoadingPromises,
  LoadingPromises.of({ getPromise, resolvePromise, releasePromises }),
);
