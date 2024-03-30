import { SyncState } from "@evolu/common";
import { useEvolu } from "./useEvolu.js";
import { useSyncEvoluStore } from "./useSyncEvoluStore.js";


/** Subscribe to {@link SyncState} changes. */
export const useSyncState = (): SyncState => {
  const evolu = useEvolu();
  return useSyncEvoluStore(
    evolu.subscribeSyncState,
    evolu.getSyncState
  );
};
