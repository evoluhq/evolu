import { constFalse, constTrue } from "@evolu/common";
import { useSyncExternalStore } from "react";

// eslint-disable-next-line @typescript-eslint/no-empty-function
const emptySubscribe = () => () => {};

/**
 * Avoiding hydration mismatches.
 *
 * @see https://kurtextrem.de/posts/react-uses-hydration
 */
export const useIsSsr = (): boolean => {
  // TODO: Consider useDeferredValue(isSSRSync);
  return useSyncExternalStore(emptySubscribe, constFalse, constTrue);
};
