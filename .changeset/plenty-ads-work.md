---
"@evolu/common": minor
---

Added loadOwnerUsage

An app that deletes owners' data, with `evolu.deleteOwner` or `deleteWhenUnused`, can now show which owners have data on the device and how big it is. `evolu.loadOwnerUsage(owner)` loads an `OwnerStorageUsage` whose `storedBytes` are the bytes of the owner's encrypted changes, as a relay counts them for its quota. It loads null when the database has no change of the owner. Local-only tables sync nothing, so their rows aren't counted.

An owner that an earlier release stored is counted from its history at its first load, which takes longer for a big owner, and later loads read the stored count. The database version stays the same, so an earlier release still opens the database.

```ts
import {
  assertType,
  type Evolu,
  type LoadOwnerUsageError,
  type OwnerStorageUsage,
  type Result,
  type ShardOwner,
} from "@evolu/common";

const loadWalletUsage = (evolu: Evolu, walletOwner: ShardOwner) =>
  evolu.loadOwnerUsage(walletOwner);

assertType<
  Awaited<ReturnType<typeof loadWalletUsage>>,
  Result<OwnerStorageUsage | null, LoadOwnerUsageError>
>();
```
