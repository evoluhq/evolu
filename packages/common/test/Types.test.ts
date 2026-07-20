import { expect, expectTypeOf, test } from "vitest";
import {
  type Callback,
  type CallbackWithTeardown,
  type Predicate,
  type PredicateWithIndex,
  type Refinement,
  type RefinementWithIndex,
  type NullablePartial,
  type Literal,
  type WidenLiteral,
  type Writable,
  type Simplify,
  type PartialProp,
  type Awaitable,
  isPromiseLike,
  type Digit,
  type Digit1To9,
  type Digit1To6,
  type Digit1To23,
  type Digit1To51,
  type Digit1To99,
  type Digit1To59,
  type Int1To99,
  type Int1To100,
  type NumberFromString,
  type IsUnion,
  type UnionToIntersection,
  type ParameterIntersection,
  type DistributiveOmit,
} from "../src/Types.ts";

test("Callback", () => {
  expectTypeOf<Callback<string>>().toEqualTypeOf<(value: string) => void>();
});

test("CallbackWithTeardown", () => {
  expectTypeOf<CallbackWithTeardown<string>>().toEqualTypeOf<
    (value: string) => void | (() => void)
  >();
});

test("Predicate", () => {
  expectTypeOf<Predicate<string>>().toEqualTypeOf<(value: string) => boolean>();
});

test("PredicateWithIndex", () => {
  expectTypeOf<PredicateWithIndex<string>>().toEqualTypeOf<
    (value: string, index: number) => boolean
  >();
});

test("Refinement", () => {
  interface Animal {
    readonly name: string;
  }
  interface Dog extends Animal {
    readonly breed: string;
  }

  expectTypeOf<Refinement<Animal, Dog>>().toEqualTypeOf<
    (value: Animal) => value is Dog
  >();
});

test("RefinementWithIndex", () => {
  interface Animal {
    readonly name: string;
  }
  interface Dog extends Animal {
    readonly breed: string;
  }

  expectTypeOf<RefinementWithIndex<Animal, Dog>>().toEqualTypeOf<
    (value: Animal, index: number) => value is Dog
  >();
});

test("NullablePartial", () => {
  expectTypeOf<
    NullablePartial<{
      readonly required: string;
      readonly nullable: string | null;
      readonly nullOnly: null;
      readonly existingOptional?: number;
    }>
  >().toEqualTypeOf<{
    readonly required: string;
    readonly nullable?: string | null;
    readonly nullOnly?: null;
    readonly existingOptional?: number;
  }>();
});

test("Literal", () => {
  expectTypeOf<Literal>().toEqualTypeOf<
    string | number | bigint | boolean | undefined | null
  >();
});

test("WidenLiteral", () => {
  expectTypeOf<WidenLiteral<"foo">>().toEqualTypeOf<string>();
  expectTypeOf<WidenLiteral<42>>().toEqualTypeOf<number>();
  expectTypeOf<WidenLiteral<42n>>().toEqualTypeOf<bigint>();
  expectTypeOf<WidenLiteral<true>>().toEqualTypeOf<boolean>();
  expectTypeOf<WidenLiteral<undefined>>().toEqualTypeOf<undefined>();
  expectTypeOf<WidenLiteral<null>>().toEqualTypeOf<null>();
});

test("Writable", () => {
  expectTypeOf<
    Writable<{
      readonly value: string;
      readonly nested: { readonly value: number };
    }>
  >().toEqualTypeOf<{
    value: string;
    nested: { readonly value: number };
  }>();
});

test("Simplify", () => {
  expectTypeOf<
    Simplify<{ readonly text: string } & { readonly count: number }>
  >().toEqualTypeOf<{
    readonly text: string;
    readonly count: number;
  }>();
});

test("PartialProp", () => {
  type Actual = PartialProp<
    { readonly required: string; readonly optional: number },
    "optional"
  >;
  interface Expected {
    readonly required: string;
    readonly optional?: number;
  }

  expectTypeOf<Actual>().toExtend<Expected>();
  expectTypeOf<Expected>().toExtend<Actual>();
});

test("Awaitable", () => {
  expectTypeOf<Awaitable<string>>().toEqualTypeOf<
    string | PromiseLike<string>
  >();
});

test("isPromiseLike", () => {
  expect(isPromiseLike(Promise.resolve("value"))).toBe(true);
  expect(isPromiseLike({ then: () => undefined })).toBe(true);
  expect(isPromiseLike({ then: "not a function" })).toBe(false);
  expect(isPromiseLike(null)).toBe(false);
  expect(isPromiseLike(undefined)).toBe(false);
  expect(isPromiseLike("value")).toBe(false);

  const narrow = (value: Awaitable<string>) => {
    if (isPromiseLike(value)) {
      expectTypeOf(value).toEqualTypeOf<PromiseLike<string>>();
    } else {
      expectTypeOf(value).toEqualTypeOf<string>();
    }
  };
  expectTypeOf(narrow).toBeFunction();
});

test("Digit", () => {
  expectTypeOf<Digit>().toEqualTypeOf<
    "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9"
  >();
});

test("Digit1To9", () => {
  expectTypeOf<Digit1To9>().toEqualTypeOf<
    "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9"
  >();
});

test("Digit1To6", () => {
  expectTypeOf<Digit1To6>().toEqualTypeOf<"1" | "2" | "3" | "4" | "5" | "6">();
});

test("Digit1To23", () => {
  expectTypeOf<"1">().toExtend<Digit1To23>();
  expectTypeOf<"9">().toExtend<Digit1To23>();
  expectTypeOf<"10">().toExtend<Digit1To23>();
  expectTypeOf<"19">().toExtend<Digit1To23>();
  expectTypeOf<"20">().toExtend<Digit1To23>();
  expectTypeOf<"23">().toExtend<Digit1To23>();
  expectTypeOf<"0">().not.toExtend<Digit1To23>();
  expectTypeOf<"24">().not.toExtend<Digit1To23>();
  expectTypeOf<"01">().not.toExtend<Digit1To23>();
});

test("Digit1To51", () => {
  expectTypeOf<"1">().toExtend<Digit1To51>();
  expectTypeOf<"9">().toExtend<Digit1To51>();
  expectTypeOf<"10">().toExtend<Digit1To51>();
  expectTypeOf<"49">().toExtend<Digit1To51>();
  expectTypeOf<"50">().toExtend<Digit1To51>();
  expectTypeOf<"51">().toExtend<Digit1To51>();
  expectTypeOf<"0">().not.toExtend<Digit1To51>();
  expectTypeOf<"52">().not.toExtend<Digit1To51>();
  expectTypeOf<"01">().not.toExtend<Digit1To51>();
});

test("Digit1To99", () => {
  expectTypeOf<"1">().toExtend<Digit1To99>();
  expectTypeOf<"9">().toExtend<Digit1To99>();
  expectTypeOf<"10">().toExtend<Digit1To99>();
  expectTypeOf<"50">().toExtend<Digit1To99>();
  expectTypeOf<"99">().toExtend<Digit1To99>();
  expectTypeOf<"0">().not.toExtend<Digit1To99>();
  expectTypeOf<"100">().not.toExtend<Digit1To99>();
  expectTypeOf<"01">().not.toExtend<Digit1To99>();
});

test("Digit1To59", () => {
  expectTypeOf<"1">().toExtend<Digit1To59>();
  expectTypeOf<"9">().toExtend<Digit1To59>();
  expectTypeOf<"10">().toExtend<Digit1To59>();
  expectTypeOf<"50">().toExtend<Digit1To59>();
  expectTypeOf<"59">().toExtend<Digit1To59>();
  expectTypeOf<"0">().not.toExtend<Digit1To59>();
  expectTypeOf<"60">().not.toExtend<Digit1To59>();
  expectTypeOf<"99">().not.toExtend<Digit1To59>();
});

test("Int1To99", () => {
  expectTypeOf<1>().toExtend<Int1To99>();
  expectTypeOf<50>().toExtend<Int1To99>();
  expectTypeOf<99>().toExtend<Int1To99>();
  expectTypeOf<0>().not.toExtend<Int1To99>();
  expectTypeOf<100>().not.toExtend<Int1To99>();
  expectTypeOf<"1">().not.toExtend<Int1To99>();
});

test("Int1To100", () => {
  expectTypeOf<1>().toExtend<Int1To100>();
  expectTypeOf<50>().toExtend<Int1To100>();
  expectTypeOf<100>().toExtend<Int1To100>();
  expectTypeOf<0>().not.toExtend<Int1To100>();
  expectTypeOf<101>().not.toExtend<Int1To100>();
  expectTypeOf<"100">().not.toExtend<Int1To100>();
});

test("NumberFromString", () => {
  expectTypeOf<NumberFromString<"0">>().toEqualTypeOf<0>();
  expectTypeOf<NumberFromString<"42">>().toEqualTypeOf<42>();
  expectTypeOf<NumberFromString<"-1">>().toEqualTypeOf<-1>();
  expectTypeOf<NumberFromString<"1.5">>().toEqualTypeOf<1.5>();
  expectTypeOf<NumberFromString<"value">>().toEqualTypeOf<never>();
});

test("IsUnion", () => {
  expectTypeOf<IsUnion<string>>().toEqualTypeOf<false>();
  expectTypeOf<IsUnion<string | number>>().toEqualTypeOf<true>();
  expectTypeOf<IsUnion<never>>().toEqualTypeOf<false>();
  expectTypeOf<IsUnion<any>>().toEqualTypeOf<false>();
  expectTypeOf<IsUnion<unknown>>().toEqualTypeOf<false>();
  expectTypeOf<IsUnion<boolean>>().toEqualTypeOf<true>();
  expectTypeOf<IsUnion<"a" | "b">>().toEqualTypeOf<true>();
  expectTypeOf<IsUnion<string | "a">>().toEqualTypeOf<false>();
  expectTypeOf<IsUnion<string | never>>().toEqualTypeOf<false>();
  expectTypeOf<
    IsUnion<{ readonly a: string } | { readonly b: number }>
  >().toEqualTypeOf<true>();
  expectTypeOf<IsUnion<[string | number]>>().toEqualTypeOf<false>();
});

test("UnionToIntersection", () => {
  expectTypeOf<
    UnionToIntersection<
      { readonly first: string } | { readonly second: number }
    >
  >().toEqualTypeOf<{ readonly first: string } & { readonly second: number }>();
});

test("ParameterIntersection", () => {
  type First = (value: { readonly first: string }) => void;
  type Second = (value: { readonly second: number }) => void;
  type Unknown = (value: unknown) => void;

  expectTypeOf<ParameterIntersection<First | Second>>().toEqualTypeOf<
    { readonly first: string } & { readonly second: number }
  >();
  expectTypeOf<ParameterIntersection<First | Second | Unknown>>().toEqualTypeOf<
    { readonly first: string } & { readonly second: number }
  >();
});

test("DistributiveOmit", () => {
  type Event =
    | { readonly type: "a"; readonly a: string; readonly shared: number }
    | { readonly type: "b"; readonly b: number; readonly shared: number };

  type Payload = DistributiveOmit<Event, "shared">;

  expectTypeOf<Payload>().toEqualTypeOf<
    | { readonly type: "a"; readonly a: string }
    | { readonly type: "b"; readonly b: number }
  >();
});
