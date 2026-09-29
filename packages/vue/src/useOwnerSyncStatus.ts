import type { ReadonlyStore } from "@evolu/common";
import {
  syncStateToOwnerSyncStatus,
  type Evolu,
  type Owner,
  type OwnerSyncStatus,
  type ReadonlyOwner,
  type SyncState,
  type SyncStateDep,
} from "@evolu/common/local-first";
import {
  getCurrentInstance,
  onMounted,
  onScopeDispose,
  type Ref,
  shallowReadonly,
  shallowRef,
} from "vue";
import { isServerRendering } from "./isServerRendering.ts";
import { useEvolu } from "./useEvolu.ts";

/**
 * Vue composable returning the {@link OwnerSyncStatus} of an owner in the
 * database of the provided {@link Evolu} instance, read from `syncState`, the
 * {@link SyncStateDep.syncState} store of the deps the instance was created
 * with. Without an owner, it is the status of {@link Evolu.appOwner}. Otherwise
 * pass the owner `useOwner` takes; a null owner, for a component that waits for
 * one, gives `NoRelays`. Like the other composables, it reads its arguments
 * once, so a component that shows another owner is keyed by that owner. Before
 * the first snapshot, during server rendering, and until a hydrating component
 * mounts, the status is `NoRelays`. Server rendering starts when the server
 * renderer does, so a call on the server before that, such as from a store that
 * a router guard uses first, follows the store as on the client.
 *
 * A status keeps its object while it is unchanged, so the ref changes only when
 * the status does. It stops following the store when the current effect scope,
 * such as the component, is disposed. See {@link OwnerSyncStatus} for what to
 * show.
 */
export function useOwnerSyncStatus(
  syncState: ReadonlyStore<SyncState | null>,
): Readonly<Ref<OwnerSyncStatus>>;
/** For the owner `useOwner` takes, or null while there is none. */
export function useOwnerSyncStatus(
  syncState: ReadonlyStore<SyncState | null>,
  owner: ReadonlyOwner | Owner | null,
): Readonly<Ref<OwnerSyncStatus>>;
export function useOwnerSyncStatus(
  syncState: ReadonlyStore<SyncState | null>,
  owner?: ReadonlyOwner | Owner | null,
): Readonly<Ref<OwnerSyncStatus>> {
  const evolu = useEvolu();
  const { name } = evolu;
  // Only the overload without an owner leaves it undefined.
  const id =
    owner === undefined ? evolu.appOwner.id : owner === null ? null : owner.id;

  // Server rendering follows no store, and a hydrating component renders what
  // the server rendered, so both start from NoRelays, as React's server
  // snapshot does.
  if (id === null || isServerRendering())
    return shallowReadonly(shallowRef(noRelaysSyncStatus));

  const readStatus = () =>
    syncStateToOwnerSyncStatus(syncState.get(), name, id);
  // Hydration sets the component's element before its setup runs. A hydrating
  // component reads the store once it mounts, not while an async setup waits.
  const isHydrating = getCurrentInstance()?.vnode.el != null;
  let isFollowing = !isHydrating;
  // Without a snapshot, the status is the same NoRelays object the store gives
  // before its first snapshot, so mounting does not render again.
  const status = shallowRef(
    isFollowing ? readStatus() : syncStateToOwnerSyncStatus(null, name, id),
  );

  if (isHydrating)
    onMounted(() => {
      isFollowing = true;
      status.value = readStatus();
    });
  // A shallowRef ignores an assignment of the object it already holds.
  onScopeDispose(
    syncState.subscribe(() => {
      if (isFollowing) status.value = readStatus();
    }),
  );

  return shallowReadonly(status);
}

const noRelaysSyncStatus: OwnerSyncStatus = { type: "NoRelays" };
