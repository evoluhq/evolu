import * as Brand from "@effect/data/Brand";
import * as Context from "@effect/data/Context";
import * as ReadonlyRecord from "@effect/data/ReadonlyRecord";
import * as Equivalence from "@effect/data/typeclass/Equivalence";
import * as Effect from "@effect/io/Effect";
import * as Exit from "@effect/io/Exit";
import * as Mnemonic from "./Mnemonic.js";
import * as Model from "./Model.js";

/**
 * `Owner` represents the Evolu database owner. Evolu auto-generates `Owner`
 * on the first run. `Owner` can be reset on the current device and restored
 * on a different one.
 */
export interface Owner {
  /** The `Mnemonic` associated with `Owner`. */
  readonly mnemonic: Mnemonic.Mnemonic;
  /** The unique identifier of `Owner` safely derived from its `Mnemonic`. */
  readonly id: Model.Id & Brand.Brand<"Owner">;
  /* The encryption key used by `Owner` derived from its `Mnemonic`. */
  readonly encryptionKey: Uint8Array;
}

export type Value = null | string | number | Uint8Array;

export type Row = ReadonlyRecord.ReadonlyRecord<Value>;

export type Rows = ReadonlyArray<Row>;

export interface RowsWithLoadingState {
  readonly rows: Rows;
  readonly isLoading: boolean;
}

// Do query?

// Like Kysely CompiledQuery but without a `query` prop.
export interface Query {
  readonly sql: string;
  readonly parameters: ReadonlyArray<Value>;
}

export type QueryString = string & Brand.Brand<"QueryString">;

export type RowsCache = ReadonlyMap<QueryString, RowsWithLoadingState>;

export const QueryStringEquivalence: Equivalence.Equivalence<QueryString> =
  Equivalence.string;

export const queryToString = ({ sql, parameters }: Query): QueryString =>
  JSON.stringify({ sql, parameters }) as QueryString;

export const queryFromString = (s: QueryString): Query =>
  JSON.parse(s) as Query;

export interface Db {
  readonly exec: (arg: string | Query) => Effect.Effect<never, never, Rows>;
  readonly changes: () => Effect.Effect<never, never, number>;
}
export const Db = Context.Tag<Db>();

export const transaction = <R, E, A>(
  effect: Effect.Effect<R, E, A>
): Effect.Effect<Db | R, E, A> =>
  Effect.flatMap(Db, (db) =>
    Effect.acquireUseRelease(
      db.exec("begin"),
      () => effect,
      (_, exit) =>
        Exit.isFailure(exit) ? db.exec("rollback") : db.exec("commit")
    )
  );

export const deleteAllTables: Effect.Effect<Db, never, void> = Effect.gen(
  function* ($) {
    const db = yield* $(Db);
    yield* $(
      db.exec(`select name from sqlite_master where type='table'`),
      Effect.flatMap(
        // The dropped table is completely removed from the database schema and
        // the disk file. The table can not be recovered.
        // All indices and triggers associated with the table are also deleted.
        // https://sqlite.org/lang_droptable.html
        Effect.forEachDiscard(({ name }) => db.exec(`drop table ${name}`))
      )
    );
  }
);
