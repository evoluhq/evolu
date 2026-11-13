---
"@evolu/vue": patch
---

Fixed Vue composables leaking subscriptions in a component that unmounted while its async setup awaited

A component whose `<script setup>` awaits before calling `useQuery`, `useQueries`, `useOwner`, or `useOwnerSyncStatus` could unmount during the await, such as when the user switched views. Vue then makes its stopped scope current again, which never runs what `onScopeDispose` registers, so the query's and the sync status's subscriptions stayed for the life of the Evolu instance, and `useOwner` kept syncing the owner over its transports. In such a scope, the query composables now return no rows without touching the instance, which the app may have disposed during the await, while `useOwner` uses no owner, and `useOwnerSyncStatus` reads the status once.
