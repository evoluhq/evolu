import * as S from "@effect/schema/Schema";
import { Brand, Context, Either, Layer, ReadonlyRecord } from "effect";
import { Kysely, SelectQueryBuilder, Simplify } from "kysely";
import { Listener, Unsubscribe } from "./Store.js";
import { Millis } from "./Timestamp.js";

export interface Evolu<S extends Schema = Schema> {
  readonly subscribeError: (listener: Listener) => Unsubscribe;
  readonly getError: () => EvoluError | null;

  readonly subscribeOwner: (listener: Listener) => Unsubscribe;
  readonly getOwner: () => Owner | null;

  readonly createQuery: (queryCallback: QueryCallback<S, Row>) => Query;
  readonly subscribeQuery: (
    query: Query | null
  ) => (listener: Listener) => Unsubscribe;
  readonly getQuery: (query: Query | null) => ReadonlyArray<Row> | null;
  readonly loadQuery: (query: Query) => Promise<ReadonlyArray<Row>>;

  readonly subscribeSyncState: (listener: Listener) => Unsubscribe;
  readonly getSyncState: () => SyncState;

  readonly mutate: Mutate<S>;
  readonly ownerActions: OwnerActions;
}

// TODO: Consider generic Tag for Evolu Schema.
export const Evolu = Context.Tag<Evolu>();

/**
 * Schema defines database schema.
 */
export type Schema = ReadonlyRecord.ReadonlyRecord<{ id: Id } & Row>;

/**
 * Branded Id Schema for any table Id.
 * To create Id Schema for a specific table, use {@link id}.
 */
export const Id = S.string.pipe(S.pattern(/^[\w-]{21}$/), S.brand("Id"));
export type Id = S.To<typeof Id>;

export type Row = ReadonlyRecord.ReadonlyRecord<RowValue>;

export type RowValue = null | string | number | Uint8Array;

export type EvoluError = "a" | "b";

/**
 * `Owner` represents the Evolu database owner. Evolu auto-generates `Owner`
 * on the first run. `Owner` can be reset on the current device and restored
 * on a different one.
 */
export interface Owner {
  /** The `Mnemonic` associated with `Owner`. */
  readonly mnemonic: Mnemonic;
  /** The unique identifier of `Owner` safely derived from its `Mnemonic`. */
  readonly id: OwnerId;
  /* The encryption key used by `Owner` derived from its `Mnemonic`. */
  readonly encryptionKey: Uint8Array;
}
const Owner = Context.Tag<Owner>();

/**
 * Mnemonic is a password generated by Evolu in BIP39 format.
 *
 * A mnemonic, also known as a "seed phrase," is a set of 12 words in a
 * specific order chosen from a predefined list. The purpose of the BIP39
 * mnemonic is to provide a human-readable way of storing a private key.
 */
export type Mnemonic = string & Brand.Brand<"Mnemonic">;

/**
 * The unique identifier of `Owner` safely derived from its `Mnemonic`.
 */
export type OwnerId = Id & Brand.Brand<"Owner">;

export type QueryCallback<S extends Schema, QueryRow> = (
  db: KyselyWithoutMutation<SchemaForQuery<S>>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
) => SelectQueryBuilder<any, any, QueryRow>;

export type KyselyWithoutMutation<DB> = Pick<Kysely<DB>, "selectFrom" | "fn">;

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

/**
 * SQLite doesn't support the Date type, so Evolu uses SqliteDate instead.
 * Use the {@link cast} helper to cast SqliteDate from Date and back.
 * https://www.sqlite.org/quirks.html#no_separate_datetime_datatype
 */
export const SqliteDate = S.string.pipe(
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
 * A stringified SQL query with parameters.
 */
type Query = string & Brand.Brand<"Query">;

export type SyncState =
  | SyncStateIsSyncing
  | SyncStateIsSynced
  | SyncStateIsNotSynced;

export interface SyncStateIsSyncing {
  readonly _tag: "SyncStateIsSyncing";
}

export interface SyncStateIsSynced {
  readonly _tag: "SyncStateIsSynced";
  readonly time: Millis;
}

export interface SyncStateIsNotSynced {
  readonly _tag: "SyncStateIsNotSynced";
  readonly error: NetworkError | ServerError | PaymentRequiredError;
}

/**
 * This error occurs when there is a problem with the network connection,
 * or the server cannot be reached.
 */
export interface NetworkError {
  readonly _tag: "NetworkError";
}

export interface ServerError {
  readonly _tag: "ServerError";
  readonly status: number;
}

export interface PaymentRequiredError {
  readonly _tag: "PaymentRequiredError";
}

type Mutate<S extends Schema> = <
  U extends SchemaForMutate<S>,
  T extends keyof U,
>(
  table: T,
  values: Simplify<Partial<AllowAutoCasting<U[T]>>>,
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

export interface RestoreOwnerError {
  readonly _tag: "RestoreOwnerError";
}

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
  table: T
): S.BrandSchema<string, string & Brand.Brand<"Id"> & Brand.Brand<T>> =>
  Id.pipe(S.brand(table));

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

export const EvoluLive: Layer.Layer<
  never,
  never,
  Evolu<Schema>
> = Layer.succeed(
  Evolu,
  Evolu.of({
    subscribeError: () => {
      throw "";
    },
    getError: () => {
      throw "";
    },
    subscribeOwner: () => {
      throw "";
    },
    getOwner: () => {
      throw "";
    },
    createQuery: () => {
      throw "";
    },
    subscribeQuery: () => {
      throw "";
    },
    getQuery: () => {
      throw "";
    },
    loadQuery: () => {
      throw "";
    },
    subscribeSyncState: () => {
      throw "";
    },
    getSyncState: () => {
      throw "";
    },
    mutate: () => {
      throw "";
    },
    ownerActions: {
      reset: () => {
        throw "";
      },
      restore: () => {
        throw "";
      },
    },
  })
);
