import * as S from "@effect/schema/Schema";
import { ReadonlyArray, ReadonlyRecord, pipe } from "effect";
import * as Kysely from "kysely";
import { Row, SqliteBoolean, SqliteDate } from "./Db.js";
import { Id } from "./Id.js";
import { Owner } from "./Owner.js";
import { getPropertySignatures } from "./utils.js";

/**
 * Schema defines database schema.
 */
export type Schema = ReadonlyRecord.ReadonlyRecord<{ id: Id } & Row>;

interface Table {
  readonly name: string;
  readonly columns: ReadonlyArray<string>;
}

export type QueryCallback<S extends Schema, QueryRow> = (
  db: KyselyWithoutMutation<SchemaForQuery<S>>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
) => Kysely.SelectQueryBuilder<any, any, QueryRow>;

export type KyselyWithoutMutation<DB> = Pick<
  Kysely.Kysely<DB>,
  "selectFrom" | "fn"
>;

export type SchemaForQuery<S extends Schema> = {
  readonly [Table in keyof S]: NullableExceptOfId<
    {
      readonly [Column in keyof S[Table]]: S[Table][Column];
    } & CommonColumns
  >;
};

type NullableExceptOfId<T> = {
  readonly [K in keyof T]: K extends "id" ? T[K] : T[K] | null;
};

export interface CommonColumns {
  readonly createdAt: SqliteDate;
  readonly createdBy: Owner["id"];
  readonly updatedAt: SqliteDate;
  readonly isDeleted: SqliteBoolean;
}

export type Mutate<S extends Schema> = <
  U extends SchemaForMutate<S>,
  T extends keyof U,
>(
  table: T,
  values: Kysely.Simplify<Partial<AllowAutoCasting<U[T]>>>,
  onComplete?: () => void
) => {
  readonly id: U[T]["id"];
};

type SchemaForMutate<S extends Schema> = {
  readonly [Table in keyof S]: NullableExceptOfId<
    {
      readonly [Column in keyof S[Table]]: S[Table][Column];
    } & Pick<CommonColumns, "isDeleted">
  >;
};

export type AllowAutoCasting<T> = {
  readonly [K in keyof T]: T[K] extends SqliteBoolean
    ? boolean | SqliteBoolean
    : T[K] extends null | SqliteBoolean
    ? null | boolean | SqliteBoolean
    : T[K] extends SqliteDate
    ? Date | SqliteDate
    : T[K] extends null | SqliteDate
    ? null | Date | SqliteDate
    : T[K];
};

// TODO: Enforce via CommonColumns.
const commonColumns = ["createdAt", "createdBy", "updatedAt", "isDeleted"];

export const schemaToTables = (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schema: S.Schema<any, any>
): ReadonlyArray<Table> =>
  pipe(
    getPropertySignatures(schema),
    ReadonlyRecord.toEntries,
    ReadonlyArray.map(
      ([name, schema]): Table => ({
        name,
        columns: Object.keys(getPropertySignatures(schema)).concat(
          commonColumns
        ),
      })
    )
  );
