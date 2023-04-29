import * as Brand from "@effect/data/Brand";
import { pipe } from "@effect/data/Function";
import * as Schema from "@effect/schema/Schema";
import { nanoid } from "nanoid";

/**
 * Branded Id Schema for any table Id.
 * To create Id Schema for a specific table, use {@link id}.
 * To create an Id value for a specific table, use {@link createId}.
 */
export const Id = pipe(
  Schema.string,
  Schema.pattern(/^[\w-]{21}$/),
  Schema.brand("Id")
);
export type Id = Schema.To<typeof Id>;

/**
 * A factory function to create {@link Id} Schema for a specific table.
 * To create an Id value for a specific table, use {@link createId}.
 *
 * ### Example
 *
 * ```
 * import * as Schema from "@effect/schema/Schema";
 * import * as Evolu from "evolu";
 *
 * const TodoId = Evolu.id("Todo");
 * type TodoId = Schema.To<typeof TodoId>;
 *
 * if (!Schema.is(TodoId)(value)) return;
 * ```
 */
export const id = <T extends string>(
  table: T
): Schema.BrandSchema<string, string & Brand.Brand<"Id"> & Brand.Brand<T>> =>
  pipe(Id, Schema.brand(table));

/**
 * A factory function to create an {@link Id} value for a specific table.
 *
 * ### Example
 *
 * ```
 * import * as Evolu from "evolu";
 *
 * // const id: string & Brand<"Id"> & Brand<"Todo">
 * const id = Evolu.createId<'Todo'>();
 * ```
 */
export const createId = <T extends string>(): Id & Brand.Brand<T> =>
  nanoid() as Id & Brand.Brand<T>;

/**
 * SQLite doesn't support the boolean type, so Evolu uses SqliteBoolean instead.
 * Use the {@link cast} helper to cast SqliteBoolean from boolean and back.
 * https://www.sqlite.org/quirks.html#no_separate_boolean_datatype
 */
export const SqliteBoolean = Schema.union(Schema.literal(0), Schema.literal(1));
export type SqliteBoolean = Schema.To<typeof SqliteBoolean>;

/**
 * SQLite doesn't support the Date type, so Evolu uses SqliteDate instead.
 * Use the {@link cast} helper to cast SqliteDate from Date and back.
 * https://www.sqlite.org/quirks.html#no_separate_datetime_datatype
 */
export const SqliteDate = pipe(
  Schema.string,
  Schema.filter((s) => !isNaN(Date.parse(s)), {
    message: () => "a date as a string value in ISO format",
    identifier: "SqliteDate",
  }),
  Schema.brand("SqliteDate")
);
export type SqliteDate = Schema.To<typeof SqliteDate>;

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

/**
 * A string with a maximum length of 1000 characters.
 *
 * ### Example
 *
 * ```
 * import * as Schema from "@effect/schema/Schema";
 * import * as Evolu from "evolu";
 *
 * if (!Schema.is(Evolu.String1000)(value)) return;
 * function foo(value: Evolu.String1000) {}
 * ```
 */
export const String1000 = pipe(
  Schema.string,
  Schema.maxLength(1000),
  Schema.brand("String1000")
);
export type String1000 = Schema.To<typeof String1000>;

/**
 * A nonempty string with a maximum length of 1000 characters.
 *
 * ### Example
 *
 * ```
 * import * as Schema from "@effect/schema/Schema";
 * import * as Evolu from "evolu";
 *
 * if (!Schema.is(Evolu.NonEmptyString1000)(value)) return;
 * function foo(value: Evolu.NonEmptyString1000) {}
 * ```
 */
export const NonEmptyString1000 = pipe(
  Schema.string,
  Schema.minLength(1),
  Schema.maxLength(1000),
  Schema.brand("NonEmptyString1000")
);
export type NonEmptyString1000 = Schema.To<typeof NonEmptyString1000>;
