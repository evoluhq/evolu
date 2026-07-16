/**
 * Random number generation.
 *
 * @module
 */

import { Random as RandomLib } from "random";
import type { Brand } from "./Brand.js";

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
 * // For apps
 * const random = createRandom();
 * random.next();
 *
 * // For tests
 * const random = testCreateRandom("test");
 * random.next();
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

/** Creates {@link RandomLib}. */
export const createRandomLib = (): RandomLib => new RandomLib();

/**
 * Creates a seeded {@link RandomLib} for deterministic tests.
 *
 * Default seed "evolu".
 */
export const testCreateRandomLib = (seed = "evolu"): RandomLib =>
  new RandomLib(seed);
