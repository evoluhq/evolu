import { array, either, ioRef, record, taskEither } from "fp-ts";
import { pipe } from "fp-ts/lib/function.js";
import { TaskEither } from "fp-ts/TaskEither";
import * as SQLite from "wa-sqlite";
import SQLiteAsyncESMFactory from "wa-sqlite/dist/wa-sqlite-async.mjs";
// @ts-expect-error Missing types.
import { IDBBatchAtomicVFS } from "wa-sqlite/src/examples/IDBBatchAtomicVFS.js";
import {
  CrdtValue,
  Database,
  DbEnv,
  DbTransactionEnv,
  errorToUnknownError,
  PreparedStatement,
  SQLiteCompatibleType,
  SQLiteRow,
  SQLiteRowRecord,
  UnknownError,
} from "./types.js";

export const initDb: TaskEither<UnknownError, DbEnv & DbTransactionEnv> =
  taskEither.tryCatch(async () => {
    const asyncModule = await SQLiteAsyncESMFactory();
    const sqlite3 = SQLite.Factory(asyncModule);
    sqlite3.vfs_register(
      new IDBBatchAtomicVFS("evolu", { durability: "relaxed" })
    );
    const connection = await sqlite3.open_v2("app", undefined, "evolu");

    const exec: Database["exec"] = (sql) =>
      taskEither.tryCatch(async () => {
        // console.log(sql);
        const rowsRef = new ioRef.IORef<readonly SQLiteRow[]>([]);
        await sqlite3.exec(connection, sql, (row) => {
          rowsRef.modify((a) => [...a, row])();
        });
        // console.log("v");

        return rowsRef.read();
      }, errorToUnknownError);

    const changes: Database["changes"] = () => sqlite3.changes(connection);

    // setTimeout(() => {
    //   exec("select * from __clock")().then((a) => {
    //     console.log(a);
    //   });
    // }, 3000);

    // eslint-disable-next-line functional/no-let
    let ensureSequentialExecutionPromise = Promise.resolve();

    const ensureTransactionsSequentialExecution: <E, A>(
      te: TaskEither<E, A>
    ) => TaskEither<E, A> = (te) => () =>
      (ensureSequentialExecutionPromise = ensureSequentialExecutionPromise.then(
        () => te()
      ) as never);

    // "A good example is when you are processing a database transaction."
    // https://rlee.dev/practical-guide-to-fp-ts-part-3
    const dbTransaction: DbTransactionEnv["dbTransaction"] = (te) =>
      pipe(
        exec("BEGIN"),
        taskEither.chainW(() => te),
        taskEither.chainFirstW(() => exec("COMMIT")),
        taskEither.orElseW((originalError) =>
          pipe(
            exec("ROLLBACK"),
            taskEither.matchE(taskEither.left, () =>
              taskEither.left(originalError)
            )
          )
        ),
        ensureTransactionsSequentialExecution
      );

    const readRows = async (
      stmt: number,
      rowsRef: ioRef.IORef<readonly SQLiteRowRecord[]>
    ): Promise<void> => {
      const columns = sqlite3.column_names(stmt);
      // eslint-disable-next-line functional/no-loop-statement
      while ((await sqlite3.step(stmt)) === SQLite.SQLITE_ROW)
        pipe(columns, array.zip(sqlite3.row(stmt)), record.fromEntries, (r) =>
          rowsRef.modify((a) => [...a, r])
        )();
    };

    const execSqlQuery: Database["execSqlQuery"] = (sqlQuery) =>
      taskEither.tryCatch(async () => {
        // console.log(sqlQuery);

        const rowsRef = new ioRef.IORef<readonly SQLiteRowRecord[]>([]);

        // eslint-disable-next-line functional/no-loop-statement
        for await (const stmt of sqlite3.statements(connection, sqlQuery.sql)) {
          sqlite3.bind_collection(
            stmt,
            // eslint-disable-next-line functional/prefer-readonly-type
            sqlQuery.parameters as SQLiteCompatibleType[]
          );
          await readRows(stmt, rowsRef);
          // sqlQuery has only one statement that is going to be finalized anyway.
          // sqlite3.reset(stmt);
        }

        return rowsRef.read();
      }, errorToUnknownError);

    const prepare: Database["prepare"] = (sql) => {
      const str = sqlite3.str_new(connection, sql);
      return pipe(
        taskEither.tryCatch(
          () => sqlite3.prepare_v2(connection, sqlite3.str_value(str)),
          errorToUnknownError
        ),
        taskEither.chain(
          taskEither.fromNullable(errorToUnknownError("prepared is null"))
        ),
        taskEither.map(
          ({ stmt }): PreparedStatement => ({
            exec: (bindings) =>
              taskEither.tryCatch(async () => {
                const rowsRef = new ioRef.IORef<readonly SQLiteRowRecord[]>([]);
                // eslint-disable-next-line functional/prefer-readonly-type
                sqlite3.bind_collection(stmt, bindings as CrdtValue[]);
                await readRows(stmt, rowsRef);
                sqlite3.reset(stmt);
                return rowsRef.read();
              }, errorToUnknownError),
            release: () =>
              pipe(
                either.tryCatch(() => {
                  sqlite3.finalize(stmt);
                  sqlite3.str_finish(str);
                }, errorToUnknownError),
                taskEither.fromEither
              ),
          })
        )
      );
    };

    return {
      db: {
        exec,
        changes,
        execSqlQuery,
        prepare,
      },
      dbTransaction,
    };
  }, errorToUnknownError);
