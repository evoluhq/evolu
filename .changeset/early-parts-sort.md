---
"@evolu/vue": minor
---

Added waitForRows

A component couldn't tell a loading query from an empty one, and a query SQLite failed reached no UI, only an unhandled rejection, so apps listed each query twice, once for `useQuery` and once for an `await evolu.loadQuery` under `<Suspense>`. `waitForRows` takes the rows that `useQuery`, `useQueries`, `useDeviceQuery`, or `useDeviceQueries` returned and waits for their first loads, so an async setup under `<Suspense>` renders once they loaded. It rejects with the first failure, which then reaches `onErrorCaptured` of a component above and isn't also reported as an unhandled rejection; a failed load that no `waitForRows` awaits is still reported as one. It stays pending for an instance whose database was deleted, as React's `useQuery` stays suspended, and while a refused database answers no load.

```ts
import {
  assertType,
  createQueryBuilder,
  testEvoluSchema,
  type QueryRows,
} from "@evolu/common";
import { useQueries, useQuery, waitForRows } from "@evolu/vue";
import type { Ref } from "vue";

const createQuery = createQueryBuilder(testEvoluSchema);
const allTodos = createQuery((db) => db.selectFrom("todo").selectAll());
const allProjects = createQuery((db) => db.selectFrom("project").selectAll());

// An async setup of a component under <Suspense>.
const setup = async () => {
  // oxlint-disable-next-line react/rules-of-hooks -- Composables run before the await.
  const todos = useQuery(allTodos);
  // oxlint-disable-next-line react/rules-of-hooks -- Composables run before the await.
  const [projects] = useQueries([allProjects]);
  // A failure reaches onErrorCaptured of a component above.
  await waitForRows(todos, projects);
  return { todos, projects };
};

assertType<
  Awaited<ReturnType<typeof setup>>["projects"],
  Readonly<Ref<QueryRows<typeof allProjects.Row>>>
>();
```
