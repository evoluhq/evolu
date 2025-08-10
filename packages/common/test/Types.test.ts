import { expectTypeOf, test } from "vitest";
import { WidenLiteral } from "../src/Types.js";

test("WidenLiteral", () => {
  expectTypeOf<WidenLiteral<"foo">>().toEqualTypeOf<string>();
  expectTypeOf<WidenLiteral<42>>().toEqualTypeOf<number>();
  expectTypeOf<WidenLiteral<42n>>().toEqualTypeOf<bigint>();
  expectTypeOf<WidenLiteral<true>>().toEqualTypeOf<boolean>();
  expectTypeOf<WidenLiteral<undefined>>().toEqualTypeOf<undefined>();
  expectTypeOf<WidenLiteral<null>>().toEqualTypeOf<null>();
});
