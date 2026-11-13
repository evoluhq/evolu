<script setup lang="ts">
import { EvoluAppProvider } from "@evolu/vue";
import Accounts from "./components/Accounts.vue";
import DataBoundary from "./components/DataBoundary.vue";
import Relays from "./components/Relays.vue";
import SyncStatus from "./components/SyncStatus.vue";
import WithoutAppOwner from "./components/WithoutAppOwner.vue";
import { appPromise } from "./evolu";

// Root.vue's Suspense waits for the app's start and shows when it rejects.
const app = await appPromise;
</script>

<template>
  <!-- The default slot gets the open AppOwner's instance, and remounts when
    the tab opens another. The data loads under its own Suspense and error
    boundary: a refused database keeps its queries pending, and a query SQLite
    fails rejects, and either way the accounts and relays sections stay
    outside, where the user can still open, add, or remove an account, or
    delete this one's local data. -->
  <EvoluAppProvider :app="app">
    <SyncStatus />
    <DataBoundary />
    <Accounts />
    <Relays />
    <template #withoutAppOwner>
      <WithoutAppOwner />
    </template>
    <template #opening>
      <p>Opening…</p>
    </template>
  </EvoluAppProvider>
</template>
