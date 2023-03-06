import { expect, test } from "vitest";
import { Id, OwnerId, SqliteDate } from "../src";
import { createNewCrdtMessages } from "../src/createEvolu";

test("createNewCrdtMessages", () => {
  const values = {
    a: undefined,
    b: null,
    c: false,
    d: new Date(123),
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
  ).toMatchSnapshot();

  expect(
    createNewCrdtMessages(
      "table",
      "row" as Id,
      values,
      "ownerId" as OwnerId,
      "now" as SqliteDate,
      false
    )
  ).toMatchSnapshot();
});
