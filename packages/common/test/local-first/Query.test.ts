import { expect, test } from "vitest";
import type { Row } from "../../src/local-first/Query.js";
import {
  applyPatches,
  deserializeQuery,
  kyselyJsonIdentifier,
  makePatches,
  serializeQuery,
  testQuery,
  testQuery2,
} from "../../src/local-first/Query.js";
import { sql, type SafeSql, type SqliteQuery } from "../../src/Sqlite.js";

test("Query", () => {
  const query1 = serializeQuery<{ a: 1 }>(sql`select "a" as "kind";`);
  const query2 = serializeQuery<{ b: 1 }>(sql`select "b" as "kind";`);

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

test("testQuery placeholders", () => {
  expect(deserializeQuery(testQuery).sql).toBe('select "test" as "query";');
  expect(deserializeQuery(testQuery2).sql).toBe('select "test-2" as "query";');
  expect(testQuery).not.toBe(testQuery2);
});

test("serializeQuery and deserializeQuery", () => {
  const binaryData = new Uint8Array([1, 3, 2]);
  const sqlQuery: SqliteQuery = {
    sql: "a" as SafeSql,
    parameters: [null, "a", 1, binaryData],
  };

  expect(deserializeQuery(serializeQuery(sqlQuery))).toStrictEqual(sqlQuery);
});

test("serializeQuery sorts options and deserializeQuery restores them", () => {
  const sqlQuery: SqliteQuery = {
    sql: "select 1" as SafeSql,
    parameters: [],
    options: {
      prepare: true,
      logQueryExecutionTime: true,
      logExplainQueryPlan: true,
    },
  };

  const serialized = serializeQuery(sqlQuery);
  const [, , optionsArr] = JSON.parse(serialized) as [
    SafeSql,
    Array<unknown>,
    Array<readonly [string, unknown]>,
  ];

  expect(optionsArr.map(([key]) => key)).toEqual([
    "logExplainQueryPlan",
    "logQueryExecutionTime",
    "prepare",
  ]);
  expect(deserializeQuery(serialized)).toStrictEqual(sqlQuery);
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

test("makePatches handles undefined previous rows", () => {
  const rows: ReadonlyArray<Row> = [{ a: 1 }];
  const patches = makePatches(undefined, rows);

  expect(patches).toEqual([{ op: "replaceAll", value: rows }]);
  if (patches[0].op === "replaceAll") expect(patches[0].value).toBe(rows);
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

test("applyPatches parses prefixed JSON in strings, arrays, and objects", () => {
  const encodedObject = `${kyselyJsonIdentifier}{"x":1}`;
  const encodedArray = `${kyselyJsonIdentifier}[1,2]`;

  const result = applyPatches(
    [
      {
        op: "replaceAll",
        value: [
          {
            plain: "no-json",
            objectValue: encodedObject,
            arrayValue: [{ inside: encodedArray }],
            nested: { inside: encodedObject },
          },
        ],
      },
    ],
    [],
  );

  expect(result).toEqual([
    {
      plain: "no-json",
      objectValue: { x: 1 },
      arrayValue: [{ inside: [1, 2] }],
      nested: { inside: { x: 1 } },
    },
  ]);
});
