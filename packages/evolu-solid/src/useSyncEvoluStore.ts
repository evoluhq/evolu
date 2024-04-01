import { Store as EvoluStore } from "@evolu/common";
import { createStore } from "solid-js/store";
import { getOwner, onCleanup } from "solid-js";
import * as O from "effect/Option";

export function useSyncEvoluStore<T>(
  subscribe: EvoluStore<O.Option<T>>["subscribe"],
  getState: EvoluStore<O.Option<T>>["getState"],
): O.Option<T> {
  const [get, set] = createStore(getState());

  const unsubscribe = subscribe(() => {
    const state = getState();
    if (state) set(state);
  });

  if (getOwner()) {
    onCleanup(unsubscribe);
  }

  return get;
}
