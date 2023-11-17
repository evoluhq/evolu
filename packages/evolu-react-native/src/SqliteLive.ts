import {
  Sqlite,
  ensureSqliteQuery,
  maybeParseJson,
  valuesToSqliteValues,
} from "@evolu/common";
import { Effect, Layer } from "effect";
import * as SQLite from "expo-sqlite";

const db = SQLite.openDatabase("evolu1.db");

const exec: Sqlite["exec"] = (arg) =>
  Effect.gen(function* (_) {
    const sqliteQuery = ensureSqliteQuery(arg);
    const { rows, rowsAffected } = yield* _(
      Effect.promise(() =>
        db
          .execAsync(
            [
              {
                sql: sqliteQuery.sql,
                args: valuesToSqliteValues(sqliteQuery.parameters),
              },
            ],
            false,
          )
          .then((a) => a[0])
          .then((result) => {
            if ("error" in result) throw result.error;
            return result;
          }),
      ),
    );
    maybeParseJson(rows);
    return { rows, changes: rowsAffected };
  });

export const SqliteLive = Layer.succeed(Sqlite, { exec });
