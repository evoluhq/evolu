import { expect, test } from "vitest";
import {
  escapeRegExp,
  safelyStringifyUnknownValue,
} from "../../../../packages/common/src/String.ts";

test("escapeRegExp", () => {
  const value = "value.*+?^${}()|[]\\end";

  expect(escapeRegExp(value)).toBe(
    "value\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\end",
  );
  expect(new RegExp(`^${escapeRegExp(value)}$`).test(value)).toBe(true);
});

test("safelyStringifyUnknownValue", () => {
  expect(safelyStringifyUnknownValue('line 1\n"line 2"')).toBe(
    '"line 1\\n\\"line 2\\""',
  );
  expect(safelyStringifyUnknownValue(undefined)).toBe("undefined");
  expect(safelyStringifyUnknownValue(null)).toBe("null");
  expect(safelyStringifyUnknownValue(true)).toBe("true");
  expect(safelyStringifyUnknownValue(NaN)).toBe("NaN");
  expect(safelyStringifyUnknownValue(Infinity)).toBe("Infinity");
  expect(safelyStringifyUnknownValue(42n)).toBe("42");
  expect(safelyStringifyUnknownValue(Symbol("id"))).toBe("Symbol(id)");

  const fn = (): undefined => undefined;
  expect(safelyStringifyUnknownValue(fn)).toBe(globalThis.String(fn));
  expect(safelyStringifyUnknownValue({ answer: 42 })).toBe('{"answer":42}');
  expect(safelyStringifyUnknownValue({ toJSON: () => undefined })).toBe(
    "[object Object]",
  );

  const circularValue: { circular?: unknown } = {};
  circularValue.circular = circularValue;
  expect(safelyStringifyUnknownValue(circularValue)).toBe("[object Object]");

  const unserializableValue: {
    self?: unknown;
    readonly toString: () => never;
  } = {
    toString: () => {
      throw new Error("Cannot stringify.");
    },
  };
  unserializableValue.self = unserializableValue;
  expect(safelyStringifyUnknownValue(unserializableValue)).toBe(
    "[Unserializable value]",
  );
});
