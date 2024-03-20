---
"@evolu/common": minor
---

Indexes (or indices, we don't judge)

This release brings SQLite indexes support to Evolu with two helpful options for `evolu.createQuery` functions.

```ts
const indexes = [
  createIndex("indexTodoCreatedAt").on("todo").column("createdAt"),
];

const evolu = createEvolu(Database, {
  // Try to remove/re-add indexes with `logExplainQueryPlan`.
  indexes,
});

const allTodos = evolu.createQuery(
  (db) => db.selectFrom("todo").orderBy("createdAt").selectAll(),
  {
    logExecutionTime: true,
    // logExplainQueryPlan: false,
  },
);
```

Indexes are not necessary for development but are required for production.

Before adding an index, use `logExecutionTime` and `logExplainQueryPlan`
createQuery options.

SQLite has [a tool](https://sqlite.org/cli.html#index_recommendations_sqlite_expert_) for index recommendations.
