import { SyncState } from "@evolu/common/evolu";
import { useEvolu } from "./useEvolu.js";
import { onScopeDispose, Ref, ref } from "vue";

/** Subscribe to {@link SyncState} changes. */
export const useSyncState = (): Ref<SyncState> => {
  /*
  const evolu = useEvolu();

  const syncState = ref(evolu.getSyncState());
  const unsubscribe = evolu.subscribeSyncState(() => {
    syncState.value = evolu.getSyncState();
  });
  onScopeDispose(unsubscribe);

  return syncState;
   */

  // not updated in the Evolu core yet
  throw new Error("TODO");
};