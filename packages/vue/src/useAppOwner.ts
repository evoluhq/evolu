import { SyncOwner } from "@evolu/common";
import { useEvolu } from "./useEvolu.js";
import { onScopeDispose, Ref, ref } from "vue";

/** 
 * Vue composable for managing sync owner subscriptions.
 */
export const useAppOwner = (owner: SyncOwner | null): void => {
  if (owner == null) return;

  const evolu = useEvolu();
  evolu.useOwner(owner);
};