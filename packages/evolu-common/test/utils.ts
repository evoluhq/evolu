import * as Schema from "@effect/schema/Schema";
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
    millis: Schema.parseSync(Millis)(initialMillis + millis),
    counter,
    node,
  }) as Timestamp;

export const makeNode2Timestamp = (millis = 0, counter = 0): Timestamp =>
  makeNode1Timestamp(millis, counter, "0000000000000002");

export const SqliteTest = Layer.effect(
  Sqlite,
  Effect.sync(() => {
    const db = new Database(":memory:");

    const exec: Sqlite["exec"] = (arg) =>
      Effect.sync(() => {
        const isSqlString = typeof arg === "string";
        const isSelect = (isSqlString ? arg : arg.sql)
          .toLowerCase()
          .includes("select");

        const prepared = db.prepare(isSqlString ? arg : arg.sql);
        const parameters = isSqlString ? [] : arg.parameters;

        const rows = isSelect ? (prepared.all(parameters) as SqliteRow[]) : [];
        const changes = isSelect ? 0 : prepared.run(parameters).changes;

        return { rows, changes };
      });

    return { exec };
  }),
);
export type Db = { users: { id: Id; name: string } };
