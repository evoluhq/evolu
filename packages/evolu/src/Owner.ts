import { pipe } from "@effect/data/Function";
import * as Cause from "@effect/io/Cause";
import * as Effect from "@effect/io/Effect";
import { urlAlphabet } from "nanoid";
import { deleteAllTables } from "./Db.js";
import { createInitialMerkleTree, merkleTreeToString } from "./MerkleTree.js";
import { generateMnemonic } from "./Mnemonic.js";
import { InitialTimestamp, timestampToString } from "./Timestamp.js";
import { Db, DbWorkerOnMessage, Mnemonic, Owner } from "./Types.js";

const getOwner: Effect.Effect<Db, never, Owner> = pipe(
  Db,
  Effect.flatMap((db) =>
    db.exec(`select "mnemonic", "id", "encryptionKey" from __owner limit 1`)
  ),
  Effect.map(([owner]) => owner as unknown as Owner)
);

const createOwner = (mnemonic?: Mnemonic): Effect.Effect<never, never, Owner> =>
  pipe(
    Effect.all(
      [
        mnemonic ? Effect.succeed(mnemonic) : generateMnemonic(),
        Effect.promise(() => import("@scure/bip39")),
        Effect.promise(() => import("@noble/hashes/hmac")),
        Effect.promise(() => import("@noble/hashes/sha512")),
      ],
      { concurrency: "unbounded" }
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

        const seedToId = (seed: Uint8Array): Owner["id"] => {
          const key = slip21Derive(seed, ["Evolu", "Owner Id"]);
          // convert key to nanoid
          let id = "";
          for (let i = 0; i < 21; i++) {
            id += urlAlphabet[key[i] & 63];
          }
          return id as Owner["id"];
        };

        const seedToEncryptionKey = (seed: Uint8Array): Uint8Array =>
          slip21Derive(seed, ["Evolu", "Encryption Key"]);

        // always use empty passphrase
        const seed = mnemonicToSeedSync(mnemonic, "");

        const id = seedToId(seed);
        const encryptionKey = seedToEncryptionKey(seed);

        const owner: Owner = { mnemonic, id, encryptionKey };
        return Effect.succeed(owner);
      }
    )
  );

const init = (
  mnemonic?: Mnemonic
): Effect.Effect<Db | InitialTimestamp, never, Owner> =>
  pipe(
    Effect.all(
      [
        createOwner(mnemonic),
        Db,
        InitialTimestamp.pipe(
          Effect.flatMap((a) => a.create()),
          Effect.map(timestampToString)
        ),
        // initial merkle tree je konstanta, to nemusi bejt effect
        Effect.succeed(pipe(createInitialMerkleTree(), merkleTreeToString)),
      ],
      { concurrency: "unbounded" }
    ),
    Effect.tap(([owner, db, initialTimestamp, initialMerkleTree]) =>
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
          values ('${initialTimestamp}', '${initialMerkleTree}');

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

const migrateToSlip21: Effect.Effect<Db, never, Owner> = pipe(
  Db,
  Effect.flatMap((db) =>
    Effect.gen(function* ($) {
      const { mnemonic } = (yield* $(
        db.exec(`select "mnemonic" from __owner limit 1`)
      ))[0] as { mnemonic: Mnemonic };
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

export const lazyInitOwner = (
  mnemonic?: Mnemonic
): Effect.Effect<Db | InitialTimestamp, never, Owner> =>
  Effect.catchAllCause(getOwner, (cause) => {
    const pretty = Cause.pretty(cause);
    if (pretty.includes("no such table: __owner")) return init(mnemonic);
    if (pretty.includes("no such column: encryptionKey"))
      return migrateToSlip21;
    return Effect.failCause(cause);
  });

export const resetOwner = (
  mnemonic?: Mnemonic
): Effect.Effect<Db | DbWorkerOnMessage | InitialTimestamp, never, void> =>
  Effect.gen(function* ($) {
    yield* $(deleteAllTables);
    if (mnemonic) yield* $(lazyInitOwner(mnemonic));
    const onMessage = yield* $(DbWorkerOnMessage);
    onMessage({ _tag: "onResetOrRestore" });
  });
