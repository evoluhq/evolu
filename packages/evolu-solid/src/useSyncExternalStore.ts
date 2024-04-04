import { createSignal, getOwner, onCleanup } from "solid-js";
import type { Accessor } from "solid-js";

/**
 * `useSyncExternalStore`
 * Something similar to `React.useSyncExternalStore` but for `Solid`
 */

export function useSyncExternalStore<T>(
  subscribe: (onStoreChange: () => void) => () => void,
  getState: () => T,
  initalState?: () => T,
): Accessor<T> {

  const initial = initalState ? initalState() : getState()
  const [get, set] = createSignal(initial);

  const unsubscribe = subscribe(() => {
    set(() => getState());
  });

  if (getOwner()) {
    onCleanup(unsubscribe);
  }

  return get;
}
