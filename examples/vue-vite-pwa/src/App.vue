<script setup lang="ts">
import { EvoluProvider } from "@evolu/vue";
import { evolu } from "./composables/useEvolu";
import TodoList from "./components/TodoList.vue";
</script>

<template>
  <EvoluProvider :evolu="evolu">
    <TodoList />
  </EvoluProvider>
</template>

<style>
.completed {
  text-decoration: line-through;
}

.owner-actions {
  margin-top: 2rem;
}
</style>
