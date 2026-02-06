import type { SyncOwner } from "@evolu/common";
import { use, useEffect } from "react";
import { EvoluContext } from "./EvoluContext.js";

/**
 * React Hook for Evolu `useOwner` method.
 *
 * Using an owner means syncing it with its transports, or the transports
 * defined in Evolu config if the owner has no transports defined.
 */
export const useOwner = (owner: SyncOwner | null): void => {
  const evolu = use(EvoluContext);

  useEffect(() => {
    if (owner == null) return;
    return evolu.useOwner(owner);
  }, [evolu, owner]);
};
