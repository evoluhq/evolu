<script lang="ts">
  import {
    createObjectURL,
    createOwnerSecret,
    NonEmptyTrimmedString100,
    type AppOwnerEntry,
    type EvoluDisposedError,
    type UnknownError,
  } from "@evolu/common";
  import {
    addAppOwner,
    formatDate,
    identiconUrl,
    promptStringWithAlert,
    restoreAppOwner,
    run,
    type App,
    type AppEvolu,
  } from "../evolu";

  // The AppOwners on this device, and with one open, its mnemonic, the backup
  // that restores its synced data on another device or after this one loses
  // it, a plaintext copy of its database, and deleting its database on this
  // device. Without one open, it's the choice to open, create, or restore one.
  const {
    app,
    evolu,
    appOwners,
  }: {
    app: App;
    evolu: AppEvolu | null;
    appOwners: ReadonlyArray<AppOwnerEntry>;
  } = $props();

  // It belongs to the open AppOwner's instance, whose remount resets it.
  let showMnemonic = $state(false);

  const rename = (appOwner: AppOwnerEntry) => {
    const name = promptStringWithAlert(
      "Name this account",
      NonEmptyTrimmedString100,
      appOwner.name ?? undefined,
    );
    if (name.ok) app.rename(appOwner.id, name.value);
  };

  const remove = (appOwner: AppOwnerEntry) => {
    if (
      !confirm(
        `Remove ${appOwner.name ?? "this unnamed account"}? This removes it from this device and deletes its data here. Changes that haven't synced are lost. Synced data comes back when you restore the mnemonic.`,
      )
    )
      return;
    void app.remove(appOwner.id).then((removed) => {
      // The app's disposal ends the call, and the removal finishes. A refused
      // device database shows as evoluError. A removal that failed, such as
      // of a database another context holds, finishes when it runs again.
      if (
        !removed.ok &&
        (removed.error.type === "DatabaseHeldError" ||
          removed.error.type === "UnknownError")
      )
        alert("Removing the account failed. Try again.");
    });
  };

  const download = (open: AppEvolu) => {
    void open
      .exportDatabase()
      .then((data) => {
        const objectUrl = createObjectURL(
          new Blob([data], { type: "application/x-sqlite3" }),
        );
        // Disposed by hand: the Svelte compiler doesn't parse `using` yet.
        try {
          const link = document.createElement("a");
          link.href = objectUrl.url;
          link.download = `${open.name}.sqlite3`;
          link.click();
        } finally {
          objectUrl[Symbol.dispose]();
        }
      })
      .catch((error: EvoluDisposedError | UnknownError) => {
        // A deletion or removal disposed the instance first.
        if (error.type === "EvoluDisposedError") return;
        alert("Downloading the database failed. Try again.");
      });
  };

  const deleteDatabase = (open: AppEvolu) => {
    if (
      !confirm(
        "Delete this account's database on this device? What synced comes back from the relays; changes that haven't synced yet are lost.",
      )
    )
      return;
    // Every tab that has the AppOwner open opens its database again, empty,
    // and the relay syncs back what it has.
    void open.deleteDatabase().then((deleted) => {
      // After a failure, such as a deletion another tab's open dialog delayed,
      // the instances keep working, and deleting again deletes again. Files
      // another context keeps holding also refuse the database, which
      // evoluError shows.
      if (
        !deleted.ok &&
        (deleted.error.type === "DatabaseHeldError" ||
          deleted.error.type === "UnknownError")
      )
        alert("Deleting the data failed. Try again.");
    });
  };
</script>

<section aria-label="Accounts">
  <h2>Accounts</h2>
  <p class="note">
    {evolu
      ? "Each account has its own data, encrypted with the account's secret, which its mnemonic restores on another device."
      : "No account is open on this device."}
  </p>
  {#if appOwners.length > 0}
    <!-- The one opened most recently first. -->
    <ul aria-label="Accounts on this device">
      {#each appOwners as appOwner (appOwner.id)}
        <li>
          <img src={identiconUrl(appOwner.id)} width="32" height="32" alt="" />
          <div class="entry">
            <span>
              {appOwner.name ?? "Unnamed account"}{appOwner.id ===
              evolu?.appOwner.id
                ? " (open)"
                : ""}
            </span>
            <!-- A start records no open time, as for the first AppOwner, so it shows no line until it's opened again, except while it's open. -->
            {#if appOwner.lastOpenedAt || appOwner.id === evolu?.appOwner.id}
              <span class="detail">
                {appOwner.lastOpenedAt
                  ? `Last opened ${formatDate(appOwner.lastOpenedAt)}`
                  : "Open now"}
              </span>
            {/if}
          </div>
          {#if appOwner.id !== evolu?.appOwner.id}
            <button class="text" onclick={() => app.open(appOwner.id)}>
              Open
            </button>
          {/if}
          <button class="text" onclick={() => rename(appOwner)}>Rename</button>
          <button class="text" onclick={() => remove(appOwner)}>Remove</button>
        </li>
      {/each}
    </ul>
  {/if}
  <button
    class="primary"
    onclick={() => addAppOwner(app, createOwnerSecret(run.deps))}
  >
    Create Account
  </button>
  <button onclick={() => restoreAppOwner(app)}>Restore Account</button>
  {#if evolu}
    <button onclick={() => (showMnemonic = !showMnemonic)}>
      {showMnemonic ? "Hide" : "Show"} Mnemonic
    </button>
    {#if showMnemonic}
      <label class="detail">
        Mnemonic of the open account (keep it safe)
        <textarea value={evolu.appOwner.mnemonic} readonly rows="3"></textarea>
      </label>
    {/if}
    <!-- Where the browser keeps the data but may delete it, the mnemonic is
    what brings synced data back. NotPersisted has its notice above the data. -->
    {#await evolu.devicePersistence then devicePersistence}
      {#if devicePersistence === "Unknown"}
        <p class="note">
          This browser stores your data, but it may delete it, such as when
          disk space runs low. Keep your mnemonic: it restores what has synced.
        </p>
      {/if}
    {/await}
    <p class="note">
      The download is a plaintext copy of this account's database that any
      SQLite tool reads; Evolu can't restore it.
    </p>
    <button onclick={() => download(evolu)}>Download Database</button>
    <p class="note">
      You'll most likely never need this, but if this account's database on
      this device breaks, for example through faulty storage or a bug in the
      browser, Delete Database deletes it but keeps the account, so you don't
      need its mnemonic. What synced comes back from the relays, and only
      changes that haven't synced yet are lost.
    </p>
    <button onclick={() => deleteDatabase(evolu)}>Delete Database</button>
  {/if}
</section>

<style>
  .entry {
    flex: 1;
    display: flex;
    flex-direction: column;
    font-size: 0.875rem;
  }

  textarea {
    width: 100%;
    font-family: monospace;
  }
</style>
