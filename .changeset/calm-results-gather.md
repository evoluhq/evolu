---
"@evolu/common": major
---

Consolidated collection mapping into overloads of `allResult`, `all`, and
`allSettled`. Removed `mapResult`, `map`, `mapSettled`, `InferMapOk`, and
`InferMapSettled`. The `allResult` mapping overloads inferred unions of
heterogeneous Result errors returned by the mapper. Task mapping overloads
inferred intersections of heterogeneous Task dependencies returned by the
mapper.

Added an explicit `{ collect: false }` option to `allResult` and `all` for
operations whose success values weren't needed. They stopped on the first
error, returned `Result<void, E>` and `Task<void, E, D>` respectively, and did
not allocate a collection for the success values. Generic Result iterables were
consumed incrementally and stopped advancing on the first error.

```ts
allResult(values, toResult);
allResult(results, { collect: false });
allResult(values, toResult, { collect: false });
all(values, toTask);
all(tasks, { collect: false });
all(values, toTask, { collect: false });
allSettled(values, toTask);
```
