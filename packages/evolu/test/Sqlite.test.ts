import { expect, test } from "vitest";
import { isJsonObjectOrArray } from "../src/Sqlite.js";

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
