# server

## 1.0.19

### Patch Changes

- @evolu/server@3.0.4

## 1.0.18

### Patch Changes

- @evolu/server@3.0.3

## 1.0.17

### Patch Changes

- @evolu/server@3.0.2

## 1.0.16

### Patch Changes

- @evolu/server@3.0.1

## 1.0.15

### Patch Changes

- @evolu/server@3.0.0

## 1.0.14

### Patch Changes

- Updated dependencies [92448d6]
  - @evolu/server@2.1.8

## 1.0.13

### Patch Changes

- @evolu/server@2.1.7

## 1.0.12

### Patch Changes

- @evolu/server@2.1.6

## 1.0.11

### Patch Changes

- Updated dependencies [25d345d]
  - @evolu/server@2.1.5

## 1.0.10

### Patch Changes

- @evolu/server@2.1.4

## 1.0.9

### Patch Changes

- @evolu/server@2.1.3

## 1.0.8

### Patch Changes

- @evolu/server@2.1.2

## 1.0.7

### Patch Changes

- Updated dependencies [b00dec2]
  - @evolu/server@2.1.1

## 1.0.6

### Patch Changes

- Updated dependencies [e401e55]
  - @evolu/server@2.1.0

## 1.0.5

### Patch Changes

- @evolu/server@2.0.5

## 1.0.4

### Patch Changes

- @evolu/server@2.0.4

## 1.0.3

### Patch Changes

- @evolu/server@2.0.3

## 1.0.2

### Patch Changes

- @evolu/server@2.0.2

## 1.0.1

### Patch Changes

- @evolu/server@2.0.1

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
  - @evolu/server@2.0.0

## 0.0.105

### Patch Changes

- Updated dependencies [22f6085]
  - @evolu/server@1.0.17

## 0.0.104

### Patch Changes

- @evolu/server@1.0.16

## 0.0.103

### Patch Changes

- Updated dependencies [db84a4e]
  - @evolu/server@1.0.15

## 0.0.102

### Patch Changes

- @evolu/server@1.0.14

## 0.0.101

### Patch Changes

- @evolu/server@1.0.13

## 0.0.100

### Patch Changes

- @evolu/server@1.0.12

## 0.0.99

### Patch Changes

- @evolu/server@1.0.11

## 0.0.98

### Patch Changes

- Updated dependencies [44caee5]
- Updated dependencies [44caee5]
  - @evolu/server@1.0.10

## 0.0.97

### Patch Changes

- Updated dependencies [ad267b4]
  - @evolu/server@1.0.9

## 0.0.96

### Patch Changes

- Updated dependencies [3f89e12]
  - @evolu/server@1.0.8

## 0.0.95

### Patch Changes

- Updated dependencies [a938b3d]
  - @evolu/server@1.0.7

## 0.0.94

### Patch Changes

- Updated dependencies [43ae617]
  - @evolu/server@1.0.6

## 0.0.93

### Patch Changes

- Updated dependencies [0b53b45]
  - @evolu/server@1.0.5

## 0.0.92

### Patch Changes

- Updated dependencies [ac05ef2]
  - @evolu/server@1.0.4

## 0.0.91

### Patch Changes

- Updated dependencies [c406a60]
  - @evolu/server@1.0.3

## 0.0.90

### Patch Changes

- Updated dependencies [0a6f7e7]
  - @evolu/server@1.0.2

## 0.0.89

### Patch Changes

- Updated dependencies [21f41b0]
  - @evolu/server@1.0.1

## 0.0.88

### Patch Changes

- Updated dependencies [17e43c8]
  - @evolu/server@1.0.0

## 0.0.87

### Patch Changes

- evolu-server@1.0.26

## 0.0.86

### Patch Changes

- evolu-server@1.0.25

## 0.0.85

### Patch Changes

- evolu-server@1.0.24

## 0.0.84

### Patch Changes

- evolu-server@1.0.23

## 0.0.83

### Patch Changes

- evolu-server@1.0.22

## 0.0.82

### Patch Changes

- evolu-server@1.0.21

## 0.0.81

### Patch Changes

- evolu-server@1.0.20

## 0.0.80

### Patch Changes

- evolu-server@1.0.19

## 0.0.79

### Patch Changes

- evolu-server@1.0.18

## 0.0.78

### Patch Changes

- evolu-server@1.0.17

## 0.0.77

### Patch Changes

- evolu-server@1.0.16

## 0.0.76

### Patch Changes

- evolu-server@1.0.15

## 0.0.75

### Patch Changes

- evolu-server@1.0.14

## 0.0.74

### Patch Changes

- evolu-server@1.0.13

## 0.0.73

### Patch Changes

- evolu-server@1.0.12

## 0.0.72

### Patch Changes

- evolu-server@1.0.11

## 0.0.71

### Patch Changes

- evolu-server@1.0.10

## 0.0.70

### Patch Changes

- evolu-server@1.0.9

## 0.0.69

### Patch Changes

- evolu-server@1.0.8

## 0.0.68

### Patch Changes

- evolu-server@1.0.7

## 0.0.67

### Patch Changes

- evolu-server@1.0.6

## 0.0.66

### Patch Changes

- evolu-server@1.0.5

## 0.0.65

### Patch Changes

- evolu-server@1.0.4

## 0.0.64

### Patch Changes

- evolu-server@1.0.3

## 0.0.63

### Patch Changes

- evolu-server@1.0.2

## 0.0.62

### Patch Changes

- evolu-server@1.0.1

## 0.0.61

### Patch Changes

- Updated dependencies [590d5a8]
  - evolu-server@1.0.0

## 0.0.60

### Patch Changes

- evolu-server@0.1.3

## 0.0.59

### Patch Changes

- evolu-server@0.1.2

## 0.0.58

### Patch Changes

- evolu-server@0.1.1

## 0.0.57

### Patch Changes

- Updated dependencies [6f66552]
  - evolu@4.0.2

## 0.0.56

### Patch Changes

- Updated dependencies [616b005]
  - evolu@4.0.1

## 0.0.55

### Patch Changes

- Updated dependencies [130582b]
  - evolu@4.0.0

## 0.0.54

### Patch Changes

- Updated dependencies [2e88561]
  - evolu@3.1.1

## 0.0.53

### Patch Changes

- Updated dependencies [b043d91]
  - evolu@3.1.0

## 0.0.52

### Patch Changes

- Updated dependencies [f9cacfc]
  - evolu@3.0.1

## 0.0.51

### Patch Changes

- Updated dependencies [11f1a40]
- Updated dependencies [9be7e78]
  - evolu@3.0.0

## 0.0.50

### Patch Changes

- Updated dependencies [0fb793f]
  - evolu@2.2.0

## 0.0.49

### Patch Changes

- Updated dependencies [b8296f7]
  - evolu@2.1.3

## 0.0.48

### Patch Changes

- Updated dependencies [c949b26]
  - evolu@2.1.2

## 0.0.47

### Patch Changes

- Updated dependencies [e3deac8]
  - evolu@2.1.1

## 0.0.46

### Patch Changes

- Updated dependencies [be95d2c]
  - evolu@2.1.0

## 0.0.45

### Patch Changes

- Updated dependencies [2f0a596]
  - evolu@2.0.0

## 0.0.44

### Patch Changes

- Updated dependencies [ddac0d6]
  - evolu@1.0.2

## 0.0.43

### Patch Changes

- Updated dependencies [f2c88d3]
  - evolu@1.0.1

## 0.0.42

### Patch Changes

- Updated dependencies [0ed4d15]
  - evolu@1.0.0

## 0.0.41

### Patch Changes

- Updated dependencies [004f6f2]
  - evolu@0.12.3

## 0.0.40

### Patch Changes

- Updated dependencies [bafed45]
  - evolu@0.12.2

## 0.0.39

### Patch Changes

- Updated dependencies [63cd8e7]
  - evolu@0.12.1

## 0.0.38

### Patch Changes

- Updated dependencies [277d80e]
  - evolu@0.12.0

## 0.0.37

### Patch Changes

- Updated dependencies [d010dea]
  - evolu@0.11.0

## 0.0.36

### Patch Changes

- Updated dependencies [c803352]
  - evolu@0.10.4

## 0.0.35

### Patch Changes

- Updated dependencies [09dc778]
  - evolu@0.10.3

## 0.0.34

### Patch Changes

- Updated dependencies [8ddc92f]
  - evolu@0.10.2

## 0.0.33

### Patch Changes

- Updated dependencies [bb0d128]
  - evolu@0.10.1

## 0.0.32

### Patch Changes

- Updated dependencies [ec3755a]
  - evolu@0.10.0

## 0.0.31

### Patch Changes

- Updated dependencies [ce68694]
  - evolu@0.9.3

## 0.0.30

### Patch Changes

- Updated dependencies [108d20d]
  - evolu@0.9.2

## 0.0.29

### Patch Changes

- Updated dependencies [8ff7e3a]
  - evolu@0.9.1

## 0.0.28

### Patch Changes

- Updated dependencies [6417799]
  - evolu@0.9.0

## 0.0.27

### Patch Changes

- Updated dependencies [6ec12ff]
- Updated dependencies [36a3cab]
  - evolu@0.8.0

## 0.0.26

### Patch Changes

- Updated dependencies [2216d7f]
  - evolu@0.7.5

## 0.0.25

### Patch Changes

- Updated dependencies [95adfb6]
  - evolu@0.7.4

## 0.0.24

### Patch Changes

- Updated dependencies [389883a]
  - evolu@0.7.3

## 0.0.23

### Patch Changes

- Updated dependencies [2cb1af4]
  - evolu@0.7.2

## 0.0.22

### Patch Changes

- Updated dependencies [c171392]
  - evolu@0.7.1

## 0.0.21

### Patch Changes

- Updated dependencies [abad8f5]
  - evolu@0.7.0

## 0.0.20

### Patch Changes

- Updated dependencies [e193754]
  - evolu@0.6.0

## 0.0.19

### Patch Changes

- Updated dependencies [02a8c47]
  - evolu@0.5.1

## 0.0.18

### Patch Changes

- Updated dependencies [b957aea]
  - evolu@0.5.0

## 0.0.17

### Patch Changes

- Updated dependencies [8d29b99]
  - evolu@0.4.1

## 0.0.16

### Patch Changes

- Updated dependencies [74a94ee]
  - evolu@0.4.0

## 0.0.15

### Patch Changes

- Updated dependencies [15fa758]
  - evolu@0.3.1

## 0.0.14

### Patch Changes

- Updated dependencies [fcdbff9]
  - evolu@0.3.0

## 0.0.13

### Patch Changes

- Updated dependencies [127f1ae]
  - evolu@0.2.2

## 0.0.12

### Patch Changes

- Updated dependencies [fd03f74]
  - evolu@0.2.1

## 0.0.11

### Patch Changes

- Updated dependencies [96a0954]
  - evolu@0.2.0

## 0.0.10

### Patch Changes

- Updated dependencies [ec6d9f2]
  - evolu@0.1.7

## 0.0.9

### Patch Changes

- Updated dependencies [d903dd2]
  - evolu@0.1.6

## 0.0.8

### Patch Changes

- Updated dependencies [3a78e4c]
  - evolu@0.1.5

## 0.0.7

### Patch Changes

- Updated dependencies [309f99f]
  - evolu@0.1.4

## 0.0.6

### Patch Changes

- Updated dependencies [fee19a7]
  - evolu@0.1.3

## 0.0.5

### Patch Changes

- Updated dependencies [5244c0c]
  - evolu@0.1.2

## 0.0.4

### Patch Changes

- Updated dependencies [5d820a1]
  - evolu@0.1.1

## 0.0.3

### Patch Changes

- Updated dependencies [a0fab5e]
  - evolu@0.1.0
