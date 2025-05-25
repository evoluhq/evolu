import { expect, test } from "vitest";
import {
  createEqArrayLike,
  createEqObject,
  eqJsonValueInput,
  eqNumber,
} from "../src/Eq.js";
import { JsonValueInput } from "../src/Type.js";

test("createEqArrayLike", () => {
  const eqArrayNumber = createEqArrayLike(eqNumber);
  expect(eqArrayNumber([1, 2, 3], [1, 2, 3])).toBe(true);
  expect(eqArrayNumber([1, 2, 3], [1, 2, 4])).toBe(false);
});

test("createEqObject", () => {
  const eqObjectNumber = createEqObject({ a: eqNumber });
  expect(eqObjectNumber({ a: 1 }, { a: 1 })).toBe(true);
  expect(eqObjectNumber({ a: 1 }, { a: 2 })).toBe(false);
});

test("eqJsonValueInput", () => {
  expect(eqJsonValueInput(42, 42)).toBe(true);
  expect(eqJsonValueInput(-0, -0)).toBe(true);
  expect(eqJsonValueInput(+0, +0)).toBe(true);
  expect(eqJsonValueInput(42, 43)).toBe(false);
  expect(eqJsonValueInput(0, -0)).toBe(true); // JSON treats -0 and +0 as equal
  expect(eqJsonValueInput(-0, +0)).toBe(true); // JSON treats -0 and +0 as equal
  expect(eqJsonValueInput("hello", "hello")).toBe(true);
  expect(eqJsonValueInput("hello", "world")).toBe(false);
  expect(eqJsonValueInput(true, true)).toBe(true);
  expect(eqJsonValueInput(false, false)).toBe(true);
  expect(eqJsonValueInput(true, false)).toBe(false);
  expect(eqJsonValueInput(null, null)).toBe(true);

  // NaN vs. NaN
  expect(eqJsonValueInput(NaN, NaN)).toBe(true);

  // NaN vs. Number
  expect(eqJsonValueInput(NaN, 0)).toBe(false);
  expect(eqJsonValueInput(NaN, 42)).toBe(false);
  expect(eqJsonValueInput([1, 2, 3], [1, 2, 3])).toBe(true);
  expect(eqJsonValueInput([], [])).toBe(true);
  expect(eqJsonValueInput(["a", "b"], ["a", "b"])).toBe(true);
  expect(eqJsonValueInput([1, 2, 3], [1, 2])).toBe(false);
  expect(eqJsonValueInput([], [1])).toBe(false);
  expect(eqJsonValueInput([1, 2, 3], [1, 2, 4])).toBe(false);
  expect(eqJsonValueInput(["a", "b"], ["a", "c"])).toBe(false);
  expect(eqJsonValueInput([1, "2", true], [1, "2", false])).toBe(false);

  // Arrays with Circular References
  const arr1: Array<JsonValueInput> = [1, 2, 3];
  arr1.push(arr1);
  const arr2: Array<JsonValueInput> = [1, 2, 3];
  arr2.push(arr2);
  expect(eqJsonValueInput(arr1, arr2)).toBe(true);
  const objA: JsonValueInput = {
    name: "Alice",
    hobbies: ["reading", "hiking"],
  };
  const objB: JsonValueInput = {
    name: "Alice",
    hobbies: ["reading", "hiking"],
  };
  expect(eqJsonValueInput(objA, objB)).toBe(true);
  const objC: JsonValueInput = { name: "Bob", hobbies: ["gaming"] };
  expect(eqJsonValueInput(objA, objC)).toBe(false);
  const objD: JsonValueInput = { name: "Alice", age: 30 };
  expect(eqJsonValueInput(objA, objD)).toBe(false);
  const objE: JsonValueInput = {
    name: "Alice",
    hobbies: ["reading", "swimming"],
  };
  expect(eqJsonValueInput(objA, objE)).toBe(false);
  const nestedA: JsonValueInput = { a: { b: { c: [1, 2, { d: 4 }] } } };
  const nestedB: JsonValueInput = { a: { b: { c: [1, 2, { d: 4 }] } } };
  const nestedC: JsonValueInput = { a: { b: { c: [1, 2, { d: 5 }] } } };
  expect(eqJsonValueInput(nestedA, nestedB)).toBe(true);
  expect(eqJsonValueInput(nestedA, nestedC)).toBe(false);
  const arr4: JsonValueInput = [1, 2, 3];
  const objF: JsonValueInput = { 0: 1, 1: 2, 2: 3 };
  expect(eqJsonValueInput(arr4, objF)).toBe(false);
  // Circular References in Objects
  const aObj: JsonValueInput = { name: "Alice" };
  const bObj: JsonValueInput = { name: "Alice" };
  // Creating circular references
  // @ts-expect-error Yes, we know it's readonly.
  aObj.self = aObj;
  // @ts-expect-error Yes, we know it's readonly.
  bObj.self = bObj;
  expect(eqJsonValueInput(aObj, bObj)).toBe(true);
  const cObj: JsonValueInput = { name: "Alice" };
  // @ts-expect-error Yes, we know it's readonly.
  cObj.self = aObj;
  expect(eqJsonValueInput(aObj, cObj)).toBe(true);
  expect(eqJsonValueInput("42", 42)).toBe(false);
  expect(eqJsonValueInput(true, "true")).toBe(false);

  // Nested Structures with Circular References
  const objG: JsonValueInput = { a: 1 };
  // @ts-expect-error Yes, we know it's readonly.
  objG.self = { b: objG };
  const objH: JsonValueInput = { a: 1 };
  // @ts-expect-error Yes, we know it's readonly.
  objH.self = { b: objH };
  expect(eqJsonValueInput(objG, objH)).toBe(true);
  const objI: JsonValueInput = { a: 1 };
  // @ts-expect-error Yes, we know it's readonly.
  objI.self = { b: { a: 1 } };
  expect(eqJsonValueInput(objG, objI)).toBe(false);
});
