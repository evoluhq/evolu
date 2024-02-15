# @evolu/react

## 5.0.3

### Patch Changes

- 1cf6502: Update Effect and Schema
- Updated dependencies [1cf6502]
  - @evolu/common@3.1.4
  - @evolu/common-react@5.0.3
  - @evolu/common-web@5.0.4

## 5.0.2

### Patch Changes

- 106462c: Update Effect and Schema

  Note API change: https://github.com/Effect-TS/effect/releases/tag/effect%402.3.0

- Updated dependencies [106462c]
  - @evolu/common-web@5.0.3
  - @evolu/common@3.1.3
  - @evolu/common-react@5.0.2

## 5.0.1

### Patch Changes

- b337e70: Update Effect and Schema
- Updated dependencies [b337e70]
  - @evolu/common@3.1.1
  - @evolu/common-react@5.0.1
  - @evolu/common-web@5.0.1

## 5.0.0

### Patch Changes

- Updated dependencies [ef32952]
  - @evolu/common@3.1.0
  - @evolu/common-react@5.0.0
  - @evolu/common-web@5.0.0

## 4.0.3

### Patch Changes

- 621f3a3: Update deps: Effect, Schema, sqlite-wasm, nanoid, better-sqlite3
- Updated dependencies [621f3a3]
  - @evolu/common-react@4.0.5
  - @evolu/common-web@4.0.7
  - @evolu/common@3.0.15

## 4.0.2

### Patch Changes

- b9e549a: Effect 2.1.2 and Schema 0.60.6
- Updated dependencies [b9e549a]
  - @evolu/common-react@4.0.4
  - @evolu/common-web@4.0.4
  - @evolu/common@3.0.12

## 4.0.1

### Patch Changes

- ffb503b: Effect 2.1.0 and Schema 0.60.3
- Updated dependencies [ffb503b]
  - @evolu/common-react@4.0.3
  - @evolu/common-web@4.0.3
  - @evolu/common@3.0.11

## 4.0.0

### Patch Changes

- Updated dependencies [d289ac7]
  - @evolu/common@3.0.0
  - @evolu/common-react@4.0.0
  - @evolu/common-web@4.0.0

## 3.0.1

### Patch Changes

- 7adfb47: Update peer deps

## 3.0.0

### Patch Changes

- Updated dependencies [1eef638]
- Updated dependencies [1eef638]
  - @evolu/common@2.1.0
  - @evolu/common-react@3.0.0
  - @evolu/common-web@3.0.0

## 2.0.8

### Patch Changes

- b06757c: Update readme
- Updated dependencies [b06757c]
  - @evolu/common@2.0.5
  - @evolu/common-react@2.0.2
  - @evolu/common-web@2.0.1

## 3.0.0

### Minor Changes

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
  - @evolu/common-react@2.0.0
  - @evolu/common-web@2.0.0
  - @evolu/common@2.0.0

## 2.0.6

### Patch Changes

- 9d319e5: Rename canUseDOM to canUseDom
- Updated dependencies [9d319e5]
  - @evolu/common-web@1.1.5
  - @evolu/common@1.0.13
  - @evolu/common-react@1.0.7

## 2.0.5

### Patch Changes

- 094e25a: Expose and leverage canUseDOM
- Updated dependencies [094e25a]
  - @evolu/common-web@1.1.4
  - @evolu/common@1.0.12
  - @evolu/common-react@1.0.7

## 2.0.4

### Patch Changes

- 44caee5: Update deps
- 44caee5: Ensure valid device clock and Timestamp time.

  Millis represents a time that is valid for usage with the Merkle tree. It must be between Apr 13, 1997, and Nov 05, 2051, to ensure MinutesBase3 length equals 16. We can find diff for two Merkle trees only within this range. If the device clock is out of range, Evolu will not store data until it's fixed.

- Updated dependencies [44caee5]
- Updated dependencies [44caee5]
  - @evolu/common-react@1.0.7
  - @evolu/common-web@1.1.3
  - @evolu/common@1.0.10

## 2.0.3

### Patch Changes

- ad267b4: Update deps
- Updated dependencies [ad267b4]
  - @evolu/common-react@1.0.6
  - @evolu/common-web@1.1.2
  - @evolu/common@1.0.9

## 2.0.2

### Patch Changes

- a938b3d: Update deps
- Updated dependencies [a938b3d]
  - @evolu/common-react@1.0.5
  - @evolu/common-web@1.1.1
  - @evolu/common@1.0.7

## 2.0.1

### Patch Changes

- 43ae617: Update peer dependencies
- Updated dependencies [43ae617]
  - @evolu/common-react@1.0.4
  - @evolu/common@1.0.6
  - @evolu/common-web@1.1.0

## 2.0.0

### Patch Changes

- Updated dependencies [6674c78]
  - @evolu/common-web@1.1.0

## 1.0.2

### Patch Changes

- 0a6f7e7: Update deps, remove Match depedency
- Updated dependencies [0a6f7e7]
  - @evolu/common-react@1.0.2
  - @evolu/common-web@1.0.1
  - @evolu/common@1.0.2

## 1.0.1

### Patch Changes

- 768427c: Fix files in @evolu/common-react package.json
- Updated dependencies [768427c]
  - @evolu/common-react@1.0.1

## 1.0.0

### Major Changes

- 17e43c8: Split evolu library to platform libraries

### Patch Changes

- Updated dependencies [17e43c8]
  - @evolu/common-react@1.0.0
  - @evolu/common-web@1.0.0
  - @evolu/common@1.0.0
