import { PositiveInt } from "@evolu/common";
import { expect, expectTypeOf, test, vi } from "vitest";
import {
  availableParallelism,
  type AvailableParallelism,
  type AvailableParallelismDep,
} from "../../../../packages/nodejs/src/Platform.ts";

const { nodeAvailableParallelism } = vi.hoisted(() => ({
  nodeAvailableParallelism: vi.fn(),
}));

vi.mock("node:os", () => ({
  availableParallelism: nodeAvailableParallelism,
}));

test("availableParallelism returns the validated Node.js value", () => {
  nodeAvailableParallelism.mockReturnValue(128);

  const parallelism = availableParallelism();
  const deps = { availableParallelism } satisfies AvailableParallelismDep;

  expectTypeOf(availableParallelism).toEqualTypeOf<AvailableParallelism>();
  expectTypeOf(parallelism).toEqualTypeOf<PositiveInt>();
  expect(deps.availableParallelism).toBe(availableParallelism);
  expect(parallelism).toBe(128);
});
