import { Effect, Layer } from "effect";
import * as SQLite from "expo-sqlite";
import { Sqlite, parseJsonResults, valuesToSqliteValues } from "./Sqlite.js";

const db = SQLite.openDatabase("evolu1.db");

const exec: Sqlite["exec"] = (arg) =>
  Effect.gen(function* (_) {
    const isSqlString = typeof arg === "string";
    const query: SQLite.Query = {
      sql: isSqlString ? arg : arg.sql,
      args: isSqlString ? [] : valuesToSqliteValues(arg.parameters),
    };
    const { rows, rowsAffected } = yield* _(
      Effect.promise(() =>
        db
          .execAsync([query], false)
          .then((a) => a[0])
          .then((result) => {
            if ("error" in result) throw result.error;
            return result;
          }),
      ),
    );
    parseJsonResults(rows);
    return { rows, changes: rowsAffected };
  });

export const SqliteLive = Layer.succeed(Sqlite, { exec });
