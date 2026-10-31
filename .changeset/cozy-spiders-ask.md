---
"@evolu/common": minor
---

Added an optional namespace to createIdFromString

The same string creates the same Id everywhere, so rows of different owners, such as each shared owner's seed rows, can share an Id, and a query or join by `id` alone then matches a row in each owner. Passing a namespace Id, such as the OwnerId of the row's owner or the Id of a parent row, creates an Id per namespace. Ids created without one are unchanged.

```ts
import { assertNotSame, createIdFromString, testAppOwner } from "@evolu/common";

const groceries = createIdFromString("groceries", testAppOwner.id);

assertNotSame(groceries, createIdFromString("groceries"));
```
