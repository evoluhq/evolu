import * as Schema from "@effect/schema/Schema";
import { Brand } from "effect";
import { Row } from "./Sqlite.js";

/**
 * Branded Id Schema for any table Id.
 * To create Id Schema for a specific table, use {@link id}.
 */
export const Id = Schema.string.pipe(
  Schema.pattern(/^[\w-]{21}$/),
  Schema.brand("Id"),
);
export type Id = Schema.To<typeof Id>;

/**
 * A factory function to create {@link Id} Schema for a specific table.
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
  table: T,
): Schema.BrandSchema<string, string & Brand.Brand<"Id"> & Brand.Brand<T>> =>
  Id.pipe(Schema.brand(table));

/**
 * SQLite doesn't support the Date type, so Evolu uses SqliteDate instead.
 * Use the {@link cast} helper to cast SqliteDate from Date and back.
 * https://www.sqlite.org/quirks.html#no_separate_datetime_datatype
 */
export const SqliteDate = Schema.string.pipe(
  Schema.filter((s) => !isNaN(Date.parse(s))),
  Schema.brand("SqliteDate"),
);
export type SqliteDate = Schema.To<typeof SqliteDate>;

/**
 * SQLite doesn't support the boolean type, so Evolu uses SqliteBoolean instead.
 * Use the {@link cast} helper to cast SqliteBoolean from boolean and back.
 * https://www.sqlite.org/quirks.html#no_separate_boolean_datatype
 */
export const SqliteBoolean = Schema.number.pipe(
  Schema.int(),
  Schema.filter((s) => s === 0 || s === 1),
  Schema.brand("SqliteBoolean"),
);
export type SqliteBoolean = Schema.To<typeof SqliteBoolean>;

/**
 * SQLite doesn't support Date nor Boolean types, so Evolu emulates them
 * with {@link SqliteBoolean} and {@link SqliteDate}.
 *
 * For {@link SqliteBoolean}, you can use JavaScript boolean.
 * For {@link SqliteDate}, you can use JavaScript Date.
 */
export type CastableForMutate<T> = {
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
  value: boolean | SqliteBoolean | Date | SqliteDate,
): boolean | SqliteBoolean | Date | SqliteDate {
  if (typeof value === "boolean")
    return (value === true ? 1 : 0) as SqliteBoolean;
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
export const String1000: Schema.BrandSchema<
  string,
  string & Brand.Brand<"String1000">
> = Schema.string.pipe(Schema.maxLength(1000), Schema.brand("String1000"));
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
export const NonEmptyString1000 = Schema.string.pipe(
  Schema.minLength(1),
  Schema.maxLength(1000),
  Schema.brand("NonEmptyString1000"),
);
export type NonEmptyString1000 = Schema.To<typeof NonEmptyString1000>;

/**
 * A positive integer.
 *
 * ### Example
 *
 * ```
 * import * as Schema from "@effect/schema/Schema";
 * import * as Evolu from "evolu";
 *
 * if (!Schema.is(Evolu.PositiveInt)(value)) return;
 * function foo(value: Evolu.PositiveInt) {}
 * ```
 */
export const PositiveInt = Schema.number.pipe(
  Schema.int(),
  Schema.positive(),
  Schema.brand("PositiveInt"),
);
export type PositiveInt = Schema.To<typeof PositiveInt>;

/**
 * Filter and map array items in one step with the correct return type and
 * without unreliable TypeScript type guards.
 *
 * ### Examples
 *
 * ```
 * useQuery(
 *   (db) => db.selectFrom("todo").selectAll(),
 *   // Filter and map nothing.
 *   (row) => row,
 * );
 *
 * useQuery(
 *   (db) => db.selectFrom("todo").selectAll(),
 *   // Filter items with title != null.
 *   // Note the title type isn't nullable anymore in rows.
 *   ({ title, ...rest }) => title != null && { title, ...rest },
 * );
 * ```
 */
export type FilterMap<QueryRow extends Row, FilterMapRow extends Row> = (
  row: QueryRow,
) => OrNullOrFalse<FilterMapRow>;

export type OrNullOrFalse<T> = T | null | false;

export type ExcludeNullAndFalse<T> = Exclude<T, null | false>;
