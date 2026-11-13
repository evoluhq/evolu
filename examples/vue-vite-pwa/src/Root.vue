<script setup lang="ts">
import { useStore } from "@evolu/vue";
import { onErrorCaptured, shallowRef } from "vue";
import App from "./App.vue";
import { evoluErrorToMessage, run } from "./evolu";

// `evoluError` is shared by all Evolu instances created from these deps. It's
// followed here, above the app's Suspense, so the alert also shows while
// another build of the app keeps it waiting, and when it fails to start.
const evoluError = useStore(run.deps.evoluError);

// The app's start rejects when its database is refused; it shows here instead
// of an empty page. Only the start: once the Suspense resolves, errors go on
// to Vue's own handling, and DataBoundary.vue handles the data's.
const start = shallowRef<"Starting" | "Started" | "Failed">("Starting");
onErrorCaptured((error) => {
  if (start.value === "Started") return;
  // Returning false stops Vue's own logging, so it's logged here.
  console.error("The app failed to start:", error);
  start.value = "Failed";
  return false;
});

const reload = () => {
  location.reload();
};
</script>

<template>
  <main>
    <p>
      This app needs no passkey, so its data on this device isn't protected
      against malware, and it doesn't suit sensitive data.
    </p>
    <p v-if="evoluError" role="alert">
      {{ evoluErrorToMessage(evoluError) }}
    </p>
    <template v-if="start === 'Failed'">
      <p>The app couldn't start. See the console for details.</p>
      <button @click="reload()">Reload</button>
    </template>
    <Suspense v-else @resolve="start = 'Started'">
      <App />
      <template #fallback>
        <p>Opening…</p>
      </template>
    </Suspense>
  </main>
</template>
