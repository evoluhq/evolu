/**
 * The `model` module contains branded types for data modeling.
 * You don't have to use branded types, but we recommend it.
 * Note Evolu data are eternal. You can't delete local-first data
 * because you can't delete data from offline devices - you can
 * only mark them as deleted. That's why branded types are so helpful
 * because they protect developers against accidental mistakes like
 * storing a too large string, for example.
 * Such eternal data also need append-only modeling. You can't
 * remove a column, but you can decide you don't need it anymore.
 * That's why all columns except `id` are nullable by default;
 * it's a similar principle to GraphQL nullability.
 */
export { enum, number, string } from "zod";
export type { infer } from "zod";
import { nanoid } from "nanoid";
import { BRAND, z } from "zod";

export type ID<T extends string> = string & BRAND<`${T}Id`>;

/**
 * Create branded ID type for a table.
 * It's useful for foreign keys.
 *
 * @example
 * const PersonId = id<"person">();
 */
export const id = <T extends string>(): z.ZodBranded<
  z.ZodEffects<z.ZodString, string, string>,
  `${T}Id`
> =>
  z
    .string()
    .refine((s) => /^[\w-]{21}$/.test(s))
    .brand<`${T}Id`>();

/**
 * Create branded ID value.
 *
 * @example
 * const id = createId<"person">();
 */
export const createId = <T extends string>(): ID<T> => nanoid() as ID<T>;

export type CreateId = typeof createId;

export const OwnerId = id<"owner">();
export type OwnerId = z.TypeOf<typeof OwnerId>;

export type Mnemonic = string & BRAND<"Mnemonic">;

/** model.string().min(1).max(1000).brand<"NonEmptyString1000">() */
export const NonEmptyString1000 = z
  .string()
  .min(1)
  .max(1000)
  .brand<"NonEmptyString1000">();
export type NonEmptyString1000 = z.infer<typeof NonEmptyString1000>;

/** model.string().max(1000).brand<"String1000">() */
export const String1000 = z.string().max(1000).brand<"String1000">();
export type String1000 = z.infer<typeof String1000>;

/** model.string().email().brand<"Email">() */
export const Email = z.string().email().brand<"Email">();
export type Email = z.infer<typeof Email>;

/** model.string().url().brand<"Url">() */
export const Url = z.string().url().brand<"Url">();
export type Url = z.infer<typeof Url>;

/**
 * SQLite has no Boolean datatype. For casting, use `model.cast`.
 * https://www.sqlite.org/quirks.html#no_separate_boolean_datatype
 */
export const SqliteBoolean = z
  .number()
  .refine((n) => n === 0 || n === 1)
  .brand<"SqliteBoolean">();
export type SqliteBoolean = z.infer<typeof SqliteBoolean>;

/**
 * SQLite has no DateTime datatype. For casting, use `model.cast`.
 * https://www.sqlite.org/quirks.html#no_separate_datetime_datatype
 */
export const SqliteDateTime = z
  .string()
  .refine((s) => !isNaN(new Date(s).getTime()))
  .brand<"SqliteDateTime">();
export type SqliteDateTime = z.infer<typeof SqliteDateTime>;

/**
 * A helper for casting types not supported by SQLite.
 * SQLite has no DateTime nor Boolean types, so Evolu emulates it
 * via `SqliteBoolean` and `SqliteDateTime`.
 *
 * @example
 * .where("isDeleted", "is not", model.cast(true))
 */
export function cast(value: boolean): SqliteBoolean;
export function cast(value: SqliteBoolean): boolean;
export function cast(value: Date): SqliteDateTime;
export function cast(value: SqliteDateTime): Date;
export function cast(
  value: boolean | SqliteBoolean | Date | SqliteDateTime
): boolean | SqliteBoolean | Date | SqliteDateTime {
  if (typeof value === "boolean")
    return (value === true ? 1 : 0) as SqliteBoolean;
  if (typeof value === "number") return value === 1;
  if (value instanceof Date) return value.toISOString() as SqliteDateTime;
  return new Date(value);
}

/** model.number().refine(Number.isSafeInteger).brand<"Integer">() */
export const Integer = z
  .number()
  .refine(Number.isSafeInteger)
  .brand<"Integer">();
export type Integer = z.infer<typeof Integer>;

/** model.number().refine(Number.isFinite).brand<"Float">() */
export const Float = z.number().refine(Number.isFinite).brand<"Float">();
export type Float = z.infer<typeof Float>;
