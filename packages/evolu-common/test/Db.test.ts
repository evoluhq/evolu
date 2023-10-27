import { expect, test } from "vitest";
import { FilterMap, makeCacheFilterMap } from "../src/Db.js";

test("makeCacheFilterMap", () => {
  const cacheFilterMap = makeCacheFilterMap();

  const row = { name: "a" };

  const filterMap: FilterMap<{ name: string | null }, { foo: string }> = ({
    name,
  }) => name != null && { foo: name };

  expect(filterMap(row)).toMatchInlineSnapshot(`
    {
      "foo": "a",
    }
  `);
  expect(filterMap({ name: null })).toMatchInlineSnapshot("false");

  const cachedMappedRow = cacheFilterMap(filterMap)(row);
  expect(cacheFilterMap(filterMap)(row)).toBe(cachedMappedRow);
});
