import { expectErr, expectOk } from "@evolu/vitest";
import { runInNewContext } from "node:vm";
import { expect, test } from "vitest";
import {
  ArrayBuffer,
  array,
  Date,
  discriminatedUnion,
  JsonValue,
  Object,
  object,
  record,
  set,
  String,
  tuple,
  typed,
  Uint8Array,
} from "../../../../packages/common/src/Type.ts";

test("accepts legitimate structured values from another realm by identity", () => {
  const Model = object({ name: String });
  const Names = array(String);
  const Name = tuple(String, String);
  const Values = record(String, String);
  const StringSet = set(String);
  const Created = typed("Created", { name: String });
  const Deleted = typed("Deleted", { name: String });
  const Event = discriminatedUnion(Created, Deleted);
  const values: {
    readonly arrayValue: unknown;
    readonly eventValue: unknown;
    readonly jsonValue: unknown;
    readonly objectValue: unknown;
    readonly setValue: unknown;
    readonly tupleValue: unknown;
  } = runInNewContext(`({
    arrayValue: ["Ada"],
    eventValue: { type: "Created", name: "Ada" },
    jsonValue: { nested: ["Ada"] },
    objectValue: { name: "Ada" },
    setValue: new Set(["Ada"]),
    tupleValue: ["Ada", "Lovelace"],
  })`);

  expect(values.objectValue).not.toBeInstanceOf(globalThis.Object);
  expect(values.arrayValue).not.toBeInstanceOf(globalThis.Array);
  expect(values.tupleValue).not.toBeInstanceOf(globalThis.Array);
  expect(values.setValue).not.toBeInstanceOf(globalThis.Set);
  expect(values.eventValue).not.toBeInstanceOf(globalThis.Object);
  expect(values.jsonValue).not.toBeInstanceOf(globalThis.Object);

  const modelResult = Model.fromUnknown(values.objectValue);
  const objectResult = Object.fromUnknown(values.objectValue);
  const namesResult = Names.fromUnknown(values.arrayValue);
  const nameResult = Name.fromUnknown(values.tupleValue);
  const valuesResult = Values.fromUnknown(values.objectValue);
  const setResult = StringSet.fromUnknown(values.setValue);
  const eventResult = Event.fromUnknown(values.eventValue);
  const jsonResult = JsonValue.fromUnknown(values.jsonValue);

  expectOk(modelResult, values.objectValue);
  expectOk(objectResult, values.objectValue);
  expectOk(namesResult, values.arrayValue);
  expectOk(nameResult, values.tupleValue);
  expectOk(valuesResult, values.objectValue);
  expectOk(setResult, values.setValue);
  expectOk(eventResult, values.eventValue);
  expectOk(jsonResult, values.jsonValue);

  expect(modelResult.value).toBe(values.objectValue);
  expect(objectResult.value).toBe(values.objectValue);
  expect(namesResult.value).toBe(values.arrayValue);
  expect(nameResult.value).toBe(values.tupleValue);
  expect(valuesResult.value).toBe(values.objectValue);
  expect(setResult.value).toBe(values.setValue);
  expect(eventResult.value).toBe(values.eventValue);
  expect(jsonResult.value).toBe(values.jsonValue);

  expect(Model.is(values.objectValue)).toBe(true);
  expect(Object.is(values.objectValue)).toBe(true);
  expect(Names.is(values.arrayValue)).toBe(true);
  expect(Name.is(values.tupleValue)).toBe(true);
  expect(Values.is(values.objectValue)).toBe(true);
  expect(StringSet.is(values.setValue)).toBe(true);
  expect(Event.is(values.eventValue)).toBe(true);
  expect(JsonValue.is(values.jsonValue)).toBe(true);
});

test("rejects Set subclasses from another realm", () => {
  const StringSet = set(String);
  const value: ReadonlySet<string> = runInNewContext(
    'new (class extends Set {})(["Ada"])',
  );

  expect(value).not.toBeInstanceOf(globalThis.Set);
  expectErr(StringSet.fromUnknown(value), {
    type: "Set",
    reason: { kind: "UnexpectedPrototype", value },
  });
  expect(StringSet.is(value)).toBe(false);
});

test("accepts foreign-realm Object schema property maps", () => {
  const props: { readonly name: typeof String } = runInNewContext(
    "({ name: StringType })",
    { StringType: String },
  );
  const Model = object(props);
  const value: unknown = runInNewContext("({ name: 'Ada' })");
  const result = Model.fromUnknown(value);

  expect(props).not.toBeInstanceOf(globalThis.Object);
  expectOk(result, value);
  expect(result.value).toBe(value);
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

test("accepts built-in instances from another realm by identity", () => {
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
    const result = type.fromUnknown(value);

    expectOk(result, value);
    expect(result.value).toBe(value);
    expect(type.is(value)).toBe(true);
  }
});
