import { SyncState } from "@evolu/common/evolu";
import { useEvolu } from "./useEvolu.js";

/**
 * **⚠️ This API is not finished yet and is subject to change.**
 *
 * Subscribe to {@link SyncState} changes.
 */
export const useSyncState = (): SyncState => {
  const _evolu = useEvolu();
  // return useSyncExternalStore(
  //   evolu.subscribeSyncState,
  //   evolu.getSyncState,
  //   () => initialSyncState,
  // );
  throw new Error("TODO");
};
