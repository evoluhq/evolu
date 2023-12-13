---
"@evolu/common": major
---

Improve table and database schema DX.

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
