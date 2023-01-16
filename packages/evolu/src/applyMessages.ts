import {
  apply,
  ioRef,
  option,
  readonlyArray,
  readonlyRecord,
  taskEither,
} from "fp-ts";
import { constNull, constVoid, flow, pipe } from "fp-ts/lib/function.js";
import { ReaderTaskEither } from "fp-ts/ReaderTaskEither";
import { ReadonlyNonEmptyArray } from "fp-ts/ReadonlyNonEmptyArray";
import { ReadonlyRecord } from "fp-ts/ReadonlyRecord";
import { TaskEither } from "fp-ts/TaskEither";
import { log } from "./log.js";
import { insertIntoMerkleTree } from "./merkleTree.js";
import { timestampFromString } from "./timestamp.js";
import {
  CrdtMessage,
  CrdtValue,
  DbEnv,
  MerkleTree,
  PreparedStatement,
  TimestampString,
  UnknownError,
} from "./types.js";

export const applyMessages =
  (merkleTree: MerkleTree) =>
  (
    messages: ReadonlyNonEmptyArray<CrdtMessage>
  ): ReaderTaskEither<DbEnv, UnknownError, MerkleTree> =>
  ({ db }) =>
    taskEither.bracket(
      apply.sequenceT(taskEither.ApplySeq)(
        db.prepare(`
          SELECT "timestamp" FROM "__message"
          WHERE "table" = ? AND
                "row" = ? AND
                "column" = ?
          ORDER BY "timestamp" DESC LIMIT 1
        `),
        db.prepare(`
          INSERT INTO "__message" (
            "timestamp", "table", "row", "column", "value"
          ) VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING
        `),
        pipe(
          new ioRef.IORef<
            ReadonlyRecord<string, TaskEither<UnknownError, PreparedStatement>>
          >({}),
          (cache) =>
            taskEither.right({
              exec: (sql: string, bindings: readonly CrdtValue[]) =>
                pipe(
                  cache.read(),
                  readonlyRecord.lookup(sql),
                  option.getOrElse(() => {
                    const p = db.prepare(sql);
                    cache.modify(readonlyRecord.upsertAt(sql, p))();
                    return p;
                  }),
                  taskEither.chain((prepared) => prepared.exec(bindings))
                ),
              release: () =>
                pipe(
                  Object.values(cache.read()),
                  taskEither.sequenceSeqArray,
                  taskEither.chain(
                    taskEither.traverseSeqArray((p) => p.release())
                  ),
                  taskEither.map(constVoid)
                ),
            })
        )
      ),
      ([selectMostRecentTimestamp, insertMessage, updateTable]) =>
        pipe(
          messages,
          taskEither.traverseSeqArray((message) =>
            pipe(
              selectMostRecentTimestamp.exec([
                message.table,
                message.row,
                message.column,
              ]),
              taskEither.map((a) =>
                pipe(
                  readonlyArray.head(a.rows),
                  option.map((r) => r.timestamp as TimestampString),
                  option.getOrElseW(constNull)
                )
              ),
              taskEither.chainFirst((t) =>
                t == null || t < message.timestamp
                  ? updateTable.exec(
                      `
                      INSERT INTO "${message.table}" ("id", "${message.column}")
                      VALUES (?, ?)
                      ON CONFLICT DO UPDATE SET "${message.column}" = ?
                      `,
                      [message.row, message.value, message.value]
                    )
                  : taskEither.right(undefined)
              ),
              taskEither.chainFirst((t) =>
                t == null || t !== message.timestamp
                  ? pipe(
                      insertMessage.exec([
                        message.timestamp,
                        message.table,
                        message.row,
                        message.column,
                        message.value,
                      ]),
                      taskEither.map((a) => {
                        if (a.changes > 0)
                          // eslint-disable-next-line no-param-reassign
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
        ),
      flow(
        taskEither.traverseArray((a) => a.release()),
        taskEither.chainIOK(() => log("applyMessages")(null)),
        taskEither.map(constVoid)
      )
    );
