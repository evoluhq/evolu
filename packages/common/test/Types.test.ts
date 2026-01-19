import { expectTypeOf, test } from "vitest";
import type { DistributiveOmit, WidenLiteral } from "../src/Types.js";

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
