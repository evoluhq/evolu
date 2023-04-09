import { either, taskEither } from "fp-ts";
import { constVoid, pipe } from "fp-ts/lib/function.js";
import { TaskEither } from "fp-ts/lib/TaskEither.js";
import sqlite3 from "../../sqlite/sqlite3-bundler-friendly.mjs";
import {
  Database,
  DbEnv,
  errorToUnknownError,
  Rows,
  UnknownError,
} from "./types.js";

// @ts-expect-error Missing types.
self.sqlite3ApiConfig = {
  debug: constVoid,
  log: constVoid,
  warn: constVoid,
  error: constVoid,
};

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
              (): Rows =>
                db.exec(sql, {
                  returnValue: "resultRows",
                  rowMode: "object",
                }),
              errorToUnknownError
            ),
            taskEither.fromEither
          );

        const execQuery: Database["execQuery"] = (query) =>
          pipe(
            either.tryCatch(
              () =>
                db.exec(query.sql, {
                  returnValue: "resultRows",
                  rowMode: "object",
                  bind: query.parameters,
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
            execQuery,
            changes,
          },
        };
      }),
    errorToUnknownError
  );
