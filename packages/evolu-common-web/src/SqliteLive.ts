import {
  Sqlite,
  SqliteRow,
  canUseDom,
  ensureSqliteQuery,
  maybeParseJson,
} from "@evolu/common";
import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import { Effect, Layer } from "effect";

const sqlitePromise = sqlite3InitModule().then((sqlite3) =>
  canUseDom
    ? new sqlite3.oo1.JsStorageDb("local")
    : new sqlite3.oo1.OpfsDb("/evolu/evolu1.db", "c"),
);

const exec: Sqlite["exec"] = (arg) =>
  Effect.gen(function* (_) {
    const sqlite = yield* _(Effect.promise(() => sqlitePromise));
    const sqliteQuery = ensureSqliteQuery(arg);
    const rows = sqlite.exec(sqliteQuery.sql, {
      returnValue: "resultRows",
      rowMode: "object",
      bind: sqliteQuery.parameters,
    }) as SqliteRow[];
    maybeParseJson(rows);
    return { rows, changes: sqlite.changes() };
  });

export const SqliteLive = Layer.succeed(Sqlite, { exec });
