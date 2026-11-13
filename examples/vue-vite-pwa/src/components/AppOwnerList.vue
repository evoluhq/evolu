<script setup lang="ts">
import { NonEmptyTrimmedString100, type OwnerId } from "@evolu/common";
import { useAppOwners } from "@evolu/vue";
import {
  formatDate,
  identiconUrl,
  promptStringWithAlert,
  useEvoluApp,
} from "../evolu";

defineProps<{ openId: OwnerId | null }>();

const app = useEvoluApp();
// The one opened most recently first.
const appOwners = useAppOwners();

const rename = (id: OwnerId, name: NonEmptyTrimmedString100 | null) => {
  const newName = promptStringWithAlert(
    "Name this account",
    NonEmptyTrimmedString100,
    name ?? undefined,
  );
  if (newName.ok) app.rename(id, newName.value);
};

const remove = (id: OwnerId, name: NonEmptyTrimmedString100 | null) => {
  if (
    !confirm(
      `Remove ${name ?? "this unnamed account"}? This removes it from this device and deletes its data here. Changes that haven't synced are lost. Synced data comes back when you restore the mnemonic.`,
    )
  )
    return;
  void app.remove(id).then((removed) => {
    // The app's disposal ends the call, and the removal finishes. A refused
    // device database shows as evoluError. A removal that failed, such as of
    // a database another context holds, finishes when it runs again.
    if (
      !removed.ok &&
      (removed.error.type === "DatabaseHeldError" ||
        removed.error.type === "UnknownError")
    )
      alert("Removing the account failed. Try again.");
  });
};
</script>

<template>
  <ul v-if="appOwners.length > 0" aria-label="Accounts on this device">
    <li v-for="appOwner in appOwners" :key="appOwner.id">
      <img :src="identiconUrl(appOwner.id)" width="32" height="32" alt="" />
      <span>
        {{ appOwner.name ?? "Unnamed account" }}
        <template v-if="appOwner.id === openId"> (open)</template>
      </span>
      <!-- A start records no open time, as for the first AppOwner, so it shows no line until it's opened again, except while it's open. -->
      <small v-if="appOwner.lastOpenedAt || appOwner.id === openId">
        {{
          appOwner.lastOpenedAt
            ? `Last opened ${formatDate(appOwner.lastOpenedAt)}`
            : "Open now"
        }}
      </small>
      <button v-if="appOwner.id !== openId" @click="app.open(appOwner.id)">
        Open
      </button>
      <button @click="rename(appOwner.id, appOwner.name)">Rename</button>
      <button @click="remove(appOwner.id, appOwner.name)">Remove</button>
    </li>
  </ul>
</template>
