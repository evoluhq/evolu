---
"@evolu/common": minor
---

Added an app-owner registry test schema

Added `testLocalOnlyEvoluSchema` for tests and examples that store app owners in
an `_appOwner` table. It includes operational keys, optional recovery secrets,
and optional names.

Use it with `createEvolu`. Tables prefixed with `_` stay local even when the
instance synchronizes other data through `useOwner`.

```ts
import {
  createEvolu,
  testAppName,
  testAppOwner,
  testLocalOnlyEvoluSchema,
} from "@evolu/common";

const _createAccounts = createEvolu(testLocalOnlyEvoluSchema, {
  appName: testAppName,
  appOwner: testAppOwner,
  transports: [],
});
```
