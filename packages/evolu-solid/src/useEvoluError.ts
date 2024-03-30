import { EvoluError } from "@evolu/common";
import { useEvolu } from "./useEvolu.js";
import { useSyncNullableEvoluStore } from "./useSyncNullableEvoluStore.js";

/** Subscribe to {@link Owner} changes. */
export const useEvoluError = (): EvoluError | null => {
  const evolu = useEvolu();
  return useSyncNullableEvoluStore(
    evolu.subscribeError,
    evolu.getError,
  );
};
