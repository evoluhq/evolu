import type { DisposableRun, Run } from "@evolu/common";
import { expectTypeOf, test } from "vitest";
import { createRunBinding } from "../src/Task.tsx";

interface TestDeps {
  readonly value: string;
}

declare const _disposableRun: DisposableRun<TestDeps>;

// @ts-expect-error createRunBinding requires a DisposableRun type witness.
const _invalidBinding = createRunBinding<Run<TestDeps>>();

test("infers deps from DisposableRun and exposes Run", () => {
  const { RunContext: _RunContext, useRun } =
    createRunBinding<typeof _disposableRun>();

  expectTypeOf(useRun).returns.toEqualTypeOf<Run<TestDeps>>();
  expectTypeOf<Parameters<typeof _RunContext>[0]["value"]>().toEqualTypeOf<
    Run<TestDeps>
  >();
});
