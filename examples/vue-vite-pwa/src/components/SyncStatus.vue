<script setup lang="ts">
import { useOwnerSyncStatus } from "@evolu/vue";
import { computed } from "vue";
import { run } from "../evolu";

// Sync state is shared by all Evolu instances created from these deps, so the
// composable takes its store and finds this database's AppOwner in it.
const status = useOwnerSyncStatus(run.deps.syncState);

/**
 * Tells the user when changes can't leave this device, and nothing while sync
 * works. See `OwnerSyncStatus` in `@evolu/common/local-first`.
 */
const message = computed(() =>
  // An app that sells relay quota offers more for a ProtocolQuotaError, then
  // calls `evolu.requestSync(evolu.appOwner.id)`.
  status.value.type === "Disconnected"
    ? "Can't reach the sync server. Changes will sync once the connection is back."
    : status.value.type === "Error"
      ? status.value.error.type === "ProtocolQuotaError"
        ? "Sync is paused because the sync server is full."
        : `Sync error: ${status.value.error.type}.`
      : null,
);
</script>

<template>
  <!-- Always mounted: screen readers announce changes only in a live region
    that already exists. -->
  <div role="status">
    <p v-if="message">{{ message }}</p>
  </div>
</template>
