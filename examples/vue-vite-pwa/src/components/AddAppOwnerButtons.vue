<script setup lang="ts">
import { createOwnerSecret } from "@evolu/common";
import { addAppOwner, restoreAppOwner, run, useEvoluApp } from "../evolu";

const app = useEvoluApp();
</script>

<template>
  <button @click="addAppOwner(app, createOwnerSecret(run.deps))">
    Create Account
  </button>
  <button @click="restoreAppOwner(app)">Restore Account</button>
</template>
