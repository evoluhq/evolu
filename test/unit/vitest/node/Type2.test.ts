import { expectOk } from "@evolu/vitest";
import { runInNewContext } from "node:vm";
import { expect, test } from "vitest";
import {
  ArrayBuffer,
  array,
  Date,
  JsonValue,
  Object,
  object,
  optional,
  record,
  String,
  Uint8Array,
} from "../../../../packages/common/src/Type2.ts";

const expectAssertionError = (
  operation: () => unknown,
  message: string,
  cause: unknown,
): void => {
  let thrown: unknown;

  try {
    operation();
  } catch (error) {
    thrown = error;
  }

  expect(thrown).toBeInstanceOf(Error);
  if (!(thrown instanceof Error)) throw new Error("Expected an Error.");
  expect(thrown.message).toBe(message);
  expect(thrown.cause).toEqual(cause);
};

test("requires explicit conversion of structured values from another realm", () => {
  const Model = object({ name: String, note: optional(String) });
  const Names = array(String);
  const Values = record(String, String);
  const value: unknown = runInNewContext("({ name: 'Ada' })");
  const arrayValue: unknown = runInNewContext("['Ada']");
  const modelResult = Model.fromUnknown(value);
  const objectResult = Object.fromUnknown(value);
  const namesResult = Names.fromUnknown(arrayValue);
  const valuesResult = Values.fromUnknown(value);
  const jsonObjectResult = JsonValue.fromUnknown(value);
  const jsonArrayResult = JsonValue.fromUnknown(arrayValue);

  expect(value).not.toBeInstanceOf(globalThis.Object);
  expect(modelResult).toEqual(
    {
      ok: false,
      error: {
        type: "Object",
        reason: { kind: "UnexpectedPrototype", value },
      },
    },
  );
  expect(Model.is(value)).toBe(false);
  expect(objectResult).toEqual({
    ok: false,
    error: {
      type: "Object",
      reason: { kind: "UnexpectedPrototype", value },
    },
  });
  expect(Object.is(value)).toBe(false);
  expect(namesResult).toEqual({
    ok: false,
    error: {
      type: "Array",
      reason: { kind: "UnexpectedPrototype", value: arrayValue },
    },
  });
  expect(Names.is(arrayValue)).toBe(false);
  expect(valuesResult).toEqual({
    ok: false,
    error: {
      type: "Record",
      reason: { kind: "NotPlainRecord", value },
    },
  });
  expect(Values.is(value)).toBe(false);
  expect(jsonObjectResult).toEqual({
    ok: false,
    error: {
      type: "JsonValue",
      reason: {
        kind: "Issues",
        issues: [
          {
            kind: "UnexpectedPrototype",
            path: [],
            container: "Object",
            value,
          },
        ],
      },
    },
  });
  expect(jsonArrayResult).toEqual({
    ok: false,
    error: {
      type: "JsonValue",
      reason: {
        kind: "Issues",
        issues: [
          {
            kind: "UnexpectedPrototype",
            path: [],
            container: "Array",
            value: arrayValue,
          },
        ],
      },
    },
  });
  expect(JsonValue.is(value)).toBe(false);
  expect(JsonValue.is(arrayValue)).toBe(false);
  if (
    modelResult.ok ||
    objectResult.ok ||
    namesResult.ok ||
    valuesResult.ok ||
    jsonObjectResult.ok ||
    jsonArrayResult.ok
  ) {
    throw new Error("Expected foreign-realm validation errors.");
  }

  // A trusted return contract should be cast and should skip Type operations.
  // If the data still needs validation, it must first be converted into the
  // local representation by boundary-specific code.
  const guidance =
    "For a trusted return contract, cast and skip this Type; otherwise, use boundary-specific validation or transformation.";
  const typedModel = value as typeof Model.Output;
  const typedObject = value as typeof Object.Output;
  const typedNames = arrayValue as typeof Names.Output;
  const typedValues = value as typeof Values.Output;
  const typedJsonObject = value as typeof JsonValue.Output;
  const typedJsonArray = arrayValue as typeof JsonValue.Output;

  for (const operation of [
    () => Model.from(typedModel),
    () => Model.to(typedModel),
  ]) {
    expectAssertionError(
      operation,
      `The value is an object, but an Object Output must use this realm's Object.prototype or null. ${guidance}`,
      modelResult.error,
    );
  }
  for (const operation of [
    () => Object.from(typedObject),
    () => Object.to(typedObject),
  ]) {
    expectAssertionError(
      operation,
      `The value is an object, but an Object Output must use this realm's Object.prototype or null. ${guidance}`,
      objectResult.error,
    );
  }
  for (const operation of [
    () => Names.from(typedNames),
    () => Names.to(typedNames),
  ]) {
    expectAssertionError(
      operation,
      `The value is an array, but an Array Output must use this realm's Array.prototype. ${guidance}`,
      namesResult.error,
    );
  }
  for (const operation of [
    () => Values.from(typedValues),
    () => Values.to(typedValues),
  ]) {
    expectAssertionError(
      operation,
      `The value is an object, but a Record Output must use this realm's Object.prototype or null. ${guidance}`,
      valuesResult.error,
    );
  }
  for (const operation of [
    () => JsonValue.from(typedJsonObject),
    () => JsonValue.to(typedJsonObject),
  ]) {
    expectAssertionError(
      operation,
      `The value is an object, but a JsonValue Output must use this realm's Object.prototype or null. ${guidance}`,
      jsonObjectResult.error,
    );
  }
  for (const operation of [
    () => JsonValue.from(typedJsonArray),
    () => JsonValue.to(typedJsonArray),
  ]) {
    expectAssertionError(
      operation,
      `The value is an array, but a JsonValue Output must use this realm's Array.prototype. ${guidance}`,
      jsonArrayResult.error,
    );
  }

  const converted = structuredClone(value);
  const convertedArray = structuredClone(arrayValue);
  const convertedResult = Model.fromUnknown(converted);
  const convertedObjectResult = Object.fromUnknown(converted);
  const convertedNamesResult = Names.fromUnknown(convertedArray);
  const convertedValuesResult = Values.fromUnknown(converted);
  const convertedJsonObjectResult = JsonValue.fromUnknown(converted);
  const convertedJsonArrayResult = JsonValue.fromUnknown(convertedArray);

  expect(globalThis.Object.getPrototypeOf(convertedArray)).toBe(
    globalThis.Array.prototype,
  );
  expectOk(convertedNamesResult, ["Ada"]);
  expect(Names.is(convertedNamesResult.value)).toBe(true);
  expectOk(convertedResult, { name: "Ada" });
  expect(Model.is(convertedResult.value)).toBe(true);
  expectOk(convertedObjectResult, { name: "Ada" });
  expect(Object.is(convertedObjectResult.value)).toBe(true);
  expectOk(convertedValuesResult, { name: "Ada" });
  expect(Values.is(convertedValuesResult.value)).toBe(true);
  expectOk(convertedJsonObjectResult, { name: "Ada" });
  expect(JsonValue.is(convertedJsonObjectResult.value)).toBe(true);
  expectOk(convertedJsonArrayResult, ["Ada"]);
  expect(JsonValue.is(convertedJsonArrayResult.value)).toBe(true);
});

test("accepts foreign null-prototype objects because they have no realm identity", () => {
  const value: unknown = runInNewContext(
    "Object.assign(Object.create(null), { name: 'Ada' })",
  );

  const result = Object.fromUnknown(value);

  expect(globalThis.Object.getPrototypeOf(value)).toBeNull();
  expectOk(result, value);
  expect(result.value).toBe(value);
  expect(Object.is(value)).toBe(true);
});

test("rejects built-in instances from another realm", () => {
  const values = [
    {
      constructor: globalThis.Date,
      type: Date,
      value: runInNewContext("new Date(0)"),
    },
    {
      constructor: globalThis.Uint8Array,
      type: Uint8Array,
      value: runInNewContext("new Uint8Array(0)"),
    },
    {
      constructor: globalThis.ArrayBuffer,
      type: ArrayBuffer,
      value: runInNewContext("new ArrayBuffer(0)"),
    },
  ] as const;

  for (const { constructor, type, value } of values) {
    expect(value).not.toBeInstanceOf(constructor);
    expect(type.fromUnknown(value)).toEqual({
      ok: false,
      error: {
        type: "InstanceOf",
        constructorName: constructor.name,
        value,
      },
    });
    expect(type.is(value)).toBe(false);
  }
});
