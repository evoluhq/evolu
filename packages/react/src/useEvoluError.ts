import { constNull, EvoluError } from "@evolu/common";
import { useSyncExternalStore } from "react";
import { useEvolu } from "./useEvolu.js";

/** Subscribe to {@link EvoluError} changes. */
export const useEvoluError = (): EvoluError | null => {
  const evolu = useEvolu();
  return useSyncExternalStore(evolu.subscribeError, evolu.getError, constNull);
};
