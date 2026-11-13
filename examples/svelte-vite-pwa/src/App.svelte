<script lang="ts">
  import { storeState } from "@evolu/svelte";
  import AppView from "./components/AppView.svelte";
  import { appPromise, evoluError, evoluErrorToMessage } from "./evolu";

  const error = storeState(evoluError);
</script>

<main>
  <p class="intro">
    This app needs no passkey, so its data on this device isn't protected
    against malware, and it doesn't suit sensitive data.
  </p>

  <!-- Outside the await, so it also shows while another build of the app
  keeps it waiting, and when it fails to start. -->
  {#if error.current}
    <p class="evolu-error" role="alert">
      {evoluErrorToMessage(error.current)}
    </p>
  {/if}

  {#await appPromise}
    <p class="note">Opening…</p>
  {:then app}
    <AppView {app} />
  {:catch}
    <p class="note">The app couldn't start. See the console for details.</p>
    <button onclick={() => location.reload()}>Reload</button>
  {/await}
</main>

<style>
  main {
    max-width: 28rem;
    margin: 0 auto;
    padding: 2rem;
  }

  .intro {
    margin: 0 0 1.5rem;
    padding-left: 1rem;
    border-left: 2px solid #fbbf24;
    font-size: 0.875rem;
    color: #4b5563;
  }

  .evolu-error {
    margin: 0 0 1rem;
    padding: 0.75rem;
    border-radius: 0.375rem;
    background: #fef2f2;
    color: #991b1b;
    font-size: 0.875rem;
  }
</style>
