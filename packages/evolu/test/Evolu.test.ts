import { constVoid } from "@effect/data/Function";
import { expect, test } from "vitest";
import { RowsCache, createSubscribeRows } from "../src/Evolu.js";
import { createStore } from "../src/Store.js";
import { QueryString } from "../src/Types.js";

test("createSubscribeRows", () => {
  expect(1).toBe(1);
  const rowsCache = createStore<RowsCache>(new Map());
  const subscribedQueries = new Map<QueryString, number>();
  const subscribeQuery = createSubscribeRows(rowsCache, subscribedQueries);

  const query1 = "query1" as QueryString;
  const query2 = "query2" as QueryString;

  const unsubscribeQuery11 = subscribeQuery(query1)(constVoid);
  const unsubscribeQuery21 = subscribeQuery(query2)(constVoid);
  expect(subscribedQueries).toMatchInlineSnapshot(`
    Map {
      "query1" => 1,
      "query2" => 1,
    }
  `);

  const unsubscribeQuery12 = subscribeQuery(query1)(constVoid);
  expect(subscribedQueries).toMatchInlineSnapshot(`
    Map {
      "query1" => 2,
      "query2" => 1,
    }
  `);

  unsubscribeQuery11();
  unsubscribeQuery12();
  unsubscribeQuery21();
  expect(subscribedQueries).toMatchInlineSnapshot("Map {}");
});
