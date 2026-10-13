---
"@evolu/vue": patch
---

Removed the promise options of useQuery and useQueries

`useQuery` no longer accepts a `promise` option, and `useQueries` no longer accepts `promises`, as in `@evolu/react`. They were redundant: Evolu caches each load, so a query prefetched with `evolu.loadQuery`, for example in a router guard, is not loaded again, and `useQuery` reads the same cached load. Drop the options and keep the prefetch:

```ts
import {
  assertType,
  createQueryBuilder,
  testEvoluSchema,
  type Evolu,
  type QueryRows,
  type TestEvoluSchema,
} from "@evolu/common";
import { useQuery } from "@evolu/vue";

const createQuery = createQueryBuilder(testEvoluSchema);
const allTodos = createQuery((db) => db.selectFrom("todo").selectAll());

// Prefetch the rows, for example in a router guard.
const prefetchTodos = (evolu: Evolu<TestEvoluSchema>) =>
  evolu.loadQuery(allTodos);

const useTodos = (promise: ReturnType<typeof prefetchTodos>) => {
  // @ts-expect-error useQuery no longer accepts a promise option.
  useQuery(allTodos, { promise });
  // Reads the load prefetchTodos started.
  return useQuery(allTodos);
};

assertType<
  ReturnType<typeof useTodos>["value"],
  QueryRows<typeof allTodos.Row>
>();
```
