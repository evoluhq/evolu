/**
 * 🎲
 *
 * @module
 */

import { Random as RandomLib } from "random";

/**
 * A simple wrapper around Math.random(). Most apps need only this. For more
 * complex needs check {@link RandomLibDep}.
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
  next: () => number;
}

export interface RandomDep {
  random: Random;
}

/** Creates a {@link Random} using Math.random(). */
export const createRandom = (): Random => ({
  next: () => Math.random(),
});

/**
 * Creates {@link Random} using {@link RandomLibDep} with a seed which is useful
 * for tests.
 */
export const createRandomWithSeed = (seed: string): Random => {
  const random = new RandomLib(seed);
  return {
    next: () => random.next(),
  };
};

/**
 * A random number generator using the NPM `random` package dependency.
 *
 * https://github.com/transitive-bullshit/random
 */
export interface RandomLibDep {
  random: RandomLib;
}

/** Creates a `RandomLib` using the NPM `random` package. */
export const createRandomLib = (): RandomLib => new RandomLib();

/**
 * Creates {@link RandomLibDep} using the NPM `random` package with a seed which
 * is useful for tests.
 */
export const createRandomLibWithSeed = (seed: string): RandomLibDep => ({
  random: new RandomLib(seed),
});
