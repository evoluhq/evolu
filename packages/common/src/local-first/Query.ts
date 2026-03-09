/**
 * Query execution and caching.
 *
 * @module
 */

import type { Brand } from "../Brand.js";
import { bytesToHex, hexToBytes } from "../Buffer.js";
import { createRandomBytes } from "../Crypto.js";
import type { ReadonlyRecord } from "../Object.js";
import { createRecord, isPlainObject, objectToEntries } from "../Object.js";
import type { SafeSql, SqliteQuery, SqliteQueryOptions } from "../Sqlite.js";
import { eqSqliteValue, sql, SqliteValue } from "../Sqlite.js";
import { createId, String } from "../Type.js";
import type { Simplify } from "../Types.js";

/**
 * A type-safe SQL query.
 *
 * ### Example
 *
 * ```ts
 * const createQuery = createQueryBuilder(Schema);
 * const allTodos = createQuery((db) => db.selectFrom("todo").selectAll());
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
     * const createQuery = createQueryBuilder(Schema);
     * const allTodos = createQuery((db) =>
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

/** A default {@link Query} placeholder for tests. */
export const testQuery = /*#__PURE__*/ serializeQuery(sql`
  select "test" as "query";
`);

/**
 * A secondary {@link Query} placeholder for tests that need two distinct
 * queries.
 */
export const testQuery2 = /*#__PURE__*/ serializeQuery(sql`
  select "test-2" as "query";
`);

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

export type RowsByQueryMap = ReadonlyMap<Query, ReadonlyArray<Row>>;

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
  if (previousRows === undefined) {
    return [{ op: "replaceAll", value: nextRows }];
  }

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
export const kyselyJsonIdentifier = /*#__PURE__*/ createId({
  randomBytes: /*#__PURE__*/ createRandomBytes(),
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
