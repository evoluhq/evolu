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
import { createRunner, type Runner, type RunnerConfigDep } from "./Task.js";
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
 *   await using run = testCreateRunner(deps);
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
 * Creates a test {@link Runner} with deterministic deps.
 *
 * Uses {@link TestDeps} which provides seeded random values, ensuring
 * deterministic fiber IDs, timestamps, and other generated values. This makes
 * tests reproducible and snapshot-friendly.
 *
 * Accepts partial deps - any missing deps are created with defaults. Also
 * accepts {@link RunnerConfigDep} for enabling events and custom deps.
 *
 * ### Example
 *
 * ```ts
 * // Basic usage with TestDeps
 * await using run = testCreateRunner();
 *
 * // Override specific deps
 * await using run = testCreateRunner({ time: customTime });
 *
 * // Add custom deps
 * interface HttpDep {
 *   readonly http: Http;
 * }
 * await using run = testCreateRunner({ http });
 * // run is Runner<TestDeps & HttpDep>
 * ```
 */
export function testCreateRunner(): Runner<TestDeps>;
/** With custom dependencies. */
export function testCreateRunner<D extends TestDeps>(
  deps: Partial<TestDeps> & Partial<RunnerConfigDep> & Omit<D, keyof TestDeps>,
): Runner<D>;
export function testCreateRunner<D extends TestDeps>(
  deps?: Partial<TestDeps> & Partial<RunnerConfigDep> & Omit<D, keyof TestDeps>,
): Runner<D> {
  const defaults = testCreateDeps();
  return createRunner<D>({ ...defaults, ...deps } as D);
}
