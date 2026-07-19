import { describe, expect, test } from "vitest";
import { testCreateConsole } from "../src/Console.ts";
import {
  createLeakDetector,
  noopLeakDetector,
  testCreateLeakDetector,
} from "../src/LeakDetector.ts";

describe("createLeakDetector", () => {
  test("accepts track and untrack calls", () => {
    const console = testCreateConsole();
    const leakDetector = createLeakDetector({ console });
    const target = {};
    const unregisterToken = {};

    expect(() => {
      leakDetector.track(
        target,
        { name: "Lease", isLeaked: () => true },
        unregisterToken,
      );
      leakDetector.untrack(unregisterToken);
    }).not.toThrow();

    expect(console.getEntriesSnapshot()).toEqual([]);
  });

  test("returns the no-op detector without FinalizationRegistry", () => {
    const descriptor = Object.getOwnPropertyDescriptor(
      globalThis,
      "FinalizationRegistry",
    );
    delete (globalThis as { FinalizationRegistry?: typeof FinalizationRegistry })
      .FinalizationRegistry;

    try {
      expect(createLeakDetector({ console: testCreateConsole() })).toBe(
        noopLeakDetector,
      );
    } finally {
      if (descriptor)
        Object.defineProperty(globalThis, "FinalizationRegistry", descriptor);
    }
  });
});

describe("noopLeakDetector", () => {
  test("ignores track and untrack", () => {
    const unregisterToken = {};

    expect(() => {
      noopLeakDetector.track(
        {},
        { name: "Lease", isLeaked: () => true },
        unregisterToken,
      );
      noopLeakDetector.untrack(unregisterToken);
    }).not.toThrow();
  });
});

describe("testCreateLeakDetector", () => {
  test("collect reports tracked handles that are still held", () => {
    const console = testCreateConsole();
    const leakDetector = testCreateLeakDetector({ console });

    leakDetector.track({}, { name: "Lease", isLeaked: () => true }, {});

    expect(leakDetector.getTrackedCount()).toBe(1);
    expect(leakDetector.collect()).toBe(1);
    expect(leakDetector.getTrackedCount()).toBe(0);

    const entries = console.getEntriesSnapshot();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.method).toBe("warn");
    expect(entries[0]?.args[0]).toBe(
      "Lease was garbage-collected without cleanup. Tracked at:",
    );
    expect(entries[0]?.args[1]).toContain("LeakDetector.test");

    // Collected targets are no longer tracked.
    expect(leakDetector.collect()).toBe(0);
  });

  test("collect does not report handles that are no longer held", () => {
    const console = testCreateConsole();
    const leakDetector = testCreateLeakDetector({ console });

    leakDetector.track({}, { name: "Lease", isLeaked: () => false }, {});

    expect(leakDetector.collect()).toBe(0);
    expect(console.getEntriesSnapshot()).toEqual([]);
  });

  test("collect counts only leaked handles and clears all", () => {
    const console = testCreateConsole();
    const leakDetector = testCreateLeakDetector({ console });

    leakDetector.track({}, { name: "Lease", isLeaked: () => true }, {});
    leakDetector.track({}, { name: "Lease", isLeaked: () => false }, {});

    expect(leakDetector.collect()).toBe(1);
    expect(console.getEntriesSnapshot()).toHaveLength(1);
    expect(leakDetector.getTrackedCount()).toBe(0);
  });

  test("collect counts the same leak decision it reports", () => {
    const console = testCreateConsole();
    const leakDetector = testCreateLeakDetector({ console });
    let isLeaked = true;

    leakDetector.track(
      {},
      {
        name: "Lease",
        isLeaked: () => {
          const result = isLeaked;
          isLeaked = false;
          return result;
        },
      },
      {},
    );

    expect(leakDetector.collect()).toBe(1);
    expect(console.getEntriesSnapshot()).toHaveLength(1);
  });

  test("untrack stops tracking", () => {
    const console = testCreateConsole();
    const leakDetector = testCreateLeakDetector({ console });
    const unregisterToken = {};

    leakDetector.track(
      {},
      { name: "Lease", isLeaked: () => true },
      unregisterToken,
    );
    leakDetector.untrack(unregisterToken);

    expect(leakDetector.getTrackedCount()).toBe(0);
    expect(leakDetector.collect()).toBe(0);
    expect(console.getEntriesSnapshot()).toEqual([]);
  });

  test("untrack removes all registrations for duplicate tokens", () => {
    const console = testCreateConsole();
    const leakDetector = testCreateLeakDetector({ console });
    const unregisterToken = {};

    leakDetector.track(
      {},
      { name: "Lease", isLeaked: () => true },
      unregisterToken,
    );
    leakDetector.track(
      {},
      { name: "SemaphorePermit", isLeaked: () => true },
      unregisterToken,
    );

    expect(leakDetector.getTrackedCount()).toBe(2);

    leakDetector.untrack(unregisterToken);

    expect(leakDetector.getTrackedCount()).toBe(0);
    expect(leakDetector.collect()).toBe(0);
    expect(console.getEntriesSnapshot()).toEqual([]);
  });

  test("collect reports every registration under a duplicate token", () => {
    const console = testCreateConsole();
    const leakDetector = testCreateLeakDetector({ console });
    const unregisterToken = {};

    leakDetector.track(
      {},
      { name: "Lease", isLeaked: () => true },
      unregisterToken,
    );
    leakDetector.track(
      {},
      { name: "Lease", isLeaked: () => true },
      unregisterToken,
    );

    expect(leakDetector.collect()).toBe(2);
    expect(console.getEntriesSnapshot()).toHaveLength(2);
  });

  test("getTrackedCount filters by leak name", () => {
    const console = testCreateConsole();
    const leakDetector = testCreateLeakDetector({ console });

    leakDetector.track({}, { name: "Lease", isLeaked: () => true }, {});
    leakDetector.track(
      {},
      { name: "SemaphorePermit", isLeaked: () => true },
      {},
    );

    expect(leakDetector.getTrackedCount()).toBe(2);
    expect(leakDetector.getTrackedCount({ name: "Lease" })).toBe(1);
    expect(leakDetector.getTrackedCount({ name: "SemaphorePermit" })).toBe(1);
  });
});
