import {
  assertEqual,
  assertLength,
  assertNonNullable,
  assertThrows,
  assertTrue,
  testStubGlobal,
} from "@evolu/common";
import { describe, it, mock } from "node:test";
import { createRun } from "./Task.ts";

describe("createRun", () => {
  it("createRun reports defects with ErrorUtils.reportError", async () => {
    const reportError = mock.fn<(error: unknown) => void>();
    using _errorUtils = testStubGlobal("ErrorUtils", {
      getGlobalHandler: () => null,
      setGlobalHandler:
        mock.fn<
          NonNullable<typeof globalThis.ErrorUtils>["setGlobalHandler"]
        >(),
      reportError,
    });
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
    const reportError =
      mock.fn<NonNullable<typeof globalThis.ErrorUtils>["reportError"]>();
    const reportDefect = mock.fn();
    using _errorUtils = testStubGlobal("ErrorUtils", {
      getGlobalHandler: () => null,
      setGlobalHandler:
        mock.fn<
          NonNullable<typeof globalThis.ErrorUtils>["setGlobalHandler"]
        >(),
      reportError,
    });
    await using run = createRun({ reportDefect });

    run.panic(new Error("boom"));

    assertEqual(reportDefect.mock.callCount(), 1);
    assertEqual(reportError.mock.callCount(), 0);
  });

  it("createRun falls back when ErrorUtils is unavailable", async (t) => {
    using _errorUtils = testStubGlobal("ErrorUtils", undefined);
    const callbacks: Array<() => void> = [];
    t.mock.method(globalThis, "queueMicrotask", (callback: () => void) => {
      callbacks.push(callback);
    });
    await using run = createRun();

    run.panic(new Error("boom"));

    assertLength(callbacks, 1);
    assertThrows(callbacks[0], (reported) => {
      assertNonNullable(reported);
      assertTrue(typeof reported === "object");
      const reason = Reflect.get(reported, "reason");
      assertNonNullable(reason);
      assertTrue(typeof reason === "object");
      assertEqual(Reflect.get(reason, "type"), "PanicAbortReason");
    });
  });

  it("creates a run", async () => {
    await using run = createRun();

    assertNonNullable(run);
    assertNonNullable(run.deps);
  });
});
