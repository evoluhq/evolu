<script lang="ts">
  import { syncStateToRelaySyncStates } from "@evolu/common/local-first";
  import { storeState } from "@evolu/svelte";
  import { untrack } from "svelte";
  import { relaySyncStateToMessage, syncState, type AppEvolu } from "../evolu";

  // The open AppOwner's relays, each with its connection and how far this
  // database is synced through it. SyncStatus tells the user only what needs
  // attention; this is the detail behind it.
  const props: { evolu: AppEvolu } = $props();
  const evolu = untrack(() => props.evolu);

  // The whole snapshot, so it updates on every change, which suits a detail
  // view.
  const snapshot = storeState(syncState);

  const relays = $derived(
    syncStateToRelaySyncStates(
      snapshot.current,
      evolu.name,
      evolu.appOwner.id,
    ),
  );
</script>

<section aria-label="Relays">
  <h2>Relays</h2>
  {#if relays.length === 0}
    <p class="note">No relay syncs this account.</p>
  {:else}
    <ul aria-label="Relays">
      {#each relays as relay (relay.transport.id)}
        <li class="relay">
          <span class="detail">{relay.transport.label}</span>
          <span class="note">{relaySyncStateToMessage(relay)}</span>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .relay {
    flex-direction: column;
    align-items: flex-start;
    gap: 0;
  }
</style>
