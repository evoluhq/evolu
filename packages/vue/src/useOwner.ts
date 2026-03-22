import type {
  NonEmptyReadonlyArray,
  Owner,
  OwnerTransport,
  ReadonlyOwner,
} from "@evolu/common";
import { useEvolu } from "./useEvolu.js";

/**
 * Vue composable for Evolu `useOwner` method.
 *
 * Using an Owner means syncing it with the provided transports, or the
 * transports defined in Evolu config when transports are omitted.
 */
export const useOwner = (
  owner: ReadonlyOwner | Owner | null,
  transports?: NonEmptyReadonlyArray<OwnerTransport>,
): void => {
  if (owner == null) return;

  const evolu = useEvolu();

  evolu.useOwner(owner, transports);
};
