/**
 * Random number generation.
 *
 * @module
 */

import { Random as RandomLib } from "random";
import type { Brand } from "./Brand.ts";

/**
 * A random floating point number in [0, 1).
 *
 * Branded to distinguish random values from arbitrary numbers.
 */
export type RandomNumber = number & Brand<"RandomNumber">;

/**
 * A simple wrapper around Math.random().
 *
 * For more complex needs check {@link RandomLibDep}.
 *
 * ### Example
 *
 * ```ts
 * import {
 *   createRandom,
 *   testCreateRandom,
 *   type RandomNumber,
 * } from "@evolu/common";
 *
 * // For apps, use the Math.random-backed implementation.
 * const random = createRandom();
 * const value = random.next();
 * expectTypeOf(value).toEqualTypeOf<RandomNumber>();
 * expect(value).toBeGreaterThanOrEqual(0);
 * expect(value).toBeLessThan(1);
 *
 * // For tests, use a seed.
 * const firstTestRandom = testCreateRandom("test");
 * const secondTestRandom = testCreateRandom("test");
 * expect(firstTestRandom.next()).toBe(secondTestRandom.next());
 * ```
 */
export interface Random {
  /** Returns a floating point number in [0, 1). Just like Math.random(). */
  readonly next: () => RandomNumber;
}

export interface RandomDep {
  readonly random: Random;
}

/** Creates a {@link Random} using Math.random(). */
export const createRandom = (): Random => ({
  next: () => Math.random() as RandomNumber,
});

/**
 * Creates a seeded {@link Random} for deterministic tests.
 *
 * Default seed "evolu".
 */
export const testCreateRandom = (seed = "evolu"): Random => {
  const random = new RandomLib(seed);
  return {
    next: () => random.next() as RandomNumber,
  };
};

/**
 * Seedable random number generator supporting many common distributions,
 * provided by the NPM `random` package.
 *
 * https://github.com/transitive-bullshit/random
 */
export interface RandomLibDep {
  readonly randomLib: RandomLib;
}

/** Creates a random number generator from the NPM `random` package. */
export const createRandomLib = (): RandomLib => new RandomLib();

/**
 * Creates a seeded random number generator from the NPM `random` package for
 * deterministic tests.
 *
 * Default seed "evolu".
 */
export const testCreateRandomLib = (seed = "evolu"): RandomLib =>
  new RandomLib(seed);
