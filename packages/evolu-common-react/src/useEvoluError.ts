import { EvoluError } from "@evolu/common";
import { constNull } from "effect/Function";
import { useSyncExternalStore } from "react";
import { useEvolu } from "./useEvolu.js";

/** Subscribe to {@link EvoluError} changes. */
export const useEvoluError = (): EvoluError | null => {
  const evolu = useEvolu();
  return useSyncExternalStore(evolu.subscribeError, evolu.getError, constNull);
};
