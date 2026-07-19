import { id, type Evolu } from "@evolu/common";
import { expectTypeOf, test } from "vitest";
import { createEvoluBinding } from "../src/local-first/createEvoluBinding.tsx";

const TestSchema = {
  test: {
    id: id("Test"),
  },
};

// @ts-expect-error createEvoluBinding accepts the schema as a type argument.
const _invalidBinding = createEvoluBinding(TestSchema);

test("creates a binding from an EvoluSchema type", () => {
  const { useEvolu } = createEvoluBinding<typeof TestSchema>();

  expectTypeOf(useEvolu).returns.toEqualTypeOf<Evolu<typeof TestSchema>>();
});
