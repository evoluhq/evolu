import { Eq } from "./Eq.js";
import type { Store } from "./Store.js";

/**
 * `Ref` provides a simple API to hold and update a value, similar to a "ref" in
 * functional programming or React. It exposes methods to get, set, and modify
 * the current state.
 *
 * Use a Ref instead of a variable when you want to pass state around as an
 * object. If you need subscriptions, see {@link Store}.
 *
 * Ref is a valid dependency in Evolu's [Dependency
 * Injection](https://evolu.dev/docs/dependency-injection) pattern—use it when
 * functions need shared mutable state.
 *
 * ## Example
 *
 * ```ts
 * const count = createRef(0);
 * count.set(1);
 * count.modify((n) => n + 1);
 * console.log(count.get()); // 2
 * ```
 *
 * ## Example of using Ref as a dependency
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

  /** Sets the state. Returns `true` if the state was updated. */
  readonly set: (state: T) => boolean;

  /**
   * Modifies the state using an updater function. Returns `true` if the state
   * was updated.
   */
  readonly modify: (updater: (current: T) => T) => boolean;
}

/**
 * Creates a {@link Ref} with the given initial state.
 *
 * By default, state is always updated. We can provide an optional {@link Eq}
 * function as the second argument to skip updates when the new state equals the
 * current state.
 */
export const createRef = <T>(initialState: T, eq?: Eq<T>): Ref<T> => {
  let currentState = initialState;

  const updateState = (newState: T): boolean => {
    if (eq?.(newState, currentState)) return false;
    currentState = newState;
    return true;
  };

  return {
    get: () => currentState,

    set: (state) => updateState(state),

    modify: (updater) => updateState(updater(currentState)),
  };
};
