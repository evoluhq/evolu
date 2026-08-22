import { expect, expectTypeOf, test } from "vitest";
import {
  type Callback,
  type CallbackWithTeardown,
  type Predicate,
  type PredicateWithIndex,
  type Refinement,
  type RefinementWithIndex,
  type Instance,
  instance,
  isInstance,
  type NullablePartial,
  type Literal,
  type WidenLiteral,
  type Writable,
  type Simplify,
  type PartialProp,
  type Awaitable,
  isPromiseLike,
  type CompileTimeError,
  type IsUnion,
  type KeysOfUnion,
  type UnionToIntersection,
  type ParameterIntersection,
  type DistributiveOmit,
} from "../../../../packages/common/src/Types.ts";

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

test("Instance", () => {
  interface Foo extends Instance<"Foo"> {
    readonly value: string;
  }

  const foo: Foo = {
    ...instance("Foo"),
    value: "value",
  };
  const isFoo = isInstance<Foo>("Foo");

  expectTypeOf(instance("Foo")).toEqualTypeOf<Instance<"Foo">>();
  expect(Object.keys(foo)).toContain("~evolu/instance");
  expect(isFoo(foo)).toBe(true);

  const value: unknown = foo;
  if (isFoo(value)) expectTypeOf(value).toEqualTypeOf<Foo>();

  const compileTimeAssertions = () => {
    // @ts-expect-error The runtime name must match the interface name.
    isInstance<Foo>("Bar");
  };
  expectTypeOf(compileTimeAssertions).toBeFunction();
});

test("isInstance checks its own marker", () => {
  const isFoo = isInstance<Instance<"Foo">>("Foo");
  const nullPrototype = globalThis.Object.assign(
    globalThis.Object.create(null) as object,
    instance("Foo"),
  );

  expect(isFoo(nullPrototype)).toBe(true);
  expect(isFoo(null)).toBe(false);
  expect(isFoo("Foo")).toBe(false);
  expect(isFoo({})).toBe(false);
  expect(isFoo(instance("Bar"))).toBe(false);
  expect(isFoo(globalThis.Object.create(instance("Foo")))).toBe(false);
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
  // oxlint-disable-next-line unicorn/no-thenable -- Intentionally tests a thenable object.
  expect(isPromiseLike({ then: () => undefined })).toBe(true);
  // oxlint-disable-next-line unicorn/no-thenable -- Intentionally tests a non-callable then property.
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

test("CompileTimeError", () => {
  expectTypeOf<
    CompileTimeError<"Type", "Something went wrong">
  >().toEqualTypeOf<"⛔ Type error: Something went wrong">();
});

test("IsUnion", () => {
  expectTypeOf<IsUnion<string>>().toEqualTypeOf<false>();
  expectTypeOf<IsUnion<string | number>>().toEqualTypeOf<true>();
  expectTypeOf<IsUnion<never>>().toEqualTypeOf<false>();
  expectTypeOf<IsUnion<any>>().toEqualTypeOf<false>();
  expectTypeOf<IsUnion<unknown>>().toEqualTypeOf<false>();
  expectTypeOf<IsUnion<boolean>>().toEqualTypeOf<true>();
  expectTypeOf<IsUnion<"a" | "b">>().toEqualTypeOf<true>();
  // oxlint-disable-next-line typescript/no-redundant-type-constituents -- Verifies IsUnion after TypeScript normalizes a string literal into string.
  expectTypeOf<IsUnion<string | "a">>().toEqualTypeOf<false>();
  // oxlint-disable-next-line typescript/no-redundant-type-constituents -- Verifies IsUnion after TypeScript removes never from a union.
  expectTypeOf<IsUnion<string | never>>().toEqualTypeOf<false>();
  expectTypeOf<
    IsUnion<{ readonly a: string } | { readonly b: number }>
  >().toEqualTypeOf<true>();
  expectTypeOf<IsUnion<[string | number]>>().toEqualTypeOf<false>();
});

test("KeysOfUnion", () => {
  expectTypeOf<
    KeysOfUnion<
      | { readonly id: string; readonly name: string }
      | { readonly id: string; readonly count: number }
    >
  >().toEqualTypeOf<"id" | "name" | "count">();
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
