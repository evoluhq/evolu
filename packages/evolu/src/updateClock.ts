import { taskEither } from "fp-ts";
import { constVoid, pipe } from "fp-ts/lib/function.js";
import { ReaderTaskEither } from "fp-ts/ReaderTaskEither";
import { log } from "./log.js";
import { timestampToString } from "./timestamp.js";
import { CrdtClock, DbEnv, merkleTreeToString, UnknownError } from "./types.js";

export const updateClock =
  (clock: CrdtClock): ReaderTaskEither<DbEnv, UnknownError, void> =>
  ({ db }) =>
    pipe(
      db.execSqlQuery({
        sql: `
          UPDATE "__clock"
          SET
            "timestamp" = ?,
            "merkleTree" = ?
        `,
        parameters: [
          timestampToString(clock.timestamp),
          merkleTreeToString(clock.merkleTree),
        ],
      }),
      taskEither.chainIOK(() => log("clock:update")(clock)),
      taskEither.map(constVoid)
    );
