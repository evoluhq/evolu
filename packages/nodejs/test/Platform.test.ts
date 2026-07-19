import { PositiveInt } from "@evolu/common";
import { expect, expectTypeOf, test, vi } from "vitest";
import { availableParallelism } from "../src/index.ts";

const { nodeAvailableParallelism } = vi.hoisted(() => ({
  nodeAvailableParallelism: vi.fn(),
}));

vi.mock("node:os", () => ({
  availableParallelism: nodeAvailableParallelism,
}));

test("availableParallelism returns the validated Node.js value", () => {
  nodeAvailableParallelism.mockReturnValue(128);

  const parallelism = availableParallelism();

  expectTypeOf(parallelism).toEqualTypeOf<PositiveInt>();
  expect(parallelism).toBe(128);
});
