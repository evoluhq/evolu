import { Effect } from "effect";

export type Listener = () => void;

export type Unsubscribe = () => void;

export interface Store<T> {
  // No Effect API because of React useSyncExternalStore
  readonly subscribe: (listener: Listener) => Unsubscribe;
  readonly getState: () => T;

  // Effect API because it's a side-effect.
  readonly setState: (state: T) => Effect.Effect<never, never, void>;
}

export const makeStore = <T>(
  initialState: T,
): Effect.Effect<never, never, Store<T>> =>
  Effect.sync(() => {
    const listeners = new Set<Listener>();
    let currentState = initialState;

    const store: Store<T> = {
      subscribe(listener) {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },

      getState() {
        return currentState;
      },

      setState: (state) =>
        Effect.sync(() => {
          if (state === currentState) return;
          currentState = state;
          listeners.forEach((listener) => listener());
        }),
    };

    return store;
  });
