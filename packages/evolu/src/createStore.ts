import { IO } from "fp-ts/IO";
import { Store, Unsubscribe } from "./types.js";

export const createStore =
  <T>(initialState: T): IO<Store<T>> =>
  () => {
    let state = initialState;
    const listeners = new Set<IO<void>>();

    const subscribe = (listener: IO<void>): Unsubscribe => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    };

    const setState =
      (s: T): IO<void> =>
      () => {
        state = s;
        listeners.forEach((listener) => listener());
      };

    const getState: IO<T> = () => state;

    return { subscribe, setState, getState };
  };
