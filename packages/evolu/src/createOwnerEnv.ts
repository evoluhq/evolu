import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex as toHex } from "@noble/hashes/utils";
import { readerTaskEither, taskEither } from "fp-ts";
import { pipe } from "fp-ts/lib/function.js";
import { ReaderTaskEither } from "fp-ts/ReaderTaskEither";
import { createInitialMerkleTree } from "./merkleTree.js";
import { Mnemonic, Owner, OwnerId } from "./model.js";
import { createInitialTimestamp, timestampToString } from "./timestamp.js";
import { DbEnv, merkleTreeToString, OwnerEnv, UnknownError } from "./types.js";

const selectOwner: ReaderTaskEither<DbEnv, UnknownError, OwnerEnv> = ({ db }) =>
  pipe(
    db.exec(`select "id", "mnemonic" from __owner limit 1`),
    taskEither.map(([{ id, mnemonic }]) => ({ id, mnemonic } as Owner)),
    taskEither.map((owner) => ({ owner }))
  );

/**
 * 12 words have entropy big enough for SHA256, and we are using only
 * 1/3 of it. It's impossible to restore mnemonic from ownerId.
 */
const mnemonicToOwnerId = (mnemonic: Mnemonic): OwnerId =>
  toHex(sha256(mnemonic)).slice(0, 21) as OwnerId;

const lazyInit =
  (mnemonic?: Mnemonic): ReaderTaskEither<DbEnv, UnknownError, OwnerEnv> =>
  ({ db }) =>
    pipe(
      taskEither.fromTask(() => import("./mnemonic")),
      taskEither.map(
        ({ generateMnemonic }): OwnerEnv =>
          pipe(mnemonic || generateMnemonic(), (mnemonic) => ({
            owner: { id: mnemonicToOwnerId(mnemonic), mnemonic },
          }))
      ),
      taskEither.chainFirst(({ owner }) =>
        db.exec(`
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
          values ('${pipe(
            createInitialTimestamp(),
            timestampToString
          )}', '${pipe(createInitialMerkleTree(), merkleTreeToString)}');

          create table __owner (
            "id" blob,
            "mnemonic" blob
          );

          insert into __owner ("id", "mnemonic")
          values ('${owner.id}', '${owner.mnemonic}')
`)
      )
    );

export const createOwnerEnv = (
  mnemonic?: Mnemonic
): ReaderTaskEither<DbEnv, UnknownError, OwnerEnv> =>
  pipe(
    selectOwner,
    readerTaskEither.alt(() => lazyInit(mnemonic))
  );
