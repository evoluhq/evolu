/**
 * Browser-compatible test dependencies.
 *
 * This file can be imported in tests that run in both Node and browser
 * environments. For Node-only deps (like better-sqlite3), use `_deps.ts`.
 */
import type { RandomBytes } from "../src/Crypto.js";
import {
  createRandomLibWithSeed,
  createRandomWithSeed,
} from "../src/Random.js";
import { createRunner } from "../src/Task.js";
import type { Runner, RunnerConfigDep } from "../src/Task.js";
import { createTestTime, createTime } from "../src/Time.js";
import type { TimeDep } from "../src/Time.js";

export const testRandomLib = createRandomLibWithSeed("evolu").random;

export const testRandomBytes: RandomBytes = {
  create: (bytesLength) => {
    const array = Array.from({ length: bytesLength }, () =>
      testRandomLib.int(0, 255),
    );
    return new Uint8Array(array);
  },
} as RandomBytes;

/** Seeded random for tests. */
export const testRandom = createRandomWithSeed("evolu");

/** Test time with fake timers (no auto-advance). */
export const testTime = createTestTime();

/** Creates a test runner with configurable deps. */
export const testCreateRunner = (
  deps?: Partial<TimeDep & RunnerConfigDep>,
): Runner =>
  createRunner({
    random: testRandom,
    randomBytes: testRandomBytes,
    time: deps?.time ?? createTime(),
    ...(deps?.runnerConfig && { runnerConfig: deps.runnerConfig }),
  });
