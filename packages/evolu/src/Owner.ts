import * as Either from "@effect/data/Either";
import { pipe } from "@effect/data/Function";
import * as Cause from "@effect/io/Cause";
import * as Effect from "@effect/io/Effect";
import { urlAlphabet } from "nanoid";
import * as Db from "./Db.js";
import * as DbWorker from "./DbWorker.js";
import * as MerkleTree from "./MerkleTree.js";
import * as Mnemonic from "./Mnemonic.js";
import * as Timestamp from "./Timestamp.js";

export interface RestoreOwnerError {
  readonly _tag: "RestoreOwnerError";
}

export interface Actions {
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

const get: Effect.Effect<Db.Db, never, Db.Owner> = pipe(
  Db.Db,
  Effect.flatMap((db) =>
    db.exec(`select "mnemonic", "id", "encryptionKey" from __owner limit 1`)
  ),
  Effect.map(([owner]) => owner as unknown as Db.Owner)
);

const createOwner = (
  mnemonic?: Mnemonic.Mnemonic
): Effect.Effect<never, never, Db.Owner> =>
  pipe(
    Effect.allPar(
      mnemonic ? Effect.succeed(mnemonic) : Mnemonic.generate(),
      Effect.promise(() => import("@scure/bip39")),
      Effect.promise(() => import("@noble/hashes/hmac")),
      Effect.promise(() => import("@noble/hashes/sha512"))
    ),
    Effect.flatMap(
      ([mnemonic, { mnemonicToSeedSync }, { hmac }, { sha512 }]) => {
        // SLIP-21 implementation
        // https://github.com/satoshilabs/slips/blob/master/slip-0021.md
        const slip21Derive = (seed: Uint8Array, path: string[]): Uint8Array => {
          let m = hmac(sha512, "Symmetric key seed", seed);
          for (let i = 0; i < path.length; i++) {
            const p = new TextEncoder().encode(path[i]);
            const e = new Uint8Array(p.byteLength + 1);
            e[0] = 0;
            e.set(p, 1);
            m = hmac(sha512, m.slice(0, 32), e);
          }
          return m.slice(32, 64);
        };

        const seedToId = (seed: Uint8Array): Db.Owner["id"] => {
          const key = slip21Derive(seed, ["Evolu", "Owner Id"]);
          // convert key to nanoid
          let id = "";
          for (let i = 0; i < 21; i++) {
            id += urlAlphabet[key[i] & 63];
          }
          return id as Db.Owner["id"];
        };

        const seedToEncryptionKey = (seed: Uint8Array): Uint8Array =>
          slip21Derive(seed, ["Evolu", "Encryption Key"]);

        // always use empty passphrase
        const seed = mnemonicToSeedSync(mnemonic, "");

        const id = seedToId(seed);
        const encryptionKey = seedToEncryptionKey(seed);

        const owner: Db.Owner = { mnemonic, id, encryptionKey };
        return Effect.succeed(owner);
      }
    )
  );

const init = (
  mnemonic?: Mnemonic.Mnemonic
): Effect.Effect<Db.Db, never, Db.Owner> =>
  pipe(
    Effect.allPar(
      createOwner(mnemonic),
      Db.Db,
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

const migrateToSlip21: Effect.Effect<Db.Db, never, Db.Owner> = pipe(
  Db.Db,
  Effect.flatMap((db) =>
    Effect.gen(function* ($) {
      const { mnemonic } = (yield* $(
        db.exec(`select "mnemonic" from __owner limit 1`)
      ))[0] as { mnemonic: Mnemonic.Mnemonic };
      const owner = yield* $(createOwner(mnemonic));
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

export const lazyInit = (
  mnemonic?: Mnemonic.Mnemonic
): Effect.Effect<Db.Db, never, Db.Owner> =>
  pipe(
    get,
    Effect.catchAllCause((cause) => {
      const pretty = Cause.pretty(cause);
      if (pretty.includes("no such table: __owner")) return init(mnemonic);
      if (pretty.includes("no such column: encryptionKey"))
        return migrateToSlip21;
      return Effect.failCause(cause);
    }),
    Db.transaction
  );

export const reset = (
  mnemonic?: Mnemonic.Mnemonic
): Effect.Effect<Db.Db | DbWorker.OnMessage, never, void> =>
  Effect.gen(function* ($) {
    yield* $(Db.deleteAllTables);
    if (mnemonic) yield* $(lazyInit(mnemonic));
    const onMessage = yield* $(DbWorker.OnMessage);
    onMessage({ _tag: "onResetOrRestore" });
  });
