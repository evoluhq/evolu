---
"@evolu/common": major
---

Replaced `evolu.createQuery` with standalone `createQueryBuilder` function

Queries are now created using a standalone `createQueryBuilder` function instead of `evolu.createQuery` method. This enables query creation without an Evolu instance, improving code organization and enabling schema-first development.

```ts
// Before
const todosQuery = evolu.createQuery((db) => db.selectFrom("todo").selectAll());

// After
const createQuery = createQueryBuilder(Schema);
const todosQuery = createQuery((db) => db.selectFrom("todo").selectAll());
```
