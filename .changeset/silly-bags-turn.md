---
"@evolu/common": minor
---

Added loadQuery's cache option, which reads the rows SQLite holds now

`loadQuery` returns the query's cached or pending load, which can miss a change another tab stored a moment ago. With `{ cache: false }`, it reads the rows SQLite holds now, after the mutations this instance made before it and the changes other tabs stored before it, so code holding a lock, such as `acquireLeaderLock`, can check rows another tab wrote under the same lock. Its answer updates the cached rows and settled loads like any load's, and pending loads keep their promises, which React Suspense relies on. On a refused database, it rejects with an `UnknownError`, the refusal itself or one wrapping it, while cached loads stay pending.

```ts
import {
  assertType,
  createQueryBuilder,
  id,
  NonEmptyTrimmedString100,
  type Evolu,
  type QueryRows,
} from "@evolu/common";

const Schema = { todo: { id: id("Todo"), title: NonEmptyTrimmedString100 } };
const todosQuery = createQueryBuilder(Schema)((db) =>
  db.selectFrom("todo").select(["id", "title"]),
);

const loadTodosNow = (evolu: Evolu<typeof Schema>) =>
  evolu.loadQuery(todosQuery, { cache: false });

assertType<
  Awaited<ReturnType<typeof loadTodosNow>>,
  QueryRows<typeof todosQuery.Row>
>();
```
