import { Function, pipe } from "effect";
import * as Kysely from "kysely";
import { CommonColumns, Schema } from "./Db.js";
import { Row, SqliteQuery, serializeSqliteQuery } from "./Sqlite.js";
import { FilterMap, cacheFilterMap } from "./FilterMap.js";
import { Query } from "./Query.js";

export type CreateQuery<S extends Schema> = {
  <R extends Row>(queryCallback: QueryCallback<S, R>): Query<R>;
  <From extends Row, To extends Row>(
    queryCallback: QueryCallback<S, From>,
    filterMap: FilterMap<From, To>,
  ): Query<To, From>;
};

type QueryCallback<S extends Schema, QueryRow> = (
  db: Pick<Kysely.Kysely<QuerySchema<S>>, "selectFrom" | "fn">,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
) => Kysely.SelectQueryBuilder<S, any, QueryRow>;

type QuerySchema<S extends Schema> = {
  readonly [Table in keyof S]: NullableExceptId<
    {
      readonly [Column in keyof S[Table]]: S[Table][Column];
    } & CommonColumns
  >;
};

type NullableExceptId<T> = {
  readonly [K in keyof T]: K extends "id" ? T[K] : T[K] | null;
};

const kysely = new Kysely.Kysely<QuerySchema<Schema>>({
  dialect: {
    createAdapter: (): Kysely.DialectAdapter => new Kysely.SqliteAdapter(),
    createDriver: (): Kysely.Driver => new Kysely.DummyDriver(),
    createIntrospector(): Kysely.DatabaseIntrospector {
      throw "Not implemeneted";
    },
    createQueryCompiler: (): Kysely.QueryCompiler =>
      new Kysely.SqliteQueryCompiler(),
  },
});

// It's not Layer because it's pure function. WeakMap is used only
// internally via cacheFilterMap, so it does not affect the observable
// behavior of the function.
export const makeCreateQuery =
  <S extends Schema>(): CreateQuery<S> =>
  (queryCallback: QueryCallback<S, Row>, filterMap?: FilterMap<Row, Row>) =>
    pipe(
      queryCallback(kysely as Kysely.Kysely<QuerySchema<S>>).compile(),
      ({ sql, parameters }): SqliteQuery => ({
        sql,
        parameters: parameters as SqliteQuery["parameters"],
      }),
      (query) => ({
        query: serializeSqliteQuery(query),
        filterMap: filterMap ? cacheFilterMap(filterMap) : Function.identity,
      }),
    );
