import { expect, test } from "vitest";
import { createNewMessages } from "../src/Messages.js";
import { Id, SqliteDate } from "../src/Model.js";
import { Owner } from "../src/Types.js";

test("createNewCrdtMessages", () => {
  const values = {
    a: undefined,
    b: null,
    c: false,
    d: new Date(123),
    e: "string",
  };

  expect(
    createNewMessages(
      "table",
      "row" as Id,
      values,
      "ownerId" as Owner["id"],
      "now" as SqliteDate,
      true,
    ),
  ).toMatchSnapshot();

  expect(
    createNewMessages(
      "table",
      "row" as Id,
      values,
      "ownerId" as Owner["id"],
      "now" as SqliteDate,
      false,
    ),
  ).toMatchSnapshot();
});
