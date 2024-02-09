# native

## 1.0.15

### Patch Changes

- Updated dependencies [106462c]
  - @evolu/react-native@5.0.2

## 1.0.14

### Patch Changes

- Updated dependencies [b337e70]
  - @evolu/react-native@5.0.1

## 1.0.13

### Patch Changes

- @evolu/react-native@5.0.0

## 1.0.12

### Patch Changes

- Updated dependencies [621f3a3]
  - @evolu/react-native@4.0.5

## 1.0.11

### Patch Changes

- Updated dependencies [b9e549a]
  - @evolu/react-native@4.0.4

## 1.0.10

### Patch Changes

- Updated dependencies [ffb503b]
  - @evolu/react-native@4.0.3

## 1.0.9

### Patch Changes

- Updated dependencies [047b92e]
  - @evolu/react-native@4.0.2

## 1.0.8

### Patch Changes

- Updated dependencies [a2068f2]
  - @evolu/react-native@4.0.1

## 1.0.7

### Patch Changes

- @evolu/react-native@4.0.0

## 1.0.6

### Patch Changes

- Updated dependencies [eb819cb]
  - @evolu/react-native@3.0.4

## 1.0.5

### Patch Changes

- Updated dependencies [25d345d]
  - @evolu/react-native@3.0.3

## 1.0.4

### Patch Changes

- Updated dependencies [7adfb47]
  - @evolu/react-native@3.0.2

## 1.0.3

### Patch Changes

- Updated dependencies [07fd60d]
  - @evolu/react-native@3.0.1

## 1.0.2

### Patch Changes

- @evolu/react-native@3.0.0

## 1.0.1

### Patch Changes

- Updated dependencies [b06757c]
  - @evolu/react-native@2.0.1

## 1.0.0

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
  - @evolu/react-native@2.0.0

## 0.0.97

### Patch Changes

- Updated dependencies [9d319e5]
  - @evolu/react-native@1.0.8

## 0.0.96

### Patch Changes

- Updated dependencies [094e25a]
  - @evolu/react-native@1.0.7

## 0.0.95

### Patch Changes

- Updated dependencies [44caee5]
- Updated dependencies [44caee5]
  - @evolu/react-native@1.0.6

## 0.0.94

### Patch Changes

- Updated dependencies [ad267b4]
  - @evolu/react-native@1.0.5

## 0.0.93

### Patch Changes

- Updated dependencies [a938b3d]
  - @evolu/react-native@1.0.4

## 0.0.92

### Patch Changes

- Updated dependencies [43ae617]
  - @evolu/react-native@1.0.3

## 0.0.91

### Patch Changes

- Updated dependencies [0a6f7e7]
  - @evolu/react-native@1.0.2

## 0.0.90

### Patch Changes

- Updated dependencies [21f41b0]
  - @evolu/react-native@1.0.1

## 0.0.89

### Patch Changes

- @evolu/react-native@1.0.0
- web@0.0.89

## 0.0.88

### Patch Changes

- Updated dependencies [17e43c8]
  - @evolu/react-native@1.0.0
  - web@0.0.88

## 0.0.87

### Patch Changes

- Updated dependencies [7949c8d]
- Updated dependencies [c12cffe]
- Updated dependencies [8f6864b]
  - evolu@8.2.0
  - web@0.0.87

## 0.0.86

### Patch Changes

- Updated dependencies [779d543]
  - evolu@8.1.2
  - web@0.0.86

## 0.0.85

### Patch Changes

- Updated dependencies [6cfe697]
  - evolu@8.1.1
  - web@0.0.85

## 0.0.84

### Patch Changes

- Updated dependencies [513984c]
  - evolu@8.1.0
  - web@0.0.84

## 0.0.83

### Patch Changes

- Updated dependencies [7daaf0f]
  - evolu@8.0.3
  - web@0.0.83

## 0.0.82

### Patch Changes

- Updated dependencies [7fb9e97]
  - evolu@8.0.2
  - web@0.0.82

## 0.0.81

### Patch Changes

- Updated dependencies [143b94d]
  - evolu@8.0.1
  - web@0.0.81

## 0.0.80

### Patch Changes

- Updated dependencies [75e6772]
  - evolu@8.0.0
  - web@0.0.80

## 0.0.79

### Patch Changes

- Updated dependencies [a47544b]
  - evolu@7.1.0
  - web@0.0.79

## 0.0.78

### Patch Changes

- Updated dependencies [cc1eb76]
  - evolu@7.0.0
  - web@0.0.78

## 0.0.77

### Patch Changes

- Updated dependencies [a3d5524]
  - evolu@6.3.1
  - web@0.0.77

## 0.0.76

### Patch Changes

- Updated dependencies [ac2e396]
  - evolu@6.3.0
  - web@0.0.76

## 0.0.75

### Patch Changes

- Updated dependencies [27ade87]
  - evolu@6.2.4
  - web@0.0.75

## 0.0.74

### Patch Changes

- Updated dependencies [5f9f10b]
  - evolu@6.2.3
  - web@0.0.74

## 0.0.73

### Patch Changes

- Updated dependencies [a5c90b6]
  - evolu@6.2.2
  - web@0.0.73

## 0.0.72

### Patch Changes

- Updated dependencies [b285da4]
  - evolu@6.2.1
  - web@0.0.72

## 0.0.71

### Patch Changes

- Updated dependencies [bcf25b6]
  - evolu@6.2.0
