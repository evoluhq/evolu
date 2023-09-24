export type StoreListener = () => void;

export type StoreUnsubscribe = () => void;

export interface Store<T> {
  readonly subscribe: (listener: StoreListener) => StoreUnsubscribe;
  readonly setState: (state: T) => void;
  readonly getState: () => T;
}

export const makeStore = <T>(initialState: T): Store<T> => {
  let currentState = initialState;

  const listeners = new Set<StoreListener>();

  const subscribe: Store<T>["subscribe"] = (listener) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  const setState: Store<T>["setState"] = (state: T) => {
    if (state === currentState) return;
    currentState = state;
    listeners.forEach((listener) => listener());
  };

  const getState: Store<T>["getState"] = () => currentState;

  return { subscribe, setState, getState };
};
