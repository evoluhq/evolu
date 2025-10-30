import { SyncState } from "@evolu/common/evolu";
import { useEvolu } from "./useEvolu.js";

/** Subscribe to {@link SyncState} changes. */
export const useSyncState = (): SyncState => {
  const _evolu = useEvolu();
  // return useSyncExternalStore(
  //   evolu.subscribeSyncState,
  //   evolu.getSyncState,
  //   () => initialSyncState,
  // );
  throw new Error("TODO");
};
