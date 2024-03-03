import { Effect } from "effect";
import { expect, test } from "vitest";
import { timestampToString, unsafeTimestampFromString } from "../src/Crdt.js";
import {
  Mutation,
  mutationsToNewMessages,
  upsertValueIntoTableRowColumn,
} from "../src/DbWorker.js";
import { Id } from "../src/Model.js";
import { OnCompleteId } from "../src/OnCompletes.js";
import { Sqlite } from "../src/Sqlite.js";
import { Message } from "../src/SyncWorker.js";
import { SqliteTest, makeNode1Timestamp } from "./utils.js";

test("mutationsToNewMessages should dedupe", () => {
  const mutation: Mutation = {
    table: "table",
    id: "id" as Id,
    values: { a: 1, b: true },
    isInsert: true,
    onCompleteId: "onCompleteId" as OnCompleteId,
  };
  const length = mutationsToNewMessages([mutation, mutation]).length;
  expect(length).toBe(3);
});

test("upsertValueIntoTableRowColumn should ensure schema", () => {
  const message: Message = {
    table: "a",
    row: "b" as Id,
    column: "c",
    value: "d",
    timestamp: timestampToString(makeNode1Timestamp()),
  };
  const { millis } = unsafeTimestampFromString(message.timestamp);

  const rows = upsertValueIntoTableRowColumn(
    message,
    [message, message],
    millis,
  ).pipe(
    Effect.zipRight(Sqlite),
    Effect.flatMap(({ exec }) => exec("select * from a")),
    Effect.provide(SqliteTest),
    Effect.runSync,
  );

  expect(rows).toMatchInlineSnapshot(`
    {
      "changes": 0,
      "rows": [
        {
          "c": "d",
          "id": "b",
        },
      ],
    }
  `);
});
