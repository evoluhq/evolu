/**
 * Mutable reference to an immutable value.
 *
 * @module
 */

import type { Store } from "./Store.js";

/**
 * Mutable reference to an immutable value.
 *
 * `Ref` holds the current value and exposes explicit `get`, `set`, `update`,
 * and `modify` operations. The reference is mutable, but the value inside it
 * must be immutable and replaced with a new value rather than mutated in place.
 * Storing a mutable value in `Ref` does not make sense, because callers could
 * mutate that value directly and pass it around without `Ref`.
 *
 * Use it when mutable ownership of a value needs to be passed around as a
 * value. For reactive state with subscriptions, see {@link Store}.
 *
 * ### Example
 *
 * ```ts
 * const count = createRef(0);
 * count.set(1);
 * count.update((n) => n + 1);
 * console.log(count.get()); // 2
 * ```
 *
 * ### Example of using Ref as a dependency
 *
 * ```ts
 * interface CounterRefDep {
 *   readonly counterRef: Ref<number>;
 * }
 * ```
 */
export interface Ref<T> {
  /** Returns the current value. */
  readonly get: () => T;

  /** Sets the current value. */
  readonly set: (value: T) => void;

  /** Sets the current value and returns the previous value. */
  readonly getAndSet: (value: T) => T;

  /** Sets the current value and returns it. */
  readonly setAndGet: (value: T) => T;

  /** Updates the current value. */
  readonly update: (updater: (current: T) => T) => void;

  /** Updates the current value and returns the previous value. */
  readonly getAndUpdate: (updater: (current: T) => T) => T;

  /** Updates the current value and returns it. */
  readonly updateAndGet: (updater: (current: T) => T) => T;

  /** Modifies the current value and returns a computed result. */
  readonly modify: <R>(
    updater: (current: T) => readonly [result: R, nextValue: T],
  ) => R;
}

/** Creates a {@link Ref} with the given initial immutable value. */
export const createRef = <T>(initialValue: T): Ref<T> => {
  let currentValue = initialValue;

  return {
    get: () => currentValue,

    set: (value) => {
      currentValue = value;
    },

    getAndSet: (value) => {
      const previousValue = currentValue;
      currentValue = value;
      return previousValue;
    },

    setAndGet: (value) => {
      currentValue = value;
      return currentValue;
    },

    update: (updater) => {
      currentValue = updater(currentValue);
    },

    getAndUpdate: (updater) => {
      const previousValue = currentValue;
      currentValue = updater(currentValue);
      return previousValue;
    },

    updateAndGet: (updater) => {
      currentValue = updater(currentValue);
      return currentValue;
    },

    modify: (updater) => {
      const [result, nextValue] = updater(currentValue);
      currentValue = nextValue;
      return result;
    },
  };
};
