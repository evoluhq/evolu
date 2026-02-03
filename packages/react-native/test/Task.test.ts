import { testCreateConsole } from "@evolu/common";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createRunner } from "../src/Task.js";

// Mock ErrorUtils for testing
const mockErrorUtils = {
  getGlobalHandler: vi.fn(),
  setGlobalHandler: vi.fn(),
};

describe("createRunner", () => {
  beforeEach(() => {
    globalThis.ErrorUtils = mockErrorUtils;
    mockErrorUtils.getGlobalHandler.mockReset();
    mockErrorUtils.setGlobalHandler.mockReset();
  });

  afterEach(() => {
    globalThis.ErrorUtils = undefined;
  });

  test("creates a runner", async () => {
    await using run = createRunner();

    expect(run).toBeDefined();
    expect(run.deps).toBeDefined();
  });

  test("registers global error handler", async () => {
    await using _run = createRunner();

    expect(mockErrorUtils.setGlobalHandler).toHaveBeenCalledOnce();
    expect(mockErrorUtils.setGlobalHandler).toHaveBeenCalledWith(
      expect.any(Function),
    );
  });

  test("restores previous handler on dispose", async () => {
    const previousHandler = vi.fn();
    mockErrorUtils.getGlobalHandler.mockReturnValue(previousHandler);

    const run = createRunner();
    await run[Symbol.asyncDispose]();

    // Last call should restore the previous handler
    const calls = mockErrorUtils.setGlobalHandler.mock.calls;
    expect(calls[calls.length - 1][0]).toBe(previousHandler);
  });

  test("logs uncaught error", async () => {
    const console = testCreateConsole();
    await using _run = createRunner({ console });

    // Get the handler that was registered
    const handler = mockErrorUtils.setGlobalHandler.mock.calls[0][0];

    // Simulate an uncaught error
    handler(new Error("test error"), false);

    const entries = console.getEntriesSnapshot();
    expect(entries.length).toBe(1);
    expect(entries[0].method).toBe("error");
    expect(entries[0].args[0]).toBe("uncaughtError");
    expect(entries[0].args[1]).toEqual({
      type: "UnknownError",
      error: expect.objectContaining({ message: "test error" }),
    });
  });

  test("logs fatal error", async () => {
    const console = testCreateConsole();
    await using _run = createRunner({ console });

    // Get the handler that was registered
    const handler = mockErrorUtils.setGlobalHandler.mock.calls[0][0];

    // Simulate a fatal error
    handler(new Error("fatal test error"), true);

    const entries = console.getEntriesSnapshot();
    expect(entries.length).toBe(1);
    expect(entries[0].method).toBe("error");
    expect(entries[0].args[0]).toBe("fatalError");
    expect(entries[0].args[1]).toEqual({
      type: "UnknownError",
      error: expect.objectContaining({ message: "fatal test error" }),
    });
  });

  test("calls previous handler when error occurs", async () => {
    const previousHandler = vi.fn();
    mockErrorUtils.getGlobalHandler.mockReturnValue(previousHandler);

    await using _run = createRunner();

    // Get the handler that was registered
    const handler = mockErrorUtils.setGlobalHandler.mock.calls[0][0];

    const error = new Error("test error");
    handler(error, true);

    expect(previousHandler).toHaveBeenCalledWith(error, true);
  });

  test("works when ErrorUtils is not available", async () => {
    globalThis.ErrorUtils = undefined;

    // Should not throw
    await using run = createRunner();

    expect(run).toBeDefined();
  });
});
