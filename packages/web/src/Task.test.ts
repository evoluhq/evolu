import {
  assertEqual,
  assertNonNullable,
  assertTrue,
  testStubGlobal,
} from "@evolu/common";
import { describe, it, mock } from "node:test";
import { createRun } from "./Task.ts";

describe("createRun", () => {
  it("createRun reports defects with global reportError", async () => {
    const reportError = mock.fn<(error: unknown) => void>();
    using _reportError = testStubGlobal("reportError", reportError);
    await using run = createRun();
    const defect = new Error("boom");

    run.panic(defect);

    assertEqual(reportError.mock.callCount(), 1);
    const reported = reportError.mock.calls[0]?.arguments[0];
    assertNonNullable(reported);
    assertTrue(typeof reported === "object");
    assertEqual(Reflect.get(reported, "reason"), {
      type: "PanicAbortReason",
      defect,
    });
  });

  it("createRun preserves a custom reportDefect", async () => {
    const reportError = mock.fn();
    const reportDefect = mock.fn();
    using _reportError = testStubGlobal("reportError", reportError);
    await using run = createRun({ reportDefect });
    const defect = new Error("boom");

    run.panic(defect);

    assertEqual(reportDefect.mock.callCount(), 1);
    assertEqual(reportError.mock.callCount(), 0);
  });

  it("merges custom deps", async () => {
    interface CustomDep {
      readonly customValue: number;
    }

    await using run = createRun<CustomDep>({ customValue: 42 });

    assertEqual(run.deps.customValue, 42);
  });
});
