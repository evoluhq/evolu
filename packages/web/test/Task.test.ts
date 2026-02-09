import { testCreateConsole } from "@evolu/common";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createRun } from "../src/Task.js";

describe("createRun", () => {
  test("merges custom deps", async () => {
    interface CustomDep {
      readonly customValue: number;
    }

    await using run = createRun<CustomDep>({ customValue: 42 });

    expect(run.deps.customValue).toBe(42);
  });

  describe("event listeners", () => {
    const originalAddEventListener = globalThis.addEventListener;

    let addedListeners: Map<
      string,
      { listener: EventListener; signal?: AbortSignal | undefined }
    >;

    beforeEach(() => {
      addedListeners = new Map();

      globalThis.addEventListener = vi.fn(
        (type: string, listener: unknown, options?: unknown) => {
          const signal = (options as { signal?: AbortSignal } | undefined)
            ?.signal;
          addedListeners.set(type, {
            listener: listener as EventListener,
            signal,
          });
        },
      ) as typeof globalThis.addEventListener;
    });

    afterEach(() => {
      globalThis.addEventListener = originalAddEventListener;
    });

    test("registers error and unhandledrejection listeners", async () => {
      await using _run = createRun();

      expect(addedListeners.has("error")).toBe(true);
      expect(addedListeners.has("unhandledrejection")).toBe(true);
    });

    test("passes abort signal to addEventListener", async () => {
      await using _run = createRun();

      expect(addedListeners.get("error")!.signal).toBeInstanceOf(AbortSignal);
      expect(addedListeners.get("unhandledrejection")!.signal).toBeInstanceOf(
        AbortSignal,
      );
    });

    test("abort signal is aborted on dispose", async () => {
      let signal: AbortSignal;
      {
        await using _run = createRun();
        signal = addedListeners.get("error")!.signal!;
        expect(signal.aborted).toBe(false);
      }

      expect(signal!.aborted).toBe(true);
    });

    test("error handler logs ErrorEvent", async () => {
      const console = testCreateConsole();
      await using _run = createRun({ console });

      const handler = addedListeners.get("error")!.listener;
      handler(new ErrorEvent("error", { error: new Error("test error") }));

      const entries = console.getEntriesSnapshot();
      expect(entries).toHaveLength(1);
      expect(entries[0].method).toBe("error");
      expect(entries[0].args[0]).toBe("error");
      expect(entries[0].args[1]).toMatchObject({
        type: "UnknownError",
        error: { message: "test error" },
      });
    });

    test("error handler logs PromiseRejectionEvent", async () => {
      const console = testCreateConsole();
      await using _run = createRun({ console });

      const handler = addedListeners.get("unhandledrejection")!.listener;
      handler(
        new PromiseRejectionEvent("unhandledrejection", {
          promise: Promise.resolve(),
          reason: new Error("test rejection"),
        }),
      );

      const entries = console.getEntriesSnapshot();
      expect(entries).toHaveLength(1);
      expect(entries[0].method).toBe("error");
      expect(entries[0].args[0]).toBe("unhandledrejection");
      expect(entries[0].args[1]).toMatchObject({
        type: "UnknownError",
        error: { message: "test rejection" },
      });
    });
  });
});
