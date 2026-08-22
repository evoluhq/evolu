import { constFalse, constTrue } from "@evolu/common";
import { useSyncExternalStore } from "react";

const emptySubscribe = () => () => {};

/**
 * Avoiding hydration mismatches.
 *
 * @see https://kurtextrem.de/posts/react-uses-hydration
 */
export const useIsSsr = (): boolean =>
  // TODO: Consider useDeferredValue(isSSRSync);
  useSyncExternalStore(emptySubscribe, constFalse, constTrue);
