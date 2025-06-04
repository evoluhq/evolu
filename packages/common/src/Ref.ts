/**
 * A mutable reference for managing state
 *
 * @module
 */
import type { Store } from "./Store.js";

/**
 * `Ref` provides a simple API to hold and update a value, similar to a "ref" in
 * functional programming or React. It exposes methods to get, set, and modify
 * the current state.
 *
 * Use a Ref instead of a variable when you want to pass state around as an
 * object or update it in a controlled way. If you need subscriptions, see
 * {@link Store}.
 *
 * Updating in a controlled way means all changes go through specific methods
 * (`setState` or `modifyState`), making state updates predictable and easy to
 * track.
 *
 * ### Example
 *
 * ```ts
 * const count = createRef(0);
 * count.setState(1);
 * count.modifyState((n) => n + 1);
 * console.log(count.getState()); // 2
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
  readonly getState: () => T;

  /** Sets the state. */
  readonly setState: (state: T) => void;

  /** Modifies the state using an updater function. */
  readonly modifyState: (updater: (current: T) => T) => void;
}

/** Creates a {@link Ref} with the given initial state. */
export const createRef = <T>(initialState: T): Ref<T> => {
  let currentState = initialState;

  return {
    getState: () => currentState,
    setState: (state) => {
      currentState = state;
    },
    modifyState: (updater) => {
      currentState = updater(currentState);
    },
  };
};
