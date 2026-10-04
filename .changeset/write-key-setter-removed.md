---
"@evolu/common": patch
---

Removed `Storage.setWriteKey`

Nothing in Evolu called it. Sync stores an owner's write key on its first use
through `validateWriteKey`. A relay built on `createRelaySqliteStorage` that
replaced an owner's key with `setWriteKey` can delete the owner's row from
`evolu_writeKey` instead; the relay then stores the next write key it receives
for that owner. A custom `Storage` object literal that still lists
`setWriteKey` fails the excess-property check; remove the member.

```ts
import { assertType } from "@evolu/common";
import type { Storage } from "@evolu/common/local-first";

assertType<Extract<keyof Storage, "setWriteKey">, never>();
```
