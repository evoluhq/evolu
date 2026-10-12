---
"@evolu/common": patch
"@evolu/react": patch
---

Rejected loads and exports that SQLite fails instead of refusing the database

Since 8.20.3, a query or an export that SQLite failed, such as a query with a syntax error in a raw SQL fragment or one calling `json_extract` on text that is not JSON, refused its database. Every tab got an `UnknownError` as `evoluError`, the load or export stayed pending, and mutations waiting behind it or made after it were never stored. Before 8.20.3, the database stopped answering while `evoluError` stayed `null`, and in React Native a failed query was fatal. A mutation was also rolled back and reported as failed when one of its instance's subscribed queries failed on the data it wrote.

Now only the failed query fails. `loadQuery` rejects with an `UnknownError` of SQLite's error, other queries load, mutations are stored, and `evoluError` is not set. A rejected load stays cached until a mutation or sync invalidates it, so React's `useQuery` throws the error to the nearest error boundary instead of suspending again. When SQLite fails a subscribed query's refresh, the query keeps its rows, its loads reject until a refresh succeeds, and its subscribers are notified, so `useQuery` throws then. The mutation that caused the refresh is stored and its `onComplete` runs, unless the error, such as an I/O error, made SQLite roll the mutation back. `exportDatabase` rejects with an `UnknownError`, and the next call exports again.

`loadQuery` no longer always resolves, so put React views whose queries can fail, such as ones built from SQL a user wrote, behind an error boundary, and catch where you await a load. Vue's `useQuery` and Svelte's `queryState` keep their rows. A failed load they start, and in Vue also a cached failed load, is reported as an unhandled rejection, and a failed refresh is not reported.
