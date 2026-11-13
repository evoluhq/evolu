<script setup lang="ts">
import {
  createObjectURL,
  type EvoluDisposedError,
  type UnknownError,
} from "@evolu/common";
import type { DevicePersistence } from "@evolu/common/local-first";
import { shallowRef } from "vue";
import { useEvolu } from "../evolu";
import AddAppOwnerButtons from "./AddAppOwnerButtons.vue";
import AppOwnerList from "./AppOwnerList.vue";

// The AppOwners on this device, with the open one's mnemonic, the backup that
// restores its synced data on another device or after this one loses it, a
// plaintext copy of its database, and deleting its database on this device.
const evolu = useEvolu();
const { appOwner } = evolu;
const showMnemonic = shallowRef(false);

const devicePersistence = shallowRef<DevicePersistence | null>(null);
void evolu.devicePersistence.then((value) => {
  devicePersistence.value = value;
});

const download = () => {
  void evolu
    .exportDatabase()
    .then((data) => {
      using objectUrl = createObjectURL(
        new Blob([data], { type: "application/x-sqlite3" }),
      );
      const link = document.createElement("a");
      link.href = objectUrl.url;
      link.download = `${evolu.name}.sqlite3`;
      link.click();
    })
    .catch((error: EvoluDisposedError | UnknownError) => {
      // A deletion or removal disposed the instance first.
      if (error.type === "EvoluDisposedError") return;
      alert("Downloading the database failed. Try again.");
    });
};

const deleteDatabase = () => {
  if (
    !confirm(
      "Delete this account's database on this device? What synced comes back from the relays; changes that haven't synced yet are lost.",
    )
  )
    return;
  // Every tab that has the AppOwner open opens its database again, empty, and
  // the relay syncs back what it has.
  void evolu.deleteDatabase().then((deleted) => {
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

<template>
  <section aria-label="Accounts">
    <h2>Accounts</h2>
    <p>
      Each account has its own data, encrypted with the account's secret, which
      its mnemonic restores on another device.
    </p>
    <AppOwnerList :open-id="appOwner.id" />
    <AddAppOwnerButtons />
    <button @click="showMnemonic = !showMnemonic">
      {{ showMnemonic ? "Hide" : "Show" }} Mnemonic
    </button>
    <label v-if="showMnemonic">
      Mnemonic of the open account (keep it safe)
      <textarea :value="appOwner.mnemonic" readonly rows="3"></textarea>
    </label>
    <!-- Where the browser keeps the data but may delete it, the mnemonic is
      what brings synced data back. NotPersisted has its notice above the
      data. -->
    <p v-if="devicePersistence === 'Unknown'">
      This browser stores your data, but it may delete it, such as when disk
      space runs low. Keep your mnemonic: it restores what has synced.
    </p>
    <p>
      The download is a plaintext copy of this account's database that any
      SQLite tool reads; Evolu can't restore it.
    </p>
    <button @click="download()">Download Database</button>
    <p>
      You'll most likely never need this, but if this account's database on this
      device breaks, for example through faulty storage or a bug in the browser,
      Delete Database deletes it but keeps the account, so you don't need its
      mnemonic. What synced comes back from the relays, and only changes that
      haven't synced yet are lost.
    </p>
    <button @click="deleteDatabase()">Delete Database</button>
  </section>
</template>
