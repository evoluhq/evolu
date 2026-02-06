import { lazyFalse, lazyTrue } from "@evolu/common";
import { useSyncExternalStore } from "react";

// eslint-disable-next-line @typescript-eslint/no-empty-function
const emptySubscribe = () => () => {};

/**
 * Avoiding hydration mismatches.
 *
 * @see https://kurtextrem.de/posts/react-uses-hydration
 */
export const useIsSsr = (): boolean =>
  // TODO: Consider useDeferredValue(isSSRSync);
  useSyncExternalStore(emptySubscribe, lazyFalse, lazyTrue);
