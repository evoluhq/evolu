/**
 * A store for managing state with change notifications. Provides methods to
 * retrieve the current state, update it, and notify listeners of changes. The
 * state is immutable externally, with updates controlled via `setState`. Think
 * of it as a lightweight, observable reference (akin to a Ref in functional
 * programming) tailored for reactive state management.
 */
export interface Store<T> {
  /**
   * Registers a listener to be called on state changes and returns a function
   * to unsubscribe.
   */
  readonly subscribe: StoreSubscribe;

  /** Returns the current state of the store. */
  readonly getState: () => T;

  /**
   * Updates the store's state and notifies all subscribed listeners if the new
   * state differs from the current one. Does nothing if the state is
   * unchanged.
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
 * Creates a store with the given initial state. The store encapsulates a
 * mutable reference to its state, exposed immutably via `getState` and updated
 * via `setState`, with changes broadcast to subscribers.
 */
export const createStore = <T>(initialState: T): Store<T> => {
  const listeners = new Set<StoreListener>();
  let currentState = initialState;

  const updateState = (newState: T) => {
    if (newState === currentState) return;
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
