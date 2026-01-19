/**
 * Seeded random number generation.
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
 * const random = createRandomWithSeed("test");
 * random.next();
 * ```
 */
export interface Random {
  /** Returns a floating point number in [0, 1). Just like Math.random(). */
  next: () => RandomNumber;
}

export interface RandomDep {
  random: Random;
}

/** Creates a {@link Random} using Math.random(). */
export const createRandom = (): Random => ({
  next: () => Math.random() as RandomNumber,
});

/** Creates a seeded {@link Random} for deterministic tests. Default seed "evolu". */
export const testCreateRandom = (seed = "evolu"): Random =>
  createRandomWithSeed(seed);

/**
 * Creates {@link Random} using {@link RandomLibDep} with a seed which is useful
 * for tests.
 */
export const createRandomWithSeed = (seed: string): Random => {
  const random = new RandomLib(seed);
  return {
    next: () => random.next() as RandomNumber,
  };
};

/**
 * A random number generator using the NPM `random` package dependency.
 *
 * https://github.com/transitive-bullshit/random
 */
export interface RandomLibDep {
  randomLib: RandomLib;
}

/** Creates a `RandomLib` using the NPM `random` package. */
export const createRandomLib = (): RandomLib => new RandomLib();

/** Creates a seeded `RandomLib` for deterministic tests. Default seed "evolu". */
export const testCreateRandomLib = (seed = "evolu"): RandomLib =>
  new RandomLib(seed);
