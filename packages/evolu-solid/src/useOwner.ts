import { Owner } from "@evolu/common";
import { useEvolu } from "./useEvolu.js";
import { useSyncNullableEvoluStore } from "./useSyncNullableEvoluStore.js";

/** Subscribe to {@link Owner} changes. */
export const useOwner = (): Owner | null => {
  const evolu = useEvolu();
  return useSyncNullableEvoluStore(
    evolu.subscribeOwner,
    evolu.getOwner,
  );
};
