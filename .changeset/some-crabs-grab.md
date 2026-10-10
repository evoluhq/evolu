---
"@evolu/svelte": patch
---

Fixed queryState showing rows of a previous query

When the query of `queryState` changed and a load of a previous query finished last, `rows` showed that query's rows until the current query's data changed, for example after switching to a query and back before it loaded. `rows` now holds only rows of the current query, so it is empty until that query loads and while there is no query. Previously, the rows of the previous query stayed in both cases.
