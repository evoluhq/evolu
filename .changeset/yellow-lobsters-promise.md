---
"@evolu/common": minor
---

Indexes (or indices, we don't judge)

This release brings SQLite index support to Evolu with two helpful options for `evolu.createQuery` functions. Use both of them before adding an index.

```ts
const allTodos = evolu.createQuery((db) => db.selectFrom("todo").selectAll(), {
  logExecutionTime: true,
  explainQueryPlan: false,
});
```
