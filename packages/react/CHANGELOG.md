# @evolu/react

## 9.0.1-preview.4

### Patch Changes

- 2f30dcd: Update deps
- Updated dependencies [2f30dcd]
- Updated dependencies [4a82c06]
  - @evolu/common@6.0.1-preview.18

## 9.0.1-preview.3

### Patch Changes

- fdbecb8: Fix comment
- Updated dependencies [6452d57]
  - @evolu/common@6.0.1-preview.15

## 9.0.1-preview.2

### Patch Changes

- 2a37317: Update dependencies
- Updated dependencies [2a37317]
- Updated dependencies [39cbd9b]
  - @evolu/common@6.0.1-preview.3

## 9.0.1-preview.1

### Patch Changes

- 8ff21e5: GitHub release
- Updated dependencies [8ff21e5]
  - @evolu/common@6.0.1-preview.2

## 9.0.1-preview.0

### Patch Changes

- 632768f: Preview release
- Updated dependencies [632768f]
  - @evolu/common@6.0.1-preview.0

## 9.0.0

### Major Changes

- Updated to use new Evolu architecture

## 8.2.0

### Minor Changes

- 4e431e4: Update peer dependencies @effect/platform, @effect/schema

### Patch Changes

- Updated dependencies [19f7d85]
- Updated dependencies [4e431e4]
  - @evolu/common@5.4.0
  - @evolu/common-react@8.1.0
  - @evolu/common-web@8.2.0

## 8.1.0

### Minor Changes

- e420fec: New API for working with Evolu instances

  The functions `resetOwner` and `restoreOwner` automatically reload the app to ensure no user data remains in memory. The new option `reload` allows us to opt out of this default behavior. For that reason, both functions return a promise that can be used to provide custom UX. There is also a new `reloadApp` function to reload the app in a platform-specific way (e.g., browsers will reload all tabs with Evolu instances).

  The `createEvolu` function has a new option, `mnemonic`. This option is useful for Evolu multitenancy when creating an Evolu instance with a predefined mnemonic. To create a mnemonic, use the new `createMnemonic` function.

### Patch Changes

- Updated dependencies [e420fec]
  - @evolu/common@5.2.0
  - @evolu/common-web@8.1.0
  - @evolu/common-react@8.0.5

## 8.0.2

### Patch Changes

- 5b6419a: Schema 0.67
- Updated dependencies [5b6419a]
  - @evolu/common-react@8.0.4
  - @evolu/common-web@8.0.2
  - @evolu/common@5.1.1

## 8.0.1

### Patch Changes

- e8f293f: Add exportDatabase
- Updated dependencies [e8f293f]
  - @evolu/common-react@8.0.3
  - @evolu/common-web@8.0.1
  - @evolu/common@5.0.3

## 8.0.0

### Major Changes

- d156e67: Multitenancy, stable Effect, refactoring, logging

  Greetings. I spent the last few weeks refactoring Evolu. There are no breaking changes except for one function name. It's a major change because with such a significant refactoring, I can't be 100 % sure I didn't break anything. The core logic remains unchanged, but Evolu uses the Effect library better. When Evolu started with Effect, the website didn't exist yet.

  The initial reason for refactoring Evolu was that I wasn't satisfied with the Web Workers wrapper. I tried Comlink. It's a great library, but it has flaws, as documented in a new ProxyWorker, a lightweight Comlink tailored for Effect. While Effect provides an excellent wrapper for workers, I wanted to try a Comlink-like API. Such a change was a chance to review how Evolu uses Effect, and I realized I used too many Layers for no reason.

  During refactoring, I realized it would be nice if Evolu could run more instances concurrently. So, Evolu now supports multitenancy 🙂.

  I wasn't satisfied with the initial data definition, so I added an API for that, too. And logging. If you are curious about what's happening within Evolu, try the new `minimumLogLevel` Config option. There are also a few minor improvements inside the core logic. Again, there are no breaking changes; it is just better and more readable source code.

  The great news is that Effect is stable now, so there will be no more releases with deps updates. Let's dance 🪩

  New features:
  - Multitenancy (we can run more Evolu instances side by side)
  - Initial data (to define fixtures)
  - Logging (you can see what's happening inside Evolu step by step)
  - Faster and safer DB access (we use shared transactions for reads and special "last" transaction mode for resetting)
  - Stable Effect 🎉

### Patch Changes

- Updated dependencies [69bcf80]
- Updated dependencies [d156e67]
- Updated dependencies [30d2a40]
  - @evolu/common@5.0.0
  - @evolu/common-react@8.0.0
  - @evolu/common-web@8.0.0

## 7.0.0

### Patch Changes

- Updated dependencies [8af071c]
  - @evolu/common@4.1.0
  - @evolu/common-react@7.0.0
  - @evolu/common-web@7.0.0

## 6.0.2

### Patch Changes

- 6e61bb9: Update Effect and Schema

  Rename `Schema.To` to `Schema.Type`.

  All Effect Schema changes are [here](https://github.com/Effect-TS/effect/blob/main/packages/schema/WHATSNEW-0.64.md).

- Updated dependencies [6e61bb9]
- Updated dependencies [040513c]
  - @evolu/common-react@6.0.3
  - @evolu/common-web@6.0.4
  - @evolu/common@4.0.5

## 6.0.1

### Patch Changes

- 919c38f: Remove types from peer dependencies
- Updated dependencies [919c38f]
  - @evolu/common-react@6.0.1

## 6.0.0

### Patch Changes

- 01d2554: Update peer dependencies
- Updated dependencies [2fe4e16]
- Updated dependencies [8175b6f]
- Updated dependencies [637b771]
- Updated dependencies [01d2554]
  - @evolu/common@4.0.0
  - @evolu/common-react@6.0.0
  - @evolu/common-web@6.0.0

## 5.0.7

### Patch Changes

- 01d2554: Update peer deps
- Updated dependencies [01d2554]
  - @evolu/common@3.1.8
  - @evolu/common-react@5.0.7
  - @evolu/common-web@5.0.7

## 5.0.6

### Patch Changes

- a322695: Update peer dependencies
- Updated dependencies [a322695]
  - @evolu/common-react@5.0.6

## 5.0.5

### Patch Changes

- ccd699a: Fix #333
- Updated dependencies [ccd699a]
  - @evolu/common-web@5.0.6
  - @evolu/common@3.1.6
  - @evolu/common-react@5.0.4

## 5.0.4

### Patch Changes

- f6e198a: Effect 2.40.0, Schema 0.63.0
- Updated dependencies [f6e198a]
  - @evolu/common-react@5.0.4
  - @evolu/common-web@5.0.5
  - @evolu/common@3.1.5

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
