<script lang="ts">
  import { evoluAppState } from "@evolu/svelte";
  import { untrack } from "svelte";
  import type { App } from "../evolu";
  import Accounts from "./Accounts.svelte";
  import OpenAppOwner from "./OpenAppOwner.svelte";

  // The app, once it opened. It doesn't change, so it's read once, untracked.
  const props: { app: App } = $props();
  const app = untrack(() => props.app);
  const appState = evoluAppState(app);
</script>

<!-- The key remounts the AppOwner's UI when the tab opens another AppOwner, so
no state of theirs outlives the database it came from. Without an AppOwner
open, as at the first start of an app that starts with a choice or after the
open one's removal, the accounts section offers one. -->
{#if appState.state.type === "Open"}
  {#key appState.state.evolu}
    <OpenAppOwner
      {app}
      evolu={appState.state.evolu}
      appOwners={appState.appOwners}
    />
  {/key}
{:else if appState.state.type === "None"}
  <Accounts {app} evolu={null} appOwners={appState.appOwners} />
{:else}
  <p class="note">Opening…</p>
{/if}
