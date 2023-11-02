import * as Kysely from "kysely";
import { CommonColumns, Schema } from "./Db.js";
import { SqliteBoolean, SqliteDate } from "./Model.js";

export interface Mutations<S extends Schema> {
  create: <K extends keyof S>(
    table: K,
    values: Kysely.Simplify<
      PartialOnlyForNullable<CastableForMutate<Omit<S[K], "id">>>
    >,
    onComplete?: () => void,
  ) => {
    readonly id: S[K]["id"];
  };

  update: <K extends keyof S>(
    table: K,
    values: Kysely.Simplify<
      Partial<
        CastableForMutate<Omit<S[K], "id"> & Pick<CommonColumns, "isDeleted">>
      > & { readonly id: S[K]["id"] }
    >,
    onComplete?: () => void,
  ) => {
    readonly id: S[K]["id"];
  };
}

// https://stackoverflow.com/a/54713648/233902
type PartialOnlyForNullable<
  T,
  NK extends keyof T = {
    [K in keyof T]: null extends T[K] ? K : never;
  }[keyof T],
  NP = Pick<T, Exclude<keyof T, NK>> & Partial<Pick<T, NK>>,
> = { [K in keyof NP]: NP[K] };

/**
 * SQLite doesn't support Date nor Boolean types, so Evolu emulates them
 * with {@link SqliteBoolean} and {@link SqliteDate}.
 *
 * For {@link SqliteBoolean}, you can use JavaScript boolean.
 * For {@link SqliteDate}, you can use JavaScript Date.
 */
type CastableForMutate<T> = {
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
