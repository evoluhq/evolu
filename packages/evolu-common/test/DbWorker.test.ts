import { Effect } from "effect";
import { expect, test } from "vitest";
import { timestampToString } from "../src/Crdt.js";
import {
  MutateItem,
  OnCompleteId,
  mutateItemsToNewMessages,
  upsertValueIntoTableRowColumn,
} from "../src/DbWorker.js";
import { Id, cast } from "../src/Model.js";
import { Sqlite } from "../src/Sqlite.js";
import { Message } from "../src/SyncWorker.js";
import { SqliteTest, makeNode1Timestamp } from "./utils.js";

test("mutateItemsToNewMessages should dedupe", () => {
  const item: MutateItem = {
    table: "table",
    id: "id" as Id,
    values: { a: 1, b: true },
    isInsert: true,
    now: cast(new Date()),
    onCompleteId: "onCompleteId" as OnCompleteId,
  };
  const length = mutateItemsToNewMessages([item, item]).length;
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

  const rows = upsertValueIntoTableRowColumn(message, [message, message]).pipe(
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
