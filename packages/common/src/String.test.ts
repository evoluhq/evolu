import { test } from "node:test";
import { assertEqual, assertSame, assertTrue } from "./Assert.ts";

import { escapeRegExp, safelyStringifyUnknownValue } from "./String.ts";

test("escapeRegExp", () => {
  const value = "value.*+?^${}()|[]\\end";

  assertEqual(
    escapeRegExp(value),
    "value\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\end",
  );
  assertTrue(new RegExp(`^${escapeRegExp(value)}$`, "u").test(value));
});

test("safelyStringifyUnknownValue", () => {
  assertEqual(
    safelyStringifyUnknownValue('line 1\n"line 2"'),
    '"line 1\\n\\"line 2\\""',
  );
  assertEqual(safelyStringifyUnknownValue(undefined), "undefined");
  assertEqual(safelyStringifyUnknownValue(null), "null");
  assertEqual(safelyStringifyUnknownValue(true), "true");
  assertEqual(safelyStringifyUnknownValue(NaN), "NaN");
  assertEqual(safelyStringifyUnknownValue(Infinity), "Infinity");
  assertEqual(safelyStringifyUnknownValue(42n), "42");
  assertEqual(safelyStringifyUnknownValue(Symbol("id")), "Symbol(id)");

  const fn = (): undefined => undefined;
  assertSame(safelyStringifyUnknownValue(fn), String(fn));
  assertEqual(safelyStringifyUnknownValue({ answer: 42 }), '{"answer":42}');
  assertEqual(
    safelyStringifyUnknownValue({ toJSON: () => undefined }),
    "[object Object]",
  );

  const circularValue: { circular?: unknown } = {};
  circularValue.circular = circularValue;
  assertEqual(safelyStringifyUnknownValue(circularValue), "[object Object]");

  const unserializableValue: {
    self?: unknown;
    readonly toString: () => never;
  } = {
    toString: () => {
      throw new Error("Cannot stringify.");
    },
  };
  unserializableValue.self = unserializableValue;
  assertEqual(
    safelyStringifyUnknownValue(unserializableValue),
    "[Unserializable value]",
  );
});
