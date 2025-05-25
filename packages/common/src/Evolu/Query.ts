import { bytesToHex, hexToBytes } from "../Buffer.js";
import { objectToEntries } from "../Object.js";
import {
  SafeSql,
  SqliteQuery,
  SqliteQueryOptions,
  SqliteRow,
  SqliteValue,
} from "../Sqlite.js";
import { Store, StoreSubscribe } from "../Store.js";
import { Brand, Simplify } from "../Types.js";

/**
 * A type-safe SQL query.
 *
 * ### Example
 *
 * ```ts
 * const allTodos = evolu.createQuery((db) =>
 *   db.selectFrom("todo").selectAll(),
 * );
 * type AllTodosRow = typeof allTodos.Row;
 * ```
 */
export type Query<R extends Row = Row> = string &
  Brand<"Query"> & {
    /**
     * A shorthand for {@link InferRow}.
     *
     * ### Example
     *
     * ```ts
     * const allTodos = evolu.createQuery((db) =>
     *   db.selectFrom("todo").selectAll(),
     * );
     * type AllTodosRow = typeof allTodos.Row;
     * ```
     */
    Row: R;
  };

/**
 * Evolu serializes {@link SqliteQuery} into a string to be easily used as a key
 * and for comparison.
 */
export const serializeQuery = <R extends Row>(query: SqliteQuery): Query<R> => {
  const params = query.parameters.map((v) =>
    v instanceof Uint8Array
      ? (["b", bytesToHex(v)] as const)
      : (["j", v] as const),
  );

  const options = query.options
    ? objectToEntries(query.options).sort(([a], [b]) => a.localeCompare(b))
    : [];

  return JSON.stringify([query.sql, params, options]) as Query<R>;
};

export const deserializeQuery = <R extends Row>(
  query: Query<R>,
): SqliteQuery => {
  const [sql, paramsArr, optionsArr] = JSON.parse(query) as [
    SafeSql,
    Array<readonly ["b", string] | readonly ["j", string | number | null]>,
    Array<Array<string | number | null>>,
  ];

  const parameters = paramsArr.map(([type, value]) =>
    type === "b" ? hexToBytes(value) : value,
  );

  const options = optionsArr.length
    ? (Object.fromEntries(optionsArr) as SqliteQueryOptions)
    : undefined;

  return {
    sql,
    parameters,
    ...(options !== undefined && { options }),
  };
};

export type InferRow<T extends Query> = T extends Query<infer R> ? R : never;

export interface Row {
  readonly [key: string]:
    | SqliteValue
    | Row // for jsonObjectFrom from kysely/helpers/sqlite
    | ReadonlyArray<Row>; // for jsonArrayFrom from kysely/helpers/sqlite
}

// To preserve identity.
export const emptyRows: ReadonlyArray<Row> = [];

/** Rows returned by a query. */
export type QueryRows<R extends Row = Row> = ReadonlyArray<
  Readonly<Simplify<R>>
>;

export type Queries<R extends Row = Row> = ReadonlyArray<Query<R>>;

export type QueriesToQueryRows<Q extends Queries> = {
  [P in keyof Q]: Q[P] extends Query<infer R> ? QueryRows<R> : never;
};

export type QueriesToQueryRowsPromises<Q extends Queries> = {
  [P in keyof Q]: Q[P] extends Query<infer R> ? Promise<QueryRows<R>> : never;
};

export type QueryRowsMap = ReadonlyMap<Query, ReadonlyArray<Row>>;

export interface QueryRowsCache {
  readonly set: (
    queriesRows: ReadonlyArray<readonly [Query, ReadonlyArray<SqliteRow>]>,
  ) => void;
  readonly get: () => QueryRowsMap;
}

export const createQueryRowsCache = (): QueryRowsCache => {
  let queryRowsCache: QueryRowsMap = new Map();

  const cache: QueryRowsCache = {
    set: (queriesRows) => {
      queryRowsCache = new Map([...queryRowsCache, ...queriesRows]);
    },
    get: () => queryRowsCache,
  };

  return cache;
};

export interface SubscribedQueries {
  subscribe: (query: Query) => StoreSubscribe;

  has: (query: Query) => boolean;

  get: () => ReadonlyArray<Query>;
}

export const createSubscribedQueries = (
  rowsStore: Store<QueryRowsMap>,
): SubscribedQueries => {
  const subscribedQueryMap = new Map<Query, number>();

  const subscribedQueries: SubscribedQueries = {
    subscribe: (query) => (listener) => {
      subscribedQueryMap.set(query, (subscribedQueryMap.get(query) ?? 0) + 1);
      const unsubscribe = rowsStore.subscribe(listener);
      return () => {
        const count = subscribedQueryMap.get(query);
        if (count != null && count > 1) {
          subscribedQueryMap.set(query, count - 1);
        } else {
          subscribedQueryMap.delete(query);
        }
        unsubscribe();
      };
    },

    get: () => [...subscribedQueryMap.keys()],

    has: (query) => subscribedQueryMap.has(query),
  };

  return subscribedQueries;
};
