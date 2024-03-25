import {
  ConfigTag,
  Sqlite,
  SqliteRow,
  isSqlMutation,
  maybeLogSql,
  maybeLogSqliteQueryExecutionTime,
  maybeParseJson,
  valuesToSqliteValues,
} from "@evolu/common";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as ExpoSQLite from "expo-sqlite/next";

export const SqliteLive = Layer.effect(
  Sqlite,
  Effect.gen(function* (_) {
    const config = yield* _(ConfigTag);
    const db = ExpoSQLite.openDatabaseSync(`evolu1-${config.name}.db`);

    return Sqlite.of({
      exec: (query) =>
        Effect.gen(function* (_) {
          const parameters = valuesToSqliteValues(query.parameters || []);

          if (!isSqlMutation(query.sql)) {
            const rows = (yield* _(
              Effect.promise(() => db.getAllAsync(query.sql, parameters)),
              maybeLogSql(query, config.logSql),
              maybeLogSqliteQueryExecutionTime(query),
            )) as SqliteRow[];
            maybeParseJson(rows);
            return { rows, changes: 0 };
          }
          const { changes } = yield* _(
            Effect.promise(() => db.runAsync(query.sql, parameters)),
          );
          return { rows: [], changes };
        }),
    });
  }),
);
