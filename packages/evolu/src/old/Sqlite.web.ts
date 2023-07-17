import { constVoid } from "@effect/data/Function";
import * as Effect from "@effect/io/Effect";
// @ts-expect-error Missing types
import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import { Db } from "./Types.js";

// @ts-expect-error Missing types.
self.sqlite3ApiConfig = {
  debug: constVoid,
  log: constVoid,
  warn: constVoid,
  error: constVoid,
};

const promise = sqlite3InitModule();

export const createSqlite = (
  strategy: "localStorage" | "opfs"
): Effect.Effect<never, never, Db> =>
  Effect.promise(() =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    promise.then((sqlite3: any) => {
      const sqlite =
        strategy === "opfs"
          ? new sqlite3.oo1.OpfsDb("/evolu/evolu1.db", "c")
          : new sqlite3.oo1.JsStorageDb("local");

      const db: Db = {
        exec: (arg) => {
          const isSqlString = typeof arg === "string";

          return Effect.succeed(
            sqlite.exec(isSqlString ? arg : arg.sql, {
              returnValue: "resultRows",
              rowMode: "object",
              ...(!isSqlString && { bind: arg.parameters }),
            })
          );
        },

        changes: () => Effect.succeed(sqlite.changes()),
      };

      return db;
    })
  );
