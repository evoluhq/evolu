import {
  assertEqual,
  assertLength,
  assertNonNullable,
  assertSame,
  assertThrows,
  assertTrue,
  testStubGlobal,
} from "@evolu/common";
import { describe, it, mock } from "node:test";
import { createRun } from "./Task.ts";

describe("createRun", () => {
  it("createRun reports a panic's defect with ErrorUtils.reportError", async () => {
    const reportError = mock.fn<(error: unknown) => void>();
    using _errorUtils = testStubGlobal("ErrorUtils", {
      getGlobalHandler: () => null,
      setGlobalHandler:
        mock.fn<NonNullable<typeof ErrorUtils>["setGlobalHandler"]>(),
      reportError,
    });
    await using run = createRun();
    const defect = new Error("boom");

    run.panic(defect);

    assertEqual(reportError.mock.callCount(), 1);
    assertSame(reportError.mock.calls[0]?.arguments[0], defect);
  });

  it("createRun preserves a custom reportDefect", async () => {
    const reportError =
      mock.fn<NonNullable<typeof ErrorUtils>["reportError"]>();
    const reportDefect = mock.fn();
    using _errorUtils = testStubGlobal("ErrorUtils", {
      getGlobalHandler: () => null,
      setGlobalHandler:
        mock.fn<NonNullable<typeof ErrorUtils>["setGlobalHandler"]>(),
      reportError,
    });
    await using run = createRun({ reportDefect });

    run.panic(new Error("boom"));

    assertEqual(reportDefect.mock.callCount(), 1);
    assertEqual(reportError.mock.callCount(), 0);
  });

  it("createRun falls back when ErrorUtils is unavailable", async (t) => {
    using _errorUtils = testStubGlobal("ErrorUtils", undefined);
    assertTrue(Reflect.deleteProperty(globalThis, "ErrorUtils"));
    const callbacks: Array<() => void> = [];
    t.mock.method(globalThis, "queueMicrotask", (callback: () => void) => {
      callbacks.push(callback);
    });
    await using run = createRun();
    const defect = new Error("boom");

    run.panic(defect);

    assertLength(callbacks, 1);
    assertThrows(callbacks[0], (reported) => {
      assertSame(reported, defect);
    });
  });

  it("creates a run", async () => {
    await using run = createRun();

    assertNonNullable(run);
    assertNonNullable(run.deps);
  });
});
