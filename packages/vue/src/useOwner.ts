import type {
  Evolu,
  NonEmptyReadonlyArray,
  Owner,
  OwnerTransport,
  ReadonlyOwner,
} from "@evolu/common";
import { isDatabaseDeleted } from "@evolu/common/local-first";
import { isServerRendering } from "./isServerRendering.ts";
import { subscribeForScope } from "./subscribeForScope.ts";
import { useEvolu } from "./useEvolu.ts";

/**
 * Vue composable for Evolu `useOwner` method.
 *
 * Using an Owner means syncing it with the provided transports, or the
 * transports defined in Evolu config when transports are omitted. The owner is
 * used until the current effect scope, such as the component, is disposed, or
 * until {@link Evolu.deleteOwner} deletes it, which this scope does not undo. A
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
  // The deletion of its database disposed the instance, whose methods throw.
  if (isDatabaseDeleted(evolu)) return;

  subscribeForScope(() => evolu.useOwner(owner, transports));
};
