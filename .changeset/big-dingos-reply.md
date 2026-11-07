---
"@evolu/common": minor
---

Renamed onComplete to onSuccess and added onError to mutations

A mutation's `onComplete` ran only when the mutation was stored, though its name suggested it ran whenever the mutation ended, so code waiting on it, such as a promise around an insert, never settled when storing failed. It's now `onSuccess`, and the new `onError` runs instead when the mutation could not be stored. `evoluError` reports that error too, so pass `onError` only where code must know that the mutation ended. Neither runs while the database is unavailable, such as refused, or when the instance is disposed before it receives the mutation's result, so a promise like the one below then stays pending. TypeScript rejects `onComplete`, so rename it to `onSuccess`.

```ts
import {
  assertType,
  id,
  NonEmptyTrimmedString100,
  type Evolu,
} from "@evolu/common";

const Schema = { todo: { id: id("Todo"), title: NonEmptyTrimmedString100 } };

const insertTodo = (
  evolu: Evolu<typeof Schema>,
  title: NonEmptyTrimmedString100,
) =>
  new Promise<void>((resolve, reject) => {
    evolu.insert("todo", { title }, { onSuccess: resolve, onError: reject });
  });

const _insertTodoWithOnComplete = (
  evolu: Evolu<typeof Schema>,
  title: NonEmptyTrimmedString100,
) => {
  // @ts-expect-error MutationOptions has no onComplete; it's onSuccess now.
  evolu.insert("todo", { title }, { onComplete: () => undefined });
};

assertType<ReturnType<typeof insertTodo>, Promise<void>>();
```
