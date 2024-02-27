import {
  Sqlite,
  SqliteRow,
  ensureSqliteQuery,
  maybeParseJson,
  valuesToSqliteValues,
} from "@evolu/common";
import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

const sqlitePromise = sqlite3InitModule().then((sqlite3) =>
  sqlite3
    .installOpfsSAHPoolVfs({
      // TODO: Use name to allow Evolu apps co-exist in the same HTTP origin.
    })
    .then((PoolUtil) => new PoolUtil.OpfsSAHPoolDb("/evolu1")),
);

const exec: Sqlite["exec"] = (arg) =>
  Effect.gen(function* (_) {
    const sqlite = yield* _(Effect.promise(() => sqlitePromise));
    const sqliteQuery = ensureSqliteQuery(arg);
    const rows = sqlite.exec(sqliteQuery.sql, {
      returnValue: "resultRows",
      rowMode: "object",
      bind: valuesToSqliteValues(sqliteQuery.parameters),
    }) as SqliteRow[];
    maybeParseJson(rows);
    return { rows, changes: sqlite.changes() };
  });

export const SqliteLive = Layer.succeed(Sqlite, { exec });
