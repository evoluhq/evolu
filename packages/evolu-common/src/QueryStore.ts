import * as Kysely from "kysely";
import { CommonColumns, Schema } from "./Db.js";
import { Row, SerializedSqliteQuery } from "./Sqlite.js";
import { Listener, Unsubscribe } from "./Store.js";

export interface QueryStore<S extends Schema> {
  readonly createQuery: {
    <R extends Row>(queryCallback: QueryCallback<S, R>): Query<R>;
    <R extends Row, R2 extends Row>(
      queryCallback: QueryCallback<S, R>,
      filterMap: FilterMap<R, R2>,
    ): Query<R2>;
  };

  readonly loadQuery: <R extends Row>(
    query: Query<R>,
  ) => Promise<QueryResult<R>>;

  readonly subscribeQuery: (
    query: Query<Row>,
  ) => (listener: Listener) => Unsubscribe;
  readonly getQuery: <R extends Row>(query: Query<R>) => QueryResult<R> | null;
}

type QueryCallback<S extends Schema, QueryRow> = (
  db: KyselyQueryOnly<QuerySchema<S>>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
) => Kysely.SelectQueryBuilder<any, any, QueryRow>;

type KyselyQueryOnly<DB> = Pick<Kysely.Kysely<DB>, "selectFrom" | "fn">;

type QuerySchema<S extends Schema> = {
  readonly [Table in keyof S]: NullableExceptId<
    {
      readonly [Column in keyof S[Table]]: S[Table][Column];
    } & CommonColumns
  >;
};

export type NullableExceptId<T> = {
  readonly [K in keyof T]: K extends "id" ? T[K] : T[K] | null;
};

export interface Query<R extends Row> {
  readonly query: SerializedSqliteQuery;
  readonly filterMap: FilterMap<Row, R>;
}

/**
 * Filter and map array items in one step with the correct return type and
 * without unreliable TypeScript type guards.
 *
 * ### Examples
 *
 * ```
 * createQuery(
 *   (db) => db.selectFrom("todo").selectAll(),
 *   // Filter and map nothing.
 *   (row) => row,
 * );
 *
 * createQuery(
 *   (db) => db.selectFrom("todo").selectAll(),
 *   // Filter items with title != null.
 *   // Note the title type isn't nullable anymore.
 *   ({ title, ...rest }) => title != null && { title, ...rest },
 * );
 * ```
 */
type FilterMap<R extends Row, R2 extends Row> = (row: R) => R2 | null | false;

interface QueryResult<R extends Row> {
  readonly rows: ReadonlyArray<Readonly<Kysely.Simplify<R>>>;
  readonly firstRow: Readonly<Kysely.Simplify<R>> | null;
}
