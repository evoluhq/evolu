import { Brand, Context, Effect, Exit, ReadonlyRecord } from "effect";
import { Id, SqliteBoolean, SqliteDate } from "./Branded.js";
import { Crypto } from "./Crypto.js";
import { Mnemonic } from "./Mnemonic.js";

export interface Db {
  readonly exec: (
    arg: string | QueryObject
  ) => Effect.Effect<never, never, ReadonlyArray<Row>>;

  readonly changes: Effect.Effect<never, never, number>;
}

export const Db = Context.Tag<Db>();

export interface QueryObject {
  readonly sql: string;
  readonly parameters: ReadonlyArray<Value>;
}

export type Value = null | string | number | Uint8Array;

export type Row = ReadonlyRecord.ReadonlyRecord<Value>;

/**
 * Schema defines database schema.
 */
export type Schema = ReadonlyRecord.ReadonlyRecord<{ id: Id } & Row>;

export interface CommonColumns {
  readonly createdAt: SqliteDate;
  readonly createdBy: Owner["id"];
  readonly updatedAt: SqliteDate;
  readonly isDeleted: SqliteBoolean;
}

export type Query = string & Brand.Brand<"Query">;

export const queryObjectToQuery = ({ sql, parameters }: QueryObject): Query =>
  JSON.stringify({ sql, parameters }) as Query;

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

export const Owner = Context.Tag<Owner>();

/**
 * The unique identifier of `Owner` safely derived from its `Mnemonic`.
 */
export type OwnerId = Id & Brand.Brand<"Owner">;

// const queryObjectFromQuery = (s: Query): QueryObject =>
//   JSON.parse(s) as QueryObject;

export const transaction = <R, E, A>(
  effect: Effect.Effect<R, E, A>
): Effect.Effect<Db | R, E, A> =>
  Effect.flatMap(Db, (db) =>
    Effect.acquireUseRelease(
      db.exec("BEGIN"),
      () => effect,
      (_, exit) =>
        Exit.isFailure(exit) ? db.exec("ROLLBACK") : db.exec("COMMIT")
    )
  );

export const init = (): Effect.Effect<Db | Crypto, never, Owner> =>
  Effect.async((resume) => {
    setTimeout(() => {
      resume(Effect.succeed("ok" as unknown as Owner));
    }, 2000);
  });

// TODO: A schemaless helper.
