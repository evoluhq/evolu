import { expectTypeOf, test } from "vitest";
import type {
  DistributiveOmit,
  ExtractType,
  WidenLiteral,
} from "../src/Types.js";

test("WidenLiteral", () => {
  expectTypeOf<WidenLiteral<"foo">>().toEqualTypeOf<string>();
  expectTypeOf<WidenLiteral<42>>().toEqualTypeOf<number>();
  expectTypeOf<WidenLiteral<42n>>().toEqualTypeOf<bigint>();
  expectTypeOf<WidenLiteral<true>>().toEqualTypeOf<boolean>();
  expectTypeOf<WidenLiteral<undefined>>().toEqualTypeOf<undefined>();
  expectTypeOf<WidenLiteral<null>>().toEqualTypeOf<null>();
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

test("ExtractType", () => {
  type Message =
    | { readonly type: "Mutate"; readonly payload: { readonly id: string } }
    | { readonly type: "Query"; readonly payload: { readonly sql: string } };

  type Mutate = ExtractType<Message, "Mutate">;

  expectTypeOf<Mutate>().toEqualTypeOf<{
    readonly type: "Mutate";
    readonly payload: { readonly id: string };
  }>();

  // @ts-expect-error - typos must fail at the type argument.
  type _Invalid = ExtractType<Message, "Mutaet">;
});
