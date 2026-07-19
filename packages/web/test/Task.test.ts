import { assert, describe, expect, test, vi } from "vitest";
import { createRun } from "../src/Task.ts";

describe("createRun", () => {
  test("createRun reports defects with global reportError", async () => {
    const reportError = vi.fn();
    vi.stubGlobal("reportError", reportError);
    await using run = createRun();
    const defect = new Error("boom");

    run.panic(defect);

    expect(reportError).toHaveBeenCalledOnce();
    const reported = reportError.mock.calls[0]?.[0];
    assert(typeof reported === "object" && reported && "reason" in reported);
    expect(reported.reason).toEqual({ type: "PanicAbortReason", defect });
  });

  test("createRun preserves a custom reportDefect", async () => {
    const reportError = vi.fn();
    const reportDefect = vi.fn();
    vi.stubGlobal("reportError", reportError);
    await using run = createRun({ reportDefect });
    const defect = new Error("boom");

    run.panic(defect);

    expect(reportDefect).toHaveBeenCalledOnce();
    expect(reportError).not.toHaveBeenCalled();
  });

  test("merges custom deps", async () => {
    interface CustomDep {
      readonly customValue: number;
    }

    await using run = createRun<CustomDep>({ customValue: 42 });

    expect(run.deps.customValue).toBe(42);
  });
});
