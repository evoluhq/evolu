---
"@evolu/common": patch
---

Fixed queries by ID reading the whole table

A query that finds or joins rows by ID alone, such as `.where("id", "=", id)` or a join on a column that holds an ID, read the whole table, because an app table's primary key starts with `ownerId`. Evolu now indexes `id` in every app table, so such a query searches the index. An existing database gets the indexes on its next start, which reads each table once. An index the app defined on `id` alone is no longer needed.
