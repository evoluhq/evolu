/**
 * Test utilities for deterministic testing.
 *
 * @module
 */
import { testCreateRandomBytes, type RandomBytesDep } from "./Crypto.js";
import {
  testCreateRandom,
  testCreateRandomLib,
  type RandomDep,
  type RandomLibDep,
} from "./Random.js";
import { createRunner, type Runner, type RunnerConfigDep } from "./Task.js";
import { testCreateTime, type TimeDep } from "./Time.js";

/** Test deps created by {@link createTestDeps}. */
export type TestDeps = RandomDep & RandomLibDep & RandomBytesDep & TimeDep;

/**
 * Creates test deps for proper isolation.
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
export const createTestDeps = (options?: {
  readonly seed?: string;
}): TestDeps => {
  const seed = options?.seed ?? "evolu";
  const random = testCreateRandom(seed);
  const randomLib = testCreateRandomLib(seed);
  const randomBytes = testCreateRandomBytes({ randomLib });
  const time = testCreateTime();
  return { random, randomLib, randomBytes, time };
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
 * await using run = createTestRunner();
 *
 * // Override specific deps
 * await using run = createTestRunner({ time: customTime });
 *
 * // Add custom deps
 * interface HttpDep {
 *   readonly http: Http;
 * }
 * await using run = createTestRunner({ http });
 * // run is Runner<TestDeps & HttpDep>
 * ```
 */
export function createTestRunner(): Runner<TestDeps>;
export function createTestRunner<D extends TestDeps>(
  deps: Partial<TestDeps> & Partial<RunnerConfigDep> & Omit<D, keyof TestDeps>,
): Runner<D>;
export function createTestRunner<D extends TestDeps>(
  deps?: Partial<TestDeps> & Partial<RunnerConfigDep> & Omit<D, keyof TestDeps>,
): Runner<D> {
  const defaults = createTestDeps();
  return createRunner<D>({ ...defaults, ...deps } as D);
}
