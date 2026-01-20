import { describe, expect, expectTypeOf, test } from "vitest";
import {
  fromNullable,
  type InferOption,
  isNone,
  isSome,
  none,
  type None,
  type Option,
  some,
  type Some,
} from "../src/Option.js";

test("some creates Some", () => {
  const option = some(42);
  expect(isSome(option)).toBe(true);
  if (isSome(option)) {
    expect(option.value).toBe(42);
    expectTypeOf(option).toEqualTypeOf<Some<number>>();
  }
});

test("none is None", () => {
  expect(isNone(none)).toBe(true);
  expectTypeOf(none).toEqualTypeOf<None>();
});

test("isSome narrows type", () => {
  const option: Option<string> = some("test");
  if (isSome(option)) {
    expectTypeOf(option).toEqualTypeOf<Some<string>>();
    expectTypeOf(option.value).toEqualTypeOf<string>();
  }
});

test("isNone narrows type", () => {
  const option: Option<string> = none;
  if (isNone(option)) {
    expectTypeOf(option).toEqualTypeOf<None>();
  }
});

test("fromNullable maps null and undefined to none", () => {
  expect(isNone(fromNullable(null))).toBe(true);
  expect(isNone(fromNullable(undefined))).toBe(true);
  expectTypeOf(fromNullable(null)).toEqualTypeOf<Option<never>>();
});

test("fromNullable maps values to some", () => {
  const option = fromNullable("value");
  expect(isSome(option)).toBe(true);
  if (isSome(option)) {
    expect(option.value).toBe("value");
  }
  expectTypeOf(option).toEqualTypeOf<Option<string>>();
});

test("fromNullable strips null and undefined from type", () => {
  const value: string | null | undefined = "test";
  const option = fromNullable(value);
  expectTypeOf(option).toEqualTypeOf<Option<string>>();
});

describe("InferOption", () => {
  test("extracts value type from Option", () => {
    type MyOption = Option<string>;
    expectTypeOf<InferOption<MyOption>>().toEqualTypeOf<string>();
  });

  test("extracts value type from Some", () => {
    type MySome = Some<number>;
    expectTypeOf<InferOption<MySome>>().toEqualTypeOf<number>();
  });

  test("returns never for None", () => {
    expectTypeOf<InferOption<None>>().toEqualTypeOf<never>();
  });

  test("works at runtime", () => {
    type MyOption = Option<string>;
    const value: InferOption<MyOption> = "hello";
    expect(value).toBe("hello");
  });
});

describe("examples", () => {
  test("cache that can store null and undefined", () => {
    const cache = new Map<string, Option<unknown>>();

    const get = (key: string): Option<unknown> => cache.get(key) ?? none;

    cache.set("a", some(null));
    cache.set("b", some(undefined));

    expect(isSome(get("a"))).toBe(true);
    expect(isSome(get("b"))).toBe(true);
    expect(isNone(get("c"))).toBe(true);

    const a = get("a");
    if (isSome(a)) {
      expect(a.value).toBe(null);
    }
    const b = get("b");
    if (isSome(b)) {
      expect(b.value).toBe(undefined);
    }
  });
});
