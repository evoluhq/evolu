---
"@evolu/common": patch
---

Add ExtractRow type helper

Extract `Row` from `Query` instance.

```ts
const allTodos = evolu.createQuery((db) => db.selectFrom("todo").selectAll());
type AllTodosRow = ExtractRow<typeof allTodos>;
```
