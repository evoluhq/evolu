import { expect, test } from "vitest";
import { applyPatches, makePatches } from "../src/Diff.js";
import { Row } from "../src/Sqlite.js";

test("makePatches", () => {
  const item = { a: 1 };
  const array = [item];

  expect(makePatches([], []).length).toBe(0);
  const p0 = [{ op: "replaceAll", value: [] }];
  expect(makePatches(array, [])).toEqual(p0);
  expect(makePatches(undefined, [])).toEqual(p0);

  const p1 = makePatches([], array);
  expect(p1).toEqual([{ op: "replaceAll", value: array }]);
  if (p1[0].op === "replaceAll") expect(p1[0].value).toBe(array);

  expect(makePatches(array, array).length).toBe(0);
  expect(makePatches(array, [{ a: 2 }])).toMatchInlineSnapshot(`
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
  expect(makePatches([item, { b: 2 }], [item, { b: 3 }]))
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
  expect(makePatches([{ a: 1 }, item, { c: 4 }], [{ a: 0 }, item, { c: 1 }]))
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
  const current: ReadonlyArray<Row> = [];
  expect(applyPatches([])(current)).toBe(current);

  const value: ReadonlyArray<Row> = [];
  expect(applyPatches([{ op: "replaceAll", value }])(current)).toBe(value);

  const replaceUntouched = { b: 2 };
  const replaceAtResult = applyPatches([
    { op: "replaceAt", index: 0, value: { a: 2 } },
    { op: "replaceAt", index: 2, value: { c: 4 } },
  ])([{ a: 1 }, replaceUntouched, { c: 3 }]);
  expect(replaceAtResult).toEqual([{ a: 2 }, { b: 2 }, { c: 4 }]);
  if (replaceAtResult) expect(replaceAtResult[1]).toBe(replaceUntouched);
});
