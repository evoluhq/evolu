import { testGlobalUncaughtErrors } from "@evolu/common";
import { afterEach, assert, describe, expect, test, vi } from "vitest";
import { createRun } from "../src/Task.ts";

describe("createRun", () => {
  afterEach(() => {
    globalThis.ErrorUtils = undefined;
  });

  test("createRun reports defects with ErrorUtils.reportError", async () => {
    const reportError = vi.fn();
    globalThis.ErrorUtils = {
      getGlobalHandler: () => null,
      setGlobalHandler: vi.fn(),
      reportError,
    };
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
    globalThis.ErrorUtils = {
      getGlobalHandler: () => null,
      setGlobalHandler: vi.fn(),
      reportError,
    };
    await using run = createRun({ reportDefect });

    run.panic(new Error("boom"));

    expect(reportDefect).toHaveBeenCalledOnce();
    expect(reportError).not.toHaveBeenCalled();
  });

  test("createRun falls back when ErrorUtils is unavailable", async () => {
    globalThis.ErrorUtils = undefined;
    using uncaughtErrors = testGlobalUncaughtErrors();
    await using run = createRun();

    run.panic(new Error("boom"));

    const reported = await uncaughtErrors.next();
    assert(typeof reported === "object" && reported && "reason" in reported);
    expect(reported.reason).toMatchObject({ type: "PanicAbortReason" });
  });

  test("creates a run", async () => {
    await using run = createRun();

    expect(run).toBeDefined();
    expect(run.deps).toBeDefined();
  });
});
