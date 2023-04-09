import { taskEither } from "fp-ts";
import { pipe } from "fp-ts/lib/function.js";
import { ReaderTaskEither } from "fp-ts/lib/ReaderTaskEither.js";
import { merkleTreeFromString, MerkleTreeString } from "./merkleTree.js";
import { timestampFromString, TimestampString } from "./timestamp.js";
import { CrdtClock, DbEnv, UnknownError } from "./types.js";

export const readClock: ReaderTaskEither<DbEnv, UnknownError, CrdtClock> = ({
  db,
}) =>
  pipe(
    db.exec(`select "timestamp", "merkleTree" from "__clock" limit 1`),
    taskEither.map(([{ timestamp, merkleTree }]) => ({
      timestamp: timestampFromString(timestamp as TimestampString),
      merkleTree: merkleTreeFromString(merkleTree as MerkleTreeString),
    }))
  );
