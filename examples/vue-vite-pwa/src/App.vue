<script setup lang="ts">
import HelloWorld from './components/HelloWorld.vue'
import PWABadge from './components/PWABadge.vue'
</script>

<template>
  <div>
    <a href="https://vite.dev" target="_blank">
      <img src="/favicon.svg" class="logo" alt="vue-vite-pwa logo" />
    </a>
    <a href="https://vuejs.org/" target="_blank">
      <img src="./assets/vue.svg" class="logo vue" alt="Vue logo" />
    </a>
  </div>
  <HelloWorld msg="vue-vite-pwa" />
  <PWABadge />
</template>

<style scoped>
.logo {
  height: 6em;
  padding: 1.5em;
  will-change: filter;
  transition: filter 300ms;
}
.logo:hover {
  filter: drop-shadow(0 0 2em #646cffaa);
}
.logo.vue:hover {
  filter: drop-shadow(0 0 2em #42b883aa);
}
</style>
