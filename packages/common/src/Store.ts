/**
 * A mutable reference for managing state with change notifications
 *
 * @module
 */
import { Eq, eqStrict } from "./Eq.js";
import { Ref } from "./Ref.js";

/**
 * A store for managing state with change notifications. Extends {@link Ref} with
 * subscriptions. Provides methods to get, set, and modify state, and to notify
 * listeners when the state changes.
 */
export interface Store<T> extends Ref<T> {
  /**
   * Registers a listener to be called on state changes and returns a function
   * to unsubscribe.
   */
  readonly subscribe: StoreSubscribe;

  /** Returns the current state of the store. */
  readonly getState: () => T;

  /**
   * Updates the store's state and notifies all subscribed listeners if the new
   * state differs from the current one.
   */
  readonly setState: (state: T) => void;

  /**
   * Modifies the store's state by applying a callback function to the current
   * state and notifies listeners if the state changes.
   */
  readonly modifyState: (updater: (current: T) => T) => void;
}

/** Registers a listener for state changes, returning an unsubscribe function. */
export type StoreSubscribe = (listener: StoreListener) => StoreUnsubscribe;

/** A callback invoked whenever the store's state updates. */
export type StoreListener = () => void;

/** A function to remove a previously added listener. */
export type StoreUnsubscribe = () => void;

/**
 * Creates a store with the given initial state. The store encapsulates its
 * state, which can be read with `getState` and updated with `setState` or
 * `modifyState`. All changes are broadcast to subscribers.
 *
 * By default, state changes are detected using `===` (shallow equality). You
 * can provide a custom equality function as the second argument.
 */
export const createStore = <T>(
  initialState: T,
  eq: Eq<T> = eqStrict,
): Store<T> => {
  const listeners = new Set<StoreListener>();
  let currentState = initialState;

  const updateState = (newState: T) => {
    if (eq(newState, currentState)) return;
    currentState = newState;
    listeners.forEach((listener) => {
      listener();
    });
  };

  return {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    getState: () => currentState,

    setState: (state) => {
      updateState(state);
    },

    modifyState: (updater) => {
      updateState(updater(currentState));
    },
  };
};
