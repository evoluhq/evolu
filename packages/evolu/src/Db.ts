import * as ReadonlyRecord from "@effect/data/ReadonlyRecord";
import * as Either from "@effect/data/Either";
import * as Model from "./Model.js";
import * as Brand from "@effect/data/Brand";
import { Simplify } from "kysely";

export type Value = null | string | number | Uint8Array;

export type Row = ReadonlyRecord.ReadonlyRecord<Value>;

export type Rows = readonly Row[];

export interface RowsWithLoadingState {
  readonly rows: Rows;
  readonly isLoading: boolean;
}

export type Schema = ReadonlyRecord.ReadonlyRecord<
  { id: Model.Id } & Record<string, Value>
>;

type NullableExceptOfId<T> = {
  readonly [K in keyof T]: K extends "id" ? T[K] : T[K] | null;
};

interface CommonColumns {
  readonly createdAt: Model.SqliteDate;
  readonly createdBy: Model.OwnerId;
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

type AllowCasting<T> = {
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

export type Mutate<S extends Schema = Schema> = <
  U extends SchemaForMutate<S>,
  T extends keyof U
>(
  table: T,
  values: Simplify<Partial<AllowCasting<U[T]>>>,
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
  values: Simplify<NullablePartial<AllowCasting<Omit<S[T], "id">>>>,
  onComplete?: () => void
) => {
  readonly id: S[T]["id"];
};

export type Update<S extends Schema> = <T extends keyof S>(
  table: T,
  values: Simplify<
    Partial<
      AllowCasting<Omit<S[T], "id"> & Pick<CommonColumns, "isDeleted">>
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

export interface RestoreOwnerError {
  readonly _tag: "invalid mnemonic";
}

export interface OwnerActions {
  /**
   * Use `reset` to delete all local data from the current device.
   * After the deletion, Evolu reloads all browser tabs that use Evolu.
   */
  readonly reset: () => void;
  /**
   * Use `restore` to restore `Owner` with synced data on a different device.
   */
  readonly restore: (
    mnemonic: string
  ) => Promise<Either.Either<RestoreOwnerError, void>>;
}

// Like Kysely CompiledQuery but without a `query` prop.
export interface Query {
  readonly sql: string;
  readonly parameters: readonly Value[];
}

export type QueryString = string & Brand.Brand<"QueryString">;

export const queryToString = ({ sql, parameters }: Query): QueryString =>
  JSON.stringify({ sql, parameters }) as QueryString;

export const queryFromString = (s: QueryString): Query =>
  JSON.parse(s) as Query;
