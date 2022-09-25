import { taskEither } from "fp-ts";
import { pipe } from "fp-ts/lib/function.js";
import { ReaderTaskEither } from "fp-ts/ReaderTaskEither";
import { createHash } from "sha256-uint8array";
import { createInitialMerkleTree } from "./merkleTree.js";
import { generateMnemonic } from "./generateMnemonic.js";
import { Mnemonic, OwnerId } from "./model.js";
import { createInitialTimestamp, timestampToString } from "./timestamp.js";
import {
  DbEnv,
  merkleTreeToString,
  Owner,
  OwnerEnv,
  UnknownError,
} from "./types.js";

/**
 * 12 words have entropy big enough for SHA256, and we are using only
 * 1/3 of it. It's impossible to restore mnemonic from ownerId.
 */
const mnemonicToOwnerId = (mnemonic: Mnemonic): OwnerId =>
  createHash().update(mnemonic).digest("hex").slice(0, 21) as OwnerId;

export const initDbModel =
  (
    mnemonic: Mnemonic = generateMnemonic()
  ): ReaderTaskEither<DbEnv, UnknownError, OwnerEnv> =>
  ({ db }) =>
    pipe(
      db.exec(`
        PRAGMA table_info (__message)
      `),
      taskEither.chain((rows) => {
        const isInitialized = rows.length > 0;
        if (isInitialized) return taskEither.right(undefined);

        const timestamp = timestampToString(createInitialTimestamp());
        const merkleTree = merkleTreeToString(createInitialMerkleTree());
        // if (mnemonic == null) mnemonic = generateMnemonic();
        const ownerId = mnemonicToOwnerId(mnemonic);

        return db.exec(`
          CREATE TABLE __message (
            "timestamp" BLOB PRIMARY KEY,
            "table" BLOB,
            "row" BLOB,
            "column" BLOB,
            "value" BLOB
          );

          CREATE INDEX index__message ON __message (
            "table",
            "row",
            "column",
            "timestamp"
          );

          CREATE TABLE __clock (
            "timestamp" BLOB,
            "merkleTree" BLOB
          );

          INSERT INTO __clock ("timestamp", "merkleTree")
          VALUES ('${timestamp}', '${merkleTree}');

          CREATE TABLE __owner (
            "id" BLOB,
            "mnemonic" BLOB
          );

          INSERT INTO __owner ("id", "mnemonic")
          VALUES ('${ownerId}', '${mnemonic}')
        `);
      }),
      taskEither.chain(() =>
        db.exec(`
          SELECT "id", "mnemonic" FROM __owner LIMIT 1
        `)
      ),
      taskEither.map(([[id, mnemonic]]) => ({ id, mnemonic } as Owner)),
      taskEither.map((owner) => ({ owner }))
    );
