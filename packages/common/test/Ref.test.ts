import { describe, expect, test } from "vitest";
import { eqStrict } from "../src/Eq.js";
import { createRef } from "../src/Ref.js";

describe("createRef", () => {
  test("get returns initial state", () => {
    const ref = createRef(42);
    expect(ref.get()).toBe(42);
  });

  describe("set", () => {
    test("updates state", () => {
      const ref = createRef(0);
      ref.set(1);
      expect(ref.get()).toBe(1);
    });

    test("returns true when state changes", () => {
      const ref = createRef(0);
      expect(ref.set(1)).toBe(true);
    });

    test("returns true even for same value without eq", () => {
      const ref = createRef(1);
      expect(ref.set(1)).toBe(true);
    });

    test("with eq returns false for equal values", () => {
      const ref = createRef(1, eqStrict);
      expect(ref.set(1)).toBe(false);
      expect(ref.get()).toBe(1);
    });

    test("with eq returns true for different values", () => {
      const ref = createRef(1, eqStrict);
      expect(ref.set(2)).toBe(true);
      expect(ref.get()).toBe(2);
    });
  });

  describe("modify", () => {
    test("updates state", () => {
      const ref = createRef(0);
      ref.modify((n) => n + 1);
      expect(ref.get()).toBe(1);
    });

    test("returns true when state changes", () => {
      const ref = createRef(0);
      expect(ref.modify((n) => n + 1)).toBe(true);
    });

    test("with eq returns false for equal values", () => {
      const ref = createRef(1, eqStrict);
      expect(ref.modify((n) => n)).toBe(false);
    });

    test("with eq returns true for different values", () => {
      const ref = createRef(1, eqStrict);
      expect(ref.modify((n) => n + 1)).toBe(true);
      expect(ref.get()).toBe(2);
    });
  });

  test("with custom eq", () => {
    const eqModulo10 = (a: number, b: number) => a % 10 === b % 10;
    const ref = createRef(5 as number, eqModulo10);

    expect(ref.set(15)).toBe(false); // 5 % 10 === 15 % 10
    expect(ref.get()).toBe(5);

    expect(ref.set(16)).toBe(true); // 5 % 10 !== 16 % 10
    expect(ref.get()).toBe(16);
  });
});
