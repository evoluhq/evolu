import { SyncState } from "@evolu/common/evolu";
import { createEffect, createSignal, onCleanup } from "solid-js";
import { useEvolu } from "./useEvolu.js";

/** Subscribe to {@link SyncState} changes. */
export const useSyncState = (): (() => SyncState) => {
  const evolu = useEvolu();
  const [syncState, setSyncState] = createSignal<SyncState>(
    evolu.getSyncState(),
  );

  createEffect(() => {
    const unsubscribe = evolu.subscribeSyncState(() => {
      setSyncState(evolu.getSyncState());
    });
    onCleanup(unsubscribe);
  });

  return syncState;
};
