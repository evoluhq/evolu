# @evolu/common-react

## 8.1.1

### Patch Changes

- d1c619d: Update dependencies
- Updated dependencies [d1c619d]
  - @evolu/common@5.4.5

## 8.1.0

### Minor Changes

- 4e431e4: Update peer dependencies @effect/platform, @effect/schema

### Patch Changes

- Updated dependencies [19f7d85]
  - @evolu/common@5.4.0

## 8.0.5

### Patch Changes

- 657262c: Update deps
- Updated dependencies [657262c]
  - @evolu/common@5.1.2

## 8.0.4

### Patch Changes

- 5b6419a: Schema 0.67
- Updated dependencies [5b6419a]
  - @evolu/common@5.1.1

## 8.0.3

### Patch Changes

- e8f293f: Add exportDatabase
- Updated dependencies [e8f293f]
  - @evolu/common@5.0.3

## 8.0.2

### Patch Changes

- cea02b6: Fix also useQueries, update comments

## 8.0.1

### Patch Changes

- 035cf55: Fix a bug

  It's explained in the source code.

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

## 7.0.0

### Patch Changes

- Updated dependencies [8af071c]
  - @evolu/common@4.1.0

## 6.0.3

### Patch Changes

- 6e61bb9: Update Effect and Schema

  Rename `Schema.To` to `Schema.Type`.

  All Effect Schema changes are [here](https://github.com/Effect-TS/effect/blob/main/packages/schema/WHATSNEW-0.64.md).

- Updated dependencies [6e61bb9]
  - @evolu/common@4.0.5

## 6.0.2

### Patch Changes

- 1f9168f: Fix SSR

  Evolu server-side rendering was surprisingly problematic because of the React Suspense error: "This Suspense boundary received an update before it finished hydrating."

  If you are curious why a local-first library needs to render something on the server where there is no data, the answer is that if we can render empty rows, we should.

  But because of the React Suspense error, Evolu apps had to be wrapped by the ClientOnly component, which wasn't ideal. Check article:

  https://tkdodo.eu/blog/avoiding-hydration-mismatches-with-use-sync-external-store

  Internally, PlatformName has been replaced with useWasSSR React Hook.

- Updated dependencies [1f9168f]
  - @evolu/common@4.0.2

## 6.0.1

### Patch Changes

- 919c38f: Remove types from peer dependencies

## 6.0.0

### Patch Changes

- 8175b6f: Update peer dependencies
- 01d2554: Update peer dependencies
- Updated dependencies [2fe4e16]
- Updated dependencies [01d2554]
  - @evolu/common@4.0.0

## 5.0.7

### Patch Changes

- 01d2554: Update peer deps
- Updated dependencies [01d2554]
  - @evolu/common@3.1.8

## 5.0.6

### Patch Changes

- a322695: Update peer dependencies

## 5.0.5

### Patch Changes

- 888b83e: Fix a bug for React Native
- Updated dependencies [888b83e]
  - @evolu/common@3.1.7

## 5.0.4

### Patch Changes

- f6e198a: Effect 2.40.0, Schema 0.63.0
- Updated dependencies [f6e198a]
  - @evolu/common@3.1.5

## 5.0.3

### Patch Changes

- 1cf6502: Update Effect and Schema
- Updated dependencies [1cf6502]
  - @evolu/common@3.1.4

## 5.0.2

### Patch Changes

- 106462c: Update Effect and Schema

  Note API change: https://github.com/Effect-TS/effect/releases/tag/effect%402.3.0

- Updated dependencies [106462c]
  - @evolu/common@3.1.3

## 5.0.1

### Patch Changes

- b337e70: Update Effect and Schema
- Updated dependencies [b337e70]
  - @evolu/common@3.1.1

## 5.0.0

### Patch Changes

- Updated dependencies [ef32952]
  - @evolu/common@3.1.0

## 4.0.5

### Patch Changes

- 621f3a3: Update deps: Effect, Schema, sqlite-wasm, nanoid, better-sqlite3
- Updated dependencies [621f3a3]
  - @evolu/common@3.0.15

## 4.0.4

### Patch Changes

- b9e549a: Effect 2.1.2 and Schema 0.60.6
- Updated dependencies [b9e549a]
  - @evolu/common@3.0.12

## 4.0.3

### Patch Changes

- ffb503b: Effect 2.1.0 and Schema 0.60.3
- Updated dependencies [ffb503b]
  - @evolu/common@3.0.11

## 4.0.2

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

- Updated dependencies [047b92e]
  - @evolu/common@3.0.8

## 4.0.1

### Patch Changes

- a2068f2: Use namespace imports

  Namespace imports make dev faster and build smaller for bundlers without three shaking.

  https://www.effect.website/docs/essentials/importing

- Updated dependencies [a2068f2]
  - @evolu/common@3.0.7

## 4.0.0

### Patch Changes

- Updated dependencies [d289ac7]
  - @evolu/common@3.0.0

## 3.0.2

### Patch Changes

- eb819cb: Rename Schema to DatabaseSchema
- d506312: Add "use client" directive to EvoluProvider
- Updated dependencies [eb819cb]
- Updated dependencies [92448d6]
  - @evolu/common@2.2.4

## 3.0.1

### Patch Changes

- 7adfb47: Update peer deps

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
