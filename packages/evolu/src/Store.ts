export type Unsubscribe = () => void;
export type Listener = () => void;

export interface Store<T> {
  readonly subscribe: (listener: Listener) => Unsubscribe;
  readonly setState: (state: T) => void;
  readonly getState: () => T;
}

export const create = <T>(initialState: T): Store<T> => {
  let currentState = initialState;
  const listeners = new Set<Listener>();

  const store: Store<T> = {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    setState: (state: T) => {
      if (state === currentState) return;
      currentState = state;
      listeners.forEach((listener) => listener());
    },

    getState: () => currentState,
  };

  return store;
};
