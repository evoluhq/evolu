<script lang="ts">
  import type { AppOwnerEntry } from "@evolu/common";
  import { queryState } from "@evolu/svelte";
  import { untrack } from "svelte";
  import {
    projectsQuery,
    projectsWithTodosQuery,
    type App,
    type AppEvolu,
  } from "../evolu";
  import Accounts from "./Accounts.svelte";
  import Projects from "./Projects.svelte";
  import Relays from "./Relays.svelte";
  import SyncStatus from "./SyncStatus.svelte";

  // The app and the instance of the AppOwner this tab has open. The parent
  // remounts this component when the tab opens another, so they're read once,
  // untracked.
  const props: {
    app: App;
    evolu: AppEvolu;
    appOwners: ReadonlyArray<AppOwnerEntry>;
  } = $props();
  const app = untrack(() => props.app);
  const evolu = untrack(() => props.evolu);

  const projectsWithTodos = queryState(evolu, () => projectsWithTodosQuery);
  const projects = queryState(evolu, () => projectsQuery);

  // Svelte's equivalent of Suspense: the data renders once its first loads
  // end, so the list never shows empty before its rows arrive. A refused
  // database never ends them, so the accounts and relays sections don't wait
  // for them, and the user can still open, add, or remove an account. Each
  // `loaded` becomes the query's first load once queryState's effect starts
  // it, so this follows them.
  const loaded = $derived(
    Promise.all([
      evolu.devicePersistence,
      projectsWithTodos.loaded,
      projects.loaded,
    ]),
  );
  // Evolu doesn't log a failed query, and the {:catch} below points here.
  $effect(() => {
    loaded.catch((error: unknown) => {
      console.error("The account's data failed to load:", error);
    });
  });
</script>

<SyncStatus {evolu} />

{#await loaded}
  <p class="note">Loading…</p>
{:then [devicePersistence]}
  <!-- Where the browser offers no persistent storage, as in Safari's Private
  Browsing or a Firefox private window. See `DevicePersistence` in
  `@evolu/common/local-first`. -->
  {#if devicePersistence === "NotPersisted"}
    <p class="note">
      Your data isn't kept on this device. Changes that haven't synced are lost
      when you close this tab.
    </p>
  {/if}
  <Projects {evolu} {projectsWithTodos} {projects} />
{:catch}
  <p class="note" role="alert">
    This account's data couldn't load. See the console for details. You can
    still open another account, remove this one, or delete its database.
  </p>
{/await}

<Accounts {app} {evolu} appOwners={props.appOwners} />
<Relays {evolu} />
