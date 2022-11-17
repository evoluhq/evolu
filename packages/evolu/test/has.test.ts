import { expect, expectTypeOf, test } from "vitest";
import { has } from "../src/has";

test("has", () => {
  interface Person {
    readonly id: number;
    readonly name: string | null;
  }

  const a1: readonly Person[] = [{ id: 1, name: "a" }];
  expectTypeOf(a1[0].name).toBeNullable();
  expect(a1.filter(has(["name"])).length).toBe(1);

  const a2: readonly Person[] = [
    { id: 1, name: "a" },
    { id: 2, name: null },
  ];
  const filtered = a2.filter(has(["name"]));
  expectTypeOf(filtered[0].name).toBeString();
  expect(filtered.length).toBe(1);
});
