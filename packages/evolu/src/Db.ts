import * as Brand from "@effect/data/Brand";
import * as Context from "@effect/data/Context";
import { pipe } from "@effect/data/Function";
import * as ReadonlyRecord from "@effect/data/ReadonlyRecord";
import * as Equivalence from "@effect/data/typeclass/Equivalence";
import * as Cause from "@effect/io/Cause";
import * as Effect from "@effect/io/Effect";
import * as Exit from "@effect/io/Exit";
import * as MerkleTree from "./MerkleTree.js";
import * as Mnemonic from "./Mnemonic.js";
import * as Owner from "./Owner.js";
import * as Timestamp from "./Timestamp.js";

export type Value = null | string | number | Uint8Array;

export type Row = ReadonlyRecord.ReadonlyRecord<Value>;

export type Rows = ReadonlyArray<Row>;

export interface RowsWithLoadingState {
  readonly rows: Rows;
  readonly isLoading: boolean;
}

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

const getOwner: Effect.Effect<Db, never, Owner.Owner> = pipe(
  Db,
  Effect.flatMap((db) =>
    db.exec(`select "mnemonic", "id", "encryptionKey" from __owner limit 1`)
  ),
  Effect.map(([owner]) => owner as unknown as Owner.Owner)
);

const init = (
  mnemonic?: Mnemonic.Mnemonic
): Effect.Effect<Db, never, Owner.Owner> =>
  pipe(
    Effect.allPar(
      Owner.createOwner(mnemonic),
      Db,
      pipe(Timestamp.createInitialTimestamp, Effect.map(Timestamp.toString)),
      Effect.succeed(pipe(MerkleTree.createInitial(), MerkleTree.toString))
    ),
    Effect.tap(([owner, db, timestamp, merkleTree]) =>
      db.exec({
        sql: `
          create table __message (
            "timestamp" blob primary key,
            "table" blob,
            "row" blob,
            "column" blob,
            "value" blob
          ) without rowid;

          create index index__message on __message (
            "table",
            "row",
            "column",
            "timestamp"
          );

          create table __clock (
            "timestamp" blob,
            "merkleTree" blob
          );

          insert into __clock ("timestamp", "merkleTree")
          values ('${timestamp}', '${merkleTree}');

          create table __owner (
            "mnemonic" blob,
            "id" blob,
            "encryptionKey" blob
          );

          insert into __owner ("mnemonic", "id", "encryptionKey")
          values (?, ?, ?);
        `,
        parameters: [owner.mnemonic, owner.id, owner.encryptionKey],
      })
    ),
    Effect.map(([owner]) => owner)
  );

const migrateToSlip21: Effect.Effect<Db, never, Owner.Owner> = pipe(
  Db,
  Effect.flatMap((db) =>
    Effect.gen(function* ($) {
      const { mnemonic } = (yield* $(
        db.exec(`select "mnemonic" from __owner limit 1`)
      ))[0] as { mnemonic: Mnemonic.Mnemonic };
      const owner = yield* $(Owner.createOwner(mnemonic));
      yield* $(
        db.exec({
          sql: `
            alter table "__owner" add column "encryptionKey" blob;
            update "__owner" set "id" = ?, "encryptionKey" = ?;
          `,
          parameters: [owner.id, owner.encryptionKey],
        })
      );
      return owner;
    })
  )
);

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

export const lazyInit = (
  mnemonic?: Mnemonic.Mnemonic
): Effect.Effect<Db, never, Owner.Owner> =>
  pipe(
    getOwner,
    Effect.catchAllCause((cause) => {
      const pretty = Cause.pretty(cause);
      if (pretty.includes("no such table: __owner")) return init(mnemonic);
      if (pretty.includes("no such column: encryptionKey"))
        return migrateToSlip21;
      return Effect.failCause(cause);
    }),
    transaction
  );
