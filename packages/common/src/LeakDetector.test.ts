import { describe, it } from "node:test";
import { assertEqual, assertLength, assertSame, assertTrue } from "./Assert.ts";

import { testCreateConsole } from "./Console.ts";
import {
  createLeakDetector,
  noopLeakDetector,
  testCreateLeakDetector,
} from "./LeakDetector.ts";
import { assertType, String } from "./Type.ts";

describe("createLeakDetector", () => {
  it("accepts track and untrack calls", () => {
    const console = testCreateConsole();
    const leakDetector = createLeakDetector({ console });
    const target = {};
    const unregisterToken = {};

    leakDetector.track(
      target,
      { name: "Lease", isLeaked: () => true },
      unregisterToken,
    );
    leakDetector.untrack(unregisterToken);

    assertEqual(console.getEntriesSnapshot(), []);
  });

  it("returns the no-op detector without FinalizationRegistry", () => {
    const descriptor = globalThis.Object.getOwnPropertyDescriptor(
      globalThis,
      "FinalizationRegistry",
    );
    delete (
      globalThis as { FinalizationRegistry?: typeof FinalizationRegistry }
    ).FinalizationRegistry;

    try {
      assertSame(
        createLeakDetector({ console: testCreateConsole() }),
        noopLeakDetector,
      );
    } finally {
      if (descriptor)
        globalThis.Object.defineProperty(
          globalThis,
          "FinalizationRegistry",
          descriptor,
        );
    }
  });
});

describe("noopLeakDetector", () => {
  it("ignores track and untrack", () => {
    const unregisterToken = {};

    noopLeakDetector.track(
      {},
      { name: "Lease", isLeaked: () => true },
      unregisterToken,
    );
    noopLeakDetector.untrack(unregisterToken);
  });
});

describe("testCreateLeakDetector", () => {
  it("collect reports tracked handles that are still held", () => {
    const console = testCreateConsole();
    const leakDetector = testCreateLeakDetector({ console });

    leakDetector.track({}, { name: "Lease", isLeaked: () => true }, {});

    assertEqual(leakDetector.getTrackedCount(), 1);
    assertEqual(leakDetector.collect(), 1);
    assertEqual(leakDetector.getTrackedCount(), 0);

    const entries = console.getEntriesSnapshot();
    assertLength(entries, 1);
    assertEqual(entries[0]?.method, "warn");
    assertEqual(
      entries[0]?.args[0],
      "Lease was garbage-collected without cleanup. Tracked at:",
    );
    const stack = entries[0]?.args[1];
    assertType(String, stack);
    assertTrue(stack.includes("LeakDetector.test"));

    // Collected targets are no longer tracked.
    assertEqual(leakDetector.collect(), 0);
  });

  it("collect does not report handles that are no longer held", () => {
    const console = testCreateConsole();
    const leakDetector = testCreateLeakDetector({ console });

    leakDetector.track({}, { name: "Lease", isLeaked: () => false }, {});

    assertEqual(leakDetector.collect(), 0);
    assertEqual(console.getEntriesSnapshot(), []);
  });

  it("collect counts only leaked handles and clears all", () => {
    const console = testCreateConsole();
    const leakDetector = testCreateLeakDetector({ console });

    leakDetector.track({}, { name: "Lease", isLeaked: () => true }, {});
    leakDetector.track({}, { name: "Lease", isLeaked: () => false }, {});

    assertEqual(leakDetector.collect(), 1);
    assertLength(console.getEntriesSnapshot(), 1);
    assertEqual(leakDetector.getTrackedCount(), 0);
  });

  it("collect counts the same leak decision it reports", () => {
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

    assertEqual(leakDetector.collect(), 1);
    assertLength(console.getEntriesSnapshot(), 1);
  });

  it("untrack stops tracking", () => {
    const console = testCreateConsole();
    const leakDetector = testCreateLeakDetector({ console });
    const unregisterToken = {};

    leakDetector.track(
      {},
      { name: "Lease", isLeaked: () => true },
      unregisterToken,
    );
    leakDetector.untrack(unregisterToken);

    assertEqual(leakDetector.getTrackedCount(), 0);
    assertEqual(leakDetector.collect(), 0);
    assertEqual(console.getEntriesSnapshot(), []);
  });

  it("untrack removes all registrations for duplicate tokens", () => {
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

    assertEqual(leakDetector.getTrackedCount(), 2);

    leakDetector.untrack(unregisterToken);

    assertEqual(leakDetector.getTrackedCount(), 0);
    assertEqual(leakDetector.collect(), 0);
    assertEqual(console.getEntriesSnapshot(), []);
  });

  it("collect reports every registration under a duplicate token", () => {
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

    assertEqual(leakDetector.collect(), 2);
    assertLength(console.getEntriesSnapshot(), 2);
  });

  it("getTrackedCount filters by leak name", () => {
    const console = testCreateConsole();
    const leakDetector = testCreateLeakDetector({ console });

    leakDetector.track({}, { name: "Lease", isLeaked: () => true }, {});
    leakDetector.track(
      {},
      { name: "SemaphorePermit", isLeaked: () => true },
      {},
    );

    assertEqual(leakDetector.getTrackedCount(), 2);
    assertEqual(leakDetector.getTrackedCount({ name: "Lease" }), 1);
    assertEqual(leakDetector.getTrackedCount({ name: "SemaphorePermit" }), 1);
  });
});
