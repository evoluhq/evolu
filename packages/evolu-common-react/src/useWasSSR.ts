import { useRef, useSyncExternalStore } from "react";

const emptySubscribe = () => (): void => {};

/**
 * "Unlike the typeof window hack, this ensures that the server and hydration
 * sees the same thing."
 *
 * https://twitter.com/sebmarkbage/status/1763640725088923668
 * https://tkdodo.eu/blog/avoiding-hydration-mismatches-with-use-sync-external-store
 */
export const useWasSSR = (): boolean => {
  const ref = useRef(false);
  return useSyncExternalStore(
    emptySubscribe,
    () => ref.current,
    () => (ref.current = true),
  );
};
