<script setup lang="ts">
import AddAppOwnerButtons from "./AddAppOwnerButtons.vue";
import AppOwnerList from "./AppOwnerList.vue";

// Shown while this tab has no AppOwner open: at the first start of an app that
// starts with a choice, and after the open one's removal.
</script>

<template>
  <section aria-label="Accounts">
    <h2>Accounts</h2>
    <p>No account is open on this device.</p>
    <AppOwnerList :open-id="null" />
    <AddAppOwnerButtons />
  </section>
</template>
