---
"eslint-config-evolu": major
"@evolu/common-react": major
"@evolu/react-native": major
"@evolu/common-web": major
"@evolu/common": major
"@evolu/server": major
"native": major
"server": major
"web": major
"@evolu/react": minor
---

New API

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
