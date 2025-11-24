import { expect, test } from "vitest";
import {
  applyPatches,
  deserializeQuery,
  makePatches,
  Query,
  Row,
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

test("makePatches", () => {
  const row: Row = { a: 1 };
  const rows: ReadonlyArray<Row> = [row];

  expect(makePatches([], []).length).toBe(0);
  const p0 = [{ op: "replaceAll", value: [] }];
  expect(makePatches(rows, [])).toEqual(p0);

  const p1 = makePatches([], rows);
  expect(p1).toEqual([{ op: "replaceAll", value: rows }]);
  if (p1[0].op === "replaceAll") expect(p1[0].value).toBe(rows);

  expect(makePatches(rows, rows).length).toBe(0);

  expect(makePatches(rows, [{ a: 2 }])).toMatchSnapshot();

  expect(makePatches([row, { b: 2 }], [row, { b: 3 }])).toMatchSnapshot();

  expect(
    makePatches([{ a: 1 }, row, { c: 4 }], [{ a: 0 }, row, { c: 1 }]),
  ).toMatchSnapshot();

  expect(
    makePatches([{ a: new Uint8Array([1]) }], [{ a: new Uint8Array([1]) }])
      .length,
  ).toBe(0);
});

test("applyPatches", () => {
  const current: ReadonlyArray<Row> = [];
  expect(applyPatches([], current)).toBe(current);

  const value: ReadonlyArray<Row> = [];
  expect(applyPatches([{ op: "replaceAll", value }], current)).toStrictEqual(
    value,
  );

  const replaceUntouched = { b: 2 };
  const replaceAtResult = applyPatches(
    [
      { op: "replaceAt", index: 0, value: { a: 2 } },
      { op: "replaceAt", index: 2, value: { c: 4 } },
    ],
    [{ a: 1 }, replaceUntouched, { c: 3 }],
  );
  expect(replaceAtResult).toEqual([{ a: 2 }, { b: 2 }, { c: 4 }]);
  expect(replaceAtResult[1]).toBe(replaceUntouched);
});
