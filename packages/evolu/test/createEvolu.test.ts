import { expect, test } from "vitest";
import { Id, OwnerId, SqliteDate } from "../src";
import { createNewCrdtMessages } from "../src/createEvolu";

test("createNewCrdtMessages", () => {
  const values = {
    a: undefined,
    b: null,
    c: false,
    d: new Date("December 17, 1995 03:24:00"),
    e: "string",
  };

  expect(
    createNewCrdtMessages(
      "table",
      "row" as Id,
      values,
      "ownerId" as OwnerId,
      "now" as SqliteDate,
      true
    )
  ).toMatchInlineSnapshot(`
    [
      {
        "column": "c",
        "row": "row",
        "table": "table",
        "value": 0,
      },
      {
        "column": "d",
        "row": "row",
        "table": "table",
        "value": "1995-12-17T02:24:00.000Z",
      },
      {
        "column": "e",
        "row": "row",
        "table": "table",
        "value": "string",
      },
      {
        "column": "createdAt",
        "row": "row",
        "table": "table",
        "value": "now",
      },
      {
        "column": "createdBy",
        "row": "row",
        "table": "table",
        "value": "ownerId",
      },
    ]
  `);

  expect(
    createNewCrdtMessages(
      "table",
      "row" as Id,
      values,
      "ownerId" as OwnerId,
      "now" as SqliteDate,
      false
    )
  ).toMatchInlineSnapshot(`
    [
      {
        "column": "b",
        "row": "row",
        "table": "table",
        "value": null,
      },
      {
        "column": "c",
        "row": "row",
        "table": "table",
        "value": 0,
      },
      {
        "column": "d",
        "row": "row",
        "table": "table",
        "value": "1995-12-17T02:24:00.000Z",
      },
      {
        "column": "e",
        "row": "row",
        "table": "table",
        "value": "string",
      },
      {
        "column": "updatedAt",
        "row": "row",
        "table": "table",
        "value": "now",
      },
    ]
  `);
});
