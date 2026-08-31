import { test } from "node:test";
import { assertEqual, assertFalse, assertSame, assertTrue } from "./Assert.ts";

import {
  createEqArrayLike,
  createEqObject,
  eqArrayNumber,
  eqArraySameValue,
  eqData,
  eqFromOrder,
  eqNumber,
  eqSameValue,
  eqSameValueZero,
  eqUint8Array,
  type Eq,
} from "./Eq.ts";
import { orderNumber } from "./Order.ts";
import { assertType, type Data } from "./Type.ts";

test("eqSameValue", () => {
  assertTrue(eqSameValue(1, 1));
  assertTrue(eqSameValue(NaN, NaN));
  assertFalse(eqSameValue(0, -0));

  const object = {};
  assertTrue(eqSameValue(object, object));
  assertFalse(eqSameValue({}, {}));
});

test("eqSameValueZero", () => {
  assertTrue(eqSameValueZero(NaN, NaN));
  assertTrue(eqSameValueZero(0, -0));
  assertFalse(eqSameValueZero(1, 2));

  const object = {};
  assertTrue(eqSameValueZero(object, object));
  assertFalse(eqSameValueZero({}, {}));
});

test("eqNumber", () => {
  assertTrue(eqNumber(NaN, NaN));
  assertFalse(eqNumber(0, -0));
});

test("eqFromOrder", () => {
  const eqNumberFromOrder = eqFromOrder(orderNumber);
  assertTrue(eqNumberFromOrder(1, 1));
  assertFalse(eqNumberFromOrder(1, 2));
});

test("createEqArrayLike", () => {
  const eqArrayNumberFromEq = createEqArrayLike(eqNumber);
  const array = [1, 2, 3];
  assertTrue(eqArrayNumberFromEq(array, array));
  assertFalse(eqArrayNumberFromEq([1, 2, 3], [1, 2]));
  assertTrue(eqArrayNumberFromEq([1, 2, 3], [1, 2, 3]));
  assertFalse(eqArrayNumberFromEq([1, 2, 3], [1, 2, 4]));
});

test("eqArraySameValue", () => {
  assertTrue(eqArraySameValue([NaN], [NaN]));
  assertFalse(eqArraySameValue([0], [-0]));

  const object = {};
  assertTrue(eqArraySameValue([object], [object]));
  assertFalse(eqArraySameValue([{}], [{}]));
});

test("eqUint8Array", () => {
  assertType<typeof eqUint8Array, Eq<Uint8Array>>();
  assertSame(eqUint8Array, eqArrayNumber);
  assertTrue(eqUint8Array(new Uint8Array([1, 2]), new Uint8Array([1, 2])));
  assertFalse(eqUint8Array(new Uint8Array([1, 2]), new Uint8Array([1, 3])));
  assertFalse(eqUint8Array(new Uint8Array([1]), new Uint8Array([1, 2])));
});

test("createEqObject", () => {
  const eqObjectNumber = createEqObject({ a: eqNumber });
  const object = { a: 1 };
  assertTrue(eqObjectNumber(object, object));
  assertTrue(eqObjectNumber({ a: 1 }, { a: 1 }));
  assertFalse(eqObjectNumber({ a: 1 }, { a: 2 }));
});

test("eqData", () => {
  const unsafeEqData = eqData as unknown as (
    actual: unknown,
    expected: unknown,
  ) => boolean;
  const emptyData: Data = {};

  assertTrue(eqData(NaN, NaN));
  assertFalse(eqData(0, -0));
  assertFalse(eqData({ value: 0 }, { value: -0 }));
  assertFalse(eqData(1, 2));
  assertFalse(eqData(1, "1"));
  assertFalse(eqData(null, emptyData));
  assertTrue(eqData(1n, 1n));

  const sameReference = { value: 1 };
  assertTrue(eqData(sameReference, sameReference));
  assertTrue(eqData({ a: 1, b: 2 }, { b: 2, a: 1 }));
  assertFalse(eqData({ a: 1 }, { a: 2 }));
  assertFalse(eqData({ a: 1 }, { b: 1 }));
  assertFalse(eqData(emptyData, { value: undefined }));

  const nullPrototype = Object.assign(Object.create(null) as object, {
    value: 1,
  });
  assertTrue(eqData({ value: 1 }, nullPrototype));

  assertTrue(eqData([1, 2], [1, 2]));
  assertFalse(eqData([1, 2], [2, 1]));
  assertFalse(eqData([1], [1, 2]));
  assertFalse(eqData([1], { 0: 1 }));

  assertTrue(eqData(new Date(0), new Date(0)));
  assertFalse(eqData(new Date(0), new Date(1)));
  assertFalse(eqData(new Date(0), emptyData));

  assertTrue(eqData(new Uint8Array([1, 2]), new Uint8Array([1, 2])));
  assertFalse(eqData(new Uint8Array([1, 2]), new Uint8Array([1, 3])));
  assertFalse(eqData(new Uint8Array([1]), new Uint8Array([1, 2])));

  assertFalse(unsafeEqData(new ArrayBuffer(1), new ArrayBuffer(1)));

  assertTrue(eqData(new Set([1, 2]), new Set([2, 1])));
  assertTrue(
    eqData(
      new Set([{ value: 1 }, { value: 2 }]),
      new Set([{ value: 2 }, { value: 1 }]),
    ),
  );
  assertFalse(eqData(new Set([{ value: 1 }]), new Set([{ value: 2 }])));
  assertFalse(eqData(new Set([1]), new Set([1, 2])));

  assertFalse(
    unsafeEqData(
      Object.assign(new Set([1]), { metadata: true }),
      Object.assign(new Set([1]), { metadata: true }),
    ),
  );

  assertTrue(
    eqData(
      new Map<Data, Data>([[{ id: 1 }, { name: "Ada" }]]),
      new Map<Data, Data>([[{ id: 1 }, { name: "Ada" }]]),
    ),
  );
  assertTrue(
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
  );
  assertFalse(eqData(new Map([[1, "one"]]), new Map([[1, "two"]])));
  assertFalse(eqData(new Map([[1, "one"]]), new Map([[2, "one"]])));
  assertFalse(eqData(new Map([[1, "one"]]), new Map<number, string>()));
  assertTrue(
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
  );

  assertFalse(
    unsafeEqData(
      Object.assign(new Map([[1, "one"]]), { metadata: true }),
      Object.assign(new Map([[1, "one"]]), { metadata: true }),
    ),
  );

  const sparse: Array<undefined> = [];
  sparse.length = 1;
  assertFalse(unsafeEqData(sparse, [undefined]));

  const arrayAccessor: Array<number> = [];
  Object.defineProperty(arrayAccessor, 0, {
    enumerable: true,
    get: () => 1,
  });
  arrayAccessor.length = 1;
  assertFalse(unsafeEqData(arrayAccessor, [1]));

  let reads = 0;
  const accessor = Object.defineProperty({}, "value", {
    enumerable: true,
    get: () => {
      reads++;
      return 1;
    },
  });
  assertFalse(unsafeEqData(accessor, { value: 1 }));
  assertEqual(reads, 0);
  assertFalse(
    unsafeEqData(
      Object.defineProperty({}, "hidden", { value: 1 }),
      Object.defineProperty({}, "hidden", { value: 1 }),
    ),
  );
  const symbolKey = Symbol("value");
  assertFalse(unsafeEqData({ [symbolKey]: 1 }, { [symbolKey]: 1 }));
  assertFalse(unsafeEqData([1], Object.assign([1], { extra: true })));

  class Model {
    readonly value = 1;
  }
  assertFalse(unsafeEqData(new Model(), new Model()));
  class NullBase extends null {}
  const nullBasePrototype = NullBase.prototype;
  assertFalse(
    unsafeEqData(
      Object.create(nullBasePrototype),
      Object.create(nullBasePrototype),
    ),
  );
  assertFalse(unsafeEqData(/value/u, /value/u));

  interface CircularData {
    readonly value: number;
    self?: CircularData;
  }
  const circularOne: CircularData = { value: 1 };
  circularOne.self = circularOne;
  const circularTwo: CircularData = { value: 1 };
  circularTwo.self = circularTwo;
  assertTrue(eqData(circularOne, circularTwo));

  const circularDifferent: CircularData = { value: 2 };
  circularDifferent.self = circularDifferent;
  assertFalse(eqData(circularOne, circularDifferent));

  const circularSetOne = new Set<Data>();
  circularSetOne.add(circularSetOne);
  const circularSetTwo = new Set<Data>();
  circularSetTwo.add(circularSetTwo);
  assertTrue(eqData(circularSetOne, circularSetTwo));

  const backtrackingSetOne = new Set<Data>();
  backtrackingSetOne.add(backtrackingSetOne);
  backtrackingSetOne.add({ value: 1 });
  const backtrackingSetTwo = new Set<Data>();
  backtrackingSetTwo.add({ value: 1 });
  backtrackingSetTwo.add(backtrackingSetTwo);
  assertTrue(eqData(backtrackingSetOne, backtrackingSetTwo));

  const circularMapOne = new Map<Data, Data>();
  circularMapOne.set(circularMapOne, circularSetOne);
  const circularMapTwo = new Map<Data, Data>();
  circularMapTwo.set(circularMapTwo, circularSetTwo);
  assertTrue(eqData(circularMapOne, circularMapTwo));

  const shared: { readonly value?: number } = {};
  const otherEmptyData: Data = {};
  assertTrue(
    eqData(
      { first: shared, second: shared },
      { first: emptyData, second: otherEmptyData },
    ),
  );

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
  assertTrue(eqData(deepOne, deepTwo));

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
  assertEqual(typeof compileTimeAssertions, "function");
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

    assertTrue(eqData(actual, setupNestedData(shape, 0)));
    assertFalse(eqData(actual, setupNestedData(shape, 1)));
  }
});
