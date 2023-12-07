# @evolu/common-react

## 4.0.0

### Patch Changes

- Updated dependencies [bc18e74]
  - @evolu/common@2.2.0

## 3.0.0

### Major Changes

- 1eef638: Static React Hooks

  We changed the way how React Hooks are used. Instead of destructuring, we just import them.

  ```ts
  // Not anymore.
  const { useEvolu, useEvoluError, useQuery, useOwner } = evolu;
  ```

  Import hooks. Also, `EvoluProvider` is now required.

  ```ts
  import {
    EvoluProvider,
    useEvolu,
    useEvoluError,
    useOwner,
    useQuery,
  } from "@evolu/react";

  const Database = S.struct({
    todo: TodoTable,
  });
  type Database = S.Schema.To<typeof Database>;

  // Note `Database` must be passed to useEvolu.
  const { create, update } = useEvolu<Database>();

  // It's also possible to do this:
  const useEvolu = Evolu.useEvolu<Database>;
  ```

### Patch Changes

- Updated dependencies [1eef638]
  - @evolu/common@2.1.0

## 2.0.2

### Patch Changes

- b06757c: Update readme
- Updated dependencies [b06757c]
  - @evolu/common@2.0.5

## 2.0.1

### Patch Changes

- fea7623: Fix SSR

## 2.0.0

### Major Changes

- 7e80483: New API

  With the upcoming React 19 `use` Hook, I took a chance to review and improve the Evolu API. I moved as many logic and types as possible to the Evolu interface to make platform variants more lightweight and to allow the use of Evolu directly out of any UI library.

  The most significant change is the split of SQL query declaration and usage. The rest of the API is almost identical except for minor improvements and one removal: filterMap helper is gone.

  It was a good idea with a nice DX, but such ad-hoc migrations belong in the database, not the JavaScript code. Filtering already loaded data pulls excessive data that should stay in the database. The good news is we can do that and even better with Kysely.

  To refresh what we are talking about for Evolu newcomers. Because database schema is evolving, and we can't do classical migrations in local-first apps (because we don't delete and other CRDT stuff), Evolu adopted GraphQL schema-less everything-is-nullable pattern.

  Having nullable everywhere in code is not ideal DX, so it would be nice to filter, ensure non-nullability, and even map rows directly in the database. Surprisingly, SQL is capable of that. Expect Evolu DSL for that soon. Meanwhile, we can do that manually:

  ```ts
  const todosWithout = evolu.createQuery((db) =>
    db
      .selectFrom("todo")
      .select(["id", "title", "isCompleted", "categoryId"])
      .where("isDeleted", "is not", Evolu.cast(true))
      // Filter null value and ensure non-null type. Evolu will provide a helper.
      .where("title", "is not", null)
      .$narrowType<{ title: Evolu.NonEmptyString1000 }>()
      .orderBy("createdAt"),
  );
  ```

  And now to the new API. Behold:

  ```ts
  // Create queries.
  const allTodos = evolu.createQuery((db) => db.selectFrom("todo").selectAll());
  const todoById = (id: TodoId) =>
    evolu.createQuery((db) =>
      db.selectFrom("todo").selectAll().where("id", "=", id),
    );

  // We can load a query or many queries.
  const allTodosPromise = evolu.loadQuery(allTodos).then(({ rows }) => {
    console.log(rows);
  });
  evolu.loadQueries([allTodos, todoById(1)]);

  // useQuery can load once or use a promise.
  const { rows } = useQuery(allTodos);
  const { rows } = useQuery(allTodos, { once: true });
  const { rows } = useQuery(allTodos, { promise: allTodosPromise });
  const { row } = useQuery(todoById(1));
  ```

  I also refactored (read: simplified) the usage of Effect Layers across all libraries. And the last thing: There is no breaking change in data storage or protocol.

### Patch Changes

- Updated dependencies [7e80483]
  - @evolu/common@2.0.0

## 1.0.9

### Patch Changes

- e392fe8: Allow to disable React Suspense per useQuery

  React Suspense is enabled by default but can be optionally disabled
  per useQuery hook. When disabled, useQuery will not stop rendering
  and will return empty rows instead.

  That can be helpful to avoid waterfall when using more than one
  useQuery within one React Component. In such a situation, disable
  Suspense for all useQuery hooks except the last one.

  Because Evolu queues queries within a microtask sequentially, all
  queries will be batched within one roundtrip.

  Another use case is to optimistically prefetch data that might be
  needed in a future render without blocking the current render.

## 1.0.8

### Patch Changes

- 51ead17: Make useQuery filterMap optional and reusable
- 8eaff48: Remove conditional queryCallback

  Conditional useQuery callback wasn't documented, and it's an antipattern. With Kysely Relations, it's possible to nest related rows in queries now.

- Updated dependencies [db84a4e]
- Updated dependencies [51ead17]
  - @evolu/common@1.0.15

## 1.0.7

### Patch Changes

- 44caee5: Update deps
- 44caee5: Ensure valid device clock and Timestamp time.

  Millis represents a time that is valid for usage with the Merkle tree. It must be between Apr 13, 1997, and Nov 05, 2051, to ensure MinutesBase3 length equals 16. We can find diff for two Merkle trees only within this range. If the device clock is out of range, Evolu will not store data until it's fixed.

- Updated dependencies [44caee5]
- Updated dependencies [44caee5]
  - @evolu/common@1.0.10

## 1.0.6

### Patch Changes

- ad267b4: Update deps
- Updated dependencies [ad267b4]
  - @evolu/common@1.0.9

## 1.0.5

### Patch Changes

- a938b3d: Update deps
- Updated dependencies [a938b3d]
  - @evolu/common@1.0.7

## 1.0.4

### Patch Changes

- 43ae617: Update peer dependencies
- Updated dependencies [43ae617]
  - @evolu/common@1.0.6

## 1.0.3

### Patch Changes

- c406a60: Update deps
- Updated dependencies [c406a60]
  - @evolu/common@1.0.3

## 1.0.2

### Patch Changes

- 0a6f7e7: Update deps, remove Match depedency
- Updated dependencies [0a6f7e7]
  - @evolu/common@1.0.2

## 1.0.1

### Patch Changes

- 768427c: Fix files in @evolu/common-react package.json

## 1.0.0

### Major Changes

- 17e43c8: Split evolu library to platform libraries

### Patch Changes

- Updated dependencies [17e43c8]
  - @evolu/common@1.0.0
