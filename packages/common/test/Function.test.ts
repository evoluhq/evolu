import { describe, expect, expectTypeOf, test } from "vitest";
import {
  lazyFalse,
  lazyNull,
  lazyTrue,
  lazyUndefined,
  lazyVoid,
  exhaustiveCheck,
  identity,
  todo,
} from "../src/Function.js";

describe("exhaustiveCheck", () => {
  test("throws error for unhandled case", () => {
    expect(() => exhaustiveCheck("unexpected" as never)).toThrow(
      'exhaustiveCheck unhandled case: "unexpected"',
    );
  });
});

describe("identity", () => {
  test("returns the same value", () => {
    expect(identity(42)).toBe(42);
    expect(identity("hello")).toBe("hello");
    expect(identity(null)).toBe(null);
  });

  test("preserves object reference", () => {
    const obj = { a: 1 };
    expect(identity(obj)).toBe(obj);
  });

  test("preserves type", () => {
    const num = identity(42);
    expectTypeOf(num).toEqualTypeOf<number>();

    const str = identity("hello");
    expectTypeOf(str).toEqualTypeOf<string>();
  });
});

describe("lazy", () => {
  test("lazyVoid returns void", () => {
    expectTypeOf<ReturnType<typeof lazyVoid>>().toEqualTypeOf<void>();
  });

  test("lazyUndefined returns undefined", () => {
    expectTypeOf<ReturnType<typeof lazyUndefined>>().toEqualTypeOf<undefined>();
  });

  test("lazyNull returns null", () => {
    expect(lazyNull()).toBe(null);
  });

  test("lazyTrue returns true", () => {
    expect(lazyTrue()).toBe(true);
  });

  test("lazyFalse returns false", () => {
    expect(lazyFalse()).toBe(false);
  });
});

describe("todo", () => {
  test("throws", () => {
    expect(() => todo()).toThrow("not yet implemented");
  });

  test("infers type from return type annotation", () => {
    const fn = (): number => todo();
    expectTypeOf(fn).returns.toEqualTypeOf<number>();
  });

  test("accepts explicit generic when no return type", () => {
    const fn = () => todo<string>();
    expectTypeOf(fn).returns.toEqualTypeOf<string>();
  });
});
