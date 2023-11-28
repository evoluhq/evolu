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

The most significant change is the split of SQL query declaration and usage. The rest of the API is almost the same except for minor improvements.

### Example

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

I also refactored (read: simplified a lot) Effect Layer usage across all libraries.

There is no breaking change in data storage or protocol.
