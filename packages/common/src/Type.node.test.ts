import { runInNewContext } from "node:vm";
import { test } from "node:test";
import { assertFalse, assertOk, assertSame, assertTrue } from "./Assert.ts";
import {
  ArrayBuffer,
  array,
  Data,
  Date,
  discriminatedUnion,
  JsonValue,
  map,
  Object,
  object,
  record,
  set,
  String,
  tuple,
  typed,
  Uint8Array,
} from "./Type.ts";

test("accepts legitimate structured values from another realm by identity", () => {
  const Model = object({ name: String });
  const Names = array(String);
  const Name = tuple(String, String);
  const Values = record(String, String);
  const ValuesByName = map(String, String);
  const StringSet = set(String);
  const Created = typed("Created", { name: String });
  const Deleted = typed("Deleted", { name: String });
  const Event = discriminatedUnion(Created, Deleted);
  const values: {
    readonly arrayValue: unknown;
    readonly eventValue: unknown;
    readonly jsonValue: unknown;
    readonly mapValue: unknown;
    readonly objectValue: unknown;
    readonly setValue: unknown;
    readonly tupleValue: unknown;
  } = runInNewContext(`({
    arrayValue: ["Ada"],
    eventValue: { type: "Created", name: "Ada" },
    jsonValue: { nested: ["Ada"] },
    mapValue: new Map([["Ada", "Lovelace"]]),
    objectValue: { name: "Ada" },
    setValue: new Set(["Ada"]),
    tupleValue: ["Ada", "Lovelace"],
  })`);

  assertFalse(values.objectValue instanceof globalThis.Object);
  assertFalse(values.arrayValue instanceof globalThis.Array);
  assertFalse(values.tupleValue instanceof globalThis.Array);
  assertFalse(values.setValue instanceof globalThis.Set);
  assertFalse(values.eventValue instanceof globalThis.Object);
  assertFalse(values.jsonValue instanceof globalThis.Object);
  assertFalse(values.mapValue instanceof globalThis.Map);

  const modelResult = Model.fromUnknown(values.objectValue);
  const objectResult = Object.fromUnknown(values.objectValue);
  const namesResult = Names.fromUnknown(values.arrayValue);
  const nameResult = Name.fromUnknown(values.tupleValue);
  const valuesResult = Values.fromUnknown(values.objectValue);
  const setResult = StringSet.fromUnknown(values.setValue);
  const eventResult = Event.fromUnknown(values.eventValue);
  const jsonResult = JsonValue.fromUnknown(values.jsonValue);
  const mapResult = ValuesByName.fromUnknown(values.mapValue);

  assertOk(modelResult);
  assertOk(objectResult);
  assertOk(namesResult);
  assertOk(nameResult);
  assertOk(valuesResult);
  assertOk(setResult);
  assertOk(eventResult);
  assertOk(jsonResult);
  assertOk(mapResult);

  assertSame(modelResult.value, values.objectValue);
  assertSame(objectResult.value, values.objectValue);
  assertSame(namesResult.value, values.arrayValue);
  assertSame(nameResult.value, values.tupleValue);
  assertSame(valuesResult.value, values.objectValue);
  assertSame(setResult.value, values.setValue);
  assertSame(eventResult.value, values.eventValue);
  assertSame(jsonResult.value, values.jsonValue);
  assertSame(mapResult.value, values.mapValue);

  assertTrue(Model.is(values.objectValue));
  assertTrue(Object.is(values.objectValue));
  assertTrue(Names.is(values.arrayValue));
  assertTrue(Name.is(values.tupleValue));
  assertTrue(Values.is(values.objectValue));
  assertTrue(StringSet.is(values.setValue));
  assertTrue(Event.is(values.eventValue));
  assertTrue(JsonValue.is(values.jsonValue));
  assertTrue(ValuesByName.is(values.mapValue));
});

test("accepts foreign-realm Object schema property maps", () => {
  const props: { readonly name: typeof String } = runInNewContext(
    "({ name: StringType })",
    { StringType: String },
  );
  const Model = object(props);
  const value: unknown = runInNewContext("({ name: 'Ada' })");
  const result = Model.fromUnknown(value);

  assertFalse(props instanceof globalThis.Object);
  assertOk(result);
  assertSame(result.value, value);
});

test("accepts foreign null-prototype objects because they have no realm identity", () => {
  const value: unknown = runInNewContext(
    "Object.assign(Object.create(null), { name: 'Ada' })",
  );

  const result = Object.fromUnknown(value);

  assertSame(globalThis.Object.getPrototypeOf(value), null);
  assertOk(result);
  assertSame(result.value, value);
  assertTrue(Object.is(value));
});

test("Data accepts a valid Uint8Array from another realm", () => {
  const value: unknown = runInNewContext("new Uint8Array([1, 2, 3])");
  const result = Data.fromUnknown(value);

  assertFalse(value instanceof globalThis.Uint8Array);
  assertOk(result);
  assertSame(result.value, value);
  assertTrue(Data.is(value));
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
    assertFalse(value instanceof constructor);
    const result = type.fromUnknown(value);

    assertOk(result);
    assertSame(result.value, value);
    assertTrue(type.is(value));
  }
});
