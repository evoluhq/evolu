import { testCreateConsole } from "@evolu/common";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createRunner } from "../src/Task.js";

describe("createRunner", () => {
  test("merges custom deps", async () => {
    interface CustomDep {
      readonly customValue: number;
    }

    await using run = createRunner<CustomDep>({ customValue: 42 });

    expect(run.deps.customValue).toBe(42);
  });

  describe("listener registration (mocked)", () => {
    const originalAddEventListener = globalThis.addEventListener;
    const originalRemoveEventListener = globalThis.removeEventListener;

    let addedListeners: Map<string, EventListener>;
    let removedListeners: Map<string, EventListener>;

    beforeEach(() => {
      addedListeners = new Map();
      removedListeners = new Map();

      globalThis.addEventListener = vi.fn((type: string, listener: unknown) => {
        addedListeners.set(type, listener as EventListener);
      }) as typeof globalThis.addEventListener;

      globalThis.removeEventListener = vi.fn(
        (type: string, listener: unknown) => {
          removedListeners.set(type, listener as EventListener);
        },
      ) as typeof globalThis.removeEventListener;
    });

    afterEach(() => {
      globalThis.addEventListener = originalAddEventListener;
      globalThis.removeEventListener = originalRemoveEventListener;
    });

    test("registers error and unhandledrejection listeners", async () => {
      await using _run = createRunner();

      expect(addedListeners.has("error")).toBe(true);
      expect(addedListeners.has("unhandledrejection")).toBe(true);
    });

    test("removes same listener instances on dispose", async () => {
      {
        await using _run = createRunner();
      }

      expect(removedListeners.get("error")).toBe(addedListeners.get("error"));
      expect(removedListeners.get("unhandledrejection")).toBe(
        addedListeners.get("unhandledrejection"),
      );
    });
  });

  describe("error handling (real browser events)", () => {
    test("catches and logs ErrorEvent", async () => {
      const console = testCreateConsole();
      await using _run = createRunner({ console });

      globalThis.dispatchEvent(
        new ErrorEvent("error", { error: new Error("test error") }),
      );

      const entries = console.getEntriesSnapshot();
      expect(entries).toHaveLength(1);
      expect(entries[0].method).toBe("error");
      expect(entries[0].args[0]).toBe("error");
      expect(entries[0].args[1]).toMatchObject({
        type: "UnknownError",
        error: { message: "test error" },
      });
    });

    test("catches and logs PromiseRejectionEvent", async () => {
      const console = testCreateConsole();
      await using _run = createRunner({ console });

      globalThis.dispatchEvent(
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

    test("stops catching events after dispose", async () => {
      const console = testCreateConsole();

      // First verify events ARE caught before dispose
      {
        await using _run = createRunner({ console });
        globalThis.dispatchEvent(
          new ErrorEvent("error", { error: new Error("before dispose") }),
        );
      }
      expect(console.getEntriesSnapshot()).toHaveLength(1);

      // Verify events are NOT caught after dispose
      // Prevent vitest from treating dispatched error as unhandled
      const suppress = (e: Event) => e.preventDefault();
      globalThis.addEventListener("error", suppress);

      globalThis.dispatchEvent(
        new ErrorEvent("error", {
          error: new Error("after dispose"),
          cancelable: true,
        }),
      );

      globalThis.removeEventListener("error", suppress);

      expect(console.getEntriesSnapshot()).toHaveLength(0);
    });
  });
});
