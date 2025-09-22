import { useRef, useSyncExternalStore } from "react";

// eslint-disable-next-line @typescript-eslint/no-empty-function
const emptySubscribe = () => () => {};

/**
 * Unlike the `typeof window === 'undefined'`, this ensures that the server and
 * hydration sees the same thing.
 */
export const useWasSSR = (): boolean => {
  const ref = useRef(false);
  return useSyncExternalStore(
    emptySubscribe,
    () => ref.current,
    () => (ref.current = true),
  );
};
