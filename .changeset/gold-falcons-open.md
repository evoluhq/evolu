---
"@evolu/react": patch
---

Removed the promise options of useQuery and useQueries

`useQuery` no longer accepts a `promise` option, and `useQueries` no longer accepts `promises`. They were redundant: Evolu caches each load, so a query preloaded with `evolu.loadQuery` before rendering is not loaded again, and `useQuery` reads the same cached load, including its failure. Drop the options and keep the preload:

```ts
import {
  assertType,
  createQueryBuilder,
  testEvoluSchema,
  type Evolu,
  type QueryRows,
  type TestEvoluSchema,
} from "@evolu/common";
import { createEvoluBinding } from "@evolu/react";

const { useQuery } = createEvoluBinding<TestEvoluSchema>();
const createQuery = createQueryBuilder(testEvoluSchema);
const allTodos = createQuery((db) => db.selectFrom("todo").selectAll());

// Preload before rendering, for example in a router loader.
const preloadTodos = (evolu: Evolu<TestEvoluSchema>) =>
  evolu.loadQuery(allTodos);

const useTodos = (promise: ReturnType<typeof preloadTodos>) => {
  // @ts-expect-error useQuery no longer accepts a promise option.
  useQuery(allTodos, { promise });
  // Reads the load preloadTodos started.
  return useQuery(allTodos);
};

assertType<ReturnType<typeof useTodos>, QueryRows<typeof allTodos.Row>>();
```
