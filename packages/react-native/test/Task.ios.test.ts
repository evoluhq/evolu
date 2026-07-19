import { describe, expect, test } from "vitest";
import { ok, testCreateRun } from "@evolu/common";
import "./_setup.ios.test.ts";

describe("Task", () => {
  test("polyfills AbortSignal.throwIfAborted", () => {
    const controller = new AbortController();

    expect(() => controller.signal.throwIfAborted()).not.toThrow();

    const reason = new Error("stop");
    controller.abort(reason);

    let thrown: unknown;
    try {
      controller.signal.throwIfAborted();
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBe(reason);
  });

  test("starts a Task synchronously", async () => {
    await using run = testCreateRun();
    let started = false;

    const fiber = run(() => {
      started = true;
      return ok();
    });

    expect(started).toBe(true);
    expect((await fiber).ok).toBe(true);
    expect(run.deps.reportDefect.getDefectsSnapshot()).toEqual([]);
  });
});
