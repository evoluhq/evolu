import { Effect, Layer } from "effect";
import * as SQLite from "expo-sqlite";
import { ParseJSONResultsPlugin } from "kysely";
import {
  Sqlite,
  SqliteValue,
  parseJSONResults,
  valuesToSqliteValues,
} from "./Sqlite.js";

const db = SQLite.openDatabase("evolu1.db");

const parseJSONResultsPlugin = new ParseJSONResultsPlugin();

const exec: Sqlite["exec"] = (arg) =>
  Effect.gen(function* (_) {
    const isSqlString = typeof arg === "string";
    const query: SQLite.Query = {
      sql: isSqlString ? arg : arg.sql,
      args: isSqlString
        ? []
        : (valuesToSqliteValues(arg.parameters) as SqliteValue[]),
    };
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
    return {
      rows: yield* _(parseJSONResults(parseJSONResultsPlugin, resultSet.rows)),
      changes: resultSet.rowsAffected,
    };
  });

export const SqliteLive = Layer.succeed(Sqlite, { exec });
