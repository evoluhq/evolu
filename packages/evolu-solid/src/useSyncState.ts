import type { Accessor } from "solid-js";;
import { SyncState } from "@evolu/common";
import { useEvolu } from "./useEvolu.js";
import { useSyncExternalStore } from "./useSyncExternalStore.js";

/** Subscribe to {@link SyncState} changes. */
export const useSyncState = (): Accessor<SyncState> => {
  const evolu = useEvolu();
  return useSyncExternalStore(evolu.subscribeSyncState, () =>
      evolu.getSyncState());
};
