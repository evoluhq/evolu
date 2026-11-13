---
"@evolu/svelte": minor
---

Added loaded to queryState

A component couldn't tell a loading query from an empty one, and a query SQLite failed reached no UI, only an unhandled rejection, so apps listed each query twice, once for `queryState` and once for an `{#await}` of `evolu.loadQuery`. `queryState` now returns a `QueryState`, whose `loaded` is the current query's first load, so a component renders `{#await todos.loaded}`, what shows while the query loads, `{:then}`, the rows of `todos.rows`, `{:catch error}`, the failure, `{/await}`. When the query changes, `loaded` is the new query's first load, and a later refresh leaves it as it is. A failure the component awaits isn't also reported as an unhandled rejection, and one that nothing awaits still is. Without a query, `loaded` has resolved with no rows. It stays pending for an instance whose database was deleted, as React's `useQuery` stays suspended, and while a refused database answers no load.
