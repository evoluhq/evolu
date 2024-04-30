import { useRef, useSyncExternalStore } from "react";

const emptySubscribe = () => () => {};

/**
 * "Unlike the typeof window hack, this ensures that the server and hydration
 * sees the same thing."
 *
 * The magic ingredient is useRef; check Sebastian's tweet.
 * https://twitter.com/sebmarkbage/status/1763640725088923668
 */
export const useWasSSR = (): boolean => {
  const ref = useRef(false);
  return useSyncExternalStore(
    emptySubscribe,
    () => ref.current,
    () => (ref.current = true),
  );
};
