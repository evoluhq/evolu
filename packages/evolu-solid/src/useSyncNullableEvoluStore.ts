import { Store as EvoluStore } from "@evolu/common";
import { Store, createStore } from "solid-js/store";
import { getOwner, onCleanup } from "solid-js";

export function useSyncNullableEvoluStore<T extends object | null>(
  subscribe: EvoluStore<T | null>["subscribe"],
  getState: EvoluStore<T | null>["getState"],
): T | null {

  const [get, set] = createStore(getState() || undefined);

  const unsubscribe = subscribe(() => {
    const state = getState();
    if (state) set(state);
  });

  if (getOwner()) {
    onCleanup(unsubscribe);
  }

  return (get as Store<T>) || null;
}
