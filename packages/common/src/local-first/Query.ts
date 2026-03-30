/**
 * Query helpers, execution, and caching.
 *
 * @module
 */

import type {
  AliasableExpression,
  Expression,
  Simplify as KyselySimplify,
  RawBuilder,
  SelectQueryNode,
} from "kysely";
import {
  AliasNode,
  ColumnNode,
  ExpressionWrapper,
  IdentifierNode,
  sql as kyselySqlBuilder,
  ReferenceNode,
  TableNode,
  ValueNode,
} from "kysely";
import type { Brand } from "../Brand.js";
import { createRandomBytes } from "../Crypto.js";
import type { ReadonlyRecord } from "../Object.js";
import { createRecord, isPlainObject } from "../Object.js";
import type { SqliteQueryString } from "../Sqlite.js";
import { eqSqliteValue, SqliteValue } from "../Sqlite.js";
import { createId, String } from "../Type.js";
import type { Simplify } from "../Types.js";
import type { EvoluSchema } from "./Schema.js";

export { sql as kyselySql } from "kysely";
export type { NotNull as KyselyNotNull } from "kysely";

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
export type Query<
  S extends EvoluSchema = EvoluSchema,
  R extends Row = Row,
> = SqliteQueryString &
  Brand<"Query"> & {
    /** A shorthand for the query schema. */
    Schema: S;

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

export type InferRow<T extends Query> =
  T extends Query<any, infer R> ? R : never;

export interface Row {
  readonly [key: string]:
    | SqliteValue
    | Row // for evoluJsonObjectFrom
    | ReadonlyArray<Row>; // for evoluJsonArrayFrom
}

/**
 * An improved Evolu version of Kysely's SQLite `jsonArrayFrom` helper.
 *
 * Kysely's `ParseJSONResultsPlugin` heuristically parses any result string that
 * looks like JSON. Evolu instead prefixes JSON produced by these helpers with a
 * per-runtime identifier and only parses values carrying that prefix, avoiding
 * accidental parsing of ordinary string columns that merely happen to start
 * with `{` or `[`.
 *
 * ### Example
 *
 * ```ts
 * import { evoluJsonArrayFrom } from "@evolu/common";
 *
 * const result = await db
 *   .selectFrom("person")
 *   .select((eb) => [
 *     "id",
 *     evoluJsonArrayFrom(
 *       eb
 *         .selectFrom("pet")
 *         .select(["pet.id as pet_id", "pet.name"])
 *         .whereRef("pet.owner_id", "=", "person.id")
 *         .orderBy("pet.name"),
 *     ).as("pets"),
 *   ])
 *   .execute();
 *
 * result[0]?.id;
 * result[0]?.pets[0].pet_id;
 * result[0]?.pets[0].name;
 * ```
 */
export const evoluJsonArrayFrom = <O>(
  expr: SelectQueryBuilderExpression<O>,
): RawBuilder<Array<KyselySimplify<O>>> =>
  kyselySqlBuilder`(select ${kyselySqlBuilder.lit(kyselyJsonIdentifier)} || coalesce(json_group_array(json_object(${kyselySqlBuilder.join(
    getSqliteJsonObjectArgs(expr.toOperationNode(), "agg"),
  )})), '[]') from ${expr} as agg)`;

/**
 * An improved Evolu version of Kysely's SQLite `jsonObjectFrom` helper.
 *
 * Kysely's `ParseJSONResultsPlugin` heuristically parses any result string that
 * looks like JSON. Evolu instead prefixes JSON produced by these helpers with a
 * per-runtime identifier and only parses values carrying that prefix, avoiding
 * accidental parsing of ordinary string columns that merely happen to start
 * with `{` or `[`.
 *
 * The subquery must only return one row.
 *
 * ### Example
 *
 * ```ts
 * import { evoluJsonObjectFrom } from "@evolu/common";
 *
 * const result = await db
 *   .selectFrom("person")
 *   .select((eb) => [
 *     "id",
 *     evoluJsonObjectFrom(
 *       eb
 *         .selectFrom("pet")
 *         .select(["pet.id as pet_id", "pet.name"])
 *         .whereRef("pet.owner_id", "=", "person.id")
 *         .where("pet.is_favorite", "=", true),
 *     ).as("favorite_pet"),
 *   ])
 *   .execute();
 *
 * result[0]?.id;
 * result[0]?.favorite_pet?.pet_id;
 * result[0]?.favorite_pet?.name;
 * ```
 */
export const evoluJsonObjectFrom = <O>(
  expr: SelectQueryBuilderExpression<O>,
): RawBuilder<KyselySimplify<O> | null> =>
  kyselySqlBuilder`(select ${kyselySqlBuilder.lit(kyselyJsonIdentifier)} || json_object(${kyselySqlBuilder.join(
    getSqliteJsonObjectArgs(expr.toOperationNode(), "obj"),
  )}) from ${expr} as obj)`;

/**
 * An improved Evolu version of Kysely's SQLite `jsonBuildObject` helper.
 *
 * Kysely's `ParseJSONResultsPlugin` heuristically parses any result string that
 * looks like JSON. Evolu instead prefixes JSON produced by these helpers with a
 * per-runtime identifier and only parses values carrying that prefix, avoiding
 * accidental parsing of ordinary string columns that merely happen to start
 * with `{` or `[`.
 *
 * ### Example
 *
 * ```ts
 * import { evoluJsonBuildObject, kyselySql } from "@evolu/common";
 *
 * const result = await db
 *   .selectFrom("person")
 *   .select((eb) => [
 *     "id",
 *     evoluJsonBuildObject({
 *       first: eb.ref("first_name"),
 *       last: eb.ref("last_name"),
 *       full: kyselySql<string>`first_name || ' ' || last_name`,
 *     }).as("name"),
 *   ])
 *   .execute();
 *
 * result[0]?.id;
 * result[0]?.name.first;
 * result[0]?.name.last;
 * result[0]?.name.full;
 * ```
 */
export const evoluJsonBuildObject = <
  O extends Record<string, Expression<unknown>>,
>(
  obj: O,
): RawBuilder<
  KyselySimplify<{
    [K in keyof O]: O[K] extends Expression<infer V> ? V : never;
  }>
> =>
  kyselySqlBuilder`${kyselySqlBuilder.lit(kyselyJsonIdentifier)} || json_object(${kyselySqlBuilder.join(
    Object.keys(obj).flatMap((k) => [kyselySqlBuilder.lit(k), obj[k]]),
  )})`;

export const getJsonObjectArgs = (
  node: SelectQueryNode,
  table: string,
): Array<Expression<unknown> | string> => {
  const args: Array<Expression<unknown> | string> = [];

  for (const { selection: s } of node.selections ?? []) {
    if (ReferenceNode.is(s) && ColumnNode.is(s.column)) {
      args.push(
        colName(s.column.column.name),
        colRef(table, s.column.column.name),
      );
    } else if (ColumnNode.is(s)) {
      args.push(colName(s.column.name), colRef(table, s.column.name));
    } else if (AliasNode.is(s) && IdentifierNode.is(s.alias)) {
      args.push(colName(s.alias.name), colRef(table, s.alias.name));
    } else {
      throw new Error(`can't extract column names from the select query node`);
    }
  }

  return args;
};

/** Rows returned by a query. */
export type QueryRows<R extends Row = Row> = ReadonlyArray<
  Readonly<Simplify<R>>
>;

export type Queries<
  S extends EvoluSchema = EvoluSchema,
  R extends Row = Row,
> = ReadonlyArray<Query<S, R>>;

export type QueriesToQueryRows<Q extends Queries> = {
  [P in keyof Q]: Q[P] extends Query<any, infer R> ? QueryRows<R> : never;
};

export type QueriesToQueryRowsPromises<Q extends Queries> = {
  [P in keyof Q]: Q[P] extends Query<any, infer R>
    ? Promise<QueryRows<R>>
    : never;
};

export type RowsByQueryMap<S extends EvoluSchema = EvoluSchema> = ReadonlyMap<
  Query<S>,
  ReadonlyArray<Row>
>;

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

interface SelectQueryBuilderExpression<O> extends AliasableExpression<O> {
  get isSelectQueryBuilder(): true;
  toOperationNode(): SelectQueryNode;
}

const getSqliteJsonObjectArgs = (
  node: SelectQueryNode,
  table: string,
): Array<Expression<unknown> | string> => {
  try {
    return getJsonObjectArgs(node, table);
  } catch {
    throw new Error(
      "SQLite evoluJsonArrayFrom and evoluJsonObjectFrom can only handle explicit selections due to limitations of the json_object function. selectAll() is not allowed in the subquery.",
    );
  }
};

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
    return parse(JSON.parse(obj.slice(kyselyJsonIdentifier.length)));
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

const colName = (col: string): Expression<unknown> =>
  new ExpressionWrapper(ValueNode.createImmediate(col));

const colRef = (table: string, col: string): Expression<unknown> =>
  new ExpressionWrapper(
    ReferenceNode.create(ColumnNode.create(col), TableNode.create(table)),
  );
