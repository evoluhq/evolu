import { SyncOwner } from "@evolu/common";
import { useEvolu } from "./useEvolu.js";

/** 
 * Vue composable for managing sync owner subscriptions.
 */
export const useOwner = (owner: SyncOwner | null): void => {
  if (owner == null) return;

  const evolu = useEvolu();
  evolu.useOwner(owner);
};