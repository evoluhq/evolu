---
"@evolu/vue": patch
---

Typed the refs of useQueries as read-only

`useQueries` returned each query's rows as a `Ref`, though the refs are read-only at run time, as `useQuery`'s are, and an assignment to one only warns. It now types them as `Readonly<Ref>`, so such an assignment doesn't compile.

```ts
import { createQueryBuilder, testEvoluSchema } from "@evolu/common";
import type { useQueries } from "@evolu/vue";

const allTodos = createQueryBuilder(testEvoluSchema)((db) =>
  db.selectFrom("todo").selectAll(),
);
type TodosRef = ReturnType<
  typeof useQueries<typeof testEvoluSchema, [typeof allTodos], []>
>[0];

// Rows change through mutations, which the refs then show.
const clearTodos = (todos: TodosRef) => {
  // @ts-expect-error Cannot assign to 'value' because it is a read-only property.
  todos.value = [];
};
void clearTodos;
```
