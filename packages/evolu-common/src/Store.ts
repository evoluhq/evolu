import { Effect, Function } from "effect";

export type Listener = () => void;

export type Unsubscribe = () => void;

export interface Store<T> {
  readonly subscribe: (listener: Listener) => Unsubscribe;
  readonly setState: (state: T) => void;
  readonly getState: () => T;
}

export const makeStore = <T>(
  initialState: Function.LazyArg<T>,
): Effect.Effect<never, never, Store<T>> =>
  Effect.sync(() => {
    const listeners = new Set<Listener>();
    let currentState = initialState();

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

      setState(state) {
        if (state === currentState) return;
        currentState = state;
        listeners.forEach((listener) => listener());
      },
    };

    return store;
  });
