---
"@evolu/common": patch
---

Fixed two ways one message could crash a relay

An owner's first write whose changes were all empty made the relay compute a
stored size of zero bytes and treat it as a defect, and a batch of more than
about 125,000 messages overflowed the call stack. Either way, the relay's shared
Run panicked, so every later connection failed. The relay now handles both.
`StorageConfig.isOwnerWithinQuota` receives the stored size as a
`NonNegativeInt`, because it can be zero; a callback that annotates it as
`PositiveInt` must use `NonNegativeInt` instead.

```ts
import { assertFalse, NonNegativeInt, testAppOwner } from "@evolu/common";
import type { StorageConfig } from "@evolu/common/local-first";

const config: StorageConfig = {
  isOwnerWithinQuota: (_ownerId, requiredBytes: NonNegativeInt) =>
    requiredBytes <= 1_000_000,
};

assertFalse(
  await config.isOwnerWithinQuota(
    testAppOwner.id,
    NonNegativeInt.orThrow(2_000_000),
  ),
);
```
