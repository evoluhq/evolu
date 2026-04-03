/**
 * Observable state container with change notifications.
 *
 * @module
 */

import type { Eq } from "./Eq.js";
import { eqStrict } from "./Eq.js";
import type { Ref } from "./Ref.js";
import { createRef } from "./Ref.js";

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
 * A read-only view of a {@link Store} that provides state access and change
 * notifications without allowing modifications.
 *
 * Use {@link ReadonlyStore} in public APIs where consumers should observe state
 * but not modify it directly.
 */
export interface ReadonlyStore<T> extends Disposable {
  /** Returns the current state of the store. */
  readonly get: () => T;

  /**
   * Registers a listener to be called on state changes and returns a function
   * to unsubscribe.
   */
  readonly subscribe: (listener: Listener) => Unsubscribe;
}

/** Callback used by {@link ReadonlyStore.subscribe} to observe changes. */
export type Listener = () => void;

/**
 * Function returned by {@link ReadonlyStore.subscribe} to stop observing
 * changes.
 */
export type Unsubscribe = () => void;

/**
 * Creates a store with the given initial state. The store encapsulates its
 * state, which can be read with `get` and updated with `set` or `update`. All
 * changes are broadcast to subscribers.
 *
 * By default, state changes are detected using strict equality (`===`). You can
 * provide a custom equality function as the second argument.
 */
export const createStore = <T>(initialState: T, eq?: Eq<T>): Store<T> => {
  const equality = eq ?? eqStrict;
  const ref = createRef(initialState);
  const listeners = new Set<Listener>();

  const notifyIfChanged = (previousState: T): void => {
    if (!equality(previousState, ref.get())) {
      for (const listener of listeners) listener();
    }
  };

  return {
    get: ref.get,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    set: (state) => {
      const previousState = ref.get();
      ref.set(state);
      notifyIfChanged(previousState);
    },

    getAndSet: (state) => {
      const previousState = ref.getAndSet(state);
      notifyIfChanged(previousState);
      return previousState;
    },

    setAndGet: (state) => {
      const previousState = ref.get();
      ref.set(state);
      notifyIfChanged(previousState);
      return ref.get();
    },

    update: (updater) => {
      const previousState = ref.get();
      ref.update(updater);
      notifyIfChanged(previousState);
    },

    getAndUpdate: (updater) => {
      const previousState = ref.getAndUpdate(updater);
      notifyIfChanged(previousState);
      return previousState;
    },

    updateAndGet: (updater) => {
      const previousState = ref.get();
      ref.updateAndGet(updater);
      notifyIfChanged(previousState);
      return ref.get();
    },

    modify: <R>(
      updater: (current: T) => readonly [result: R, nextState: T],
    ): R => {
      const previousState = ref.get();
      const result = ref.modify(updater);
      notifyIfChanged(previousState);
      return result;
    },

    [Symbol.dispose]: () => {
      listeners.clear();
    },
  };
};
