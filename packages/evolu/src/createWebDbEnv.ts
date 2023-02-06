import { either, taskEither } from "fp-ts";
import { pipe } from "fp-ts/lib/function.js";
import { TaskEither } from "fp-ts/TaskEither";
import {
  Database,
  DbEnv,
  errorToUnknownError,
  SqliteRows,
  UnknownError,
} from "./types.js";
import sqlite3 from "../sqlite/sqlite3-bundler-friendly.mjs";

export const createWebDbEnv = (
  strategy: "localStorage" | "opfs"
): TaskEither<UnknownError, DbEnv> =>
  taskEither.tryCatch(
    () =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sqlite3().then((sqlite3: any): DbEnv => {
        const db =
          strategy === "opfs"
            ? new sqlite3.oo1.OpfsDb("/evolu/evolu1.db", "c")
            : new sqlite3.oo1.JsStorageDb("local");

        const exec: Database["exec"] = (sql) =>
          pipe(
            either.tryCatch(
              (): SqliteRows =>
                db.exec(sql, {
                  returnValue: "resultRows",
                  rowMode: "object",
                }),
              errorToUnknownError
            ),
            taskEither.fromEither
          );

        const execSqlQuery: Database["execSqlQuery"] = (sqlQuery) =>
          pipe(
            either.tryCatch(
              () =>
                db.exec(sqlQuery.sql, {
                  returnValue: "resultRows",
                  rowMode: "object",
                  bind: sqlQuery.parameters,
                }),
              errorToUnknownError
            ),
            taskEither.fromEither
          );

        const changes: Database["changes"] = () =>
          pipe(
            either.tryCatch(() => db.changes(), errorToUnknownError),
            taskEither.fromEither
          );

        return {
          db: {
            SQLite3Error: sqlite3.SQLite3Error,
            exec,
            execSqlQuery,
            changes,
          },
        };
      }),
    errorToUnknownError
  );
