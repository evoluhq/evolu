import { Eq, eqStrict } from "./Eq.js";
import { createListeners, Listener, Unsubscribe } from "./Listeners.js";
import { createRef, Ref } from "./Ref.js";

/**
 * A read-only view of a {@link Store} that provides state access and change
 * notifications without allowing modifications.
 *
 * Use {@link ReadonlyStore} in public APIs where consumers should observe state
 * but not modify it directly.
 */
export interface ReadonlyStore<T> extends Disposable {
  /**
   * Registers a listener to be called on state changes and returns a function
   * to unsubscribe.
   */
  readonly subscribe: (listener: Listener) => Unsubscribe;

  /** Returns the current state of the store. */
  readonly get: () => T;
}

/**
 * A store for managing state with change notifications. Like a {@link Ref} with
 * subscriptions.
 *
 * Store is a valid dependency in Evolu's [Dependency
 * Injection](https://evolu.dev/docs/dependency-injection) pattern—use it when
 * functions need shared mutable state with subscriptions.
 */
export interface Store<T> extends ReadonlyStore<T>, Ref<T> {}

/**
 * Creates a store with the given initial state. The store encapsulates its
 * state, which can be read with `get` and updated with `set` or `modify`. All
 * changes are broadcast to subscribers.
 *
 * By default, state changes are detected using `===` (shallow equality). You
 * can provide a custom equality function as the second argument.
 */
export const createStore = <T>(
  initialState: T,
  eq: Eq<T> = eqStrict,
): Store<T> => {
  const listeners = createListeners();
  const ref = createRef(initialState, eq);

  return {
    subscribe: listeners.subscribe,
    get: ref.get,

    set: (state) => {
      const updated = ref.set(state);
      if (updated) listeners.notify();
      return updated;
    },

    modify: (updater) => {
      const updated = ref.modify(updater);
      if (updated) listeners.notify();
      return updated;
    },

    [Symbol.dispose]: listeners[Symbol.dispose],
  };
};
