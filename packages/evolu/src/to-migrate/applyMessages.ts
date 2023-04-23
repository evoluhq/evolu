import { option, readonlyArray, taskEither } from "fp-ts";
import { flow, pipe } from "fp-ts/lib/function.js";
import { ReaderTaskEither } from "fp-ts/lib/ReaderTaskEither.js";
import { ReadonlyNonEmptyArray } from "fp-ts/lib/ReadonlyNonEmptyArray.js";
import { insertIntoMerkleTree, MerkleTree } from "./merkleTree.js";
import { unsafeTimestampFromString, TimestampString } from "./timestamp.js";
import { CrdtMessage, DbEnv, UnknownError } from "./types.js";

export const applyMessages =
  ({
    merkleTree,
    messages,
  }: {
    merkleTree: MerkleTree;
    messages: ReadonlyNonEmptyArray<CrdtMessage>;
  }): ReaderTaskEither<DbEnv, UnknownError, MerkleTree> =>
  ({ db }) =>
    pipe(
      messages,
      taskEither.traverseSeqArray((message) =>
        pipe(
          db.execQuery({
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
              ? db.execQuery({
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
                  db.execQuery({
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
                        unsafeTimestampFromString(message.timestamp)
                      )(merkleTree);
                  })
                )
              : taskEither.right(undefined)
          )
        )
      ),
      taskEither.map(() => merkleTree)
    );
