import type {
  NonEmptyReadonlyArray,
  Owner,
  OwnerTransport,
  ReadonlyOwner,
} from "@evolu/common";
import { onScopeDispose } from "vue";
import { isServerRendering } from "./isServerRendering.ts";
import { useEvolu } from "./useEvolu.ts";

/**
 * Vue composable for Evolu `useOwner` method.
 *
 * Using an Owner means syncing it with the provided transports, or the
 * transports defined in Evolu config when transports are omitted. The owner is
 * used until the current effect scope, such as the component, is disposed. A
 * null owner uses none, and so does server rendering. Server rendering starts
 * when the server renderer does, so a call on the server before that, such as
 * from a store that a router guard uses first, uses the owner as on the
 * client.
 */
export const useOwner = (
  owner: ReadonlyOwner | Owner | null,
  transports?: NonEmptyReadonlyArray<OwnerTransport>,
): void => {
  if (owner == null || isServerRendering()) return;

  const evolu = useEvolu();

  onScopeDispose(evolu.useOwner(owner, transports));
};
