import { constVoid } from "@effect/data/Function";
import * as Effect from "@effect/io/Effect";
import sqlite3 from "../sqlite/sqlite3-bundler-friendly.mjs";
import * as Db from "./Db.js";

// @ts-expect-error Missing types.
self.sqlite3ApiConfig = {
  debug: constVoid,
  log: constVoid,
  warn: constVoid,
  error: constVoid,
};

const promise = sqlite3();

export const create = (
  strategy: "localStorage" | "opfs"
): Effect.Effect<never, never, Db.Db> =>
  Effect.promise(() =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    promise.then((sqlite3: any) => {
      const sqlite =
        strategy === "opfs"
          ? new sqlite3.oo1.OpfsDb("/evolu/evolu1.db", "c")
          : new sqlite3.oo1.JsStorageDb("local");

      const db: Db.Db = {
        exec: (arg) => {
          const isSqlString = typeof arg === "string";

          return sqlite.exec(isSqlString ? arg : arg.sql, {
            returnValue: "resultRows",
            rowMode: "object",
            ...(!isSqlString && { bind: arg.parameters }),
          });
        },

        changes: () => Effect.sync(() => sqlite.changes()),
      };

      return db;
    })
  );
