import { assertType, id, type Evolu } from "@evolu/common";
import { test } from "node:test";
import { createEvoluBinding } from "./createEvoluBinding.ts";

const TestSchema = {
  test: {
    id: id("Test"),
  },
};

// @ts-expect-error createEvoluBinding accepts the schema as a type argument.
const _invalidBinding = createEvoluBinding(TestSchema);

test("creates a binding from an EvoluSchema type", () => {
  const { useEvolu } = createEvoluBinding<typeof TestSchema>();

  assertType<ReturnType<typeof useEvolu>, Evolu<typeof TestSchema>>();
});
