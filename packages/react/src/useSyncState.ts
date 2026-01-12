import type { SyncState } from "@evolu/common/local-first";
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
