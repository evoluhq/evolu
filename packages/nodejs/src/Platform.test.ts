import {
  assertEqual,
  assertSame,
  assertType,
  PositiveInt,
} from "@evolu/common";
import { mock, test } from "node:test";
import type {
  AvailableParallelism,
  AvailableParallelismDep,
} from "./Platform.ts";

const nodeAvailableParallelism = mock.fn<() => number>();

mock.module("node:os", {
  exports: { availableParallelism: nodeAvailableParallelism },
});

const { availableParallelism } = await import("./Platform.ts");

test("availableParallelism returns the validated Node.js value", () => {
  nodeAvailableParallelism.mock.mockImplementation(() => 128);

  const parallelism = availableParallelism();
  const deps = { availableParallelism } satisfies AvailableParallelismDep;

  assertType<typeof availableParallelism, AvailableParallelism>();
  assertType<typeof parallelism, PositiveInt>();
  assertSame(deps.availableParallelism, availableParallelism);
  assertEqual(parallelism, 128);
});
