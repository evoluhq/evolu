import * as S from "@effect/schema/Schema";
import { Brand, Context, Effect, ReadonlyRecord } from "effect";

export interface Db {
  readonly exec: (
    arg: string | QueryObject
  ) => Effect.Effect<never, never, ReadonlyArray<Row>>;

  readonly changes: () => Effect.Effect<never, never, number>;
}

export const Db = Context.Tag<Db>();

export interface QueryObject {
  readonly sql: string;
  readonly parameters: ReadonlyArray<Value>;
}

export type Value = null | string | number | Uint8Array;

export type Row = ReadonlyRecord.ReadonlyRecord<Value>;

export type Query = string & Brand.Brand<"Query">;

export const queryObjectToQuery = ({ sql, parameters }: QueryObject): Query =>
  JSON.stringify({ sql, parameters }) as Query;

// const queryObjectFromQuery = (s: Query): QueryObject =>
//   JSON.parse(s) as QueryObject;

/**
 * SQLite doesn't support the Date type, so Evolu uses SqliteDate instead.
 * Use the {@link cast} helper to cast SqliteDate from Date and back.
 * https://www.sqlite.org/quirks.html#no_separate_datetime_datatype
 */
export const SqliteDate: S.BrandSchema<
  string,
  string & Brand.Brand<"SqliteDate">
> = S.string.pipe(
  S.filter((s) => !isNaN(Date.parse(s)), {
    message: () => "a date as a string value in ISO format",
    identifier: "SqliteDate",
  }),
  S.brand("SqliteDate")
);
export type SqliteDate = S.To<typeof SqliteDate>;

/**
 * SQLite doesn't support the boolean type, so Evolu uses SqliteBoolean instead.
 * Use the {@link cast} helper to cast SqliteBoolean from boolean and back.
 * https://www.sqlite.org/quirks.html#no_separate_boolean_datatype
 */
export const SqliteBoolean = S.union(S.literal(0), S.literal(1));
export type SqliteBoolean = S.To<typeof SqliteBoolean>;

/**
 * A helper for casting types not supported by SQLite.
 * SQLite doesn't support Date nor Boolean types, so Evolu emulates them
 * with {@link SqliteBoolean} and {@link SqliteDate}.
 *
 * ### Example
 *
 * ```
 * // isDeleted is SqliteBoolean
 * .where("isDeleted", "is not", cast(true))
 * ```
 */
export function cast(value: boolean): SqliteBoolean;
export function cast(value: SqliteBoolean): boolean;
export function cast(value: Date): SqliteDate;
export function cast(value: SqliteDate): Date;
export function cast(
  value: boolean | SqliteBoolean | Date | SqliteDate
): boolean | SqliteBoolean | Date | SqliteDate {
  if (typeof value === "boolean") return value === true ? 1 : 0;
  if (typeof value === "number") return value === 1;
  if (value instanceof Date) return value.toISOString() as SqliteDate;
  return new Date(value);
}
