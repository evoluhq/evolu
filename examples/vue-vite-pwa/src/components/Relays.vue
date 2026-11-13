<script setup lang="ts">
import { syncStateToRelaySyncStates } from "@evolu/common/local-first";
import { useStore } from "@evolu/vue";
import { computed } from "vue";
import { relaySyncStateToMessage, run, useEvolu } from "../evolu";

// The open AppOwner's relays, each with its connection and how far this
// database is synced through it. SyncStatus tells the user only what needs
// attention; this is the detail behind it.
const { name, appOwner } = useEvolu();

// The whole snapshot, so it updates on every change, which suits a detail
// view. For one status, `useOwnerSyncStatus` updates only when it changes.
const syncState = useStore(run.deps.syncState);

const relays = computed(() =>
  syncStateToRelaySyncStates(syncState.value, name, appOwner.id),
);
</script>

<template>
  <section aria-label="Relays">
    <h2>Relays</h2>
    <p v-if="relays.length === 0">No relay syncs this account.</p>
    <ul v-else aria-label="Relays">
      <li v-for="relay in relays" :key="relay.transport.id">
        <small>{{ relay.transport.label }}</small>
        {{ relaySyncStateToMessage(relay) }}
      </li>
    </ul>
  </section>
</template>
