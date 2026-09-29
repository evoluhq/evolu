---
"@evolu/vue": patch
---

Stopped Vue composables from subscribing during server rendering

Vue never disposes a component rendered on the server, so every server render
left a query subscription of `useQuery` and `useQueries` behind, and `useOwner`
kept its owner in use. During server rendering, `useQuery` and `useQueries` now
only load their queries, so they still render empty rows, and `useOwner` uses no
owner, as the React binding does.
