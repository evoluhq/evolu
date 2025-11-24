import { expect, test } from "vitest";
import { applyPatches, makePatches } from "../../src/local-first/Diff.js";
import { Row } from "../../src/local-first/Query.js";

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
