import { assertEqual, assertTrue, emptyPrototype } from "@evolu/common";
import { test } from "node:test";
import { setFlagsFromString } from "node:v8";
import { runInThisContext } from "node:vm";
import { createNativeSqliteRowBuilder } from "./NativeSqliteRows.ts";

// V8 parses its natives in code compiled after this flag is set.
setFlagsFromString("--allow-natives-syntax");
const haveSameMap = runInThisContext("(a, b) => %HaveSameMap(a, b)") as (
  a: object,
  b: object,
) => boolean;
const hasFastProperties = runInThisContext("(a) => %HasFastProperties(a)") as (
  a: object,
) => boolean;

test("the keys of a statement's columns keep a row of NULLs with the map of the rows built of them, so V8 keeps the map while no row is alive", () => {
  const builder = createNativeSqliteRowBuilder(emptyPrototype);
  const values = builder.holder[0] as Record<number, string>;
  values[0] = "a";
  values[1] = "b";
  const names = builder.take(2);
  const rows = builder.createRows(names, 0, 4, 1, "x", 2, null);
  const { row } = names as unknown as { readonly row: object };

  assertEqual(rows, [
    { a: 1, b: "x" },
    { a: 2, b: null },
  ]);
  assertEqual(row, { a: null, b: null });
  const [first, second] = rows as ReadonlyArray<object>;
  assertTrue(haveSameMap(row, first) && haveSameMap(row, second));
});

test("the keys of a statement whose rows are dictionaries keep no row, since no map of their rows is the statement's", () => {
  const builder = createNativeSqliteRowBuilder(emptyPrototype);
  for (const width of [19, 20]) {
    const values = builder.holder[0] as Record<number, string>;
    for (let i = 0; i < width; i++) values[i] = `c${i}`;
    const names = builder.take(width);
    const [row] = builder.createRows(
      names,
      0,
      width,
      ...Array.from({ length: width }, (_, i) => i),
    ) as ReadonlyArray<object>;
    const kept = (names as unknown as { readonly row: object | null }).row;

    assertTrue(hasFastProperties(row) === (width === 19));
    assertTrue((kept === null) === (width === 20));
  }
});

test("a call's first chunk of texts drops the texts of a call whose rows were never built", () => {
  const builder = createNativeSqliteRowBuilder(emptyPrototype);
  // A call that failed after it passed its texts and before its rows.
  builder.takeTexts(true, "a text of the call that failed");
  builder.takeTexts(true, "a text of this call");
  // 1,024 numbers and one longer ASCII text, all in the buffer: the byte
  // length of its short texts and its numbers, as doubles, then its kinds.
  const numbers = Array.from({ length: 1024 }, (_, i) => i);
  const buffer = new ArrayBuffer(8 * 1026 + 1025);
  new Float64Array(buffer, 8, 1024).set(numbers);
  const kinds = new Uint8Array(buffer, 8 * 1026, 1025);
  kinds.fill(1, 0, 1024);
  kinds[1024] = 3;

  const rows = builder.createRows({ 0: "a", length: 1 }, 0, 1025, buffer);

  assertEqual(rows, [
    ...numbers.map((a) => ({ a })),
    { a: "a text of this call" },
  ]);
});
