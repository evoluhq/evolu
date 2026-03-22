import type {
  NonEmptyReadonlyArray,
  Owner,
  OwnerTransport,
  ReadonlyOwner,
} from "@evolu/common";
import { use, useEffect } from "react";
import { EvoluContext } from "./EvoluContext.js";

/**
 * React Hook for Evolu `useOwner` method.
 *
 * Using an Owner means syncing it with the provided transports, or the
 * transports defined in Evolu config when transports are omitted.
 */
export const useOwner = (
  owner: ReadonlyOwner | Owner | null,
  transports?: NonEmptyReadonlyArray<OwnerTransport>,
): void => {
  const evolu = use(EvoluContext);

  useEffect(() => {
    if (owner == null) return;
    return evolu.useOwner(owner, transports);
  }, [evolu, owner, transports]);
};
