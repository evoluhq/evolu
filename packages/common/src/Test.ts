/**
 * Test utilities for deterministic testing.
 *
 * @module
 */

import { testCreateConsole, type ConsoleDep } from "./Console.js";
import { testCreateRandomBytes, type RandomBytesDep } from "./Crypto.js";
import {
  testCreateRandom,
  testCreateRandomLib,
  type RandomDep,
  type RandomLibDep,
} from "./Random.js";
import { createRun, type Run, type RunConfigDep } from "./Task.js";
import { testCreateTime, type TimeDep } from "./Time.js";

/** Test deps created by {@link testCreateDeps}. */
export type TestDeps = ConsoleDep &
  RandomBytesDep &
  RandomDep &
  RandomLibDep &
  TimeDep;

/**
 * Creates test dependencies for proper isolation.
 *
 * Each call creates fresh instances, so tests don't share state.
 *
 * ### Example
 *
 * ```ts
 * test("my test", async () => {
 *   const deps = testCreateDeps();
 *   await using run = testCreateRun(deps);
 *
 *   const fiber = run(sleep("1s"));
 *   deps.time.advance("1s");
 *   await fiber;
 * });
 * ```
 */
export const testCreateDeps = (options?: {
  readonly seed?: string;
}): TestDeps => {
  const seed = options?.seed ?? "evolu";
  const console = testCreateConsole();
  const random = testCreateRandom(seed);
  const randomLib = testCreateRandomLib(seed);
  const randomBytes = testCreateRandomBytes({ randomLib });
  const time = testCreateTime();
  return { console, randomBytes, random, randomLib, time };
};

/**
 * Creates a test {@link Run} with deterministic deps.
 *
 * Uses {@link TestDeps} which provides seeded random values, ensuring
 * deterministic fiber IDs, timestamps, and other generated values. This makes
 * tests reproducible and snapshot-friendly.
 *
 * Accepts partial deps - any missing deps are created with defaults. Also
 * accepts {@link RunConfigDep} for enabling events and custom deps.
 *
 * ### Example
 *
 * ```ts
 * // Basic usage with TestDeps
 * await using run = testCreateRun();
 *
 * // Override specific deps
 * await using run = testCreateRun({ time: customTime });
 *
 * // Add custom deps
 * interface HttpDep {
 *   readonly http: Http;
 * }
 * await using run = testCreateRun({ http });
 * // run is Run<TestDeps & HttpDep>
 * ```
 */
export function testCreateRun(): Run<TestDeps>;

/** With custom dependencies merged into {@link TestDeps}. */
export function testCreateRun<D>(deps: D): Run<TestDeps & D>;

export function testCreateRun<D>(deps?: D): Run<TestDeps & D> {
  const defaults = testCreateDeps();
  return createRun<TestDeps & D>({ ...defaults, ...deps } as TestDeps & D);
}
