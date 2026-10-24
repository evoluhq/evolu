---
"@evolu/oxlint-config": minor
---

Allowed tagged templates whose result is unused, and added evolu/no-unused-sql-query for the sql tag

`eslint/no-unused-expressions` now allows a tagged template whose result is unused, because a tagged template can run what it builds, as `sqlite.prepared` from `@evolu/common` runs SQL. Other unused expressions are still errors, and the new `evolu/no-unused-sql-query` rule still reports a statement that only builds a query with Evolu's `sql`, which runs nothing, also when `sql` is imported under another name or used through a namespace import.
