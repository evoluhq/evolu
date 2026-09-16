---
"@evolu/common": patch
---

Fixed owner filtering and selection in history query types

Queries over `evolu_history` now expose the existing `ownerId` column as
`OwnerIdBytes`, allowing typed selection and filtering by owner. No database
migration is required.

```ts
import {
  assertType,
  createQueryBuilder,
  type OwnerIdBytes,
  ownerIdToOwnerIdBytes,
  testAppOwner,
  testEvoluSchema,
  type TimestampBytes,
} from "@evolu/common";

const createQuery = createQueryBuilder(testEvoluSchema);
const historyQuery = createQuery((db) =>
  db
    .selectFrom("evolu_history")
    .select(["ownerId", "timestamp"])
    .where("ownerId", "=", ownerIdToOwnerIdBytes(testAppOwner.id)),
);

assertType<
  typeof historyQuery.Row,
  { ownerId: OwnerIdBytes; timestamp: TimestampBytes }
>();
```
