import { describe, it, test } from "node:test";
import { assertEqual, assertSame, assertTrue } from "./Assert.ts";

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
} from "./Option.ts";
import { assertType } from "./Type.ts";

test("some creates Some", () => {
  assertEqual(some(42), { type: "Some", value: 42 });
});

test("none is None", () => {
  assertEqual(none, { type: "None" });
});

test("isSome narrows type", () => {
  const option: Option<string> = some("test");
  if (isSome(option)) {
    assertType<typeof option, Some<string>>();
    assertType<typeof option.value, string>();
  }
});

test("isNone narrows type", () => {
  const option: Option<string> = none;
  if (isNone(option)) {
    assertType<typeof option, None>();
  }
});

test("fromNullable maps null and undefined to none", () => {
  assertTrue(isNone(fromNullable(null)));
  assertTrue(isNone(fromNullable(undefined)));
  {
    const actual = fromNullable(null);
    assertType<typeof actual, Option<never>>();
  }
});

test("fromNullable maps values to some", () => {
  const option = fromNullable("value");

  assertEqual(option, some("value"));
});

test("fromNullable strips null and undefined from type", () => {
  const value: string | null | undefined = "test";
  const option = fromNullable(value);
  assertType<typeof option, Option<string>>();
});

describe("InferOption", () => {
  it("extracts value type from Option", () => {
    type MyOption = Option<string>;
    assertType<InferOption<MyOption>, string>();
  });

  it("extracts value type from Some", () => {
    type MySome = Some<number>;
    assertType<InferOption<MySome>, number>();
  });

  it("returns never for None", () => {
    assertType<InferOption<None>, never>();
  });

  it("works at runtime", () => {
    type MyOption = Option<string>;
    const value: InferOption<MyOption> = "hello";
    assertEqual(value, "hello");
  });
});

describe("examples", () => {
  it("cache that can store null and undefined", () => {
    const cache = new Map<string, Option<unknown>>();

    const get = (key: string): Option<unknown> => cache.get(key) ?? none;

    cache.set("a", some(null));
    cache.set("b", some(undefined));

    assertTrue(isSome(get("a")));
    assertTrue(isSome(get("b")));
    assertTrue(isNone(get("c")));

    const a = get("a");
    assertTrue(isSome(a));
    assertSame(a.value, null);

    const b = get("b");
    assertTrue(isSome(b));
    assertSame(b.value, undefined);
  });
});
