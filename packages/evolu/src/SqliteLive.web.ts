import { Effect, Layer } from "effect";
import { Sqlite, Row } from "./Sqlite.js";

// @ts-expect-error Missing types
import sqlite3InitModule from "@sqlite.org/sqlite-wasm";

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call
const sqlite = (sqlite3InitModule() as Promise<any>).then((sqlite3) => {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return (
    typeof window === "undefined"
      ? // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        new sqlite3.oo1.OpfsDb("/evolu/evolu1.db", "c")
      : // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        new sqlite3.oo1.JsStorageDb("local")
  ) as {
    // Waiting for https://github.com/tomayac/sqlite-wasm/pull/2
    readonly exec: (arg1: unknown, arg2: unknown) => ReadonlyArray<Row>;
    readonly changes: () => number;
  };
});

const exec: Sqlite["exec"] = (arg) =>
  Effect.promise(() => sqlite).pipe(
    Effect.map((sqlite) => {
      const isSqlString = typeof arg === "string";
      return sqlite.exec(isSqlString ? arg : arg.sql, {
        returnValue: "resultRows",
        rowMode: "object",
        ...(!isSqlString && { bind: arg.parameters }),
      });
    })
  );

const changes: Sqlite["changes"] = Effect.promise(() => sqlite).pipe(
  Effect.map((sqlite) => sqlite.changes())
);

export const SqliteLive = Layer.succeed(Sqlite, { exec, changes });