/**
 * Development-time detection of leaked handles via garbage collection.
 *
 * @module
 */

import { type ConsoleDep } from "./Console.ts";
import { lazyVoid } from "./Function.ts";

/**
 * Detects handles that are garbage-collected while still considered held.
 *
 * A handle such as a Lease must be explicitly cleaned up. Nothing in JavaScript
 * enforces that, so a handle whose last reference is dropped without cleanup
 * leaks silently. Garbage collection proves the leak: once the handle is
 * unreachable, no code can ever clean it up. A LeakDetector observes collection
 * with `FinalizationRegistry` and warns when the collected handle was still
 * held — a proven leak with zero false positives, pointing at the tracking
 * site.
 *
 * Detection is best-effort: garbage collection timing is not deterministic, so
 * a warning may come late or, in short-lived processes, never. It is a
 * development canary, not a guarantee. Production uses
 * {@link noopLeakDetector}.
 */
export interface LeakDetector {
  /**
   * Starts tracking `target` until {@link LeakDetector.untrack | untrack} or
   * garbage collection.
   *
   * When `target` is garbage-collected and {@link Leak.isLeaked} returns `true`,
   * the leak is reported with the stack captured at this call. The leak must
   * not reference `target`, or the target would never become unreachable.
   */
  readonly track: (target: object, leak: Leak, unregisterToken: object) => void;

  /** Stops tracking the target registered with `unregisterToken`. */
  readonly untrack: (unregisterToken: object) => void;
}

/** Describes a tracked handle for {@link LeakDetector.track}. */
export interface Leak {
  /** Handle name used in the warning, for example `"Lease"`. */
  readonly name: string;

  /** Returns whether the collected handle was still considered held. */
  readonly isLeaked: () => boolean;
}

/**
 * Dependency wrapper for {@link LeakDetector}.
 *
 * @see {@link LeakDetector}
 */
export interface LeakDetectorDep {
  readonly leakDetector: LeakDetector;
}

/**
 * Creates {@link LeakDetector} backed by `FinalizationRegistry`.
 *
 * Capturing a stack per track call is too expensive for production; use
 * {@link noopLeakDetector} there.
 */
export const createLeakDetector = (deps: ConsoleDep): LeakDetector => {
  if (typeof globalThis.FinalizationRegistry !== "function")
    return noopLeakDetector;

  const registry = new globalThis.FinalizationRegistry<TrackedLeak>(
    reportLeak(deps),
  );

  return {
    track: (target, leak, unregisterToken) => {
      registry.register(
        target,
        { ...leak, stack: new Error().stack },
        unregisterToken,
      );
    },
    untrack: (unregisterToken) => {
      registry.unregister(unregisterToken);
    },
  };
};

/** No-op {@link LeakDetector} for production. */
export const noopLeakDetector: LeakDetector = {
  track: lazyVoid,
  untrack: lazyVoid,
};

interface TrackedLeak extends Leak {
  readonly stack: string | undefined;
}

/**
 * Reports a collected handle that was still held.
 *
 * Shared by {@link createLeakDetector} as the `FinalizationRegistry` callback
 * and by {@link testCreateLeakDetector.collect | collect}, so tests cover the
 * same reporting path without forcing garbage collection. Returns whether the
 * leak was reported.
 */
const reportLeak =
  (deps: ConsoleDep) =>
  (leak: TrackedLeak): boolean => {
    if (!leak.isLeaked()) return false;
    deps.console.warn(
      `${leak.name} was garbage-collected without cleanup. Tracked at:`,
      leak.stack,
    );
    return true;
  };

/**
 * Test {@link LeakDetector} with deterministic collection.
 *
 * @see {@link testCreateLeakDetector}
 */
export interface TestLeakDetector extends LeakDetector {
  /**
   * Simulates garbage collection of all tracked targets.
   *
   * Reports every tracked handle that is still held and clears tracking.
   * Returns the number of reported leaks.
   */
  readonly collect: () => number;

  /** Returns the number of currently tracked targets. */
  readonly getTrackedCount: (options?: { name?: string }) => number;
}

/**
 * Dependency wrapper for {@link TestLeakDetector}.
 *
 * @see {@link TestLeakDetector}
 */
export interface TestLeakDetectorDep extends LeakDetectorDep {
  readonly leakDetector: TestLeakDetector;
}

/** Creates {@link TestLeakDetector}. */
export const testCreateLeakDetector = (deps: ConsoleDep): TestLeakDetector => {
  const trackedLeaksByToken = new Map<object, ReadonlyArray<TrackedLeak>>();
  const report = reportLeak(deps);

  return {
    track: (_target, leak, unregisterToken) => {
      const trackedLeaks = trackedLeaksByToken.get(unregisterToken) ?? [];
      trackedLeaksByToken.set(unregisterToken, [
        ...trackedLeaks,
        {
          ...leak,
          stack: new Error().stack,
        },
      ]);
    },
    untrack: (unregisterToken) => {
      trackedLeaksByToken.delete(unregisterToken);
    },
    collect: () => {
      let leakCount = 0;
      for (const trackedLeaks of trackedLeaksByToken.values()) {
        for (const leak of trackedLeaks) {
          if (report(leak)) leakCount++;
        }
      }
      trackedLeaksByToken.clear();
      return leakCount;
    },
    getTrackedCount: ({ name } = {}) => {
      let count = 0;
      for (const trackedLeaks of trackedLeaksByToken.values()) {
        for (const leak of trackedLeaks) {
          if (name === undefined || leak.name === name) count++;
        }
      }
      return count;
    },
  };
};
