import type { SyncState } from "@evolu/common/local-first";
import { use } from "react";
import { EvoluContext } from "./EvoluContext.js";

/** Subscribe to {@link SyncState} changes. */
export const useSyncState = (): SyncState => {
  const _evolu = use(EvoluContext);
  // return useSyncExternalStore(
  //   evolu.subscribeSyncState,
  //   evolu.getSyncState,
  //   () => initialSyncState,
  // );
  throw new Error("TODO");
};
