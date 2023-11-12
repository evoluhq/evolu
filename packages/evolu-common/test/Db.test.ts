import { expect, test } from "vitest";
import {
  deserializeQuery,
  isJsonObjectOrArray,
  serializeQuery,
} from "../src/Db.js";
import { SqliteQuery } from "../src/Sqlite.js";

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
    parameters: [null, "a", 1, binaryData],
  };
  expect(deserializeQuery(serializeQuery(sqliteQuery))).toStrictEqual(
    sqliteQuery,
  );
});
