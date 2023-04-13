import type { Brand } from "@effect/data/Brand";
import * as S from "@effect/schema/Schema";
import { pipe } from "fp-ts/lib/function.js";
import { nanoid } from "nanoid";

/**
 * Branded Id Schema for any table Id.
 * To create Id Schema for a specific table, use {@link id}.
 * To create an Id value for a specific table, use {@link createId}.
 */
export const Id = pipe(S.string, S.pattern(/^[\w-]{21}$/), S.brand("Id"));
export type Id = S.To<typeof Id>;

/**
 * A factory function to create {@link Id} Schema for a specific table.
 * To create an Id value for a specific table, use {@link createId}.
 *
 * ### Example
 *
 * ```
 * import * as S from "@effect/schema/Schema";
 * import * as E from "evolu";
 *
 * const TodoId = E.id("Todo");
 * type TodoId = S.To<typeof TodoId>;
 *
 * if (!S.is(TodoId)(value)) return;
 * ```
 */
export const id = <T extends string>(
  table: T
): S.BrandSchema<string, string & Brand<"Id"> & Brand<T>> =>
  pipe(Id, S.brand(table));

/**
 * A factory function to create an {@link Id} value for a specific table.
 *
 * ### Example
 *
 * ```
 * import * as E from "evolu";
 *
 * // const id: string & Brand<"Id"> & Brand<"Todo">
 * const id = E.createId<'Todo'>();
 * ```
 */
export const createId = <T extends string>(): Id & Brand<T> =>
  nanoid() as Id & Brand<T>;

/**
 * Mnemonic is a password generated by Evolu in BIP39 format.
 *
 * A mnemonic, also known as a "seed phrase," is a set of 12 words in a
 * specific order chosen from a predefined list. The purpose of the BIP39
 * mnemonic is to provide a human-readable way of storing a private key.
 */
export type Mnemonic = string & Brand<"Mnemonic">;

/**
 * OwnerId is the current user's {@link Id} safely derived from its {@link Mnemonic}.
 */
export type OwnerId = Id & Brand<"Owner">;

/**
 * `Owner` represents the Evolu database owner. Evolu auto-generates `Owner`
 * on the first run. `Owner` can be reset on the current device and restored
 * on a different one.
 */
export interface Owner {
  /** The `Mnemonic` associated with `Owner`. */
  readonly mnemonic: Mnemonic;
  /** The unique identifier of `Owner` derived from its `Mnemonic`. */
  readonly id: OwnerId;
  /* The encryption key used by `Owner` derived from its `Mnemonic`. */
  readonly encryptionKey: Uint8Array;
}

/**
 * SQLite doesn't support the boolean type, so Evolu uses SqliteBoolean instead.
 * Use the {@link cast} helper to cast SqliteBoolean from boolean and back.
 * https://www.sqlite.org/quirks.html#no_separate_boolean_datatype
 */
export const SqliteBoolean = S.union(S.literal(0), S.literal(1));
export type SqliteBoolean = S.To<typeof SqliteBoolean>;

/**
 * SQLite doesn't support the Date type, so Evolu uses SqliteDate instead.
 * Use the {@link cast} helper to cast SqliteDate from Date and back.
 * https://www.sqlite.org/quirks.html#no_separate_datetime_datatype
 */
export const SqliteDate = pipe(
  S.string,
  S.filter((s) => !isNaN(Date.parse(s)), {
    message: () => "a date as a string value in ISO format",
    identifier: "SqliteDate",
  }),
  S.brand("SqliteDate")
);
export type SqliteDate = S.To<typeof SqliteDate>;

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
 * import * as S from "@effect/schema/Schema";
 * import * as E from "evolu";
 *
 * if (!S.is(E.String1000)(value)) return;
 * function foo(value: E.String1000) {}
 * ```
 */
export const String1000 = pipe(
  S.string,
  S.maxLength(1000),
  S.brand("String1000")
);
export type String1000 = S.To<typeof String1000>;

/**
 * A nonempty string with a maximum length of 1000 characters.
 *
 * ### Example
 *
 * ```
 * import * as S from "@effect/schema/Schema";
 * import * as E from "evolu";
 *
 * if (!S.is(E.NonEmptyString1000)(value)) return;
 * function foo(value: E.NonEmptyString1000) {}
 * ```
 */
export const NonEmptyString1000 = pipe(
  S.string,
  S.minLength(1),
  S.maxLength(1000),
  S.brand("NonEmptyString1000")
);
export type NonEmptyString1000 = S.To<typeof NonEmptyString1000>;