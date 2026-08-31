import { test } from "node:test";
import { assertFalse, assertTrue } from "./Assert.ts";
import { assertType } from "./Type.ts";

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
  type IsSameType,
  type IsUnion,
  type KeysOfUnion,
  type UnionToIntersection,
  type ParameterIntersection,
  type DistributiveOmit,
} from "./Types.ts";

test("Callback", () => {
  assertType<Callback<string>, (value: string) => void>();
});

test("CallbackWithTeardown", () => {
  assertType<
    CallbackWithTeardown<string>,
    (value: string) => void | (() => void)
  >();
});

test("Predicate", () => {
  assertType<Predicate<string>, (value: string) => boolean>();
});

test("PredicateWithIndex", () => {
  assertType<
    PredicateWithIndex<string>,
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

  assertType<Refinement<Animal, Dog>, (value: Animal) => value is Dog>();
});

test("RefinementWithIndex", () => {
  interface Animal {
    readonly name: string;
  }
  interface Dog extends Animal {
    readonly breed: string;
  }

  assertType<
    RefinementWithIndex<Animal, Dog>,
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

  {
    const actual = instance("Foo");
    assertType<typeof actual, Instance<"Foo">>();
  }
  assertTrue(Object.keys(foo).includes("~evolu/instance"));
  assertTrue(isFoo(foo));

  const value: unknown = foo;
  if (isFoo(value)) assertType<typeof value, Foo>();

  const compileTimeAssertions = () => {
    // @ts-expect-error The runtime name must match the interface name.
    isInstance<Foo>("Bar");
  };
  assertType<
    typeof compileTimeAssertions extends (...args: Array<never>) => unknown
      ? true
      : false,
    true
  >();
});

test("isInstance checks its own marker", () => {
  const isFoo = isInstance<Instance<"Foo">>("Foo");
  const nullPrototype = Object.assign(
    Object.create(null) as object,
    instance("Foo"),
  );

  assertTrue(isFoo(nullPrototype));
  assertFalse(isFoo(null));
  assertFalse(isFoo("Foo"));
  assertFalse(isFoo({}));
  assertFalse(isFoo(instance("Bar")));
  assertFalse(isFoo(Object.create(instance("Foo"))));
});

test("NullablePartial", () => {
  assertType<
    NullablePartial<{
      readonly required: string;
      readonly nullable: string | null;
      readonly nullOnly: null;
      readonly existingOptional?: number;
    }>,
    {
      readonly required: string;
      readonly nullable?: string | null;
      readonly nullOnly?: null;
      readonly existingOptional?: number;
    }
  >();
});

test("Literal", () => {
  assertType<Literal, string | number | bigint | boolean | undefined | null>();
});

test("WidenLiteral", () => {
  assertType<WidenLiteral<"foo">, string>();
  assertType<WidenLiteral<42>, number>();
  assertType<WidenLiteral<42n>, bigint>();
  assertType<WidenLiteral<true>, boolean>();
  assertType<WidenLiteral<undefined>, undefined>();
  assertType<WidenLiteral<null>, null>();
});

test("Writable", () => {
  assertType<
    Writable<{
      readonly value: string;
      readonly nested: { readonly value: number };
    }>,
    {
      value: string;
      nested: { readonly value: number };
    }
  >();
});

test("Simplify", () => {
  assertType<
    Simplify<{ readonly text: string } & { readonly count: number }>,
    {
      readonly text: string;
      readonly count: number;
    }
  >();
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

  assertType<Actual extends Expected ? true : false, true>();
  assertType<Expected extends Actual ? true : false, true>();
});

test("Awaitable", () => {
  assertType<Awaitable<string>, string | PromiseLike<string>>();
});

test("isPromiseLike", () => {
  assertTrue(isPromiseLike(Promise.resolve("value")));
  // oxlint-disable-next-line unicorn/no-thenable -- Intentionally tests a thenable object.
  assertTrue(isPromiseLike({ then: () => undefined }));
  // oxlint-disable-next-line unicorn/no-thenable -- Intentionally tests a non-callable then property.
  assertFalse(isPromiseLike({ then: "not a function" }));
  assertFalse(isPromiseLike(null));
  assertFalse(isPromiseLike(undefined));
  assertFalse(isPromiseLike("value"));

  const narrow = (value: Awaitable<string>) => {
    if (isPromiseLike(value)) {
      assertType<typeof value, PromiseLike<string>>();
    } else {
      assertType<typeof value, string>();
    }
  };
  assertType<
    typeof narrow extends (...args: Array<never>) => unknown ? true : false,
    true
  >();
});

test("CompileTimeError", () => {
  assertType<
    CompileTimeError<"Type", "Something went wrong">,
    "⛔ Type error: Something went wrong"
  >();
});

test("IsSameType", () => {
  assertType<IsSameType<string, string>, true>();
  assertType<IsSameType<"value", string>, false>();
  assertType<IsSameType<any, unknown>, false>();
  assertType<IsSameType<unknown, unknown>, true>();
  assertType<IsSameType<never, never>, true>();
  assertType<IsSameType<never, unknown>, false>();
  assertType<
    IsSameType<{ readonly value: string }, { value: string }>,
    false
  >();
  assertType<
    IsSameType<
      { readonly value?: string },
      { readonly value: string | undefined }
    >,
    false
  >();
  assertType<
    IsSameType<
      { readonly first: 1 } & { readonly second: 2 },
      { readonly first: 1; readonly second: 2 }
    >,
    false
  >();
  assertType<
    IsSameType<
      Simplify<{ readonly first: 1 } & { readonly second: 2 }>,
      { readonly first: 1; readonly second: 2 }
    >,
    true
  >();
});

test("IsUnion", () => {
  assertType<IsUnion<string>, false>();
  assertType<IsUnion<string | number>, true>();
  assertType<IsUnion<never>, false>();
  assertType<IsUnion<any>, false>();
  assertType<IsUnion<unknown>, false>();
  assertType<IsUnion<boolean>, true>();
  assertType<IsUnion<"a" | "b">, true>();
  // oxlint-disable-next-line typescript/no-redundant-type-constituents -- Verifies IsUnion after TypeScript normalizes a string literal into string.
  assertType<IsUnion<string | "a">, false>();
  // oxlint-disable-next-line typescript/no-redundant-type-constituents -- Verifies IsUnion after TypeScript removes never from a union.
  assertType<IsUnion<string | never>, false>();
  assertType<IsUnion<{ readonly a: string } | { readonly b: number }>, true>();
  assertType<IsUnion<[string | number]>, false>();
});

test("KeysOfUnion", () => {
  assertType<
    KeysOfUnion<
      | { readonly id: string; readonly name: string }
      | { readonly id: string; readonly count: number }
    >,
    "id" | "name" | "count"
  >();
});

test("UnionToIntersection", () => {
  assertType<
    UnionToIntersection<
      { readonly first: string } | { readonly second: number }
    >,
    { readonly first: string } & { readonly second: number }
  >();
});

test("ParameterIntersection", () => {
  type First = (value: { readonly first: string }) => void;
  type Second = (value: { readonly second: number }) => void;
  type Unknown = (value: unknown) => void;

  assertType<
    ParameterIntersection<First | Second>,
    { readonly first: string } & { readonly second: number }
  >();
  assertType<
    ParameterIntersection<First | Second | Unknown>,
    { readonly first: string } & { readonly second: number }
  >();
});

test("DistributiveOmit", () => {
  type Event =
    | { readonly type: "a"; readonly a: string; readonly shared: number }
    | { readonly type: "b"; readonly b: number; readonly shared: number };

  type Payload = DistributiveOmit<Event, "shared">;

  assertType<
    Payload,
    | { readonly type: "a"; readonly a: string }
    | { readonly type: "b"; readonly b: number }
  >();
});
