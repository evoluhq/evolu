import { option, readonlyArray, taskEither } from "fp-ts";
import { flow, pipe } from "fp-ts/lib/function.js";
import { ReaderTaskEither } from "fp-ts/ReaderTaskEither";
import { ReadonlyNonEmptyArray } from "fp-ts/ReadonlyNonEmptyArray";
import { insertIntoMerkleTree } from "./merkleTree.js";
import { timestampFromString } from "./timestamp.js";
import {
  CrdtMessage,
  DbEnv,
  MerkleTree,
  TimestampString,
  UnknownError,
} from "./types.js";

export const applyMessages =
  (merkleTree: MerkleTree) =>
  (
    messages: ReadonlyNonEmptyArray<CrdtMessage>
  ): ReaderTaskEither<DbEnv, UnknownError, MerkleTree> =>
  ({ db }) =>
    pipe(
      messages,
      taskEither.traverseSeqArray((message) =>
        pipe(
          db.execSqlQuery({
            sql: `
              select "timestamp" FROM "__message"
              where "table" = ? AND
                    "row" = ? AND
                    "column" = ?
              order by "timestamp" desc limit 1
            `,
            parameters: [message.table, message.row, message.column],
          }),
          taskEither.map(
            flow(
              readonlyArray.head,
              option.map((row) => row.timestamp as TimestampString),
              option.toNullable
            )
          ),
          taskEither.chainFirst((timestamp) =>
            timestamp == null || timestamp < message.timestamp
              ? db.execSqlQuery({
                  sql: `
                    insert into "${message.table}" ("id", "${message.column}")
                    values (?, ?)
                    on conflict do update set "${message.column}" = ?
                  `,
                  parameters: [message.row, message.value, message.value],
                })
              : taskEither.right(undefined)
          ),
          taskEither.chainFirst((timestamp) =>
            timestamp == null || timestamp !== message.timestamp
              ? pipe(
                  db.execSqlQuery({
                    sql: `
                      insert into "__message" (
                        "timestamp", "table", "row", "column", "value"
                      ) values (?, ?, ?, ?, ?) on conflict do nothing
                    `,
                    parameters: [
                      message.timestamp,
                      message.table,
                      message.row,
                      message.column,
                      message.value,
                    ],
                  }),
                  taskEither.chain(db.changes),
                  taskEither.map((changes) => {
                    if (changes > 0)
                      merkleTree = insertIntoMerkleTree(
                        timestampFromString(message.timestamp)
                      )(merkleTree);
                  })
                )
              : taskEither.right(undefined)
          )
        )
      ),
      taskEither.map(() => merkleTree)
    );
