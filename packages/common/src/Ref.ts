/**
 * Mutable reference.
 *
 * @module
 */

import type { Store } from "./Store.js";

/**
 * Mutable reference.
 *
 * `Ref` holds a mutable value and exposes explicit `get`, `set`, `update`, and
 * `modify` operations. Use it when mutable state needs to be passed around as a
 * value.
 *
 * For reactive state with subscriptions, see {@link Store}.
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
  /** Returns the current state. */
  readonly get: () => T;

  /** Sets the state. */
  readonly set: (state: T) => void;

  /** Sets the state and returns the previous state. */
  readonly getAndSet: (state: T) => T;

  /** Sets the state and returns the current state after the update. */
  readonly setAndGet: (state: T) => T;

  /** Updates the state. */
  readonly update: (updater: (current: T) => T) => void;

  /** Updates the state and returns the previous state. */
  readonly getAndUpdate: (updater: (current: T) => T) => T;

  /** Updates the state and returns the current state after the update. */
  readonly updateAndGet: (updater: (current: T) => T) => T;

  /** Modifies the state and returns a computed result from the transition. */
  readonly modify: <R>(
    updater: (current: T) => readonly [result: R, nextState: T],
  ) => R;
}

/** Creates a {@link Ref} with the given initial state. */
export const createRef = <T>(initialState: T): Ref<T> => {
  let currentState = initialState;

  return {
    get: () => currentState,

    set: (state) => {
      currentState = state;
    },

    getAndSet: (state) => {
      const previousState = currentState;
      currentState = state;
      return previousState;
    },

    setAndGet: (state) => {
      currentState = state;
      return currentState;
    },

    update: (updater) => {
      currentState = updater(currentState);
    },

    getAndUpdate: (updater) => {
      const previousState = currentState;
      currentState = updater(currentState);
      return previousState;
    },

    updateAndGet: (updater) => {
      currentState = updater(currentState);
      return currentState;
    },

    modify: (updater) => {
      const [result, nextState] = updater(currentState);
      currentState = nextState;
      return result;
    },
  };
};
