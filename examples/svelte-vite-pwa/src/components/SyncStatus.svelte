<script lang="ts">
  import { ownerSyncStatusState } from "@evolu/svelte";
  import { untrack } from "svelte";
  import { syncState, type AppEvolu } from "../evolu";

  const props: { evolu: AppEvolu } = $props();
  const evolu = untrack(() => props.evolu);

  // `syncState` is shared by all Evolu instances created from these deps and
  // lists every database, even other tabs', so this follows the AppOwner of
  // this one.
  const sync = ownerSyncStatusState(evolu, syncState);

  /**
   * Tells the user when changes can't leave this device, and nothing while
   * sync works. See `OwnerSyncStatus` in `@evolu/common/local-first`.
   */
  const message = $derived.by(() => {
    const { status } = sync;
    // An app that sells relay quota offers more for a ProtocolQuotaError, then
    // calls `evolu.requestSync(evolu.appOwner.id)`.
    return status.type === "Disconnected"
      ? "Can't reach the sync server. Changes will sync once the connection is back."
      : status.type === "Error"
        ? status.error.type === "ProtocolQuotaError"
          ? "Sync is paused because the sync server is full."
          : `Sync error: ${status.error.type}.`
        : null;
  });
</script>

<!-- Always mounted: screen readers announce changes only in a live region
that already exists. -->
<div role="status">
  {#if message}
    <p class="note">{message}</p>
  {/if}
</div>
