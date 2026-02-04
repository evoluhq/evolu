import { testCreateConsole } from "@evolu/common";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createRun } from "../src/Task.js";

describe("createRun", () => {
  beforeEach(() => {
    process.removeAllListeners("SIGINT");
    process.removeAllListeners("SIGTERM");
    process.removeAllListeners("SIGHUP");
    process.removeAllListeners("uncaughtException");
    process.removeAllListeners("unhandledRejection");
    process.exitCode = undefined;
  });

  afterEach(() => {
    process.removeAllListeners("SIGINT");
    process.removeAllListeners("SIGTERM");
    process.removeAllListeners("SIGHUP");
    process.removeAllListeners("uncaughtException");
    process.removeAllListeners("unhandledRejection");
    process.exitCode = undefined;
  });

  test("provides shutdown in deps", async () => {
    await using run = createRun();

    expect(run.deps.shutdown).toBeInstanceOf(Promise);
  });

  test("shutdown resolves on SIGINT", async () => {
    await using run = createRun();

    const shutdownResolved = Promise.withResolvers<boolean>();
    void run.deps.shutdown.then(() => shutdownResolved.resolve(true));

    process.emit("SIGINT");

    expect(await shutdownResolved.promise).toBe(true);
  });

  test("shutdown resolves on SIGTERM", async () => {
    await using run = createRun();

    const shutdownResolved = Promise.withResolvers<boolean>();
    void run.deps.shutdown.then(() => shutdownResolved.resolve(true));

    process.emit("SIGTERM");

    expect(await shutdownResolved.promise).toBe(true);
  });

  test("shutdown resolves on SIGHUP", async () => {
    await using run = createRun();

    const shutdownResolved = Promise.withResolvers<boolean>();
    void run.deps.shutdown.then(() => shutdownResolved.resolve(true));

    process.emit("SIGHUP");

    expect(await shutdownResolved.promise).toBe(true);
  });

  test("logs error and resolves shutdown on uncaughtException", async () => {
    const console = testCreateConsole();
    const run = createRun({ console });

    // In real code, an uncaught throw triggers this event.
    // We emit directly because test frameworks catch throws.
    process.emit("uncaughtException", new Error("test uncaught"));

    expect(process.exitCode).toBe(1);
    const entries = console.getEntriesSnapshot();
    expect(entries.length).toBe(1);
    expect(entries[0].method).toBe("error");
    expect(entries[0].args[0]).toBe("uncaughtException");
    expect(entries[0].args[1]).toEqual({
      type: "UnknownError",
      error: expect.objectContaining({ message: "test uncaught" }),
    });

    // Shutdown is resolved so await run.deps.shutdown unblocks
    await run.deps.shutdown;

    // Clean up
    await run[Symbol.asyncDispose]();
  });

  test("logs error and resolves shutdown on unhandledRejection", async () => {
    const console = testCreateConsole();
    const run = createRun({ console });

    process.emit(
      "unhandledRejection",
      new Error("test rejection"),
      Promise.resolve(),
    );

    expect(process.exitCode).toBe(1);
    const entries = console.getEntriesSnapshot();
    expect(entries.length).toBe(1);
    expect(entries[0].method).toBe("error");
    expect(entries[0].args[0]).toBe("unhandledRejection");
    expect(entries[0].args[1]).toEqual({
      type: "UnknownError",
      error: expect.objectContaining({ message: "test rejection" }),
    });

    // Shutdown is resolved so await run.deps.shutdown unblocks
    await run.deps.shutdown;

    // Clean up
    await run[Symbol.asyncDispose]();
  });

  test("cleans up listeners on dispose", async () => {
    const initialListeners = {
      SIGINT: process.listenerCount("SIGINT"),
      SIGTERM: process.listenerCount("SIGTERM"),
      SIGHUP: process.listenerCount("SIGHUP"),
      uncaughtException: process.listenerCount("uncaughtException"),
      unhandledRejection: process.listenerCount("unhandledRejection"),
    };

    {
      await using _run = createRun();

      expect(process.listenerCount("SIGINT")).toBe(initialListeners.SIGINT + 1);
      expect(process.listenerCount("SIGTERM")).toBe(
        initialListeners.SIGTERM + 1,
      );
      expect(process.listenerCount("SIGHUP")).toBe(initialListeners.SIGHUP + 1);
      expect(process.listenerCount("uncaughtException")).toBe(
        initialListeners.uncaughtException + 1,
      );
      expect(process.listenerCount("unhandledRejection")).toBe(
        initialListeners.unhandledRejection + 1,
      );
    }

    expect(process.listenerCount("SIGINT")).toBe(initialListeners.SIGINT);
    expect(process.listenerCount("SIGTERM")).toBe(initialListeners.SIGTERM);
    expect(process.listenerCount("SIGHUP")).toBe(initialListeners.SIGHUP);
    expect(process.listenerCount("uncaughtException")).toBe(
      initialListeners.uncaughtException,
    );
    expect(process.listenerCount("unhandledRejection")).toBe(
      initialListeners.unhandledRejection,
    );
  });

  test("merges custom deps", async () => {
    interface CustomDep {
      readonly customValue: number;
    }

    await using run = createRun<CustomDep>({ customValue: 42 });

    expect(run.deps.customValue).toBe(42);
    expect(run.deps.shutdown).toBeInstanceOf(Promise);
  });
});
