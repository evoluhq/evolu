---
"@evolu/common": minor
---

Indexes (or indices, we don't judge)

This release brings SQLite index support to Evolu with two helpful options for `evolu.createQuery` functions.

```ts
const allTodos = evolu.createQuery((db) => db.selectFrom("todo").selectAll(), {
  logExecutionTime: true,
  logExplainQueryPlan: false,
});
```
