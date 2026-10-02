---
"@evolu/common": patch
---

Fixed logQueryExecutionTime measuring the wrong time

The `logQueryExecutionTime` query option logged with `console.time` at the
`debug` level, so it printed nothing at the default level, and a tab replaying a
worker's timer measured the gap between the replayed entries instead of the
query. It now logs `[logQueryExecutionTime]` with the query and its duration at
the `log` level, like `logExplainQueryPlan`.
