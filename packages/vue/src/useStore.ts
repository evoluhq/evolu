import type { ReadonlyStore } from "@evolu/common";
import { type Ref, shallowReadonly, shallowRef } from "vue";
import { isServerRendering } from "./isServerRendering.ts";
import { subscribeForScope } from "./subscribeForScope.ts";

/**
 * Vue composable returning the value of an Evolu {@link ReadonlyStore}, such as
 * `evoluError` or `syncState` of the deps, in a ref that follows the store
 * until the current effect scope, such as the component, is disposed. It's what
 * React's `useSyncExternalStore` does for a store. A store replaces its value
 * rather than mutating it, so the ref changes only when the value does. During
 * server rendering, it reads the store once.
 *
 * ### Example
 *
 * ```ts
 * import {
 *   assertType,
 *   type ReadonlyStore,
 *   type SyncState,
 * } from "@evolu/common";
 * import { useStore } from "@evolu/vue";
 * import type { Ref } from "vue";
 *
 * // Call composables in component setup.
 * const useSyncState = (syncState: ReadonlyStore<SyncState | null>) =>
 *   useStore(syncState);
 *
 * assertType<
 *   ReturnType<typeof useSyncState>,
 *   Readonly<Ref<SyncState | null>>
 * >();
 * ```
 */
export const useStore = <T>(store: ReadonlyStore<T>): Readonly<Ref<T>> => {
  const value = shallowRef(store.get());

  if (!isServerRendering()) {
    const update = (): void => {
      value.value = store.get();
    };
    subscribeForScope(() => store.subscribe(update));
    // Read again once subscribed, so a change before the subscription shows
    // now rather than with the next one.
    update();
  }

  return shallowReadonly(value);
};
