---
"@evolu/common": major
---

Consolidated collection mapping into overloads of `allResult`, `all`, and
`allSettled`. Removed `mapResult`, `map`, `mapSettled`, `InferMapOk`, and
`InferMapSettled`.

```ts
allResult(values, toResult);
all(values, toTask);
allSettled(values, toTask);
```
