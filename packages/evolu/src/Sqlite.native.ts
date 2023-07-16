import { pipe } from "@effect/data/Function";
import * as Effect from "@effect/io/Effect";
import * as SQLite from "expo-sqlite";
import { Db } from "./Types.js";

export const createSqlite = (): Effect.Effect<never, never, Db> =>
  Effect.sync(() => {
    const sqlite = SQLite.openDatabase("evolu1");
    let rowsAffected = 0;

    const db: Db = {
      exec: (arg) =>
        pipe(
          Effect.promise(() =>
            sqlite.execAsync(
              typeof arg === "string"
                ? [{ sql: arg, args: [] }]
                : [{ sql: arg.sql, args: arg.parameters as unknown[] }],
              false
            )
          ),
          Effect.map((a) => a[0]),
          Effect.map((result) => {
            // https://github.com/expo/expo/pull/23109#issuecomment-1636684933
            if ("error" in result) throw result.error;
            rowsAffected = result.rowsAffected;
            return result.rows;
          })
        ),

      changes: () => Effect.succeed(rowsAffected),
    };

    return db;
  });
