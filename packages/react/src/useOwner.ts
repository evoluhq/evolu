import { SyncOwner } from "@evolu/common";
import { useEffect } from "react";
import { useEvolu } from "./useEvolu.js";

/**
 * React Hook for Evolu `useOwner` method.
 *
 * Using an owner means syncing it with its transports, or the transports
 * defined in Evolu config if the owner has no transports defined.
 */
export const useOwner = (owner: SyncOwner | null): void => {
  const evolu = useEvolu();

  useEffect(() => {
    if (owner == null) return;
    return evolu.useOwner(owner);
  }, [evolu, owner]);
};
