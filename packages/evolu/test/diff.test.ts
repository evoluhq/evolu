import { expect, test } from "vitest";
import { SqliteRow, SqliteRows } from "../src";
import { applyPatches, createPatches } from "../src/diff";

test("createPatches", () => {
  const item = { a: 1 };
  const array = [item];

  expect(createPatches([], []).length).toBe(0);
  const p0 = [{ op: "replaceAll", value: [] }];
  expect(createPatches(array, [])).toEqual(p0);
  expect(createPatches(undefined, [])).toEqual(p0);

  const p1 = createPatches([], array);
  expect(p1).toEqual([{ op: "replaceAll", value: array }]);
  if (p1[0].op === "replaceAll") expect(p1[0].value).toBe(array);

  expect(createPatches(array, array).length).toBe(0);
  expect(createPatches(array, [{ a: 2 }])).toMatchInlineSnapshot(`
    [
      {
        "op": "replaceAll",
        "value": [
          {
            "a": 2,
          },
        ],
      },
    ]
  `);
  expect(createPatches([item, { b: 2 }], [item, { b: 3 }]))
    .toMatchInlineSnapshot(`
    [
      {
        "index": 1,
        "op": "replaceAt",
        "value": {
          "b": 3,
        },
      },
    ]
  `);
  expect(createPatches([{ a: 1 }, item, { c: 4 }], [{ a: 0 }, item, { c: 1 }]))
    .toMatchInlineSnapshot(`
    [
      {
        "index": 0,
        "op": "replaceAt",
        "value": {
          "a": 0,
        },
      },
      {
        "index": 2,
        "op": "replaceAt",
        "value": {
          "c": 1,
        },
      },
    ]
  `);
});

test("applyPatches", () => {
  const current: SqliteRows = [];
  expect(applyPatches([])(current)).toBe(current);

  const value: SqliteRows = [];
  expect(applyPatches([{ op: "replaceAll", value }])(current)).toBe(value);

  const replaceUntouched = { b: 2 };
  const replaceAtResult = applyPatches([
    { op: "replaceAt", index: 0, value: { a: 2 } },
    { op: "replaceAt", index: 2, value: { c: 4 } },
  ])([{ a: 1 }, replaceUntouched, { c: 3 }]);
  expect(replaceAtResult).toEqual([{ a: 2 }, { b: 2 }, { c: 4 }]);
  if (replaceAtResult) expect(replaceAtResult[1]).toBe(replaceUntouched);

  expect(applyPatches([{ op: "purge" }])([])).toBeUndefined();
});
