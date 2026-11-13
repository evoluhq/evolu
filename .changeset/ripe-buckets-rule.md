---
"@evolu/svelte": patch
---

Fixed queryState throwing after deleteDatabase

`deleteDatabase` disposes the instance, and the app reloads or replaces it afterward. Until then, `queryState` threw "Cannot use a disposed object." when its effect ran again, such as for a query that depends on rows the deletion emptied, and destroying the component then threw "subscribeQuery unsubscribe can be called only once." A `queryState` created after the deletion threw as well. It now checks `isDatabaseDeleted`, as the React binding does, and returns empty rows without loading or subscribing.
