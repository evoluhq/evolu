import { Brand, Context, Effect, Exit, Option, ReadonlyRecord } from "effect";
import { urlAlphabet } from "nanoid";
import {
  Bip39,
  Hmac,
  Mnemonic,
  NanoId,
  Sha512,
  slip21Derive,
} from "./Crypto.js";
import { initialMerkleTree, merkleTreeToString } from "./MerkleTree.js";
import { Id, SqliteBoolean, SqliteDate } from "./Model.js";
import { initDb, selectOwner } from "./Sql.js";
import { makeInitialTimestamp, timestampToString } from "./Timestamp.js";

export interface Db {
  readonly exec: (
    arg: string | QueryObject
  ) => Effect.Effect<never, never, ReadonlyArray<Row>>;

  readonly execNoSchemaless: (
    arg: string | QueryObject
  ) => Effect.Effect<never, NoSuchTableOrColumnError, ReadonlyArray<Row>>;

  readonly changes: Effect.Effect<never, never, number>;
}

export const Db = Context.Tag<Db>("evolu/Db");

export interface NoSuchTableOrColumnError {
  readonly _tag: "NoSuchTableOrColumnError";
  readonly what: "table" | "column";
  readonly name: string;
}

export interface QueryObject {
  readonly sql: string;
  readonly parameters: ReadonlyArray<Value>;
}

export type Query = string & Brand.Brand<"Query">;

export const queryObjectToQuery = ({ sql, parameters }: QueryObject): Query =>
  JSON.stringify({ sql, parameters }) as Query;

export type Value = null | string | number | Uint8Array;

export type Row = ReadonlyRecord.ReadonlyRecord<Value>;

/**
 * Schema defines database schema.
 */
export type Schema = ReadonlyRecord.ReadonlyRecord<{ id: Id } & Row>;

export interface CommonColumns {
  readonly createdAt: SqliteDate;
  readonly createdBy: OwnerId;
  readonly updatedAt: SqliteDate;
  readonly isDeleted: SqliteBoolean;
}

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

export const Owner = Context.Tag<Owner>("evolu/Owner");

/**
 * The unique identifier of `Owner` safely derived from its `Mnemonic`.
 */
export type OwnerId = Id & Brand.Brand<"Owner">;

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

export const defectToNoSuchTableOrColumnError = Effect.catchSomeDefect(
  (error) => {
    if (
      typeof error === "object" &&
      error != null &&
      "message" in error &&
      typeof error.message === "string"
    ) {
      const match = error.message.match(
        /sqlite3 result code 1: no such (table|column): (\S+)/
      );
      if (
        match &&
        (match[1] === "table" || match[1] === "column") &&
        typeof match[2] === "string"
      )
        return Option.some(
          Effect.fail<NoSuchTableOrColumnError>({
            _tag: "NoSuchTableOrColumnError",
            what: match[1],
            name: match[2],
          })
        );
    }

    return Option.none();
  }
);

const seedToOwnerId = (
  seed: Uint8Array
): Effect.Effect<Hmac | Sha512, never, OwnerId> =>
  slip21Derive(seed, ["Evolu", "Owner Id"]).pipe(
    Effect.map((key) => {
      // convert key to nanoid
      let id = "";
      for (let i = 0; i < 21; i++) {
        id += urlAlphabet[key[i] & 63];
      }
      return id as OwnerId;
    })
  );

const seedToOnwerEncryptionKey = (
  seed: Uint8Array
): Effect.Effect<Hmac | Sha512, never, Uint8Array> =>
  slip21Derive(seed, ["Evolu", "Encryption Key"]);

export const makeOwner = (
  mnemonic?: Mnemonic
): Effect.Effect<Bip39 | Hmac | Sha512, never, Owner> =>
  Effect.gen(function* (_) {
    const bip39 = yield* _(Bip39);
    if (mnemonic == null) mnemonic = yield* _(bip39.makeMnemonic);
    const seed = yield* _(bip39.mnemonicToSeed(mnemonic));
    const id = yield* _(seedToOwnerId(seed));
    const encryptionKey = yield* _(seedToOnwerEncryptionKey(seed));
    return { mnemonic, id, encryptionKey };
  });

const lazyInit = (
  mnemonic?: Mnemonic
): Effect.Effect<Db | Bip39 | Hmac | Sha512 | NanoId, never, Owner> =>
  Effect.all(
    [
      Db,
      makeOwner(mnemonic),
      makeInitialTimestamp.pipe(Effect.map(timestampToString)),
      Effect.succeed(merkleTreeToString(initialMerkleTree)),
    ],
    { concurrency: "unbounded" }
  ).pipe(
    Effect.tap(([db, owner, initialTimestamp, initialMerkleTree]) =>
      db.exec({
        sql: initDb(initialTimestamp, initialMerkleTree),
        parameters: [owner.mnemonic, owner.id, owner.encryptionKey],
      })
    ),
    Effect.map(([, owner]) => owner)
  );

export const init = (): Effect.Effect<
  Db | Bip39 | Hmac | Sha512 | NanoId,
  never,
  Owner
> =>
  Db.pipe(
    Effect.flatMap((db) =>
      db
        .execNoSchemaless(selectOwner)
        .pipe(Effect.map(([owner]) => owner as unknown as Owner))
    ),
    Effect.catchTag("NoSuchTableOrColumnError", () => lazyInit())
  );
