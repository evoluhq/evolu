import type { Evolu, Owner, ReadonlyOwner } from "@evolu/common";
import {
  isDatabaseDeleted,
  type UseOwnerOptions,
} from "@evolu/common/local-first";
import { isServerRendering } from "./isServerRendering.ts";
import { subscribeForScope } from "./subscribeForScope.ts";
import { useEvolu } from "./useEvolu.ts";

/**
 * Vue composable for Evolu `useOwner` method.
 *
 * Using an Owner means syncing it with the transports of the options, or the
 * transports defined in Evolu config when they are omitted. The owner is used
 * until the current effect scope, such as the component, is disposed, or until
 * {@link Evolu.deleteOwner} deletes it, which this scope does not undo. With
 * {@link UseOwnerOptions.deleteWhenUnused}, the owner's rows are deleted once no
 * scope or other code uses it. A null owner uses none, and so does server
 * rendering. Server rendering starts when the server renderer does, so a call
 * on the server before that, such as from a store that a router guard uses
 * first, uses the owner as on the client. Like the other composables, it reads
 * its arguments once, so a component whose owner or options change is keyed by
 * them.
 */
export const useOwner = (
  owner: ReadonlyOwner | Owner | null,
  options?: UseOwnerOptions,
): void => {
  if (owner == null || isServerRendering()) return;

  const evolu = useEvolu();
  // The deletion of its database disposed the instance, whose methods throw.
  if (isDatabaseDeleted(evolu)) return;

  subscribeForScope(() => evolu.useOwner(owner, options));
};
