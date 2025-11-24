import { expect, test } from "vitest";
import {
  deserializeQuery,
  Query,
  serializeQuery,
} from "../../src/local-first/Query.js";
import { SafeSql, SqliteQuery } from "../../src/Sqlite.js";

test("Query", () => {
  const query1 = "a" as Query<{ a: 1 }>;
  const query2 = "b" as Query<{ b: 1 }>;

  // Ensure query1 and query2 are treated as different types
  // @ts-expect-error - query1 should not be assignable to query2
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const shouldError: typeof query2 = query1;

  // @ts-expect-error - query2 should not be assignable to query1
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const shouldAlsoError: typeof query1 = query2;

  // Valid assignments
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const validQuery1: typeof query1 = query1;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const validQuery2: typeof query2 = query2;
});

test("serializeQuery and deserializeQuery", () => {
  const binaryData = new Uint8Array([1, 3, 2]);
  const sqlQuery: SqliteQuery = {
    sql: "a" as SafeSql,
    parameters: [null, "a", 1, binaryData],
  };

  expect(deserializeQuery(serializeQuery(sqlQuery))).toStrictEqual(sqlQuery);
});
