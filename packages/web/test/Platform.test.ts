import { PositiveInt } from "@evolu/common";
import { expect, expectTypeOf, test, vi } from "vitest";
import { availableParallelism } from "../src/index.ts";

test("availableParallelism returns the validated browser value", () => {
  vi.spyOn(globalThis.navigator, "hardwareConcurrency", "get").mockReturnValue(
    128,
  );

  const parallelism = availableParallelism();

  expectTypeOf(parallelism).toEqualTypeOf<PositiveInt>();
  expect(parallelism).toBe(128);
});
