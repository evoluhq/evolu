/**
 * Query execution and caching.
 *
 * @module
 */
import type { Brand } from "../Brand.js";
import { bytesToHex, hexToBytes } from "../Buffer.js";
import { createRandomBytes } from "../Crypto.js";
import { createRecord, isPlainObject, objectToEntries } from "../Object.js";
import type { ReadonlyRecord } from "../Object.js";
import { ok } from "../Result.js";
import type { Result } from "../Result.js";
import {
  eqSqliteValue,
  explainSqliteQueryPlan,
  SqliteValue,
} from "../Sqlite.js";
import type {
  SafeSql,
  SqliteDep,
  SqliteError,
  SqliteQuery,
  SqliteQueryOptions,
  SqliteRow,
} from "../Sqlite.js";
import type { Listener, Unsubscribe } from "../Listeners.js";
import type { Store } from "../Store.js";
import { createId, Id, String } from "../Type.js";
import type { Simplify } from "../Types.js";

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
    ? objectToEntries(query.options).toSorted(([a], [b]) => a.localeCompare(b))
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

export interface SubscribedQueries {
  subscribe: (query: Query) => (listener: Listener) => Unsubscribe;

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

export interface GetQueryRowsCacheDep {
  readonly getQueryRowsCache: GetQueryRowsCache;
}

export type GetQueryRowsCache = (tabId: Id) => QueryRowsCache;

export interface QueryRowsCache {
  readonly set: (
    queriesRows: ReadonlyArray<readonly [Query, ReadonlyArray<SqliteRow>]>,
  ) => void;
  readonly get: () => QueryRowsMap;
}

export const createGetQueryRowsCache = (): GetQueryRowsCache => {
  const tabQueryRowsCacheMap = new Map<Id, QueryRowsCache>();

  return (tabId: Id) => {
    let cache = tabQueryRowsCacheMap.get(tabId);
    if (!cache) {
      let queryRowsCache: QueryRowsMap = new Map();
      cache = {
        set: (queriesRows) => {
          queryRowsCache = new Map([...queryRowsCache, ...queriesRows]);
        },
        get: () => queryRowsCache,
      };
      tabQueryRowsCacheMap.set(tabId, cache);
    }
    return cache;
  };
};

export const loadQueries =
  (deps: GetQueryRowsCacheDep & SqliteDep) =>
  (
    tabId: Id,
    queries: ReadonlyArray<Query>,
  ): Result<ReadonlyArray<QueryPatches>, SqliteError> => {
    const queriesRows = [];

    for (const query of queries) {
      const sqlQuery = deserializeQuery(query);
      const result = deps.sqlite.exec(sqlQuery);
      if (!result.ok) return result;

      queriesRows.push([query, result.value.rows] as const);
      if (sqlQuery.options?.logExplainQueryPlan) {
        explainSqliteQueryPlan(deps)(sqlQuery);
      }
    }

    const queryRowsCache = deps.getQueryRowsCache(tabId);

    const previousState = queryRowsCache.get();
    queryRowsCache.set(queriesRows);

    const currentState = queryRowsCache.get();

    const queryPatchesArray = queries.map(
      (query): QueryPatches => ({
        query,
        patches: makePatches(
          previousState.get(query),
          currentState.get(query) ?? emptyRows,
        ),
      }),
    );
    return ok(queryPatchesArray);
  };

export interface QueryPatches {
  readonly query: Query;
  readonly patches: ReadonlyArray<Patch>;
}

export type Patch = ReplaceAllPatch | ReplaceAtPatch;

export interface ReplaceAllPatch {
  readonly op: "replaceAll";
  readonly value: ReadonlyArray<Row>;
}

export interface ReplaceAtPatch {
  readonly op: "replaceAt";
  readonly index: number;
  readonly value: Row;
}

/**
 * We detect only changes in the whole result and in-place edits. In the future,
 * we will add more heuristics. We will probably not implement the Myers diff
 * algorithm because it's faster to rerender all than to compute many detailed
 * patches. We will only implement logic a developer would implement manually,
 * if necessary.
 */
export const makePatches = (
  previousRows: ReadonlyArray<Row> | undefined,
  nextRows: ReadonlyArray<Row>,
): ReadonlyArray<Patch> => {
  if (previousRows === undefined)
    return [{ op: "replaceAll", value: nextRows }];
  // TODO: Detect prepend and append, it's cheap.
  if (previousRows.length !== nextRows.length) {
    return [{ op: "replaceAll", value: nextRows }];
  }

  const length = previousRows.length;
  const replaceAtPatches: Array<ReplaceAtPatch> = [];

  for (let i = 0; i < length; i++) {
    const previousRow = previousRows[i];
    const nextRow = nextRows[i];

    // We expect the same shape for both rows.
    for (const key in previousRow)
      if (
        !eqSqliteValue(
          previousRow[key] as SqliteValue,
          nextRow[key] as SqliteValue,
        )
      ) {
        replaceAtPatches.push({ op: "replaceAt", value: nextRow, index: i });
        break;
      }
  }

  if (length > 0 && replaceAtPatches.length === length) {
    return [{ op: "replaceAll", value: nextRows }];
  }
  return replaceAtPatches;
};

export const applyPatches = (
  patches: ReadonlyArray<Patch>,
  current: ReadonlyArray<Row>,
): ReadonlyArray<Row> =>
  patches.reduce((next, patch) => {
    switch (patch.op) {
      case "replaceAll":
        return parseSqliteJsonArray(patch.value);
      case "replaceAt": {
        const parsedRow = parseSqliteJsonArray([patch.value])[0];
        return next.toSpliced(patch.index, 1, parsedRow);
      }
    }
  }, current);

/**
 * A unique identifier prepended to JSON-encoded strings. This allows safe
 * detection and parsing of only those columns that require JSON.parse.
 *
 * The identifier is a cryptographically random Evolu Id, ensuring uniqueness
 * and preventing malicious actors from inserting fake data that could be
 * misinterpreted as JSON by the application.
 *
 * Note: The same queries created by different browser tabs will have different
 * identifiers and thus be considered different and cached separately. This is
 * usually not a big deal, but if needed, the DB cache can be optimized by
 * passing the kyselyJsonIdentifier into the DB worker during initialization,
 * allowing queries to be grouped and recognized across tabs or sessions.
 *
 * See: https://github.com/kysely-org/kysely/issues/1372#issuecomment-2702773948
 */
export const kyselyJsonIdentifier = createId({
  randomBytes: createRandomBytes(),
});

export const parseSqliteJsonArray = <T>(
  arr: ReadonlyArray<T>,
): ReadonlyArray<T> => {
  const result = new Array<T>(arr.length);
  for (let i = 0; i < arr.length; ++i) {
    result[i] = parse(arr[i]) as T;
  }
  return result;
};

const parse = (obj: unknown): unknown => {
  if (String.is(obj) && obj.startsWith(kyselyJsonIdentifier)) {
    return JSON.parse(obj.slice(kyselyJsonIdentifier.length));
  }

  if (Array.isArray(obj)) {
    return parseSqliteJsonArray(obj);
  }

  if (isPlainObject(obj)) {
    return parseObject(obj);
  }

  return obj;
};

const parseObject = (
  obj: ReadonlyRecord<string, unknown>,
): ReadonlyRecord<string, unknown> => {
  const result = createRecord();
  for (const key in obj) {
    result[key] = parse(obj[key]);
  }
  return result as ReadonlyRecord<string, unknown>;
};
