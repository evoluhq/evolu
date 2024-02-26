import {
  Sqlite,
  SqliteRow,
  ensureSqliteQuery,
  maybeParseJson,
  valuesToSqliteValues,
} from "@evolu/common";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SQLite from "expo-sqlite/next.js";

const db = SQLite.openDatabaseSync("evolu1.db");

const exec: Sqlite["exec"] = (arg) =>
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
  });

export const SqliteLive = Layer.succeed(Sqlite, { exec });
