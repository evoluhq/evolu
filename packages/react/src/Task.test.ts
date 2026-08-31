import { assertType, type DisposableRun, type Run } from "@evolu/common";
import { test } from "node:test";
import { createRunBinding } from "./Task.ts";

interface TestDeps {
  readonly value: string;
}

declare const _disposableRun: DisposableRun<TestDeps>;

// @ts-expect-error createRunBinding requires a DisposableRun type witness.
const _invalidBinding = createRunBinding<Run<TestDeps>>();

test("infers deps from DisposableRun and exposes Run", () => {
  const { RunContext: _RunContext, useRun } =
    createRunBinding<typeof _disposableRun>();

  assertType<ReturnType<typeof useRun>, Run<TestDeps>>();
  assertType<Parameters<typeof _RunContext>[0]["value"], Run<TestDeps>>();
});
