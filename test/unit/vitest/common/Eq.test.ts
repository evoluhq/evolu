import { expect, expectTypeOf, test } from "vitest";
import {
  createEqArrayLike,
  createEqObject,
  eqArrayNumber,
  eqData,
  eqFromOrder,
  eqJsonValue,
  eqJsonValueInput,
  eqNumber,
  eqSameValueZero,
  eqStrict,
  eqUint8Array,
  type Eq,
} from "../../../../packages/common/src/Eq.ts";
import { orderNumber } from "../../../../packages/common/src/Order.ts";
import type {
  Data,
  JsonValue,
  JsonValueInput,
} from "../../../../packages/common/src/Type.ts";

test("eqStrict", () => {
  expect(eqStrict(1, 1)).toBe(true);
  expect(eqStrict(NaN, NaN)).toBe(false);
});

test("eqSameValueZero", () => {
  expect(eqSameValueZero(NaN, NaN)).toBe(true);
  expect(eqSameValueZero(0, -0)).toBe(true);
  expect(eqSameValueZero(1, 2)).toBe(false);

  const object = {};
  expect(eqSameValueZero(object, object)).toBe(true);
  expect(eqSameValueZero({}, {})).toBe(false);
});

test("eqNumber", () => {
  expect(eqNumber(NaN, NaN)).toBe(true);
});

test("eqFromOrder", () => {
  const eqNumberFromOrder = eqFromOrder(orderNumber);
  expect(eqNumberFromOrder(1, 1)).toBe(true);
  expect(eqNumberFromOrder(1, 2)).toBe(false);
});

test("createEqArrayLike", () => {
  const eqArrayNumberFromEq = createEqArrayLike(eqNumber);
  const array = [1, 2, 3];
  expect(eqArrayNumberFromEq(array, array)).toBe(true);
  expect(eqArrayNumberFromEq([1, 2, 3], [1, 2])).toBe(false);
  expect(eqArrayNumberFromEq([1, 2, 3], [1, 2, 3])).toBe(true);
  expect(eqArrayNumberFromEq([1, 2, 3], [1, 2, 4])).toBe(false);
});

test("eqUint8Array", () => {
  expectTypeOf(eqUint8Array).toEqualTypeOf<Eq<Uint8Array>>();
  expect(eqUint8Array).toBe(eqArrayNumber);
  expect(eqUint8Array(new Uint8Array([1, 2]), new Uint8Array([1, 2]))).toBe(
    true,
  );
  expect(eqUint8Array(new Uint8Array([1, 2]), new Uint8Array([1, 3]))).toBe(
    false,
  );
  expect(eqUint8Array(new Uint8Array([1]), new Uint8Array([1, 2]))).toBe(false);
});

test("createEqObject", () => {
  const eqObjectNumber = createEqObject({ a: eqNumber });
  const object = { a: 1 };
  expect(eqObjectNumber(object, object)).toBe(true);
  expect(eqObjectNumber({ a: 1 }, { a: 1 })).toBe(true);
  expect(eqObjectNumber({ a: 1 }, { a: 2 })).toBe(false);
});

test("eqData", () => {
  const unsafeEqData = eqData as unknown as (
    actual: unknown,
    expected: unknown,
  ) => boolean;
  const emptyData: Data = {};

  expect(eqData(NaN, NaN)).toBe(true);
  expect(eqData(0, -0)).toBe(true);
  expect(eqData(1, 2)).toBe(false);
  expect(eqData(1, "1")).toBe(false);
  expect(eqData(null, emptyData)).toBe(false);
  expect(eqData(1n, 1n)).toBe(true);

  const sameReference = { value: 1 };
  expect(eqData(sameReference, sameReference)).toBe(true);
  expect(eqData({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
  expect(eqData({ a: 1 }, { a: 2 })).toBe(false);
  expect(eqData({ a: 1 }, { b: 1 })).toBe(false);
  expect(eqData(emptyData, { value: undefined })).toBe(false);

  const nullPrototype = Object.assign(Object.create(null) as object, {
    value: 1,
  });
  expect(eqData({ value: 1 }, nullPrototype)).toBe(true);

  expect(eqData([1, 2], [1, 2])).toBe(true);
  expect(eqData([1, 2], [2, 1])).toBe(false);
  expect(eqData([1], [1, 2])).toBe(false);
  expect(eqData([1], { 0: 1 })).toBe(false);

  expect(eqData(new Date(0), new Date(0))).toBe(true);
  expect(eqData(new Date(0), new Date(1))).toBe(false);
  expect(eqData(new Date(0), emptyData)).toBe(false);

  expect(eqData(new Uint8Array([1, 2]), new Uint8Array([1, 2]))).toBe(true);
  expect(eqData(new Uint8Array([1, 2]), new Uint8Array([1, 3]))).toBe(false);
  expect(eqData(new Uint8Array([1]), new Uint8Array([1, 2]))).toBe(false);

  expect(unsafeEqData(new ArrayBuffer(1), new ArrayBuffer(1))).toBe(false);

  expect(eqData(new Set([1, 2]), new Set([2, 1]))).toBe(true);
  expect(
    eqData(
      new Set([{ value: 1 }, { value: 2 }]),
      new Set([{ value: 2 }, { value: 1 }]),
    ),
  ).toBe(true);
  expect(eqData(new Set([{ value: 1 }]), new Set([{ value: 2 }]))).toBe(false);
  expect(eqData(new Set([1]), new Set([1, 2]))).toBe(false);

  expect(
    unsafeEqData(
      Object.assign(new Set([1]), { metadata: true }),
      Object.assign(new Set([1]), { metadata: true }),
    ),
  ).toBe(false);

  expect(
    eqData(
      new Map<Data, Data>([[{ id: 1 }, { name: "Ada" }]]),
      new Map<Data, Data>([[{ id: 1 }, { name: "Ada" }]]),
    ),
  ).toBe(true);
  expect(
    eqData(
      new Map<Data, Data>([
        [1, "one"],
        [2, "two"],
      ]),
      new Map<Data, Data>([
        [2, "two"],
        [1, "one"],
      ]),
    ),
  ).toBe(true);
  expect(eqData(new Map([[1, "one"]]), new Map([[1, "two"]]))).toBe(false);
  expect(eqData(new Map([[1, "one"]]), new Map([[2, "one"]]))).toBe(false);
  expect(eqData(new Map([[1, "one"]]), new Map<number, string>())).toBe(false);
  expect(
    eqData(
      new Map<Data, Data>([
        [{ id: 1 }, "one"],
        [{ id: 1 }, "two"],
      ]),
      new Map<Data, Data>([
        [{ id: 1 }, "two"],
        [{ id: 1 }, "one"],
      ]),
    ),
  ).toBe(true);

  expect(
    unsafeEqData(
      Object.assign(new Map([[1, "one"]]), { metadata: true }),
      Object.assign(new Map([[1, "one"]]), { metadata: true }),
    ),
  ).toBe(false);

  const sparse: Array<undefined> = [];
  sparse.length = 1;
  expect(unsafeEqData(sparse, [undefined])).toBe(false);

  const arrayAccessor: Array<number> = [];
  Object.defineProperty(arrayAccessor, 0, {
    enumerable: true,
    get: () => 1,
  });
  arrayAccessor.length = 1;
  expect(unsafeEqData(arrayAccessor, [1])).toBe(false);

  let reads = 0;
  const accessor = Object.defineProperty({}, "value", {
    enumerable: true,
    get: () => {
      reads++;
      return 1;
    },
  });
  expect(unsafeEqData(accessor, { value: 1 })).toBe(false);
  expect(reads).toBe(0);
  expect(
    unsafeEqData(
      Object.defineProperty({}, "hidden", { value: 1 }),
      Object.defineProperty({}, "hidden", { value: 1 }),
    ),
  ).toBe(false);
  const symbolKey = Symbol("value");
  expect(unsafeEqData({ [symbolKey]: 1 }, { [symbolKey]: 1 })).toBe(false);
  expect(unsafeEqData([1], Object.assign([1], { extra: true }))).toBe(false);

  class Model {
    readonly value = 1;
  }
  expect(unsafeEqData(new Model(), new Model())).toBe(false);
  class NullBase extends null {}
  const nullBasePrototype = NullBase.prototype;
  expect(
    unsafeEqData(
      Object.create(nullBasePrototype),
      Object.create(nullBasePrototype),
    ),
  ).toBe(false);
  expect(unsafeEqData(/value/u, /value/u)).toBe(false);

  interface CircularData {
    readonly value: number;
    self?: CircularData;
  }
  const circularOne: CircularData = { value: 1 };
  circularOne.self = circularOne;
  const circularTwo: CircularData = { value: 1 };
  circularTwo.self = circularTwo;
  expect(eqData(circularOne, circularTwo)).toBe(true);

  const circularDifferent: CircularData = { value: 2 };
  circularDifferent.self = circularDifferent;
  expect(eqData(circularOne, circularDifferent)).toBe(false);

  const circularSetOne = new Set<Data>();
  circularSetOne.add(circularSetOne);
  const circularSetTwo = new Set<Data>();
  circularSetTwo.add(circularSetTwo);
  expect(eqData(circularSetOne, circularSetTwo)).toBe(true);

  const backtrackingSetOne = new Set<Data>();
  backtrackingSetOne.add(backtrackingSetOne);
  backtrackingSetOne.add({ value: 1 });
  const backtrackingSetTwo = new Set<Data>();
  backtrackingSetTwo.add({ value: 1 });
  backtrackingSetTwo.add(backtrackingSetTwo);
  expect(eqData(backtrackingSetOne, backtrackingSetTwo)).toBe(true);

  const circularMapOne = new Map<Data, Data>();
  circularMapOne.set(circularMapOne, circularSetOne);
  const circularMapTwo = new Map<Data, Data>();
  circularMapTwo.set(circularMapTwo, circularSetTwo);
  expect(eqData(circularMapOne, circularMapTwo)).toBe(true);

  const shared: { readonly value?: number } = {};
  const otherEmptyData: Data = {};
  expect(
    eqData(
      { first: shared, second: shared },
      { first: emptyData, second: otherEmptyData },
    ),
  ).toBe(true);

  interface DeepData {
    next?: DeepData;
  }
  const deepOne: DeepData = {};
  const deepTwo: DeepData = {};
  let currentOne = deepOne;
  let currentTwo = deepTwo;
  for (let index = 0; index < 10_000; index++) {
    const nextOne: DeepData = {};
    const nextTwo: DeepData = {};
    currentOne.next = nextOne;
    currentTwo.next = nextTwo;
    currentOne = nextOne;
    currentTwo = nextTwo;
  }
  expect(eqData(deepOne, deepTwo)).toBe(true);

  interface Service {
    readonly run: () => void;
  }
  const service: Service = { run: () => undefined };
  const broadObject: NonNullable<unknown> = new WeakMap();
  const compileTimeAssertions = () => {
    // @ts-expect-error ⛔ eqData error: Actual and expected values must consist only of Data.
    eqData(service, service);
    // @ts-expect-error ⛔ eqData error: Actual and expected values must consist only of Data.
    eqData(broadObject, broadObject);
  };
  expect(compileTimeAssertions).toBeTypeOf("function");
});

test("eqData compares deeply nested Set and Map data", () => {
  type Shape = "Set" | "MapKey" | "MapValue" | "Mixed";

  const setupNestedData = (shape: Shape, leaf: Data): Data => {
    let value = leaf;

    for (let index = 0; index < 10_000; index++) {
      const currentShape =
        shape === "Mixed" ? (index % 2 === 0 ? "Set" : "MapValue") : shape;

      if (currentShape === "Set") {
        value = new Set([value]);
      } else if (currentShape === "MapKey") {
        value = new Map([[value, null]]);
      } else {
        value = new Map([[null, value]]);
      }
    }

    return value;
  };

  for (const shape of ["Set", "MapKey", "MapValue", "Mixed"] as const) {
    const actual = setupNestedData(shape, 0);

    expect(eqData(actual, setupNestedData(shape, 0))).toBe(true);
    expect(eqData(actual, setupNestedData(shape, 1))).toBe(false);
  }
});

test("JSON equality", () => {
  expect(eqJsonValue).toBe(eqData);
  expect(eqJsonValueInput).toBe(eqData);

  const first: JsonValue = { profile: { name: "Ada" } };
  const second: JsonValue = { profile: { name: "Ada" } };
  const different: JsonValue = { profile: { name: "Grace" } };
  expect(eqJsonValue(first, second)).toBe(true);
  expect(eqJsonValue(first, different)).toBe(false);

  const input: JsonValueInput = { value: Number.NaN };
  expect(eqJsonValueInput(input, { value: Number.NaN })).toBe(true);
});
