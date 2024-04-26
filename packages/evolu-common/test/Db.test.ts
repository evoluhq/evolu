import { Effect } from "effect";
import { expect, test } from "vitest";
import { timestampToString, unsafeTimestampFromString } from "../src/Crdt.js";
import {
  deserializeQuery,
  serializeQuery,
  upsertValueIntoTableRowColumn,
} from "../src/Db.js";
import { Id } from "../src/Model.js";
import { Sqlite, SqliteQuery, isJsonObjectOrArray } from "../src/Sqlite.js";
import { Message } from "../src/Sync.js";
import { SqliteTest, makeNode1Timestamp } from "./utils.js";

test("isJsonObjectOrArray", () => {
  expect(isJsonObjectOrArray(null)).toBe(false);
  expect(isJsonObjectOrArray("foo")).toBe(false);
  expect(isJsonObjectOrArray("")).toBe(false);
  expect(isJsonObjectOrArray(0)).toBe(false);
  expect(isJsonObjectOrArray(1)).toBe(false);
  expect(isJsonObjectOrArray(new Uint8Array())).toBe(false);
  expect(isJsonObjectOrArray({})).toBe(true);
  expect(isJsonObjectOrArray([])).toBe(true);
});

test("serializeQuery and deserializeQuery", () => {
  const binaryData = new Uint8Array([1, 3, 2]);
  const sqliteQuery: SqliteQuery = {
    sql: "a",
    parameters: [null, "a", 1, binaryData, ["b"], { c: 1 }],
  };
  expect(deserializeQuery(serializeQuery(sqliteQuery))).toStrictEqual(
    sqliteQuery,
  );
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
    Effect.flatMap(({ exec }) => exec({ sql: "select * from a" })),
    Effect.provide(SqliteTest),
    Effect.runSync,
  );

  expect(rows).toMatchInlineSnapshot(`
    {
      "changes": 0,
      "rows": [
        {
          "c": "d",
          "createdAt": "1997-04-13T12:27:00.000Z",
          "id": "b",
          "updatedAt": "1997-04-13T12:27:00.000Z",
        },
      ],
    }
  `);
});
