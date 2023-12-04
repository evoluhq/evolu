import { SyncState, SyncStateInitial } from "@evolu/common";
import { useSyncExternalStore } from "react";
import { useEvolu } from "./useEvolu.js";

const initialSyncState: SyncStateInitial = { _tag: "SyncStateInitial" };

/** Subscribe to {@link SyncState} changes. */
export const useSyncState = (): SyncState => {
  const evolu = useEvolu();
  return useSyncExternalStore(
    evolu.subscribeSyncState,
    evolu.getSyncState,
    () => initialSyncState,
  );
};
