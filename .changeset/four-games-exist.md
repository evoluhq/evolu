---
"@evolu/common": patch
---

Fixed createdAt and updatedAt of upserted rows and typed updatedAt as nullable

`createdAt` is now the time of a row's earliest change, and `updatedAt` the time of its latest change, or `null` while the row has only one change. Every insert, update, and upsert is a change.

- An upsert of an existing row sets its `updatedAt` and no longer moves its `createdAt` later. The latest upsert, also one from another device, used to replace `createdAt` and leave `updatedAt` unchanged, so seeding with repeated upserts reordered rows sorted by `createdAt`.
- A row that an update created gets that update's time as `createdAt` instead of `null`. When an earlier insert of the row arrives, `createdAt` moves to the insert's time.
- `SystemColumns` types `updatedAt` as `DateIso | null`, which it already was after an insert. For the time a row last changed, use `updatedAt ?? createdAt`.

```ts
import {
  assertType,
  createQueryBuilder,
  type DateIso,
  id,
  NonEmptyTrimmedString100,
} from "@evolu/common";

const Schema = { todo: { id: id("Todo"), title: NonEmptyTrimmedString100 } };
const createQuery = createQueryBuilder(Schema);
const todos = createQuery((db) =>
  db.selectFrom("todo").select(["createdAt", "updatedAt"]),
);
type TodoRow = typeof todos.Row;

// @ts-expect-error A row has no updatedAt until its second change.
const updatedAt = (row: TodoRow): DateIso => row.updatedAt;
const lastChangedAt = (row: TodoRow) => row.updatedAt ?? row.createdAt;

assertType<
  [ReturnType<typeof updatedAt>, ReturnType<typeof lastChangedAt>],
  [DateIso, DateIso]
>();
```

In synchronized tables, Evolu recomputes both columns from the row's history whenever a change is applied, so every device computes the same values whatever order it receives the changes in. Rows stored by earlier releases keep their values until their next change. A row that was inserted and then only updated already has the correct values; a row that was upserted again or created by an update gets them with its next change.

Local-only tables use the time of each mutation. A change made at the time the row was created, such as one in the same batch as its insert, does not set `updatedAt`. Local-only tables keep no history, so their rows stored by earlier releases keep a `createdAt` that an upsert moved, and a row that an update created gets the time of its latest update as `createdAt` with its next change.
