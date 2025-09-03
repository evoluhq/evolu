import { SyncOwner } from "@evolu/common";
import { useEffect } from "react";
import { useEvolu } from "./useEvolu.js";

/**
 * React Hook for managing sync owner subscriptions.
 *
 * When the component mounts, it registers the owner for syncing. When the
 * component unmounts or the owner changes, it automatically unregisters.
 *
 * ### Example
 *
 * ```tsx
 * import { useOwner } from "@evolu/react";
 *
 * function MyComponent({ shardOwner }: { shardOwner: SyncOwner | null }) {
 *   useOwner(shardOwner);
 *
 *   // Component will sync with shardOwner while mounted
 *   return <div>Syncing with shard...</div>;
 * }
 * ```
 */
export const useOwner = (owner: SyncOwner | null): void => {
  const evolu = useEvolu();

  useEffect(() => {
    if (owner == null) return;
    return evolu.useOwner(owner);
  }, [evolu, owner]);
};
