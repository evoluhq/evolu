---
"@evolu/vue": patch
---

Fixed Vue components throwing after deleteDatabase

`deleteDatabase` disposes the instance, and the app reloads or replaces it afterward. Until then, a component that set up after the deletion, such as one that shows when a list becomes empty, threw "Cannot use a disposed object." from `useQuery`, `useQueries`, or `useOwner`. They now check `isDatabaseDeleted`, as the React binding does: the query composables return empty rows, and `useOwner` uses no owner.
