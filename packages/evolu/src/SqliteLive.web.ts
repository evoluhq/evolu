import { Effect, Function, Layer } from "effect";
import {
  Sqlite,
  SqliteRow,
  parseJsonResults,
  valuesToSqliteValues,
} from "./Sqlite.js";
// @ts-expect-error Missing types
import sqlite3InitModule from "@sqlite.org/sqlite-wasm";

if (typeof document !== "undefined")
  // @ts-expect-error Missing types.
  self.sqlite3ApiConfig = {
    debug: Function.constVoid,
    log: Function.constVoid,
    warn: Function.constVoid,
    error: Function.constVoid,
  };

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call
const sqlitePromise = (sqlite3InitModule() as Promise<any>).then((sqlite3) => {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return (
    typeof document === "undefined"
      ? // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        new sqlite3.oo1.OpfsDb("/evolu/evolu1.db", "c")
      : // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        new sqlite3.oo1.JsStorageDb("local")
  ) as {
    // Waiting for https://github.com/tomayac/sqlite-wasm/pull/2
    readonly exec: (arg1: unknown, arg2: unknown) => SqliteRow[];
    readonly changes: () => number;
  };
});

const exec: Sqlite["exec"] = (arg) =>
  Effect.gen(function* (_) {
    const sqlite = yield* _(Effect.promise(() => sqlitePromise));
    const isSqlString = typeof arg === "string";
    const rows = sqlite.exec(isSqlString ? arg : arg.sql, {
      returnValue: "resultRows",
      rowMode: "object",
      ...(!isSqlString && { bind: valuesToSqliteValues(arg.parameters) }),
    });
    parseJsonResults(rows);
    return { rows, changes: sqlite.changes() };
  });

export const SqliteLive = Layer.succeed(Sqlite, { exec });
