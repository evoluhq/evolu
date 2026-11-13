---
"@evolu/common": patch
---

Stopped a local-only update from recreating a deleted row

A delete in a local-only table removes the row, but `update` created any row that didn't exist. So when one tab deleted a row and a tab that hadn't seen the delete yet then updated it, the row came back with only that update's columns. An update of a local-only table now changes only an existing row, so an update after a delete leaves the row deleted, as the `isDeleted` tombstone of a synced table does. `insert` and `upsert` still create rows.

Code that relied on `update` creating a local-only row uses `upsert` instead.

```ts
import {
  AppName,
  assertEqual,
  createEvolu,
  createQueryBuilder,
  id,
  NonEmptyTrimmedString100,
  sqliteTrue,
  testAppOwner,
} from "@evolu/common";
import { createEvoluDeps, createRun } from "@evolu/web";

const Schema = {
  _draft: { id: id("Draft"), title: NonEmptyTrimmedString100 },
};
const run = createRun(createEvoluDeps());
const evolu = await run.ok(
  createEvolu(Schema, {
    appName: AppName.orThrow("LocalOnlyUpdate"),
    appOwner: testAppOwner,
    transports: [],
  }),
);
const drafts = createQueryBuilder(Schema)((db) =>
  db.selectFrom("_draft").select("title"),
);
const title = NonEmptyTrimmedString100.orThrow("Shopping list");

const { id: draftId } = evolu.insert("_draft", { title });
evolu.update("_draft", { id: draftId, isDeleted: sqliteTrue });
// An update from a tab that hasn't seen the delete yet.
evolu.update("_draft", { id: draftId, title });
assertEqual(await evolu.loadQuery(drafts), []);

// An upsert creates the row.
evolu.upsert("_draft", { id: draftId, title });
assertEqual(await evolu.loadQuery(drafts), [{ title }]);
```
