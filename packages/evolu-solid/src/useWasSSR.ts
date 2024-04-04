import type { Accessor } from "solid-js";
import { createSignal } from "solid-js";
import { useSyncExternalStore } from "./useSyncExternalStore.js";

const emptySubscribe = () => (): void => {};

/**
 * Copied from `@evolu/common-react`
 * 
 * "Unlike the typeof window hack, this ensures that the server and hydration
 * sees the same thing."
 *
 * https://twitter.com/sebmarkbage/status/1763640725088923668
 * https://tkdodo.eu/blog/avoiding-hydration-mismatches-with-use-sync-external-store
 */
export const useWasSSR = (): Accessor<boolean> => {
  const [ref, setRef] = createSignal(false);
  return useSyncExternalStore(
    emptySubscribe,
    () => ref(),
    () => setRef(true),
  );
};
