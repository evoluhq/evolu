/**
 * Test utilities for deterministic testing.
 *
 * @module
 */

import {
  testCreateConsole,
  type TestConsole,
  type TestConsoleDep,
} from "./Console.js";
import { testCreateRandomBytes, type RandomBytes } from "./Crypto.js";
import {
  type Random,
  testCreateRandom,
  testCreateRandomLib,
  type RandomLibDep,
} from "./Random.js";
import { createRun, type Run, type RunDeps } from "./Task.js";
import {
  minMillis,
  setTimeout,
  testCreateTime,
  type Duration,
  type TestTime,
  type TestTimeDep,
} from "./Time.js";

/**
 * Cheap deterministic baseline deps for tests.
 *
 * `TestDeps` includes test-friendly replacements for {@link RunDeps}, such as
 * {@link TestConsole} and {@link TestTime}, plus extra helpers commonly useful in
 * tests and fixtures, such as `randomLib` (only that for now).
 *
 * Use it directly for synchronous test setup, fixtures, and helpers. It is also
 * intentionally the base deps used by {@link testCreateRun}.
 */
export type TestDeps = Omit<RunDeps, "console" | "time"> &
  TestConsoleDep &
  TestTimeDep &
  RandomLibDep;

/**
 * Creates deterministic {@link TestDeps}.
 *
 * Each call creates fresh instances, so tests don't share state.
 *
 * Includes these deps:
 *
 * - `console`: {@link TestConsole}
 * - `random`: {@link Random}
 * - `randomLib`: seeded `random` package instance
 * - `randomBytes`: {@link RandomBytes}
 * - `time`: {@link TestTime}
 *
 * Use this for synchronous code that accepts deps directly. For tests that run
 * Tasks, use {@link testCreateRun}.
 *
 * ### Example
 *
 * ```ts
 * test("Callbacks with no argument", () => {
 *   const deps = testCreateDeps();
 *   const callbacks = createCallbacks(deps);
 *
 *   let called = false;
 *   const id = callbacks.register(() => {
 *     called = true;
 *   });
 *
 *   callbacks.execute(id);
 *   expect(called).toBe(true);
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
 * Creates a test {@link Run} with deterministic default deps or optional custom
 * deps.
 *
 * Use this as the default composition root in tests. Each call creates fresh
 * {@link TestDeps} via {@link testCreateDeps}, then merges any provided custom
 * deps.
 *
 * ### Example
 *
 * ```ts
 * // Built-in TestTime
 * await using run = testCreateRun();
 * const fiber = run(sleep("1s"));
 * run.deps.time.advance("1s");
 * await fiber;
 *
 * // For a single test, create the dependency using the Run.
 * await using run = testCreateRun();
 * await using foo = await run.orThrow(createFoo());
 * const runWithFoo = run.addDeps({ foo });
 *
 * expect(runWithFoo.deps.foo).toBe(foo);
 *
 * // If multiple tests need the same setup, create a disposable helper.
 * // Then `await using setup` disposes everything the helper owns.
 * const setupFoo = async () => {
 *   await using stack = new AsyncDisposableStack();
 *   const run = stack.use(testCreateRun());
 *   const foo = stack.use(await run.orThrow(createFoo()));
 *   const moved = stack.move();
 *
 *   // Return whatever the tests need: a Run with the dependency,
 *   // the dependency itself, or both.
 *   return {
 *     run: run.addDeps({ foo }),
 *     foo,
 *     [Symbol.asyncDispose]: () => moved.disposeAsync(),
 *   };
 * };
 *
 * await using setup = await setupFoo();
 * const { run, foo } = setup;
 * expect(run.deps.foo).toBe(foo);
 * ```
 *
 * Name reusable setup helpers after what they set up:
 *
 * - `setupFoo` for reusable test setup for `Foo`
 * - `testSetupFoo` when a library module exports the helper as part of its public
 *   test API, e.g. `testSetupSqlite`.
 */
export function testCreateRun(): Run<TestDeps>;

/** With custom dependencies merged into {@link TestDeps}. */
export function testCreateRun<D>(deps: D): Run<TestDeps & D>;

export function testCreateRun<D>(deps?: D): Run<TestDeps & D> {
  const defaults = testCreateDeps();
  return createRun<TestDeps & D>({ ...defaults, ...deps } as TestDeps & D);
}

/**
 * Returns a Promise that resolves after a macrotask delay.
 *
 * Use this to model a real async boundary in a test double, for example an
 * async disposer that should not complete in the same turn.
 *
 * Avoid using it to coordinate assertions. Waiting for a macrotask tends to
 * make tests indirect and brittle.
 */
export const testWaitForMacrotask = (
  duration: Duration = minMillis,
): Promise<void> => setTimeout(duration);
