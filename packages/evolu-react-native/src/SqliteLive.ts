import {
  Config,
  Sqlite,
  SqliteRow,
  ensureSqliteQuery,
  maybeParseJson,
  valuesToSqliteValues,
} from "@evolu/common";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as ExpoSQLite from "expo-sqlite/next.js";

export const SqliteLive = Layer.effect(
  Sqlite,
  Effect.gen(function* (_) {
    const config = yield* _(Config);
    const db = ExpoSQLite.openDatabaseSync(`evolu1-${config.name}.db`);

    return Sqlite.of({
      exec: (arg) =>
        Effect.gen(function* (_) {
          const sqliteQuery = ensureSqliteQuery(arg);
          const query = {
            sql: sqliteQuery.sql,
            args: valuesToSqliteValues(sqliteQuery.parameters),
          };

          const isSelectOrPragma =
            query.sql.trimStart().toLowerCase().startsWith("select") ||
            query.sql.trimStart().toLowerCase().startsWith("pragma");
          // Expo can log only strings.
          // console.log(JSON.stringify(isSelect), sql);

          if (isSelectOrPragma) {
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
