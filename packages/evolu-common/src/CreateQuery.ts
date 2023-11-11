import { pipe } from "effect";
import * as Kysely from "kysely";
import { Query, Row, Schema, queryFromSqliteQuery } from "./Db.js";
import { SqliteBoolean, SqliteDate } from "./Model.js";
import { SqliteQuery } from "./Sqlite.js";

export type CreateQuery<S extends Schema> = <R extends Row>(
  queryCallback: QueryCallback<S, R>,
) => Query<R>;

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

export interface CommonColumns {
  readonly createdAt: SqliteDate;
  readonly updatedAt: SqliteDate;
  readonly isDeleted: SqliteBoolean;
}

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

export const makeCreateQuery =
  <S extends Schema>(): CreateQuery<S> =>
  <R extends Row>(queryCallback: QueryCallback<S, R>) =>
    pipe(
      queryCallback(kysely as Kysely.Kysely<QuerySchema<S>>).compile(),
      ({ sql, parameters }): SqliteQuery => ({
        sql,
        parameters: parameters as SqliteQuery["parameters"],
      }),
      (query) => queryFromSqliteQuery<R>(query),
    );
