import { useRef, useSyncExternalStore } from "react";

// eslint-disable-next-line @typescript-eslint/no-empty-function
const emptySubscribe = () => () => {};

/**
 * Unlike the `typeof window === 'undefined'`, this ensures that the server and
 * hydration see the same thing.
 *
 * We use this so people can use Evolu with SSR even though it's not recommended
 * because of layout shift during rendering.
 *
 * @see https://tkdodo.eu/blog/avoiding-hydration-mismatches-with-use-sync-external-store
 */
export const useWasSsr = (): boolean => {
  const ref = useRef(false);
  return useSyncExternalStore(
    emptySubscribe,
    () => ref.current,
    () => (ref.current = true),
  );
};
