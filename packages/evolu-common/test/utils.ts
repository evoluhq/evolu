import * as S from "@effect/schema/Schema";
import Database from "better-sqlite3";
import { Effect, Layer } from "effect";
import { Millis, Timestamp, initialMillis } from "../src/Crdt.js";
import { Id } from "../src/Model.js";
import { Sqlite, SqliteRow } from "../src/Sqlite.js";

export const makeNode1Timestamp = (
  millis = 0,
  counter = 0,
  node = "0000000000000001",
): Timestamp =>
  ({
    millis: S.decodeSync(Millis)(initialMillis + millis),
    counter,
    node,
  }) as Timestamp;

export const makeNode2Timestamp = (millis = 0, counter = 0): Timestamp =>
  makeNode1Timestamp(millis, counter, "0000000000000002");

export const SqliteTest = Layer.effect(
  Sqlite,
  Effect.sync(() => {
    const db = new Database(":memory:");

    return Sqlite.of({
      exec: (query) =>
        Effect.sync(() => {
          const isSelect = query.sql.toLowerCase().includes("select");

          const prepared = db.prepare(query.sql);
          const parameters = query.parameters || [];

          const rows = isSelect
            ? (prepared.all(parameters) as SqliteRow[])
            : [];
          const changes = isSelect ? 0 : prepared.run(parameters).changes;

          return { rows, changes };
        }),
    });
  }),
);

export type Db = {
  users: {
    id: Id;
    name: string;
  };
};
