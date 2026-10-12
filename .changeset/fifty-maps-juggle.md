---
"@evolu/common": patch
---

Rejected Uint8Array values in Evolu's JSON query helpers at compile time

`evoluJsonArrayFrom`, `evoluJsonObjectFrom`, and `evoluJsonBuildObject` build their results with SQLite's `json_object`, which cannot hold a blob. A query that selected a `Uint8Array` column through one of them compiled and loaded while the column was null, then failed in SQLite with "JSON cannot hold BLOB values" once a row held bytes, for example bytes synced from another device, or, when the bytes happened to be valid JSONB, silently returned a JSON value instead of them. Such a selection is now a compile-time error. The check needs a concrete row type, so a function generic over the selection no longer compiles when it passes the selection to these helpers. Select `Uint8Array` columns outside these helpers:

```ts
import {
  assertType,
  createQueryBuilder,
  evoluJsonArrayFrom,
  id,
  Uint8Array as Uint8ArrayType,
} from "@evolu/common";

const PersonId = id("Person");
const Schema = {
  person: { id: PersonId },
  photo: { id: id("Photo"), personId: PersonId, data: Uint8ArrayType },
};
const createQuery = createQueryBuilder(Schema);

createQuery((db) =>
  db
    .selectFrom("person")
    .select("person.id")
    .select((eb) => [
      // @ts-expect-error ⛔ evoluJsonArrayFrom error: SQLite JSON cannot hold a Uint8Array. Select it outside this helper.
      evoluJsonArrayFrom(
        eb
          .selectFrom("photo")
          .select(["photo.id", "photo.data"])
          .whereRef("photo.personId", "=", "person.id"),
      ).as("photos"),
    ]),
);

const photos = createQuery((db) =>
  db.selectFrom("photo").select(["id", "personId", "data"]),
);

assertType<typeof photos.Row.data, Uint8Array | null>();
```
