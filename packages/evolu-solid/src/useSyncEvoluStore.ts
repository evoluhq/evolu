import { Store as EvoluStore } from "@evolu/common";
import { createStore } from "solid-js/store";
import { getOwner, onCleanup } from "solid-js";

export function useSyncEvoluStore<T extends object>(
  subscribe: EvoluStore<T>["subscribe"],
  getState: EvoluStore<T>["getState"],
): T {
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
