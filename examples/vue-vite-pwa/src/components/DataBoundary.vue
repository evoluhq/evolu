<script setup lang="ts">
import { onErrorCaptured, shallowRef } from "vue";
import Projects from "./Projects.vue";

// Shows that the open account's data couldn't load, such as when SQLite fails
// a query on a corrupt page, where Vue would only log the error and leave the
// section empty. It bounds only the data, so errors of the other sections
// reach Vue's own handling. EvoluAppProvider's default slot remounts for each
// AppOwner's instance, which resets it.
const failed = shallowRef(false);
onErrorCaptured((error) => {
  // Returning false stops Vue's own logging, so it's logged here.
  console.error("The account's data failed to load:", error);
  failed.value = true;
  return false;
});
</script>

<template>
  <p v-if="failed" role="alert">
    This account's data couldn't load. See the console for details. You can
    still open another account, remove this one, or delete its database.
  </p>
  <Suspense v-else>
    <Projects />
    <template #fallback>
      <p>Loading…</p>
    </template>
  </Suspense>
</template>
