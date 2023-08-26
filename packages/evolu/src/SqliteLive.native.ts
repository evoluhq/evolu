import { Effect, Layer } from "effect";
import * as SQLite from "expo-sqlite";
import { Sqlite } from "./Sqlite.js";

const db = SQLite.openDatabase("evolu1.db");

const exec: Sqlite["exec"] = (arg) =>
  Effect.gen(function* (_) {
    const isSqlString = typeof arg === "string";
    const query: SQLite.Query = {
      sql: isSqlString ? arg : arg.sql,
      args: isSqlString ? [] : [...arg.parameters],
    };
    // console.log(JSON.stringify(query));
    const resultSet = yield* _(
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
    // console.log(JSON.stringify(resultSet));
    return {
      rows: resultSet.rows,
      changes: resultSet.rowsAffected,
    };
  });

export const SqliteLive = Layer.succeed(Sqlite, { exec });
