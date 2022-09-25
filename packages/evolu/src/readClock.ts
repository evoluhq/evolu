import { taskEither } from "fp-ts";
import { pipe } from "fp-ts/lib/function.js";
import { ReaderTaskEither } from "fp-ts/ReaderTaskEither";
import { log } from "./log.js";
import { timestampFromString } from "./timestamp.js";
import {
  CrdtClock,
  DbEnv,
  merkleTreeFromString,
  MerkleTreeString,
  TimestampString,
  UnknownError,
} from "./types.js";

export const readClock: ReaderTaskEither<DbEnv, UnknownError, CrdtClock> = ({
  db,
}) =>
  pipe(
    db.exec(`
      SELECT "timestamp", "merkleTree" FROM "__clock" limit 1
    `),
    taskEither.map(([[timestamp, merkleTree]]) => ({
      timestamp: timestampFromString(timestamp as TimestampString),
      merkleTree: merkleTreeFromString(merkleTree as MerkleTreeString),
    })),
    taskEither.chainFirstIOK(log("clock:read"))
  );
