import {
  Config,
  Sqlite,
  SqliteRow,
  isSqlMutation,
  maybeParseJson,
  valuesToSqliteValues,
} from "@evolu/common";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as ExpoSQLite from "expo-sqlite/next";

export const SqliteLive = Layer.effect(
  Sqlite,
  Effect.gen(function* (_) {
    const config = yield* _(Config);
    const db = ExpoSQLite.openDatabaseSync(`evolu1-${config.name}.db`);

    return Sqlite.of({
      exec: ({ sql, parameters }) =>
        Effect.gen(function* (_) {
          const query = {
            sql,
            args: valuesToSqliteValues(parameters || []),
          };

          if (!isSqlMutation(query.sql)) {
            const rows = (yield* _(
              Effect.promise(() => db.getAllAsync(query.sql, query.args)),
            )) as SqliteRow[];
            maybeParseJson(rows);
            return { rows, changes: 0 };
          }
          const { changes } = yield* _(
            Effect.promise(() => db.runAsync(query.sql, query.args)),
          );
          return { rows: [], changes };
        }),
    });
  }),
);
