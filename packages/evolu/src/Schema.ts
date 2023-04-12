import * as ReadonlyRecord from "@effect/data/ReadonlyRecord";
import { Simplify } from "kysely";
import * as Model from "./Model.js";
import * as Owner from "./Owner.js";
import * as Db from "./Db.js";

export type Schema = ReadonlyRecord.ReadonlyRecord<
  { id: Model.Id } & Record<string, Db.Value>
>;

type NullableExceptOfId<T> = {
  readonly [K in keyof T]: K extends "id" ? T[K] : T[K] | null;
};

interface CommonColumns {
  readonly createdAt: Model.SqliteDate;
  readonly createdBy: Owner.Id;
  readonly updatedAt: Model.SqliteDate;
  readonly isDeleted: Model.SqliteBoolean;
}

type SchemaForMutate<S extends Schema> = {
  readonly [Table in keyof S]: NullableExceptOfId<
    {
      readonly [Column in keyof S[Table]]: S[Table][Column];
    } & Pick<CommonColumns, "isDeleted">
  >;
};

type AllowAutoCasting<T> = {
  readonly [K in keyof T]: T[K] extends Model.SqliteBoolean
    ? boolean | Model.SqliteBoolean
    : T[K] extends null | Model.SqliteBoolean
    ? null | boolean | Model.SqliteBoolean
    : T[K] extends Model.SqliteDate
    ? Date | Model.SqliteDate
    : T[K] extends null | Model.SqliteDate
    ? null | Date | Model.SqliteDate
    : T[K];
};

export type Mutate<S extends Schema> = <
  U extends SchemaForMutate<S>,
  T extends keyof U
>(
  table: T,
  values: Simplify<Partial<AllowAutoCasting<U[T]>>>,
  onComplete?: () => void
) => {
  readonly id: U[T]["id"];
};

// https://stackoverflow.com/a/54713648/233902
type NullablePartial<
  T,
  NK extends keyof T = {
    [K in keyof T]: null extends T[K] ? K : never;
  }[keyof T],
  NP = Pick<T, Exclude<keyof T, NK>> & Partial<Pick<T, NK>>
> = { [K in keyof NP]: NP[K] };

export type Create<S extends Schema> = <T extends keyof S>(
  table: T,
  values: Simplify<NullablePartial<AllowAutoCasting<Omit<S[T], "id">>>>,
  onComplete?: () => void
) => {
  readonly id: S[T]["id"];
};

export type Update<S extends Schema> = <T extends keyof S>(
  table: T,
  values: Simplify<
    Partial<
      AllowAutoCasting<Omit<S[T], "id"> & Pick<CommonColumns, "isDeleted">>
    > & { id: S[T]["id"] }
  >,
  onComplete?: () => void
) => {
  readonly id: S[T]["id"];
};

export type SchemaForQuery<S extends Schema> = {
  readonly [Table in keyof S]: NullableExceptOfId<
    {
      readonly [Column in keyof S[Table]]: S[Table][Column];
    } & CommonColumns
  >;
};

export interface TableDefinition {
  readonly name: string;
  readonly columns: ReadonlyArray<string>;
}

export type TableDefinitions = ReadonlyArray<TableDefinition>;
