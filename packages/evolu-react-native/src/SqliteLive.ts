import {
  Config,
  Sqlite,
  SqliteRow,
  isSqlMutation,
  maybeLogSqliteQueryExecutionTime,
  valuesToSqliteValues,
} from "@evolu/common";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as ExpoSQLite from "expo-sqlite/next";

export const SqliteLive = Layer.effect(
  Sqlite,
  Effect.gen(function* () {
    const config = yield* Config;
    const db = ExpoSQLite.openDatabaseSync(`evolu1-${config.name}.db`);

    return Sqlite.of({
      exec: (query) =>
        Effect.gen(function* () {
          const parameters = valuesToSqliteValues(query.parameters || []);

          if (!isSqlMutation(query.sql)) {
            const rows = (yield* Effect.promise(() =>
              db.getAllAsync(query.sql, parameters),
            ).pipe(maybeLogSqliteQueryExecutionTime(query))) as SqliteRow[];
            return { rows, changes: 0 };
          }
          const { changes } = yield* Effect.promise(() =>
            db.runAsync(query.sql, parameters),
          );
          return { rows: [], changes };
        }),
      // TODO: Exclusive via Promise/Deferred.
      transaction: () => (effect) => effect,
    });
  }),
);
