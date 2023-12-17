# @evolu/server

## 3.0.3

### Patch Changes

- Updated dependencies [ebbe716]
  - @evolu/common@3.0.3

## 3.0.2

### Patch Changes

- Updated dependencies [16d7d5b]
  - @evolu/common@3.0.2

## 3.0.1

### Patch Changes

- Updated dependencies [a969843]
  - @evolu/common@3.0.1

## 3.0.0

### Patch Changes

- Updated dependencies [d289ac7]
  - @evolu/common@3.0.0

## 2.1.8

### Patch Changes

- 92448d6: Update peer deps
- Updated dependencies [eb819cb]
- Updated dependencies [92448d6]
  - @evolu/common@2.2.4

## 2.1.7

### Patch Changes

- Updated dependencies [215662c]
  - @evolu/common@2.2.3

## 2.1.6

### Patch Changes

- Updated dependencies [33974aa]
  - @evolu/common@2.2.2

## 2.1.5

### Patch Changes

- 25d345d: Add peer dependency

## 2.1.4

### Patch Changes

- Updated dependencies [98e19f0]
  - @evolu/common@2.2.1

## 2.1.3

### Patch Changes

- Updated dependencies [bc18e74]
  - @evolu/common@2.2.0

## 2.1.2

### Patch Changes

- Updated dependencies [1eef638]
  - @evolu/common@2.1.0

## 2.1.1

### Patch Changes

- b00dec2: Update deps
- Updated dependencies [b00dec2]
  - @evolu/common@2.0.6

## 2.1.0

### Minor Changes

- e401e55: Add EvoluServer, refactor out Express

  Now, it's possible to make Hono and other adapters easily.

## 2.0.5

### Patch Changes

- Updated dependencies [b06757c]
  - @evolu/common@2.0.5

## 2.0.4

### Patch Changes

- Updated dependencies [4563ec0]
  - @evolu/common@2.0.4

## 2.0.3

### Patch Changes

- Updated dependencies [59ec99c]
  - @evolu/common@2.0.3

## 2.0.2

### Patch Changes

- Updated dependencies [ddd4014]
  - @evolu/common@2.0.2

## 2.0.1

### Patch Changes

- Updated dependencies [fea7623]
  - @evolu/common@2.0.1

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

## 1.0.17

### Patch Changes

- 22f6085: Update deps
- Updated dependencies [22f6085]
  - @evolu/common@1.0.17

## 1.0.16

### Patch Changes

- Updated dependencies [08839c9]
  - @evolu/common@1.0.16

## 1.0.15

### Patch Changes

- db84a4e: Update deps
- Updated dependencies [db84a4e]
- Updated dependencies [51ead17]
  - @evolu/common@1.0.15

## 1.0.14

### Patch Changes

- Updated dependencies [242d7e5]
  - @evolu/common@1.0.14

## 1.0.13

### Patch Changes

- Updated dependencies [9d319e5]
  - @evolu/common@1.0.13

## 1.0.12

### Patch Changes

- Updated dependencies [094e25a]
  - @evolu/common@1.0.12

## 1.0.11

### Patch Changes

- Updated dependencies [8f7c8c8]
  - @evolu/common@1.0.11

## 1.0.10

### Patch Changes

- 44caee5: Update deps
- 44caee5: Ensure valid device clock and Timestamp time.

  Millis represents a time that is valid for usage with the Merkle tree. It must be between Apr 13, 1997, and Nov 05, 2051, to ensure MinutesBase3 length equals 16. We can find diff for two Merkle trees only within this range. If the device clock is out of range, Evolu will not store data until it's fixed.

- Updated dependencies [44caee5]
- Updated dependencies [44caee5]
  - @evolu/common@1.0.10

## 1.0.9

### Patch Changes

- ad267b4: Update deps
- Updated dependencies [ad267b4]
  - @evolu/common@1.0.9

## 1.0.8

### Patch Changes

- 3f89e12: Update deps
- Updated dependencies [3f89e12]
  - @evolu/common@1.0.8

## 1.0.7

### Patch Changes

- a938b3d: Update deps
- Updated dependencies [a938b3d]
  - @evolu/common@1.0.7

## 1.0.6

### Patch Changes

- 43ae617: Update peer dependencies
- Updated dependencies [43ae617]
  - @evolu/common@1.0.6

## 1.0.5

### Patch Changes

- 0b53b45: Update deps
- Updated dependencies [0b53b45]
  - @evolu/common@1.0.5

## 1.0.4

### Patch Changes

- ac05ef2: Update deps
- Updated dependencies [ac05ef2]
  - @evolu/common@1.0.4

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

- 21f41b0: Update deps
- Updated dependencies [21f41b0]
  - @evolu/common@1.0.1

## 1.0.0

### Major Changes

- 17e43c8: Split evolu library to platform libraries

### Patch Changes

- Updated dependencies [17e43c8]
  - @evolu/common@1.0.0
