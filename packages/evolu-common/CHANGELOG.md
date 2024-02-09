# @evolu/common

## 3.1.3

### Patch Changes

- 106462c: Update Effect and Schema

  Note API change: https://github.com/Effect-TS/effect/releases/tag/effect%402.3.0

## 3.1.2

### Patch Changes

- a59be92: Update Effect and Schema

## 3.1.1

### Patch Changes

- b337e70: Update Effect and Schema

## 3.1.0

### Minor Changes

- ef32952: Add createOrUpdate

  This function is useful when we already have an `id` and want to create a
  new row or update an existing one.

  ```ts
  import * as S from "@effect/schema/Schema";
  import { Id } from "@evolu/react";

  // Id can be stable.
  // 2024-02-0800000000000
  const id = S.decodeSync(Id)(date.toString().padEnd(21, "0")) as TodoId;

  evolu.createOrUpdate("todo", { id, title });
  ```

## 3.0.15

### Patch Changes

- 621f3a3: Update deps: Effect, Schema, sqlite-wasm, nanoid, better-sqlite3

## 3.0.14

### Patch Changes

- f1d76d3: Effect 2.2.2 and Schema 0.61.2

  Schema parse renamed to decodeUnknown.

## 3.0.13

### Patch Changes

- 369ff8b: Update peer deps

## 3.0.12

### Patch Changes

- b9e549a: Effect 2.1.2 and Schema 0.60.6

## 3.0.11

### Patch Changes

- ffb503b: Effect 2.1.0 and Schema 0.60.3

## 3.0.10

### Patch Changes

- 3cd5c71: Update deps

## 3.0.9

### Patch Changes

- ff6254b: Update Effect and Schema peer dependencies

  Effect 2 isn't still considered stable; breaking changes can happen in minor versions. Effect 3 will be stable. No worries, they are only tuning APIs.

## 3.0.8

### Patch Changes

- 047b92e: Update Kysely to 0.27.0

  Check [Kysely release](https://github.com/kysely-org/kysely/releases/tag/0.27.0)

  Note simplified `$narrowType` usage. Previous:

  ```ts
  .$narrowType<{ title: NonEmptyString1000 }>()
  ```

  Simplified:

  ```ts
  .$narrowType<{ title: NotNull }>()
  ```

## 3.0.7

### Patch Changes

- a2068f2: Use namespace imports

  Namespace imports make dev faster and build smaller for bundlers without three shaking.

  https://www.effect.website/docs/essentials/importing

## 3.0.6

### Patch Changes

- 1b4e331: Update Effect and Schema peer dependencies

  If you are curious why Effect and Schema peer dependencies must be updated on every release, the reason is that Effect isn't version 2 yet. Hence, it must be pinned to the same version.

## 3.0.5

### Patch Changes

- ac609e1: Update Schema peer dependency

## 3.0.4

### Patch Changes

- e6abac0: Update Effect and Schema deps

## 3.0.3

### Patch Changes

- ebbe716: Export QueryResult type

## 3.0.2

### Patch Changes

- 16d7d5b: Update deps

## 3.0.1

### Patch Changes

- a969843: Add ExtractRow type helper

  Extract `Row` from `Query` instance.

  ```ts
  const allTodos = evolu.createQuery((db) => db.selectFrom("todo").selectAll());
  type AllTodosRow = ExtractRow<typeof allTodos>;
  ```

## 3.0.0

### Major Changes

- d289ac7: Improve table and database schema DX.

  In the previous Evolu version, table and database schemas were created with `S.struct` and validated with createEvolu. Because of how the TypeScript compiler works, type errors were incomprehensible.

  We added two new helper functions to improve a DX: `table` and `database`.

  Previous schema definition:

  ```ts
  const TodoTable = S.struct({
    id: TodoId,
    title: NonEmptyString1000,
  });
  const Database = S.struct({
    todo: TodoTable,
  });
  ```

  New schema definition:

  ```ts
  const TodoTable = table({
    id: TodoId,
    title: NonEmptyString1000,
  });
  const Database = database({
    todo: TodoTable,
  });
  ```

  Those two helpers also detect missing ID columns and the usage of reserved columns.

  This update is a breaking change because reserved columns (createdAt, updatedAt, isDeleted) are created with `table` function now.

## 2.2.4

### Patch Changes

- eb819cb: Rename Schema to DatabaseSchema
- 92448d6: Update peer deps

## 2.2.3

### Patch Changes

- 215662c: Update deps

## 2.2.2

### Patch Changes

- 33974aa: Fix number protobuf serialization

## 2.2.1

### Patch Changes

- 98e19f0: Update deps

## 2.2.0

### Minor Changes

- bc18e74: Add the sync function

  Evolu syncs on every mutation, tab focus, and network reconnect, so it's generally not required to sync manually, but if you need it, you can do it.

  ```ts
  evolu.sync();
  ```

## 2.1.0

### Minor Changes

- 1eef638: Add makeCreateEvolu factory

## 2.0.6

### Patch Changes

- b00dec2: Update deps

## 2.0.5

### Patch Changes

- b06757c: Update readme

## 2.0.4

### Patch Changes

- 4563ec0: Bump peer dependants

## 2.0.3

### Patch Changes

- 59ec99c: Update @evolu/common peer dependencies

## 2.0.2

### Patch Changes

- ddd4014: Update readme

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

## 1.0.17

### Patch Changes

- 22f6085: Update deps

## 1.0.16

### Patch Changes

- 08839c9: Update deps

## 1.0.15

### Patch Changes

- db84a4e: Update deps
- 51ead17: Make useQuery filterMap optional and reusable

## 1.0.14

### Patch Changes

- 242d7e5: Experimental new feature: Local only tables

  A local-only table is a table prefixed with "\_" that will never be synced—a small but handy addition. Imagine editing huge JSON. Should we store it on any change or allow the user to "commit" data later? In an ideal world, we would have CRDT abstraction for any data, and we will have, but for now, we can postpone or even cancel sync with local-only tables. Another use-case is device-only data, for example, some settings that should not be shared with other devices. Local-only tables also allow real deletion. Use the isDeleted common column and the row will be deleted instead of marked as deleted.

## 1.0.13

### Patch Changes

- 9d319e5: Rename canUseDOM to canUseDom

## 1.0.12

### Patch Changes

- 094e25a: Expose and leverage canUseDOM

## 1.0.11

### Patch Changes

- 8f7c8c8: Dedupe messages created within the microtask queue

  That's only for a case where someone accidentally calls mutate with the same values repeatedly. There is no reason to create identical messages.

## 1.0.10

### Patch Changes

- 44caee5: Update deps
- 44caee5: Ensure valid device clock and Timestamp time.

  Millis represents a time that is valid for usage with the Merkle tree. It must be between Apr 13, 1997, and Nov 05, 2051, to ensure MinutesBase3 length equals 16. We can find diff for two Merkle trees only within this range. If the device clock is out of range, Evolu will not store data until it's fixed.

## 1.0.9

### Patch Changes

- ad267b4: Update deps

## 1.0.8

### Patch Changes

- 3f89e12: Update deps

## 1.0.7

### Patch Changes

- a938b3d: Update deps

## 1.0.6

### Patch Changes

- 43ae617: Update peer dependencies

## 1.0.5

### Patch Changes

- 0b53b45: Update deps

## 1.0.4

### Patch Changes

- ac05ef2: Update deps

## 1.0.3

### Patch Changes

- c406a60: Update deps

## 1.0.2

### Patch Changes

- 0a6f7e7: Update deps, remove Match depedency

## 1.0.1

### Patch Changes

- 21f41b0: Update deps

## 1.0.0

### Major Changes

- 17e43c8: Split evolu library to platform libraries
