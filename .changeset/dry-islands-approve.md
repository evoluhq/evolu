---
"evolu": minor
---

Evolu JSON

SQLite supports JSONs by storing them as JSON strings. Evolu already parses JSON strings for [Kysely Relations](https://kysely.dev/docs/recipes/relations), so we leveraged that feature to support JSON in Evolu without manual parsing and stringifying. 🚀

Just define some JsonObject or JsonArray on Evolu Schema, and that's all.

```ts
const SomeJson = Schema.struct({
  foo: Schema.string,
  // We can use any JSON type in SQLite JSON.
  bar: Schema.boolean,
});
type SomeJson = Schema.Schema.To<typeof SomeJson>;

const TodoCategoryTable = Schema.struct({
  id: TodoCategoryId,
  name: NonEmptyString50,
  json: SomeJson,
});

create("todoCategory", {
  name,
  json: { foo: "a", bar: false },
});
```

Happy codding.
